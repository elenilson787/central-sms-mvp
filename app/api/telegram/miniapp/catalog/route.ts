import { env } from "@/src/config/env";
import { listSmsPoolLiveCatalog } from "@/src/providers/smspool/catalog";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.smsPoolApiKey) {
    return Response.json({ error: "SMSPOOL_API_KEY_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { initData?: string; country?: string };
  try {
    body = await request.json() as { initData?: string; country?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const allowed = await consumeRateLimit({
      scope: "miniapp-smspool-catalog",
      key: validated.user.id,
      limit: 30,
      windowSeconds: 60,
    });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const catalog = await listSmsPoolLiveCatalog(body.country || "BR");
    return Response.json({
      ok: true,
      mode: "live-readonly",
      provider: "smspool",
      purchaseExecutionEnabled: false,
      disclaimer: "Catálogo real do provider. Compra externa permanece bloqueada até aprovação comercial e habilitação explícita.",
      ...catalog,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-smspool-catalog] failed", { message });
    return Response.json({ error: message.startsWith("SMSPOOL_") ? message : "SMSPOOL_CATALOG_FAILED" }, { status: 502 });
  }
}
