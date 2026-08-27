'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const L = require('../agente/ler-pagina');

const doc = (html) => parseHTML(`<html><body>${html}</body></html>`).document;

/** HTML no formato que a página de servidor do BattleMetrics entrega. */
const TABELA = `<table><thead><tr><th>Name</th><th>Play time</th></tr></thead><tbody>
<tr><td><a href="/players/1">FINIK</a></td><td>04:35</td></tr>
<tr><td><a href="/players/2">D1per</a></td><td>03:47</td></tr>
<tr><td><a href="/players/3">MF | Dr | Merfy</a></td><td>03:22</td></tr>
<tr><td><a href="/players/4">Опасный Поцык</a></td><td>02:44</td></tr>
</tbody></table>`;

test('lê a lista de jogadores com os tempos certos', () => {
  const j = L.lerJogadores(doc(TABELA));
  assert.equal(j.length, 4);
  assert.equal(j[0].nome, 'FINIK');
  assert.equal(j[0].minutosNoServidor, 275);
  assert.equal(j[3].nome, 'Опасный Поцык');
});

test('acha a tabela por cabeçalho mesmo com outras tabelas na página', () => {
  const pagina = `<table><thead><tr><th>Rank</th><th>Score</th></tr></thead>
    <tbody><tr><td>1</td><td>99</td></tr></tbody></table>${TABELA}`;
  assert.equal(L.lerJogadores(doc(pagina)).length, 4);
});

test('página sem a tabela devolve null em vez de lista vazia', () => {
  // null e [] são coisas diferentes: um é "não achei a tabela", o outro é
  // "achei e o servidor está vazio". Confundir vira falso silêncio.
  assert.equal(L.lerJogadores(doc('<p>nada</p>')), null);
});

test('acha o servidor ATUAL e ignora o histórico', () => {
  const perfil = `<table><tbody>
    <tr><td>Online</td><td><a href="/servers/rust/36365112">Rust BR Vanilla</a></td></tr>
    <tr><td>Offline</td><td><a href="/servers/rust/111">Servidor Antigo</a></td></tr>
  </tbody></table>`;
  const r = L.lerServidorAtual(doc(perfil));
  assert.equal(r.servidorId, '36365112');
  assert.equal(r.jogo, 'rust');
});

test('jogador fora de qualquer servidor devolve null', () => {
  const perfil = `<table><tbody>
    <tr><td>Offline</td><td><a href="/servers/rust/111">Servidor Antigo</a></td></tr>
  </tbody></table>`;
  assert.equal(L.lerServidorAtual(doc(perfil)), null);
});

test('converte os dois formatos de tempo', () => {
  assert.equal(L.paraMinutos('04:35'), 275);
  assert.equal(L.paraMinutos('2d 19h 10min'), 4030);
  assert.equal(L.paraMinutos('lixo'), null);
});
