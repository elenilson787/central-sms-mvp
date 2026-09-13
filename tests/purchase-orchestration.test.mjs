import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("real SMSPool purchase orchestration keeps commercial gates and idempotency", async () => {
  const service = await readFile(new URL("../src/activations/service.ts", import.meta.url), "utf8");
  const env = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");

  assert.match(service, /requireSmsPoolPurchaseConfiguration\(\)/);
  assert.match(env, /if \(!env\.purchasesEnabled\) throw new Error\("PURCHASES_DISABLED"\)/);
  assert.match(env, /SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED/);
  assert.match(service, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(service, /findActivationByIdempotencyKey/);
  assert.match(service, /idempotency_key: idempotencyKey/);
});

test("purchase recalculates price and stock server-side before wallet debit", async () => {
  const service = await readFile(new URL("../src/activations/service.ts", import.meta.url), "utf8");

  const quoteIndex = service.indexOf("quoteSmsPoolCatalogOffer(offerId)");
  const balanceIndex = service.indexOf("getWalletBalanceCents(input.userId)");
  const debitIndex = service.indexOf("applyWalletTransaction({");
  const providerIndex = service.indexOf("purchaseSmsPoolNumber({");

  assert.ok(quoteIndex >= 0);
  assert.ok(balanceIndex > quoteIndex);
  assert.ok(debitIndex > balanceIndex);
  assert.ok(providerIndex > debitIndex);
  assert.match(service, /if \(quote\.stock < 1\) throw new Error\("OFFER_NOT_AVAILABLE"\)/);
  assert.match(service, /assertServiceAllowed\("smspool", quote\.offer\.product\)/);
  assert.match(service, /maxPrice: quote\.providerPrice/);
});

test("explicit provider rejection refunds but ambiguous outcomes require reconciliation", async () => {
  const service = await readFile(new URL("../src/activations/service.ts", import.meta.url), "utf8");

  assert.match(service, /providerExplicitlyRejected = message\.startsWith\("SMSPOOL_API_ERROR:"\)/);
  assert.match(service, /type: "refund"/);
  assert.match(service, /provider-rejected/);
  assert.match(service, /PROVIDER_RESULT_UNKNOWN/);
  assert.match(service, /purchase_requires_reconciliation/);
});

test("rental execution remains blocked until the official rental purchase flow is implemented", async () => {
  const service = await readFile(new URL("../src/activations/service.ts", import.meta.url), "utf8");
  assert.match(service, /RENTAL_PURCHASE_NOT_IMPLEMENTED/);
});

test("activation polling stores SMS idempotently", async () => {
  const service = await readFile(new URL("../src/activations/service.ts", import.meta.url), "utf8");
  assert.match(service, /checkSmsPoolOrder/);
  assert.match(service, /activation_sms/);
  assert.match(service, /onConflict: "activation_id,dedupe_key"/);
  assert.match(service, /status: "sms_received"/);
});
