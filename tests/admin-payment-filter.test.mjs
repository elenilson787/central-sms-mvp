import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin payments default to production and can switch to test/all", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /useState<PaymentFilter>\("production"\)/);
  assert.match(page, /paymentFilter === "all" \|\| payment\.environment === paymentFilter/);
  assert.match(page, />Produção<\/button>/);
  assert.match(page, />Teste<\/button>/);
  assert.match(page, />Todos<\/button>/);
});
