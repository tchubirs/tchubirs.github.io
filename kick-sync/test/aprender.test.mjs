// Aprender o som de uma kill com uma kill.
//
// O que aqui se testa e a promessa toda: a MESMA amostra do jogo, tocada mais
// alto, mais baixo, com tiroteio por cima e com ele a falar, tem de continuar a
// reconhecer-se. E um som diferente nao pode passar por ela.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recortar, semelhanca, parecidos, juntarPerto } from '../site/aprender.js';

const TAXA = 24000;
const al = (s0) => { let s = s0 >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; }; };

/**
 * Uma amostra do jogo: sempre o mesmo desenho, gerado da mesma semente.
 *
 * Cada uma leva o seu tom e a sua queda. A primeira versao destes dois sons
 * partilhava a envolvente e o tom, e so mudava o ruido — davam-se 70% de
 * parecidos, e com razao: eram mesmo parecidos. Um teste em que os dois lados
 * sao quase iguais nao prova que a conta os distingue.
 */
const amostraDoJogo = (semente, { durS = 0.05, tom = 1800, queda = 0.01, ataque = 24 } = {}) => {
  const r = al(semente);
  const n = Math.round(durS * TAXA);
  const v = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const env = k < ataque ? k / ataque : Math.exp(-k / (queda * TAXA));
    v[k] = env * (r() * 2 + Math.sin((2 * Math.PI * tom * k) / TAXA));
  }
  return v;
};

const ACERTO = amostraDoJogo(11);
const OUTRO = amostraDoJogo(999, { tom: 400, queda: 0.03, ataque: 200, durS: 0.09 });

/** Uma noite: fundo, e a amostra pousada onde se mandar, com o volume que se disser. */
function noite(segundos, eventos, { fundo = 0.01, semente = 5 } = {}) {
  const r = al(semente);
  const x = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < x.length; i++) x[i] = r() * fundo;
  for (const { s, som = ACERTO, forca = 1 } of eventos) {
    const i0 = Math.round(s * TAXA);
    for (let k = 0; k < som.length && i0 + k < x.length; k++) x[i0 + k] += som[k] * forca;
  }
  return x;
}

test('o mesmo som reconhece-se a si próprio', () => {
  const x = noite(10, [{ s: 3 }]);
  const a = recortar(x, TAXA, 3.0);
  assert.ok(a, 'nao recortou nada');
  assert.ok(semelhanca(a, a) > 0.95);
});

// O mesmo ficheiro do jogo toca alto quando e perto e baixo quando e longe. Se
// o volume contasse, uma kill a cinquenta metros nao se parecia com uma a dois.
test('o mesmo som mais alto e mais baixo continua a ser o mesmo som', () => {
  const perto = recortar(noite(10, [{ s: 3, forca: 4 }]), TAXA, 3.0);
  const longe = recortar(noite(10, [{ s: 3, forca: 0.25 }]), TAXA, 3.0);
  assert.ok(semelhanca(perto, longe) > 0.9, semelhanca(perto, longe).toFixed(2));
});

test('um som diferente não passa por ele', () => {
  const a = recortar(noite(10, [{ s: 3 }]), TAXA, 3.0);
  const b = recortar(noite(10, [{ s: 3, som: OUTRO }]), TAXA, 3.0);
  assert.ok(semelhanca(a, b) < 0.5, `deu ${semelhanca(a, b).toFixed(2)}`);
});

// O caso a serio: o acerto acontece DENTRO de um tiroteio, com barulho por
// cima. Se so se reconhecesse em silencio, nao servia para nada.
test('reconhece-se com um tiroteio por cima', () => {
  const limpo = recortar(noite(10, [{ s: 3 }]), TAXA, 3.0);
  const sujo = recortar(noite(10, [{ s: 3 }], { fundo: 0.06, semente: 77 }), TAXA, 3.0);
  assert.ok(semelhanca(limpo, sujo) > 0.55, semelhanca(limpo, sujo).toFixed(2));
});

test('procurar na noite acha as vezes todas, e só essas', () => {
  const quando = [12, 40, 41.2, 77, 130];
  const x = noite(180, [
    ...quando.map((s) => ({ s, forca: 0.5 + (s % 3) })),
    { s: 60, som: OUTRO, forca: 3 },      // outro som, nao pode entrar
    { s: 95, som: OUTRO, forca: 2 },
  ]);
  const exemplo = recortar(x, TAXA, 12);
  // Todos os instantes candidatos, como a varredura os daria.
  const estouros = [...quando, 60, 95].map((s) => ({
    ms: Math.round(s * 1000), recorte: recortar(x, TAXA, s),
  }));
  const achados = parecidos(exemplo, estouros);
  assert.deepEqual(achados.map((a) => a.ms).sort((a, b) => a - b),
    quando.map((s) => Math.round(s * 1000)));
});

// Uma kill faz varios destes sons seguidos. Sao um momento, e nao cinco linhas
// na lista dele.
test('sons seguidos são uma kill e não cinco', () => {
  const achados = [
    { ms: 40_000, nota: 0.7 }, { ms: 41_200, nota: 0.9 }, { ms: 43_000, nota: 0.6 },
    { ms: 77_000, nota: 0.8 },
  ];
  const r = juntarPerto(achados);
  assert.equal(r.length, 2);
  // Fica o instante do que se parece mais: e o que tem mais hipoteses de ser
  // mesmo o momento da kill.
  assert.equal(r[0].ms, 41_200);
  assert.equal(r[0].quantos, 3);
});

test('sem exemplo não se inventa nada', () => {
  assert.deepEqual(parecidos(null, [{ ms: 1, recorte: new Float32Array(10) }]), []);
  assert.equal(semelhanca(null, null), 0);
  assert.equal(recortar(new Float32Array(10), TAXA, 5), null, 'som curto demais');
  assert.equal(recortar(new Float32Array(TAXA), TAXA, 0.5), null, 'som todo a zero');
});
