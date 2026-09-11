import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repository defaults keep live purchases disabled", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^PURCHASES_ENABLED=false$/m);
});

test("package remains private", async () => {
  const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const pkg = JSON.parse(raw);
  assert.equal(pkg.private, true);
});

test("Mini App authenticates with raw initData and server-side signature validation", async () => {
  const auth = await readFile(new URL("../src/telegram/miniapp-auth.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");

  assert.match(auth, /params\.delete\("hash"\)/);
  assert.match(auth, /WebAppData/);
  assert.match(auth, /TELEGRAM_INIT_DATA_SIGNATURE_INVALID/);
  assert.match(auth, /maxAgeSeconds/);
  assert.doesNotMatch(page, /initDataUnsafe/);
  assert.match(page, /webApp\.initData/);
});

test("Telegram webhook remains protected by secret token", async () => {
  const webhook = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /x-telegram-bot-api-secret-token/);
  assert.match(webhook, /telegramWebhookSecret/);
});
