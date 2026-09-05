// Fotografar a interface inteira: cada ecrã, cada estado, em 390 e 1440.
//
// Usa a MESMA Kick falsa dos testes. Uma segunda cópia da mentira acabaria a
// divergir, e as fotografias deixariam de valer como prova de nada.
//
//   node probes/fotos.mjs antes     ->  /tmp/fotos/antes/*.png
//   node probes/fotos.mjs depois
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { kickFalsa } from '../test/falsa.mjs';

const ROTULO = process.argv[2] || 'agora';
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
const nav = await chromium.launch({
  executablePath: process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const ECRAS = [['390', 390, 844], ['1440', 1440, 900]];

async function foto(nome, guiao, { canais = ['tchubi', 'outro'], ...op } = {}) {
  for (const [rot, width, height] of ECRAS) {
    const p = await nav.newPage({ viewport: { width, height }, locale: 'pt-PT' });
    await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ } });
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message)));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|404/.test(m.text())) erros.push(m.text()); });
    await kickFalsa(p, { canais, ...op });
    await p.goto(`http://127.0.0.1:${PORTA}/${op.pagina || ''}`, { waitUntil: 'networkidle' });
    try { await guiao(p); } catch (e) { console.log(`  ! ${nome}/${rot}: ${e.message.split('\n')[0]}`); }
    await p.screenshot({ path: `${FORA}/${nome}-${rot}.png`, fullPage: true });
    if (erros.length) console.log(`  ! ${nome}/${rot} erros:`, erros.slice(0, 2));
    await p.close();
  }
  console.log(`  ${nome}`);
}

const carregar = async (p, canais) => {
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 25000 });
};

console.log(`fotografias -> ${FORA}`);
await foto('01-vazio', async () => {});
await foto('02-procura', async (p) => {
  await p.fill('#procurar', 'tchubi');
  await p.waitForSelector('#sugestoes li', { timeout: 10000 });
});
await foto('03-um-canal', async (p) => carregar(p, ['tchubi']), { canais: ['tchubi'] });
await foto('04-quatro-canais', async (p) => carregar(p, ['tchubi', 'a', 'b', 'c']),
  { canais: ['tchubi', 'a', 'b', 'c'] });
await foto('05-canal-invalido', async (p) => {
  await p.fill('#canais', 'tchubi\nnaoexiste');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 25000 });
}, { canais: ['tchubi'] });
await foto('06-com-kills', async (p) => {
  await carregar(p, ['tchubi', 'outro']);
  for (let i = 0; i < 3; i++) { await p.click('#mais1m'); await p.click('#marcarKill'); }
  await p.locator('#listaMomentos li[data-ms]').first().locator('.vit').first().click();
});
await foto('07-marca-e-corte', async (p) => {
  await carregar(p, ['tchubi', 'outro']);
  await p.click('#marcarIn');
  await p.click('#mais10s');
  await p.click('#marcarOut');
});
await foto('08-modal-clipe', async (p) => {
  await carregar(p, ['tchubi', 'outro']);
  await p.click('#clipar');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
});
await foto('09-buraco', async (p) => carregar(p, ['tchubi', 'outro']), { desviosS: { outro: 3 } });
await foto('10-twitch', async (p) => {
  await p.fill('#canais', 'tchubi');
}, { pagina: 'twitch.html' });

await nav.close();
servidor.close();
console.log('feito');
