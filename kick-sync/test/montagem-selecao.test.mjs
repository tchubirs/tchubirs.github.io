// "Exportar montagem" e a seleção (QA-REAL.md, 12/10): com 2 de 8 kills marcadas na caixa, exportava as 8.
// Agora exporta só as marcadas e o botão diz quantas; e "Um vídeo só" junta os clipes num MP4.
//
// Os pedaços de 1080p60 são um pedaço verdadeiro da Kick (probes/fixtures/segmento-kodd.ts) com o relógio
// do TS empurrado para a frente a cada número, para o vídeo seguir de pedaço em pedaço como na Kick.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { pedacoNumero } from './pedaco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function preparar(p) {
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.route('**/1080p60/*.ts', (rota) => {
    const n = Number(rota.request().url().match(/(\d+)\.ts$/)[1]);
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: pedacoNumero(n) });
  });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
  for (let i = 0; i < 3; i++) {
    await p.click('#mais1m');
    await p.click('#marcarKill');
  }
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 3, null, { timeout: 10000 });
}

/** A duração (mvhd) de um ficheiro da fila, lida dentro da página. */
const duracaoDoMp4 = (p, i = 0) => p.evaluate(async (k) => {
  const a = document.querySelectorAll('#fila a')[k];
  const b = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
  const d = new DataView(b.buffer);
  for (let o = 0; o + 8 < b.length;) {
    const n = d.getUint32(o);
    const tipo = String.fromCharCode(...b.subarray(o + 4, o + 8));
    if (tipo === 'moov') { o += 8; continue; }
    if (tipo === 'mvhd') return { nome: a.download, s: d.getUint32(o + 24) / d.getUint32(o + 20) };
    o += n;
  }
  return { nome: a.download, s: -1 };
}, i);

test('a montagem exporta só as kills marcadas, em MP4 com 7 s cada, e o botão diz quantas', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p);
  assert.match(await p.locator('#baixarMontagem').innerText(), /Exportar montagem/);
  const pegas = p.locator('#listaMomentos li[data-ms] .pega');
  await pegas.nth(0).check();
  await pegas.nth(2).check();
  assert.match(await p.locator('#baixarMontagem').innerText(), /Exportar 2 selecionadas/);
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => !window.__estado.montagem && document.querySelectorAll('#fila a').length >= 1, null, { timeout: 30000 });
  const nomes = await p.locator('#fila a').evaluateAll((as) => as.map((a) => a.download));
  assert.equal(nomes.length, 2, `saíram ${nomes.join(', ')}`);
  assert.ok(nomes.every((n) => n.endsWith('.mp4')), nomes.join(', '));
  assert.ok(nomes.some((n) => n.startsWith('01')) && nomes.some((n) => n.startsWith('03')), 'a 1.ª e a 3.ª, com o número da montagem inteira');
  for (let i = 0; i < 2; i++) assert.equal((await duracaoDoMp4(p, i)).s, 7, 'o pedido: 5 s antes e 2 s depois');
  assert.deepEqual(erros, []);
  await p.close();
});

test('"Um vídeo só" junta as kills marcadas num MP4, pela ordem', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p);
  const pegas = p.locator('#listaMomentos li[data-ms] .pega');
  await pegas.nth(1).check();
  await pegas.nth(2).check();
  await p.selectOption('#formatoMontagem', '16x9-um');
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => !window.__estado.montagem && document.querySelectorAll('#fila a').length >= 1, null, { timeout: 30000 });
  const nomes = await p.locator('#fila a').evaluateAll((as) => as.map((a) => a.download));
  assert.equal(nomes.length, 1, `saíram ${nomes.join(', ')}`);
  assert.match(nomes[0], /^montagem-\d{4}-\d\d-\d\d\.mp4$/);
  assert.equal((await duracaoDoMp4(p)).s, 14, 'dois clipes de 7 s');
  assert.match(await p.locator('#fila li').first().innerText(), /2 clipes em sequência, 14\.0 s/);
  assert.equal(await p.locator('#zip a').count(), 0, 'sem ZIP: é um ficheiro só');
  assert.deepEqual(erros, []);
  await p.close();
});
