import { logAudit } from "@/src/audit/log";
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

function normalizeAcquisitionSource(value?: string) {
  const cleaned = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || "direct";
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return { ok: true, handled: false };

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().split("@")[0];

  if (command === "/start") {
    const source = normalizeAcquisitionSource(parts[1]);
    const actorId = message.from?.id ?? chatId;
    try {
      await logAudit({
        actorType: "telegram_user",
        actorId,
        action: "bot_start",
        entityType: "telegram_bot",
        entityId: "CentralSMSBrasilBot",
        metadata: {
          source,
          username: message.from?.username ?? null,
          firstName: message.from?.first_name ?? null,
        },
      });
    } catch (error) {
      console.error("[telegram] failed to record acquisition source", error);
    }

    const miniAppUrl = getMiniAppUrl();
    if (!miniAppUrl || !miniAppUrl.startsWith("https://")) {
      await sendTelegramText(
        chatId,
        "📲 CENTRAL SMS\n\nO bot está online, mas a Mini App ainda não possui uma URL HTTPS configurada. O administrador precisa concluir o deploy antes de liberar o botão de acesso.",
      );
      return { ok: true, handled: true };
    }

    const welcomeText = [
      "👋 Bem-vindo à Central SMS!",
      "",
      "Aqui você pode comprar números temporários para receber códigos SMS de diversos aplicativos e sites.",
      "",
      "Como começar:",
      "1. 💳 Recarregue sua carteira via PIX",
      "2. 📲 Escolha o serviço e o país",
      "3. 📊 Confira preço, disponibilidade e taxa de sucesso",
      "4. ✅ Confirme a compra",
      "5. 📩 Acompanhe o código em Minhas ativações",
      "",
      "⭐ As melhores rotas aparecem em Recomendados agora.",
      "",
      "🔄 Se uma ativação terminar sem SMS e o fornecedor confirmar o reembolso, o valor correspondente retorna automaticamente para sua carteira.",
      "",
      "🧪 Central SMS está em beta público.",
      "🚫 Use apenas para finalidades legítimas e de acordo com nossos termos.",
      "",
      "Toque no botão abaixo para abrir a Central SMS.",
    ].join("\n");

    await sendTelegramText(
      chatId,
      welcomeText,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: "📲 Abrir Central SMS",
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
