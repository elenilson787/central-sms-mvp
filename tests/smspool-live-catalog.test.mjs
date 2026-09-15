import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mini App live catalog is authenticated, gated and white-labeled", async () => {
  const catalogRoute = await readFile(new URL("../app/api/telegram/miniapp/catalog/route.ts", import.meta.url), "utf8");
  const quoteRoute = await readFile(new URL("../app/api/telegram/miniapp/catalog/quote/route.ts", import.meta.url), "utf8");
  const purchaseRoute = await readFile(new URL("../app/api/telegram/miniapp/catalog/purchase/route.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  assert.match(catalogRoute, /validateTelegramMiniAppInitData/);
  assert.match(catalogRoute, /purchaseExecutionEnabled/);
  assert.match(catalogRoute, /env\.purchasesEnabled/);
  assert.match(catalogRoute, /getApprovedProducts\("smspool"\)/);
  assert.doesNotMatch(catalogRoute, /purchaseSmsPoolNumber/);

  assert.match(quoteRoute, /quoteBestSmsPoolPoolForOffer/);
  assert.match(quoteRoute, /purchaseExecutionEnabled/);
  assert.match(quoteRoute, /assertServiceAllowed/);
  assert.doesNotMatch(quoteRoute, /purchaseSmsPoolNumber/);

  assert.match(purchaseRoute, /validateTelegramMiniAppInitData/);
  assert.match(purchaseRoute, /purchaseActivation/);
  assert.match(purchaseRoute, /BUY_ONE_REAL_SMS/);

  assert.match(panel, /Para qual app ou site você precisa de um número/);
  assert.match(panel, /Serviço que você quer ativar/);
  assert.match(panel, /Número para \{offer\.label\}/);
  assert.match(panel, /Confirmar compra — aguardando liberação/);
  assert.doesNotMatch(panel, /Simular confirmação/);
  assert.doesNotMatch(panel, /SMSPool/);
  assert.doesNotMatch(panel, /providerPrice/);
});

test("Mini App catalog avoids overwhelming the user with the full provider list before search", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  assert.match(panel, /if \(query\.length < 2\) return \[\]/);
  assert.match(panel, /Comece digitando o nome do app ou site/);
  assert.match(panel, /availableFeaturedServices/);
  assert.match(panel, /Serviços populares:/);
  assert.match(panel, /O estoque é confirmado em tempo real quando você abre a cotação/);
  assert.match(panel, /offer\.pricingConfigured/);
  assert.doesNotMatch(panel, /offer\.stock > 0/);
  assert.doesNotMatch(panel, /const QUICK_SEARCHES/);
  assert.match(panel, /Não encontramos um serviço aprovado com esse nome neste país/);
});

test("Mini App separates one-time activation from live long-term rental discovery", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");
  const rentalPanel = await readFile(new URL("../app/miniapp/SmsPoolRentalPanel.tsx", import.meta.url), "utf8");

  assert.match(panel, /Ativação única/);
  assert.match(panel, /Manter número por mais tempo/);
  assert.match(panel, /CATÁLOGO REAL/);
  assert.match(panel, /não fica reservado permanentemente/);
  assert.match(panel, /Se o app pedir outro código no futuro/);
  assert.match(panel, /Ver aluguel longo/);
  assert.match(rentalPanel, /Manter o mesmo número por vários dias/);
  assert.match(rentalPanel, /Compra de aluguel ainda bloqueada/);
  assert.match(rentalPanel, /Renovação depende da disponibilidade/);
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

test("long-term rental catalog is read-only and uses rental pricing, services and stock", async () => {
  const client = await readFile(new URL("../src/providers/smspool/client.ts", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../src/providers/smspool/rental-catalog.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/telegram/miniapp/rentals/route.ts", import.meta.url), "utf8");
  const quoteRoute = await readFile(new URL("../app/api/telegram/miniapp/rentals/quote/route.ts", import.meta.url), "utf8");

  assert.match(client, /\/rental\/retrieve_all/);
  assert.match(client, /\/rental\/retrieve_services/);
  assert.match(client, /\/rental\/retrieve_pricing/);
  assert.match(client, /\/rental\/stock/);
  assert.doesNotMatch(client, /\/rental\/order/);
  assert.doesNotMatch(client, /purchase_rental/);

  assert.match(catalog, /kind: "TEMPORARY_HOSTING"/);
  assert.match(catalog, /quoteRentalOffer/);
  assert.doesNotMatch(catalog, /quoteOffer\(offer\)/);
  assert.match(route, /purchaseExecutionEnabled: false/);
  assert.match(quoteRoute, /purchaseExecutionEnabled: false/);
  assert.doesNotMatch(route, /\/rental\/order|purchaseSmsPoolNumber|purchase_rental/);
  assert.doesNotMatch(quoteRoute, /\/rental\/order|purchaseSmsPoolNumber|purchase_rental/);
});
