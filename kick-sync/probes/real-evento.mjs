// O evento contra a Kick a sério, num Chromium: abrir o exemplo do Rust ao vivo, escolher um lance de há
// 20 minutos no primeiro canal, abri-lo e ver se os vídeos chegam. Tira fotografias de cada passo.
//
//   node probes/real-evento.mjs <pasta-das-fotos>
//
// Precisa de rede para kick.com. Num contentor com proxy, usa o HTTPS_PROXY do ambiente.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const SITE = new URL('../site/', import.meta.url).pathname;
const SAIDA = path.resolve(process.argv[2] || 'fotos-reais');
fs.mkdirSync(SAIDA, { recursive: true });
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const c = decodeURIComponent(q.url.split('?')[0]); const f = path.join(SITE, c === '/' ? 'index.html' : c);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f)); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
// Só o HTTPS vai pelo proxy: o site local é HTTP e tem de ir direto (o Playwright força o proxy até
// para o 127.0.0.1, e o proxy daqui só aceita túneis HTTPS).
const args = process.env.HTTPS_PROXY ? [`--proxy-server=https=${new URL(process.env.HTTPS_PROXY).host}`] : [];
const b = await chromium.launch({ executablePath: process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
const erros = [];
p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
const t0 = Date.now();
const passo = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);

await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'networkidle' });
passo(`pagina: ${await p.title()} ${await p.locator('#exemploAoVivo').count()}`);
await p.click('#exemploAoVivo');
await p.waitForFunction(() => window.__evento?.mapa && window.__evento.coberturas.size > 0, null, { timeout: 90000 });
passo(`mapa: ${await p.locator('#resumoEvento').innerText()}`);
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(SAIDA, '1-mapa.png') });

const alvo = await p.evaluate(() => {
  const ev = window.__evento;
  const rolo = document.getElementById('mapaRolo');
  const ms = Date.now() - 20 * 60_000;
  const l = ev.mapa.linhas.find((x) => x.tipo === 'canal' && (ev.coberturas.get(x.canal) || []).some(([de, ate]) => ms >= de && ms <= ate));
  const caixa = rolo.getBoundingClientRect();
  const x = ((ms - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth;
  return l ? { x: caixa.left + x, y: caixa.top + l.y - ev.topo + l.altura / 2, canal: l.canal } : null;
});
if (!alvo) throw new Error('ninguém estava no ar há 20 min');
await p.mouse.click(alvo.x, alvo.y);
await p.waitForSelector('#lance:not([hidden])');
passo(`lance: ${await p.locator('#lanceTitulo').innerText()}`);
await p.screenshot({ path: path.join(SAIDA, '2-lance.png') });
await p.click('#verLance');
await p.waitForSelector('.tile', { timeout: 60000 });
await p.waitForTimeout(6000);
const estado = await p.evaluate(() => ({
  linhas: window.__estado.linhas.length, agora: new Date(window.__estado.agoraMs).toISOString(),
  videos: [...document.querySelectorAll('.tile video')].map((v) => ({ pronto: v.readyState, t: Math.round(v.currentTime) })),
}));
passo(`noite aberta: ${JSON.stringify(estado)}`);
await p.screenshot({ path: path.join(SAIDA, '3-lance-aberto.png') });
console.log('erros:', erros.slice(0, 10));
await b.close(); srv.close();
