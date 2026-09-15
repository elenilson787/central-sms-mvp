import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mini App recommendations use live success rate and keep lower-quality services searchable", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  for (const service of ["Discord", "Telegram", "Google", "Microsoft", "Steam", "TikTok", "Instagram", "Facebook", "YouTube"]) {
    assert.match(panel, new RegExp(`label: \\\"${service}\\\"`));
  }

  assert.match(panel, /offer\.pricingConfigured/);
  assert.match(panel, /offer\.salePriceCents !== null/);
  assert.match(panel, /RECOMMENDED_SUCCESS_RATE = 60/);
  assert.match(panel, /MODERATE_SUCCESS_RATE = 40/);
  assert.match(panel, /catalog\/quote/);
  assert.match(panel, /qualityTier/);
  assert.match(panel, /tier === "good"/);
  assert.match(panel, /Recomendados agora:/);
  assert.match(panel, /taxa de sucesso de 60% ou mais/);
  assert.match(panel, /Disponibilidade moderada/);
  assert.match(panel, /Baixa taxa de sucesso/);
  assert.match(panel, /Você ainda pode procurar qualquer serviço aprovado pela busca/);
  assert.doesNotMatch(panel, /const QUICK_SEARCHES/);
});
