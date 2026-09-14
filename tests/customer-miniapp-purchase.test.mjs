import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer catalog exposes only approved SMSPool products", async () => {
  const route = await readFile(new URL("../app/api/telegram/miniapp/catalog/route.ts", import.meta.url), "utf8");

  assert.match(route, /getApprovedProducts\("smspool"\)/);
  assert.match(route, /approvedProducts\.has\(String\(offer\.product\)\.toLowerCase\(\)\)/);
  assert.match(route, /purchaseExecutionEnabled/);
  assert.match(route, /env\.purchasesEnabled/);
  assert.match(route, /env\.smsPoolCommercialApproved/);
  assert.match(route, /approvedOnly: true/);
});

test("customer quote selects the best stocked pool and keeps the allow-list gate", async () => {
  const quoteRoute = await readFile(new URL("../app/api/telegram/miniapp/catalog/quote/route.ts", import.meta.url), "utf8");
  const bestPool = await readFile(new URL("../src/providers/smspool/best-pool.ts", import.meta.url), "utf8");

  assert.match(quoteRoute, /quoteBestSmsPoolPoolForOffer/);
  assert.match(quoteRoute, /assertServiceAllowed\("smspool", quote\.offer\.product\)/);
  assert.match(quoteRoute, /highest_success_rate_then_lowest_price/);
  assert.match(quoteRoute, /operator: quote\.offer\.operator/);

  assert.match(bestPool, /retrieveSmsPoolPricing/);
  assert.match(bestPool, /quote\.stock > 0/);
  assert.match(bestPool, /return bRate - aRate/);
  assert.match(bestPool, /return a\.providerPrice - b\.providerPrice/);
});

test("customer purchase endpoint is authenticated, rate-limited, pinned and idempotent", async () => {
  const route = await readFile(new URL("../app/api/telegram/miniapp/catalog/purchase/route.ts", import.meta.url), "utf8");

  assert.match(route, /validateTelegramMiniAppInitData/);
  assert.match(route, /scope: "miniapp-real-purchase"/);
  assert.match(route, /limit: 4/);
  assert.match(route, /BUY_ONE_REAL_SMS/);
  assert.match(route, /assertServiceAllowed\("smspool", bestQuote\.offer\.product\)/);
  assert.match(route, /bestQuote\.offer\.id !== reviewedOfferId/);
  assert.match(route, /OFFER_CHANGED_REVIEW_REQUIRED/);
  assert.match(route, /bestQuote\.salePriceCents > reviewedSalePriceCents/);
  assert.match(route, /PRICE_CHANGED_REVIEW_REQUIRED/);
  assert.match(route, /idempotencyKey: `miniapp:\$\{session\.user\.id\}:\$\{clientKey\}`/);
  assert.match(route, /maxSalePriceCents: reviewedSalePriceCents/);
  assert.match(route, /purchaseActivation\(/);
});

test("purchase orchestration never debits more than the reviewed wallet price", async () => {
  const service = await readFile(new URL("../src/activations/service.ts", import.meta.url), "utf8");

  const priceGuard = service.indexOf("quote.salePriceCents > maxSalePriceCents");
  const debit = service.indexOf("applyWalletTransaction({");
  assert.ok(priceGuard >= 0 && debit > priceGuard);
  assert.match(service, /maxSalePriceCents\?: number/);
  assert.match(service, /PRICE_CHANGED_REVIEW_REQUIRED/);
});

test("successful customer purchase refreshes the Mini App and opens activation tracking", async () => {
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  assert.match(page, /onPurchaseCompleted/);
  assert.match(page, /await refreshSessionSilently\(\)/);
  assert.match(page, /setView\("activations"\)/);
  assert.match(page, /Ativação única/);
  assert.match(panel, /Compra confirmada/);
  assert.match(panel, /Minhas ativações/);
});
