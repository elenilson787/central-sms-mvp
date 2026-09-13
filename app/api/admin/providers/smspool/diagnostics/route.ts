import { env } from "@/src/config/env";
import {
  retrieveSmsPoolBalance,
  retrieveSmsPoolCountries,
  retrieveSmsPoolPricing,
  retrieveSmsPoolServices,
} from "@/src/providers/smspool/client";
import { isAdminRequest } from "@/src/security/admin-auth";

function safeNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!env.smsPoolApiKey) {
    return Response.json({
      ok: false,
      provider: "smspool",
      configured: false,
      purchasesEnabled: env.purchasesEnabled,
      commercialApproved: env.smsPoolCommercialApproved,
      priceCurrency: env.smsPoolPriceCurrency,
      error: "SMSPOOL_API_KEY_NOT_CONFIGURED",
    }, { status: 503 });
  }

  try {
    const [balanceResult, countries, services] = await Promise.all([
      retrieveSmsPoolBalance(),
      retrieveSmsPoolCountries(),
      retrieveSmsPoolServices(),
    ]);

    const preferredCountry = countries.find((item) => String(item.short_name).toUpperCase() === "BR") ?? countries[0];
    const pricing = preferredCountry
      ? await retrieveSmsPoolPricing({ country: preferredCountry.ID })
      : [];

    const sample = pricing.slice(0, 8).map((item) => ({
      serviceId: String(item.service),
      serviceName: item.service_name,
      countryId: String(item.country),
      countryName: item.country_name,
      countryCode: item.short_name,
      pool: String(item.pool),
      providerPrice: safeNumber(item.price),
      providerCurrency: env.smsPoolPriceCurrency,
    }));

    return Response.json({
      ok: true,
      provider: "smspool",
      configured: true,
      connection: "ok",
      balance: {
        value: safeNumber(balanceResult.balance),
        currency: env.smsPoolPriceCurrency,
      },
      catalog: {
        countries: countries.length,
        services: services.length,
        sampleCountry: preferredCountry ? {
          id: String(preferredCountry.ID),
          name: preferredCountry.name,
          code: preferredCountry.short_name,
        } : null,
        samplePricingCount: pricing.length,
        sample,
      },
      safety: {
        purchasesEnabled: env.purchasesEnabled,
        commercialApproved: env.smsPoolCommercialApproved,
        livePurchasesAllowed: Boolean(env.purchasesEnabled && env.smsPoolCommercialApproved && env.smsPoolApiKey),
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "SMSPOOL_DIAGNOSTICS_FAILED";
    console.error("[smspool-diagnostics] failed", { message });
    return Response.json({
      ok: false,
      provider: "smspool",
      configured: true,
      connection: "failed",
      error: message.startsWith("SMSPOOL_API_ERROR") ? message : "SMSPOOL_DIAGNOSTICS_FAILED",
      safety: {
        purchasesEnabled: env.purchasesEnabled,
        commercialApproved: env.smsPoolCommercialApproved,
        livePurchasesAllowed: false,
      },
    }, { status: 502 });
  }
}
