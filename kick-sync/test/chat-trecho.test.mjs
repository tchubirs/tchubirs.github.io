// Ler o chat a partir da faixa de cada pessoa na linha do tempo da tela do vídeo: clicar no nome abre um
// assistente em passos na faixa dela (Ler chat ou Detectar lances; um trecho ou tudo; no trecho, duas
// alças em cima da faixa que se arrastam com o rato, com o dedo e pelo teclado, e "Pronto"; no fim, o
// botão Ler). A faixa Todos, em cima, faz o mesmo para toda a gente.
//
// A Kick é a de test/falsa.mjs: tchubi (canal 1000) e outro (1001), das 21:00 às 21:10 de 30/08, com
// 3 mensagens por minuto cada um, e mais 40 no minuto 5 do tchubi (um pico).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const MIN = 60_000;

async function abrirNoite(p, canais = ['tchubi', 'outro']) {
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 });
  await abrirTrechoDe(p, canais[0]);
}

/** Clicar no nome da faixa de alguém (ou Todos, com '*'), e Ler chat, Um trecho: as alças à vista (passo 3). */
async function abrirTrechoDe(p, quem) {
  await p.click(`#faixas button.nome[data-quem="${quem}"]`);
  await p.waitForSelector('#acoesFaixa:not([hidden])');
  await p.click('#escolherChat');
  await p.click('#escolherTrecho');
  await p.waitForSelector('#chatTrecho:not([hidden])');
  await p.waitForFunction(() => document.getElementById('alcaInicio').hasAttribute('aria-valuenow'));
}

/** Ler: o "Pronto, usar este trecho" quando ainda se está no passo 3, e depois o botão Ler. */
async function ler(p) {
  if (await p.locator('#usarTrecho').isVisible()) await p.click('#usarTrecho');
  await p.click('#lerChatTrecho');
}

/** As duas pontas do trecho, em ms, lidas das alças (aria-valuenow vem em segundos). */
const pontas = (p) => p.evaluate(() => ({
  de: Number(document.getElementById('alcaInicio').getAttribute('aria-valuenow')) * 1000,
  ate: Number(document.getElementById('alcaFim').getAttribute('aria-valuenow')) * 1000,
  inicio: window.__estado.janela.inicio,
  fim: window.__estado.janela.fim,
}));

/** O x na calha do trecho para o instante `ms`, na vista desenhada. */
const xDe = (p, ms) => p.evaluate((m) => {
  const r = document.getElementById('chatTrecho').getBoundingClientRect();
  const v = window.__estado.vista || window.__estado.janela;
  return { x: r.left + ((m - v.inicio) / (v.fim - v.inicio)) * r.width, y: r.top + r.height / 2 };
}, ms);

async function arrastarRato(p, id, paraX) {
  const caixa = await p.locator(`#${id}`).boundingBox();
  await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await p.mouse.down();
  await p.mouse.move(paraX, caixa.y + caixa.height / 2, { steps: 6 });
  await p.mouse.up();
}

/** Arrastar com o dedo: eventos de ponteiro do tipo toque, como os de um telemóvel. */
async function arrastarDedo(p, id, paraX) {
  await p.evaluate(({ id: alvo, x }) => {
    const el = document.getElementById(alvo);
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const ev = (tipo, cx) => new PointerEvent(tipo, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: y, button: 0,
    });
    el.dispatchEvent(ev('pointerdown', r.left + r.width / 2));
    for (let k = 1; k <= 5; k++) el.dispatchEvent(ev('pointermove', r.left + r.width / 2 + ((x - r.left - r.width / 2) * k) / 5));
    el.dispatchEvent(ev('pointerup', x));
  }, { id, x: paraX });
}

