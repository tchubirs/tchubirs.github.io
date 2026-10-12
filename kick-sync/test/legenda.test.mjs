// A legenda da fala (legenda.js, legenda-voz.js, legenda-arquivos.js) sem navegador: as escolhas, as
// janelas do leitor, a limpeza do que ele inventa, as falas e a correção delas, o tempo, o destaque da
// palavra dita, a arrumação na tela, o sítio que foge do chat, o que fica guardado na kill, e a conversa
// com o Worker (com um Worker de mentira).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  limparLegenda, LEGENDA_OMISSAO, limparTranscricao, palavrasDe, janelasDoAudio, juntarJanelas, semLacos,
  semInventadas, agruparLinhas, transcricaoDoAudio, textoDaLinha, editarLinha, apagarLinha, deslocarLinha,
  rotuloTempo, cobre, linhaNoInstante, SEGURAR_MS, paginar, quadroNoInstante, geometriaLegenda, caixaDoChat,
  desenharLegenda, idiomaParaOuvir, nomeDeQuemFala, comoAparece,
} from '../site/legenda.js';
import { abrirVoz, somDosPedacos, degrauDoSom, estimativaS } from '../site/legenda-voz.js';
import { BYTES_TOTAL, POR_URL, MOTOR, CODIGO, ARQUIVOS_MODELO, oQueFalta, REVISAO } from '../site/legenda-arquivos.js';
import { comAjuste, clipesDoMomento, novoMomento, momentosParaLink, ajusteDe } from '../site/momentos.js';
import { DEITADO, RETRATO } from '../site/retrato.js';

const T0 = Date.parse('2026-08-30T21:00:00.000Z');
const medir = (t) => Array.from(String(t)).length * 10;

/** Uma transcrição de três falas, em ms da noite. */
function exemplo() {
  const p = (t, de, ate) => ({ t, de: T0 + de, ate: T0 + ate });
  return limparTranscricao({
    canal: 'tchubi', deMs: T0, ateMs: T0 + 30_000, idioma: 'pt',
    linhas: [
      { palavras: [p('ele', 1000, 1300), p('tava', 1300, 1600), p('de', 1600, 1700), p('AK', 1700, 2100)] },
      { palavras: [p('clipa', 5000, 5400), p('isso', 5400, 5900)] },
      { palavras: [p('que', 9000, 9200), p('tiro', 9200, 9600), p('foi', 9600, 9800), p('esse', 9800, 10300), p('mano', 10300, 10800)] },
    ],
  });
}

// ── as escolhas ──────────────────────────────────────────────────────────────

test('a legenda nasce desligada, e o que vier estragado volta ao de omissão', () => {
  assert.equal(LEGENDA_OMISSAO.ligado, false);
  assert.deepEqual(limparLegenda(null), { ...LEGENDA_OMISSAO });
  const l = limparLegenda({ ligado: 'sim', estilo: '<b>', tamanho: 'xl', posicao: 'lado', cor: 'roxo', nome: 1, idioma: 'fr', traduzir: 'true' });
  assert.deepEqual(l, { ...LEGENDA_OMISSAO });
  const bom = limparLegenda({ ligado: true, estilo: 'simples', tamanho: 'g', posicao: 'cima', cor: 'ambar', nome: true, idioma: 'es', traduzir: true });
  assert.deepEqual(bom, { ligado: true, estilo: 'simples', tamanho: 'g', posicao: 'cima', cor: 'ambar', nome: true, idioma: 'es', traduzir: true });
  // `cor` vem de um objeto: o nome de uma propriedade herdada não pode passar por cor.
  assert.equal(limparLegenda({ cor: 'toString' }).cor, 'turquesa');
});

test('em Automático, o idioma é o que a live declara na Kick; sem nada, o Whisper decide', () => {
  assert.equal(idiomaParaOuvir('auto', 'Portuguese'), 'pt');
  assert.equal(idiomaParaOuvir('auto', 'Spanish'), 'es');
  assert.equal(idiomaParaOuvir('auto', 'English'), 'en');
  assert.equal(idiomaParaOuvir('auto', 'Arabic'), 'auto');
  assert.equal(idiomaParaOuvir('auto', null), 'auto');
  assert.equal(idiomaParaOuvir('es', 'Portuguese'), 'es', 'a escolha dele manda');
});

// ── o que vem do leitor ──────────────────────────────────────────────────────

