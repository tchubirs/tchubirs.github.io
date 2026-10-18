// Gancho nos 2 s (SUBSTITUIR-CONECTORES.md, item 1): o download do momento abre com ~2 s do pico e depois segue do
// começo do contexto até ao fim. No 16:9 são duas entradas na lista de edição do MP4, sem reconverter; no 9:16 são
// duas gravações juntas. Sem pico confiável (chat, público, id sem instante), não há gancho nem botão.
//
// Os pedaços são o pedaço verdadeiro da Kick (probes/fixtures/segmento-kodd.ts) com o relógio empurrado (pedaco.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { pedacoNumero } from './pedaco.mjs';
import { lerTs, recortar, juntarMp4 } from '../site/mp4.js';
import { picoDoMomento, ganchoDoMomento } from '../site/momento-baixar.js';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const T = Date.parse('2026-10-16T22:00:00Z');
const VOD = '61cce35c-5f6b-42a0-96b0-2fa2efdbdd19';
const CLIPE = 'clip_01M53Z0NWY3MERGEYA5WAZGTHN';
const texto = (pt) => ({ pt, en: `${pt} (en)`, es: `${pt} (es)` });

/** Duração do filme (mvhd) e entradas da lista de edição do vídeo, lidas das caixas do MP4. */
function lerMp4(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const dentro = (de, ate, tipo) => {
    for (let o = de; o + 8 <= ate;) {
      const n = dv.getUint32(o);
      if (String.fromCharCode(...b.subarray(o + 4, o + 8)) === tipo) return { o, fim: o + n };
      o += n;
    }
    return null;
  };
  const moov = dentro(0, b.length, 'moov');
  const mvhd = dentro(moov.o + 8, moov.fim, 'mvhd');
  const trak = dentro(moov.o + 8, moov.fim, 'trak');
  const edts = dentro(trak.o + 8, trak.fim, 'edts');
  const elst = dentro(edts.o + 8, edts.fim, 'elst');
  const n = dv.getUint32(elst.o + 12);
  const entradas = Array.from({ length: n }, (_, i) => dv.getUint32(elst.o + 16 + i * 12));
  return { s: dv.getUint32(mvhd.o + 24) / dv.getUint32(mvhd.o + 20), entradas };
}

test('gancho: só com pico confiável, longe do começo e dentro do momento', () => {
  const base = { inicioMs: T, fimMs: T + 30_000 };
  // O id dos achados do Povix traz o pico do som; os do chat e do público, não.
  assert.equal(picoDoMomento({ ...base, id: `kodd-${T + 12_000}`, origem: 'povix' }), T + 12_000);
  assert.equal(picoDoMomento({ ...base, id: `kodd-${T + 12_000}`, origem: 'chat' }), null);
  assert.equal(picoDoMomento({ ...base, id: `kodd-${T + 12_000}`, origem: 'publico' }), null);
  assert.equal(picoDoMomento({ ...base, id: 'barco', origem: 'povix' }), null);
  // `picoMs` explícito manda, em qualquer origem.
  assert.equal(picoDoMomento({ ...base, id: 'x', origem: 'chat', picoMs: T + 9000 }), T + 9000);
  assert.deepEqual(ganchoDoMomento({ ...base, picoMs: T + 12_000 }), { deMs: T + 11_000, ateMs: T + 13_000 });
  assert.equal(ganchoDoMomento({ ...base, picoMs: T + 2000 }), null, 'colado ao começo: o vídeo já abre nele');
  assert.equal(ganchoDoMomento({ ...base, picoMs: T + 31_000 }), null, 'depois do fim');
  assert.deepEqual(ganchoDoMomento({ ...base, picoMs: T + 29_500 }), { deMs: T + 28_000, ateMs: T + 30_000 }, 'colado ao fim: os 2 s que acabam nele');
});

test('gancho: um trecho de mais tarde à frente do momento, num MP4 só, sem reconverter', () => {
  const ts = lerTs(pedacoNumero(0));
  const gancho = recortar(ts, { inicioMs: 0, deMs: 9000, ateMs: 11_000 });
  const momento = recortar(ts, { inicioMs: 0, deMs: 1000, ateMs: 8000 });
  const { bytes, duracaoS } = juntarMp4([gancho, momento]);
  assert.equal(duracaoS, 9);
  assert.deepEqual(lerMp4(bytes), { s: 9, entradas: [2000, 7000] });
});

