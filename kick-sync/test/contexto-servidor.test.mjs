// O servidor local de contexto (server/contexto-servidor.mjs): so loopback, chave so do ambiente, 503 claro
// sem chave, metadata/imagens validadas ANTES de qualquer chamada, cache antes de orcamento, chamadas
// identicas em voo juntadas numa so, teto global e por live, fila limitada, cancelamento aborta a API real, e
// nunca gasta API de verdade nos testes (o fetch para a Anthropic e sempre um mock injetado).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { criarServidor, chaveCache, LIMITE_CANDIDATOS_POR_LIVE } from '../server/contexto-servidor.mjs';
import { construirPedido, VERSAO_CONTRATO, VERSAO_PROMPT } from '../site/contexto-rust.js';

const JPEG_B64 = (n) => '/9j/' + 'A'.repeat(n || 24);
const quadro = () => ({ jpegBase64: JPEG_B64() });

function pedido(extra) {
  return Object.assign({
    quadros: [quadro(), quadro(), quadro()],
    transcricao: 'tomei um tiro',
    janelaS: 10,
    canal: 'kodd',
    liveId: 'live1',
    deMs: 1000,
    ateMs: 4000,
  }, extra || {});
}

const contextoValido = {
  tipo: 'combate', participacao: 'confirmada', resumo: 'levou dano em combate',
  evidencias: { visuais: ['barra de vida caiu'] },
};

function respostaAnthropic(json, status) {
  const s = status || 200;
  return async () => ({
    ok: s < 400,
    status: s,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }),
  });
}

function postJson(porta, corpo, opcoes) {
  const op = opcoes || {};
  return new Promise((resolve, reject) => {
    const dados = JSON.stringify(corpo);
    const req = http.request({
      hostname: '127.0.0.1', port: porta, path: '/api/contexto-rust', method: 'POST',
      headers: Object.assign(
        { 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados), host: op.host || ('127.0.0.1:' + porta) },
        op.origin ? { origin: op.origin } : {},
      ),
    }, (res) => {
      let corpoResp = '';
      res.on('data', (d) => { corpoResp += d; });
      res.on('end', () => resolve({ status: res.statusCode, corpo: JSON.parse(corpoResp || '{}') }));
    });
    req.on('error', reject);
    if (op.abortarApos) {
      setTimeout(() => req.destroy(), op.abortarApos);
    }
    // Cancela só quando o servidor já está com a chamada real em voo (sem depender de tempo de conexão).
    if (op.cancelarQuando) op.cancelarQuando.then(() => req.destroy());
    req.end(dados);
  });
}

function aguarda(ms) { return new Promise((r) => setTimeout(r, ms)); }

test('sem ANTHROPIC_API_KEY no ambiente, responde 503 claro e nao chama o fetch', async () => {
  let chamou = false;
  const s = criarServidor({ apiKey: '', fetchImpl: async () => { chamou = true; } });
  const porta = await s.listen(0);
  try {
    const r = await postJson(porta, pedido());
    assert.equal(r.status, 503);
    assert.equal(r.corpo.erro, 'sem_chave');
    assert.equal(chamou, false);
  } finally { await s.close(); }
});

