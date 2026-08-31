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

  const pedidos = { api: 0, master: 0, playlist: 0, segmentos: 0, caro: 0, barato: 0, busca: 0 };

  await pagina.route('**/api/search?**', async (rota) => {
    pedidos.busca++;
    const t = new URL(rota.request().url()).searchParams.get('searched_word') || '';
    const todos = [...canais, 'tchubizinho', 'outrolado'];
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        // Como a busca a serio: encontra por pedaco do nome, e nao so por
        // igualdade — e por isso um nome mal escrito ainda acha o certo.
        channels: todos.filter((c) => c.includes(t.toLowerCase().slice(0, 4)))
          .map((slug, i) => ({ slug, followersCount: 1000 - i * 10, is_live: i === 0 })),
      }),
    });
  });
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
    // O stub regista o que lhe mandam carregar e, ao fim de um instante, diz
    // que ja tem imagem — como um leitor a serio. Sem esse `loadeddata` a
    // pagina esperaria pelo limite de desistencia a cada movimento.
    body: 'window.__carregados=[];'
      + 'window.Hls=function(){var m=null;'
      + 'this.loadSource=function(u){window.__carregados.push(u);};'
      + 'this.attachMedia=function(v){m=v;setTimeout(function(){'
      + 'try{m.dispatchEvent(new Event("loadeddata"));}catch(e){}},30);};'
      + 'this.destroy=function(){};};'
      + 'window.Hls.isSupported=function(){return true;};',
  }));
  return pedidos;
}

async function abrir({ ecra } = {}) {
  const p = await navegador.newPage(ecra ? { viewport: ecra } : undefined);
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
  assert.equal(await p.locator('#corte').isVisible(), false, 'sem marca, não há o que cortar');
  await p.close();
});

