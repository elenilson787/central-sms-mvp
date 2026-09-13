import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SMSPool diagnostics are admin-only and read-only", async () => {
  const route = await readFile(new URL("../app/api/admin/providers/smspool/diagnostics/route.ts", import.meta.url), "utf8");

  assert.match(route, /isAdminRequest\(request\)/);
  assert.match(route, /retrieveSmsPoolBalance/);
  assert.match(route, /retrieveSmsPoolCountries/);
  assert.match(route, /retrieveSmsPoolServices/);
  assert.match(route, /retrieveSmsPoolPricing/);
  assert.doesNotMatch(route, /purchaseSmsPoolNumber/);
  assert.doesNotMatch(route, /cancelSmsPoolOrder/);
});

test("SMSPool admin page makes the safety gates visible", async () => {
  const page = await readFile(new URL("../app/admin/providers/smspool/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Testar conexão SMSPool/);
  assert.match(page, /PURCHASES_ENABLED/);
  assert.match(page, /SMSPOOL_COMMERCIAL_APPROVED/);
  assert.match(page, /Compra real liberada/);
});
