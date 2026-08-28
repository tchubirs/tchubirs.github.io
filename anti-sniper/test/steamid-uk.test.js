'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { conta } = require('../src/steamid-uk');

const comArquivo = (obj) => {
  const f = path.join(os.tmpdir(), `cfg-${process.pid}-${Math.random()}.json`);
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};
const semAmbiente = (fn) => {
  const { STEAMID_UK_CHAVE: a, STEAMID_UK_MEUID: b } = process.env;
  delete process.env.STEAMID_UK_CHAVE; delete process.env.STEAMID_UK_MEUID;
  try { return fn(); } finally {
    if (a !== undefined) process.env.STEAMID_UK_CHAVE = a;
    if (b !== undefined) process.env.STEAMID_UK_MEUID = b;
  }
};

test('lê a chave e o SteamID da configuração', () => semAmbiente(() => {
  const f = comArquivo({ meuSteamId: '76561198066116229', steamidUk: { chave: 'ABC' } });
  const c = conta({ caminho: f });
  assert.equal(c.meuId, '76561198066116229');
  assert.equal(c.chave, 'ABC');
  assert.equal(c.ligado, true);
  fs.rmSync(f, { force: true });
}));

// `myid` é quem PERGUNTA, e a API conta as consultas nessa conta. Faltar
// uma das duas e tentar assim mesmo devolve um erro que não diz qual faltou.
test('diz exatamente o que falta, em vez de só "não ligado"', () => semAmbiente(() => {
  const so = comArquivo({ meuSteamId: '76561198066116229' });
  assert.equal(conta({ caminho: so }).ligado, false);
  assert.match(conta({ caminho: so }).falta, /chave/);

  const nada = comArquivo({});
  assert.match(conta({ caminho: nada }).falta, /chave e o teu SteamID/);
  for (const f of [so, nada]) fs.rmSync(f, { force: true });
}));

test('o ambiente ganha do arquivo — dá para testar sem mexer na config dele', () => {
  const f = comArquivo({ meuSteamId: 'do-arquivo', steamidUk: { chave: 'do-arquivo' } });
  process.env.STEAMID_UK_CHAVE = 'do-ambiente';
  try {
    assert.equal(conta({ caminho: f }).chave, 'do-ambiente');
    assert.equal(conta({ caminho: f }).meuId, 'do-arquivo');
  } finally {
    delete process.env.STEAMID_UK_CHAVE;
    fs.rmSync(f, { force: true });
  }
});

test('config inexistente não quebra — devolve desligado', () => semAmbiente(() => {
  const c = conta({ caminho: '/nao/existe/config.json' });
  assert.equal(c.ligado, false);
  assert.equal(c.chave, '');
}));
