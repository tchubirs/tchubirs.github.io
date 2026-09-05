// O caso REAL dele: 31 canais num monitor de 2560. Foi assim que ele viu o
// site, e não com dois canais num 1440 — que é como eu andava a olhar.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { kickFalsa } from '../test/falsa.mjs';

const ROTULO = process.argv[2] || 'muitos';
const SITE = new URL('../site/', import.meta.url).pathname;
const FORA = `/tmp/fotos/${ROTULO}`;
fs.rmSync(FORA, { recursive: true, force: true });
fs.mkdirSync(FORA, { recursive: true });
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const servidor = http.createServer((req, res) => {
  const c = req.url.split('?')[0];
  const f = path.join(SITE, c === '/' ? 'index.html' : c);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' });
  return res.end(fs.readFileSync(f));
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const PORTA = servidor.address().port;
const { chromium } = await import('playwright');
const nav = await chromium.launch({ executablePath: process.env.DETETIVE_CHROME });

const CANAIS = ['tchubi', 'lautaarg00', 'ludovici', 'wowi', 'orisita', 'caritofff', 'ctapp',
  'sapoiq', 'deowasd', 'kodd', 'dilanzito', 'ch1mu21', 'krakenpez', 'xlibano', 'newtrc',
  'sr-rua', 'lemankiu', 'carlihno', 'xomegaa', 'calaveragamingtv', 'babel-gaming105',
  'hatzukihoshi', 'uruguayo28', 'diablozxz', 'ay_zarite', 'm2cg', 'srdes', 'gringge',
  'karinios0', 'mateopsz', 'yopickeosola'];

for (const [rot, w, h] of [['2560', 2560, 1400], ['1440', 1440, 900], ['390', 390, 844]]) {
  const p = await nav.newPage({ viewport: { width: w, height: h }, locale: 'pt-PT' });
  await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ } });
  await kickFalsa(p, { canais: CANAIS });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', CANAIS.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 60000 });
  await p.click('#mais1m');
  await p.click('#marcarKill');
  await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  const m = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { janela: innerWidth, body: r('body'), entrada: r('#entrada'), noites: r('#noites'),
      canais: r('#canaisEstado'), palco: r('#palco'), video: r('.palcoVideo'),
      lado: r('.palcoLado'), grelha: r('#grade'), montagem: r('#montagem'),
      colunas: getComputedStyle(document.querySelector('#grade') || document.body).gridTemplateColumns.split(' ').length,
      tiles: document.querySelectorAll('.tile').length };
  });
  console.log(rot, JSON.stringify(m));
  await p.screenshot({ path: `${FORA}/${rot}.png`, fullPage: true });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${FORA}/${rot}-ecra.png` });
  await p.close();
}
await nav.close(); servidor.close();
