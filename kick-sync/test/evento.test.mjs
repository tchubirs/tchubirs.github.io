// O evento, de ponta a ponta, num browser a sério: colar o elenco, ver o mapa, clicar num lance, abrir
// o lance com o time, voltar ao mapa, partilhar o link do lance e abri-lo noutra janela.
//
// A Kick é a de test/falsa.mjs: dois canais com vídeo (tchubi e outro, das 21:00 às 21:10 de 30/08) e
// um terceiro que não existe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });

const ELENCO = 'Time Alfa: tchubi, outro\nTime Beta: terceiro';

/** Clicar no mapa na faixa de `canal`, no instante `ms`. */
async function clicarNoMapa(p, canal, ms) {
  const alvo = await p.evaluate(({ canal: c, ms: m }) => {
    const ev = window.__evento;
    const rolo = document.getElementById('mapaRolo');
    const l = ev.mapa.linhas.find((x) => x.canal === c);
    const caixa = rolo.getBoundingClientRect();
    const x = ((m - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth;
    return { x: caixa.left + x, y: caixa.top + l.y - ev.topo + l.altura / 2 };
  }, { canal, ms });
  await p.mouse.click(alvo.x, alvo.y);
}

async function abrirEvento(p) {
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', ELENCO);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
}

test('colar o elenco abre o mapa, com os times e quem não existe dito pelo nome',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    assert.match(await p.locator('#resumoEvento').innerText(), /2 times · 3 canais · 2 com vídeo/);
    assert.match(await p.locator('#avisosEvento').innerText(), /terceiro: não existe na Kick/);
    // As portas saem do caminho: o que se faz a seguir é no mapa.
    assert.equal(await p.locator('#portaEvento').isVisible(), false);
    assert.equal(await p.locator('#entrada').isVisible(), false);
    const canais = await p.evaluate(() => window.__evento.mapa.linhas.filter((l) => l.tipo === 'canal').map((l) => l.canal));
    assert.deepEqual(canais, ['tchubi', 'outro', 'terceiro']);
    assert.deepEqual(erros, []);
  });

test('um clique no mapa escolhe o lance, e "ver" abre o time naquele instante',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    const ms = T + 5 * 60_000;
    await clicarNoMapa(p, 'outro', ms);
    await p.waitForSelector('#lance:not([hidden])');
    assert.match(await p.locator('#lanceTitulo').innerText(), /^outro · /);
    assert.match(await p.locator('#lanceTime').innerText(), /Time Alfa · 2 do time no ar/);
    const escolhido = await p.evaluate(() => window.__evento.escolha.ms);
    assert.ok(Math.abs(escolhido - ms) < 5000, `escolheu ${new Date(escolhido).toISOString()}`);

    await p.click('#verLance');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('.tile').count(), 2, 'o time inteiro, os dois que estavam no ar');
    const noite = await p.evaluate(() => ({ agora: window.__estado.agoraMs, focos: window.__estado.focos }));
    assert.ok(Math.abs(noite.agora - escolhido) < 2000, 'o vídeo abre no instante do lance');
    assert.deepEqual(noite.focos, ['outro'], 'e com quem se clicou em foco');

    // O mapa encolhe numa barra, e volta com um botão.
    assert.equal(await p.locator('#mapaRolo').isVisible(), false);
    await p.click('#mostrarMapa');
    assert.equal(await p.locator('#mapaRolo').isVisible(), true);
    assert.equal(await p.locator('#mostrarMapa').getAttribute('aria-expanded'), 'true');
    await p.click('#mostrarMapa');
    assert.equal(await p.locator('#mapaRolo').isVisible(), false);
    assert.deepEqual(erros, []);
  });

