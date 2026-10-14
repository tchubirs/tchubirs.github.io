// O prazo do VOD e o "Guardar todos agora" (IDEIAS.md, item 7).
//
// A Kick apaga o VOD 7 dias depois da live, ou 30 nos canais verificados. Cada faixa diz quando o dela
// some, e a Montagem baixa a cópia rápida de todos os lances, os que somem primeiro à frente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer, saltarTempo } from './palco.mjs';
import { pedacoNumero } from './pedaco.mjs';
import {
  retencaoDoCanal, prazoDoVod, ordemDeGuardar, DIA_MS, RETENCAO_PADRAO, RETENCAO_VERIFICADO,
} from '../site/prazo.js';

test('sem prova na lista, o canal guarda 7 dias; com um VOD 8 dias mais velho que o mais novo, 30', () => {
  assert.deepEqual(retencaoDoCanal([]), { dias: RETENCAO_PADRAO, visto: false });
  assert.deepEqual(retencaoDoCanal(undefined), { dias: 7, visto: false });
  assert.deepEqual(retencaoDoCanal([{ inicioApi: T }]), { dias: 7, visto: false });
  // 7 dias e meio entre o mais velho e o mais novo: pode ser só a hora a que a Kick apaga.
  assert.deepEqual(retencaoDoCanal([{ inicioApi: T }, { inicioApi: T + 7.5 * DIA_MS }]), { dias: 7, visto: false });
  assert.deepEqual(retencaoDoCanal([{ inicioApi: T + 9 * DIA_MS }, { inicioApi: T }, { inicioApi: null }]),
    { dias: RETENCAO_VERIFICADO, visto: true });
});

test('o prazo conta desde o início da live, arredonda para cima e não existe para a live no ar', () => {
  const vod = { inicioApi: T };
  assert.deepEqual(prazoDoVod(vod, { agoraMs: T + 2 * DIA_MS }), { expiraMs: T + 7 * DIA_MS, dias: 5, retencaoDias: 7 });
  // 30 horas pela frente são 2 dias, e não 1.
  assert.equal(prazoDoVod(vod, { agoraMs: T + 7 * DIA_MS - 30 * 3600e3 }).dias, 2);
  assert.equal(prazoDoVod(vod, { agoraMs: T + 8 * DIA_MS }).dias, -1);
  assert.equal(prazoDoVod(vod, { retencaoDias: 30, agoraMs: T + DIA_MS }).dias, 29);
  assert.equal(prazoDoVod({ inicioApi: T, aoVivo: true }, { agoraMs: T }), null);
  assert.equal(prazoDoVod({ inicioApi: null }, { agoraMs: T }), null);
  assert.equal(prazoDoVod(null), null);
});

test('guardar: o que some primeiro vai primeiro, o sem prazo no fim, o empate na ordem de chegada', () => {
  const itens = [{ n: 1, e: 30 }, { n: 2, e: null }, { n: 3, e: 5 }, { n: 4, e: 30 }, { n: 5, e: 2 }];
  assert.deepEqual(ordemDeGuardar(itens, (x) => x.e).map((x) => x.n), [5, 3, 1, 4, 2]);
  assert.deepEqual(ordemDeGuardar(null, () => 0), []);
});

// ── na página ──────────────────────────────────────────────────────────────────────────────────────

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

// Dez noites, um dia entre elas. O `tchubi` tem a noite 0 e a 9: o VOD de 9 dias atrás prova que guarda
// 30. O `outro` só tem a 9, e conta 7. O relógio da página fica 2 dias depois da noite 9.
const NOITE9 = T + 9 * DIA_MS;
const AGORA = NOITE9 + 2 * DIA_MS + 3600e3;

async function preparar(p, { lento = 0 } = {}) {
  await kickFalsa(p, {
    canais: ['tchubi', 'outro'],
    noites: 10,
    canaisPorNoite: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, i === 0 ? ['tchubi'] : i === 9 ? ['tchubi', 'outro'] : []])),
  });
  await p.route('**/1080p60/*.ts', async (rota) => {
    if (lento) await new Promise((k) => setTimeout(k, lento));
    const n = Number(rota.request().url().match(/(\d+)\.ts$/)[1]);
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: pedacoNumero(n) });
  });
  await p.addInitScript((agora) => {
    const real = Date.now.bind(Date);
    const desvio = agora - real();
    Date.now = () => real() + desvio;
  }, AGORA);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('#faixas .faixa').length === 2, null, { timeout: 20000 });
}

