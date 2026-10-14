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

// `luta()` é só o SOM (fonte 'rotulos', a calibração de UM streamer, tiros.js): indício, não confirmação de que o
// próprio jogador lutou — por isso vira "Som alto"/"Tiros ouvidos" no título, nunca "Luta", a menos que o grupo
// tenha uma morte do servidor ou a etiqueta tenha o veredito do contexto (`lutaConfirmada`).
const luta = (durS, extra = {}) => ({ tipo: 'tiros', conf: 0.9, fonte: 'rotulos', n: 22, durS, ...extra });
const lutaConfirmada = (durS, extra = {}) => luta(durS, { contexto: { tipo: 'combate', participacao: 'confirmada', origem: 'ia-local', resumo: 'x' }, ...extra });
const e = (tipo, conf = 0.9, extra = {}) => ({ tipo, conf, fonte: 'estimado', n: 0, ...extra });
/** Uma etiqueta de morte como `etiquetasDoMomento` a produz de verdade: fonte 'servidor', vínculo ao POV. */
// Como o produtor (mortesDe): o vínculo e a FONTE são de CADA morte; os da etiqueta só resumem. Sem `vinculoProprio`
// ou `fonte` explícitos numa morte, vale o da etiqueta (`extra`): é o que o produtor faz quando não há marca por morte.
const morte = (mortes = [], extra = {}) => {
  const vp = extra.vinculoProprio ?? true;
  const fonteDaEtiqueta = 'fonte' in extra ? extra.fonte : 'servidor';
  return {
    tipo: 'morte', conf: 0.95, fonte: 'servidor', n: 0, ...extra, vinculoProprio: vp,
    mortes: mortes.map((k) => ({ vinculoProprio: vp, fonte: fonteDaEtiqueta, ...k })),
  };
};

test('som sozinho (sem morte nem contexto) é indício: nunca "luta", nunca percentual de combate', () => {
  // Sem o som de acerto, a duração é de quanto esteve ALTO, não de quanto teve tiro: a frase não pode afirmar
  // "de tiros" no que só mediu volume.
  assert.equal(tituloDeEtiquetas([luta(40)]), 'Som alto (40 s de som alto)');
  assert.equal(tituloDeEtiquetas([luta(18)]), 'Som alto (18 s de som alto)');
  assert.equal(tituloDeEtiquetas([luta(null)]), 'Som alto');
  // O som de acerto (acertos.js) distingue o estalo de acertar alguém: a frase diz "tiros", não só "som".
  assert.equal(tituloDeEtiquetas([luta(40, { acertos: 5 })]), 'Tiros ouvidos (40 s de tiros, 5 acertos)');
  assert.equal(tituloDeEtiquetas([e('explosao', 0.7)]), 'Explosão');
  assert.equal(tituloDeEtiquetas([e('grito', 0.7)]), 'Grito');
  assert.equal(tituloDeEtiquetas([e('chat', 0.7)]), 'O chat explodiu');
  assert.equal(tituloDeEtiquetas([e('morte', 0.95, { mortes: [] })]), 'Morreu');
  for (const x of [luta(40), luta(18), luta(null)]) assert.doesNotMatch(tituloDeEtiquetas([x]), /luta|fight|pelea/i);
  assert.equal(confExibida([luta(40)]), null, 'som sem confirmação não tem percentual de combate para mostrar');
});

test('morte do servidor, ou o contexto confirmando participação, é o que vira "luta" (com percentual)', () => {
  assert.equal(tituloDeEtiquetas([lutaConfirmada(40)]), 'Luta longa (40 s de tiros)');
  assert.equal(tituloDeEtiquetas([lutaConfirmada(18)]), 'Luta (18 s de tiros)');
  assert.equal(tituloDeEtiquetas([lutaConfirmada(6)]), 'Troca de tiros rápida');
  assert.equal(tituloDeEtiquetas([lutaConfirmada(null)]), 'Troca de tiros');
  // Confirmado, o título vira "luta" de verdade — mas o percentual NUNCA é o do som (99% do detector não é a
  // probabilidade medida da luta do jogador): é um estado, "Luta confirmada", sem número nenhum.
  assert.equal(confExibida([lutaConfirmada(40)]).texto, 'Luta confirmada');
  assert.equal(confExibida([lutaConfirmada(40)]).pct, null);
  // `indeterminado`, ou participação ausente/indeterminada, não confirma nada.
  const indet = luta(40, { contexto: { tipo: 'indeterminado', participacao: 'indeterminada', origem: 'ia-local', resumo: 'x' } });
  assert.equal(tituloDeEtiquetas([indet]), 'Som alto (40 s de som alto)');
  const proximo = luta(40, { contexto: { tipo: 'combate', participacao: 'ausente', origem: 'ia-local', resumo: 'combate perto, mas não é ele' } });
  assert.equal(tituloDeEtiquetas([proximo]), 'Som alto (40 s de som alto)', 'combate por perto não é o do jogador');
});

