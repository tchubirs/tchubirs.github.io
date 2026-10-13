// As caixas do chat e da legenda por cima das prévias (site/caixa-previa.js): guardar, mover com a zona
// do TikTok, redimensionar por um canto sem deformar, e o estilo que as põe na prévia.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  limparCaixa, limparCaixas, dentroDaZona, moverCaixa, redimensionarCaixa, estiloDaCaixa, CAIXA_MIN_W, RESISTENCIA,
} from '../site/caixa-previa.js';
import { ZONA_TIKTOK } from '../site/retrato.js';

const ZONA = { x0: 0, y0: ZONA_TIKTOK.cima, x1: 1 - ZONA_TIKTOK.direita, y1: 1 - ZONA_TIKTOK.baixo };
const caixa = (x, y, w, h) => ({ x, y, w, h });

test('uma caixa guardada fica dentro do quadro, e o que vier estragado é o lugar automático', () => {
  assert.equal(limparCaixa(null), null);
  assert.equal(limparCaixa({ x: 'a', y: 0, w: 0.3 }), null);
  assert.equal(limparCaixa({ x: 0.1, y: 0.2 }), null, 'sem largura não há caixa');
  assert.deepEqual(limparCaixa({ x: 0.1, y: 0.2, w: 0.3 }), { x: 0.1, y: 0.2, w: 0.3 });
  const grande = limparCaixa({ x: 0.9, y: 5, w: 3 });
  assert.equal(grande.w, 1);
  assert.equal(grande.x, 0, 'com a largura toda só cabe em x = 0');
  assert.equal(grande.y, 0.98);
  assert.equal(limparCaixa({ x: 0, y: 0, w: 0.01 }).w, CAIXA_MIN_W);
  assert.equal(limparCaixa({ x: 0, y: 0, w: 0.01 }, { min: 0.15 }).w, 0.15);
  assert.deepEqual(limparCaixas(null), { '16:9': null, '9:16': null });
  assert.deepEqual(limparCaixas({ '9:16': { x: 0.2, y: 0.2, w: 0.4 }, '16:9': 'x' }), { '16:9': null, '9:16': { x: 0.2, y: 0.2, w: 0.4 } });
});

test('na zona do TikTok a caixa cola na borda, e puxada bem para fora fica onde a pessoa a deixou', () => {
  const dentro = caixa(0.1, 0.3, 0.3, 0.2);
  // Um pouco acima do topo da zona: volta para dentro.
  const colada = dentroDaZona({ ...dentro, y: ZONA.y0 - RESISTENCIA / 2 }, ZONA);
  assert.equal(colada.y, ZONA.y0);
  // Muito acima: foi de propósito.
  const fora = dentroDaZona({ ...dentro, y: 0.01 }, ZONA);
  assert.equal(fora.y, 0.01);
  // À direita, a coluna de botões do TikTok.
  const dir = dentroDaZona({ ...dentro, x: ZONA.x1 - dentro.w + RESISTENCIA / 2 }, ZONA);
  assert.ok(Math.abs(dir.x + dir.w - ZONA.x1) < 1e-9, 'colou na borda de dentro da coluna de botões');
  const longe = dentroDaZona({ ...dentro, x: 0.8 }, ZONA);
  assert.ok(longe.x > ZONA.x1 - dentro.w + RESISTENCIA, 'a caixa levada para a coluna dos botões fica lá');
  // Nunca sai do quadro, com zona ou sem ela.
  const alem = dentroDaZona({ ...dentro, x: 2, y: -3 }, null);
  assert.deepEqual([alem.x, alem.y], [1 - dentro.w, 0]);
});

test('mover soma o gesto à caixa e respeita a zona', () => {
  const r0 = caixa(0.1, 0.3, 0.3, 0.2);
  assert.deepEqual(moverCaixa(r0, 0.1, 0.1, null), { x: 0.2, y: 0.4, w: 0.3, h: 0.2 });
  const preso = moverCaixa(r0, 0, ZONA.y0 - 0.02 - 0.3, ZONA);
  assert.equal(preso.y, ZONA.y0, 'um pouco para cima do topo da zona cola nele');
  // Uma caixa mais alta do que a zona não tem como caber: a zona não a prende nessa direção.
  const alta = moverCaixa(caixa(0.1, 0.1, 0.3, 0.8), 0, 0.02, ZONA);
  assert.ok(Math.abs(alta.y - 0.12) < 1e-9);
});

test('puxar um canto muda o tamanho sem deformar e o canto oposto fica parado', () => {
  const r0 = caixa(0.2, 0.4, 0.3, 0.15);
  const se = redimensionarCaixa(r0, 'se', 0.1);
  assert.equal(se.x, 0.2);
  assert.equal(se.y, 0.4);
  assert.ok(Math.abs(se.w - 0.4) < 1e-9);
  assert.ok(Math.abs(se.h / se.w - 0.5) < 1e-9, 'a forma é a mesma');
  const no = redimensionarCaixa(r0, 'no', 0.1);
  assert.ok(Math.abs(no.x + no.w - 0.5) < 1e-9, 'o canto de baixo à direita ficou onde estava');
  assert.ok(Math.abs(no.y + no.h - 0.55) < 1e-9);
  assert.ok(Math.abs(no.w - 0.2) < 1e-9, 'puxar o canto de cima à esquerda para a direita encolhe');
  const ne = redimensionarCaixa(r0, 'ne', 0.1);
  assert.equal(ne.x, 0.2);
  assert.ok(Math.abs(ne.y + ne.h - 0.55) < 1e-9);
  const so = redimensionarCaixa(r0, 'so', -0.1);
  assert.ok(Math.abs(so.x + so.w - 0.5) < 1e-9);
  assert.equal(so.y, 0.4);
  assert.ok(Math.abs(so.w - 0.4) < 1e-9);
});

test('redimensionar nunca fica mais estreita do que o mínimo nem passa do quadro', () => {
  const r0 = caixa(0.2, 0.4, 0.3, 0.15);
  assert.equal(redimensionarCaixa(r0, 'se', -5).w, CAIXA_MIN_W);
  assert.equal(redimensionarCaixa(r0, 'se', -5, { min: 0.2 }).w, 0.2);
  const grande = redimensionarCaixa(r0, 'se', 5);
  assert.ok(grande.x + grande.w <= 1 + 1e-9, 'passou da borda direita');
  assert.ok(grande.y + grande.h <= 1 + 1e-9, 'passou da borda de baixo');
  const noCanto = redimensionarCaixa(r0, 'no', -5);
  assert.ok(noCanto.x >= -1e-9 && noCanto.y >= -1e-9, 'passou da borda de cima ou da esquerda');
});

test('o estilo põe a caixa em percentagens do quadro', () => {
  assert.equal(estiloDaCaixa(caixa(0.1, 0.25, 0.5, 0.2)), 'left:10%;top:25%;width:50%;height:20%');
});