test('o trecho de chat começa em volta do instante, e as alças arrastam e ficam dentro da noite',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await abrirNoite(p);
    let t0 = await pontas(p);
    assert.ok(t0.de >= t0.inicio && t0.ate <= t0.fim && t0.de < t0.ate, JSON.stringify(t0));
    // As horas das duas pontas estão escritas.
    const horas = await p.locator('#chatTrechoHoras').innerText();
    assert.match(horas, /^de \d\d:\d\d:\d\d até \d\d:\d\d:\d\d \(\d+ min\)$/);
    // Um trecho curto primeiro, para haver para onde arrastar.
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Home');
    await p.locator('#alcaFim').focus();
    await p.keyboard.press('End');
    for (let k = 0; k < 6; k++) await p.keyboard.press('Shift+ArrowLeft');
    t0 = await pontas(p);
    assert.equal(t0.de, t0.inicio);
    assert.equal(t0.ate, t0.fim - 6 * MIN);

    // Com o rato: o início arrastado para lá do fim pára antes dele.
    const longe = await xDe(p, t0.fim);
    await arrastarRato(p, 'alcaInicio', longe.x);
    let t1 = await pontas(p);
    assert.ok(t1.de < t1.ate, `o início passou o fim: ${JSON.stringify(t1)}`);
    assert.equal(t1.ate, t0.ate, 'o fim mexeu-se sem lhe tocarem');
    assert.ok(t1.ate - t1.de <= 6000, `o início não chegou perto do fim: ${t1.ate - t1.de} ms`);

    // O fim para fora da calha fica na ponta da noite, e o início para trás do começo fica no começo.
    const caixa = await p.locator('#chatTrecho').boundingBox();
    await arrastarRato(p, 'alcaFim', caixa.x + caixa.width + 200);
    await arrastarRato(p, 'alcaInicio', caixa.x - 200);
    t1 = await pontas(p);
    assert.equal(t1.ate, t1.fim);
    assert.equal(t1.de, t1.inicio);

    // Com o dedo: o fim volta para o meio da noite.
    const meio = await xDe(p, t1.inicio + 5 * MIN);
    await arrastarDedo(p, 'alcaFim', meio.x);
    const t2 = await pontas(p);
    assert.ok(Math.abs(t2.ate - (t2.inicio + 5 * MIN)) < 15_000, `o dedo não levou o fim ao meio: ${t2.ate - t2.inicio}`);
    assert.equal(t2.de, t2.inicio);
    // E o fim arrastado com o dedo para trás do início fica depois dele.
    await arrastarDedo(p, 'alcaFim', caixa.x - 100);
    const t3 = await pontas(p);
    assert.ok(t3.ate > t3.de, JSON.stringify(t3));

    // Pelo teclado: seta 5 s, Shift+seta 1 min, e o leitor de ecrã ouve a hora.
    await p.locator('#alcaFim').focus();
    await p.keyboard.press('End');
    await p.locator('#alcaInicio').focus();
    const antes = (await pontas(p)).de;
    await p.keyboard.press('ArrowRight');
    assert.equal((await pontas(p)).de, antes + 5000);
    await p.keyboard.press('Shift+ArrowRight');
    assert.equal((await pontas(p)).de, antes + 5000 + MIN);
    await p.keyboard.press('ArrowLeft');
    assert.equal((await pontas(p)).de, antes + MIN);
    assert.match(await p.locator('#alcaInicio').getAttribute('aria-valuetext'), /^\d\d:\d\d:\d\d$/);
    assert.ok(await p.locator('#alcaInicio').getAttribute('aria-label'));
    // As setas na alça não andam com o vídeo (o atalho das setas é do vídeo noutros sítios).
    const agora = await p.evaluate(() => window.__estado.agoraMs);
    await p.keyboard.press('ArrowRight');
    assert.equal(await p.evaluate(() => window.__estado.agoraMs), agora);
    // Home leva o início à ponta da noite, e não mais para trás.
    await p.keyboard.press('Home');
    await p.keyboard.press('ArrowLeft');
    assert.equal((await pontas(p)).de, (await pontas(p)).inicio);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('o botão lê só o chat do streamer escolhido e só o trecho entre as alças, sem trocar o vídeo',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await abrirNoite(p);
    const focoAntes = await p.evaluate(() => window.__estado.focos[0]);
    assert.equal(focoAntes, 'tchubi');
    // A barra e as alças estão na faixa de quem se clicou, e o nome diz que está aberto.
    assert.equal(await p.evaluate(() => document.getElementById('chatTrecho').closest('.faixa')?.dataset.slug), 'tchubi');
    assert.equal(await p.locator('#faixas button.nome[data-quem="tchubi"]').getAttribute('aria-expanded'), 'true');
    // O trecho: das 21:02 às 21:04.
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Home');
    for (let k = 0; k < 2; k++) await p.keyboard.press('Shift+ArrowRight');
    await p.locator('#alcaFim').focus();
    await p.keyboard.press('End');
    for (let k = 0; k < 6; k++) await p.keyboard.press('Shift+ArrowLeft');
    const t0 = await pontas(p);
    assert.equal(t0.de, T + 2 * MIN);
    assert.equal(t0.ate, T + 4 * MIN);

    // Escolher o outro pelo nome leva a barra para a faixa dele, e as alças ficam onde estavam.
    await p.click('#faixas button.nome[data-quem="outro"]');
    assert.equal(await p.evaluate(() => document.getElementById('acoesFaixa').previousElementSibling.dataset.slug), 'outro');
    assert.equal(await p.evaluate(() => document.getElementById('chatTrecho').closest('.faixa')?.dataset.slug), 'outro');
    assert.equal(await p.locator('#faixas button.nome[data-quem="tchubi"]').getAttribute('aria-expanded'), 'false');
    assert.deepEqual([(await pontas(p)).de, (await pontas(p)).ate], [t0.de, t0.ate]);
    const pedidos = [];
    p.on('request', (q) => {
      const u = q.url();
      if (/\/api\/v2\/channels\/[^/]+$/.test(u) || u.includes('/messages')) pedidos.push(u);
    });
    await ler(p);
    await p.waitForFunction(() => /^Chat de outro, de 21:02:00 até 21:04:00: \d+ mensagens/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 15000 });
    // Só o canal outro (1001), e a primeira página pedida começa no fim do trecho.
    assert.ok(pedidos.length >= 2, pedidos.join('\n'));
    assert.ok(pedidos.every((u) => /channels\/(outro|1001)\b/.test(u)), `pediu o chat de outro canal:\n${pedidos.join('\n')}`);
    const cursores = pedidos.filter((u) => u.includes('/messages')).map((u) => Number(new URL(u).searchParams.get('cursor')) / 1000);
    assert.equal(cursores[0], T + 4 * MIN);
    // As mensagens guardadas são todas do trecho, e o tchubi ficou sem chat lido.
    const lidas = await p.evaluate(() => (window.__evento.mensagens.get('outro') || []).map((m) => m.ms));
    assert.equal(lidas.length, 6, `3 por minuto em 2 minutos: ${lidas.length}`);
    assert.ok(lidas.every((ms) => ms >= T + 2 * MIN && ms < T + 4 * MIN));
    assert.equal(await p.evaluate(() => window.__evento.mensagens.get('tchubi')), undefined);
    // O vídeo não trocou, e o chat ao lado é o do outro.
    assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'tchubi');
    await p.waitForSelector('#chatVideo:not([hidden])', { timeout: 5000 });
    assert.equal(await p.locator('#chatVideoTitulo').innerText(), 'Chat de outro');
    // O chat anda com o vídeo: a partir das 21:02 aparecem as mensagens lidas.
    for (let k = 0; k < 4 && !(await p.locator('#chatLinhas li:not(.nota)').count()); k++) {
      await p.click('#mais1m');
      await p.waitForTimeout(300);
    }
    assert.ok(await p.locator('#chatLinhas li:not(.nota)').count() > 0, await p.locator('#agora').innerText());

    // O mesmo trecho outra vez não pede nada à Kick.
    pedidos.length = 0;
    await ler(p);
    await p.waitForFunction(() => /já estava lido/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 5000 });
    assert.equal(pedidos.filter((u) => u.includes('/messages')).length, 0);
    // Um trecho maior lê só o pedaço novo: das 21:01 às 21:02.
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Shift+ArrowLeft');
    await ler(p);
    await p.waitForFunction(() => /^Chat de outro, de 21:01:00/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 15000 });
    const novos = pedidos.filter((u) => u.includes('/messages')).map((u) => Number(new URL(u).searchParams.get('cursor')) / 1000);
    assert.ok(novos.length >= 1);
    assert.equal(novos[0], T + 2 * MIN, 'leu outra vez o que já tinha');
    assert.equal(await p.evaluate(() => window.__evento.mensagens.get('outro').length), 9);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('com evento aberto o botão também lê, e o pico do trecho aparece na régua',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', 'Time Alfa: tchubi, outro');
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
    await p.evaluate((ms) => window.__abrirLanceDoEvento(['tchubi', 'outro'], ms, 'tchubi'), T + 3 * MIN);
    await p.waitForSelector('.tile', { timeout: 15000 });
    await abrirTrechoDe(p, 'tchubi');
    assert.equal(await p.locator('.regua .picoChat').count(), 0);
    await ler(p);
    await p.waitForFunction(() => /^Chat de tchubi, .*1 pico\./.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 15000 });
    await p.waitForSelector('.regua .picoChat');
    await p.waitForSelector('#chatVideo:not([hidden])');
    assert.equal(await p.locator('#chatVideoTitulo').innerText(), 'Chat de tchubi');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('parar a leitura do trecho guarda o que veio, e ler outra vez acaba só o que faltou',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await abrirNoite(p, ['tchubi']);
    await p.route('**/api/v2/channels/*/messages**', async (r) => { await new Promise((ok) => setTimeout(ok, 400)); await r.fallback(); });
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Home');
    await p.locator('#alcaFim').focus();
    await p.keyboard.press('End');
    await ler(p);
    await p.waitForSelector('#pararChatTrecho:not([hidden])');
    assert.ok(await p.locator('#lerChatTrecho').isDisabled());
    await p.waitForFunction(() => /Lendo o chat de tchubi/.test(document.getElementById('estadoChatTrecho').textContent));
    // O primeiro bocado de 5 minutos chega, e pára-se a meio do segundo.
    await p.waitForFunction(() => (window.__evento.mensagens.get('tchubi') || []).length > 0, null, { timeout: 15000 });
    await p.click('#pararChatTrecho');
    await p.waitForFunction(() => /parada/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 5000 });
    assert.ok(await p.locator('#pararChatTrecho').isHidden());
    assert.ok(await p.locator('#lerChatTrecho').isEnabled());
    const guardadas = await p.evaluate(() => window.__evento.mensagens.get('tchubi').length);
    assert.ok(guardadas > 0 && guardadas < 70, `guardou ${guardadas}`);
    const cursores = [];
    p.on('request', (q) => { if (q.url().includes('/messages')) cursores.push(Number(new URL(q.url()).searchParams.get('cursor')) / 1000); });
    await ler(p);
    await p.waitForFunction(() => /^Chat de tchubi, de 21:00:00 até 21:10:00: 70 mensagens/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 20000 });
    // O bocado que já tinha vindo não se pede outra vez.
    assert.ok(cursores.every((ms) => ms > T + 5 * 60_000 - 1000), `voltou ao princípio: ${cursores.map((ms) => (ms - T) / 1000)}`);
    const ids = await p.evaluate(() => window.__evento.mensagens.get('tchubi').map((m) => m.id));
    assert.equal(new Set(ids).size, 70);
    assert.deepEqual(erros, []);
    await p.close();
  });

