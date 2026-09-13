import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SMSPool live purchase requires global purchase flag, commercial approval and API key", async () => {
  const env = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../src/providers/smspool/client.ts", import.meta.url), "utf8");

  assert.match(env, /SMSPOOL_COMMERCIAL_APPROVED/);
  assert.match(env, /SMSPOOL_API_KEY/);
  assert.match(env, /if \(!env\.purchasesEnabled\) throw new Error\("PURCHASES_DISABLED"\)/);
  assert.match(env, /SMSPOOL_COMMERCIAL_APPROVAL_REQUIRED/);
  assert.match(client, /purchaseSmsPoolNumber/);
  assert.match(client, /requireSmsPoolPurchaseConfiguration\(\)/);
});

test("SMSPool client exposes documented catalog, status and cancellation endpoints", async () => {
  const client = await readFile(new URL("../src/providers/smspool/client.ts", import.meta.url), "utf8");

  for (const endpoint of [
    "/country/retrieve_all",
    "/service/retrieve_all",
    "/request/pricing",
    "/request/price",
    "/sms/stock",
    "/purchase/sms",
    "/sms/check",
    "/sms/cancel",
    "/request/balance",
  ]) {
    assert.match(client, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});
