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

// Segmentos de áudio verdadeiros, gerados uma vez com o ffmpeg e guardados em
// probes/fixtures/som/. Servem o teste do alinhamento pelo som: ataques em
// instantes irregulares, sem nada que se repita — porque com som periódico a
// correlação tem picos iguais em vários sítios e o teste passaria por sorte.
const SOM = new URL('../probes/fixtures/som/', import.meta.url).pathname;
const TEM_SOM = fs.existsSync(SOM);
const SEGS_SOM = TEM_SOM ? fs.readdirSync(SOM).filter((f) => f.endsWith('.ts')).sort() : [];

/**
 * A Kick that answers from memory: two channels, one night, ten-second pieces.
 *
 * `desviosS` desloca o PROGRAM-DATE-TIME de um canal sem mexer no conteúdo —
 * exactamente o que acontece a quem tem mais buffer no OBS, e o que o
 * alinhamento pelo som tem de medir e desfazer.
 */
async function kickFalsa(pagina, { canais = ['tchubi', 'outro'], segmentos = 60, comSom = false, desviosS = {} } = {}) {
  const quantos = comSom ? SEGS_SOM.length : segmentos;
  const playlist = (slug) => {
    const l = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:12', '#EXT-X-PLAYLIST-TYPE:EVENT'];
    const desvio = (desviosS[slug] || 0) * 1000;
    for (let i = 0; i < quantos; i++) {
      l.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(T + i * 10000 + desvio).toISOString()}`);
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

  const pedidos = { api: 0, master: 0, playlist: 0, segmentos: 0, caro: 0, barato: 0 };

  await pagina.route('**/api/v2/channels/*/videos', async (rota) => {
    pedidos.api++;
    const slug = rota.request().url().match(/channels\/([^/]+)\/videos/)[1];
    if (!canais.includes(slug)) return rota.fulfill({ status: 404, body: '' });
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 1, session_title: 'noite', start_time: '2026-08-30 21:00:00',
        duration: quantos * 10000, source: `https://cdn.fake/${slug}/master.m3u8`, video: {},
      }]),
    });
  });
  await pagina.route('https://cdn.fake/**', async (rota) => {
    const u = rota.request().url();
    const slug = u.match(/cdn\.fake\/([^/]+)\//)?.[1] || '';
    if (u.endsWith('master.m3u8')) { pedidos.master++; return rota.fulfill({ status: 200, body: master }); }
    if (u.endsWith('playlist.m3u8')) {
      pedidos.playlist++;
      if (u.includes('1080p60')) pedidos.caro++; else pedidos.barato++;
      return rota.fulfill({ status: 200, body: playlist(slug) });
    }
    pedidos.segmentos++;
    const n = Number(u.match(/(\d+)\.ts$/)?.[1] ?? 0);
    const corpo = comSom && SEGS_SOM[n]
      ? fs.readFileSync(path.join(SOM, SEGS_SOM[n]))
      : Buffer.alloc(4096, 7);
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: corpo });
  });
  // hls.js comes from a CDN this container cannot reach. Stub it: playback is
  // not what this test is about, and a missing global would hide real errors.
  await pagina.route('**/hls.min.js', (rota) => rota.fulfill({
    status: 200,
    contentType: 'text/javascript',
    // O stub regista o que lhe mandam carregar. Sem isto não há como ver
    // QUAL degrau da escada cada quadrado pediu — que é a decisão inteira.
    body: 'window.__carregados=[];'
      + 'window.Hls=function(){this.loadSource=function(u){window.__carregados.push(u);};'
      + 'this.attachMedia=function(){};this.destroy=function(){};};'
      + 'window.Hls.isSupported=function(){return true;};',
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

// O pedido do dono, e a razão de trinta ângulos serem possíveis: só um vídeo
// corre. Os outros ficam parados no frame daquele instante — acompanham, não
// tocam. Trinta descodificadores a andar ao mesmo tempo derretem a máquina.
test('só o ângulo em foco toca em qualidade; os outros acompanham parados',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p, { canais: ['tchubi', 'outro', 'terceiro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro\nterceiro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    // O foco carrega já; os parados só depois de a barra descansar 220 ms.
    // Esperar pelos três é, em si, a prova de que os secundários são adiados.
    await p.waitForFunction(() => window.__carregados?.length === 3, null, { timeout: 10000 });

    const carregados = () => p.evaluate(() => window.__carregados.slice());
    const caros = (l) => l.filter((u) => u.includes('1080p60'));

    // Um só pede o degrau de cima. Os outros ficam no 160p.
    const l1 = await carregados();
    assert.equal(l1.length, 3, 'um leitor por quadrado');
    assert.equal(caros(l1).length, 1, `${caros(l1).length} em alta qualidade — devia ser 1`);
    assert.equal(await p.locator('.tile.foco').count(), 1);

    // E toda a gente diz onde está dentro do vídeo dela, mesmo parada.
    for (const t of await p.locator('.tile .posicao').allInnerTexts()) {
      assert.match(t, /^\d+:\d{2}$/, `posição ilegível: "${t}"`);
    }

    // Mudar o foco não acumula: continua a haver um só em alta.
    await p.locator('.tile:not(.foco)').first().click();
    await p.waitForTimeout(600);
    const l2 = await carregados();
    assert.equal(caros(l2).length - caros(l1).length, 1,
      'o novo foco pede uma vez, e mais nada sobe de qualidade');
    assert.equal(await p.locator('.tile.foco').count(), 1);
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

// O dono disse que 10–20 s de diferença chega, e que talvez tenha de alinhar
// à mão. Então o alinhar à mão tem de existir no ecrã, ser por canal, e não
// pode roubar o foco ao ser clicado.
test('o ajuste manual existe, é por canal, e não muda o foco',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    const segundo = p.locator('.tile:not(.foco)').first();
    const focoAntes = await p.locator('.tile.foco').getAttribute('data-slug');

    await segundo.locator('.ajuste button[data-passo="1"]').click();
    await segundo.locator('.ajuste button[data-passo="1"]').click();
    assert.equal(await segundo.locator('.nudge').innerText(), '+2.0s');
    assert.equal(await p.locator('.tile.foco').getAttribute('data-slug'), focoAntes,
      'ajustar um ângulo não o promove a foco');
    assert.equal(await p.locator('.tile.foco .nudge').innerText(), '0.0s',
      'o empurrão é só daquele canal');

    await segundo.locator('.ajuste button[data-passo="-1"]').click({ modifiers: ['Shift'] });
    assert.equal(await segundo.locator('.nudge').innerText(), '-8.0s', 'Shift anda 10 s');
    assert.deepEqual(erros, []);
    await p.close();
  });

// O teste que fecha o assunto: um canal com o carimbo desviado 3 s, o mesmo
// som nos dois, e o botão a repor a diferença sozinho. Prova a ligação toda —
// baixar, tirar o áudio do MPEG-TS, descodificar no browser, correlacionar e
// escrever o ajuste na grelha.
test('o alinhamento pelo som mede um desvio de 3 s e corrige-o',
  { skip: (!podeCorrer && 'sem navegador') || (!TEM_SOM && 'sem fixture de som') }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { comSom: true, desviosS: { outro: 3 } });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#alinhar');
    await p.waitForFunction(
      () => /alinhados|não deu|não descodifica/.test(document.getElementById('estadoAlinhar').textContent),
      null, { timeout: 120000 });
    const texto = await p.locator('#estadoAlinhar').innerText();

    const nudge = async (slug) => Number(
      (await p.locator(`.tile[data-slug="${slug}"] .nudge`).innerText()).replace('s', ''));
    const a = await nudge('tchubi');
    const b = await nudge('outro');

    if (/não descodifica/.test(texto)) {
      // O Chromium open-source não traz AAC, e sem AAC nem os VODs da Kick
      // tocam. A conta em si está coberta em test/alinhar.test.mjs e medida
      // contra áudio verdadeiro; o que se exige aqui é que a página o DIGA e
      // não invente ajustes nenhuns.
      assert.equal(a, 0, 'sem descodificador não se inventa um ajuste');
      assert.equal(b, 0);
      return p.close();
    }

    assert.match(texto, /2 de 2 alinhados pelo som/, `deu: ${texto}`);
    // `outro` diz que os pedaços dele são 3 s mais tarde do que são, logo num
    // dado carimbo mostra um momento mais antigo: tem de avançar 3 s.
    assert.ok(Math.abs((b - a) - 3) < 0.4, `esperava 3 s de diferença, deu ${(b - a).toFixed(2)} (${a} / ${b})`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('sem áudio nenhum, o alinhamento diz que não deu em vez de rebentar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p);                       // segmentos de enchimento, sem faixa de som
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#alinhar');
    await p.waitForFunction(
      () => /alinhados|não deu|não descodifica/.test(document.getElementById('estadoAlinhar').textContent),
      null, { timeout: 60000 });
    assert.match(await p.locator('#estadoAlinhar').innerText(), /sem som em comum|0 de 2|não descodifica/);
    assert.equal(await p.locator('.tile.foco .nudge').innerText(), '0.0s',
      'não inventa um ajuste quando não mediu nada');
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
