import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pricing uses operational FX, markup and a minimum sale price", async () => {
  const env = await readFile(new URL("../src/config/env.ts", import.meta.url), "utf8");
  const quote = await readFile(new URL("../src/pricing/quote.ts", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(env, /DEFAULT_MARKUP_PERCENT"\) \?\? "35"/);
  assert.match(env, /DEFAULT_MARKUP_FIXED_BRL_CENTS"\) \?\? "50"/);
  assert.match(env, /MIN_SALE_PRICE_BRL_CENTS"\) \?\? "150"/);

  assert.match(quote, /minimumSalePriceBrlCents/);
  assert.match(quote, /Math\.max\(calculatedSalePriceCents, minimumSalePriceBrlCents\)/);
  assert.match(quote, /salePriceCents - providerCostBrlCents/);

  assert.match(example, /^PROVIDER_TO_BRL_RATE=5\.30$/m);
  assert.match(example, /^DEFAULT_MARKUP_PERCENT=35$/m);
  assert.match(example, /^DEFAULT_MARKUP_FIXED_BRL_CENTS=50$/m);
  assert.match(example, /^MIN_SALE_PRICE_BRL_CENTS=150$/m);
});
