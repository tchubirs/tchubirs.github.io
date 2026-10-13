// A webcam achada sozinha no 9:16 (IDEIAS.md, ideia 3): a geometria sem navegador, o editor com um
// detector de mentira (acha o disco cor de pele pintado nos quadros), e uma volta com o MediaPipe de
// verdade quando há rede.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import {
  ladrilhos, sobreposicao, semRepetidos, juntarRostos, caixaDaWebcam, instantesDoClipe, degrauDoRosto,
  rostoGuardado, guardarRosto, abrirDetector, procurarRosto, CHAVE_ROSTOS, FOLGA_ROSTO, bordasDaWebcam, cinzaDoQuadro,
} from '../site/rosto.js';
import { proporcaoDoQuadro, DIVISAO_OMISSAO, divisaoDoQuadro } from '../site/retrato.js';
import { TODOS, BYTES_TOTAL } from '../site/rosto-arquivos.js';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const perto = (a, b, tol) => Math.abs(a - b) <= tol;
const FOTOS = new URL('../../.arena/prints/fotos/', import.meta.url).pathname;

// ── sem navegador ───────────────────────────────────────────────────────────

test('os ladrilhos cobrem o quadro todo, com o quadro inteiro primeiro', () => {
  for (const [W, H] of [[1280, 720], [1920, 1080], [854, 480]]) {
    const ls = ladrilhos(W, H);
    assert.deepEqual(ls[0], { x: 0, y: 0, largura: W, altura: H });
    // Cada pixel de canto e do meio cai inteiro dentro de algum ladrilho de meia altura.
    const lado = Math.round(H / 2);
    for (const l of ls.slice(1)) {
      assert.equal(l.largura, lado);
      assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.largura <= W && l.y + l.altura <= H, `${W}x${H}: ladrilho fora`);
    }
    // Um rosto de um quarto do lado, em qualquer sítio, cabe inteiro num ladrilho (é o que o detector precisa).
    const r = lado / 4;
    for (const [x, y] of [[0, H - r], [W - r, 0], [W / 2, H / 2], [W - r, H - r], [W * 0.37, H * 0.61]]) {
      assert.ok(ls.slice(1).some((l) => x >= l.x && y >= l.y && x + r <= l.x + l.largura && y + r <= l.y + l.altura),
        `${W}x${H}: rosto em ${x},${y} sem ladrilho que o tenha inteiro`);
    }
  }
  assert.deepEqual(ladrilhos(0, 720), []);
});

test('o mesmo rosto em dois ladrilhos conta uma vez', () => {
  const a = { x: 0.1, y: 0.7, largura: 0.06, altura: 0.1, nota: 0.9 };
  const b = { x: 0.102, y: 0.701, largura: 0.06, altura: 0.1, nota: 0.8 };
  const longe = { x: 0.7, y: 0.1, largura: 0.06, altura: 0.1, nota: 0.6 };
  assert.ok(sobreposicao(a, b) > 0.8);
  assert.equal(sobreposicao(a, longe), 0);
  const ficam = semRepetidos([b, longe, a]);
  assert.equal(ficam.length, 2);
  assert.equal(ficam[0], a, 'fica o de nota maior');
});

test('o rosto do streamer é o que fica no mesmo sítio; um boneco que passa não conta', () => {
  const cara = (dx = 0) => ({ x: 0.08 + dx, y: 0.72, largura: 0.07, altura: 0.12, nota: 0.85 });
  const boneco = (x) => ({ x, y: 0.4, largura: 0.03, altura: 0.05, nota: 0.95 });
  const r = juntarRostos([[cara(), boneco(0.5)], [cara(0.003), boneco(0.6)], [], [cara(-0.002)], [boneco(0.3)]]);
  assert.ok(r, 'devia achar');
  assert.ok(perto(r.x, 0.08, 0.004) && perto(r.y, 0.72, 0.001), JSON.stringify(r));
  assert.equal(r.quadros, 3);
  // Visto só num quadro de cinco: é um acaso, não uma webcam.
  assert.equal(juntarRostos([[cara()], [], [], [], []]), null);
  // Com um quadro só lido, um basta.
  assert.ok(juntarRostos([[cara()]]));
  assert.equal(juntarRostos([]), null);
  assert.equal(juntarRostos([[], [], []]), null);
  // Dois rostos fixos (dois streamers na mesma câmera): ganha o visto em mais quadros.
  const outro = { x: 0.8, y: 0.05, largura: 0.07, altura: 0.12, nota: 0.99 };
  const dois = juntarRostos([[cara(), outro], [cara(), outro], [cara()]]);
  assert.ok(perto(dois.x, 0.08, 0.001));
});

