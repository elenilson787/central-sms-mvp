import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SMSPool customer catalog filters provider-prohibited service categories", async () => {
  const policy = await readFile(new URL("../src/compliance/smspool-catalog.ts", import.meta.url), "utf8");

  assert.match(policy, /FINANCIAL_TERMS/);
  assert.match(policy, /CRYPTO_TERMS/);
  assert.match(policy, /GOVERNMENT_TERMS/);
  assert.match(policy, /IDENTITY_TERMS/);
  assert.match(policy, /TELECOM_TERMS/);
  assert.match(policy, /FRAUD_ABUSE_TERMS/);
  assert.match(policy, /not listed/);
  assert.match(policy, /unlisted_requires_manual_review/);
});

test("WhatsApp remains hidden until the provider whitelist is explicitly approved", async () => {
  const env = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const policy = await readFile(new URL("../src/compliance/smspool-catalog.ts", import.meta.url), "utf8");

  assert.match(env, /SMSPOOL_WHATSAPP_WHITELIST_APPROVED/);
  assert.match(example, /^SMSPOOL_WHATSAPP_WHITELIST_APPROVED=false$/m);
  assert.match(policy, /smsPoolWhatsAppWhitelistApproved/);
  assert.match(policy, /provider_whitelist_required/);
  assert.match(policy, /whatsapp/);
});

test("one-time and rental customer catalogs both enforce the visibility filter", async () => {
  const catalog = await readFile(new URL("../src/providers/smspool/catalog.ts", import.meta.url), "utf8");
  const rental = await readFile(new URL("../src/providers/smspool/rental-catalog.ts", import.meta.url), "utf8");

  assert.match(catalog, /isSmsPoolCatalogServiceVisible/);
  assert.match(catalog, /assertSmsPoolCatalogServiceVisible/);
  assert.match(rental, /isSmsPoolCatalogServiceVisible/);
  assert.match(rental, /SERVICE_BLOCKED_OR_NOT_AVAILABLE/);

  assert.doesNotMatch(catalog, /purchaseSmsPoolNumber/);
  assert.doesNotMatch(rental, /purchaseSmsPoolNumber|purchase_rental|\/rental\/order/);
});
