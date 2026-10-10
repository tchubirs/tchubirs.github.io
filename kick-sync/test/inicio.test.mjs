// A tela inicial com dois caminhos (o dono, 10/10): Evento inteiro e VOD ou poucos canais. Quem chega
// vê os dois cartões e escolhe um; só os campos desse caminho aparecem. A escolha fica guardada, uma
// mensagem escrita numa porta fechada abre-a, e com o vídeo aberto o painel Canais mostra-se todo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const visiveis = (p, ids) => Promise.all(ids.map((id) => p.locator(`#${id}`).isVisible()));
const DO_EVENTO = ['elenco', 'abrirElenco', 'abrirArquivoElenco', 'procurarAoVivo'];
const DOS_CANAIS = ['linkKick', 'abrirLink', 'procurar', 'canais', 'carregar'];

test('a primeira visita mostra os dois caminhos, a frase do produto e o exemplo, e nenhum campo',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 }, caminho: null });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    assert.equal(await p.locator('#caminhoEvento').innerText().then((s) => s.split('\n')[0]), 'Evento inteiro');
    assert.equal(await p.locator('#caminhoVod').innerText().then((s) => s.split('\n')[0]), 'VOD ou poucos canais');
    for (const id of ['caminhoEvento', 'caminhoVod']) {
      assert.equal(await p.locator(`#${id}`).getAttribute('aria-expanded'), 'false', id);
    }
    assert.deepEqual(await visiveis(p, [...DO_EVENTO, ...DOS_CANAIS]), Array(9).fill(false), 'nenhum campo à vista');
    assert.equal(await p.locator('#lema').innerText(), 'Reveja partidas por vários ângulos, encontre os melhores lances e exporte os clipes.');
    assert.equal(await p.locator('#exemploAoVivo').isVisible(), true);
    // Os dois cartões lado a lado, na mesma altura, e o exemplo por baixo deles.
    const [a, b, ex] = await Promise.all(['#caminhoEvento', '#caminhoVod', '#exemploAoVivo'].map((s) => p.locator(s).boundingBox()));
    assert.equal(Math.round(a.y), Math.round(b.y));
    assert.ok(b.x > a.x + a.width, 'lado a lado');
    assert.ok(ex.y > a.y + a.height, 'o exemplo vem depois dos caminhos');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('escolher um caminho mostra só os campos dele, troca com um clique, e fica guardado',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 }, caminho: null });
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.click('#caminhoEvento');
    assert.equal(await p.locator('#caminhoEvento').getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await visiveis(p, DO_EVENTO), [true, true, true, true]);
    assert.deepEqual(await visiveis(p, DOS_CANAIS), [false, false, false, false, false]);
    // O Abrir evento é a ação principal da porta, e é a única principal à vista.
    assert.deepEqual(await p.locator('button.principal:visible').evaluateAll((l) => l.map((b) => b.id)), ['abrirElenco']);

    await p.click('#caminhoVod');
    assert.equal(await p.locator('#caminhoEvento').getAttribute('aria-expanded'), 'false');
    assert.equal(await p.locator('#caminhoVod').getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await visiveis(p, DO_EVENTO), [false, false, false, false]);
    assert.deepEqual(await visiveis(p, DOS_CANAIS), [true, true, true, true, true]);
    assert.deepEqual(await p.locator('button.principal:visible').evaluateAll((l) => l.map((b) => b.id)), ['carregar']);

    // Volta assim depois de recarregar.
    await p.reload({ waitUntil: 'networkidle' });
    assert.equal(await p.locator('#caminhoVod').getAttribute('aria-expanded'), 'true');
    assert.equal(await p.locator('#canais').isVisible(), true);
    // Um clique no cartão aberto fecha-o.
    await p.click('#caminhoVod');
    assert.equal(await p.locator('#caminhoVod').getAttribute('aria-expanded'), 'false');
    assert.equal(await p.locator('#canais').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('os caminhos abrem-se pelo teclado, com o foco à vista', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 }, caminho: null });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.focus('#idioma');
  let chegou = false;
  for (let i = 0; i < 10 && !chegou; i++) {
    await p.keyboard.press('Tab');
    chegou = await p.evaluate(() => document.activeElement?.id === 'caminhoEvento');
  }
  assert.ok(chegou, 'o Tab chega ao primeiro cartão');
  assert.notEqual(await p.evaluate(() => getComputedStyle(document.activeElement).boxShadow), 'none', 'foco visível');
  await p.keyboard.press('Enter');
  assert.equal(await p.locator('#elenco').isVisible(), true);
  // O Tab seguinte entra nos campos do caminho aberto, e o outro cartão vem depois deles.
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'elenco');
  await p.focus('#caminhoVod');
  await p.keyboard.press('Space');
  assert.equal(await p.locator('#canais').isVisible(), true);
  assert.equal(await p.locator('#elenco').isVisible(), false);
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement?.id), 'linkKick');
  assert.deepEqual(erros, []);
  await p.close();
});

