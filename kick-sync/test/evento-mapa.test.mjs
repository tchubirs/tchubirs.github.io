// Os pedidos do dono de 10/10 para a tela do evento, num browser a sério: abrir todos com vídeo num
// horário (ou só quem está ao vivo), ordenar as faixas pela régua e pelo seletor, a régua com os dias e
// o fuso, compartilhar o evento (link curto do evento salvo, ou o longo com o nome dentro) e
// acrescentar gente com o evento aberto.
//
// A Kick é a de test/falsa.mjs: cada canal tem uma noite de 10 minutos a começar às 21:00 de 30/08 (ou
// mais tarde, com `comecosS`), e quem não está na lista dela não existe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function abrirEvento(p, elenco) {
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', elenco);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
}

/** Pôr a vista em [de, ate] e repintar, como faria o zoom. */
async function verDe(p, de, ate) {
  await p.evaluate(({ de: a, ate: b }) => {
    window.__evento.vista = { deMs: a, ateMs: b };
    document.getElementById('procurarEvento').dispatchEvent(new Event('input'));
  }, { de, ate });
  await p.waitForTimeout(80);
}

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

/** Clicar na régua no instante `ms`. */
async function clicarNaRegua(p, ms) {
  const x = await p.evaluate((m) => {
    const ev = window.__evento;
    const rolo = document.getElementById('mapaRolo');
    return rolo.getBoundingClientRect().left + ((m - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth;
  }, ms);
  const caixa = await p.locator('#reguaEvento').boundingBox();
  await p.mouse.click(x, caixa.y + caixa.height / 2);
}

/** Um canal que está ao vivo agora: a Kick põe o VOD em curso com duração 0 e `is_live`. */
async function aoVivo(p, slug) {
  await p.route(`**/api/v2/channels/${slug}/videos`, (rota) => rota.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: 99, session_title: 'ao vivo', start_time: new Date(T).toISOString().replace('T', ' ').slice(0, 19),
      duration: 0, is_live: true, source: `https://stream.kick.com/falsa/${slug}/n0/master.m3u8`, video: {},
    }]),
  }));
}

const canaisDoMapa = (p) => p.evaluate(() => window.__evento.mapa.linhas.filter((l) => l.tipo === 'canal').map((l) => l.canal));
const cabecalhos = (p) => p.evaluate(() => window.__evento.mapa.linhas.filter((l) => l.tipo === 'time').map((l) => l.time));
const abertosNaGrelha = (p) => p.evaluate(() => window.__estado.linhas.map((l) => l.slug).sort());

// ── 1. abrir todos com vídeo nesse horário, ou só quem está ao vivo ──────────

test('num momento escolhido: abrir todos com vídeo nesse horário (também quem já saiu) ou só quem está ao vivo', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro', 'lobo'] });
  await aoVivo(p, 'lobo');
  await abrirEvento(p, 'Time Alfa: tchubi\nTime Beta: outro\nlobo');
  await verDe(p, T - 5 * 60_000, T + 15 * 60_000);
  await clicarNoMapa(p, 'tchubi', T + 3 * 60_000);
  await p.waitForSelector('#lance:not([hidden])');
  // O time do tchubi é só ele; com vídeo naquele instante estão os três (tchubi e outro já saíram do ar,
  // o lobo continua ao vivo).
  assert.match(await p.locator('#verLanceTexto').innerText(), /Ver só tchubi/);
  assert.equal(await p.locator('#abrirTodosVodTexto').innerText(), 'Abrir todos com vídeo nesse horário (3)');
  assert.equal(await p.locator('#abrirSoAoVivoTexto').innerText(), 'Abrir só quem está ao vivo (1)');

  await p.click('#abrirTodosVod');
  await p.waitForFunction(() => document.querySelectorAll('.tile').length === 3, null, { timeout: 15000 });
  assert.deepEqual(await abertosNaGrelha(p), ['lobo', 'outro', 'tchubi']);
  assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'tchubi', 'quem se escolheu fica em foco');

  // De volta ao mapa, o mesmo momento, só quem está ao vivo.
  await p.click('#mostrarMapa');
  await p.click('#abrirSoAoVivo');
  await p.waitForFunction(() => window.__estado.linhas.length === 1 && window.__estado.linhas[0].slug === 'lobo', null, { timeout: 15000 });
  assert.deepEqual(await abertosNaGrelha(p), ['lobo']);
  assert.deepEqual(erros, []);
});

