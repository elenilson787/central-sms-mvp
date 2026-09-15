import { getPublicBetaGlobalGuardrailSnapshot } from "@/src/commercial/purchase-guardrails";
import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";

type PurchaseFailureContext = {
  code: string;
  userId?: string | null;
  salePriceCents?: number | null;
  providerPrice?: number | null;
  providerCurrency?: string | null;
};

type FriendlyPurchaseFailure = {
  code: string;
  message: string;
  retryAt: string | null;
  retryAfterSeconds: number | null;
};

type RollingRow = {
  created_at?: string | null;
  sale_price_cents?: number | string | null;
  provider_cost?: number | string | null;
  provider_currency?: string | null;
  status?: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function nonNegative(value: number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function isoAfter(timestamp: string | null | undefined, windowMs: number) {
  const parsed = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed + windowMs).toISOString() : null;
}

function retryAfterSeconds(retryAt: string | null) {
  if (!retryAt) return null;
  const millis = Date.parse(retryAt) - Date.now();
  if (!Number.isFinite(millis)) return null;
  return Math.max(0, Math.ceil(millis / 1000));
}

function relativeWait(retryAt: string | null) {
  const seconds = retryAfterSeconds(retryAt);
  if (seconds === null) return null;
  if (seconds <= 60) return "cerca de 1 minuto";

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `cerca de ${minutes} minutos`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0
      ? `cerca de ${hours}h ${remainingMinutes}min`
      : `cerca de ${hours} hora${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? `cerca de ${days} dia${days === 1 ? "" : "s"} e ${remainingHours}h`
    : `cerca de ${days} dia${days === 1 ? "" : "s"}`;
}

async function oldestPurchaseRetryAt(windowMs: number) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const result = await getSupabaseAdmin()
    .from("activations")
    .select("created_at")
    .eq("provider", "smspool")
    .eq("kind", "ONE_TIME_SMS")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);

  if (result.error) throw result.error;
  return isoAfter(result.data?.[0]?.created_at ?? null, windowMs);
}

function providerCostUsd(row: RollingRow) {
  const cost = nonNegative(Number(row.provider_cost));
  const currency = String(row.provider_currency ?? "USD").toUpperCase();
  if (currency !== "USD") return 0;
  return cost;
}

async function rollingBudgetRetryAt(input: {
  addedAmount: number;
  limit: number;
  metric: "sales" | "provider";
}) {
  const added = nonNegative(input.addedAmount);
  const limit = nonNegative(input.limit);

  // If a single new purchase already exceeds the configured ceiling, time alone
  // cannot make it eligible; an operator must raise the ceiling or the route cost must fall.
  if (added > limit) return null;

  const since = new Date(Date.now() - DAY_MS).toISOString();
  const result = await getSupabaseAdmin()
    .from("activations")
    .select("created_at,sale_price_cents,provider_cost,provider_currency,status")
    .eq("provider", "smspool")
    .eq("kind", "ONE_TIME_SMS")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;

  const events = (result.data ?? [])
    .filter((row) => String(row.status) !== "refunded")
    .map((row) => {
      const amount = input.metric === "sales"
        ? nonNegative(Number(row.sale_price_cents))
        : providerCostUsd(row as RollingRow);
      return {
        amount,
        createdAt: String(row.created_at ?? ""),
      };
    })
    .filter((row) => row.amount > 0 && Number.isFinite(Date.parse(row.createdAt)));

  let projected = events.reduce((sum, event) => sum + event.amount, 0) + added;
  if (projected <= limit) return null;

  for (const event of events) {
    projected -= event.amount;
    if (projected <= limit) return isoAfter(event.createdAt, DAY_MS);
  }

  return null;
}

function withRetry(base: string, retryAt: string | null) {
  const wait = relativeWait(retryAt);
  if (wait) return `${base} Tente novamente em ${wait}. Nenhum valor foi descontado da sua carteira.`;
  return `${base} Nenhum valor foi descontado da sua carteira. Tente novamente mais tarde.`;
}

export async function friendlyPurchaseFailure(input: PurchaseFailureContext): Promise<FriendlyPurchaseFailure> {
  const code = String(input.code || "PURCHASE_FAILED").trim();
  let retryAt: string | null = null;
  let message: string;

  try {
    if (code.includes("BETA_GLOBAL_PROVIDER_SPEND_LIMIT")) {
      retryAt = await rollingBudgetRetryAt({
        metric: "provider",
        addedAmount: nonNegative(input.providerPrice),
        limit: nonNegative(env.betaGlobalMaxProviderSpendUsdPerDay, 10),
      });
      message = withRetry(
        "As compras estão temporariamente pausadas porque a Central SMS atingiu o limite operacional de custo das últimas 24 horas.",
        retryAt,
      );
    } else if (code.includes("BETA_GLOBAL_SALES_LIMIT")) {
      retryAt = await rollingBudgetRetryAt({
        metric: "sales",
        addedAmount: nonNegative(input.salePriceCents),
        limit: nonNegative(env.betaGlobalMaxSalesBrlCentsPerDay, 20000),
      });
      message = withRetry(
        "As compras estão temporariamente pausadas porque o limite global de vendas das últimas 24 horas foi atingido.",
        retryAt,
      );
    } else if (code.includes("BETA_GLOBAL_PURCHASE_HOURLY_LIMIT")) {
      retryAt = await oldestPurchaseRetryAt(HOUR_MS);
      message = withRetry(
        "Muitas compras foram realizadas recentemente e o limite global por hora foi atingido.",
        retryAt ?? new Date(Date.now() + HOUR_MS).toISOString(),
      );
    } else if (code.includes("BETA_GLOBAL_PURCHASE_DAILY_LIMIT")) {
      retryAt = await oldestPurchaseRetryAt(DAY_MS);
      message = withRetry(
        "O limite global de compras das últimas 24 horas foi atingido.",
        retryAt ?? new Date(Date.now() + DAY_MS).toISOString(),
      );
    } else if (code.includes("BETA_CIRCUIT_BREAKER_OPEN")) {
      const snapshot = await getPublicBetaGlobalGuardrailSnapshot();
      retryAt = snapshot.circuitBreakerResetAt;
      message = withRetry(
        "As compras foram pausadas automaticamente por segurança após falhas recentes do fornecedor.",
        retryAt,
      );
    } else if (code.includes("BETA_PURCHASE_HOURLY_LIMIT")) {
      retryAt = new Date(Date.now() + HOUR_MS).toISOString();
      message = withRetry("Você atingiu seu limite de compras por hora.", retryAt);
    } else if (code.includes("BETA_PURCHASE_DAILY_LIMIT") || code.includes("BETA_DAILY_SPEND_LIMIT")) {
      retryAt = new Date(Date.now() + DAY_MS).toISOString();
      message = withRetry("Você atingiu seu limite de uso das últimas 24 horas.", retryAt);
    } else if (code.includes("BETA_PENDING_SERVICE_LIMIT")) {
      message = "Você já possui uma ativação pendente para este serviço. Aguarde ela receber o SMS, expirar ou ser reembolsada antes de comprar outra. Nenhum valor foi descontado.";
    } else if (code.includes("BETA_PENDING_ACTIVATIONS_LIMIT")) {
      message = "Você já possui o número máximo de ativações pendentes. Aguarde uma delas ser concluída, expirar ou ser reembolsada antes de comprar novamente. Nenhum valor foi descontado.";
    } else if (code.includes("INSUFFICIENT_BALANCE")) {
      message = "Seu saldo é insuficiente para esta compra. Recarregue a carteira e tente novamente.";
    } else if (code.includes("SMSPOOL_BALANCE_RESERVE_REQUIRED")) {
      message = "Este serviço está temporariamente indisponível por limite operacional do fornecedor. Nenhum valor foi descontado. Tente novamente mais tarde.";
    } else if (code.includes("PURCHASES_DISABLED")) {
      message = "As compras estão temporariamente pausadas pela Central SMS. Nenhum valor foi descontado. Tente novamente mais tarde.";
    } else if (code.includes("SERVICE_NOT_APPROVED_FOR_SALE") || code.includes("SERVICE_BLOCKED_BY_COMPLIANCE_POLICY")) {
      message = "Este serviço não está disponível para compra na Central SMS.";
    } else if (code.includes("SMSPOOL_SERVICE_NO_STOCK") || code.includes("OFFER_NOT_AVAILABLE")) {
      message = "Não há números disponíveis para esta opção agora. Nenhum valor foi descontado. Tente novamente em alguns minutos.";
    } else if (code.includes("MINIMUM_MARGIN_NOT_MET") || code.includes("SALE_PRICE_BELOW_MINIMUM")) {
      message = "Esta opção foi temporariamente retirada da venda porque o preço atual não atende às regras comerciais da Central SMS. Nenhum valor foi descontado.";
    } else if (code.includes("RATE_LIMITED")) {
      retryAt = new Date(Date.now() + 60 * 1000).toISOString();
      message = withRetry("Foram feitas muitas tentativas em pouco tempo.", retryAt);
    } else {
      message = "Não foi possível concluir a compra agora. Nenhum valor foi descontado da sua carteira. Tente novamente em alguns minutos.";
    }
  } catch (error) {
    console.error("[friendly-purchase-failure] retry calculation failed", {
      code,
      message: error instanceof Error ? error.message : String(error),
    });
    message = "A compra foi bloqueada com segurança antes do débito. Nenhum valor foi descontado da sua carteira. Tente novamente mais tarde.";
    retryAt = null;
  }

  return {
    code,
    message,
    retryAt,
    retryAfterSeconds: retryAfterSeconds(retryAt),
  };
}
