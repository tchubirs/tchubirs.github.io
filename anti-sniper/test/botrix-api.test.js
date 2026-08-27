'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { placarPublico, normalizarPlacar, TETO_PUBLICO } = require('../src/stream/botrix-api');

// Resposta REAL do canal dele, capturada em 27/08/2026 de
// GET /api/public/leaderboard?platform=kick&user=tchubi
const REAL = [
  { level: 0, watchtime: 50, xp: 90, points: 5045, name: 'gabriel_uy_mvd', followage: -1 },
  { level: 9, watchtime: 4030, xp: 8330, points: 4815, name: 'hai_suzy', followage: { date: '2025-08-14 10:21:42.681000' } },
  { level: 6, watchtime: 3100, xp: 3790, points: 2965, name: 'joaoz1n23', followage: { date: '2025-08-14 10:21:42.681000' } },
];

test('lê a resposta real da BotRix', () => {
  const l = normalizarPlacar(REAL);
  assert.equal(l.length, 3);
  assert.deepEqual(l[1], { nome: 'hai_suzy', minutosAssistidos: 4030, pontos: 4815, nivel: 9 });
});

test('aceita envelope, não só array cru', () => {
  // A rota pública devolve array e a logada pode devolver envelope. Um
  // formato novo não pode derrubar a coleta em silêncio.
  for (const env of [{ data: REAL }, { users: REAL }, { leaderboard: REAL }]) {
    assert.equal(normalizarPlacar(env).length, 3);
  }
  assert.equal(normalizarPlacar({ qualquer: 'coisa' }), null, 'formato desconhecido é null, não lista vazia');
  assert.equal(normalizarPlacar(null), null);
});

test('linha sem nome é descartada, sem quebrar o resto', () => {
  const l = normalizarPlacar([null, { watchtime: 10 }, { name: '   ' }, ...REAL]);
  assert.equal(l.length, 3);
});

test('watchtime ausente vira null, nunca zero', () => {
  // Zero diria "assistiu nada"; null diz "não sei". Confundir os dois faria
  // o coletor achar que a pessoa nunca sobe.
  const l = normalizarPlacar([{ name: 'x', points: 5 }]);
  assert.equal(l[0].minutosAssistidos, null);
  assert.equal(l[0].pontos, 5);
});

test('aceita os nomes de campo alternativos', () => {
  const l = normalizarPlacar([{ username: 'a', watch_time: 90 }, { user: 'b', watchTime: 30 }]);
  assert.deepEqual(l.map((x) => [x.nome, x.minutosAssistidos]), [['a', 90], ['b', 30]]);
});

test('monta a URL certa e erro HTTP não vira lista vazia', async () => {
  let pedido = null;
  const ok = async (u) => { pedido = u; return { ok: true, json: async () => REAL }; };
  assert.equal((await placarPublico('tchubi', 'kick', ok)).length, 3);
  assert.equal(pedido, 'https://botrix.live/api/public/leaderboard?platform=kick&user=tchubi');

  // 404 tem que explodir: devolver [] seria dizer "ninguém assistiu".
  await assert.rejects(
    placarPublico('x', 'kick', async () => ({ ok: false, status: 404 })), /404/);
});

test('o teto de 20 está escrito no código, não escondido', () => {
  // Medido: limit, count, size, page, offset e top todos devolvem 20.
  // Quem usa isto precisa saber que é o topo da lista, não a lista.
  assert.equal(TETO_PUBLICO, 20);
});

test('{"error":true} com 200 é "não existe", não formato quebrado', async () => {
  // A BotRix responde assim quando o par plataforma+usuário não existe.
  // Tratar como quebra assustaria à toa e esconderia a causa real.
  const buscar = async () => ({ ok: true, json: async () => ({ error: true }) });
  await assert.rejects(placarPublico('tchubi', 'trovo', buscar),
    (e) => e.naoExiste === true && /trovo/.test(e.message));
});

test('lista vazia é lista vazia — canal existe, fidelidade sem dado', async () => {
  // Diferente de "não existe": aqui o canal está lá e não tem nada gravado.
  // Confundir os dois esconderia uma fidelidade desligada.
  const buscar = async () => ({ ok: true, json: async () => [] });
  assert.deepEqual(await placarPublico('tchubi', 'twitch', buscar), []);
});
