'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const n = require('../src/nomes');

/** Nomes REAIS, copiados do painel de jogadores ativos de um servidor de
 *  Rust. Cada um destes quebrou o normalizador de alguma forma. */
const REAIS = [
  'FINIK', 'D1per', 'RushTriumph', 'MF | Dr | Merfy', 'Moralex', 'Cigmychiy',
  'PuY', 'Опасный Поцык', 'Caraxes', 'Stamakey', 'SeX_BoMbA', 'qDusk',
  'M1ks1ze', 'Е.В.П.А.Т.И.Й', '322', 'ҐXӀ КамнемПоЕБLY',
];

test('nenhum nome real vira string vazia', () => {
  // Vazio é o pior resultado: não casa e não avisa que não olhou nada.
  for (const r of REAIS) {
    assert.notEqual(n.normalizar(r), '', `"${r}" sumiu`);
  }
});

test('nome russo legítimo NÃO é convertido para latino', () => {
  // Antes: "Опасный Поцык" virava "achok" e "Е.В.П.А.Т.И.Й" virava "".
  assert.equal(n.normalizar('Опасный Поцык'), 'опасныйпоцык');
  assert.equal(n.normalizar('Е.В.П.А.Т.И.Й'), 'евпатий');
});

test('mas latino DISFARÇADO de cirílico continua sendo desmascarado', () => {
  // 'ѕ' e 'р' aqui são cirílicos fingindo de latinos — minoria na string.
  assert.equal(n.normalizar('ѕniрer'), 'sniper');
  assert.equal(n.comparar('ѕniрer', 'sniper').confianca, 1);
});

test('nome só de dígitos não é tratado como leet', () => {
  // Antes: "322" virava "e22" porque o mapa converte 3 em e.
  assert.equal(n.normalizar('322'), '322');
  assert.equal(n.comparar('322', '322').confianca, 1);
});

test('tag de clã separada por barra é removida, sobra o nome', () => {
  // Antes: "MF | Dr | Merfy" virava "mfdrmerfy" e não casava com "merfy".
  assert.equal(n.normalizar('MF | Dr | Merfy'), 'merfy');
  assert.equal(n.comparar('MF | Dr | Merfy', 'merfy').confianca, 1);
  assert.equal(n.normalizar('CL/Fulano'), 'fulano');
  assert.equal(n.normalizar('[BR] Tchubi'), 'tchubi');
});

test('leet nos nomes reais casa com a grafia limpa', () => {
  assert.ok(n.comparar('D1per', 'diper').confianca >= 0.9);
  assert.ok(n.comparar('M1ks1ze', 'miksize').confianca >= 0.9);
  assert.equal(n.comparar('SeX_BoMbA', 'sexbomba').confianca, 1);
});

test('sufixo de canal no nome do jogo continua casando', () => {
  assert.equal(n.comparar('FINIK', 'finik_ttv').confianca, 1);
  assert.equal(n.comparar('RushTriumph', 'rushtriumph_ttv').confianca, 1);
});

test('dois jogadores reais diferentes NÃO casam entre si', () => {
  for (let i = 0; i < REAIS.length; i++) {
    for (let j = i + 1; j < REAIS.length; j++) {
      const c = n.comparar(REAIS[i], REAIS[j]).confianca;
      assert.ok(c < 0.55, `falso positivo: "${REAIS[i]}" × "${REAIS[j]}" = ${c}`);
    }
  }
});

test('LIMITE CONHECIDO: transliteração não é detectada', () => {
  // Um russo pode usar cirílico no jogo e transliteração na Twitch.
  // Hoje isto passa batido. Fica documentado como buraco, não como bug.
  assert.equal(n.comparar('Опасный Поцык', 'OpasnyPocyk').confianca, 0);
});
