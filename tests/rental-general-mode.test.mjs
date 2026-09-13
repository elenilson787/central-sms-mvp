import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rental catalog distinguishes general rentals from service-specific rentals", async () => {
  const catalog = await readFile(new URL("../src/providers/smspool/rental-catalog.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/miniapp/SmsPoolRentalPanel.tsx", import.meta.url), "utf8");

  assert.match(catalog, /SmsPoolRentalServiceMode = "GENERAL" \| "SERVICE_SPECIFIC"/);
  assert.match(catalog, /services\.length > 0 \? "SERVICE_SPECIFIC" : "GENERAL"/);
  assert.match(catalog, /SERVICE_REQUIRED_FOR_RENTAL/);
  assert.match(panel, /Aluguel geral/);
  assert.match(panel, /não precisa escolher um app ou site/);
  assert.match(panel, /Consultar disponibilidade do aluguel/);
});
