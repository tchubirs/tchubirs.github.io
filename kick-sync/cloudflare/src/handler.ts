// Adaptador HTTP do Worker. Não contém lógica de contexto: só roteia, valida a forma da requisição
// (método, Origin/Sec-Fetch-Site, Content-Type, cap real do corpo, JSON) e delega ao core
// lib/contexto-api.ts. Nunca devolve segredos e não emite CORS.
//
// Aviso: a checagem de Origin/Sec-Fetch-Site é proteção contra páginas de outros sites no navegador
// do dono. NÃO é autenticação: qualquer script/cliente pode forjar esses headers. O que limita custo
// é CONTEXTO_ATIVO (fechado por padrão), o orçamento e os limites diários no core.
import {
  respostaSaude,
  tratarContextoRust,
  type ApiResultado,
  type ContextoApiEnv,
} from "../lib/contexto-api.ts";
import { lerCorpoLimitado, mesmaOrigem, MAX_CORPO_BYTES } from "../lib/contexto-http.ts";

export type Deps = {
  tratar: typeof tratarContextoRust;
  saude: typeof respostaSaude;
};

const CABECALHOS_BASE = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(status: number, corpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_BASE, ...extra },
  });
}

function contextoAtivo(env: Env): boolean {
  // Tipado como string: o cf gera literal "0" para bindings.text("0"), mas o valor real vem do deploy.
  const valor: string = env.CONTEXTO_ATIVO;
  return valor === "1";
}

function ctxEnv(env: Env): ContextoApiEnv {
  return {
    db: env.DB,
    apiKey: env.ANTHROPIC_API_KEY,
    limiteChamadasDia: env.CONTEXTO_LIMITE_CHAMADAS_DIA,
    limiteCandidatosLive: env.CONTEXTO_LIMITE_CANDIDATOS_LIVE,
    orcamentoMensalUsd: env.CONTEXTO_ORCAMENTO_MENSAL_USD,
  };
}

function tipoJson(request: Request): boolean {
  const tipo = request.headers.get("content-type") || "";
  return tipo.split(";")[0].trim().toLowerCase() === "application/json";
}

function saude(env: Env, deps: Deps): Response {
  const base = deps.saude(ctxEnv(env));
  // Pronto só com flag ligada E D1 presente; sem isso, ok/temChave ficam falsos mesmo com a chave.
  const pronto = contextoAtivo(env) && Boolean(env.DB);
  const corpo = {
    ...base.corpo,
    ok: pronto && base.corpo.ok === true,
    temChave: pronto && base.corpo.temChave === true,
  };
  return json(base.status, corpo);
}

async function api(request: Request, env: Env, deps: Deps): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { erro: "metodo_nao_permitido" }, { Allow: "POST" });
  }
  if (!mesmaOrigem(request)) {
    return json(403, { erro: "origem_recusada", mensagem: "requisicao fora da mesma origem." });
  }
  if (!tipoJson(request)) {
    return json(415, { erro: "tipo_nao_suportado", mensagem: "use Content-Type: application/json." });
  }
  if (!contextoAtivo(env)) {
    return json(503, { erro: "contexto_desativado", mensagem: "contexto Rust desativado (CONTEXTO_ATIVO != 1) - nada foi analisado." });
  }
  const lido = await lerCorpoLimitado(request, MAX_CORPO_BYTES);
  if ("excedeu" in lido) {
    return json(413, { erro: "corpo_grande", mensagem: "corpo acima de 6MB." });
  }
  let corpo: unknown;
  try {
    corpo = JSON.parse(lido.texto);
  } catch {
    return json(400, { erro: "json_invalido" });
  }
  const r: ApiResultado = await deps.tratar(corpo, ctxEnv(env), request.signal);
  return json(r.status, r.corpo);
}

async function roteia(request: Request, env: Env, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/health") {
    if (request.method !== "GET") return json(405, { erro: "metodo_nao_permitido" }, { Allow: "GET" });
    return saude(env, deps);
  }
  if (pathname === "/api/contexto-rust") return api(request, env, deps);
  if (pathname.startsWith("/api/")) return json(404, { erro: "nao_encontrado" });
  return env.ASSETS.fetch(request);
}

export function criarWorker(deps: Deps = { tratar: tratarContextoRust, saude: respostaSaude }) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      try {
        return await roteia(request, env, deps);
      } catch {
        // Erro interno sem detalhe para o cliente (nada de stack ou segredo).
        return json(500, { erro: "falha_interna" });
      }
    },
  } satisfies ExportedHandler<Env>;
}
