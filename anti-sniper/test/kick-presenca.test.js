'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assinarPresenca, autorizarPor, visitasDosEventos } = require('../src/stream/kick-presenca');

// "Tem que ser mais preciso, exatamente até os segundos se possível, sei que
// ele ficou 5 minutos no máximo." O tempo assistido da BotRix vem em blocos
// de ~10 min — uma visita de 5 minutos vira 0 ou vira 10. O canal de
// presença do Pusher entrega o instante exato de cada entrada e saída.

/** Um websocket de mentira que devolve o que a Kick devolveria. */
function fakeWS() {
  const enviados = [];
  let alvo = null;
  const ws = {
    send: (s) => enviados.push(JSON.parse(s)),
    close: () => { ws.fechado = true; },
    fechado: false,
  };
  const Cls = function () { alvo = ws; return ws; };
  return {
    Cls,
    enviados,
    recebe(evento, data, channel) {
      alvo.onmessage({ data: JSON.stringify({ event: evento, data: JSON.stringify(data), channel }) });
    },
    ws,
  };
}

function bancada({ autorizar, t = { v: 1000 } } = {}) {
  const f = fakeWS();
  const eventos = [];
  const erros = [];
  const s = assinarPresenca({
    chatroomId: 540838,
    autorizar: autorizar || (async () => ({ auth: 'k:sig', channel_data: '{}' })),
    aoEvento: (e) => eventos.push(e),
    aoErro: (e) => erros.push(e.message),
    WebSocket: f.Cls,
    agora: () => t.v,
  });
  return { s, f, eventos, erros, t };
}

const conectar = async (b) => {
  await b.s.abrir();
  b.f.recebe('pusher:connection_established', { socket_id: '123.456' });
  await new Promise((r) => setImmediate(r));
};

test('assina o canal de presença certo, com a credencial', async () => {
  const b = bancada();
  await conectar(b);
  const sub = b.f.enviados.find((x) => x.event === 'pusher:subscribe');
  assert.equal(sub.data.channel, 'presence-chatroom.540838');
  assert.equal(sub.data.auth, 'k:sig');
});

test('quem JÁ estava dentro não vira "entrou agora"', async () => {
  // Essa gente pode estar ali há horas. Marcar como entrada inventaria um
  // horário — o erro que ele já me pegou fazendo duas vezes.
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher_internal:subscription_succeeded',
    { presence: { hash: { 11: { username: 'dilanzito' }, 22: { username: 'hai_suzy' } } } });
  assert.deepEqual(b.eventos.filter((e) => e.tipo === 'ja-estava').map((e) => e.nome),
    ['dilanzito', 'hai_suzy']);
  assert.equal(b.eventos.some((e) => e.tipo === 'entrou'), false);
  assert.equal(b.eventos.at(-1).quantos, 2);
});

test('entrada e saída com o instante exato', async () => {
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher_internal:subscription_succeeded', { presence: { hash: {} } });

  b.t.v = Date.parse('2026-08-28T22:10:03Z');
  b.f.recebe('pusher_internal:member_added', { user_id: 99, user_info: { username: 'dilanzito' } });
  b.t.v = Date.parse('2026-08-28T22:14:41Z');
  b.f.recebe('pusher_internal:member_removed', { user_id: 99 });

  const v = visitasDosEventos(b.eventos);
  assert.equal(v.fechadas.length, 1);
  assert.equal(v.fechadas[0].nome, 'dilanzito');
  assert.equal(v.fechadas[0].segundos, 278, '4 min e 38 s — não 10, não 0');
  assert.equal(new Date(v.fechadas[0].de).toISOString(), '2026-08-28T22:10:03.000Z');
});

