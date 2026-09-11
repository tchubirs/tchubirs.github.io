#!/usr/bin/env node
'use strict';
/**
 * Quem o matou esta noite — e se essa pessoa estava a assistir.
 *
 *     npm run mortes            vigia a live agora
 *     npm run mortes -- --min 30    durante 30 minutos
 *     npm run mortes -- --canal outro
 *
 * Não pede chave nem login a ninguém: o vídeo da live é público, e o nome de
 * quem mata está escrito no painel de morte do próprio jogo. A audiência vem
 * da BotRix, que também é pública.
 *
 * O que ele vê é metade da resposta, e a saída diz isso por extenso: a BotRix
 * só conta quem está com sessão iniciada. Medido na live dele a 11/09/2026 —
 * 20 pessoas visíveis para 38 a 82 espectadores. Quem assiste deslogado não
 * aparece em fonte nenhuma, e um sniper tem todas as razões para o fazer.
 */

const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { temPainel, lerPainel, agrupar, votar, seguro } = require('../src/jogo/painel-morte');
const { placarPublico } = require('../src/stream/botrix-api');
const { Indice } = require('../src/indice');

const correr = promisify(execFile);
const arg = (nome, omissao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : omissao;
};

async function ondeToca(canal) {
  const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(canal)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36' },
  });
  if (!r.ok) throw new Error(`a Kick respondeu ${r.status}`);
  const d = await r.json();
  if (!d.livestream) return null;
  return { url: d.playback_url, titulo: d.livestream.session_title, viram: d.livestream.viewer_count };
}

async function audiencia(canal) {
  try {
    const p = await placarPublico(canal, 'kick');
    return (p.pessoas || p || []).map((x) => ({ nome: x.nome || x.name || x.username })).filter((x) => x.nome);
  } catch { return []; }
}

async function principal() {
  const canal = arg('canal', 'tchubi');
  const minutos = Number(arg('min', 60));
  const live = await ondeToca(canal);
  if (!live) { console.log(`  ${canal} não está ao vivo.`); return; }

  console.log(`\n  ${canal} — ${live.titulo}`);
  console.log(`  ${live.viram} a ver · vigio ${minutos} min · procuro o painel de morte\n`);

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'mortes-'));
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', live.url, '-t', String(minutos * 60), '-an',
    '-vf', 'fps=1,scale=1280:-1', '-f', 'image2', path.join(pasta, 'q%06d.png'), '-y'],
  { stdio: ['ignore', 'ignore', 'ignore'] });

  const leituras = [];
  const vistos = new Set();
  const comecou = Date.now();
  let vivo = true;
  ff.on('exit', () => { vivo = false; });

  while (vivo || fs.readdirSync(pasta).length) {
    for (const f of fs.readdirSync(pasta).sort()) {
      const p = path.join(pasta, f);
      if (vistos.has(f)) continue;
      vistos.add(f);
      try {
        if (fs.statSync(p).size < 1000) continue;
        if (!(await temPainel(p))) { fs.rmSync(p, { force: true }); continue; }
        const { nome, arma } = await lerPainel(p);
        const quandoS = (Date.now() - comecou) / 1000;
        leituras.push({ quandoS, nome, arma, quando: new Date() });
        process.stdout.write('.');
      } catch { /* um quadro estragado não pára a noite */ } finally {
        fs.rmSync(p, { force: true });
      }
    }
    await new Promise((k) => setTimeout(k, 2000));
  }
  fs.rmSync(pasta, { recursive: true, force: true });

  const grupos = agrupar(leituras);
  console.log(`\n\n  ${leituras.length} quadro(s) com painel  →  ${grupos.length} morte(s)\n`);
  if (!grupos.length) { console.log('  Não morreu nenhuma vez enquanto olhei.\n'); return; }

  const gente = await audiencia(canal);
  const idx = new Indice(gente);
  const relogio = (d) => d.toTimeString().slice(0, 8);

  for (const g of grupos) {
    const v = votar(g);
    const arma = votar(g.map((x) => ({ nome: x.arma })));
    const marca = seguro(v) ? '✓' : '?';
    const nome = v.nome || 'não deu para ler';
    console.log(`  ${marca} ${relogio(g[0].quando)}  ${String(g.length).padStart(2)}s   matou-o: ${nome.padEnd(18)} ${arma.nome || ''}`);
    if (!seguro(v)) { console.log('      (leitura única — o painel estava a animar; não conta como resposta)'); continue; }
    const bate = idx.procurar(v.nome);
    if (bate) {
      console.log(`      ESTAVA NA LIVE: ${bate.entrada.nome} — ${Math.round(bate.confianca * 100)}%, ${bate.motivo}`);
    } else {
      console.log('      não está entre quem eu consigo ver na audiência');
    }
  }

  console.log(`\n  A audiência que consigo ver: ${gente.length} pessoa(s) com sessão iniciada,`);
  console.log(`  de ${live.viram} que a Kick contou. Quem assiste deslogado não aparece`);
  console.log('  em fonte nenhuma — e é o que um sniper faria.\n');
}

if (require.main === module) {
  principal().catch((e) => { console.error('  parou:', e.message); process.exitCode = 1; });
}

module.exports = { ondeToca, audiencia };
