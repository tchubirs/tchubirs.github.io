import test from "node:test";
import assert from "node:assert/strict";
import { criarFakeD1 } from "./fake-d1.mjs";
import { tratarContextoRust, respostaSaude } from "../lib/contexto-api.ts";

function jpegFalso(tamanho = 2000) {
  return "/9j/" + "A".repeat(tamanho);
}

function pedidoValidoBase() {
  return {
    quadros: [
      { jpegBase64: jpegFalso(), legendaInstante: "~0s" },
      { jpegBase64: jpegFalso(), legendaInstante: "~1s" },
      { jpegBase64: jpegFalso(), legendaInstante: "~2s" },
    ],
    transcricao: "",
    canal: "um_canal",
    liveId: "live1",
    deMs: 1000,
    ateMs: 5000,
  };
}

function respostaModeloValida(overrides = {}) {
  return JSON.stringify({
    tipo: "ambiente",
    participacao: "ausente",
    evidencias: { visuais: ["jogador andando, sem arma, nenhum inimigo visivel"], fala: [] },
    resumo: "jogador andando tranquilo, sem evidencia de combate",
    ...overrides,
  });
}

function fetchOk(texto, usage = { input_tokens: 500, output_tokens: 80 }) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text: texto }], usage }),
  });
}

function baseEnv(overrides = {}) {
  return {
    db: criarFakeD1(),
    apiKey: "sk-test-key",
    fetchImpl: fetchOk(respostaModeloValida()),
    agora: () => new Date("2026-10-14T12:00:00.000Z"),
    ...overrides,
  };
}

test("sem chave -> 503 sem_chave, sem tentar rede", async () => {
  let chamou = false;
  const env = baseEnv({ apiKey: undefined, fetchImpl: async () => { chamou = true; throw new Error("nao devia chamar"); } });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.erro, "sem_chave");
  assert.equal(chamou, false);
});

test("sem base (D1) -> 503 sem_base, antes de qualquer chamada paga", async () => {
  let chamou = false;
  const env = baseEnv({ db: undefined, fetchImpl: async () => { chamou = true; throw new Error("nao devia chamar"); } });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.erro, "sem_base");
  assert.equal(chamou, false);
});

test("corpo bruto invalido -> 400 pedido_invalido, nunca chama a API", async () => {
  let chamou = false;
  const env = baseEnv({ fetchImpl: async () => { chamou = true; throw new Error("nao devia chamar"); } });
  const r = await tratarContextoRust({ quadros: [] }, env);
  assert.equal(r.status, 400);
  assert.equal(r.corpo.erro, "pedido_invalido");
  assert.equal(chamou, false);
});

test("health: ok reflete temChave, nunca finge pronto sem chave", () => {
  const semChave = respostaSaude({ db: criarFakeD1(), apiKey: undefined });
  assert.equal(semChave.corpo.ok, false);
  assert.equal(semChave.corpo.temChave, false);
  const comChave = respostaSaude({ db: criarFakeD1(), apiKey: "sk-x" });
  assert.equal(comChave.corpo.ok, true);
  assert.equal(comChave.corpo.temChave, true);
  assert.equal(typeof comChave.corpo.versaoContrato, "number");
  assert.ok(comChave.corpo.limites);
});

test("pedido valido: normaliza modelo, registra fala recebida, devolve o veredito validado", async () => {
  let corpoEnviado;
  const env = baseEnv({
    modelo: "claude-sonnet-5",
    fetchImpl: async (_url, init) => {
      corpoEnviado = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], usage: { input_tokens: 400, output_tokens: 60 } }) };
    },
  });
  const pedido = { ...pedidoValidoBase(), transcricao: "oi gente" };
  const r = await tratarContextoRust(pedido, env);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.contexto.tipo, "ambiente");
  assert.equal(r.corpo.contexto.recebeuFala, true);
  assert.equal(r.corpo.contexto.origem, "ia-remota");
  assert.equal(corpoEnviado.model, "claude-sonnet-5");
  assert.equal(corpoEnviado.max_tokens, 1200);
  assert.ok(corpoEnviado.messages[0].content.some((c) => c.type === "text" && c.text.includes("oi gente")));
});

