import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/src/db/supabase-server";

export async function consumeRateLimit(input: {
  scope: string;
  key: string | number;
  limit: number;
  windowSeconds: number;
}) {
  const supabase = getSupabaseAdmin();
  const keyHash = createHash("sha256").update(String(input.key)).digest("hex");
  const { data, error } = await supabase.rpc("rate_limit_consume", {
    p_scope: input.scope,
    p_key_hash: keyHash,
    p_limit: Math.trunc(input.limit),
    p_window_seconds: Math.trunc(input.windowSeconds),
  });
  if (error) throw error;
  return Boolean(data);
}
