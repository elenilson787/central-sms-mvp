import { getPreviewOffer } from "@/src/catalog/preview";
import { quoteOffer } from "@/src/pricing/quote";
import { env } from "@/src/config/env";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { initData?: string; offerId?: string };
  try {
    body = await request.json() as { initData?: string; offerId?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!body.offerId) return Response.json({ error: "OFFER_ID_REQUIRED" }, { status: 400 });

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const session = await getOrCreateMiniAppSession(validated.user);
    const offer = getPreviewOffer(body.offerId);
    if (!offer) return Response.json({ error: "PREVIEW_OFFER_NOT_FOUND" }, { status: 404 });

    const quote = quoteOffer(offer);
    return Response.json({
      ok: true,
      mode: "preview",
      purchaseExecutionEnabled: false,
      blockedReason: "PREVIEW_CATALOG_ONLY",
      canAfford: session.wallet.balanceCents >= quote.salePriceCents,
      walletBalanceCents: session.wallet.balanceCents,
      offer: {
        id: offer.id,
        country: offer.country,
        countryName: offer.countryName,
        product: offer.product,
        label: offer.label,
        kind: offer.kind,
        stock: offer.stock,
      },
      quote,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-quote] failed", { message });
    return Response.json({ error: "MINIAPP_QUOTE_FAILED" }, { status: 500 });
  }
}
