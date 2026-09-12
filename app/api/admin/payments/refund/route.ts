import { randomUUID } from "node:crypto";
import { logAudit } from "@/src/audit/log";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { currentPaymentEnvironment } from "@/src/payments/environment";
import { refundOrder } from "@/src/payments/mercadopago";
import { isAdminRequest } from "@/src/security/admin-auth";
import { applyWalletTransaction } from "@/src/wallet/service";

type RefundRow = {
  id: string;
  payment_id: string;
  user_id: string;
  environment: "test" | "production";
  idempotency_key: string;
  amount_cents: number;
  status: "creating" | "wallet_reserved" | "completed";
  external_refund_id?: string | null;
};

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { paymentId?: string; reason?: string; idempotencyKey?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const paymentId = String(body.paymentId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const idempotencyKey = String(body.idempotencyKey ?? randomUUID()).trim();
  if (!paymentId || !reason || !idempotencyKey) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const environment = currentPaymentEnvironment();
  if (environment !== "production") {
    return Response.json({ error: "refunds_require_production_mode" }, { status: 409 });
  }

  const supabase = getSupabaseAdmin();
  const paymentResult = await supabase
    .from("payments")
    .select("id,user_id,environment,external_payment_id,amount_cents,status,paid_at")
    .eq("id", paymentId)
    .eq("environment", "production")
    .maybeSingle();

  if (paymentResult.error) return Response.json({ error: "payment_lookup_failed" }, { status: 502 });
  if (!paymentResult.data) return Response.json({ error: "payment_not_found" }, { status: 404 });

  const payment = paymentResult.data;
  if (payment.status === "refunded") {
    const existing = await supabase.from("payment_refunds").select("*").eq("payment_id", payment.id).maybeSingle();
    return Response.json({ ok: true, alreadyRefunded: true, refund: existing.data ?? null });
  }
  if (payment.status !== "approved" || !payment.paid_at) {
    return Response.json({ error: "payment_not_refundable", status: payment.status }, { status: 409 });
  }
  if (String(payment.external_payment_id).startsWith("pending:")) {
    return Response.json({ error: "external_order_missing" }, { status: 409 });
  }

  let refund: RefundRow | null = null;
  const existingResult = await supabase
    .from("payment_refunds")
    .select("id,payment_id,user_id,environment,idempotency_key,amount_cents,status,external_refund_id")
    .eq("payment_id", payment.id)
    .maybeSingle();
  if (existingResult.error) return Response.json({ error: "refund_lookup_failed" }, { status: 502 });
  refund = existingResult.data as RefundRow | null;

  if (!refund) {
    const refundId = randomUUID();
    const createResult = await supabase
      .from("payment_refunds")
      .insert({
        id: refundId,
        payment_id: payment.id,
        user_id: payment.user_id,
        environment: "production",
        idempotency_key: idempotencyKey,
        amount_cents: Number(payment.amount_cents),
        status: "creating",
        reason,
      })
      .select("id,payment_id,user_id,environment,idempotency_key,amount_cents,status,external_refund_id")
      .single();
    if (createResult.error) return Response.json({ error: "refund_create_failed" }, { status: 502 });
    refund = createResult.data as RefundRow;
  }

  if (refund.status === "completed") {
    return Response.json({ ok: true, alreadyRefunded: true, refund });
  }

  try {
    await applyWalletTransaction({
      userId: payment.user_id,
      type: "refund",
      amountCents: -Number(payment.amount_cents),
      referenceId: `payment-refund:${refund.id}:reserve`,
      metadata: {
        paymentId: payment.id,
        externalOrderId: payment.external_payment_id,
        reason,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("payment_refunds").update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", refund.id);
    await logAudit({
      actorType: "admin",
      actorId: "admin-api",
      action: "payment.refund.blocked",
      entityType: "payment",
      entityId: payment.id,
      metadata: { refundId: refund.id, reason, error: message.slice(0, 200) },
    });
    return Response.json({ error: message.includes("INSUFFICIENT_BALANCE") ? "wallet_balance_already_spent" : "wallet_reservation_failed" }, { status: 409 });
  }

  await supabase.from("payment_refunds").update({ status: "wallet_reserved", last_error: null, updated_at: new Date().toISOString() }).eq("id", refund.id);

  try {
    const providerRefund = await refundOrder(String(payment.external_payment_id), refund.idempotency_key);
    const externalRefundId = providerRefund.id != null ? String(providerRefund.id) : String(payment.external_payment_id);
    const now = new Date().toISOString();

    const [refundUpdate, paymentUpdate] = await Promise.all([
      supabase.from("payment_refunds").update({
        status: "completed",
        external_refund_id: externalRefundId,
        last_error: null,
        completed_at: now,
        updated_at: now,
      }).eq("id", refund.id),
      supabase.from("payments").update({ status: "refunded", updated_at: now }).eq("id", payment.id),
    ]);
    if (refundUpdate.error) throw refundUpdate.error;
    if (paymentUpdate.error) throw paymentUpdate.error;

    await logAudit({
      actorType: "admin",
      actorId: "admin-api",
      action: "payment.refund.completed",
      entityType: "payment",
      entityId: payment.id,
      metadata: { refundId: refund.id, amountCents: Number(payment.amount_cents), reason },
    });

    return Response.json({
      ok: true,
      paymentId: payment.id,
      refundId: refund.id,
      amountCents: Number(payment.amount_cents),
      providerStatus: providerRefund.status ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("payment_refunds").update({ status: "wallet_reserved", last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", refund.id);
    await logAudit({
      actorType: "admin",
      actorId: "admin-api",
      action: "payment.refund.provider_failed",
      entityType: "payment",
      entityId: payment.id,
      metadata: { refundId: refund.id, reason, error: message.slice(0, 200) },
    });
    return Response.json({ error: "provider_refund_failed", refundId: refund.id, retryWithSamePaymentId: true }, { status: 502 });
  }
}
