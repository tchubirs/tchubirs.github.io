// Fotografar a página como quem chega a vê, para julgar se se entende só de olhar.
//
//   node probes/fotos.mjs <pasta-de-saida> [larguraxaltura ...]
//
// Usa a mesma Kick fingida dos testes de página (test/falsa.mjs), com dois canais, e tira:
// a entrada vazia, a noite aberta e, quando o site já tiver o evento, o evento com um elenco.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { kickFalsa } from '../test/falsa.mjs';

const SITE = new URL('../site/', import.meta.url).pathname;
const SAIDA = path.resolve(process.argv[2] || 'fotos');
const ECRAS = (process.argv.slice(3).length ? process.argv.slice(3) : ['1440x900', '390x844'])
  .map((s) => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; });
const CHROME = process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(SAIDA, { recursive: true });

const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const servidor = http.createServer((req, res) => {
  const caminho = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(SITE, caminho === '/' ? 'index.html' : caminho);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${servidor.address().port}/`;
const navegador = await chromium.launch({ executablePath: CHROME });

for (const ecra of ECRAS) {
  const nome = `${ecra.width}x${ecra.height}`;
  const p = await navegador.newPage({ viewport: ecra, locale: 'pt-BR' });
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(SAIDA, `${nome}-1-entrada.png`), fullPage: true });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(SAIDA, `${nome}-2-noite.png`) });
  await p.close();
  // A sessão da noite fica guardada (até ao sair da página) e reabre sozinha: o evento começa noutra
  // janela, sem nada guardado.
  const contexto = await navegador.newContext({ viewport: ecra, locale: 'pt-BR' });
  const q = await contexto.newPage();
  q.on('pageerror', (e) => erros.push(e.message));
  await kickFalsa(q, { canais: ['tchubi', 'outro'] });
  {
    await q.goto(base, { waitUntil: 'networkidle' });
    await q.fill('#elenco', 'Time Alfa: tchubi, outro\nTime Beta: terceiro, quarto');
    await q.click('#abrirElenco');
    await q.waitForTimeout(3000);
    await q.screenshot({ path: path.join(SAIDA, `${nome}-3-evento.png`), fullPage: true });
    // Um lance: o primeiro canal com vídeo, a meio da noite falsa.
    const alvo = await q.evaluate(() => {
      const ev = window.__evento;
      const rolo = document.getElementById('mapaRolo');
      const l = ev?.mapa?.linhas.find((x) => x.tipo === 'canal' && ev.coberturas.has(x.canal));
      if (!l) return null;
      const caixa = rolo.getBoundingClientRect();
      const ms = (ev.vista.deMs + ev.vista.ateMs) / 2;
      return { x: caixa.left + ((ms - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth, y: caixa.top + l.y - ev.topo + l.altura / 2 };
    });
    if (alvo) {
      await q.mouse.click(alvo.x, alvo.y);
      await q.waitForTimeout(1500);
      await q.screenshot({ path: path.join(SAIDA, `${nome}-4-lance.png`), fullPage: true });
      await q.click('#verLance');
      await q.waitForSelector('.tile', { timeout: 15000 }).catch(() => {});
      await q.waitForTimeout(1500);
      await q.screenshot({ path: path.join(SAIDA, `${nome}-5-lance-aberto.png`) });
    }
  }
  if (erros.length) console.log(nome, 'erros:', erros);
  await contexto.close();
}
await navegador.close();
servidor.close();
console.log('fotos em', SAIDA);
