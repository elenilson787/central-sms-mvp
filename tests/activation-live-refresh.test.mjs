import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("activation polling checks SMSPool without toggling global session loading", async () => {
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/telegram/miniapp/activations/refresh/route.ts", import.meta.url), "utf8");
  const refresh = await readFile(new URL("../src/activations/user-refresh.ts", import.meta.url), "utf8");
  const reconcile = await readFile(new URL("../src/activations/smspool-reconcile.ts", import.meta.url), "utf8");

  assert.match(page, /refreshActivations/);
  assert.match(page, /\/api\/telegram\/miniapp\/activations\/refresh/);
  assert.match(page, /setInterval[\s\S]*refreshActivations/);
  assert.doesNotMatch(page, /setInterval[\s\S]{0,180}loadSession\(\{ silent: true \}\)/);
  assert.match(page, /const refreshSessionSilently = useCallback/);
  assert.match(page, /onBalanceUpdated=\{refreshSessionSilently\}/);

  assert.match(route, /validateTelegramMiniAppInitData/);
  assert.match(route, /refreshUserWaitingActivations\(initialSession\.user\.id/);
  assert.match(route, /getOrCreateMiniAppSession/);

  assert.match(refresh, /\.eq\("user_id", userId\)/);
  assert.match(refresh, /checkSmsPoolOrder/);
  assert.match(refresh, /reconcileSmsPoolActivationStatus/);
  assert.match(refresh, /sale_price_cents/);

  assert.match(reconcile, /status: "sms_received"/);
  assert.match(reconcile, /activation_sms/);
  assert.match(reconcile, /\[2, "expired"\]/);
  assert.match(reconcile, /\[5, "cancelled"\]/);
  assert.match(reconcile, /\[6, "refunded"\]/);
  assert.match(reconcile, /type: "refund"/);
  assert.match(reconcile, /referenceId: `activation:\$\{row\.id\}:provider-refund`/);
});

test("global activation cron uses the same refund-aware reconciler", async () => {
  const cron = await readFile(new URL("../app/api/cron/activations/route.ts", import.meta.url), "utf8");
  const refresh = await readFile(new URL("../src/activations/provider-refresh.ts", import.meta.url), "utf8");

  assert.match(cron, /refreshSmsPoolWaitingActivations/);
  assert.match(refresh, /reconcileSmsPoolActivationStatus/);
  assert.match(refresh, /sale_price_cents/);
  assert.match(refresh, /user_id/);
});
