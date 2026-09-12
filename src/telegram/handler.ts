import { env } from "@/src/config/env";
import { getMiniAppUrl, sendTelegramText } from "@/src/telegram/client";

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number; username?: string; first_name?: string; last_name?: string };
  };
};

function publicUrl(path: string) {
  const base = env.appBaseUrl?.replace(/\/$/, "");
  return base ? `${base}${path}` : null;
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return { ok: true, handled: false };

  const command = text.split(/\s+/)[0].toLowerCase().split("@")[0];

  if (command === "/start") {
    const miniAppUrl = getMiniAppUrl();
    if (!miniAppUrl || !miniAppUrl.startsWith("https://")) {
      await sendTelegramText(
        chatId,
        "📲 CENTRAL SMS\n\nO bot está online, mas a Mini App ainda não possui uma URL HTTPS configurada. O administrador precisa concluir o deploy antes de liberar o botão de acesso.",
      );
      return { ok: true, handled: true };
    }

    await sendTelegramText(
      chatId,
      "📲 CENTRAL SMS\n\nAcesse sua carteira, recargas PIX, ativações e catálogo pela Mini App. Compras reais de números permanecem bloqueadas até a validação comercial do provider.",
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: "🚀 Abrir Central SMS",
              web_app: { url: miniAppUrl },
            },
          ]],
        },
      },
    );
    return { ok: true, handled: true };
  }

  if (command === "/ajuda" || command === "/help") {
    await sendTelegramText(
      chatId,
      "ℹ️ CENTRAL SMS\n\n/start — abrir a Central SMS\n/ajuda — ver esta ajuda\n/termos — Termos de Uso\n/privacidade — Política de Privacidade\n/reembolso — Política de Reembolso\n/suporte — orientações de suporte\n\nNunca envie senha, token ou código recebido por SMS ao suporte.",
    );
    return { ok: true, handled: true };
  }

  const pages: Record<string, { label: string; path: string }> = {
    "/termos": { label: "Termos de Uso", path: "/terms" },
    "/privacidade": { label: "Política de Privacidade", path: "/privacy" },
    "/reembolso": { label: "Política de Reembolso", path: "/refund-policy" },
    "/suporte": { label: "Suporte", path: "/support" },
  };
  const page = pages[command];
  if (page) {
    const url = publicUrl(page.path);
    await sendTelegramText(
      chatId,
      url ? `📄 ${page.label}\n\n${url}` : `📄 ${page.label}\n\nA página estará disponível assim que APP_BASE_URL estiver configurada.`,
    );
    return { ok: true, handled: true };
  }

  return { ok: true, handled: false };
}
