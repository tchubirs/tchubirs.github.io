// O zoom contínuo da linha do tempo da tela do vídeo (o dono, 10/10: "igual nos editores de vídeo: o
// quanto de linha do tempo aparece, dando zoom e diminuindo a linha, ou tirando zoom e aumentando, até
// ter o máximo"). O deslizante com menos e mais, Ctrl + roda do mouse no ponto do mouse, a pinça com dois
// dedos, as teclas + e -, e arrastar ou rolar para o lado para andar quando há zoom.
//
// A noite é a de test/falsa.mjs: dez minutos, das 21:00 às 21:10.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const NOITE = 600_000;

async function abrirNoite(p) {
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile.foco .pausa', { timeout: 15000 });
  // Parado, para o instante não andar e a vista não o seguir a meio do teste.
  await p.click('.tile.foco .pausa');
  await p.waitForFunction(() => document.querySelector('.tile.foco .pausa use')?.getAttribute('href') === '#i-tocar',
    null, { timeout: 5000 });
}

const vista = (p) => p.evaluate(() => {
  const v = window.__estado.vista || window.__estado.janela;
  return { inicio: v.inicio, fim: v.fim, largura: v.fim - v.inicio, agora: window.__estado.agoraMs };
});

/** O instante que está debaixo de `x` na linha do tempo, e o x de um instante. */
const msEmX = (p, x) => p.evaluate((cx) => {
  const v = window.__estado.vista || window.__estado.janela;
  const r = document.getElementById('regua').getBoundingClientRect();
  return v.inicio + ((cx - r.left) / r.width) * (v.fim - v.inicio);
}, x);

/** Uma roda do mouse sobre as faixas, com ou sem Ctrl. */
const roda = (p, { x, deltaY = 0, deltaX = 0, ctrlKey = false, shiftKey = false }) => p.evaluate((o) => {
  const faixas = document.getElementById('faixas');
  const y = faixas.getBoundingClientRect().top + 10;
  faixas.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true, cancelable: true, clientX: o.x, clientY: y, deltaY: o.deltaY, deltaX: o.deltaX, ctrlKey: o.ctrlKey, shiftKey: o.shiftKey,
  }));
}, { x, deltaY, deltaX, ctrlKey, shiftKey });

test('o deslizante e os botões: da noite toda aos 30 s, e de volta', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await abrirNoite(p);
  // Começa na noite toda: o menos não tem para onde ir.
  assert.equal(await p.inputValue('#zoomTempo'), '0');
  assert.equal(await p.locator('#zoomQuanto').innerText(), 'tudo à vista');
  assert.equal(await p.locator('#zoomTempo').getAttribute('aria-valuetext'), 'tudo à vista');
  assert.ok(await p.locator('#zoomMenos').isDisabled());
  assert.equal((await vista(p)).largura, NOITE);
  // Os três têm nome acessível.
  assert.equal(await p.locator('#zoomTempo').getAttribute('aria-label'), 'Zoom da linha do tempo');
  assert.equal(await p.locator('#zoomMais').getAttribute('aria-label'), 'Mais zoom: mostra menos tempo');
  assert.equal(await p.locator('#zoomMenos').getAttribute('aria-label'), 'Menos zoom: mostra mais tempo');

  // O deslizante no meio: a média geométrica entre a noite e os 30 s, com o instante à vista.
  await p.locator('#zoomTempo').fill('500');
  let v = await vista(p);
  assert.ok(Math.abs(v.largura - Math.sqrt(NOITE * 30_000)) < 2000, `${v.largura}`);
  assert.ok(v.agora >= v.inicio && v.agora <= v.fim, 'o instante saiu da vista');
  assert.match(await p.locator('#zoomQuanto').innerText(), /^2 min à vista$/);

  // Na ponta, 30 s, e o mais deixa de servir. Nunca menos do que isso.
  await p.locator('#zoomTempo').fill('1000');
  v = await vista(p);
  assert.equal(v.largura, 30_000);
  assert.equal(await p.locator('#zoomQuanto').innerText(), '30 s à vista');
  assert.ok(await p.locator('#zoomMais').isDisabled());
  // A régua passa a mostrar segundos (passo de um minuto ou menos, com no máximo uma hora inteira).
  const horas = await p.locator('#regua .hora').count();
  assert.ok(horas <= 2, `${horas} horas em 30 s`);

  // O menos dobra o tempo à vista, e o mais divide-o.
  await p.click('#zoomMenos');
  assert.equal((await vista(p)).largura, 60_000);
  await p.click('#zoomMenos');
  await p.click('#zoomMais');
  assert.equal((await vista(p)).largura, 60_000);
  assert.equal(await p.inputValue('#zoomTempo'), String(Math.round((Math.log(60_000 / NOITE) / Math.log(30_000 / NOITE)) * 1000)));

  // O máximo é a noite toda, por mais que se carregue no menos.
  for (let k = 0; k < 8; k++) if (await p.locator('#zoomMenos').isEnabled()) await p.click('#zoomMenos');
  assert.equal((await vista(p)).largura, NOITE);
  assert.equal(await p.inputValue('#zoomTempo'), '0');

  // O zoom fica guardado para a próxima vez.
  await p.locator('#zoomTempo').fill('1000');
  assert.equal(await p.evaluate(() => localStorage.getItem('replay.zoom')), '30');
  assert.deepEqual(erros, []);
  await p.close();
});

