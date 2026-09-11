'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { equipaDe } = require('../src/seguidores');

const MIN = 60000;
/** Fotografias da lista do servidor, uma a cada minuto. */
const fotos = (linhas) => linhas.map((nomes, i) => ({ ms: i * MIN, nomes }));

test('quem entra e sai sempre com o alvo e a equipa dele', () => {
  const f = fotos([
    ['Dehxter', 'Kappa', 'passante1'],
    ['Dehxter', 'Kappa', 'passante2'],
    ['Dehxter', 'Kappa'],
    ['Dehxter', 'Kappa', 'passante3'],
  ]);
  const { equipa, fotosDoAlvo } = equipaDe(f, 'Dehxter');
  assert.equal(fotosDoAlvo, 4);
  assert.deepEqual(equipa.map((x) => x.nome), ['Kappa']);
  assert.equal(equipa[0].juntos, 4);
  assert.equal(equipa[0].dele, 1);
  assert.equal(equipa[0].dela, 1);
});

// A conta que parece certa e está errada: "quem aparece mais ao lado dele".
// Num servidor grande, quem está online o dia todo aparece ao lado de toda a
// gente — a lista daria os jogadores mais viciados, não a equipa de ninguém.
test('quem vive no servidor nao entra na equipa de toda a gente', () => {
  const f = fotos([
    ['Vive', 'outro1'],
    ['Vive', 'outro2'],
    ['Vive', 'outro3'],
    ['Vive', 'outro4'],
    ['Vive', 'Alvo', 'Amigo'],
    ['Vive', 'Alvo', 'Amigo'],
    ['Vive', 'Alvo', 'Amigo'],
    ['Vive', 'outro5'],
    ['Vive', 'outro6'],
    ['Vive', 'outro7'],
  ]);
  const { equipa } = equipaDe(f, 'Alvo');
  const nomes = equipa.map((x) => x.nome);
  assert.ok(nomes.includes('Amigo'), 'o amigo verdadeiro tem de estar lá');
  assert.ok(!nomes.includes('Vive'),
    'quem está sempre online aparece ao lado de todos e nao e equipa de ninguem');
});

test('a fracao dos dois lados vem na resposta, para se poder discordar dela', () => {
  const f = fotos([
    ['Alvo', 'Meio'], ['Alvo', 'Meio'], ['Alvo', 'Meio'], ['Alvo'],
    ['Meio'], ['Meio'],
  ]);
  const { equipa } = equipaDe(f, 'Alvo', { minFraccao: 0.4, minJuntos: 2 });
  const m = equipa.find((x) => x.nome === 'Meio');
  assert.equal(m.juntos, 3);
  assert.equal(m.dele, 0.75, 'esteve em 3 das 4 fotos do alvo');
  assert.equal(m.dela, 0.6, 'mas o alvo so esteve em 3 das 5 fotos dele');
});

test('tres encontros e o minimo: dois e acaso', () => {
  const f = fotos([['Alvo', 'X'], ['Alvo', 'X'], ['Alvo'], ['Alvo']]);
  assert.deepEqual(equipaDe(f, 'Alvo').equipa, []);
});

test('o alvo nunca aparece na propria equipa', () => {
  const f = fotos([['Alvo', 'Par'], ['Alvo', 'Par'], ['Alvo', 'Par']]);
  const { equipa } = equipaDe(f, 'Alvo');
  assert.ok(!equipa.some((x) => x.nome === 'Alvo'));
});

test('maiusculas e minusculas sao a mesma pessoa', () => {
  const f = fotos([['DEHXTER', 'Par'], ['dehxter', 'Par'], ['Dehxter', 'Par']]);
  const { fotosDoAlvo, equipa } = equipaDe(f, 'Dehxter');
  assert.equal(fotosDoAlvo, 3);
  assert.equal(equipa[0].juntos, 3);
});

test('alvo que nunca la esteve da equipa vazia, e nao rebenta', () => {
  const f = fotos([['A', 'B'], ['A', 'B']]);
  const r = equipaDe(f, 'Ninguem');
  assert.equal(r.fotosDoAlvo, 0);
  assert.deepEqual(r.equipa, []);
  assert.deepEqual(equipaDe(null, 'x').equipa, []);
  assert.deepEqual(equipaDe([], 'x').equipa, []);
});

test('fotografias fora de ordem nao mudam a conta', () => {
  const certo = equipaDe(fotos([['A', 'B'], ['A', 'B'], ['A', 'B']]), 'A');
  const baralhado = equipaDe([
    { ms: 2 * MIN, nomes: ['A', 'B'] },
    { ms: 0, nomes: ['A', 'B'] },
    { ms: MIN, nomes: ['A', 'B'] },
  ], 'A');
  assert.deepEqual(baralhado.equipa, certo.equipa);
});
