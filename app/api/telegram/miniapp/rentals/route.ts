import { env } from "@/src/config/env";
import { getSmsPoolRentalDetails, listSmsPoolRentalTypes } from "@/src/providers/smspool/rental-catalog";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.smsPoolApiKey) {
    return Response.json({ error: "CATALOG_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { initData?: string; rentalId?: string };
  try {
    body = await request.json() as { initData?: string; rentalId?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const allowed = await consumeRateLimit({
      scope: "miniapp-rental-catalog",
      key: validated.user.id,
      limit: 20,
      windowSeconds: 60,
    });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    if (body.rentalId) {
      const details = await getSmsPoolRentalDetails(body.rentalId);
      return Response.json({
        ok: true,
        mode: "live-readonly",
        kind: "TEMPORARY_HOSTING",
        purchaseExecutionEnabled: false,
        rental: details.rental,
        plans: details.plans,
        services: details.services,
        serviceMode: details.serviceMode,
      });
    }

    const rentals = await listSmsPoolRentalTypes();
    return Response.json({
      ok: true,
      mode: "live-readonly",
      kind: "TEMPORARY_HOSTING",
      purchaseExecutionEnabled: false,
      rentals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-rental-catalog] failed", { message });
    return Response.json({ error: "RENTAL_CATALOG_FAILED" }, { status: 502 });
  }
}
