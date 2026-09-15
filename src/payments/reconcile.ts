import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { currentPaymentEnvironment, type PaymentEnvironment } from "@/src/payments/environment";
import {
  getOrder,
  normalizeOrderStatus,
  orderAmountCents,
  orderIsAccredited,
  orderIsFullyRefunded,
  primaryOrderPayment,
} from "@/src/payments/mercadopago";
import { applyWalletTransaction } from "@/src/wallet/service";

type LocalPayment = {
  id: string;
  user_id: string;
  external_payment_id: string;
  external_reference: string;
  environment: PaymentEnvironment;
  amount_cents: number;
  status: string;
  paid_at?: string | null;
};

async function reverseCreditedDepositForProviderRefund(input: {
  local: LocalPayment;
  orderId: string;
  externalPaymentId?: string | number | null;
}) {
  const supabase = getSupabaseAdmin();
  const creditReference = `payment:${input.local.id}:credit`;

  const originalCredit = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("user_id", input.local.user_id)
    .eq("type", "deposit")
    .eq("reference_id", creditReference)
    .maybeSingle();
  if (originalCredit.error) throw originalCredit.error;

  // A provider refund must only reverse money that was actually credited to
  // the internal wallet. This also covers approval callbacks that failed before
  // creating the deposit ledger row.
  if (!originalCredit.data) return { reversed: false, reason: "deposit_not_credited" as const };

  const managedRefund = await supabase
    .from("payment_refunds")
    .select("id,status")
    .eq("payment_id", input.local.id)
    .maybeSingle();
  if (managedRefund.error) throw managedRefund.error;

  // When the refund originated from our admin flow, reuse exactly the same
  // deterministic reservation reference. This makes a provider webhook racing
  // with the admin request idempotent instead of debiting the wallet twice.
  const reversalReference = managedRefund.data?.id
    ? `payment-refund:${managedRefund.data.id}:reserve`
    : `payment:${input.local.id}:provider-refund-reversal`;

  try {
    await applyWalletTransaction({
      userId: input.local.user_id,
      type: "refund",
      amountCents: -Number(input.local.amount_cents),
      referenceId: reversalReference,
      metadata: {
        source: managedRefund.data?.id ? "admin_refund_provider_confirmation" : "mercado_pago_provider_refund",
        paymentId: input.local.id,
        externalOrderId: input.orderId,
        externalPaymentId: input.externalPaymentId ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("payments")
      .update({ status: "refund_reversal_pending", updated_at: new Date().toISOString() })
      .eq("id", input.local.id)
      .eq("environment", input.local.environment);
    throw new Error(`PAYMENT_REFUND_REVERSAL_PENDING:${message}`);
  }

  return { reversed: true, reason: null };
}

export async function reconcileMercadoPagoOrder(externalOrderId: string) {
  const environment = currentPaymentEnvironment();
  const order = await getOrder(externalOrderId);
  const orderId = String(order.id ?? externalOrderId);
  const externalReference = String(order.external_reference ?? "");
  const supabase = getSupabaseAdmin();

  let local: LocalPayment | null = null;
  const byExternalId = await supabase
    .from("payments")
    .select("id,user_id,external_payment_id,external_reference,environment,amount_cents,status,paid_at")
    .eq("external_payment_id", orderId)
    .eq("environment", environment)
    .maybeSingle();
  if (byExternalId.error) throw byExternalId.error;
  local = byExternalId.data as LocalPayment | null;

  if (!local && externalReference) {
    const byReference = await supabase
      .from("payments")
      .select("id,user_id,external_payment_id,external_reference,environment,amount_cents,status,paid_at")
      .eq("external_reference", externalReference)
      .eq("environment", environment)
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
    local.environment === environment &&
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
  const fullyRefunded = orderIsFullyRefunded(order);

  if (fullyRefunded) {
    const reversal = await reverseCreditedDepositForProviderRefund({
      local,
      orderId,
      externalPaymentId: payment?.id ?? null,
    });

    const refundUpdate = await supabase
      .from("payments")
      .update({
        external_payment_id: orderId,
        status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", local.id)
      .eq("environment", environment);
    if (refundUpdate.error) throw refundUpdate.error;

    return {
      ok: true,
      localPaymentId: local.id,
      paymentStatus: "refunded",
      credited: false,
      reversed: reversal.reversed,
      reversalReason: reversal.reason,
    };
  }

  const paidAt = accredited ? (local.paid_at ?? new Date().toISOString()) : local.paid_at;
  const update = await supabase
    .from("payments")
    .update({
      external_payment_id: orderId,
      status: normalizedStatus,
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", local.id)
    .eq("environment", environment);
  if (update.error) throw update.error;

  if (accredited) {
    await applyWalletTransaction({
      userId: local.user_id,
      type: "deposit",
      amountCents: expectedAmountCents,
      referenceId: `payment:${local.id}:credit`,
      metadata: {
        provider: "mercado_pago",
        environment,
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