test('ninguém ao vivo: o botão fica desligado e diz porquê', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await abrirEvento(p, 'tchubi\noutro');
  await verDe(p, T - 5 * 60_000, T + 15 * 60_000);
  await clicarNoMapa(p, 'outro', T + 3 * 60_000);
  await p.waitForSelector('#lance:not([hidden])');
  assert.equal(await p.locator('#abrirSoAoVivo').isDisabled(), true);
  assert.match(await p.locator('#abrirSoAoVivo').getAttribute('title'), /Ninguém que está ao vivo/);
  assert.equal(await p.locator('#abrirTodosVod').isDisabled(), false);
  assert.deepEqual(erros, []);
});

test('muitas telas: sem limite, mas o primeiro clique avisa quantas são e o segundo abre todas', semNavegador, async () => {
  const { p, erros } = await abrir();
  const canais = Array.from({ length: 14 }, (_, i) => `canal${i}`);
  await kickFalsa(p, { canais });
  await abrirEvento(p, canais.join('\n'));
  await verDe(p, T - 5 * 60_000, T + 15 * 60_000);
  await clicarNoMapa(p, 'canal3', T + 3 * 60_000);
  await p.waitForSelector('#lance:not([hidden])');
  await p.click('#abrirTodosVod');
  assert.match(await p.locator('#avisoMuitos').innerText(), /São 14 vídeos de uma vez/);
  assert.equal(await p.locator('#abrirTodosVodTexto').innerText(), 'Abrir os 14 mesmo assim');
  assert.equal(await p.locator('.tile').count(), 0, 'o primeiro clique só avisa');
  await p.click('#abrirTodosVod');
  await p.waitForFunction(() => document.querySelectorAll('.tile').length === 14, null, { timeout: 30000 });
  assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'canal3');
  assert.deepEqual(erros, []);
});

// ── 2. ordenar as faixas ─────────────────────────────────────────────────────

