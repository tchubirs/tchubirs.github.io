// Testes do adaptador HTTP (src/handler.ts e src/index.ts). O core é injetado com um fake que
// registra as chamadas: nenhum teste chama a API paga, mesmo com chave presente.
import test from "node:test";
import assert from "node:assert/strict";
import { criarWorker } from "../src/handler.ts";
import worker from "../src/index.ts";
import { criarFakeD1 } from "./fake-d1.mjs";

const ORIGEM = "https://site.test";
const CHAVE = "sk-ant-TESTE-NAO-VAZAR";
const CORPO_VALIDO = { liveId: "abc", deMs: 0, ateMs: 1000, quadros: [], transcricao: "" };

function ambiente(extra = {}) {
  const chamadasAssets = [];
  return {
    CONTEXTO_ATIVO: "1",
    DB: criarFakeD1(),
    ANTHROPIC_API_KEY: CHAVE,
    CONTEXTO_LIMITE_CHAMADAS_DIA: "40",
    CONTEXTO_LIMITE_CANDIDATOS_LIVE: "20",
    CONTEXTO_ORCAMENTO_MENSAL_USD: "0.50",
    ASSETS: {
      fetch: async (req) => {
        chamadasAssets.push(req);
        return new Response("<html>ok</html>", { status: 200 });
      },
    },
    chamadasAssets,
    ...extra,
  };
}

function criarFake(resposta = { status: 200, corpo: { contexto: { tipo: "combate" }, doCache: false } }) {
  const chamadas = [];
  const tratar = async (corpo, ctx, sinal) => {
    chamadas.push({ corpo, ctx, sinal });
    return resposta;
  };
  const saude = () => ({ status: 200, corpo: { ok: true, temChave: true, versaoContrato: 1 } });
  return { chamadas, deps: { tratar, saude } };
}

function pedido(corpo, headers = {}, metodo = "POST", url = `${ORIGEM}/api/contexto-rust`) {
  const texto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return new Request(url, {
    method: metodo,
    headers: { origin: ORIGEM, "content-type": "application/json", ...headers },
    body: metodo === "GET" || metodo === "HEAD" ? undefined : texto,
  });
}

test("CONTEXTO_ATIVO ausente ou diferente de 1 -> 503 e o core nao e chamado", async () => {
  for (const ativo of ["0", "", undefined]) {
    const { chamadas, deps } = criarFake();
    const r = await criarWorker(deps).fetch(pedido(CORPO_VALIDO), ambiente({ CONTEXTO_ATIVO: ativo }));
    assert.equal(r.status, 503);
    assert.equal((await r.json()).erro, "contexto_desativado");
    assert.equal(chamadas.length, 0);
  }
});

test("/health: ok e temChave falsos quando CONTEXTO_ATIVO != 1, sem expor a chave", async () => {
  const { deps } = criarFake();
  const r = await criarWorker(deps).fetch(new Request(`${ORIGEM}/health`), ambiente({ CONTEXTO_ATIVO: "0" }));
  const texto = await r.text();
  const corpo = JSON.parse(texto);
  assert.equal(r.status, 200);
  assert.equal(corpo.ok, false);
  assert.equal(corpo.temChave, false);
  assert.ok(!texto.includes(CHAVE), "a chave nunca aparece na resposta");
});

test("/health: sem DB -> ok/temChave falsos; com flag e DB -> verdadeiros", async () => {
  const { deps } = criarFake();
  const semDb = await criarWorker(deps).fetch(new Request(`${ORIGEM}/health`), ambiente({ DB: undefined }));
  assert.equal((await semDb.json()).ok, false);
  const pronto = await criarWorker(deps).fetch(new Request(`${ORIGEM}/health`), ambiente());
  const corpo = await pronto.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.temChave, true);
  assert.ok(!JSON.stringify(corpo).includes(CHAVE));
});

test("/health aceita so GET", async () => {
  const { deps } = criarFake();
  const r = await criarWorker(deps).fetch(pedido({}, {}, "POST", `${ORIGEM}/health`), ambiente());
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET");
});

test("metodo diferente de POST em /api/contexto-rust -> 405 com Allow", async () => {
  const { chamadas, deps } = criarFake();
  const r = await criarWorker(deps).fetch(new Request(`${ORIGEM}/api/contexto-rust`, { headers: { origin: ORIGEM } }), ambiente());
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "POST");
  assert.equal(chamadas.length, 0);
});

test("Origin de outro site -> 403, sem chamar o core", async () => {
  const { chamadas, deps } = criarFake();
  const r = await criarWorker(deps).fetch(pedido(CORPO_VALIDO, { origin: "https://evil.example" }), ambiente());
  assert.equal(r.status, 403);
  assert.equal(chamadas.length, 0);
});

