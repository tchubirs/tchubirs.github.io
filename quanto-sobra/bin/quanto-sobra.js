#!/usr/bin/env node
'use strict';
//
// quanto-sobra — diz quais campanhas de content rewards ainda têm dinheiro.
//
//   node bin/quanto-sobra.js <url> [url…]
//   node bin/quanto-sobra.js                 (lê campanhas.txt)
//   node bin/quanto-sobra.js --json          (para outro programa ler)
//
const fs = require('node:fs');
const path = require('node:path');
const { lerCampanha } = require('../src/ler.js');
const { julgar } = require('../src/julgar.js');

const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

async function buscar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': NAVEGADOR }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function lista(args) {
  const urls = args.filter((a) => !a.startsWith('-'));
  if (urls.length) return urls;
  const f = path.join(__dirname, '..', 'campanhas.txt');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
}

const d = (n) => (n == null ? '—' : `$${n.toFixed(2)}`);
const CORES = { ENTRA: '\x1b[32m', CUIDADO: '\x1b[33m', MORTA: '\x1b[31m' };

function mostrar(c, j) {
  const cor = process.stdout.isTTY ? (CORES[j.veredicto] || '') : '';
  const fim = process.stdout.isTTY && cor ? '\x1b[0m' : '';
  console.log(`\n${cor}▌ ${j.veredicto}${fim}  ${c.nome}`);
  console.log(`  ${c.agencia}${c.agenciaVerificada ? ' ✓' : ''}`
    + `  ·  ${c.plataformas.join(', ') || 'sem plataformas'}`
    + `  ·  ${c.clippers ?? '?'} clippers`);
  console.log(`  Orçamento  ${d(c.gasto)} de ${d(c.orcamento)}`
    + `  →  restam ${d(c.restante)}`
    + (c.progresso != null ? `  (${(c.progresso * 100).toFixed(1)}% gasto)` : ''));
  console.log(`  CPM anunciado ${d(c.cpmMin)}`
    + `  ·  taxa REAL ${d(j.taxaPorMil)} por mil views`);
  console.log(`  Queima ${d(j.queimaPorDia)}/dia (${j.queimaDe}, ${j.queimaDias} dias)`
    + `  →  ${j.diasRestantes == null ? 'sem dados' : j.diasRestantes.toFixed(1) + ' dias'}`);
  if (j.porClipper != null) console.log(`  Sobra ${d(j.porClipper)} por clipper já inscrito`);
  for (const p of j.porque) console.log(`  · ${p}`);
  if (c.regras.length) console.log(`  Regras: ${c.regras.join(' | ')}`);
  if (c.materiais.length) console.log(`  Materiais: ${c.materiais.join('\n             ')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const urls = lista(args);
  if (!urls.length) {
    console.error('Dá-me links de campanha, ou põe um por linha em campanhas.txt.');
    process.exit(2);
  }

  const tudo = [];
  for (const url of urls) {
    try {
      const c = lerCampanha(await buscar(url));
      if (!c) { console.error(`✗ ${url} — a página não tem cartão de campanha`); continue; }
      tudo.push({ url, c, j: julgar(c) });
    } catch (e) {
      console.error(`✗ ${url} — ${e.message}`);
    }
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(tudo.map(({ url, c, j }) => ({ url, ...c, juizo: j })), null, 2));
    return;
  }

  const ordem = { ENTRA: 0, CUIDADO: 1, MORTA: 2 };
  tudo.sort((a, b) => (ordem[a.j.veredicto] - ordem[b.j.veredicto])
    || (b.j.porClipper ?? 0) - (a.j.porClipper ?? 0));
  for (const { c, j } of tudo) mostrar(c, j);

  const vivas = tudo.filter((x) => x.j.veredicto === 'ENTRA').length;
  console.log(`\n${tudo.length} campanhas lidas · ${vivas} com dinheiro a sério`);
  process.exitCode = vivas ? 0 : 1;
}

main();
