import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const handlerPath = new URL("../src/telegram/handler.ts", import.meta.url);
const sessionPath = new URL("../src/telegram/miniapp-session.ts", import.meta.url);
const routePath = new URL("../app/api/admin/acquisition/route.ts", import.meta.url);
const pagePath = new URL("../app/admin/acquisition/page.tsx", import.meta.url);

test("Telegram /start stores the personalized deep-link source", async () => {
  const source = await readFile(handlerPath, "utf8");
  assert.match(source, /normalizeAcquisitionSource/);
  assert.match(source, /parts\[1\]/);
  assert.match(source, /action: "bot_start"/);
  assert.match(source, /metadata: \{/);
  assert.match(source, /source,/);
});

test("Mini App openings preserve acquisition attribution", async () => {
  const source = await readFile(sessionPath, "utf8");
  assert.match(source, /action", "bot_start"/);
  assert.match(source, /action: "miniapp_open"/);
  assert.match(source, /metadata: \{ source \}/);
});

test("acquisition admin endpoint builds a source funnel", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /isAdminRequest/);
  assert.match(source, /bot_start/);
  assert.match(source, /miniapp_open/);
  assert.match(source, /rechargers/);
  assert.match(source, /buyers/);
  assert.match(source, /revenueCents/);
  assert.match(source, /first_start_in_window/);
});

test("acquisition UI shows social source and funnel stages", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /Chegaram ao bot/);
  assert.match(source, /Abriram a Mini App/);
  assert.match(source, /Recarregaram via PIX/);
  assert.match(source, /Compraram SMS/);
  assert.match(source, /Origem dos usuários/);
  assert.match(source, /\?start=facebook/);
});
