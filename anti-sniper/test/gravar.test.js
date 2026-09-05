'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// O que ele pediu três vezes: não o total acumulado, mas "entrou HH:MM,
// saiu HH:MM" de hoje. Estes testes protegem a derivação disso.
const BIN = path.join(__dirname, '..', 'bin', 'gravar.js');
const T = Date.parse('2026-08-27T20:00:00Z');
const M = 60000;

function comArquivo(linhas, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grav-'));
  const arq = path.join(dir, 'leituras.jsonl');
  fs.writeFileSync(arq, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  try { return fn(arq, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Roda o --ver contra um arquivo de teste, sem tocar a rede. */
function ver(linhas, alvo) {
  return comArquivo(linhas, (arq, dir) => {
    // O programa lê de <raiz>/dados/leituras.jsonl; monta essa forma.
    const raiz = path.join(dir, 'raiz');
    fs.mkdirSync(path.join(raiz, 'dados'), { recursive: true });
    fs.copyFileSync(arq, path.join(raiz, 'dados', 'leituras.jsonl'));
    fs.mkdirSync(path.join(raiz, 'bin'), { recursive: true });
    fs.copyFileSync(BIN, path.join(raiz, 'bin', 'gravar.js'));
    fs.symlinkSync(path.join(__dirname, '..', 'src'), path.join(raiz, 'src'));
    fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(raiz, 'node_modules'));
    return execFileSync(process.execPath, [path.join(raiz, 'bin', 'gravar.js'), '--ver', ...(alvo ? [alvo] : [])],
      { encoding: 'utf8', env: { ...process.env, GRAVAR_FUSO: 'UTC' } });
  });
}

test('duas visitas separadas viram DUAS linhas', () => {
  // É a pergunta dele: "entrou 12:00 saiu 12:04, entrou de novo 12:51".
  const s = ver([
    { t: T, nome: 'x', min: 100, marco: true },
    { t: T + 10 * M, nome: 'x', min: 110, ganhou: 10 },
    { t: T + 20 * M, nome: 'x', min: 120, ganhou: 10 },
    { t: T + 90 * M, nome: 'x', min: 130, ganhou: 10 },
    { t: T + 100 * M, nome: 'x', min: 140, ganhou: 10 },
  ]);
  // Só as LINHAS DE VISITA: o rodapé também tem a palavra "entrou".
  const linhas = s.split('\n').filter((l) => /entrou \d\d:\d\d\s+saiu/.test(l));
  assert.equal(linhas.length, 2, '70 min de silêncio é visita nova');
  assert.match(linhas[0], /entrou 20:00\s+saiu 20:20/);
  assert.match(linhas[1], /entrou 21:20\s+saiu 21:40/);
});

test('o marco inicial NÃO conta como presença', () => {
  // Quando vejo alguém pela primeira vez não sei desde quando aquele total
  // existe. Contar isso inventaria uma visita que ninguém observou.
  const s = ver([{ t: T, nome: 'x', min: 5000, marco: true }]);
  assert.match(s, /Nada gravado ainda/);
});

test('o ganho conta para TRÁS, não a partir da leitura', () => {
  // O contador subiu porque a pessoa esteve DURANTE o intervalo. Marcar a
  // entrada no instante da leitura atrasaria toda visita em 10 minutos.
  const s = ver([
    { t: T, nome: 'x', min: 100, marco: true },
    { t: T + 10 * M, nome: 'x', min: 110, ganhou: 10 },
  ]);
  assert.match(s, /entrou 20:00/, '10 min de ganho às 20:10 começam às 20:00');
});

test('filtra por pessoa quando você pergunta por uma', () => {
  const linhas = [
    { t: T, nome: 'a', min: 1, marco: true }, { t: T, nome: 'b', min: 1, marco: true },
    { t: T + 10 * M, nome: 'a', min: 11, ganhou: 10 },
    { t: T + 10 * M, nome: 'b', min: 11, ganhou: 10 },
  ];
  assert.match(ver(linhas, 'a'), /^\s+a$/m);
  assert.doesNotMatch(ver(linhas, 'a'), /^\s+b$/m);
});

test('linha corrompida não derruba o resto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grav2-'));
  const raiz = path.join(dir, 'raiz');
  fs.mkdirSync(path.join(raiz, 'dados'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'dados', 'leituras.jsonl'),
    `{"t":${T},"nome":"x","min":1,"marco":true}\n{quebrado\n{"t":${T + 10 * M},"nome":"x","min":11,"ganhou":10}\n`);
  fs.mkdirSync(path.join(raiz, 'bin'), { recursive: true });
  fs.copyFileSync(BIN, path.join(raiz, 'bin', 'gravar.js'));
  fs.symlinkSync(path.join(__dirname, '..', 'src'), path.join(raiz, 'src'));
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(raiz, 'node_modules'));
  try {
    const s = execFileSync(process.execPath, [path.join(raiz, 'bin', 'gravar.js'), '--ver'],
      { encoding: 'utf8', env: { ...process.env, GRAVAR_FUSO: 'UTC' } });
    assert.match(s, /entrou 20:00/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