test('as janelas do leitor: 30 s, a andar 20 s, e cada palavra fica numa só', () => {
  const taxa = 16000;
  assert.deepEqual(janelasDoAudio(20 * taxa, taxa), [{ ini: 0, fim: 20 * taxa, deS: 0, ateS: Infinity }]);
  const j = janelasDoAudio(65 * taxa, taxa);
  assert.deepEqual(j.map((x) => [x.ini / taxa, x.fim / taxa, x.deS, x.ateS]),
    [[0, 30, 0, 25], [20, 50, 25, 45], [40, 65, 45, Infinity]]);
  // A palavra dita aos 24,9 s aparece nas duas primeiras janelas (a sobra), e fica uma vez.
  const juntas = juntarJanelas([
    { janela: j[0], palavras: [{ t: 'antes', de: 10, ate: 10.4 }, { t: 'beira', de: 24.8, ate: 25.0 }, { t: 'sobra', de: 27, ate: 27.3 }] },
    { janela: j[1], palavras: [{ t: 'beira', de: 4.8, ate: 5.0 }, { t: 'sobra', de: 7, ate: 7.3 }, { t: 'fim', de: 24.6, ate: 24.9 }] },
    { janela: j[2], palavras: [{ t: 'fim', de: 4.6, ate: 4.9 }, { t: 'ultima', de: 20, ate: 20.5 }] },
  ], taxa);
  assert.deepEqual(juntas.map((p) => p.t), ['antes', 'beira', 'sobra', 'fim', 'ultima']);
  assert.ok(Math.abs(juntas[2].de - 27) < 1e-9);
  assert.ok(Math.abs(juntas[4].de - 60) < 1e-9);
});

test('o que o transformers.js devolve vira palavras, sem as vazias e sem invisíveis', () => {
  const p = palavrasDe({ chunks: [
    { text: ' Mas', timestamp: [0.24, 0.5] },
    { text: '  ', timestamp: [0.5, 0.6] },
    { text: ' eu‮', timestamp: [0.6, null] },
    { text: ' já', timestamp: [null, 1] },
  ] }, 30);
  assert.deepEqual(p, [{ t: 'Mas', de: 0.24, ate: 0.5 }, { t: 'eu', de: 0.6, ate: 1 }]);
});

test('os laços do modelo ficam em duas voltas, e os créditos inventados saem', () => {
  const ps = 'e a madeira o que é o que é o que é o que é já já já já calma calma fim'.split(' ')
    .map((t, i) => ({ t, de: T0 + i * 300, ate: T0 + i * 300 + 250 }));
  assert.equal(semLacos(ps).map((p) => p.t).join(' '), 'e a madeira o que é o que é já já calma calma fim');
  const linhas = [
    { palavras: [{ t: 'Legendas', de: 0, ate: 1 }, { t: 'pela', de: 1, ate: 2 }, { t: 'comunidade', de: 2, ate: 3 }, { t: 'Amara.org', de: 3, ate: 4 }] },
    { palavras: [{ t: 'boa', de: 5, ate: 6 }] },
  ];
  assert.deepEqual(semInventadas(linhas).map(textoDaLinha), ['boa']);
});

test('as falas partem-se na pausa, no fim da frase e quando ficam longas', () => {
  const p = (t, de) => ({ t, de, ate: de + 250 });
  const linhas = agruparLinhas([
    p('tava', 0), p('de', 300), p('AK', 600), // pausa de 1 s a seguir
    p('clipa', 1900), p('isso.', 2200), p('Boa', 2500),
    ...Array.from({ length: 9 }, (_, i) => p(`p${i}`, 3000 + i * 260)),
  ]);
  assert.deepEqual(linhas.map(textoDaLinha), ['tava de AK', 'clipa isso.', 'Boa p0 p1 p2 p3 p4 p5', 'p6 p7 p8']);
});

test('a transcrição de um clipe fica no relógio da noite', () => {
  const tr = transcricaoDoAudio([{ t: 'ele', de: 1, ate: 1.3 }, { t: 'tava', de: 1.3, ate: 1.6 }], {
    canal: 'tchubi', deMs: T0, ateMs: T0 + 10_000, idioma: 'pt',
  });
  assert.equal(tr.canal, 'tchubi');
  assert.deepEqual(tr.linhas[0].palavras, [{ t: 'ele', de: T0 + 1000, ate: T0 + 1300 }, { t: 'tava', de: T0 + 1300, ate: T0 + 1600 }]);
});

