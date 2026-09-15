import { purchaseActivation } from "@/src/activations/service";
import { friendlyPurchaseFailure } from "@/src/commercial/purchase-error-message";
import {
  assertPublicBetaGlobalGuardrails,
  assertPublicBetaUserGuardrails,
  assertPurchaseMarginGuardrails,
  assertSmsPoolBalanceReserve,
} from "@/src/commercial/purchase-guardrails";
import { assertServiceAllowed } from "@/src/compliance/policy";
import { env } from "@/src/config/env";
import { quoteBestSmsPoolPoolForOffer } from "@/src/providers/smspool/best-pool";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";
import { getOrCreateMiniAppSession } from "@/src/telegram/miniapp-session";

const PURCHASE_CONFIRMATION = "BUY_ONE_REAL_SMS";

type RequestBody = {
  initData?: string;
  reviewedOfferId?: string;
  reviewedSalePriceCents?: number;
  idempotencyKey?: string;
  confirmation?: string;
};

type PurchaseFailureContext = {
  userId?: string;
  salePriceCents?: number;
  providerPrice?: number;
  providerCurrency?: string;
};

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 500);
}

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.smsPoolApiKey) {
    return Response.json({ error: "CATALOG_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const reviewedOfferId = String(body.reviewedOfferId ?? "").trim();
  const clientKey = String(body.idempotencyKey ?? "").trim();
  const reviewedSalePriceCents = Number(body.reviewedSalePriceCents);

  if (!reviewedOfferId) return Response.json({ error: "REVIEWED_OFFER_ID_REQUIRED" }, { status: 400 });
  if (!clientKey || clientKey.length > 120) return Response.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  if (!Number.isInteger(reviewedSalePriceCents) || reviewedSalePriceCents < 0) {
    return Response.json({ error: "REVIEWED_PRICE_REQUIRED" }, { status: 400 });
  }
  if (body.confirmation !== PURCHASE_CONFIRMATION) {
    return Response.json({ error: "EXPLICIT_CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  const failureContext: PurchaseFailureContext = {};

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const allowed = await consumeRateLimit({
      scope: "miniapp-real-purchase",
      key: validated.user.id,
      limit: 4,
      windowSeconds: 60,
    });
    if (!allowed) throw new Error("RATE_LIMITED");

    const session = await getOrCreateMiniAppSession(validated.user);
    failureContext.userId = session.user.id;

    const bestQuote = await quoteBestSmsPoolPoolForOffer(reviewedOfferId);
    failureContext.salePriceCents = bestQuote.salePriceCents ?? undefined;
    failureContext.providerPrice = bestQuote.providerPrice;
    failureContext.providerCurrency = bestQuote.providerCurrency;

    await assertServiceAllowed("smspool", bestQuote.offer.product);

    if (bestQuote.offer.id !== reviewedOfferId) {
      return Response.json({
        ok: false,
        error: "OFFER_CHANGED_REVIEW_REQUIRED",
        currentOfferId: bestQuote.offer.id,
      }, { status: 409 });
    }
    if (!bestQuote.pricingConfigured || bestQuote.salePriceCents === null) {
      return Response.json({ ok: false, error: "PRICING_NOT_CONFIGURED" }, { status: 409 });
    }
    if (bestQuote.salePriceCents > reviewedSalePriceCents) {
      return Response.json({
        ok: false,
        error: "PRICE_CHANGED_REVIEW_REQUIRED",
        currentSalePriceCents: bestQuote.salePriceCents,
      }, { status: 409 });
    }
    if (bestQuote.stock < 1) {
      return Response.json({ ok: false, error: "OFFER_NOT_AVAILABLE" }, { status: 409 });
    }
    if (session.wallet.balanceCents < bestQuote.salePriceCents) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    // Public beta is open to any authenticated Telegram user; safety comes from
    // profitability, provider reserve, per-user limits and system-wide budgets.
    assertPurchaseMarginGuardrails({
      salePriceCents: bestQuote.salePriceCents,
      providerPrice: bestQuote.providerPrice,
      providerCurrency: bestQuote.providerCurrency,
    });
    await assertSmsPoolBalanceReserve(bestQuote.providerPrice);
    await assertPublicBetaUserGuardrails({
      userId: session.user.id,
      product: bestQuote.offer.product,
      salePriceCents: bestQuote.salePriceCents,
    });
    await assertPublicBetaGlobalGuardrails({
      salePriceCents: bestQuote.salePriceCents,
      providerPrice: bestQuote.providerPrice,
      providerCurrency: bestQuote.providerCurrency,
    });

    const activation = await purchaseActivation({
      userId: session.user.id,
      provider: "smspool",
      country: bestQuote.offer.countryId,
      operator: bestQuote.offer.operator,
      product: bestQuote.offer.product,
      kind: "ONE_TIME_SMS",
      idempotencyKey: `miniapp:${session.user.id}:${clientKey}`,
      maxSalePriceCents: reviewedSalePriceCents,
    });

    const refreshedSession = await getOrCreateMiniAppSession(validated.user);
    return Response.json({
      ok: true,
      activation,
      offer: {
        id: bestQuote.offer.id,
        label: bestQuote.offer.label,
        countryName: bestQuote.offer.countryName,
        operator: bestQuote.offer.operator,
      },
      session: refreshedSession,
    });
  } catch (error) {
    const message = safeError(error);
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    if (message === "MINIAPP_USER_BLOCKED") return Response.json({ error: message }, { status: 403 });

    const betaLimit = [
      "BETA_PURCHASE_HOURLY_LIMIT",
      "BETA_PURCHASE_DAILY_LIMIT",
      "BETA_DAILY_SPEND_LIMIT",
      "BETA_PENDING_ACTIVATIONS_LIMIT",
      "BETA_PENDING_SERVICE_LIMIT",
      "BETA_GLOBAL_PURCHASE_HOURLY_LIMIT",
      "BETA_GLOBAL_PURCHASE_DAILY_LIMIT",
      "BETA_GLOBAL_SALES_LIMIT",
      "BETA_GLOBAL_PROVIDER_SPEND_LIMIT",
    ].some((code) => message.includes(code));
    const circuitBreakerOpen = message.includes("BETA_CIRCUIT_BREAKER_OPEN");
    const rateLimited = message.includes("RATE_LIMITED");

    const expected = [
      "PURCHASES_DISABLED",
      "SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED",
      "SMSPOOL_API_KEY_NOT_CONFIGURED",
      "SERVICE_NOT_APPROVED_FOR_SALE",
      "SERVICE_BLOCKED_BY_COMPLIANCE_POLICY",
      "SMSPOOL_SERVICE_OFFER_NOT_FOUND",
      "SMSPOOL_SERVICE_NO_STOCK",
      "PRICING_NOT_CONFIGURED",
      "OFFER_NOT_AVAILABLE",
      "INSUFFICIENT_BALANCE",
      "PRICE_CHANGED_REVIEW_REQUIRED",
      "SALE_PRICE_BELOW_MINIMUM",
      "MINIMUM_MARGIN_NOT_MET",
      "SMSPOOL_BALANCE_RESERVE_REQUIRED",
      "BETA_PURCHASE_HOURLY_LIMIT",
      "BETA_PURCHASE_DAILY_LIMIT",
      "BETA_DAILY_SPEND_LIMIT",
      "BETA_PENDING_ACTIVATIONS_LIMIT",
      "BETA_PENDING_SERVICE_LIMIT",
      "BETA_GLOBAL_PURCHASE_HOURLY_LIMIT",
      "BETA_GLOBAL_PURCHASE_DAILY_LIMIT",
      "BETA_GLOBAL_SALES_LIMIT",
      "BETA_GLOBAL_PROVIDER_SPEND_LIMIT",
      "BETA_GLOBAL_PROVIDER_SPEND_CURRENCY_UNSUPPORTED",
      "BETA_CIRCUIT_BREAKER_OPEN",
      "RATE_LIMITED",
    ].some((code) => message.includes(code));

    const friendly = await friendlyPurchaseFailure({
      code: message,
      userId: failureContext.userId,
      salePriceCents: failureContext.salePriceCents,
      providerPrice: failureContext.providerPrice,
      providerCurrency: failureContext.providerCurrency,
    });

    console.error("[miniapp-real-purchase] failed", {
      code: message,
      retryAt: friendly.retryAt,
    });

    return Response.json(
      {
        ok: false,
        error: friendly.message,
        errorCode: friendly.code,
        retryAt: friendly.retryAt,
        retryAfterSeconds: friendly.retryAfterSeconds,
      },
      { status: circuitBreakerOpen ? 503 : betaLimit || rateLimited ? 429 : expected ? 409 : 502 },
    );
  }
}
