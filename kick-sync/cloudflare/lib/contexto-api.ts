// Core request handling for the private, same-origin Rust/Kick contextual analysis API
// (POST /api/contexto-rust, GET /health). Framework/runtime agnostic on purpose: only Web
// standard fetch/AbortController/crypto.subtle (WebCrypto) and an injected D1-shaped
// database -- no node:http/node:fs, no module-global mutable state, nothing that would keep
// running after the request that started it. The HTTP adapter (src/handler.ts) owns the Origin check,
// the Content-Type check and the streaming body-size cap, then calls these pure functions with an
// explicit env.
//
// Contract source of truth: the sibling, read-only kick-sync/site/contexto-rust.js -- copied
// verbatim (unmodified) into public/contexto-rust.js as part of the frontend snapshot and
// imported directly from there so server and browser validate against the exact same file.
import {
  construirPedido,
  pedidoValido,
  validarContexto,
  validarPedidoBruto,
  PROMPT_SISTEMA,
  VERSAO_CONTRATO,
  VERSAO_PROMPT,
  MIN_QUADROS,
  MAX_QUADROS,
  MAX_TRANSCRICAO_CHARS,
  MAX_JANELA_MS,
  MAX_IMAGEM_BYTES,
} from "../public/contexto-rust.js";

export const MAX_CORPO_BYTES = 6 * 1024 * 1024; // 6MB raw body cap, enforced by streaming before JSON.parse
export const MAX_TOKENS = 1200; // no extended thinking, fixed output ceiling
export const MODELO_PADRAO = "claude-sonnet-5";
export const TIMEOUT_MS_PADRAO = 25000;
export const TIMEOUT_MS_MIN = 20000;
export const TIMEOUT_MS_MAX = 30000;

export const LIMITE_CHAMADAS_DIA_PADRAO = 40; // owner daily max
export const LIMITE_CANDIDATOS_LIVE_PADRAO = 20; // owner per-live max
export const ORCAMENTO_MENSAL_USD_PADRAO = 2; // conservative recorded-estimate default

export const PRECO_INPUT_USD_POR_MILHAO = 2;
export const PRECO_OUTPUT_USD_POR_MILHAO = 10;
export const MAX_INPUT_TOKENS_ESTIMADO = 20000;

function custoUsdMicros(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens * PRECO_INPUT_USD_POR_MILHAO +
      outputTokens * PRECO_OUTPUT_USD_POR_MILHAO) /
    1000000;
  return Math.max(0, Math.round(usd * 1000000));
}

export const CUSTO_PIOR_CASO_USD_MICROS = custoUsdMicros(
  MAX_INPUT_TOKENS_ESTIMADO,
  MAX_TOKENS,
);

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  if (!valor) return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return padrao;
  return n;
}

function numeroPositivo(valor: string | undefined, padrao: number): number {
  if (!valor) return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return padrao;
  return n;
}

export type ContextoApiEnv = {
  db: D1Database | undefined;
  apiKey: string | undefined;
  modelo?: string;
  timeoutMs?: string;
  limiteChamadasDia?: string;
  limiteCandidatosLive?: string;
  orcamentoMensalUsd?: string;
  fetchImpl?: typeof fetch;
  agora?: () => Date;
};

export type ApiResultado = { status: number; corpo: Record<string, unknown> };

function diaDe(data: Date): string {
  return data.toISOString().slice(0, 10);
}

