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
      + 'this.loadSource=function(u){e.src=u;};this.attachMedia=function(){};this.destroy=function(){e.destruido=true;};'
      + 'this.on=function(n,f){e[n]=f;};};'
      + 'window.Hls.isSupported=function(){return true;};window.Hls.Events={ERROR:"hlsError"};',
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
    assert.equal(await barco.locator('.momEditar').getAttribute('href'), `index.html?e=teste#t=${T + 30_000}&c=axel`);
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

    // Trocar o idioma não corta o vídeo.
    await p.selectOption('#idioma', 'en');
    assert.equal(await p.locator('.mom[data-id="minita"] video').count(), 1);
    assert.equal(await p.evaluate(() => window.__hls[1].destruido), false);
    await p.selectOption('#idioma', 'pt');

    // Um erro fatal do hls (manifesto que não chega): volta a foto e o aviso para tentar na Kick.
    await p.evaluate(() => window.__hls[1].hlsError('hlsError', { fatal: true }));
    assert.equal(await p.locator('video').count(), 0);
    assert.equal(await p.locator('.mom[data-id="minita"] .momErro').textContent(), 'Não deu para abrir este vídeo agora. Tente na Kick.');
    await p.locator('.mom[data-id="minita"] .momCapa').click();
    await p.waitForFunction(() => window.__hls.length === 3 && window.__hls[2].src);

    // Trocar de aba larga o vídeo.
    await p.click('#abaStreamers');
    assert.equal(await p.locator('video').count(), 0);
    assert.equal(await p.evaluate(() => window.__hls[2].destruido), true);
    assert.ok(await semRolagemLateral(p));
    assert.deepEqual(erros, []);
  });

test('momentos: sem evento no endereço, ou sem arquivo, diz o que falta', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null });
  await preparar(p);
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html`, { waitUntil: 'networkidle' });
  assert.equal(await p.locator('#momEstado').textContent(), 'Falta o evento no endereço (momentos.html?e=abisal).');
  await p.selectOption('#idioma', 'en');
  assert.equal(await p.locator('#momEstado').textContent(), 'The event is missing from the address (momentos.html?e=abisal).');
  await p.selectOption('#idioma', 'pt');
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=nao-existe`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => /Ainda não há/.test(document.getElementById('momEstado').textContent));
  assert.equal(await p.locator('#listaMomentos .mom').count(), 0);
  assert.deepEqual(erros, []);
});

test('momentos: duas linhas (virais e highlights) e o clipe com VOD toca do VOD, com contexto antes', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const [barco, minita, canhao] = MOMENTOS.momentos;
  const dados = { ...MOMENTOS, momentos: [barco, { ...minita, uuid: VOD, aosS: 20000 }, { ...canhao, linha: 'highlight' }] };
  const pedidos = await preparar(p, { dados });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  const linhas = await p.$$eval('.momLinha', (ls) => ls.map((l) => ({
    titulo: l.querySelector('h2').textContent, ids: [...l.querySelectorAll('.mom')].map((m) => m.dataset.id),
  })));
  assert.deepEqual(linhas, [
    { titulo: 'Virais: reação forte', ids: ['minita', 'barco'] },
    { titulo: 'Highlights: jogadas de PvP', ids: ['canhao'] },
  ]);
  await p.locator('.mom[data-id="minita"] .momCapa').click();
  await p.waitForFunction(() => window.__hls.length === 1 && window.__hls[0].src);
  assert.deepEqual(pedidos.clipe, []);
  assert.deepEqual(await p.evaluate(() => [window.__hls[0].src, window.__hls[0].config.startPosition]),
    ['https://stream.kick.com/falsa/axel/master.m3u8', 19997]);
  // O link da Kick continua a ser o do clipe.
  assert.equal(await p.locator('.mom[data-id="minita"] .momKick').getAttribute('href'), `https://kick.com/kodd/clips/${CLIPE}`);
  assert.ok(await semRolagemLateral(p));
  assert.deepEqual(erros, []);
});

