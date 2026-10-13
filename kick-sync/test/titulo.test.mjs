// O título do momento, a confiança na tela, o filtro da lista simples e as falas lembradas (parte sem tela).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definirIdioma } from '../site/idiomas.js';
import {
  tituloDeEtiquetas, tituloDoMomento, tituloDeDeteccao, etiquetasDoMomento, confExibida, confMedia, confDoSom, ehMedida, CONF_TITULO,
} from '../site/titulo.js';
import {
  FILTRO_VAZIO, limparFiltro, aplicarFiltro, filtroAtivo, filtraAlgo, chipsDoFiltro, semChip, lerFiltro, guardarFiltro, lutaDe,
} from '../site/simples-filtro.js';
import {
  guardarFala, acharFala, lerFalas, melhorFala, falouIsto, linhasDaTranscricao, MAX_FALAS,
} from '../site/falas.js';
import { montarIndice } from '../site/indice.js';
import { montarLista } from '../site/simples-lista.js';
import { nomeDoClipe } from '../site/clipe.js';

definirIdioma('pt');

const luta = (durS, extra = {}) => ({ tipo: 'tiros', conf: 0.9, fonte: 'rotulos', n: 22, durS, ...extra });
const e = (tipo, conf = 0.9, extra = {}) => ({ tipo, conf, fonte: 'estimado', n: 0, ...extra });

test('o título diz o que aconteceu, com a duração da luta', () => {
  assert.equal(tituloDeEtiquetas([luta(40)]), 'Luta longa (40 s de tiros)');
  assert.equal(tituloDeEtiquetas([luta(18)]), 'Luta (18 s de tiros)');
  assert.equal(tituloDeEtiquetas([luta(6)]), 'Troca de tiros rápida');
  assert.equal(tituloDeEtiquetas([luta(null)]), 'Troca de tiros');
  assert.equal(tituloDeEtiquetas([luta(40, { acertos: 5 })]), 'Luta longa (40 s de tiros, 5 acertos)');
  assert.equal(tituloDeEtiquetas([e('explosao', 0.7)]), 'Explosão');
  assert.equal(tituloDeEtiquetas([e('grito', 0.7)]), 'Grito');
  assert.equal(tituloDeEtiquetas([e('chat', 0.7)]), 'O chat explodiu');
  assert.equal(tituloDeEtiquetas([e('morte', 0.95, { mortes: [] })]), 'Morreu');
});

test('combos juntam o que passou da confiança mínima e nunca citam arma', () => {
  assert.equal(tituloDeEtiquetas([luta(40), e('morte', 0.95, { mortes: [] })]), 'Luta longa e morte');
  assert.equal(tituloDeEtiquetas([luta(20), e('explosao', 0.7), e('chat', 0.6)]), 'Luta, explosão e o chat explodiu');
  assert.equal(tituloDeEtiquetas([e('explosao', 0.7), e('grito', 0.7)]), 'Explosão e grito');
  for (const x of [luta(40), e('explosao'), e('grito')]) {
    assert.doesNotMatch(tituloDeEtiquetas([x, e('morte', 0.95, { mortes: [] })]), /rocket|foguete|c4|ak|granada|bazuca/i);
  }
});

test('marca de confiança baixa fica fora do título', () => {
  assert.equal(tituloDeEtiquetas([luta(40), e('explosao', 0.3)]), 'Luta longa (40 s de tiros)');
  assert.equal(tituloDeEtiquetas([e('explosao', 0.21)]), 'Som grave');
  assert.equal(tituloDeEtiquetas([e('chat', 0.3)]), 'Chat movimentado');
  assert.equal(tituloDeEtiquetas([luta(null, { conf: 0.37 })]), 'Som alto');
  assert.equal(tituloDeEtiquetas([]), 'Momento a conferir');
  assert.ok(CONF_TITULO > 0.21 && CONF_TITULO <= 0.55);
});

test('a morte diz os nomes quando se sabe, e quem matou quem pelo canal do cartão', () => {
  const m = (matador, vitima) => ({ ...e('morte', 0.95), mortes: [{ matador, vitima }] });
  assert.equal(tituloDeEtiquetas([m('xguiry', 'fulano')], { canal: 'xguiry' }), 'Matou fulano');
  assert.equal(tituloDeEtiquetas([m('fulano', 'xguiry')], { canal: 'xguiry' }), 'Morreu para fulano');
  assert.equal(tituloDeEtiquetas([m('a', 'b')], { canal: 'c' }), 'a matou b');
  assert.equal(tituloDeEtiquetas([m('', 'b')], { canal: 'c' }), 'b morreu');
  assert.equal(tituloDeEtiquetas([luta(40), m('xguiry', 'fulano')], { canal: 'xguiry' }), 'Luta longa e morte: matou fulano');
  const duas = { ...e('morte', 0.95), mortes: [{ matador: 'a', vitima: 'b' }, { matador: 'a', vitima: 'c' }] };
  assert.equal(tituloDeEtiquetas([duas], { canal: 'c' }), 'a matou b e mais 1 morte');
});