test('um clique na régua ordena: quem tem vídeo nesse instante, depois quem esteve perto, depois o resto; e volta-se à ordem por time', semNavegador, async () => {
  const { p, erros } = await abrir();
  // tchubi das 21:00 às 21:10, outro das 21:15 às 21:25, lobo das 00:00 às 00:10.
  await kickFalsa(p, { canais: ['tchubi', 'outro', 'lobo'], comecosS: { outro: 15 * 60, lobo: 3 * 3600 } });
  await abrirEvento(p, 'Time Alfa: lobo, outro\nTime Beta: tchubi');
  assert.deepEqual(await canaisDoMapa(p), ['lobo', 'outro', 'tchubi']);
  assert.equal(await p.locator('#ordemVoltar').isVisible(), false, 'na ordem por time não há de onde voltar');
  await verDe(p, T - 10 * 60_000, T + 50 * 60_000);
  await clicarNaRegua(p, T + 5 * 60_000);
  await p.waitForFunction(() => window.__evento.ordem.modo === 'instante');
  assert.deepEqual(await canaisDoMapa(p), ['tchubi', 'outro', 'lobo']);
  const [com, perto, resto] = await cabecalhos(p);
  assert.match(com, /^Com vídeo às \d{2}:\d{2}$/);
  assert.equal(perto, 'No ar até 30 min antes ou depois');
  assert.equal(resto, 'Os outros');
  // A ordem activa está escrita, no seletor e por extenso, e há um botão para voltar.
  assert.equal(await p.locator('#ordemFaixas').inputValue(), 'instante');
  assert.match(await p.locator('#ordemFaixas option:checked').innerText(), /^vídeo às \d{2}:\d{2}$/);
  assert.match(await p.locator('#ordemAtiva').innerText(), /^Primeiro quem tem vídeo às \d{2}:\d{2}, depois quem esteve no ar perto\.$/);
  // Cada faixa leva o time ao lado, para não se perder de que lado está.
  assert.equal(await p.evaluate(() => window.__evento.mapa.linhas.find((l) => l.canal === 'tchubi').rotulo), 'tchubi (Time Beta)');
  // Um clique num grupo fecha-o, como um time.
  await p.evaluate(() => {
    const rolo = document.getElementById('mapaRolo');
    const l = window.__evento.mapa.linhas.find((x) => x.tipo === 'time' && x.time === 'Os outros');
    const c = rolo.getBoundingClientRect();
    rolo.dispatchEvent(new MouseEvent('click', { clientX: c.left + 30, clientY: c.top + l.y - window.__evento.topo + 5, bubbles: true }));
  });
  assert.deepEqual(await canaisDoMapa(p), ['tchubi', 'outro']);

  await p.click('#ordemVoltar');
  assert.equal(await p.locator('#ordemFaixas').inputValue(), 'time');
  assert.deepEqual(await canaisDoMapa(p), ['lobo', 'outro', 'tchubi']);
  assert.deepEqual(await cabecalhos(p), ['Time Alfa', 'Time Beta']);
  assert.equal(await p.locator('#ordemVoltar').isVisible(), false);
  assert.equal(await p.locator('#ordemAtiva').innerText(), '');
  assert.deepEqual(erros, []);
});

test('o seletor de ordem: A a Z, mais tempo no ar, ao vivo agora, e o instante pelo teclado', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro', 'lobo'], segmentos: 60, comecosS: { outro: 5 * 60 } });
  await aoVivo(p, 'outro');
  await abrirEvento(p, 'Time Alfa: tchubi, lobo\nTime Beta: outro');

  await p.selectOption('#ordemFaixas', 'az');
  assert.deepEqual(await canaisDoMapa(p), ['lobo', 'outro', 'tchubi']);
  assert.deepEqual(await cabecalhos(p), ['De A a Z']);
  assert.equal(await p.locator('#ordemAtiva').innerText(), 'Faixas em ordem: A a Z.');
  assert.equal(await p.locator('#ordemVoltar').isVisible(), true);

  await p.selectOption('#ordemFaixas', 'aoVivo');
  assert.deepEqual(await cabecalhos(p), ['Ao vivo agora', 'Fora do ar']);
  assert.equal((await canaisDoMapa(p))[0], 'outro');

  await p.selectOption('#ordemFaixas', 'tempo');
  // O outro está ao vivo desde as 21:05: é quem tem mais tempo no ar dentro do trecho do evento.
  assert.deepEqual(await cabecalhos(p), ['Mais tempo no ar no evento']);
  assert.equal((await canaisDoMapa(p))[0], 'outro');

  // Pelo teclado não há régua: o seletor ordena pelo instante do cursor (ou do lance, ou do meio da vista).
  await verDe(p, T - 10 * 60_000, T + 20 * 60_000);
  await p.selectOption('#ordemFaixas', 'instante');
  const ordem = await p.evaluate(() => window.__evento.ordem);
  assert.equal(ordem.modo, 'instante');
  assert.equal(ordem.ms, T + 5 * 60_000);
  // Às 21:05 os três têm vídeo: um grupo só, pela ordem dos times.
  assert.deepEqual(await cabecalhos(p), [await p.evaluate(() => window.__evento.mapa.linhas[0].time)]);
  assert.match((await cabecalhos(p))[0], /^Com vídeo às \d{2}:\d{2}$/);
  assert.deepEqual(await canaisDoMapa(p), ['tchubi', 'lobo', 'outro']);
  assert.deepEqual(erros, []);
});

