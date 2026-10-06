// Os outros ângulos de um momento, sem rede e sem codec.
//
// O som aqui é sintético e eu sei o que lá está, porque fui eu que o pus:
// uma "cena" de cliques (ataques curtos e fortes) em instantes irregulares,
// que a referência ouve, e cada candidato ouve — ou não — com o seu atraso e
// o seu próprio ruído por cima. Os limites (6, 5, 0,25 s) vêm de som real
// (MESMA-CENA.md); o que estes testes fixam é o resto: o sinal do desvio, a
// segunda janela, a ordem de chegada, o tecto de pedidos e o cancelamento.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  procurarAngulos, ordenarCandidatos, resumo, classificar,
  FORCA_ESTAVA, FORCA_TALVEZ, TOLERANCIA_S,
} from '../site/cena.js';
import { envolvente, desvio, resolver, TAXA } from '../site/sinal.js';

const T0 = Date.parse('2026-10-10T20:00:00.000Z');
const DURACAO_S = 90;
// A janela por defeito tem 20 s e o momento fica no meio: a primeira janela
// vai de 20 a 40 s, a segunda de 40 a 60 s.
const QUANDO = T0 + 30_000;
const N = DURACAO_S * TAXA;
const s = (seg) => Math.round(seg * TAXA);

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

function gerador(semente) {
  let x = semente >>> 0;
  return () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 0x100000000);
}

/** Ataques curtos e fortes em instantes irregulares — tiros, portas, passos. */
function cliques(semente, segundos = DURACAO_S) {
  const rnd = gerador(semente);
  const n = s(segundos);
  const x = new Float32Array(n);
  for (let t = 0; ;) {
    t += s(0.15 + rnd() * 0.6);
    if (t >= n) break;
    const f = 0.3 + rnd();
    for (let i = 0; i < 400 && t + i < n; i++) x[t + i] += (rnd() * 2 - 1) * f * Math.exp(-i / 100);
  }
  return x;
}

/** O fundo de cada casa: independente em cada canal. */
function ruido(semente, nivel = 0.02) {
  const rnd = gerador(semente);
  return Float32Array.from({ length: N }, () => (rnd() * 2 - 1) * nivel);
}

/** `x` deslocado no tempo: positivo => o mesmo som aparece MAIS TARDE. */
function atrasado(x, atrasoS) {
  const d = s(atrasoS);
  const y = new Float32Array(x.length);
  for (let i = 0; i < y.length; i++) {
    const k = i - d;
    if (k >= 0 && k < x.length) y[i] = x[k];
  }
  return y;
}

/** Soma de partes, cada uma `[sinal, ganho]`. */
function misturar(...partes) {
  const y = new Float32Array(N);
  for (const [x, k] of partes) for (let i = 0; i < N; i++) y[i] += x[i] * k;
  return y;
}

/** De 0 a `corteS` um som, dali para a frente outro. */
function emendar(antes, depois, corteS) {
  const y = Float32Array.from(depois);
  y.set(antes.subarray(0, s(corteS)));
  return y;
}

const CENA = cliques(1);
const REF = misturar([CENA, 1], [ruido(2), 1]);
const junto = (atrasoS, semente, ganho = 1) => misturar([atrasado(CENA, atrasoS), ganho], [ruido(semente), ganho]);
const longe = (semente) => misturar([cliques(semente), 1], [ruido(semente + 1), 1]);

/**
 * Um `somDe` como o da página, mas sobre som sintético no relógio: devolve o
 * som de `fontes[canal]` a começar EXACTAMENTE em `deMs`, ou null fora dele.
 *
 * `demora(canal, deMs)` diz quantos ms o "download" leva; `registo` guarda
 * cada chamada para os testes poderem contar pedidos e ver o que se pediu.
 */
function somDeFontes(fontes, { demora = () => 0, registo = [] } = {}) {
  return async (canal, deMs, duracaoS, opcoes) => {
    const nome = typeof canal === 'string' ? canal : canal.slug;
    registo.push({ canal: nome, deMs, duracaoS, opcoes });
    const ms = demora(nome, deMs);
    if (ms) await esperar(ms);
    const fonte = fontes[nome];
    if (fonte == null) return null;
    if (typeof fonte === 'function') return fonte(deMs, duracaoS);
    const de = s((deMs - T0) / 1000);
    if (de < 0 || de >= fonte.length) return null;
    return fonte.subarray(de, Math.min(fonte.length, de + s(duracaoS)));
  };
}

async function tudo(gerado) {
  const saida = [];
  for await (const r of gerado) saida.push(r);
  return saida;
}

const porCanal = (resultados) => Object.fromEntries(resultados.map((r) => [
  typeof r.canal === 'string' ? r.canal : r.canal.slug, r,
]));

// ── o sinal do desvio ─────────────────────────────────────────────────────

test('quem estava junto, 0,4 s mais atrasado, é "estava" e o desvio é +0,4 s', async () => {
  const registo = [];
  const somDe = somDeFontes({ ref: REF, colega: junto(0.4, 3) }, { registo });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe }));

  assert.equal(r.canal, 'colega');
  assert.equal(r.estado, 'estava');
  assert.ok(r.forca >= FORCA_ESTAVA, `força ${r.forca.toFixed(1)}`);
  // Positivo: o candidato chegou à Kick MAIS TARDE do que a referência.
  assert.ok(Math.abs(r.desvioS - 0.4) <= 0.03, `esperava +0,40 s, deu ${r.desvioS}`);
  assert.equal(r.erro, undefined);
  // Uma janela chegou: com força >= 6 não se gasta a segunda.
  assert.equal(registo.filter((c) => c.canal === 'colega').length, 1);
});

