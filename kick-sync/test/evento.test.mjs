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
    assert.match(await p.locator('#avisosEvento').innerText(), /1 canal não existe na Kick: terceiro\./);
    assert.equal(await p.locator('#corrigirElenco').isVisible(), true, 'e um botão para voltar ao elenco');
    // E no mapa a faixa dele diz que o nome não foi achado, em vez de parecer alguém que não transmitiu.
    assert.deepEqual(await p.evaluate(() => [...window.__evento.falhados]), ['terceiro']);
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
    // Sem área de transferência o link vai para a barra de endereço, e o ecrã diz para o copiar de lá.
    const url = await p.evaluate(() => location.href);
    assert.match(url, /#evento=[A-Za-z0-9_-]+&t=\d+&c=tchubi$/);
    assert.match(await p.locator('#estadoPartilhaEvento').innerText(), /barra de endereço/);

    const { p: q, erros: erros2 } = await abrir();
    await kickFalsa(q, { canais: ['tchubi', 'outro'] });
    await q.goto(url, { waitUntil: 'networkidle' });
    await q.waitForFunction(() => window.__evento?.escolha, null, { timeout: 15000 });
    const e = await q.evaluate(() => window.__evento.escolha);
    assert.equal(e.canal, 'tchubi');
    assert.ok(Math.abs(e.ms - ms) < 5000);
    // Quem recebe o link de um lance cai direto no lance, com o vídeo no instante.
    await q.waitForSelector('.tile', { timeout: 15000 });
    assert.deepEqual(await q.evaluate(() => window.__estado.focos[0]), 'tchubi');
    assert.equal(await q.locator('#nomeEvento').innerText(), await p.locator('#nomeEvento').innerText());
    assert.deepEqual([...erros, ...erros2], []);
  });

test('um elenco grande demais para um link diz isso, em vez de copiar um link estragado',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    // O `codificar` da própria página, com 2001 canais: dá null, porque nenhum link com tantos abre.
    const link = await p.evaluate(async () => {
      const { codificar } = await import('./elenco.js');
      window.__evento.link = await codificar({ times: [], soltos: Array.from({ length: 2001 }, (_, i) => `c${i}`) });
      return window.__evento.link;
    });
    assert.equal(link, null);
    await p.evaluate(() => {
      window.__copiado = null;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copiado = t; return Promise.resolve(); } } });
    });
    const antes = await p.evaluate(() => location.href);
    await p.click('#partilharEvento');
    assert.match(await p.locator('#estadoPartilhaEvento').innerText(), /grande demais para caber num link/);
    assert.equal(await p.evaluate(() => window.__copiado), null, 'nada foi copiado');
    assert.equal(await p.evaluate(() => location.href), antes, 'e nenhum "#evento=null" foi para a barra de endereço');
    assert.deepEqual(erros, []);
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
    // A legenda diz o que são as marcas, e cada pico também é um botão com a hora.
    assert.equal(await p.locator('#legendaPico').isVisible(), true);
    await clicarNoMapa(p, 'outro', T + 2 * 60_000);
    await p.waitForFunction(() => window.__evento.escolha?.canal === 'outro');
    const botoes = p.locator('#picosChat button.pico');
    await botoes.first().waitFor();
    assert.equal(await botoes.count(), 1);
    assert.equal(await botoes.first().getAttribute('data-canal'), 'tchubi');
    assert.match(await botoes.first().innerText(), /^\d{2}:\d{2}$/);
    await botoes.first().click();
    const pelaHora = await p.evaluate(() => window.__evento.escolha);
    assert.deepEqual([pelaHora.canal, pelaHora.ms], ['tchubi', T + 5 * 60_000 + 30_000]);
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

test('no telemóvel o painel do lance fica preso ao fundo sem tapar o mapa',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    await clicarNoMapa(p, 'tchubi', T + 2 * 60_000);
    await p.waitForSelector('#lance:not([hidden])');
    // O chat chega depois e muda o que está por cima do mapa: espera-se por ele, e pelo rolar suave.
    await p.waitForFunction(() => /pico/.test(document.getElementById('estadoChat').textContent), null, { timeout: 15000 });
    await p.waitForFunction(() => {
      const mapa = document.getElementById('mapaRolo').getBoundingClientRect();
      const lance = document.getElementById('lance').getBoundingClientRect();
      return mapa.bottom <= lance.top && lance.bottom <= innerHeight + 1;
    }, null, { timeout: 5000 });
    assert.equal(await p.locator('#verLance').isVisible(), true);
    assert.deepEqual(erros, []);
  });

test('o mapa anda-se pelo teclado: setas, Enter para escolher e o que está sob o cursor é dito',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    await p.focus('#mapaRolo');
    // Linhas: Time Alfa, tchubi, outro, Time Beta, terceiro. O cursor começa na primeira.
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('ArrowDown');
    assert.match(await p.locator('#mapaVoz').textContent(), /^outro · Time Alfa · .* · no ar$/);
    const antes = await p.evaluate(() => window.__evento.cursor.ms);
    await p.keyboard.press('ArrowRight');
    const depois = await p.evaluate(() => window.__evento.cursor.ms);
    assert.ok(depois > antes, 'a seta para a direita anda no tempo');
    await p.keyboard.press('Enter');
    await p.waitForSelector('#lance:not([hidden])');
    const e = await p.evaluate(() => window.__evento.escolha);
    assert.deepEqual([e.canal, e.ms], ['outro', depois]);
    // As setas no mapa não mexem no vídeo nem rolam a página.
    assert.equal(await p.evaluate(() => scrollY), 0);
    // Enter num time fecha-o, e o cursor fica no cabeçalho dele.
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('Enter');
    assert.match(await p.locator('#mapaVoz').textContent(), /^Time Alfa · 2 canais · fechado$/);
    assert.deepEqual(erros, []);
  });