test('a caixa da webcam tem a proporção da faixa de cima, o rosto dentro e não sai da fonte', () => {
  const fonte = { largura: 1920, altura: 1080 };
  for (const divisao of [DIVISAO_OMISSAO, 0.5, 0.25]) {
    for (const rosto of [
      { x: 0.08, y: 0.72, largura: 0.06, altura: 0.1 }, // embaixo à esquerda
      { x: 0.86, y: 0.05, largura: 0.06, altura: 0.1 }, // em cima à direita
      { x: 0.47, y: 0.45, largura: 0.08, altura: 0.14 }, // no meio
      { x: 0.0, y: 0.9, largura: 0.05, altura: 0.09 }, // colado ao canto
    ]) {
      const c = caixaDaWebcam(rosto, fonte, divisao);
      const onde = `${divisao} ${JSON.stringify(rosto)}`;
      assert.ok(perto(c.largura / c.altura, proporcaoDoQuadro('dois', 0, divisao), 0.001), onde);
      assert.ok(c.x >= -0.01 && c.y >= -0.01 && c.x + c.largura <= 1920.01 && c.y + c.altura <= 1080.01, onde);
      const fx = rosto.x * 1920; const fy = rosto.y * 1080;
      const fw = rosto.largura * 1920; const fh = rosto.altura * 1080;
      // O centro do rosto dentro da caixa, sempre; o rosto inteiro, quando a faixa é larga o bastante.
      assert.ok(fx + fw / 2 > c.x && fx + fw / 2 < c.x + c.largura && fy + fh / 2 > c.y && fy + fh / 2 < c.y + c.altura, onde);
      if (divisao >= DIVISAO_OMISSAO) {
        assert.ok(fx >= c.x - 0.5 && fx + fw <= c.x + c.largura + 0.5 && fy >= c.y - 0.5 && fy + fh <= c.y + c.altura + 0.5, onde);
      }
    }
  }
  // Uma webcam, e não meia tela: a largura vem do rosto.
  const c = caixaDaWebcam({ x: 0.08, y: 0.72, largura: 0.06, altura: 0.1 }, fonte);
  assert.ok(perto(c.largura, 0.06 * 1920 * FOLGA_ROSTO, 2), String(c.largura));
  assert.equal(caixaDaWebcam(null, fonte), null);
  assert.equal(caixaDaWebcam({ x: 0, y: 0, largura: 0.1, altura: 0.1 }, null), null);
});

test('os instantes ficam espalhados por dentro do clipe, e o degrau é o de 720p', () => {
  const ts = instantesDoClipe(10_000, 20_000);
  assert.equal(ts.length, 5);
  assert.ok(ts.every((t) => t > 10_000 && t < 20_000));
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.deepEqual(instantesDoClipe(5, 5), []);
  const escada = [{ altura: 1080, url: 'a' }, { altura: 720, url: 'b' }, { altura: 480, url: 'c' }, { altura: 160, url: 'd' }];
  assert.equal(degrauDoRosto(escada).url, 'b');
  assert.equal(degrauDoRosto([{ altura: 1080, url: 'a' }, { altura: 160, url: 'd' }]).url, 'a');
  assert.equal(degrauDoRosto([]), null);
});

test('o rosto achado fica guardado por streamer, e algo estragado é esquecido', () => {
  const dados = new Map();
  const armazem = { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, String(v)) };
  assert.equal(rostoGuardado('tchubi', armazem), null);
  guardarRosto('tchubi', { x: 0.1, y: 0.7, largura: 0.06, altura: 0.1, nota: 0.9, quadros: 4 }, armazem);
  guardarRosto('kodd', { x: 0.8, y: 0.1, largura: 0.05, altura: 0.09 }, armazem);
  assert.deepEqual(rostoGuardado('tchubi', armazem), { x: 0.1, y: 0.7, largura: 0.06, altura: 0.1 });
  assert.deepEqual(rostoGuardado('kodd', armazem), { x: 0.8, y: 0.1, largura: 0.05, altura: 0.09 });
  dados.set(CHAVE_ROSTOS, JSON.stringify({ tchubi: { x: 'a' } }));
  assert.equal(rostoGuardado('tchubi', armazem), null);
  dados.set(CHAVE_ROSTOS, '{nao e json');
  assert.equal(rostoGuardado('tchubi', armazem), null);
  assert.equal(rostoGuardado('tchubi', null), null);
});

test('os arquivos do detector vêm numa versão fixa e com impressão digital', () => {
  for (const a of TODOS) {
    assert.match(a.url, /^https:\/\/(cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@\d+\.\d+\.\d+\/|storage\.googleapis\.com\/mediapipe-models\/face_detector\/blaze_face_short_range\/float16\/\d+\/)/);
    assert.match(a.sha256, /^[0-9a-f]{64}$/);
    assert.ok(a.bytes > 1000);
  }
  assert.ok(BYTES_TOTAL < 15e6, 'a primeira vez baixa uns 12 MB, não mais');
  // Nada disto no repositório: o código minificado e o motor vêm de fora.
  const site = new URL('../site/', import.meta.url).pathname;
  const pesados = fs.readdirSync(site, { recursive: true }).filter((f) => /vision_|\.tflite$|tasks-vision/.test(String(f)));
  assert.deepEqual(pesados, []);
});

test('o detector conversa com o Worker: um pedido, uma resposta, e um erro não fica pendurado', async () => {
  const mandados = [];
  let w;
  const det = abrirDetector({
    criar: () => {
      w = { postMessage: (m, transf) => mandados.push({ m, transf }), terminate: () => { w.morto = true; } };
      return w;
    },
  });
  const p1 = det.detectar({ close() {} });
  const p2 = det.detectar({ close() {} });
  assert.equal(mandados.length, 2);
  assert.equal(mandados[0].transf.length, 1, 'a imagem passa para o Worker, sem cópia');
  w.onmessage({ data: { tipo: 'baixar', feito: 10, total: 100 } });
  w.onmessage({ data: { tipo: 'pronto', id: mandados[1].m.id, rostos: [{ x: 1, y: 2, largura: 3, altura: 4, nota: 0.9 }] } });
  w.onmessage({ data: { tipo: 'erro', id: mandados[0].m.id, nome: 'INTEGRIDADE', mensagem: 'não bate' } });
  assert.deepEqual(await p2, [{ x: 1, y: 2, largura: 3, altura: 4, nota: 0.9 }]);
  await assert.rejects(p1, { name: 'INTEGRIDADE' });
  const p3 = det.detectar(null);
  det.fechar();
  await assert.rejects(p3, { name: 'AbortError' });
  assert.ok(w.morto);
});