test('uma transcrição guardada é limpa antes de usar (tamanhos, tempos, invisíveis, ordem)', () => {
  assert.equal(limparTranscricao(null), null);
  assert.equal(limparTranscricao({ deMs: 5, ateMs: 1, linhas: [] }), null);
  const tr = limparTranscricao({
    canal: 'x'.repeat(200), deMs: 0, ateMs: 10_000, idioma: '<script>',
    linhas: [
      { palavras: [{ t: 'b'.repeat(90), de: 5000, ate: 4000 }] },
      { palavras: [{ t: '<img src=x onerror=1>', de: 1000, ate: 1200 }, { t: 'x', de: 'nada', ate: 3 }] },
      { palavras: 'não é lista' },
    ],
  });
  assert.equal(tr.canal.length, 60);
  assert.equal(tr.idioma, 'auto');
  assert.equal(tr.linhas.length, 2);
  // Por ordem, e o texto continua texto (quem o mostra usa textContent e fillText).
  assert.equal(tr.linhas[0].palavras[0].t, '<img src=x onerror=1>');
  assert.equal(tr.linhas[1].palavras[0].t.length, 40);
  assert.equal(tr.linhas[1].palavras[0].ate, 5000, 'o fim nunca antes do começo');
});

// ── corrigir ─────────────────────────────────────────────────────────────────

test('corrigir uma fala com as mesmas palavras guarda o tempo de cada uma', () => {
  const tr = exemplo();
  const nova = editarLinha(tr, 0, 'ele tava de AK47');
  assert.deepEqual(nova.linhas[0].palavras.map((p) => [p.t, p.de - T0, p.ate - T0]),
    [['ele', 1000, 1300], ['tava', 1300, 1600], ['de', 1600, 1700], ['AK47', 1700, 2100]]);
  assert.notEqual(nova, tr, 'devolve uma transcrição nova');
  assert.equal(textoDaLinha(tr.linhas[0]), 'ele tava de AK', 'a antiga fica como estava');
});

test('corrigir com outro número de palavras reparte o tempo da fala pelo tamanho de cada uma', () => {
  const nova = editarLinha(exemplo(), 1, 'clipa isso agora mesmo');
  const ps = nova.linhas[1].palavras;
  assert.deepEqual(ps.map((p) => p.t), ['clipa', 'isso', 'agora', 'mesmo']);
  assert.equal(ps[0].de, T0 + 5000);
  assert.equal(ps.at(-1).ate, T0 + 5900);
  for (let i = 1; i < ps.length; i++) assert.equal(ps[i].de, ps[i - 1].ate, 'seguidas, sem buracos');
  assert.ok(ps[0].ate - ps[0].de > ps[1].ate - ps[1].de, '"clipa" é mais comprida do que "isso"');
});

test('apagar o texto de uma fala apaga a fala; apagar tira-a da lista', () => {
  assert.deepEqual(editarLinha(exemplo(), 1, '   ').linhas.map(textoDaLinha), ['ele tava de AK', 'que tiro foi esse mano']);
  assert.deepEqual(apagarLinha(exemplo(), 0).linhas.map(textoDaLinha), ['clipa isso', 'que tiro foi esse mano']);
  const tr = exemplo();
  assert.equal(apagarLinha(tr, 9), tr);
});

test('mexer no tempo de uma fala anda a fala inteira, sem sair do que foi ouvido', () => {
  const tr = exemplo();
  const mais = deslocarLinha(tr, 1, 100);
  assert.deepEqual(mais.linhas[1].palavras.map((p) => p.de - T0), [5100, 5500]);
  const menos = deslocarLinha(tr, 0, -5000);
  assert.equal(menos.linhas[0].palavras[0].de, T0, 'não passa do começo do áudio');
  const fim = deslocarLinha(tr, 2, 60_000);
  assert.equal(fim.linhas[2].palavras.at(-1).ate, T0 + 30_000, 'nem do fim');
  // Andar para lá da vizinha troca-as de lugar: a lista fica sempre por ordem.
  const troca = deslocarLinha(tr, 1, 4500);
  assert.deepEqual(troca.linhas.map(textoDaLinha), ['ele tava de AK', 'que tiro foi esse mano', 'clipa isso']);
});

test('o tempo de uma fala na lista conta do início do clipe', () => {
  assert.equal(rotuloTempo(T0 + 3240, T0), '0:03.2');
  assert.equal(rotuloTempo(T0 + 75_000, T0), '1:15.0');
  assert.equal(rotuloTempo(T0 - 10, T0), '0:00.0');
});