test('morte negativa: sem vínculo ao POV (de outro jogador, ou sem matador identificado) não confirma o combate deste', () => {
  const m = ({ vinculoProprio, ...extra } = {}) => morte([{ matador: 'a', vitima: 'b' }], { vinculoProprio, ...extra });
  // De outro jogador do evento: vinculoProprio false (mortesDe já computou isso contra m.canal).
  assert.equal(tituloDeEtiquetas([luta(40), m({ vinculoProprio: false })]), 'Som alto e morte: a matou b');
  assert.equal(confExibida([luta(40), m({ vinculoProprio: false })]).tipo, 'morte', 'a morte continua a aparecer, só não confirma o som');
  // Uma morte com fonte NÃO servidor (ex.: um futuro leitor de tela incerto) também não confirma — só o rótulo
  // 'servidor' (log/parse real) e vinculada é que vale.
  assert.equal(tituloDeEtiquetas([luta(40), m({ vinculoProprio: true, fonte: 'estimado' })]), 'Som alto e morte: a matou b');
  // Vinculada e de fonte servidor: confirma, como antes.
  assert.equal(tituloDeEtiquetas([luta(40), m({ vinculoProprio: true })]), 'Luta longa e morte: a matou b');
});

test('contexto negativo nunca é revertido por uma morte — mesmo vinculada ao POV', () => {
  const negadoPorContexto = luta(40, {
    contexto: { tipo: 'ambiente', participacao: 'ausente', origem: 'ia-local', resumo: 'nadando, sem arma' },
  });
  const vinculada = morte([{ matador: 'a', vitima: 'b' }]);
  assert.equal(tituloDeEtiquetas([negadoPorContexto, vinculada]), 'Som alto e morte: a matou b');
  assert.equal(confExibida([negadoPorContexto, vinculada]).tipo, 'morte');
});

test('etiquetasDoMomento liga a morte ao POV pelo canal do cartão (evento): outro jogador não confirma, o próprio confirma', () => {
  const base = { deMs: 0, ateMs: 10_000, ms: 5000, tipos: ['tiros', 'morte'], tiros: 40, canal: 'xguiry' };
  const deOutros = { ...base, mortes: [{ matador: 'fulano', vitima: 'cicrano', canalMatador: 'fulano', canalVitima: 'cicrano' }] };
  const etOutros = etiquetasDoMomento(deOutros);
  assert.equal(tituloDeEtiquetas(etOutros, { canal: 'xguiry' }), 'Som alto e morte: fulano matou cicrano');
  const doProprio = { ...base, mortes: [{ matador: 'xguiry', vitima: 'cicrano', canalMatador: 'xguiry', canalVitima: 'cicrano', fonte: 'servidor' }] };
  const etProprio = etiquetasDoMomento(doProprio);
  assert.equal(tituloDeEtiquetas(etProprio, { canal: 'xguiry' }), 'Luta longa e morte: matou cicrano');
});

