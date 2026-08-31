// As contas do alinhamento pelo som, sozinhas, sem rede e sem browser.
//
// Um erro de sinal aqui inverte o conselho dado ao utilizador: mandava-o
// empurrar o ângulo para o lado errado, e o resultado continuaria a parecer
// uma medição. Por isso o primeiro teste é sobre o sinal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envolvente, desvio, consolidar, resolver, TAXA, SALTO } from '../site/sinal.js';

const FPS = TAXA / SALTO;

/**
 * Uma "noite" sintética: ruído de fundo pontuado por ataques em instantes
 * irregulares, com um gerador determinista.
 *
 * Os instantes das batidas dependem da SEMENTE. A primeira versão deste
 * ficheiro tinha-os fixos e só variava o volume — o que fazia "dois sons sem
 * nada em comum" correlacionar na perfeição e o teste dava um falso alarme
 * sobre o módulo, que estava certo.
 */
function noite(segundosTotal, { semente = 1, volume = 1 } = {}) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const n = Math.round(segundosTotal * TAXA);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * 0.02;
  let t = 0;
  while (t < n) {
    t += Math.round((0.15 + rnd() * 0.6) * TAXA);
    const forca = volume * (0.3 + rnd());
    for (let i = 0; i < 1200 && t + i < n; i++) {
      x[t + i] += (rnd() * 2 - 1) * forca * Math.exp(-i / 260);
    }
  }
  return x;
}

/**
 * Duas vistas da MESMA noite, uma atrasada em relação à outra.
 *
 * `atrasoS` positivo => o segundo canal traz o som mais tarde, que é o que
 * acontece a quem tem mais buffer no OBS.
 */
function doisAngulos(duracaoS, atrasoS, { volumeB = 1, semente = 1 } = {}) {
  const margem = 30;
  const x = noite(duracaoS + 2 * margem, { semente });
  const n = Math.round(duracaoS * TAXA);
  const o = Math.round(margem * TAXA);
  const d = Math.round(atrasoS * TAXA);
  const a = x.subarray(o, o + n);
  // A janela de `b` começa mais cedo na fonte, logo o mesmo acontecimento
  // aparece `d` amostras MAIS À FRENTE dentro de `b`.
  const cru = x.subarray(o - d, o - d + n);
  if (volumeB === 1) return [a, cru];
  const b = new Float32Array(cru.length);
  for (let i = 0; i < cru.length; i++) b[i] = cru[i] * volumeB;
  return [a, b];
}

test('encontra um atraso conhecido, e com o sinal certo', () => {
  const [xa, xb] = doisAngulos(40, 2.5);
  const a = envolvente(xa);
  const b = envolvente(xb);
  const r = desvio(a, b);
  assert.ok(r.forca > 5, `pico fraco: ${r.forca.toFixed(1)}`);
  // b é o atrasado, logo `a menos b` é NEGATIVO.
  assert.ok(Math.abs(r.desvioS + 2.5) < 0.1,
    `esperava -2.50s (b é o atrasado), deu ${r.desvioS?.toFixed(2)}`);

  // E ao contrário, para que um erro de sinal não passe por simetria.
  const t = desvio(b, a);
  assert.ok(Math.abs(t.desvioS - 2.5) < 0.1, `esperava +2.50s, deu ${t.desvioS?.toFixed(2)}`);

  // E o que o produto usa mesmo: o ajuste. O atrasado tem de AVANÇAR.
  const { ajustes } = resolver([{ a: 'x', b: 'y', desvioS: r.desvioS }], ['x', 'y']);
  assert.ok(ajustes.y > ajustes.x, 'quem chegou mais tarde leva o ajuste maior');
  assert.ok(Math.abs((ajustes.y - ajustes.x) - 2.5) < 0.1,
    `a distância entre os dois ajustes é o atraso: ${(ajustes.y - ajustes.x).toFixed(2)}`);
});

test('dois ângulos do mesmo momento dão zero', () => {
  const [xa, xb] = doisAngulos(40, 0);
  const r = desvio(envolvente(xa), envolvente(xb));
  assert.ok(Math.abs(r.desvioS) < 0.05, `deu ${r.desvioS}`);
});