test('os títulos saem nas três línguas', () => {
  const et = [luta(40), e('explosao', 0.7)];
  definirIdioma('en');
  assert.equal(tituloDeEtiquetas(et), 'Long fight and explosion');
  assert.equal(tituloDeEtiquetas([luta(40)]), 'Long fight (40 s of gunfire)');
  definirIdioma('es');
  assert.equal(tituloDeEtiquetas(et), 'Pelea larga y explosión');
  assert.equal(tituloDeEtiquetas([e('chat', 0.7)]), 'El chat explotó');
  definirIdioma('pt');
});

const indiceDeTeste = () => montarIndice({
  slug: 'x', inicioMs: 0,
  som: {
    candidatosTodos: [
      { ms: 100_000, pico: 120, tiros: 18, duracaoS: 30, combateDeMs: 90_000, combateAteMs: 120_000, nImp: 40, vozMed: 0.1 },
      { ms: 130_000, pico: 110, tiros: 22, duracaoS: 25, combateDeMs: 125_000, combateAteMs: 150_000, nImp: 30, vozMed: 0.1 },
      { ms: 500_000, pico: 30, tiros: 3, duracaoS: 8, combateDeMs: 495_000, combateAteMs: 503_000, vozMed: 0.1 },
    ],
    explosoesTodas: [{ ms: 110_000, pico: 90, nota: 0.9, combateDeMs: 108_000, combateAteMs: 112_000 }],
  },
  picos: [{ ms: 140_000, msgs: 60, vezes: 12 }],
});

test('com o índice, a luta traz a soma dos segundos de tiros e a confiança calibrada', () => {
  const indice = indiceDeTeste();
  assert.equal(indice.lutas.length, 1);
  const lista = montarLista({
    picos: [{ ms: 140_000, msgs: 60, vezes: 12 }],
    sons: [
      { ms: 100_000, tipo: 'tiros', tiros: 18, pico: 120, combateDeMs: 90_000, combateAteMs: 120_000 },
      { ms: 110_000, tipo: 'explosao', combateDeMs: 108_000, combateAteMs: 112_000 },
    ],
    lutas: indice.lutas,
  });
  const m = lista.find((x) => x.luta);
  const et = etiquetasDoMomento(m, indice);
  const tiros = et.find((x) => x.tipo === 'tiros');
  assert.equal(tiros.durS, 40);
  assert.equal(tiros.fonte, 'rotulos');
  assert.ok(tiros.conf >= 0.9);
  assert.ok(et.some((x) => x.tipo === 'explosao' && x.fonte === 'sintetico'));
  assert.ok(et.some((x) => x.tipo === 'chat' && x.fonte === 'estimado'));
  assert.equal(tituloDoMomento(m, indice), 'Luta longa, explosão e o chat explodiu');
  const exib = confExibida(et);
  assert.equal(exib.tipo, 'tiros');
  assert.equal(exib.estimativa, false);
  assert.match(exib.texto, /^Luta \d+%$/);
});

test('a confiança na tela: medida sem til, estimativa com til', () => {
  assert.equal(confExibida([luta(30, { conf: 0.88 })]).texto, 'Luta 88%');
  assert.equal(confExibida([e('grito', 0.7)]).texto, 'Grito ~70%');
  assert.equal(confExibida([{ tipo: 'morte', conf: 0.95, fonte: 'servidor', n: 0, mortes: [] }]).texto, 'Morte 95%');
  assert.equal(confExibida([e('chat', null)]), null);
  assert.equal(confExibida([]), null);
  // poucos exemplos: ainda é estimativa
  assert.equal(ehMedida({ conf: 1, fonte: 'rotulos', n: 2 }), false);
  assert.equal(ehMedida({ conf: 1, fonte: 'rotulos', n: 5 }), true);
  // a principal é a luta, mesmo com um chat mais forte
  assert.equal(confExibida([e('chat', 0.9), luta(30, { conf: 0.6 })]).tipo, 'tiros');
});

test('a média do filtro: estimativa se qualquer parte é estimativa', () => {
  const m = (...etiquetas) => ({ etiquetas, tipos: [] });
  assert.deepEqual(confMedia([m(luta(30, { conf: 0.9 })), m(luta(30, { conf: 0.7 }))]), { pct: 80, estimativa: false, n: 2 });
  assert.deepEqual(confMedia([m(luta(30, { conf: 0.9 })), m(e('grito', 0.5))]), { pct: 70, estimativa: true, n: 2 });
  assert.equal(confMedia([]), null);
});

