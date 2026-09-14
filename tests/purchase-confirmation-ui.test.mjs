import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("one-time purchase UI keeps two-step review and only executes when commercial gate is open", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  assert.match(panel, /Continuar para revisão/);
  assert.match(panel, /Revise seu pedido/);
  assert.match(panel, /Saldo após a compra/);
  assert.match(panel, /Confirmar compra — aguardando liberação/);
  assert.match(panel, /quote\.purchaseExecutionEnabled/);
  assert.match(panel, /\/api\/telegram\/miniapp\/catalog\/purchase/);
  assert.match(panel, /BUY_ONE_REAL_SMS/);
  assert.match(panel, /reviewedOfferId: quote\.offer\.id/);
  assert.match(panel, /reviewedSalePriceCents: quote\.price\.salePriceCents/);
  assert.match(panel, /purchaseKeyRef/);
  assert.match(panel, /crypto\.randomUUID\(\)/);
  assert.match(panel, /preço, o pool e o estoque serão conferidos novamente no servidor/i);
  assert.doesNotMatch(panel, /\/api\/admin\/activations\/purchase/);
});