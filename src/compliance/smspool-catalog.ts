import { env } from "@/src/config/env";

export type SmsPoolCatalogBlockReason =
  | "financial"
  | "crypto"
  | "government"
  | "identity_verification"
  | "telecom_carrier"
  | "fraud_abuse"
  | "provider_whitelist_required"
  | "unlisted_requires_manual_review";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsTerm(normalized: string, term: string) {
  const haystack = ` ${normalized} `;
  const needle = ` ${normalize(term)} `;
  return haystack.includes(needle);
}

function containsAny(normalized: string, terms: readonly string[]) {
  return terms.some((term) => containsTerm(normalized, term));
}

const FINANCIAL_TERMS = [
  "bank",
  "banking",
  "banco",
  "fintech",
  "payment",
  "payments",
  "paypal",
  "cash app",
  "cashapp",
  "venmo",
  "stripe",
  "wise",
  "revolut",
  "payoneer",
  "skrill",
  "western union",
  "moneygram",
  "mercado pago",
  "mercadopago",
  "picpay",
  "nubank",
] as const;

const CRYPTO_TERMS = [
  "crypto",
  "cryptocurrency",
  "bitcoin",
  "blockchain",
  "binance",
  "coinbase",
  "kraken",
  "bybit",
  "kucoin",
  "okx",
  "bitget",
  "metamask",
] as const;

const GOVERNMENT_TERMS = [
  "government",
  "gov br",
  "govbr",
  "receita federal",
  "detran",
  "social security",
  "irs",
  "tax authority",
  "passport",
  "immigration",
] as const;

const IDENTITY_TERMS = [
  "kyc",
  "identity verification",
  "verify identity",
  "id verification",
  "identity check",
] as const;

const TELECOM_TERMS = [
  "telecom",
  "carrier",
  "mobile carrier",
  "verizon",
  "t mobile",
  "tmobile",
  "vodafone",
  "at t",
  "att",
  "claro",
  "vivo",
  "tim brasil",
  "telefonica",
] as const;

const FRAUD_ABUSE_TERMS = [
  "fraud",
  "carding",
  "spam",
  "number farming",
] as const;

const UNLISTED_LABELS = new Set([
  "not listed",
  "not listed other",
  "other",
  "any",
]);

export function getSmsPoolCatalogBlockReason(serviceName: string): SmsPoolCatalogBlockReason | null {
  const normalized = normalize(serviceName);
  if (!normalized) return "unlisted_requires_manual_review";

  if (UNLISTED_LABELS.has(normalized)) return "unlisted_requires_manual_review";
  if (!env.smsPoolWhatsAppWhitelistApproved && (normalized === "whatsapp" || normalized === "whats app")) {
    return "provider_whitelist_required";
  }
  if (containsAny(normalized, FINANCIAL_TERMS)) return "financial";
  if (containsAny(normalized, CRYPTO_TERMS)) return "crypto";
  if (containsAny(normalized, GOVERNMENT_TERMS)) return "government";
  if (containsAny(normalized, IDENTITY_TERMS)) return "identity_verification";
  if (containsAny(normalized, TELECOM_TERMS)) return "telecom_carrier";
  if (containsAny(normalized, FRAUD_ABUSE_TERMS)) return "fraud_abuse";

  return null;
}

export function isSmsPoolCatalogServiceVisible(serviceName: string) {
  return getSmsPoolCatalogBlockReason(serviceName) === null;
}

export function assertSmsPoolCatalogServiceVisible(serviceName: string) {
  const reason = getSmsPoolCatalogBlockReason(serviceName);
  if (reason) throw new Error(`SERVICE_BLOCKED_BY_COMPLIANCE_POLICY:${reason}`);
}
