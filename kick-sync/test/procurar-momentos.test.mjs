// A varredura: baixar a noite aos bocados sem a por toda em memoria.
//
// A conta que decide o que e um tiro mudou-se para `tiros.js` e tem os seus
// testes la. Estes eram os da versao por ritmo, e foram-se com ela: um teste
// de codigo que ja nao existe da uma sensacao de cobertura que nao e real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { varrerNoite, custoVarrerMB } from '../site/procurar-momentos.js';
// A varredura passou a ouvir a 24 kHz: a 8 kHz o mundo acaba nos 4 kHz, e e
// para cima disso que um estouro se distingue de uma voz.
import { TAXA_TIROS as TAXA } from '../site/tiros.js';

// ── varrer a noite ──────────────────────────────────────────────────────────

/** Som verdadeiro (amostras), com rajadas onde se mandar. */
function somComRajadas(segundos, emS = [], { semente = 3 } = {}) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const x = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.01;
  for (const t of emS) {
    for (const [k, atraso] of [0, 0.31, 0.55, 1.02, 1.19, 1.9, 2.4, 2.44, 3.1, 3.7].entries()) {
      void k;
      const i = Math.round((t + atraso) * TAXA);
      for (let j = 0; j < 1200 && i + j < x.length; j++) {
        x[i + j] += (rnd() * 2 - 1) * Math.exp(-j / 200);
      }
    }
  }
  return x;
}

test('varre a noite aos bocados e acha as lutas onde elas estao', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const NOITE = 900;
  const som = somComRajadas(NOITE + 60, [200, 500, 800]);
  const pedidos = [];
  const r = await varrerNoite({
    linha: { slug: 'tchubi' },
    deMs: T,
    ateMs: T + NOITE * 1000,
    bocadoS: 300,
    lerSom: async (linha, quandoMs, duracaoS, { contador }) => {
      pedidos.push((quandoMs - T) / 1000);
      contador?.(1000);
      const de = Math.round(((quandoMs - T) / 1000) * TAXA);
      return som.subarray(de, de + Math.round(duracaoS * TAXA));
    },
  });

  // Aos bocados: uma hora de audio de uma vez sao 115 MB em memoria.
  assert.deepEqual(pedidos, [0, 300, 600]);
  assert.equal(r.bytes, 3000);

  // Por ordem do TIRO MAIS ALTO, e nao do relogio. "Quando ocorre um acerto na
  // cabeca, o som e muito alto" — numa lista de trinta candidatos, esse tem de
  // vir a frente. A lista da montagem volta a por tudo por horas.
  const emS = r.candidatos.map((c) => Math.round((c.ms - T) / 1000)).sort((a, b) => a - b);
  assert.equal(emS.length, 3, `deu ${JSON.stringify(emS)}`);
  for (const [i, esperado] of [200, 500, 800].entries()) {
    assert.ok(Math.abs(emS[i] - esperado) < 6, `${emS[i]} devia ser ~${esperado}`);
  }
  const picos = r.candidatos.map((c) => c.pico);
  assert.deepEqual(picos, [...picos].sort((a, b) => b - a), 'a mais alta tem de vir a frente');
});

// Um bocado que nao se consegue ouvir nao pode deslocar o resto no tempo.
test('um bocado que falha nao desalinha os candidatos seguintes', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const som = somComRajadas(660, [450]);
  const r = await varrerNoite({
    linha: { slug: 'x' },
    deMs: T,
    ateMs: T + 600 * 1000,
    bocadoS: 200,
    lerSom: async (linha, quandoMs, duracaoS) => {
      if (quandoMs === T) return null;            // o primeiro bocado nao se le
      const de = Math.round(((quandoMs - T) / 1000) * TAXA);
      return som.subarray(de, de + Math.round(duracaoS * TAXA));
    },
  });
  assert.equal(r.candidatos.length, 1);
  assert.ok(Math.abs((r.candidatos[0].ms - T) / 1000 - 450) < 6,
    `deu ${(r.candidatos[0].ms - T) / 1000}s`);
});

test('o cancelamento e respeitado a meio da varredura', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const c = new AbortController();
  let lidos = 0;
  await assert.rejects(varrerNoite({
    linha: { slug: 'x' },
    deMs: T,
    ateMs: T + 3600 * 1000,
    bocadoS: 300,
    sinal: c.signal,
    lerSom: async () => { if (++lidos === 2) c.abort(); return new Float32Array(TAXA * 300); },
  }), (e) => e.name === 'AbortError');
  assert.ok(lidos <= 3, `leu ${lidos} bocados depois de cancelado`);
});

test('o custo de varrer e dito antes, e cresce com o tempo', () => {
  assert.ok(custoVarrerMB(3600_000) > custoVarrerMB(1800_000));
  assert.ok(custoVarrerMB(3600_000) > 100 && custoVarrerMB(3600_000) < 200,
    `uma hora deu ${custoVarrerMB(3600_000)} MB`);
});
