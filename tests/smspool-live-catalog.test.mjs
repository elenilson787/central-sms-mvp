import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mini App live catalog is authenticated, read-only and white-labeled", async () => {
  const catalogRoute = await readFile(new URL("../app/api/telegram/miniapp/catalog/route.ts", import.meta.url), "utf8");
  const quoteRoute = await readFile(new URL("../app/api/telegram/miniapp/catalog/quote/route.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  assert.match(catalogRoute, /validateTelegramMiniAppInitData/);
  assert.match(catalogRoute, /purchaseExecutionEnabled: false/);
  assert.doesNotMatch(catalogRoute, /purchaseSmsPoolNumber/);

  assert.match(quoteRoute, /quoteSmsPoolCatalogOffer/);
  assert.match(quoteRoute, /purchaseExecutionEnabled: false/);
  assert.doesNotMatch(quoteRoute, /purchaseSmsPoolNumber/);

  assert.match(panel, /Catálogo real conectado/);
  assert.match(panel, /Compra ainda bloqueada/);
  assert.doesNotMatch(panel, /Simular confirmação/);
  assert.doesNotMatch(panel, /SMSPool/);
  assert.doesNotMatch(panel, /providerPrice/);
});

test("SMSPool catalog uses real provider pricing and stock reads without purchase", async () => {
  const catalog = await readFile(new URL("../src/providers/smspool/catalog.ts", import.meta.url), "utf8");

  assert.match(catalog, /retrieveSmsPoolPricing/);
  assert.match(catalog, /retrieveSmsPoolPrice/);
  assert.match(catalog, /retrieveSmsPoolStock/);
  assert.match(catalog, /quoteOffer/);
  assert.doesNotMatch(catalog, /purchaseSmsPoolNumber/);
  assert.match(catalog, /PROVIDER_TO_BRL_RATE_NOT_CONFIGURED/);
});
