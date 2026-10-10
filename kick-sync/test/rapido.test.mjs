// A detecção mais rápida (o dono, 10/10: "Ouvindo kodd: 1/121, 0 MB", dez horas baixadas um segmento de
// cada vez): quatro pedidos no ar ao mesmo tempo, o Parar a meio, o modo esperto que ouve só em volta
// dos picos do chat, quanto falta, o aviso antes de ouvir muito, e o que já se ouviu não se baixa outra vez.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { varrerNoite, limitarPedidos } from '../site/procurar-momentos.js';
import { somDoCanal } from '../site/alinhar.js';
import { lerPlaylist } from '../site/kick.js';
import { linhaDoCanal } from '../site/relogio.js';
import { TAXA_TIROS as TAXA } from '../site/tiros.js';
import {
  janelasDosPicos, estimarFalta, tempoFalta, eMuito, msPorOuvir, faltaOuvir, somaMs,
} from '../site/ouvir.js';
import { t, definirIdioma } from '../site/idiomas.js';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { passo4Detetar } from './assistente.mjs';

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Um `buscar` falso que conta quantos pedidos estão no ar, e o máximo a que chegou. */
function buscarContando({ demoraMs = 15, corpo = () => new Uint8Array(100) } = {}) {
  const conta = { noAr: 0, maximo: 0, pedidos: [], depoisDoParar: 0, parado: false };
  conta.buscar = async (url, { signal } = {}) => {
    if (conta.parado) conta.depoisDoParar++;
    conta.pedidos.push(url);
    conta.noAr++;
    conta.maximo = Math.max(conta.maximo, conta.noAr);
    try {
      await new Promise((ok, mal) => {
        const r = setTimeout(ok, demoraMs);
        signal?.addEventListener('abort', () => { clearTimeout(r); mal(new DOMException('cancelado', 'AbortError')); }, { once: true });
      });
      const b = corpo(url);
      return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    } finally {
      conta.noAr--;
    }
  };
  return conta;
}

