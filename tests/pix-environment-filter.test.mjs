import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PIX creation persists explicit test/production environment", async () => {
  const create = await readFile(new URL("../app/api/telegram/miniapp/pix/route.ts", import.meta.url), "utf8");
  assert.match(create, /currentPaymentEnvironment/);
  assert.match(create, /environment,/);
});

test("latest PIX recovery and history filter by explicit environment", async () => {
  const latest = await readFile(new URL("../app/api/telegram/miniapp/pix/latest/route.ts", import.meta.url), "utf8");
  const history = await readFile(new URL("../app/api/telegram/miniapp/pix/history/route.ts", import.meta.url), "utf8");
  assert.match(latest, /\.eq\("environment", environment\)/);
  assert.match(history, /\.eq\("environment", environment\)/);
  assert.doesNotMatch(latest, /ORDTST%/);
});

test("database patch backfills sandbox rows before enforcing environment", async () => {
  const patch = await readFile(new URL("../supabase/patches/2026-09-12_prelaunch_hardening.sql", import.meta.url), "utf8");
  assert.match(patch, /add column if not exists environment/);
  assert.match(patch, /external_payment_id like 'ORDTST%'/);
  assert.match(patch, /payments_environment_check/);
});
