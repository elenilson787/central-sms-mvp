import { quoteSmsPoolCatalogOffer, type SmsPoolCatalogQuote } from "@/src/providers/smspool/catalog";
import { retrieveSmsPoolPricing, type SmsPoolPricing } from "@/src/providers/smspool/client";

function numeric(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOfferId(offerId: string) {
  const match = /^smspool:([^:]+):([^:]+):([^:]+)$/.exec(offerId);
  if (!match) throw new Error("SMSPOOL_OFFER_ID_INVALID");
  return { countryId: match[1], serviceId: match[2] };
}

function dedupePools(rows: SmsPoolPricing[]) {
  const selected = new Map<string, SmsPoolPricing>();
  for (const row of rows) {
    const pool = String(row.pool);
    const existing = selected.get(pool);
    if (!existing || numeric(row.price) < numeric(existing.price)) selected.set(pool, row);
  }
  return [...selected.values()];
}

export async function quoteBestSmsPoolPoolForOffer(offerId: string): Promise<SmsPoolCatalogQuote> {
  const parsed = parseOfferId(offerId);
  const pricingRows = await retrieveSmsPoolPricing({
    country: parsed.countryId,
    service: parsed.serviceId,
  });

  const rows = dedupePools(pricingRows)
    .filter((row) => String(row.country) === parsed.countryId)
    .filter((row) => String(row.service) === parsed.serviceId)
    .filter((row) => numeric(row.price) > 0);

  if (!rows.length) throw new Error("SMSPOOL_SERVICE_OFFER_NOT_FOUND");

  const quotes = await Promise.all(rows.map(async (row) => {
    try {
      return await quoteSmsPoolCatalogOffer(`smspool:${row.country}:${row.service}:${row.pool}`);
    } catch {
      return null;
    }
  }));

  const available = quotes.filter((quote): quote is SmsPoolCatalogQuote => Boolean(quote && quote.stock > 0));
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