test('o texto serve para o clipe só se for do mesmo canal e cobrir o pedaço', () => {
  const tr = exemplo();
  assert.equal(cobre(null, { canal: 'tchubi', deMs: T0, ateMs: T0 + 1 }), 'falta');
  assert.equal(cobre(tr, { canal: 'tchubi', deMs: T0 + 2000, ateMs: T0 + 20_000 }), 'ok', 'aparar dentro serve');
  assert.equal(cobre(tr, { canal: 'outro', deMs: T0, ateMs: T0 + 20_000 }), 'outroCanal');
  assert.equal(cobre(tr, { canal: 'tchubi', deMs: T0, ateMs: T0 + 40_000 }), 'foraDoPedaco');
});

// ── o tempo e o destaque ─────────────────────────────────────────────────────

test('cada fala aparece quando começa e fica um pouco depois da última palavra', () => {
  const tr = exemplo();
  assert.equal(linhaNoInstante(tr, T0 + 900), -1, 'antes da primeira, nada');
  assert.equal(linhaNoInstante(tr, T0 + 1000), 0);
  assert.equal(linhaNoInstante(tr, T0 + 2100 + SEGURAR_MS - 1), 0);
  assert.equal(linhaNoInstante(tr, T0 + 2100 + SEGURAR_MS), -1, 'e depois some');
  assert.equal(linhaNoInstante(tr, T0 + 5000), 1);
  assert.equal(linhaNoInstante(tr, T0 + 60_000), -1);
  // Com a seguinte colada, a anterior sai quando a seguinte entra.
  const colada = limparTranscricao({ ...tr, linhas: [tr.linhas[0], { palavras: [{ t: 'já', de: T0 + 2300, ate: T0 + 2500 }] }] });
  assert.equal(linhaNoInstante(colada, T0 + 2299), 0);
  assert.equal(linhaNoInstante(colada, T0 + 2300), 1);
});

test('a palavra em destaque é a que está a ser dita', () => {
  const tr = exemplo();
  const geo = { fonte: 66, largura: 2000 };
  const l = { estilo: 'destaque' };
  assert.equal(quadroNoInstante(tr, T0 + 1000, l, geo, medir).atual, 0);
  assert.equal(quadroNoInstante(tr, T0 + 1650, l, geo, medir).atual, 2);
  assert.equal(quadroNoInstante(tr, T0 + 2500, l, geo, medir).atual, 3, 'depois da última, fica a última');
  assert.equal(quadroNoInstante(tr, T0 + 4000, l, geo, medir), null);
});

test('no destaque, quatro palavras por ecrã; uma palavra por vez no outro; o simples leva a fala toda', () => {
  const tr = exemplo();
  const geo = { fonte: 66, largura: 2000 };
  const longa = 2; // "que tiro foi esse mano": cinco palavras
  const q1 = quadroNoInstante(tr, T0 + 9000, { estilo: 'destaque' }, geo, medir);
  assert.deepEqual(q1.ecra.linhas.flat().map((p) => p.t), ['QUE', 'TIRO', 'FOI', 'ESSE'], 'em maiúsculas, como no CapCut');
  const q2 = quadroNoInstante(tr, T0 + 10_400, { estilo: 'destaque' }, geo, medir);
  assert.deepEqual(q2.ecra.linhas.flat().map((p) => p.t), ['MANO']);
  assert.equal(q2.atual, 4);
  const q3 = quadroNoInstante(tr, T0 + 9250, { estilo: 'palavra' }, geo, medir);
  assert.deepEqual(q3.ecra.linhas.flat().map((p) => p.t), ['TIRO']);
  const q4 = quadroNoInstante(tr, T0 + 9250, { estilo: 'simples' }, geo, medir);
  assert.equal(q4.ecra.linhas.flat().map((p) => p.t).join(' '), textoDaLinha(tr.linhas[longa]));
  assert.equal(comoAparece('ação', 'destaque'), 'AÇÃO');
});

