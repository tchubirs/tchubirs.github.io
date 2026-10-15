// Só o jogo do evento (jogo.js): uma lista de canais de Rust com quem, na mesma noite, estava no GTA RP.
// As lives de outro jogo ficam fora da detecção, dos melhores lances, do time pelo som e do "Guardar
// todos", e continuam no mapa a cinza, abertas à mão.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoJogo, eDoJogo, separarPorJogo } from '../site/jogo.js';
import { vodsDoCanal } from '../site/kick.js';
import { paraArquivo, deArquivo, lerElenco } from '../site/elenco.js';
import { montarMapa, oQueEstaAqui } from '../site/mapa.js';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer, saltarTempo } from './palco.mjs';
import { pedacoNumero } from './pedaco.mjs';

const GTA = 'Grand Theft Auto V (GTA)';

test('o jogo compara-se sem maiúsculas, acentos nem pontuação, pelo nome ou pelo slug da Kick', () => {
  assert.equal(chaveDoJogo(' Rust '), 'rust');
  assert.equal(chaveDoJogo(GTA), 'grandtheftautovgta');
  assert.equal(eDoJogo({ categoria: 'Rust' }, 'rust'), true);
  assert.equal(eDoJogo({ categoria: 'RUST', categoriaSlug: 'rust' }, 'Rust'), true);
  assert.equal(eDoJogo({ categoria: GTA, categoriaSlug: 'grand-theft-auto-v' }, 'Rust'), false);
  assert.equal(eDoJogo({ categoria: 'Outra coisa', categoriaSlug: 'rust' }, 'Rust'), true, 'o slug também serve');
  assert.equal(eDoJogo({ categoria: GTA }, null), true, 'sem jogo no evento, nada fica de fora');
  assert.equal(eDoJogo({ categoria: GTA }, '  '), true);
  assert.equal(eDoJogo({}, 'Rust'), true, 'sem categoria no VOD, conta como do jogo');
  // Medido no Abisal: Rust jogado num VOD que a Kick chama "Just Chatting" (grupo 2, não é jogo).
  assert.equal(eDoJogo({ categoria: 'Just Chatting', categoriaJogo: false }, 'Rust'), true);
  assert.equal(eDoJogo({ categoria: 'League of Legends', categoriaJogo: true }, 'Rust'), false);
});

test('separar: os VODs de outro jogo saem de um lado e ficam do outro; sem jogo, nada muda', () => {
  const resultados = [
    { slug: 'a', estado: 'ok', vods: [{ id: 1, categoria: 'Rust' }, { id: 2, categoria: GTA }] },
    { slug: 'b', estado: 'ok', vods: [{ id: 3, categoria: GTA }, { id: 4, categoria: GTA }, { id: 5, categoria: 'Just Chatting' }] },
    { slug: 'c', estado: 'ok', vods: [{ id: 6 }] },
    { slug: 'd', estado: 'sem-vods', vods: [] },
  ];
  const { doJogo, outro } = separarPorJogo(resultados, 'Rust');
  assert.deepEqual(doJogo.map((r) => [r.slug, r.vods.map((v) => v.id)]), [['a', [1]], ['b', []], ['c', [6]], ['d', []]]);
  assert.deepEqual(outro.map((r) => [r.slug, r.vods.map((v) => v.id)]), [['a', [2]], ['b', [3, 4, 5]]]);
  assert.equal(resultados[0].vods.length, 2, 'as listas lidas não se mexem');
  const sem = separarPorJogo(resultados, null);
  assert.equal(sem.doJogo, resultados);
  assert.deepEqual(sem.outro, []);
});

test('o kick.js guarda o jogo de cada VOD (categories[0].name, como a Kick o manda)', async () => {
  const corpo = [
    { id: 1, source: 'https://a/master.m3u8', start_time: '2026-10-11 21:00:00', video: {}, categories: [{ id: 13, name: 'Rust', slug: 'rust' }] },
    { id: 2, source: 'https://b/master.m3u8', start_time: '2026-10-10 21:00:00', video: {}, categories: [{ id: 8, name: GTA, slug: 'grand-theft-auto-v' }] },
    { id: 3, source: 'https://c/master.m3u8', start_time: '2026-10-09 21:00:00', video: {} },
  ];
  corpo[0].categories[0].category_id = 1;
  corpo[1].categories[0].category_id = 1;
  const r = await vodsDoCanal('mills_rp', { buscar: async () => ({ status: 200, ok: true, json: async () => corpo }) });
  assert.deepEqual(r.vods.map((v) => [v.id, v.categoria, v.categoriaSlug, v.categoriaJogo]),
    [[3, null, null, null], [2, GTA, 'grand-theft-auto-v', true], [1, 'Rust', 'rust', true]]);
  const conversa = await vodsDoCanal('sapoiq', {
    buscar: async () => ({
      status: 200, ok: true,
      json: async () => [{ id: 9, source: 'https://d/m.m3u8', start_time: '2026-10-05 20:44:00', video: {}, categories: [{ name: 'Just Chatting', slug: 'just-chatting', category_id: 2 }] }],
    }),
  });
  assert.equal(conversa.vods[0].categoriaJogo, false);
});