test("sem Origin e sem Sec-Fetch-Site same-origin -> 403", async () => {
  const { chamadas, deps } = criarFake();
  const req = new Request(`${ORIGEM}/api/contexto-rust`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const r = await criarWorker(deps).fetch(req, ambiente());
  assert.equal(r.status, 403);
  assert.equal(chamadas.length, 0);
});

test("Origin igual ao da URL -> aceito; Sec-Fetch-Site same-origin sem Origin -> aceito", async () => {
  const { chamadas, deps } = criarFake();
  const w = criarWorker(deps);
  const a = await w.fetch(pedido(CORPO_VALIDO), ambiente());
  assert.equal(a.status, 200);
  const b = await w.fetch(
    new Request(`${ORIGEM}/api/contexto-rust`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(CORPO_VALIDO),
    }),
    ambiente(),
  );
  assert.equal(b.status, 200);
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[0].corpo, CORPO_VALIDO);
});

test("Content-Type diferente de application/json -> 415", async () => {
  const { chamadas, deps } = criarFake();
  const r = await criarWorker(deps).fetch(pedido(CORPO_VALIDO, { "content-type": "text/plain" }), ambiente());
  assert.equal(r.status, 415);
  assert.equal(chamadas.length, 0);
});

test("JSON invalido -> 400", async () => {
  const { chamadas, deps } = criarFake();
  const r = await criarWorker(deps).fetch(pedido("{nao-e-json"), ambiente());
  assert.equal(r.status, 400);
  assert.equal((await r.json()).erro, "json_invalido");
  assert.equal(chamadas.length, 0);
});

test("corpo real acima de 6MB sem Content-Length -> 413, mesmo em stream", async () => {
  const { chamadas, deps } = criarFake();
  const limite = 6 * 1024 * 1024;
  const pedaco = new TextEncoder().encode("a".repeat(64 * 1024));
  let enviados = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (enviados > limite + 1) return controller.close();
      enviados += pedaco.byteLength;
      controller.enqueue(pedaco);
    },
  });
  const req = new Request(`${ORIGEM}/api/contexto-rust`, {
    method: "POST",
    headers: { origin: ORIGEM, "content-type": "application/json" },
    body: stream,
    duplex: "half",
  });
  const r = await criarWorker(deps).fetch(req, ambiente());
  assert.equal(r.status, 413);
  assert.equal(chamadas.length, 0);
  assert.ok(enviados < limite + 1024 * 1024, "a leitura para logo apos passar do cap");
});

test("corpo logo abaixo do cap e aceito e chega ao core", async () => {
  const { chamadas, deps } = criarFake();
  const grande = { ...CORPO_VALIDO, transcricao: "x".repeat(1024 * 1024) };
  const r = await criarWorker(deps).fetch(pedido(grande), ambiente());
  assert.equal(r.status, 200);
  assert.equal(chamadas[0].corpo.transcricao.length, 1024 * 1024);
});

test("UTF-8 partido entre chunks continua correto (portugues)", async () => {
  const { chamadas, deps } = criarFake();
  const texto = "ação, coração, ótimo, não é?";
  const bytes = new TextEncoder().encode(JSON.stringify({ ...CORPO_VALIDO, transcricao: texto }));
  // Um byte por chunk: quebra todos os caracteres multibyte no meio.
  const stream = new ReadableStream({
    start(controller) {
      for (const b of bytes) controller.enqueue(new Uint8Array([b]));
      controller.close();
    },
  });
  const req = new Request(`${ORIGEM}/api/contexto-rust`, {
    method: "POST",
    headers: { origin: ORIGEM, "content-type": "application/json" },
    body: stream,
    duplex: "half",
  });
  const r = await criarWorker(deps).fetch(req, ambiente());
  assert.equal(r.status, 200);
  assert.equal(chamadas[0].corpo.transcricao, texto);
});

test("demais rotas sao encaminhadas para env.ASSETS.fetch", async () => {
  const { deps } = criarFake();
  const env = ambiente();
  const req = new Request(`${ORIGEM}/cena/index.html?x=1`);
  const r = await criarWorker(deps).fetch(req, env);
  assert.equal(await r.text(), "<html>ok</html>");
  assert.equal(env.chamadasAssets.length, 1);
  assert.equal(env.chamadasAssets[0], req);
});

test("/api desconhecida responde 404 JSON e nao vai para assets", async () => {
  const { deps } = criarFake();
  const env = ambiente();
  const r = await criarWorker(deps).fetch(new Request(`${ORIGEM}/api/outra`), env);
  assert.equal(r.status, 404);
  assert.equal(env.chamadasAssets.length, 0);
});

test("default export do index.ts: desativado responde 503 sem tocar no DB", async () => {
  const r = await worker.fetch(pedido(CORPO_VALIDO), ambiente({ CONTEXTO_ATIVO: "0", DB: undefined }));
  assert.equal(r.status, 503);
});

test("respostas do adaptador nao devolvem CORS wildcard", async () => {
  const { deps } = criarFake();
  const r = await criarWorker(deps).fetch(pedido(CORPO_VALIDO), ambiente({ CONTEXTO_ATIVO: "0" }));
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