// O dono, 10/10: "nao faço ideia como voce vai saber quem sao os times". Os times só vêm da lista; sem
// eles a ordem por time não aparece, e a de partida é quem está ao vivo primeiro.
test('uma lista sem times não oferece a ordem por time: começa com quem está ao vivo, e o voltar diz isso', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro', 'lobo'] });
  await aoVivo(p, 'lobo');
  await abrirEvento(p, 'tchubi\noutro\nlobo');
  assert.equal(await p.evaluate(() => window.__evento.ordem.modo), 'aoVivo');
  assert.equal(await p.locator('#ordemFaixas').inputValue(), 'aoVivo');
  assert.equal(await p.locator('#ordemFaixas option[value="time"]').evaluate((o) => o.disabled), true);
  assert.equal(await p.locator('#ordemFaixas option[value="time"]').evaluate((o) => o.hidden), true);
  assert.deepEqual(await cabecalhos(p), ['Ao vivo agora', 'Fora do ar']);
  assert.equal((await canaisDoMapa(p))[0], 'lobo');
  assert.equal(await p.locator('#ordemVoltar').isVisible(), false, 'na ordem de partida não há de onde voltar');
  assert.equal(await p.locator('#ordemAtiva').innerText(), '');

  await p.selectOption('#ordemFaixas', 'az');
  assert.equal(await p.locator('#ordemVoltar').innerText(), 'Voltar à ordem inicial: ao vivo primeiro');
  await p.click('#ordemVoltar');
  assert.equal(await p.locator('#ordemFaixas').inputValue(), 'aoVivo');
  assert.equal((await canaisDoMapa(p))[0], 'lobo');
  assert.equal(await p.locator('#ordemVoltar').isVisible(), false);

  // Com times, a opção existe e diz de onde eles vêm.
  await abrirEvento(p, 'Time Alfa: tchubi, lobo\nTime Beta: outro');
  assert.equal(await p.locator('#ordemFaixas').inputValue(), 'time');
  assert.equal(await p.locator('#ordemFaixas option[value="time"]').innerText(), 'por time da lista');
  assert.equal(await p.locator('#ordemFaixas option[value="time"]').evaluate((o) => o.disabled), false);
  await p.selectOption('#ordemFaixas', 'az');
  assert.equal(await p.locator('#ordemVoltar').innerText(), 'Voltar à ordem por time da lista');
  assert.deepEqual(erros, []);
});

// ── 3. a régua com os dias e o fuso ─────────────────────────────────────────

test('a régua escreve a data em cada mudança de dia, com um traço, e diz que as horas são do fuso do aparelho', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'], noites: 2 });
  await abrirEvento(p, 'tchubi\noutro');
  await verDe(p, T - 2 * 3600e3, T + 26 * 3600e3);
  await p.waitForTimeout(150);
  const regua = await p.evaluate(() => {
    const ev = window.__evento;
    // As meias-noites do fuso do browser dentro da vista, contadas aqui à parte.
    const meias = [];
    const d = new Date(ev.vista.deMs);
    d.setHours(24, 0, 0, 0);
    while (d.getTime() <= ev.vista.ateMs) { meias.push(d.getTime()); d.setDate(d.getDate() + 1); }
    const esperado = meias.map((ms) => `${new Date(ms).toLocaleDateString('pt-BR', { weekday: 'short' }).replace(/\.$/, '')} ${new Date(ms).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}`);
    const r = document.getElementById('reguaEvento');
    return {
      esperado,
      dias: [...r.querySelectorAll('span.dia')].map((s) => s.textContent),
      tracos: r.querySelectorAll('i:not(.ordem)').length,
      horas: [...r.querySelectorAll('span:not(.dia)')].map((s) => s.textContent),
    };
  });
  assert.ok(regua.esperado.length >= 1);
  assert.deepEqual(regua.dias, regua.esperado);
  assert.equal(regua.tracos, regua.esperado.length);
  for (const d of regua.dias) assert.match(d, /^(dom|seg|ter|qua|qui|sex|sáb) \d{2}\/\d{2}$/);
  assert.ok(regua.horas.length >= 3);
  for (const h of regua.horas) assert.match(h, /^\d{2}:\d{2}$/);
  assert.match(await p.locator('#fusoEvento').innerText(), /^Horários no fuso deste aparelho( \(.+\))?\.$/);
  assert.equal(await p.locator('#fusoEvento').isVisible(), true);
  assert.deepEqual(erros, []);
});

