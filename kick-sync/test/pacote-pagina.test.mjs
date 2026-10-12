// "Pacote" na Montagem (IDEIAS.md, item 6): o ZIP com o trecho de cada ângulo, o .fcpxml multicâmera e o
// texto. O XML é lido pelo DOMParser do Chromium (um leitor de XML de verdade) e os deslocamentos são
// conferidos contra o relógio da Kick de mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { pedacoNumero } from './pedaco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

/** Os ficheiros de um ZIP só guardado (sem compressão), como o zip.js os escreve. */
function lerZip(buf) {
  const b = Buffer.from(buf);
  const ficheiros = {};
  for (let o = 0; b.readUInt32LE(o) === 0x04034B50;) {
    const tamanho = b.readUInt32LE(o + 18);
    const n = b.readUInt16LE(o + 26);
    const extra = b.readUInt16LE(o + 28);
    const nome = b.subarray(o + 30, o + 30 + n).toString('utf8');
    ficheiros[nome] = b.subarray(o + 30 + n + extra, o + 30 + n + extra + tamanho);
    o += 30 + n + extra + tamanho;
  }
  return ficheiros;
}

async function preparar(p, { lento = 0 } = {}) {
  // O `outro` entra no ar 30 s depois do `tchubi`.
  await kickFalsa(p, { canais: ['tchubi', 'outro'], desviosS: { outro: 30 } });
  await p.route('**/1080p60/*.ts', async (rota) => {
    if (lento) await new Promise((k) => setTimeout(k, lento));
    const n = Number(rota.request().url().match(/(\d+)\.ts$/)[1]);
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: pedacoNumero(n) });
  });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('#faixas .faixa').length === 2, null, { timeout: 20000 });
}

