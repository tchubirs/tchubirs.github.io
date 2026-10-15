// abrirPovsParaSimples: só reporta sucesso com vídeo real de cada canal no instante e janela comum de 1 s.
// A função é lida do próprio app.js e corrida em vm com dependências mínimas; onde/trechoComum/linhaDoCanal
// são os reais de relogio.js, sobre playlists sintéticas com a forma real (segmentos com relógio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { linhaDoCanal, janelaComum, trechoComum } from '../site/relogio.js';
import { slugDoNome } from '../site/kick.js';
import { prepararPovs } from '../site/povs-preparar.js';

const APP = new URL('../site/app.js', import.meta.url);
const src = readFileSync(APP, 'utf8');
const ini = src.indexOf('async function abrirPovsParaSimples');
const fim = src.indexOf('const evento = montarEvento');
assert.ok(ini > 0 && fim > ini, 'função não encontrada em app.js');
const CORPO = src.slice(ini, fim);

const MS = 1_700_000_000_000; // instante marcado (ms alinhado a segundos)
const M = 60_000;
const SEG = 10_000;

// Playlist sintética com a forma real: um VOD por trecho, segmentos de ~10 s com relógio (PDT).
function pecasDe(trechos) {
  return trechos.map(([a, b], k) => {
    const segmentos = [];
    for (let t = a; t < b; t += SEG) {
      segmentos.push({ inicio: t, duracaoS: Math.min(SEG, b - t) / 1000, mediaT: (t - a) / 1000 });
    }
    return {
      vod: { id: `v${k}`, inicioApi: a + 9e9 }, // metadado da API: aproximado e errado de propósito
      playlist: { inicio: a, fim: b, segmentos, fonteDoRelogio: 'program-date-time' },
    };
  });
}

// Cenário: estado da página, catálogo de canais carregáveis e um abrirLanceDoEvento que carrega como a página.
function cenario({ catalogo = {}, nudges = {}, liberado = true, linhas = null } = {}) {
  const estado = { linhas: [], janela: null, nudges: { ...nudges }, vodsPorCanal: new Map(), vodsDoEvento: new Map(), pecasLidas: new Map() };
  for (const [slug, trechos] of Object.entries(catalogo)) {
    const pecas = pecasDe(trechos);
    estado.vodsPorCanal.set(slug, { slug, estado: 'ok', vods: pecas.map((p, i) => ({ id: p.vod.id, inicioApi: trechos[i][0], duracaoMs: trechos[i][1] - trechos[i][0] })) });
    for (const p of pecas) estado.pecasLidas.set(`${slug}|${p.vod.id}`, p);
  }
  const chamadas = [];
  const carregar = (canais, opts) => {
    const ref = slugDoNome(opts.referencia);
    for (const [c, d] of Object.entries(opts.ajustes || {})) {
      if (Number.isFinite(d)) estado.nudges[slugDoNome(c)] = (estado.nudges[ref] || 0) + d;
    }
    estado.linhas = canais.filter((s) => catalogo[s]).map((s) => ({ ...linhaDoCanal(s, pecasDe(catalogo[s])) }));
    estado.janela = janelaComum(estado.linhas);
  };
  if (linhas) { estado.linhas = linhas; estado.janela = janelaComum(linhas); }
  const abrirLanceDoEvento = async (canais, ms, foco, opts) => {
    chamadas.push({ canais, ms, foco, opts });
    carregar(canais, opts);
  };
  const evento = { povsLiberados: () => ({ liberado, min: 0 }) };
  const ctx = vm.createContext({ estado, evento, abrirLanceDoEvento, slugDoNome, trechoComum,
    cargaEmCurso: null, vezNoite: 0,
    lerTexto: () => { throw new Error('não deveria pedir playlists já em memória'); },
    prepararPovs: (opcoes) => prepararPovs({ ...opcoes, buscar: async () => new Response('', { status: 404 }) }),
  });
  const abrirPovs = vm.runInContext(`${CORPO}\n;abrirPovsParaSimples`, ctx);
  return { abrirPovs, estado, chamadas, ctx };
}

// Arrays criados dentro do vm são de outro realm: compara-se a cópia plana.
const plano = (x) => JSON.parse(JSON.stringify(x));

