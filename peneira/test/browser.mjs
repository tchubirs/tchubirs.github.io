// Um teste de browser que não corre é um teste que não existe.
//
// Os testes de unidade provam que a página CONTÉM o guião e os dados. Só um
// browser a sério prova que ele CORRE — e o guião embutido já se partiu uma vez
// por um backtick num comentário, coisa que nenhum teste de texto apanhava.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

// Uma página feita de dados inventados: este teste prova o guião, não a rede.
const { pagina } = await import(join(raiz, 'src/pagina.js'));
const { peneirar } = await import(join(raiz, 'src/peneirar.js'));
const f = {
  mint: 'So11111111111111111111111111111111111111112',
  simbolo: 'WSOL', nome: 'Wrapped SOL', liquidezUsd: 1e6, fdv: 5e6,
  vol1h: 1000, vol24h: 5000, idadeMin: 500, fraccaoNaPiscina: 0.2, oferta: 1e9,
  mintAuthority: null, freezeAuthority: null, concentracao: null,
};
const dir = mkdtempSync(join(tmpdir(), 'peneira-'));
const ficheiro = join(dir, 'index.html');
writeFileSync(ficheiro, pagina([{ f, j: peneirar(f) }], { quando: new Date() }));

const args = ['--ignore-certificate-errors'];
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const b = await chromium.launch({ args, proxy, executablePath: process.env.PENEIRA_CHROME || undefined });
const pg = await b.newPage();
const erros = [];
pg.on('pageerror', (e) => erros.push(String(e)));
await pg.goto('file://' + ficheiro);
await pg.waitForTimeout(3000);

assert.deepEqual(erros, [], 'o guião embutido rebentou: ' + erros.join(' | '));
assert.ok(await pg.locator('article.t').count() >= 1, 'a página não desenhou cartão nenhum');
assert.ok(await pg.locator('#recarregar').isVisible(), 'o botão de actualizar não apareceu');

const estado = await pg.locator('#estadoLive').innerText();
assert.ok(/frescos|leitura de antes|respondeu/.test(estado),
  'o guião não disse em que estado ficou: ' + estado);
console.log('browser OK  ·  estado:', estado);
await b.close();
