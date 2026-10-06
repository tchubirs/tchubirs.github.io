// O clipe de vários ângulos: a geometria, o plano, o crédito no vídeo e a gravação com vídeos fingidos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  telaDe, destinoDe, recorteAoCentro, planoDeAngulos, quemSeVe, credito, desenharAngulos, gravarAngulos, DEITADO,
} from '../site/angulos.js';
import { RETRATO } from '../site/retrato.js';

/** Um contexto de canvas que só regista o que lhe pedem. */
function ctxFalso() {
  const feito = [];
  return {
    feito,
    save() {}, restore() {},
    fillRect(...a) { feito.push(['fillRect', ...a]); },
    drawImage(f, ...a) { feito.push(['drawImage', f.nome, ...a]); },
    fillText(t) { feito.push(['fillText', t]); },
    measureText(t) { return { width: t.length * 10 }; },
  };
}

test('o empilhado é 9:16 partido ao meio; o seguido é 16:9 inteiro', () => {
  assert.deepEqual(telaDe('empilhado'), RETRATO);
  assert.deepEqual(telaDe('seguido'), DEITADO);
  assert.deepEqual(destinoDe('empilhado', 0), { x: 0, y: 0, largura: 1080, altura: 960 });
  assert.deepEqual(destinoDe('empilhado', 1), { x: 0, y: 960, largura: 1080, altura: 960 });
  assert.deepEqual(destinoDe('seguido', 0), { x: 0, y: 0, largura: 1920, altura: 1080 });
});

test('o recorte ao centro tem a forma do destino e nunca sai da fonte', () => {
  // 16:9 para uma metade do 9:16 (9:8): corta dos lados.
  const r = recorteAoCentro(1920, 1080, 1080, 960);
  assert.equal(r.altura, 1080);
  assert.equal(r.largura, 1215);
  assert.equal(r.x, (1920 - 1215) / 2);
  assert.equal(r.y, 0);
  // Uma fonte mais alta do que o destino corta em cima e em baixo.
  const alto = recorteAoCentro(1080, 1920, 1920, 1080);
  assert.equal(alto.largura, 1080);
  assert.ok(alto.y > 0 && alto.y + alto.altura <= 1920);
  assert.equal(recorteAoCentro(0, 1080, 1080, 960), null);
});

test('o plano divide o tempo em partes iguais quando não se dizem as trocas', () => {
  const p = planoDeAngulos({ canais: ['a', 'b', 'c'], duracaoS: 30 });
  assert.deepEqual(p.trocasS, [10, 20]);
  assert.deepEqual(quemSeVe(p, 0), [0]);
  assert.deepEqual(quemSeVe(p, 10), [1]);
  assert.deepEqual(quemSeVe(p, 29.9), [2]);
  // Trocas fora do clipe não valem: volta às partes iguais em vez de um ângulo de zero segundos.
  assert.deepEqual(planoDeAngulos({ canais: ['a', 'b'], duracaoS: 20, trocasS: [25] }).trocasS, [10]);
  assert.deepEqual(planoDeAngulos({ canais: ['a', 'b'], duracaoS: 20, trocasS: [6] }).trocasS, [6]);
  assert.throws(() => planoDeAngulos({ canais: ['a'], duracaoS: 20 }), RangeError);
  assert.throws(() => planoDeAngulos({ canais: ['a', 'b'], duracaoS: 0 }), RangeError);
});

test('o empilhado mostra os dois sempre, cada um com o seu crédito', () => {
  const p = planoDeAngulos({ modo: 'empilhado', canais: ['ricoy', 'oilrats', 'extra'], duracaoS: 10 });
  assert.deepEqual(p.canais, ['ricoy', 'oilrats'], 'só cabem dois');
  const ctx = ctxFalso();
  const fontes = [{ nome: 'A', videoWidth: 1920, videoHeight: 1080 }, { nome: 'B', videoWidth: 1920, videoHeight: 1080 }];
  desenharAngulos(ctx, fontes, p, 3);
  const desenhos = ctx.feito.filter((x) => x[0] === 'drawImage');
  assert.deepEqual(desenhos.map((d) => [d[1], d[6], d[7]]), [['A', 0, 0], ['B', 0, 960]]);
  assert.deepEqual(ctx.feito.filter((x) => x[0] === 'fillText').map((x) => x[1]), ['kick.com/ricoy', 'kick.com/oilrats']);
  assert.deepEqual(ctx.feito[0], ['fillRect', 0, 0, 1080, 1920], 'o fundo primeiro');
});