test('a procura lê os quadros um a um e pára quando se cancela', async () => {
  const pedidos = [];
  const tela = { width: 1280, height: 720 };
  // O detector de mentira acha o rosto no ladrilho que o tem: embaixo à esquerda, em pixels do quadro.
  const rosto = { x: 100, y: 520, largura: 80, altura: 90 };
  const criarImagem = async (_t, x, y, w, h, o) => ({ x, y, w, h, k: o.resizeWidth / w });
  const detector = {
    detectar: async (img) => (rosto.x >= img.x && rosto.y >= img.y && rosto.x + rosto.largura <= img.x + img.w && rosto.y + rosto.altura <= img.y + img.h
      ? [{ x: (rosto.x - img.x) * img.k, y: (rosto.y - img.y) * img.k, largura: rosto.largura * img.k, altura: rosto.altura * img.k, nota: 0.9 }]
      : []),
  };
  const r = await procurarRosto({
    instantes: [1, 2, 3, 4, 5], quadro: async (ms) => { pedidos.push(ms); return ms === 3 ? null : { tela }; }, detector, criarImagem,
  });
  assert.deepEqual(pedidos, [1, 2, 3, 4, 5]);
  assert.equal(r.lidos, 4);
  assert.ok(perto(r.rosto.x, 100 / 1280, 0.002) && perto(r.rosto.y, 520 / 720, 0.002), JSON.stringify(r.rosto));
  assert.ok(perto(r.rosto.largura, 80 / 1280, 0.002));
  const ctl = new AbortController();
  await assert.rejects(procurarRosto({
    instantes: [1, 2, 3], quadro: async () => { ctl.abort(); return { tela }; }, detector, criarImagem, sinal: ctl.signal,
  }), { name: 'AbortError' });
});

// ── a borda da webcam: quadros em cinza fingidos ─────────────────────────────

const GW = 480;
const GH = 270;

/**
 * Um quadro de jogo que muda a cada vez (blocos e riscas de outro tom) com a webcam parada por cima:
 * `cam` {x0,y0,x1,y1} em píxeis do quadro, com moldura escura de 2 px e um disco claro (o rosto) que
 * mexe um pouco. `fixo` desenha uma risca horizontal parada de um HUD (fora da webcam).
 */
function quadroFalso(semente, { cam, rosto, fixo = null }) {
  const cinza = new Uint8Array(GW * GH);
  let s = semente * 2654435761 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  // O jogo: blocos de 24 px de tons que mudam de quadro para quadro, e a grelha também anda.
  const oy = Math.floor(rnd() * 24);
  const ox = Math.floor(rnd() * 24);
  for (let by = -oy; by < GH; by += 24) {
    for (let bx = -ox; bx < GW; bx += 24) {
      const v = Math.round(40 + rnd() * 170);
      for (let y = Math.max(0, by); y < Math.min(GH, by + 24); y++) for (let x = Math.max(0, bx); x < Math.min(GW, bx + 24); x++) cinza[y * GW + x] = v;
    }
  }
  if (fixo) for (let y = fixo.y; y < fixo.y + 3; y++) for (let x = 0; x < GW; x++) cinza[y * GW + x] = 250;
  if (cam) {
    for (let y = cam.y0; y < cam.y1; y++) {
      for (let x = cam.x0; x < cam.x1; x++) {
        const moldura = x < cam.x0 + 2 || x >= cam.x1 - 2 || y < cam.y0 + 2 || y >= cam.y1 - 2;
        cinza[y * GW + x] = moldura ? 15 : 95;
      }
    }
  }
  if (rosto) {
    const dx = Math.round((rnd() - 0.5) * 3);
    for (let y = rosto.cy - rosto.r; y <= rosto.cy + rosto.r; y++) {
      for (let x = rosto.cx - rosto.r + dx; x <= rosto.cx + rosto.r + dx; x++) {
        if ((x - rosto.cx - dx) ** 2 + (y - rosto.cy) ** 2 <= rosto.r ** 2) cinza[y * GW + x] = 210;
      }
    }
  }
  return { largura: GW, altura: GH, cinza };
}

const quadrosFalsos = (n, opcoes) => Array.from({ length: n }, (_, i) => quadroFalso(i + 1, opcoes));
const emFraccao = (cx, cy, r) => ({ x: (cx - r) / GW, y: (cy - r) / GH, largura: (2 * r) / GW, altura: (2 * r) / GH });

test('a webcam com moldura no meio do quadro: acha as quatro bordas, e o jogo que se mexe não engana', () => {
  const cam = { x0: 300, y0: 60, x1: 440, y1: 150 };
  const rosto = { cx: 370, cy: 105, r: 22 };
  const w = bordasDaWebcam(quadrosFalsos(5, { cam, rosto }), emFraccao(rosto.cx, rosto.cy, rosto.r));
  assert.ok(w, 'não achou a webcam');
  assert.deepEqual(w.lados, { esq: 'linha', dir: 'linha', cima: 'linha', baixo: 'linha' });
  // Por dentro da moldura (de 2 px), a uns 3 px da borda de fora, no máximo.
  assert.ok(perto(w.x * GW, cam.x0 + 3, 3), `esquerda ${w.x * GW}`);
  assert.ok(perto((w.x + w.largura) * GW, cam.x1 - 3, 3), `direita ${(w.x + w.largura) * GW}`);
  assert.ok(perto(w.y * GH, cam.y0 + 3, 3), `cima ${w.y * GH}`);
  assert.ok(perto((w.y + w.altura) * GH, cam.y1 - 3, 3), `baixo ${(w.y + w.altura) * GH}`);
});

