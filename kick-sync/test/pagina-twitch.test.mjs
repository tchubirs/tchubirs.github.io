// A pagina da Twitch, num browser a serio, contra uma Twitch falsa.
//
// A Twitch e falsa por duas razoes: este contentor nao lhe chega, e um teste
// que depende do servico de outra pessoa falha por razoes que nao sao deste
// codigo. O que e verdade sobre a Twitch real esta medido em
// `probes/twitch.mjs`, que corre a mao contra canais reais.
//
// O `Twitch.Player` tambem e falso, e e isso que torna este teste util: um
// player a serio nao me deixaria ver a que segundo mandei cada canal saltar, e
// e exactamente esse numero que decide se os POVs ficam sincronizados.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SITE = new URL('../site/', import.meta.url).pathname;
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

// Dois canais na mesma noite, com inícios diferentes — que é o caso todo:
// o segundo entrou vinte minutos depois, e por isso o mesmo instante do mundo
// é um segundo diferente dentro de cada VOD.
const VODS = {
  tchubi: [{ id: '111', title: 'noite', publishedAt: new Date(T).toISOString(), lengthSeconds: 3600 }],
  amigo: [{ id: '222', title: 'noite', publishedAt: new Date(T + 1_200_000).toISOString(), lengthSeconds: 3600 }],
};

async function twitchFalsa(pagina, { vods = VODS, semEmbed = false } = {}) {
  const pedidos = { gql: 0, embed: 0 };

  await pagina.route('https://gql.twitch.tv/**', async (rota) => {
    pedidos.gql++;
    const q = JSON.parse(rota.request().postData() || '{}').query || '';
    const login = /user\(login: "([^"]+)"\)/.exec(q)?.[1];
    if (/searchUsers/.test(q)) {
      return rota.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { searchUsers: { edges: Object.keys(vods)
          .map((l) => ({ node: { login: l, displayName: l, profileImageURL: null } })) } } }),
      });
    }
    return rota.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: { user: vods[login]
        ? { videos: { edges: vods[login].map((node) => ({ node })) } } : null } }),
    });
  });

  // Um Twitch.Player falso que apenas ANOTA o que lhe mandaram fazer.
  await pagina.route('https://player.twitch.tv/js/embed/v1.js', async (rota) => {
    pedidos.embed++;
    // Um bloqueador de anuncios ou uma rede de empresa: o script nunca chega.
    if (semEmbed) return rota.abort();
    return rota.fulfill({
      contentType: 'text/javascript',
      body: `
        window.__players = [];
        window.Twitch = { Player: function (id, opcoes) {
          const eu = { id, opcoes, saltos: [], videos: [], tocou: 0, parou: 0, mudo: [] };
          window.__players.push(eu);
          // Como o player a serio: o iframe leva a largura e a altura pedidas.
          document.getElementById(id).innerHTML =
            '<iframe title="' + opcoes.video + '" src="about:blank" width="' + opcoes.width
            + '" height="' + opcoes.height + '" style="border:0;display:block"></iframe>';
          this.seek = (s) => eu.saltos.push(s);
          this.setVideo = (v, s) => eu.videos.push([v, s]);
          this.play = () => { eu.tocou++; };
          this.pause = () => { eu.parou++; };
          this.setMuted = (m) => eu.mudo.push(m);
        } };
      `,
    });
  });
  return pedidos;
}

async function abrir() {
  const p = await navegador.newPage({ locale: 'pt-PT' });
  await p.addInitScript(() => {
    try { if (!localStorage.getItem('replay.idioma')) localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ }
  });
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e.message)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|404/.test(m.text())) erros.push(m.text()); });
  return { p, erros };
}

const carregar = async (p, canais = 'tchubi\namigo') => {
  await p.goto(`http://127.0.0.1:${PORTA}/twitch.html`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais);
  await p.click('#carregar');
};

test('a página da Twitch abre sem um único erro de código',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// O numero que decide tudo. O mesmo instante do mundo e um segundo diferente
// dentro de cada VOD, porque um comecou vinte minutos depois do outro. Somar
// mal aqui poe os dois POVs a mostrar momentos diferentes com ar de estarem
// sincronizados — que e pior do que nao sincronizar nada.
test('cada canal salta para o SEU segundo, e não para o mesmo número',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });

    // A janela comum comeca quando o segundo entrou: T+20min. Nesse instante o
    // primeiro VOD ja vai em 1200 s e o segundo em 0. No formato que a Twitch
    // documenta para o `time` do embed (XhYmZs), o mesmo do enderecoDoPlayer.
    const inicio = await p.evaluate(() => window.__players.map((x) => x.opcoes.time));
    assert.deepEqual(inicio, ['0h20m0s', '0h0m0s']);

    await p.click('#mais1m');
    const saltos = await p.evaluate(() => window.__players.map((x) => x.saltos.at(-1)));
    assert.deepEqual(saltos, [1260, 60], 'um minuto adiante são segundos diferentes em cada VOD');
    assert.deepEqual(erros, []);
    await p.close();
  });