test('as palavras partem-se em linhas que cabem, no máximo duas por ecrã', () => {
  const ps = 'um dois tres quatro cinco seis sete'.split(' ').map((t, i) => ({ t, de: i * 100, ate: i * 100 + 90 }));
  const ecras = paginar(ps, { largura: 120, medir, porEcra: { palavras: 40, linhas: 2 } });
  // " " mede 10: "um dois" = 20+10+40 = 70; "tres" não cabe a seguir (70+10+40 = 120 cabe); "quatro" já não.
  assert.deepEqual(ecras.map((e) => e.linhas.map((l) => l.map((p) => p.t).join(' '))),
    [['um dois tres', 'quatro cinco'], ['seis sete']]);
  assert.equal(ecras[1].de, 500, 'o segundo ecrã começa quando "seis" é dita');
  for (const e of ecras) for (const l of e.linhas) assert.ok(l.at(-1).x + l.at(-1).w <= 120);
  // O nome de quem fala, no estilo simples, entra no começo de cada ecrã.
  const comNome = paginar(ps.slice(0, 2), { largura: 500, medir, porEcra: { palavras: 40, linhas: 2 }, prefixo: 'tchubi:' });
  assert.deepEqual(comNome[0].linhas[0].map((p) => [p.i, p.t]), [[-1, 'tchubi:'], [0, 'um'], [1, 'dois']]);
  assert.equal(nomeDeQuemFala('  tchubi‮ '), 'tchubi');
});

// ── a geometria ──────────────────────────────────────────────────────────────

test('16:9: embaixo ao meio; com o chat embaixo à esquerda, fica ao meio mais estreita, sem lhe tocar', () => {
  const sem = geometriaLegenda(DEITADO, { estilo: 'destaque' }, { formato: '16:9' });
  assert.equal(sem.x, 960);
  assert.equal(sem.ancora, 'baixo');
  assert.ok(sem.y > 950 && sem.y < 1080);
  const chat = { ligado: true, posicao: 'auto', tamanho: 'm', linhas: 6, fundo: 'translucido' };
  const g = geometriaLegenda(DEITADO, { estilo: 'destaque' }, { formato: '16:9', chat });
  const caixa = caixaDoChat(DEITADO, chat, { formato: '16:9' });
  assert.ok(g.x - g.largura / 2 >= caixa.x + caixa.largura, `a legenda (${g.x - g.largura / 2}) entrou no chat (${caixa.x + caixa.largura})`);
  assert.ok(g.x + g.largura / 2 <= 1920);
  assert.equal(g.x, 960, 'ao meio, longe da vida e das balas do Rust no canto de baixo à direita');
  // Com o chat grande, já não cabe ao meio: vai para o lado livre.
  const grande = { ...chat, tamanho: 'g' };
  const g2 = geometriaLegenda(DEITADO, { estilo: 'destaque' }, { formato: '16:9', chat: grande });
  const c2 = caixaDoChat(DEITADO, grande, { formato: '16:9' });
  assert.ok(g2.x > 960 && g2.x - g2.largura / 2 >= c2.x + c2.largura);
  // Com o chat em cima, a legenda fica no sítio de sempre.
  assert.equal(geometriaLegenda(DEITADO, {}, { formato: '16:9', chat: { ...chat, posicao: 'cimaEsq' } }).x, 960);
});

test('9:16: no terço de baixo, acima dos botões da TikTok; com o chat embaixo, sobe para cima dele', () => {
  const sem = geometriaLegenda(RETRATO, { estilo: 'destaque' }, { formato: '9:16' });
  assert.equal(sem.ancora, 'baixo');
  assert.ok(sem.y <= 1920 * 0.75 && sem.y >= 1920 * 0.66, `y=${sem.y}`);
  assert.equal(sem.x, 540);
  const chat = { ligado: true, posicao: 'auto', tamanho: 'm', linhas: 6, fundo: 'translucido' };
  const g = geometriaLegenda(RETRATO, { estilo: 'destaque' }, { formato: '9:16', modo: 'um', chat });
  const caixa = caixaDoChat(RETRATO, chat, { formato: '9:16', modo: 'um' });
  assert.ok(g.y <= caixa.y, `a legenda (fundo ${g.y}) tem de acabar acima do chat (${caixa.y})`);
  // Com dois quadros o chat vai para baixo da divisória, e a legenda fica no terço de baixo, fora dele.
  const dois = geometriaLegenda(RETRATO, { estilo: 'destaque' }, { formato: '9:16', modo: 'dois', divisao: 0.35, chat });
  const caixa2 = caixaDoChat(RETRATO, chat, { formato: '9:16', modo: 'dois', divisao: 0.35 });
  const topo = dois.ancora === 'baixo' ? dois.y - dois.linhas * dois.alturaLinha : dois.y;
  assert.ok(topo >= caixa2.y + caixa2.altura, `${topo} < ${caixa2.y + caixa2.altura}`);
  // Escolhida à mão, fica onde ele pôs, com chat ou sem.
  assert.equal(geometriaLegenda(RETRATO, { posicao: 'cima' }, { formato: '9:16', chat }).ancora, 'cima');
  // A letra cresce com o tamanho.
  const p = geometriaLegenda(RETRATO, { tamanho: 'p' }, { formato: '9:16' }).fonte;
  const gg = geometriaLegenda(RETRATO, { tamanho: 'g' }, { formato: '9:16' }).fonte;
  assert.ok(gg > p);
});

