// A tela do vídeo como editor: transporte sob o vídeo, K para pausar, trecho marcado na linha do tempo
// e a porta de entrada atrás do botão Canais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function carregar(ecra) {
  const { p, erros } = await abrir({ ecra });
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile.foco .pausa', { timeout: 15000 });
  return { p, erros };
}
const icone = (p, sel) => p.locator(`${sel} use`).getAttribute('href');

test('o tocar e pausar do transporte e a tecla K fazem o mesmo que o espaço', semNavegador, async () => {
  const { p, erros } = await carregar({ width: 1280, height: 720 });
  assert.equal(await icone(p, '#tocarPausar'), '#i-pausa');
  await p.click('#tocarPausar');
  assert.equal(await icone(p, '#tocarPausar'), '#i-tocar');
  assert.equal(await p.locator('#tocarPausar').getAttribute('aria-pressed'), 'true');
  assert.equal(await icone(p, '.tile.foco .pausa'), '#i-tocar', 'o botão do vídeo acompanha');
  await p.locator('body').press('k');
  assert.equal(await icone(p, '#tocarPausar'), '#i-pausa');
  await p.locator('body').press(' ');
  assert.equal(await icone(p, '#tocarPausar'), '#i-tocar');
  assert.deepEqual(erros, []);
  await p.close();
});

test('o trecho entre entrada e saída aparece sobre as faixas', semNavegador, async () => {
  const { p, erros } = await carregar({ width: 1280, height: 720 });
  assert.equal(await p.locator('#trechoMarcado').isVisible(), false);
  await p.click('#marcarIn');
  assert.equal(await p.locator('#trechoMarcado').isVisible(), true, 'só com a entrada, um risco');
  await p.click('#mais1m');
  await p.click('#marcarOut');
  const caixa = await p.locator('#trechoMarcado').boundingBox();
  assert.ok(caixa.width > 8, `o trecho tem ${caixa.width} px`);
  const faixas = await p.locator('#faixas').boundingBox();
  assert.ok(caixa.y >= faixas.y - 1 && caixa.y + caixa.height <= faixas.y + faixas.height + 1);
  assert.deepEqual(erros, []);
  await p.close();
});

test('a porta de entrada fica atrás do botão Canais com o vídeo aberto', semNavegador, async () => {
  for (const ecra of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const { p, erros } = await carregar(ecra);
    assert.equal(await p.locator('#canais').isVisible(), false, `${ecra.width}: fechada`);
    assert.equal(await p.locator('#editarCanais').getAttribute('aria-expanded'), 'false');
    await p.click('#editarCanais');
    assert.equal(await p.locator('#canais').isVisible(), true, `${ecra.width}: aberta`);
    assert.equal(await p.locator('#editarCanais').getAttribute('aria-expanded'), 'true');
    await p.click('#editarCanais');
    assert.equal(await p.locator('#canais').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  }
});

test('em 390 px o vídeo, o transporte e a linha do tempo cabem na primeira tela', semNavegador, async () => {
  const { p, erros } = await carregar({ width: 390, height: 844 });
  for (const id of ['#palcoFoco', '#clipar', '#marcarIn', '#marcarOut', '#tocarPausar', '#faixas']) {
    const b = await p.locator(id).boundingBox();
    assert.ok(b && b.y + b.height <= 844, `${id} acaba em ${b && b.y + b.height}`);
  }
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(erros, []);
  await p.close();
});