const pedido = (extra) => ({ canais: ['ana', 'bia'], ms: MS, foco: 'ana', ...extra });

test('sucesso com ajuste de referência não nulo e ajuste relativo', async () => {
  // ana: janela comum com nudge 2000 -> [MS-60s, MS+60s]. bia só começa 500 ms depois do instante sem o ajuste;
  // com nudge 1500 (= 2000 + (-500), relativo ao foco) a janela dela passa a conter MS.
  const c = cenario({
    nudges: { ana: 2000 },
    catalogo: { ana: [[MS - 58_000, MS + 62_000]], bia: [[MS + 500, MS + 60_000]] },
  });
  const ok = await c.abrirPovs(pedido({ canais: ['Ana', 'bia'], ajustes: { bia: -500 } }));
  assert.equal(ok, true);
  assert.equal(c.chamadas.length, 1);
  assert.deepEqual(plano(c.chamadas[0].canais), ['ana', 'bia']);
  assert.equal(c.chamadas[0].foco, 'ana');
  assert.equal(c.chamadas[0].opts.referencia, 'ana');
  assert.equal(c.estado.nudges.ana, 2000);
  assert.equal(c.estado.nudges.bia, 1500);
});

test('canal pedido sem linha carregada -> false', async () => {
  const c = cenario({ catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS + M]] } });
  assert.equal(await c.abrirPovs(pedido({ canais: ['ana', 'bia', 'caio'] })), false);
  assert.equal(c.chamadas.length, 0, 'canal ausente não troca a sessão');
});

test('buraco no instante mesmo com a união cobrindo MS -> false', async () => {
  const c = cenario({
    catalogo: {
      ana: [[MS - M, MS + M]],
      bia: [[MS - M, MS - 5_000], [MS + 5_000, MS + M]], // buraco de 10 s em volta de MS
    },
  });
  assert.equal(await c.abrirPovs(pedido()), false);
});

test('canal começa depois do instante (antes) -> false', async () => {
  const c = cenario({ catalogo: { ana: [[MS - M, MS + M]], bia: [[MS + 2_000, MS + M]] } });
  assert.equal(await c.abrirPovs(pedido()), false);
});

test('canal acaba antes do instante (depois) -> false', async () => {
  const c = cenario({ catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS - 2_000]] } });
  assert.equal(await c.abrirPovs(pedido()), false);
});

test('instante exatamente no fim do segmento não é tocável -> false', async () => {
  const c = cenario({ catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS]] } });
  assert.equal(await c.abrirPovs(pedido()), false);
});

test('janela comum menor que 1 s -> false; exatamente 1 s com MS dentro -> true', async () => {
  const curta = cenario({ catalogo: { ana: [[MS - 500, MS + M]], bia: [[MS - M, MS + 400]] } }); // 900 ms
  assert.equal(await curta.abrirPovs(pedido()), false);
  const exata = cenario({ catalogo: { ana: [[MS - 500, MS + M]], bia: [[MS - M, MS + 500]] } }); // 1000 ms
  assert.equal(await exata.abrirPovs(pedido()), true);
});

test('foco inválido ou duplicados não chamam o carregador', async () => {
  const catalogo = { ana: [[MS - M, MS + M]], bia: [[MS - M, MS + M]] };
  const casos = [
    pedido({ foco: 'caio' }),                    // foco fora dos canais
    pedido({ foco: '' }),                        // foco vazio
    pedido({ foco: undefined }),                 // sem foco
    pedido({ foco: 123 }),                       // foco não é texto
    pedido({ canais: ['ana', ' ANA', '@ana'] }), // só um canal único
    pedido({ canais: ['ana', 'bia', ''] }),      // nome vazio
    pedido({ canais: ['ana', 7] }),              // nome não é texto
    pedido({ canais: 'ana,bia' }),               // não é lista
    pedido({ ms: Number.NaN }),
    pedido({ ms: Infinity }),
  ];
  for (const caso of casos) {
    const c = cenario({ catalogo, nudges: { ana: 0 } });
    assert.equal(await c.abrirPovs(caso), false, JSON.stringify(caso));
    assert.equal(c.chamadas.length, 0, `carregador chamado com ${JSON.stringify(caso)}`);
    assert.deepEqual(c.estado.nudges, { ana: 0 });
  }
});

