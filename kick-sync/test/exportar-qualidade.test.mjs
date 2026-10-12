// A qualidade do clipe exportado: cadência igual à da live, débito por cadência, aviso de frames
// perdidos, áudio a 192 kbps e as zonas do TikTok no 9:16 (chat, legenda e guia da prévia).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RETRATO, DEITADO, BITS_VIDEO, BITS_SOM, FPS_OMISSAO, FPS_MAX, fpsDaFonte, bitsDoVideo, perdaDeFrames,
  PERDA_MAX, ZONA_TIKTOK, zonaSegura, gravar, FORMATOS,
} from '../site/retrato.js';
import { geometria, POSICOES, TAMANHOS } from '../site/chat-clipe.js';
import { geometriaLegenda, POSICOES as POS_LEGENDA, ESTILOS, TAMANHOS as TAM_LEGENDA } from '../site/legenda.js';

test('fpsDaFonte: o que a playlist diz, arredondado; sem número, 30; nunca mais de 60', () => {
  assert.equal(fpsDaFonte(60), 60);
  assert.equal(fpsDaFonte(30), 30);
  assert.equal(fpsDaFonte(59.94), 60);
  assert.equal(fpsDaFonte(29.97), 30);
  assert.equal(fpsDaFonte(23.976), 24);
  assert.equal(fpsDaFonte(25), 25);
  assert.equal(fpsDaFonte(120), FPS_MAX);
  for (const ruim of [null, undefined, 0, NaN, 'x', -5, 3]) assert.equal(fpsDaFonte(ruim), FPS_OMISSAO, String(ruim));
});

test('bitsDoVideo: 12 Mbps até 30 fps, 18 Mbps a 60, proporcional no meio', () => {
  assert.equal(BITS_VIDEO, 12_000_000);
  assert.equal(bitsDoVideo(30), 12_000_000);
  assert.equal(bitsDoVideo(24), 12_000_000);
  assert.equal(bitsDoVideo(null), 12_000_000);
  assert.equal(bitsDoVideo(60), 18_000_000);
  assert.equal(bitsDoVideo(59.94), 18_000_000);
  assert.equal(bitsDoVideo(50), 16_000_000);
  assert.ok(bitsDoVideo(45) > bitsDoVideo(30) && bitsDoVideo(45) < bitsDoVideo(60));
  assert.ok(bitsDoVideo(60) < 2 * bitsDoVideo(30), 'não dobra: frames vizinhos parecem-se');
});

test('o som sai a 192 kbps e a lista de formatos continua a trazer AAC', () => {
  assert.equal(BITS_SOM, 192_000);
  assert.deepEqual(FORMATOS, [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus', 'video/webm',
  ]);
});

test('perdaDeFrames: até 5% passa, acima avisa; sem amostra, não diz nada', () => {
  assert.deepEqual(perdaDeFrames(300, 300), { perdaPct: 0, engasgou: false });
  assert.deepEqual(perdaDeFrames(290, 300), { perdaPct: 3.3, engasgou: false });
  const justo = perdaDeFrames(285, 300);
  assert.equal(justo.perdaPct, 5);
  assert.equal(justo.engasgou, false, 'exatamente 5% ainda passa');
  assert.equal(perdaDeFrames(280, 300).engasgou, true);
  assert.equal(perdaDeFrames(150, 300).perdaPct, 50);
  assert.equal(perdaDeFrames(310, 300).perdaPct, 0, 'a mais não é perda');
  assert.deepEqual(perdaDeFrames(0, 5), { perdaPct: 0, engasgou: false });
  assert.equal(PERDA_MAX, 0.05);
});

test('zonaSegura no 9:16: topo 9%, rodapé 20%, direita 13%', () => {
  assert.deepEqual(ZONA_TIKTOK, { cima: 0.09, baixo: 0.2, direita: 0.13 });
  const z = zonaSegura(RETRATO);
  assert.equal(z.y, 173);
  assert.equal(z.fundo, 1536);
  assert.equal(z.direita, 940);
  assert.equal(z.altura, 1536 - 173);
  assert.equal(z.largura, 940);
});