// Quem nao estava a transmitir naquele instante tem de o dizer. Mostrar o
// primeiro frame do VOD como se fosse o momento certo e uma resposta confiante
// e errada — foi por isso que a versao da Kick ganhou os quatro estados.
test('quem não estava no ar diz que não estava, e não mostra o frame errado',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });

    // Recuar para antes de o segundo canal ter entrado.
    for (let i = 0; i < 25; i++) await p.click('#menos1m');
    const foras = await p.locator('.tile.fora').count();
    assert.equal(foras, 1, 'só o que ainda não tinha entrado');
    assert.match(await p.locator('.tile.fora .estadoTile').innerText(), /não estava transmitindo/);
    assert.match(await p.locator('#noAr').innerText(), /1 de 2/);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Mandar tocar um VOD que nao cobre este instante punha-o a andar sozinho a
// partir do principio, e a sair da sincronia sem ninguem dar por nada.
test('tocar tudo não põe a tocar quem não está no ar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    for (let i = 0; i < 25; i++) await p.click('#menos1m');

    await p.click('#tocar');
    const tocaram = await p.evaluate(() => window.__players.map((x) => x.tocou));
    assert.deepEqual(tocaram, [1, 0], 'só quem estava mesmo a transmitir');
    assert.deepEqual(erros, []);
    await p.close();
  });

// Seis players a falar ao mesmo tempo e inutilizavel. Comecam mudos, e ele
// liga o som do que quer.
test('os players começam mudos, e o som liga-se um a um',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.deepEqual(await p.evaluate(() => window.__players.map((x) => x.opcoes.muted)), [true, true]);

    await p.locator('.tile[data-slug="tchubi"] .ligarSom').check();
    assert.deepEqual(await p.evaluate(() => window.__players[0].mudo), [false]);
    assert.deepEqual(await p.evaluate(() => window.__players[1].mudo), [], 'o outro não mexeu');
    assert.deepEqual(erros, []);
    await p.close();
  });

// Sem `parent` a Twitch recusa-se a ser posta num iframe, e a pagina fica com
// seis quadrados pretos e nenhuma explicacao.
test('o player leva o parent, senão a Twitch recusa o iframe',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    const pais = await p.evaluate(() => window.__players.map((x) => x.opcoes.parent));
    assert.deepEqual(pais, [['127.0.0.1'], ['127.0.0.1']]);
    await p.close();
  });

// Um canal que nao existe nao pode levar os outros atras — e o que acontece
// quando ele escreve um nome mal.
test('um canal que não existe não estraga a noite dos outros',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p, 'tchubi\nnaoexiste\namigo');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('.tile').count(), 2);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Sem VOD nenhum a pagina tem de dizer porque, e nao ficar em branco a espera.
test('sem VODs nenhuns, diz porquê em vez de ficar em branco',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p, { vods: {} });
    await carregar(p, 'quemquerqueseja');
    await p.waitForFunction(() => document.getElementById('estado').textContent.length > 0,
      null, { timeout: 15000 });
    assert.match(await p.locator('#estado').innerText(), /nenhum VOD gravado/);
    assert.equal(await p.locator('#palco').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Trocar de noite tem de fechar os players da anterior: um iframe orfao
// continua a descarregar video em segundo plano.
test('mudar de noite fecha os players da noite anterior',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p, { vods: {
      tchubi: [
        { id: '1', title: 'ontem', publishedAt: new Date(T).toISOString(), lengthSeconds: 3600 },
        { id: '2', title: 'hoje', publishedAt: new Date(T + 86_400_000).toISOString(), lengthSeconds: 3600 },
      ],
    } });
    await carregar(p, 'tchubi');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#noites option').count(), 2);

    await p.selectOption('#noites', '1');
    await p.waitForFunction(() => window.__players.length === 2, null, { timeout: 10000 });
    // O da noite anterior foi mandado parar, e ha exactamente um tile no ecra.
    assert.ok(await p.evaluate(() => window.__players[0].parou > 0), 'o player velho ficou a andar');
    assert.equal(await p.locator('.tile').count(), 1);
    assert.deepEqual(erros, []);
    await p.close();
  });