/** Duas kills: a 1.ª na POV do tchubi (30 dias), a 2.ª na do outro (7 dias). */
async function marcarDuas(p) {
  for (const quem of ['tchubi', 'outro']) {
    await saltarTempo(p, 60_000);
    await p.evaluate((q) => { window.__estado.focos = [q]; }, quem);
    await p.click('#marcarKill');
  }
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 2, null, { timeout: 10000 });
}

test('cada faixa diz quando o VOD some, com a conta explicada no title', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p);
  const faixa = (s) => p.locator(`#faixas .faixa[data-slug="${s}"] .prazoFaixa`);
  assert.equal(await faixa('outro').innerText(), 'some em 5 dias');
  assert.equal(await faixa('tchubi').innerText(), 'some em 28 dias');
  assert.match(await faixa('outro').getAttribute('title'), /7 dias desde o início da live.*verificados guardam 30/);
  assert.match(await faixa('tchubi').getAttribute('title'), /30 dias.*mais de 7 dias/);
  // Clicar no aviso não leva o vídeo para o fim do trilho.
  const antes = await p.evaluate(() => window.__estado.agoraMs);
  await faixa('outro').click();
  assert.equal(await p.evaluate(() => window.__estado.agoraMs), antes);
  assert.deepEqual(erros, []);
  await p.close();
});

test('"Guardar todos agora" baixa a cópia rápida de todos, os que somem primeiro à frente, e dá o ZIP', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p);
  await marcarDuas(p);
  const lis = p.locator('#listaMomentos li[data-ms]');
  assert.equal(await lis.nth(0).locator('.prazo').innerText(), 'some em 28 dias');
  assert.equal(await lis.nth(1).locator('.prazo').innerText(), 'some em 5 dias');
  assert.equal(await p.locator('#prazoMontagem').innerText(), 'O primeiro some em 5 dias (outro).');
  // A seleção não conta: guardar é para todas.
  await lis.nth(0).locator('.pega').check();
  await p.click('#guardarLances');
  await p.waitForFunction(() => !window.__estado.montagem && document.querySelectorAll('#fila a').length >= 2, null, { timeout: 30000 });
  const nomes = await p.locator('#fila a').evaluateAll((as) => as.map((a) => a.download));
  assert.equal(nomes.length, 2, nomes.join(', '));
  assert.match(nomes[0], /^02a?_outro.*\.mp4$/, 'o outro some primeiro e vai primeiro');
  assert.match(nomes[1], /^01a?_tchubi.*\.mp4$/);
  assert.equal(await p.locator('#zip a').count(), 1, 'os dois num ZIP');
  assert.match(await p.locator('#estadoMontagem').innerText(), /2\/2/);
  assert.equal(await p.locator('#guardarLances').innerText(), 'Guardar todos agora');
  assert.deepEqual(erros, []);
  await p.close();
});

test('guardar mostra o progresso e para no meio com o mesmo botão', semNavegador, async () => {
  const { p, erros } = await abrir();
  await preparar(p, { lento: 1500 });
  await marcarDuas(p);
  await p.click('#guardarLances');
  await p.waitForFunction(() => /1\/2: 02a? outro, some em 5 dias/.test(document.querySelector('#estadoMontagem').textContent), null, { timeout: 10000 });
  assert.equal(await p.locator('#guardarLances').innerText(), 'Parar');
  assert.equal(await p.locator('#guardarLances').isEnabled(), true);
  await p.click('#guardarLances');
  await p.waitForFunction(() => !window.__estado.montagem, null, { timeout: 15000 });
  assert.match(await p.locator('#estadoMontagem').innerText(), /^Parado: \d de 2 prontos/);
  assert.equal(await p.locator('#guardarLances').innerText(), 'Guardar todos agora');
  assert.deepEqual(erros, []);
  await p.close();
});