async function hashHex(partes: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(partes.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function chaveCache(pedido: ReturnType<typeof construirPedido>): Promise<string> {
  const hash = await hashHex([
    ...pedido.quadros.map((q: { jpegBase64: string }) => q.jpegBase64),
    pedido.transcricao,
  ]);
  return [
    pedido.liveId || "",
    pedido.deMs,
    pedido.ateMs,
    VERSAO_CONTRATO,
    VERSAO_PROMPT,
    hash.slice(0, 24),
  ].join("|");
}

export function respostaSaude(env: ContextoApiEnv): ApiResultado {
  const temChave = Boolean(env.apiKey);
  return {
    status: 200,
    corpo: {
      ok: temChave,
      temChave,
      versaoContrato: VERSAO_CONTRATO,
      versaoPrompt: VERSAO_PROMPT,
      limites: {
        minQuadros: MIN_QUADROS,
        maxQuadros: MAX_QUADROS,
        maxTranscricaoChars: MAX_TRANSCRICAO_CHARS,
        maxJanelaMs: MAX_JANELA_MS,
        maxImagemBytes: MAX_IMAGEM_BYTES,
        maxCorpoBytes: MAX_CORPO_BYTES,
        limiteChamadasDia: inteiroPositivo(env.limiteChamadasDia, LIMITE_CHAMADAS_DIA_PADRAO),
        limiteCandidatosLive: inteiroPositivo(
          env.limiteCandidatosLive,
          LIMITE_CANDIDATOS_LIVE_PADRAO,
        ),
      },
    },
  };
}

async function chamarAnthropic(
  env: ContextoApiEnv,
  pedido: ReturnType<typeof construirPedido>,
  modelo: string,
  timeoutMs: number,
  sinalExterno: AbortSignal | null,
): Promise<{ texto: string; inputTokens: number; outputTokens: number; usageConhecido: boolean }> {
  const fetchImpl = env.fetchImpl || fetch;
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), timeoutMs);
  const aoAbortarExterno = () => controlo.abort();
  if (sinalExterno?.aborted) {
    // Already gone (e.g. the visitor's connection closed before this ran): abort immediately
    // instead of registering a listener for an event that already happened.
    controlo.abort();
  } else {
    sinalExterno?.addEventListener("abort", aoAbortarExterno);
  }
  try {
    const conteudo: Array<Record<string, unknown>> = [
      { type: "text", text: "Janela do clipe (relativa, segundos): " + (pedido.janelaS ?? "?") + "." },
    ];
    for (const q of pedido.quadros) {
      conteudo.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: q.jpegBase64 } });
      conteudo.push({ type: "text", text: "Rotulo de tempo relativo deste quadro: " + q.legendaInstante });
    }
    const textoFala = pedido.recebeuFala
      ? "Transcricao da fala: \"" + pedido.transcricao + "\""
      : "Sem transcricao disponivel para este trecho.";
    conteudo.push({ type: "text", text: textoFala });

    let resp: Response;
    try {
      resp = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.apiKey as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: MAX_TOKENS,
          system: PROMPT_SISTEMA,
          messages: [{ role: "user", content: conteudo }],
        }),
        signal: controlo.signal,
      });
    } catch {
      if (controlo.signal.aborted) {
        const erro = new Error("tempo_esgotado") as Error & { codigo?: string };
        erro.codigo = "tempo_esgotado";
        throw erro;
      }
      const erro = new Error("falha_rede") as Error & { codigo?: string };
      erro.codigo = "falha_api";
      throw erro;
    }
    if (!resp.ok) {
      const erro = new Error("api_erro") as Error & { codigo?: string; status?: number };
      erro.codigo = "falha_api";
      erro.status = resp.status;
      throw erro;
    }
    const json = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const achado = (json.content || []).find((c) => c.type === "text");
    // usage ausente/incompleto = custo desconhecido: quem chama mantem a reserva conservadora.
    const usageConhecido =
      typeof json.usage?.input_tokens === "number" &&
      typeof json.usage?.output_tokens === "number" &&
      Number.isFinite(json.usage.input_tokens) &&
      Number.isFinite(json.usage.output_tokens);
    return {
      texto: achado?.text || "",
      inputTokens: Math.max(0, Math.round(json.usage?.input_tokens || 0)),
      outputTokens: Math.max(0, Math.round(json.usage?.output_tokens || 0)),
      usageConhecido,
    };
  } finally {
    clearTimeout(prazo);
    sinalExterno?.removeEventListener("abort", aoAbortarExterno);
  }
}

function erroDeFalha(e: unknown): ApiResultado {
  const codigo = (e as { codigo?: string } | undefined)?.codigo;
  if (codigo === "tempo_esgotado") {
    return { status: 504, corpo: { erro: "tempo_esgotado", mensagem: "a API nao respondeu a tempo, ou o pedido foi cancelado." } };
  }
  if (codigo === "resposta_invalida") {
    return { status: 502, corpo: { erro: "resposta_invalida", mensagem: "a resposta do modelo nao veio em JSON." } };
  }
  if (codigo === "contexto_invalido") {
    return { status: 502, corpo: { erro: "contexto_invalido", mensagem: "o modelo devolveu um contexto fora do contrato." } };
  }
  return { status: 502, corpo: { erro: "falha_api", mensagem: "falha ao contatar a API." } };
}

async function primeiraLinha<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  valores: unknown[],
): Promise<T | null> {
  return db.prepare(sql).bind(...valores).first<T>();
}