test('combos juntam o que passou da confiança mínima e nunca citam arma', () => {
  // Morte sem nomes nem vínculo não confirma o combate (a Luta fica como indício)...
  assert.equal(tituloDeEtiquetas([luta(40), morte()]), 'Som alto e morte');
  // ...e com o matador e a vítima ligados ao POV (fonte explícita), confirma.
  const ligada = morte([{ matador: 'xguiry', vitima: 'cicrano', canalMatador: 'xguiry', fonte: 'servidor', vinculoProprio: true }]);
  assert.equal(tituloDeEtiquetas([luta(40), ligada]), 'Luta longa e morte: xguiry matou cicrano');
  assert.equal(tituloDeEtiquetas([luta(20), e('explosao', 0.7), e('chat', 0.6)]), 'Som alto, explosão e o chat explodiu');
  assert.equal(tituloDeEtiquetas([lutaConfirmada(20), e('explosao', 0.7), e('chat', 0.6)]), 'Luta, explosão e o chat explodiu');
  assert.equal(tituloDeEtiquetas([e('explosao', 0.7), e('grito', 0.7)]), 'Explosão e grito');
  for (const x of [luta(40), e('explosao'), e('grito')]) {
    assert.doesNotMatch(tituloDeEtiquetas([x, morte()]), /rocket|foguete|c4|ak|granada|bazuca/i);
  }
});

test('marca de confiança baixa fica fora do título', () => {
  assert.equal(tituloDeEtiquetas([luta(40), e('explosao', 0.3)]), 'Som alto (40 s de som alto)');
  assert.equal(tituloDeEtiquetas([e('explosao', 0.21)]), 'Som grave');
  assert.equal(tituloDeEtiquetas([e('chat', 0.3)]), 'Chat movimentado');
  assert.equal(tituloDeEtiquetas([luta(null, { conf: 0.37 })]), 'Som alto');
  assert.equal(tituloDeEtiquetas([]), 'Momento a conferir');
  assert.ok(CONF_TITULO > 0.21 && CONF_TITULO <= 0.55);
});

test('a morte diz os nomes quando se sabe, e quem matou quem pelo canal do cartão', () => {
  const m = (matador, vitima) => morte([{ matador, vitima }]);
  assert.equal(tituloDeEtiquetas([m('xguiry', 'fulano')], { canal: 'xguiry' }), 'Matou fulano');
  assert.equal(tituloDeEtiquetas([m('fulano', 'xguiry')], { canal: 'xguiry' }), 'Morreu para fulano');
  assert.equal(tituloDeEtiquetas([m('a', 'b')], { canal: 'c' }), 'a matou b');
  assert.equal(tituloDeEtiquetas([m('', 'b')], { canal: 'c' }), 'b morreu');
  assert.equal(tituloDeEtiquetas([luta(40), m('xguiry', 'fulano')], { canal: 'xguiry' }), 'Luta longa e morte: matou fulano');
  const duas = morte([{ matador: 'a', vitima: 'b' }, { matador: 'a', vitima: 'c' }]);
  assert.equal(tituloDeEtiquetas([duas], { canal: 'c' }), 'a matou b e mais 1 morte');
});

