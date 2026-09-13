import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("one-time purchase UI has a two-step review and remains non-executing", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  assert.match(panel, /Continuar para revisão/);
  assert.match(panel, /Revise seu pedido/);
  assert.match(panel, /Saldo após a compra/);
  assert.match(panel, /Confirmar compra — aguardando liberação/);
  assert.match(panel, /disabled/);
  assert.match(panel, /preço e o estoque serão conferidos novamente no servidor/);
  assert.doesNotMatch(panel, /\/api\/admin\/activations\/purchase/);
  assert.doesNotMatch(panel, /\/api\/telegram\/miniapp\/.*purchase/);
});
