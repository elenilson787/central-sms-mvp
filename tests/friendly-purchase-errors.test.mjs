import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("purchase limits return customer-friendly messages instead of raw internal codes", async () => {
  const helper = await readFile(new URL("../src/commercial/purchase-error-message.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/telegram/miniapp/catalog/purchase/route.ts", import.meta.url), "utf8");

  assert.match(helper, /As compras estão temporariamente pausadas porque a Central SMS atingiu o limite operacional de custo das últimas 24 horas/);
  assert.match(helper, /Nenhum valor foi descontado da sua carteira/);
  assert.match(helper, /Tente novamente em/);
  assert.match(helper, /rollingBudgetRetryAt/);
  assert.match(helper, /oldestPurchaseRetryAt/);
  assert.match(helper, /circuitBreakerResetAt/);

  assert.match(route, /friendlyPurchaseFailure/);
  assert.match(route, /error: friendly\.message/);
  assert.match(route, /errorCode: friendly\.code/);
  assert.match(route, /retryAt: friendly\.retryAt/);
  assert.match(route, /retryAfterSeconds: friendly\.retryAfterSeconds/);
});

test("friendly error helper covers global, per-user, stock and balance failures", async () => {
  const helper = await readFile(new URL("../src/commercial/purchase-error-message.ts", import.meta.url), "utf8");

  for (const code of [
    "BETA_GLOBAL_PROVIDER_SPEND_LIMIT",
    "BETA_GLOBAL_SALES_LIMIT",
    "BETA_GLOBAL_PURCHASE_HOURLY_LIMIT",
    "BETA_GLOBAL_PURCHASE_DAILY_LIMIT",
    "BETA_CIRCUIT_BREAKER_OPEN",
    "BETA_PURCHASE_HOURLY_LIMIT",
    "BETA_PURCHASE_DAILY_LIMIT",
    "BETA_DAILY_SPEND_LIMIT",
    "BETA_PENDING_SERVICE_LIMIT",
    "BETA_PENDING_ACTIVATIONS_LIMIT",
    "INSUFFICIENT_BALANCE",
    "SMSPOOL_SERVICE_NO_STOCK",
    "RATE_LIMITED",
  ]) {
    assert.match(helper, new RegExp(code));
  }
});
