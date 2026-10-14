// Servidor de DESENVOLVIMENTO para testar a Camada C (Claude Vision + transcricao) do contexto do Rust.
// So http embutido (sem dependencia nova), serve site/ e responde POST /api/contexto-rust.
//
// NUNCA publico: so aceita ligacoes de 127.0.0.1 e confere Origin/Host. A chave vem SO de
// process.env.ANTHROPIC_API_KEY (nunca de um ficheiro .env lido aqui, nunca escrita na resposta, no HTML, no
// JSON ou em log). Sem a chave, /api/contexto-rust responde 503 com um aviso claro - nunca finge analisar.
//
// Para hospedar isto de verdade falta um backend autenticado (convite/token por dispositivo, teto de gasto
// medido pelo uso real da resposta, CORS restrito a uma origem fixa) - ver plano-contexto.md Fase 3. Nada
// disso esta provisionado aqui: este ficheiro e so o que precisa para o dono testar num clipe, localmente.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  construirPedido, pedidoValido, validarPedidoBruto, validarContexto,
  PROMPT_SISTEMA, VERSAO_CONTRATO, VERSAO_PROMPT, MAX_QUADROS, MIN_QUADROS,
  MAX_TRANSCRICAO_CHARS, MAX_JANELA_MS, MAX_IMAGEM_BYTES,
} from '../site/contexto-rust.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = path.resolve(AQUI, '..', 'site');

export const LIMITE_CANDIDATOS_POR_LIVE = 20;
export const CONCORRENCIA_PADRAO = 2;
export const TIMEOUT_MS_PADRAO = 20000;
export const LIMITE_CHAMADAS_SESSAO_PADRAO = 20;
export const MAX_TOKENS = 1200;
export const MODELO_PADRAO = 'claude-sonnet-5';
export const MAX_FILA_PADRAO = 40;
const MAX_CORPO_BYTES = 6 * 1048576;
const MAX_CACHE = 300;

const TIPOS_MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.json': 'application/json' };

const lerChave = () => process.env.ANTHROPIC_API_KEY || '';

// Chave real de cache: liveId + janela (o range) + hash das evidencias (quadros+transcricao) + a versao do
// contrato/prompt (muda => invalida cache antigo). Nao depende do canal (texto livre) nem do que o modelo
// diga de si mesmo.
export function chaveCache(pedido) {
  const h = createHash('sha256');
  for (const q of pedido.quadros) h.update(q.jpegBase64);
  h.update('|').update(pedido.transcricao);
  return [pedido.liveId || '', pedido.deMs, pedido.ateMs, VERSAO_CONTRATO, VERSAO_PROMPT, h.digest('hex').slice(0, 24)].join('|');
}

function criarLimitador(n, maxFila) {
  let emVoo = 0;
  const fila = [];
  const soltar = () => { emVoo--; const prox = fila.shift(); if (prox) { emVoo++; prox(); } };
  const limitar = (tarefa) => new Promise((resolve, reject) => {
    const rodar = () => { tarefa().then(resolve, reject).finally(soltar); };
    if (emVoo < n) { emVoo++; rodar(); } else if (fila.length < maxFila) { fila.push(rodar); } else {
      const e = new Error('fila de analise cheia'); e.codigo = 'fila_cheia'; reject(e);
    }
  });
  limitar.tamanhoFila = () => fila.length;
  return limitar;
}

