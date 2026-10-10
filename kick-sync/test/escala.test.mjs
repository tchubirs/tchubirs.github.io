// Muitos canais de uma vez, num browser a sério.
//
// O evento são quinhentos streamers, e o que corre bem com dois corre mal com
// quinhentos de maneiras que os testes de dois não apanham: um leitor que
// morreu e ninguém volta a criar, um salto que pede um pedaço de vídeo a cada
// quadro da grelha, um canal que a Kick não deu e desaparece sem aviso.
//
// Ficheiro à parte dos outros dois de página para não lhes pesar no tempo
// limite de cada ficheiro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });

// Um hls.js de mentira que guarda cada leitor criado, para o teste poder ver
// quantos foram feitos e mandar um deles falhar como o verdadeiro falha.
const HLS_COM_ERROS = 'window.__carregados=[];window.__hls=[];'
  + 'window.Hls=function(){var m=null,eu=this;eu.ouvintes={};window.__hls.push(eu);'
  + 'eu.on=function(n,f){eu.ouvintes[n]=f;};'
  + 'eu.loadSource=function(u){window.__carregados.push(u);eu.url=u;};'
  // Com imagem logo: sem isto a página esperava quatro segundos pelo
  // principal antes de tratar dos outros, e cada teste pagava esse tempo.
  + 'eu.attachMedia=function(v){m=v;var q=v.closest(".tile");eu.slug=q&&q.dataset.slug;'
  + 'Object.defineProperty(v,"readyState",{configurable:true,get:function(){return 4;}});'
  + 'setTimeout(function(){try{m.dispatchEvent(new Event("loadeddata"));}catch(e){}},30);};'
  + 'eu.destroy=function(){eu.destruido=true;};};'
  + 'window.Hls.isSupported=function(){return true;};'
  + 'window.Hls.Events={ERROR:"hlsError"};';

async function abrirNoite({ canais, ecra, escrito = canais.join('\n'), antes = async () => {} }) {
  const { p, erros } = await abrir(ecra ? { ecra } : {});
  const pedidos = await kickFalsa(p, { canais: canais.map((c) => c.toLowerCase().replace(/^@/, '')) });
  await p.route('**/hls-*.js', (rota) => rota.fulfill({
    status: 200, contentType: 'text/javascript', body: HLS_COM_ERROS,
  }));
  await antes(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', escrito);
  await p.click('#carregar');
  return { p, erros, pedidos };
}

test('o Parar aparece quando há uma tarefa longa e manda-a parar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    assert.equal(await p.locator('#parar').isVisible(), false, 'sem tarefa não há o que parar');
    await p.evaluate(() => { window.__parou = 0; window.__estado.cancelar = () => { window.__parou++; }; });
    await p.locator('#parar').click();
    assert.equal(await p.evaluate(() => window.__parou), 1);
    await p.evaluate(() => { window.__estado.cancelar = null; });
    assert.equal(await p.locator('#parar').isVisible(), false, 'acabada a tarefa, o botão sai');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um canal cuja playlist a Kick recusa é dito pelo nome, e os outros abrem',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrirNoite({
      canais: ['tchubi', 'kodd'],
      antes: (pg) => pg.route('https://stream.kick.com/falsa/kodd/**', (r) => r.fulfill({ status: 503, body: '<Error/>' })),
    });
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.waitForFunction(() => /kodd/.test(document.getElementById('estadoNoite').textContent), null, { timeout: 10000 });
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('.tile')].map((t) => t.dataset.slug)), ['tchubi']);
    assert.ok(!(await p.evaluate(() => [...window.__estado.pecasLidas.keys()].some((k) => k.includes('kodd')))),
      'a página de erro ficou guardada como se fosse uma playlist');

    // A Kick volta a responder e um Carregar traz o canal: nada de mau ficou guardado.
    await p.unroute('https://stream.kick.com/falsa/kodd/**');
    // Com o vídeo aberto a porta de entrada fica atrás do botão Canais.
    await p.click('#editarCanais');
    await p.click('#carregar');
    await p.waitForFunction(() => document.querySelectorAll('.tile').length === 2, null, { timeout: 15000 });
    assert.deepEqual(erros.filter((e) => !/503/.test(e)), []);
    await p.close();
  });

