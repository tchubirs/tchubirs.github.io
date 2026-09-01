// O alinhamento inteiro, sem rede e sem codec.
//
// A única parte que pertence ao browser é descodificar AAC — e essa é testada
// noutro sítio, contra o ffmpeg, byte a byte. Tudo o resto é deste código:
// escolher os instantes, cortar ao relógio, comparar par a par, e decidir o
// ajuste de cada canal. É isso que este ficheiro cobre, com um sinal cujo
// atraso eu conheço porque fui eu que o pus lá.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alinharPeloSom, instantesParaOuvir } from '../site/alinhar.js';
import { linhaDoCanal, janelaComum } from '../site/relogio.js';
import { TAXA } from '../site/sinal.js';

const T = Date.parse('2026-08-30T21:00:00.000Z');
const NOITE_S = 1800;

/** Uma noite de som: ataques em instantes irregulares, determinista. */
function noite(segundos, semente = 20260830) {
  let s = semente >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000);
  const n = Math.round(segundos * TAXA);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * 0.02;
  let t = 0;
  while (t < n) {
    t += Math.round((0.2 + rnd() * 0.9) * TAXA);
    const f = 0.3 + rnd();
    for (let i = 0; i < 1400 && t + i < n; i++) x[t + i] += (rnd() * 2 - 1) * f * Math.exp(-i / 300);
  }
  return x;
}

const SOM = noite(NOITE_S + 200);

const peca = (inicio, segundos) => {
  const segmentos = [];
  for (let t = 0; t < segundos; t += 10) {
    segmentos.push({ url: `s${t}.ts`, inicio: inicio + t * 1000, duracaoS: 10, mediaT: t });
  }
  return {
    vod: { id: inicio },
    playlist: {
      segmentos, fonteDoRelogio: 'program-date-time',
      inicio, fim: inicio + segundos * 1000, duracaoS: segundos,
    },
  };
};

/**
 * Canais que partilham a MESMA noite de som, cada um com o seu atraso real
 * entre a captura e a chegada à Kick.
 *
 * `atrasoS` positivo = este chegou mais tarde, logo num dado carimbo mostra um
 * momento mais antigo — e é isso que o alinhamento tem de desfazer.
 */
function montar(atrasos) {
  const slugs = Object.keys(atrasos);
  const linhas = slugs.map((slug) => {
    const l = linhaDoCanal(slug, [peca(T, NOITE_S)]);
    return { ...l, pecasCompletas: l.pecas };
  });
  const lerSom = async (linha, quandoMs, duracaoS) => {
    const atraso = atrasos[linha.slug];
    if (atraso == null) return null;                     // canal mudo, de propósito
    // O carimbo diz `quandoMs`; o que lá está gravado é o mundo em
    // `quandoMs - atraso`. Deslocar a fonte é exactamente isso.
    const de = Math.round((((quandoMs - T) / 1000) - atraso + 100) * TAXA);
    const n = Math.round(duracaoS * TAXA);
    if (de < 0 || de + n > SOM.length) return null;
    return SOM.subarray(de, de + n);
  };
  return { linhas, janela: janelaComum(linhas), lerSom };
}

test('mede o atraso de cada canal e devolve o ajuste que o desfaz', async () => {
  const { linhas, janela, lerSom } = montar({ a: 0, b: 0, lento: 6.4 });
  const r = await alinharPeloSom({ linhas, janela, lerSom, duracaoS: 120, janelas: 3 });

  assert.deepEqual(r.semLigacao, []);
  assert.equal(Object.keys(r.ajustesMs).length, 3);
  // Os dois pontuais ficam juntos; o lento tem de avançar ~6,4 s.
  assert.ok(Math.abs(r.ajustesMs.a - r.ajustesMs.b) < 200, `a e b: ${r.ajustesMs.a} vs ${r.ajustesMs.b}`);
  const diferenca = (r.ajustesMs.lento - r.ajustesMs.a) / 1000;
  assert.ok(Math.abs(diferenca - 6.4) < 0.3, `esperava +6,4 s no lento, deu ${diferenca.toFixed(2)}`);
});