test('o arquivo do evento leva o jogo quando tem, e volta com ele', () => {
  const elenco = lerElenco('a\nb');
  const com = paraArquivo(elenco, { nome: 'X', jogo: ' Rust ' });
  assert.equal(com.jogo, 'Rust');
  assert.equal('jogo' in paraArquivo(elenco, { nome: 'X' }), false, 'sem jogo, o arquivo fica como era');
  assert.equal(deArquivo(com).info.jogo, 'Rust');
  assert.equal(deArquivo({ nome: 'X', canais: ['a'] }).info.jogo, null);
  assert.equal(deArquivo({ nome: 'X', canais: ['a'], jogo: 7 }).info.jogo, null);
});

test('o mapa pinta as lives de outro jogo à parte, e um clique nelas diz que é outro jogo', () => {
  const coberturas = new Map([['a', [[0, 100]]]]);
  const outros = new Map([['b', [[0, 100]]], ['a', [[200, 300]]]]);
  const mapa = montarMapa({ times: [{ nome: null, canais: ['a', 'b'] }], coberturas, abertos: new Set([null]), outros });
  const [a, b] = mapa.linhas.filter((l) => l.tipo === 'canal');
  assert.deepEqual(b.coberturas, []);
  assert.deepEqual(b.outros, [[0, 100]]);
  assert.deepEqual(a.outros, [[200, 300]]);
  assert.deepEqual([mapa.inicioMs, mapa.fimMs], [0, 100], 'o outro jogo não estica o mapa');
  const vista = { deMs: 0, ateMs: 400 };
  const aqui = (l, ms) => oQueEstaAqui(mapa, { x: (ms / 400) * 400, y: l.y + 1, vista, largura: 400 });
  assert.equal(aqui(b, 50).noAr, false);
  assert.equal(aqui(b, 50).outroJogo, true);
  assert.equal(aqui(a, 50).outroJogo, undefined);
  assert.equal(aqui(a, 250).outroJogo, true);
  assert.equal(aqui(a, 150).outroJogo, undefined, 'um buraco não é outro jogo');
});

