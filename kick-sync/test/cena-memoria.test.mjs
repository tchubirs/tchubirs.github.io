// A memória de envolventes de procurarAngulos (cena.js), sem rede, sem browser e sem chave.
//
// O som é sintético (cliques + ruído, com um PRNG fixo) e o `somDe` é falso, com contagem
// de pedidos. Fixa-se aqui: um hit não descarrega nem faz FFT, dá o MESMO resultado, nunca
// guarda o que não está completo, nunca devolve cache a quem cancelou, respeita o limite de
// 256 em LRU e não mistura fontes diferentes (origem).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procurarAngulos, LIMITE_MEMORIA, JANELA_S } from '../site/cena.js';
import { TAXA } from '../site/sinal.js';
import { vodCollectionSignature } from '../site/evento-ui.js';

const T0 = Date.parse('2026-10-10T20:00:00.000Z');
const N = TAXA * 150;
const QUANDO = T0 + 60_000;
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cliques (ataques curtos e fortes) em instantes irregulares. */
function cliques(semente) {
  const rnd = gerador(semente);
  const x = new Float32Array(N);
  let t = 0;
  while (t < N) {
    t += Math.floor(TAXA * (0.5 + rnd()));
    const f = 0.3 + rnd();
    for (let i = 0; i < 400 && t + i < N; i++) x[t + i] += (rnd() * 2 - 1) * f * Math.exp(-i / 100);
  }
  return x;
}

/** Ruído de fundo, um gerador por semente. */
function ruido(semente, nivel = 0.02) {
  const rnd = gerador(semente);
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) x[i] = (rnd() * 2 - 1) * nivel;
  return x;
}

/** Soma amostra a amostra de partes (cada uma com N amostras). */
function somar(...partes) {
  const y = new Float32Array(N);
  for (const p of partes) for (let i = 0; i < N; i++) y[i] += p[i];
  return y;
}

const CENA = cliques(1);
const ATRASO = Math.round(0.4 * TAXA);
const atrasada = new Float32Array(N);
for (let i = ATRASO; i < N; i++) atrasada[i] = CENA[i - ATRASO];

const REF = somar(CENA, ruido(2));
const COLEGA = somar(atrasada, ruido(3));
const LONGE = somar(cliques(9), ruido(10));
const SILENCIO = new Float32Array(N);

/**
 * `somDe` falso: `fontes[canal]` é um Float32Array (fatiado a partir de deMs) ou uma função
 * (deMs, duracaoS) => som. `registo` guarda cada pedido real; `antes(nome)` corre antes de
 * devolver o som (para simular um aborto a meio do download).
 */
function somDeFalso(fontes, registo, antes = null) {
  return async (canal, deMs, duracaoS) => {
    const nome = typeof canal === 'string' ? canal : canal.slug;
    registo.push({ canal: nome, deMs, duracaoS });
    if (antes) await antes(nome);
    const fonte = fontes[nome];
    if (fonte == null) return null;
    if (typeof fonte === 'function') return fonte(deMs, duracaoS);
    const de = Math.round(((deMs - T0) / 1000) * TAXA);
    if (de < 0 || de >= fonte.length) return null;
    return fonte.subarray(de, Math.min(fonte.length, de + Math.round(duracaoS * TAXA)));
  };
}

async function tudo(gerado) {
  const saida = [];
  for await (const r of gerado) saida.push(r);
  return saida;
}

const pedidos = (registo, nome) => registo.filter((p) => p.canal === nome).length;

test('a assinatura de VOD muda com origem, cobertura, estado e marca de ao vivo', () => {
  const results = [{ slug: 'ref', estado: 'ok', vods: [{ id: 1, master: 'https://cdn.test/1.m3u8', inicioApi: T0, duracaoMs: 150_000, aoVivo: false }] }];
  const before = vodCollectionSignature(results);
  for (const [field, value] of Object.entries({ id: 2, master: 'https://cdn.test/2.m3u8', inicioApi: T0 + 1000, duracaoMs: 200_000, aoVivo: true })) {
    const changed = structuredClone(results);
    changed[0].vods[0][field] = value;
    assert.notEqual(vodCollectionSignature(changed), before, field);
  }
  const failed = structuredClone(results);
  failed[0].estado = 'erro';
  assert.notEqual(vodCollectionSignature(failed), before);
});

