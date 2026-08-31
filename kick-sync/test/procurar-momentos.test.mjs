// Achar as kills sozinho — a conta, sem audio verdadeiro.
//
// O sinal nao e o barulho: e o RITMO. Um streamer fala a noite inteira e cada
// silaba e um ataque forte; o que a fala nao tem e cadencia constante. Uma arma
// automatica tem — no Rust a AK anda pelos 7 tiros por segundo, sempre igual.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ataques, rajadas, candidatos, varrerNoite, custoVarrerMB,
} from '../site/procurar-momentos.js';
import { TAXA } from '../site/sinal.js';

const FPS = 100;

/**
 * Uma envolvente de ataques: fundo calmo, com o que se mandar por cima.
 *
 * `rajadas` sao tiros em cadencia constante (uma arma automatica); `fala` sao
 * ataques irregulares, que e o que um streamer faz a noite inteira.
 */
function noite(segundos, { tiroteios = [], fala = [], semente = 7 } = {}) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const e = new Float32Array(Math.round(segundos * FPS));
  for (let i = 0; i < e.length; i++) e[i] = rnd() * 0.8;
  const bater = (emS) => { const i = Math.round(emS * FPS); if (i >= 0 && i < e.length) e[i] = 6; };
  for (const { emS, tiros = 8, cadenciaS = 0.14 } of tiroteios) {
    for (let k = 0; k < tiros; k++) bater(emS + k * cadenciaS);
  }
  for (const { deS, ateS } of fala) {
    // Silabas: intervalos irregulares entre 0,12 e 0,45 s.
    for (let t = deS; t < ateS; t += 0.12 + rnd() * 0.33) bater(t);
  }
  return e;
}

test('acha os ataques onde a envolvente sobe', () => {
  const e = new Float32Array(100);
  e[10] = 5; e[11] = 5; e[40] = 5;
  assert.deepEqual(ataques(e, { limiar: 3 }), [10, 40], 'dois picos colados sao um ataque so');
});

// O que separa um tiro de uma silaba nao e a forca: e o RITMO.
test('uma rajada em cadencia constante e reconhecida', () => {
  const idx = Array.from({ length: 10 }, (_, k) => k * 14);
  const r = rajadas(idx, { fps: FPS });
  assert.equal(r.length, 1);
  assert.equal(r[0].tiros, 10);
  assert.ok(Math.abs(r[0].cadenciaS - 0.14) < 0.01);
});

// Um grito no meio do tiroteio nao pode esconder o tiroteio: os tiros
// continuam na grelha, o grito simplesmente nao cai nela.
test('um ataque a mais no meio nao esconde a rajada', () => {
  const idx = [...Array.from({ length: 10 }, (_, k) => k * 14), 33, 75].sort((a, b) => a - b);
  const r = rajadas(idx, { fps: FPS });
  assert.equal(r.length, 1);
  assert.equal(r[0].tiros, 10, 'os dez tiros, e nao os doze ataques');
});

// A regra que separa mesmo: numa rajada quase tudo o que se ouve sao os tiros.
// Numa conversa a grelha apanha uma minoria das silabas.
test('oito na grelha no meio de trinta ataques nao e uma rajada', () => {
  let x = 5;
  const grelha = Array.from({ length: 8 }, (_, k) => k * 14);
  // Ruido a serio: intervalos que nao formam grelha nenhuma.
  const ruido = Array.from({ length: 24 }, (_, k) => { x += 7 + ((k * 37) % 29); return x; });
  const r = rajadas([...grelha, ...ruido].sort((a, b) => a - b), { fps: FPS });
  assert.deepEqual(r, [], `${r.length} rajadas onde so ha 8 tiros em 32 ataques`);
});

test('ataques irregulares nao sao uma rajada', () => {
  assert.deepEqual(rajadas([0, 13, 40, 55, 90, 103, 130, 149, 166], { fps: FPS }), []);
});

test('intervalos fora do que uma arma dispara nao contam', () => {
  const cada = (p, n) => Array.from({ length: n }, (_, k) => k * p);
  assert.deepEqual(rajadas(cada(100, 10), { fps: FPS }), [], 'um por segundo e um relogio, nao uma arma');
  assert.deepEqual(rajadas(cada(2, 10), { fps: FPS }), [], '50 tiros por segundo nao existe');
});

test('poucos tiros nao chegam; oito sim', () => {
  const cada = (n) => Array.from({ length: n }, (_, k) => k * 14);
  assert.equal(rajadas(cada(5), { fps: FPS }).length, 0);
  assert.equal(rajadas(cada(8), { fps: FPS }).length, 1);
});

