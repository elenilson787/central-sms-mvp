import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("quote UX distinguishes stock availability from route quality", async () => {
  const styles = await readFile(new URL("../app/miniapp/page.module.css", import.meta.url), "utf8");

  assert.match(styles, /content: "Melhor disponível"/);
  assert.match(styles, /\.warnNotice \+ \.okNotice/);
  assert.match(styles, /Números em estoque/);
  assert.match(styles, /Isso indica apenas disponibilidade e não altera a taxa de sucesso exibida acima/);
});
