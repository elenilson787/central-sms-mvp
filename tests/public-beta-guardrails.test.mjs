import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public beta stays globally gated but does not require a user allow-list", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const envSource = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");

  assert.match(envExample, /^PURCHASES_ENABLED=false$/m);
  assert.match(envExample, /^BETA_MODE=true$/m);
  assert.match(envSource, /betaMode: optional\("BETA_MODE"\) !== "false"/);
  assert.doesNotMatch(envSource, /BETA_USER_ALLOWLIST|BETA_ALLOWED_USERS/);
});

test("beta purchase limits cover hourly, daily, spend and pending exposure", async () => {
  const guardrails = await readFile(new URL("../src/commercial/purchase-guardrails.ts", import.meta.url), "utf8");

  assert.match(guardrails, /public-beta-purchases-hour/);
  assert.match(guardrails, /public-beta-purchases-day/);
  assert.match(guardrails, /BETA_PURCHASE_HOURLY_LIMIT/);
  assert.match(guardrails, /BETA_PURCHASE_DAILY_LIMIT/);
  assert.match(guardrails, /BETA_DAILY_SPEND_LIMIT/);
  assert.match(guardrails, /BETA_PENDING_ACTIVATIONS_LIMIT/);
  assert.match(guardrails, /BETA_PENDING_SERVICE_LIMIT/);
  assert.match(guardrails, /sale_price_cents,status/);
  assert.match(guardrails, /created_at/);
  assert.match(guardrails, /PENDING_STATUSES/);
});

test("provider reserve and minimum margin are checked before customer purchase", async () => {
  const guardrails = await readFile(new URL("../src/commercial/purchase-guardrails.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/telegram/miniapp/catalog/purchase/route.ts", import.meta.url), "utf8");

  assert.match(guardrails, /retrieveSmsPoolBalance/);
  assert.match(guardrails, /SMSPOOL_BALANCE_RESERVE_REQUIRED/);
  assert.match(guardrails, /MINIMUM_MARGIN_NOT_MET/);
  assert.match(guardrails, /SALE_PRICE_BELOW_MINIMUM/);
  assert.match(guardrails, /minimumGrossMarginPercent/);
  assert.match(guardrails, /minimumGrossMarginBrlCents/);

  assert.match(route, /assertPurchaseMarginGuardrails/);
  assert.match(route, /assertSmsPoolBalanceReserve/);
  assert.match(route, /assertPublicBetaUserGuardrails/);
  assert.match(route, /purchaseActivation\(/);

  const marginCheck = route.indexOf("assertPurchaseMarginGuardrails({");
  const providerReserve = route.indexOf("await assertSmsPoolBalanceReserve(");
  const betaLimits = route.indexOf("await assertPublicBetaUserGuardrails({");
  const purchase = route.lastIndexOf("purchaseActivation({");
  assert.ok(marginCheck >= 0 && providerReserve > marginCheck && betaLimits > providerReserve && purchase > betaLimits);
});

test("documented defaults are conservative for an open organic beta", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(envExample, /^BETA_MAX_PURCHASES_PER_HOUR=3$/m);
  assert.match(envExample, /^BETA_MAX_PURCHASES_PER_DAY=8$/m);
  assert.match(envExample, /^BETA_MAX_DAILY_SPEND_BRL_CENTS=3000$/m);
  assert.match(envExample, /^BETA_MAX_PENDING_ACTIVATIONS=2$/m);
  assert.match(envExample, /^BETA_MAX_PENDING_PER_SERVICE=1$/m);
  assert.match(envExample, /^SMSPOOL_MIN_BALANCE=1\.00$/m);
  assert.match(envExample, /^MIN_GROSS_MARGIN_PERCENT=20$/m);
  assert.match(envExample, /^MIN_GROSS_MARGIN_BRL_CENTS=30$/m);
});
