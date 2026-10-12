// Os melhores lances numa página a sério, com a Kick de test/falsa.mjs: oito canais com uma noite de 10
// minutos. Três do mesmo time têm um pico de chat no mesmo minuto (o minuto 3); dois sem time têm um pico
// cada um no minuto 7, que só calharam juntos. A lista tem de pôr o lance do time à frente, dizer porquê,
// abrir os três ângulos 10 s antes, deixar os dois sem time separados (com a dica do outro pico perto),
// mudar quando chega mais chat ou uma kill, e guardar o que se marcou e descartou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const CANAIS = ['alfa1', 'alfa2', 'beta1', 'beta2', 'gama1', 'gama2', 'solo', 'solo2'];
const ELENCO = 'Briga: alfa1, beta1, gama2\nAlfa: alfa2\nBeta: beta2\nGama: gama1\nsolo\nsolo2';
const PICOS = {
  alfa1: [{ min: 3, n: 40 }], beta1: [{ min: 3, n: 30 }], gama2: [{ min: 3, n: 25 }],
  solo: [{ min: 7, n: 40 }], solo2: [{ min: 7, n: 20 }],
};

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

/** As linhas da lista como o leitor as vê: hora, canais, motivo, soma e o estado dos botões. */
const linhas = (p) => p.$$eval('#melhoresLista > li', (lis) => lis.map((li) => ({
  hora: li.querySelector('.melhorHora').textContent,
  canais: li.querySelector('.melhorCanais').textContent.split(', '),
  motivo: li.querySelector('.melhorMotivo').textContent,
  conta: li.querySelector('.melhorConta').textContent,
  pontos: li.querySelector('.melhorPontos').textContent,
  marcado: li.querySelector('button[data-acao="marcar"]').getAttribute('aria-pressed'),
})));

async function lerChatDeTodos(p) {
  await p.locator('#melhoresLerChat').scrollIntoViewIfNeeded();
  await p.click('#melhoresLerChat');
  await p.waitForFunction(() => /^Chat lido de \d+ canais/.test(document.getElementById('melhoresEstado').textContent), null, { timeout: 30000 });
  await p.waitForFunction(() => /em todos os 8 canais/.test(document.getElementById('melhoresFalta').textContent), null, { timeout: 5000 });
}

