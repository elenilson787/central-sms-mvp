import { assertSmsPoolCatalogServiceVisible, isSmsPoolCatalogServiceVisible } from "@/src/compliance/smspool-catalog";
import { env } from "@/src/config/env";
import { quoteOffer } from "@/src/pricing/quote";
import type { Offer } from "@/src/providers/types";
import {
  retrieveSmsPoolCountries,
  retrieveSmsPoolPrice,
  retrieveSmsPoolPricing,
  retrieveSmsPoolServices,
  retrieveSmsPoolStock,
  type SmsPoolCountry,
  type SmsPoolPricing,
} from "@/src/providers/smspool/client";

export type SmsPoolCatalogCountry = {
  id: string;
  name: string;
  code: string;
};

export type SmsPoolCatalogOffer = {
  id: string;
  provider: "smspool";
  country: string;
  countryId: string;
  countryName: string;
  operator: string;
  product: string;
  label: string;
  description: string;
  kind: "ONE_TIME_SMS";
  stock: null;
  successRate?: number;
  providerPrice: number;
  providerCurrency: string;
  salePriceCents: number | null;
  currency: "BRL";
  pricingConfigured: boolean;
};

export type SmsPoolCatalogQuote = {
  offer: Omit<SmsPoolCatalogOffer, "stock"> & { stock: number };
  stock: number;
  successRate?: number;
  providerPrice: number;
  providerCurrency: string;
  salePriceCents: number | null;
  pricingConfigured: boolean;
};

function numeric(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countryDto(country: SmsPoolCountry): SmsPoolCatalogCountry {
  return {
    id: String(country.ID),
    name: String(country.name),
    code: String(country.short_name ?? "").toUpperCase(),
  };
}

function resolveCountry(countries: SmsPoolCountry[], selector: string) {
  const normalized = selector.trim().toLowerCase();
  return countries.find((country) =>
    String(country.ID).toLowerCase() === normalized
    || String(country.short_name ?? "").toLowerCase() === normalized
    || String(country.name ?? "").toLowerCase() === normalized,
  );
}

function toOffer(row: SmsPoolPricing): SmsPoolCatalogOffer {
  const providerPrice = numeric(row.price);
  const baseOffer: Offer = {
    provider: "smspool",
    country: String(row.short_name || row.country),
    operator: String(row.pool),
    product: String(row.service),
    kind: "ONE_TIME_SMS",
    providerPrice,
    providerCurrency: env.smsPoolPriceCurrency,
    stock: 0,
  };

  let salePriceCents: number | null = null;
  try {
    salePriceCents = quoteOffer(baseOffer).salePriceCents;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message !== "PROVIDER_TO_BRL_RATE_NOT_CONFIGURED") throw cause;
  }

  return {
    id: `smspool:${row.country}:${row.service}:${row.pool}`,
    provider: "smspool",
    country: String(row.short_name || row.country).toUpperCase(),
    countryId: String(row.country),
    countryName: String(row.country_name),
    operator: String(row.pool),
    product: String(row.service),
    label: String(row.service_name),
    description: "Ativação SMS de uso único com disponibilidade consultada diretamente no provider.",
    kind: "ONE_TIME_SMS",
    stock: null,
    providerPrice,
    providerCurrency: env.smsPoolPriceCurrency,
    salePriceCents,
    currency: "BRL",
    pricingConfigured: salePriceCents !== null,
  };
}

function dedupeByServiceCheapest(rows: SmsPoolPricing[]) {
  const selected = new Map<string, SmsPoolPricing>();
  for (const row of rows) {
    const key = String(row.service);
    const existing = selected.get(key);
    if (!existing || numeric(row.price) < numeric(existing.price)) selected.set(key, row);
  }
  return [...selected.values()];
}

function dedupeByServiceAndPool(rows: SmsPoolPricing[]) {
  const selected = new Map<string, SmsPoolPricing>();
  for (const row of rows) {
    const key = `${String(row.service)}:${String(row.pool)}`;
    const existing = selected.get(key);
    if (!existing || numeric(row.price) < numeric(existing.price)) selected.set(key, row);
  }
  return [...selected.values()];
}

export async function listSmsPoolLiveCatalog(countrySelector = "BR") {
  const countries = await retrieveSmsPoolCountries();
  const selectedCountry = resolveCountry(countries, countrySelector)
    ?? resolveCountry(countries, "BR")
    ?? countries[0];

  if (!selectedCountry) throw new Error("SMSPOOL_COUNTRY_NOT_FOUND");

  const pricingRows = await retrieveSmsPoolPricing({ country: selectedCountry.ID });
  const offers = dedupeByServiceCheapest(pricingRows)
    .filter((row) => numeric(row.price) > 0)
    .filter((row) => isSmsPoolCatalogServiceVisible(String(row.service_name ?? "")))
    .map(toOffer)
    .sort((a, b) => {
      if (a.salePriceCents !== null && b.salePriceCents !== null && a.salePriceCents !== b.salePriceCents) {
        return a.salePriceCents - b.salePriceCents;
      }
      if (a.providerPrice !== b.providerPrice) return a.providerPrice - b.providerPrice;
      return a.label.localeCompare(b.label, "pt-BR");
    });

  return {
    countries: countries.map(countryDto).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    selectedCountry: countryDto(selectedCountry),
    offers,
    pricingConfigured: Boolean(env.providerToBrlRate && Number.isFinite(env.providerToBrlRate) && env.providerToBrlRate > 0),
    providerCurrency: env.smsPoolPriceCurrency,
    purchasesEnabled: env.purchasesEnabled,
    commercialApproved: env.smsPoolCommercialApproved,
  };
}

