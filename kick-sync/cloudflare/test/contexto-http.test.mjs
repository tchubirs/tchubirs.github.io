// node:test coverage for the pure Request helpers (Origin check + streaming body cap) used by
// app/api/contexto-rust/route.ts, independent of Next.js/Workers so a plain Request suffices.
import test from "node:test";
import assert from "node:assert/strict";
import { mesmaOrigem, lerCorpoLimitado } from "../lib/contexto-http.ts";

function req(url, headers = {}, body) {
  return new Request(url, { method: "POST", headers, body });
}

test("Origin ausente mas Sec-Fetch-Site same-origin -> aceito", () => {
  const r = req("https://meusite.example/api/contexto-rust", { "sec-fetch-site": "same-origin" });
  assert.equal(mesmaOrigem(r), true);
});

test("Origin igual ao proprio -> aceito", () => {
  const r = req("https://meusite.example/api/contexto-rust", { origin: "https://meusite.example" });
  assert.equal(mesmaOrigem(r), true);
});

test("Origin de outro site -> recusado (403 no route)", () => {
  const r = req("https://meusite.example/api/contexto-rust", { origin: "https://outro.example" });
  assert.equal(mesmaOrigem(r), false);
});

test("sem Origin e sem Sec-Fetch-Site -> recusado por padrao", () => {
  const r = req("https://meusite.example/api/contexto-rust", {});
  assert.equal(mesmaOrigem(r), false);
});

test("corpo dentro do limite -> le o texto completo", async () => {
  const r = req("https://x.example/api/contexto-rust", {}, "a".repeat(100));
  const lido = await lerCorpoLimitado(r, 1000);
  assert.equal("excedeu" in lido, false);
  assert.equal(lido.texto.length, 100);
});

test("Content-Length declarado acima do teto -> recusado antes de ler o stream", async () => {
  const r = req("https://x.example/api/contexto-rust", { "content-length": "999999999" }, "a");
  const lido = await lerCorpoLimitado(r, 1000);
  assert.deepEqual(lido, { excedeu: true });
});

test("corpo real maior que o teto (sem Content-Length correto) -> cortado durante o streaming", async () => {
  const grande = "a".repeat(5000);
  const r = req("https://x.example/api/contexto-rust", {}, grande);
  const lido = await lerCorpoLimitado(r, 1000);
  assert.deepEqual(lido, { excedeu: true });
});