test('e ao contrário: quem chegou 0,4 s ANTES dá -0,4 s', async () => {
  const somDe = somDeFontes({ ref: REF, adiantado: junto(-0.4, 4) });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['adiantado'], somDe }));
  assert.equal(r.estado, 'estava');
  assert.ok(Math.abs(r.desvioS + 0.4) <= 0.03, `esperava -0,40 s, deu ${r.desvioS}`);
});

// O sinal tem de ser o de sinal.js, lido como (candidato, referência), e tem
// de dar o ajuste que `resolver` daria. Um erro aqui empurrava o ângulo para o
// lado errado e continuava a parecer uma medição.
test('o desvio é o de sinal.js com (candidato, referência), e é o ajuste relativo de resolver', async () => {
  const cand = junto(0.4, 3);
  const de = s(20);
  const ate = s(40);
  const direto = desvio(envolvente(cand.subarray(de, ate)), envolvente(REF.subarray(de, ate)), { limiteS: 8 });
  const somDe = somDeFontes({ ref: REF, colega: cand });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe }));

  assert.equal(r.desvioS, direto.desvioS);
  assert.equal(r.forca, direto.forca);
  // Pela ordem inversa o sinal troca — é por isso que a ordem está fixada.
  const inverso = desvio(envolvente(REF.subarray(de, ate)), envolvente(cand.subarray(de, ate)), { limiteS: 8 });
  assert.ok(Math.abs(inverso.desvioS + r.desvioS) < 0.011);

  const { ajustes } = resolver([{ a: 'colega', b: 'ref', desvioS: r.desvioS }], ['colega', 'ref']);
  assert.ok(Math.abs((ajustes.colega - ajustes.ref) - r.desvioS) < 1e-9,
    'o atrasado avança exactamente desvioS em relação à referência');
});

test('um canal 50x mais baixo continua a ser "estava"', async () => {
  const somDe = somDeFontes({ ref: REF, baixinho: junto(0.4, 5, 0.02) });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['baixinho'], somDe }));
  assert.equal(r.estado, 'estava');
  assert.ok(Math.abs(r.desvioS - 0.4) <= 0.03);
});

test('cliques sem nada em comum dão "nao", e sem desvio', async () => {
  // Sementes escolhidas de propósito, para passar pelos dois caminhos: as três
  // primeiras caem entre 5 e 6 na primeira janela e é a segunda que as derruba,
  // as outras três ficam abaixo de 5 à primeira.
  //
  // Isto NÃO mede a taxa de acaso, que vem do som real (MESMA-CENA.md). Este
  // gerador tem a cauda mais pesada: nas sementes 3 a 202 contra REF, 37 de 200
  // passam de 5 e 2 passam de 6 (o teste seguinte mostra uma). Das 35 que
  // ficaram entre 5 e 6, a segunda janela derrubou todas.
  const sementes = [644, 712, 304, 100, 151, 185];
  const nomes = sementes.map((x) => `longe${x}`);
  const fontes = { ref: REF };
  sementes.forEach((x) => { fontes[`longe${x}`] = longe(x); });
  const registo = [];
  const rs = await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: nomes, somDe: somDeFontes(fontes, { registo }),
  }));
  assert.equal(rs.length, nomes.length);
  for (const r of rs) {
    assert.equal(r.estado, 'nao', `${r.canal} deu ${r.estado} com força ${r.forca.toFixed(2)}`);
    assert.equal(r.desvioS, null, 'o pico de uma coincidência não é um atraso');
    assert.ok(r.forca < FORCA_ESTAVA);
    // Só quem caiu entre 5 e 6 pode ter gasto uma segunda janela.
    const pedidos = registo.filter((c) => c.canal === r.canal).length;
    assert.equal(pedidos, r.forca >= FORCA_TALVEZ ? 2 : 1, `${r.canal}: ${pedidos} pedidos com força ${r.forca}`);
  }
  // Se isto falhar depois de uma mudança em sinal.js, o módulo pode estar
  // certo: as forças de acaso mudaram e é preciso escolher outras sementes.
  const quantasSegundas = rs.filter((r) => r.forca >= FORCA_TALVEZ).length;
  assert.ok(quantasSegundas >= 2, `só ${quantasSegundas} coincidências chegaram à segunda janela`);
});

// Escrito para ninguém ler o teste de cima como "um canal sem nada em comum dá
// sempre 'nao'". O 6 separou sem erro 87 janelas de som real; não é uma
// garantia, e o módulo não finge que é: diz a força, e um acaso destes chega
// perto do limite (6,6), longe dos 13,8 medidos entre quem estava junto.
test('acima de 6 é "estava" mesmo quando é acaso: o limite é o medido, não uma garantia', async () => {
  const somDe = somDeFontes({ ref: REF, longe55: longe(55) });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['longe55'], somDe }));
  assert.ok(r.forca >= FORCA_ESTAVA && r.forca < 7, `força ${r.forca.toFixed(2)}`);
  assert.equal(r.estado, 'estava');
});

// ── sem som ───────────────────────────────────────────────────────────────

