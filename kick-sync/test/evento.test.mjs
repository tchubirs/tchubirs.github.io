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
    assert.match(await p.locator('#resumoEvento').innerText(), /2 times, 3 canais, 2 com vídeo/);
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
    assert.match(await p.locator('#lanceTitulo').innerText(), /^outro, /);
    assert.match(await p.locator('#lanceTime').innerText(), /Time Alfa, 2 do time no ar/);
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
    // Sem permissão de área de transferência o link fica escrito no campo da janela, que é o que se lê aqui.
    await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('não')) } }); });
    await p.click('#partilharEvento');
    await p.waitForSelector('#modalPartilhar:not([hidden])');
    await p.fill('#partilharNome', 'Noite de teste');
    await p.click('#gerarLink');
    await p.waitForSelector('#resultadoPartilhar:not([hidden])');
    const url = await p.inputValue('#linkPartilhar');
    assert.match(url, /#evento=[A-Za-z0-9_-]+&nome=Noite%20de%20teste&t=\d+&c=tchubi$/);
    assert.match(await p.locator('#estadoPartilhar').innerText(), /campo acima/);

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
    await p.fill('#partilharNome', 'Grande');
    await p.click('#gerarLink');
    await p.waitForSelector('#resultadoPartilhar:not([hidden])');
    assert.match(await p.locator('#estadoPartilhar').innerText(), /grande demais para caber num link/);
    assert.equal(await p.inputValue('#linkPartilhar'), '', 'nenhum link no campo');
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
    assert.match(await p.locator('#nomeEvento').innerText(), /^2 canais de Rust ao vivo agora, sem times$/);
    // Sem times, o grupo de toda a gente não fecha: clicar no cabeçalho deixava o evento numa linha só.
    const cab = await p.evaluate(() => {
      const ev = window.__evento;
      const rolo = document.getElementById('mapaRolo');
      const l = ev.mapa.linhas.find((x) => x.tipo === 'time');
      const caixa = rolo.getBoundingClientRect();
      return l ? { x: caixa.left + 40, y: caixa.top + l.y - ev.topo + l.altura / 2 } : null;
    });
    assert.ok(cab, 'sem cabeçalho do grupo');
    await p.mouse.click(cab.x, cab.y);
    const n = await p.evaluate(() => window.__evento.mapa.linhas.filter((l) => l.tipo === 'canal').length);
    assert.equal(n, 2, 'o grupo sem time fechou');
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
    // O pico é o minuto 5 do tchubi, marcado no segundo em que o chat explodiu; o outro só teve conversa normal.
    assert.equal(marcas.tchubi.length, 1);
    const pico = marcas.tchubi[0];
    assert.ok(pico >= T + 5 * 60_000 && pico < T + 6 * 60_000 && pico % 1000 === 0, 'a marca é um segundo do minuto do pico');
    assert.deepEqual(marcas.outro, []);
    // Um clique perto da marca vai à marca.
    await clicarNoMapa(p, 'tchubi', pico + 1_000);
    const e = await p.evaluate(() => window.__evento.escolha);
    assert.equal(e.ms, pico);
    // A legenda diz o que são as marcas, e cada pico também é um botão com a hora.
    assert.equal(await p.locator('#legendaPico').isVisible(), true);
    await clicarNoMapa(p, 'outro', T + 2 * 60_000);
    await p.waitForFunction(() => window.__evento.escolha?.canal === 'outro');
    const botoes = p.locator('#picosChat button.pico');
    await botoes.first().waitFor();
    assert.equal(await botoes.count(), 1);
    assert.equal(await botoes.first().getAttribute('data-canal'), 'tchubi');
    assert.match(await botoes.first().innerText(), /^\d{2}:\d{2}$/);
    // O botão do pico abre logo o vídeo, 10 s antes do segundo do pico (o chat reage depois do lance).
    await botoes.first().click();
    await p.waitForSelector('.tile', { timeout: 15000 });
    const pelaHora = await p.evaluate(() => window.__evento.escolha);
    assert.deepEqual([pelaHora.canal, pelaHora.ms], ['tchubi', pico - 10_000]);
    const noite = await p.evaluate(() => ({ agora: window.__estado.agoraMs, focos: window.__estado.focos }));
    assert.ok(Math.abs(noite.agora - (pico - 10_000)) < 2000, 'o vídeo abre 10 s antes do pico');
    assert.deepEqual(noite.focos, ['tchubi']);
    // O pico também está na linha do tempo da live, e clicar nele vai 10 s antes, sem voltar ao mapa.
    const naRegua = p.locator('#regua .picoChat');
    await naRegua.first().waitFor();
    assert.equal(Number(await naRegua.first().getAttribute('data-ms')), pico);
    await p.click('#mais5m');
    await naRegua.first().click();
    assert.equal(await p.evaluate(() => window.__estado.agoraMs), pico - 10_000);
    // Com o vídeo aberto e o mapa recolhido, o zoom do mapa não muda nada na tela: some.
    assert.equal(await p.locator('#verTudo').isVisible(), false);
    await p.click('#mostrarMapa');
    assert.equal(await p.locator('#verTudo').isVisible(), true);
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
    assert.match(await p.locator('#mapaVoz').textContent(), /^outro, Time Alfa, .*, no ar$/);
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
    assert.match(await p.locator('#mapaVoz').textContent(), /^Time Alfa, 2 canais, fechado$/);
    assert.deepEqual(erros, []);
  });

