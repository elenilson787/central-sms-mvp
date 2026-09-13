import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { checkSmsPoolOrder } from "@/src/providers/smspool/client";

type ActivationRow = {
  id: string;
  external_activation_id: string | null;
};

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export async function refreshUserWaitingActivations(userId: string, limit = 10) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("activations")
    .select("id,external_activation_id")
    .eq("user_id", userId)
    .eq("provider", "smspool")
    .in("status", ["number_received", "waiting_sms"])
    .not("external_activation_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(20, Math.trunc(limit))));

  if (error) throw error;

  let checked = 0;
  let updated = 0;

  for (const row of (data ?? []) as ActivationRow[]) {
    if (!row.external_activation_id) continue;
    checked += 1;

    try {
      const status = await checkSmsPoolOrder(String(row.external_activation_id));
      const smsCode = String(status.sms ?? "").trim();
      const smsText = String(status.full_sms ?? status.sms ?? "").trim();
      if (!smsCode && !smsText) continue;

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
      updated += 1;
    } catch (refreshError) {
      console.error("[miniapp-activation-refresh] failed", {
        activationId: row.id,
        message: safeErrorMessage(refreshError),
      });
    }
  }

  return { checked, updated };
}
