import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPovs } from '../site/povs-preparar.js';

const T = Date.parse('2026-10-13T21:00:00Z');
const MS = T + 30_000;
const canais = ['ana', 'bia'];
const vod = (slug, aoVivo = false) => ({ id: slug, inicioApi: T, duracaoMs: 60_000, aoVivo, master: `https://video.test/${slug}/master.m3u8` });
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160\nmedia.m3u8';
const playlist = (inicio = T) => ['#EXTM3U', '#EXT-X-TARGETDURATION:10',
  ...Array.from({ length: 6 }, (_, i) => `#EXT-X-PROGRAM-DATE-TIME:${new Date(inicio + i * 10_000).toISOString()}\n#EXTINF:10,\n${i}.ts`), '#EXT-X-ENDLIST'].join('\n');
const preparar = (extra = {}) => {
  const textos = [];
  const vodsPorCanal = new Map(canais.map((slug) => [slug, { slug, estado: 'ok', vods: [vod(slug)] }]));
  const opcoes = { canais, ms: MS, nudges: { ana: 2000, bia: 3000 }, vodsPorCanal, vodsDoEvento: new Map(), pecasLidas: new Map(),
    buscar: () => { throw new Error('catálogo já em memória'); },
    lerTexto: async (url, { sinal }) => { textos.push({ url, sinal }); return url.endsWith('master.m3u8') ? master : playlist(); },
    ...extra,
  };
  return { opcoes, textos, abrir: () => prepararPovs(opcoes) };
};
const memoria = (c) => JSON.stringify({ vods: [...c.opcoes.vodsPorCanal], evento: [...c.opcoes.vodsDoEvento], pecas: [...c.opcoes.pecasLidas], nudges: c.opcoes.nudges });

test('lê playlists reais, preserva memória e leva sinal até cada leitura', async () => {
  const sinal = new AbortController().signal;
  const c = preparar({ sinal });
  const antes = memoria(c);
  const r = await c.abrir();
  assert.ok(r);
  assert.equal(r.lidas.size, 2);
  assert.deepEqual(r.catalogo.map((x) => x.slug), canais);
  assert.equal(c.textos.length, 4);
  assert.ok(c.textos.every((x) => x.sinal === sinal));
  assert.equal(memoria(c), antes);
});

test('metadado cobre a jogada mas relógio do vídeo não: rejeita sem gravar nada', async () => {
  const c = preparar({ lerTexto: async (url) => url.endsWith('master.m3u8') ? master : playlist(url.includes('/bia/') ? MS + 10_000 : T) });
  const antes = memoria(c);
  assert.equal(await c.abrir(), null);
  assert.equal(memoria(c), antes);
});

for (const falha of ['master vazio', 'HTTP']) test(`playlist indisponível (${falha}) não troca sessão nem grava peça inválida`, async () => {
  const c = preparar({ lerTexto: async (url) => {
    if (url.includes('/bia/')) { if (falha === 'HTTP') throw new Error('HTTP 403'); return ''; }
    return url.endsWith('master.m3u8') ? master : playlist();
  } });
  const antes = memoria(c);
  assert.equal(await c.abrir(), null);
  assert.equal(memoria(c), antes);
});

test('cancelamento prévio não pede rede', async () => {
  const controle = new AbortController(); controle.abort();
  const c = preparar({ sinal: controle.signal });
  await assert.rejects(c.abrir, { name: 'AbortError' });
  assert.equal(c.textos.length, 0);
});

test('cancelar catálogo aborta fetch e não guarda resposta parcial', async () => {
  const controle = new AbortController();
  let sinalFetch;
  let pronto;
  const pediu = new Promise((ok) => { pronto = ok; });
  const c = preparar({ vodsPorCanal: new Map(), sinal: controle.signal, buscar: (_, { signal }) => {
    sinalFetch = signal; pronto();
    return new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(new DOMException('cancelado', 'AbortError')), { once: true }));
  } });
  const antes = memoria(c);
  const p = c.abrir();
  await pediu;
  controle.abort();
  await assert.rejects(p, { name: 'AbortError' });
  assert.equal(sinalFetch.aborted, true);
  assert.equal(memoria(c), antes);
});

test('cancelar playlist impede pedido seguinte mesmo quando leitor antigo termina tarde', async () => {
  const controle = new AbortController();
  let liberar, pronto;
  const espera = new Promise((ok) => { liberar = ok; });
  const pediu = new Promise((ok) => { pronto = ok; });
  let leituras = 0;
  const c = preparar({ sinal: controle.signal, lerTexto: async () => { leituras++; pronto(); await espera; return master; } });
  const antes = memoria(c);
  const p = c.abrir();
  await pediu;
  controle.abort(); liberar();
  await assert.rejects(p, { name: 'AbortError' });
  assert.equal(leituras, 2, 'somente os dois masters que já estavam em voo');
  assert.equal(memoria(c), antes);
});

test('peças de VOD encerrado são reutilizadas, mas live relê o relógio', async () => {
  const a = preparar();
  const primeira = await a.abrir();
  const b = preparar({ pecasLidas: primeira.lidas });
  assert.ok(await b.abrir());
  assert.equal(b.textos.length, 0);
  b.opcoes.vodsPorCanal.set('bia', { slug: 'bia', estado: 'ok', vods: [vod('bia', true)] });
  assert.ok(await b.abrir());
  assert.equal(b.textos.length, 2, 'master e playlist da live são atualizados');
});

test('canal sem VOD é rejeitado antes de ler playlists', async () => {
  const c = preparar({ vodsPorCanal: new Map(), buscar: async () => new Response('[]', { status: 200 }) });
  assert.equal(await c.abrir(), null);
  assert.equal(c.textos.length, 0);
});

test('limite de seis leituras simultâneas e catálogo na ordem pedida', async () => {
  const lista = Array.from({ length: 9 }, (_, i) => `canal${i}`);
  let emVoo = 0, pico = 0;
  const c = preparar({ canais: lista, nudges: {}, vodsPorCanal: new Map(lista.map((slug) => [slug, { slug, estado: 'ok', vods: [vod(slug)] }])),
    lerTexto: async (url) => {
      emVoo++; pico = Math.max(pico, emVoo);
      await new Promise(setImmediate);
      emVoo--;
      return url.endsWith('master.m3u8') ? master : playlist();
    } });
  const r = await c.abrir();
  assert.ok(r);
  assert.deepEqual(r.catalogo.map((x) => x.slug), lista);
  assert.equal(pico, 6);
});