export async function tratarContextoRust(
  corpo: unknown,
  env: ContextoApiEnv,
  sinalExterno: AbortSignal | null = null,
): Promise<ApiResultado> {
  if (!env.apiKey) {
    return { status: 503, corpo: { erro: "sem_chave", mensagem: "ANTHROPIC_API_KEY nao esta configurada - nada foi analisado." } };
  }
  if (!env.db) {
    return { status: 503, corpo: { erro: "sem_base", mensagem: "armazenamento (D1) indisponivel - nada foi analisado." } };
  }
  const erroBruto = validarPedidoBruto(corpo);
  if (erroBruto) return { status: 400, corpo: { erro: "pedido_invalido", motivo: erroBruto } };
  const pedido = construirPedido((corpo || {}) as Parameters<typeof construirPedido>[0]);
  if (!pedidoValido(pedido)) return { status: 400, corpo: { erro: "pedido_invalido", motivo: "quadros_invalidos" } };

  const db = env.db;
  const modelo = env.modelo || MODELO_PADRAO;
  const timeoutMs = Math.min(
    TIMEOUT_MS_MAX,
    Math.max(TIMEOUT_MS_MIN, inteiroPositivo(env.timeoutMs, TIMEOUT_MS_PADRAO)),
  );
  const limiteChamadasDia = inteiroPositivo(env.limiteChamadasDia, LIMITE_CHAMADAS_DIA_PADRAO);
  const limiteCandidatosLive = inteiroPositivo(env.limiteCandidatosLive, LIMITE_CANDIDATOS_LIVE_PADRAO);
  const orcamentoMensalUsd = numeroPositivo(env.orcamentoMensalUsd, ORCAMENTO_MENSAL_USD_PADRAO);

  const agora = (env.agora || (() => new Date()))();
  const liveId = pedido.liveId || "";
  const rangeKey = pedido.deMs + "-" + pedido.ateMs;
  const chave = await chaveCache(pedido);

  const cacheado = await primeiraLinha<{ verdict_json: string }>(
    db,
    "SELECT verdict_json FROM contexto_cache WHERE cache_key = ?",
    [chave],
  );
  if (cacheado) {
    return { status: 200, corpo: { contexto: JSON.parse(cacheado.verdict_json), doCache: true } };
  }

  if (modelo !== MODELO_PADRAO) {
    // Sem preco conhecido para este modelo: falha fechada antes de qualquer reserva ou chamada.
    return { status: 503, corpo: { erro: "modelo_sem_preco", mensagem: "modelo sem preco conhecido - nada foi analisado." } };
  }

  const nowIso = agora.toISOString();
  let dono = await primeiraLinha<{ cache_key: string }>(
    db,
    "INSERT INTO contexto_reservas (cache_key, live_id, range_key, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?) ON CONFLICT(cache_key) DO NOTHING RETURNING cache_key",
    [chave, liveId, rangeKey, nowIso, nowIso],
  );
  if (!dono) {
    const staleAntesIso = new Date(agora.getTime() - timeoutMs - 5000).toISOString();
    dono = await primeiraLinha<{ cache_key: string }>(
      db,
      "UPDATE contexto_reservas SET status = 'pending', created_at = ?, updated_at = ? WHERE cache_key = ? AND (status = 'failed' OR (status = 'pending' AND updated_at < ?)) RETURNING cache_key",
      [nowIso, nowIso, chave, staleAntesIso],
    );
    if (!dono) {
      const existente = await primeiraLinha<{ status: string }>(
        db,
        "SELECT status FROM contexto_reservas WHERE cache_key = ?",
        [chave],
      );
      if (existente?.status === "done") {
        const agoraCache = await primeiraLinha<{ verdict_json: string }>(
          db,
          "SELECT verdict_json FROM contexto_cache WHERE cache_key = ?",
          [chave],
        );
        if (agoraCache) {
          return { status: 200, corpo: { contexto: JSON.parse(agoraCache.verdict_json), doCache: true } };
        }
      }
      return {
        status: 409,
        corpo: { erro: "em_processamento", mensagem: "este candidato ja esta a ser analisado; tente novamente." },
      };
    }
  }

  const falhar = async (res: ApiResultado): Promise<ApiResultado> => {
    await db
      .prepare("UPDATE contexto_reservas SET status = 'failed', updated_at = ? WHERE cache_key = ?")
      .bind(new Date().toISOString(), chave)
      .run();
    return res;
  };

  const liveContador = await primeiraLinha<{ valor: number }>(
    db,
    "INSERT INTO contexto_live_contadores (live_id, valor) VALUES (?, 1) ON CONFLICT(live_id) DO UPDATE SET valor = valor + 1 WHERE valor < ? RETURNING valor",
    [liveId, limiteCandidatosLive],
  );
  if (!liveContador) {
    return falhar({
      status: 429,
      corpo: { erro: "teto_candidatos", mensagem: "limite de " + limiteCandidatosLive + " candidatos por live." },
    });
  }

  // Reserva atomica ANTES do fetch: uma unica instrucao testa soma do mes + reserva (teto mensal),
  // limite do dia e incrementa o contador do dia. Sem SELECT separado, entao pedidos concorrentes
  // nao conseguem ver o mesmo saldo. O custo pior caso fica reservado ate o settle.
  const dia = diaDe(agora);
  const mesLike = dia.slice(0, 7) + "%";
  const orcamentoMicros = orcamentoMensalUsd * 1000000;
  const somaMes = "(SELECT COALESCE(SUM(estimated_usd_micros), 0) FROM contexto_dia_contadores WHERE dia LIKE ?)";
  const reservado = await primeiraLinha<{ chamadas: number }>(
    db,
    "INSERT INTO contexto_dia_contadores (dia, chamadas, estimated_usd_micros) " +
      "SELECT ?, 1, ? WHERE " + somaMes + " + ? <= ? " +
      "ON CONFLICT(dia) DO UPDATE SET chamadas = chamadas + 1, estimated_usd_micros = estimated_usd_micros + excluded.estimated_usd_micros " +
      "WHERE chamadas < ? AND " + somaMes + " + excluded.estimated_usd_micros <= ? " +
      "RETURNING chamadas",
    [
      dia, CUSTO_PIOR_CASO_USD_MICROS, mesLike, CUSTO_PIOR_CASO_USD_MICROS, orcamentoMicros,
      limiteChamadasDia, mesLike, orcamentoMicros,
    ],
  );
  if (!reservado) {
    const linhaDia = await primeiraLinha<{ chamadas: number }>(
      db,
      "SELECT chamadas FROM contexto_dia_contadores WHERE dia = ?",
      [dia],
    );
    if (linhaDia && linhaDia.chamadas >= limiteChamadasDia) {
      return falhar({
        status: 429,
        corpo: { erro: "teto_dia", mensagem: "limite de " + limiteChamadasDia + " chamadas por dia." },
      });
    }
    return falhar({ status: 429, corpo: { erro: "teto_mensal", mensagem: "orcamento mensal estimado atingido." } });
  }

  let resultado: { texto: string; inputTokens: number; outputTokens: number; usageConhecido: boolean };
  try {
    resultado = await chamarAnthropic(env, pedido, modelo, timeoutMs, sinalExterno);
  } catch (e) {
    // Sem usage (erro, timeout, cancelamento): a reserva conservadora permanece cobrada.
    return falhar(erroDeFalha(e));
  }

  // Usage conhecido: substitui a reserva pelo custo real (diferenca) ANTES de validar o conteudo,
  // para que respostas invalidas ainda contem o gasto.
  const custoConhecido = resultado.usageConhecido
    ? custoUsdMicros(resultado.inputTokens, resultado.outputTokens)
    : CUSTO_PIOR_CASO_USD_MICROS;
  if (resultado.usageConhecido) {
    await db
      .prepare("UPDATE contexto_dia_contadores SET estimated_usd_micros = estimated_usd_micros + ? WHERE dia = ?")
      .bind(custoConhecido - CUSTO_PIOR_CASO_USD_MICROS, dia)
      .run();
  }

  let json: unknown;
  try {
    json = JSON.parse(resultado.texto);
  } catch {
    return falhar({ status: 502, corpo: { erro: "resposta_invalida", mensagem: "a resposta do modelo nao veio em JSON." } });
  }
  const meta = { origem: "ia-remota", recebeuFala: pedido.recebeuFala, revisaoPrompt: VERSAO_PROMPT };
  const r = validarContexto(json, meta);
  if (!r.ok) {
    return falhar({ status: 502, corpo: { erro: "contexto_invalido", mensagem: "o modelo devolveu um contexto fora do contrato." } });
  }

  await db
    .prepare(
      "INSERT INTO contexto_cache (cache_key, live_id, range_key, verdict_json, input_tokens, output_tokens, estimated_usd_micros, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO NOTHING",
    )
    .bind(chave, liveId, rangeKey, JSON.stringify(r.contexto), resultado.inputTokens, resultado.outputTokens, custoConhecido, new Date().toISOString())
    .run();
  await db
    .prepare("UPDATE contexto_reservas SET status = 'done', updated_at = ? WHERE cache_key = ?")
    .bind(new Date().toISOString(), chave)
    .run();

  return {
    status: 200,
    corpo: {
      contexto: r.contexto,
      uso: { inputTokens: resultado.inputTokens, outputTokens: resultado.outputTokens },
    },
  };
}
