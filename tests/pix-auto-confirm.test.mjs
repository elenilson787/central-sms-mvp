import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PIX Mini App automatically polls payment status and returns home internally after approval", async () => {
  const panel = await readFile(new URL("../app/miniapp/PixRechargePanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Confirmando pagamento, aguarde/);
  assert.match(panel, /nextAutoCheckDelay/);
  assert.match(panel, /4_000/);
  assert.match(panel, /10_000/);
  assert.match(panel, /20_000/);
  assert.match(panel, /\/api\/telegram\/miniapp\/pix\/status/);
  assert.match(panel, /onPaymentConfirmed\?\.\(\)/);
  assert.doesNotMatch(panel, /window\.location\.assign/);
});

test("PIX Mini App resumes the user's latest pending payment", async () => {
  const panel = await readFile(new URL("../app/miniapp/PixRechargePanel.tsx", import.meta.url), "utf8");
  const latest = await readFile(new URL("../app/api/telegram/miniapp/pix/latest/route.ts", import.meta.url), "utf8");
  assert.match(panel, /\/api\/telegram\/miniapp\/pix\/latest/);
  assert.match(latest, /validateTelegramMiniAppInitData/);
  assert.match(latest, /\.eq\("user_id", session\.user\.id\)/);
  assert.match(latest, /reconcileMercadoPagoOrder/);
  assert.match(latest, /\["creating", "pending", "in_process"\]/);
});

test("Mini App globally monitors a pending PIX after the user leaves the recharge screen", async () => {
  const monitor = await readFile(new URL("../app/miniapp/PixGlobalMonitor.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");
  assert.match(monitor, /\/api\/telegram\/miniapp\/pix\/latest/);
  assert.match(monitor, /\/api\/telegram\/miniapp\/pix\/status/);
  assert.match(monitor, /Confirmando pagamento, aguarde/);
  assert.match(monitor, /nextDelay/);
  assert.match(page, /PixGlobalMonitor/);
  assert.match(page, /view !== "pix"/);
  assert.match(page, /onOpenPix=\{\(\) => setView\("pix"\)\}/);
});

test("Mercado Pago webhook logs safe lifecycle diagnostics without secrets", async () => {
  const route = await readFile(new URL("../app/api/webhooks/mercadopago/route.ts", import.meta.url), "utf8");
  assert.match(route, /\[mercadopago-webhook\] received/);
  assert.match(route, /\[mercadopago-webhook\] reconciled/);
  assert.match(route, /hasSignature/);
  assert.doesNotMatch(route, /mercadoPagoWebhookSecret/);
});