// O titulo do separador. Antes era `app.titulo` a martelo dentro do
// `aplicarIdioma`, e por isso a segunda pagina ficava com o titulo da
// primeira — a unica coisa que se ve quando ha dez separadores abertos.
test('cada página tem o seu próprio título, em qualquer língua',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await twitchFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/twitch.html`, { waitUntil: 'networkidle' });
    assert.match(await p.title(), /Twitch/);

    await p.selectOption('#idioma', 'en');
    assert.match(await p.title(), /Twitch/, 'muda de lingua, continua a ser a pagina da Twitch');

    // E a da Kick continua a ser a da Kick.
    await p.goto(`http://127.0.0.1:${PORTA}/index.html`, { waitUntil: 'networkidle' });
    assert.ok(!/Twitch/.test(await p.title()), await p.title());
    await p.close();
  });

test('os botões de tempo dizem para que lado andam, em todas as línguas',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    // A tradução troca o texto do elemento inteiro: com a chave no botão, "−1 min" e "+1 min" ficavam
    // os dois "1 min" e só a posição dizia qual voltava.
    for (const idioma of ['pt', 'en', 'es']) {
      const { p } = await abrir();
      await p.addInitScript((l) => { try { localStorage.setItem('replay.idioma', l); } catch { /* nada */ } }, idioma);
      await p.goto(`http://127.0.0.1:${PORTA}/twitch.html`, { waitUntil: 'networkidle' });
      const texto = (id) => p.locator(`#${id}`).evaluate((b) => b.textContent.trim());
      assert.match(await texto('menos1m'), /^−/, idioma);
      assert.match(await texto('menos10s'), /^−/, idioma);
      assert.match(await texto('mais10s'), /^\+/, idioma);
      assert.match(await texto('mais1m'), /^\+/, idioma);
      assert.notEqual(await texto('menos1m'), await texto('mais1m'));
      assert.equal(await p.evaluate(() => document.documentElement.lang), idioma === 'pt' ? 'pt-BR' : idioma);
      await p.close();
    }
  });

// ── o relogio partilhado e os casos que a primeira versao nao via ───────────

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const segundosDoRelogio = async (p) => {
  const [h, m, s] = (await p.locator('#relogio').innerText()).replace('Z', '').split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

// Sem relogio a andar, o "+10 s" depois de cinco minutos a ver mandava toda a
// gente para o inicio mais dez segundos: um recuo de quatro minutos e meio.
test('a tocar, o relógio anda, e os saltos contam a partir de onde o grupo está',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    const antes = await segundosDoRelogio(p);

    await p.click('#tocar');
    await esperar(2600);
    const depois = await segundosDoRelogio(p);
    assert.ok(depois - antes >= 2, `o relógio ficou parado: ${antes} -> ${depois}`);

    await p.click('#mais10s');
    const salto = await p.evaluate(() => window.__players[0].saltos.at(-1));
    assert.ok(salto >= 1212, `saltou para ${salto}, como se nunca tivesse tocado`);

    await p.click('#tocar');
    const parado = await segundosDoRelogio(p);
    await esperar(1500);
    assert.equal(await segundosDoRelogio(p), parado, 'em pausa o relógio não anda');
    assert.deepEqual(erros, []);
    await p.close();
  });

// Um streamer que caiu e voltou tem dois VODs na mesma noite. O player tem de
// trocar de video, e nao saltar para o segundo do VOD seguinte dentro do primeiro.
test('um canal com dois VODs na noite troca de vídeo ao passar para o segundo',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p, { vods: {
      a: [
        { id: '200', title: 'antes de cair', publishedAt: new Date(T).toISOString(), lengthSeconds: 3700 },
        { id: '201', title: 'voltei', publishedAt: new Date(T + 3_700_000).toISOString(), lengthSeconds: 3600 },
      ],
      b: [{ id: '300', title: 'noite', publishedAt: new Date(T).toISOString(), lengthSeconds: 7200 }],
    } });
    await carregar(p, 'a\nb');
    await p.waitForSelector('.tile', { timeout: 15000 });
    for (let i = 0; i < 70; i++) await p.click('#mais1m');

    const a = await p.evaluate(() => window.__players[0]);
    // Trocou uma vez, ao passar o fim do 200 (minuto 62 = 20 s do 201), e
    // dai em diante salta dentro do 201: 70 min da noite sao 500 s dele.
    assert.deepEqual(a.videos, [['v201', 20]], 'o player do canal a ficou no primeiro VOD');
    assert.equal(a.saltos.at(-1), 500);
    assert.ok(!a.saltos.includes(4200));
    assert.equal(await p.evaluate(() => window.__players[1].saltos.at(-1)), 4200);
    assert.equal(await p.locator('.tile.fora').count(), 0);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('depois de "nenhum VOD", o botão Carregar volta a funcionar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p, { vods: {} });
    await carregar(p, 'nomeerrado');
    await p.waitForFunction(() => document.getElementById('estado').textContent.length > 3,
      null, { timeout: 15000 });
    assert.equal(await p.locator('#carregar').isDisabled(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('escolher uma sugestão não apaga os canais já escritos',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p, { vods: { novo: VODS.tchubi } });
    await p.goto(`http://127.0.0.1:${PORTA}/twitch.html`, { waitUntil: 'networkidle' });
    const doze = Array.from({ length: 12 }, (_, i) => `time${i}`);
    await p.fill('#canais', doze.join('\n'));
    await p.fill('#procurar', 'novo');
    await p.click('#botaoProcurar');
    await p.click('.sug[data-slug="novo"]');
    const linhas = (await p.inputValue('#canais')).split('\n');
    assert.deepEqual(linhas, [...doze, 'novo']);
    assert.deepEqual(erros, []);
    await p.close();
  });

// Uma equipa de quatro com um nome mal escrito mostrava tres POVs sem dizer porque.
test('diz quem ficou de fora: o nome que não existe e o que passou do limite',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p, 'tchubi\nnaoexiste\namigo');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.match(await p.locator('#estado').innerText(), /naoexiste/);

    const muitos = ['tchubi', ...Array.from({ length: 7 }, (_, i) => `vazio${i}`), 'amigo'];
    await p.fill('#canais', muitos.join('\n'));
    await p.click('#carregar');
    await p.waitForFunction(() => /amigo/.test(document.getElementById('estado').textContent),
      null, { timeout: 15000 });
    assert.match(await p.locator('#estado').innerText(), /8/);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um nome com aspas ou colado como endereço não parte a grelha',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p, 'tchubi"\nhttps://www.twitch.tv/amigo');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('.tile').count(), 2);
    assert.deepEqual(await p.locator('.tile').evaluateAll((ts) => ts.map((x) => x.dataset.slug)),
      ['tchubi', 'amigo']);
    assert.equal(await p.locator('#estado.mau').count(), 0);
    assert.deepEqual(erros, []);
    await p.close();
  });