// ── 4. compartilhar o evento ────────────────────────────────────────────────

test('compartilhar pede um nome, e um evento que não está no site sai no link longo com o nome, o porquê e o arquivo', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await abrirEvento(p, 'Time Alfa: tchubi, outro');
  assert.equal(await p.locator('#partilharEvento').innerText(), 'Compartilhar evento');
  await p.click('#partilharEvento');
  await p.waitForSelector('#modalPartilhar:not([hidden])');
  // Sem nome não há link.
  await p.click('#gerarLink');
  assert.equal(await p.locator('#partilharNomeErro').isVisible(), true);
  assert.equal(await p.locator('#partilharNome').getAttribute('aria-invalid'), 'true');
  assert.equal(await p.locator('#resultadoPartilhar').isVisible(), false);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'partilharNome');

  await p.fill('#partilharNome', 'Copa Teste');
  await p.fill('#partilharData', '2026-10-11');
  await p.fill('#partilharDuracao', '2 dias');
  await p.fill('#partilharDescricao', 'Rust, 10 times');
  await p.click('#gerarLink');
  await p.waitForSelector('#resultadoPartilhar:not([hidden])');
  const url = await p.inputValue('#linkPartilhar');
  assert.match(url, /#evento=[A-Za-z0-9_-]+&nome=Copa%20Teste&data=2026-10-11&dur=2%20dias&desc=Rust%2C%2010%20times$/);
  assert.match(await p.locator('#estadoPartilhar').innerText(), /O link curto precisa que o evento seja salvo no site; até lá, este link leva a lista inteira\./);
  // O nome passa a ser o do evento aberto.
  assert.equal(await p.locator('#nomeEvento').innerText(), 'Copa Teste');
  assert.match(await p.locator('#infoEvento').innerText(), /2 dias\. Rust, 10 times$/);

  // O arquivo para pôr no site: o nome, os dados e os canais, com o nome do arquivo do link curto.
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('#baixarArquivoEvento')]);
  assert.equal(descarga.suggestedFilename(), 'copa-teste.json');
  const j = JSON.parse(fs.readFileSync(await descarga.path(), 'utf8'));
  assert.deepEqual(j, {
    nome: 'Copa Teste', data: '2026-10-11', duracao: '2 dias', descricao: 'Rust, 10 times',
    times: [{ nome: 'Time Alfa', canais: ['tchubi', 'outro'] }], canais: [],
  });

  // Quem recebe o link longo vê o nome e os dados do evento.
  const { p: q, erros: erros2 } = await abrir();
  await kickFalsa(q, { canais: ['tchubi', 'outro'] });
  await q.goto(url, { waitUntil: 'networkidle' });
  await q.waitForFunction(() => window.__evento?.mapa, null, { timeout: 15000 });
  assert.equal(await q.locator('#nomeEvento').innerText(), 'Copa Teste');
  assert.match(await q.locator('#infoEvento').innerText(), /2 dias\. Rust, 10 times$/);
  // O Esc fecha a janela e o foco volta ao botão.
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#modalPartilhar').isVisible(), false);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'partilharEvento');
  assert.deepEqual([...erros, ...erros2], []);
});

