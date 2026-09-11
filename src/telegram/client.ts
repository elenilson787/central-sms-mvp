import { env } from "@/src/config/env";

export async function telegramApi<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  if (!env.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");

  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) throw new Error(`TELEGRAM_API_${method.toUpperCase()}_FAILED:${data.description ?? response.status}`);
  return data.result as T;
}

export function getMiniAppUrl(): string | undefined {
  if (env.telegramMiniAppUrl) return env.telegramMiniAppUrl;
  if (!env.appBaseUrl) return undefined;
  try {
    return new URL("/miniapp", env.appBaseUrl).toString();
  } catch {
    return undefined;
  }
}

export async function sendTelegramText(chatId: number, text: string, options: Record<string, unknown> = {}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}
