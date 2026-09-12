import { getSupabaseAdmin } from "@/src/db/supabase-server";
import {
  getOrder,
  normalizeOrderStatus,
  orderAmountCents,
  orderIsAccredited,
  primaryOrderPayment,
} from "@/src/payments/mercadopago";
import { applyWalletTransaction } from "@/src/wallet/service";

type LocalPayment = {
  id: string;
  user_id: string;
  external_payment_id: string;
  external_reference: string;
  amount_cents: number;
  status: string;
  paid_at?: string | null;
};

export async function reconcileMercadoPagoOrder(externalOrderId: string) {
  const order = await getOrder(externalOrderId);
  const orderId = String(order.id ?? externalOrderId);
  const externalReference = String(order.external_reference ?? "");
  const supabase = getSupabaseAdmin();

  let local: LocalPayment | null = null;
  const byExternalId = await supabase
    .from("payments")
    .select("id,user_id,external_payment_id,external_reference,amount_cents,status,paid_at")
    .eq("external_payment_id", orderId)
    .maybeSingle();
  if (byExternalId.error) throw byExternalId.error;
  local = byExternalId.data as LocalPayment | null;

  if (!local && externalReference) {
    const byReference = await supabase
      .from("payments")
      .select("id,user_id,external_payment_id,external_reference,amount_cents,status,paid_at")
      .eq("external_reference", externalReference)
      .maybeSingle();
    if (byReference.error) throw byReference.error;
    local = byReference.data as LocalPayment | null;
  }

  const normalizedStatus = normalizeOrderStatus(order);
  if (!local) return { ok: true, ignored: "unknown_order" as const, paymentStatus: normalizedStatus };

  const expectedReference = local.external_reference;
  const expectedAmountCents = Number(local.amount_cents);
  const actualAmountCents = orderAmountCents(order);
  const payment = primaryOrderPayment(order);

  const integrityOk =
    externalReference === expectedReference &&
    actualAmountCents === expectedAmountCents &&
    payment?.payment_method?.id === "pix" &&
    payment?.payment_method?.type === "bank_transfer";

  if (!integrityOk) {
    await supabase
      .from("payments")
      .update({ status: "integrity_mismatch", updated_at: new Date().toISOString() })
      .eq("id", local.id);
    throw new Error("PAYMENT_INTEGRITY_MISMATCH");
  }

  const accredited = orderIsAccredited(order);
  const paidAt = accredited ? (local.paid_at ?? new Date().toISOString()) : local.paid_at;
  const update = await supabase
    .from("payments")
    .update({
      external_payment_id: orderId,
      status: normalizedStatus,
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", local.id);
  if (update.error) throw update.error;

  if (accredited) {
    await applyWalletTransaction({
      userId: local.user_id,
      type: "deposit",
      amountCents: expectedAmountCents,
      referenceId: `payment:${local.id}:credit`,
      metadata: {
        provider: "mercado_pago",
        external_order_id: orderId,
        external_payment_id: payment?.id ?? null,
      },
    });
  }

  return {
    ok: true,
    localPaymentId: local.id,
    paymentStatus: normalizedStatus,
    credited: accredited,
  };
}
