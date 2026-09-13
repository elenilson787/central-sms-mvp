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

function toBrlCents(offer: Offer) {
  if (offer.providerCurrency === "BRL") return Math.round(offer.providerPrice * 100);
  if (!env.providerToBrlRate || !Number.isFinite(env.providerToBrlRate) || env.providerToBrlRate <= 0) {
    throw new Error("PROVIDER_TO_BRL_RATE_NOT_CONFIGURED");
  }
  return Math.round(offer.providerPrice * env.providerToBrlRate * 100);
}

export function quoteOffer(offer: Offer): OfferQuote {
  const providerCostBrlCents = toBrlCents(offer);
  const markupPercent = Number.isFinite(env.markupPercent) ? Math.max(0, env.markupPercent) : 0;
  const markupFixedBrlCents = Number.isFinite(env.markupFixedBrlCents) ? Math.max(0, env.markupFixedBrlCents) : 0;
  const minimumSalePriceBrlCents = Number.isFinite(env.minimumSalePriceBrlCents)
    ? Math.max(0, Math.round(env.minimumSalePriceBrlCents))
    : 0;
  const percentageMarkup = Math.ceil(providerCostBrlCents * (markupPercent / 100));
  const calculatedSalePriceCents = providerCostBrlCents + percentageMarkup + markupFixedBrlCents;
  const salePriceCents = Math.max(calculatedSalePriceCents, minimumSalePriceBrlCents);
  const markupCents = salePriceCents - providerCostBrlCents;

  return {
    providerCostBrlCents,
    markupPercent,
    markupFixedBrlCents,
    minimumSalePriceBrlCents,
    markupCents,
    salePriceCents,
    currency: "BRL",
  };
}
