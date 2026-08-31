// The page, end to end, in a real browser, against a fake Kick.
//
// The unit tests cover the three modules. Nothing covered `app.js` — the file
// that wires them together and the only one the user actually touches. That is
// exactly where a variable used before it is declared, or a listener attached
// to an element that does not exist, hides: the modules stay green and the
// page is dead.
//
// Kick is faked by route interception rather than hit for real. Two reasons:
// this container cannot reach it, and a test that depends on someone else's
// live service fails for reasons that are not about this code.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SITE = new URL('../site/', import.meta.url).pathname;
// Porta escolhida pelo sistema, e não fixa: o `node --test` corre os ficheiros
// em paralelo, e uma porta fixa transforma dois testes bons em falhas que não
// são deles.
let PORTA = 0;
const T = Date.parse('2026-08-30T21:00:00.000Z');

let navegador = null;
let servidor = null;

const temPlaywright = await import('playwright').then(() => true, () => false);
const CHROME = process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const podeCorrer = temPlaywright && fs.existsSync(CHROME);

before(async () => {
  if (!podeCorrer) return;
  const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  servidor = http.createServer((req, res) => {
    const caminho = req.url.split('?')[0];
    const f = path.join(SITE, caminho === '/' ? 'index.html' : caminho);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  PORTA = servidor.address().port;
  const { chromium } = await import('playwright');
  navegador = await chromium.launch({ executablePath: CHROME });
});

after(async () => {
  await navegador?.close();
  servidor?.close();
});

/** A Kick that answers from memory: two channels, one night, ten-second pieces. */
async function kickFalsa(pagina, { canais = ['tchubi', 'outro'], segmentos = 60 } = {}) {
  const playlist = () => {
    const l = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:12', '#EXT-X-PLAYLIST-TYPE:EVENT'];
    for (let i = 0; i < segmentos; i++) {
      l.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(T + i * 10000).toISOString()}`);
      l.push('#EXTINF:10.000,', `${i}.ts`);
    }
    return l.join('\n');
  };
  const master = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,FRAME-RATE=30.000',
    '160p30/playlist.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=9091454,RESOLUTION=1920x1080,FRAME-RATE=60.000',
    '1080p60/playlist.m3u8',
  ].join('\n');

  const pedidos = { api: 0, master: 0, playlist: 0, segmentos: 0 };

  await pagina.route('**/api/v2/channels/*/videos', async (rota) => {
    pedidos.api++;
    const slug = rota.request().url().match(/channels\/([^/]+)\/videos/)[1];
    if (!canais.includes(slug)) return rota.fulfill({ status: 404, body: '' });
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 1, session_title: 'noite', start_time: '2026-08-30 21:00:00',
        duration: segmentos * 10000, source: `https://cdn.fake/${slug}/master.m3u8`, video: {},
      }]),
    });
  });
  await pagina.route('https://cdn.fake/**', async (rota) => {
    const u = rota.request().url();
    if (u.endsWith('master.m3u8')) { pedidos.master++; return rota.fulfill({ status: 200, body: master }); }
    if (u.endsWith('playlist.m3u8')) { pedidos.playlist++; return rota.fulfill({ status: 200, body: playlist() }); }
    pedidos.segmentos++;
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: Buffer.alloc(4096, 7) });
  });
  // hls.js comes from a CDN this container cannot reach. Stub it: playback is
  // not what this test is about, and a missing global would hide real errors.
  await pagina.route('**/hls.min.js', (rota) => rota.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.Hls=function(){this.loadSource=function(){};this.attachMedia=function(){};'
      + 'this.destroy=function(){};};window.Hls.isSupported=function(){return true;};',
  }));
  return pedidos;
}

async function abrir() {
  const p = await navegador.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e.message)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|404/.test(m.text())) erros.push(m.text()); });
  return { p, erros };
}

test('a página abre sem um único erro de código', { skip: !podeCorrer && 'sem navegador' }, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  assert.deepEqual(erros, [], 'nada pode rebentar só por abrir');
  assert.equal(await p.isDisabled('#baixar'), true, 'sem marca, não há o que baixar');
  await p.close();
});

test('carrega a noite, mostra a grelha e põe todos no mesmo instante',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    assert.equal(await p.locator('.tile').count(), 2);
    assert.equal(await p.locator('.tile.foco').count(), 1, 'um foco, e um só');
    assert.equal(pedidos.api, 2, 'uma chamada por canal, não mais');
    // A grelha lê o degrau BARATO para tocar — o caro fica para o export.
    assert.equal(pedidos.playlist, 2, 'uma playlist por canal');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um canal que não existe aparece dito, não como quadrado vazio',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    await p.fill('#canais', 'tchubi\nnaoexiste');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    const texto = await p.locator('#listaCanais').innerText();
    assert.match(texto, /naoexiste/);
    assert.match(texto, /não existe/, 'tem de dizer o motivo');
    assert.equal(await p.locator('.tile').count(), 1, 'e não desenha um quadrado para ele');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('marcar e baixar produz um ficheiro por ângulo, em qualidade máxima',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#marcarIn');
    // Anda 25 s para a frente com o teclado, como um utilizador faria.
    for (let i = 0; i < 25; i++) await p.keyboard.press('l');
    await p.click('#marcarOut');
    assert.equal(await p.isDisabled('#baixar'), false, 'com marca válida, o botão liga');

    const antes = pedidos.segmentos;
    await p.click('#baixar');
    await p.waitForSelector('#fila a', { timeout: 20000 });

    const ligacoes = p.locator('#fila a');
    assert.equal(await ligacoes.count(), 2, 'um ficheiro por ângulo');
    const nome = await ligacoes.first().getAttribute('download');
    assert.match(nome, /^tchubi__2026\d{4}-\d{6}Z\.ts$/, 'o nome diz o canal e o instante');

    const linha = await p.locator('#fila li').first().innerText();
    assert.match(linha, /1080p60/, 'exporta o degrau de cima, não o 160p que estava no ecrã');
    assert.match(linha, /começa .* antes da tua marca/, 'diz onde o corte cai mesmo');

    const baixados = pedidos.segmentos - antes;
    assert.ok(baixados > 0 && baixados <= 12,
      `poucos segmentos, não o VOD: pediu ${baixados} de ${60 * 2}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('o aviso do leitor aparece quando o hls.js não carrega',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await kickFalsa(p);
    // Desta vez o CDN do hls.js está em baixo.
    await p.route('**/hls.min.js', (rota) => rota.abort());
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'domcontentloaded' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('#avisoPlayer:not([hidden])', { timeout: 10000 });
    assert.match(await p.locator('#avisoPlayer').innerText(), /hls\.js/,
      'sem isto os quadrados ficam pretos e ninguém sabe porquê');
    await p.close();
  });