test("cache: a segunda chamada identica nao gasta uma nova chamada ao modelo", async () => {
  let chamadas = 0;
  const env = baseEnv({ fetchImpl: async () => { chamadas++; return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], usage: { input_tokens: 10, output_tokens: 10 } }) }; } });
  const pedido = pedidoValidoBase();
  const r1 = await tratarContextoRust(pedido, env);
  assert.equal(r1.status, 200);
  const r2 = await tratarContextoRust(pedido, env);
  assert.equal(r2.status, 200);
  assert.equal(r2.corpo.doCache, true);
  assert.equal(chamadas, 1);
});

test("cache antes de quota: um candidato ja em cache ainda responde com o teto do dia esgotado", async () => {
  const db = criarFakeD1();
  let chamadas = 0;
  const fetchImpl = async () => { chamadas++; return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], usage: { input_tokens: 10, output_tokens: 10 } }) }; };
  const env = baseEnv({ db, fetchImpl, limiteChamadasDia: "1" });
  const primeiro = pedidoValidoBase();
  const r1 = await tratarContextoRust(primeiro, env);
  assert.equal(r1.status, 200);

  const segundo = { ...pedidoValidoBase(), deMs: 9000, ateMs: 13000 };
  const r2 = await tratarContextoRust(segundo, env);
  assert.equal(r2.status, 429);
  assert.equal(r2.corpo.erro, "teto_dia");

  const r3 = await tratarContextoRust(primeiro, env);
  assert.equal(r3.status, 200);
  assert.equal(r3.corpo.doCache, true);
  assert.equal(chamadas, 1);
});

test("teto por live: o 3o candidato de uma mesma live e recusado quando o teto e 2", async () => {
  const db = criarFakeD1();
  const env = baseEnv({ db, limiteCandidatosLive: "2", limiteChamadasDia: "100" });
  const p1 = { ...pedidoValidoBase(), deMs: 0, ateMs: 4000 };
  const p2 = { ...pedidoValidoBase(), deMs: 10000, ateMs: 14000 };
  const p3 = { ...pedidoValidoBase(), deMs: 20000, ateMs: 24000 };
  assert.equal((await tratarContextoRust(p1, env)).status, 200);
  assert.equal((await tratarContextoRust(p2, env)).status, 200);
  const r3 = await tratarContextoRust(p3, env);
  assert.equal(r3.status, 429);
  assert.equal(r3.corpo.erro, "teto_candidatos");
});

test("reserva atomica concorrente: pedidos identicos em paralelo fazem so uma chamada paga", async () => {
  const db = criarFakeD1();
  let chamadas = 0;
  const fetchImpl = async () => {
    chamadas++;
    await new Promise((res) => setTimeout(res, 20));
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], usage: { input_tokens: 5, output_tokens: 5 } }) };
  };
  const env = baseEnv({ db, fetchImpl });
  const pedido = pedidoValidoBase();
  const [r1, r2] = await Promise.all([
    tratarContextoRust(pedido, env),
    tratarContextoRust(pedido, env),
  ]);
  assert.equal(chamadas, 1);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

test("abort do pedido pelo cliente -> 504 tempo_esgotado, sem segredo no corpo", async () => {
  const env = baseEnv({
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      const rejeitarAbortado = () => {
        const erro = new Error("aborted");
        erro.name = "AbortError";
        reject(erro);
      };
      if (init.signal.aborted) rejeitarAbortado();
      else init.signal.addEventListener("abort", rejeitarAbortado);
    }),
  });
  const controlador = new AbortController();
  const promessa = tratarContextoRust(pedidoValidoBase(), env, controlador.signal);
  controlador.abort();
  const r = await promessa;
  assert.equal(r.status, 504);
  assert.equal(r.corpo.erro, "tempo_esgotado");
  assert.equal(JSON.stringify(r.corpo).includes("sk-test-key"), false);
});

