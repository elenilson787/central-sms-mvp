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
      "📲 CENTRAL SMS\n\nAcesse sua carteira, ativações e catálogo pela Mini App. As compras reais permanecem bloqueadas até a validação comercial dos providers.",
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
      "ℹ️ CENTRAL SMS\n\n/start — abrir o menu principal\n/ajuda — ver esta ajuda\n\nDentro da Mini App você poderá consultar saldo, ativações, serviços e recargas.",
    );
    return { ok: true, handled: true };
  }

  return { ok: true, handled: false };
}