test('origem ou host que nao batem com a propria porta sao recusados, mesmo com a chave presente', async () => {
  const s = criarServidor({ apiKey: 'x', fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    const r1 = await postJson(porta, pedido(), { host: 'exemplo.com' });
    assert.equal(r1.status, 403);
    const r2 = await postJson(porta, pedido(), { origin: 'http://outro-site.com' });
    assert.equal(r2.status, 403);
  } finally { await s.close(); }
});

test('pedido com poucos quadros e recusado antes de gastar qualquer chamada', async () => {
  let chamadas = 0;
  const s = criarServidor({ apiKey: 'x', fetchImpl: async () => { chamadas++; return respostaAnthropic(contextoValido)(); } });
  const porta = await s.listen(0);
  try {
    const r = await postJson(porta, pedido({ quadros: [quadro()] }));
    assert.equal(r.status, 400);
    assert.equal(r.corpo.motivo, 'quadros_invalidos');
    assert.equal(chamadas, 0);
  } finally { await s.close(); }
});

test('metadata invalida (liveId como URL, canal com espaco, intervalo invertido, imagem que nao parece jpeg) nunca chama a API', async () => {
  let chamadas = 0;
  const s = criarServidor({ apiKey: 'x', fetchImpl: async () => { chamadas++; return respostaAnthropic(contextoValido)(); } });
  const porta = await s.listen(0);
  try {
    const casos = [
      pedido({ liveId: 'https://kick.com/x' }),
      pedido({ canal: 'tem espaco' }),
      pedido({ deMs: 5000, ateMs: 1000 }),
      pedido({ quadros: [{ jpegBase64: 'nao-e-jpeg' }, quadro(), quadro()] }),
    ];
    for (const c of casos) {
      const r = await postJson(porta, c);
      assert.equal(r.status, 400);
      assert.equal(r.corpo.erro, 'pedido_invalido');
    }
    assert.equal(chamadas, 0);
  } finally { await s.close(); }
});

test('com a chave e um pedido valido, devolve o contexto validado com a META DO SERVIDOR (origem/recebeuFala/revisaoPrompt), nunca a do modelo', async () => {
  let pedidoRecebido = null;
  const s = criarServidor({
    apiKey: 'x',
    fetchImpl: async (url, init) => { pedidoRecebido = { url: url, body: JSON.parse(init.body) }; return respostaAnthropic(contextoValido)(); },
  });
  const porta = await s.listen(0);
  try {
    const r = await postJson(porta, pedido());
    assert.equal(r.status, 200);
    assert.equal(r.corpo.contexto.tipo, 'combate');
    assert.equal(r.corpo.contexto.participacao, 'confirmada');
    assert.equal(r.corpo.contexto.origem, 'ia-remota');
    assert.equal(r.corpo.contexto.recebeuFala, true);
    assert.equal('conf' in r.corpo.contexto, false);
    assert.match(pedidoRecebido.url, /^https:\/\/api\.anthropic\.com\//);
    assert.equal(pedidoRecebido.body.max_tokens <= 1200, true);
    assert.equal(pedidoRecebido.body.messages[0].content.filter((c) => c.type === 'image').length, 3);
  } finally { await s.close(); }
});

test('a mesma janela do mesmo canal/live, com as mesmas evidencias, vem da cache na segunda vez', async () => {
  let chamadas = 0;
  const s = criarServidor({ apiKey: 'x', fetchImpl: async () => { chamadas++; return respostaAnthropic(contextoValido)(); } });
  const porta = await s.listen(0);
  try {
    const r1 = await postJson(porta, pedido());
    const r2 = await postJson(porta, pedido());
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r2.corpo.doCache, true);
    assert.equal(chamadas, 1);
  } finally { await s.close(); }
});

test('cache atendida mesmo com o orcamento da sessao ja esgotado (cache vem ANTES do teto)', async () => {
  let chamadas = 0;
  const s = criarServidor({ apiKey: 'x', limiteChamadasSessao: 1, fetchImpl: async () => { chamadas++; return respostaAnthropic(contextoValido)(); } });
  const porta = await s.listen(0);
  try {
    const r1 = await postJson(porta, pedido());
    assert.equal(r1.status, 200);
    const r2 = await postJson(porta, pedido({ liveId: 'live-outra', canal: 'outro' }));
    assert.equal(r2.status, 429);
    assert.equal(r2.corpo.erro, 'teto_sessao');
    const r3 = await postJson(porta, pedido());
    assert.equal(r3.status, 200);
    assert.equal(r3.corpo.doCache, true);
    assert.equal(chamadas, 1);
  } finally { await s.close(); }
});

test('duas chamadas identicas simultaneas (mesmo liveId/intervalo/evidencias) sao juntadas numa so chamada real', async () => {
  let chamadas = 0;
  let resolverFetch;
  const s = criarServidor({
    apiKey: 'x',
    fetchImpl: async () => {
      chamadas++;
      await new Promise((r) => { resolverFetch = r; });
      return respostaAnthropic(contextoValido)();
    },
  });
  const porta = await s.listen(0);
  try {
    const p1 = postJson(porta, pedido());
    await aguarda(20);
    const p2 = postJson(porta, pedido());
    await aguarda(20);
    resolverFetch();
    const results = await Promise.all([p1, p2]);
    assert.equal(results[0].status, 200);
    assert.equal(results[1].status, 200);
    assert.equal(chamadas, 1);
  } finally { await s.close(); }
});

test('resposta do modelo que nao e JSON, ou que viola o contrato, nunca vira um veredito inventado', async () => {
  const s1 = criarServidor({
    apiKey: 'x',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'isto nao e json' }] }) }),
  });
  const p1 = await s1.listen(0);
  try {
    const r = await postJson(p1, pedido({ liveId: 'live-a' }));
    assert.equal(r.status, 502);
    assert.equal(r.corpo.erro, 'resposta_invalida');
  } finally { await s1.close(); }

  const s2 = criarServidor({
    apiKey: 'x',
    fetchImpl: respostaAnthropic({ tipo: 'combate', participacao: 'confirmada', evidencias: {} }),
  });
  const p2 = await s2.listen(0);
  try {
    const r = await postJson(p2, pedido({ liveId: 'live-b' }));
    assert.equal(r.status, 502);
    assert.equal(r.corpo.erro, 'contexto_invalido');
  } finally { await s2.close(); }
});