test('a webcam encostada ao canto: os lados na borda da tela contam, e a risca parada do HUD não ganha', () => {
  const cam = { x0: 0, y0: 170, x1: 150, y1: 270 };
  const rosto = { cx: 75, cy: 220, r: 24 };
  // Uma risca de HUD parada acima da webcam, mais perto do rosto do que a borda de cima nunca é: fica fora.
  const w = bordasDaWebcam(quadrosFalsos(5, { cam, rosto, fixo: { y: 100 } }), emFraccao(rosto.cx, rosto.cy, rosto.r));
  assert.ok(w, 'não achou a webcam');
  assert.equal(w.lados.dir, 'linha');
  assert.equal(w.lados.cima, 'linha');
  assert.ok(perto(w.y * GH, cam.y0 + 3, 3), `cima ${w.y * GH}`);
  assert.ok(perto((w.x + w.largura) * GW, cam.x1 - 3, 3), `direita ${(w.x + w.largura) * GW}`);
  assert.ok(w.x * GW <= 4, `esquerda ${w.x * GW}`);
  assert.ok((w.y + w.altura) * GH >= GH - 6, `baixo ${(w.y + w.altura) * GH}`);

  // Sem moldura nos lados que tocam a tela (só jogo e webcam), esses dois lados encostam na tela.
  const solta = quadrosFalsos(5, { cam: { x0: 0, y0: 170, x1: 150, y1: 270 }, rosto }).map((q) => {
    for (let y = 170; y < 270; y++) for (let x = 0; x < 2; x++) q.cinza[y * GW + x] = 95;
    for (let y = 268; y < 270; y++) for (let x = 0; x < 150; x++) q.cinza[y * GW + x] = 95;
    return q;
  });
  const w2 = bordasDaWebcam(solta, emFraccao(rosto.cx, rosto.cy, rosto.r));
  assert.ok(w2);
  assert.equal(w2.lados.esq, 'tela');
  assert.equal(w2.lados.baixo, 'tela');
  assert.equal(w2.x, 0);
  assert.equal(w2.y + w2.altura, 1);
});

test('a faixa de cima ganha a proporção da webcam achada', () => {
  const cam = { x0: 300, y0: 60, x1: 440, y1: 150 };
  const rosto = { cx: 370, cy: 105, r: 22 };
  const w = bordasDaWebcam(quadrosFalsos(5, { cam, rosto }), emFraccao(rosto.cx, rosto.cy, rosto.r));
  // Em píxeis de um 1920x1080: a proporção do recorte é a da faixa de cima, que sai da divisão.
  const rect = { x: w.x * 1920, y: w.y * 1080, largura: w.largura * 1920, altura: w.altura * 1080 };
  const d = divisaoDoQuadro(rect, 0);
  assert.ok(d > 0.15 && d < 0.85);
  assert.ok(perto(proporcaoDoQuadro('dois', 0, d), rect.largura / rect.altura, 0.01));
});

test('sem moldura nenhuma (só o rosto num jogo que se mexe), ou com poucos quadros, não inventa webcam', () => {
  const rosto = { cx: 240, cy: 135, r: 22 };
  const f = emFraccao(rosto.cx, rosto.cy, rosto.r);
  assert.equal(bordasDaWebcam(quadrosFalsos(5, { cam: null, rosto }), f), null);
  assert.equal(bordasDaWebcam(quadrosFalsos(1, { cam: { x0: 300, y0: 60, x1: 440, y1: 150 }, rosto }), f), null);
  assert.equal(bordasDaWebcam([], f), null);
  assert.equal(bordasDaWebcam(quadrosFalsos(5, { cam: null, rosto }), null), null);
});

test('um quadro de tamanho diferente ou uma tela que não se lê ficam de fora, sem rebentar', () => {
  assert.equal(cinzaDoQuadro({ width: 1280, height: 720 }, { criarTela: () => null }), null);
  assert.equal(cinzaDoQuadro({ width: 0, height: 0 }), null);
  const cam = { x0: 300, y0: 60, x1: 440, y1: 150 };
  const rosto = { cx: 370, cy: 105, r: 22 };
  const bons = quadrosFalsos(4, { cam, rosto });
  const outro = { largura: 100, altura: 50, cinza: new Uint8Array(5000) };
  assert.ok(bordasDaWebcam([...bons, outro], emFraccao(rosto.cx, rosto.cy, rosto.r)));
});