/** Um canal de verdade para o `somDoCanal`: uma playlist de `n` segmentos de 2 s a partir de `T0`. */
function canalDeSegmentos(n, T0 = Date.parse('2026-08-30T22:00:00Z')) {
  const l = ['#EXTM3U'];
  for (let i = 0; i < n; i++) {
    l.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(T0 + i * 2000).toISOString()}`, '#EXTINF:2.000,', `${String(i).padStart(2, '0')}.ts`);
  }
  const playlist = lerPlaylist(l.join('\n'), 'https://x.kick.com/v/160p30/playlist.m3u8');
  return { linha: linhaDoCanal('kodd', [{ vod: { id: 1 }, playlist }]), T0 };
}

// ── quatro ao mesmo tempo ──────────────────────────────────────────────────

test('o somDoCanal baixa até quatro segmentos ao mesmo tempo, e monta-os pela ordem', async () => {
  const SOM = new URL('../probes/fixtures/som/', import.meta.url).pathname;
  const fixtures = fs.existsSync(SOM) ? fs.readdirSync(SOM).filter((f) => f.endsWith('.ts')).sort() : [];
  const { linha, T0 } = canalDeSegmentos(Math.max(12, fixtures.length));
  // Os segmentos de verdade, quando a fixture existe: só se montam certo se a ordem for a da playlist.
  const conta = buscarContando({
    corpo: (url) => {
      const n = Number(url.match(/(\d+)\.ts$/)[1]);
      return fixtures[n] ? new Uint8Array(fs.readFileSync(SOM + fixtures[n])) : new Uint8Array(100);
    },
  });
  let bytes = 0;
  let recebido = null;
  await somDoCanal(linha, T0, 24, {
    buscar: conta.buscar,
    contador: (n) => { bytes += n; },
    descodificar: async (aac) => { recebido = aac; return new Float32Array(TAXA * 30); },
    taxa: TAXA,
  });
  assert.equal(conta.maximo, 4, `chegou a ${conta.maximo} no ar`);
  assert.equal(conta.pedidos.length, 12, 'cada segmento uma vez');
  assert.deepEqual(conta.pedidos.map((u) => Number(u.match(/(\d+)\.ts$/)[1])), [...Array(12).keys()], 'pedidos pela ordem');
  assert.ok(bytes > 0, 'os MB contam-se a cada segmento');
  if (fixtures.length) assert.ok(recebido?.length > 0, 'o som montado pela ordem dá AAC');
});

test('a varredura deixa no máximo quatro pedidos no ar, somados os bocados', async () => {
  const conta = buscarContando({ demoraMs: 10 });
  const Tn = Date.parse('2026-08-30T22:00:00Z');
  const comecou = Date.now();
  await varrerNoite({
    linha: { slug: 'kodd' },
    deMs: Tn,
    ateMs: Tn + 6 * 60_000,
    bocadoS: 60,
    buscar: conta.buscar,
    // Como o `somDoCanal`: cada bocado são trinta segmentos, todos pelo `buscar` que a varredura dá.
    lerSom: async (l, quandoMs, duracaoS, { buscar, sinal, paralelo }) => {
      let proximo = 0;
      const um = async () => { while (proximo < 30) { proximo++; await buscar(`s${quandoMs}-${proximo}`, { signal: sinal }); } };
      await Promise.all(Array.from({ length: paralelo }, um));
      return new Float32Array(Math.round(duracaoS * TAXA));
    },
  });
  assert.equal(conta.pedidos.length, 180);
  assert.ok(conta.maximo <= 4, `${conta.maximo} pedidos ao mesmo tempo`);
  assert.equal(conta.maximo, 4, 'e chega aos quatro');
  // Um de cada vez seriam 180 x 10 ms; com quatro, um quarto disso (mais a conta do som).
  assert.ok(Date.now() - comecou < 180 * 10, `levou ${Date.now() - comecou} ms`);
});

test('o limite de pedidos larga a fila quando se manda parar', async () => {
  const conta = buscarContando({ demoraMs: 50 });
  const limitado = limitarPedidos(conta.buscar, 4);
  const c = new AbortController();
  const todos = Array.from({ length: 10 }, (_, i) => limitado(`u${i}`, { signal: c.signal }).catch((e) => e.name));
  await dormir(5);
  assert.equal(conta.noAr, 4);
  c.abort();
  conta.parado = true;
  const r = await Promise.all(todos);
  assert.ok(r.every((x) => x === 'AbortError'), JSON.stringify(r));
  assert.equal(conta.pedidos.length, 4, 'os que esperavam na fila não chegaram a pedir');
  assert.equal(conta.depoisDoParar, 0);
});

test('Parar a meio da varredura: nenhum pedido novo, e o que já se ouviu fica na memória', async () => {
  const conta = buscarContando({ demoraMs: 5 });
  const Tn = Date.parse('2026-08-30T22:00:00Z');
  const c = new AbortController();
  const memoria = new Map();
  let bocados = 0;
  await assert.rejects(varrerNoite({
    linha: { slug: 'kodd' },
    deMs: Tn,
    ateMs: Tn + 3600_000,
    bocadoS: 300,
    sinal: c.signal,
    memoria,
    buscar: conta.buscar,
    lerSom: async (l, quandoMs, duracaoS, { buscar, sinal }) => {
      bocados++;
      for (let i = 0; i < 8; i++) await buscar(`s${quandoMs}-${i}`, { signal: sinal });
      if (bocados === 3) { c.abort(); conta.parado = true; }
      return new Float32Array(Math.round(duracaoS * TAXA));
    },
  }), (e) => e.name === 'AbortError');
  await dormir(30);
  assert.equal(conta.depoisDoParar, 0, 'pediu depois do Parar');
  assert.ok(bocados <= 4, `${bocados} bocados`);
  // Os bocados que acabaram antes do Parar ficaram guardados: a próxima vez não se baixam.
  const guardados = memoria.get('kodd') || [];
  assert.ok(guardados.length >= 1, 'nada ficou guardado');
});

// ── não repetir ────────────────────────────────────────────────────────────

/** Som com tiroteios onde se mandar (a forma do de procurar-momentos.test.mjs). */
function somComRajadas(segundos, emS = [], semente = 3) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const x = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.01;
  for (const t of emS) {
    for (let d = 0; d < 4500; d += 110) {
      const i = Math.round((t + d / 1000) * TAXA);
      for (let j = 0; j < 3000 && i + j < x.length; j++) if (i + j >= 0) x[i + j] += (rnd() * 2 - 1) * Math.exp(-j / 900);
    }
  }
  return x;
}

test('o que já foi ouvido não se baixa outra vez, e dá o mesmo resultado', async () => {
  const Tn = Date.parse('2026-08-30T22:00:00Z');
  const som = somComRajadas(960, [200, 500, 800]);
  const pedidos = [];
  const lerSom = async (l, quandoMs, duracaoS) => {
    pedidos.push([(quandoMs - Tn) / 1000, duracaoS]);
    const de = Math.round(((quandoMs - Tn) / 1000) * TAXA);
    return som.subarray(de, de + Math.round(duracaoS * TAXA));
  };
  const memoria = new Map();
  const base = { linha: { slug: 'kodd' }, deMs: Tn, ateMs: Tn + 900_000, bocadoS: 300, lerSom, memoria };
  const r1 = await varrerNoite(base);
  assert.equal(pedidos.length, 3);
  const r2 = await varrerNoite(base);
  assert.equal(pedidos.length, 3, 'a segunda vez não pediu nada');
  assert.deepEqual(r2.candidatos.map((c) => c.ms), r1.candidatos.map((c) => c.ms));
  assert.equal(r2.reaproveitadoMs, 900_000);
  assert.equal(r2.bytes, 0);

  // Um trecho que passa do que se ouviu: só o pedaço novo vai à rede.
  const r3 = await varrerNoite({ ...base, ateMs: Tn + 1200_000 });
  assert.deepEqual(pedidos.slice(3), [[900, 300]], JSON.stringify(pedidos));
  assert.equal(r3.reaproveitadoMs, 900_000);
  // Um trecho dentro do que já se ouviu: nada.
  await varrerNoite({ ...base, deMs: Tn + 100_000, ateMs: Tn + 400_000 });
  assert.equal(pedidos.length, 4);
  // Outro filtro (as explosões) precisa de outra medida: esse sim volta a ouvir.
  await varrerNoite({ ...base, filtros: { tiros: true, explosoes: true } });
  assert.equal(pedidos.length, 7);
});

// ── o modo esperto ─────────────────────────────────────────────────────────

test('o modo esperto ouve só em volta dos picos do chat', async () => {
  const Tn = Date.parse('2026-08-30T22:00:00Z');
  const picos = [{ ms: Tn + 30 * 60_000 }, { ms: Tn + 31 * 60_000 }, { ms: Tn + 4 * 3600_000 }];
  const janelas = janelasDosPicos(picos, Tn, Tn + 10 * 3600_000);
  // Três minutos antes e um depois de cada um, juntos quando se tocam.
  assert.deepEqual(janelas, [
    [Tn + 27 * 60_000, Tn + 32 * 60_000],
    [Tn + 4 * 3600_000 - 3 * 60_000, Tn + 4 * 3600_000 + 60_000],
  ]);
  const pedidos = [];
  const r = await varrerNoite({
    linha: { slug: 'kodd' },
    deMs: Tn,
    ateMs: Tn + 10 * 3600_000,
    intervalos: janelas,
    bocadoS: 300,
    lerSom: async (l, quandoMs, duracaoS) => {
      pedidos.push([(quandoMs - Tn) / 60_000, duracaoS / 60]);
      return somComRajadas(duracaoS, [60]);
    },
  });
  assert.deepEqual(pedidos, [[27, 5], [237, 4]], 'só os minutos em volta dos picos');
  assert.deepEqual(r.cobertura, janelas, 'e diz o que ouviu');
  // Os achados ficam no sítio certo do relógio da noite.
  for (const c of r.candidatos) assert.ok(janelas.some(([a, b]) => c.ms >= a && c.ms < b), `${(c.ms - Tn) / 60_000} min`);
  assert.ok(r.candidatos.length >= 1);
});

test('o que falta ouvir, e quando é muito', () => {
  const H = 3600_000;
  assert.deepEqual(faltaOuvir(0, 10 * H, [[H, 2 * H], [5 * H, 6 * H]]), [[0, H], [2 * H, 5 * H], [6 * H, 10 * H]]);
  assert.equal(msPorOuvir([[0, 10 * H]], [[H, 2 * H]]), 9 * H);
  assert.equal(somaMs([[0, H], [H / 2, 2 * H]]), 2 * H);
  assert.ok(eMuito(10 * H, 1200));
  assert.ok(eMuito(H, 400), 'trezentos MB chegam');
  assert.ok(!eMuito(H, 120), 'uma hora a 160p não pergunta');
});

test('quanto falta, pela velocidade medida', () => {
  // Nos primeiros segundos não há medida: não se inventa um número.
  assert.equal(estimarFalta({ feitoMs: 0, restoMs: 3600_000, decorridoMs: 1000 }), null);
  // Uma hora de live ouvida em cinco minutos: as nove que faltam levam uns 45 min.
  const falta = estimarFalta({ feitoMs: 3600_000, restoMs: 9 * 3600_000, decorridoMs: 5 * 60_000 });
  assert.equal(falta, 45 * 60_000);
  assert.equal(tempoFalta(falta), '45 min');
  // Antes do primeiro bocado acabar, os bytes já chegados contam (280 kbps).
  const pelosBytes = estimarFalta({ feitoMs: 0, restoMs: 600_000, bytes: 35 * 60_000, decorridoMs: 30_000 });
  assert.equal(pelosBytes, 300_000);
  assert.equal(tempoFalta(12.4 * 60_000), '12 min');
  assert.equal(tempoFalta(130 * 60_000), '2 h 10');
  assert.equal(tempoFalta(20_000), '1 min');
  assert.equal(estimarFalta({ restoMs: 0 }), 0);
});

test('o aviso e o progresso nas três línguas, sem travessão nem ponto do meio', () => {
  const frases = {
    pt: ['São 10 h de live, uns 1202 MB. Melhor no Wi-Fi.', 'Ouvindo kodd: 2 h 10 de 10 h, 85 MB, faltam uns 12 min'],
    en: ['That is 10 h of live, about 1202 MB. Better on Wi-Fi.', 'Listening to kodd: 2 h 10 of 10 h, 85 MB, about 12 min left'],
    es: ['Son 10 h en vivo, unos 1202 MB. Mejor con wifi.', 'Escuchando a kodd: 2 h 10 de 10 h, 85 MB, faltan unos 12 min'],
  };
  for (const [l, [aviso, progresso]] of Object.entries(frases)) {
    definirIdioma(l);
    assert.equal(t('rapido.aviso', { horas: '10 h', mb: 1202 }), aviso);
    assert.equal(t('rapido.aOuvir', { canal: 'kodd', feito: '2 h 10', total: '10 h', mb: 85 }) + t('rapido.falta', { tempo: '12 min' }), progresso);
    for (const k of ['aviso', 'aOuvir', 'falta', 'esperto', 'semPicos', 'semPicosTodos', 'continuar', 'ouvirTudo', 'cancelado', 'parado', 'aLerPicos']) {
      const f = t(`rapido.${k}`);
      assert.doesNotMatch(f, /[\u2014\u2013\u00b7]/, `${l} rapido.${k}`);
      assert.doesNotMatch(f.replace(/\bMB\b/g, ''), /\b[A-ZÁÉÍÓÚ]{2,}\b/, `${l} rapido.${k}`);
    }
  }
  definirIdioma('pt');
});

// ── na página ──────────────────────────────────────────────────────────────

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const comNavegador = { skip: !podeCorrer && 'sem navegador' };

/** A varredura fingida (este Chromium não descodifica AAC): guarda os pedidos e acha um tiroteio por intervalo. */
async function varreduraFalsa(p) {
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      export function custoVarrerMB(ms) { return Math.round(((ms / 1000) * 280000) / 8 / 1048576); }
      export async function varrerNoite(o) {
        const v = { canal: o.linha.slug, deMs: o.deMs, ateMs: o.ateMs, intervalos: o.intervalos, temMemoria: o.memoria instanceof Map };
        (window.__varreres = window.__varreres || []).push(v);
        const ints = o.intervalos || [[o.deMs, o.ateMs]];
        return {
          ouvido: { altos: 0, chumbados: 0, passaram: 0, maiorGrupo: 0 },
          estouros: [], falhados: 0, bytes: 0,
          candidatos: ints.map(([a, b]) => ({ ms: Math.round((a + b) / 2), combateDeMs: Math.round((a + b) / 2) - 1000, combateAteMs: Math.round((a + b) / 2) + 2000, tiros: 3 })),
        };
      }`,
  }));
}

