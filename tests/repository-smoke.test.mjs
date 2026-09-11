import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repository defaults keep live purchases disabled", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^PURCHASES_ENABLED=false$/m);
});

test("package remains private", async () => {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const pkg = JSON.parse(raw);
  assert.equal(pkg.private, true);
});

test("Mini App authenticates with raw initData and server-side signature validation", async () => {
  const auth = await readFile(new URL("../src/telegram/miniapp-auth.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");

  assert.match(auth, /params\.delete\("hash"\)/);
  assert.match(auth, /WebAppData/);
  assert.match(auth, /TELEGRAM_INIT_DATA_SIGNATURE_INVALID/);
  assert.match(auth, /maxAgeSeconds/);
  assert.doesNotMatch(page, /initDataUnsafe/);
  assert.match(page, /webApp\.initData/);
});

test("Telegram webhook remains protected by secret token", async () => {
  const webhook = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /x-telegram-bot-api-secret-token/);
  assert.match(webhook, /telegramWebhookSecret/);
});

test("preview catalog cannot execute provider purchases", async () => {
  const catalog = await readFile(new URL("../src/catalog/preview.ts", import.meta.url), "utf8");
  const quoteRoute = await readFile(new URL("../app/api/telegram/miniapp/quote/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");

  assert.match(catalog, /preview: true/);
  assert.match(quoteRoute, /purchaseExecutionEnabled: false/);
  assert.match(quoteRoute, /PREVIEW_CATALOG_ONLY/);
  assert.doesNotMatch(quoteRoute, /purchaseActivation/);
  assert.match(page, /Nenhuma compra, reserva ou débito foi executado/);
});

test("preview pricing is calculated server-side", async () => {
  const pricing = await readFile(new URL("../src/pricing/quote.ts", import.meta.url), "utf8");
  const catalogRoute = await readFile(new URL("../app/api/catalog/route.ts", import.meta.url), "utf8");

  assert.match(pricing, /markupPercent/);
  assert.match(pricing, /markupFixedBrlCents/);
  assert.match(pricing, /salePriceCents/);
  assert.match(catalogRoute, /quoteOffer/);
});
