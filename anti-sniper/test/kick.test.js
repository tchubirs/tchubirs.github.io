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