test('os títulos saem nas três línguas', () => {
  try {
    const et = [lutaConfirmada(40), e('explosao', 0.7)];
    definirIdioma('en');
    assert.equal(tituloDeEtiquetas(et), 'Long fight and explosion');
    assert.equal(tituloDeEtiquetas([lutaConfirmada(40)]), 'Long fight (40 s of gunfire)');
    assert.equal(tituloDeEtiquetas([luta(40)]), 'Loud sound (40 s of loud sound)');
    definirIdioma('es');
    assert.equal(tituloDeEtiquetas(et), 'Pelea larga y explosión');
    assert.equal(tituloDeEtiquetas([e('chat', 0.7)]), 'El chat explotó');
  } finally {
    definirIdioma('pt');
  }
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

test('com o índice, a luta traz a soma dos segundos de tiros e a confiança calibrada (preservada, para ordenar) — mas sem morte nem contexto o título e o percentual são o do indício', () => {
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
  // O dado bruto da calibração continua todo aí, para ranking (o dono, 14/10: não apagar, só parar de mostrar
  // como percentual de combate confirmado).
  assert.equal(tiros.durS, 40);
  assert.equal(tiros.fonte, 'rotulos');
  assert.ok(tiros.conf >= 0.9);
  assert.ok(et.some((x) => x.tipo === 'explosao' && x.fonte === 'sintetico'));
  assert.ok(et.some((x) => x.tipo === 'chat' && x.fonte === 'estimado'));
  // Sem morte nem contexto: o som é indício ("Som alto"), não "Luta" (e, como antes, o combo não leva a duração).
  assert.equal(tituloDoMomento(m, indice), 'Som alto, explosão e o chat explodiu');
  const exib = confExibida(et);
  assert.notEqual(exib.tipo, 'tiros', 'o som sozinho não vira a marca principal da tela');
  assert.equal(exib.tipo, 'explosao');
  assert.equal(exib.estimativa, false);
  assert.match(exib.texto, /^Explosão \d+%$/);
  // Com o contexto confirmando o combate do jogador nesta mesma etiqueta, aí sim a luta e o percentual aparecem.
  const etConfirmada = et.map((x) => (x.tipo === 'tiros'
    ? { ...x, contexto: { tipo: 'combate', participacao: 'confirmada', origem: 'ia-local', resumo: 'y' } } : x));
  assert.equal(tituloDeEtiquetas(etConfirmada), 'Luta longa, explosão e o chat explodiu');
  assert.equal(confExibida(etConfirmada).texto, 'Luta confirmada');
});

test('a confiança na tela: medida sem til, estimativa com til', () => {
  // Confirmada ou não, 'tiros' nunca mostra o percentual do som — só o estado.
  assert.equal(confExibida([lutaConfirmada(30, { conf: 0.88 })]).texto, 'Luta confirmada');
  assert.equal(confExibida([e('grito', 0.7)]).texto, 'Grito ~70%');
  assert.equal(confExibida([{ tipo: 'morte', conf: 0.95, fonte: 'servidor', n: 0, mortes: [] }]).texto, 'Morte 95%');
  assert.equal(confExibida([e('chat', null)]), null);
  assert.equal(confExibida([]), null);
  // poucos exemplos: ainda é estimativa
  assert.equal(ehMedida({ conf: 1, fonte: 'rotulos', n: 2 }), false);
  assert.equal(ehMedida({ conf: 1, fonte: 'rotulos', n: 5 }), true);
  // som sem confirmação nunca é a marca principal da tela, nem com uma confiança bruta maior que a do chat
  assert.equal(confExibida([e('chat', 0.9), luta(30, { conf: 0.99 })]).tipo, 'chat');
  // confirmado (morte ou contexto), aí sim a luta fica em cima do chat, como antes
  assert.equal(confExibida([e('chat', 0.9), lutaConfirmada(30, { conf: 0.6 })]).tipo, 'tiros');
});

test('a média do filtro: nunca conta "tiros" (confirmado ou não) — o percentual é sempre o de outro tipo', () => {
  const m = (...etiquetas) => ({ etiquetas, tipos: [] });
  // Luta CONFIRMADA: mesmo assim não entra na média (o número é do som, não da luta).
  assert.equal(confMedia([m(lutaConfirmada(30, { conf: 0.9 })), m(lutaConfirmada(30, { conf: 0.7 }))]), null);
  assert.deepEqual(confMedia([m(lutaConfirmada(30, { conf: 0.9 })), m(e('grito', 0.5))]), { pct: 50, estimativa: true, n: 1 });
  // Dois momentos de só som (sem morte, sem contexto): nenhum entra na média — era isto que inflava o
  // "confiança média ~86%, 19 de 20 momentos" com lutas nunca confirmadas.
  assert.equal(confMedia([m(luta(30, { conf: 0.9 })), m(luta(30, { conf: 0.7 }))]), null);
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
  mom(1000, 'muitoBom', 9, [lutaConfirmada(40), e('explosao', 0.7)]),
  mom(2000, 'bom', 5, [e('chat', 0.8)]),
  // Indício de som sem confirmação (nem morte vinculada, nem contexto): fica na lista padrão (sem filtro), mas
  // não é o que o filtro "Luta" (combate confirmado) nem "Luta de N s" devem casar — o caso que este trabalho
  // corrige (antes, qualquer som virava "luta" no filtro).
  mom(3000, 'talvez', 2, [luta(10)], { ateMs: 3000 + 70_000 }),
  mom(4000, 'bom', 6, [e('grito', 0.7), e('explosao', 0.3)]),
  mom(6000, 'talvez', 3, [lutaConfirmada(10)]),
];
const f = (o) => limparFiltro({ ...FILTRO_VAZIO, ...o });
const msDe = (l) => l.map((m) => m.ms);

test('filtro vazio não esconde nada e mantém a ordem da live', () => {
  assert.deepEqual(msDe(aplicarFiltro([L[3], L[0], L[1], L[2]], FILTRO_VAZIO)), [1000, 2000, 3000, 4000]);
  assert.equal(filtroAtivo(FILTRO_VAZIO), false);
});

test('filtra por tipo, nota e tamanho da luta — "Luta" é combate CONFIRMADO, indício sem confirmação não casa', () => {
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['explosao'] }))), [1000]); // a explosão de 30% não conta
  // L[2] (ms 3000) é só indício: fica fora do filtro "tiros", mesmo tendo a etiqueta — ver teste negativo abaixo.
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['tiros', 'chat'] }))), [1000, 2000, 6000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ notaMin: 'bom' }))), [1000, 2000, 4000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ notaMin: 'muitoBom' }))), [1000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ lutaMinS: 30 }))), [1000]);
  // L[4] (luta confirmada de 10 s) casa; L[2] (indício de 10 s, nunca confirmado) não casa mais.
  assert.deepEqual(msDe(aplicarFiltro(L, f({ lutaMinS: 10 }))), [1000, 6000]);
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['tiros'], notaMin: 'bom' }))), [1000]);
  assert.equal(lutaDe(L[1]), 0);
});