test("erro do modelo (5xx) -> 502 falha_api, nunca ecoa a chave", async () => {
  const env = baseEnv({ fetchImpl: async () => ({ ok: false, status: 529, json: async () => ({ error: "overloaded" }) }) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "falha_api");
  assert.equal(JSON.stringify(r.corpo).includes("sk-test-key"), false);
});

test("resposta do modelo fora do contrato -> 502 contexto_invalido", async () => {
  const semEvidencia = JSON.stringify({
    tipo: "combate",
    participacao: "confirmada",
    evidencias: { visuais: [], fala: [] },
    resumo: "sem evidencia",
  });
  const env = baseEnv({ fetchImpl: fetchOk(semEvidencia) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "contexto_invalido");
});

test("depois de uma falha, uma nova tentativa do mesmo candidato pode ser retomada", async () => {
  const db = criarFakeD1();
  let tentativa = 0;
  const fetchImpl = async () => {
    tentativa++;
    if (tentativa === 1) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], usage: { input_tokens: 5, output_tokens: 5 } }) };
  };
  const env = baseEnv({ db, fetchImpl });
  const pedido = pedidoValidoBase();
  const r1 = await tratarContextoRust(pedido, env);
  assert.equal(r1.status, 502);
  const r2 = await tratarContextoRust(pedido, env);
  assert.equal(r2.status, 200);
  assert.equal(tentativa, 2);
});

// --- Teto mensal atomico (reserva antes do fetch, settle por diferenca) ---
// CUSTO_PIOR_CASO_USD_MICROS = 52000; orcamento 0.06 USD = 60000 micros => cabe UMA reserva.
const ORCAMENTO_UMA_RESERVA = "0.06";

function somaMicros(db) {
  return db._raw.prepare("SELECT COALESCE(SUM(estimated_usd_micros), 0) AS t FROM contexto_dia_contadores").get().t;
}

function pedidoAlternativo() {
  return { ...pedidoValidoBase(), deMs: 9000, ateMs: 13000 };
}

test("teto mensal: dois pedidos diferentes concorrentes com saldo para um => so um fetch", async () => {
  const db = criarFakeD1();
  let chamadas = 0;
  const fetchImpl = async () => {
    chamadas++;
    await new Promise((res) => setTimeout(res, 20));
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], usage: { input_tokens: 5, output_tokens: 5 } }) };
  };
  const env = baseEnv({ db, fetchImpl, orcamentoMensalUsd: ORCAMENTO_UMA_RESERVA });
  const [r1, r2] = await Promise.all([
    tratarContextoRust(pedidoValidoBase(), env),
    tratarContextoRust(pedidoAlternativo(), env),
  ]);
  assert.equal(chamadas, 1);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 429]);
  const perdedor = r1.status === 429 ? r1 : r2;
  assert.equal(perdedor.corpo.erro, "teto_mensal");
});

test("teto mensal: falha sem usage (HTTP 500) mantem a reserva conservadora cobrada", async () => {
  const db = criarFakeD1();
  const env = baseEnv({ db, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), orcamentoMensalUsd: ORCAMENTO_UMA_RESERVA });
  const r1 = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r1.status, 502);
  assert.equal(somaMicros(db), 52000);
  const r2 = await tratarContextoRust(pedidoAlternativo(), { ...env, fetchImpl: fetchOk(respostaModeloValida()) });
  assert.equal(r2.status, 429);
  assert.equal(r2.corpo.erro, "teto_mensal");
});

test("teto mensal: cancelamento sem usage mantem a reserva conservadora cobrada", async () => {
  const db = criarFakeD1();
  const env = baseEnv({
    db,
    orcamentoMensalUsd: ORCAMENTO_UMA_RESERVA,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      const rejeitar = () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); };
      if (init.signal.aborted) rejeitar(); else init.signal.addEventListener("abort", rejeitar);
    }),
  });
  const controlador = new AbortController();
  const promessa = tratarContextoRust(pedidoValidoBase(), env, controlador.signal);
  controlador.abort();
  const r = await promessa;
  assert.equal(r.status, 504);
  assert.equal(somaMicros(db), 52000);
  const r2 = await tratarContextoRust(pedidoAlternativo(), { ...env, fetchImpl: fetchOk(respostaModeloValida()) });
  assert.equal(r2.corpo.erro, "teto_mensal");
});

