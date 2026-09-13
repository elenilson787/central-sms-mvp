import type { SmsPoolRentalEntry, SmsPoolRentalList, SmsPoolRentalPricing } from "@/src/providers/smspool/client";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeRentalEntry(value: unknown): value is SmsPoolRentalEntry {
  if (!isObject(value)) return false;
  return ["ID", "id", "name", "country", "country_name", "short_name", "pricing"]
    .some((key) => key in value);
}

export function normalizeRentalEntries(payload: SmsPoolRentalList | unknown): Array<{ key: string; entry: SmsPoolRentalEntry }> {
  if (Array.isArray(payload)) {
    return payload
      .filter(looksLikeRentalEntry)
      .map((entry, index) => ({ key: String(entry.ID ?? entry.id ?? index), entry }));
  }

  if (!isObject(payload)) return [];

  for (const container of ["data", "rentals", "result", "results"]) {
    if (container in payload) {
      const nested = normalizeRentalEntries(payload[container]);
      if (nested.length) return nested;
    }
  }

  return Object.entries(payload)
    .filter(([, value]) => looksLikeRentalEntry(value))
    .map(([key, entry]) => ({ key, entry }));
}

function normalizePriceMap(value: unknown): Record<string, string | number> {
  if (!value) return {};
  if (isObject(value)) {
    const output: Record<string, string | number> = {};
    for (const [key, raw] of Object.entries(value)) {
      if ((typeof raw === "string" || typeof raw === "number") && /^\d+$/.test(key)) output[key] = raw;
    }
    return output;
  }
  if (typeof value === "string") {
    try {
      return normalizePriceMap(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return {};
}

export function rentalPricingMap(payload: SmsPoolRentalPricing | unknown): Record<string, string | number> {
  if (!payload) return {};

  if (isObject(payload)) {
    const direct = normalizePriceMap(payload.pricing);
    if (Object.keys(direct).length) return direct;

    for (const container of ["data", "result"]) {
      if (container in payload) {
        const nested = rentalPricingMap(payload[container]);
        if (Object.keys(nested).length) return nested;
      }
    }

    const map = normalizePriceMap(payload);
    if (Object.keys(map).length) return map;
  }

  return {};
}
