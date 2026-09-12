import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { reconcileMercadoPagoOrder } from "@/src/payments/reconcile";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

export async function POST(request: Request) {
  if (!env.pixEnabled) return Response.json({ error: "PIX_DISABLED" }, { status: 503 });
  if (!env.telegramBotToken) return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });

  let body: { initData?: string; paymentId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body.paymentId) return Response.json({ error: "PAYMENT_ID_REQUIRED" }, { status: 400 });

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, { maxAgeSeconds: 3600 });
    const session = await getOrCreateMiniAppSession(validated.user);
    const supabase = getSupabaseAdmin();
    const localQuery = await supabase
      .from("payments")
      .select("id,user_id,external_payment_id,status,amount_cents")
      .eq("id", body.paymentId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (localQuery.error) throw localQuery.error;
    if (!localQuery.data) return Response.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });

    const externalOrderId = String(localQuery.data.external_payment_id);
    if (externalOrderId.startsWith("pending:")) {
      return Response.json({ ok: true, status: String(localQuery.data.status), credited: false, walletBalanceCents: session.wallet.balanceCents });
    }

    const reconciliation = await reconcileMercadoPagoOrder(externalOrderId);
    const refreshedSession = await getOrCreateMiniAppSession(validated.user);
    return Response.json({
      ok: true,
      status: reconciliation.paymentStatus,
      credited: "credited" in reconciliation ? Boolean(reconciliation.credited) : false,
      walletBalanceCents: refreshedSession.wallet.balanceCents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-pix-status] failed", { message });
    return Response.json({ error: "PIX_STATUS_FAILED" }, { status: 502 });
  }
}