test('o ABISAL abre pelo link curto ?e=abisal, e compartilhar devolve o link curto', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tanizen', 'dilanzito'] });
  await p.goto(`http://127.0.0.1:${PORTA}/index.html?e=abisal`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__evento?.mapa, null, { timeout: 30000 });
  assert.equal(await p.locator('#nomeEvento').innerText(), 'ABISAL');
  assert.match(await p.locator('#resumoEvento').innerText(), /144 canais, 2 com vídeo/);
  await p.click('#partilharEvento');
  assert.equal(await p.inputValue('#partilharNome'), 'ABISAL', 'o nome já vem escrito');
  await p.click('#gerarLink');
  await p.waitForSelector('#resultadoPartilhar:not([hidden])');
  assert.equal(await p.inputValue('#linkPartilhar'), `http://127.0.0.1:${PORTA}/index.html?e=abisal`);
  assert.match(await p.locator('#estadoPartilhar').innerText(), /^Link curto: o evento está salvo no site\./);
  assert.equal(await p.locator('#baixarArquivoEvento').isVisible(), false);
  await p.keyboard.press('Escape');
  // Fechar o evento tira o ?e= do endereço: um F5 não o volta a abrir.
  await p.click('#fecharEvento');
  assert.equal(await p.evaluate(() => location.search), '');
  assert.deepEqual(erros, []);
});

test('um evento salvo que não existe diz isso, e não abre um mapa vazio', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.goto(`http://127.0.0.1:${PORTA}/?e=nao-existe`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.getElementById('estadoEvento').textContent.length > 0, null, { timeout: 15000 });
  assert.equal(await p.locator('#estadoEvento').innerText(), 'Não achei o evento salvo "nao-existe". Confira o link ou cole a lista.');
  assert.equal(await p.locator('#evento').isVisible(), false);
  assert.deepEqual(erros, []);
});

// ── 5. acrescentar gente com o evento aberto ────────────────────────────────

test('adicionar streamer pela busca da Kick, com time: só ele é lido, e o resto do mapa fica como estava', semNavegador, async () => {
  const { p, erros } = await abrir();
  const pedidos = await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await abrirEvento(p, 'Time Alfa: tchubi\nTime Beta: terceiro');
  await verDe(p, T - 5 * 60_000, T + 15 * 60_000);
  await clicarNoMapa(p, 'tchubi', T + 3 * 60_000);
  await p.waitForSelector('#lance:not([hidden])');
  const antes = await p.evaluate(() => ({ vista: { ...window.__evento.vista }, escolha: { ...window.__evento.escolha } }));
  const api = pedidos.api;

  await p.click('#adicionarStreamer');
  await p.waitForSelector('#modalAdicionar:not([hidden])');
  assert.equal(await p.locator('#adicionarTitulo').innerText(), 'Adicionar streamer ao evento');
  await p.fill('#adicionarProcura', 'tchu');
  await p.waitForSelector('#adicionarSugestoes button[data-slug="tchubi"]');
  assert.equal(await p.locator('#adicionarSugestoes button[data-slug="tchubi"]').isDisabled(), true, 'quem já está no evento não se escolhe');
  assert.match(await p.locator('#adicionarSugestoes button[data-slug="tchubi"]').innerText(), /já está no evento/);
  await p.fill('#adicionarProcura', 'outr');
  await p.waitForSelector('#adicionarSugestoes button[data-slug="outro"]');
  await p.fill('#adicionarTime', 'Time Alfa');
  await p.click('#adicionarSugestoes button[data-slug="outro"]');
  await p.waitForFunction(() => window.__evento.mapa.linhas.some((l) => l.canal === 'outro'), null, { timeout: 15000 });
  assert.equal(pedidos.api - api, 1, 'só o novo foi pedido à Kick');
  assert.equal(await p.locator('#modalAdicionar').isVisible(), false);
  assert.equal(await p.locator('#estadoAdicionar').innerText(), 'Entrou no mapa: outro.');
  const depois = await p.evaluate(() => ({
    vista: window.__evento.vista, escolha: window.__evento.escolha,
    linha: window.__evento.mapa.linhas.find((l) => l.canal === 'outro'),
    cobre: window.__evento.coberturas.has('outro'),
  }));
  assert.equal(depois.linha.time, 'Time Alfa');
  assert.equal(depois.cobre, true);
  assert.deepEqual(depois.vista, antes.vista, 'a vista não mexeu');
  assert.deepEqual(depois.escolha, antes.escolha, 'nem o lance escolhido');
  // O lance passa a contar com ele: é do mesmo time e estava no ar.
  assert.match(await p.locator('#verLanceTexto').innerText(), /2 ângulos/);
  assert.deepEqual(erros, []);
});

