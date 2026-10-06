// Conferir uma cópia publicada do site (a pasta replay/ de qualquer ramo): abre um link armadilhado
// com código no lugar de um nome de canal, carrega uma noite de dois canais e abre a página da Twitch.
//
//   node probes/checar-publicado.mjs <pasta-publicada>

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { kickFalsa } from '../test/falsa.mjs';
const SITE = path.resolve(process.argv[2]) + '/';
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const c = decodeURIComponent(q.url.split('?')[0]); const f = path.join(SITE, c === '/' ? 'index.html' : c);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f)); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const erros = [];
// 1. o link armadilhado
const ARM = '<img src=x onerror="window.__xss=1">';
const s = Buffer.from(JSON.stringify({ v: 2, canais: ['tchubi', ARM], momentos: [{ ms: 1, protagonista: ARM }] })).toString('base64');
let p = await b.newPage(); p.on('pageerror', (e) => erros.push(e.message));
await kickFalsa(p, { canais: ['tchubi'] });
await p.goto(`${base}?s=${encodeURIComponent(s)}`, { waitUntil: 'networkidle' });
await p.waitForSelector('#listaCanais li', { timeout: 15000 });
await p.waitForTimeout(800);
console.log('xss:', await p.evaluate(() => window.__xss), 'imgs:', await p.locator('#listaCanais img').count());
await p.close();
// 2. uma noite normal
const ctx = await b.newContext(); p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
await kickFalsa(p, { canais: ['tchubi', 'outro'] });
await p.goto(base, { waitUntil: 'networkidle' });
await p.fill('#canais', 'tchubi\noutro'); await p.click('#carregar');
await p.waitForSelector('.tile', { timeout: 15000 });
console.log('tiles:', await p.locator('.tile').count());
// 3. a página da Twitch abre
await p.goto(`${base}twitch.html`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
console.log('twitch titulo:', await p.title());
console.log('erros:', erros);
await b.close(); srv.close();