test('melhores lances: o lance de três canais à frente, com o motivo, aberto nos três ângulos 10 s antes; marcar e descartar ficam no aparelho',
  semNavegador, async () => {
    const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: CANAIS, chatPicos: PICOS });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', ELENCO);
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });

    // Antes de ler nada: a lista diz o que falta, e o botão diz quanto vai ler.
    await p.waitForFunction(() => /Chat lido em 0 de 8 canais/.test(document.getElementById('melhoresFalta').textContent));
    assert.match(await p.locator('#melhoresFalta').innerText(), /Ler o chat de todos para achar mais/);
    assert.match(await p.locator('#melhoresFalta').innerText(), /Som ainda não ouvido/);
    assert.equal(await p.locator('#melhoresLerChatTexto').innerText(), 'Ler o chat de todos (8 canais, 10 min)');
    assert.equal(await p.locator('#melhoresLista > li').count(), 0);
    assert.match(await p.locator('#melhoresVazio').innerText(), /Ainda não há lances/);

    // Escolher um momento no mapa lê o chat do time do alfa1: o lance do time aparece, com os três.
    await clicarNoMapa(p, 'alfa1', T + 2 * 60_000);
    await p.waitForFunction(() => document.querySelector('#melhoresLista > li .melhorCanais')?.textContent.split(', ').length === 3, null, { timeout: 15000 });
    let l = await linhas(p);
    assert.equal(l.length, 1);
    assert.match(await p.locator('#melhoresFalta').innerText(), /Chat lido em 3 de 8 canais/);

    // O chat de todos: os dois picos sem time do minuto 7 entram atrás, cada um no seu lance.
    await lerChatDeTodos(p);
    l = await linhas(p);
    assert.equal(l.length, 3);
    assert.deepEqual([...l[0].canais].sort(), ['alfa1', 'beta1', 'gama2']);
    assert.equal(l[0].canais[0], 'alfa1', 'quem mais somou vai à frente');
    assert.match(l[0].motivo, /^chat até \d+ vezes o normal em 3 canais$/);
    assert.match(l[0].conta, /chat \d+ \+ 3 canais juntos 4 = \d+/);
    assert.deepEqual(l[1].canais, ['solo']);
    assert.match(l[1].motivo, /^chat \d+ vezes o normal$/);
    assert.deepEqual(l[2].canais, ['solo2'], 'dois sem time no mesmo minuto não são o mesmo lance');
    assert.doesNotMatch(l[1].conta + l[2].conta, /juntos/);
    // Mas cada um diz que o outro teve um pico perto.
    const pertos = await p.$$eval('#melhoresLista > li', (lis) => lis.map((li) => li.querySelector('.melhorPerto')?.textContent || ''));
    assert.match(pertos[1], /outro pico perto.*solo2$/);
    assert.match(pertos[2], /outro pico perto.*solo$/);
    assert.equal(pertos[0], '');
    const pontos = l.map((x) => Number(x.pontos.match(/\d+/)[0]));
    assert.ok(pontos[0] > pontos[1], `ordem pela nota: ${pontos}`);
    // A soma escrita bate com a nota.
    const soma = l[0].conta.match(/(\d+)/g).map(Number);
    assert.equal(soma.at(-1), pontos[0]);
    assert.equal(await p.locator('#melhoresConta').innerText(), '3');

    // Os filtros: só lances de 2 ou mais canais.
    await p.selectOption('#melhoresMinCanais', '2');
    assert.equal(await p.locator('#melhoresLista > li').count(), 1);
    await p.selectOption('#melhoresMinCanais', '1');

    // O teclado: ↓ passa ao mesmo botão do lance seguinte.
    await p.locator('#melhoresLista > li').first().locator('button[data-acao="abrir"]').focus();
    await p.keyboard.press('ArrowDown');
    assert.equal(await p.evaluate(() => document.activeElement.closest('li').dataset.i + document.activeElement.dataset.acao), '1abrir');
    await p.keyboard.press('ArrowUp');

    // Abrir lance: os três ângulos, e só eles, 10 s antes do primeiro pico.
    const lance = await p.evaluate(() => {
      const li = document.querySelector('#melhoresLista > li');
      return Number(li.dataset.chave);
    });
    assert.ok(lance >= T + 3 * 60_000 && lance < T + 4 * 60_000, new Date(lance).toISOString());
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelectorAll('#grade .tile').length === 3 || window.__estado?.linhas?.length === 3, null, { timeout: 20000 });
    await p.waitForFunction(() => window.__estado.linhas.length === 3, null, { timeout: 20000 });
    const noite = await p.evaluate(() => ({
      canais: window.__estado.linhas.map((x) => x.slug).sort(), agora: window.__estado.agoraMs, focos: window.__estado.focos,
    }));
    assert.deepEqual(noite.canais, ['alfa1', 'beta1', 'gama2']);
    assert.ok(Math.abs(noite.agora - (lance - 10_000)) < 2000, `abriu em ${new Date(noite.agora).toISOString()}`);
    assert.equal(noite.focos[0], 'alfa1');

    // Uma kill marcada no vídeo, neste instante, entra no mesmo lance.
    await p.click('#marcarKill');
    await p.click('#mostrarMapa');
    await p.waitForFunction(() => /1 kill marcada/.test(document.querySelector('#melhoresLista > li .melhorMotivo')?.textContent || ''), null, { timeout: 5000 });
    await p.check('#melhoresSoKills');
    assert.equal(await p.locator('#melhoresLista > li').count(), 1);
    await p.uncheck('#melhoresSoKills');

    // Marcar o lance do solo: vai para a montagem, e o botão diz que está marcado.
    const antes = await p.evaluate(() => window.__estado.momentos.length + window.__estado.momentosFora.length);
    const solo = p.locator('#melhoresLista > li').filter({ has: p.locator('.melhorCanais', { hasText: /^solo$/ }) });
    await solo.locator('button[data-acao="marcar"]').click();
    assert.equal(await solo.locator('button[data-acao="marcar"]').getAttribute('aria-pressed'), 'true');
    const depois = await p.evaluate(() => [...window.__estado.momentos, ...window.__estado.momentosFora].filter((m) => m.origem === 'lances'));
    assert.equal(depois.length, 1);
    assert.equal(depois[0].protagonista, 'solo');
    assert.equal(await p.evaluate(() => window.__estado.momentos.length + window.__estado.momentosFora.length), antes + 1);
    // E marcar não sobe o lance: a marca da lista não conta como kill.
    assert.doesNotMatch(await solo.locator('.melhorMotivo').innerText(), /kill/);

    // Descartar o primeiro: sai da lista, o foco passa ao seguinte, e pode voltar.
    await p.locator('#melhoresLista > li').first().locator('button[data-acao="descartar"]').click();
    l = await linhas(p);
    assert.deepEqual(l.map((x) => x.canais[0]), ['solo', 'solo2']);
    assert.equal(await p.evaluate(() => document.activeElement.closest('li')?.querySelector('.melhorCanais').textContent), 'solo');
    assert.equal(await p.locator('#melhoresDescartados').innerText(), 'Mostrar descartados (1)');

    // Outra visita: o evento volta, o chat lê-se de novo, e o descartado e o marcado continuam.
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
    if (!(await p.locator('#melhores').isVisible())) await p.click('#mostrarMapa');
    await lerChatDeTodos(p);
    l = await linhas(p);
    assert.deepEqual(l.map((x) => [x.canais[0], x.marcado]), [['solo', 'true'], ['solo2', 'false']]);
    await p.click('#melhoresDescartados');
    l = await linhas(p);
    assert.equal(l.length, 3);
    await p.locator('#melhoresLista > li.descartado button[data-acao="voltar"]').click();
    await p.click('#melhoresDescartados').catch(() => {});
    assert.equal(await p.locator('#melhoresLista > li').count(), 3);
    assert.equal(await p.locator('#melhoresDescartados').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('melhores lances no telemóvel: a lista cabe em 390 px, sem rolar para o lado', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 390, height: 844 } });
  await kickFalsa(p, { canais: CANAIS, chatPicos: PICOS });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', ELENCO);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  await lerChatDeTodos(p);
  assert.equal(await p.locator('#melhoresLista > li').count(), 3);
  const medida = await p.evaluate(() => {
    const fora = [];
    for (const el of document.querySelectorAll('#melhores *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) fora.push(el.id || el.className || el.tagName);
    }
    return { fora, rola: document.documentElement.scrollWidth > window.innerWidth };
  });
  assert.deepEqual(medida.fora, []);
  assert.equal(medida.rola, false);
  assert.deepEqual(erros, []);
  await p.close();
});
