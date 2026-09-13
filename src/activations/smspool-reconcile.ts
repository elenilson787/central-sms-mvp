import { getSupabaseAdmin } from "@/src/db/supabase-server";
import type { SmsPoolCheck } from "@/src/providers/smspool/client";
import { applyWalletTransaction } from "@/src/wallet/service";

export type SmsPoolRefreshActivationRow = {
  id: string;
  user_id: string;
  external_activation_id: string | null;
  sale_price_cents: number | string;
};

export type SmsPoolReconcileResult = {
  updated: boolean;
  status?: string;
  refunded?: boolean;
};

const TERMINAL_WITH_REFUND = new Map<number, string>([
  [2, "expired"],
  [5, "cancelled"],
  [6, "refunded"],
]);

export async function reconcileSmsPoolActivationStatus(
  row: SmsPoolRefreshActivationRow,
  providerStatus: SmsPoolCheck,
): Promise<SmsPoolReconcileResult> {
  if (!row.external_activation_id) return { updated: false };

  const supabase = getSupabaseAdmin();
  const smsCode = String(providerStatus.sms ?? "").trim();
  const smsText = String(providerStatus.full_sms ?? providerStatus.sms ?? "").trim();

  if (smsCode || smsText) {
    const dedupeKey = `smspool:${row.external_activation_id}:${smsCode}:${smsText}`.slice(0, 500);
    const smsInsert = await supabase.from("activation_sms").upsert({
      activation_id: row.id,
      provider_sms_id: null,
      dedupe_key: dedupeKey,
      sender: null,
      sms_text: smsText || null,
      sms_code: smsCode || null,
      received_at: new Date().toISOString(),
    }, { onConflict: "activation_id,dedupe_key", ignoreDuplicates: true });
    if (smsInsert.error) throw smsInsert.error;

    const activationUpdate = await supabase
      .from("activations")
      .update({
        status: "sms_received",
        sms_code: smsCode || null,
        sms_text: smsText || null,
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", row.id);
    if (activationUpdate.error) throw activationUpdate.error;

    return { updated: true, status: "sms_received", refunded: false };
  }

  const internalStatus = TERMINAL_WITH_REFUND.get(Number(providerStatus.status));
  if (!internalStatus) return { updated: false };

  const salePriceCents = Math.trunc(Number(row.sale_price_cents));
  if (!Number.isFinite(salePriceCents) || salePriceCents < 0) {
    throw new Error("ACTIVATION_SALE_PRICE_INVALID");
  }

  if (salePriceCents > 0) {
    await applyWalletTransaction({
      userId: row.user_id,
      type: "refund",
      amountCents: salePriceCents,
      referenceId: `activation:${row.id}:provider-refund`,
      metadata: {
        activationId: row.id,
        provider: "smspool",
        providerOrderId: row.external_activation_id,
        providerStatus: Number(providerStatus.status),
        reason: `provider_${internalStatus}`,
      },
    });
  }

  const activationUpdate = await supabase
    .from("activations")
    .update({
      status: internalStatus,
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", row.id);
  if (activationUpdate.error) throw activationUpdate.error;

  return { updated: true, status: internalStatus, refunded: salePriceCents > 0 };
}
