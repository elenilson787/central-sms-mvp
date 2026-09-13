import { env } from "@/src/config/env";
import {
  retrieveSmsPoolBalance,
  retrieveSmsPoolCountries,
  retrieveSmsPoolPricing,
  retrieveSmsPoolRentalIds,
  retrieveSmsPoolRentalServices,
  retrieveSmsPoolServices,
  type SmsPoolRentalEntry,
} from "@/src/providers/smspool/client";
import { normalizeRentalEntries } from "@/src/providers/smspool/rental-normalize";
import { isAdminRequest } from "@/src/security/admin-auth";

function safeNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scalarMetadata(entry: SmsPoolRentalEntry) {
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === "pricing") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      metadata[key] = value;
    }
  }
  return metadata;
}

function rentalTypeUnavailable(message: string) {
  return message.includes("SMSPOOL_API_ERROR:404:") && message.toLowerCase().includes("no available rentals found");
}

async function rentalDiagnostics(type: 0 | 1) {
  try {
    const payload = await retrieveSmsPoolRentalIds(type);
    const rentals = normalizeRentalEntries(payload).slice(0, 20);

    const rows = await Promise.all(rentals.map(async ({ key, entry }) => {
      const id = String(entry.ID ?? entry.id ?? key);
      try {
        const services = await retrieveSmsPoolRentalServices(id);
        return {
          queryType: type,
          id,
          name: String(entry.name ?? entry.country_name ?? entry.country ?? `Opção ${key}`),
          region: entry.region ? String(entry.region) : null,
          serviceCount: services.length,
          sampleServices: services.slice(0, 8).map((service) => String(service.name)),
          metadata: scalarMetadata(entry),
        };
      } catch (cause) {
        return {
          queryType: type,
          id,
          name: String(entry.name ?? entry.country_name ?? entry.country ?? `Opção ${key}`),
          region: entry.region ? String(entry.region) : null,
          serviceCount: null,
          sampleServices: [],
          servicesError: cause instanceof Error ? cause.message : "RENTAL_SERVICES_FAILED",
          metadata: scalarMetadata(entry),
        };
      }
    }));

    return {
      available: true as const,
      rows,
      error: null,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "RENTAL_CATALOG_FAILED";
    return {
      available: false as const,
      rows: [],
      error: rentalTypeUnavailable(message) ? "NO_RENTALS_AVAILABLE" : message,
    };
  }
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
    const [balanceResult, countries, services, rentalType0, rentalType1] = await Promise.all([
      retrieveSmsPoolBalance(),
      retrieveSmsPoolCountries(),
      retrieveSmsPoolServices(),
      rentalDiagnostics(0),
      rentalDiagnostics(1),
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
      rentalDiagnostics: {
        type0: rentalType0,
        type1: rentalType1,
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
