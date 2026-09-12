import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PIX Mini App automatically polls payment status and returns home after approval", async () => {
  const panel = await readFile(new URL("../app/miniapp/PixRechargePanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Confirmando pagamento, aguarde/);
  assert.match(panel, /setInterval/);
  assert.match(panel, /\/api\/telegram\/miniapp\/pix\/status/);
  assert.match(panel, /window\.location\.assign\("\/miniapp"\)/);
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
