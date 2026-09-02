// A geometria do retrato, sem browser.
//
// É a parte que erra em silêncio. Um rectângulo meio pixel fora da fonte dá
// uma barra preta na beira do vídeo exportado que ninguém vê no editor — e
// só se descobre depois de o clipe estar publicado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETRATO, enquadramentoInicial, limitar, destinos, desenhar, melhorFormato, extensaoDe,
  reformar, proporcaoDoQuadro, limparDivisao, DIVISAO_MIN, DIVISAO_MAX,
} from '../site/retrato.js';

const perto = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

test('um enquadramento abre com a fita 9:16 mais alta que cabe, ao meio', () => {
  const [r] = enquadramentoInicial(1920, 1080, 'um');
  assert.ok(perto(r.altura, 1080), 'usa a altura toda');
  assert.ok(perto(r.largura, 1080 * (9 / 16)), `largura ${r.largura}`);
  assert.ok(perto(r.x, (1920 - r.largura) / 2), 'ao meio');
  assert.equal(r.y, 0);
  assert.ok(perto(r.largura / r.altura, RETRATO.largura / RETRATO.altura), '9:16');
});

test('dois enquadramentos abrem em cima e em baixo, cada um 9:8', () => {
  const [cima, baixo] = enquadramentoInicial(1920, 1080, 'dois');
  const proporcao = RETRATO.largura / (RETRATO.altura / 2);
  for (const r of [cima, baixo]) {
    assert.ok(perto(r.largura / r.altura, proporcao), `proporção ${r.largura / r.altura}`);
    assert.ok(r.largura <= 1920 && r.altura <= 1080, 'cabe na fonte');
  }
  assert.equal(cima.y, 0, 'a cara em cima');
  assert.ok(perto(baixo.y + baixo.altura, 1080), 'o jogo em baixo');
  // Separados, e não um por cima do outro. Numa fonte 16:9 a primeira versão
  // dava a cada um a altura INTEIRA, e os dois nasciam no mesmo sítio — dois
  // rectângulos sobrepostos ao pixel são indistinguíveis de um.
  assert.ok(baixo.y >= cima.y + cima.altura - 0.01,
    `o de baixo começa em ${baixo.y} e o de cima acaba em ${cima.y + cima.altura}`);
});

test('numa fonte 16:9 os dois enquadramentos não nascem no mesmo sítio', () => {
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [854, 480]]) {
    const [cima, baixo] = enquadramentoInicial(w, h, 'dois');
    assert.ok(baixo.y > cima.y, `${w}x${h}: os dois em y=${cima.y}`);
    assert.ok(cima.altura <= h / 2 + 0.01, `${w}x${h}: cada um devia caber em metade`);
  }
});

test('uma fonte já vertical não gera um enquadramento mais largo do que ela', () => {
  const [r] = enquadramentoInicial(720, 1280, 'um');
  assert.ok(r.largura <= 720, `largura ${r.largura} maior do que a fonte`);
});

test('fonte sem tamanho não dá enquadramento nenhum', () => {
  assert.deepEqual(enquadramentoInicial(0, 0, 'um'), []);
  assert.deepEqual(enquadramentoInicial(1920, 0, 'dois'), []);
});

// ── limitar ─────────────────────────────────────────────────────────────────

test('deslizar é livre, sair não é', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const r = limitar({ x: -500, y: -300, largura: 600, altura: 1066 }, fonte);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
});

test('encostado à direita fica com a beira certa e não meio de fora', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const r = limitar({ x: 5000, y: 0, largura: 600, altura: 1066 }, fonte);
  assert.ok(perto(r.x + r.largura, 1920), `acaba em ${r.x + r.largura}`);
});

test('um enquadramento maior do que a fonte encolhe ANTES de se deslocar', () => {
  // Pela ordem contrária ficava encostado a um canto com metade de fora.
  const fonte = { largura: 1920, altura: 1080 };
  const r = limitar({ x: 0, y: 0, largura: 4000, altura: 7111 }, fonte);
  assert.ok(r.largura <= fonte.largura && r.altura <= fonte.altura,
    `${r.largura}x${r.altura} não cabe em ${fonte.largura}x${fonte.altura}`);
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.largura <= fonte.largura + 0.01
    && r.y + r.altura <= fonte.altura + 0.01, 'ficou dentro');
});

