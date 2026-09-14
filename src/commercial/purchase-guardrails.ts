import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { retrieveSmsPoolBalance } from "@/src/providers/smspool/client";
import { consumeRateLimit } from "@/src/security/rate-limit";

const PENDING_STATUSES = ["creating", "number_received", "waiting_sms"];
const CIRCUIT_SUCCESS_STATUSES = ["sms_received", "completed"];
const CIRCUIT_FAILURE_STATUSES = ["failed", "refunded"];
const CIRCUIT_TERMINAL_STATUSES = [...CIRCUIT_SUCCESS_STATUSES, ...CIRCUIT_FAILURE_STATUSES];

function finiteNonNegative(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function positiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function providerCostBrlCents(providerPrice: number, providerCurrency: string) {
  const price = finiteNonNegative(Number(providerPrice));
  if (providerCurrency.toUpperCase() === "BRL") return Math.round(price * 100);
  if (!env.providerToBrlRate || !Number.isFinite(env.providerToBrlRate) || env.providerToBrlRate <= 0) {
    throw new Error("PROVIDER_TO_BRL_RATE_NOT_CONFIGURED");
  }
  return Math.round(price * env.providerToBrlRate * 100);
}

function providerCostUsd(providerPrice: number, providerCurrency: string) {
  const price = finiteNonNegative(Number(providerPrice));
  const currency = String(providerCurrency || "USD").toUpperCase();
  if (currency === "USD") return price;
  throw new Error("BETA_GLOBAL_PROVIDER_SPEND_CURRENCY_UNSUPPORTED");
}

export function assertPurchaseMarginGuardrails(input: {
  salePriceCents: number;
  providerPrice: number;
  providerCurrency: string;
}) {
  const salePriceCents = Math.trunc(Number(input.salePriceCents));
  if (!Number.isFinite(salePriceCents) || salePriceCents < 0) throw new Error("SALE_PRICE_INVALID");

  const configuredMinimumSale = Math.round(finiteNonNegative(env.minimumSalePriceBrlCents, 99));
  if (salePriceCents < configuredMinimumSale) throw new Error("SALE_PRICE_BELOW_MINIMUM");

  const costCents = providerCostBrlCents(input.providerPrice, input.providerCurrency);
  const grossProfitCents = salePriceCents - costCents;
  const grossMarginPercent = salePriceCents > 0 ? (grossProfitCents / salePriceCents) * 100 : -Infinity;
  const minimumGrossMarginPercent = finiteNonNegative(env.minimumGrossMarginPercent, 20);
  const minimumGrossMarginCents = Math.round(finiteNonNegative(env.minimumGrossMarginBrlCents, 30));

  if (grossProfitCents < minimumGrossMarginCents || grossMarginPercent < minimumGrossMarginPercent) {
    throw new Error("MINIMUM_MARGIN_NOT_MET");
  }

  return { costCents, grossProfitCents, grossMarginPercent };
}

export async function assertSmsPoolBalanceReserve(providerPrice: number) {
  const reserve = finiteNonNegative(env.smsPoolMinBalance, 1);
  const balancePayload = await retrieveSmsPoolBalance();
  const balance = Number(balancePayload.balance);
  const cost = finiteNonNegative(Number(providerPrice));
  if (!Number.isFinite(balance)) throw new Error("SMSPOOL_BALANCE_INVALID");
  if (balance - cost < reserve) throw new Error("SMSPOOL_BALANCE_RESERVE_REQUIRED");
  return { balance, reserve, balanceAfterPurchase: balance - cost };
}

export async function assertPublicBetaUserGuardrails(input: {
  userId: string;
  product: string;
  salePriceCents: number;
}) {
  if (!env.betaMode) return;

  const hourlyAllowed = await consumeRateLimit({
    scope: "public-beta-purchases-hour",
    key: input.userId,
    limit: positiveInteger(env.betaMaxPurchasesPerHour, 3),
    windowSeconds: 60 * 60,
  });
  if (!hourlyAllowed) throw new Error("BETA_PURCHASE_HOURLY_LIMIT");

  const dailyAllowed = await consumeRateLimit({
    scope: "public-beta-purchases-day",
    key: input.userId,
    limit: positiveInteger(env.betaMaxPurchasesPerDay, 8),
    windowSeconds: 24 * 60 * 60,
  });
  if (!dailyAllowed) throw new Error("BETA_PURCHASE_DAILY_LIMIT");

  const supabase = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pendingResult, pendingServiceResult, dailyRowsResult] = await Promise.all([
    supabase
      .from("activations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .in("status", PENDING_STATUSES),
    supabase
      .from("activations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .eq("product", input.product)
      .in("status", PENDING_STATUSES),
    supabase
      .from("activations")
      .select("sale_price_cents,status")
      .eq("user_id", input.userId)
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .gte("created_at", since24h),
  ]);

  if (pendingResult.error) throw pendingResult.error;
  if (pendingServiceResult.error) throw pendingServiceResult.error;
  if (dailyRowsResult.error) throw dailyRowsResult.error;

  const pendingLimit = positiveInteger(env.betaMaxPendingActivations, 2);
  if ((pendingResult.count ?? 0) >= pendingLimit) throw new Error("BETA_PENDING_ACTIVATIONS_LIMIT");

  const pendingPerServiceLimit = positiveInteger(env.betaMaxPendingPerService, 1);
  if ((pendingServiceResult.count ?? 0) >= pendingPerServiceLimit) {
    throw new Error("BETA_PENDING_SERVICE_LIMIT");
  }

  const spentLast24hCents = (dailyRowsResult.data ?? []).reduce((sum, row) => {
    if (String(row.status) === "refunded") return sum;
    const cents = Number(row.sale_price_cents);
    return sum + (Number.isFinite(cents) ? Math.max(0, Math.trunc(cents)) : 0);
  }, 0);
  const spendLimit = Math.round(finiteNonNegative(env.betaMaxDailySpendBrlCents, 3000));
  if (spentLast24hCents + input.salePriceCents > spendLimit) {
    throw new Error("BETA_DAILY_SPEND_LIMIT");
  }

  return {
    pending: pendingResult.count ?? 0,
    pendingSameService: pendingServiceResult.count ?? 0,
    spentLast24hCents,
    spendLimit,
  };
}

export type PublicBetaGlobalGuardrailSnapshot = {
  purchasesLastHour: number;
  purchasesLast24h: number;
  salesLast24hCents: number;
  providerSpendLast24hUsd: number;
  maxPurchasesPerHour: number;
  maxPurchasesPerDay: number;
  maxSalesLast24hCents: number;
  maxProviderSpendLast24hUsd: number;
  circuitBreakerOpen: boolean;
  circuitBreakerConsecutiveFailures: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerWindowMinutes: number;
  circuitBreakerResetAt: string | null;
};

export async function getPublicBetaGlobalGuardrailSnapshot(): Promise<PublicBetaGlobalGuardrailSnapshot> {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const sinceHour = new Date(now - 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const breakerThreshold = positiveInteger(env.betaCircuitBreakerFailures, 5);
  const breakerWindowMinutes = positiveInteger(env.betaCircuitBreakerWindowMinutes, 30);
  const breakerSince = new Date(now - breakerWindowMinutes * 60 * 1000).toISOString();

  const [hourResult, dayResult, dailyRowsResult, recentTerminalResult] = await Promise.all([
    supabase
      .from("activations")
      .select("id", { count: "exact", head: true })
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .gte("created_at", sinceHour),
    supabase
      .from("activations")
      .select("id", { count: "exact", head: true })
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .gte("created_at", since24h),
    supabase
      .from("activations")
      .select("sale_price_cents,provider_cost,provider_currency,status")
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .gte("created_at", since24h),
    supabase
      .from("activations")
      .select("status,updated_at")
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .in("status", CIRCUIT_TERMINAL_STATUSES)
      .gte("updated_at", breakerSince)
      .order("updated_at", { ascending: false })
      .limit(breakerThreshold),
  ]);

  if (hourResult.error) throw hourResult.error;
  if (dayResult.error) throw dayResult.error;
  if (dailyRowsResult.error) throw dailyRowsResult.error;
  if (recentTerminalResult.error) throw recentTerminalResult.error;

  let salesLast24hCents = 0;
  let providerSpendLast24hUsd = 0;
  for (const row of dailyRowsResult.data ?? []) {
    if (String(row.status) === "refunded") continue;

    const saleCents = Number(row.sale_price_cents);
    if (Number.isFinite(saleCents)) salesLast24hCents += Math.max(0, Math.trunc(saleCents));

    const providerCost = Number(row.provider_cost);
    if (Number.isFinite(providerCost) && providerCost > 0) {
      providerSpendLast24hUsd += providerCostUsd(providerCost, String(row.provider_currency ?? "USD"));
    }
  }

  let consecutiveFailures = 0;
  let oldestFailureUpdatedAt: string | null = null;
  for (const row of recentTerminalResult.data ?? []) {
    const status = String(row.status);
    if (CIRCUIT_FAILURE_STATUSES.includes(status)) {
      consecutiveFailures += 1;
      oldestFailureUpdatedAt = String(row.updated_at ?? "") || oldestFailureUpdatedAt;
      continue;
    }
    if (CIRCUIT_SUCCESS_STATUSES.includes(status)) break;
  }

  const circuitBreakerOpen = consecutiveFailures >= breakerThreshold;
  const resetAtMillis = circuitBreakerOpen && oldestFailureUpdatedAt
    ? Date.parse(oldestFailureUpdatedAt) + breakerWindowMinutes * 60 * 1000
    : NaN;

  return {
    purchasesLastHour: hourResult.count ?? 0,
    purchasesLast24h: dayResult.count ?? 0,
    salesLast24hCents,
    providerSpendLast24hUsd: Math.round(providerSpendLast24hUsd * 10000) / 10000,
    maxPurchasesPerHour: positiveInteger(env.betaGlobalMaxPurchasesPerHour, 10),
    maxPurchasesPerDay: positiveInteger(env.betaGlobalMaxPurchasesPerDay, 30),
    maxSalesLast24hCents: Math.round(finiteNonNegative(env.betaGlobalMaxSalesBrlCentsPerDay, 10000)),
    maxProviderSpendLast24hUsd: finiteNonNegative(env.betaGlobalMaxProviderSpendUsdPerDay, 5),
    circuitBreakerOpen,
    circuitBreakerConsecutiveFailures: consecutiveFailures,
    circuitBreakerFailureThreshold: breakerThreshold,
    circuitBreakerWindowMinutes: breakerWindowMinutes,
    circuitBreakerResetAt: Number.isFinite(resetAtMillis) ? new Date(resetAtMillis).toISOString() : null,
  };
}

export async function assertPublicBetaGlobalGuardrails(input: {
  salePriceCents: number;
  providerPrice: number;
  providerCurrency: string;
}) {
  if (!env.betaMode) return;

  const salePriceCents = Math.max(0, Math.trunc(Number(input.salePriceCents)));
  const prospectiveProviderSpendUsd = providerCostUsd(input.providerPrice, input.providerCurrency);
  const snapshot = await getPublicBetaGlobalGuardrailSnapshot();

  if (snapshot.circuitBreakerOpen) throw new Error("BETA_CIRCUIT_BREAKER_OPEN");
  if (snapshot.purchasesLastHour >= snapshot.maxPurchasesPerHour) {
    throw new Error("BETA_GLOBAL_PURCHASE_HOURLY_LIMIT");
  }
  if (snapshot.purchasesLast24h >= snapshot.maxPurchasesPerDay) {
    throw new Error("BETA_GLOBAL_PURCHASE_DAILY_LIMIT");
  }
  if (snapshot.salesLast24hCents + salePriceCents > snapshot.maxSalesLast24hCents) {
    throw new Error("BETA_GLOBAL_SALES_LIMIT");
  }
  if (snapshot.providerSpendLast24hUsd + prospectiveProviderSpendUsd > snapshot.maxProviderSpendLast24hUsd) {
    throw new Error("BETA_GLOBAL_PROVIDER_SPEND_LIMIT");
  }

  // These global buckets close the small concurrency window left by the read-only
  // aggregate checks above. They count execution attempts conservatively, which is
  // preferable to overspending during the public beta.
  const globalHourlyAllowed = await consumeRateLimit({
    scope: "public-beta-global-purchases-hour",
    key: "all-users",
    limit: snapshot.maxPurchasesPerHour,
    windowSeconds: 60 * 60,
  });
  if (!globalHourlyAllowed) throw new Error("BETA_GLOBAL_PURCHASE_HOURLY_LIMIT");

  const globalDailyAllowed = await consumeRateLimit({
    scope: "public-beta-global-purchases-day",
    key: "all-users",
    limit: snapshot.maxPurchasesPerDay,
    windowSeconds: 24 * 60 * 60,
  });
  if (!globalDailyAllowed) throw new Error("BETA_GLOBAL_PURCHASE_DAILY_LIMIT");

  return {
    ...snapshot,
    projectedSalesLast24hCents: snapshot.salesLast24hCents + salePriceCents,
    projectedProviderSpendLast24hUsd: snapshot.providerSpendLast24hUsd + prospectiveProviderSpendUsd,
  };
}