test('recarregar a página com um lance aberto traz o evento de volta, em barra, e fechar o evento esquece-o',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    const ms = T + 3 * 60_000;
    await clicarNoMapa(p, 'tchubi', ms);
    await p.waitForSelector('#lance:not([hidden])');
    await p.click('#verLance');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.reload({ waitUntil: 'networkidle' });
    // A noite volta pela sessão de sempre, e o evento volta por baixo dela, com o mesmo lance escolhido.
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.escolha, null, { timeout: 15000 });
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#evento').isVisible(), true);
    assert.equal(await p.locator('#mostrarMapa').isVisible(), true, 'o botão que volta ao mapa');
    const e = await p.evaluate(() => window.__evento.escolha);
    assert.equal(e.canal, 'tchubi');
    assert.ok(Math.abs(e.ms - ms) < 5000);
    // Fechado o evento, recarregar já não o reabre.
    await p.click('#fecharEvento');
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    assert.equal(await p.locator('#evento').isVisible(), false);
    assert.deepEqual(erros, []);
  });

test('o botão Início fecha os vídeos: com evento volta ao mapa, sem evento volta às duas portas',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    assert.equal(await p.locator('#inicio').isVisible(), false, 'na entrada não há para onde voltar');
    await clicarNoMapa(p, 'tchubi', T + 3 * 60_000);
    await p.waitForSelector('#lance:not([hidden])');
    await p.click('#verLance');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#inicio').isVisible(), true);
    await Promise.all([p.waitForNavigation(), p.click('#inicio')]);
    await p.waitForFunction(() => window.__evento?.mapa, null, { timeout: 15000 });
    assert.equal(await p.locator('#palco').isVisible(), false, 'os vídeos fecharam');
    assert.equal(await p.locator('#mapaRolo').isVisible(), true, 'e o mapa do evento está aberto');
    // Sem evento, o Início leva às duas portas.
    await clicarNoMapa(p, 'outro', T + 3 * 60_000);
    await p.waitForSelector('#lance:not([hidden])');
    await p.click('#verLance');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#fecharEvento');
    await Promise.all([p.waitForNavigation(), p.click('#inicio')]);
    await p.waitForSelector('#portaEvento', { state: 'visible', timeout: 15000 });
    assert.equal(await p.locator('#entrada').isVisible(), true);
    assert.equal(await p.locator('#palco').isVisible(), false);
    assert.deepEqual(erros, []);
  });

