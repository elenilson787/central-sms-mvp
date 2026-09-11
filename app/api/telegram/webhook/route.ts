import { env } from "@/src/config/env";
import { handleTelegramUpdate, type TelegramUpdate } from "@/src/telegram/handler";

export async function POST(request: Request) {
  if (!env.telegramWebhookSecret) return Response.json({ error: "TELEGRAM_WEBHOOK_SECRET_NOT_CONFIGURED" }, { status: 503 });
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== env.telegramWebhookSecret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const update = await request.json() as TelegramUpdate;
  await handleTelegramUpdate(update);
  return Response.json({ ok: true });
}
