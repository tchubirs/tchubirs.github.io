'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Testes com repositórios git DE VERDADE, não com git falsificado.
//
// A razão é a própria história desta função: ela existe porque uma corrida
// dele deu resultado errado por a cópia estar atrasada. Um teste que finge o
// git provaria que eu sei escrever o que espero, não que a coisa funciona.
// Aqui clona-se, commita-se e confere-se o CONTEÚDO do ficheiro no disco.

const FONTE = path.resolve(__dirname, '..', 'src', 'atualizar.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Monta um remoto com N commits e um clone parado no primeiro. */
function montar() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'atualizar-'));
  const remoto = path.join(base, 'remoto');
  fs.mkdirSync(path.join(remoto, 'anti-sniper', 'src'), { recursive: true });
  git(base, 'init', '-q', '-b', 'main', remoto);
  git(remoto, 'config', 'user.email', 'teste@teste');
  git(remoto, 'config', 'user.name', 'teste');
  // A própria função vai viver dentro do clone, no sítio certo: ela sobe dois
  // níveis a partir de si mesma para achar a raiz, e isso faz parte do que se
  // está a testar.
  fs.copyFileSync(FONTE, path.join(remoto, 'anti-sniper', 'src', 'atualizar.js'));
  fs.writeFileSync(path.join(remoto, 'marca.txt'), 'v1\n');
  git(remoto, 'add', '-A'); git(remoto, 'commit', '-qm', 'v1');

  const clone = path.join(base, 'clone');
  git(base, 'clone', '-q', remoto, clone);
  git(clone, 'config', 'user.email', 'teste@teste');
  git(clone, 'config', 'user.name', 'teste');
  return { base, remoto, clone };
}

function avancar(remoto, texto) {
  fs.writeFileSync(path.join(remoto, 'marca.txt'), texto + '\n');
  git(remoto, 'commit', '-qam', texto);
}

/** Corre a função DENTRO do clone, em processo separado (o require é por caminho). */
function correr(clone) {
  const alvo = path.join(clone, 'anti-sniper', 'src', 'atualizar.js');
  const saida = execFileSync(process.execPath, [
    '-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(alvo)}).verificarAtualizacao()))`,
  ], { cwd: clone, encoding: 'utf8' });
  return JSON.parse(saida);
}

const marca = (dir) => fs.readFileSync(path.join(dir, 'marca.txt'), 'utf8').trim();

test('cópia atrasada e limpa: puxa sozinha e o ficheiro no disco muda mesmo', () => {
  const { base, remoto, clone } = montar();
  try {
    avancar(remoto, 'v2'); avancar(remoto, 'v3');
    assert.equal(marca(clone), 'v1', 'antes, o clone está parado no v1');

    const r = correr(clone);
    assert.equal(r.estado, 'trouxe');
    assert.equal(r.atras, 2);
    // O que interessa não é o que a função DIZ, é o que ficou no disco.
    assert.equal(marca(clone), 'v3', 'o ficheiro tem mesmo de ter mudado');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('já em dia: não faz nada e não mente a dizer que fez', () => {
  const { base, clone } = montar();
  try {
    const r = correr(clone);
    assert.equal(r.estado, 'atualizado');
    assert.equal(r.atras, undefined);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// O trabalho dele vem primeiro. Puxar por cima de alterações por gravar seria
// o programa a decidir sobre ficheiros que não são dele.
test('com trabalho por gravar: avisa e NÃO toca em nada', () => {
  const { base, remoto, clone } = montar();
  try {
    avancar(remoto, 'v2');
    fs.writeFileSync(path.join(clone, 'rascunho.txt'), 'coisa dele\n');

    const r = correr(clone);
    assert.equal(r.estado, 'sujo');
    assert.equal(r.atras, 1);
    assert.equal(marca(clone), 'v1', 'não pode ter puxado');
    assert.ok(fs.existsSync(path.join(clone, 'rascunho.txt')), 'não pode ter apagado nada');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// Só `--ff-only`. Se os dois lados andaram, resolver isso é decisão de gente.
test('ramo divergido: recusa em vez de inventar um merge', () => {
  const { base, remoto, clone } = montar();
  try {
    avancar(remoto, 'v2');
    fs.writeFileSync(path.join(clone, 'meu.txt'), 'local\n');
    git(clone, 'add', '-A'); git(clone, 'commit', '-qm', 'local');

    const r = correr(clone);
    assert.equal(r.estado, 'divergiu');
    assert.equal(marca(clone), 'v1');
    assert.ok(fs.existsSync(path.join(clone, 'meu.txt')), 'o commit dele fica de pé');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// Sem rede, sem git, ou fora de um repositório, o comando TEM de continuar a
// funcionar: a rede é para o site, não para saber a versão.
test('fora de um repositório: sai calado em vez de estourar', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'atualizar-sem-git-'));
  try {
    const dir = path.join(base, 'anti-sniper', 'src');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(FONTE, path.join(dir, 'atualizar.js'));
    const r = JSON.parse(execFileSync(process.execPath, [
      '-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.join(dir, 'atualizar.js'))}).verificarAtualizacao()))`,
    ], { cwd: base, encoding: 'utf8' }));
    assert.equal(r.estado, 'sem-git');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('o travão do ambiente desliga a verificação inteira', () => {
  const { base, remoto, clone } = montar();
  try {
    avancar(remoto, 'v2');
    const alvo = path.join(clone, 'anti-sniper', 'src', 'atualizar.js');
    const r = JSON.parse(execFileSync(process.execPath, [
      '-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(alvo)}).verificarAtualizacao()))`,
    ], { cwd: clone, encoding: 'utf8', env: { ...process.env, DETETIVE_SEM_ATUALIZAR: '1' } }));
    assert.equal(r.estado, 'atualizado');
    assert.equal(marca(clone), 'v1', 'com o travão, nem sequer vai buscar');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
