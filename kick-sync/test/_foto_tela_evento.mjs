// temporary repro script (removed after use)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { kickFalsa, T } from './falsa.mjs';
const SITE = new URL('../site/', import.meta.url).pathname;
const tag = process.argv[2] || 'antes';
const OUT = new URL('../../.arena/prints/fotos/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const c = req.url.split('?')[0];
  const f = path.join(SITE, c === '/' ? 'index.html' : c);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const PORTA = srv.address().port;
const nav = await chromium.launch({ executablePath: process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const canais = Array.from({ length: 18 }, (_, i) => `canal${i}`);
for (const [w, h] of (process.env.SO390 ? [[390,844]] : [[2000, 990], [1440, 900], [390, 844]])) {
  const p = await nav.newPage({ viewport: { width: w, height: h }, locale: 'pt-PT' });
  await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch {} });
  p.on('pageerror', (e) => console.log('ERRO', e.message));
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', canais.join('\n'));
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  await p.evaluate(({ a, b }) => { window.__evento.vista = { deMs: a, ateMs: b }; document.getElementById('procurarEvento').dispatchEvent(new Event('input')); }, { a: T - 5 * 60_000, b: T + 15 * 60_000 });
  await p.waitForTimeout(100);
  const alvo = await p.evaluate(({ m }) => {
    const ev = window.__evento; const rolo = document.getElementById('mapaRolo');
    const l = ev.mapa.linhas.find((x) => x.canal === 'canal3'); const caixa = rolo.getBoundingClientRect();
    rolo.scrollIntoView({ block: 'nearest' });
    const x = ((m - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth;
    const c2 = rolo.getBoundingClientRect();
    return { x: c2.left + x, y: c2.top + l.y - ev.topo + l.altura / 2 };
  }, { m: T + 3 * 60_000 });
  await p.mouse.click(alvo.x, alvo.y);
  await p.waitForSelector('#lance:not([hidden])');
  await p.click('#abrirTodosVod');
  await p.click('#abrirTodosVod');
  await p.waitForFunction(() => document.querySelectorAll('.tile').length >= 1, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  if (process.env.COMMAPA) { await p.click("#mostrarMapa"); await p.waitForTimeout(800); }
  const info = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), getComputedStyle(e).display]; };
    return { scrollY: Math.round(scrollY), evento: r('#evento'), mapa: r('#mapaRolo'), lance: r('#lance'), tiles: document.querySelectorAll('.tile').length, tile0: r('.tile'), grelha: r("#palco"), foco: r("#palcoFoco") };
  });
  console.log(w, JSON.stringify(info));
  await p.screenshot({ path: `${OUT}tela-evento-${tag}${process.env.COMMAPA ? "-m" : ""}-${w}.png` });
  await p.close();
}
await nav.close(); srv.close();