test("teto mensal: resposta sem usage (custo desconhecido) mantem a reserva", async () => {
  const db = criarFakeD1();
  const env = baseEnv({
    db,
    orcamentoMensalUsd: ORCAMENTO_UMA_RESERVA,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }] }) }),
  });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 200);
  assert.equal(somaMicros(db), 52000);
});

test("teto mensal: resposta invalida COM usage e contabilizada antes da validacao", async () => {
  const db = criarFakeD1();
  const env = baseEnv({ db, fetchImpl: fetchOk("isto nao e json", { input_tokens: 1000, output_tokens: 100 }) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "resposta_invalida");
  // (1000*2 + 100*10)/1e6 USD = 3000 micros; a reserva de 52000 foi substituida pela diferenca.
  assert.equal(somaMicros(db), 3000);
});

test("teto mensal: contrato invalido COM usage tambem e contabilizado", async () => {
  const db = criarFakeD1();
  const semEvidencia = JSON.stringify({ tipo: "combate", participacao: "confirmada", evidencias: { visuais: [], fala: [] }, resumo: "x" });
  const env = baseEnv({ db, fetchImpl: fetchOk(semEvidencia, { input_tokens: 1000, output_tokens: 100 }) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.corpo.erro, "contexto_invalido");
  assert.equal(somaMicros(db), 3000);
});

test("modelo sem preco conhecido -> 503 modelo_sem_preco antes de qualquer reserva ou API", async () => {
  const db = criarFakeD1();
  let chamou = false;
  const env = baseEnv({ db, modelo: "claude-opus-x", fetchImpl: async () => { chamou = true; throw new Error("nao devia chamar"); } });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 503);
  assert.equal(r.corpo.erro, "modelo_sem_preco");
  assert.equal(chamou, false);
  assert.equal(somaMicros(db), 0);
});

// --- Formato de saida (structured outputs), thinking desabilitado, blocos text, stop_reason ---
import { TIPOS_CONTEXTO, PARTICIPACOES } from "../public/contexto-rust.js";
import { SCHEMA_SAIDA_CONTEXTO } from "../lib/contexto-api.ts";

function fetchCapturando(resposta, capturado = {}) {
  return async (_url, init) => {
    capturado.corpo = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => resposta };
  };
}

function contagem(db, tabela) {
  return db._raw.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
}

function todosObjetosFechados(schema, caminho = "raiz") {
  const erros = [];
  if (schema && typeof schema === "object") {
    if (schema.type === "object") {
      if (schema.additionalProperties !== false) erros.push(caminho);
      for (const [k, v] of Object.entries(schema.properties || {})) erros.push(...todosObjetosFechados(v, caminho + "." + k));
    }
    if (schema.type === "array") erros.push(...todosObjetosFechados(schema.items, caminho + "[]"));
    for (const palavra of ["minLength", "maxLength"]) {
      if (palavra in schema) erros.push(caminho + " usa " + palavra);
    }
  }
  return erros;
}

