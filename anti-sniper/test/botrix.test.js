'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paraMinutos, lerTabela } = require('../src/stream/botrix');

/** Linhas exatamente como o painel do BotRix as produz. */
const TABELA = `1	hai_suzy	9	4815	2d 19h 10min
2	kaueznn7	7	2635	2d 4h 30min
8	0nev1sk	4	820	13h 40min
10	VITINHOVRAAL1577	4	865	15h 10min`;

test('converte todas as formas de tempo do painel', () => {
  assert.equal(paraMinutos('2d 19h 10min'), 2 * 1440 + 19 * 60 + 10);
  assert.equal(paraMinutos('13h 40min'), 820);
  assert.equal(paraMinutos('45min'), 45);
  assert.equal(paraMinutos('1d'), 1440);
  assert.equal(paraMinutos('3h'), 180);
});

test('texto sem tempo devolve null, não zero', () => {
  // zero diria "assistiu nada"; null diz "isto não é um tempo"
  for (const v of ['', 'abc', '4815', null, undefined, 42]) {
    assert.equal(paraMinutos(v), null, `falhou em ${JSON.stringify(v)}`);
  }
});

test('lê a tabela colada com tabulação', () => {
  const a = lerTabela(TABELA);
  assert.equal(a.length, 4);
  assert.equal(a[0].nome, 'hai_suzy');
  assert.equal(a[0].minutosAssistidos, 4030);
  assert.equal(a[0].pontos, 4815);
  assert.equal(a[0].nivel, 9);
});

test('lê também quando a colagem vem com espaços em vez de tabulação', () => {
  const a = lerTabela(TABELA.replace(/\t/g, '    '));
  assert.equal(a.length, 4);
  assert.equal(a[0].nome, 'hai_suzy');
});

test('lê quando cada célula cai numa linha própria', () => {
  const a = lerTabela(TABELA.replace(/\t/g, '\n'));
  assert.equal(a.length, 4);
});

test('sai ordenado por tempo assistido, maior primeiro', () => {
  const a = lerTabela(TABELA);
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i - 1].minutosAssistidos >= a[i].minutosAssistidos);
  }
});

test('não inventa espectador chamado por um número', () => {
  // linha torta na colagem não pode virar um usuário "7"
  const a = lerTabela('7\t4\t1630\t1d 5h 15min\n8\t9\t820\t13h 40min');
  for (const x of a) assert.doesNotMatch(x.nome, /^\d+$/);
});

test('nome repetido entra uma vez só', () => {
  const a = lerTabela(`${TABELA}\n5	hai_suzy	9	4815	2d 19h 10min`);
  assert.equal(a.filter((x) => x.nome === 'hai_suzy').length, 1);
});

test('texto vazio ou lixo devolve lista vazia sem explodir', () => {
  for (const v of ['', 'nada aqui', null, undefined, 42]) {
    assert.deepEqual(lerTabela(v), []);
  }
});

test('cabeçalho do painel não vira espectador', () => {
  const a = lerTabela(`Posição	Nome	Nível	Pontos	Tempo de visualização\n${TABELA}`);
  assert.equal(a.length, 4);
  assert.ok(!a.some((x) => /Tempo|Nome|Posi/i.test(x.nome)));
});