test('o pacote do lance traz os dois ângulos, o .fcpxml alinhado e o texto', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p);
  // A kill às T+33 s na POV do tchubi: o clipe vai de T+28 a T+35. O outro entra no ar em T+30 no relógio
  // dele, e o atraso medido dele é de 1 s (o vídeo dele está 1 s à frente): no relógio comum, T+29.
  await p.evaluate((ms) => {
    window.__estado.focos = ['tchubi']; window.__estado.agoraMs = ms; window.__estado.nudges.outro = 1000;
  }, T + 33_000);
  await p.click('#marcarKill');
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 1, null, { timeout: 10000 });
  const ms = await p.evaluate(() => window.__estado.momentos[0].ms);
  assert.equal(ms, T + 33_000);
  assert.equal(await p.locator('#listaMomentos .pacoteUma').innerText(), 'Pacote');
  await p.click('#listaMomentos .pacoteUma');
  await p.waitForFunction(() => !window.__estado.montagem && document.querySelector('#fila a[download$=".zip"]'), null, { timeout: 30000 });
  const nome = await p.locator('#fila a').first().getAttribute('download');
  assert.match(nome, /^lance-01-\d{4}-\d\d-\d\d\.zip$/);
  assert.match(await p.locator('#fila li').first().innerText(), /2 ângulos, \.fcpxml e texto/);
  assert.match(await p.locator('#estadoMontagem').innerText(), /^Pacote pronto com 2 ângulos/);

  const bytes = await p.evaluate(async () => [...new Uint8Array(await (await fetch(document.querySelector('#fila a').href)).arrayBuffer())]);
  const zip = lerZip(Uint8Array.from(bytes));
  assert.deepEqual(Object.keys(zip).sort(), ['01_lance.fcpxml', '01_lance.txt', '01_outro.mp4', '01_tchubi.mp4']);
  assert.equal(zip['01_tchubi.mp4'].subarray(4, 8).toString('latin1'), 'ftyp');

  const xml = zip['01_lance.fcpxml'].toString('utf8');
  const lido = await p.evaluate((texto) => {
    const d = new DOMParser().parseFromString(texto, 'application/xml');
    if (d.querySelector('parsererror')) return { erro: d.querySelector('parsererror').textContent };
    const seg = (v) => { const m = String(v).match(/^(\d+)(?:\/(\d+))?s$/); return m ? Number(m[1]) / Number(m[2] || 1) : NaN; };
    return {
      raiz: d.documentElement.nodeName,
      versao: d.documentElement.getAttribute('version'),
      assets: [...d.querySelectorAll('resources > asset')].map((a) => ({
        id: a.id, nome: a.getAttribute('name'), dur: seg(a.getAttribute('duration')),
        src: a.querySelector('media-rep')?.getAttribute('src'),
      })),
      angulos: [...d.querySelectorAll('media > multicam > mc-angle')].map((a) => ({
        nome: a.getAttribute('name'), id: a.getAttribute('angleID'),
        ref: a.querySelector('asset-clip').getAttribute('ref'),
        offset: seg(a.querySelector('asset-clip').getAttribute('offset')),
        gap: a.querySelector('gap') ? seg(a.querySelector('gap').getAttribute('duration')) : 0,
      })),
      mcClip: d.querySelector('library > event > project > sequence > spine > mc-clip')?.getAttribute('ref'),
      media: d.querySelector('resources > media')?.id,
      ativo: d.querySelector('mc-clip > mc-source')?.getAttribute('angleID'),
    };
  }, xml);
  assert.equal(lido.erro, undefined, lido.erro);
  assert.equal(lido.raiz, 'fcpxml');
  assert.equal(lido.versao, '1.9');
  assert.equal(lido.mcClip, lido.media);
  assert.equal(lido.ativo, 'tchubi', 'abre no ângulo de quem marcou');
  assert.deepEqual(lido.angulos.map((a) => [a.nome, a.id]), [['tchubi', 'tchubi'], ['outro', 'outro']]);
  const asset = (id) => lido.assets.find((a) => a.id === id);
  const [tchubi, outro] = lido.angulos;
  assert.equal(asset(tchubi.ref).src, './01_tchubi.mp4');
  assert.equal(asset(outro.ref).src, './01_outro.mp4');
  // O tchubi cobre o clipe todo (7 s desde T+28); o outro começa 1 s depois, em T+29, e dura 6 s.
  assert.equal(tchubi.offset, 0);
  assert.equal(asset(tchubi.ref).dur, 7);
  assert.ok(Math.abs(outro.offset - 1) < 0.02, `outro a ${outro.offset} s`);
  assert.ok(Math.abs(outro.gap - outro.offset) < 1e-9);
  assert.ok(Math.abs(asset(outro.ref).dur - 6) < 0.1, `outro dura ${asset(outro.ref).dur} s`);

  const txt = zip['01_lance.txt'].toString('utf8');
  assert.match(txt, /^Lance 01 \(/);
  assert.match(txt, /1\. tchubi\r\n {3}Arquivo: 01_tchubi\.mp4\r\n {3}Começa às 21:00:28 UTC, 0\.00 s depois do primeiro ângulo/);
  assert.match(txt, /2\. outro\r\n {3}Arquivo: 01_outro\.mp4\r\n {3}Começa às 21:00:29 UTC, 1\.00 s depois/);
  assert.match(txt, /Atraso medido do canal: 1\.00 s/);
  assert.match(txt, /Link do VOD: a Kick não deu o endereço/, 'a Kick de mentira não tem uuid');
  assert.deepEqual(erros, []);
  await p.close();
});

test('o pacote para no meio com o Parar da montagem', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p, { lento: 1500 });
  await p.evaluate((ms) => { window.__estado.focos = ['tchubi']; window.__estado.agoraMs = ms; }, T + 60_000);
  await p.click('#marcarKill');
  await p.waitForSelector('#listaMomentos .pacoteUma');
  await p.click('#listaMomentos .pacoteUma');
  await p.waitForFunction(() => /Pacote: ângulo 1 de 2, tchubi/.test(document.querySelector('#estadoMontagem').textContent), null, { timeout: 10000 });
  assert.equal(await p.locator('#listaMomentos .pacoteUma').isDisabled(), true, 'um de cada vez');
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => !window.__estado.montagem, null, { timeout: 15000 });
  assert.match(await p.locator('#estadoMontagem').innerText(), /^Pacote parado/);
  assert.equal(await p.locator('#fila a[download$=".zip"]').count(), 0);
  assert.deepEqual(erros, []);
  await p.close();
});