// ── na página ───────────────────────────────────────────────────────────────

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function clicarNoMapa(p, canal, ms) {
  const alvo = await p.evaluate(({ c, m }) => {
    const ev = window.__evento;
    const rolo = document.getElementById('mapaRolo');
    rolo.scrollIntoView({ block: 'nearest' });
    const l = ev.mapa.linhas.find((x) => x.canal === c);
    const caixa = rolo.getBoundingClientRect();
    return {
      x: caixa.left + ((m - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth,
      y: caixa.top + l.y - ev.topo + l.altura / 2,
    };
  }, { c: canal, m: ms });
  await p.mouse.click(alvo.x, alvo.y);
}

test('evento de Rust: quem estava no GTA fica a cinza, fora dos melhores lances e do "todos", e abre à mão sozinho',
  semNavegador, async () => {
    const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, {
      canais: ['rust1', 'rust2', 'gta1'],
      // O rust2 joga Rust num VOD que a Kick chama "Just Chatting": fica.
      categorias: { '*': 'Rust', gta1: GTA, rust2: 'Just Chatting' },
      chatPicos: { rust1: [{ min: 3, n: 40 }], gta1: [{ min: 5, n: 60 }] },
    });
    await p.route('**/1080p60/*.ts', (rota) => rota.fulfill({
      status: 200, contentType: 'video/mp2t', body: pedacoNumero(Number(rota.request().url().match(/(\d+)\.ts$/)[1])),
    }));
    await p.route('**/eventos/jogo-teste.json', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ nome: 'Jogo teste', jogo: 'Rust', canais: ['rust1', 'rust2', 'gta1'] }),
    }));
    await p.goto(`http://127.0.0.1:${PORTA}/?e=jogo-teste`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });

    const estado = await p.evaluate(() => ({
      jogo: window.__evento.jogo,
      com: [...window.__evento.coberturas.keys()].sort(),
      outro: [...window.__evento.outroJogo.keys()],
      outros: window.__evento.mapa.linhas.find((l) => l.canal === 'gta1').outros?.length,
    }));
    assert.deepEqual(estado, { jogo: 'Rust', com: ['rust1', 'rust2'], outro: ['gta1'], outros: 1 });

    // Os melhores lances: o chat de todos lê só os do jogo, e o pico do gta1 não entra.
    await p.locator('#melhoresLerChat').scrollIntoViewIfNeeded();
    await p.click('#melhoresLerChat');
    await p.waitForFunction(() => /^Chat lido de \d+ canais/.test(document.getElementById('melhoresEstado').textContent), null, { timeout: 30000 });
    await p.waitForFunction(() => document.querySelectorAll('#melhoresLista > li').length > 0, null, { timeout: 10000 });
    const canais = await p.$$eval('#melhoresLista .melhorCanais', (xs) => xs.map((x) => x.textContent));
    assert.ok(canais.some((c) => c.includes('rust1')), canais.join(' | '));
    assert.ok(!canais.some((c) => c.includes('gta1')), canais.join(' | '));
    assert.deepEqual(await p.evaluate(() => window.__evento.janelasDoChat('gta1')), [], 'o chat do gta1 nem se lê');

    // Um clique na faixa cinza: diz que é outro jogo e abre só ele.
    await clicarNoMapa(p, 'gta1', T + 5 * 60_000);
    await p.waitForFunction(() => !document.getElementById('lance').hidden);
    assert.match(await p.locator('#estadoLance').innerText(), /gta1 estava em Grand Theft Auto V \(GTA\) nesta hora, e o evento é de Rust/);
    assert.equal(await p.locator('#verLance').isDisabled(), false);
    assert.equal(await p.locator('#procurarOutros').isDisabled(), true, 'nem o time pelo som');
    assert.match(await p.locator('#abrirTodosVodTexto').innerText(), /2/, 'abrir todos com vídeo conta só os do jogo');
    await p.click('#verLance');
    await p.waitForFunction(() => window.__estado?.linhas?.length === 1 && window.__estado.linhas[0].slug === 'gta1', null, { timeout: 15000 });

    // Com os três na grelha: a faixa do gta1 a cinza, e fora do "todos" (detecção e chat).
    await p.evaluate((ms) => window.__abrirLanceDoEvento(['rust1', 'rust2', 'gta1'], ms, 'rust1'), T + 3 * 60_000);
    await p.waitForFunction(() => window.__estado?.linhas?.length === 3, null, { timeout: 15000 });
    await p.waitForSelector('.faixa[data-slug="gta1"].outroJogo');
    assert.equal(await p.locator('.faixa[data-slug="gta1"] .outroJogoFaixa').innerText(), 'outro jogo nesta live');
    assert.equal(await p.locator('.faixa[data-slug="rust1"].outroJogo').count(), 0);
    assert.deepEqual(await p.evaluate(() => window.__jogo.pedidosDe('*', 'tudo').sort()), ['rust1', 'rust2']);
    assert.deepEqual(await p.evaluate(() => window.__jogo.pedidosDe('gta1', 'tudo')), ['gta1'], 'pedido pelo nome, entra');

    // "Guardar todos agora": uma kill na POV do gta1 e outra na do rust1; o gta1 não se guarda.
    for (const quem of ['gta1', 'rust1']) {
      await saltarTempo(p, 60_000);
      await p.evaluate((q) => { window.__estado.focos = [q]; }, quem);
      await p.click('#marcarKill');
    }
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 2, null, { timeout: 10000 });
    await p.click('#guardarLances');
    await p.waitForFunction(() => !window.__estado.montagem && document.querySelectorAll('#fila a').length > 0, null, { timeout: 60000 });
    const nomes = await p.locator('#fila a').evaluateAll((as) => as.map((a) => a.download));
    assert.ok(nomes.some((n) => n.includes('rust1')), nomes.join(', '));
    assert.ok(!nomes.some((n) => n.includes('gta1')), nomes.join(', '));
    assert.deepEqual(erros, []);
  });
