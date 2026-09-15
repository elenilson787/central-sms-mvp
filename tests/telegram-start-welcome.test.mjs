import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const handlerPath = new URL("../src/telegram/handler.ts", import.meta.url);

test("Telegram /start welcomes public beta users and opens the Mini App", async () => {
  const source = await readFile(handlerPath, "utf8");

  assert.match(source, /Bem-vindo à Central SMS!/);
  assert.match(source, /Recarregue sua carteira via PIX/);
  assert.match(source, /Confira preço, disponibilidade e taxa de sucesso/);
  assert.match(source, /Recomendados agora/);
  assert.match(source, /beta público/);
  assert.match(source, /📲 Abrir Central SMS/);
  assert.match(source, /web_app:\s*\{ url: miniAppUrl \}/);
  assert.doesNotMatch(source, /Compras reais de números permanecem bloqueadas/);
});
