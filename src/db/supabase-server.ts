import { createClient } from "@supabase/supabase-js";
import { env } from "@/src/config/env";

export function getSupabaseAdmin() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error("SUPABASE_SERVER_NOT_CONFIGURED");
  }

  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