test('limitar nunca muda a proporção', () => {
  const fonte = { largura: 1920, altura: 1080 };
  for (const bruto of [
    { x: -900, y: -900, largura: 600, altura: 1066.67 },
    { x: 3000, y: 3000, largura: 5000, altura: 8888 },
    { x: 10, y: 10, largura: 300, altura: 533.33 },
  ]) {
    const antes = bruto.largura / bruto.altura;
    const r = limitar(bruto, fonte);
    assert.ok(perto(r.largura / r.altura, antes, 0.001),
      `${antes} virou ${r.largura / r.altura}`);
  }
});

// ── destinos ────────────────────────────────────────────────────────────────

test('um destino enche o retrato inteiro; dois partem-no ao meio', () => {
  const [u] = destinos('um');
  assert.deepEqual(u, { x: 0, y: 0, largura: 1080, altura: 1920 });
  const [a, b] = destinos('dois');
  assert.equal(a.altura + b.altura, 1920, 'juntos enchem a altura');
  assert.equal(b.y, a.altura, 'o de baixo começa onde o de cima acaba');
  assert.equal(a.largura, 1080);
});

// ── desenhar ────────────────────────────────────────────────────────────────

/** Um contexto 2D do tamanho exacto do que este código toca. */
function ctxFalso() {
  const feito = [];
  return {
    feito,
    fillStyle: '',
    fillRect: (...a) => feito.push(['fill', ...a]),
    drawImage: (...a) => feito.push(['img', ...a.slice(1)]),
  };
}

test('pinta o fundo antes de tudo', () => {
  // Sem isto, um enquadramento que não encha o destino ao pixel deixa a tira
  // do frame anterior a espreitar na beira.
  const ctx = ctxFalso();
  desenhar(ctx, {}, enquadramentoInicial(1920, 1080, 'um'), 'um');
  assert.equal(ctx.feito[0][0], 'fill');
  assert.deepEqual(ctx.feito[0].slice(1), [0, 0, 1080, 1920]);
});

test('dois enquadramentos dão dois desenhos, nos dois destinos', () => {
  const ctx = ctxFalso();
  const n = desenhar(ctx, {}, enquadramentoInicial(1920, 1080, 'dois'), 'dois');
  assert.equal(n, 2);
  const imagens = ctx.feito.filter((f) => f[0] === 'img');
  assert.equal(imagens.length, 2);
  assert.equal(imagens[0][6], 0, 'o primeiro aterra no topo');
  assert.equal(imagens[1][6], 960, 'o segundo a meio');
});

test('um enquadramento em falta é saltado, e não desenhado a zero', () => {
  const ctx = ctxFalso();
  desenhar(ctx, {}, [{ x: 0, y: 0, largura: 0, altura: 0 }, null], 'dois');
  assert.equal(ctx.feito.filter((f) => f[0] === 'img').length, 0);
});

// ── formato ─────────────────────────────────────────────────────────────────

test('prefere MP4 e cai no WebM', () => {
  const so = (...bons) => ({ isTypeSupported: (t) => bons.some((b) => t.startsWith(b)) });
  assert.ok(melhorFormato(so('video/mp4')).startsWith('video/mp4'));
  assert.ok(melhorFormato(so('video/webm')).startsWith('video/webm'));
  assert.equal(melhorFormato(so('video/ogg')), null);
  assert.equal(melhorFormato(undefined), null);
});

test('a extensão combina com o tipo', () => {
  assert.equal(extensaoDe('video/mp4;codecs=avc1.42E01E'), 'mp4');
  assert.equal(extensaoDe('video/webm;codecs=vp9,opus'), 'webm');
});

// ── o divisor ───────────────────────────────────────────────────────────────
//
// "Um controlo para deixar maior a parte de cima, ou arrasta para o outro lado
//  e fica maior a parte de baixo. Mexer na direita afeta directamente os
//  tamanhos na esquerda."
//
// Afecta, e é essa a parte que tem de estar certa: se o quadro de cima passa a
// valer 70% da altura, o RECORTE de cima tem de mudar de forma no mesmo
// instante. Senão o que se vê no editor deixa de ser o que sai no ficheiro.