test('9:16: o chat fica dentro da zona livre do TikTok, em todas as posições e tamanhos', () => {
  const z = zonaSegura(RETRATO);
  for (const modo of ['um', 'dois']) {
    for (const posicao of POSICOES) {
      for (const tamanho of TAMANHOS) {
        const g = geometria(RETRATO, { posicao, tamanho }, { formato: '9:16', modo, divisao: 0.35 });
        const rotulo = `${modo} ${posicao} ${tamanho}`;
        assert.ok(g.x >= 0, `${rotulo}: sai pela esquerda`);
        assert.ok(g.x + g.largura <= z.direita, `${rotulo}: entra na coluna de botões (${g.x + g.largura} > ${z.direita})`);
        if (g.ancora === 'baixo') assert.ok(g.y <= z.fundo, `${rotulo}: desce para o rodapé (${g.y} > ${z.fundo})`);
        if (g.ancora === 'cima' && !(modo === 'dois' && posicao === 'auto')) {
          assert.ok(g.y >= z.y, `${rotulo}: sobe para o topo`);
        }
      }
    }
  }
  // No 16:9 nada mudou: o chat vai até a margem de sempre.
  const deitado = geometria(DEITADO, { posicao: 'baixoDir', tamanho: 'm' }, { formato: '16:9' });
  assert.equal(deitado.x + deitado.largura, DEITADO.largura - 32);
});

test('9:16: a legenda fica centrada e dentro da zona livre do TikTok', () => {
  const z = zonaSegura(RETRATO);
  for (const posicao of POS_LEGENDA) {
    for (const estilo of ESTILOS) {
      for (const tamanho of TAM_LEGENDA) {
        const g = geometriaLegenda(RETRATO, { posicao, estilo, tamanho }, { formato: '9:16' });
        const rotulo = `${posicao} ${estilo} ${tamanho}`;
        assert.equal(g.x, RETRATO.largura / 2, `${rotulo}: continua centrada`);
        assert.ok(g.x + g.largura / 2 <= z.direita, `${rotulo}: entra na coluna de botões`);
        assert.ok(g.x - g.largura / 2 >= 0, `${rotulo}: sai pela esquerda`);
        if (g.ancora === 'baixo') assert.ok(g.y <= z.fundo, `${rotulo}: desce para o rodapé`);
        if (g.ancora === 'cima') assert.ok(g.y >= z.y, `${rotulo}: sobe para o topo`);
      }
    }
  }
  // No 16:9 a largura é a de antes.
  assert.equal(geometriaLegenda(DEITADO, {}, { formato: '16:9' }).largura, Math.round(DEITADO.largura * 0.7));
});

test('o guia da prévia no CSS usa os mesmos números de ZONA_TIKTOK', () => {
  const css = fs.readFileSync(new URL('../site/estilo.css', import.meta.url), 'utf8');
  const bloco = css.match(/\.zonaTikTok \{[^}]*\}/)?.[0] || '';
  const pct = (n) => `${Math.round(n * 100)}%`;
  assert.ok(bloco.includes(`top: ${pct(ZONA_TIKTOK.cima)}`), bloco);
  assert.ok(bloco.includes(`bottom: ${pct(ZONA_TIKTOK.baixo)}`), bloco);
  assert.ok(bloco.includes(`right: ${pct(ZONA_TIKTOK.direita)}`), bloco);
  assert.ok(bloco.includes('pointer-events: none'), 'o guia não pode pegar o clique');
  const html = fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.ok(/id="molduraRetrato"[\s\S]{0,900}class="zonaTikTok"/.test(html), 'o guia fica dentro da moldura da prévia 9:16');
});

// ── gravar: a cadência e o débito vão para o gravador, e os frames contam-se ──────────────────────────

