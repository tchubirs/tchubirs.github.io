'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const k = require('../src/stream/kick');

const T = Date.parse('2026-08-27T21:00:00Z');
const MIN = 60000;
const msg = (nome, id) => ['chat.message', { sender: { username: nome, user_id: id } }];

test('pedimos o mínimo — 2 escopos, e nenhum toca em dado pessoal', () => {
  assert.deepEqual(k.ESCOPOS, ['events:subscribe', 'channel:read']);
  // user:read é o que dá acesso ao e-mail. Nunca deve entrar aqui.
  assert.ok(!k.ESCOPOS.includes('user:read'));
  assert.ok(!k.ESCOPOS.some((e) => e.startsWith('moderation')));
});

test('PKCE gera verificador e desafio diferentes a cada vez', () => {
  const a = k.gerarPkce(); const b = k.gerarPkce();
  assert.notEqual(a.verificador, b.verificador);
  assert.notEqual(a.desafio, a.verificador, 'o desafio é o hash, não a chave');
  assert.equal(a.desafio.length, 43, 'sha256 em base64url');
});

test('a url de autorização leva tudo que a Kick exige', () => {
  const { desafio } = k.gerarPkce();
  const u = new URL(k.urlDeAutorizacao({
    clientId: 'ID', redirectUri: 'http://localhost:8790/ok', desafio, estado: 'xyz',
  }));
  assert.equal(u.origin + u.pathname, 'https://id.kick.com/oauth/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), desafio);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('state'), 'xyz');
  assert.equal(u.searchParams.get('scope'), k.ESCOPOS.join(' '));
});

test('falta de parâmetro falha antes de mandar o usuário para a Kick', () => {
  assert.throws(() => k.urlDeAutorizacao({ clientId: 'ID' }), /obrigatórios/);
});

test('sem estado, gera um — senão a troca fica sujeita a CSRF', () => {
  const { desafio } = k.gerarPkce();
  const u = new URL(k.urlDeAutorizacao({ clientId: 'ID', redirectUri: 'http://x/y', desafio }));
  assert.ok((u.searchParams.get('state') ?? '').length >= 16);
});

test('quem escreve o tempo todo é creditado pelo tempo presente', () => {
  const g = new k.Gravador();               // blocos de 10 min
  for (let i = 0; i <= 49; i++) g.ingerir(...msg('falante', 1), T + i * MIN);
  const a = g.audiencia();
  // presente por 49 min: são 5 blocos (o inicial + 4 completos)
  assert.equal(a[0].minutosAssistidos, 50, `veio ${a[0].minutosAssistidos}`);
});

test('quem fala duas vezes distantes não ganha o intervalo inteiro', () => {
  const g = new k.Gravador();
  g.ingerir(...msg('calado', 2), T);
  g.ingerir(...msg('calado', 2), T + 95 * MIN);
  assert.equal(g.audiencia()[0].minutosAssistidos, 100);
});

test('rajada de mensagens no mesmo minuto não infla nada', () => {
  const g = new k.Gravador();
  for (let i = 0; i < 400; i++) g.ingerir(...msg('spam', 3), T + i * 100);
  assert.equal(g.audiencia()[0].minutosAssistidos, 10, 'só o bloco inicial');
});

test('nome sem sensibilidade a maiúscula é a mesma pessoa', () => {
  const g = new k.Gravador();
  g.ingerir(...msg('Fulano', 1), T);
  g.ingerir(...msg('fulano', 1), T + 20 * MIN);
  assert.equal(g.audiencia().length, 1);
});

test('evento que não é chat é ignorado', () => {
  const g = new k.Gravador();
  g.ingerir('channel.followed', { follower: { username: 'x' } }, T);
  g.ingerir('chat.message', {}, T);
  assert.deepEqual(g.audiencia(), []);
});

test('a audiência sai na mesma forma que a do BotRix', () => {
  const g = new k.Gravador();
  g.ingerir(...msg('alguem', 9), T);
  const a = g.audiencia()[0];
  // consulta.js não pode precisar saber de onde veio
  for (const campo of ['nome', 'id', 'minutosAssistidos']) {
    assert.ok(campo in a, `falta ${campo}`);
  }
});

test('sai ordenado por tempo, maior primeiro', () => {
  const g = new k.Gravador();
  g.ingerir(...msg('pouco', 1), T);
  g.ingerir(...msg('muito', 2), T);
  g.ingerir(...msg('muito', 2), T + 60 * MIN);
  assert.equal(g.audiencia()[0].nome, 'muito');
});

const canal = (over = {}) => ({ ok: true, status: 200, json: async () => ({
  data: [{
    broadcaster_user_id: 557419, slug: 'tchubi',
    stream: { is_live: true, start_time: '2026-08-27T10:07:55Z', viewer_count: 1084 },
    category: { name: 'Rust' }, active_subscribers_count: 1, ...over,
  }],
}) });

test('estado do canal traz a âncora de quando a live começou', async () => {
  const e = await k.estadoDoCanal('tchubi', { token: 'x', buscar: async () => canal() });
  assert.equal(e.aoVivo, true);
  assert.equal(e.inicioMs, Date.parse('2026-08-27T10:07:55Z'));
  assert.equal(e.espectadores, 1084);
  assert.equal(e.categoria, 'Rust');
  assert.equal(e.canalId, 557419);
});

test('canal offline: a Kick devolve o ano 0001 e isso NÃO pode virar data', async () => {
  // Sem este tratamento o sistema diria "ao vivo há 2 milhões de horas"
  // e o sinal de "entrou logo depois" dispararia para todo mundo.
  const e = await k.estadoDoCanal('tchubi', {
    token: 'x',
    buscar: async () => canal({
      stream: { is_live: false, start_time: '0001-01-01T00:00:00Z', viewer_count: 0 },
    }),
  });
  assert.equal(e.aoVivo, false);
  assert.equal(e.inicioMs, null);
});

test('canal inexistente falha com o slug no erro', async () => {
  const vazio = { ok: true, status: 200, json: async () => ({ data: [] }) };
  await assert.rejects(
    () => k.estadoDoCanal('naoexiste', { token: 'x', buscar: async () => vazio }),
    /naoexiste/,
  );
});

test('erro da Kick vira erro com status, não estado falso', async () => {
  const ruim = { ok: false, status: 401, json: async () => ({}) };
  await assert.rejects(
    () => k.estadoDoCanal('tchubi', { token: 'x', buscar: async () => ruim }),
    /401/,
  );
});

test('token de aplicação usa client_credentials, sem usuário', async () => {
  let corpo = null;
  const b = async (_u, op) => { corpo = op.body; return { ok: true, json: async () => ({ access_token: 'T', expires_in: 5184000 }) }; };
  const t = await k.tokenDeAplicacao({ clientId: 'ID', clientSecret: 'S' }, b);
  assert.equal(t.access_token, 'T');
  assert.match(corpo, /grant_type=client_credentials/);
  // não pode haver code nem redirect: isto não representa nenhum usuário
  assert.doesNotMatch(corpo, /code|redirect/);
});

test('falha de token não devolve token vazio', async () => {
  const b = async () => ({ ok: false, status: 400, json: async () => ({}) });
  await assert.rejects(() => k.tokenDeAplicacao({ clientId: 'ID', clientSecret: 'S' }, b), /400/);
});
