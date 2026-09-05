'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enderecoDaPagina } = require('../src/endereco');

test('acha o endereço no meio do texto da página', () => {
  assert.deepEqual(
    enderecoDaPagina('Vital Rust\nStatus Online\nconnect 51.222.12.34:28015\nRank 12'),
    { ip: '51.222.12.34', porta: 28015 },
  );
});

test('a porta de jogo ganha à de consulta, mesmo aparecendo depois', () => {
  assert.deepEqual(
    enderecoDaPagina('Query 51.222.12.34:28016 · Game 51.222.12.34:28015'),
    { ip: '51.222.12.34', porta: 28015 },
  );
});

test('sem porta de jogo fica o primeiro que houver', () => {
  assert.deepEqual(enderecoDaPagina('bla 1.2.3.4:29000 bla 5.6.7.8:30000'),
    { ip: '1.2.3.4', porta: 29000 });
});

test('o localhost dos exemplos não conta', () => {
  assert.equal(enderecoDaPagina('exemplo: 127.0.0.1:28015 ou 0.0.0.0:28015'), null);
});

test('um número que não é um IP não passa', () => {
  assert.equal(enderecoDaPagina('versão 999.999.999.999:28015'), null);
  assert.equal(enderecoDaPagina('data 2026.09.04:12'), null);
});

test('página sem endereço nenhum devolve null, e não rebenta', () => {
  assert.equal(enderecoDaPagina(''), null);
  assert.equal(enderecoDaPagina(null), null);
});
