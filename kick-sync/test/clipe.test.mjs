// As contas de um clipe, sem interface nenhuma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAXIMO_S, mover, janelaInicial, nomeDoClipe, posicaoDaCabeca } from '../site/clipe.js';

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

// A cabeça é a barra branca que diz ONDE ESTÁ O VÍDEO. Ele apanhou-a fora do
// pedaço escolhido — "essa barra branca aí de onde está o vídeo fica fora das
// barras verdes" — e é uma mentira sobre a única coisa que ela tem para dizer.
const VISTA = { vista: { inicio: T - s(150), fim: T + s(150) } };

test('a cabeca fica onde o video esta, em percentagem da vista', () => {
  const c = { deMs: T - s(15), ateMs: T + s(15), ...VISTA };
  const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} devia ser ${b}`);
  perto(posicaoDaCabeca(c, T), 50);
  perto(posicaoDaCabeca(c, T - s(15)), 45);
  perto(posicaoDaCabeca(c, T + s(15)), 55);
});

test('a cabeca nunca sai do pedaco escolhido', () => {
  // O caso dele: um pedaço largo, e o relógio do vídeo a contar a partir de um
  // salto que ainda não tinha assentado — a conta dava um instante ANTES do
  // início, e a barra branca aparecia à esquerda do verde.
  const c = { deMs: T - s(52), ateMs: T + s(52), ...VISTA };
  assert.equal(posicaoDaCabeca(c, T - s(130)), posicaoDaCabeca(c, c.deMs),
    'atras do inicio, encosta ao inicio');
  assert.equal(posicaoDaCabeca(c, T + s(900)), posicaoDaCabeca(c, c.ateMs),
    'a frente do fim, encosta ao fim');
  for (const ms of [T - s(300), T - s(53), T, T + s(53), T + s(1e4)]) {
    const p = posicaoDaCabeca(c, ms);
    assert.ok(p >= posicaoDaCabeca(c, c.deMs) - 1e-9 && p <= posicaoDaCabeca(c, c.ateMs) + 1e-9,
      `${ms - T}s deu ${p}%, e o verde vai de ${posicaoDaCabeca(c, c.deMs)}% a ${posicaoDaCabeca(c, c.ateMs)}%`);
  }
});

test('uma vista sem largura nao rebenta a conta', () => {
  const c = { deMs: T, ateMs: T, vista: { inicio: T, fim: T } };
  assert.equal(Number.isFinite(posicaoDaCabeca(c, T)), true);
});
