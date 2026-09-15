import { getPublicBetaGlobalGuardrailSnapshot } from "@/src/commercial/purchase-guardrails";
import { env } from "@/src/config/env";
import { getSupabaseAdmin } from "@/src/db/supabase-server";
import { retrieveSmsPoolBalance } from "@/src/providers/smspool/client";
import { isAdminRequest } from "@/src/security/admin-auth";

const PENDING_STATUSES = new Set(["creating", "number_received", "waiting_sms"]);
const SUCCESS_STATUSES = new Set(["sms_received", "completed"]);
const FAILURE_STATUSES = new Set(["failed", "refunded", "expired"]);

type AlertLevel = "critical" | "warning" | "info";
type DashboardAlert = { level: AlertLevel; code: string; message: string };

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ratio(value: number, limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return value / limit;
}

function providerCostBrlCents(cost: number, currency: string) {
  if (!Number.isFinite(cost) || cost <= 0) return { cents: 0, complete: true };
  const normalized = String(currency || "USD").toUpperCase();
  if (normalized === "BRL") return { cents: Math.round(cost * 100), complete: true };
  if (normalized === "USD" && env.providerToBrlRate && env.providerToBrlRate > 0) {
    return { cents: Math.round(cost * env.providerToBrlRate * 100), complete: true };
  }
  return { cents: 0, complete: false };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [activationsResult, paymentsResult, refundsResult, guardrails] = await Promise.all([
    supabase
      .from("activations")
      .select("id,user_id,product,status,sale_price_cents,provider_cost,provider_currency,created_at,updated_at")
      .eq("provider", "smspool")
      .eq("kind", "ONE_TIME_SMS")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("payments")
      .select("id,user_id,amount_cents,status,environment,created_at,updated_at,paid_at")
      .eq("environment", "production")
      .gte("updated_at", since24h)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("payment_refunds")
      .select("id,payment_id,amount_cents,status,created_at,completed_at")
      .eq("environment", "production")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(200),
    getPublicBetaGlobalGuardrailSnapshot(),
  ]);

  if (activationsResult.error || paymentsResult.error || refundsResult.error) {
    console.error("[operations-dashboard] database query failed", {
      activations: activationsResult.error?.message,
      payments: paymentsResult.error?.message,
      refunds: refundsResult.error?.message,
    });
    return Response.json({ error: "operations_dashboard_query_failed" }, { status: 502 });
  }

  const activations = activationsResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const paymentRefunds = refundsResult.data ?? [];

  const approvedPayments = payments.filter((row) => {
    if (String(row.status) !== "approved") return false;
    const timestamp = Date.parse(String(row.paid_at ?? row.created_at));
    return Number.isFinite(timestamp) && timestamp >= Date.parse(since24h);
  });
  const pixReceivedCents = approvedPayments.reduce((sum, row) => sum + Math.max(0, Math.trunc(numberValue(row.amount_cents))), 0);
  const pixRefundedCents = paymentRefunds
    .filter((row) => String(row.status) === "completed")
    .reduce((sum, row) => sum + Math.max(0, Math.trunc(numberValue(row.amount_cents))), 0);

  let netSalesCents = 0;
  let estimatedProviderCostBrlCents = 0;
  let costConversionComplete = true;
  let pending = 0;
  let smsReceived = 0;
  let activationRefunds = 0;
  let terminalFailures = 0;
  let terminalSuccesses = 0;

  for (const activation of activations) {
    const status = String(activation.status);
    if (PENDING_STATUSES.has(status)) pending += 1;
    if (SUCCESS_STATUSES.has(status)) {
      smsReceived += 1;
      terminalSuccesses += 1;
    }
    if (status === "refunded") activationRefunds += 1;
    if (FAILURE_STATUSES.has(status)) terminalFailures += 1;

    if (status !== "refunded") {
      netSalesCents += Math.max(0, Math.trunc(numberValue(activation.sale_price_cents)));
      const converted = providerCostBrlCents(numberValue(activation.provider_cost), String(activation.provider_currency ?? "USD"));
      estimatedProviderCostBrlCents += converted.cents;
      if (!converted.complete) costConversionComplete = false;
    }
  }

  const grossProfitCents = netSalesCents - estimatedProviderCostBrlCents;
  const grossMarginPercent = netSalesCents > 0 ? (grossProfitCents / netSalesCents) * 100 : null;
  const averageGrossProfitCents = activations.length > 0 ? Math.round(grossProfitCents / Math.max(1, activations.filter((row) => String(row.status) !== "refunded").length)) : null;
  const terminalTotal = terminalSuccesses + terminalFailures;
  const realSuccessRate = terminalTotal > 0 ? (terminalSuccesses / terminalTotal) * 100 : null;
  const refundRate = terminalTotal > 0 ? (activationRefunds / terminalTotal) * 100 : 0;
  const activeUsers = new Set(activations.map((row) => String(row.user_id))).size;

  let providerBalance: number | null = null;
  let providerBalanceError: string | null = null;
  try {
    const balance = await retrieveSmsPoolBalance();
    const numeric = Number(balance.balance);
    providerBalance = Number.isFinite(numeric) ? numeric : null;
  } catch (cause) {
    providerBalanceError = cause instanceof Error ? cause.message : "SMSPOOL_BALANCE_FAILED";
  }

  const alerts: DashboardAlert[] = [];
  if (guardrails.circuitBreakerOpen) {
    alerts.push({ level: "critical", code: "circuit_breaker_open", message: `Circuit breaker aberto após ${guardrails.circuitBreakerConsecutiveFailures} falhas consecutivas. Novas compras devem permanecer pausadas.` });
  } else if (guardrails.circuitBreakerConsecutiveFailures >= Math.max(1, guardrails.circuitBreakerFailureThreshold - 1)) {
    alerts.push({ level: "warning", code: "circuit_breaker_near", message: `Circuit breaker próximo do limite: ${guardrails.circuitBreakerConsecutiveFailures}/${guardrails.circuitBreakerFailureThreshold} falhas consecutivas.` });
  }

  if (providerBalanceError) {
    alerts.push({ level: "warning", code: "provider_balance_unknown", message: "Não foi possível consultar o saldo atual do SMSPool." });
  } else if (providerBalance !== null && providerBalance <= env.smsPoolMinBalance) {
    alerts.push({ level: "critical", code: "provider_balance_low", message: `Saldo SMSPool em ${providerBalance.toFixed(2)} ${env.smsPoolPriceCurrency}, no nível ou abaixo da reserva mínima de ${env.smsPoolMinBalance.toFixed(2)}.` });
  } else if (providerBalance !== null && providerBalance <= env.smsPoolMinBalance * 1.5) {
    alerts.push({ level: "warning", code: "provider_balance_near_reserve", message: `Saldo SMSPool próximo da reserva mínima: ${providerBalance.toFixed(2)} ${env.smsPoolPriceCurrency}.` });
  }

  if (terminalTotal >= 3 && refundRate >= 25) {
    alerts.push({ level: "warning", code: "refund_rate_high", message: `Taxa de reembolso de ativações elevada nas últimas 24h: ${refundRate.toFixed(1)}%.` });
  }

  if (grossMarginPercent !== null && costConversionComplete && (
    grossMarginPercent < env.minimumGrossMarginPercent
    || (averageGrossProfitCents !== null && averageGrossProfitCents < env.minimumGrossMarginBrlCents)
  )) {
    alerts.push({ level: "warning", code: "margin_below_minimum", message: `Margem bruta agregada abaixo da política mínima: ${grossMarginPercent.toFixed(1)}%.` });
  }

  const capacityChecks = [
    { name: "compras por hora", value: guardrails.purchasesLastHour, limit: guardrails.maxPurchasesPerHour },
    { name: "compras em 24h", value: guardrails.purchasesLast24h, limit: guardrails.maxPurchasesPerDay },
    { name: "vendas em 24h", value: guardrails.salesLast24hCents, limit: guardrails.maxSalesLast24hCents },
    { name: "custo do provider em 24h", value: guardrails.providerSpendLast24hUsd, limit: guardrails.maxProviderSpendLast24hUsd },
  ];
  for (const check of capacityChecks) {
    const usage = ratio(check.value, check.limit);
    if (usage >= 1) alerts.push({ level: "critical", code: `limit_${check.name.replace(/\W+/g, "_")}`, message: `Limite global de ${check.name} atingido (${check.value}/${check.limit}).` });
    else if (usage >= 0.8) alerts.push({ level: "warning", code: `near_${check.name.replace(/\W+/g, "_")}`, message: `Limite global de ${check.name} em ${(usage * 100).toFixed(0)}% da capacidade.` });
  }

  if (!alerts.length) alerts.push({ level: "info", code: "operations_normal", message: "Nenhum alerta operacional relevante nas últimas 24 horas." });

  const activity = [
    ...activations.slice(0, 12).map((row) => ({
      id: String(row.id),
      kind: "activation" as const,
      title: `SMS ${String(row.product)}`,
      status: String(row.status),
      amountCents: Math.max(0, Math.trunc(numberValue(row.sale_price_cents))),
      createdAt: String(row.created_at),
    })),
    ...payments.slice(0, 12).map((row) => ({
      id: String(row.id),
      kind: "pix" as const,
      title: "Recarga PIX",
      status: String(row.status),
      amountCents: Math.max(0, Math.trunc(numberValue(row.amount_cents))),
      createdAt: String(row.paid_at ?? row.created_at),
    })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 15);

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    metrics: {
      pixReceivedCents,
      pixRefundedCents,
      activationPurchases: activations.length,
      activeUsers,
      smsRevenueCents: netSalesCents,
      providerSpendUsd: guardrails.providerSpendLast24hUsd,
      estimatedProviderCostBrlCents,
      costConversionComplete,
      grossProfitCents,
      grossMarginPercent,
      smsReceived,
      activationRefunds,
      pendingActivations: pending,
      realSuccessRate,
    },
    provider: {
      balance: providerBalance,
      currency: env.smsPoolPriceCurrency,
      reserve: env.smsPoolMinBalance,
      error: providerBalanceError,
    },
    guardrails,
    policy: {
      minimumGrossMarginPercent: env.minimumGrossMarginPercent,
      minimumGrossMarginBrlCents: env.minimumGrossMarginBrlCents,
    },
    alerts,
    recentActivity: activity,
  });
}