test('quem já estava certo não leva empurrão nenhum', async () => {
  const { linhas, janela, lerSom } = montar({ a: 0, b: 0, c: 0 });
  const r = await alinharPeloSom({ linhas, janela, lerSom, duracaoS: 120, janelas: 3 });
  for (const [slug, ms] of Object.entries(r.ajustesMs)) {
    assert.ok(Math.abs(ms) < 120, `${slug} levou ${ms} ms sem precisar`);
  }
});

test('um canal que não se ouve é dito pelo nome, não posto a zero', async () => {
  const { linhas, janela, lerSom } = montar({ a: 0, b: 2.5, mudo: null });
  const r = await alinharPeloSom({ linhas, janela, lerSom, duracaoS: 120, janelas: 3 });
  assert.deepEqual(r.semLigacao, ['mudo']);
  assert.ok(!('mudo' in r.ajustesMs), 'sem medição não há ajuste inventado');
  assert.ok(Math.abs((r.ajustesMs.b - r.ajustesMs.a) / 1000 - 2.5) < 0.3);
});

test('um canal que rebenta a baixar não mata a medição dos outros', async () => {
  const { linhas, janela, lerSom } = montar({ a: 0, b: 3.1, mau: 0 });
  const r = await alinharPeloSom({
    linhas,
    janela,
    duracaoS: 120,
    janelas: 3,
    lerSom: (l, t, d, o) => (l.slug === 'mau' ? Promise.reject(new Error('segmento 503')) : lerSom(l, t, d, o)),
  });
  assert.ok(r.problemas.length >= 1);
  assert.equal(r.problemas[0].canal, 'mau');
  assert.ok(Math.abs((r.ajustesMs.b - r.ajustesMs.a) / 1000 - 3.1) < 0.3, 'a e b continuam medidos');
});

// Um navegador sem AAC não vai passar a ter a meio da medição. Insistir canal
// a canal só faz o utilizador esperar por nada, e depois falhar na mesma.
test('um navegador sem descodificador pára já, em vez de tentar tudo', async () => {
  const { linhas, janela } = montar({ a: 0, b: 0, c: 0 });
  let tentativas = 0;
  await assert.rejects(
    alinharPeloSom({
      linhas,
      janela,
      duracaoS: 120,
      janelas: 3,
      lerSom: () => {
        tentativas++;
        const e = new Error('sem AAC');
        e.name = 'SEM-DESCODIFICADOR';
        return Promise.reject(e);
      },
    }),
    /sem AAC/,
  );
  assert.equal(tentativas, 1, `tentou ${tentativas} vezes o que nunca ia dar`);
});

test('o cancelamento é respeitado', async () => {
  const { linhas, janela, lerSom } = montar({ a: 0, b: 0 });
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    alinharPeloSom({ linhas, janela, lerSom, sinal: c.signal, duracaoS: 120 }),
    (e) => e.name === 'AbortError',
  );
});

// Três janelas seguidas medem três vezes o mesmo minuto. Se esse minuto for de
// música em loop, as três concordam no sítio errado — que é precisamente o
// erro que a repetição devia apanhar.
test('as janelas de escuta espalham-se pela noite', () => {
  const { linhas, janela } = montar({ a: 0, b: 0 });
  const t = instantesParaOuvir(linhas, janela, { quantos: 3, duracaoS: 120 });
  assert.equal(t.length, 3);
  assert.ok(t[1] - t[0] > 300_000, `${(t[1] - t[0]) / 1000}s entre janelas é pouco`);
  assert.ok(t[0] >= janela.inicio && t.at(-1) + 120_000 <= janela.fim, 'nenhuma cai fora da noite');
});