async function abrirNoite(p, segmentos, canais = ['tchubi']) {
  await kickFalsa(p, { canais, segmentos });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 });
}

const acabou = (p) => p.waitForFunction(() => window.__estado.varredura === null
  && !/Ouvindo|Lendo/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 30000 });

test('Tudo numa live longa: ouve só em volta dos picos do chat, mostra logo, e o resto fica a um botão',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await varreduraFalsa(p);
    // Uma hora de live; o chat do tchubi tem um surto no minuto 5.
    await abrirNoite(p, 360);
    const perguntas = [];
    p.on('dialog', (d) => { perguntas.push(d.message()); d.dismiss(); });
    await passo4Detetar(p, { quem: 'tchubi' });
    await p.click('#detetarTrecho');
    await acabou(p);
    const [v] = await p.evaluate(() => window.__varreres);
    assert.ok(v.temMemoria, 'a memória da sessão vai à varredura');
    assert.equal(v.intervalos.length, 1, JSON.stringify(v.intervalos));
    const [a, b] = v.intervalos[0];
    assert.ok(a >= T + 2 * 60_000 && b <= T + 7 * 60_000 && b - a <= 4 * 60_000,
      `ouviu de ${(a - T) / 60_000} a ${(b - T) / 60_000} min`);
    const texto = await p.locator('#estadoChatTrecho').innerText();
    assert.match(texto, /^1 tiroteios em tchubi/);
    assert.match(texto, /Ouvi só 4 min em volta de 1 pico do chat, de 1 h de live\. As partes ouvidas ficam mais escuras na faixa\./);
    // O que se ouviu, mais escuro na faixa.
    const faixa = p.locator('#faixas .faixa[data-quem="tchubi"]');
    assert.equal(await faixa.locator('.ouvido').count(), 1);
    // E o resto.
    assert.ok(await p.locator('#continuarOuvindo').isVisible());
    assert.equal(await p.locator('#continuarOuvindo').innerText(), 'Continuar ouvindo o resto');
    await p.click('#continuarOuvindo');
    await acabou(p);
    const vs = await p.evaluate(() => window.__varreres);
    assert.equal(vs.length, 2);
    assert.deepEqual(vs[1].intervalos, [[T, T + 3600_000]], 'o resto é tudo (o já ouvido vem da memória)');
    assert.deepEqual(perguntas, [], 'uma hora não precisa de aviso');
    assert.ok(await p.locator('#continuarOuvindo').isHidden(), 'nada mais por ouvir');
    const largura = await faixa.locator('.ouvido').evaluate((e) => parseFloat(e.style.width));
    assert.ok(largura > 99, `a faixa ouvida tem ${largura}%`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('um trecho curto ouve tudo direto, sem modo esperto e sem aviso', comNavegador, async () => {
  const { p, erros } = await abrir();
  await varreduraFalsa(p);
  await abrirNoite(p, 360);
  await passo4Detetar(p, { quem: 'tchubi', quanto: 'trecho' });
  await p.click('#detetarTrecho');
  await acabou(p);
  const [v] = await p.evaluate(() => window.__varreres);
  assert.equal(v.intervalos.length, 1);
  assert.equal(v.intervalos[0][1] - v.intervalos[0][0], v.ateMs - v.deMs, 'o trecho inteiro');
  assert.ok(v.ateMs - v.deMs <= 10 * 60_000, `${v.ateMs - v.deMs} ms`);
  assert.doesNotMatch(await p.locator('#estadoChatTrecho').innerText(), /Ouvi só/);
  assert.ok(await p.locator('#continuarOuvindo').isHidden());
  assert.deepEqual(erros, []);
  await p.close();
});

test('antes de ouvir muito, o aviso com as horas e os MB; Cancelar não baixa nada, Continuar ouve',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await varreduraFalsa(p);
    // Três horas de live.
    await abrirNoite(p, 1080);
    await passo4Detetar(p, { quem: 'tchubi' });
    await p.click('#detetarTrecho');
    await acabou(p);
    assert.equal(await p.evaluate(() => window.__varreres.length), 1, 'o modo esperto é pouco: sem aviso');
    await p.click('#continuarOuvindo');
    await p.waitForSelector('#avisoOuvir:not([hidden])', { timeout: 10000 });
    const aviso = await p.locator('#avisoOuvirTexto').innerText();
    assert.match(aviso, /^São 2 h 56 de live, uns \d+ MB\. Melhor no Wi-Fi\.$/, aviso);
    assert.ok(Number(aviso.match(/uns (\d+) MB/)[1]) > 300);
    assert.equal(await p.evaluate(() => document.activeElement.id), 'avisoContinuar');
    assert.ok(await p.locator('#pararChatTrecho').isHidden(), 'com o aviso aberto, quem responde é ele');
    await p.click('#avisoCancelar');
    await p.waitForFunction(() => window.__estado.varredura === null);
    assert.equal(await p.locator('#estadoChatTrecho').innerText(), 'Cancelado: nada foi baixado.');
    assert.ok(await p.locator('#avisoOuvir').isHidden());
    assert.equal(await p.evaluate(() => window.__varreres.length), 1, 'Cancelar não ouviu nada');
    // O resto continua a um botão, e agora Continuar.
    await p.click('#continuarOuvindo');
    await p.waitForSelector('#avisoOuvir:not([hidden])');
    await p.click('#avisoContinuar');
    await acabou(p);
    assert.equal(await p.evaluate(() => window.__varreres.length), 2);
    assert.ok(await p.locator('#avisoOuvir').isHidden());

    assert.deepEqual(erros, []);
    await p.close();
  });

test('sem picos no chat, diz-se, e o mesmo botão ouve tudo', comNavegador, async () => {
  const { p, erros } = await abrir();
  await varreduraFalsa(p);
  // O chat do "outro" não tem surto nenhum: três mensagens por minuto, a hora toda.
  await abrirNoite(p, 360, ['tchubi', 'outro']);
  await passo4Detetar(p, { quem: 'outro' });
  await p.click('#detetarTrecho');
  await acabou(p);
  assert.equal(await p.evaluate(() => (window.__varreres || []).length), 0, 'não ouviu nada');
  assert.equal(await p.locator('#estadoChatTrecho').innerText(),
    'O chat de outro não teve picos para começar por eles. Ouça tudo, ou escolha um trecho.');
  assert.equal(await p.locator('#continuarOuvindo').innerText(), 'Ouvir tudo');
  await p.click('#continuarOuvindo');
  await acabou(p);
  const vs = await p.evaluate(() => window.__varreres);
  assert.deepEqual(vs.map((v) => v.intervalos), [[[T, T + 3600_000]]]);
  assert.deepEqual(erros, []);
  await p.close();
});
