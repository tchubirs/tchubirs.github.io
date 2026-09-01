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
import os from 'node:os';
import { execFileSync } from 'node:child_process';

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

async function abrir({ ecra, idioma = 'pt' } = {}) {
  // Idioma fixo, e nao o do sistema: os testes leem frases, e uma maquina de
  // CI noutra lingua fazia-os falhar por uma razao que nao e a deles.
  const p = await navegador.newPage({
    ...(ecra ? { viewport: ecra } : {}),
    locale: idioma === 'pt' ? 'pt-PT' : idioma,
  });
  await p.addInitScript((l) => {
    // So quando ainda nao ha escolha: este guiao corre em CADA navegacao, e a
    // escrever sempre apagava a lingua que o proprio teste tinha acabado de
    // escolher — e o F5 parecia estar a perde-la.
    try { if (!localStorage.getItem('replay.idioma')) localStorage.setItem('replay.idioma', l); } catch { /* nada */ }
  }, idioma);
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

    await p.locator(`#palcoFoco .tile[data-slug="${calado}"] .somBtn`).click();
    await p.waitForTimeout(200);
    assert.equal((await comSom()).length, 2, 'os dois podem falar ao mesmo tempo');

    for (const t of await p.locator('#palcoFoco .tile .somBtn').all()) await t.click();
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

    // Sem ninguem marcado como morto sai SO a POV do dono. Cortar todos os
    // angulos em cada kill dava quatro clipes de lixo por cada um bom — foi
    // exactamente isso que ele apanhou no uso real: 6 kills, 36 ficheiros.
    assert.match(await p.locator('#estadoMontagem').innerText(), /2 kills · 2 ficheiros/);
    assert.match(await p.locator('#estadoMontagem').innerText(), /2 sem ninguém marcado/);

    // Marcar quem morreu em cada uma. A lista e reconstruida a cada clique,
    // por isso o elemento tem de ser procurado outra vez — guardar a
    // referencia dava um segundo clique num no que ja nao existe.
    const quantas = await p.locator('#listaMomentos li[data-ms]').count();
    for (let i = 0; i < quantas; i++) {
      await p.locator('#listaMomentos li[data-ms]').nth(i)
        .locator('.vit[data-canal="vitima1"]').click();
    }
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

// "Podia aparecer a linha do tempo em baixo dessas barras, igual ao Premiere."
// Sem regua sabe-se que se esta "algures no meio" e mais nada.
test('a regua mostra as horas por baixo das barras, e as kills marcadas nela',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('#regua .hora', { timeout: 15000 });

    const horas = await p.locator('#regua .hora').allInnerTexts();
    assert.ok(horas.length >= 2 && horas.length <= 9, `${horas.length} marcas e demais ou de menos`);
    for (const h of horas) assert.match(h, /^\d{2}:\d{2}$/, `marca ilegivel: ${h}`);
    // Em ordem, e dentro da noite.
    assert.deepEqual(horas, [...horas].sort());

    // As kills aparecem na regua, numeradas, e clicar numa salta para la.
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#regua .kill', { timeout: 10000 });
    assert.equal(await p.locator('#regua .kill').count(), 1);
    assert.equal(await p.locator('#regua .kill span').innerText(), '1');

    await p.click('#menos1m');
    const fora = await p.locator('#agora').innerText();
    await p.locator('#regua .kill').click();
    assert.notEqual(await p.locator('#agora').innerText(), fora, 'clicar na kill salta para ela');

    // E a regua alinha com as faixas: a mesma coluna de nomes a esquerda.
    const [rx, fx] = await Promise.all([
      p.locator('#regua').boundingBox(),
      p.locator('#faixas .trilho').first().boundingBox(),
    ]);
    assert.ok(Math.abs(rx.x - fx.x) < 2 && Math.abs(rx.width - fx.width) < 2,
      `regua desalinhada das barras: ${JSON.stringify({ rx, fx })}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Como e que eu reseto isto?" Nao havia como. E cada ficheiro gerado ficava
// INTEIRO na memoria: trinta e seis clipes sao quase meio giga de RAM presa.
test('da para limpar a lista e recomecar, e a memoria e mesmo devolvida',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.locator('#listaMomentos .vit[data-canal="vitima1"]').click();
    await p.click('#baixarMontagem');
    await p.waitForFunction(() => document.querySelectorAll('#fila a').length === 2,
      null, { timeout: 30000 });
    // Dois, e nao tres: o ZIP e feito dos mesmos pedacos que ja estao na
    // lista, e soma-lo outra vez dizia-lhe o dobro do que esta mesmo preso.
    assert.match(await p.locator('#memoria').innerText(), /2 ficheiros/, 'diz quanto esta preso');

    // Os enderecos tem de ser SOLTOS, e nao so apagados da lista: apagar a
    // lista deixava os Blobs presos para sempre. O do ZIP conta aqui — nao
    // entra na conta da memoria, mas segura os mesmos bytes enquanto existir.
    const urls = await p.evaluate(() => [...document.querySelectorAll('#fila a, #zip a')].map((a) => a.href));
    assert.equal(urls.length, 3, 'os dois clipes e o ZIP');
    await p.click('#limparFila');
    assert.equal(await p.locator('#fila a').count(), 0);
    assert.equal(await p.locator('#memoria').innerText(), '');
    const vivos = await p.evaluate(async (lista) => {
      let n = 0;
      for (const u of lista) { try { await fetch(u); n++; } catch { /* solto */ } }
      return n;
    }, urls);
    assert.equal(vivos, 0, 'os ficheiros continuam a ocupar memoria');

    // E as kills continuam la: limpar a lista nao e recomecar.
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 1);

    // Recomecar apaga tudo e volta ao principio.
    p.on('dialog', (d) => d.accept());
    await p.click('#recomecar');
    await p.waitForFunction(() => document.getElementById('canais').value === '',
      null, { timeout: 20000 });
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 0);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Escolher quem morreu e para ser a funcao do app — nao faco ideia de quem
// matei, por isso e que ia ver o ecra de todos." O botao existe, olha por
// todos, e diz o que conseguiu ou nao conseguiu ver.
test('o botao de quem morreu olha por todos e nunca finge ter visto',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos .verMortes', { timeout: 10000 });
    await p.click('#listaMomentos .verMortes');

    // Um cartao por canal, sempre — mesmo quando o video nao se consegue ler.
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos .cartao').length === 2,
      null, { timeout: 60000 });
    const texto = await p.locator('#listaMomentos .olhar .nota').first().innerText();

    // Este Chromium nao traz H.264, por isso nao ha frames. O que se exige e
    // que a pagina DIGA isso, em vez de apontar alguem sem ter visto nada.
    if (/não consegui ver/.test(texto)) {
      assert.equal(await p.locator('#listaMomentos .cartao.morreu').count(), 0,
        'sem imagens nao se aponta ninguem');
      assert.equal(await p.locator('#listaMomentos .semImagem').count(), 2);
    } else {
      assert.match(texto, /morreu|ninguém se destacou/);
      assert.ok(await p.locator('#listaMomentos .cartao.morreu').count() <= 2);
    }

    // E clicar num cartao marca-o como morto, de uma maneira ou de outra.
    await p.locator('#listaMomentos .cartao[data-canal="vitima1"]').click();
    await p.waitForSelector('#listaMomentos .vit[data-canal="vitima1"].sim', { timeout: 10000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// O pause e global de proposito: o valor desta pagina e os angulos andarem
// juntos, e parar so um quadrado desfazia isso sem dizer nada.
test('o pause para tudo, e a barra de espaco faz o mesmo',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile.foco .pausa', { timeout: 15000 });

    assert.equal(await p.locator('.tile.foco .pausa').innerText(), '⏸');
    await p.click('.tile.foco .pausa');
    await p.waitForFunction(() => document.querySelector('.tile.foco .pausa').textContent === '▶',
      null, { timeout: 5000 });
    const parados = await p.evaluate(() => [...document.querySelectorAll('.tile video')].every((v) => v.paused));
    assert.equal(parados, true, 'parar e parar tudo');

    // E andar no tempo durante a pausa nao pode fazer o video voltar a andar:
    // o botao dizia parado e o quadrado andava.
    await p.click('#mais10s');
    assert.equal(await p.locator('.tile.foco .pausa').innerText(), '▶');

    await p.keyboard.press(' ');
    await p.waitForFunction(() => document.querySelector('.tile.foco .pausa').textContent === '⏸',
      null, { timeout: 5000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// Um nome mal escrito ficava na lista para sempre: a unica saida era ir a
// caixa de texto e apaga-lo a mao.
test('da para tirar um canal da lista com um clique',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#listaCanais li[data-slug]').count(), 2);

    await p.locator('#listaCanais li[data-slug="outro"] .tirar').click();
    await p.waitForFunction(() => document.getElementById('canais').value === 'tchubi',
      null, { timeout: 10000 });
    // E recarrega sozinho, senao a grelha ficava a mostrar quem ja nao esta na lista.
    await p.waitForFunction(() => document.querySelectorAll('.tile').length === 1,
      null, { timeout: 15000 });
    assert.equal(await p.locator('#listaCanais li[data-slug]').count(), 1);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Adicionei o wowi depois e nao o vejo ai para selecionar." O canal estava la
// — o que mudou foi a NOITE: acrescentar alguem que esta ao vivo agora criava
// uma noite nova, de hoje, que passava a ser a mais recente e roubava o ecra.
test('acrescentar um canal a meio nao muda a noite em que se esta',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'novato'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#mais1m');
    const onde = await p.locator('#agora').innerText();
    const noite = await p.locator('#noite').inputValue();

    // Acrescentar outro canal e recarregar.
    await p.fill('#canais', 'tchubi\nnovato');
    await p.click('#carregar');
    await p.waitForFunction(() => document.querySelectorAll('.tile').length === 2,
      null, { timeout: 20000 });

    assert.equal(await p.locator('#noite').inputValue(), noite, 'a noite tem de ser a mesma');
    assert.equal(await p.locator('#agora').innerText(), onde, 'e o instante tambem');
    assert.equal(await p.locator('#listaCanais li[data-slug="novato"]').count(), 1);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Tres linguas, e a pagina inteira em qualquer uma delas — incluindo o que ja
// esta no ecra. Trocar de lingua nao pode obrigar a recarregar nem perder a
// noite aberta.
test('a pagina fala portugues, ingles e espanhol, e troca sem perder nada',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#mais1m');
    const instante = await p.locator('#agora').innerText();

    assert.equal(await p.locator('#carregar').innerText(), 'Carregar');
    assert.equal(await p.locator('html').getAttribute('lang'), 'pt');

    await p.selectOption('#idioma', 'en');
    await p.waitForFunction(() => document.getElementById('carregar').textContent === 'Load',
      null, { timeout: 5000 });
    assert.equal(await p.locator('html').getAttribute('lang'), 'en');
    assert.match(await p.title(), /many angles/);
    // O que ja estava no ecra tambem muda, e nao so os botoes parados.
    assert.match(await p.locator('#angulos').innerText(), /of \d+ angles/);
    assert.match(await p.locator('#comoCortar').innerText(), /Mark with/);
    // E nada se perde na troca.
    assert.equal(await p.locator('#agora').innerText(), instante, 'o instante fica');
    assert.equal(await p.locator('.tile').count(), 2, 'e a grelha tambem');

    await p.selectOption('#idioma', 'es');
    await p.waitForFunction(() => document.getElementById('carregar').textContent === 'Cargar',
      null, { timeout: 5000 });
    assert.match(await p.locator('#angulos').innerText(), /de \d+ ángulos/);

    // E a escolha sobrevive ao F5.
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.getElementById('carregar').textContent === 'Cargar',
      null, { timeout: 15000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// A funcao automatica: ouvir a POV do dono a procura de tiroteios e depois
// olhar para quem morreu. Neste navegador nao ha codec da Kick, por isso o que
// se exige e que a pagina o DIGA, e nao que invente kills sem ter ouvido nada.
test('a busca automatica nunca inventa kills que nao ouviu',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    // O custo e dito ANTES, e da para dizer que nao.
    const perguntas = [];
    p.on('dialog', (d) => { perguntas.push(d.message()); d.dismiss(); });
    await p.click('#procurarKills');
    await p.waitForTimeout(500);
    assert.equal(perguntas.length, 1, 'tem de perguntar antes de baixar');
    assert.match(perguntas[0], /MB/, 'e dizer quantos MB sao');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 0, 'e nao fazer nada se disser que nao');

    // E agora a dizer que sim.
    p.removeAllListeners('dialog');
    p.on('dialog', (d) => d.accept());
    await p.click('#procurarKills');
    await p.waitForFunction(
      // Todos os fins possiveis: achou, nao achou, ou o navegador nao
      // descodifica. Um destes TEM de aparecer — ficar calada era o pior dos
      // casos, e e isso que este limite de tempo apanha.
      () => /detetados|Nenhum tiroteio|no firefight|descodifica|não deu/.test(
        document.getElementById('estadoMontagem').textContent),
      null, { timeout: 90000 },
    );
    const texto = await p.locator('#estadoMontagem').innerText();
    // Sem codec nao ha audio: o que nao pode e aparecerem kills na lista.
    if (!/achei \d/.test(texto)) {
      assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 0,
        `disse "${texto}" e mesmo assim marcou kills`);
    }
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

// Uma noite varrida da dezenas de candidatos e a maioria nao e kill. Este e o
// gesto que a limpa: filtrar pelo que falta decidir, seleccionar tudo isso,
// apagar — e conseguir voltar atras quando o dedo escorrega.
test('filtrar, seleccionar aos molhos, apagar e anular',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    for (let i = 0; i < 3; i++) { await p.click('#mais1m'); await p.click('#marcarKill'); }
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 3,
      null, { timeout: 10000 });

    // So a do meio tem morte confirmada.
    await p.locator('#listaMomentos li[data-ms]').nth(1).locator('.vit[data-canal="vitima1"]').click();
    assert.equal(await p.locator('#listaMomentos li.confirmada').count(), 1,
      'a lista tem de dizer quais ja estao prontas sem ele ler nada');

    await p.selectOption('#filtroMomentos', 'comMorte');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 1);
    // O filtro nao pode esconder trabalho em silencio: a montagem que se
    // descarrega continua a ser a lista inteira.
    assert.match(await p.locator('#estadoMontagem').innerText(), /2 ocultos/);

    await p.selectOption('#filtroMomentos', 'semMorte');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 2);

    // "Seleccionar tudo" e tudo o que ESTA A VER. Se apanhasse tambem o que
    // esta escondido, este clique apagava-lhe a unica kill boa.
    await p.click('#selecionarTudo');
    assert.match(await p.locator('#estadoSelecao').innerText(), /2 selecionados/);
    await p.click('#apagarSelecionados');

    await p.selectOption('#filtroMomentos', 'todos');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 1,
      'sobrou a que tinha morte confirmada, e so essa');

    await p.click('#anularApagar');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 3, 'anular devolve as tres');
    assert.equal(await p.locator('#listaMomentos li.confirmada').count(), 1,
      'e devolve-as como estavam, com a morte marcada onde estava');
    assert.equal(await p.locator('#anularApagar').isVisible(), false, 'anular duas vezes nao duplica nada');
  });

// A numeracao da lista e a que vai no nome do ficheiro. Com o filtro ligado,
// contar as linhas visiveis dava dois numeros diferentes para a mesma kill —
// um no ecra e outro na mesa de montagem.
test('o numero de cada kill nao muda quando o filtro esconde as outras',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    for (let i = 0; i < 3; i++) { await p.click('#mais1m'); await p.click('#marcarKill'); }
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 3,
      null, { timeout: 10000 });
    await p.locator('#listaMomentos li[data-ms]').nth(2).locator('.vit[data-canal="vitima1"]').click();

    await p.selectOption('#filtroMomentos', 'comMorte');
    assert.equal(await p.locator('#listaMomentos li[data-ms] .n').first().innerText(), '03',
      'a terceira kill continua a ser a terceira, mesmo sendo a unica na lista');
  });

// Trinta e seis cliques para guardar uma montagem eram trinta e cinco a mais.
// Este teste nao se fica pelo botao aparecer: tira o ZIP de dentro do browser,
// escreve-o no disco e manda o `unzip` do sistema verifica-lo. E o `unzip` que
// decide se isto presta, e nao codigo meu a ler codigo meu.
test('a montagem sai num ZIP so, e o unzip do sistema aceita-o',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    // Duas kills, e em ambas alguem morreu — sao quatro clipes.
    for (let i = 0; i < 2; i++) { await p.click('#mais1m'); await p.click('#marcarKill'); }
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 2,
      null, { timeout: 10000 });
    for (let i = 0; i < 2; i++) {
      await p.locator('#listaMomentos li[data-ms]').nth(i).locator('.vit[data-canal="vitima1"]').click();
    }

    await p.click('#baixarMontagem');
    await p.waitForSelector('#zip a', { timeout: 40000 });
    assert.equal(await p.locator('#fila a').count(), 4, 'quatro clipes na lista, um a um');

    const nome = await p.locator('#zip a').getAttribute('download');
    assert.match(nome, /^montagem-\d{4}-\d{2}-\d{2}\.zip$/);

    // Os bytes que o browser daria a quem clicasse.
    const dados = await p.evaluate(async () => {
      const r = await fetch(document.querySelector('#zip a').href);
      return [...new Uint8Array(await r.arrayBuffer())];
    });
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-pagina-')), nome);
    fs.writeFileSync(f, Buffer.from(dados));

    assert.match(execFileSync('unzip', ['-t', f], { encoding: 'utf8' }), /No errors detected/);
    const dentro = execFileSync('unzip', ['-Z1', f], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(dentro.length, 4, 'os quatro clipes estao la dentro');
    // A ordem da montagem — a POV dele primeiro, a de quem morreu a seguir —
    // e a ordem por que ele monta. Um ZIP que a baralhasse dava-lhe trabalho.
    assert.deepEqual(dentro.map((n) => n.slice(0, 6)), ['01a_tc', '01b_vi', '02a_tc', '02b_vi']);
    // E os clipes tem de ter mesmo video la dentro, e nao zero bytes.
    const tamanhos = execFileSync('unzip', ['-l', f], { encoding: 'utf8' });
    assert.ok(!/\n\s+0\s+2026/.test(tamanhos), `um clipe saiu vazio:\n${tamanhos}`);

    // "Limpar a lista" solta os enderecos; deixar la o botao do ZIP dava um
    // link que parecia bom e descarregava nada.
    await p.click('#limparFila');
    assert.equal(await p.locator('#zip a').count(), 0);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Seis ângulos ao mesmo tempo, e não um de cada vez.
//
// Em fila indiana isto eram seis esperas somadas por cada kill, e a busca
// automática faz isto vinte vezes seguidas. Aqui não há descodificador, por
// isso cada ângulo desiste ao fim de um tempo fixo — o que torna a diferença
// entre as duas maneiras mensurável: em fila, seis desistências somadas.
test('os seis ângulos são vistos ao mesmo tempo, e não um de cada vez',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const canais = ['tchubi', 'c2', 'c3', 'c4', 'c5', 'c6'];
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', canais.join('\n'));
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    const comecou = Date.now();
    await p.locator('#listaMomentos .verMortes').click();
    await p.waitForFunction(() => {
      const c = document.querySelector('#listaMomentos .olhar');
      return c && !/A identificar|a olhar/.test(c.innerText);
    }, null, { timeout: 60000 });
    const demorou = Date.now() - comecou;

    // Medido nesta máquina, com seis ângulos: em fila indiana 10,9 s. O limite
    // está bem abaixo disso e bem acima do que a versão em paralelo demora,
    // para não falhar num dia mau da máquina nem deixar passar uma regressão.
    assert.ok(demorou < 4000, `demorou ${demorou} ms — os ângulos voltaram a ser vistos em fila`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Só consigo baixar todos de uma vez, não consigo baixar um."
//
// Numa noite de quinze kills, querer a terceira e ter de esperar pelas quinze
// é ridículo. E o número do ficheiro tem de continuar a ser o da montagem
// inteira — senão o mesmo clipe tem um nome quando vem sozinho e outro quando
// vem com os irmãos.
test('dá para baixar uma kill só, e o número dela não muda por isso',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    for (let i = 0; i < 3; i++) { await p.click('#mais1m'); await p.click('#marcarKill'); }
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 3,
      null, { timeout: 10000 });
    await p.locator('#listaMomentos li[data-ms]').nth(1).locator('.vit[data-canal="vitima1"]').click();

    // Só a segunda, e ela tem dois ângulos.
    await p.locator('#listaMomentos li[data-ms]').nth(1).locator('.baixarUma').click();
    await p.waitForFunction(() => document.querySelectorAll('#fila a').length === 2,
      null, { timeout: 40000 });
    const nomes = await p.locator('#fila a').evaluateAll((as) => as.map((a) => a.getAttribute('download')));
    assert.deepEqual(nomes.map((n) => n.slice(0, 3)), ['02a', '02b'], 'continua a ser a segunda kill');

    // E a terceira junta-se em baixo, em vez de apagar a que ele já tinha.
    await p.locator('#listaMomentos li[data-ms]').nth(2).locator('.baixarUma').click();
    await p.waitForFunction(() => document.querySelectorAll('#fila a').length === 3,
      null, { timeout: 40000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Tem comentário a falar de grupo, e eu só tenho um VOD."
//
// Com um canal só não há quem morreu para escolher, não há nada para alinhar,
// não há "1 de 1 ângulos" a vermelho como se faltasse alguém, e não há "todos
// juntos". São rótulos de um caso que não é o dele, a encher um telemóvel.
test('com um canal só, a página não fala de grupo',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    assert.equal(await p.locator('#alinhar').isVisible(), false, 'não há nada para alinhar');
    assert.equal(await p.locator('#angulos').innerText(), '');
    assert.equal(await p.locator('#listaMomentos .verMortes').count(), 0);
    assert.equal(await p.locator('#listaMomentos .vitimas').count(), 0);
    assert.ok(!/todos juntos/.test(await p.locator('#resumoNoite').innerText()));
    assert.ok(!/sem ninguém marcado/.test(await p.locator('#estadoMontagem').innerText()),
      await p.locator('#estadoMontagem').innerText());
    // O que INTERESSA continua lá: ir ao momento e baixá-lo.
    assert.equal(await p.locator('#listaMomentos .baixarUma').count(), 1);
    assert.equal(await p.locator('#listaMomentos .ver').count(), 1);
    assert.deepEqual(erros, []);
    await p.close();
  });

// E com dois canais tudo isso volta: o que se esconde é por ser inútil naquele
// momento, e não por ter deixado de existir.
test('com dois canais, tudo o que é de grupo volta',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    assert.equal(await p.locator('#alinhar').isVisible(), true);
    assert.match(await p.locator('#angulos').innerText(), /de 2/);
    assert.equal(await p.locator('#listaMomentos .verMortes').count(), 1);
    await p.close();
  });

// "Não consegui ver ainda se os clipes estão bons ou não."
//
// A busca pelo som dá quinze candidatos e a maioria não presta. Até agora a
// única maneira de saber era descarregar e abrir no editor. O botão "ver" toca
// exactamente o pedaço que ia sair no ficheiro — os mesmos segundos, senão
// mostrava-lhe uma coisa e entregava-lhe outra.
test('dá para ver a kill antes de a baixar, e a prévia é o mesmo pedaço do ficheiro',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    // Margens diferentes das de origem, para o teste não passar por acaso.
    await p.fill('#protAntes', '7');
    await p.fill('#protDepois', '3');
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
    const ms = Number(await p.locator('#listaMomentos li[data-ms]').getAttribute('data-ms'));

    await p.locator('#listaMomentos .ver').click();
    // Saltou para o princípio do clipe: sete segundos antes da kill.
    const previa = await p.evaluate(() => window.__estado?.previa ?? null);
    assert.deepEqual(previa && { de: previa.de - ms, ate: previa.ate - ms }, { de: -7000, ate: 3000 });
    assert.equal(await p.locator('#listaMomentos .ver.aVer').count(), 1, 'a linha diz que está a ver');
    assert.match(await p.locator('#listaMomentos .ver').innerText(), /Parar/);

    // Carregar outra vez desliga.
    await p.locator('#listaMomentos .ver').click();
    assert.equal(await p.locator('#listaMomentos .ver.aVer').count(), 0);
    assert.equal(await p.evaluate(() => window.__estado?.previa ?? null), null);

    // E navegar à mão também: se ele foi procurar outra coisa, não pode ficar
    // a ser puxado de volta para o clipe em ciclo.
    await p.locator('#listaMomentos .ver').click();
    assert.equal(await p.locator('#listaMomentos .ver.aVer').count(), 1);
    await p.click('#mais10s');
    assert.equal(await p.locator('#listaMomentos .ver.aVer').count(), 0, 'saltar desliga a prévia');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Assisti todos os clipes automáticos e estão todos errados."
//
// O problema de fundo era eu estar a adivinhar o que é o som de uma kill. Ele
// descreveu quatro sons, e três deles são amostras do jogo — o mesmo ficheiro
// tocado outra vez, sempre igual. Então ele aponta UMA kill que sabe que foi
// kill, e a página procura essa mesma forma de onda na noite inteira.
//
// Aqui o som é posto à mão porque este Chromium não descodifica AAC. O que se
// testa é a costura: o botão só aparece quando há som guardado, aprende com o
// estouro certo, e a lista passa a ser o que ele confirmou.
test('marcar uma kill a sério faz a página procurar o mesmo som na noite',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    // Sem varredura nao ha som guardado, e o botao nao pode existir: prometia
    // uma coisa que a pagina nao sabe fazer.
    assert.equal(await p.locator('#listaMomentos .foiKill').count(), 0);

    const ms = Number(await p.locator('#listaMomentos li[data-ms]').getAttribute('data-ms'));
    // Uma noite falsa: o MESMO som em quatro instantes, e um som diferente
    // noutros dois. So os quatro podem sobrar.
    await p.evaluate(({ ms: m }) => {
      const n = 1440;
      const forma = (semente) => {
        let s = semente >>> 0;
        const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
        const v = new Float32Array(n);
        let e = 0;
        for (let k = 0; k < n; k++) { v[k] = Math.exp(-k / 240) * r(); e += v[k] * v[k]; }
        for (let k = 0; k < n; k++) v[k] /= Math.sqrt(e);
        return v;
      };
      const acerto = forma(11);
      const outro = forma(999);
      window.__estado.estouros = [
        { ms: m, altura: 40, recorte: acerto },
        { ms: m + 30_000, altura: 30, recorte: acerto },
        { ms: m + 90_000, altura: 25, recorte: acerto },
        { ms: m + 150_000, altura: 20, recorte: acerto },
        { ms: m + 45_000, altura: 35, recorte: outro },
        { ms: m + 60_000, altura: 33, recorte: outro },
      ];
    }, { ms });
    // Mexer no filtro redesenha a lista — e uma accao dele, e nao um atalho
    // de teste. Na vida real quem redesenha e a propria busca automatica,
    // logo a seguir a guardar os sons.
    await p.selectOption('#filtroMomentos', 'semMorte');
    await p.waitForSelector('#listaMomentos .foiKill', { timeout: 5000 });

    await p.locator('#listaMomentos .foiKill').first().click();
    await p.waitForFunction(() => /Referência guardada/.test(document.getElementById('estadoMontagem').textContent),
      null, { timeout: 10000 });

    const marcados = await p.evaluate(() => window.__estado.momentos.map((m) => m.ms).sort((a, b) => a - b));
    assert.deepEqual(marcados, [ms, ms + 30_000, ms + 90_000, ms + 150_000],
      'só os instantes com o MESMO som — o outro som não pode entrar');
    assert.deepEqual(erros, []);
    await p.close();
  });
