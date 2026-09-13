import { env } from "@/src/config/env";
import { quoteSmsPoolCatalogOffer } from "@/src/providers/smspool/catalog";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.smsPoolApiKey) {
    return Response.json({ error: "SMSPOOL_API_KEY_NOT_CONFIGURED" }, { status: 503 });
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
    const allowed = await consumeRateLimit({
      scope: "miniapp-smspool-quote",
      key: validated.user.id,
      limit: 30,
      windowSeconds: 60,
    });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const [session, quote] = await Promise.all([
      getOrCreateMiniAppSession(validated.user),
      quoteSmsPoolCatalogOffer(body.offerId),
    ]);

    return Response.json({
      ok: true,
      mode: "live-readonly",
      purchaseExecutionEnabled: false,
      blockedReason: !env.smsPoolCommercialApproved
        ? "SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED"
        : !env.purchasesEnabled
          ? "PURCHASES_DISABLED"
          : "READ_ONLY_CATALOG_STAGE",
      canAfford: quote.salePriceCents !== null
        ? session.wallet.balanceCents >= quote.salePriceCents
        : null,
      walletBalanceCents: session.wallet.balanceCents,
      offer: quote.offer,
      availability: {
        stock: quote.stock,
        successRate: quote.successRate ?? null,
      },
      providerPrice: {
        value: quote.providerPrice,
        currency: quote.providerCurrency,
      },
      price: {
        configured: quote.pricingConfigured,
        salePriceCents: quote.salePriceCents,
        currency: "BRL",
      },
      safety: {
        purchasesEnabled: env.purchasesEnabled,
        commercialApproved: env.smsPoolCommercialApproved,
        livePurchasesAllowed: Boolean(env.purchasesEnabled && env.smsPoolCommercialApproved && env.smsPoolApiKey),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-smspool-quote] failed", { message });
    return Response.json({ error: message.startsWith("SMSPOOL_") ? message : "SMSPOOL_QUOTE_FAILED" }, { status: 502 });
  }
}
