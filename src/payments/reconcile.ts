import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { getPayment, paymentAmountCents } from "@/src/payments/mercadopago";
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

export async function reconcileMercadoPagoPayment(externalPaymentId: string) {
  const payment = await getPayment(externalPaymentId);
  const paymentId = String(payment.id ?? externalPaymentId);
  const externalReference = String(payment.external_reference ?? "");
  const supabase = getSupabaseAdmin();

  let local: LocalPayment | null = null;
  const byExternalId = await supabase
    .from("payments")
    .select("id,user_id,external_payment_id,external_reference,amount_cents,status,paid_at")
    .eq("external_payment_id", paymentId)
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

  if (!local) return { ok: true, ignored: "unknown_payment" as const, paymentStatus: payment.status ?? "unknown" };

  const expectedReference = local.external_reference;
  const expectedAmountCents = Number(local.amount_cents);
  const actualAmountCents = paymentAmountCents(payment);
  const normalizedStatus = String(payment.status ?? "unknown");

  const integrityOk =
    externalReference === expectedReference &&
    actualAmountCents === expectedAmountCents &&
    String(payment.currency_id ?? "BRL") === "BRL" &&
    String(payment.payment_method_id ?? "pix") === "pix";

  if (!integrityOk) {
    await supabase
      .from("payments")
      .update({ status: "integrity_mismatch", updated_at: new Date().toISOString() })
      .eq("id", local.id);
    throw new Error("PAYMENT_INTEGRITY_MISMATCH");
  }

  const paidAt = normalizedStatus === "approved" ? (local.paid_at ?? new Date().toISOString()) : local.paid_at;
  const update = await supabase
    .from("payments")
    .update({
      external_payment_id: paymentId,
      status: normalizedStatus,
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", local.id);
  if (update.error) throw update.error;

  if (normalizedStatus === "approved") {
    await applyWalletTransaction({
      userId: local.user_id,
      type: "deposit",
      amountCents: expectedAmountCents,
      referenceId: `payment:${local.id}:credit`,
      metadata: {
        provider: "mercado_pago",
        external_payment_id: paymentId,
      },
    });
  }

  return {
    ok: true,
    localPaymentId: local.id,
    paymentStatus: normalizedStatus,
    credited: normalizedStatus === "approved",
  };
}
