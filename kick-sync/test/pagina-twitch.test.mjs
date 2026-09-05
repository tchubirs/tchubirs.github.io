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

async function twitchFalsa(pagina, { vods = VODS } = {}) {
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
    return rota.fulfill({
      contentType: 'text/javascript',
      body: `
        window.__players = [];
        window.Twitch = { Player: function (id, opcoes) {
          const eu = { id, opcoes, saltos: [], tocou: 0, parou: 0, mudo: [] };
          window.__players.push(eu);
          document.getElementById(id).innerHTML =
            '<iframe title="' + opcoes.video + '" src="about:blank"></iframe>';
          this.seek = (s) => eu.saltos.push(s);
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
    // primeiro VOD ja vai em 1200 s e o segundo em 0.
    const inicio = await p.evaluate(() => window.__players.map((x) => x.opcoes.time));
    assert.deepEqual(inicio, ['1200s', '0s']);

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
    assert.match(await p.locator('.tile.fora .estadoTile').innerText(), /não estava a transmitir/);
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
