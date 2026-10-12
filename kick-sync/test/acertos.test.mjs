// O detector dos sons de acerto do jogo (acertos.js) em som feito de propósito: um clipe de "acerto" sintético somado a uma
// live falsa (fundo, conversa, tiros) é achado nos lugares certos; sem o clipe, ou com ele só duas vezes, não sai acerto
// nenhum; e os modelos guardados em acertos-modelos.js decodificam e se reconhecem. Sem arquivos de áudio do jogo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './sons-sinteticos.mjs';
import MODELOS from '../site/acertos-modelos.js';
import {
  medirAcertos, confirmarAcertos, lerModelo, paraDoze, passarBanda, paraTexto, TAXA_ACERTO, NOTA_MINIMA, REPETE_MIN,
} from '../site/acertos.js';

/** O clipe de teste: dois tons que caem e um estalo no começo, 0,25 s. Sempre igual. */
function clipe(amp = 0.5) {
  const n = Math.round(0.25 * S.TAXA);
  const a = new Float32Array(n);
  const r = S.ruido(99);
  for (let i = 0; i < n; i++) {
    const t = i / S.TAXA;
    a[i] = amp * (Math.exp(-t / 0.06) * (Math.sin(2 * Math.PI * 1300 * t) + 0.7 * Math.sin(2 * Math.PI * 2900 * t + 1))
      + 2 * Math.exp(-t / 0.004) * r());
  }
  return a;
}

/** O modelo do clipe de teste, como `2-gerar-modelos.py` faria: a banda do modelo, 0,25 s a 12 kHz. */
function modeloDeTeste() {
  const banda = { hp: 18, lp: 1 };
  const v = passarBanda(paraDoze(clipe(), S.TAXA), banda);
  return { id: 'teste', tipo: 'corpo', banda, n: v.length, q: paraTexto(v) };
}

/** Uma live falsa: fundo, conversa e tiros de verdade variados, mais o clipe nos instantes dados. */
function live(segundos, clipesEm = []) {
  const base = S.fundo(segundos, 0.004, 5);
  S.por(base, S.conversa(segundos), 0);
  for (let t = 3; t < segundos - 2; t += 6.5) S.por(base, S.tiroComRonco(0.5 + 0.3 * ((t * 7) % 1), 20 + Math.round(t)), t);
  for (const t of clipesEm) S.por(base, clipe(0.2), t);
  return base;
}

const candidatosDe = (som, modelos) => medirAcertos(som, S.TAXA, { modelos }).map((c) => ({ ...c, ms: Math.round(c.s * 1000) }));

test('o clipe somado a uma live falsa é achado onde está, com tiros e conversa por cima, e só ali', () => {
  const m = modeloDeTeste();
  const em = [8, 21, 33, 47, 60, 74, 88, 101];
  const { acertos, modelos } = confirmarAcertos(candidatosDe(live(115, em), [m]));
  assert.ok(modelos[0].vale, JSON.stringify(modelos));
  const achados = em.filter((t) => acertos.some((a) => Math.abs(a.ms / 1000 - t) < 0.04));
  assert.ok(achados.length >= 7, `achou ${achados.length} de ${em.length}: ${acertos.map((a) => (a.ms / 1000).toFixed(2)).join(' ')}`);
  const falsos = acertos.filter((a) => !em.some((t) => Math.abs(a.ms / 1000 - t) < 0.04));
  assert.equal(falsos.length, 0, `falsos em ${falsos.map((a) => (a.ms / 1000).toFixed(1)).join(' ')}`);
});

test('sem o clipe na live (só tiros, voz e fundo) nenhum acerto sai, mesmo que um estalo lembre o modelo', () => {
  const r = confirmarAcertos(candidatosDe(live(115), [modeloDeTeste()]), { notaMinima: 0.45 });
  assert.equal(r.acertos.length, 0, JSON.stringify(r.modelos));
});

test('um clipe só duas vezes não basta: o modelo precisa repetir', () => {
  const r = confirmarAcertos(candidatosDe(live(60, [10, 40]), [modeloDeTeste()]));
  assert.equal(r.acertos.length, 0);
  assert.equal(r.modelos[0].vale, false);
});

test('o corte da nota e da repetição é o que a medida em 2 h de live sem clipe pediu', () => {
  assert.equal(NOTA_MINIMA, 0.75);
  assert.equal(REPETE_MIN, 0.65);
  assert.equal(TAXA_ACERTO, 12000);
});

test('os modelos guardados decodificam, têm até 0,3 s a 12 kHz e cada um se reconhece quando aparece na live', () => {
  assert.equal(MODELOS.length, 7);
  assert.deepEqual([...new Set(MODELOS.map((m) => m.tipo))].sort(), ['cabeca', 'corpo', 'morte']);
  for (const mod of MODELOS) {
    const m = lerModelo(mod);
    assert.equal(m.v.length, mod.n);
    assert.ok(mod.n >= 2900 && mod.n <= 3600, `n ${mod.n}`);
    assert.ok(Math.max(...m.v.map(Math.abs)) > 0.99, mod.id);
    // O próprio vetor (já filtrado) posto na live três vezes: a segunda filtragem muda a forma e a nota cai, mas continua alta.
    const alvo = S.fundo(40, 0.002, 4);
    for (const t of [5, 15, 25]) {
      for (let i = 0; i < m.v.length; i++) {
        alvo[Math.round(t * S.TAXA) + 2 * i] += 0.3 * m.v[i];
        alvo[Math.round(t * S.TAXA) + 2 * i + 1] += 0.3 * m.v[i];
      }
    }
    const achados = medirAcertos(alvo, S.TAXA, { modelos: [mod] }).filter((c) => [5, 15, 25].some((t) => Math.abs(c.s - t) < 0.02));
    assert.equal(achados.length, 3, `${mod.id}: ${achados.length} de 3`);
    assert.ok(Math.min(...achados.map((c) => c.nota)) > 0.6, `${mod.id}: nota ${Math.min(...achados.map((c) => c.nota)).toFixed(2)}`);
  }
});

test('a janela limita onde se procura', () => {
  const m = modeloDeTeste();
  const som = live(60, [10, 40]);
  const todos = medirAcertos(som, S.TAXA, { modelos: [m] });
  const so = medirAcertos(som, S.TAXA, { modelos: [m], janelas: [[30, 50]] });
  assert.ok(todos.some((c) => Math.abs(c.s - 10) < 0.05));
  assert.ok(!so.some((c) => Math.abs(c.s - 10) < 0.05));
  assert.ok(so.some((c) => Math.abs(c.s - 40) < 0.05));
});
