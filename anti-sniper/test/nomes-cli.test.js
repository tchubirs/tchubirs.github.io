'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Estes correm o comando A SÉRIO, em processo separado. São os únicos que
// apanham erros de leitura dos argumentos — um `--vergit` colado no PowerShell
// já lhe custou uma corrida inteira com o navegador escondido.
const CLI = path.resolve(__dirname, '..', 'bin', 'nomes.js');

const correr = (...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8',
  // Sem isto o comando ia à rede ver se há versão nova antes de recusar o
  // argumento — o teste ficaria refém do GitHub estar de pé.
  env: { ...process.env, DETETIVE_SEM_ATUALIZAR: '1' },
  timeout: 20000,
});

test('sem alvo nenhum, explica o uso e sai com 2', () => {
  const r = correr();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /uso: npm run nomes/);
  assert.match(r.stderr, /mais IDs/, 'o uso tem de dizer que aceita vários');
});

// O caso real: no PowerShell o comando colou-se ao texto que já estava na
// linha e saiu "--vergit pull". A janela nunca abriu e a saída disse "nada".
test('bandeira desconhecida é recusada no primeiro segundo', () => {
  const r = correr('76561198155380495', '--vergit');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /não conheço "--vergit"/);
  assert.match(r.stderr, /Parece "--ver" com texto colado atrás/);
  assert.match(r.stderr, /Esc/, 'tem de dizer como evitar da próxima vez');
});

// E o oposto: vários IDs não são erro — são o modo de correr as contas todas
// com um só login. Antes eu recusava o segundo como se fosse engano.
test('vários IDs passam pela leitura dos argumentos', () => {
  const r = correr('76561198155380495', '76561199071264320', '--nao-existe');
  // Falha pela bandeira, não pelos IDs: se os IDs a mais fossem recusados, a
  // mensagem falaria deles.
  assert.equal(r.status, 2);
  assert.match(r.stderr, /não conheço "--nao-existe"/);
  assert.doesNotMatch(r.stderr, /76561199071264320/);
});