export function criarServidor(opcoes) {
  const o = opcoes || {};
  const apiKey = 'apiKey' in o ? o.apiKey : lerChave();
  const modelo = o.modelo || process.env.ANTHROPIC_MODEL || MODELO_PADRAO;
  const fetchImpl = o.fetchImpl || globalThis.fetch;
  const concorrencia = o.concorrencia || CONCORRENCIA_PADRAO;
  const timeoutMs = o.timeoutMs || TIMEOUT_MS_PADRAO;
  const limiteChamadasSessao = o.limiteChamadasSessao || LIMITE_CHAMADAS_SESSAO_PADRAO;
  const limiteCandidatosPorLive = o.limiteCandidatosPorLive || LIMITE_CANDIDATOS_POR_LIVE;
  const maxFila = o.maxFila || MAX_FILA_PADRAO;
  const siteDir = o.siteDir || SITE_DIR;

  const limitar = criarLimitador(Math.max(1, Math.min(2, concorrencia)), maxFila);
  const cache = new Map();
  const emAndamento = new Map(); // chave -> { controlo, promessa, assinantes }
  let chamadasNaSessao = 0;
  const rangesPorLive = new Map(); // liveId -> Set(rangeKey): orcamento por live, nao so "quantas vezes pediu"

  async function chamarAnthropic(pedido, sinal) {
    const conteudo = [
      { type: 'text', text: 'Janela do clipe (relativa, segundos): ' + (pedido.janelaS ?? '?') + '.' },
    ];
    pedido.quadros.forEach((q) => {
      conteudo.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: q.jpegBase64 } });
      conteudo.push({ type: 'text', text: 'Rotulo de tempo relativo deste quadro: ' + q.legendaInstante });
    });
    conteudo.push({ type: 'text', text: pedido.recebeuFala ? ('Transcricao da fala: "' + pedido.transcricao + '"') : 'Sem transcricao disponivel para este trecho.' });
    const resp = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo, max_tokens: MAX_TOKENS, system: PROMPT_SISTEMA,
        messages: [{ role: 'user', content: conteudo }],
      }),
      signal: sinal,
    });
    if (!resp.ok) { const e = new Error('api_erro'); e.status = resp.status; throw e; }
    const json = await resp.json();
    const achado = (json && json.content && json.content.find((c) => c.type === 'text')) || {};
    return achado.text || '';
  }

  // Liga `registro` ao ciclo de vida de `req` (se for um pedido HTTP real): se a ligacao fechar e nao restar
  // nenhum assinante a espera, aborta a chamada real (nunca gasta API por quem ja desistiu).
  function assinar(req, registro) {
    registro.assinantes++;
    if (!req || typeof req.on !== 'function') return () => {};
    let ja = false;
    const aoFechar = () => {
      if (ja) return;
      ja = true;
      registro.assinantes--;
      if (registro.assinantes <= 0) registro.controlo.abort();
    };
    // Em algumas versoes do Node o 'close' do IncomingMessage nao dispara quando o socket e destruido antes
    // da resposta; o 'close' do socket em si e o sinal confiavel de que quem pediu ja foi embora.
    req.on('close', aoFechar);
    if (req.socket) req.socket.on('close', aoFechar);
    return () => {
      req.removeListener('close', aoFechar);
      if (req.socket) req.socket.removeListener('close', aoFechar);
    };
  }

  function erroDeFalha(e) {
    if (e && e.codigo === 'fila_cheia') return { status: 429, corpo: { erro: 'fila_cheia', mensagem: 'fila de analise cheia; tente novamente.' } };
    if (e && e.name === 'AbortError') return { status: 504, corpo: { erro: 'tempo_esgotado', mensagem: 'a API nao respondeu a tempo, ou o pedido foi cancelado.' } };
    if (e && e.codigo === 'resposta_invalida') return { status: 502, corpo: { erro: 'resposta_invalida', mensagem: 'a resposta do modelo nao veio em JSON.' } };
    if (e && e.codigo === 'contexto_invalido') return { status: 502, corpo: { erro: 'contexto_invalido', mensagem: 'o modelo devolveu um contexto fora do contrato.' } };
    return { status: 502, corpo: { erro: 'falha_api', mensagem: 'falha ao contatar a API.' } };
  }

  async function tratarContextoRust(entrada, req) {
    if (!apiKey) return { status: 503, corpo: { erro: 'sem_chave', mensagem: 'ANTHROPIC_API_KEY nao esta no ambiente deste processo - nada foi analisado.' } };
    const erroBruto = validarPedidoBruto(entrada);
    if (erroBruto) return { status: 400, corpo: { erro: 'pedido_invalido', motivo: erroBruto } };
    const pedido = construirPedido(entrada || {});
    if (!pedidoValido(pedido)) return { status: 400, corpo: { erro: 'pedido_invalido', motivo: 'quadros_invalidos' } };

    const chave = chaveCache(pedido);
    // Cache ANTES de qualquer orcamento: um teto esgotado nao apaga um acerto ja pago antes.
    if (cache.has(chave)) return { status: 200, corpo: { contexto: cache.get(chave), doCache: true } };

    let registro = emAndamento.get(chave);
    if (registro) {
      const desinscrever = assinar(req, registro);
      try {
        const contexto = await registro.promessa;
        return { status: 200, corpo: { contexto } };
      } catch (e) {
        return erroDeFalha(e);
      } finally { desinscrever(); }
    }

    const liveId = pedido.liveId || '';
    const rangeKey = pedido.deMs + '-' + pedido.ateMs;
    const vistos = rangesPorLive.get(liveId) || new Set();
    const jaTinhaRange = vistos.has(rangeKey);
    if (!jaTinhaRange && vistos.size >= limiteCandidatosPorLive) {
      return { status: 429, corpo: { erro: 'teto_candidatos', mensagem: 'limite de ' + limiteCandidatosPorLive + ' candidatos por live nesta sessao.' } };
    }
    if (chamadasNaSessao >= limiteChamadasSessao) {
      return { status: 429, corpo: { erro: 'teto_sessao', mensagem: 'limite de ' + limiteChamadasSessao + ' chamadas por sessao (servico de desenvolvimento).' } };
    }

    vistos.add(rangeKey); rangesPorLive.set(liveId, vistos);
    chamadasNaSessao++;

    const controlo = new AbortController();
    const prazo = setTimeout(() => controlo.abort(), timeoutMs);
    registro = { controlo, assinantes: 0 };
    emAndamento.set(chave, registro);
    const desinscrever = assinar(req, registro);

    registro.promessa = (async () => {
      try {
        const texto = await limitar(() => {
          if (controlo.signal.aborted) { const e = new Error('abortado'); e.name = 'AbortError'; throw e; }
          return chamarAnthropic(pedido, controlo.signal);
        }).catch((e) => {
          if (e && e.codigo === 'fila_cheia') {
            chamadasNaSessao--;
            if (!jaTinhaRange) { vistos.delete(rangeKey); if (vistos.size === 0) rangesPorLive.delete(liveId); }
          }
          throw e;
        });
        let json;
        try { json = JSON.parse(texto); } catch (e1) { const e = new Error('resposta_invalida'); e.codigo = 'resposta_invalida'; throw e; }
        const meta = { origem: 'ia-remota', recebeuFala: pedido.recebeuFala, revisaoPrompt: VERSAO_PROMPT };
        const r = validarContexto(json, meta);
        if (!r.ok) { const e = new Error('contexto_invalido'); e.codigo = 'contexto_invalido'; throw e; }
        if (controlo.signal.aborted) { const e = new Error('abortado'); e.name = 'AbortError'; throw e; }
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(chave, r.contexto);
        return r.contexto;
      } finally {
        clearTimeout(prazo);
        emAndamento.delete(chave);
      }
    })();

    try {
      const contexto = await registro.promessa;
      return { status: 200, corpo: { contexto } };
    } catch (e) {
      return erroDeFalha(e);
    } finally { desinscrever(); }
  }

  function pedidoDeConfianca(req, porta) {
    const ip = (req.socket && req.socket.remoteAddress) || '';
    if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ip)) return false;
    const host = req.headers.host || '';
    // Os pontos têm de ser escapados de verdade na string ('\\.'): '\.' em literal JS vira '.', e aceitaria 127x0x0x1.
    if (!new RegExp('^(127\\.0\\.0\\.1|localhost):' + porta + '$').test(host)) return false;
    const origin = req.headers.origin;
    if (origin && !new RegExp('^http://(127\\.0\\.0\\.1|localhost):' + porta + '$').test(origin)) return false;
    return true;
  }

  async function servirEstatico(caminho, res) {
    const alvo = path.resolve(siteDir, '.' + (caminho === '/' ? '/index.html' : caminho));
    if (alvo !== siteDir && !alvo.startsWith(siteDir + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const dados = await readFile(alvo);
      res.writeHead(200, { 'content-type': TIPOS_MIME[path.extname(alvo)] || 'application/octet-stream' });
      res.end(dados);
    } catch (e2) {
      res.writeHead(404).end('nao achado');
    }
  }

  function lerCorpo(req) {
    return new Promise((resolve, reject) => {
      let total = 0;
      let encerrado = false;
      const pedacos = [];
      req.on('data', (d) => {
        if (encerrado) return;
        total += d.length;
        if (total > MAX_CORPO_BYTES) {
          encerrado = true;
          const e = new Error('corpo grande demais'); e.status = 413;
          reject(e);
          return;
        }
        pedacos.push(d);
      });
      req.on('end', () => { if (!encerrado) resolve(Buffer.concat(pedacos).toString('utf8')); });
      req.on('error', (e) => { if (!encerrado) { encerrado = true; reject(e); } });
    });
  }

  function respostaSaude() {
    return {
      ok: true,
      temChave: Boolean(apiKey),
      versaoContrato: VERSAO_CONTRATO,
      versaoPrompt: VERSAO_PROMPT,
      limites: {
        minQuadros: MIN_QUADROS, maxQuadros: MAX_QUADROS, maxTranscricaoChars: MAX_TRANSCRICAO_CHARS,
        maxJanelaMs: MAX_JANELA_MS, maxImagemBytes: MAX_IMAGEM_BYTES,
        limiteChamadasSessao, limiteCandidatosPorLive, maxCorpoBytes: MAX_CORPO_BYTES,
      },
    };
  }

  let porta = 0;
  const servidor = http.createServer(async (req, res) => {
    try {
      let caminho;
      try { caminho = decodeURIComponent((req.url || '/').split('?')[0]); } catch (eUri) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ erro: 'uri_invalida' }));
        return;
      }
      if (req.method === 'POST' && caminho === '/api/contexto-rust') {
        if (!pedidoDeConfianca(req, porta)) { res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ erro: 'origem_nao_confiavel' })); return; }
        let corpo;
        try {
          const corpoTexto = await lerCorpo(req);
          corpo = JSON.parse(corpoTexto);
        } catch (e) {
          if (!res.writableEnded) res.writeHead((e && e.status) || 400, { 'content-type': 'application/json' }).end(JSON.stringify({ erro: (e && e.status === 413) ? 'corpo_grande_demais' : 'corpo_invalido' }));
          return;
        }
        const r = await tratarContextoRust(corpo, req);
        if (!res.writableEnded) res.writeHead(r.status, { 'content-type': 'application/json' }).end(JSON.stringify(r.corpo));
        return;
      }
      if (req.method === 'GET' && caminho === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(respostaSaude()));
        return;
      }
      if (req.method === 'GET') { await servirEstatico(caminho, res); return; }
      res.writeHead(404).end();
    } catch (e) {
      if (!res.writableEnded) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ erro: 'interno' }));
    }
  });

  return {
    tratarContextoRust: tratarContextoRust,
    listen(p) {
      return new Promise((resolve, reject) => {
        const aoErro = (e) => { servidor.removeListener('error', aoErro); reject(e); };
        servidor.once('error', aoErro);
        servidor.listen(p === undefined ? 0 : p, '127.0.0.1', () => {
          servidor.removeListener('error', aoErro);
          porta = servidor.address().port; resolve(porta);
        });
      });
    },
    close() { return new Promise((resolve) => servidor.close(resolve)); },
    get porta() { return porta; },
  };
}

