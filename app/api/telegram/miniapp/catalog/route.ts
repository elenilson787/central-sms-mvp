import { env } from "@/src/config/env";
import { listSmsPoolLiveCatalog } from "@/src/providers/smspool/catalog";
import { consumeRateLimit } from "@/src/security/rate-limit";
import { validateTelegramMiniAppInitData } from "@/src/telegram/miniapp-auth";

export async function POST(request: Request) {
  if (!env.telegramBotToken) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!env.smsPoolApiKey) {
    return Response.json({ error: "CATALOG_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { initData?: string; country?: string };
  try {
    body = await request.json() as { initData?: string; country?: string };
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const validated = await validateTelegramMiniAppInitData(body.initData ?? "", env.telegramBotToken, {
      maxAgeSeconds: 3600,
    });
    const allowed = await consumeRateLimit({
      scope: "miniapp-live-catalog",
      key: validated.user.id,
      limit: 30,
      windowSeconds: 60,
    });
    if (!allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });

    const catalog = await listSmsPoolLiveCatalog(body.country || "BR");
    const offers = catalog.offers.map((offer) => ({
      id: offer.id,
      country: offer.country,
      countryName: offer.countryName,
      product: offer.product,
      label: offer.label,
      description: offer.description,
      kind: offer.kind,
      stock: offer.stock,
      salePriceCents: offer.salePriceCents,
      currency: offer.currency,
      pricingConfigured: offer.pricingConfigured,
    }));

    return Response.json({
      ok: true,
      mode: "live-readonly",
      purchaseExecutionEnabled: false,
      disclaimer: "Catálogo real conectado. Compras externas permanecem bloqueadas nesta etapa.",
      countries: catalog.countries,
      selectedCountry: catalog.selectedCountry,
      offers,
      pricingConfigured: catalog.pricingConfigured,
      purchasesAvailable: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("TELEGRAM_INIT_DATA_")) return Response.json({ error: message }, { status: 401 });
    console.error("[miniapp-live-catalog] failed", { message });
    return Response.json({ error: "CATALOG_FAILED" }, { status: 502 });
  }
}
