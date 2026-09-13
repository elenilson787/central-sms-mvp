import { refreshUserWaitingActivations } from "@/src/activations/user-refresh";
import { env } from "@/src/config/env";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { initData?: string };
  try {
    body = await request.json() as { initData?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const initialSession = await getOrCreateMiniAppSession(validated.user);
    const refresh = await refreshUserWaitingActivations(initialSession.user.id, 10);
    const session = refresh.updated > 0
      ? await getOrCreateMiniAppSession(validated.user)
      : initialSession;

    return Response.json({ ok: true, refresh, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("MINIAPP_ACTIVATION_REFRESH_ERROR", { message });

    if (message === "MINIAPP_USER_BLOCKED") return Response.json({ error: message }, { status: 403 });
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    return Response.json({ error: "MINIAPP_ACTIVATION_REFRESH_FAILED" }, { status: 500 });
  }
}