test('a procura devolve a webcam inteira junto do rosto, e ela fica guardada com ele', async () => {
  const cam = { x0: 300, y0: 60, x1: 440, y1: 150 };
  const rosto = { cx: 370, cy: 105, r: 22 };
  const quadros = quadrosFalsos(5, { cam, rosto });
  let i = 0;
  const tela = { width: 1280, height: 720 };
  const criarImagem = async (_t, x, y, w, h, o) => ({ x, y, w, h, k: o.resizeWidth / w });
  const real = { x: (rosto.cx - rosto.r) * (1280 / GW), y: (rosto.cy - rosto.r) * (720 / GH), largura: 2 * rosto.r * (1280 / GW), altura: 2 * rosto.r * (720 / GH) };
  const detector = {
    detectar: async (img) => (real.x >= img.x && real.y >= img.y && real.x + real.largura <= img.x + img.w && real.y + real.altura <= img.y + img.h
      ? [{ x: (real.x - img.x) * img.k, y: (real.y - img.y) * img.k, largura: real.largura * img.k, altura: real.altura * img.k, nota: 0.9 }] : []),
  };
  const r = await procurarRosto({
    instantes: [1, 2, 3, 4, 5], quadro: async () => ({ tela }), detector, criarImagem, cinza: () => quadros[i++],
  });
  assert.ok(r.rosto.webcam, 'sem a webcam no resultado');
  assert.ok(perto(r.rosto.webcam.x * GW, cam.x0 + 2, 3));
  assert.ok(r.rosto.webcam.largura > r.rosto.largura * 2);
  const dados = new Map();
  const armazem = { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, String(v)) };
  guardarRosto('tchubi', r.rosto, armazem);
  const volta = rostoGuardado('tchubi', armazem);
  assert.deepEqual(volta.webcam, r.rosto.webcam);
  // Uma webcam estragada no armazém é esquecida, o rosto fica.
  dados.set(CHAVE_ROSTOS, JSON.stringify({ tchubi: { x: 0.1, y: 0.1, largura: 0.1, altura: 0.1, webcam: { x: 'a' } } }));
  assert.deepEqual(rostoGuardado('tchubi', armazem), { x: 0.1, y: 0.1, largura: 0.1, altura: 0.1 });
});

// ── no navegador ────────────────────────────────────────────────────────────

/**
 * Os quadros de mentira: um 1920x1080 com um "jogo" e a webcam de cada canal no seu canto, com um disco
 * cor de pele no lugar do rosto. O `semRosto` não tem webcam.
 */
async function fingir(p, { detector = true } = {}) {
  await p.addInitScript((comDetector) => {
    const ROSTOS = { tchubi: { x: 150, y: 760, r: 55 }, vitima1: { x: 1700, y: 150, r: 45 } };
    window.__pedidosRosto = [];
    window.__ladrilhosRosto = 0;
    window.__povixQuadrosRosto = () => ({
      async quadro(pedido) {
        window.__pedidosRosto.push({ canal: pedido.canal, ms: pedido.ms, url: pedido.url });
        const c = document.createElement('canvas');
        c.width = 1920; c.height = 1080;
        const g = c.getContext('2d');
        g.fillStyle = '#6f8fae'; g.fillRect(0, 0, 1920, 600);
        g.fillStyle = '#5d6b3c'; g.fillRect(0, 600, 1920, 480);
        const f = ROSTOS[pedido.canal];
        if (f) {
          g.fillStyle = '#3a2c25'; g.fillRect(f.x - 150, f.y - 110, 300, 230);
          g.fillStyle = '#c99a7c'; g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
        }
        window.__ultimoQuadroRosto = c;
        return { tela: c };
      },
      fechar() {},
    });
    if (!comDetector) return;
    // Acha o disco cor de pele, quando ele está inteiro dentro da imagem (como o detector a sério,
    // que não devolve meio rosto cortado pela borda de um ladrilho).
    window.__povixRosto = () => ({
      async detectar(img) {
        window.__ladrilhosRosto++;
        const W = img.width;
        const H = img.height;
        const c = new OffscreenCanvas(W, H);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        img.close?.();
        const d = g.getImageData(0, 0, W, H).data;
        let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (Math.abs(d[i] - 0xc9) < 12 && Math.abs(d[i + 1] - 0x9a) < 12 && Math.abs(d[i + 2] - 0x7c) < 12) {
              x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
            }
          }
        }
        if (x1 < 0 || x0 <= 0 || y0 <= 0 || x1 >= W - 1 || y1 >= H - 1) return [];
        return [{ x: x0, y: y0, largura: x1 - x0 + 1, altura: y1 - y0 + 1, nota: 0.9 }];
      },
    });
  }, detector);
}

/**
 * Para a foto: o último quadro lido por baixo das caixas e o 9:16 pintado dele, por cima da prévia (o
 * vídeo da Kick fingida é preto, e uma foto de caixas sobre preto não mostra se o rosto ficou dentro).
 */
async function fotografar(p, nome) {
  await p.evaluate(async () => {
    const q = window.__ultimoQuadroRosto;
    const c = window.__estado.clipe;
    const r = await import('./retrato.js');
    const v = document.getElementById('previaClipe');
    const fonte = v.videoWidth > 0 ? { largura: v.videoWidth, altura: v.videoHeight } : { largura: c.fonteW, altura: c.fonteH };
    const base = document.createElement('canvas');
    base.width = fonte.largura; base.height = fonte.altura;
    base.getContext('2d').drawImage(q, 0, 0, fonte.largura, fonte.altura);
    const img = document.createElement('img');
    img.src = base.toDataURL('image/jpeg', 0.85);
    await img.decode();
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
    document.getElementById('fonteClipe').insertBefore(img, document.getElementById('recortes'));
    const tela = document.getElementById('telaRetrato');
    const copia = tela.cloneNode();
    copia.removeAttribute('id');
    copia.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    r.desenhar(copia.getContext('2d'), base, c.rects, c.modo, c.divisao);
    tela.parentElement.style.position = 'relative';
    tela.parentElement.append(copia);
  });
  fs.mkdirSync(FOTOS, { recursive: true });
  await p.locator('#modalClipe .clipeEditor').screenshot({ path: path.join(FOTOS, nome) });
}

async function carregar(p, canais) {
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
}

