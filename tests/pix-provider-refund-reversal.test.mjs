import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mercado Pago reconciliation recognizes full refunds and keeps partial refunds for review", async () => {
  const provider = await readFile(new URL("../src/payments/mercadopago.ts", import.meta.url), "utf8");

  assert.match(provider, /orderIsFullyRefunded/);
  assert.match(provider, /order\.status === "refunded" && order\.status_detail === "refunded"/);
  assert.match(provider, /order\.status === "charged_back" && order\.status_detail === "reimbursed"/);
  assert.match(provider, /payment\?\.status === "refunded" && payment\?\.status_detail === "refunded"/);
  assert.match(provider, /partially_refunded/);
  assert.match(provider, /partial_refund_review/);
});

test("provider refund only reverses a wallet deposit that was actually credited", async () => {
  const reconcile = await readFile(new URL("../src/payments/reconcile.ts", import.meta.url), "utf8");

  assert.match(reconcile, /creditReference = `payment:\$\{input\.local\.id\}:credit`/);
  assert.match(reconcile, /\.from\("wallet_transactions"\)/);
  assert.match(reconcile, /\.eq\("type", "deposit"\)/);
  assert.match(reconcile, /deposit_not_credited/);
  assert.match(reconcile, /amountCents: -Number\(input\.local\.amount_cents\)/);
});

test("provider refund races safely with admin refund without double-debiting wallet", async () => {
  const reconcile = await readFile(new URL("../src/payments/reconcile.ts", import.meta.url), "utf8");

  assert.match(reconcile, /\.from\("payment_refunds"\)/);
  assert.match(reconcile, /`payment-refund:\$\{managedRefund\.data\.id\}:reserve`/);
  assert.match(reconcile, /`payment:\$\{input\.local\.id\}:provider-refund-reversal`/);
  assert.match(reconcile, /refund_reversal_pending/);
  assert.match(reconcile, /PAYMENT_REFUND_REVERSAL_PENDING/);
});

test("successful provider refund is reflected in PIX history", async () => {
  const history = await readFile(new URL("../app/miniapp/PixPaymentHistory.tsx", import.meta.url), "utf8");

  assert.match(history, /refunded: "Reembolsado"/);
  assert.match(history, /refund_reversal_pending: "Reembolso em conciliação"/);
  assert.match(history, /partial_refund_review: "Reembolso parcial em revisão"/);
  assert.match(history, /chargeback_review: "Contestação em revisão"/);
});
