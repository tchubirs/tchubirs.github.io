// Marcar ao vivo com uma tecla (IDEIAS.md, item 9), num browser a sério.
//
// Três canais no ar (a Kick fingida de falsa.mjs, com os VODs `is_live`). O V marca o agora em todos os
// ângulos ao vivo abertos: com o ao vivo a tocar na página, o instante da tela; parado, o agora menos o
// atraso medido de cada canal. A marca entra na Montagem e nos melhores lances, no topo, como
// "marcado por você", e fica guardada como os outros lances marcados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const FOTOS = new URL('../../.arena/prints/fotos/', import.meta.url).pathname;
const CANAIS = ['tchubi', 'outro', 'lobo'];
// A playlist fingida tem 60 pedaços de 10 s: acaba em T + 600 s. O relógio do computador fica 5 s depois.
const FIM = T + 600_000;
const AGORA = FIM + 5000;

async function abrirAoVivo(p) {
  await kickFalsa(p, { canais: CANAIS });
  for (const slug of CANAIS) {
    await p.route(`**/api/v2/channels/${slug}/videos`, (rota) => rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 99, session_title: 'ao vivo', start_time: new Date(T).toISOString().replace('T', ' ').slice(0, 19),
        duration: 0, is_live: true, source: `https://stream.kick.com/falsa/${slug}/n0/master.m3u8`, video: {},
      }]),
    }));
  }
  await p.addInitScript((agora) => {
    const real = Date.now;
    const zero = real();
    Date.now = () => agora + (real() - zero);
  }, AGORA);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', CANAIS.join('\n'));
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && !document.getElementById('irAoVivo').hidden, null, { timeout: 15000 });
  await p.click('#irAoVivo');
  await p.waitForFunction(() => document.querySelectorAll('.tile').length === 3 && window.__estado.janela, null, { timeout: 20000 });
}

const marcasAoVivo = (p) => p.evaluate(() => window.__estado.momentos.filter((m) => m.origem === 'aovivo'));

test('o V marca o agora em todos os ângulos ao vivo, tirando o atraso de cada um, e o lance vai para o topo dos melhores',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
    await abrirAoVivo(p);
    assert.equal(await p.locator('#marcarAoVivo').isVisible(), true, 'com alguém ao vivo, o botão aparece');
    assert.match(await p.locator('#marcarAoVivo').getAttribute('title'), /6 s enquanto não há medida.*\(V\)$/,
      'a dica diz o atraso de omissão e a tecla');
    // O atraso medido ao ler a playlist: o relógio está 5 s depois do fim do último pedaço.
    const medidos = await p.evaluate(() => window.__estado.atrasosVivo);
    for (const c of CANAIS) assert.ok(Math.abs(medidos[c].ms - 5000) < 3000, `${c} mediu ${medidos[c].ms} ms`);

    // A tocar o ao vivo aqui: o instante é o da tela.
    const naTela = await p.evaluate(() => window.__estado.agoraMs);
    await p.keyboard.press('v');
    await p.waitForFunction(() => window.__estado.momentos.some((m) => m.origem === 'aovivo'), null, { timeout: 5000 });
    let [marca] = await marcasAoVivo(p);
    assert.ok(Math.abs(marca.ms - naTela) < 2000, `marcou ${marca.ms - naTela} ms longe da tela`);
    assert.deepEqual(marca.vivo.map((v) => v.fonte), ['tela', 'tela', 'tela']);
    assert.deepEqual(marca.vivo.map((v) => v.c).sort(), [...CANAIS].sort());
    assert.match(await p.locator('#estadoAoVivo').innerText(), /3 ângulos ao vivo, no instante que estava na tela/);
    // Carregar outra vez logo a seguir não duplica.
    await p.keyboard.press('v');
    await p.waitForTimeout(150);
    assert.equal((await marcasAoVivo(p)).length, 1);

    // Parado (a ver a live na Kick, por exemplo): o agora menos o atraso medido de cada canal, com o
    // ajuste de relógio de cada um. O `outro` tem +3 s.
    await p.evaluate(() => { window.__estado.momentos = window.__estado.momentos.filter((m) => m.origem !== 'aovivo'); });
    await p.evaluate(() => { window.__estado.nudges.outro = 3000; });
    await p.keyboard.press(' ');
    await p.waitForTimeout(150);
    const agoraPagina = await p.evaluate(() => Date.now());
    await p.click('#marcarAoVivo');
    [marca] = await marcasAoVivo(p);
    const porCanal = Object.fromEntries(marca.vivo.map((v) => [v.c, v]));
    for (const c of CANAIS) {
      assert.equal(porCanal[c].fonte, 'medido');
      const esperado = agoraPagina - porCanal[c].atrasoMs - (c === 'outro' ? 3000 : 0);
      assert.ok(Math.abs(porCanal[c].ms - esperado) < 1500, `${c}: ${porCanal[c].ms - esperado} ms do esperado`);
      assert.ok(porCanal[c].atrasoMs >= 2000 && porCanal[c].atrasoMs <= 12_000);
    }
    assert.match(await p.locator('#estadoAoVivo').innerText(), /tirando o atraso de cada canal \(medido: /);
    // Na Montagem, com o que é.
    assert.equal(await p.locator('#listaMomentos li', { hasText: 'marcado ao vivo' }).count(), 1);

    // Nos melhores lances: no topo, "marcado por você", com os três canais, e marcado.
    await p.waitForFunction(() => /marcado por você/.test(document.querySelector('#melhoresLista li')?.textContent || ''),
      null, { timeout: 5000 });
    const topo = p.locator('#melhoresLista li').first();
    for (const c of CANAIS) assert.match(await topo.locator('.melhorCanais').innerText(), new RegExp(c));
    assert.equal(await topo.locator('.melhorCanais b').innerText(), 'tchubi', 'o ângulo em foco abre primeiro');
    assert.equal(await topo.locator('button[data-acao="marcar"]').getAttribute('aria-pressed'), 'true');
    // Guardado como os outros lances marcados: na lista deste evento e na sessão.
    const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('povix.melhores')));
    assert.ok(Object.values(guardado).some((g) => g.m.some((x) => Array.isArray(x.c) && x.c.length === 3)));
    await p.waitForTimeout(700);
    // A sessão vai em base64, como no link de compartilhar.
    const sessao = await p.evaluate(() => decodeURIComponent(escape(atob(localStorage.getItem('replay')))));
    assert.match(sessao, /"origem":"aovivo"/);
    await p.screenshot({ path: `${FOTOS}aovivo-marcado.png` });
    // A lista dos melhores está no mapa do evento, por baixo do vídeo aberto.
    await p.click('#mostrarMapa');
    await topo.waitFor({ state: 'visible', timeout: 10000 });
    await topo.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${FOTOS}aovivo-melhores.png` });
    assert.deepEqual(erros, []);
    await p.close();
  });

test('sem ninguém ao vivo, o botão não aparece e a tecla diz porquê', { ...semNavegador, timeout: 60_000 }, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
  assert.equal(await p.locator('#marcarAoVivo').isVisible(), false);
  await p.keyboard.press('v');
  await p.waitForTimeout(150);
  assert.equal((await marcasAoVivo(p)).length, 0);
  assert.match(await p.locator('#estadoAoVivo').innerText(), /Nenhum ângulo ao vivo aberto/);
  assert.deepEqual(erros, []);
  await p.close();
});
