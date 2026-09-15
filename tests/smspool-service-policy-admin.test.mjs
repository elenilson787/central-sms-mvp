import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SMSPool service policy admin is authenticated and compliance-gated", async () => {
  const route = await readFile(new URL("../app/api/admin/providers/smspool/service-policies/route.ts", import.meta.url), "utf8");

  assert.match(route, /isAdminRequest/);
  assert.match(route, /getSmsPoolCatalogBlockReason/);
  assert.match(route, /isRiskCategoryBlocked/);
  assert.match(route, /retrieveSmsPoolPricing/);
  assert.match(route, /service_policies/);
  assert.match(route, /approve_recommended/);
  assert.match(route, /audit_logs/);
  assert.doesNotMatch(route, /purchaseSmsPoolNumber/);
  assert.doesNotMatch(route, /wallet_apply_transaction/);
});

test("SMSPool service policy admin UI keeps manual control over recommended services", async () => {
  const page = await readFile(new URL("../app/admin/providers/smspool/services/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Aprovar recomendados disponíveis/);
  assert.match(page, /Consultar Brasil/);
  assert.match(page, /ADMIN_API_TOKEN/);
  assert.match(page, /Aprovado/);
  assert.match(page, /Desativar/);
  assert.match(page, /estoque e preço final continuam sendo revalidados/);
});
