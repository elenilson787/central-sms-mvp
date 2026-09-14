import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { retrieveSmsPoolBalance } from "@/src/providers/smspool/client";
import { consumeRateLimit } from "@/src/security/rate-limit";

const PENDING_STATUSES = ["creating", "number_received", "waiting_sms"];

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
