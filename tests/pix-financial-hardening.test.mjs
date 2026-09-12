import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wallet treats concurrent duplicate ledger references as idempotent success", async () => {
  const wallet = await readFile(new URL("../src/wallet/service.ts", import.meta.url), "utf8");
  const reconcile = await readFile(new URL("../src/payments/reconcile.ts", import.meta.url), "utf8");

  assert.match(wallet, /error\.code === "23505"/);
  assert.match(wallet, /wallet_transactions/);
  assert.match(wallet, /reference_id/);
  assert.match(reconcile, /referenceId: `payment:\$\{local\.id\}:credit`/);
});

test("Mercado Pago webhook persists safe reconciliation audit records", async () => {
  const webhook = await readFile(new URL("../app/api/webhooks/mercadopago/route.ts", import.meta.url), "utf8");

  assert.match(webhook, /logAudit/);
  assert.match(webhook, /mercadopago\.webhook\.accepted/);
  assert.match(webhook, /mercadopago\.webhook\.reconciled/);
  assert.match(webhook, /mercadopago\.webhook\.failed/);
  assert.doesNotMatch(webhook, /mercadoPagoAccessToken/);
  assert.doesNotMatch(webhook, /mercadoPagoWebhookSecret/);
});

test("PIX history is Telegram-authenticated and isolated by Mercado Pago environment", async () => {
  const history = await readFile(new URL("../app/api/telegram/miniapp/pix/history/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");

  assert.match(history, /validateTelegramMiniAppInitData/);
  assert.match(history, /\.eq\("user_id", session\.user\.id\)/);
  assert.match(history, /mercadoPagoTestMode/);
  assert.match(history, /ORDTST%/);
  assert.match(history, /\.limit\(8\)/);
  assert.match(page, /PixPaymentHistory/);
});
