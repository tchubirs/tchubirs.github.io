'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { raizesRepetidas, normalizar } = require('../src/raiz');

// Os nomes aqui são INVENTADOS de propósito. O histórico que fez esta função
// nascer é de uma pessoa real, e nome + ano + SteamID de gente real não entra
// num repositório público — é a mesma razão por que `dados/nomes-*.json` está
// no .gitignore. O que se testa é o DESENHO: uma raiz debaixo de variações.

test('normalizar tira a moldura e deixa o miolo', () => {
  assert.equal(normalizar('[YT] Capitão Nave'), 'capitao nave');
  assert.equal(normalizar('C4pitaoTV'), 'capitao tv');       // leet + camelCase
  assert.equal(normalizar('c@pit40'), 'capitao');            // @ e 4 e 0
  assert.equal(normalizar('(BR) Xuryço'), 'xuryco');
  assert.equal(normalizar('  '), '');
});

// O caso dele, com outros nomes: a pessoa muda o prefixo do canal, troca uma
// letra por um número, junta um sufixo — e o miolo fica.
test('acha a raiz debaixo das variações', () => {
  const r = raizesRepetidas([
    'Capitao', 'C4pitaoTV', '[YT] Capitao Nave', '[BDM]capitao', 'Capitãozinho',
    'Melancia', 'jorge', 'Telefone', 'Samsung', 'Chicken', 'Monster', 'Owl',
  ].map((nome) => ({ nome })));
  assert.equal(r[0].raiz, 'capitao');
  assert.equal(r[0].quantos, 5);
  assert.ok(r[0].nomes.includes('C4pitaoTV'), 'o leet tem de entrar');
  assert.ok(r[0].nomes.includes('Capitãozinho'), 'o acento tem de entrar');
});

// Duas coincidências são coincidência. Com trezentos nomes, alguma parecença
// acontece sozinha — e a partir daí acusa-se inocente.
test('duas não fazem uma raiz', () => {
  const r = raizesRepetidas([
    'Capitao', 'CapitaoTV', 'Melancia', 'jorge', 'Telefone', 'Samsung',
  ].map((nome) => ({ nome })));
  assert.equal(r.length, 0);
});

// Uma raiz que cobre a lista INTEIRA não separa nada dentro da conta.
// (Metade, não: cinco variações em nove nomes é uma pessoa a assinar.)
test('raiz que está em todos os nomes não é assinatura', () => {
  const r = raizesRepetidas([
    'jogo um', 'jogo dois', 'jogo tres', 'jogo quatro', 'jogo cinco',
  ].map((nome) => ({ nome })));
  assert.ok(!r.some((x) => x.raiz === 'jogo'));
});

test('palavra de ligação não vira raiz', () => {
  const r = raizesRepetidas([
    'quero jogar', 'quero dormir', 'quero comer', 'Melancia', 'jorge', 'Owl',
  ].map((nome) => ({ nome })));
  assert.ok(!r.some((x) => x.raiz === 'quero'));
});

// O site corta nomes longos ("Nconsigo Responder Capit.."). Se o pedaço curto
// mandasse no rótulo, seria o defeito da fonte a escolher a palavra que ele lê.
test('a família fica com a palavra inteira, não com o pedaço cortado', () => {
  const r = raizesRepetidas([
    'Capitao', 'CapitaoTV', '[YT] Capitao Nave', '[BDM]capitao',
    'NconsigoResponder Capit',
    'Melancia', 'jorge', 'Telefone', 'Samsung', 'Chicken', 'Monster', 'Owl',
  ].map((nome) => ({ nome })));
  assert.equal(r[0].raiz, 'capitao', 'não pode ficar por "capit"');
  assert.ok(r[0].quantos >= 4);
});

// O mesmo nome usado dez vezes é um nome repetido — isso o outro sinal já mede.
// Uma raiz é sobre nomes DIFERENTES que partilham o miolo.
test('o mesmo nome repetido não inventa uma raiz sozinho', () => {
  const r = raizesRepetidas(Array.from({ length: 10 }, () => ({ nome: 'Capitao' }))
    .concat([{ nome: 'Melancia' }, { nome: 'jorge' }, { nome: 'Owl' }]));
  assert.equal(r.length, 0);
});

test('leva os anos da raiz consigo', () => {
  const r = raizesRepetidas([
    { nome: 'Capitao', em: '01 Jan 2015' },
    { nome: 'C4pitaoTV', em: '02 Feb 2020' },
    { nome: '[YT] Capitao Nave', em: '03 Mar 2026' },
    { nome: 'Melancia', em: '04 Apr 2021' }, { nome: 'jorge', em: '05 May 2021' },
    { nome: 'Owl', em: '06 Jun 2021' }, { nome: 'Milk', em: '07 Jul 2021' },
  ]);
  assert.deepEqual(r[0].anos, [2015, 2020, 2026]);
  assert.equal(r[0].alcance, 11);
});

test('lista vazia ou lixo não quebra', () => {
  assert.deepEqual(raizesRepetidas([]), []);
  assert.deepEqual(raizesRepetidas(null), []);
  assert.deepEqual(raizesRepetidas([{ nome: '' }, { nome: null }, {}]), []);
  assert.deepEqual(raizesRepetidas([{ nome: '...' }, { nome: '!!!' }, { nome: '123' }]), []);
});

// Riso repete-se por definição, o que faz dele o falso positivo perfeito para
// uma regra que procura repetição. Na primeira corrida a sério o topo da lista
// saiu "HIHIHIHIHI" — a mecânica funcionou e a conclusão era absurda.
test('riso e enchimento não viram identidade', () => {
  const r = raizesRepetidas([
    'HIHIHIHIHI', 'HIHIHHIHIHIHIHIHI', 'hihihihihihihihihihihihihi',
    'kkkkkkkkkk', 'kkkkkkkkkkkkkk', 'Kkkkkkkkkkkk',
    'Melancia', 'jorge', 'Owl', 'Milk', 'Monster', 'Telefone',
  ].map((nome) => ({ nome })));
  assert.deepEqual(r, [], 'nenhuma destas é o nome de ninguém');
});

// Mas um nome curto de verdade não pode cair na mesma rede.
test('nome curto repetido de propósito não é riso', () => {
  const { ehRisada } = require('../src/raiz');
  for (const n of ['lulu', 'coco', 'dodo', 'recruta', 'jorginho', 'senhor']) {
    assert.equal(ehRisada(n), false, n);
  }
  for (const n of ['hihihi', 'kkkk', 'hahahaha', 'rsrsrs', 'ololol']) {
    assert.equal(ehRisada(n), true, n);
  }
});
