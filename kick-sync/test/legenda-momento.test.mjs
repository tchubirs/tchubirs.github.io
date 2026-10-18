// Legenda no "Baixar para TikTok" da tela Momentos: as falas do juiz (eventos/<evento>-momentos/falas.json, em ms
// desde o inicioMs) viram a transcrição do editor (legenda.js), com o tempo de cada fala repartido pelas palavras.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcricaoDasFalas } from '../site/momento-baixar.js';

const T = Date.parse('2026-10-16T22:00:00Z');

test('legenda do momento: cada palavra leva um pedaço da fala do tamanho das letras, no relógio da noite', () => {
  const tr = transcricaoDasFalas([[-2000, -1000, 'uno en grúa'], [1000, 3000, 'ab abcdef']], { canal: 'kodd', inicioMs: T, fimMs: T + 30_000 });
  assert.equal(tr.linhas.length, 2);
  const [a, b] = tr.linhas;
  assert.deepEqual(a.palavras.map((p) => p.t), ['uno', 'en', 'grúa']);
  assert.equal(a.palavras[0].de, T - 2000);
  assert.equal(a.palavras.at(-1).ate, T - 1000);
  assert.deepEqual(b.palavras.map((p) => [p.de - T, p.ate - T]), [[1000, 1500], [1500, 3000]]);
  assert.ok(tr.deMs <= T - 2000 && tr.ateMs >= T + 30_000);
});

test('legenda do momento: fala vazia ou de tempo trocado não entra; sem falas não há linhas', () => {
  const tr = transcricaoDasFalas([[0, 1000, '   '], [2000, 1000, 'trocado'], [3000, 3500, 'ok']], { inicioMs: T, fimMs: T + 10_000 });
  assert.deepEqual(tr.linhas.map((l) => l.palavras.map((p) => p.t).join(' ')), ['ok']);
  assert.equal(transcricaoDasFalas(undefined, { inicioMs: T, fimMs: T + 10_000 }).linhas.length, 0);
});