test('uma noite curta demais não inventa três janelas iguais', () => {
  const l = [linhaDoCanal('a', [peca(T, 60)])].map((x) => ({ ...x, pecasCompletas: x.pecas }));
  const t = instantesParaOuvir(l, janelaComum(l), { quantos: 3, duracaoS: 120 });
  assert.equal(t.length, 1, 'com menos noite do que janela, mede-se uma vez e diz-se o que deu');
});

// "Sincroniza, adiciona canal novo depois e sincroniza de novo — vai ter que
//  sincronizar tudo de novo?"
//
// Ia. Cada canal custa ~14 MB (3 janelas x 132 s x 280 kbps), por isso
// acrescentar o trigésimo primeiro a uma noite já medida mandava descarregar
// 420 MB para medir 14. E é desperdício puro: a forma do som do canal A no
// minuto 40 não muda por ter chegado o canal Z.
test('acrescentar um canal só ouve o canal novo, não a noite toda', async () => {
  const memoria = new Map();
  const primeiro = montar({ a: 0, b: 0, lento: 6.4 });
  const contar = (m) => {
    let n = 0;
    return {
      ...m,
      lerSom: async (...args) => { n++; return m.lerSom(...args); },
      quantas: () => n,
    };
  };

  const um = contar(primeiro);
  const r1 = await alinharPeloSom({
    linhas: um.linhas, janela: um.janela, lerSom: um.lerSom, duracaoS: 120, janelas: 3, memoria,
  });
  assert.equal(um.quantas(), 9, 'três canais x três janelas');
  assert.equal(r1.reaproveitados, 0);

  // Agora chega o quarto. A janela é a mesma (todos cobrem a noite inteira),
  // por isso os instantes são os mesmos e a memória serve.
  const dois = contar(montar({ a: 0, b: 0, lento: 6.4, novo: 2.1 }));
  const r2 = await alinharPeloSom({
    linhas: dois.linhas, janela: dois.janela, lerSom: dois.lerSom, duracaoS: 120, janelas: 3, memoria,
  });
  assert.equal(dois.quantas(), 3, `ouviu ${dois.quantas()} vezes; só o canal novo são 3`);
  assert.equal(r2.reaproveitados, 9);

  // E o resultado tem de ser o mesmo que se tivesse ouvido tudo outra vez.
  const diferenca = (r2.ajustesMs.novo - r2.ajustesMs.a) / 1000;
  assert.ok(Math.abs(diferenca - 2.1) < 0.3, `esperava +2,1 s no novo, deu ${diferenca.toFixed(2)}`);
  const antes = (r1.ajustesMs.lento - r1.ajustesMs.a) / 1000;
  const depois = (r2.ajustesMs.lento - r2.ajustesMs.a) / 1000;
  assert.ok(Math.abs(antes - depois) < 0.2, `o lento mudou de ${antes.toFixed(2)} para ${depois.toFixed(2)}`);
});

test('uma noite diferente não reaproveita medições da anterior', async () => {
  const memoria = new Map();
  const a = montar({ a: 0, b: 0 });
  await alinharPeloSom({ ...a, lerSom: a.lerSom, duracaoS: 120, janelas: 3, memoria });
  const chavesAntes = [...memoria.keys()];

  // Outra janela: os instantes escolhidos são outros, logo as chaves são
  // outras, e nenhuma medição da noite passada entra por engano.
  const H = 3_600_000;
  const desloca = (j) => Object.fromEntries(Object.entries(j)
    .map(([k, v]) => [k, typeof v === 'number' && v > 1e12 ? v + H : v]));
  const outra = { ...a, janela: desloca(a.janela) };
  const instantes = instantesParaOuvir(outra.linhas, outra.janela, { quantos: 3, duracaoS: 120 });
  for (const t of instantes) {
    for (const l of outra.linhas) {
      assert.ok(!chavesAntes.includes(`${t}|${l.slug}`), `${t}|${l.slug} veio da noite anterior`);
    }
  }
});