test('os 5 minutos que ele sabia: a fonte de blocos perderia', async () => {
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher_internal:subscription_succeeded', { presence: { hash: {} } });
  b.t.v = Date.parse('2026-08-28T23:00:00Z');
  b.f.recebe('pusher_internal:member_added', { user_id: 7, user_info: { username: 'x' } });
  b.t.v = Date.parse('2026-08-28T23:04:50Z');
  b.f.recebe('pusher_internal:member_removed', { user_id: 7 });
  const v = visitasDosEventos(b.eventos);
  assert.equal(v.fechadas[0].segundos, 290);
  assert.ok(v.fechadas[0].segundos < 600, 'menos que um bloco de 10 min da BotRix');
});

test('quem ainda está dentro NÃO ganha hora de saída', async () => {
  // Dizer uma hora de saída que não aconteceu é inventar dado — a falha
  // que ele apontou nas duas primeiras versões da tela.
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher_internal:subscription_succeeded', { presence: { hash: {} } });
  b.f.recebe('pusher_internal:member_added', { user_id: 5, user_info: { username: 'ficou' } });
  const v = visitasDosEventos(b.eventos);
  assert.equal(v.fechadas.length, 0);
  assert.deepEqual(v.abertas.map((x) => x.nome), ['ficou']);
  assert.equal(v.abertas[0].ate, undefined);
});

test('saída de quem eu nunca vi entrar é ignorada', async () => {
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher_internal:subscription_succeeded', { presence: { hash: {} } });
  b.f.recebe('pusher_internal:member_removed', { user_id: 404 });
  assert.deepEqual(visitasDosEventos(b.eventos).fechadas, []);
});

test('entrar e sair várias vezes vira várias linhas', async () => {
  // É literalmente o que ele pediu: "entrou 12:00 saiu 12:04, entrou de
  // novo 12:51 saiu 12:59".
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher_internal:subscription_succeeded', { presence: { hash: {} } });
  const base = Date.parse('2026-08-28T12:00:00Z');
  for (const [entra, sai] of [[0, 4], [51, 59]]) {
    b.t.v = base + entra * 60000;
    b.f.recebe('pusher_internal:member_added', { user_id: 1, user_info: { username: 'ele' } });
    b.t.v = base + sai * 60000;
    b.f.recebe('pusher_internal:member_removed', { user_id: 1 });
  }
  const v = visitasDosEventos(b.eventos);
  assert.equal(v.fechadas.length, 2);
  assert.deepEqual(v.fechadas.map((x) => x.segundos), [240, 480]);
});

test('sessão inválida vira mensagem clara, não silêncio', async () => {
  const b = bancada({ autorizar: async () => { const e = new Error('não está logado na Kick (401)'); throw e; } });
  await conectar(b);
  assert.match(b.erros[0], /autorização recusada.*não está logado/);
  assert.equal(b.f.enviados.some((x) => x.event === 'pusher:subscribe'), false);
});

test('recusa do Pusher é reportada com o motivo', async () => {
  const b = bancada();
  await conectar(b);
  b.f.recebe('pusher:error', { message: 'Auth info required to subscribe' });
  assert.match(b.erros[0], /Auth info required/);
});

test('autorizarPor manda socket_id e canal, e traduz o 401', async () => {
  const pedidos = [];
  const ok = autorizarPor(async (u, op) => {
    pedidos.push({ u, corpo: JSON.parse(op.body) });
    return { ok: true, json: async () => ({ auth: 'a', channel_data: 'c' }) };
  });
  assert.deepEqual(await ok('1.2', 'presence-chatroom.9'), { auth: 'a', channel_data: 'c' });
  assert.equal(pedidos[0].u, 'https://kick.com/broadcasting/auth');
  assert.deepEqual(pedidos[0].corpo, { socket_id: '1.2', channel_name: 'presence-chatroom.9' });

  const ruim = autorizarPor(async () => ({ ok: false, status: 401 }));
  await assert.rejects(ruim('1', 'x'), /não está logado na Kick/);
});

test('fechar de verdade fecha, e não reclama de queda', async () => {
  const b = bancada();
  await conectar(b);
  b.s.fechar();
  assert.equal(b.f.ws.fechado, true);
  b.f.ws.onclose?.();
  assert.equal(b.erros.length, 0, 'queda pedida não é erro');
});