test('negativo: um indício de som (sem morte vinculada, sem contexto confirmando) não casa "Luta" nem entra na duração mínima — mas continua na lista padrão', () => {
  assert.deepEqual(msDe(aplicarFiltro(L, FILTRO_VAZIO)).includes(3000), true, 'sem filtro, o indício continua na lista');
  assert.deepEqual(msDe(aplicarFiltro(L, f({ tipos: ['tiros'] }))).includes(3000), false, 'com o filtro "Luta", o indício não casa');
  assert.equal(lutaDe(L[2]), 0, 'sem confirmação, a duração do indício não conta para "Luta de N s"');
});

test('ordena: melhores primeiro e mais longas', () => {
  assert.deepEqual(msDe(aplicarFiltro(L, f({ ordem: 'melhores' }))), [1000, 4000, 2000, 6000, 3000]);
  // A luta confirmada de 40 s vem primeiro; o indício de 3000 (sem confirmação, lutaDe=0) cai para o fim do
  // grupo sem luta confirmada, desempatado pela duração do CLIPE (75 s, o maior) — não pela duração do som.
  assert.deepEqual(msDe(aplicarFiltro(L, f({ ordem: 'longas' }))), [1000, 6000, 3000, 2000, 4000]);
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
  // O som sozinho é indício também no avançado (a mesma regra do simples): só a vítima marcada (morte do
  // servidor) confirma que foi luta do protagonista.
  assert.equal(dd({ tipo: 'tiros', tiros: 40, conf: 0.9, confFonte: 'rotulos', confN: 22 }), 'Som alto (40 s de som alto)');
  assert.equal(dd({ tipo: 'tiros', tiros: 20, acertos: 3, conf: 0.9, confFonte: 'rotulos', confN: 22, vitimas: ['cyrus'] }), 'Luta e morte: matou cyrus');
  assert.equal(dd({ tipo: 'tiros', tiros: 20, conf: 0.37, confFonte: 'rotulos', confN: 52 }), 'Som alto');
  assert.equal(dd({ tipo: 'explosao' }), 'Explosão');
  assert.equal(dd({ tipo: 'tiros', tipos: ['tiros', 'explosao'], tiros: 5, conf: 0.9, confFonte: 'rotulos', confN: 22 }), 'Som alto e explosão');
  assert.equal(dd({ tipo: 'grito', conf: 0.3 }), 'Voz alta');
  assert.match(nomeDoClipe({ titulo: dd({ tipo: 'tiros', tiros: 20, acertos: 3, conf: 0.9, confFonte: 'rotulos', confN: 22, vitimas: ['cyrus'] }), canal: 'tchubi', quandoMs: 0 }), /^Luta-e-morte-matou-cyrus__tchubi__/);
});

