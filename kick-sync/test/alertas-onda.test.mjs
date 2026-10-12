// A regra do alerta com a forma de onda (alertas.js: ondaDe, semelhancaOnda, PADROES.ondaMin): um alerta toca o MESMO clipe, então
// a forma de onda se repete; sons que só têm o espectro parecido (explosões de raid, tom com outra fase) não repetem. Medido no
// crreg (16 sons com onda mediana 0,20, que a regra do espectro tirava) e no tchubi (o par de alertas do sub, onda 0,54).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './sons-sinteticos.mjs';
import {
  medirEspectro, tirarAlertas, ondaDe, semelhancaOnda, PADROES, TAXA_ONDA,
} from '../site/alertas.js';
import { medirGraves, explosoes } from '../site/explosoes.js';
import { chao } from '../site/tiros.js';

/** O jingle de sub: ronco de 60 Hz e quatro notas, 2 s. `fase` muda a fase das notas: o espectro é o mesmo, a forma de onda não. */
function jingle(amp = 0.6, fase = 0) {
  const n = Math.round(2 * S.TAXA);
  const a = new Float32Array(n);
  const notas = [523, 659, 784, 1046];
  for (let i = 0; i < n; i++) {
    const t = i / S.TAXA;
    const nota = notas[Math.min(3, Math.floor(t / 0.4))];
    const env = Math.min(1, t * 50) * Math.exp(-(t % 0.4) * 2) * Math.exp(-t / 1.5);
    a[i] = amp * (0.9 * Math.sin(2 * Math.PI * 60 * t + fase) * Math.exp(-t / 1.2)
      + 0.5 * env * (Math.sin(2 * Math.PI * nota * t + fase) + 0.4 * Math.sin(2 * Math.PI * 2 * nota * t + 2 * fase)));
  }
  return a;
}

/**
 * Ruído que passa por dois ressoadores estreitos (900 e 2100 Hz) e cai em 2 s: o espectro é o mesmo de uma semente para a outra e é bem
 * tonal (achatamento baixo), mas a forma de onda não se repete. É o que a regra do espectro tomava por alerta no crreg.
 */
function ruidoTonal(semente, amp = 0.8) {
  const r = S.ruido(semente);
  const n = Math.round(2 * S.TAXA);
  const a = new Float32Array(n);
  const res = (hz, q) => {
    const w = (2 * Math.PI * hz) / S.TAXA;
    const alfa = Math.sin(w) / (2 * q);
    const b0 = alfa; const a0 = 1 + alfa; const a1 = -2 * Math.cos(w); const a2 = 1 - alfa;
    let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
    return (x) => {
      const y = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    };
  };
  const f1 = res(900, 150);
  const f2 = res(2100, 150);
  const grave = res(70, 3);
  for (let i = 0; i < n; i++) {
    const t = i / S.TAXA;
    const x = r();
    a[i] = amp * 10 * Math.min(1, t * 50) * Math.exp(-t / 0.7) * (f1(x) + 0.7 * f2(x) + 1.5 * grave(x));
  }
  return a;
}

function live(segundos, eventos, semente = 5) {
  const base = S.fundo(segundos, 0.004, semente);
  S.por(base, S.conversa(segundos), 0);
  for (const [s, som] of eventos) S.por(base, som, s);
  return base;
}

/** Os sons achados na live, cada um com a forma de onda (como `varrerNoite` faz). */
function achados(som) {
  const m = medirGraves(som, S.TAXA);
  return explosoes(m, chao(m.forca)).map((e) => ({ ...e, onda: ondaDe(som, S.TAXA, e.inicioS, e.fimS) }));
}

test('a forma de onda: o mesmo clipe sobre fundos diferentes passa de 0,5, e dois sons sem relação ficam perto do chão do ruído', () => {
  const som = live(80, [[10, jingle(0.6)], [40, jingle(0.3)], [60, S.explosao(0.6, 1.5, 33)]], 9);
  const [a, b, c] = [10, 40, 60].map((s, k) => ondaDe(som, S.TAXA, s, s + (k < 2 ? 2 : 1.5)));
  assert.equal(a.v.length > 6000, true);
  assert.ok(Math.abs(a.v.length - Math.round(2.8 * TAXA_ONDA)) < 8, `${a.v.length}`);
  assert.ok(semelhancaOnda(a, b) > 0.5, `${semelhancaOnda(a, b)}`);
  assert.ok(semelhancaOnda(a, c) < PADROES.ondaMin, `${semelhancaOnda(a, c)}`);
  assert.equal(semelhancaOnda(a, null), null);
  assert.equal(semelhancaOnda(a, { v: new Float32Array(10) }), null);
  assert.equal(ondaDe(new Float32Array(100), S.TAXA, 0, 0.01), null, 'trecho curto demais não tem onda');
});

test('o jingle que repete igual continua sendo alerta com a forma de onda', () => {
  const som = live(140, [[10, jingle(0.6)], [40, jingle(0.55)], [75, jingle(0.65)], [120, jingle(0.6)]]);
  const r = tirarAlertas(achados(som), medirEspectro(som), {});
  assert.equal(r.removidos.length, 4);
  assert.ok(r.removidos.every((x) => x.porque === 'repete' && x.onda > PADROES.ondaMin), JSON.stringify(r.removidos.map((x) => x.onda)));
  assert.ok(r.novos.length >= 1);
});

test('o mesmo espectro com a forma de onda diferente (explosões de raid parecidas) não é alerta', () => {
  const som = live(140, [1, 2, 3, 4].map((semente, k) => [10 + k * 30, ruidoTonal(semente)]));
  const lista = achados(som);
  // só o espectro, sem a onda: a regra de antes tirava tudo
  const antes = tirarAlertas(lista.map(({ onda, ...e }) => e), medirEspectro(som), {});
  assert.equal(antes.removidos.length, 4, 'sem a onda os quatro saem, como no crreg');
  const depois = tirarAlertas(lista, medirEspectro(som), {});
  assert.equal(depois.removidos.length, 0);
  assert.equal(depois.mantidos.length, 4);
  assert.ok(depois.grupos.some((g) => g.pelaOnda), 'o grupo diz que não virou alerta pela onda');
  assert.ok(depois.grupos.every((g) => g.onda === null || g.onda < PADROES.ondaMin));
});

test('sem a forma de onda (som não guardado) vale só o espectro, como antes', () => {
  const som = live(140, [[10, jingle(0.6)], [40, jingle(0.6)], [75, jingle(0.6)]]);
  const r = tirarAlertas(achados(som).map(({ onda, ...e }) => e), medirEspectro(som), {});
  assert.equal(r.removidos.length, 3);
  assert.ok(r.removidos.every((x) => x.onda === null));
});