test('sem som, pouco som e silêncio digital são "sem-som" — nunca "nao"', async () => {
  const fontes = {
    ref: REF,
    colega: junto(0.4, 3),
    // null: o canal não estava a transmitir naquele instante.
    // 3 s: menos do que `desvio` aceita medir.
    curto: (deMs) => REF.subarray(s((deMs - T0) / 1000), s((deMs - T0) / 1000) + s(3)),
    // Mudo: pode estar ao lado e simplesmente não se ouvir.
    mudo: new Float32Array(N),
  };
  const rs = porCanal(await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['nulo', 'curto', 'mudo', 'colega'], somDe: somDeFontes(fontes),
  })));
  for (const nome of ['nulo', 'curto', 'mudo']) {
    assert.equal(rs[nome].estado, 'sem-som', nome);
    assert.equal(rs[nome].forca, 0, nome);
    assert.equal(rs[nome].desvioS, null, nome);
  }
  // Só o curto tinha som: é o único a quem se deve uma explicação.
  assert.match(rs.curto.aviso, /3\.0 s/);
  assert.equal(rs.nulo.aviso, undefined);
  assert.equal(rs.mudo.aviso, undefined);
  assert.equal(rs.colega.estado, 'estava');
});

// ── janelas cortadas ──────────────────────────────────────────────────────

/** `fonte` só até `fimS` do relógio: o VOD acaba ali, ou ao vivo ainda não foi gravado. */
const ate = (fonte, fimS) => (deMs, duracaoS) => {
  const de = s((deMs - T0) / 1000);
  return fonte.subarray(de, Math.max(de, Math.min(s(fimS), de + s(duracaoS))));
};

test('uma janela cortada (o VOD acaba a meio dela) não é medida: fica "sem-som", com aviso', async () => {
  // Os limites 6 e 5 foram medidos em janelas de 20 s. Com menos som, a mesma
  // procura de 8 s para cada lado deixa o acaso chegar lá: com este gerador,
  // 80 comboios sem nada em comum cortados a 8 s davam 27 "estava" (inteiros,
  // nenhum). O colega estava mesmo junto, mas 12 s não chegam para o dizer
  // com os números medidos, e um "estava" que é sorte vale menos do que um
  // "não deu para medir" dito.
  const fontes = { ref: REF, colega: ate(junto(0.4, 3), 32) };
  for (let i = 0; i < 12; i++) fontes[`longe${1000 + i * 7}`] = ate(longe(1000 + i * 7), 28);
  const nomes = Object.keys(fontes).filter((k) => k !== 'ref');
  const rs = porCanal(await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: nomes, somDe: somDeFontes(fontes),
  })));
  for (const nome of nomes) {
    const r = rs[nome];
    assert.equal(r.estado, 'sem-som', `${nome} deu ${r.estado} com força ${r.forca.toFixed(2)}`);
    assert.equal(r.forca, 0, nome);
    assert.equal(r.desvioS, null, nome);
    assert.match(r.aviso, nome === 'colega' ? /12\.0 s/ : /8\.0 s/, nome);
  }
});

test('uns décimos a menos no fim da janela ainda contam como janela inteira', async () => {
  // O som descodificado pode vir umas dezenas de ms mais curto do que a
  // playlist diz (frames de AAC, arredondamentos). Isso não é um VOD a acabar.
  const somDe = somDeFontes({ ref: ate(REF, 39.6), colega: ate(junto(0.4, 3), 39.6) });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe }));
  assert.equal(r.estado, 'estava');
  assert.equal(r.aviso, undefined);
});

test('um canal que falha fica "sem-som" com a razão, e não leva os outros', async () => {
  const base = somDeFontes({ ref: REF, colega: junto(0.4, 3) });
  const somDe = async (canal, deMs, duracaoS, op) => {
    if (canal === 'partido') throw new Error('segmento 403');
    return base(canal, deMs, duracaoS, op);
  };
  const rs = porCanal(await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['partido', 'colega'], somDe,
  })));
  assert.equal(rs.partido.estado, 'sem-som');
  assert.equal(rs.partido.erro, 'segmento 403');
  assert.equal(rs.colega.estado, 'estava');
});

test('um browser sem AAC acaba com a procura toda, e dá por isso na referência', async () => {
  const registo = [];
  const base = somDeFontes({ ref: REF, a: junto(0.4, 3) }, { registo });
  const somDe = async (canal, deMs, duracaoS, op) => {
    if (canal === 'ref') throw Object.assign(new Error('sem AAC'), { name: 'SEM-DESCODIFICADOR' });
    return base(canal, deMs, duracaoS, op);
  };
  await assert.rejects(
    tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['a', 'b', 'c'], somDe })),
    { name: 'SEM-DESCODIFICADOR' },
  );
  assert.equal(registo.length, 0, 'nenhum candidato chegou a ser pedido');
});

test('um canal que não se descodifica fica "sem-som" com a razão, e não leva os outros', async () => {
  // A referência já se descodificou neste browser: AAC há. Um canal que mesmo
  // assim dá SEM-DESCODIFICADOR tem um problema só dele (um segmento que não
  // começa num cabeçalho ADTS, uma configuração de áudio que o browser recusa),
  // e há 500 à espera.
  const base = somDeFontes({ ref: REF, colega: junto(0.4, 3) });
  const somDe = async (canal, deMs, duracaoS, op) => {
    if (canal === 'esquisito') throw Object.assign(new Error('sem AAC'), { name: 'SEM-DESCODIFICADOR' });
    return base(canal, deMs, duracaoS, op);
  };
  const rs = porCanal(await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['esquisito', 'colega'], somDe, paralelos: 1,
  })));
  assert.equal(rs.esquisito.estado, 'sem-som');
  assert.equal(rs.esquisito.erro, 'sem AAC');
  assert.equal(rs.colega.estado, 'estava');
});

