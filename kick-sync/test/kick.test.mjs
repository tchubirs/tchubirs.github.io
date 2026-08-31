import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  vodsDoCanal, lerMaster, lerPlaylist, segmentosNaJanela, tempoDeMidia,
} from '../site/kick.js';

// The fixtures are real responses recorded from Kick on 31/08/2026. That is the
// point: Kick's endpoints are undocumented and change silently, so these tests
// are the contract. When Kick changes shape, this fails loudly here instead of
// degrading quietly in someone's session.
const F = new URL('../probes/fixtures/', import.meta.url);
const ler = (n) => readFileSync(new URL(n, F), 'utf8');

const MASTER_URL = 'https://stream.kick.com/x/ivs/v1/1/a/2026/8/30/20/47/b/media/hls/master.m3u8';

test('the ladder comes out highest-first, and the cheap rung is real', () => {
  const l = lerMaster(ler('xqc-master.m3u8'), MASTER_URL);
  assert.equal(l.length, 5);
  assert.equal(l[0].altura, 1080);
  assert.equal(l[0].fps, 60);
  const barato = l.at(-1);
  assert.equal(barato.altura, 160);
  assert.equal(barato.bitrate, 230000, '230 kbps is what makes 30 tiles affordable');
  assert.ok(barato.url.startsWith('https://'), 'relative paths must be resolved against the master');
});

test('every segment carries the wall clock, to the millisecond', () => {
  const p = lerPlaylist(ler('xqc-media.m3u8'), `${MASTER_URL.replace(/master.*/, '')}160p30/playlist.m3u8`);
  assert.equal(p.fonteDoRelogio, 'program-date-time');
  assert.ok(p.segmentos.length > 100);
  assert.equal(p.segmentos[0].inicio, Date.parse('2026-08-30T20:47:04.390Z'));
  assert.equal(p.segmentos[0].duracaoS, 10);
  // Second segment: PDT again, and it must agree with first + duration.
  assert.equal(p.segmentos[1].inicio, p.segmentos[0].inicio + 10000);
  assert.equal(p.segmentos[1].mediaT, 10);
});

// The owner believed the m3u8 path carried the absolute start. It carries the
// minute and throws the seconds away. This is the measurement that killed it.
test('the path clock is minute-truncated — which is why PDT replaced it', () => {
  const doCaminho = MASTER_URL.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\//);
  const caminhoMs = Date.UTC(+doCaminho[1], +doCaminho[2] - 1, +doCaminho[3], +doCaminho[4], +doCaminho[5]);
  const p = lerPlaylist(ler('xqc-media.m3u8'), MASTER_URL);
  const erroS = (p.inicio - caminhoMs) / 1000;
  assert.ok(erroS >= 0 && erroS < 60, `path error must live inside one minute, got ${erroS}s`);
  assert.ok(erroS > 1, 'and it is not zero — that is the whole point');
});

test('a clip fetches the segments that overlap, and nothing else', () => {
  const p = lerPlaylist(ler('xqc-media.m3u8'), MASTER_URL);
  const t0 = p.segmentos[0].inicio;
  // A 5-second window sitting inside one segment must fetch exactly that one.
  assert.equal(segmentosNaJanela(p, t0 + 2000, t0 + 7000).length, 1);
  // A window straddling a boundary fetches both, never the whole VOD.
  assert.equal(segmentosNaJanela(p, t0 + 8000, t0 + 12000).length, 2);
  assert.ok(p.segmentos.length > 100, 'and the VOD is long — so this is a real saving');
});

test('wall clock maps into media time, and outside the VOD says so', () => {
  const p = lerPlaylist(ler('xqc-media.m3u8'), MASTER_URL);
  const t0 = p.segmentos[0].inicio;
  assert.equal(tempoDeMidia(p, t0), 0);
  assert.equal(tempoDeMidia(p, t0 + 3500), 3.5);
  assert.equal(tempoDeMidia(p, t0 + 10000), 10);
  // Never seek to zero for a moment this angle did not film.
  assert.equal(tempoDeMidia(p, t0 - 60000), null);
  assert.equal(tempoDeMidia(p, p.fim + 60000), null);
});

// Each of these is a real thing a user will hit, and none may render as an
// empty grid tile with no explanation.
test('every way a channel can fail has a name', async () => {
  const resp = (status, corpo) => async () => ({
    status, ok: status < 400, json: async () => corpo,
  });
  const casos = [
    ['NOME COM ESPAÇO', null, 'nome-invalido'],
    ['naoexiste', resp(404), 'canal-nao-existe'],
    ['x', resp(429), 'rate-limit'],
    ['x', resp(200, []), 'sem-vods'],
    ['x', resp(200, { erro: 'oops' }), 'formato-inesperado'],
    ['x', resp(500), 'http-500'],
  ];
  for (const [slug, buscar, esperado] of casos) {
    const r = await vodsDoCanal(slug, { buscar: buscar || (async () => { throw new Error('não devia chamar'); }) });
    assert.equal(r.estado, esperado, `${slug} -> ${esperado}`);
    assert.deepEqual(r.vods, []);
  }
});

test('the network being down is a state, not a crash', async () => {
  const r = await vodsDoCanal('xqc', { buscar: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(r.estado, 'sem-rede');
  assert.match(r.erro, /ECONNRESET/);
});

test('private, pruned and deleted VODs are dropped, not shown broken', async () => {
  const corpo = [
    { id: 1, source: 'https://a/master.m3u8', start_time: '2026-08-30 20:47:07', video: {} },
    { id: 2, source: 'https://b/master.m3u8', video: { is_private: true } },
    { id: 3, source: 'https://c/master.m3u8', video: { is_pruned: true } },
    { id: 4, source: 'https://d/master.m3u8', video: { deleted_at: '2026-01-01' } },
    { id: 5, source: null, video: {} },
  ];
  const r = await vodsDoCanal('xqc', {
    buscar: async () => ({ status: 200, ok: true, json: async () => corpo }),
  });
  assert.equal(r.estado, 'ok');
  assert.equal(r.vods.length, 1);
  assert.equal(r.vods[0].id, 1);
  assert.equal(r.vods[0].inicioApi, Date.parse('2026-08-30T20:47:07Z'));
});

test('a VOD list that is all unusable is not "ok" with nothing in it', async () => {
  const r = await vodsDoCanal('xqc', {
    buscar: async () => ({
      status: 200, ok: true, json: async () => [{ id: 1, video: { is_private: true } }],
    }),
  });
  assert.equal(r.estado, 'vods-indisponiveis');
});
