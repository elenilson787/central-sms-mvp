import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rental UI supports both search and a dropdown of available services", async () => {
  const panel = await readFile(new URL("../app/miniapp/SmsPoolRentalPanel.tsx", import.meta.url), "utf8");

  assert.match(panel, /Ou escolha na lista de serviços disponíveis/);
  assert.match(panel, /rental-service-select/);
  assert.match(panel, /details\.services\.map/);
  assert.match(panel, /serviços disponíveis nesta opção/);
  assert.match(panel, /O número específico só é atribuído quando a compra for liberada/);
});