// O slug da Kick nem sempre e o nome que se ve. Escrever o inicio e escolher
// e um passo a menos por cada canal, vezes trinta.
test('escrever o inicio do nome sugere canais e acrescenta-os a lista',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    await p.fill('#procurar', 't');
    await p.waitForTimeout(500);
    assert.equal(pedidos.busca, 0, 'uma letra nao chega para ir a rede');

    await p.fill('#procurar', 'tchubi');
    await p.waitForSelector('#sugestoes li', { timeout: 10000 });
    const itens = p.locator('#sugestoes li');
    assert.ok(await itens.count() >= 2, 'tchubi e tchubizinho');
    // Mais seguidos primeiro: e o desempate certo quando os nomes sao parecidos.
    assert.match(await itens.first().innerText(), /tchubi\b/);

    await itens.first().click();
    assert.equal(await p.locator('#canais').inputValue(), 'tchubi');
    assert.equal(await p.locator('#sugestoes').isVisible(), false, 'a lista fecha ao escolher');

    // O mesmo canal duas vezes nao pode entrar duas vezes.
    await p.fill('#procurar', 'tchubi');
    await p.waitForSelector('#sugestoes li', { timeout: 10000 });
    assert.equal(await p.locator('#sugestoes li.ja').count(), 1, 'o que ja la esta aparece marcado');
    await p.locator('#sugestoes li.ja').click();
    assert.equal(await p.locator('#canais').inputValue(), 'tchubi', 'e clicar nele nao duplica');

    // Setas e Enter, para quem nao tira a mao do teclado.
    await p.fill('#procurar', 'outro');
    // Esperar pelo CONTEUDO certo, e nao so por "ha uma lista": a lista da
    // busca anterior desaparece a seguir, e apanha-la era um teste verde
    // sobre a coisa errada.
    await p.waitForFunction(() => {
      const li = document.querySelector('#sugestoes li');
      return li && li.textContent.includes('outro');
    }, null, { timeout: 10000 });
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter');
    assert.match(await p.locator('#canais').inputValue(), /\noutro/);
    assert.deepEqual(erros, []);
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

    // O quadrado em foco tem de OCUPAR ESPACO, e nao so existir. Ja aconteceu
    // ficar com altura zero: continuava a tocar e a ter som, e nao se via — e
    // do lado de quem usa isso parece um canal a faltar, nao um bug de CSS.
    const caixa = await p.locator('.tile.foco').boundingBox();
    assert.ok(caixa && caixa.height > 150 && caixa.width > 300,
      `o foco esta invisivel: ${JSON.stringify(caixa)}`);
    const v = await p.locator('.tile.foco video').boundingBox();
    assert.ok(v && v.height > 140, `o video do foco esta invisivel: ${JSON.stringify(v)}`);
    // O frame INTEIRO. Com `cover` o topo e o fundo do jogo ficavam de fora —
    // e e no topo que esta o kill feed.
    for (const sel of ['.tile.foco video', '#grade .tile video']) {
      assert.equal(await p.locator(sel).first().evaluate((e) => getComputedStyle(e).objectFit),
        'contain', `${sel} esta a cortar o video`);
    }
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

// O bug apareceu no telemovel e nao no computador, por isso o teste tem de
// correr num ecra de telemovel. Um `aspect-ratio` dentro de um flex com base 0
// colapsa para altura zero em varios browsers moveis: o quadrado toca, tem som
// e nao se ve.
test('no ecra de um telemovel o foco continua a ocupar espaco',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro', 'terceiro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro\nterceiro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    const um = await p.locator('.tile.foco').boundingBox();
    assert.ok(um && um.height > 120, `foco invisivel com 1: ${JSON.stringify(um)}`);

    // E com dois lado a lado, que no telemovel passam a ficar empilhados.
    await p.locator('#grade .tile').first().locator('.par').click();
    await p.waitForFunction(() => document.querySelectorAll('#palcoFoco .tile').length === 2,
      null, { timeout: 10000 });
    for (const caixa of await p.locator('#palcoFoco .tile').all()
      .then((ts) => Promise.all(ts.map((t) => t.boundingBox())))) {
      assert.ok(caixa && caixa.height > 100, `foco invisivel com 2: ${JSON.stringify(caixa)}`);
    }
    // E a pagina nao pode ficar a andar para o lado num ecra estreito.
    const largura = await p.evaluate(() => ({
      corpo: document.documentElement.scrollWidth, ecra: window.innerWidth }));
    assert.ok(largura.corpo <= largura.ecra + 1, `a pagina passa do ecra: ${JSON.stringify(largura)}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Os quatro na mesma linha, sempre. Numa linha flex o quarto cai para baixo
// assim que o ecra aperta, e ai deixam de se ver como um conjunto.
test('os quatro botoes de salto ficam na mesma linha, ate no telemovel',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    const ys = await Promise.all(['#menos1m', '#menos10s', '#mais10s', '#mais1m']
      .map(async (id) => (await p.locator(id).boundingBox()).y));
    assert.ok(Math.max(...ys) - Math.min(...ys) < 2, `botoes em linhas diferentes: ${ys}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Sem VODs" sozinho nao chega: quem escreveu mal fica sem saber se errou ou
// se o canal existe mesmo e nao tem gravacoes.
test('um nome errado oferece o parecido, e um clique corrige e recarrega',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubixx');
    await p.click('#carregar');

    await p.waitForSelector('#listaCanais .parecidos button', { timeout: 15000 });
    const chip = p.locator('#listaCanais .parecidos button').first();
    assert.equal(await chip.innerText(), 'tchubi');
    assert.match(await p.locator('#listaCanais li').first().innerText(), /não existe na Kick/);

    await chip.click();
    await p.waitForSelector('.tile', { timeout: 15000 });
    // Troca, nao acrescenta: senao ficavam os dois na caixa e carregava ambos.
    assert.equal(await p.locator('#canais').inputValue(), 'tchubi');
    assert.equal(await p.locator('.tile').count(), 1);
    assert.deepEqual(erros, []);
    await p.close();
  });

// A queixa: "todas as lives carregam ao mesmo tempo e o principal fica lento;
// eu so quero ver se o principal esta no sitio certo". Entao o principal
// carrega sozinho, e os outros so depois de ele ter imagem.
test('o principal carrega primeiro, e sozinho; os outros vao a seguir',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro', 'terceiro', 'quarto'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro\nterceiro\nquarto');
    await p.click('#carregar');
    await p.waitForFunction(() => window.__carregados?.length === 1, null, { timeout: 15000 });

    const primeiro = (await p.evaluate(() => window.__carregados[0]));
    const principal = await p.locator('.tile.principal').getAttribute('data-slug');
    assert.match(primeiro, new RegExp(`/${principal}/`), 'o primeiro a carregar e o principal');
    assert.match(primeiro, /1080p60/, 'e vai em qualidade');
    // E sozinho: os outros tres ainda nao pediram nada.
    assert.equal((await p.evaluate(() => window.__carregados.length)), 1);

    await p.waitForFunction(() => window.__carregados?.length === 4, null, { timeout: 15000 });
    const todos = await p.evaluate(() => window.__carregados.slice());
    assert.equal(todos.filter((u) => u.includes('1080p60')).length, 1,
      'e so o principal e que sobe de qualidade');
    assert.deepEqual(erros, []);
    await p.close();
  });

