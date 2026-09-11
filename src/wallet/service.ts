import { getSupabaseAdmin } from "@/src/db/supabase-server";

export async function getWalletBalanceCents(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wallets")
    .select("balance_cents")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return Number(data.balance_cents);
}

export async function applyWalletTransaction(input: {
  userId: string;
  type: "deposit" | "purchase" | "refund" | "adjustment";
  amountCents: number;
  referenceId: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("wallet_apply_transaction", {
    p_user_id: input.userId,
    p_type: input.type,
    p_amount_cents: Math.trunc(input.amountCents),
    p_reference_id: input.referenceId,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return data;
}
