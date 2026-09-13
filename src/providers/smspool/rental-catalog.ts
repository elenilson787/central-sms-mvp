import { env } from "@/src/config/env";
import { quoteOffer } from "@/src/pricing/quote";
import type { Offer } from "@/src/providers/types";
import {
  retrieveSmsPoolRentalIds,
  retrieveSmsPoolRentalPricing,
  retrieveSmsPoolRentalServices,
  retrieveSmsPoolRentalStock,
  type SmsPoolRentalEntry,
  type SmsPoolRentalService,
} from "@/src/providers/smspool/client";
import { normalizeRentalEntries, rentalPricingMap } from "@/src/providers/smspool/rental-normalize";

export type SmsPoolRentalType = {
  id: string;
  name: string;
  region: string | null;
  periods: number[];
};

export type SmsPoolRentalPlan = {
  days: number;
  salePriceCents: number | null;
  currency: "BRL";
  pricingConfigured: boolean;
};

export type SmsPoolRentalServiceDto = {
  id: string;
  name: string;
};

export type SmsPoolRentalDetails = {
  rental: SmsPoolRentalType;
  plans: SmsPoolRentalPlan[];
  services: SmsPoolRentalServiceDto[];
};

export type SmsPoolRentalQuote = {
  rental: SmsPoolRentalType;
  service: SmsPoolRentalServiceDto | null;
  days: number;
  stock: number;
  salePriceCents: number | null;
  pricingConfigured: boolean;
};

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rentalName(entry: SmsPoolRentalEntry, fallback: string) {
  return String(entry.name ?? entry.country_name ?? entry.country ?? fallback);
}

function rentalRegion(entry: SmsPoolRentalEntry) {
  const value = entry.region;
  return value === undefined || value === null || value === "" ? null : String(value);
}

function periodsFromPricing(pricing: Record<string, string | number>) {
  return Object.keys(pricing)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
}

async function normalizedRentals() {
  const payload = await retrieveSmsPoolRentalIds(1);
  return normalizeRentalEntries(payload).map(({ key, entry }) => {
    const pricing = rentalPricingMap({ pricing: entry.pricing as Record<string, string | number> | undefined });
    return {
      id: String(entry.ID ?? entry.id ?? key),
      name: rentalName(entry, `Opção ${key}`),
      region: rentalRegion(entry),
      periods: periodsFromPricing(pricing),
      embeddedPricing: pricing,
    };
  });
}

function salePrice(providerPrice: number, rentalId: string, days: number) {
  const offer: Offer = {
    provider: "smspool",
    country: rentalId,
    operator: "rental",
    product: `rental:${rentalId}:${days}`,
    kind: "TEMPORARY_HOSTING",
    providerPrice,
    providerCurrency: env.smsPoolPriceCurrency,
    stock: 0,
  };

  try {
    return quoteOffer(offer).salePriceCents;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (message === "PROVIDER_TO_BRL_RATE_NOT_CONFIGURED") return null;
    throw cause;
  }
}

function serviceDto(service: SmsPoolRentalService): SmsPoolRentalServiceDto {
  return { id: String(service.ID), name: String(service.name) };
}

export async function listSmsPoolRentalTypes(): Promise<SmsPoolRentalType[]> {
  const rentals = await normalizedRentals();
  return rentals
    .map(({ id, name, region, periods }) => ({ id, name, region, periods }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getSmsPoolRentalDetails(rentalId: string): Promise<SmsPoolRentalDetails> {
  const rentals = await normalizedRentals();
  const selected = rentals.find((item) => item.id === rentalId);
  if (!selected) throw new Error("SMSPOOL_RENTAL_NOT_FOUND");

  const [pricingResponse, services] = await Promise.all([
    retrieveSmsPoolRentalPricing(rentalId),
    retrieveSmsPoolRentalServices(rentalId),
  ]);

  const livePricing = rentalPricingMap(pricingResponse);
  const pricing = Object.keys(livePricing).length ? livePricing : selected.embeddedPricing;

  const plans = Object.entries(pricing)
    .map(([daysValue, priceValue]) => {
      const days = Number(daysValue);
      const providerPrice = numeric(priceValue);
      if (!Number.isInteger(days) || days <= 0 || providerPrice <= 0) return null;
      const finalPrice = salePrice(providerPrice, rentalId, days);
      return {
        days,
        salePriceCents: finalPrice,
        currency: "BRL" as const,
        pricingConfigured: finalPrice !== null,
      };
    })
    .filter((item): item is SmsPoolRentalPlan => Boolean(item))
    .sort((a, b) => a.days - b.days);

  return {
    rental: {
      id: selected.id,
      name: selected.name,
      region: selected.region,
      periods: plans.map((plan) => plan.days),
    },
    plans,
    services: services.map(serviceDto).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

export async function quoteSmsPoolRental(input: {
  rentalId: string;
  days: number;
  serviceId?: string;
}): Promise<SmsPoolRentalQuote> {
  const details = await getSmsPoolRentalDetails(input.rentalId);
  const plan = details.plans.find((item) => item.days === input.days);
  if (!plan) throw new Error("SMSPOOL_RENTAL_PERIOD_NOT_FOUND");

  const service = input.serviceId
    ? details.services.find((item) => item.id === input.serviceId) ?? null
    : null;
  if (input.serviceId && !service) throw new Error("SMSPOOL_RENTAL_SERVICE_NOT_FOUND");

  const stock = await retrieveSmsPoolRentalStock(input.rentalId, input.days);
  return {
    rental: details.rental,
    service,
    days: input.days,
    stock: Math.max(0, Math.trunc(numeric(stock.count))),
    salePriceCents: plan.salePriceCents,
    pricingConfigured: plan.pricingConfigured,
  };
}
