import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repository defaults keep live purchases disabled", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^PURCHASES_ENABLED=false$/m);
});

test("PIX remains disabled until gateway and webhook are configured", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const pixRoute = await readFile(new URL("../app/api/telegram/miniapp/pix/route.ts", import.meta.url), "utf8");
  assert.match(envExample, /^PIX_ENABLED=false$/m);
  assert.match(envExample, /^MERCADO_PAGO_TEST_MODE=false$/m);
  assert.match(pixRoute, /PIX_DISABLED/);
  assert.match(pixRoute, /PIX_GATEWAY_NOT_CONFIGURED/);
  assert.match(pixRoute, /validateTelegramMiniAppInitData/);
});

test("Mercado Pago PIX test mode follows documented predefined Orders scenario", async () => {
  const gateway = await readFile(new URL("../src/payments/mercadopago.ts", import.meta.url), "utf8");
  const pixRoute = await readFile(new URL("../app/api/telegram/miniapp/pix/route.ts", import.meta.url), "utf8");
  assert.match(gateway, /test_user_br@testuser\.com/);
  assert.match(gateway, /first_name: "APRO"/);
  assert.match(pixRoute, /amountCents !== 5000/);
  assert.match(pixRoute, /PIX_TEST_AMOUNT_REQUIRED/);
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

test("Mercado Pago PIX uses Orders API with idempotency and signed order webhooks", async () => {
  const gateway = await readFile(new URL("../src/payments/mercadopago.ts", import.meta.url), "utf8");
  const webhook = await readFile(new URL("../app/api/webhooks/mercadopago/route.ts", import.meta.url), "utf8");
  const reconcile = await readFile(new URL("../src/payments/reconcile.ts", import.meta.url), "utf8");
  assert.match(gateway, /\/v1\/orders/);
  assert.doesNotMatch(gateway, /\/v1\/payments/);
  assert.match(gateway, /processing_mode: "automatic"/);
  assert.match(gateway, /id: "pix"/);
  assert.match(gateway, /type: "bank_transfer"/);
  assert.match(gateway, /x-idempotency-key/);
  assert.match(gateway, /createHmac\("sha256"/);
  assert.match(gateway, /timingSafeEqual/);
  assert.match(webhook, /verifyMercadoPagoWebhookSignature/);
  assert.match(webhook, /notificationType !== "order"/);
  assert.match(webhook, /reconcileMercadoPagoOrder/);
  assert.match(reconcile, /PAYMENT_INTEGRITY_MISMATCH/);
  assert.match(reconcile, /payment_method\?\.id === "pix"/);
  assert.match(reconcile, /payment_method\?\.type === "bank_transfer"/);
  assert.match(reconcile, /orderIsAccredited/);
  assert.match(reconcile, /referenceId: `payment:\$\{local\.id\}:credit`/);
});

test("PIX payer PII is not inserted into local payments table", async () => {
  const pixRoute = await readFile(new URL("../app/api/telegram/miniapp/pix/route.ts", import.meta.url), "utf8");
  const insertStart = pixRoute.indexOf('from("payments").insert');
  const gatewayCall = pixRoute.indexOf("const order = await createPixOrder");
  const insertBlock = pixRoute.slice(insertStart, gatewayCall);
  assert.doesNotMatch(insertBlock, /payerEmail/);
  assert.doesNotMatch(insertBlock, /documentNumber/);
  assert.match(pixRoute, /createPixOrder/);
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

test("preview pricing is calculated server-side and customer sees only final price", async () => {
  const pricing = await readFile(new URL("../src/pricing/quote.ts", import.meta.url), "utf8");
  const catalogRoute = await readFile(new URL("../app/api/catalog/route.ts", import.meta.url), "utf8");
  const quoteRoute = await readFile(new URL("../app/api/telegram/miniapp/quote/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");
  assert.match(pricing, /markupPercent/);
  assert.match(pricing, /markupFixedBrlCents/);
  assert.match(pricing, /salePriceCents/);
  assert.match(catalogRoute, /quoteOffer/);
  assert.doesNotMatch(quoteRoute, /providerCostBrlCents/);
  assert.doesNotMatch(quoteRoute, /markupPercent/);
  assert.doesNotMatch(page, /Markup:/);
  assert.match(page, /Preço final/);
});
