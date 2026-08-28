'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ordenarPorIdentidade, nomesQueValem } = require('../src/nome-principal');

// A regra é dele: "o nome principal da pessoa é o que ela usa mais de uma
// vez e uns dos primeiros da conta".
const historia = [
  { nome: 'Tchubita', em: '2019' },          // o nome dela: cedo
  { nome: 'xX_dark_Xx', em: '2019' },
  { nome: 'Bloco2A', em: '2021' },
  { nome: 'ze polvinho', em: '2022' },
  { nome: 'Tchubita', em: '2024' },          // e VOLTOU
  { nome: 'messi messi messi', em: '2025' },
  { nome: 'Bloco2A', em: '2025' },           // repetiu, mas tarde e seguido
  { nome: 'Recruta', em: '2026' },
];

test('quem voltou ao nome anos depois fica em primeiro', () => {
  const r = ordenarPorIdentidade(historia);
  assert.equal(r[0].nome, 'Tchubita');
  assert.equal(r[0].voltou, true);
  assert.equal(r[0].vezes, 2);
  assert.deepEqual(r[0].anosUsados, [2019, 2024]);
  assert.match(r[0].porque.join(' '), /voltou a usar depois de 5 anos/);
});

// Repetir é sinal; VOLTAR é sinal mais forte. A diferença é o buraco:
// usar em 2024 e 2025 é continuidade, usar em 2019 e 2024 é regressar.
test('repetir em anos SEGUIDOS não é "voltar"', () => {
  const seguidos = [
    { nome: 'Fulano', em: '2020' }, { nome: 'Fulano', em: '2021' },
    { nome: 'outro', em: '2022' }, { nome: 'mais', em: '2023' },
  ];
  const f = ordenarPorIdentidade(seguidos).find((x) => x.nome === 'Fulano');
  assert.equal(f.repetiu, true);
  assert.equal(f.voltou, false, '2020 e 2021 é continuidade, não regresso');
});

test('e voltar depois de um buraco é o sinal mais forte', () => {
  const r = ordenarPorIdentidade(historia);
  const b = r.find((x) => x.nome === 'Bloco2A');
  assert.equal(b.voltou, true, '2021 e 2025 são quatro anos de buraco');
  // Mesmo assim fica atrás da Tchubita: ela voltou E está no começo.
  assert.ok(r.findIndex((x) => x.nome === 'Tchubita') < r.findIndex((x) => x.nome === 'Bloco2A'));
});

test('um nome usado uma vez só, tarde, fica no fim', () => {
  const r = ordenarPorIdentidade(historia);
  const ultimo = r[r.length - 1];
  assert.equal(ultimo.vezes, 1);
  assert.equal(ultimo.pontos, 0);
});

test('estar no começo da conta conta como sinal', () => {
  const r = ordenarPorIdentidade(historia);
  assert.equal(r.find((x) => x.nome === 'xX_dark_Xx').cedo, true);
  assert.equal(r.find((x) => x.nome === 'Recruta').cedo, false);
});

// Com 344 nomes, cruzar todos garante um falso positivo: com trezentos
// tiros, algum acerta por acaso.
test('escolhe os poucos que valem, em vez de cruzar os 344', () => {
  const muitos = [];
  for (let i = 0; i < 344; i++) muitos.push({ nome: `piada${i}`, em: '2025' });
  muitos.push({ nome: 'Tchubita', em: '2015' }, { nome: 'Tchubita', em: '2024' });
  const v = nomesQueValem(muitos);
  assert.ok(v.length <= 12);
  assert.equal(v[0].nome, 'Tchubita');
});

test('sem sinal nenhum, devolve o que há em vez de escolher a esmo', () => {
  const iguais = [{ nome: 'a', em: '2025' }, { nome: 'b', em: '2025' }, { nome: 'c', em: '2025' }];
  const v = nomesQueValem(iguais);
  assert.equal(v.length, 3);
});

test('lista vazia não quebra', () => {
  assert.deepEqual(ordenarPorIdentidade([]), []);
  assert.deepEqual(ordenarPorIdentidade(null), []);
});

// "Uns dos primeiros da conta" é POSIÇÃO, não período. Medi por ano antes,
// e numa conta real com os nomes amontoados em 2010-2011 marcou 7 de 10
// como "cedo" — o que não separa nada.
test('"cedo" é um punhado de nomes, não um terço da vida da conta', () => {
  const amontoados = [
    { nome: 'Bob', em: '2010' }, { nome: 'Brocephales', em: '2010' },
    { nome: 'Brobin', em: '2010' }, { nome: 'vipz', em: '2011' },
    { nome: 'tastee', em: '2011' }, { nome: 'Aeo', em: '2011' },
    { nome: 'Juggernaut', em: '2011' }, { nome: 'frase longa', em: '2015' },
    { nome: 'Robin', em: '2019' }, { nome: 'Sekiro', em: '2019' },
  ];
  const cedos = ordenarPorIdentidade(amontoados).filter((x) => x.cedo);
  assert.ok(cedos.length <= 2, `esperava um punhado, marcou ${cedos.length}`);
  assert.equal(cedos[0].nome, 'Bob');
});

// Sem linha do tempo não existe "primeiro": a ordem dentro de um ano é a
// que a fonte devolveu, e eleger um daí é escolher ao acaso.
test('todos no mesmo ano: ninguém é "o primeiro"', () => {
  const mesmoAno = [
    { nome: 'a', em: '2025' }, { nome: 'b', em: '2025' }, { nome: 'c', em: '2025' },
  ];
  const r = ordenarPorIdentidade(mesmoAno);
  assert.ok(r.every((x) => !x.cedo));
  assert.ok(r.every((x) => x.pontos === 0));
});