function montar({ msPorFrame = 0 } = {}) {
  const opcoes = {};
  const t0 = performance.now();
  let tocando = false;
  const v = {
    videoWidth: 1920, videoHeight: 1080, seeking: false, readyState: 4,
    get currentTime() { return tocando ? 10 + (performance.now() - t0) / 1000 : 10; },
    set currentTime(_) {},
    play: async () => { tocando = true; },
    pause: () => { tocando = false; },
    captureStream: () => ({ getAudioTracks: () => [] }),
  };
  const ctx = {
    drawImage() { if (msPorFrame) { const f = performance.now() + msPorFrame; while (performance.now() < f); } },
    fillRect() {}, clearRect() {}, save() {}, restore() {},
  };
  const tela = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    captureStream: (n) => { opcoes.captureStream = n; return { addTrack() {}, getTracks: () => [] }; },
  };
  class MR {
    constructor(_f, o) { opcoes.gravador = o; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.(); }
  }
  return { v, tela, MR, opcoes };
}

test('gravar a 60 fps: captureStream(60), 18 Mbps, áudio a 192 kbps e frames contados', async () => {
  const { v, tela, MR, opcoes } = montar();
  const r = await gravar(v, {
    rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }], duracaoS: 0.6, formato: 'video/webm',
    criarTela: () => tela, MR, fps: 59.94,
  });
  assert.equal(opcoes.captureStream, 60);
  assert.equal(opcoes.gravador.videoBitsPerSecond, 18_000_000);
  assert.equal(opcoes.gravador.audioBitsPerSecond, 192_000);
  assert.equal(r.fps, 60);
  assert.ok(r.esperados >= 30 && r.esperados <= 40, `esperados ${r.esperados}`);
  assert.ok(r.desenhados >= 0.8 * r.esperados, `desenhados ${r.desenhados} de ${r.esperados}`);
  assert.equal(typeof r.engasgou, 'boolean');
});

test('gravar sem cadência conhecida: 30 fps e 12 Mbps, como antes', async () => {
  const { v, tela, MR, opcoes } = montar();
  const r = await gravar(v, {
    rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }], duracaoS: 0.4, formato: 'video/webm',
    criarTela: () => tela, MR,
  });
  assert.equal(opcoes.captureStream, 30);
  assert.equal(opcoes.gravador.videoBitsPerSecond, 12_000_000);
  assert.equal(r.fps, 30);
});

test('gravar com o PC lento (cada frame demora 60 ms a 60 fps): avisa que engasgou', async () => {
  const { v, tela, MR } = montar({ msPorFrame: 60 });
  const r = await gravar(v, {
    rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }], duracaoS: 0.8, formato: 'video/webm',
    criarTela: () => tela, MR, fps: 60,
  });
  assert.equal(r.engasgou, true, `perda ${r.perdaPct}% (${r.desenhados} de ${r.esperados})`);
  assert.ok(r.perdaPct > 5);
});

test('com requestFrame no browser: captureStream(0) e um frame pedido por pincelada', async () => {
  globalThis.CanvasCaptureMediaStreamTrack = class { requestFrame() {} };
  try {
    const { v, tela, MR, opcoes } = montar();
    let pedidos = 0;
    tela.captureStream = (n) => {
      opcoes.captureStream = n;
      return { addTrack() {}, getTracks: () => [], getVideoTracks: () => [{ requestFrame: () => { pedidos++; } }] };
    };
    const r = await gravar(v, {
      rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }], duracaoS: 0.4, formato: 'video/webm',
      criarTela: () => tela, MR, fps: 60,
    });
    assert.equal(opcoes.captureStream, 0);
    assert.ok(pedidos >= r.desenhados, `${pedidos} pedidos para ${r.desenhados} pinceladas`);
  } finally {
    delete globalThis.CanvasCaptureMediaStreamTrack;
  }
});