test('a confiança de cada som vem do mesmo critério do índice', () => {
  assert.equal(confDoSom('tiros', { pico: 120 }).fonte, 'rotulos');
  assert.equal(confDoSom('tiros', { pico: 30 }).conf, 0.37);
  assert.equal(confDoSom('explosao', { nota: 0.9 }).fonte, 'sintetico');
  assert.equal(confDoSom('grito', { pico: 4 }).conf, 0.5);
  assert.equal(confDoSom('grito', {}).fonte, 'estimado');
  assert.equal(confDoSom('chat', { vezes: 6 }).conf, 0.5);
});

// ── o filtro ─────────────────────────────────────────────────────────────

const mom = (ms, nota, pontos, etiquetas, extra = {}) => ({
  ms, deMs: ms - 5000, ateMs: ms + 25_000, nota, pontos, etiquetas, tipos: [], canal: 'x', ...extra,
});
const L = [
  mom(1000, 'muitoBom', 9, [luta(40), e('explosao', 0.7)]),
  mom(2000, 'bom', 5, [e('chat', 0.8)]),
  mom(3000, 'talvez', 2, [luta(10)], { ateMs: 3000 + 70_000 }),
  mom(4000, 'bom', 6, [e('grito', 0.7), e('explosao', 0.3)]),
];
const f = (o) => limparFiltro({ ...FILTRO_VAZIO, ...o });
const msDe = (l) => l.map((m) => m.ms);

test('filtro vazio não esconde nada e mantém a ordem da live', () => {
  assert.deepEqual(msDe(aplicarFiltro([L[3], L[0], L[1], L[2]], FILTRO_VAZIO)), [1000, 2000, 3000, 4000]);
  assert.equal(filtroAtivo(FILTRO_VAZIO), false);
});

test('filtra por tipo, nota e tamanho da luta', () => {
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['explosao'] }))), [1000]); // a explosão de 30% não conta
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['tiros', 'chat'] }))), [1000, 2000, 3000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ notaMin: 'bom' }))), [1000, 2000, 4000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ notaMin: 'muitoBom' }))), [1000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ lutaMinS: 30 }))), [1000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ lutaMinS: 10 }))), [1000, 3000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['tiros'], notaMin: 'bom' }))), [1000]);
  assert.equal(lutaDe(L[1]), 0);
});

test('ordena: melhores primeiro e mais longas', () => {
  assert.deepEqual(msDe(aplicarFiltro(L, f({ ordem: 'melhores' }))), [1000, 4000, 2000, 3000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ ordem: 'longas' }))), [1000, 3000, 2000, 4000]);
});

test('palavra dita só acha o que já tem fala lida, sem acento nem maiúscula', () => {
  const falas = (m) => (m.ms === 1000 ? [{ t: 'Olha a GRANADA!', de: 0, ate: 1 }] : m.ms === 2000 ? [{ t: 'nada demais', de: 0, ate: 1 }] : null);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ palavra: 'granada' }), { falas })), [1000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ palavra: 'olhá granada' }), { falas })), [1000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ palavra: 'inexistente' }), { falas })), []);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ palavra: 'granada' }))), []);
});

test('filtro limpo, em chips, e o que vem estragado do aparelho volta ao vazio', () => {
  assert.deepEqual(limparFiltro({ tipos: ['x', 'chat'], notaMin: 'ótima', lutaMinS: 7, ordem: 'zzz', palavra: '  oi   você ' }),
    { palavra: 'oi você', tipos: ['chat'], notaMin: '', lutaMinS: 0, ordem: 'live' });
  assert.deepEqual(limparFiltro(null), FILTRO_VAZIO);
  const fl = f({ palavra: 'granada', tipos: ['tiros', 'chat'], notaMin: 'bom', lutaMinS: 20, ordem: 'melhores' });
  const chips = chipsDoFiltro(fl);
  assert.deepEqual(chips.map((c) => c.rotulo), ['Disse "granada"', 'Luta', 'Chat', 'Nota Bom ou mais', 'Luta de 20 s ou mais', 'Melhores primeiro']);
  let r = fl;
  for (const c of chips) r = semChip(r, c);
  assert.deepEqual(r, FILTRO_VAZIO);
  assert.equal(filtraAlgo(f({ ordem: 'longas' })), false);
  assert.equal(filtroAtivo(f({ ordem: 'longas' })), true);
});