test('a referência sem som é dita como tal, e ninguém mais é descarregado', async () => {
  for (const [porque, fonte] of [
    ['nula', null],
    ['muda', new Float32Array(N)],
    ['curta', () => REF.subarray(s(20), s(23))],
    // 12 s: o VOD da referência acaba a meio da janela. Medir assim punha
    // todos os candidatos contra uma janela onde o acaso chega a 6.
    ['cortada', () => REF.subarray(s(20), s(32))],
    ['partida', () => { throw new Error('segmento 404'); }],
  ]) {
    const registo = [];
    const somDe = somDeFontes({ ref: fonte, colega: junto(0.4, 3) }, { registo });
    await assert.rejects(
      tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega'], somDe })),
      (e) => {
        assert.equal(e.name, 'REFERENCIA-SEM-SOM', porque);
        if (porque === 'partida') assert.equal(e.cause.message, 'segmento 404');
        if (porque === 'cortada') assert.match(e.message, /12\.0 s/);
        return true;
      },
    );
    assert.deepEqual(registo.map((c) => c.canal), ['ref'], `${porque}: só a referência foi pedida`);
  }
});

// ── o que se pede, e quantas vezes ───────────────────────────────────────

test('a referência é pedida uma vez, com as duas janelas; cada candidato só a sua', async () => {
  const registo = [];
  const somDe = somDeFontes({ ref: REF, colega: junto(0.4, 3), outro: longe(7) }, { registo });
  await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega', 'outro'], somDe }));

  const daRef = registo.filter((c) => c.canal === 'ref');
  assert.equal(daRef.length, 1);
  assert.equal(daRef[0].deMs, QUANDO - 10_000, 'o momento fica no meio da janela');
  assert.equal(daRef[0].duracaoS, 40);
  // A referência sai primeiro e sozinha.
  assert.equal(registo[0].canal, 'ref');
  const colega = registo.find((c) => c.canal === 'colega');
  assert.equal(colega.deMs, QUANDO - 10_000);
  assert.equal(colega.duracaoS, 20);
  // Cada chamada leva um AbortSignal, para um download a meio poder ser largado.
  for (const c of registo) assert.ok(c.opcoes?.sinal instanceof AbortSignal);
});

test('a referência e os repetidos não são candidatos, venham como nome ou como linha', async () => {
  const registo = [];
  const somDe = somDeFontes({ ref: REF, colega: junto(0.4, 3) }, { registo });
  const linhaColega = { slug: 'colega' };
  const rs = await tudo(procurarAngulos({
    quandoMs: QUANDO,
    referencia: { slug: 'ref' },
    candidatos: ['@REF', linhaColega, 'colega', ' Colega ', { slug: 'ref' }, null],
    somDe,
  }));
  assert.equal(rs.length, 1);
  assert.equal(rs[0].canal, linhaColega, 'devolve o canal tal como veio');
  assert.equal(registo.filter((c) => c.canal === 'ref').length, 1);
  assert.equal(registo.filter((c) => c.canal === 'colega').length, 1);
});

test('sem candidatos não se descarrega nada, nem a referência', async () => {
  const registo = [];
  const somDe = somDeFontes({ ref: REF }, { registo });
  assert.deepEqual(await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: [], somDe })), []);
  assert.deepEqual(await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['ref'], somDe })), []);
  assert.equal(registo.length, 0);
});

test('um somDe síncrono também serve', async () => {
  const somDe = (canal, deMs, duracaoS) => {
    const fonte = { ref: REF, colega: junto(0.4, 3) }[canal];
    if (!fonte) return null;
    const de = s((deMs - T0) / 1000);
    return fonte.subarray(de, de + s(duracaoS));
  };
  const c = new AbortController();
  const rs = porCanal(await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['x', 'colega'], somDe, sinal: c.signal,
  })));
  assert.equal(rs.x.estado, 'sem-som');
  assert.equal(rs.colega.estado, 'estava');
});

// ── a segunda janela ──────────────────────────────────────────────────────

/**
 * Um candidato que, na primeira janela, cai entre 5 e 6 ao desvio certo.
 *
 * Procura-se a mistura em vez de a escrever à mão: um número fixo (0,1 da
 * cena, por exemplo) deixava de cair na faixa à primeira mudança em sinal.js,
 * e o teste partia por uma razão que não é deste módulo.
 */
const acharTalvez = (() => {
  const achados = new Map();
  // A primeira janela por defeito é a de 20 a 40 s; outra `janelaS` muda-a.
  return (deS = 20, ateS = 40) => {
    const chave = `${deS}-${ateS}`;
    if (achados.has(chave)) return achados.get(chave);
    const refEnv = envolvente(REF.subarray(s(deS), s(ateS)));
    const proprio = misturar([cliques(31), 1], [ruido(32), 1]);
    const comAlfa = (alfa) => misturar([atrasado(CENA, 0.4), alfa], [proprio, 1]);
    const medir = (alfa) => desvio(envolvente(comAlfa(alfa).subarray(s(deS), s(ateS))), refEnv, { limiteS: 8 });
    let baixo = 0;
    let alto = 0.5;
    for (let i = 0; i < 16; i++) {
      const alfa = (baixo + alto) / 2;
      const m = medir(alfa);
      const certo = Math.abs(m.desvioS - 0.4) <= 0.05;
      if (certo && m.forca >= 5.15 && m.forca <= 5.85) {
        const achado = { primeira: comAlfa(alfa), forca: m.forca };
        achados.set(chave, achado);
        return achado;
      }
      if (certo && m.forca > 5.85) alto = alfa; else baixo = alfa;
    }
    throw new Error('não encontrei uma mistura entre 5 e 6 — o sinal sintético mudou, rever acharTalvez');
  };
})();