test('arrastar o mapa para o lado anda no tempo, diz o trecho à vista, e não escolhe nada',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    // Aproximar primeiro: com o evento inteiro à vista não há para onde andar.
    await p.click('#aproximar');
    await p.click('#aproximar');
    const antes = await p.evaluate(() => ({ ...window.__evento.vista }));
    assert.match(await p.locator('#trechoVisto').innerText(), /^à vista: \d{2}:\d{2} a \d{2}:\d{2} \(\d+ (min|h)/);
    const caixa = await p.locator('#mapaRolo').boundingBox();
    const y = caixa.y + caixa.height / 2;
    await p.mouse.move(caixa.x + caixa.width / 2, y);
    await p.mouse.down();
    await p.mouse.move(caixa.x + caixa.width / 2 + 120, y, { steps: 6 });
    await p.mouse.up();
    const depois = await p.evaluate(() => ({ ...window.__evento.vista }));
    assert.ok(depois.deMs < antes.deMs, 'arrastar para a direita volta no tempo');
    assert.equal(Math.round(depois.ateMs - depois.deMs), Math.round(antes.ateMs - antes.deMs), 'o zoom não mudou');
    assert.equal(await p.evaluate(() => window.__evento.escolha), null, 'o arrasto escolheu um lance');
    // Um clique parado continua a escolher.
    await p.mouse.click(caixa.x + caixa.width / 2, y);
    assert.equal(await p.locator('#verTudo').getAttribute('title'), 'Volta a mostrar o trecho em que a maioria estava ao vivo');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('enquanto o lance abre, a leitura do chat espera: o vídeo vem primeiro',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    // Chat e playlists lentos, para as duas coisas se cruzarem no tempo.
    await p.route('**/api/v2/channels/*/messages**', async (r) => { await new Promise((ok) => setTimeout(ok, 250)); await r.fallback(); });
    await p.route('**/*.m3u8', async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.fallback(); });
    const linha = [];
    p.on('request', (q) => {
      const u = q.url();
      if (u.includes('/messages')) linha.push('chat');
      else if (u.includes('.m3u8')) linha.push('m3u8');
    });
    p.on('requestfinished', (q) => { if (q.url().includes('.m3u8')) linha.push('m3u8 fim'); });
    await abrirEvento(p);
    await clicarNoMapa(p, 'outro', T + 2 * 60_000);
    await p.waitForFunction(() => /chat/i.test(document.getElementById('estadoChat').textContent));
    linha.length = 0;
    await p.click('#verLance');
    await p.waitForSelector('.tile', { timeout: 20000 });
    // Depois o chat continua sozinho até ao fim.
    await p.waitForFunction(() => /picos? de chat|nenhum pico/i.test(document.getElementById('estadoChat').textContent), null, { timeout: 20000 });
    // Entre a primeira playlist do lance e a última a chegar, nenhum pedido novo ao chat.
    const de = linha.indexOf('m3u8');
    const ate = linha.lastIndexOf('m3u8 fim');
    assert.ok(de >= 0 && ate > de, `as playlists não vieram: ${linha}`);
    assert.deepEqual(linha.slice(de, ate).filter((x) => x === 'chat'), [], `o chat pediu com o vídeo a abrir: ${linha}`);
    assert.ok(linha.slice(ate).includes('chat'), 'o chat não continuou depois');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('o chat de quem está em foco anda ao lado do vídeo, no tempo dele',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    await clicarNoMapa(p, 'outro', T + 2 * 60_000);
    const botoes = p.locator('#picosChat button.pico');
    await botoes.first().waitFor();
    await botoes.first().click();
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.waitForSelector('#chatVideo:not([hidden])', { timeout: 15000 });
    assert.equal(await p.locator('#chatVideoTitulo').innerText(), 'Chat de tchubi');
    const ultima = async () => p.evaluate(() => {
      const hs = [...document.querySelectorAll('#chatLinhas .hora')].map((h) => h.textContent);
      return hs.at(-1);
    });
    const agora = await p.locator('#agora').innerText();
    const h1 = await ultima();
    assert.ok(h1 && h1 <= agora, `mensagem do futuro: ${h1} com o vídeo em ${agora}`);
    // Andar um minuto traz mensagens mais novas.
    await p.click('#mais1m');
    await p.waitForFunction((antes) => {
      const hs = [...document.querySelectorAll('#chatLinhas .hora')].map((h) => h.textContent);
      return hs.at(-1) > antes;
    }, h1, { timeout: 5000 });
    assert.ok(await p.locator('#chatVideo').isVisible());
    assert.deepEqual(erros, []);
    await p.close();
  });

test('o chat de todos lê quem não é do time, e a sensibilidade muda os picos sem pedir nada outra vez',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', 'Time Alfa: tchubi\nTime Beta: outro');
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
    await clicarNoMapa(p, 'tchubi', T + 2 * 60_000);
    await p.waitForFunction(() => /picos? de chat do time/.test(document.getElementById('estadoChat').textContent), null, { timeout: 15000 });
    assert.equal(await p.evaluate(() => window.__evento.marcas.has('outro')), false, 'o outro time foi lido sem pedir');
    assert.match(await p.locator('#comoPico').innerText(), /3 vezes .* pelo menos 8/);

    await p.click('#chatTodos');
    await p.waitForFunction(() => /de todos/.test(document.getElementById('estadoChat').textContent)
      && !/Lendo/.test(document.getElementById('estadoChat').textContent), null, { timeout: 15000 });
    assert.equal(await p.evaluate(() => window.__evento.marcas.has('outro')), true, 'o chat de todos não leu o outro');
    assert.equal(await p.locator('#chatTodos').innerText(), 'Ler o chat de todos');

    const contar = () => p.evaluate(() => [...window.__evento.marcas.values()].reduce((n, l) => n + l.length, 0));
    const normal = await contar();
    let pedidos = 0;
    p.on('request', (q) => { if (q.url().includes('/messages')) pedidos++; });
    await p.selectOption('#sensibilidade', 'maxima');
    assert.match(await p.locator('#comoPico').innerText(), /1,5 vezes .* pelo menos 3/);
    assert.ok(await contar() >= normal, 'mais sensível não pode dar menos picos');
    assert.equal(pedidos, 0, 'mudar a sensibilidade pediu o chat outra vez');
    assert.equal(await p.evaluate(() => localStorage.getItem('povix.sensibilidade')), 'maxima');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('com a página parada, os picos das horas vizinhas chegam sozinhos',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirEvento(p);
    // Um canal no ar a noite toda, para haver janelas vizinhas a ler.
    await p.evaluate((t0) => { window.__evento.coberturas.set('tchubi', [[t0 - 6 * 3600e3, t0 + 6 * 3600e3]]); }, T);
    await clicarNoMapa(p, 'outro', T + 2 * 60_000);
    await p.waitForFunction(() => /picos? de chat|Nenhum pico/.test(document.getElementById('estadoChat').textContent), null, { timeout: 15000 });
    const janelas = () => p.evaluate(() => window.__evento.janelasDoChat?.('tchubi')?.length ?? 0);
    const antes = await janelas();
    await p.waitForFunction((n) => (window.__evento.janelasDoChat?.('tchubi')?.length ?? 0) > n, antes, { timeout: 15000 });
    assert.ok(await janelas() > antes);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('quem entra no ar depois de o evento abrir aparece sozinho, sem recarregar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.addInitScript(() => { window.__povixNovatosMs = 400; });
    // tchubi está ao vivo desde há 30 min; outro só entra no ar depois de o evento abrir.
    let outroNoAr = false;
    await p.route('**/api/v2/channels/*/videos', async (rota) => {
      const slug = rota.request().url().match(/channels\/([^/]+)\/videos/)[1];
      if (slug === 'terceiro') return rota.fulfill({ status: 404, body: '' });
      const vivo = slug === 'tchubi' || outroNoAr;
      const inicio = new Date(Date.now() - (slug === 'tchubi' ? 30 : 2) * 60_000);
      await rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(vivo ? [{
          id: slug === 'tchubi' ? 1 : 2, session_title: 'rust', is_live: true, duration: 0,
          start_time: inicio.toISOString().replace('T', ' ').slice(0, 19),
          source: `https://stream.kick.com/falsa/${slug}/n0/master.m3u8`, video: {},
        }] : []),
      });
    });
    await abrirEvento(p);
    assert.match(await p.locator('#resumoEvento').innerText(), /1 ao vivo/);
    outroNoAr = true;
    await p.waitForFunction(() => /entrou no ar agora: outro/.test(document.getElementById('resumoEvento').textContent), null, { timeout: 10000 });
    assert.match(await p.locator('#resumoEvento').innerText(), /2 ao vivo/);
    assert.equal(await p.evaluate(() => window.__evento.coberturas.has('outro')), true);
    assert.deepEqual(erros, []);
    await p.close();
  });
