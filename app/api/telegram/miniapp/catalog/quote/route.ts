import { assertServiceAllowed } from "@/src/compliance/policy";
import { env } from "@/src/config/env";
import { quoteBestSmsPoolPoolForOffer } from "@/src/providers/smspool/best-pool";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.smsPoolApiKey) {
    return Response.json({ error: "CATALOG_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
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
      scope: "miniapp-live-catalog-quote",
      key: validated.user.id,
      limit: 30,
      windowSeconds: 60,
    });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const [session, quote] = await Promise.all([
      getOrCreateMiniAppSession(validated.user),
      quoteBestSmsPoolPoolForOffer(body.offerId),
    ]);

    await assertServiceAllowed("smspool", quote.offer.product);

    const purchaseExecutionEnabled = Boolean(
      env.purchasesEnabled
      && env.smsPoolCommercialApproved
      && env.smsPoolApiKey,
    );
    const blockedReason = !env.purchasesEnabled
      ? "PURCHASES_DISABLED"
      : !env.smsPoolCommercialApproved
        ? "SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED"
        : null;

    return Response.json({
      ok: true,
      mode: purchaseExecutionEnabled ? "live-purchasable" : "live-readonly",
      purchaseExecutionEnabled,
      blockedReason,
      canAfford: quote.salePriceCents !== null
        ? session.wallet.balanceCents >= quote.salePriceCents
        : null,
      walletBalanceCents: session.wallet.balanceCents,
      offer: {
        id: quote.offer.id,
        country: quote.offer.country,
        countryName: quote.offer.countryName,
        operator: quote.offer.operator,
        product: quote.offer.product,
        label: quote.offer.label,
        description: quote.offer.description,
        kind: quote.offer.kind,
        stock: quote.stock,
        salePriceCents: quote.salePriceCents,
        currency: "BRL",
        pricingConfigured: quote.pricingConfigured,
      },
      selection: {
        strategy: "highest_success_rate_then_lowest_price",
        pool: quote.offer.operator,
        successRate: quote.successRate ?? null,
      },
      availability: {
        stock: quote.stock,
        successRate: quote.successRate ?? null,
      },
      price: {
        configured: quote.pricingConfigured,
        salePriceCents: quote.salePriceCents,
        currency: "BRL",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    if (message === "SERVICE_NOT_APPROVED_FOR_SALE" || message.startsWith("SERVICE_BLOCKED_BY_COMPLIANCE_POLICY")) {
      return Response.json({ error: message }, { status: 403 });
    }
    if (message === "SMSPOOL_SERVICE_NO_STOCK") return Response.json({ error: message }, { status: 409 });
    console.error("[miniapp-live-catalog-quote] failed", { message });
    return Response.json({ error: "CATALOG_QUOTE_FAILED" }, { status: 502 });
  }
}