test('entre 5 e 6, uma segunda janela que concorda faz "estava"', async () => {
  const { primeira, forca } = acharTalvez();
  assert.ok(forca >= FORCA_TALVEZ && forca < FORCA_ESTAVA, `pré-condição: ${forca}`);
  const registo = [];
  const confirma = emendar(primeira, junto(0.4, 33), 40);
  const somDe = somDeFontes({ ref: REF, quase: confirma }, { registo });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));

  assert.equal(r.estado, 'estava');
  assert.equal(r.forca, forca, 'a força dita é a da janela do momento');
  assert.ok(Math.abs(r.desvioS - 0.4) <= 0.05);
  const pedidos = registo.filter((c) => c.canal === 'quase');
  assert.deepEqual(pedidos.map((c) => [c.deMs, c.duracaoS]), [[QUANDO - 10_000, 20], [QUANDO + 10_000, 20]],
    'a segunda janela são os 20 s a seguir à primeira');
});

test('entre 5 e 6, uma segunda janela forte mas noutro atraso faz "nao"', async () => {
  // O caso de música em loop: bate com força, mas no sítio errado.
  const { primeira } = acharTalvez();
  const outroAtraso = emendar(primeira, junto(3, 34), 40);
  const somDe = somDeFontes({ ref: REF, quase: outroAtraso });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));
  assert.equal(r.estado, 'nao');
  assert.equal(r.desvioS, null);
});

test('entre 5 e 6, uma segunda janela sem nada em comum faz "nao"', async () => {
  const { primeira } = acharTalvez();
  const derruba = emendar(primeira, misturar([ruido(35), 1]), 40);
  const somDe = somDeFontes({ ref: REF, quase: derruba });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));
  assert.equal(r.estado, 'nao');
});

test('entre 5 e 6 e sem segunda janela (ao vivo, ainda não gravada) fica "talvez"', async () => {
  const { primeira, forca } = acharTalvez();
  const ate40 = (deMs, duracaoS) => {
    const de = s((deMs - T0) / 1000);
    return de >= s(40) ? null : primeira.subarray(de, de + s(duracaoS));
  };
  const somDe = somDeFontes({ ref: REF, quase: ate40 });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));
  assert.equal(r.estado, 'talvez');
  assert.equal(r.forca, forca);
  assert.ok(Math.abs(r.desvioS - 0.4) <= 0.05, 'o talvez leva o desvio, para a página o poder mostrar');
});

test('se a segunda janela falhar, fica "talvez" com a razão', async () => {
  const { primeira } = acharTalvez();
  const base = somDeFontes({ ref: REF, quase: primeira });
  const somDe = async (canal, deMs, duracaoS, op) => {
    if (canal === 'quase' && deMs > QUANDO) throw new Error('segmento 500');
    return base(canal, deMs, duracaoS, op);
  };
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));
  assert.equal(r.estado, 'talvez');
  assert.equal(r.erro, 'segmento 500');
});

test('se a referência só tiver a primeira janela, o talvez fica e não se gasta outro download', async () => {
  const { primeira } = acharTalvez();
  // 20 s: a segunda janela da referência não existe; 28 s: tem só 8 s, e
  // medida assim decidia com os limites de uma janela inteira.
  for (const segundosDaRef of [20, 28]) {
    const registo = [];
    const somDe = somDeFontes({ ref: ate(REF, 20 + segundosDaRef), quase: emendar(primeira, junto(0.4, 33), 40) }, { registo });
    const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));
    assert.equal(r.estado, 'talvez', `referência com ${segundosDaRef} s`);
    assert.equal(registo.filter((c) => c.canal === 'quase').length, 1, `referência com ${segundosDaRef} s`);
  }
});

test('entre 5 e 6, uma segunda janela cortada não decide: fica "talvez", com aviso', async () => {
  // O VOD do candidato acaba 8 s depois da primeira janela. Esses 8 s até
  // batem com a referência, mas os limites são de janelas inteiras.
  const { primeira, forca } = acharTalvez();
  const somDe = somDeFontes({ ref: REF, quase: ate(emendar(primeira, junto(0.4, 33), 40), 48) });
  const [r] = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe }));
  assert.equal(r.estado, 'talvez');
  assert.equal(r.forca, forca);
  assert.ok(Math.abs(r.desvioS - 0.4) <= 0.05);
  assert.match(r.aviso, /segunda janela/);
  assert.match(r.aviso, /8\.0 s/);
});

test('com janelaS 30 as janelas são de 30 s: a da referência, a do candidato e a segunda', async () => {
  // Nenhum outro teste muda a janela, e um 20 escrito à mão no módulo (no
  // tamanho da janela ou no início da segunda) passava em todos eles.
  const { primeira, forca } = acharTalvez(15, 45);
  assert.ok(forca >= FORCA_TALVEZ && forca < FORCA_ESTAVA, `pré-condição: ${forca}`);
  const registo = [];
  const somDe = somDeFontes({ ref: REF, quase: emendar(primeira, junto(0.4, 33), 45) }, { registo });
  const [r] = await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['quase'], somDe, janelaS: 30,
  }));
  assert.equal(r.estado, 'estava');
  assert.equal(r.forca, forca, 'a força é a de 30 s contra 30 s');
  assert.deepEqual(registo.map((c) => [c.canal, c.deMs, c.duracaoS]), [
    ['ref', QUANDO - 15_000, 60],
    ['quase', QUANDO - 15_000, 30],
    ['quase', QUANDO + 15_000, 30],
  ]);
});

// ── a ordem de chegada e o tecto ──────────────────────────────────────────