test('resumo factual do contexto validado: nunca o rótulo genérico, e diz se teve fala', async () => {
  const { textoDoContexto } = await import('../site/titulo.js');
  assert.equal(textoDoContexto(null), null);
  assert.equal(textoDoContexto({ tipo: 'ambiente', participacao: 'ausente', recebeuFala: false }).titulo, 'Ambiente, sem combate visível');
  assert.equal(textoDoContexto({ tipo: 'ambiente', participacao: 'ausente', recebeuFala: false }).status, 'Análise por imagem');
  assert.equal(textoDoContexto({ tipo: 'reacao', participacao: 'indeterminada', recebeuFala: true }).status, 'Análise por imagem e fala');
  assert.equal(textoDoContexto({ tipo: 'conversa', participacao: 'indeterminada', recebeuFala: true }).titulo, 'Conversa, sem combate visível');
  assert.equal(textoDoContexto({ tipo: 'combate', participacao: 'confirmada', recebeuFala: false }).titulo, 'Combate do jogador confirmado');
  assert.equal(textoDoContexto({ tipo: 'combate', participacao: 'ausente', recebeuFala: false }).titulo, 'Combate por perto, sem o jogador');
  // Nenhum número, nenhuma porcentagem no texto factual.
  for (const x of [{ tipo: 'ambiente', participacao: 'ausente', recebeuFala: false }, { tipo: 'combate', participacao: 'confirmada', recebeuFala: true }]) {
    assert.doesNotMatch(textoDoContexto(x).titulo + textoDoContexto(x).status, /%|\d/);
  }
});

test('morte legada sem vínculo explícito: não confirma Luta e não ganha percentual inventado', () => {
  const legado = { tipo: 'morte', conf: null, fonte: 'indice', n: 0, mortes: [{ matador: 'a', vitima: 'b' }], vinculoProprio: false };
  assert.equal(tituloDeEtiquetas([luta(40), legado]), 'Som alto e morte: a matou b');
  assert.equal(confExibida([legado]), null, 'sem medida e sem vínculo: nenhum percentual');
  const semFonte = morte([{ matador: 'a', vitima: 'b', vinculoProprio: true }], { fonte: undefined });
  assert.equal(tituloDeEtiquetas([luta(40), semFonte]), 'Som alto e morte: a matou b', 'vínculo sem fonte explícita não confirma');
});

test('contexto indeterminado não anula uma morte verificada ligada ao POV', () => {
  const ligada = morte([{ matador: 'xguiry', vitima: 'b', vinculoProprio: true }], { vinculoProprio: true });
  const indet = luta(40, { contexto: { tipo: 'indeterminado', participacao: 'indeterminada', origem: 'ia-remota', resumo: 'x' } });
  assert.equal(tituloDeEtiquetas([indet, ligada]), 'Luta longa e morte: xguiry matou b');
  const neg = luta(40, { contexto: { tipo: 'ambiente', participacao: 'ausente', origem: 'ia-remota', resumo: 'x' } });
  assert.equal(tituloDeEtiquetas([neg, ligada]), 'Som alto e morte: xguiry matou b', 'negativo explícito continua bloqueando');
});

test('proveniência morte a morte: a fonte da ETIQUETA não basta — uma leitura de vídeo não herda a fonte do servidor', () => {
  // A etiqueta diz 'servidor' (a primeira morte é do log), mas a única morte LIGADA ao POV é uma leitura de vídeo: não prova.
  const mistura = morte([
    { matador: 'fulano', vitima: 'cicrano', canalMatador: 'fulano', canalVitima: 'cicrano', fonte: 'servidor', vinculoProprio: false },
    { matador: 'xguiry', vitima: 'b', canalMatador: 'xguiry', fonte: 'video', vinculoProprio: true },
  ], { fonte: 'servidor' });
  assert.equal(tituloDeEtiquetas([luta(40), mistura]), 'Som alto e morte: fulano matou cicrano e mais 1 morte', 'vídeo ligado não confirma, mesmo com a etiqueta de servidor');
  // Só o log do servidor ligado ao POV confirma, mesmo que a outra morte da etiqueta seja de vídeo.
  const ligadaServidor = morte([
    { matador: 'xguiry', vitima: 'b', canalMatador: 'xguiry', fonte: 'video', vinculoProprio: true },
    { matador: 'xguiry', vitima: 'c', canalMatador: 'xguiry', fonte: 'servidor', vinculoProprio: true },
  ], { fonte: 'servidor' });
  assert.match(tituloDeEtiquetas([luta(40), ligadaServidor]), /^Luta longa e morte/, 'o servidor ligado ao POV confirma');
});