test('um ângulo ainda sem imagem fica preto, mas com o nome', () => {
  const p = planoDeAngulos({ canais: ['a', 'b'], duracaoS: 10 });
  const ctx = ctxFalso();
  desenharAngulos(ctx, [{ nome: 'A', videoWidth: 0, videoHeight: 0 }, null], p, 1);
  assert.equal(ctx.feito.filter((x) => x[0] === 'drawImage').length, 0);
  assert.deepEqual(ctx.feito.filter((x) => x[0] === 'fillText').map((x) => x[1]), [credito('a')]);
});

function videoFalso(nome, { anda = true, faixas = [] } = {}) {
  return {
    nome, videoWidth: 1920, videoHeight: 1080, currentTime: 100, seeking: false, readyState: 4, tocou: false, parou: false,
    play: async function () { this.tocou = true; }, pause() { this.parou = true; },
    captureStream: () => ({ getAudioTracks: () => faixas }),
    andar() { if (anda) this.currentTime += 0.05; },
  };
}

function gravacaoFalsa(videos) {
  const faixasNaTela = [];
  const ctx = ctxFalso();
  const desenhar = ctx.drawImage.bind(ctx);
  ctx.drawImage = (...a) => { desenhar(...a); for (const v of videos) v.andar(); };
  const fill = ctx.fillRect.bind(ctx);
  ctx.fillRect = (...a) => { fill(...a); if (!videos.some((v) => v.videoWidth)) for (const v of videos) v.andar(); };
  const tela = { width: 0, height: 0, getContext: () => ctx, captureStream: () => ({ addTrack(f) { faixasNaTela.push(f); } }) };
  class MRFalso {
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.(); }
  }
  return { tela, MRFalso, faixasNaTela, ctx };
}

test('a gravação arranca os vídeos juntos, põe o som do ângulo escolhido e acaba no fim do clipe', async () => {
  const somA = { id: 'somA' };
  const somB = { id: 'somB' };
  const videos = [videoFalso('A', { faixas: [somA] }), videoFalso('B', { faixas: [somB] })];
  const { tela, MRFalso, faixasNaTela, ctx } = gravacaoFalsa(videos);
  const plano = planoDeAngulos({ canais: ['a', 'b'], duracaoS: 0.3 });
  const { blob, extensao } = await gravarAngulos(videos, {
    plano, somDe: 1, formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
  });
  assert.ok(blob.size > 0);
  assert.equal(extensao, 'webm');
  assert.ok(videos.every((v) => v.tocou && v.parou), 'os dois tocam e param');
  assert.deepEqual(faixasNaTela, [somB], 'o som do ângulo pedido, e só esse');
  const nomes = new Set(ctx.feito.filter((x) => x[0] === 'drawImage').map((x) => x[1]));
  assert.deepEqual([...nomes].sort(), ['A', 'B'], 'no seguido, os dois ângulos aparecem ao longo do clipe');
});

test('sem som é sem som nenhum', async () => {
  const videos = [videoFalso('A', { faixas: [{ id: 'x' }] }), videoFalso('B')];
  const { tela, MRFalso, faixasNaTela } = gravacaoFalsa(videos);
  await gravarAngulos(videos, {
    plano: planoDeAngulos({ canais: ['a', 'b'], duracaoS: 0.1 }), mudo: true, formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
  });
  assert.deepEqual(faixasNaTela, []);
});

test('um vídeo que não anda rebenta, em vez de gravar uma foto', async () => {
  const videos = [videoFalso('A', { anda: false }), videoFalso('B', { anda: false })];
  const { tela, MRFalso } = gravacaoFalsa(videos);
  await assert.rejects(
    () => gravarAngulos(videos, {
      plano: planoDeAngulos({ canais: ['a', 'b'], duracaoS: 5 }), formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
    }),
    (e) => e.name === 'GRAVACAO-PARADA',
  );
});

test('falta de vídeos para o plano é um erro de quem chama', async () => {
  await assert.rejects(
    () => gravarAngulos([videoFalso('A')], { plano: planoDeAngulos({ canais: ['a', 'b'], duracaoS: 1 }), formato: 'video/webm' }),
    RangeError,
  );
});