test('cada candidato sai logo que fica decidido, e não pela ordem de entrada', async () => {
  const demora = { a: 80, b: 10, c: 40 };
  const somDe = somDeFontes({ ref: REF }, { demora: (c) => demora[c] ?? 0 });
  const rs = await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['a', 'b', 'c'], somDe, paralelos: 3,
  }));
  assert.deepEqual(rs.map((r) => r.canal), ['b', 'c', 'a']);

  // Um de cada vez, a ordem de chegada passa a ser a de entrada.
  const umAUm = await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['a', 'b', 'c'], somDe, paralelos: 1,
  }));
  assert.deepEqual(umAUm.map((r) => r.canal), ['a', 'b', 'c']);
});

test('quem acaba cedo sai antes, mesmo com sons a medir (o colega lento chega no fim)', async () => {
  const somDe = somDeFontes(
    { ref: REF, colega: junto(0.4, 3) },
    { demora: (c) => ({ colega: 120, mudo1: 5, mudo2: 15 }[c] ?? 0) },
  );
  const rs = await tudo(procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['colega', 'mudo1', 'mudo2'], somDe,
  }));
  assert.deepEqual(rs.map((r) => [r.canal, r.estado]), [['mudo1', 'sem-som'], ['mudo2', 'sem-som'], ['colega', 'estava']]);
});

test('nunca há mais do que `paralelos` pedidos no ar, segundas janelas incluídas', async () => {
  const { primeira } = acharTalvez();
  const fontes = { ref: REF, quase1: emendar(primeira, junto(0.4, 33), 40), quase2: emendar(primeira, junto(0.4, 36), 40) };
  const nomes = ['quase1', ...Array.from({ length: 16 }, (_, i) => `vazio${i}`), 'quase2'];
  const base = somDeFontes(fontes);
  let noAr = 0;
  let maximo = 0;
  let noArNaReferencia = null;
  let refPronta = false;
  let antesDaRef = 0;
  const pedidos = {};
  const somDe = async (canal, deMs, duracaoS, op) => {
    noAr++;
    maximo = Math.max(maximo, noAr);
    pedidos[canal] = (pedidos[canal] ?? 0) + 1;
    if (canal === 'ref') noArNaReferencia = noAr;
    else if (!refPronta) antesDaRef++;
    try {
      await esperar(3 + ((canal.length * 7 + deMs / 1000) % 11));
      return await base(canal, deMs, duracaoS, op);
    } finally {
      noAr--;
      if (canal === 'ref') refPronta = true;
    }
  };
  const rs = await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: nomes, somDe, paralelos: 4 }));

  assert.equal(rs.length, nomes.length);
  assert.equal(maximo, 4, 'o tecto é respeitado, e usado');
  assert.equal(noArNaReferencia, 1, 'a referência vai sozinha');
  assert.equal(antesDaRef, 0, 'nenhum candidato sai antes de a referência chegar');
  assert.equal(pedidos.quase1, 2);
  assert.equal(pedidos.quase2, 2);
  const r = porCanal(rs);
  assert.equal(r.quase1.estado, 'estava');
  assert.equal(r.quase2.estado, 'estava');
});

// ── cancelar ──────────────────────────────────────────────────────────────

test('já cancelado: rejeita sem pedir nada', async () => {
  const registo = [];
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    tudo(procurarAngulos({
      quandoMs: QUANDO, referencia: 'ref', candidatos: ['a'], somDe: somDeFontes({ ref: REF }, { registo }), sinal: c.signal,
    })),
    { name: 'AbortError' },
  );
  assert.equal(registo.length, 0);
});

test('cancelar a meio rejeita logo, larga o que está no ar e não pede mais nada', async () => {
  const registo = [];
  // Os lentos IGNORAM o sinal de propósito: o cancelamento não pode depender
  // de quem descarrega colaborar.
  const somDe = somDeFontes({ ref: REF }, { registo, demora: (c) => (c === 'rapido' ? 5 : c === 'ref' ? 0 : 300) });
  const c = new AbortController();
  const gerado = procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['rapido', 'lento1', 'lento2', 'lento3', 'lento4'],
    somDe, paralelos: 2, sinal: c.signal,
  });
  const primeiro = await gerado.next();
  assert.equal(primeiro.value.canal, 'rapido');
  const pedidosAoCancelar = registo.length;
  assert.deepEqual(registo.map((x) => x.canal), ['ref', 'rapido', 'lento1', 'lento2']);

  c.abort();
  const t = Date.now();
  await assert.rejects(gerado.next(), { name: 'AbortError' });
  assert.ok(Date.now() - t < 150, `demorou ${Date.now() - t} ms a largar: esperou pelos downloads`);
  for (const x of registo.slice(1)) assert.equal(x.opcoes.sinal.aborted, true, `${x.canal} não foi largado`);

  await esperar(400);
  assert.equal(registo.length, pedidosAoCancelar, 'depois de cancelar não sai mais nenhum pedido');
  assert.deepEqual(await gerado.next(), { value: undefined, done: true });
});

test('cancelar enquanto a referência descarrega rejeita logo', async () => {
  const registo = [];
  const somDe = somDeFontes({ ref: REF }, { registo, demora: (c) => (c === 'ref' ? 300 : 0) });
  const c = new AbortController();
  setTimeout(() => c.abort(), 20);
  const t = Date.now();
  await assert.rejects(
    tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: ['a', 'b'], somDe, sinal: c.signal })),
    { name: 'AbortError' },
  );
  assert.ok(Date.now() - t < 200, `demorou ${Date.now() - t} ms`);
  await esperar(350);
  assert.deepEqual(registo.map((x) => x.canal), ['ref']);
});

