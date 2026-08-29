'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { janelaFoiFechada, resumoDoErro } = require('../src/erros');

// As mensagens reais do Playwright quando a janela deixa de existir. Se
// nenhuma casar, a saída volta a dizer "— nada" para uma conta que eu nem
// cheguei a abrir — que foi o que aconteceu nas três contas dele.
test('reconhece a janela fechada pelas frases do Playwright', () => {
  for (const m of [
    'Target page, context or browser has been closed',
    'Target closed',
    'Protocol error (Runtime.callFunctionOn): Target closed.',
    'Browser closed',
    'Session closed. Most likely the page has been closed.',
    'Execution context was destroyed, most likely because of a navigation.',
  ]) {
    assert.equal(janelaFoiFechada(new Error(m)), true, m);
  }
});

// E não pode confundir um erro do SITE com a janela morta: se confundir, o
// comando pára a corrida toda por causa de um endereço que deu 404.
test('não confunde erro do site com janela fechada', () => {
  for (const m of [
    'net::ERR_NAME_NOT_RESOLVED at https://steamid.uk/profile/1',
    'Timeout 60000ms exceeded.',
    'net::ERR_CONNECTION_REFUSED',
    'page.goto: net::ERR_ABORTED',
    'Navigation failed because page crashed',
  ]) {
    assert.equal(janelaFoiFechada(new Error(m)), false, m);
  }
});

test('aceita texto solto e lixo sem quebrar', () => {
  assert.equal(janelaFoiFechada('Target closed'), true);
  assert.equal(janelaFoiFechada(null), false);
  assert.equal(janelaFoiFechada(undefined), false);
  assert.equal(janelaFoiFechada({}), false);
});

test('o resumo cabe numa linha', () => {
  const longo = new Error(`${'x'.repeat(300)}\nsegunda linha`);
  const r = resumoDoErro(longo);
  assert.equal(r.length, 90);
  assert.ok(!r.includes('\n'));
  assert.equal(resumoDoErro(new Error('curto\ndetalhe')), 'curto');
});