test('proveniência: o log do servidor de OUTRO jogador não confirma; o do próprio POV confirma; OCR nunca', () => {
  const deOutro = morte([{ matador: 'fulano', vitima: 'cicrano', fonte: 'servidor', vinculoProprio: false }]);
  assert.equal(tituloDeEtiquetas([luta(40), deOutro]), 'Som alto e morte: fulano matou cicrano');
  const doPov = morte([{ matador: 'xguiry', vitima: 'cicrano', fonte: 'servidor', vinculoProprio: true }]);
  assert.match(tituloDeEtiquetas([luta(40), doPov]), /^Luta longa e morte/);
  // Pelo produtor de verdade (etiquetasDoMomento), não pelo helper: uma leitura de tela nunca leva o 95% do servidor.
  const ocr = etiquetasDoMomento({ deMs: 0, ateMs: 10_000, ms: 5000, tipos: ['tiros', 'morte'], tiros: 40, canal: 'xguiry',
    mortes: [{ matador: 'xguiry', vitima: 'cicrano', canalMatador: 'xguiry', canalVitima: 'cicrano', fonte: 'video' }] });
  assert.equal(tituloDeEtiquetas([...ocr], { canal: 'xguiry' }), 'Som alto e morte: matou cicrano', 'leitura de tela não é o log (sem Luta)');
  assert.equal(ocr.find((x) => x.tipo === 'morte').conf, null, 'de vídeo não há o percentual de servidor (0,95)');
  assert.equal(confExibida(ocr)?.pct ?? null, null, 'nenhum percentual para a leitura de vídeo');
});

test('etiquetasDoMomento: a fonte da etiqueta é a da morte que prova; só o servidor ligado dá 95%', () => {
  const base = { deMs: 0, ateMs: 10_000, ms: 5000, tipos: ['tiros', 'morte'], tiros: 40, canal: 'xguiry' };
  const misto = etiquetasDoMomento({ ...base, mortes: [
    { matador: 'fulano', vitima: 'cicrano', canalMatador: 'fulano', canalVitima: 'cicrano', fonte: 'servidor' },
    { matador: 'xguiry', vitima: 'b', canalMatador: 'xguiry', canalVitima: 'b', fonte: 'video' },
  ] });
  const rotuloMorte = misto.find((x) => x.tipo === 'morte');
  assert.equal(rotuloMorte.fonte, 'video', 'a morte ligada ao POV é de vídeo: a etiqueta não se diz servidor');
  assert.equal(rotuloMorte.conf, null, 'de vídeo não há o 95% do servidor');
  assert.equal(tituloDeEtiquetas(misto, { canal: 'xguiry' }), 'Som alto e morte: fulano matou cicrano e mais 1 morte');
  const servidor = etiquetasDoMomento({ ...base, mortes: [{ matador: 'xguiry', vitima: 'b', canalMatador: 'xguiry', canalVitima: 'b', fonte: 'servidor' }] });
  assert.equal(servidor.find((x) => x.tipo === 'morte').fonte, 'servidor');
  assert.equal(servidor.find((x) => x.tipo === 'morte').conf, 0.95);
  assert.equal(tituloDeEtiquetas(servidor, { canal: 'xguiry' }), 'Luta longa e morte: matou b');
  // Sem fonte nenhuma: não vira servidor.
  const semFonte = etiquetasDoMomento({ ...base, mortes: [{ matador: 'xguiry', vitima: 'b', canalMatador: 'xguiry', canalVitima: 'b' }] });
  assert.equal(semFonte.find((x) => x.tipo === 'morte').fonte, null);
  assert.equal(tituloDeEtiquetas(semFonte, { canal: 'xguiry' }), 'Som alto e morte: matou b', 'morte sem fonte não confirma');
});