test('reordenar canais não invalida o som; reordenar VODs sobrepostos invalida', () => {
  const first = { slug: 'ref', estado: 'ok', vods: [{ id: 1 }, { id: 2 }] };
  const other = { slug: 'outro', estado: 'ok', vods: [{ id: 3 }] };
  assert.equal(vodCollectionSignature([first, other]), vodCollectionSignature([other, first]));
  assert.notEqual(vodCollectionSignature([first]), vodCollectionSignature([{ ...first, vods: [...first.vods].reverse() }]));
});

// A chave que procurarAngulos usa: canal + origem '' + instante exacto (quandoMs - janelaS/2 - janelaS) + janelaS.
function chaveDe(canal, quandoMs = QUANDO, janelaS = JANELA_S) {
  return JSON.stringify(['', canal, quandoMs - (janelaS * 1000) / 2 - janelaS * 1000, janelaS]);
}

const fontesBase = (extra = {}) => ({ ref: REF, colega: COLEGA, longe: LONGE, ...extra });

test('primeira busca baixa; a segunda, no mesmo trecho, não baixa nada e dá os MESMOS resultados', async () => {
  const memoria = new Map();
  const registo = [];
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega', 'longe'], memoria };

  const primeira = await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontesBase(), registo) }));
  assert.equal(registo.length, 3, 'ref + colega + longe: três downloads');
  assert.equal(primeira.find((r) => r.canal === 'colega').estado, 'estava', 'o sinal de teste tem de dar "estava"');

  const segunda = await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontesBase(), registo) }));
  assert.equal(registo.length, 3, 'a segunda busca não pede som a ninguém');
  assert.deepEqual(segunda, primeira, 'a segunda busca dá exactamente o mesmo');

  const semMemoria = await tudo(procurarAngulos({ ...args, memoria: null, somDe: somDeFalso(fontesBase(), []) }));
  assert.deepEqual(segunda, semMemoria, 'e o mesmo que uma busca sem memória');
});

test('mudar o instante ou a janela chama o somDe outra vez', async () => {
  const memoria = new Map();
  const registo = [];
  const somDe = somDeFalso(fontesBase(), registo);
  await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe, memoria }));
  assert.equal(registo.length, 2);

  await tudo(procurarAngulos({ quandoMs: QUANDO + 1000, referencia: 'ref', candidatos: ['colega'], somDe, memoria }));
  assert.equal(registo.length, 4, 'instante novo: ref e colega outra vez');

  await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe, memoria, janelaS: JANELA_S + 5 }));
  assert.equal(registo.length, 6, 'janela nova: ref e colega outra vez');
});

test('mudar a origem não reutiliza a memória', async () => {
  const memoria = new Map();
  const registo = [];
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], memoria };
  await tudo(procurarAngulos({ ...args, origem: 'vod-A', somDe: somDeFalso(fontesBase(), registo) }));
  assert.equal(registo.length, 2);
  await tudo(procurarAngulos({ ...args, origem: 'vod-B', somDe: somDeFalso(fontesBase(), registo) }));
  assert.equal(registo.length, 4, 'outra origem baixa tudo de novo');
});

test('diferentes VODs no mesmo Map não se reutilizam: o colega sem som no VOD B não herda o "estava" do A', async () => {
  const memoria = new Map();
  const registo = [];
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], memoria };
  const [a] = await tudo(procurarAngulos({ ...args, origem: 'vod-A', somDe: somDeFalso(fontesBase(), registo) }));
  const [b] = await tudo(procurarAngulos({
    ...args, origem: 'vod-B', somDe: somDeFalso(fontesBase({ colega: SILENCIO }), registo),
  }));
  assert.equal(a.estado, 'estava');
  assert.notEqual(b.estado, 'estava');
  assert.equal(pedidos(registo, 'colega'), 2, 'o colega foi pedido nos dois VODs');
});

test('um download parcial (janela cortada) não entra na memória', async () => {
  const memoria = new Map();
  const registo = [];
  const fontes = fontesBase({ colega: COLEGA.subarray(0, 10 * TAXA) });
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], memoria };
  const [r1] = await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontes, registo) }));
  assert.equal(r1.estado, 'sem-som');
  assert.equal(memoria.has(chaveDe('colega')), false, 'o colega cortado não ficou guardado');

  fontes.colega = COLEGA;
  const [r2] = await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontes, registo) }));
  assert.equal(pedidos(registo, 'colega'), 2, 'a segunda vez descarrega de novo');
  assert.equal(r2.estado, 'estava');
});

