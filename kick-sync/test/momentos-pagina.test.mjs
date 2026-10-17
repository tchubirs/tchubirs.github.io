// A tela de momentos (momentos.html?e=<nome>): a lista pronta de um evento, ver cada momento com um toque.
// O evento é de mentira (eventos/teste-momentos.json por rota) e a Kick também: a v1 do VOD e a v2 do clipe
// respondem daqui, e o hls.js é um duplo que regista o que lhe mandam tocar e de onde.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const T = Date.parse('2026-10-16T22:00:00Z');
const VOD = '61cce35c-5f6b-42a0-96b0-2fa2efdbdd19';
const VOD_PAGINA = '01a14600-8e60-7e28-b96b-137165eaaa0d';
const CLIPE = 'clip_01M53Z0NWY3MERGEYA5WAZGTHN';
const texto = (pt) => ({ pt, en: `${pt} (en)`, es: `${pt} (es)` });
const MOMENTOS = {
  evento: 'Teste',
  atualizado: '2026-10-17T16:00:00Z',
  momentos: [
    { id: 'barco', canal: 'axel', origem: 'povix', inicioMs: T, fimMs: T + 60_000, uuid: VOD, aosS: 13103,
      resumo: texto('Atropela alguém com o barco'), reacao: texto('O time cai na risada'), potencial: 82,
      miniatura: 'eventos/teste-momentos/barco.jpg' },
    { id: 'minita', canal: 'kodd', origem: 'publico', inicioMs: T + 3_600_000, fimMs: T + 3_641_000, clipe: CLIPE,
      views: 204, titulo: 'La minita', resumo: texto('Piada da minita'), potencial: 95,
      miniatura: 'https://clips.kick.com/clips/46/x/thumbnail.webp' },
    { id: 'canhao', canal: 'axel', origem: 'povix', inicioMs: T + 600_000, fimMs: T + 660_000, uuid: VOD, aosS: 13703,
      vodId: VOD_PAGINA, resumo: texto('Acerta o canhão'), potencial: 60 },
    // Fora: sem nada que toque, e com um canal que não é nome de canal.
    { id: 'sem-video', canal: 'zed', inicioMs: T, fimMs: T + 30_000, resumo: texto('x'), potencial: 99 },
    { id: 'armadilha', canal: '<img src=x onerror=alert(1)>', inicioMs: T, fimMs: T + 30_000, clipe: CLIPE, potencial: 99 },
  ],
};

async function preparar(p, { dados = MOMENTOS } = {}) {
  await kickFalsa(p, { canais: ['axel'] });
  const pedidos = { vod: [], clipe: [] };
  // O duplo do hls.js, mais novo que o de falsa.mjs: guarda também a configuração (o segundo de partida).
  await p.route('**/hls-*.js', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'window.__hls=[];window.Hls=function(c){var e={config:c||{},src:null,destruido:false};window.__hls.push(e);'
      + 'this.loadSource=function(u){e.src=u;};this.attachMedia=function(){};this.destroy=function(){e.destruido=true;};};'
      + 'window.Hls.isSupported=function(){return true;};',
  }));
  await p.route('**/eventos/teste-momentos.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) }));
  await p.route('**/eventos/teste-momentos/*.jpg', (r) => r.abort());
  await p.route('https://clips.kick.com/**', (r) => r.abort());
  await p.route('**/api/v1/video/*', (r) => {
    pedidos.vod.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ source: 'https://stream.kick.com/falsa/axel/master.m3u8', livestream: { vod_id: VOD_PAGINA } }) });
  });
  await p.route('**/api/v2/clips/*', (r) => {
    pedidos.clipe.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ clip: { id: CLIPE, title: 'La minita', duration: 41, video_url: 'https://stream.kick.com/falsa/clipe/playlist.m3u8', channel: { slug: 'kodd' } } }) });
  });
  return pedidos;
}

const ordem = (p) => p.$$eval('#listaMomentos .mom', (as) => as.map((a) => a.dataset.id));
const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('momentos: melhores por potencial, feed no celular e ranking em tela larga; os inválidos ficam de fora',
  semNavegador, async () => {
    const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
    await preparar(p);
    await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
    await p.waitForSelector('#listaMomentos .mom');
    assert.deepEqual(await ordem(p), ['minita', 'barco', 'canhao']);
    assert.equal(await p.locator('#nomeEvento').textContent(), 'Teste');
    assert.equal(await p.locator('#momSub').textContent(), '3 momentos de 2 streamers. Toque na imagem para ver ali mesmo.');
    assert.equal(await p.evaluate(() => window.__xss), undefined);
    const primeiro = p.locator('.mom').first();
    assert.equal(await primeiro.locator('.momResumo').textContent(), 'Piada da minita');
    assert.match(await primeiro.locator('.momOrigem').textContent(), /Clipe do público · 204 views · “La minita”/);
    assert.equal(await p.locator('.mom[data-id="barco"] .momReacao').textContent(), 'O time cai na risada');
    // A foto que não chega deixa o nome e a hora no lugar.
    await p.waitForFunction(() => !document.querySelector('.mom[data-id="barco"] img'));
    assert.equal(await p.locator('.mom[data-id="barco"] .momSemFoto').isVisible(), true);

    // Estreito: um cartão por linha, vídeo da largura do cartão, sem o número do ranking.
    const estreito = await p.evaluate(() => {
      const c = document.querySelector('.mom');
      const v = c.querySelector('.momVideo').getBoundingClientRect();
      return { cartao: c.getBoundingClientRect().width, video: v.width, rank: getComputedStyle(c.querySelector('.momRank')).display };
    });
    assert.equal(estreito.rank, 'none');
    assert.ok(estreito.video > estreito.cartao - 40, JSON.stringify(estreito));
    assert.ok(await semRolagemLateral(p));

    // Largo: o mesmo markup vira ranking, com o número e a miniatura de 240 px ao lado do texto.
    await p.setViewportSize({ width: 1280, height: 860 });
    const largo = await p.evaluate(() => {
      const c = document.querySelector('.mom');
      const v = c.querySelector('.momVideo').getBoundingClientRect();
      const i = c.querySelector('.momInfo').getBoundingClientRect();
      return { video: Math.round(v.width), rank: c.querySelector('.momRank').textContent, display: getComputedStyle(c.querySelector('.momRank')).display, aoLado: i.left > v.right };
    });
    assert.deepEqual(largo, { video: 240, rank: '1', display: 'block', aoLado: true });
    assert.deepEqual(erros, []);
  });