test('o filtro fica guardado no aparelho', () => {
  const dados = new Map();
  const armazem = { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v), removeItem: (k) => dados.delete(k) };
  assert.deepEqual(lerFiltro(armazem), FILTRO_VAZIO);
  guardarFiltro(armazem, f({ tipos: ['grito'], ordem: 'longas' }));
  assert.deepEqual(lerFiltro(armazem), f({ tipos: ['grito'], ordem: 'longas' }));
  guardarFiltro(armazem, FILTRO_VAZIO);
  assert.equal(dados.size, 0);
  dados.set('povix.simplesFiltro', '{estragado');
  assert.deepEqual(lerFiltro(armazem), FILTRO_VAZIO);
  const quebrado = { getItem: () => { throw new Error('privada'); }, setItem: () => { throw new Error('privada'); }, removeItem: () => {} };
  assert.deepEqual(lerFiltro(quebrado), FILTRO_VAZIO);
  assert.doesNotThrow(() => guardarFiltro(quebrado, f({ tipos: ['chat'] })));
});

// ── as falas ─────────────────────────────────────────────────────────────

const memoria = () => {
  const d = new Map();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => d.set(k, v), removeItem: (k) => d.delete(k) };
};

test('a fala lembrada acha-se pelo canal e pelo trecho que cobre o clipe', () => {
  const a = memoria();
  guardarFala(a, { canal: 'x', deMs: 100_000, ateMs: 140_000, linhas: [{ t: 'vai vai vai', de: 105_000, ate: 107_000 }] });
  assert.equal(acharFala(a, 'x', 105_000, 135_000).linhas[0].t, 'vai vai vai');
  assert.equal(acharFala(a, 'y', 105_000, 135_000), null);
  assert.equal(acharFala(a, 'x', 130_000, 200_000), null); // cobre menos de 60%
  guardarFala(a, { canal: 'x', deMs: 100_000, ateMs: 140_000, linhas: [{ t: 'outra', de: 110_000, ate: 111_000 }] });
  assert.equal(lerFalas(a).length, 1);
  for (let i = 0; i < MAX_FALAS + 5; i++) guardarFala(a, { canal: 'z', deMs: i * 100_000, ateMs: i * 100_000 + 30_000, linhas: [{ t: 'oi', de: 0, ate: 1 }] });
  assert.equal(lerFalas(a).length, MAX_FALAS);
});

test('a fala mais forte: perto do lance, com mais palavras ou exclamação', () => {
  const linhas = [
    { t: 'sim', de: 100_000, ate: 100_500 },
    { t: 'olha o tamanho dessa explosão!', de: 110_000, ate: 112_000 },
    { t: 'eu tava aqui pensando em tanta coisa que nem sei', de: 160_000, ate: 163_000 },
  ];
  assert.equal(melhorFala(linhas, 111_000), 'olha o tamanho dessa explosão!');
  assert.equal(melhorFala([], 1), '');
  assert.equal(melhorFala([{ t: 'a', de: 0, ate: 1 }], 0), '');
  assert.equal(falouIsto(linhas, 'EXPLOSAO tamanho'), true);
  assert.equal(falouIsto(linhas, 'granada'), false);
  assert.equal(falouIsto([], ''), true);
});

test('a transcrição da legenda vira linhas de texto com o tempo', () => {
  const tr = { linhas: [{ palavras: [{ t: 'vai', de: 1000, ate: 1200 }, { t: 'vai', de: 1300, ate: 1500 }] }, { palavras: [] }] };
  assert.deepEqual(linhasDaTranscricao(tr), [{ t: 'vai vai', de: 1000, ate: 1500 }]);
});

test('no avançado o título (e o nome do arquivo) sai da detecção e das vítimas marcadas', () => {
  const dd = (m) => tituloDeDeteccao({ protagonista: 'tchubi', ...m });
  assert.equal(dd({ tipo: 'tiros', tiros: 40, conf: 0.9, confFonte: 'rotulos', confN: 22 }), 'Luta longa (40 s de tiros)');
  assert.equal(dd({ tipo: 'tiros', tiros: 20, acertos: 3, conf: 0.9, confFonte: 'rotulos', confN: 22, vitimas: ['cyrus'] }), 'Luta e morte: matou cyrus');
  assert.equal(dd({ tipo: 'tiros', tiros: 20, conf: 0.37, confFonte: 'rotulos', confN: 52 }), 'Som alto');
  assert.equal(dd({ tipo: 'explosao' }), 'Explosão');
  assert.equal(dd({ tipo: 'tiros', tipos: ['tiros', 'explosao'], tiros: 5, conf: 0.9, confFonte: 'rotulos', confN: 22 }), 'Troca de tiros rápida e explosão');
  assert.equal(dd({ tipo: 'grito', conf: 0.3 }), 'Voz alta');
  assert.match(nomeDoClipe({ titulo: dd({ tipo: 'tiros', tiros: 40, conf: 0.9, confFonte: 'rotulos', confN: 22 }), canal: 'tchubi', quandoMs: 0 }), /^Luta-longa-40-s-de-tiros__tchubi__/);
});
