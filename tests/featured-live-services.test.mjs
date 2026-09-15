import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Mini App featured shortcuts are derived from approved live offers", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolCatalogPanel.tsx", import.meta.url), "utf8");

  for (const service of ["Discord", "Telegram", "Google", "Microsoft", "Steam", "TikTok", "Instagram", "Facebook", "YouTube"]) {
    assert.match(panel, new RegExp(`label: \\\"${service}\\\"`));
  }

  assert.match(panel, /offer\.stock !== null/);
  assert.match(panel, /offer\.stock > 0/);
  assert.match(panel, /offer\.pricingConfigured/);
  assert.match(panel, /offer\.salePriceCents !== null/);
  assert.match(panel, /availableFeaturedServices/);
  assert.match(panel, /Disponíveis agora:/);
  assert.doesNotMatch(panel, /const QUICK_SEARCHES/);
});