// A Twitch pede pelo menos 400x300 para o embed, e a barra de controlo do
// player fica em baixo: um quadro cortado esconde o play e o volume.
test('cada player tem tamanho de gente e não fica cortado pelo cabeçalho',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await p.setViewportSize({ width: 1440, height: 900 });
    const vods = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`canal${i}`,
      [{ id: String(500 + i), title: 'n', publishedAt: new Date(T).toISOString(), lengthSeconds: 3600 }]]));
    await twitchFalsa(p, { vods });
    await carregar(p, Object.keys(vods).join('\n'));
    await p.waitForFunction(() => document.querySelectorAll('.tile iframe').length === 8, null, { timeout: 15000 });
    const medidas = await p.locator('.tile').evaluateAll((ts) => ts.map((tile) => {
      const a = tile.getBoundingClientRect();
      const f = tile.querySelector('iframe').getBoundingClientRect();
      return { w: f.width, h: f.height, sobra: a.bottom - f.bottom };
    }));
    for (const m of medidas) {
      assert.ok(m.w >= 400 && m.h >= 225, `player de ${m.w}x${m.h}`);
      assert.ok(m.sobra >= 0, `o fundo do player ficou ${-m.sobra}px cortado`);
    }
    assert.deepEqual(erros, []);
    await p.close();
  });

test('se o player da Twitch não carregou, diz isso e não culpa os nomes',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p, { semEmbed: true });
    await carregar(p);
    await p.waitForFunction(() => document.getElementById('estado').textContent.length > 3,
      null, { timeout: 15000 });
    const estado = await p.locator('#estado').innerText();
    assert.match(estado, /player\.twitch\.tv/);
    assert.doesNotMatch(estado, /Confira os nomes/);
    assert.equal(await p.locator('#palco').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('mudar de língua a tocar não recria os players e traduz o botão e as noites',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#tocar');
    await p.selectOption('#idioma', 'en');
    assert.equal(await p.evaluate(() => window.__players.length), 2, 'os iframes foram todos recarregados');
    assert.equal((await p.locator('#tocar').innerText()).trim(), 'Pause');
    assert.match(await p.locator('.tile .ligarSom + span').first().innerText(), /sound/);
    assert.match(await p.locator('#noites option').first().innerText(), /2 channels/);
    await p.click('#tocar');
    assert.equal((await p.locator('#tocar').innerText()).trim(), 'Play');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um canal que volta ao ar a meio da reprodução também toca',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await twitchFalsa(p);
    await carregar(p);
    await p.waitForSelector('.tile', { timeout: 15000 });
    for (let i = 0; i < 12; i++) await p.click('#menos1m');
    await p.click('#tocar');
    assert.deepEqual(await p.evaluate(() => window.__players.map((x) => x.tocou)), [1, 0]);
    for (let i = 0; i < 12; i++) await p.click('#mais1m');
    assert.ok(await p.evaluate(() => window.__players[1].tocou) >= 1, 'o b ficou parado enquanto o a tocava');
    assert.deepEqual(erros, []);
    await p.close();
  });