test('momentos: a visão do outro lado toca junto, menor e muda, e some com o vídeo principal', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const OUTRO = 'bf776876-3481-419e-87f0-3ba8604da777';
  const [barco, minita] = MOMENTOS.momentos;
  const dados = { ...MOMENTOS, momentos: [{ ...barco, pov: { canal: 'liks', uuid: OUTRO, aosS: 13110.4 } }, minita] };
  const pedidos = await preparar(p, { dados });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  const card = p.locator('.mom[data-id="barco"]');
  assert.equal(await card.locator('.momPov').count(), 0);
  await card.locator('.momCapa').click();
  await p.waitForFunction(() => window.__hls.length === 2 && window.__hls[1].src);
  // Os dois pedidos saem juntos (em paralelo); a ordem de chegada não importa.
  assert.deepEqual([...pedidos.vod].sort(), [`https://kick.com/api/v1/video/${VOD}`, `https://kick.com/api/v1/video/${OUTRO}`].sort());
  // Mesmo instante da cena: o principal abre em 13100 (13103 − 3) e a outra visão 7,4 s à frente no VOD dela.
  const inicio = await p.evaluate(() => window.__hls.map((h) => h.config.startPosition));
  assert.equal(inicio[0], 13100);
  assert.ok(Math.abs(inicio[1] - 13107.4) < 0.01, String(inicio[1]));
  assert.equal(await card.locator('.momPovNome').textContent(), 'Visão do inimigo: liks');
  assert.equal(await card.locator('.momPov video').evaluate((v) => v.muted), true);
  // No celular fica por baixo do vídeo principal, sem alargar a página.
  const pos = await p.evaluate(() => {
    const v = document.querySelector('.mom[data-id="barco"] .momVideo').getBoundingClientRect();
    const o = document.querySelector('.mom[data-id="barco"] .momPov').getBoundingClientRect();
    return o.top >= v.bottom - 1;
  });
  assert.equal(pos, true);
  assert.ok(await semRolagemLateral(p));
  assert.equal(await card.locator('.momPovKick').getAttribute('href'), 'https://kick.com/liks');
  // Segue a velocidade do principal e pausa quando ele para a carregar.
  await p.evaluate(() => {
    window.__main = document.querySelector('.mom[data-id="barco"] .momVideo video');
    window.__pov = document.querySelector('.mom[data-id="barco"] .momPov video');
    window.__chamadas = { play: 0, pause: 0 };
    window.__pov.play = () => { window.__chamadas.play++; return Promise.resolve(); };
    window.__pov.pause = () => { window.__chamadas.pause++; };
    window.__main.playbackRate = 1.5;
    window.__main.dispatchEvent(new Event('ratechange'));
    window.__main.dispatchEvent(new Event('waiting'));
  });
  assert.equal(await p.evaluate(() => window.__pov.playbackRate), 1.5);
  assert.equal(await p.evaluate(() => window.__chamadas.pause), 1);
  // Trocar o idioma muda o rótulo da outra visão sem cortar nada.
  await p.selectOption('#idioma', 'en');
  assert.equal(await card.locator('.momPovNome').textContent(), 'Enemy view: liks');
  await p.selectOption('#idioma', 'pt');
  // Tocar outro cartão larga as duas.
  await p.locator('.mom[data-id="minita"] .momCapa').click();
  await p.waitForFunction(() => window.__hls.length === 3);
  assert.equal(await p.locator('.momPov').count(), 0);
  assert.deepEqual(await p.evaluate(() => [window.__hls[0].destruido, window.__hls[1].destruido]), [true, true]);
  // A outra visão larga o vídeo e deixa de ouvir o principal antigo.
  const depois = await p.evaluate(() => {
    const antes = { ...window.__chamadas };
    window.__main.dispatchEvent(new Event('play'));
    window.__main.dispatchEvent(new Event('waiting'));
    return { antes, agora: window.__chamadas, src: window.__pov.getAttribute('src') };
  });
  assert.deepEqual(depois.agora, depois.antes);
  assert.equal(depois.src, null);
  assert.deepEqual(erros, []);
});

test('momentos: a outra visão fora do VOD dela fica escondida e não salta', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const OUTRO = 'bf776876-3481-419e-87f0-3ba8604da777';
  const [barco] = MOMENTOS.momentos;
  // O VOD da outra visão começa no meio da cena (aos 1 s dela = 13 103 s do principal): o começo cai antes dele.
  const dados = { ...MOMENTOS, momentos: [{ ...barco, pov: { canal: 'liks', uuid: OUTRO, aosS: 1 } }] };
  await preparar(p, { dados });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  await p.locator('.mom[data-id="barco"] .momCapa').click();
  await p.waitForFunction(() => window.__hls.length === 2 && window.__hls[1].src);
  assert.equal(await p.evaluate(() => window.__hls[1].config.startPosition), 0);
  const r = await p.evaluate(() => {
    const main = document.querySelector('.mom[data-id="barco"] .momVideo video');
    const pov = document.querySelector('.mom[data-id="barco"] .momPov video');
    let saltos = 0;
    const ct = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    Object.defineProperty(pov, 'currentTime', { get: () => ct.get.call(pov), set: (x) => { saltos++; ct.set.call(pov, x); } });
    for (let i = 0; i < 5; i++) main.dispatchEvent(new Event('timeupdate'));
    main.dispatchEvent(new Event('seeked'));
    return { escondida: document.querySelector('.mom[data-id="barco"] .momPov').hidden, saltos };
  });
  assert.deepEqual(r, { escondida: true, saltos: 0 });
  assert.deepEqual(erros, []);
});

