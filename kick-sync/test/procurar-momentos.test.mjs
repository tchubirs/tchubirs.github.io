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

/**
 * Som verdadeiro (amostras), com tiroteios onde se mandar.
 *
 * A forma veio de um tiroteio MEDIDO — kodd, o VOD da LA ISLA, o instante em
 * que ele morre. Nao sao dez estalos soltos espalhados por quatro segundos:
 * sao quatro segundos e meio ALTOS DO PRINCIPIO AO FIM, com um disparo a cada
 * decimo de segundo e a cauda de cada um a segurar o nivel entre eles. A
 * fixture antiga tinha a forma que eu tinha IMAGINADO, e passava por isso.
 */
function somComRajadas(segundos, emS = [], { semente = 3, duracaoS = 4.5 } = {}) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const x = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.01;
  for (const t of emS) {
    // Um disparo a cada 110 ms — a cadencia de uma arma automatica do Rust.
    for (let d = 0; d < duracaoS * 1000; d += 110) {
      const i = Math.round((t + d / 1000) * TAXA);
      for (let j = 0; j < 3000 && i + j < x.length; j++) {
        if (i + j < 0) continue;
        x[i + j] += (rnd() * 2 - 1) * Math.exp(-j / 900);
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

// "Os clipes sao de setenta segundos. Se eu configurei zero segundos antes e
//  zero depois, era pra ser exatamente: eu disparo, a pessoa morre, e acaba."
//
// O clipe levava do primeiro ao ultimo disparo da luta — ate noventa segundos —
// e as margens dele somavam-se por fora. Aqui a luta tem um tiro solto, dez
// segundos de nada, e depois a rajada: e a forma medida numa luta verdadeira do
// VOD dele. O clipe tem de ser a rajada, e nao os treze segundos.
test('o clipe automatico e a rajada ate a morte, e nao o combate inteiro', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const NOITE = 120;
  const x = new Float32Array(Math.round((NOITE + 30) * TAXA));
  let s = 7;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.01;
  // Um tiro solto aos 50 s, dez segundos de nada, e a troca dos 60,5 aos 65 —
  // alta do principio ao fim, com o mais alto aos 61,5. E a forma medida no
  // tiroteio verdadeiro dele, e o clipe tem de ser A TROCA, e nao os catorze
  // segundos que vao do tiro solto ao fim dela.
  const estouro = (t, forca) => {
    const i = Math.round(t * TAXA);
    for (let j = 0; j < 3000 && i + j < x.length; j++) {
      x[i + j] += forca * (rnd() * 2 - 1) * Math.exp(-j / 900);
    }
  };
  estouro(50, 1);
  for (let d = 0; d <= 4500; d += 110) estouro(60.5 + d / 1000, Math.abs(d - 1000) < 60 ? 2.5 : 1.2);

  const r = await varrerNoite({
    linha: { slug: 'tchubi' },
    deMs: T,
    ateMs: T + NOITE * 1000,
    bocadoS: 300,
    lerSom: async (linha, quandoMs, duracaoS) => {
      const de = Math.round(((quandoMs - T) / 1000) * TAXA);
      return x.subarray(de, de + Math.round(duracaoS * TAXA));
    },
  });

  assert.equal(r.candidatos.length, 1, `deu ${r.candidatos.length} candidatos`);
  const c = r.candidatos[0];
  const seg = (ms) => (ms - T) / 1000;
  // O instante e o tiro mais alto.
  assert.ok(Math.abs(seg(c.ms) - 61.5) < 1, `o instante deu ${seg(c.ms)} e devia ser ~61,5`);
  // E o clipe comeca na rajada, e nao no tiro solto dos 50 s.
  assert.ok(seg(c.combateDeMs) > 58,
    `o clipe comecou aos ${seg(c.combateDeMs)}s — voltou a levar o combate inteiro`);
  // Acaba quando a troca arrefece, e nao no tiro mais alto. Acabar no mais
  // alto dava um clipe de um segundo sempre que o mais alto era o PRIMEIRO —
  // que e exactamente o caso de um headshot a primeira bala.
  assert.ok(seg(c.combateAteMs) > 64,
    `o clipe acabou aos ${seg(c.combateAteMs)}s e devia levar a troca toda`);
  const dur = seg(c.combateAteMs) - seg(c.combateDeMs);
  assert.ok(dur >= 2 && dur < 12, `o clipe ficou com ${dur.toFixed(1)}s`);
  assert.ok(c.duracaoS >= 2, `a duracao medida deu ${c.duracaoS}s`);
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

// Sem os recortes guardados, aprender com uma kill confirmada obrigava a
// baixar a noite outra vez — meia hora de espera por um clique dele.
test('a varredura guarda a forma de cada estouro, para depois se aprender', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const som = somComRajadas(400, [100, 250]);
  const r = await varrerNoite({
    linha: { slug: 'x' },
    deMs: T,
    ateMs: T + 360 * 1000,
    bocadoS: 180,
    lerSom: async (linha, quandoMs, duracaoS) => {
      const de = Math.round(((quandoMs - T) / 1000) * TAXA);
      return som.subarray(de, de + Math.round(duracaoS * TAXA));
    },
  });
  assert.ok(r.estouros.length >= 10, `so guardou ${r.estouros.length}`);
  for (const e of r.estouros) {
    assert.ok(e.recorte instanceof Float32Array && e.recorte.length > 0);
    assert.ok(e.ms >= T && e.ms <= T + 360_000, `ms fora da noite: ${e.ms}`);
  }
  // Os instantes tem de bater com onde os tiros foram postos, e nao ficar
  // todos colados ao principio de cada bocado.
  const segundos = r.estouros.map((e) => (e.ms - T) / 1000);
  assert.ok(segundos.some((s) => Math.abs(s - 100) < 6), 'nenhum recorte na primeira luta');
  assert.ok(segundos.some((s) => Math.abs(s - 250) < 6), 'nenhum recorte na segunda luta');
});

// "Não funciona mais, não cria mais nenhum clipe."
//
// Medido na luta verdadeira dele: cinco impulsos em três décimos de segundo, o
// mais alto o segundo deles. A acabar no tiro mais alto o clipe saía com UM
// SEGUNDO — o chão que eu tinha posto para as pontas não coincidirem. Um
// segundo de vídeo não é um clipe, e é isso que ele viu.
test('uma rajada curta não sai com um segundo de clipe', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  const NOITE = 120;
  const x = new Float32Array(Math.round((NOITE + 30) * TAXA));
  let s = 11;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.01;
  const estouro = (t, forca) => {
    const i = Math.round(t * TAXA);
    for (let j = 0; j < 3000 && i + j < x.length; j++) {
      x[i + j] += forca * (rnd() * 2 - 1) * Math.exp(-j / 900);
    }
  };
  // Uma troca curta — pouco mais de um segundo — com o mais alto a abrir: um
  // headshot a primeira bala, que e precisamente o clipe que ele quer.
  for (let d = 0; d <= 1100; d += 110) estouro(60 + d / 1000, d === 0 ? 3 : 1);

  const r = await varrerNoite({
    linha: { slug: 'tchubi' },
    deMs: T,
    ateMs: T + NOITE * 1000,
    bocadoS: 300,
    lerSom: async (linha, quandoMs, duracaoS) => {
      const de = Math.round(((quandoMs - T) / 1000) * TAXA);
      return x.subarray(de, de + Math.round(duracaoS * TAXA));
    },
  });

  assert.equal(r.candidatos.length, 1, `deu ${r.candidatos.length} candidatos`);
  const dur = (r.candidatos[0].combateAteMs - r.candidatos[0].combateDeMs) / 1000;
  assert.ok(dur >= 2, `o clipe saiu com ${dur.toFixed(1)}s — um segundo de vídeo não é um clipe`);
});

// "Da isso, porem eu sei que ta tendo tiroteio."
//
// A mensagem sabia dizer "nenhum tiroteio nesse intervalo" — que é a mesma
// coisa que não dizer nada. Sem saber O QUE o detector ouviu, nem ele nem eu
// podemos corrigir seja o que for: fica a discussão entre alguém que viu o
// tiroteio e um programa que se cala.
test('quando nao acha nada, diz o que ouviu', async () => {
  // Uma noite de voz: alto e brusco, mas grave — é o que o brilho chumba.
  const taxa = TAXA;
  const som = new Float32Array(taxa * 60);
  for (let i = 0; i < som.length; i++) som[i] = Math.sin((2 * Math.PI * 200 * i) / taxa) * 0.02;
  for (let k = 0; k < 30; k++) {
    const o = Math.round((2 + k * 1.9) * taxa);
    for (let i = o; i < o + 60 && i < som.length; i++) {
      som[i] = Math.sin((2 * Math.PI * 200 * (i - o)) / taxa) * 0.9;
    }
  }
  const r = await varrerNoite({
    linha: { slug: 'tchubi', inicio: 0, fim: 60000 },
    deMs: 0,
    ateMs: 60000,
    bocadoS: 60,
    lerSom: async () => som,
  });

  assert.equal(r.candidatos.length, 0, 'voz grave nao pode dar tiroteio');
  assert.ok(r.ouvido, 'tem de dizer o que ouviu');
  assert.ok(r.ouvido.altos > 0, 'ouviu sons altos — e tem de o dizer');
  assert.equal(r.ouvido.altos, r.ouvido.chumbados + r.ouvido.passaram,
    'as contas tem de fechar: altos = chumbados + passaram');
  assert.ok(r.ouvido.maiorGrupo >= 0 && r.ouvido.maiorGrupo <= r.ouvido.passaram,
    `maiorGrupo ${r.ouvido.maiorGrupo} nao pode passar os ${r.ouvido.passaram} que sobreviveram`);
});
