import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mini App hides numeric provider service ids behind friendly labels", async () => {
  const session = await readFile(new URL("../src/telegram/miniapp-session.ts", import.meta.url), "utf8");
  const labels = await readFile(new URL("../src/providers/smspool/service-labels.ts", import.meta.url), "utf8");
  const tracking = await readFile(new URL("../app/miniapp/ActivationTracking.tsx", import.meta.url), "utf8");
  const display = await readFile(new URL("../app/miniapp/activation-display.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");

  assert.match(session, /productLabel\?: string/);
  assert.match(session, /resolveSmsPoolServiceLabels/);
  assert.match(session, /serviceLabels\.get\(String\(activation\.product\)\)/);

  assert.match(labels, /retrieveSmsPoolServices\(\)/);
  assert.match(labels, /CACHE_TTL_MS/);

  assert.match(display, /\^\\d\+\$/);
  assert.match(display, /serviço selecionado/);
  assert.match(display, /Intl\.DisplayNames/);

  assert.match(tracking, /activationProductName\(activation\.product, activation\.productLabel\)/);
  assert.match(tracking, /terminalActivationMessage/);
  assert.doesNotMatch(tracking, /Número para \{activation\.product\}/);

  assert.match(page, /productLabel\?: string/);
  assert.match(page, /activationProductName\(activation\.product, activation\.productLabel\)/);
  assert.match(page, /activationCountryName\(activation\.country\)/);
});