test('adicionar lista de um arquivo: o leitor de arquivo do elenco, e só os canais novos entram', semNavegador, async () => {
  const { p, erros } = await abrir();
  const pedidos = await kickFalsa(p, { canais: ['tchubi', 'outro', 'lobo'] });
  await abrirEvento(p, 'Time Alfa: tchubi');
  const api = pedidos.api;
  await p.click('#adicionarLista');
  await p.waitForSelector('#modalAdicionar:not([hidden])');
  assert.equal(await p.locator('#adicionarProcura').isVisible(), false);
  // Já está tudo: nada a fazer, e diz-se isso.
  await p.fill('#adicionarTexto', 'https://kick.com/tchubi');
  await p.click('#adicionarVariosBotao');
  assert.equal(await p.locator('#estadoAdicionarJanela').innerText(), 'Esses canais já estão no evento.');
  // Um .csv como o do ABISAL (com colunas a mais), em Windows-1252.
  const csv = Buffer.from('kick_url,seguidores,origem\nhttps://kick.com/outro,10,nota\nhttps://kick.com/tchubi,20,nota\nhttps://kick.com/lobo,5,divulgação\n', 'latin1');
  await p.setInputFiles('#adicionarArquivoCampo', { name: 'mais.csv', mimeType: 'text/csv', buffer: csv });
  await p.waitForFunction(() => document.getElementById('adicionarTexto').value.includes('lobo'));
  assert.match(await p.locator('#estadoAdicionarJanela').innerText(), /mais\.csv/);
  await p.click('#adicionarVariosBotao');
  await p.waitForFunction(() => window.__evento.mapa.linhas.some((l) => l.canal === 'lobo'), null, { timeout: 15000 });
  assert.equal(pedidos.api - api, 2, 'outro e lobo, e não o tchubi outra vez');
  assert.equal(await p.locator('#estadoAdicionar').innerText(), '2 entraram no mapa: outro, lobo.');
  assert.deepEqual(await canaisDoMapa(p), ['tchubi', 'outro', 'lobo']);
  assert.match(await p.locator('#resumoEvento').innerText(), /3 canais, 3 com vídeo/);
  assert.deepEqual(erros, []);
});

// ── no celular ──────────────────────────────────────────────────────────────

test('num celular de 390 px nada rola para o lado, com as janelas e a régua', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
  await kickFalsa(p, { canais: ['tchubi', 'outro'], noites: 2 });
  await abrirEvento(p, 'Time Alfa: tchubi\nTime Beta: outro');
  await verDe(p, T - 3600e3, T + 26 * 3600e3);
  await clicarNaRegua(p, T + 5 * 60_000);
  const larguras = () => p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  let [doc, ecra] = await larguras();
  assert.ok(doc <= ecra, `a página rola para o lado: ${doc} > ${ecra}`);
  for (const b of ['#adicionarStreamer', '#adicionarLista', '#partilharEvento']) {
    const caixa = await p.locator(b).boundingBox();
    assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390, `${b} sai do ecrã`);
    assert.ok(caixa.height >= 36, `${b} pequeno demais para o dedo`);
  }
  await p.click('#partilharEvento');
  [doc, ecra] = await larguras();
  assert.ok(doc <= ecra);
  await p.keyboard.press('Escape');
  await p.click('#adicionarStreamer');
  [doc, ecra] = await larguras();
  assert.ok(doc <= ecra);
  assert.deepEqual(erros, []);
});
