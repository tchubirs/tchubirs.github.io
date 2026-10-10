// As medidas dos filtros de som da detecção: explosões (explosoes.js) e gritos (gritos.js), em sons
// feitos de propósito (sons-sinteticos.mjs). Cada caso põe UM som num minuto de conversa normal com um
// chiado por baixo, que é o fundo de uma live, e vê o que cada medida acha.
//
// Isto prova que as regras fazem o que dizem nos sons de livro. Não prova que acertam numa live de
// verdade, onde o jogo, a música e a voz vêm todos misturados: aí é aproximado, e a tela di-lo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './sons-sinteticos.mjs';
import { medirGraves, explosoes, FPS as FPS_EXP } from '../site/explosoes.js';
import { medirVoz, gritos, normalDaVoz, FPS as FPS_GRITO } from '../site/gritos.js';
import { chao } from '../site/tiros.js';

/** Um minuto de conversa com `som` aos 30 s. */
function minutoCom(som, emS = 30) {
  const base = S.fundo(60);
  S.por(base, S.conversa(60), 0);
  if (som) S.por(base, som, emS);
  return base;
}

function acharExplosoes(amostras, opcoes) {
  const m = medirGraves(amostras, S.TAXA);
  return explosoes(m, chao(m.forca), opcoes);
}

function acharGritos(amostras, opcoes) {
  const m = medirVoz(amostras, S.TAXA);
  return gritos(m, normalDaVoz(m.voz), opcoes);
}

test('as medidas andam em blocos de 10 ms', () => {
  assert.equal(FPS_EXP, 100);
  assert.equal(FPS_GRITO, 100);
  const m = medirGraves(new Float32Array(S.TAXA), S.TAXA);
  assert.equal(m.forca.length, 100);
  assert.equal(medirVoz(new Float32Array(S.TAXA), S.TAXA).voz.length, 100);
});

test('uma explosão longa e grave conta, no sítio certo', () => {
  const achadas = acharExplosoes(minutoCom(S.explosao()));
  assert.equal(achadas.length, 1, JSON.stringify(achadas));
  const [e] = achadas;
  assert.ok(Math.abs(e.inicioS - 30) < 0.1, `começou aos ${e.inicioS}`);
  assert.ok(e.duracaoS >= 0.5, `durou ${e.duracaoS} s`);
  assert.ok(e.picoS >= 30 && e.picoS < 31, `o pico aos ${e.picoS}`);
  assert.ok(e.pico > 8);
});

test('um tiro curto não conta como explosão, nem com um baque grave por baixo, nem uma rajada', () => {
  assert.deepEqual(acharExplosoes(minutoCom(S.tiro())), []);
  assert.deepEqual(acharExplosoes(minutoCom(S.tiroComRonco())), []);
  assert.deepEqual(acharExplosoes(minutoCom(S.rajada(12, 0.1))), []);
});

test('um som forte e comprido mas agudo não é explosão, e uma explosão baixinha também não', () => {
  assert.deepEqual(acharExplosoes(minutoCom(S.apito())), []);
  assert.deepEqual(acharExplosoes(minutoCom(S.explosao(0.02))), [], 'uma explosão que mal se ouve fica de fora');
});

test('o ronco grave que não acaba (música, motor) não é um estouro', () => {
  const base = minutoCom(null);
  // Doze segundos de grave forte e contínuo.
  const longo = new Float32Array(12 * S.TAXA);
  for (let i = 0; i < longo.length; i++) longo[i] = 0.5 * Math.sin((2 * Math.PI * 55 * i) / S.TAXA);
  S.por(base, longo, 20);
  assert.deepEqual(acharExplosoes(base), []);
});

test('duas explosões seguidas a menos de dois segundos são um estouro só, e longe são duas', () => {
  const perto = minutoCom(S.explosao());
  S.por(perto, S.explosao(0.8, 1.5, 23), 32);
  assert.equal(acharExplosoes(perto).length, 1);
  const longe = minutoCom(S.explosao());
  S.por(longe, S.explosao(0.8, 1.5, 23), 45);
  assert.deepEqual(acharExplosoes(longe).map((e) => Math.round(e.inicioS)), [30, 45]);
});

test('sem som não há chão, e não se inventa nada', () => {
  assert.deepEqual(explosoes(medirGraves(new Float32Array(S.TAXA), S.TAXA), 0), []);
  assert.deepEqual(gritos(medirVoz(new Float32Array(S.TAXA), S.TAXA), 0), []);
  assert.equal(normalDaVoz(new Float32Array(10)), 0);
  assert.equal(normalDaVoz(null), 0);
});

test('um grito forte e sustentado conta, no sítio certo', () => {
  const achados = acharGritos(minutoCom(S.grito()));
  assert.equal(achados.length, 1, JSON.stringify(achados));
  const [g] = achados;
  assert.ok(g.inicioS >= 29.9 && g.inicioS < 30.4, `começou aos ${g.inicioS}`);
  assert.ok(g.duracaoS >= 0.5, `durou ${g.duracaoS}`);
  assert.ok(g.pico >= 3);
});

test('a conversa normal não tem gritos, e falar um pouco mais alto também não', () => {
  assert.deepEqual(acharGritos(minutoCom(null)), []);
  assert.deepEqual(acharGritos(minutoCom(S.voz({ amp: 0.08, segundos: 3 }))), []);
});

test('um grito curto (menos de meio segundo) não conta', () => {
  assert.deepEqual(acharGritos(minutoCom(S.grito({ segundos: 0.25 }))), []);
});

test('tiros, rajadas e explosões não são gritos', () => {
  assert.deepEqual(acharGritos(minutoCom(S.tiro())), []);
  assert.deepEqual(acharGritos(minutoCom(S.rajada(12, 0.1))), []);
  assert.deepEqual(acharGritos(minutoCom(S.explosao())), []);
});

test('o normal é o da pessoa: o mesmo grito numa pessoa que fala sempre alto não passa', () => {
  // Quem fala alto o tempo todo: o grito de 0,3 fica perto do normal dele.
  const base = S.fundo(60);
  S.por(base, S.conversa(60, 0.2), 0);
  S.por(base, S.grito(), 30);
  assert.deepEqual(acharGritos(base), []);
  // E um grito dele, bem acima disso, passa.
  S.por(base, S.grito({ amp: 1.2 }), 45);
  assert.equal(acharGritos(base).length, 1);
});
