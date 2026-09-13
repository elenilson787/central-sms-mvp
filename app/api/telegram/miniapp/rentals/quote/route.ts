import { env } from "@/src/config/env";
import { quoteSmsPoolRental } from "@/src/providers/smspool/rental-catalog";
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

  let body: { initData?: string; rentalId?: string; days?: number; serviceId?: string };
  try {
    body = await request.json() as { initData?: string; rentalId?: string; days?: number; serviceId?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!body.rentalId) return Response.json({ error: "RENTAL_ID_REQUIRED" }, { status: 400 });
  if (!Number.isInteger(body.days) || Number(body.days) <= 0 || Number(body.days) > 365) {
    return Response.json({ error: "RENTAL_DAYS_INVALID" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const allowed = await consumeRateLimit({
      scope: "miniapp-rental-quote",
      key: validated.user.id,
      limit: 20,
      windowSeconds: 60,
    });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const [session, quote] = await Promise.all([
      getOrCreateMiniAppSession(validated.user),
      quoteSmsPoolRental({
        rentalId: body.rentalId,
        days: Number(body.days),
        serviceId: body.serviceId,
      }),
    ]);

    return Response.json({
      ok: true,
      mode: "live-readonly",
      kind: "TEMPORARY_HOSTING",
      purchaseExecutionEnabled: false,
      blockedReason: "PURCHASE_NOT_AVAILABLE",
      canAfford: quote.salePriceCents !== null
        ? session.wallet.balanceCents >= quote.salePriceCents
        : null,
      walletBalanceCents: session.wallet.balanceCents,
      rental: quote.rental,
      service: quote.service,
      serviceMode: quote.serviceMode,
      days: quote.days,
      availability: { stock: quote.stock },
      price: {
        configured: quote.pricingConfigured,
        salePriceCents: quote.salePriceCents,
        currency: "BRL",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-rental-quote] failed", { message });
    return Response.json({ error: "RENTAL_QUOTE_FAILED" }, { status: 502 });
  }
}