async function abrirClipe(p) {
  await p.click('#clipar');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
  await p.waitForFunction(() => window.__estado.clipe?.rects.length > 0, null, { timeout: 10000 });
  await p.waitForSelector('#modelosWebcam:not([hidden])', { timeout: 5000 });
}

const caixa1 = (p) => p.evaluate(() => {
  const c = window.__estado.clipe;
  const v = document.getElementById('previaClipe');
  const fonte = v.videoWidth > 0 ? { largura: v.videoWidth, altura: v.videoHeight } : { largura: c.fonteW, altura: c.fonteH };
  const r = c.rects[0];
  return { x: r.x / fonte.largura, y: r.y / fonte.altura, l: r.largura / fonte.largura, a: r.altura / fonte.altura, modo: c.modo, canal: c.canal };
});

const aviso = (p) => p.evaluate(() => {
  const el = document.getElementById('webcamAchada');
  return el.hidden ? '' : el.textContent;
});

/** O ponto (em fracção da fonte) cai dentro da caixa 1. */
const dentro = (cx, [px, py]) => px > cx.x && px < cx.x + cx.l && py > cx.y && py < cx.y + cx.a;

test('2 enquadramentos: a caixa 1 vai para o rosto de cada canal, e fica guardada por canal', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await fingir(p);
  await carregar(p, ['tchubi', 'vitima1']);
  await abrirClipe(p);
  assert.equal((await caixa1(p)).modo, 'um');
  // Num enquadramento não há webcam: nada se procura ao abrir.
  assert.equal(await p.evaluate(() => window.__pedidosRosto.length), 0);

  await p.click('#modoDois');
  await p.waitForFunction(() => /achada/.test(document.getElementById('webcamAchada').textContent), null, { timeout: 15000 });
  let cx = await caixa1(p);
  assert.ok(dentro(cx, [150 / 1920, 760 / 1080]), `a caixa 1 não tem o rosto do tchubi: ${JSON.stringify(cx)}`);
  assert.match(await aviso(p), /tchubi/);
  // A caixa saiu do rosto e não do modelo: nenhum botão de canto fica carregado (teste real de 12/10).
  assert.deepEqual(await p.$$eval('.modeloWebcam', (bs) => bs.filter((b) => b.getAttribute('aria-pressed') === 'true').length), 0);
  const pedidos = await p.evaluate(() => window.__pedidosRosto);
  assert.equal(pedidos.length, 5, 'cinco quadros');
  assert.ok(pedidos.every((q) => q.canal === 'tchubi' && q.url));

  // A foto do painel, com a caixa proposta.

  // Outro ângulo: a webcam dele está noutro canto, e procura-se a dele.
  await p.selectOption('#canalClipe', 'vitima1');
  await p.waitForFunction(() => window.__estado.clipe.canal === 'vitima1'
    && /vitima1/.test(document.getElementById('webcamAchada').textContent)
    && /achada/.test(document.getElementById('webcamAchada').textContent), null, { timeout: 15000 });
  cx = await caixa1(p);
  assert.equal(cx.modo, 'dois');
  assert.ok(dentro(cx, [1700 / 1920, 150 / 1080]), `a caixa 1 não tem o rosto do vitima1: ${JSON.stringify(cx)}`);

  // Voltar ao tchubi e abrir outro clipe: nada se procura de novo (guardado por canal).
  const antes = await p.evaluate(() => window.__pedidosRosto.length);
  assert.equal(antes, 10);
  await p.click('#cancelarClipe');
  await abrirClipe(p);
  cx = await caixa1(p);
  assert.equal(cx.canal, 'tchubi');
  assert.equal(cx.modo, 'dois', 'o modo do tchubi ficou guardado');
  assert.ok(dentro(cx, [150 / 1920, 760 / 1080]));
  assert.equal(await p.evaluate(() => window.__pedidosRosto.length), antes, 'procurou outra vez um canal já achado');
  // E o guardado sobrevive a recarregar a página.
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('replay.rostos')));
  assert.deepEqual(Object.keys(guardado).sort(), ['tchubi', 'vitima1']);
  await p.evaluate(() => window.__povixQuadrosRosto().quadro({ canal: 'tchubi' }));
  await fotografar(p, 'webcam-falsa-tchubi.png');
  assert.deepEqual(erros, []);
  await p.close();
});