// ── o desenho (numa tela de mentira) ─────────────────────────────────────────

function telaFalsa() {
  const feitos = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: '', textAlign: '', lineJoin: '', miterLimit: 10,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() { feitos.push({ caixa: this.fillStyle }); },
    measureText: (t) => ({ width: medir(t) }),
    strokeText(t, x, y) { feitos.push({ contorno: t, x, y }); },
    fillText(t, x, y) { feitos.push({ texto: t, cor: this.fillStyle, x, y }); },
  };
  return { ctx, feitos };
}

test('o desenho pinta só por fillText, com a palavra dita na cor escolhida e o resto a branco', () => {
  const tr = exemplo();
  const legenda = { ligado: true, estilo: 'destaque', cor: 'ambar' };
  const geo = geometriaLegenda(DEITADO, legenda, { formato: '16:9' });
  const { ctx, feitos } = telaFalsa();
  assert.equal(desenharLegenda(ctx, tr, T0 + 1350, legenda, geo), true);
  const textos = feitos.filter((f) => f.texto);
  assert.deepEqual(textos.map((f) => f.texto), ['ELE', 'TAVA', 'DE', 'AK']);
  assert.deepEqual(textos.map((f) => f.cor), ['#FFFFFF', '#F2B254', '#FFFFFF', '#FFFFFF']);
  assert.equal(feitos.filter((f) => f.contorno).length, 4, 'o contorno preto do CapCut');
  // Centrado em x e acima do fundo.
  const x0 = textos[0].x;
  const x1 = textos.at(-1).x + medir('AK');
  assert.ok(Math.abs((x0 + x1) / 2 - 960) < 1);
  assert.ok(textos[0].y < geo.y);
  // Nada a pintar fora das falas.
  const vazio = telaFalsa();
  assert.equal(desenharLegenda(vazio.ctx, tr, T0 + 4000, legenda, geo), false);
  assert.equal(vazio.feitos.length, 0);
});

test('com o nome ligado, o nome do streamer vai antes da fala (em cima nos estilos grandes, à frente no simples)', () => {
  const tr = exemplo();
  const grande = { ligado: true, estilo: 'destaque', nome: true };
  const a = telaFalsa();
  desenharLegenda(a.ctx, tr, T0 + 1000, grande, geometriaLegenda(DEITADO, grande), { nome: 'tchubi' });
  const ta = a.feitos.filter((f) => f.texto);
  assert.equal(ta[0].texto, 'tchubi');
  assert.ok(ta[0].y < ta[1].y, 'o nome fica por cima');
  const simples = { ligado: true, estilo: 'simples', nome: true, cor: 'turquesa' };
  const b = telaFalsa();
  desenharLegenda(b.ctx, tr, T0 + 1000, simples, geometriaLegenda(DEITADO, simples), { nome: 'tchubi' });
  const tb = b.feitos.filter((f) => f.texto);
  assert.deepEqual(tb.map((f) => f.texto), ['tchubi:', 'ele', 'tava', 'de', 'AK']);
  assert.equal(tb[0].cor, '#46C6D6');
  assert.ok(b.feitos.some((f) => f.caixa), 'o simples tem a caixa escura');
  // Desligado, nada de nome.
  const c = telaFalsa();
  desenharLegenda(c.ctx, tr, T0 + 1000, { ...grande, nome: false }, geometriaLegenda(DEITADO, grande), { nome: 'tchubi' });
  assert.ok(!c.feitos.some((f) => f.texto === 'tchubi'));
});

// ── o que fica guardado na kill ──────────────────────────────────────────────