test('o link do lance abre o evento noutra janela, no mesmo instante',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    const ms = T + 3 * 60_000;
    await clicarNoMapa(p, 'tchubi', ms);
    await p.waitForSelector('#lance:not([hidden])');
    // Sem permissão de área de transferência o link aparece escrito, que é o que se lê aqui.
    await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('não')) } }); });
    await p.click('#partilharEvento');
    const url = await p.locator('#estadoPartilhaEvento').innerText();
    assert.match(url, /#evento=[A-Za-z0-9_-]+&t=\d+$/);

    const { p: q, erros: erros2 } = await abrir();
    await kickFalsa(q, { canais: ['tchubi', 'outro'] });
    await q.goto(url, { waitUntil: 'networkidle' });
    await q.waitForFunction(() => window.__evento?.escolha, null, { timeout: 15000 });
    const e = await q.evaluate(() => window.__evento.escolha);
    assert.equal(e.canal, 'tchubi');
    assert.ok(Math.abs(e.ms - ms) < 5000);
    assert.equal(await q.locator('#nomeEvento').innerText(), await p.locator('#nomeEvento').innerText());
    assert.deepEqual([...erros, ...erros2], []);
  });

test('fechar o evento devolve as duas portas',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    await p.click('#fecharEvento');
    assert.equal(await p.locator('#evento').isVisible(), false);
    assert.equal(await p.locator('#portaEvento').isVisible(), true);
    assert.equal(await p.locator('#entrada').isVisible(), true);
    assert.deepEqual(erros, []);
  });

test('durante o jogo a busca pelo som não serve para achar rivais',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { cedoDemais, ATRASO_MIN } = await import('../site/evento-ui.js');
    const agora = Date.parse('2026-10-06T12:00:00Z');
    assert.equal(cedoDemais(agora - 5 * 60_000, ATRASO_MIN, agora), true, 'há 5 min: cedo demais');
    assert.equal(cedoDemais(agora - 20 * 60_000, ATRASO_MIN, agora), false, 'há 20 min: pode');
    assert.equal(cedoDemais(agora - 1000, 0, agora), false, 'o organizador pode tirar o atraso');

    // Num link com um atraso enorme, o lance de agosto ainda é "recente": a busca recusa e diz porquê.
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    await clicarNoMapa(p, 'tchubi', T + 4 * 60_000);
    await p.waitForSelector('#lance:not([hidden])');
    await p.evaluate(() => { window.__evento.atrasoMin = 10_000_000; });
    await p.click('#procurarOutros');
    assert.match(await p.locator('#estadoLance').innerText(), /trapaça/);
    assert.deepEqual(erros, []);
  });

test('quem chega sem elenco abre um exemplo com o Rust que está ao vivo',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.route('https://kick.com/stream/livestreams/**', (rota) => rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        current_page: 1,
        next_page_url: null,
        data: ['tchubi', 'outro'].map((slug, i) => ({
          slug: `emissao-${i}`, session_title: 'rust', viewer_count: 100 - i, language: 'Portuguese',
          start_time: '2026-08-30 21:00:00', tags: [], channel: { slug },
        })),
      }),
    }));
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.click('#exemploAoVivo');
    await p.waitForFunction(() => window.__evento?.mapa, null, { timeout: 15000 });
    assert.match(await p.locator('#nomeEvento').innerText(), /Rust ao vivo agora/);
    const canais = await p.evaluate(() => window.__evento.mapa.linhas.filter((l) => l.tipo === 'canal').map((l) => l.canal));
    assert.deepEqual(canais, ['tchubi', 'outro']);
    assert.deepEqual(erros, []);
  });

test('procurar por palavras que passa do limite de páginas diz que a lista ficou cortada',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    let pedidos = 0;
    await p.route('https://kick.com/stream/livestreams/**', (rota) => {
      const n = Number(new URL(rota.request().url()).searchParams.get('page'));
      pedidos++;
      return rota.fulfill({
        status: 200,
        contentType: 'application/json',
        // A Kick diz sempre que há mais: a busca pára nas 30 páginas.
        body: JSON.stringify({
          current_page: n,
          next_page_url: `https://kick.com/stream/livestreams/en?page=${n + 1}`,
          data: [{ slug: `emissao-${n}`, session_title: 'Rust Kick Off', viewer_count: 1000 - n, tags: [], channel: { slug: `canal${n}` } }],
        }),
      });
    });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.evaluate(() => { document.getElementById('palavrasAoVivo').value = 'kick off'; document.getElementById('procurarAoVivo').click(); });
    await p.waitForFunction(() => /espectadores/.test(document.getElementById('estadoEvento').textContent), null, { timeout: 15000 });
    assert.equal(pedidos, 30);
    assert.match(await p.locator('#estadoEvento').innerText(), /Achei 30 lives, mas só li as mais vistas/);
    assert.equal((await p.locator('#elenco').inputValue()).split('\n').length, 30);
    assert.deepEqual(erros, []);
  });

