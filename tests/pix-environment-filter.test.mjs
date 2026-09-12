import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("latest PIX recovery separates Mercado Pago sandbox and production orders", async () => {
  const latest = await readFile(new URL("../app/api/telegram/miniapp/pix/latest/route.ts", import.meta.url), "utf8");
  assert.match(latest, /mercadoPagoTestMode/);
  assert.match(latest, /ORDTST%/);
  assert.match(latest, /\.like\("external_payment_id", TEST_ORDER_PATTERN\)/);
  assert.match(latest, /\.not\("external_payment_id", "like", TEST_ORDER_PATTERN\)/);
});
