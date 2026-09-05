// A ordem dos quadrados. Sem DOM, porque é onde os enganos moram: um nome
// repetido, um vazio, um que já não está na caixa, e as maiúsculas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordemDosAngulos, aplicarOrdem, ORDENS } from '../site/grelha.js';

const linhas = (...s) => s.map((slug) => ({ slug }));

test('por ordem de adição, e não pela ordem em que a Kick os devolveu', () => {
  const escritos = ['tchubi', 'ctapp', 'kodd'];
  assert.deepEqual(
    ordemDosAngulos(linhas('kodd', 'tchubi', 'ctapp'), 'adicionado', escritos),
    ['tchubi', 'ctapp', 'kodd'],
  );
});

test('quem já não está na caixa vai para o fim, e não para o princípio', () => {
  // Um `indexOf` de -1 punha-o em primeiro, que é o contrário do que se quer.
  assert.deepEqual(
    ordemDosAngulos(linhas('fantasma', 'tchubi'), 'adicionado', ['tchubi']),
    ['tchubi', 'fantasma'],
  );
});

test('alfabética ignora maiúsculas', () => {
  // Com um `<` seco, "Xlibano" vinha antes de "ay_zarite" porque as maiúsculas
  // são menores em código — e uma lista alfabética fora de ordem alfabética é
  // pior do que não ter ordem nenhuma.
  assert.deepEqual(
    ordemDosAngulos(linhas('Xlibano', 'ay_zarite', 'Kodd'), 'az'),
    ['ay_zarite', 'Kodd', 'Xlibano'],
  );
});

test('alfabética põe os números por valor e não por letra', () => {
  assert.deepEqual(ordemDosAngulos(linhas('c10', 'c9', 'c2'), 'az'), ['c2', 'c9', 'c10']);
});

test('um nome repetido não ganha dois lugares', () => {
  assert.deepEqual(ordemDosAngulos(linhas('a', 'b', 'a'), 'az'), ['a', 'b']);
  assert.deepEqual(ordemDosAngulos(linhas('a', 'b', 'a'), 'adicionado', ['b', 'a']), ['b', 'a']);
});

test('linhas sem slug são deitadas fora em vez de rebentarem', () => {
  assert.deepEqual(ordemDosAngulos([{ slug: 'a' }, {}, null, { slug: '' }], 'az'), ['a']);
  assert.deepEqual(ordemDosAngulos([], 'az'), []);
});

test('um modo desconhecido cai na ordem de adição, e não em nada', () => {
  assert.deepEqual(ordemDosAngulos(linhas('b', 'a'), 'seila', ['a', 'b']), ['a', 'b']);
  assert.deepEqual(ORDENS, ['adicionado', 'az']);
});

// ── aplicar ─────────────────────────────────────────────────────────────────
// `style.order` e não `appendChild`: mover um `<video>` a tocar interrompe-o.

const tile = (slug) => ({ dataset: { slug }, style: { order: '' } });

test('põe cada quadrado no seu lugar pelo CSS', () => {
  const t = [tile('c'), tile('a'), tile('b')];
  assert.equal(aplicarOrdem(t, ['a', 'b', 'c']), 3);
  assert.deepEqual(t.map((x) => x.style.order), ['2', '0', '1']);
});

test('não mexe no que já está certo', () => {
  // Escrever `style.order` com o mesmo valor não é grave, mas contar quantos
  // mudaram é como se prova que uma reordenação não tocou em nada.
  const t = [tile('a'), tile('b')];
  aplicarOrdem(t, ['a', 'b']);
  assert.equal(aplicarOrdem(t, ['a', 'b']), 0);
});

test('um quadrado fora da lista vai para o fim', () => {
  const t = [tile('desconhecido'), tile('a')];
  aplicarOrdem(t, ['a']);
  assert.deepEqual(t.map((x) => x.style.order), ['1', '0']);
});