// O erro que fez a primeira versão medir metade da força: `log1p` só comprime
// quando o número é grande, e o browser entrega amostras entre -1 e 1.
test('o volume de cada canal não muda a medição', () => {
  const [xa, xb] = doisAngulos(40, 1.2, { volumeB: 0.02 });
  const r = desvio(envolvente(xa), envolvente(xb));
  assert.ok(Math.abs(r.desvioS + 1.2) < 0.15,
    `um canal 50x mais baixo tem de dar o mesmo: ${r.desvioS?.toFixed(2)}`);
  assert.ok(r.forca > 5, `e com a mesma confiança: ${r.forca.toFixed(1)}`);
});

test('sons sem nada em comum não inventam um desvio forte', () => {
  const a = envolvente(noite(40, { semente: 1 }));
  const b = envolvente(noite(40, { semente: 987654321 }));
  const r = desvio(a, b);
  assert.ok(r.forca < 5, `dois barulhos diferentes não podem dar confiança ${r.forca.toFixed(1)}`);
});

test('pouco áudio é dito, não adivinhado', () => {
  const r = desvio(envolvente(noite(2)), envolvente(noite(2)));
  assert.equal(r.desvioS, null);
  assert.equal(r.motivo, 'pouco-audio');
});

// Uma janela não é uma medição. Música que se repete dá picos altos em sítios
// errados, e sempre no mesmo sítio errado.
test('uma janela sozinha não chega, duas que concordam chegam', () => {
  const uma = consolidar([{ desvioS: 3, forca: 9 }]);
  assert.equal(uma.desvioS, null);
  assert.equal(uma.janelas, 1);

  const duas = consolidar([{ desvioS: 3.0, forca: 9 }, { desvioS: 3.2, forca: 7 }]);
  assert.ok(Math.abs(duas.desvioS - 3.1) < 0.01);
  assert.equal(duas.janelas, 2);
});

test('picos fortes que se contradizem não dão resposta', () => {
  const r = consolidar([{ desvioS: 3, forca: 9 }, { desvioS: -14, forca: 8 }]);
  assert.equal(r.desvioS, null, 'entre +3 e -14 não se escolhe: diz-se que não se sabe');
});

// O caso real: lautaarg00 acertou em três janelas e falhou numa. Exigir
// unanimidade deitava fora a medição boa.
test('três janelas que concordam sobrevivem a uma que não', () => {
  const r = consolidar([
    { desvioS: 5.49, forca: 12.8 }, { desvioS: 5.71, forca: 13.5 },
    { desvioS: 5.56, forca: 10.0 }, { desvioS: -13.58, forca: 5.7 },
  ]);
  assert.ok(Math.abs(r.desvioS - 5.59) < 0.05, `deu ${r.desvioS}`);
  assert.equal(r.janelas, 3);
  assert.equal(r.descartadas, 1);
});

test('medições fracas são ignoradas mesmo sendo muitas', () => {
  assert.equal(consolidar([
    { desvioS: 1, forca: 2 }, { desvioS: 1, forca: 3 }, { desvioS: 1, forca: 4.9 },
  ]).desvioS, null);
});

// De pares para um número por canal, com o grafo a atravessar quem não se ouve
// directamente.
test('propaga o ajuste por quem está no meio', () => {
  // x tem 2 s MENOS atraso que y; y tem 3 s MENOS que z.
  const { ajustes, semLigacao } = resolver(
    [{ a: 'x', b: 'y', desvioS: -2 }, { a: 'y', b: 'z', desvioS: -3 }],
    ['x', 'y', 'z'],
  );
  assert.deepEqual(semLigacao, []);
  // atrasos x=0, y=2, z=5 -> centrado na mediana (2): -2, 0, +3
  assert.equal(ajustes.x, -2);
  assert.equal(ajustes.y, 0);
  assert.equal(ajustes.z, 3);
});

test('quem não se liga a ninguém é dito pelo nome', () => {
  const { ajustes, semLigacao } = resolver([{ a: 'x', b: 'y', desvioS: 1 }], ['x', 'y', 'sozinho']);
  assert.deepEqual(semLigacao, ['sozinho'], 'nunca posto a zero em silêncio');
  assert.ok('x' in ajustes && 'y' in ajustes);
});

test('sem um único par, ninguém é alinhado', () => {
  const r = resolver([], ['a', 'b']);
  assert.deepEqual(r.ajustes, {});
  assert.deepEqual(r.semLigacao, ['a', 'b']);
});