test('foco e canais normalizados (maiúsculas, @, duplicados) -> sucesso', async () => {
  const c = cenario({ catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS + M]] } });
  assert.equal(await c.abrirPovs(pedido({ canais: ['ana', 'bia', 'Ana'], foco: '@Ana' })), true);
  assert.deepEqual(plano(c.chamadas[0].canais), ['ana', 'bia']);
  assert.equal(c.chamadas[0].foco, 'ana');
});

test('gate de ao vivo bloqueado -> false sem carregar', async () => {
  const c = cenario({ liberado: false, catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS + M]] } });
  assert.equal(await c.abrirPovs(pedido()), false);
  assert.equal(c.chamadas.length, 0);
});

test('seleção exata já carregada, instante na união, com buraco -> não chama o carregador', async () => {
  const linhas = [
    linhaDoCanal('ana', pecasDe([[MS - M, MS + M]])),
    linhaDoCanal('bia', pecasDe([[MS - M, MS - 5_000], [MS + 5_000, MS + M]])),
  ];
  const c = cenario({ linhas, nudges: { ana: 0 }, catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS - 5_000], [MS + 5_000, MS + M]] } });
  assert.equal(await c.abrirPovs(pedido({ ajustes: { bia: 3000 } })), false);
  assert.equal(c.chamadas.length, 0, 'carregador não deve mexer na grelha');
  assert.deepEqual(c.estado.nudges, { ana: 0 }, 'ajustes não devem ser aplicados');
});

test('seleção exata já carregada e coberta -> segue e confirma', async () => {
  const linhas = [
    linhaDoCanal('ana', pecasDe([[MS - M, MS + M]])),
    linhaDoCanal('bia', pecasDe([[MS - M, MS + M]])),
  ];
  const catalogo = { ana: [[MS - M, MS + M]], bia: [[MS - M, MS + M]] };
  const c = cenario({ linhas, catalogo });
  assert.equal(await c.abrirPovs(pedido()), true);
  assert.equal(c.chamadas.length, 1);
});

test('nova seleção sem cobertura preserva canais, ajustes, cursor e marcas anteriores', async () => {
  const linhas = [linhaDoCanal('antigo', pecasDe([[MS - M, MS + M]]))];
  const c = cenario({ linhas, nudges: { antigo: 1234 }, catalogo: { ana: [[MS - M, MS + M]], bia: [[MS + 1000, MS + M]] } });
  c.estado.agoraMs = MS - 8000;
  c.estado.momentos = [{ ms: MS - 9000, canal: 'antigo' }];
  const antes = { linhas: c.estado.linhas, janela: c.estado.janela, nudges: { ...c.estado.nudges }, agora: c.estado.agoraMs, momentos: c.estado.momentos };
  assert.equal(await c.abrirPovs(pedido({ ajustes: { bia: 100 } })), false);
  assert.equal(c.chamadas.length, 0);
  assert.equal(c.estado.linhas, antes.linhas);
  assert.equal(c.estado.janela, antes.janela);
  assert.deepEqual(c.estado.nudges, antes.nudges);
  assert.equal(c.estado.agoraMs, antes.agora);
  assert.equal(c.estado.momentos, antes.momentos);
});

test('outra noite aberta durante preparação invalida resultado antigo', async () => {
  const c = cenario({ catalogo: { ana: [[MS - M, MS + M]], bia: [[MS - M, MS + M]] } });
  let liberar;
  const real = c.ctx.prepararPovs;
  c.ctx.prepararPovs = async (opcoes) => { const r = await real(opcoes); await new Promise((ok) => { liberar = ok; }); return r; };
  const p = c.abrirPovs(pedido());
  while (!liberar) await new Promise(setImmediate);
  c.ctx.vezNoite++;
  liberar();
  assert.equal(await p, false);
  assert.equal(c.chamadas.length, 0);
});

test('pedido previamente cancelado ou carregador ocupado não inicia preparação', async () => {
  const c = cenario();
  const controle = new AbortController(); controle.abort();
  assert.equal(await c.abrirPovs(pedido({ sinal: controle.signal })), false);
  c.ctx.cargaEmCurso = Promise.resolve();
  assert.equal(await c.abrirPovs(pedido()), false);
  assert.equal(c.chamadas.length, 0);
});