const BARCO = {
  id: 'barco', canal: 'axel', origem: 'povix', inicioMs: T, fimMs: T + 20_000, uuid: VOD, aosS: 30, picoMs: T + 12_000,
  resumo: texto('Atropela alguém com o barco'), potencial: 82,
};
const MOMENTOS = {
  evento: 'Teste',
  momentos: [
    BARCO,
    { id: 'minita', canal: 'kodd', origem: 'publico', inicioMs: T + 3_600_000, fimMs: T + 3_641_000, clipe: CLIPE,
      resumo: texto('Piada da minita'), potencial: 95 },
    { id: 'canhao', canal: 'axel', origem: 'povix', inicioMs: T + 600_000, fimMs: T + 660_000, uuid: VOD, aosS: 630,
      resumo: texto('Acerta o canhão'), potencial: 60 },
  ],
};

async function preparar(p, dados = MOMENTOS) {
  await kickFalsa(p, { canais: ['axel'] });
  await p.route('**/hls-*.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Hls=function(){};window.Hls.isSupported=function(){return false;};' }));
  await p.route('**/eventos/teste-momentos.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dados) }));
  await p.route('**/api/v1/video/*', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ source: 'https://stream.kick.com/falsa/axel/master.m3u8' }) }));
  await p.route(/stream\.kick\.com\/falsa\/.*\/(\d+)\.ts$/, (r) => r.fulfill({
    status: 200, contentType: 'video/mp2t', body: pedacoNumero(Number(r.request().url().match(/(\d+)\.ts$/)[1])),
  }));
  await p.goto(`http://127.0.0.1:${PORTA}/momentos.html?e=teste`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
}

// Tocar e gravar o vídeo pede H.264, que o Chromium do CI não tem (fotos-cartoes.test.mjs faz o mesmo).
const tocaH264 = (p) => p.evaluate(() => Boolean((window.MediaSource || window.ManagedMediaSource)?.isTypeSupported?.('video/mp4; codecs="avc1.64001f,mp4a.40.2"')));

async function baixarDeitado(p) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.locator('.mom[data-id="barco"] [data-baixar="deitado"]').click()]);
  await p.waitForFunction(() => /Pronto/.test(document.querySelector('.mom[data-id="barco"] .momBaixando').textContent));
  return { nome: d.suggestedFilename(), ...lerMp4(new Uint8Array(fs.readFileSync(await d.path()))) };
}

test('gancho: o botão aparece só onde há pico, vem ligado, vale para todos e fica lembrado', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  const dados = { ...MOMENTOS, momentos: [...MOMENTOS.momentos, { ...BARCO, id: 'barco2', picoMs: T + 14_000 },
    { ...MOMENTOS.momentos[1], id: 'minita2', picoMs: T + 3_610_000 }] };
  await preparar(p, dados);
  const caixa = (id) => p.locator(`.mom[data-id="${id}"] [data-gancho]`);
  assert.equal(await caixa('minita').count(), 0, 'clipe do público: sem pico');
  assert.equal(await caixa('minita2').count(), 0, 'só o clipe, sem VOD: o relógio do clipe não se sabe');
  assert.equal(await caixa('canhao').count(), 0, 'achado sem instante no id: sem pico');
  assert.equal(await caixa('barco').isChecked(), true);
  assert.equal(await p.locator('.mom[data-id="barco"] .momGancho').innerText(), 'Abrir com o lance (2 s)');
  await caixa('barco').uncheck();
  assert.equal(await caixa('barco2').isChecked(), false, 'a escolha vale para todos os cartões');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#listaMomentos .mom');
  assert.equal(await caixa('barco').isChecked(), false, 'lembrada neste aparelho');
  await p.selectOption('#idioma', 'es');
  assert.equal(await p.locator('.mom[data-id="barco"] .momGancho').innerText(), 'Abrir con la jugada (2 s)');
  assert.deepEqual(erros, []);
});