// Como hospedar isto de verdade (nao esta provisionado aqui, so a nota para quando precisar): autenticacao por
// dispositivo (convite -> token, nunca a chave no browser), contador de gasto medido pela resposta real da
// API (com teto e kill-switch), CORS restrito a origem do site publicado via HTTPS, e teto de gasto tambem
// configurado no painel da Anthropic. Ver plano-contexto.md Fase 3.

const ehEntradaPrincipal = (() => {
  try { return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); } catch (e) { return false; }
})();

if (ehEntradaPrincipal) {
  let portaPedida = 8787;
  if (process.env.PORT !== undefined) {
    const n = Number(process.env.PORT);
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
      console.error('PORT invalido: "' + process.env.PORT + '" (precisa ser um inteiro 0-65535)');
      process.exit(1);
    }
    portaPedida = n;
  }
  const s = criarServidor({});
  s.listen(portaPedida).then((porta) => {
    const avisoChave = lerChave() ? '' : ' (sem ANTHROPIC_API_KEY no ambiente - /api/contexto-rust respondera 503)';
    console.log('contexto-rust: a ouvir em http://127.0.0.1:' + porta + avisoChave);
  }).catch((e) => {
    console.error('falha ao iniciar o servidor:', (e && e.message) || e);
    process.exit(1);
  });
}
