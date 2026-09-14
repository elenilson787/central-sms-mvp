import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin real Discord test purchase is previewed, explicitly confirmed, policy-gated, and admin-only", async () => {
  const route = await readFile(new URL("../app/api/admin/activations/test-purchase/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

  assert.match(route, /isAdminRequest\(request\)/);
  assert.match(route, /TEST_SERVICE_LABEL = "Discord"/);
  assert.match(route, /TEST_COUNTRY_SELECTOR = "BR"/);
  assert.match(route, /listSmsPoolLiveCatalog\(TEST_COUNTRY_SELECTOR\)/);
  assert.match(route, /assertServiceAllowed\("smspool", offer\.product\)/);
  assert.match(route, /BUY_ONE_REAL_DISCORD_BR/);
  assert.match(route, /purchaseActivation\(/);
  assert.match(route, /idempotencyKey/);
  assert.match(route, /canExecute/);

  assert.match(route, /action.*approve_service/s);
  assert.match(route, /APPROVE_DISCORD_BR_STANDARD/);
  assert.match(route, /isRiskCategoryBlocked/);
  assert.match(route, /EXISTING_SERVICE_POLICY_REQUIRES_MANUAL_REVIEW/);
  assert.match(route, /risk_category: "standard"/);
  assert.match(route, /provider: "smspool"/);
  assert.match(route, /product: offer\.product/);
  assert.match(route, /DISCORD_BR_OFFER_NOT_FOUND/);

  // The public country code is BR, but purchaseActivation reconstructs the
  // provider offer id and therefore must receive SMSPool's canonical country ID.
  assert.match(route, /countryId: offer\.countryId/);
  assert.match(route, /country: preview\.offer\.countryId/);
  assert.doesNotMatch(route, /country: preview\.offer\.country,\n\s+operator:/);

  assert.match(page, /Compra real controlada — Discord/);
  assert.match(page, /action: "preview"/);
  assert.match(page, /APROVAR DISCORD PARA O TESTE/);
  assert.match(page, /action: "approve_service"/);
  assert.match(page, /APPROVE_DISCORD_BR_STANDARD/);
  assert.match(page, /Nenhum número será comprado nesta etapa/);
  assert.match(page, /Será comprado EXATAMENTE 1 número real/);
  assert.match(page, /action: "execute"/);
  assert.match(page, /BUY_ONE_REAL_DISCORD_BR/);
  assert.match(page, /admin-test:discord/);
  assert.match(page, /crypto\.randomUUID\(\)/);

  assert.doesNotMatch(route, /BUY_ONE_REAL_YOUTUBE_BR/);
  assert.doesNotMatch(page, /APROVAR YOUTUBE PARA O TESTE/);
});
