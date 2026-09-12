import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin refund reserves wallet before calling Mercado Pago", async () => {
  const refund = await readFile(new URL("../app/api/admin/payments/refund/route.ts", import.meta.url), "utf8");
  const reserveIndex = refund.indexOf("applyWalletTransaction");
  const providerIndex = refund.indexOf("refundOrder(");
  assert.ok(reserveIndex >= 0 && providerIndex > reserveIndex);
  assert.match(refund, /amountCents: -Number\(payment\.amount_cents\)/);
  assert.match(refund, /payment-refund:/);
  assert.match(refund, /wallet_balance_already_spent/);
});

test("Mercado Pago refund uses Orders endpoint and idempotency", async () => {
  const mp = await readFile(new URL("../src/payments/mercadopago.ts", import.meta.url), "utf8");
  assert.match(mp, /\/v1\/orders\/\$\{encodeURIComponent\(orderId\)\}\/refund/);
  assert.match(mp, /"x-idempotency-key": idempotencyKey/);
});

test("health endpoint never returns secrets", async () => {
  const health = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(health, /paymentEnvironment/);
  assert.doesNotMatch(health, /mercadoPagoAccessToken,/);
  assert.doesNotMatch(health, /supabaseSecretKey,/);
});

test("legal and support pages exist", async () => {
  const terms = await readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  const privacy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
  const refund = await readFile(new URL("../app/refund-policy/page.tsx", import.meta.url), "utf8");
  const support = await readFile(new URL("../app/support/page.tsx", import.meta.url), "utf8");
  assert.match(terms, /É proibido/);
  assert.match(privacy, /CPF\/CNPJ/);
  assert.match(refund, /saldo/);
  assert.match(support, /CentralSMSBrasilBot/);
});
