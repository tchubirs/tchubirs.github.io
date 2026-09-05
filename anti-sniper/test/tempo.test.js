'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interpretarQuando, relogio, deslocamento } = require('../src/tempo');

// 27/08/2026 23:10 UTC = 01:10 do dia 28 em Paris (horário de verão, UTC+2)
const AGORA = Date.parse('2026-08-27T23:10:00Z');
const P = 'Europe/Paris';

test('não perguntar horário não é erro', () => {
  assert.equal(interpretarQuando(null, AGORA, P), null);
  assert.equal(interpretarQuando('', AGORA, P), null);
  assert.equal(interpretarQuando('   ', AGORA, P), null);
});

test('"22:47" é 22:47 NO FUSO DELE, não em UTC', () => {
  // Este é o erro que arruinaria o produto em silêncio: o serviço roda em
  // UTC, ele mora na França, e 2h de diferença troca a resposta.
  const t = interpretarQuando('22:47', AGORA, P);
  assert.equal(new Date(t).toISOString(), '2026-08-27T20:47:00.000Z');
  assert.equal(relogio(t, P), '22:47');
});

test('live que virou a madrugada: "23:40" perguntado à 01:10 é ontem', () => {
  const t = interpretarQuando('23:40', AGORA, P);
  assert.equal(new Date(t).toISOString(), '2026-08-27T21:40:00.000Z');
  assert.ok(t < AGORA, 'não pode cair no futuro');
});

test('aceita as formas que um humano digita', () => {
  assert.equal(interpretarQuando('agora', AGORA, P), AGORA);
  assert.equal(interpretarQuando('10', AGORA, P), AGORA - 10 * 60000);
  assert.equal(interpretarQuando('há 25 minutos', AGORA, P), AGORA - 25 * 60000);
  assert.equal(interpretarQuando('25 min atrás', AGORA, P), AGORA - 25 * 60000);
  assert.equal(interpretarQuando('22h47', AGORA, P), interpretarQuando('22:47', AGORA, P));
});

test('instante absoluto passa intacto — é o que o site manda', () => {
  assert.equal(interpretarQuando(String(AGORA), AGORA, P), AGORA);
});

test('o que não dá para entender vira erro, não um horário inventado', () => {
  // Chutar um horário aqui produziria uma resposta confiante e errada.
  assert.equal(interpretarQuando('banana', AGORA, P), undefined);
  assert.equal(interpretarQuando('99:99', AGORA, P), undefined);
  assert.equal(interpretarQuando('25:00', AGORA, P), undefined);
  assert.equal(interpretarQuando('99999', AGORA, P), undefined);
});

test('horário de verão é respeitado nos dois sentidos', () => {
  const inverno = Date.parse('2026-01-15T20:00:00Z');  // 21h em Paris
  assert.equal(deslocamento(P, AGORA), 2 * 3600000, 'agosto: UTC+2');
  assert.equal(deslocamento(P, inverno), 1 * 3600000, 'janeiro: UTC+1');
  assert.equal(new Date(interpretarQuando('14:00', inverno, P)).toISOString(),
    '2026-01-15T13:00:00.000Z');
});

test('horário que ainda não chegou hoje é de ontem, não do futuro', () => {
  // 13h em Paris; perguntar "14:00" só pode ser sobre ontem.
  const meioDia = Date.parse('2026-01-15T12:00:00Z');
  const t = interpretarQuando('14:00', meioDia, P);
  assert.equal(new Date(t).toISOString(), '2026-01-14T13:00:00.000Z');
  assert.ok(t < meioDia);
});

test('aceita data completa em ISO', () => {
  assert.equal(interpretarQuando('2026-08-27T20:47:00Z', AGORA, P),
    Date.parse('2026-08-27T20:47:00Z'));
});

test('UTC continua sendo o padrão seguro', () => {
  assert.equal(new Date(interpretarQuando('22:47', AGORA)).toISOString(),
    '2026-08-27T22:47:00.000Z');
});
