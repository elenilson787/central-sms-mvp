import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";

export async function GET() {
  let database = false;
  try {
    const result = await getSupabaseAdmin().from("app_users").select("id", { head: true, count: "exact" }).limit(1);
    database = !result.error;
  } catch {
    database = false;
  }

  const configured = {
    database: Boolean(env.supabaseUrl && env.supabaseSecretKey),
    telegram: Boolean(env.telegramBotToken && env.telegramWebhookSecret),
    pix: Boolean(env.pixEnabled && env.mercadoPagoAccessToken && env.mercadoPagoWebhookSecret),
  };
  const ok = database && configured.database && configured.telegram && (!env.pixEnabled || configured.pix);

  return Response.json({
    ok,
    service: "central-sms-mvp",
    database,
    configured,
    purchasesEnabled: env.purchasesEnabled,
    pixEnabled: env.pixEnabled,
    paymentEnvironment: env.mercadoPagoTestMode ? "test" : "production",
    timestamp: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}
