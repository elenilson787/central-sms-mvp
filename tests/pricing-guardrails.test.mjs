import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("one-time pricing uses operational FX, markup and a minimum sale price", async () => {
  const env = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");
  const quote = await readFile(new URL("../src/pricing/quote.ts", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(env, /DEFAULT_MARKUP_PERCENT"\) \?\? "35"/);
  assert.match(env, /DEFAULT_MARKUP_FIXED_BRL_CENTS"\) \?\? "50"/);
  assert.match(env, /MIN_SALE_PRICE_BRL_CENTS"\) \?\? "99"/);

  assert.match(quote, /minimumSalePriceBrlCents/);
  assert.match(quote, /Math\.max\(calculatedSalePriceCents, minimumSalePriceBrlCents\)/);
  assert.match(quote, /salePriceCents - providerCostBrlCents/);

  assert.match(example, /^PROVIDER_TO_BRL_RATE=5\.30$/m);
  assert.match(example, /^DEFAULT_MARKUP_PERCENT=35$/m);
  assert.match(example, /^DEFAULT_MARKUP_FIXED_BRL_CENTS=50$/m);
  assert.match(example, /^MIN_SALE_PRICE_BRL_CENTS=99$/m);
});

test("long-term rental pricing uses cost-based margin tiers", async () => {
  const env = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");
  const quote = await readFile(new URL("../src/pricing/quote.ts", import.meta.url), "utf8");
  const rentalCatalog = await readFile(new URL("../src/providers/smspool/rental-catalog.ts", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(env, /RENTAL_LOW_COST_MAX_BRL_CENTS"\) \?\? "500"/);
  assert.match(env, /RENTAL_MID_COST_MAX_BRL_CENTS"\) \?\? "3000"/);
  assert.match(env, /RENTAL_LOW_MARKUP_PERCENT"\) \?\? "35"/);
  assert.match(env, /RENTAL_MID_MARKUP_PERCENT"\) \?\? "25"/);
  assert.match(env, /RENTAL_HIGH_MARKUP_PERCENT"\) \?\? "15"/);
  assert.match(env, /RENTAL_LOW_MARKUP_FIXED_BRL_CENTS"\) \?\? "50"/);
  assert.match(env, /RENTAL_MID_MARKUP_FIXED_BRL_CENTS"\) \?\? "100"/);
  assert.match(env, /RENTAL_HIGH_MARKUP_FIXED_BRL_CENTS"\) \?\? "200"/);

  assert.match(quote, /export function quoteRentalOffer/);
  assert.match(quote, /providerCostBrlCents <= lowMax/);
  assert.match(quote, /providerCostBrlCents <= midMax/);
  assert.match(rentalCatalog, /quoteRentalOffer\(offer\)/);
  assert.doesNotMatch(rentalCatalog, /quoteOffer\(offer\)/);

  assert.match(example, /^RENTAL_LOW_COST_MAX_BRL_CENTS=500$/m);
  assert.match(example, /^RENTAL_MID_COST_MAX_BRL_CENTS=3000$/m);
  assert.match(example, /^RENTAL_HIGH_MARKUP_PERCENT=15$/m);
});