// Medido contra som verdadeiro: "cinco ataques fortes em tres segundos" dava
// quarenta candidatos em meia hora — porque e isso que e FALAR.
// O numero e medido, e nao um desejo: 30 minutos de fala sintetica dao 2
// candidatos falsos. Nao e zero e nunca sera — a fala tem ritmo as vezes. O
// que interessa e que sejam POUCOS: dois para rever numa noite e nada, e as
// quarenta que a primeira versao dava eram a noite inteira outra vez.
test('meia hora de conversa da quase nada — dois falsos, nao quarenta', () => {
  const picos = candidatos(noite(1800, { fala: [{ deS: 0, ateS: 1800 }] }), { fps: FPS });
  assert.ok(picos.length <= 3, `${picos.length} candidatos numa conversa de 30 min`);
});

test('acha o tiroteio no meio da conversa', () => {
  const picos = candidatos(noite(600, {
    fala: [{ deS: 0, ateS: 600 }],
    tiroteios: [{ emS: 300, tiros: 10 }],
  }), { fps: FPS });
  const oTiroteio = picos.filter((p) => Math.abs(p.ms / 1000 - 300) < 5);
  assert.equal(oTiroteio.length, 1, `nao achou o tiroteio: ${JSON.stringify(picos.map((p) => p.ms / 1000))}`);
  // E o tiroteio verdadeiro tem de ser o mais forte da lista, senao ele
  // aparece atras de dois falsos e o dono ve o lixo primeiro.
  assert.equal(Math.max(...picos.map((p) => p.nota)), oTiroteio[0].nota);
});

test('varios tiroteios separados dao varios candidatos', () => {
  const picos = candidatos(noite(900, {
    tiroteios: [{ emS: 100 }, { emS: 400 }, { emS: 700 }],
  }), { fps: FPS });
  assert.deepEqual(picos.map((p) => Math.round(p.ms / 1000)), [100, 400, 700]);
});

// Um tiroteio e varios carregadores seguidos, e o que se marca e a LUTA.
test('carregadores seguidos sao uma luta so', () => {
  const seguidos = Array.from({ length: 6 }, (_, k) => ({ emS: 200 + k * 5, tiros: 10 }));
  const picos = candidatos(noite(600, { tiroteios: seguidos }), { fps: FPS });
  assert.equal(picos.length, 1);
  assert.ok(picos[0].rajadas >= 4, `so ${picos[0].rajadas} carregadores`);
  assert.ok(picos[0].tiros >= 40);
});

// Sem limite, uma cadeia de rajadas espacadas colava a noite inteira num
// "combate" de dez minutos, com o instante marcado longe de tudo.
test('rajadas espalhadas pela noite nao viram um combate de dez minutos', () => {
  const espalhadas = Array.from({ length: 40 }, (_, k) => ({ emS: 20 + k * 7, tiros: 10 }));
  const picos = candidatos(noite(600, { tiroteios: espalhadas }), { fps: FPS });
  assert.ok(picos.length > 1, 'nao pode ser tudo um so');
  for (const p of picos) assert.ok(p.duracaoS <= 95, `${p.duracaoS}s de combate`);
});

test('um zumbido alto e constante nao vira candidato', () => {
  assert.deepEqual(candidatos(new Float32Array(600 * FPS).fill(4), { fps: FPS }), []);
});

test('numa noite em silencio nao inventa nada', () => {
  assert.deepEqual(candidatos(new Float32Array(600 * FPS), { fps: FPS }), []);
  assert.deepEqual(candidatos(new Float32Array(0), { fps: FPS }), []);
});

test('a nota poe as lutas maiores a frente', () => {
  const picos = candidatos(noite(900, {
    tiroteios: [{ emS: 100, tiros: 8 }, { emS: 400, tiros: 25 }],
  }), { fps: FPS });
  assert.equal(picos.length, 2);
  assert.ok(picos[1].nota > picos[0].nota);
});

test('os instantes saem em ordem e com o desvio do inicio somado', () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const picos = candidatos(noite(900, { tiroteios: [{ emS: 600 }, { emS: 150 }] }), { fps: FPS, inicioMs: T });
  assert.equal(picos.length, 2);
  assert.ok(picos[0].ms < picos[1].ms);
  assert.ok(Math.abs((picos[0].ms - T) / 1000 - 150) < 3);
});

test('o maximo de candidatos e respeitado', () => {
  const muitos = Array.from({ length: 60 }, (_, k) => ({ emS: 30 + k * 30 }));
  const picos = candidatos(noite(2000, { tiroteios: muitos }), { fps: FPS, maximo: 10 });
  assert.equal(picos.length, 10);
});

// ── varrer a noite ──────────────────────────────────────────────────────────

/** Som verdadeiro (amostras), com rajadas onde se mandar. */
function somComRajadas(segundos, emS = [], { semente = 3 } = {}) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const x = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.01;
  for (const t of emS) {
    for (let k = 0; k < 10; k++) {
      const i = Math.round((t + k * 0.22) * TAXA);
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

  const emS = r.candidatos.map((c) => Math.round((c.ms - T) / 1000));
  assert.equal(emS.length, 3, `deu ${JSON.stringify(emS)}`);
  for (const [i, esperado] of [200, 500, 800].entries()) {
    assert.ok(Math.abs(emS[i] - esperado) < 6, `${emS[i]} devia ser ~${esperado}`);
  }
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
