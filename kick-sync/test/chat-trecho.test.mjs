// O trecho de chat escolhido à mão na linha do tempo da tela do vídeo: duas alças (início e fim) que se
// arrastam com o rato, com o dedo e pelo teclado, e um botão que lê o chat de UM streamer só nesse trecho.
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
  await p.waitForFunction(() => document.getElementById('alcaInicio').hasAttribute('aria-valuenow'));
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
    // A lista diz de quem é o chat, e começa no do vídeo.
    assert.equal(await p.locator('#chatDeQuem').inputValue(), 'tchubi');
    const opcoes = await p.locator('#chatDeQuem option').allInnerTexts();
    assert.equal(opcoes.length, 2);
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

    await p.selectOption('#chatDeQuem', 'outro');
    const pedidos = [];
    p.on('request', (q) => {
      const u = q.url();
      if (/\/api\/v2\/channels\/[^/]+$/.test(u) || u.includes('/messages')) pedidos.push(u);
    });
    await p.click('#lerChatTrecho');
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
    await p.click('#lerChatTrecho');
    await p.waitForFunction(() => /já estava lido/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 5000 });
    assert.equal(pedidos.filter((u) => u.includes('/messages')).length, 0);
    // Um trecho maior lê só o pedaço novo: das 21:01 às 21:02.
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Shift+ArrowLeft');
    await p.click('#lerChatTrecho');
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
    await p.waitForFunction(() => document.getElementById('alcaInicio').hasAttribute('aria-valuenow'));
    assert.equal(await p.locator('.regua .picoChat').count(), 0);
    await p.click('#lerChatTrecho');
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
    await p.click('#lerChatTrecho');
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
    await p.click('#lerChatTrecho');
    await p.waitForFunction(() => /^Chat de tchubi, de 21:00:00 até 21:10:00: 70 mensagens/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 20000 });
    // O bocado que já tinha vindo não se pede outra vez.
    assert.ok(cursores.every((ms) => ms > T + 5 * 60_000 - 1000), `voltou ao princípio: ${cursores.map((ms) => (ms - T) / 1000)}`);
    const ids = await p.evaluate(() => window.__evento.mensagens.get('tchubi').map((m) => m.id));
    assert.equal(new Set(ids).size, 70);
    assert.deepEqual(erros, []);
    await p.close();
  });
