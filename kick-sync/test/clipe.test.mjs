// As contas de um clipe, sem interface nenhuma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAXIMO_S, mover, janelaInicial, nomeDoClipe } from '../site/clipe.js';

const T = Date.parse('2026-08-30T22:00:00.000Z');
const s = (n) => n * 1000;

test('arrastar o inicio para tras alarga o clipe', () => {
  const r = mover({ deMs: T, ateMs: T + s(10) }, 'de', T - s(5));
  assert.equal(r.deMs, T - s(5));
  assert.equal(r.ateMs, T + s(10));
});

test('o fim nunca passa para tras do inicio', () => {
  const r = mover({ deMs: T, ateMs: T + s(10) }, 'ate', T - s(30));
  assert.ok(r.ateMs > r.deMs, 'um clipe ao contrario nao e um clipe');
  assert.equal((r.ateMs - r.deMs) / 1000, 1, 'fica no minimo');
});

test('o inicio nunca passa para a frente do fim', () => {
  const r = mover({ deMs: T, ateMs: T + s(10) }, 'de', T + s(30));
  assert.ok(r.ateMs > r.deMs);
  assert.equal((r.ateMs - r.deMs) / 1000, 1);
});

// Quem arrasta uma pega espera que ELA va para onde a levaram — por isso e a
// outra que cede quando o limite chega.
test('passar dos 180 s empurra a outra pega, e nao a que se esta a arrastar', () => {
  const r = mover({ deMs: T, ateMs: T + s(10) }, 'ate', T + s(400));
  assert.equal(r.ateMs, T + s(400), 'a pega arrastada vai onde foi levada');
  assert.equal((r.ateMs - r.deMs) / 1000, MAXIMO_S, 'e o clipe fica nos 180');

  const e = mover({ deMs: T, ateMs: T + s(10) }, 'de', T - s(400));
  assert.equal(e.deMs, T - s(400));
  assert.equal((e.ateMs - e.deMs) / 1000, MAXIMO_S);
});

test('nao se sai do video, mesmo puxando com forca', () => {
  const limites = { inicio: T - s(20), fim: T + s(20) };
  const r = mover({ deMs: T, ateMs: T + s(5) }, 'de', T - s(9999), { limites });
  assert.equal(r.deMs, limites.inicio);
  const f = mover({ deMs: T, ateMs: T + s(5) }, 'ate', T + s(9999), { limites });
  assert.equal(f.ateMs, limites.fim);
});

test('a janela inicial fica a volta do instante e dentro do video', () => {
  const j = janelaInicial(T, { antesS: 15, depoisS: 15 });
  assert.equal(j.deMs, T - s(15));
  assert.equal(j.ateMs, T + s(15));

  const curto = janelaInicial(T, { antesS: 15, depoisS: 15, limites: { inicio: T - s(3), fim: T + s(4) } });
  assert.equal(curto.deMs, T - s(3));
  assert.equal(curto.ateMs, T + s(4));
});

test('o titulo vira um nome de ficheiro que aguenta qualquer sistema', () => {
  const n = nomeDoClipe({ titulo: 'Tríplo kill: na ponte / 2x', canal: 'tchubi', quandoMs: T });
  assert.match(n, /^Triplo-kill-na-ponte-2x__tchubi__20260830-220000Z\.ts$/);
});

test('sem titulo o nome continua a dizer o canal e o instante', () => {
  assert.match(nomeDoClipe({ titulo: '', canal: 'tchubi', quandoMs: T }), /^tchubi__20260830-220000Z\.ts$/);
  assert.match(nomeDoClipe({ titulo: '🔥🔥', canal: 'x', quandoMs: T }), /^x__2026/);
});

test('um titulo enorme nao faz um nome enorme', () => {
  const n = nomeDoClipe({ titulo: 'a'.repeat(500), canal: 'x', quandoMs: T });
  assert.ok(n.length < 100, `${n.length} caracteres`);
});