test('um pedido que demora alem do prazo da 504, sem travar o servidor', async () => {
  const s = criarServidor({
    apiKey: 'x', timeoutMs: 80,
    fetchImpl: function (url, init) {
      return new Promise(function (resolve, reject) {
        init.signal.addEventListener('abort', function () {
          const e = new Error('abortado'); e.name = 'AbortError'; reject(e);
        });
      });
    },
  });
  const porta = await s.listen(0);
  try {
    const r = await postJson(porta, pedido());
    assert.equal(r.status, 504);
  } finally { await s.close(); }
});

test('o teto de chamadas por sessao e respeitado (servico de desenvolvimento, nao producao)', async () => {
  let chamadas = 0;
  const s = criarServidor({
    apiKey: 'x', limiteChamadasSessao: 2,
    fetchImpl: async () => { chamadas++; return respostaAnthropic(contextoValido)(); },
  });
  const porta = await s.listen(0);
  try {
    const canais = ['c1', 'c2'];
    for (const canal of canais) {
      const r = await postJson(porta, pedido({ canal: canal, liveId: canal }));
      assert.equal(r.status, 200);
    }
    const r3 = await postJson(porta, pedido({ canal: 'c3', liveId: 'c3' }));
    assert.equal(r3.status, 429);
    assert.equal(r3.corpo.erro, 'teto_sessao');
    assert.equal(chamadas, 2);
  } finally { await s.close(); }
});

test('o teto de candidatos por live (intervalos unicos) e respeitado', async () => {
  const s = criarServidor({ apiKey: 'x', limiteChamadasSessao: 999, fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    for (let i = 0; i < LIMITE_CANDIDATOS_POR_LIVE; i++) {
      const r = await postJson(porta, pedido({ deMs: i * 1000, ateMs: i * 1000 + 2000 }));
      assert.equal(r.status, 200, 'candidato ' + i);
    }
    const extra = await postJson(porta, pedido({ deMs: 999000, ateMs: 999000 + 2000 }));
    assert.equal(extra.status, 429);
    assert.equal(extra.corpo.erro, 'teto_candidatos');
  } finally { await s.close(); }
});

test('fila cheia responde 429 e nao conta no orcamento (tentativa que nao chegou a rodar)', async () => {
  let emVoo = 0;
  const s = criarServidor({
    apiKey: 'x', concorrencia: 1, maxFila: 1, limiteChamadasSessao: 999,
    fetchImpl: async () => {
      emVoo++;
      await aguarda(60);
      emVoo--;
      return respostaAnthropic(contextoValido)();
    },
  });
  const porta = await s.listen(0);
  try {
    const indices = [0, 1, 2, 3];
    const ps = indices.map((i) => postJson(porta, pedido({ deMs: i * 1000, ateMs: i * 1000 + 500 })));
    const rs = await Promise.all(ps);
    const codigos = rs.map((r) => r.status);
    assert.ok(codigos.indexOf(429) >= 0, 'esperava pelo menos um 429 de fila cheia: ' + JSON.stringify(codigos));
  } finally { await s.close(); }
});

test('cancelar a ligacao HTTP antes da resposta aborta a chamada real (nenhum assinante restante)', async () => {
  let abortou = false;
  let emVoo;
  const chamadaEmVoo = new Promise((r) => { emVoo = r; });
  let abortado;
  const aAbortar = new Promise((r) => { abortado = r; });
  const s = criarServidor({
    apiKey: 'x',
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      emVoo();
      init.signal.addEventListener('abort', () => { abortou = true; abortado(); const e = new Error('abortado'); e.name = 'AbortError'; reject(e); });
    }),
  });
  const porta = await s.listen(0);
  try {
    // O cliente só desiste depois que a API (mock) já está em voo; o aborto tem de chegar ao fetch real.
    await postJson(porta, pedido(), { cancelarQuando: chamadaEmVoo }).catch(() => {});
    await Promise.race([aAbortar, aguarda(3000)]);
    assert.equal(abortou, true);
  } finally { await s.close(); }
});

