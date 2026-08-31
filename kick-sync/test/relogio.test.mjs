import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaDoCanal, janelaComum, onde, quantosNoAr, comNudge, paraLink, doLink } from '../site/relogio.js';

// Helper: a VOD covering [inicio, inicio+segundos) built from 10-second
// segments, which is what IVS actually emits.
const peca = (inicio, segundos, fonte = 'program-date-time') => {
  const segmentos = [];
  for (let t = 0; t < segundos; t += 10) {
    segmentos.push({ url: `s${t}.ts`, inicio: inicio + t * 1000, duracaoS: 10, mediaT: t });
  }
  return {
    vod: { id: inicio },
    playlist: { segmentos, fonteDoRelogio: fonte, inicio, fim: inicio + segundos * 1000, duracaoS: segundos },
  };
};

const T = Date.parse('2026-08-30T21:00:00.000Z');

// A streamer who crashed and reconnected has several VODs covering one night.
// If the timeline pretends that is one continuous video, scrubbing past the
// crash plays the wrong moment on that angle and the user never finds out.
test('a night with a crash is several VODs and a hole, not one video', () => {
  const l = linhaDoCanal('tchubi', [
    peca(T, 600),                       // 21:00 -> 21:10
    peca(T + 900_000, 600),             // 21:15 -> 21:25, five minutes later
  ]);
  assert.equal(l.pecas.length, 2);
  assert.equal(l.buracos.length, 1);
  assert.equal(l.buracos[0].segundos, 300);
  assert.equal(l.inicio, T);
  assert.equal(l.fim, T + 1_500_000);
  assert.equal(l.relogio, 'exato');
});

test('a 200 ms seam between reconnects is not a hole', () => {
  const l = linhaDoCanal('tchubi', [peca(T, 600), peca(T + 600_200, 600)]);
  assert.equal(l.buracos.length, 0, 'nobody can see 200 ms — a warning there is noise');
});

test('VODs arriving out of order are still put in order', () => {
  const l = linhaDoCanal('tchubi', [peca(T + 900_000, 600), peca(T, 600)]);
  assert.equal(l.pecas[0].playlist.inicio, T);
});

// The four honest answers. The dangerous one is 'buraco': without it the grid
// seeks to zero and shows a confident, wrong frame.
test('where a channel is, at any instant, has four honest answers', () => {
  const l = linhaDoCanal('tchubi', [peca(T, 600), peca(T + 900_000, 600)]);

  assert.deepEqual(onde(l, T - 60_000).estado, 'antes');
  assert.deepEqual(onde(l, T + 1_600_000).estado, 'depois');

  const tocando = onde(l, T + 35_000);
  assert.equal(tocando.estado, 'toca');
  assert.equal(tocando.tempoS, 35);

  const buraco = onde(l, T + 700_000);
  assert.equal(buraco.estado, 'buraco', 'off air is not "play from the start"');
  assert.equal(buraco.buraco.segundos, 300);
});

test('the second VOD is seeked from ITS own start, not the night start', () => {
  const l = linhaDoCanal('tchubi', [peca(T, 600), peca(T + 900_000, 600)]);
  const r = onde(l, T + 900_000 + 42_000);
  assert.equal(r.estado, 'toca');
  assert.equal(r.tempoS, 42, 'media time is inside the piece, not since the night began');
});

test('the nudge moves that channel and only that channel', () => {
  const l = linhaDoCanal('tchubi', [peca(T, 600)]);
  assert.equal(onde(l, T + 30_000).tempoS, 30);
  assert.equal(onde(l, T + 30_000, { nudgeMs: 1500 }).tempoS, 31.5);
  assert.equal(onde(l, T + 30_000, { nudgeMs: -1500 }).tempoS, 28.5);
});

test('a channel with no clock says so instead of pretending to be equal', () => {
  const l = linhaDoCanal('x', [peca(T, 600, 'sem-relogio')]);
  assert.equal(l.relogio, 'parcial');
  assert.equal(linhaDoCanal('y', []).relogio, 'nenhum');
});

// The overlap is the only stretch where a multi-angle clip is possible. A user
// who marks outside it gets one angle, and would rather know before exporting.
test('the union and the overlap are different numbers, and both are needed', () => {
  const j = janelaComum([
    linhaDoCanal('a', [peca(T, 3600)]),
    linhaDoCanal('b', [peca(T + 600_000, 3600)]),
  ]);
  assert.equal(j.inicio, T);
  assert.equal(j.fim, T + 600_000 + 3_600_000);
  assert.equal(j.sobreposicaoInicio, T + 600_000);
  assert.equal(j.sobreposicaoFim, T + 3_600_000);
  assert.equal(j.canais, 2);
});