test('a legenda guardada numa kill volta com o texto corrigido, e o link leva as escolhas sem o texto', () => {
  const m = novoMomento(T0 + 15_000, 'tchubi');
  const tr = editarLinha(exemplo(), 0, 'ele tava de AK47');
  const legenda = { ligado: true, estilo: 'simples', tamanho: 'g', posicao: 'auto', cor: 'branco', nome: true, idioma: 'pt', traduzir: false, transcricao: tr };
  const comLegenda = comAjuste(m, { deMs: T0, ateMs: T0 + 20_000, canal: 'tchubi', legenda });
  const aj = ajusteDe(comLegenda, 'tchubi');
  assert.equal(aj.legenda.ligado, true);
  assert.equal(aj.legenda.cor, 'branco');
  assert.equal(textoDaLinha(aj.legenda.transcricao.linhas[0]), 'ele tava de AK47');
  // A montagem recebe-a no clipe deste canal.
  const [clipe] = clipesDoMomento(comLegenda, ['tchubi'], 0);
  assert.equal(clipe.legenda.estilo, 'simples');
  assert.equal(limparTranscricao(clipe.legenda.transcricao).linhas.length, 3);
  // Desligada não se guarda nada.
  assert.equal(ajusteDe(comAjuste(m, { deMs: T0, ateMs: T0 + 20_000, canal: 'tchubi', legenda: { ...legenda, ligado: false } }), 'tchubi').legenda, undefined);
  // O link: as escolhas vão, o texto não (cabe num endereço).
  const [noLink] = momentosParaLink([comLegenda]);
  assert.equal(noLink.ajuste.legenda.estilo, 'simples');
  assert.equal(noLink.ajuste.legenda.transcricao, null);
  assert.equal(noLink.ajustes.tchubi.legenda.transcricao, null);
  assert.ok(comLegenda.ajuste.legenda.transcricao, 'o momento guardado no aparelho não perde o texto');
});

// ── os arquivos do leitor ───────────────────────────────────────────────────