test('o ✕ tira um canal escrito com maiúsculas e @',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrirNoite({ canais: ['Tchubi', '@Kodd'] });
    await p.waitForSelector('#listaCanais li[data-slug="kodd"] .tirar, li[data-slug="kodd"] .tirar', { state: 'attached', timeout: 15000 });
    await p.click('#editarCanais');
    await p.locator('li[data-slug="kodd"] .tirar').first().click();
    assert.equal(await p.inputValue('#canais'), 'Tchubi');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um leitor que o hls.js deu por perdido diz-o, e o clique cria outro',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrirNoite({ canais: ['tchubi', 'kodd'] });
    await p.waitForFunction(() => window.__hls?.some((h) => h.slug === 'kodd'), null, { timeout: 15000 });
    const antes = await p.evaluate(() => window.__hls.length);
    await p.evaluate(() => {
      const h = window.__hls.filter((x) => x.slug === 'kodd' && !x.destruido).pop();
      h.ouvintes.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError' });
    });
    const tile = p.locator('.tile[data-slug="kodd"]');
    assert.match(await tile.locator('.estadoTile').innerText(), /não carregou/);
    assert.ok(await tile.evaluate((t) => t.classList.contains('vazio')));

    await tile.click();
    await p.waitForFunction((n) => window.__hls.slice(n).some((h) => h.slug === 'kodd'), antes, { timeout: 10000 });
    assert.ok(!(await tile.evaluate((t) => t.classList.contains('vazio'))), 'o quadro continuou a dizer que falhou');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('trocar de idioma traduz os quadros sem refazer nenhum leitor',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrirNoite({ canais: ['tchubi', 'kodd'] });
    await p.waitForFunction(() => window.__hls?.length >= 2, null, { timeout: 15000 });
    await p.waitForTimeout(500);
    const antes = await p.evaluate(() => ({ n: window.__hls.length, urls: window.__carregados.length }));
    const titulo = () => p.locator('.tile[data-slug="kodd"] .ecraCheio').getAttribute('title');
    const pt = await titulo();
    await p.selectOption('#idioma', 'en');
    await p.waitForTimeout(500);
    assert.notEqual(await titulo(), pt, 'o quadro não foi traduzido');
    assert.deepEqual(await p.evaluate(() => ({ n: window.__hls.length, urls: window.__carregados.length })), antes,
      'trocar de língua voltou a pedir vídeo à Kick');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um salto só move os quadros que se vêem, e os outros acertam quando aparecem',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const canais = Array.from({ length: 60 }, (_, i) => `canal${String(i).padStart(2, '0')}`);
    const { p, erros } = await abrirNoite({ canais, ecra: { width: 1000, height: 600 } });
    await p.waitForFunction((n) => document.querySelectorAll('.tile').length === n, canais.length, { timeout: 30000 });
    await p.evaluate(() => {
      const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
      window.__buscas = [];
      Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
        configurable: true,
        get() { return d.get.call(this); },
        set(v) { window.__buscas.push(this.closest('.tile')?.dataset.slug); d.set.call(this, v); },
      });
    });
    // A grelha no ecrã, com a primeira fila à vista e o resto abaixo da dobra.
    await p.evaluate(() => document.getElementById('grade').scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(800);
    const visiveis = () => p.evaluate(() => [...document.querySelectorAll('#grade .tile')].filter((t) => {
      const r = t.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
    }).map((t) => t.dataset.slug));
    const vistos = await visiveis();
    const naGrelha = await p.evaluate(() => [...document.querySelectorAll('#grade .tile')].map((t) => t.dataset.slug));
    const escondidos = naGrelha.filter((s) => !vistos.includes(s));
    assert.ok(escondidos.length > 0, 'o ecrã do teste mostra a grelha inteira e não prova nada');

    await p.evaluate(() => { window.__buscas = []; });
    await p.click('#mais1m');
    await p.waitForTimeout(800);
    const buscados = await p.evaluate(() => window.__buscas);
    const indevidos = buscados.filter((s) => escondidos.includes(s));
    assert.deepEqual(indevidos, [], 'quadros fora da vista foram buscar vídeo');

    // Rolar até ao último põe-no no instante certo, sem outro salto.
    const ultimo = escondidos[escondidos.length - 1];
    await p.evaluate(() => { window.__buscas = []; });
    await p.locator(`.tile[data-slug="${ultimo}"]`).scrollIntoViewIfNeeded();
    await p.waitForFunction((s) => window.__buscas.includes(s)
      || window.__hls.some((h) => h.slug === s && !h.destruido), ultimo, { timeout: 5000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

test('o principal que sai do foco para um lugar fora da vista larga o leitor de 1080p',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const canais = Array.from({ length: 60 }, (_, i) => `canal${String(i).padStart(2, '0')}`);
    const { p, erros } = await abrirNoite({ canais, ecra: { width: 1000, height: 600 } });
    await p.waitForFunction((n) => document.querySelectorAll('.tile').length === n, canais.length, { timeout: 30000 });
    await p.waitForFunction(() => /1080p/.test(window.__estado.players.get('canal00')?.url || ''), null, { timeout: 15000 });
    const altos = () => p.evaluate(() => [...window.__estado.players]
      .filter(([, l]) => /1080p/.test(l.url)).map(([s]) => s).sort());
    const visivel = (s) => p.evaluate((slug) => {
      const r = document.querySelector(`.tile[data-slug="${slug}"]`).getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
    }, s);

    for (const s of ['canal55', 'canal57', 'canal05', 'canal58']) {
      const tile = p.locator(`.tile[data-slug="${s}"]`);
      await tile.scrollIntoViewIfNeeded();
      await tile.click();
      await p.waitForFunction((slug) => /1080p/.test(window.__estado.players.get(slug)?.url || ''), s, { timeout: 15000 });
      await p.waitForTimeout(600);
      if (s === 'canal55') {
        assert.equal(await visivel('canal00'), false, 'o antigo principal ficou à vista e o teste não prova nada');
        assert.ok(!/1080p/.test((await p.evaluate(() => window.__estado.players.get('canal00')?.url)) || ''),
          'o antigo principal ficou com o leitor de 1080p fora da vista');
      }
    }
    assert.deepEqual(await altos(), ['canal58'], 'trocas de foco deixaram leitores de 1080p para trás');

    // Ao voltar à vista, o antigo principal tem o leitor barato dos secundários.
    await p.locator('.tile[data-slug="canal00"]').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => /160p/.test(window.__estado.players.get('canal00')?.url || ''), null, { timeout: 5000 });
    assert.deepEqual(erros, []);
    await p.close();
  });
