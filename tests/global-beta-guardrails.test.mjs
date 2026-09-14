import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public beta defines conservative system-wide budgets", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const envSource = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");

  assert.match(envExample, /^BETA_GLOBAL_MAX_PURCHASES_PER_HOUR=10$/m);
  assert.match(envExample, /^BETA_GLOBAL_MAX_PURCHASES_PER_DAY=30$/m);
  assert.match(envExample, /^BETA_GLOBAL_MAX_SALES_BRL_CENTS_PER_DAY=10000$/m);
  assert.match(envExample, /^BETA_GLOBAL_MAX_PROVIDER_SPEND_USD_PER_DAY=5\.00$/m);
  assert.match(envExample, /^BETA_CIRCUIT_BREAKER_FAILURES=5$/m);
  assert.match(envExample, /^BETA_CIRCUIT_BREAKER_WINDOW_MINUTES=30$/m);

  assert.match(envSource, /betaGlobalMaxPurchasesPerHour/);
  assert.match(envSource, /betaGlobalMaxPurchasesPerDay/);
  assert.match(envSource, /betaGlobalMaxSalesBrlCentsPerDay/);
  assert.match(envSource, /betaGlobalMaxProviderSpendUsdPerDay/);
  assert.match(envSource, /betaCircuitBreakerFailures/);
  assert.match(envSource, /betaCircuitBreakerWindowMinutes/);
});

test("global beta guardrails enforce volume, sales and provider-spend ceilings", async () => {
  const guardrails = await readFile(new URL("../src/commercial/purchase-guardrails.ts", import.meta.url), "utf8");

  assert.match(guardrails, /getPublicBetaGlobalGuardrailSnapshot/);
  assert.match(guardrails, /assertPublicBetaGlobalGuardrails/);
  assert.match(guardrails, /public-beta-global-purchases-hour/);
  assert.match(guardrails, /public-beta-global-purchases-day/);
  assert.match(guardrails, /BETA_GLOBAL_PURCHASE_HOURLY_LIMIT/);
  assert.match(guardrails, /BETA_GLOBAL_PURCHASE_DAILY_LIMIT/);
  assert.match(guardrails, /BETA_GLOBAL_SALES_LIMIT/);
  assert.match(guardrails, /BETA_GLOBAL_PROVIDER_SPEND_LIMIT/);
  assert.match(guardrails, /salesLast24hCents/);
  assert.match(guardrails, /providerSpendLast24hUsd/);
});

test("circuit breaker pauses purchases after consecutive failures or refunds and auto-resets by time window", async () => {
  const guardrails = await readFile(new URL("../src/commercial/purchase-guardrails.ts", import.meta.url), "utf8");

  assert.match(guardrails, /CIRCUIT_FAILURE_STATUSES = \["failed", "refunded"\]/);
  assert.match(guardrails, /CIRCUIT_SUCCESS_STATUSES = \["sms_received", "completed"\]/);
  assert.match(guardrails, /circuitBreakerConsecutiveFailures/);
  assert.match(guardrails, /circuitBreakerResetAt/);
  assert.match(guardrails, /BETA_CIRCUIT_BREAKER_OPEN/);
  assert.match(guardrails, /breakerWindowMinutes \* 60 \* 1000/);
});

test("customer purchase evaluates global guardrails before provider purchase", async () => {
  const route = await readFile(new URL("../app/api/telegram/miniapp/catalog/purchase/route.ts", import.meta.url), "utf8");

  const globalCheck = route.lastIndexOf("assertPublicBetaGlobalGuardrails({");
  const purchase = route.lastIndexOf("purchaseActivation({");
  assert.ok(globalCheck >= 0 && purchase > globalCheck);

  assert.match(route, /BETA_GLOBAL_PURCHASE_HOURLY_LIMIT/);
  assert.match(route, /BETA_GLOBAL_PURCHASE_DAILY_LIMIT/);
  assert.match(route, /BETA_GLOBAL_SALES_LIMIT/);
  assert.match(route, /BETA_GLOBAL_PROVIDER_SPEND_LIMIT/);
  assert.match(route, /BETA_CIRCUIT_BREAKER_OPEN/);
  assert.match(route, /status: circuitBreakerOpen \? 503/);
});

test("admin diagnostics expose current global usage and circuit breaker state", async () => {
  const route = await readFile(new URL("../app/api/admin/providers/smspool/diagnostics/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/admin/providers/smspool/page.tsx", import.meta.url), "utf8");

  assert.match(route, /globalGuardrailDiagnostics/);
  assert.match(route, /getPublicBetaGlobalGuardrailSnapshot/);
  assert.match(route, /globalCapacityAvailable/);
  assert.match(page, /Orçamento global do beta/);
  assert.match(page, /Compras na última hora/);
  assert.match(page, /Custo provider nas últimas 24h/);
  assert.match(page, /Circuit breaker/);
  assert.match(page, /ABERTO — compras pausadas/);
});