test('gancho: o 16:9 abre com os 2 s do pico e segue do começo; desligado, sai o corte de sempre', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  await preparar(p);
  // Janela no tempo do vídeo: 30 − 3 = 27 s até 50 s (23 s). Pico em 30 + 12 = 42 s → gancho de 41 a 43 s.
  const com = await baixarDeitado(p);
  assert.match(com.nome, /^axel-\d{8}-\d{4}\.mp4$/);
  assert.deepEqual({ s: com.s, entradas: com.entradas }, { s: 25, entradas: [2000, 23_000] });
  await p.locator('.mom[data-id="barco"] [data-gancho]').uncheck();
  const sem = await baixarDeitado(p);
  assert.deepEqual({ s: sem.s, entradas: sem.entradas }, { s: 23, entradas: [23_000] });
  assert.deepEqual(erros, []);
});

test('gancho: o Chrome toca o 16:9 com o gancho à frente (a lista de edição é respeitada)', semNavegador, async (t) => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  await preparar(p);
  if (!await tocaH264(p)) { t.skip('o navegador não toca H.264'); return; }
  const r = await p.evaluate(async (m) => {
    const { cortarMomento } = await import('./momento-baixar.js');
    const com = await cortarMomento(m, { comGancho: true });
    const sem = await cortarMomento(m, {});
    const quadro = async (blob, s) => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(blob);
      await new Promise((ok) => { v.onloadeddata = ok; });
      v.currentTime = s;
      await new Promise((ok) => { v.onseeked = ok; });
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    };
    const dif = (a, b) => { let t = 0; for (let i = 0; i < a.length; i += 4) t += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]); return t / (a.length / 2); };
    // O gancho está em 14..16 s do corte sem ele; com ele, em 0..2 s, e o começo do corte passa para 2 s.
    const [c05, c35, s145, s15, s05] = await Promise.all([[com, 0.55], [com, 3.55], [sem, 14.55], [sem, 1.55], [sem, 0.55]].map(([b, s]) => quadro(b.blob, s)));
    return { gancho: sem.gancho, comGancho: com.comGancho, igualGancho: dif(c05, s145), igualDepois: dif(c35, s15), diferente: dif(c05, s05) };
  }, BARCO);
  assert.equal(r.comGancho, true);
  assert.deepEqual(r.gancho, { deS: 14, ateS: 16 });
  assert.ok(r.diferente > 4, `os quadros de comparação tinham de diferir (${r.diferente})`);
  assert.ok(r.igualGancho < r.diferente / 4, `o começo não é o pico: ${JSON.stringify(r)}`);
  assert.ok(r.igualDepois < r.diferente / 4, `depois do gancho não segue do começo: ${JSON.stringify(r)}`);
  assert.deepEqual(erros, []);
});

test('gancho: o 9:16 grava o pico à frente e junta as duas gravações num arquivo', semNavegador, async (t) => {
  const { p, erros } = await abrir({ caminho: null, modo: null, ecra: { width: 400, height: 860 } });
  // Rosto já guardado: o teste não espera o detector. Momento curto (a gravação é em tempo real): 27..36 s,
  // pico em 35 s → gancho de 34 a 36 s.
  await p.addInitScript(() => localStorage.setItem('replay.rostos', JSON.stringify({ axel: { x: 0.02, y: 0.6, largura: 0.2, altura: 0.35 } })));
  const curto = { ...BARCO, fimMs: T + 6000, picoMs: T + 5000 };
  await preparar(p, { ...MOMENTOS, momentos: [curto] });
  if (!await tocaH264(p)) { t.skip('o navegador não toca H.264'); return; }
  const totais = [];
  const [d] = await Promise.all([
    p.waitForEvent('download', { timeout: 120_000 }),
    (async () => {
      await p.locator('.mom[data-id="barco"] [data-baixar="tiktok"]').click();
      await p.waitForFunction(() => /de 11 s/.test(document.querySelector('.mom[data-id="barco"] .momBaixando').textContent), null, { timeout: 60_000 });
      totais.push(await p.locator('.mom[data-id="barco"] .momBaixando').textContent());
    })(),
  ]);
  assert.match(d.suggestedFilename(), /^axel-\d{8}-\d{4}-tiktok\.(mp4|webm)$/);
  const bytes = fs.readFileSync(await d.path());
  const duracaoS = await p.evaluate(async (b64) => {
    const { juntarGravados } = await import('./juntar-gravados.js');
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return juntarGravados([u8]).duracaoS;
  }, bytes.toString('base64'));
  assert.ok(Math.abs(duracaoS - 11) < 0.6, `o 9:16 dura ${duracaoS} s, e não 2 + 9`);
  assert.match(totais[0], /Montando o vertical/);
  assert.deepEqual(erros, []);
});
