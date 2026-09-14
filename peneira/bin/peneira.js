#!/usr/bin/env node
'use strict';
//
//   node bin/peneira.js <mint>          um token
//   node bin/peneira.js --novos [n]     os tokens acabados de nascer
//   node bin/peneira.js --novos --html <ficheiro>
//
const fs = require('node:fs');
const { factos, novos, dorme } = require('../src/fontes.js');
const { peneirar } = require('../src/peneirar.js');
const { pagina, baseDoMercado } = require('../src/pagina.js');

const CORES = { FOGE: '\x1b[31m', CUIDADO: '\x1b[33m', PASSA: '\x1b[32m' };

function mostrar(f, j) {
  const cor = process.stdout.isTTY ? (CORES[j.veredicto] || '') : '';
  const fim = cor ? '\x1b[0m' : '';
  console.log(`\n${cor}▌ ${j.veredicto}${fim}  ${f.simbolo || '?'}  ${f.nome || ''}`);
  console.log(`  liquidez ${f.liquidezUsd == null ? 'SEM DADOS' : '$' + f.liquidezUsd.toFixed(2)}`
    + `  ·  vol 1h $${(f.vol1h || 0).toFixed(0)}`
    + `  ·  ${f.idadeMin == null ? '?' : Math.round(f.idadeMin)} min de vida`);
  console.log(`  mint auth ${f.mintAuthority ? 'ACTIVA' : 'queimada'}`
    + `  ·  freeze auth ${f.freezeAuthority ? 'ACTIVA' : 'queimada'}`
    + `  ·  ${f.fraccaoNaPiscina == null ? 'oferta na piscina desconhecida'
      : (f.fraccaoNaPiscina * 100).toFixed(f.fraccaoNaPiscina < 0.01 ? 3 : 1)
        + '% da oferta na piscina'}`);
  for (const p of j.porque) console.log(`  · ${p}`);
  if (j.aviso) console.log(`  ${j.aviso}`);
}

async function main() {
  const args = process.argv.slice(2);
  const iHtml = args.indexOf('--html');
  const html = iHtml >= 0 ? args[iHtml + 1] : null;

  let mints;
  if (args.includes('--novos')) {
    const n = Number(args[args.indexOf('--novos') + 1]) || 24;
    mints = await novos(n);
    console.error(`a peneirar ${mints.length} tokens novos…`);
  } else {
    mints = args.filter((a) => !a.startsWith('-') && a.length > 30);
  }
  if (!mints.length) {
    console.error('Dá-me o endereço de um token, ou usa --novos.');
    process.exit(2);
  }

  const linhas = [];
  for (const m of mints) {
    const f = await factos(m);
    if (!f) { console.error(`✗ ${m} — sem mercado no DexScreener`); continue; }
    const j = peneirar(f);
    linhas.push({ f, j });
    if (!html) mostrar(f, j);
    await dorme(350);            // não martelar as APIs de graça
  }

  if (html) {
    // O estudo pode ainda não ter corrido. Nesse caso a página sai na mesma,
    // só sem a linha do contexto — não se parte uma página por um ficheiro
    // que ainda não existe.
    let base = null;
    try {
      const r = JSON.parse(fs.readFileSync(
        require('node:path').join(__dirname, '..', '..',
          'estudo-memecoin', 'dados', 'resultado.json'), 'utf8'));
      base = baseDoMercado(r.resumo);
    } catch { /* ainda não há estudo */ }
    fs.writeFileSync(html, pagina(linhas, { quando: new Date(), base }));
    console.error(`escrito ${html} com ${linhas.length} tokens`);
  } else {
    const fogem = linhas.filter((x) => x.j.veredicto === 'FOGE').length;
    console.log(`\n${linhas.length} vistos · ${fogem} para fugir`);
  }
}

main();