test('host ou origem com um caractere no lugar do ponto (127x0x0x1) sao recusados: a regex da confianca e literal', async () => {
  const s = criarServidor({ apiKey: 'x', fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    const r1 = await postJson(porta, pedido(), { host: '127x0x0x1:' + porta });
    assert.equal(r1.status, 403);
    const r2 = await postJson(porta, pedido(), { origin: 'http://127x0x0x1:' + porta });
    assert.equal(r2.status, 403);
  } finally { await s.close(); }
});

test('a cache so reaproveita o veredito da MESMA live, janela e evidencia (cada um muda a chamada)', async () => {
  let chamadas = 0;
  const s = criarServidor({ apiKey: 'x', fetchImpl: async () => { chamadas++; return respostaAnthropic(contextoValido)(); } });
  const porta = await s.listen(0);
  try {
    assert.equal((await postJson(porta, pedido())).status, 200);
    assert.equal(chamadas, 1);
    const outraLive = await postJson(porta, pedido({ liveId: 'live2' }));
    assert.equal(outraLive.status, 200);
    assert.notEqual(outraLive.corpo.doCache, true, 'outra live nao pode vir da cache');
    assert.equal(chamadas, 2);
    const outraJanela = await postJson(porta, pedido({ deMs: 1000, ateMs: 5000 }));
    assert.notEqual(outraJanela.corpo.doCache, true, 'outra janela nao pode vir da cache');
    assert.equal(chamadas, 3);
    const outraEvidencia = await postJson(porta, pedido({ transcricao: 'outra fala' }));
    assert.notEqual(outraEvidencia.corpo.doCache, true, 'outra fala nao pode vir da cache');
    assert.equal(chamadas, 4);
    const igual = await postJson(porta, pedido());
    assert.equal(igual.corpo.doCache, true);
    assert.equal(chamadas, 4);
  } finally { await s.close(); }
});

test('a chave da cache leva liveId, janela, evidencia e as versoes do contrato e do prompt', () => {
  const base = chaveCache(construirPedido(pedido()));
  assert.ok(base.includes(VERSAO_CONTRATO + '|' + VERSAO_PROMPT + '|'), 'versao do contrato e do prompt na chave: ' + base);
  assert.ok(base.startsWith('live1|1000|4000|'), 'live e janela exatas na chave: ' + base);
  assert.notEqual(chaveCache(construirPedido(pedido({ liveId: 'live2' }))), base);
  assert.notEqual(chaveCache(construirPedido(pedido({ deMs: 1001 }))), base);
  assert.notEqual(chaveCache(construirPedido(pedido({ ateMs: 4001 }))), base);
  assert.notEqual(chaveCache(construirPedido(pedido({ transcricao: 'outra' }))), base);
  assert.equal(chaveCache(construirPedido(pedido())), base, 'mesmo pedido, mesma chave');
});

test('serve os arquivos de site/ por GET, sem a chave aparecer em lugar nenhum, e recusa sair da pasta', async () => {
  const s = criarServidor({ apiKey: 'segredo-nunca-visivel', fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    const resp = await fetch('http://127.0.0.1:' + porta + '/index.html');
    const texto = await resp.text();
    assert.equal(resp.status, 200);
    assert.equal(texto.indexOf('segredo-nunca-visivel') >= 0, false);
    const feio = await fetch('http://127.0.0.1:' + porta + '/../server/contexto-servidor.mjs');
    assert.notEqual(feio.status, 200);
    const feio2 = await fetch('http://127.0.0.1:' + porta + '/..%2f..%2fpackage.json');
    assert.notEqual(feio2.status, 200);
  } finally { await s.close(); }
});

test('uma URI malformada no pedido GET responde 400, nao derruba o servidor', async () => {
  const s = criarServidor({ apiKey: 'x', fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    const resp = await fetch('http://127.0.0.1:' + porta + '/%E0%A4%A');
    assert.equal(resp.status, 400);
  } finally { await s.close(); }
});

test('/health responde disponibilidade/contrato/prompt/limites, nunca a chave', async () => {
  const s = criarServidor({ apiKey: 'segredo-nunca-visivel', fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    const resp = await fetch('http://127.0.0.1:' + porta + '/health');
    const json = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(json.temChave, true);
    assert.equal(typeof json.versaoContrato, 'number');
    assert.equal(typeof json.versaoPrompt, 'string');
    assert.equal(typeof json.limites.maxQuadros, 'number');
    assert.equal(JSON.stringify(json).indexOf('segredo-nunca-visivel') >= 0, false);
  } finally { await s.close(); }
});

test('/api/contexto-rust e /health so respondem no caminho exato, sem prefixo', async () => {
  const s = criarServidor({ apiKey: 'x', fetchImpl: respostaAnthropic(contextoValido) });
  const porta = await s.listen(0);
  try {
    const r1 = await fetch('http://127.0.0.1:' + porta + '/health/extra');
    assert.notEqual(r1.status, 200);
    const r2 = await fetch('http://127.0.0.1:' + porta + '/api/contexto-rust/extra', { method: 'POST' });
    assert.notEqual(r2.status, 200);
  } finally { await s.close(); }
});

test('porta 0 funciona (o SO escolhe uma porta livre)', async () => {
  const s = criarServidor({ apiKey: 'x' });
  const porta = await s.listen(0);
  try {
    assert.ok(porta > 0);
  } finally { await s.close(); }
});