test('o divisor reparte a altura, e a segunda faixa leva o resto', () => {
  for (const d of [0.2, 1 / 3, 0.5, 0.7, 0.8]) {
    const [cima, baixo] = destinos('dois', d);
    assert.equal(cima.altura + baixo.altura, RETRATO.altura,
      `divisão ${d}: ${cima.altura} + ${baixo.altura} deixa uma risca preta`);
    assert.equal(baixo.y, cima.altura, 'o de baixo começa onde o de cima acaba');
    assert.ok(Math.abs(cima.altura - RETRATO.altura * d) <= 1, `divisão ${d} mal repartida`);
  }
});

test('o divisor não passa dos limites', () => {
  assert.equal(limparDivisao(0), DIVISAO_MIN);
  assert.equal(limparDivisao(1), DIVISAO_MAX);
  assert.equal(limparDivisao(-5), DIVISAO_MIN);
  assert.equal(limparDivisao(NaN), 0.5);
  assert.equal(limparDivisao(undefined), 0.5);
  assert.equal(limparDivisao(0.3), 0.3);
});

test('mexer no divisor muda a FORMA dos dois recortes', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const meio = enquadramentoInicial(1920, 1080, 'dois', 0.5);
  const desigual = reformar(meio, { modo: 'dois', divisao: 0.75, fonte });
  for (const i of [0, 1]) {
    const esperada = proporcaoDoQuadro('dois', i, 0.75);
    assert.ok(Math.abs(desigual[i].largura / desigual[i].altura - esperada) < 0.01,
      `quadro ${i}: ${desigual[i].largura / desigual[i].altura} em vez de ${esperada}`);
  }
  // Com o de cima a valer três quartos, o recorte de cima fica mais ALTO em
  // relação à sua largura do que o de baixo. É o contrário do meio a meio.
  assert.ok(desigual[0].altura / desigual[0].largura > desigual[1].altura / desigual[1].largura);
});

test('reformar mantém o enquadramento onde estava', () => {
  // Sem isto, arrastar o divisor um pixel atirava o enquadramento escolhido
  // para o canto, e havia que o voltar a colocar a cada ajuste.
  const fonte = { largura: 1920, altura: 1080 };
  const original = [{ x: 1200, y: 400, largura: 400, altura: 355.5 },
                    { x: 100, y: 100, largura: 400, altura: 355.5 }];
  const novo = reformar(original, { modo: 'dois', divisao: 0.6, fonte });
  for (const i of [0, 1]) {
    const cxA = original[i].x + original[i].largura / 2;
    const cxB = novo[i].x + novo[i].largura / 2;
    assert.ok(Math.abs(cxA - cxB) < 60, `quadro ${i} saltou de x=${cxA} para ${cxB}`);
  }
});

test('arrastar o divisor de um lado ao outro não faz o recorte crescer sem parar', () => {
  // Conservar a LARGURA em vez da área fazia cada passo tornar o rectângulo
  // mais alto, e mais alto, até encher a fonte toda ao fim de meia dúzia.
  const fonte = { largura: 1920, altura: 1080 };
  let rects = enquadramentoInicial(1920, 1080, 'dois', 0.5);
  const areaInicial = rects[0].largura * rects[0].altura;
  for (const d of [0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.5]) {
    rects = reformar(rects, { modo: 'dois', divisao: d, fonte });
  }
  const areaFinal = rects[0].largura * rects[0].altura;
  assert.ok(areaFinal <= areaInicial * 1.15,
    `a área cresceu de ${Math.round(areaInicial)} para ${Math.round(areaFinal)}`);
  assert.ok(rects[0].x >= 0 && rects[0].y >= 0, 'continua dentro da fonte');
});

test('desenhar reparte a tela pelo divisor', () => {
  const ctx = ctxFalso();
  desenhar(ctx, {}, enquadramentoInicial(1920, 1080, 'dois', 0.7), 'dois', 0.7);
  const imagens = ctx.feito.filter((f) => f[0] === 'img');
  assert.equal(imagens.length, 2);
  assert.equal(imagens[0][6], 0, 'o de cima no topo');
  assert.equal(imagens[0][8], 1344, 'o de cima leva 70% de 1920');
  assert.equal(imagens[1][6], 1344, 'o de baixo começa onde o outro acaba');
  assert.equal(imagens[1][8], 576);
});
