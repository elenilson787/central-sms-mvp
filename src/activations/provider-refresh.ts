import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { checkSmsPoolOrder } from "@/src/providers/smspool/client";
import { reconcileSmsPoolActivationStatus, type SmsPoolRefreshActivationRow } from "@/src/activations/smspool-reconcile";

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export async function refreshSmsPoolWaitingActivations(limit = 25) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("activations")
    .select("id,user_id,external_activation_id,sale_price_cents")
    .eq("provider", "smspool")
    .in("status", ["number_received", "waiting_sms"])
    .not("external_activation_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(100, Math.trunc(limit))));

  if (error) throw error;

  const results: Array<{ activationId: string; updated: boolean; status?: string; refunded?: boolean }> = [];

  for (const row of (data ?? []) as SmsPoolRefreshActivationRow[]) {
    if (!row.external_activation_id) continue;
    try {
      const status = await checkSmsPoolOrder(String(row.external_activation_id));
      const result = await reconcileSmsPoolActivationStatus(row, status);
      results.push({ activationId: row.id, ...result });
    } catch (refreshError) {
      console.error("[activation-refresh] failed", {
        activationId: row.id,
        message: safeErrorMessage(refreshError),
      });
      results.push({ activationId: row.id, updated: false });
    }
  }

  return results;
}
