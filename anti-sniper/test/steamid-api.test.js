'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { perfil } = require('../src/steamid-api');

// A resposta REAL da API, com a chave dele e o Silver activo, em 29/08/2026.
// Os campos vêm todos como TEXTO — e é isso que torna o "0" perigoso.
const RESPOSTA = {
  auth: { auth: 'ok', patreon: '1', daily_count: '18', daily_limit: '1000' },
  profile: { steamid64: '76561198155380495' },
  steamid_data: {
    steamid_optout: '0',
    name_history_count: '343',
    url_changes: '6',
    friend_history_count: '756',
    vac_banned_friends: '18',
  },
  name_history_count_year: [
    { year: '1970', count: '1' }, { year: '2015', count: '7' },
    { year: '2016', count: '30' }, { year: '2026', count: '18' },
  ],
};

const falso = (corpo) => async () => ({ json: async () => corpo });

test('lê o total e a contagem por ano', async () => {
  const p = await perfil('76561198155380495', {
    chave: 'x', meuId: 'y', buscar: falso(RESPOSTA),
  });
  assert.equal(p.total, 343);
  assert.equal(typeof p.total, 'number', 'a API manda texto; aqui tem de ser número');
  assert.equal(p.plano, 'silver');
  assert.equal(p.restam, 982);
  assert.deepEqual(p.porAno.find((a) => a.ano === '2016'), { ano: '2016', quantos: 30 });
});

// Este é o teste que importa. A API escreve `"0"` — e `"0"` é VERDADEIRO em
// JavaScript. Deixar assim faria uma conta visível passar por invisível e, o
// que é pior, o contrário: `"1"` e `"0"` são ambos verdadeiros.
test('optout "0" é falso e "1" é verdadeiro — não o contrário', async () => {
  const visivel = await perfil('1', { chave: 'x', meuId: 'y', buscar: falso(RESPOSTA) });
  assert.equal(visivel.optout, false);

  const escondida = JSON.parse(JSON.stringify(RESPOSTA));
  escondida.steamid_data.steamid_optout = '1';
  const p = await perfil('1', { chave: 'x', meuId: 'y', buscar: falso(escondida) });
  assert.equal(p.optout, true);
});

// `myid` é o dono da chave, não o alvo. Trocar os dois devolve errorid 3 — e
// foi a ler esse erro como "a API não tem os nomes" que eu escrevi uma
// suposição no código durante semanas.
test('erro da API devolve null — que é "não perguntei", não "não existe"', async () => {
  const erro = { error: { message: 'Error validating API key , myid…', errorid: '3' } };
  assert.equal(await perfil('1', { chave: 'x', meuId: 'y', buscar: falso(erro) }), null);

  const semAuth = { auth: { auth: 'fail' }, steamid_data: { name_history_count: '99' } };
  assert.equal(await perfil('1', { chave: 'x', meuId: 'y', buscar: falso(semAuth) }), null);
});

test('sem chave ou sem myid nem chega a perguntar', async () => {
  const nunca = async () => { throw new Error('não devia ter perguntado'); };
  assert.equal(await perfil('1', { chave: '', meuId: 'y', buscar: nunca }), null);
  assert.equal(await perfil('1', { chave: 'x', meuId: '', buscar: nunca }), null);
  assert.equal(await perfil('', { chave: 'x', meuId: 'y', buscar: nunca }), null);
});

test('rede em baixo não derruba o comando', async () => {
  const morre = async () => { throw new Error('ECONNRESET'); };
  assert.equal(await perfil('1', { chave: 'x', meuId: 'y', buscar: morre }), null);
});