test('no channel with a usable clock means no window, not a fake one', () => {
  assert.equal(janelaComum([linhaDoCanal('a', [])]), null);
});

// A noite em que ninguém se cruzou. O max/min ingénuo devolve 23:30 -> 20:10:
// uma janela ao contrário, que parece uma resposta e não é. A página começava
// nesse instante e ficava em NaN, com todos os quadrados pretos.
test('when nobody overlaps there is no common window, and it says so', () => {
  const j = janelaComum([
    linhaDoCanal('cedo', [peca(T, 600)]),                 // 21:00 -> 21:10
    linhaDoCanal('tarde', [peca(T + 7_200_000, 600)]),    // 23:00 -> 23:10
  ]);
  assert.equal(j.haSobreposicao, false);
  assert.equal(j.sobreposicaoInicio, null, 'melhor nada do que uma janela invertida');
  assert.equal(j.sobreposicaoFim, null);
  assert.equal(j.inicio, T, 'a união continua a existir — é a barra do tempo');
  assert.equal(j.fim, T + 7_800_000);
});

test('two VODs that only touch do not count as an overlap', () => {
  const j = janelaComum([
    linhaDoCanal('a', [peca(T, 600)]),
    linhaDoCanal('b', [peca(T + 600_000, 600)]),
  ]);
  assert.equal(j.haSobreposicao, false, 'um instante em comum não dá um clipe');
});

// Sem janela comum, este é o número que interessa: "4 de 6 ângulos aqui".
test('how many angles are live at an instant, nudges included', () => {
  const linhas = [
    linhaDoCanal('a', [peca(T, 3600)]),
    linhaDoCanal('b', [peca(T + 600_000, 3600)]),
    linhaDoCanal('c', [peca(T + 7_200_000, 600)]),
  ];
  assert.equal(quantosNoAr(linhas, T + 60_000), 1);
  assert.equal(quantosNoAr(linhas, T + 900_000), 2);
  assert.equal(quantosNoAr(linhas, T + 7_260_000), 1, 'só o terceiro filmava às 23:01');

  // Um canal empurrado 30 s para trás deixa de cobrir os primeiros 30 s.
  assert.equal(quantosNoAr(linhas, T + 5000, { nudges: { a: -30_000 } }), 0);
  assert.equal(quantosNoAr(linhas, T + 5000, { nudges: { a: 30_000 } }), 1);
});

test('a session survives a link round trip', () => {
  const s = {
    canais: ['tchubi', 'outro'],
    janela: { inicio: T, fim: T + 3_600_000 },
    nudges: { tchubi: 1500 },
    marca: { de: T + 100, ate: T + 200 },
  };
  const v = doLink(paraLink(s));
  assert.deepEqual(v.canais, ['tchubi', 'outro']);
  assert.equal(v.nudges.tchubi, 1500);
  assert.deepEqual(v.marca, s.marca);
});

// A shared link is untrusted input: truncated in a Discord message, edited by
// hand, or from a version that did not exist yet. Half-restoring one is worse
// than refusing it, because it looks fine and is not.
test('a broken link restores nothing rather than something wrong', () => {
  for (const lixo of ['', 'nao-e-base64!!', btoa('{}'), btoa('{"v":99,"canais":[]}'), 'null']) {
    assert.equal(doLink(lixo), null, JSON.stringify(lixo));
  }
  const semMarca = doLink(btoa(JSON.stringify({ v: 1, canais: ['a', 5, null], marca: { de: 'x' } })));
  assert.deepEqual(semMarca.canais, ['a'], 'non-strings dropped');
  assert.equal(semMarca.marca, null, 'a mark with a broken number is no mark');
});

test('a link cannot be used to open fifty thousand channels', () => {
  const muitos = Array.from({ length: 500 }, (_, i) => `c${i}`);
  assert.equal(doLink(btoa(JSON.stringify({ v: 1, canais: muitos }))).canais.length, 50);
});

test('comNudge does not mutate the session it was given', () => {
  const s = { canais: [], nudges: { a: 1 } };
  const novo = comNudge(s, 'b', 250);
  assert.deepEqual(s.nudges, { a: 1 });
  assert.deepEqual(novo.nudges, { a: 1, b: 250 });
});
