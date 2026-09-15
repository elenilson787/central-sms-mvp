import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/admin/operations/dashboard/route.ts", import.meta.url);
const pagePath = new URL("../app/admin/operations/page.tsx", import.meta.url);

test("operations dashboard is admin-only and aggregates the beta signals", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /isAdminRequest/);
  assert.match(source, /getPublicBetaGlobalGuardrailSnapshot/);
  assert.match(source, /retrieveSmsPoolBalance/);
  assert.match(source, /pixReceivedCents/);
  assert.match(source, /grossMarginPercent/);
  assert.match(source, /realSuccessRate/);
  assert.match(source, /circuit_breaker_open/);
  assert.match(source, /refund_rate_high/);
});

test("operations dashboard UI exposes money, quality, alerts and limits", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /PIX recebido/);
  assert.match(source, /Receita SMS/);
  assert.match(source, /Custo SMSPool/);
  assert.match(source, /Margem bruta/);
  assert.match(source, /Taxa de sucesso real/);
  assert.match(source, /Alertas operacionais/);
  assert.match(source, /Capacidade e travas globais/);
  assert.match(source, /Circuit breaker/);
});