test('cancelar com quem lê ocupado (fora do next) também pára os pedidos', async () => {
  const registo = [];
  // Estes IGNORAM o sinal, como uma cache, um somDe síncrono por dentro, ou o
  // somDoCanal quando devolve null antes de ir à rede.
  const somDe = somDeFontes({ ref: REF }, { registo, demora: (c) => (c === 'ref' ? 0 : 5) });
  const c = new AbortController();
  const gerado = procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: Array.from({ length: 20 }, (_, i) => `c${i}`),
    somDe, paralelos: 1, sinal: c.signal,
  });
  await gerado.next();
  c.abort();
  const aoCancelar = registo.length;
  // A página ainda está a desenhar o resultado anterior: ninguém chama next().
  await esperar(100);
  assert.equal(registo.length, aoCancelar, `${registo.length - aoCancelar} pedidos saíram depois de cancelar`);
  await assert.rejects(gerado.next(), { name: 'AbortError' });
});

test('resultados à espera não saem depois de cancelar', async () => {
  const somDe = somDeFontes({ ref: REF }, { demora: (c) => (c === 'ref' ? 0 : 5) });
  const c = new AbortController();
  const gerado = procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', candidatos: ['a', 'b', 'c'], somDe, paralelos: 3, sinal: c.signal,
  });
  await gerado.next();
  // Os outros dois acabam enquanto "a página" está ocupada.
  await esperar(50);
  c.abort();
  await assert.rejects(gerado.next(), { name: 'AbortError' });
});

test('sair do ciclo a meio (break) larga os downloads e não pede mais', async () => {
  const registo = [];
  let rejeitados = 0;
  // Estes respeitam o sinal, como o fetch: rejeitam com AbortError — e essa
  // rejeição não pode sair como "não tratada".
  const somDe = async (canal, deMs, duracaoS, op) => {
    registo.push({ canal, op });
    if (canal === 'ref') return REF.subarray(s(20), s(60));
    if (canal === 'rapido') return null;
    return new Promise((ok, nao) => {
      const t = setTimeout(() => ok(null), 300);
      op.sinal.addEventListener('abort', () => {
        clearTimeout(t);
        rejeitados++;
        nao(new DOMException('cancelado', 'AbortError'));
      }, { once: true });
    });
  };
  for await (const r of procurarAngulos({
    quandoMs: QUANDO, referencia: 'ref', somDe, paralelos: 3,
    candidatos: ['rapido', 'lento1', 'lento2', 'lento3', 'lento4', 'lento5'],
  })) {
    assert.equal(r.canal, 'rapido');
    break;
  }
  // O rápido acabou e o lugar dele passou logo ao lento3: três no ar.
  assert.deepEqual(registo.map((x) => x.canal), ['ref', 'rapido', 'lento1', 'lento2', 'lento3']);
  assert.equal(rejeitados, 3, 'os três downloads no ar foram largados');
  await esperar(350);
  assert.equal(registo.length, 5, 'lento4 e lento5 nunca chegaram a ser pedidos');
});

// ── entradas erradas ──────────────────────────────────────────────────────

test('entradas erradas são ditas, não penduradas', async () => {
  const base = { quandoMs: QUANDO, referencia: 'ref', candidatos: ['a'], somDe: somDeFontes({ ref: REF }) };
  await assert.rejects(tudo(procurarAngulos({ ...base, paralelos: 0 })), RangeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, paralelos: 2.5 })), RangeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, janelaS: 0 })), RangeError);
  // Abaixo de 5 s nem há medida; abaixo de 20 s há, mas os limites 6 e 5 já
  // não valem (com este gerador, janelas de 10 s puseram 28 de 150 comboios
  // sem nada em comum acima de 6, contra 2 de 150 com 20 s). O erro é de quem
  // chama, e não da referência "sem som".
  await assert.rejects(tudo(procurarAngulos({ ...base, janelaS: 5 })), RangeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, janelaS: 12 })), RangeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, janelaS: NaN })), RangeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, limiteS: -1 })), RangeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, quandoMs: NaN })), TypeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, candidatos: 'tchubi' })), TypeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, candidatos: undefined })), TypeError);
  await assert.rejects(tudo(procurarAngulos({ ...base, somDe: undefined })), TypeError);
});

// ── a decisão, na fronteira ───────────────────────────────────────────────

test('classificar: os limites medidos, exactamente na fronteira', () => {
  const m = (forca, desvioS = 0.4) => ({ forca, desvioS });
  assert.equal(classificar(m(FORCA_ESTAVA)), 'estava');
  assert.equal(classificar(m(13.8)), 'estava');
  assert.equal(classificar(m(5.999)), 'talvez');
  assert.equal(classificar(m(FORCA_TALVEZ)), 'talvez');
  assert.equal(classificar(m(4.999)), 'nao');
  assert.equal(classificar(m(0)), 'nao');

  assert.equal(classificar(null), 'sem-som');
  assert.equal(classificar(undefined), 'sem-som');
  assert.equal(classificar({ forca: 0, desvioS: null }), 'sem-som');
  assert.equal(classificar({ forca: NaN, desvioS: 0.4 }), 'sem-som');

  // A segunda janela decide entre 5 e 6, e só aí.
  assert.equal(classificar(m(5.5), m(5)), 'estava');
  assert.equal(classificar(m(5.5, 0.41), m(5, 0.66)), 'estava', '0,25 s ainda está dentro');
  assert.equal(classificar(m(5.5, 0.41), m(5, 0.16)), 'estava', 'nos dois sentidos');
  assert.equal(classificar(m(5.5, 0.41), m(9, 0.67)), 'nao', '0,26 s já não');
  assert.equal(classificar(m(5.5), m(4.99)), 'nao');
  assert.equal(classificar(m(5.5), null), 'talvez');
  assert.equal(classificar(m(5.5), { forca: 0, desvioS: null }), 'talvez');
  assert.equal(classificar(m(4), m(9)), 'nao', 'abaixo de 5 a segunda janela não salva');
  assert.equal(classificar(m(7), m(0, -5)), 'estava', 'acima de 6 a segunda janela não conta');
  assert.equal(TOLERANCIA_S, 0.25);
});