test("corpo Anthropic: thinking desabilitado explicito e schema JSON do contrato", async () => {
  const cap = {};
  const env = baseEnv({ fetchImpl: fetchCapturando({ content: [{ type: "text", text: respostaModeloValida() }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } }, cap) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 200);
  assert.deepEqual(cap.corpo.thinking, { type: "disabled" });
  assert.equal(cap.corpo.max_tokens, 1200);
  assert.equal(cap.corpo.output_config.format.type, "json_schema");
  assert.deepEqual(cap.corpo.output_config.format.schema, SCHEMA_SAIDA_CONTEXTO);
  assert.deepEqual(todosObjetosFechados(cap.corpo.output_config.format.schema), []);
  assert.deepEqual(cap.corpo.output_config.format.schema.properties.tipo.enum, [...TIPOS_CONTEXTO]);
  assert.deepEqual(cap.corpo.output_config.format.schema.properties.participacao.enum, [...PARTICIPACOES]);
  assert.deepEqual(cap.corpo.output_config.format.schema.required, ["tipo", "participacao", "evidencias", "resumo"]);
  assert.equal(JSON.stringify(cap.corpo.output_config).includes("origem"), false);
});

test("blocos thinking sao ignorados: so o texto vira o veredito", async () => {
  const env = baseEnv({
    fetchImpl: fetchCapturando({
      content: [
        { type: "thinking", thinking: "rascunho {nao json" },
        { type: "text", text: respostaModeloValida() },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 5 },
    }),
  });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.contexto.tipo, "ambiente");
  assert.equal(JSON.stringify(r.corpo).includes("rascunho"), false);
});

test("bloco thinking sem texto nenhum -> resposta_invalida, nunca le o pensamento", async () => {
  const env = baseEnv({
    fetchImpl: fetchCapturando({ content: [{ type: "thinking", thinking: JSON.stringify(JSON.parse(respostaModeloValida())) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } }),
  });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "resposta_invalida");
});

test("blocos text sao concatenados na ordem antes do parse", async () => {
  const texto = respostaModeloValida();
  const meio = Math.floor(texto.length / 2);
  const env = baseEnv({
    fetchImpl: fetchCapturando({
      content: [
        { type: "text", text: texto.slice(0, meio) },
        { type: "text", text: texto.slice(meio) },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 5 },
    }),
  });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.contexto.tipo, "ambiente");
});

test("max_tokens com JSON completo: 502 resposta_truncada, sem cache, custo contado", async () => {
  const db = criarFakeD1();
  let chamadas = 0;
  const env = baseEnv({
    db,
    fetchImpl: async () => {
      chamadas++;
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: respostaModeloValida() }], stop_reason: "max_tokens", usage: { input_tokens: 1000, output_tokens: 100 } }) };
    },
  });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "resposta_truncada");
  assert.equal(JSON.stringify(r.corpo).includes("tipo"), false);
  assert.equal(contagem(db, "contexto_cache"), 0);
  assert.equal(db._raw.prepare("SELECT status FROM contexto_reservas").get().status, "failed");
  assert.equal(somaMicros(db), 3000);
  assert.equal(chamadas, 1);
});

test("max_tokens com JSON parcial: 502 resposta_truncada, nunca parseado nem cacheado", async () => {
  const db = criarFakeD1();
  const parcial = respostaModeloValida().slice(0, 60);
  const env = baseEnv({ db });
  env.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: parcial }], stop_reason: "max_tokens", usage: { input_tokens: 1000, output_tokens: 100 } }) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "resposta_truncada");
  assert.equal(contagem(db, "contexto_cache"), 0);
  assert.equal(somaMicros(db), 3000);
  // Nao ficou cacheada: uma nova tentativa (agora com resposta normal) gera chamada nova e sucesso.
  env.fetchImpl = fetchCapturando({ content: [{ type: "text", text: respostaModeloValida() }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } });
  const r2 = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r2.status, 200);
  assert.equal(r2.corpo.doCache, undefined);
});

test("refusal: 502 resposta_recusada, sem cache, custo contado", async () => {
  const db = criarFakeD1();
  const env = baseEnv({
    db,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "" }], stop_reason: "refusal", usage: { input_tokens: 1000, output_tokens: 100 } }) }),
  });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 502);
  assert.equal(r.corpo.erro, "resposta_recusada");
  assert.equal(contagem(db, "contexto_cache"), 0);
  assert.equal(somaMicros(db), 3000);
});

test("stop_reason ausente (mock antigo) continua valido pela validacao local", async () => {
  const env = baseEnv({ fetchImpl: fetchOk(respostaModeloValida()) });
  const r = await tratarContextoRust(pedidoValidoBase(), env);
  assert.equal(r.status, 200);
});
