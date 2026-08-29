'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { momento, ano, chaveDoDia } = require('../src/data');

// Três fontes, três maneiras de escrever o MESMO dia. Enquanto a data só
// existia como o texto do site, as três eram coisas diferentes — e o mesmo
// evento lido em dois sítios entrava duas vezes na conta.
test('o mesmo dia nas três fontes dá a mesma chave', () => {
  const chaves = ['08 May 2015', '08/05/2015, 05:52:04', 'May 8, 2015 @ 11:04pm']
    .map((em) => chaveDoDia({ em }));
  assert.equal(new Set(chaves).size, 1, `esperava uma chave só, vieram ${chaves}`);
  assert.equal(chaves[0], '20150508');
});

test('dias diferentes não colapsam', () => {
  assert.notEqual(chaveDoDia({ em: '08 May 2015' }), chaveDoDia({ em: '09 May 2015' }));
  assert.notEqual(chaveDoDia({ em: '08/05/2015' }), chaveDoDia({ em: '05/08/2015' }));
});

test('ordena como data e não como texto', () => {
  const ordenado = ['29 Oct 2016', '01 Jan 2016', '05 Jun 2016', '02 Mar 2015']
    .map((em) => ({ em })).sort((a, b) => momento(a) - momento(b)).map((o) => o.em);
  assert.deepEqual(ordenado, ['02 Mar 2015', '01 Jan 2016', '05 Jun 2016', '29 Oct 2016']);
});

test('os dois casos sem dia têm cada um o seu lugar', () => {
  assert.equal(momento({ em: null, secao: 'primeiro-nome' }), -Infinity);
  assert.equal(momento({ em: null }), Infinity, 'sem data é ignorância, não antiguidade');
  assert.equal(momento({ em: '2016' }), 20160000, 'só o ano fica no começo do ano');
  assert.equal(chaveDoDia({ em: null, secao: 'primeiro-nome' }), 'primeiro');
  assert.equal(chaveDoDia({ em: null }), 'sem-data');
});

test('ano continua a sair de qualquer formato', () => {
  assert.equal(ano({ em: '29 Oct 2016' }), 2016);
  assert.equal(ano({ em: '28/08/2026, 05:52:04' }), 2026);
  assert.equal(ano({ em: 'May 7, 2019 @ 11:04pm' }), 2019);
  assert.equal(ano({ em: 'sem data' }), null);
});

test('lixo não quebra nem inventa data', () => {
  for (const em of [null, undefined, '', '..', 'Unknown', '99/99/9999']) {
    assert.equal(Number.isFinite(momento({ em })), false, String(em));
  }
});
