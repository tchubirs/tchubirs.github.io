'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const No = require('../src/nomes');

const RAIZ = path.join(__dirname, '..');
const EXT = path.join(RAIZ, 'extensao');

function carregarNavegador() {
  const ctx = { globalThis: {}, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'nomes.js'), 'utf8'), ctx);
  return ctx.Detetive.Nomes;
}

test('o pacote do navegador está atualizado com src/', () => {
  // Se este teste falhar, rode: node extensao/construir.js
  // Duas versões do cruzamento se desencontrando é a pior falha possível
  // aqui: os testes passam sobre uma e o usuário usa a outra.
  const antes = fs.readFileSync(path.join(EXT, 'nomes.js'), 'utf8');
  execFileSync(process.execPath, [path.join(EXT, 'construir.js')], { cwd: RAIZ });
  const depois = fs.readFileSync(path.join(EXT, 'nomes.js'), 'utf8');
  assert.equal(antes, depois, 'extensao/nomes.js está velho — rode node extensao/construir.js');
});

test('navegador e node normalizam IGUAL', () => {
  const Nav = carregarNavegador();
  const casos = [
    'FINIK', 'D1per', 'MF | Dr | Merfy', 'Опасный Поцык', 'Е.В.П.А.Т.И.Й',
    '322', 'ҐXӀ КамнемПоЕБLY', 'ѕniрer', '𝚊𝚛𝚒𝚗', 'ᴀʀɪɴ', '[BR] Tchubi',
    'xX_Ma7ador_Xx', 'SeX_BoMbA', 'arin_tv', '', '🔥🔥',
  ];
  for (const c of casos) {
    assert.equal(Nav.normalizar(c), No.normalizar(c), `divergiu em ${JSON.stringify(c)}`);
  }
});

test('navegador e node comparam IGUAL', () => {
  const Nav = carregarNavegador();
  const pares = [
    ['FINIK', 'finik'], ['D1per', 'diper'], ['MF | Dr | Merfy', 'merfy'],
    ['ana', 'banana'], ['Опасный Поцык', 'FINIK'], ['arin', 'arin_tv'],
    ['ѕniрer', 'sniper'], ['322', '322'], ['bob', 'bobsburgers'],
  ];
  for (const [a, b] of pares) {
    assert.equal(Nav.comparar(a, b).confianca, No.comparar(a, b).confianca,
      `divergiu em ${a} × ${b}`);
  }
});

test('o manifesto pede só os dois sites que a extensão lê', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  // Nada de <all_urls>: a extensão não tem motivo para ver outros sites,
  // e permissão ampla é o que faz uma extensão ser recusada e desconfiada.
  for (const h of m.host_permissions) {
    assert.ok(/battlemetrics\.com|botrix\.live/.test(h), `permissão larga demais: ${h}`);
  }
  assert.ok(!JSON.stringify(m).includes('<all_urls>'));
  assert.deepEqual(m.permissions, ['storage']);
});

test('o pacote gerado avisa que não deve ser editado à mão', () => {
  const s = fs.readFileSync(path.join(EXT, 'nomes.js'), 'utf8');
  assert.match(s, /GERADO/);
  assert.match(s, /NÃO EDITE/);
});