test('os arquivos do leitor: versões fixas, 107 MB da primeira vez, e nada disso no repositório', () => {
  assert.equal(REVISAO.length, 40);
  assert.equal(CODIGO.url, 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js');
  assert.match(MOTOR.url, /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.31\.0-dev\.20260914-8d85527a0\/dist\//);
  for (const a of ARQUIVOS_MODELO) {
    assert.match(a.url, new RegExp(`^https://huggingface\\.co/onnx-community/whisper-base_timestamped/resolve/${REVISAO}/`));
  }
  for (const a of POR_URL.values()) assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.ok(BYTES_TOTAL > 100e6 && BYTES_TOTAL < 110e6, `${BYTES_TOTAL}`);
  assert.equal(POR_URL.size, 9);
  // Nem o código, nem o motor, nem o modelo no site: só o nosso Worker, que os vai buscar.
  assert.equal(fs.existsSync(new URL('../site/vendor/whisper/', import.meta.url)), false);
  const worker = fs.readFileSync(new URL('../site/legenda-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /from ['"]https?:/, 'o transformers.js não se importa direto da rede, sem conferir');
});

test('o que falta baixar sai do cache do navegador; sem cache, tudo', async () => {
  assert.equal((await oQueFalta({ cachesApi: null })).length, 9);
  const temTudoMenosMotor = {
    open: async (nome) => ({
      match: async (url) => ((nome === 'transformers-cache' && POR_URL.has(url)) || (nome === 'povix-legenda-motor' && url === CODIGO.url) ? {} : undefined),
    }),
  };
  const falta = await oQueFalta({ cachesApi: temTudoMenosMotor });
  assert.deepEqual(falta.map((a) => a.url), [MOTOR.url]);
});

// ── o som e o Worker ─────────────────────────────────────────────────────────

test('o som sai do degrau de 480p (o mesmo áudio do 1080p, seis vezes mais leve); sem ele, do da exportação', () => {
  const escada = [{ altura: 1080 }, { altura: 720 }, { altura: 480 }, { altura: 360 }, { altura: 160 }];
  assert.equal(degrauDoSom(escada).altura, 480);
  assert.equal(degrauDoSom([{ altura: 720 }, { altura: 160 }]).altura, 720);
  assert.equal(estimativaS(30), 26);
});

const SOM = new URL('../probes/fixtures/som/', import.meta.url);
test('o som do clipe: baixa só os pedaços do plano, tira o AAC e corta no instante pedido',
  { skip: !fs.existsSync(SOM) && 'sem fixture de som' }, async () => {
    const nomes = fs.readdirSync(SOM).filter((f) => f.endsWith('.ts')).sort().slice(0, 3);
    const segs = nomes.map((n, i) => ({ url: `https://x/${n}`, inicio: T0 + i * 10_000, duracaoS: 10 }));
    const pedidos = [];
    const buscar = async (url) => {
      pedidos.push(url);
      return new Response(fs.readFileSync(new URL(url.split('/').pop(), SOM)));
    };
    let aac = null;
    const descodificar = async (bytes, { taxaAlvo }) => { aac = bytes; return new Float32Array(30 * taxaAlvo).map((_, i) => i); };
    const reamostrar = async (mono, taxa) => ({ mono, taxa });
    const vistos = [];
    const r = await somDosPedacos(segs, T0 + 2500, T0 + 12_500, { buscar, descodificar, reamostrar, aoBaixar: (p) => vistos.push(p.prontos) });
    assert.deepEqual(pedidos.sort(), segs.map((s) => s.url).sort());
    assert.ok(aac?.length > 1000 && aac[0] === 0xff, 'AAC em ADTS, tirado do MPEG-TS');
    assert.equal(r.taxa, 48000);
    assert.equal(r.mono.length, 10 * 48000, 'só os 10 s do clipe');
    assert.equal(r.mono[0], 2.5 * 48000, 'a começar 2,5 s depois do início do primeiro pedaço');
    assert.deepEqual(vistos.sort(), [1, 2, 3]);
    await assert.rejects(somDosPedacos([], T0, T0 + 1), { name: 'SEM-SOM' });
  });

/** Um Worker de mentira que fala como o legenda-worker.js. */
function workerFalso(respostas) {
  const ouvintes = { message: new Set(), error: new Set() };
  const w = {
    recebidos: [], fechado: false,
    addEventListener: (tipo, f) => ouvintes[tipo].add(f),
    removeEventListener: (tipo, f) => ouvintes[tipo].delete(f),
    terminate() { w.fechado = true; },
    postMessage(msg) {
      w.recebidos.push(msg);
      setTimeout(() => { for (const d of respostas(msg)) for (const f of [...ouvintes.message]) f({ data: d }); }, 1);
    },
    rebentar(msg) { for (const f of [...ouvintes.error]) f({ message: msg, preventDefault() {} }); },
  };
  return w;
}

test('a conversa com o Worker: progresso do download, abrir, ouvir, e as palavras no fim', async () => {
  const w = workerFalso((m) => [
    { tipo: 'baixar', url: 'a', feito: 50e6, total: 77e6 },
    { tipo: 'baixar', url: 'b', feito: 27e6, total: 27e6 },
    { tipo: 'abrir' },
    { tipo: 'ouvir', fracao: 0.5 },
    { tipo: 'pronto', id: m.id, palavras: [{ t: 'oi', de: 0.1, ate: 0.3 }], segundos: 4.2 },
  ]);
  const voz = abrirVoz({ criar: () => w });
  const fases = [];
  const r = await voz.transcrever(new Float32Array(16000), { idioma: 'pt', faltaBytes: 107e6, aoProgresso: (p) => fases.push(p) });
  assert.deepEqual(r, { palavras: [{ t: 'oi', de: 0.1, ate: 0.3 }], segundos: 4.2 });
  assert.equal(w.recebidos[0].tipo, 'transcrever');
  assert.equal(w.recebidos[0].idioma, 'pt');
  assert.equal(w.recebidos[0].audio.length, 16000);
  assert.deepEqual(fases.map((f) => f.fase), ['baixar', 'baixar', 'abrir', 'ouvir']);
  assert.equal(fases[1].feito, 77e6, 'o download soma os arquivos');
  assert.equal(fases[1].total, 107e6);
});

test('Parar fecha o Worker a meio, e o pedido seguinte abre outro; um Worker que rebenta diz porquê', async () => {
  const criados = [];
  const voz = abrirVoz({ criar: () => { const w = workerFalso(() => [{ tipo: 'ouvir', fracao: 0.1 }]); criados.push(w); return w; } });
  const controlo = new AbortController();
  const p = voz.transcrever(new Float32Array(10), { sinal: controlo.signal });
  setTimeout(() => controlo.abort(), 5);
  await assert.rejects(p, { name: 'AbortError' });
  assert.equal(criados[0].fechado, true);
  const p2 = voz.transcrever(new Float32Array(10));
  assert.equal(criados.length, 2);
  criados[1].rebentar('não carregou');
  await assert.rejects(p2, { name: 'SEM-LEITOR' });
  const erro = abrirVoz({ criar: () => workerFalso((m) => [{ tipo: 'erro', id: m.id, nome: 'INTEGRIDADE', mensagem: 'x' }]) });
  await assert.rejects(erro.transcrever(new Float32Array(10)), { name: 'INTEGRIDADE' });
});