test('sem rosto no vídeo fica o modelo, com um aviso curto; um ajuste à mão nunca é trocado', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
  await fingir(p);
  await carregar(p, ['semrosto', 'tchubi']);
  await abrirClipe(p);
  assert.equal((await caixa1(p)).canal, 'semrosto');
  const modelo = await p.evaluate(() => window.__estado.clipe.rects.map((r) => ({ ...r })));
  await p.click('#modoDois');
  await p.waitForFunction(() => /Nenhum rosto/.test(document.getElementById('webcamAchada').textContent), null, { timeout: 15000 });
  const depois = await p.evaluate(() => window.__estado.clipe.rects.map((r) => ({ ...r })));
  const doModelo = await p.evaluate(async () => {
    const r = await import('./retrato.js');
    const v = document.getElementById('previaClipe');
    const c = window.__estado.clipe;
    const f = v.videoWidth > 0 ? { largura: v.videoWidth, altura: v.videoHeight } : { largura: c.fonteW, altura: c.fonteH };
    return r.enquadramentoInicial(f.largura, f.altura, 'dois', r.DIVISAO_OMISSAO, c.modelo);
  });
  for (const k of ['x', 'y', 'largura', 'altura']) assert.ok(perto(depois[0][k], doModelo[0][k], 1), `${k}: ficou o modelo`);
  assert.notDeepEqual(depois, modelo);
  // Cabe na tela do telemóvel, sem andar de lado.
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390);
  const larguraAviso = await p.evaluate(() => document.getElementById('webcamAchada').getBoundingClientRect().right);
  assert.ok(larguraAviso <= 390, `o aviso sai da tela: ${larguraAviso}`);

  // O tchubi, acertado à mão antes de qualquer procura (um modelo de canto e a seta), não é trocado.
  await p.selectOption('#canalClipe', 'tchubi');
  await p.waitForFunction(() => window.__estado.clipe.canal === 'tchubi' && window.__estado.clipe.rects.length === 2, null, { timeout: 10000 });
  await p.waitForFunction(() => /achada/.test(document.getElementById('webcamAchada').textContent), null, { timeout: 15000 });
  await p.click('.modeloWebcam[data-modelo="cimaDir"]');
  await p.focus('#recortes .recorte[data-i="0"]');
  await p.keyboard.press('ArrowLeft');
  const mao = await caixa1(p);
  await p.click('#cancelarClipe');
  await abrirClipe(p);
  await p.selectOption('#canalClipe', 'tchubi');
  await p.waitForFunction(() => window.__estado.clipe.canal === 'tchubi' && window.__estado.clipe.rects.length === 2, null, { timeout: 10000 });
  const outra = await caixa1(p);
  for (const k of ['x', 'y', 'l']) assert.ok(perto(outra[k], mao[k], 0.002), `${k}: o ajuste à mão foi trocado`);
  // O botão procura de novo quando ele pede, mesmo sobre o ajuste.
  await p.click('#acharWebcam');
  await p.waitForFunction(() => /achada/.test(document.getElementById('webcamAchada').textContent), null, { timeout: 15000 });
  assert.ok(dentro(await caixa1(p), [150 / 1920, 760 / 1080]));
  assert.deepEqual(erros, []);
  await p.close();
});

