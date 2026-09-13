import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mini App exposes and renders activation SMS tracking data", async () => {
  const page = await readFile(new URL("../app/miniapp/page.tsx", import.meta.url), "utf8");
  const tracking = await readFile(new URL("../app/miniapp/ActivationTracking.tsx", import.meta.url), "utf8");
  const session = await readFile(new URL("../src/telegram/miniapp-session.ts", import.meta.url), "utf8");
  const sharedStyles = await readFile(new URL("../app/miniapp/page.module.css", import.meta.url), "utf8");

  assert.match(page, /Minhas ativações/);
  assert.match(page, /Acompanhar número, status e código SMS/);
  assert.match(page, /10_000/);
  assert.match(page, /ActivationTracking/);

  assert.match(session, /sms_code/);
  assert.match(session, /sms_text/);
  assert.match(session, /updated_at/);
  assert.match(session, /\.limit\(20\)/);

  assert.match(tracking, /Acompanhamento ao vivo ativado/);
  assert.match(tracking, /Aguardando SMS/);
  assert.match(tracking, /SMS recebido/);
  assert.match(tracking, /Copiar número/);
  assert.match(tracking, /Copiar código/);

  assert.match(sharedStyles, /\.primaryButton:disabled/);
  assert.match(sharedStyles, /cursor: not-allowed/);
});
