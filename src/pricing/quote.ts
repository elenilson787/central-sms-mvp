import { env } from "@/src/config/env";
import type { Offer } from "@/src/providers/types";

export type OfferQuote = {
  providerCostBrlCents: number;
  markupPercent: number;
  markupFixedBrlCents: number;
  minimumSalePriceBrlCents: number;
  markupCents: number;
  salePriceCents: number;
  currency: "BRL";
};

function finiteNonNegative(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function toBrlCents(offer: Offer) {
  if (offer.providerCurrency === "BRL") return Math.round(offer.providerPrice * 100);
  if (!env.providerToBrlRate || !Number.isFinite(env.providerToBrlRate) || env.providerToBrlRate <= 0) {
    throw new Error("PROVIDER_TO_BRL_RATE_NOT_CONFIGURED");
  }
  return Math.round(offer.providerPrice * env.providerToBrlRate * 100);
}

function buildQuote(input: {
  providerCostBrlCents: number;
  markupPercent: number;
  markupFixedBrlCents: number;
  minimumSalePriceBrlCents?: number;
}): OfferQuote {
  const providerCostBrlCents = Math.max(0, Math.round(input.providerCostBrlCents));
  const markupPercent = finiteNonNegative(input.markupPercent);
  const markupFixedBrlCents = Math.round(finiteNonNegative(input.markupFixedBrlCents));
  const minimumSalePriceBrlCents = Math.round(finiteNonNegative(input.minimumSalePriceBrlCents ?? 0));
  const percentageMarkup = Math.ceil(providerCostBrlCents * (markupPercent / 100));
  const calculatedSalePriceCents = providerCostBrlCents + percentageMarkup + markupFixedBrlCents;
  const salePriceCents = Math.max(calculatedSalePriceCents, minimumSalePriceBrlCents);

  return {
    providerCostBrlCents,
    markupPercent,
    markupFixedBrlCents,
    minimumSalePriceBrlCents,
    markupCents: salePriceCents - providerCostBrlCents,
    salePriceCents,
    currency: "BRL",
  };
}

export function quoteOffer(offer: Offer): OfferQuote {
  return buildQuote({
    providerCostBrlCents: toBrlCents(offer),
    markupPercent: env.markupPercent,
    markupFixedBrlCents: env.markupFixedBrlCents,
    minimumSalePriceBrlCents: env.minimumSalePriceBrlCents,
  });
}

export function quoteRentalOffer(offer: Offer): OfferQuote {
  const providerCostBrlCents = toBrlCents(offer);
  const lowMax = Math.round(finiteNonNegative(env.rentalLowCostMaxBrlCents, 500));
  const midMax = Math.max(lowMax, Math.round(finiteNonNegative(env.rentalMidCostMaxBrlCents, 3000)));

  if (providerCostBrlCents <= lowMax) {
    return buildQuote({
      providerCostBrlCents,
      markupPercent: env.rentalLowMarkupPercent,
      markupFixedBrlCents: env.rentalLowMarkupFixedBrlCents,
    });
  }

  if (providerCostBrlCents <= midMax) {
    return buildQuote({
      providerCostBrlCents,
      markupPercent: env.rentalMidMarkupPercent,
      markupFixedBrlCents: env.rentalMidMarkupFixedBrlCents,
    });
  }

  return buildQuote({
    providerCostBrlCents,
    markupPercent: env.rentalHighMarkupPercent,
    markupFixedBrlCents: env.rentalHighMarkupFixedBrlCents,
  });
}
