// O merge de POVs por canal (simples.js → povsDo): a morte fica como opção, e o desvio de áudio MEDIDO de outra
// entrada do mesmo canal não se perde. Testado puro, sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundirPovsPorCanal } from '../site/simples-lista.js';

test('fundir por canal: fica a morte (relação e pessoa), mas o desvioS medido do som não se perde', () => {
  const r = fundirPovsPorCanal([
    { tipo: 'morte', canal: 'ana', pessoa: 'Ana', relacao: 'matou' },
    { tipo: 'som', canal: 'ana', pessoa: 'Ana (som)', desvioS: 1.25 },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'morte');
  assert.equal(r[0].relacao, 'matou');
  assert.equal(r[0].pessoa, 'Ana');
  assert.equal(r[0].desvioS, 1.25);
});

test('fundir: o desvio da própria morte (finito) prevalece; desvio não finito não apaga nada', () => {
  const r = fundirPovsPorCanal([
    { tipo: 'morte', canal: 'ana', desvioS: 0.5 },
    { tipo: 'som', canal: 'ana', desvioS: 3 },
    { tipo: 'som', canal: 'bia', desvioS: NaN },
    { tipo: 'morte', canal: 'bia' },
  ]);
  assert.equal(r.find((p) => p.canal === 'ana').desvioS, 0.5);
  assert.equal(Number.isFinite(r.find((p) => p.canal === 'bia').desvioS), false, 'NaN nao vira medida');
  assert.equal(r.length, 2);
});

test('fundir: entrada sem canal sai, e a lista de entrada não é alterada', () => {
  const entrada = [{ tipo: 'som', desvioS: 2 }, { tipo: 'som', canal: 'ana', desvioS: 1 }];
  const copia = JSON.stringify(entrada);
  assert.deepEqual(fundirPovsPorCanal(entrada).map((p) => p.canal), ['ana']);
  assert.equal(JSON.stringify(entrada), copia);
  assert.deepEqual(fundirPovsPorCanal(null), []);
});
