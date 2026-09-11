import { env } from "@/src/config/env";
import { getMiniAppUrl, telegramApi } from "@/src/telegram/client";

function hasAdminAccess(request: Request) {
  if (!env.adminApiToken) return false;
  return request.headers.get("authorization") === `Bearer ${env.adminApiToken}`;
}

export async function POST(request: Request) {
  if (!hasAdminAccess(request)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!env.appBaseUrl) return Response.json({ error: "APP_BASE_URL_NOT_CONFIGURED" }, { status: 503 });
  if (!env.telegramWebhookSecret) return Response.json({ error: "TELEGRAM_WEBHOOK_SECRET_NOT_CONFIGURED" }, { status: 503 });

  const miniAppUrl = getMiniAppUrl();
  if (!miniAppUrl || !miniAppUrl.startsWith("https://")) {
    return Response.json({ error: "TELEGRAM_MINI_APP_HTTPS_URL_REQUIRED" }, { status: 400 });
  }

  const webhookUrl = new URL("/api/telegram/webhook", env.appBaseUrl).toString();
  if (!webhookUrl.startsWith("https://")) {
    return Response.json({ error: "TELEGRAM_WEBHOOK_HTTPS_URL_REQUIRED" }, { status: 400 });
  }

  try {
    await telegramApi("setWebhook", {
      url: webhookUrl,
      secret_token: env.telegramWebhookSecret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });

    await telegramApi("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Abrir Central SMS",
        web_app: { url: miniAppUrl },
      },
    });

    await telegramApi("setMyCommands", {
      commands: [
        { command: "start", description: "Abrir a Central SMS" },
        { command: "ajuda", description: "Ajuda e comandos" },
      ],
    });

    return Response.json({
      ok: true,
      webhookUrl,
      miniAppUrl,
      configured: ["webhook", "menu_button", "commands"],
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "TELEGRAM_CONFIGURATION_FAILED" },
      { status: 502 },
    );
  }
}