test('momentos: por streamer agrupa com o melhor primeiro, e o idioma muda os textos', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  await preparar(p);
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  await p.click('#abaStreamers');
  assert.equal(await p.getAttribute('#abaStreamers', 'aria-selected'), 'true');
  const grupos = await p.$$eval('.momGrupo', (gs) => gs.map((g) => ({
    titulo: g.querySelector('h2').textContent, ids: [...g.querySelectorAll('.mom')].map((m) => m.dataset.id),
  })));
  assert.deepEqual(grupos, [
    { titulo: 'kodd1 momento · melhor ▲ 95', ids: ['minita'] },
    { titulo: 'axel2 momentos · melhor ▲ 82', ids: ['barco', 'canhao'] },
  ]);
  // A fileira desliza dentro dela; a página não.
  assert.ok(await semRolagemLateral(p));
  await p.selectOption('#idioma', 'es');
  assert.equal(await p.locator('#abaMelhores').textContent(), 'Mejores');
  assert.equal(await p.locator('.mom[data-id="barco"] .momResumo').textContent(), 'Atropela alguém com o barco (es)');
  assert.equal(await p.evaluate(() => localStorage.getItem('replay.idioma')), 'es');
  assert.deepEqual(erros, []);
});

test('momentos: um toque toca ali mesmo; o VOD começa 3 s antes e o clipe pelo m3u8 dele; um vídeo de cada vez',
  semNavegador, async () => {
    const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
    const pedidos = await preparar(p);
    await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
    await p.waitForSelector('#listaMomentos .mom');
    const barco = p.locator('.mom[data-id="barco"]');
    // Sem o id da página no arquivo, o link da Kick é o canal até a v1 dizer qual é.
    assert.equal(await barco.locator('.momKick').getAttribute('href'), 'https://kick.com/axel');
    assert.equal(await barco.locator('.momBotao.principal').getAttribute('href'), `index.html?e=teste#t=${T + 30_000}&c=axel`);
    assert.equal(await p.locator('.mom[data-id="canhao"] .momKick').getAttribute('href'), `https://kick.com/axel/videos/${VOD_PAGINA}?t=13703`);

    await barco.locator('.momCapa').click();
    await p.waitForFunction(() => window.__hls.length === 1 && window.__hls[0].src);
    assert.deepEqual(pedidos.vod, [`https://kick.com/api/v1/video/${VOD}`]);
    assert.deepEqual(await p.evaluate(() => window.__hls.map((h) => [h.src, h.config.startPosition])),
      [['https://stream.kick.com/falsa/axel/master.m3u8', 13100]]);
    assert.equal(await barco.locator('video').count(), 1);
    assert.equal(await barco.getAttribute('class'), 'mom tocando');
    assert.equal(await barco.locator('.momKick').getAttribute('href'), `https://kick.com/axel/videos/${VOD_PAGINA}?t=13103`);

    // Outro toque, noutro cartão: o primeiro larga o vídeo e volta à foto.
    await p.locator('.mom[data-id="minita"] .momCapa').click();
    await p.waitForFunction(() => window.__hls.length === 2 && window.__hls[1].src);
    assert.deepEqual(pedidos.clipe, [`https://kick.com/api/v2/clips/${CLIPE}`]);
    assert.equal(await p.evaluate(() => window.__hls[0].destruido), true);
    assert.equal(await p.evaluate(() => window.__hls[1].src), 'https://stream.kick.com/falsa/clipe/playlist.m3u8');
    assert.equal(await p.locator('video').count(), 1);
    assert.equal(await barco.locator('.momCapa').count(), 1);
    assert.equal(await p.locator('.mom[data-id="minita"] .momKick').getAttribute('href'), `https://kick.com/kodd/clips/${CLIPE}`);

    // Trocar de aba larga o vídeo.
    await p.click('#abaStreamers');
    assert.equal(await p.locator('video').count(), 0);
    assert.equal(await p.evaluate(() => window.__hls[1].destruido), true);
    assert.ok(await semRolagemLateral(p));
    assert.deepEqual(erros, []);
  });

test('momentos: sem evento no endereço, ou sem arquivo, diz o que falta', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null });
  await preparar(p);
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html`, { waitUntil: 'networkidle' });
  assert.equal(await p.locator('#momEstado').textContent(), 'Falta o evento no endereço (momentos.html?e=abisal).');
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=nao-existe`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => /Ainda não há/.test(document.getElementById('momEstado').textContent));
  assert.equal(await p.locator('#listaMomentos .mom').count(), 0);
  assert.deepEqual(erros, []);
});