test('o mapa abre no trecho em que a maioria esteve no ar, e não no mês inteiro de VODs', async () => {
  const { trechoDoEvento } = await import('../site/evento-ui.js');
  const H = 3600_000;
  const t = Date.parse('2026-10-01T18:00:00Z');
  // Dez canais juntos das 18:00 às 22:00 do dia 1, e cada um com VODs soltos ao longo do mês.
  const coberturas = new Map();
  for (let c = 0; c < 10; c++) {
    coberturas.set(`c${c}`, [
      [t - (20 + c) * 24 * H, t - (20 + c) * 24 * H + 3 * H],
      [t + c * 60_000, t + 4 * H],
      [t + (5 + c) * 24 * H, t + (5 + c) * 24 * H + 2 * H],
    ]);
  }
  const r = trechoDoEvento(coberturas);
  assert.ok(r.deMs >= t - 30 * 60_000 && r.deMs <= t, `começa ${new Date(r.deMs).toISOString()}`);
  assert.ok(r.ateMs >= t + 4 * H && r.ateMs <= t + 4 * H + 30 * 60_000, `acaba ${new Date(r.ateMs).toISOString()}`);
  assert.equal(trechoDoEvento(new Map()), null);
});

test('escolher um lance lê o chat do time e marca no mapa onde ele explodiu',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    await clicarNoMapa(p, 'outro', T + 2 * 60_000);
    await p.waitForFunction(() => /picos? de chat/.test(document.getElementById('estadoChat').textContent), null, { timeout: 15000 });
    const marcas = await p.evaluate(() => Object.fromEntries([...window.__evento.marcas].map(([c, l]) => [c, l.map((m) => m.ms)])));
    // O pico é o minuto 5 do tchubi (o balde do minuto, marcado a meio); o outro só teve conversa normal.
    assert.deepEqual(marcas.tchubi, [T + 5 * 60_000 + 30_000]);
    assert.deepEqual(marcas.outro, []);
    // Um clique perto da marca vai à marca.
    await clicarNoMapa(p, 'tchubi', T + 5 * 60_000 + 29_000);
    const e = await p.evaluate(() => window.__evento.escolha);
    assert.equal(e.ms, T + 5 * 60_000 + 30_000);
    assert.deepEqual(erros, []);
  });

test('no mapa, quem está ao vivo vai até agora, e uma duração desconhecida não conta como ao vivo', async () => {
  const { coberturasDe } = await import('../site/evento-ui.js');
  const agora = Date.parse('2026-10-06T12:00:00Z');
  const c = coberturasDe([
    { slug: 'vivo', estado: 'ok', vods: [{ inicioApi: agora - 3600e3, duracaoMs: 0, aoVivo: true }] },
    { slug: 'acabou', estado: 'ok', vods: [{ inicioApi: agora - 7200e3, duracaoMs: 1800e3 }] },
    { slug: 'semDuracao', estado: 'ok', vods: [{ inicioApi: agora - 7200e3, duracaoMs: null }] },
    { slug: 'naoExiste', estado: 'canal-nao-existe', vods: [] },
  ], agora);
  assert.deepEqual(c.get('vivo'), [[agora - 3600e3, agora]]);
  assert.deepEqual(c.get('acabou'), [[agora - 7200e3, agora - 5400e3]]);
  assert.equal(c.has('semDuracao'), false);
  assert.equal(c.has('naoExiste'), false);
});