test('Ctrl + roda do mouse dá zoom no ponto do mouse, entre os 30 s e a noite toda', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await abrirNoite(p);
  const r = await p.locator('#regua').boundingBox();
  const x = r.x + r.width * 0.75;
  const antes = await msEmX(p, x);
  // A roda sozinha não dá zoom.
  await roda(p, { x, deltaY: -200 });
  assert.equal((await vista(p)).largura, NOITE);
  // Com Ctrl, aproxima, e o instante debaixo do mouse fica debaixo do mouse.
  await roda(p, { x, deltaY: -200, ctrlKey: true });
  const v = await vista(p);
  assert.ok(v.largura < NOITE, 'não aproximou');
  assert.ok(Math.abs((await msEmX(p, x)) - antes) < 1500, `o ponto fugiu: ${(await msEmX(p, x)) - antes} ms`);
  // Mais umas voltas: pára nos 30 s, e o ponto continua lá.
  for (let k = 0; k < 20; k++) await roda(p, { x, deltaY: -400, ctrlKey: true });
  assert.equal((await vista(p)).largura, 30_000);
  assert.ok(Math.abs((await msEmX(p, x)) - antes) < 1500);
  // Para trás: pára na noite toda.
  for (let k = 0; k < 30; k++) await roda(p, { x, deltaY: 400, ctrlKey: true });
  assert.equal((await vista(p)).largura, NOITE);
  assert.equal(await p.inputValue('#zoomTempo'), '0');
  // A roda com Ctrl, no browser a sério, também (o Playwright manda o Ctrl carregado).
  await p.mouse.move(x, (await p.locator('#faixas').boundingBox()).y + 8);
  await p.keyboard.down('Control');
  await p.mouse.wheel(0, -300);
  await p.keyboard.up('Control');
  await p.waitForFunction((n) => (window.__estado.vista.fim - window.__estado.vista.inicio) < n, NOITE, { timeout: 3000 });
  assert.deepEqual(erros, []);
  await p.close();
});

test('as teclas + e - dão zoom; e o + sem noite não rebenta', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.keyboard.press('+');
  await abrirNoite(p);
  await p.locator('body').focus();
  await p.keyboard.press('+');
  assert.equal((await vista(p)).largura, NOITE / 2);
  await p.keyboard.press('=');
  assert.equal((await vista(p)).largura, NOITE / 4);
  await p.keyboard.press('-');
  assert.equal((await vista(p)).largura, NOITE / 2);
  // Escrever um "-" numa caixa de texto não dá zoom.
  await p.locator('#filtrarGrelha').focus().catch(() => {});
  if (await p.evaluate(() => document.activeElement?.id === 'filtrarGrelha')) {
    await p.keyboard.press('-');
    assert.equal((await vista(p)).largura, NOITE / 2);
  }
  // Os atalhos dizem que existem.
  assert.match(await p.locator('#modalAjuda').innerText(), /Zoom da linha do tempo/);
  assert.deepEqual(erros, []);
  await p.close();
});

