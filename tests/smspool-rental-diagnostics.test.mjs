import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SMSPool admin diagnostics inspect both rental catalog types without purchase operations", async () => {
  const route = await readFile(new URL("../app/api/admin/providers/smspool/diagnostics/route.ts", import.meta.url), "utf8");

  assert.match(route, /retrieveSmsPoolRentalIds\(type\)/);
  assert.match(route, /rentalDiagnostics\(0\)/);
  assert.match(route, /rentalDiagnostics\(1\)/);
  assert.match(route, /retrieveSmsPoolRentalServices/);
  assert.match(route, /rentalDiagnostics/);
  assert.doesNotMatch(route, /purchaseSmsPoolNumber|\/rental\/order|purchase_rental/);
});