// O dono, 10/10: "escolhe a pessoa ou clica nela, clica em ler chat e escolhe ler de que ponto a que ponto
// ou ler todo". Clicar na faixa (e não só no nome) também escolhe a pessoa do chat ao lado do vídeo.
test('clicar na faixa escolhe a pessoa, e "Ler chat: tudo" lê o tempo todo em que ela esteve ao vivo',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    // Sem nada escolhido, não há barra nem alças, e nada lido.
    assert.ok(await p.locator('#acoesFaixa').isHidden());
    assert.ok(await p.locator('#chatTrecho').isHidden());
    assert.equal(await p.locator('#faixas .trilho .lido').count(), 0);
    // A faixa Todos vem em cima das outras, e não conta como canal.
    assert.equal(await p.evaluate(() => document.querySelector('#faixas > .faixaGeral, #faixas > .faixa').className), 'faixaGeral');
    assert.equal(await p.locator('#faixas .faixa').count(), 2);
    // O nome é um botão com nome acessível que diz o que faz.
    assert.match(await p.locator('#faixas button.nome[data-quem="outro"]').getAttribute('aria-label'), /^outro: ler chat ou detectar$/);

    // Clicar no trilho do outro leva o vídeo e escolhe o outro para o chat, sem abrir a barra.
    const trilho = p.locator('#faixas .faixa[data-slug="outro"] .trilho');
    const caixa = await trilho.boundingBox();
    await trilho.click({ position: { x: caixa.width * 0.3, y: caixa.height / 2 } });
    assert.ok(await p.locator('#acoesFaixa').isHidden());

    // O nome abre o assistente no passo 1, com as duas escolhas e o resumo do que vai acontecer.
    await p.click('#faixas button.nome[data-quem="outro"]');
    for (const id of ['escolherChat', 'escolherDetetar', 'fecharAcoes']) assert.ok(await p.locator(`#${id}`).isVisible(), id);
    assert.ok(await p.locator('#voltarAcoes').isHidden(), 'no passo 1 não há para onde voltar');
    assert.match(await p.locator('#acoesResumo').innerText(), /^O que fazer com outro\?/);
    await p.click('#escolherChat');
    // Passo 2: um trecho ou tudo, e o tudo diz o que é.
    assert.match(await p.locator('#acoesResumo').innerText(), /^Ler o chat de outro: um trecho ou tudo\?/);
    assert.match(await p.locator('#escolherTudo').innerText(), /todo o tempo ao vivo de outro/);
    await p.click('#escolherTudo');
    // Passo 4 (o tudo salta as alças): o resumo diz o que o botão Ler vai fazer.
    assert.ok(await p.locator('#chatTrecho').isHidden(), 'sem trecho, não há alças');
    assert.match(await p.locator('#acoesResumo').innerText(), /^Ler o chat de outro, todo o tempo ao vivo\.$/);
    assert.equal(await p.locator('#lerChatTrecho').innerText(), 'Ler');
    const cursores = [];
    p.on('request', (q) => { if (q.url().includes('/messages')) cursores.push([q.url().match(/channels\/([^/]+)/)[1], Number(new URL(q.url()).searchParams.get('cursor')) / 1000]); });
    await ler(p);
    await p.waitForFunction(() => /^Chat de outro, de 21:00:00 até 21:10:00: 30 mensagens/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 20000 });
    assert.ok(cursores.length && cursores.every(([c]) => c === 'outro' || c === '1001'), JSON.stringify(cursores));
    assert.equal(await p.evaluate(() => window.__evento.mensagens.get('tchubi')), undefined);
    // O que foi lido fica mais escuro na faixa do outro, e só na dele.
    assert.ok(await p.locator('#faixas .faixa[data-slug="outro"] .trilho .lido').count() > 0);
    assert.equal(await p.locator('#faixas .faixa[data-slug="tchubi"] .trilho .lido').count(), 0);
    // O chat ao lado do vídeo é o do outro.
    await p.waitForSelector('#chatVideo:not([hidden])');
    assert.equal(await p.locator('#chatVideoTitulo').innerText(), 'Chat de outro');
    // Tudo outra vez não pede nada.
    cursores.length = 0;
    await ler(p);
    await p.waitForFunction(() => /já estava lido/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 5000 });
    assert.equal(cursores.length, 0);
    // Esc recua um passo de cada vez (o tudo volta ao passo 2), e no passo 1 fecha e devolve o foco ao nome.
    await p.locator('#lerChatTrecho').focus();
    await p.keyboard.press('Escape');
    assert.ok(await p.locator('#escolherTudo').isVisible());
    assert.equal(await p.evaluate(() => document.activeElement.id), 'escolherTudo', 'o foco na última escolha');
    await p.keyboard.press('Escape');
    assert.ok(await p.locator('#escolherChat').isVisible());
    await p.keyboard.press('Escape');
    assert.ok(await p.locator('#acoesFaixa').isHidden());
    assert.equal(await p.evaluate(() => document.activeElement.dataset.quem), 'outro');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('Todos: o trecho tem as alças na faixa geral e lê cada um nesse trecho; tudo lê todos sem reler',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await abrirNoite(p, ['tchubi', 'outro']);
    // O tchubi já tem o pedaço das 21:00 às 21:02 lido.
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Home');
    await p.locator('#alcaFim').focus();
    await p.keyboard.press('End');
    for (let k = 0; k < 8; k++) await p.keyboard.press('Shift+ArrowLeft');
    await ler(p);
    await p.waitForFunction(() => /^Chat de tchubi, de 21:00:00 até 21:02:00/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 15000 });

    // Todos, trecho: as alças sobem para a faixa geral, e o trecho das 21:00 às 21:04 é lido de cada um.
    // Com as alças abertas, escolher Todos leva-as para a faixa geral, no mesmo trecho.
    await p.click('#faixas button.nome[data-quem="*"]');
    assert.equal(await p.evaluate(() => document.getElementById('chatTrecho').parentElement.className), 'faixaGeral escolhida');
    await p.locator('#alcaFim').focus();
    for (let k = 0; k < 2; k++) await p.keyboard.press('Shift+ArrowRight');
    const cursores = [];
    p.on('request', (q) => { if (q.url().includes('/messages')) cursores.push([q.url().match(/channels\/([^/]+)/)[1], (Number(new URL(q.url()).searchParams.get('cursor')) - T) / MIN]); });
    await ler(p);
    await p.waitForFunction(() => /^Chat de 2 pessoas lido/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 20000 });
    const msgs = await p.evaluate(() => ['tchubi', 'outro'].map((c) => (window.__evento.mensagens.get(c) || []).length));
    assert.deepEqual(msgs, [12, 12], 'quatro minutos de cada um, três por minuto');
    // O pedaço que o tchubi já tinha não se pediu outra vez.
    assert.ok(!cursores.some(([c, m]) => (c === 'tchubi' || c === '1000') && m <= 2), JSON.stringify(cursores));
    // O lido de todos aparece na faixa geral.
    assert.ok(await p.locator('#faixas .faixaGeral .trilho .lido').count() > 0);

    // Todos, tudo: a noite toda de cada um, só o que falta. Voltar recua ao passo 3 e depois ao 2.
    await p.click('#voltarAcoes');
    assert.ok(await p.locator('#usarTrecho').isVisible());
    await p.click('#voltarAcoes');
    await p.click('#escolherTudo');
    assert.match(await p.locator('#acoesResumo').innerText(), /^Ler o chat de todos, todo o tempo ao vivo\.$/);
    cursores.length = 0;
    await ler(p);
    await p.waitForFunction(() => /^Chat de 2 pessoas lido: 100 mensagens/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 25000 });
    assert.ok(cursores.every(([, m]) => m > 4), `voltou ao que já tinha: ${JSON.stringify(cursores)}`);
    assert.deepEqual(await p.evaluate(() => ['tchubi', 'outro'].map((c) => window.__evento.mensagens.get(c).length)), [70, 30]);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('com o toque, as alças e os botões da barra têm 44 px', semNavegador, async () => {
  const { p: base } = await abrir();
  const p = await base.context().browser().newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-PT' });
  await base.close();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e.message)));
  await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ } });
  await abrirNoite(p, ['tchubi', 'outro']);
  await p.click('#usarTrecho');
  const medidas = await p.evaluate(() => {
    if (!matchMedia('(pointer: coarse)').matches) return null;
    const ids = ['alcaInicio', 'alcaFim', 'lerChatTrecho', 'voltarAcoes', 'fecharAcoes', 'zoomMais', 'zoomMenos'];
    const r = Object.fromEntries(ids.map((id) => [id, Math.round(document.getElementById(id).getBoundingClientRect()[id.startsWith('alca') ? 'width' : 'height'])]));
    r.nome = Math.round(document.querySelector('#faixas button.nome[data-quem="outro"]').getBoundingClientRect().height);
    r.larguraPagina = document.documentElement.scrollWidth;
    return r;
  });
  assert.ok(medidas, 'o ecrã de toque não deu pointer: coarse');
  if (medidas) {
    for (const [k, v] of Object.entries(medidas)) if (k !== 'larguraPagina') assert.ok(v >= 44, `${k}: ${v} px`);
    assert.ok(medidas.larguraPagina <= 390, `a página anda de lado: ${medidas.larguraPagina}`);
  }
  assert.deepEqual(erros, []);
  await p.close();
});