// ── a fila ────────────────────────────────────────────────────────────────

test('ordenarCandidatos: o time primeiro, depois quem estava no ar; quem não estava fica de fora', () => {
  const times = { ref: 'Raid', a: 'Outros', b: 'raid ', c: null, d: 'RAID', e: 'Outros', fora: 'Raid' };
  const noAr = new Set(['ref', 'a', 'b', 'c', 'd', 'e']);
  const r = ordenarCandidatos({
    referencia: 'ref',
    canais: ['a', 'fora', 'b', 'ref', 'c', 'd', 'b', 'e'],
    timeDe: (c) => times[c],
    noAr: (c) => noAr.has(c),
  });
  assert.deepEqual(r, ['b', 'd', 'a', 'c', 'e']);
});

test('ordenarCandidatos: sem time conhecido fica só o filtro de quem estava no ar, pela ordem de entrada', () => {
  const linhas = [{ slug: 'x' }, { slug: 'ref' }, { slug: 'y' }, { slug: 'z' }];
  const r = ordenarCandidatos({
    referencia: { slug: '@Ref' },
    canais: linhas,
    noAr: (l) => l.slug !== 'y',
  });
  assert.deepEqual(r, [linhas[0], linhas[3]], 'devolve os mesmos objectos, sem a referência');

  const semTime = ordenarCandidatos({
    referencia: 'ref', canais: ['p', 'q'], timeDe: (c) => (c === 'q' ? '' : null), noAr: () => true,
  });
  assert.deepEqual(semTime, ['p', 'q'], 'time vazio não junta ninguém');
});

test('ordenarCandidatos: sem noAr é um erro, e não 500 downloads por defeito', () => {
  assert.throws(() => ordenarCandidatos({ referencia: 'ref', canais: ['a'] }), TypeError);
  assert.throws(() => ordenarCandidatos({ referencia: 'ref', canais: 'abc', noAr: () => true }), TypeError);
  assert.deepEqual(ordenarCandidatos({ referencia: 'ref', canais: [], noAr: () => true }), []);
});

// ── o resumo ──────────────────────────────────────────────────────────────

test('resumo: os que estavam e os talvez, do mais forte para o mais fraco; os outros só contam', () => {
  const rs = [
    { canal: 'a', estado: 'estava', forca: 7, desvioS: 0.4 },
    { canal: 'b', estado: 'nao', forca: 3, desvioS: null },
    { canal: 'c', estado: 'estava', forca: 11, desvioS: 0.2 },
    { canal: 'd', estado: 'talvez', forca: 5.2, desvioS: 1 },
    { canal: 'e', estado: 'sem-som', forca: 0, desvioS: null },
    { canal: 'f', estado: 'talvez', forca: 5.8, desvioS: -1 },
    { canal: 'g', estado: 'estava', forca: 7, desvioS: 0.1 },
    { canal: 'h', estado: 'sem-som', forca: 0, desvioS: null, erro: 'segmento 403' },
    null,
    { canal: 'i', estado: 'outra-coisa' },
  ];
  const r = resumo(rs);
  assert.deepEqual(r.estava.map((x) => x.canal), ['c', 'a', 'g'], 'empate fica pela ordem de chegada');
  assert.deepEqual(r.talvez.map((x) => x.canal), ['f', 'd']);
  assert.equal(r.nao, 1);
  assert.equal(r.semSom, 2);
  assert.equal(r.estava[0].desvioS, 0.2, 'vêm inteiros, com o desvio');
  assert.deepEqual(resumo([]), { estava: [], talvez: [], nao: 0, semSom: 0 });
  assert.deepEqual(resumo(undefined), { estava: [], talvez: [], nao: 0, semSom: 0 });
});

test('de ponta a ponta: ordenar, procurar e resumir', async () => {
  const times = { ref: 'A', colega: 'A', parado: 'A', inimigo: 'B', longe: 'C' };
  const fila = ordenarCandidatos({
    referencia: 'ref',
    canais: ['longe', 'inimigo', 'parado', 'colega'],
    timeDe: (c) => times[c],
    noAr: (c) => c !== 'parado',
  });
  assert.deepEqual(fila, ['colega', 'longe', 'inimigo']);
  const somDe = somDeFontes({ ref: REF, colega: junto(0.4, 3), inimigo: junto(-1.3, 8), longe: longe(9) });
  const r = resumo(await tudo(procurarAngulos({ quandoMs: QUANDO, referencia: 'ref', candidatos: fila, somDe })));
  assert.deepEqual(r.estava.map((x) => x.canal).sort(), ['colega', 'inimigo']);
  const inimigo = r.estava.find((x) => x.canal === 'inimigo');
  assert.ok(Math.abs(inimigo.desvioS + 1.3) <= 0.03, `inimigo a ${inimigo.desvioS}`);
  assert.equal(r.nao, 1);
  assert.equal(r.semSom, 0);
});