test('pelos dois caminhos abre-se o que se abria: o evento no mapa e os canais no vídeo',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 }, caminho: null });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.click('#caminhoEvento');
    await p.fill('#elenco', 'Time Alfa: tchubi, outro');
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
    assert.equal(await p.locator('#caminhoEvento').isVisible(), false, 'com o evento aberto os caminhos saem');
    assert.equal(await p.locator('#lema').isVisible(), false);
    await p.click('#fecharEvento');
    // De volta, na mesma porta.
    assert.equal(await p.locator('#elenco').isVisible(), true);
    await p.click('#caminhoVod');
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#caminhoVod').isVisible(), false, 'com o vídeo aberto os caminhos saem');
    assert.equal(await p.locator('#exemploAoVivo').isVisible(), false);
    assert.equal(await p.locator('#lema').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('com o vídeo aberto, o painel Canais mostra os campos mesmo com o caminho do evento escolhido',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    // A noite volta sozinha ao recarregar; o caminho guardado passa a ser o do evento.
    await p.evaluate(() => localStorage.setItem('replay.caminho', 'evento'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#editarCanais');
    assert.equal(await p.locator('#canais').isVisible(), true);
    assert.equal(await p.locator('#procurar').isVisible(), true);
    assert.equal(await p.locator('#elenco').isVisible(), false, 'a porta do evento continua fora da tela do vídeo');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('uma mensagem para uma porta fechada abre essa porta', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  // Um link curto de um evento salvo que não existe: a mensagem é da porta do evento.
  await p.goto(`http://127.0.0.1:${PORTA}/?e=nao-existe`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.getElementById('estadoEvento').textContent.trim());
  assert.equal(await p.locator('#estadoEvento').isVisible(), true);
  assert.equal(await p.locator('#caminhoEvento').getAttribute('aria-expanded'), 'true');
  // A porta aberta pelo código não fica guardada: a escolha guardada é a de quem clicou.
  assert.equal(await p.evaluate(() => localStorage.getItem('replay.caminho')), 'vod');
  assert.deepEqual(erros.filter((e) => !/404|Failed to load/.test(e)), []);
  await p.close();
});

test('no celular os dois caminhos ficam lado a lado no primeiro ecrã, sem a página andar de lado',
  semNavegador, async () => {
    for (const idioma of ['pt', 'en', 'es']) {
      const { p, erros } = await abrir({ ecra: { width: 390, height: 844 }, idioma, caminho: null });
      await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
      const [a, b] = await Promise.all(['#caminhoEvento', '#caminhoVod'].map((s) => p.locator(s).boundingBox()));
      assert.equal(Math.round(a.y), Math.round(b.y), idioma);
      assert.ok(a.height >= 44 && b.height >= 44, `${idioma}: alvos de toque`);
      assert.ok(b.x + b.width <= 390 - 11, `${idioma}: cortado à direita`);
      assert.ok(a.y + a.height < 844, `${idioma}: abaixo da dobra`);
      for (const [c, botao] of [['#caminhoEvento', '#abrirElenco'], ['#caminhoVod', '#carregar']]) {
        await p.click(c);
        const caixa = await p.locator(botao).boundingBox();
        assert.ok(caixa.y + caixa.height <= 844, `${idioma}: ${botao} fora do primeiro ecrã`);
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), `${idioma}: a página anda de lado`);
      }
      assert.deepEqual(erros, []);
      await p.close();
    }
  });
