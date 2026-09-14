import { purchaseActivation } from "@/src/activations/service";
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
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const session = await getOrCreateMiniAppSession(validated.user);
    const bestQuote = await quoteBestSmsPoolPoolForOffer(reviewedOfferId);

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
      return Response.json({ ok: false, error: "INSUFFICIENT_BALANCE" }, { status: 409 });
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
    ].some((code) => message.includes(code));

    console.error("[miniapp-real-purchase] failed", { message });
    return Response.json(
      { ok: false, error: message },
      { status: circuitBreakerOpen ? 503 : betaLimit ? 429 : expected ? 409 : 502 },
    );
  }
}
