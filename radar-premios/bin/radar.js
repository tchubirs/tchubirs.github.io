#!/usr/bin/env node
'use strict';
//   node bin/radar.js                     lista no terminal
//   node bin/radar.js --html site/index.html
//   node bin/radar.js --paginas 12
const fs = require('node:fs');
const { buscar } = require('../src/devpost.js');
const { julgar, ordenar } = require('../src/julgar.js');
const { pagina } = require('../src/pagina.js');

const CORES = { VALE: '\x1b[32m', FRACO: '\x1b[33m', TARDE: '\x1b[33m', FORA: '\x1b[31m' };

async function main() {
  const args = process.argv.slice(2);
  const iH = args.indexOf('--html');
  const html = iH >= 0 ? args[iH + 1] : null;
  const iP = args.indexOf('--paginas');
  const paginas = iP >= 0 ? Number(args[iP + 1]) || 8 : 8;

  const concursos = await buscar({ paginas });
  const linhas = concursos.map((c) => ({ c, j: julgar(c) })).filter((x) => x.j);
  if (!linhas.length) { console.error('nada lido — a API não respondeu'); process.exit(1); }

  if (html) {
    fs.writeFileSync(html, pagina(linhas, { quando: new Date() }));
    console.error(`escrito ${html} com ${linhas.length} concursos`);
    return;
  }

  for (const { c, j } of ordenar(linhas)) {
    if (j.veredicto === 'FORA') continue;
    const cor = process.stdout.isTTY ? (CORES[j.veredicto] || '') : '';
    const fim = cor ? '\x1b[0m' : '';
    console.log(`\n${cor}▌ ${j.veredicto}${fim}  ${c.titulo}`);
    console.log(`  hipótese ${j.hipotese == null ? '—' : (j.hipotese * 100).toFixed(1) + '%'}`
      + `  ·  $${c.premioTotal.toLocaleString('pt-PT')} em ${c.premiosEmDinheiro} prémios`
      + `  ·  ${c.inscritos} inscritos  ·  ${c.prazoTexto || '?'}`);
    for (const p of j.porque) console.log(`  · ${p}`);
    if (c.url) console.log(`  ${c.url}`);
  }
  const conta = (v) => linhas.filter((x) => x.j.veredicto === v).length;
  console.log(`\n${linhas.length} lidos · ${conta('VALE')} valem · ${conta('FORA')} fora`);
}

main();