test('momentos: procurar um streamer deixa só os dele (e onde ele é o inimigo); muitos momentos vêm aos poucos', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const [barco, minita] = MOMENTOS.momentos;
  const muitos = Array.from({ length: 20 }, (_, i) => ({ ...barco, id: `m${i}`, canal: 'zed', potencial: 40 - i }));
  const dados = { ...MOMENTOS, momentos: [barco, { ...minita, pov: { canal: 'axel', uuid: VOD, aosS: 100 } }, ...muitos] };
  await preparar(p, { dados });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  assert.equal(await p.locator('#listaMomentos .mom').count(), 15);
  assert.equal(await p.locator('.momMais').textContent(), 'Mostrar mais (7)');
  await p.click('.momMais');
  assert.equal(await p.locator('#listaMomentos .mom').count(), 22);
  assert.equal(await p.locator('.momMais').count(), 0);

  await p.fill('#momBusca', 'axel');
  await p.dispatchEvent('#momBusca', 'change');
  assert.deepEqual(await ordem(p), ['minita', 'barco']);
  assert.equal(await p.locator('#momSub').textContent(), '2 momentos de axel (inclui a visão dele como inimigo).');
  assert.match(p.url(), /[?&]c=axel/);
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste&c=zed`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  assert.equal(await p.inputValue('#momBusca'), 'zed');
  assert.equal(await p.locator('#listaMomentos .mom').count(), 15);
  assert.ok(await semRolagemLateral(p));
  assert.deepEqual(erros, []);
});

test('momentos: duas visões do inimigo lado a lado; o principal não espera, e a atrasada entra no instante certo', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const VITIMA = 'c353a87d-f80f-42c4-b81b-0db2c048d47e';
  const OUTRO = 'bf776876-3481-419e-87f0-3ba8604da777';
  const [barco] = MOMENTOS.momentos;
  const dados = { ...MOMENTOS, momentos: [{ ...barco, povs: [
    { canal: 'celaa', uuid: VITIMA, aosS: 13203 }, { canal: 'liks', uuid: OUTRO, aosS: 13110.4 },
  ] }] };
  const pedidos = await preparar(p, { dados });
  // Espia o play do principal (o único com som) para ver que ele arranca sem esperar as visões.
  await p.addInitScript(() => {
    window.__playsPrincipal = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted) window.__playsPrincipal++;
      return play.call(this).catch(() => {});
    };
  });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  await p.locator('.mom[data-id="barco"] .momCapa').click();
  await p.waitForFunction(() => window.__hls.length === 3 && window.__hls.every((h) => h.src));
  assert.equal(pedidos.vod.length, 3);
  assert.deepEqual(await p.$$eval('.momPovNome', (n) => n.map((x) => x.textContent)), ['Visão do inimigo: celaa', 'Visão do inimigo: liks']);
  // Lado a lado, cada uma com metade da largura e embaixo do principal, sem alargar a página.
  const caixas = await p.$$eval('.mom[data-id="barco"] .momPov', (cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), w: Math.round(r.width) })));
  assert.equal(caixas[0].top, caixas[1].top);
  assert.ok(Math.abs(caixas[0].w - caixas[1].w) <= 1, JSON.stringify(caixas));
  assert.ok(await semRolagemLateral(p));
  // Nenhuma visão pronta e o principal já está a tocar.
  await p.waitForFunction(() => window.__playsPrincipal === 1);
  // Uma visão que começa a tocar depois do principal vai para o instante dele mais o desvio dela.
  const pos = await p.evaluate(() => {
    const main = document.querySelector('.mom[data-id="barco"] .momVideo video');
    const pov = document.querySelectorAll('.momPov video')[0];
    Object.defineProperty(main, 'currentTime', { configurable: true, get: () => 13105 });
    Object.defineProperty(pov, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(pov, 'duration', { configurable: true, get: () => 40000 });
    let posto = null;
    Object.defineProperty(pov, 'currentTime', { configurable: true, get: () => 0, set: (v) => { posto = v; } });
    pov.dispatchEvent(new Event('playing'));
    return posto;
  });
  assert.equal(pos, 13105 + (13203 - 13103));
  assert.deepEqual(erros, []);
});

test('momentos: se uma visão do inimigo não chega, o principal toca na hora, sem esperar', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const [barco] = MOMENTOS.momentos;
  const dados = { ...MOMENTOS, momentos: [{ ...barco, povs: [{ canal: 'celaa', uuid: 'c353a87d-f80f-42c4-b81b-0db2c048d47e', aosS: 13203 }] }] };
  await preparar(p, { dados });
  await p.addInitScript(() => {
    window.__playsPrincipal = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (!this.muted) window.__playsPrincipal++; return play.call(this).catch(() => {}); };
  });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  const t0 = Date.now();
  await p.locator('.mom[data-id="barco"] .momCapa').click();
  await p.waitForFunction(() => window.__playsPrincipal === 1, null, { timeout: 8000 });
  const espera = Date.now() - t0;
  assert.ok(espera < 2000, String(espera));
  assert.deepEqual(erros, []);
});

test('momentos: o nível "resto" fica fora da lista do evento e aparece na busca do streamer', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const [barco, minita] = MOMENTOS.momentos;
  const dados = { ...MOMENTOS, momentos: [{ ...barco, nivel: 'top' }, { ...minita, nivel: 'bom' }, { ...barco, id: 'fraco', nivel: 'resto', potencial: 10 }] };
  await preparar(p, { dados });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  assert.deepEqual(await ordem(p), ['minita', 'barco']);
  assert.equal(await p.locator('#momSub').textContent(), '2 momentos de 2 streamers. Toque na imagem para ver ali mesmo.');
  await p.fill('#momBusca', 'axel');
  await p.dispatchEvent('#momBusca', 'change');
  assert.deepEqual(await ordem(p), ['barco', 'fraco']);
  assert.deepEqual(erros, []);
});

test('momentos: "Baixar" corta o momento ali mesmo, só com os pedaços da janela, sem abrir o evento', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const [barco] = MOMENTOS.momentos;
  // Janela no tempo do vídeo: de 30 − 3 = 27 s até 30 + 20 = 50 s → pedaços de 10 s que começam em 20, 30 e 40.
  const dados = { ...MOMENTOS, momentos: [{ ...barco, aosS: 30, fimMs: barco.inicioMs + 20_000 }] };
  await preparar(p, { dados });
  const segs = [];
  p.on('request', (r) => { const n = r.url().match(/\/(\d+)\.ts$/)?.[1]; if (n != null) segs.push(Number(n)); });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  assert.equal(await p.locator('.mom[data-id="barco"] [data-baixar="tiktok"]').textContent(), 'Baixar para TikTok');
  const [download] = await Promise.all([
    p.waitForEvent('download'),
    p.locator('.mom[data-id="barco"] [data-baixar="deitado"]').click(),
  ]);
  // Os pedaços de mentira não são TS de verdade: sai o .ts colado, com o nome a dizê-lo.
  assert.match(download.suggestedFilename(), /^axel-\d{8}-\d{4}\.(mp4|ts)$/);
  assert.deepEqual([...new Set(segs)].sort((a, b) => a - b), [2, 3, 4]);
  await p.waitForFunction(() => /Pronto/.test(document.querySelector('.mom[data-id="barco"] .momBaixando').textContent));
  assert.equal(await p.locator('.mom[data-id="barco"] [data-baixar="deitado"]').isDisabled(), false);
  assert.deepEqual(erros, []);
});

test('momentos: o vertical que não consegue abrir o vídeo diz porquê, e trocar de aba larga o download', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const [barco] = MOMENTOS.momentos;
  const dados = { ...MOMENTOS, momentos: [{ ...barco, aosS: 30, fimMs: barco.inicioMs + 20_000 }] };
  await preparar(p, { dados });
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  // Pedaços de mentira: o MP4 não abre num <video>, e o cartão diz isso em vez de ficar parado.
  await p.locator('.mom[data-id="barco"] [data-baixar="tiktok"]').click();
  await p.waitForFunction(() => /Não deu para baixar/.test(document.querySelector('.mom[data-id="barco"] .momBaixando').textContent), null, { timeout: 30_000 });
  assert.equal(await p.locator('.mom[data-id="barco"] [data-baixar="tiktok"]').isDisabled(), false);
  // Um download a meio e trocar de aba: nada chega a ser entregue (os pedaços agora demoram, para haver um "a meio").
  await p.route(/stream\.kick\.com\/falsa\/.*\.ts$/, async (r) => { await new Promise((k) => setTimeout(k, 1500)); return r.fulfill({ status: 200, contentType: 'video/mp2t', body: Buffer.alloc(4096, 7) }); });
  let baixou = false;
  p.on('download', () => { baixou = true; });
  await p.locator('.mom[data-id="barco"] [data-baixar="deitado"]').click();
  await p.click('#abaStreamers');
  await p.waitForTimeout(2500);
  assert.equal(baixou, false);
  assert.deepEqual(erros, []);
});