function parseOfferId(offerId: string) {
  const match = /^smspool:([^:]+):([^:]+):([^:]+)$/.exec(offerId);
  if (!match) throw new Error("SMSPOOL_OFFER_ID_INVALID");
  return { countryId: match[1], serviceId: match[2], pool: match[3] };
}

export async function quoteSmsPoolCatalogOffer(offerId: string): Promise<SmsPoolCatalogQuote> {
  const parsed = parseOfferId(offerId);
  const [price, stock, countries, services] = await Promise.all([
    retrieveSmsPoolPrice({ country: parsed.countryId, service: parsed.serviceId, pool: parsed.pool }),
    retrieveSmsPoolStock({ country: parsed.countryId, service: parsed.serviceId, pool: parsed.pool }),
    retrieveSmsPoolCountries(),
    retrieveSmsPoolServices(parsed.countryId),
  ]);

  const country = countries.find((item) => String(item.ID) === parsed.countryId);
  const service = services.find((item) => String(item.ID) === parsed.serviceId);
  if (!country || !service) throw new Error("SMSPOOL_OFFER_NOT_FOUND");
  assertSmsPoolCatalogServiceVisible(String(service.name));

  const providerPrice = numeric(price.price);
  const stockAmount = Math.max(0, Math.trunc(numeric(stock.amount)));
  const offerBase: Offer = {
    provider: "smspool",
    country: String(country.short_name || country.ID),
    operator: parsed.pool,
    product: parsed.serviceId,
    kind: "ONE_TIME_SMS",
    providerPrice,
    providerCurrency: env.smsPoolPriceCurrency,
    stock: stockAmount,
    successRate: price.success_rate,
  };

  let salePriceCents: number | null = null;
  try {
    salePriceCents = quoteOffer(offerBase).salePriceCents;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message !== "PROVIDER_TO_BRL_RATE_NOT_CONFIGURED") throw cause;
  }

  return {
    offer: {
      id: offerId,
      provider: "smspool",
      country: String(country.short_name || country.ID).toUpperCase(),
      countryId: String(country.ID),
      countryName: String(country.name),
      operator: parsed.pool,
      product: parsed.serviceId,
      label: String(service.name),
      description: "Ativação SMS de uso único com disponibilidade consultada diretamente no provider.",
      kind: "ONE_TIME_SMS",
      stock: stockAmount,
      successRate: price.success_rate,
      providerPrice,
      providerCurrency: env.smsPoolPriceCurrency,
      salePriceCents,
      currency: "BRL",
      pricingConfigured: salePriceCents !== null,
    },
    stock: stockAmount,
    successRate: price.success_rate,
    providerPrice,
    providerCurrency: env.smsPoolPriceCurrency,
    salePriceCents,
    pricingConfigured: salePriceCents !== null,
  };
}

export async function quoteBestSmsPoolServicePool(input: {
  countrySelector?: string;
  serviceLabel: string;
}): Promise<SmsPoolCatalogQuote> {
  const countries = await retrieveSmsPoolCountries();
  const selectedCountry = resolveCountry(countries, input.countrySelector ?? "BR")
    ?? resolveCountry(countries, "BR")
    ?? countries[0];
  if (!selectedCountry) throw new Error("SMSPOOL_COUNTRY_NOT_FOUND");

  const expected = input.serviceLabel.trim().toLowerCase();
  const pricingRows = await retrieveSmsPoolPricing({ country: selectedCountry.ID });
  const matchingRows = dedupeByServiceAndPool(pricingRows)
    .filter((row) => numeric(row.price) > 0)
    .filter((row) => isSmsPoolCatalogServiceVisible(String(row.service_name ?? "")))
    .filter((row) => {
      const label = String(row.service_name ?? "").trim().toLowerCase();
      return label === expected || label.includes(expected);
    });

  if (!matchingRows.length) throw new Error("SMSPOOL_SERVICE_OFFER_NOT_FOUND");

  const quoted = await Promise.all(matchingRows.map(async (row) => {
    try {
      return await quoteSmsPoolCatalogOffer(`smspool:${row.country}:${row.service}:${row.pool}`);
    } catch {
      return null;
    }
  }));

  const available = quoted.filter((quote): quote is SmsPoolCatalogQuote => Boolean(quote && quote.stock > 0));
  if (!available.length) throw new Error("SMSPOOL_SERVICE_NO_STOCK");

  available.sort((a, b) => {
    const aRate = Number.isFinite(Number(a.successRate)) ? Number(a.successRate) : -1;
    const bRate = Number.isFinite(Number(b.successRate)) ? Number(b.successRate) : -1;
    if (aRate !== bRate) return bRate - aRate;
    if (a.providerPrice !== b.providerPrice) return a.providerPrice - b.providerPrice;
    return String(a.offer.operator).localeCompare(String(b.offer.operator), "en");
  });

  return available[0];
}