test('em inglês e espanhol o aviso vem na língua da página', semNavegador, async () => {
  for (const [idioma, re] of [['en', /Found tchubi's webcam/], ['es', /Webcam de tchubi encontrada/]]) {
    const { p, erros } = await abrir({ idioma });
    await fingir(p);
    await carregar(p, ['tchubi']);
    await abrirClipe(p);
    assert.equal(await p.textContent('#acharWebcam'), idioma === 'en' ? 'Find webcam' : 'Buscar webcam');
    await p.click('#modoDois');
    await p.waitForFunction((r) => new RegExp(r).test(document.getElementById('webcamAchada').textContent), re.source, { timeout: 15000 });
    assert.deepEqual(erros, []);
    await p.close();
  }
});

test('o vídeo escondido dá um quadro que se lê quando a origem deixa, e nunca uma tela suja', semNavegador, async () => {
  const { p, erros } = await abrir();
  // Uma página sem a política de segurança do index.html (que só deixa vídeo da Kick): aqui o que se
  // mede é a regra do navegador sobre telas sujas, com um vídeo de outra origem que não é a Kick.
  await p.goto(`http://127.0.0.1:${PORTA}/rosto-arquivos.js`, { waitUntil: 'domcontentloaded' });
  // Um vídeo de 1,6 s gravado aqui mesmo (sem ffmpeg na máquina): fundo azul e um quadrado cor de pele.
  const b64 = await p.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' });
    const partes = [];
    rec.ondataavailable = (e) => partes.push(e.data);
    const fim = new Promise((ok) => { rec.onstop = ok; });
    let n = 0;
    const pincel = setInterval(() => {
      g.fillStyle = '#2050c0'; g.fillRect(0, 0, 320, 180);
      g.fillStyle = '#c99a7c'; g.fillRect(40 + (n++ % 2), 100, 50, 50);
    }, 33);
    rec.start(200);
    await new Promise((k) => setTimeout(k, 1600));
    rec.stop();
    await fim;
    clearInterval(pincel);
    const bytes = new Uint8Array(await new Blob(partes, { type: 'video/webm' }).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const video = Buffer.from(b64, 'base64');
  // Outra origem (outra porta), como a CDN da Kick: com e sem `access-control-allow-origin`.
  const http = await import('node:http');
  const outra = http.createServer((req, res) => {
    const comCors = req.url.startsWith('/cors');
    const total = video.length;
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const de = m ? Number(m[1]) : 0;
    const ate = m && m[2] ? Number(m[2]) : total - 1;
    res.writeHead(m ? 206 : 200, {
      'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': ate - de + 1,
      ...(m ? { 'content-range': `bytes ${de}-${ate}/${total}` } : {}),
      ...(comCors ? { 'access-control-allow-origin': '*' } : {}),
    });
    res.end(video.subarray(de, ate + 1));
  });
  await new Promise((ok) => outra.listen(0, '127.0.0.1', ok));
  const porta = outra.address().port;
  try {
    const r = await p.evaluate(async (base) => {
      // Sem hls.js: o vídeo vai direto ao endereço, como no Safari.
      window.Hls = undefined;
      const { abrirQuadrosEscondidos, rostosDoQuadro } = await import('./rosto.js');
      const ler = async (url) => {
        const q = abrirQuadrosEscondidos({ limiteMs: 8000 });
        try {
          const f = await q.quadro({ url, tempoS: 0.8 });
          if (!f) return { quadro: false };
          const px = f.tela.getContext('2d').getImageData(10, 10, 1, 1).data;
          // E pelo caminho da procura: os ladrilhos saem da tela sem erro de segurança.
          let ladrilhos = 0;
          await rostosDoQuadro(f.tela, { detectar: async (img) => { ladrilhos++; img.close(); return []; } });
          return { quadro: true, azul: px[2] > 150 && px[0] < 90, ladrilhos };
        } catch (e) {
          return { erro: e.name };
        } finally { q.fechar(); }
      };
      return { cors: await ler(`${base}/cors/v.webm`), semCors: await ler(`${base}/nada/v.webm`) };
    }, `http://127.0.0.1:${porta}`);
    assert.deepEqual(r.cors.quadro, true, JSON.stringify(r));
    assert.ok(r.cors.azul, 'o quadro lido não é o do vídeo');
    assert.ok(r.cors.ladrilhos > 1);
    // Sem licença da origem, não há quadro; e nunca um erro de segurança a rebentar a procura.
    assert.deepEqual(r.semCors, { quadro: false });
    assert.equal(await p.evaluate(() => document.querySelectorAll('video[aria-hidden="true"]').length), 0, 'o vídeo escondido ficou na página');
  } finally { outra.close(); }
  assert.deepEqual(erros.filter((e) => !/CORS|Access-Control|blocked/i.test(e)), []);
  await p.close();
});

// ── com o modelo de verdade ─────────────────────────────────────────────────

const FOTO = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg';

/** O retrato de exemplo do MediaPipe, ou null sem rede. */
async function baixarFoto() {
  try {
    const r = await fetch(FOTO, { signal: AbortSignal.timeout(20000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; }
}

test('com o MediaPipe de verdade: acha o rosto numa webcam no canto de um quadro de jogo', semNavegador, async (t) => {
  const foto = await baixarFoto();
  if (!foto) { t.skip('sem rede para o retrato de exemplo'); return; }
  // Os quatro arquivos do detector baixados aqui pelo Node (o Chromium daqui não tem a rede do
  // contentor) e servidos à página. Sem rede, salta-se; com eles na mão, uma falha é do código.
  const arquivos = new Map();
  for (const a of TODOS) {
    try {
      const r = await fetch(a.url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(String(r.status));
      arquivos.set(a.url, Buffer.from(await r.arrayBuffer()));
    } catch { t.skip(`sem rede para ${a.url}`); return; }
  }
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  // Contados: tudo o que sai tem de estar na lista fixa.
  const pedidos = [];
  await p.context().route(/cdn\.jsdelivr\.net|storage\.googleapis\.com/, async (rota) => {
    const url = rota.request().url();
    pedidos.push(url);
    const corpo = arquivos.get(url);
    if (!corpo) { await rota.abort(); return; }
    await rota.fulfill({ status: 200, body: corpo, headers: { 'access-control-allow-origin': '*' } });
  });
  await fingir(p, { detector: false });
  // Os quadros: um "jogo" com a foto numa webcam embaixo à esquerda, a mexer-se um pouco.
  await p.addInitScript((b64) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    window.__povixQuadrosRosto = () => ({
      async quadro(pedido) {
        await img.decode();
        const n = window.__pedidosRosto.push({ canal: pedido.canal, ms: pedido.ms });
        const c = document.createElement('canvas');
        c.width = 1920; c.height = 1080;
        const g = c.getContext('2d');
        const ceu = g.createLinearGradient(0, 0, 0, 600);
        ceu.addColorStop(0, '#6f8fae'); ceu.addColorStop(1, '#d9c7a0');
        g.fillStyle = ceu; g.fillRect(0, 0, 1920, 600);
        g.fillStyle = '#5d6b3c'; g.fillRect(0, 600, 1920, 480);
        g.fillStyle = '#2b2b2b'; g.fillRect(820 + n * 9, 420, 40, 120);
        // A webcam: 420 de largura, a foto cortada a 4:3, encostada ao canto de baixo à esquerda.
        const sh = img.naturalWidth * 0.75;
        g.drawImage(img, 0, img.naturalHeight * 0.05, img.naturalWidth, sh, 0, 1080 - 315, 420, 315);
        window.__ultimoQuadroRosto = c;
        return { tela: c };
      },
      fechar() {},
    });
  }, foto.toString('base64'));
  await carregar(p, ['tchubi']);
  await abrirClipe(p);
  const t0 = Date.now();
  await p.click('#modoDois');
  await p.waitForFunction(() => /achada|Nenhum|não abriu|ler o vídeo/.test(document.getElementById('webcamAchada').textContent),
    null, { timeout: 180000 });
  const texto = await aviso(p);
  const ms = Date.now() - t0;
  assert.match(texto, /achada/, `o MediaPipe não achou o rosto: ${texto}`);
  const cx = await caixa1(p);
  // O rosto da foto: perto do meio da webcam (210, 1080-315+~140). A caixa tem de o ter.
  assert.ok(dentro(cx, [210 / 1920, (1080 - 315 + 140) / 1080]), JSON.stringify(cx));
  assert.ok(cx.x < 0.2 && cx.y > 0.5, `a caixa devia estar embaixo à esquerda: ${JSON.stringify(cx)}`);
  // Só os quatro arquivos fixos saíram para fora.
  const lista = new Set(TODOS.map((a) => a.url));
  assert.ok(pedidos.every((u) => lista.has(u)), pedidos.join('\n'));
  t.diagnostic(`MediaPipe de verdade: ${texto} em ${ms} ms; caixa ${JSON.stringify(cx)}`);
  await fotografar(p, 'webcam-real.png');
  assert.deepEqual(erros, []);
  await p.close();
});