// Dois toques seguidos num botao davam zoom na pagina inteira. Num sitio onde
// se anda a carregar em "10s" varias vezes de seguida, isso torna-o inutil no
// telemovel.
test('carregar duas vezes depressa num botao nao da zoom',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    for (const sel of ['#mais10s', '#menos1m', '#marcarIn', '.tile', '#alinhar']) {
      const t = await p.locator(sel).first().evaluate((e) => getComputedStyle(e).touchAction);
      assert.equal(t, 'manipulation', `${sel} ainda espera pelo segundo toque`);
    }

    // E os cliques rapidos contam todos, em vez de o segundo virar um gesto.
    const antes = await p.locator('#agora').innerText();
    for (let i = 0; i < 4; i++) await p.click('#mais10s', { delay: 0 });
    const depois = await p.locator('#agora').innerText();
    assert.notEqual(depois, antes, 'quatro toques tem de andar no tempo');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Aparece que estao online ou offline mas nao sei achar onde e que estao
// online, tenho de ficar a procurar." Uma barra por canal responde a isso de
// relance, e leva la com um clique.
test('cada canal tem uma barra a dizer quando esteve no ar, e clicar nela salta',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('#faixas .faixa', { timeout: 15000 });

    assert.equal(await p.locator('#faixas .faixa').count(), 2, 'uma barra por canal');
    assert.ok(await p.locator('#faixas .faixa .trilho i').count() >= 2, 'e com o tempo desenhado');
    assert.equal(await p.locator('#faixas .faixa.principal').count(), 1, 'o principal esta marcado');

    // Clicar perto do fim da barra tem de saltar para perto do fim da noite.
    const antes = await p.locator('#agora').innerText();
    const trilho = p.locator('#faixas .faixa .trilho').first();
    const caixa = await trilho.boundingBox();
    // Clique pelo elemento e nao por coordenadas soltas: o Playwright faz o
    // teste de acerto e falha alto se algo estiver por cima, em vez de clicar
    // no vazio e deixar o teste dizer "nao mudou".
    await trilho.click({ position: { x: caixa.width * 0.85, y: caixa.height / 2 } });
    const depois = await p.locator('#agora').innerText();
    assert.notEqual(depois, antes, 'clicar na barra tem de mudar o instante');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Ate agora nao sei como e que se baixa, tem algum botao?" Havia, mas so
// aparecia depois de marcar — ou seja, so o encontrava quem ja sabia.
test('a seccao de cortar diz o que fazer antes de haver marca',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    assert.equal(await p.locator('#comoCortar').isVisible(), true, 'sem marca, diz como se marca');
    assert.match(await p.locator('#comoCortar').innerText(), /I.*O/s);

    await p.click('#marcarIn');
    await p.click('#mais10s');
    await p.click('#marcarOut');
    await p.waitForSelector('#listaCorte li[data-slug]', { timeout: 10000 });
    assert.equal(await p.locator('#comoCortar').isVisible(), false, 'com marca, sai da frente');
    assert.equal(await p.locator('#listaCorte .baixarUm').count(), 1);
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

// Um ficheiro de cada vez, com o seu proprio tamanho — pedido do dono, que na
// pratica so baixa dois angulos e quer mais arranque num do que no outro.
test('cada canal baixa sozinho, no seu tamanho, em qualidade maxima',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#marcarIn');
    await p.click('#mais10s');                    // o botao de salto, nao 10 toques
    await p.click('#marcarOut');
    await p.waitForSelector('#corte:not([hidden])', { timeout: 10000 });

    const linhas = p.locator('#listaCorte li[data-slug]');
    assert.equal(await linhas.count(), 2, 'uma linha por angulo presente na marca');
    assert.equal(await linhas.first().locator('.dur').innerText(), '0:10');

    // Cinco segundos a mais no fim, so neste canal.
    await linhas.first().locator('.depois').fill('5');
    await linhas.first().locator('.depois').dispatchEvent('input');
    assert.equal(await linhas.first().locator('.dur').innerText(), '0:15');
    assert.equal(await linhas.nth(1).locator('.dur').innerText(), '0:10', 'o outro nao mexeu');

    const antes = pedidos.segmentos;
    await linhas.first().locator('.baixarUm').click();
    await p.waitForSelector('#fila a', { timeout: 20000 });

    assert.equal(await p.locator('#fila a').count(), 1, 'um ficheiro, nao dois');
    const nome = await p.locator('#fila a').first().getAttribute('download');
    assert.match(nome, /^tchubi__2026\d{4}-\d{6}Z\.ts$/, 'o nome diz o canal e o instante');

    const texto = await p.locator('#fila li').first().innerText();
    assert.match(texto, /1080p60/, 'exporta o degrau de cima, nao o 160p do ecra');
    assert.match(texto, /come.a .* antes da tua marca/, 'diz onde o corte cai mesmo');

    const baixados = pedidos.segmentos - antes;
    assert.ok(baixados > 0 && baixados <= 12,
      `poucos segmentos, nao o VOD: pediu ${baixados} de ${60 * 2}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Ver dois ao mesmo tempo: e assim que se decide se vale a pena baixar.
test('da para ver dois angulos ao mesmo tempo, os dois em qualidade',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro', 'terceiro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro\nterceiro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#palcoFoco .tile').count(), 1);

    await p.locator('#grade .tile').first().locator('.par').click();
    await p.waitForFunction(() => document.querySelectorAll('#palcoFoco .tile').length === 2,
      null, { timeout: 10000 });
    assert.equal(await p.locator('#grade .tile').count(), 1, 'o terceiro fica na grelha');

    // Se estao os dois no ecra, e para olhar para os dois: os dois em qualidade.
    await p.waitForFunction(
      () => window.__carregados.filter((u) => u.includes('1080p60')).length === 2,
      null, { timeout: 15000 });
    const todos = await p.evaluate(() => window.__carregados.slice());
    assert.equal(todos.filter((u) => u.includes('1080p60')).length, 2);
    assert.equal(todos.filter((u) => u.includes('160p30')).length, 1, 'e o terceiro fica no 160p');

    // Tres nao: volta a ser a grelha toda a descodificar.
    await p.locator('#grade .tile').first().locator('.par').click();
    await p.waitForTimeout(400);
    assert.equal(await p.locator('#palcoFoco .tile').count(), 2, 'o par e de dois, nao de tres');
    assert.deepEqual(erros, []);
    await p.close();
  });

// O som e de cada quadrado. Da para ter os dois a falar, os dois calados, ou
// um so — que e o que se quer quando se compara um tiro visto de dois sitios.
test('o som e de cada quadrado: pode estar nos dois, num, ou em nenhum',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.locator('#grade .tile').first().locator('.par').click();
    await p.waitForFunction(() => document.querySelectorAll('#palcoFoco .tile').length === 2,
      null, { timeout: 10000 });

    // Pela PROPRIEDADE e nao pelo atributo: o atributo do HTML fica la depois
    // de o som ligar, e um teste que olhe para ele da verde com tudo mudo.
    const comSom = () => p.evaluate(() => [...document.querySelectorAll('#palcoFoco .tile')]
      .filter((t) => !t.querySelector('video').muted).map((t) => t.dataset.slug));

    assert.equal((await comSom()).length, 1, 'por omissao so um fala');
    const calado = await p.locator('#palcoFoco .tile:not(.principal)').getAttribute('data-slug');

    await p.locator(`#palcoFoco .tile[data-slug="${calado}"] .som`).click();
    await p.waitForTimeout(200);
    assert.equal((await comSom()).length, 2, 'os dois podem falar ao mesmo tempo');

    for (const t of await p.locator('#palcoFoco .tile .som').all()) await t.click();
    await p.waitForTimeout(200);
    assert.equal((await comSom()).length, 0, 'e os dois podem estar calados');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Se travar a pagina e eu tiver que dar um F5, perco tudo."
test('um F5 devolve os canais, a noite, o instante e a marca',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#mais1m');
    await p.click('#mais10s');
    await p.click('#marcarIn');
    await p.click('#mais10s');
    await p.click('#marcarOut');
    await p.locator('#grade .tile').first().locator('.ajuste button[data-passo="1"]').click();
    await p.waitForSelector('#listaCorte li[data-slug]', { timeout: 10000 });
    const antes = {
      agora: await p.locator('#agora').innerText(),
      marca: await p.locator('#marca').innerText(),
      nudge: await p.locator('#grade .tile').first().locator('.nudge').innerText(),
    };
    await p.waitForTimeout(600);            // a gravacao e adiada, de proposito

    await p.reload({ waitUntil: 'networkidle' });
    // Volta a carregar sozinha: devolver a caixa preenchida mas sem video
    // obrigava a repetir a espera toda.
    await p.waitForSelector('.tile', { timeout: 20000 });
    assert.equal(await p.locator('#canais').inputValue(), 'tchubi\noutro');
    assert.equal(await p.locator('#agora').innerText(), antes.agora, 'o instante volta');
    assert.equal(await p.locator('#marca').innerText(), antes.marca, 'a marca volta');
    assert.equal(await p.locator('#grade .tile').first().locator('.nudge').innerText(), antes.nudge,
      'e o ajuste tambem');
    assert.equal(await p.locator('#listaCorte li[data-slug]').count(), 2, 'e a lista de corte');
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

// O fluxo do dono: marca-se a kill, e a pagina entrega a POV dele longa e as
// POVs de quem morreu curtinhas, ja numeradas para caírem em ordem no editor.
test('marcar kills gera a montagem, em ordem e com os ficheiros numerados',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    // Duas kills, com um minuto entre elas.
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.click('#mais1m');
    await p.keyboard.press('m');                       // a tecla, como no uso real
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 2,
      null, { timeout: 10000 });

    // Carregar depressa nao pode duplicar a mesma kill.
    await p.click('#marcarKill');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 2, 'a mesma kill conta uma vez');
    assert.match(await p.locator('#estadoMontagem').innerText(), /2 kills · 4 ficheiros/);

    const antes = pedidos.segmentos;
    await p.click('#baixarMontagem');
    await p.waitForFunction(() => document.querySelectorAll('#fila a').length === 4,
      null, { timeout: 30000 });

    const nomes = await p.locator('#fila a').evaluateAll((as) => as.map((a) => a.getAttribute('download')));
    // A ordem e a da montagem: a minha POV, depois quem morreu, e so entao a
    // kill seguinte. O numero no nome e o que faz isso sobreviver ao editor.
    assert.deepEqual(nomes.map((n) => n.slice(0, 3)), ['01a', '01b', '02a', '02b']);
    assert.match(nomes[0], /^01a_tchubi_/);
    assert.match(nomes[1], /^01b_vitima1_/);

    // E a POV do protagonista tem de ser mais longa do que a de quem morreu.
    const linhas = await p.locator('#fila li').allInnerTexts();
    assert.match(linhas[0], /a tua POV/);
    assert.match(linhas[1], /quem morreu/);

    const baixados = pedidos.segmentos - antes;
    assert.ok(baixados > 0 && baixados <= 24, `pediu ${baixados} segmentos — devia ser poucos`);
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