test('com zoom, arrastar as faixas e rolar para o lado andam pela noite sem mexer no vídeo', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await abrirNoite(p);
  // Sem zoom, arrastar não tem para onde andar.
  await p.locator('#zoomTempo').fill('500');
  const v0 = await vista(p);
  const trilho = await p.locator('#faixas .faixa[data-slug="outro"] .trilho').boundingBox();
  const y = trilho.y + trilho.height / 2;
  // Arrastar para a esquerda: a vista anda para a frente no tempo, e o vídeo fica onde estava.
  await p.mouse.move(trilho.x + trilho.width * 0.6, y);
  await p.mouse.down();
  await p.mouse.move(trilho.x + trilho.width * 0.3, y, { steps: 8 });
  await p.mouse.up();
  const v1 = await vista(p);
  assert.equal(v1.largura, v0.largura, 'arrastar não muda o zoom');
  assert.ok(v1.inicio > v0.inicio, `não andou: ${v1.inicio - v0.inicio}`);
  assert.ok(Math.abs((v1.inicio - v0.inicio) - v0.largura * 0.3) < v0.largura * 0.05, 'andou o que o rato andou');
  assert.equal(v1.agora, v0.agora, 'o arrasto levou o vídeo, como um clique');
  // A vista fica onde ficou, mesmo com o instante fora dela.
  await p.waitForTimeout(400);
  assert.equal((await vista(p)).inicio, v1.inicio);

  // Rolar para o lado (o trackpad, ou Shift + roda) também anda.
  const r = await p.locator('#regua').boundingBox();
  await roda(p, { x: r.x + 50, deltaX: -r.width / 10 });
  const v2 = await vista(p);
  assert.ok(v2.inicio < v1.inicio, 'a roda para o lado não andou');
  await roda(p, { x: r.x + 50, deltaY: r.width / 10, shiftKey: true });
  assert.ok((await vista(p)).inicio > v2.inicio, 'Shift + roda não andou');
  // E não sai da noite.
  for (let k = 0; k < 40; k++) await roda(p, { x: r.x + 50, deltaX: r.width });
  const v3 = await vista(p);
  assert.equal(v3.fim, await p.evaluate(() => window.__estado.janela.fim));

  // Um clique (sem arrastar) continua a levar o vídeo ao sítio.
  await p.locator('#faixas .faixa[data-slug="outro"] .trilho').click({ position: { x: trilho.width * 0.5, y: trilho.height / 2 } });
  const v4 = await vista(p);
  assert.ok(Math.abs(v4.agora - (v4.inicio + v4.largura / 2)) < v4.largura * 0.05, 'o clique não levou o vídeo');
  assert.deepEqual(erros, []);
  await p.close();
});

test('a pinça com dois dedos aproxima e afasta no meio dos dedos', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await abrirNoite(p);
  const pinca = (de, para) => p.evaluate(({ a, b }) => {
    const el = document.querySelector('#faixas .faixa .trilho');
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const meio = r.left + r.width / 2;
    const ev = (tipo, id, x) => new PointerEvent(tipo, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0,
    });
    el.dispatchEvent(ev('pointerdown', 1, meio - a));
    el.dispatchEvent(ev('pointerdown', 2, meio + a));
    // Com os dedos presos à caixa das faixas (o setPointerCapture do segundo dedo), o resto do gesto
    // chega a ela, mesmo com o trilho refeito a cada passo do zoom.
    const caixa = document.getElementById('faixas');
    for (let k = 1; k <= 5; k++) {
      const d = a + ((b - a) * k) / 5;
      caixa.dispatchEvent(ev('pointermove', 1, meio - d));
      caixa.dispatchEvent(ev('pointermove', 2, meio + d));
    }
    caixa.dispatchEvent(ev('pointerup', 1, meio - b));
    caixa.dispatchEvent(ev('pointerup', 2, meio + b));
  }, { a: de, b: para });
  const meioX = await p.evaluate(() => { const r = document.querySelector('#faixas .faixa .trilho').getBoundingClientRect(); return r.left + r.width / 2; });
  const antes = await msEmX(p, meioX);
  // Abrir os dedos de 50 para 200 px: quatro vezes mais perto.
  await pinca(50, 200);
  const v = await vista(p);
  assert.ok(Math.abs(v.largura - NOITE / 4) < 2000, `${v.largura}`);
  assert.ok(Math.abs((await msEmX(p, meioX)) - antes) < 2000, 'o meio dos dedos fugiu');
  // Fechar: volta a afastar, até à noite toda e não mais.
  await pinca(300, 20);
  assert.equal((await vista(p)).largura, NOITE);
  assert.deepEqual(erros, []);
  await p.close();
});
