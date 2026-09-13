import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { checkSmsPoolOrder } from "@/src/providers/smspool/client";
import { reconcileSmsPoolActivationStatus, type SmsPoolRefreshActivationRow } from "@/src/activations/smspool-reconcile";

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export async function refreshUserWaitingActivations(userId: string, limit = 10) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("activations")
    .select("id,user_id,external_activation_id,sale_price_cents")
    .eq("user_id", userId)
    .eq("provider", "smspool")
    .in("status", ["number_received", "waiting_sms"])
    .not("external_activation_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(20, Math.trunc(limit))));

  if (error) throw error;

  let checked = 0;
  let updated = 0;
  let refunded = 0;

  for (const row of (data ?? []) as SmsPoolRefreshActivationRow[]) {
    if (!row.external_activation_id) continue;
    checked += 1;

    try {
      const status = await checkSmsPoolOrder(String(row.external_activation_id));
      const result = await reconcileSmsPoolActivationStatus(row, status);
      if (result.updated) updated += 1;
      if (result.refunded) refunded += 1;
    } catch (refreshError) {
      console.error("[miniapp-activation-refresh] failed", {
        activationId: row.id,
        message: safeErrorMessage(refreshError),
      });
    }
  }

  return { checked, updated, refunded };
}