test('um erro de download não envenena a memória', async () => {
  const memoria = new Map();
  const registo = [];
  const fontes = fontesBase({ colega: () => { throw new Error('rede caiu'); } });
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], memoria };
  const [r1] = await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontes, registo) }));
  assert.equal(r1.estado, 'sem-som');
  assert.match(r1.erro, /rede caiu/);

  fontes.colega = COLEGA;
  const [r2] = await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontes, registo) }));
  assert.equal(pedidos(registo, 'colega'), 2);
  assert.equal(r2.estado, 'estava');
});

test('um aborto a meio do download do canal não o guarda; a referência, já completa, sim', async () => {
  const memoria = new Map();
  const registo = [];
  const ctl = new AbortController();
  const antes = async (nome) => { if (nome === 'colega') { ctl.abort(); await esperar(5); } };
  await assert.rejects(
    tudo(procurarAngulos({
      quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe: somDeFalso(fontesBase(), registo, antes), memoria, sinal: ctl.signal,
    })),
    { name: 'AbortError' },
  );
  assert.equal(memoria.has(chaveDe('colega')), false, 'o colega abortado não ficou guardado');
  assert.equal(memoria.has(chaveDe('ref')), true, 'a referência chegou inteira antes do aborto');

  const base = registo.length;
  const [r] = await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe: somDeFalso(fontesBase(), registo), memoria,
  }));
  assert.equal(registo.length - base, 1, 'só o colega desce de novo');
  assert.equal(r.estado, 'estava');
});

test('uma busca já cancelada não devolve nada da memória', async () => {
  const memoria = new Map();
  const registo = [];
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], memoria };
  await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontesBase(), registo) }));
  const base = registo.length;

  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(
    tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontesBase(), registo), sinal: ctl.signal })),
    { name: 'AbortError' },
  );
  assert.equal(registo.length, base, 'não pediu nada, e não respondeu com cache');
});

test('cancelar a meio de uma busca com hits: o que sobra não sai', async () => {
  const memoria = new Map();
  const registo = [];
  const args = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega', 'longe'], memoria };
  await tudo(procurarAngulos({ ...args, somDe: somDeFalso(fontesBase(), registo) }));
  const ctl = new AbortController();
  const gerado = procurarAngulos({ ...args, somDe: somDeFalso(fontesBase(), registo), sinal: ctl.signal });
  const primeiro = await gerado.next();
  assert.ok(primeiro.value);
  ctl.abort();
  await assert.rejects(gerado.next(), { name: 'AbortError' });
});

test('a memória tem um limite de 256 entradas, em LRU', async () => {
  assert.equal(LIMITE_MEMORIA, 256);
  const memoria = new Map();
  const registo = [];
  // Canais sem som naquele instante: a janela inteira é silêncio (guardável) e não há FFT.
  const nomes = Array.from({ length: 260 }, (_, i) => `c${i}`);
  const fontes = fontesBase(Object.fromEntries(nomes.map((n) => [n, SILENCIO])));
  await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: nomes, somDe: somDeFalso(fontes, registo), memoria,
  }));
  assert.equal(memoria.size, 256);
  assert.equal(memoria.has(chaveDe('ref')), false, 'a referência, a mais antiga, saiu');
  assert.equal(memoria.has(chaveDe('c259')), true, 'o último ficou');

  const base = registo.length;
  await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['c259'], somDe: somDeFalso(fontes, registo), memoria }));
  assert.equal(pedidos(registo.slice(base), 'c259'), 0, 'o que ficou não volta a baixar');
  assert.equal(memoria.size, 256);
});

test('o que fica na memória são só as três envolventes e metadados (sem PCM)', async () => {
  const memoria = new Map();
  await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe: somDeFalso(fontesBase(), []), memoria,
  }));
  assert.equal(memoria.size, 2);
  for (const janelas of memoria.values()) {
    assert.equal(janelas.length, 3);
    for (const j of janelas) {
      assert.deepEqual(Object.keys(j).sort(), ['comSom', 'env', 'len']);
      if (j.env != null) {
        assert.ok(j.env instanceof Float32Array);
        assert.ok(j.env.length < N / 10, 'uma envolvente, não o som');
      }
    }
  }
});

test('uma memória que não é um Map é um erro de quem chama', async () => {
  await assert.rejects(
    tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe: somDeFalso(fontesBase(), []), memoria: {} })),
    TypeError,
  );
});
