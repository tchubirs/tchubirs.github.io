// Os melhores lances do evento (melhores.js): juntar sinais de vários canais num lance, medir o chat pelo
// normal de cada canal, somar a nota parte a parte e dizer o motivo em palavras.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mesmoLugar, normalDoChat, unirJanelas, sinaisDoEvento, agrupar, resumirLance, melhoresLances, filtrarLances, coincide,
  motivoDoLance, contaDoLance, vezesEmTexto, PONTOS, ANTES_MS,
} from '../site/melhores.js';
import { definirIdioma } from '../site/idiomas.js';

const T = Date.parse('2026-10-11T21:00:00Z');
const S = 1000;
const MIN = 60 * S;
const chat = (canal, ms, vezes) => ({ tipo: 'chat', canal, ms, vezes });
// Todos no mesmo time: os testes da conta não são sobre quem pode juntar com quem.
const UM_TIME = { grupoDe: () => 'time' };

test('o normal do chat é a mediana dos minutos com mensagens, de todas as janelas lidas', () => {
  assert.equal(normalDoChat([[0, 2, 4, 0], [6, 0]]), 4);
  assert.equal(normalDoChat([[1, 3], [5, 7]]), 4);
  assert.equal(normalDoChat([[0, 0]]), 0);
  assert.equal(normalDoChat([]), 0);
  // Janelas que se tocam ou cobrem viram uma: o normal não conta o mesmo minuto duas vezes.
  assert.deepEqual(unirJanelas([[50, 60], [0, 10], [5, 20], [20, 30]]), [[0, 30], [50, 60]]);
});

test('normalizar pelo canal: 30 mensagens num canal pequeno contam mais do que 300 num grande', () => {
  // O pequeno tem 2 por minuto e um pico de 30 (15 vezes); o grande tem 200 e um pico de 300 (1,5 vez).
  const pequeno = resumirLance({ deMs: T, ateMs: T, sinais: [chat('pequeno', T, 30 / 2)] });
  const grande = resumirLance({ deMs: T, ateMs: T, sinais: [chat('grande', T, 300 / 200)] });
  assert.ok(pequeno.pontos > grande.pontos);
  // E o chat de um canal não passa de 10 pontos, por mais que exploda.
  assert.equal(pequeno.pontos, PONTOS.chatMax);
  assert.equal(grande.pontos, 2);
});

test('agrupar: canais do mesmo time a menos de um minuto são um lance; um minuto e meio depois é outro', () => {
  const grupos = agrupar([
    chat('a', T + 20 * S, 6), chat('b', T, 4), chat('c', T + 50 * S, 3),
    chat('d', T + 3 * MIN, 8),
  ], UM_TIME);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0].sinais.map((s) => s.canal), ['b', 'a', 'c']);
  assert.deepEqual(grupos[1].sinais.map((s) => s.canal), ['d']);
});

test('agrupar não cresce sem fim: uma hora de sinais seguidos não vira um lance só', () => {
  const sinais = Array.from({ length: 60 }, (_, i) => chat(`c${i % 4}`, T + i * 40 * S, 4));
  const grupos = agrupar(sinais, UM_TIME);
  assert.ok(grupos.length > 5, `${grupos.length} lances`);
  for (const g of grupos) assert.ok(g.ateMs - g.deMs <= 3 * MIN);
});

test('o som estende o lance até ao fim do combate', () => {
  const g = agrupar([{ tipo: 'tiros', canal: 'a', ms: T, ateMs: T + 90 * S }, chat('b', T + 140 * S, 5)], UM_TIME);
  assert.equal(g.length, 1, 'o chat a 50 s do fim do tiroteio é o mesmo lance');
});

test('a nota é a soma escrita: chat, tiros, kill e os canais juntos', () => {
  const l = resumirLance({
    deMs: T,
    ateMs: T + 40 * S,
    sinais: [
      chat('a', T + 30 * S, 6), chat('b', T + 35 * S, 4.4), chat('c', T + 40 * S, 2),
      { tipo: 'tiros', canal: 'a', ms: T + 5 * S }, { tipo: 'tiros', canal: 'd', ms: T + 6 * S },
      { tipo: 'kill', canal: 'a', ms: T + 8 * S }, { tipo: 'kill', canal: 'a', ms: T + 8.5 * S },
    ],
  });
  // chat 6 + 4 + 2, tiros 2 + 2, uma kill (a mesma marcada duas vezes), 4 canais = 3 a mais.
  assert.deepEqual(l.partes.map((p) => [p.tipo, p.pontos]), [['chat', 12], ['tiros', 4], ['kill', 5], ['juntos', 6]]);
  assert.equal(l.pontos, 27);
  assert.equal(l.kills, 1);
  // O instante é o do primeiro som; o vídeo abre 10 s antes, e a marca fica no som.
  assert.equal(l.ms, T + 5 * S);
  assert.equal(l.msAbrir, T + 5 * S - ANTES_MS);
  assert.equal(l.msMarcar, T + 5 * S);
  // Quem mais somou vai à frente.
  assert.equal(l.canais[0], 'a');
  assert.deepEqual([...l.canais].sort(), ['a', 'b', 'c', 'd']);
});

test('só chat: o lance é o primeiro pico, a marca fica 10 s antes dele', () => {
  const l = resumirLance({ deMs: T, ateMs: T + 10 * S, sinais: [chat('b', T + 10 * S, 3), chat('a', T, 5)] });
  assert.equal(l.ms, T);
  assert.equal(l.msMarcar, T - ANTES_MS);
});

test('ordem: mais pontos primeiro; num empate, mais canais; depois o mais cedo', () => {
  const lista = melhoresLances([
    chat('solo', T, 10),
    chat('a', T + 10 * MIN, 4), chat('b', T + 10 * MIN + 5 * S, 4),
    chat('x', T + 20 * MIN, 6), chat('y', T + 20 * MIN, 2),
  ], UM_TIME);
  assert.deepEqual(lista.map((l) => l.pontos), [10, 10, 10]);
  assert.deepEqual(lista.map((l) => l.canais.length), [2, 2, 1]);
  assert.equal(lista[0].ms, T + 10 * MIN);
  assert.equal(lista[2].canais[0], 'solo');
});

test('os sinais da página: picos de chat, sons da detecção e kills; o Marcar desta lista não conta como kill', () => {
  const marcas = new Map([['a', [{ ms: T, tipo: 'chat', vezes: 5, msgs: 15 }]], ['b', []]]);
  const momentos = [
    { ms: T + S, protagonista: 'a', auto: false },
    { ms: T + 2 * S, protagonista: 'b', auto: true, tipo: 'tiros', combateDeMs: T - 4 * S, combateAteMs: T + 20 * S },
    { ms: T + 3 * S, protagonista: 'c', auto: true, tipo: 'tiros', tipos: ['tiros', 'explosao', 'grito'] },
    { ms: T + 4 * S, protagonista: 'd', auto: false, origem: 'lances' },
    { ms: T + 5 * S, protagonista: 'e', auto: true, tipo: 'chat' },
    { ms: T + 6 * S, protagonista: 'f', auto: true, tipo: 'tiros', vitimas: ['g'] },
  ];
  const s = sinaisDoEvento({ marcas, momentos });
  const de = (canal) => s.filter((x) => x.canal === canal).map((x) => x.tipo).sort();
  assert.deepEqual(de('a'), ['chat', 'kill']);
  assert.deepEqual(de('b'), ['tiros']);
  assert.equal(s.find((x) => x.canal === 'b').ms, T - 4 * S, 'o som começa no começo do combate');
  assert.deepEqual(de('c'), ['explosao', 'grito', 'tiros']);
  assert.deepEqual(de('d'), [], 'marcado a partir da lista');
  assert.deepEqual(de('e'), [], 'palavras no chat já são os picos de chat');
  assert.deepEqual(de('f'), ['kill', 'tiros'], 'quem morreu foi achado: é kill');
});

test('filtros: canais mínimos, só com kill, janela de tempo, descartados e marcados', () => {
  const lances = melhoresLances([
    chat('a', T, 5), chat('b', T + 10 * S, 5), chat('c', T + 20 * S, 5),
    chat('solo', T + 10 * MIN, 9), { tipo: 'kill', canal: 'solo', ms: T + 10 * MIN - 5 * S },
    chat('tarde', T + 60 * MIN, 9),
  ], UM_TIME);
  assert.equal(lances.length, 3);
  assert.deepEqual(filtrarLances(lances, { minCanais: 3 }).map((l) => l.canais.length), [3]);
  assert.deepEqual(filtrarLances(lances, { soKills: true }).map((l) => l.canais), [['solo']]);
  assert.equal(filtrarLances(lances, { deMs: T - MIN, ateMs: T + 30 * MIN }).length, 2);
  // O descartado sai, e volta com `comDescartados`, marcado como tal. A marca vale com folga de 30 s.
  const [primeiro] = lances;
  const sem = filtrarLances(lances, { descartados: [primeiro.ms + 20 * S] });
  assert.equal(sem.length, 2);
  const com = filtrarLances(lances, { descartados: [primeiro.ms], comDescartados: true });
  assert.equal(com.find((l) => l.ms === primeiro.ms).descartado, true);
  assert.equal(filtrarLances(lances, { marcados: [primeiro.ms] })[0].marcado, true);
  assert.equal(coincide(primeiro, [primeiro.ateMs + 31 * S]), false);
  // Com os canais guardados, a marca de um lance não apanha outro lance no mesmo minuto.
  assert.equal(coincide(primeiro, [{ ms: primeiro.ms, c: ['outro'] }]), false);
  assert.equal(coincide(primeiro, [{ ms: primeiro.ms, c: ['b', 'zz'] }]), true);
});

test('o motivo em palavras, nas três línguas', () => {
  const l = resumirLance({
    deMs: T,
    ateMs: T + MIN,
    sinais: [
      chat('a', T, 6), chat('b', T, 3), chat('c', T, 2.5),
      ...['a', 'b', 'c', 'd'].map((canal) => ({ tipo: 'tiros', canal, ms: T })),
      { tipo: 'explosao', canal: 'a', ms: T }, { tipo: 'kill', canal: 'a', ms: T },
    ],
  });
  definirIdioma('pt');
  assert.equal(motivoDoLance(l), 'chat até 6 vezes o normal em 3 canais, tiros ouvidos em 4 ângulos, explosão ouvida em 1 ângulo, 1 kill marcada');
  assert.deepEqual(contaDoLance(l).map((p) => `${p.rotulo} ${p.pontos}`), ['chat 12', 'tiros 8', 'explosões 2', 'kills 5', '4 canais juntos 6']);
  definirIdioma('en');
  assert.equal(motivoDoLance(l), 'chat up to 6 times its normal in 3 channels, gunshots heard from 4 angles, explosion heard from 1 angle, 1 marked kill');
  definirIdioma('es');
  assert.equal(motivoDoLance(l), 'chat hasta 6 veces lo normal en 3 canales, disparos oídos en 4 ángulos, explosión oída en 1 ángulo, 1 kill marcada');
  definirIdioma('pt');
  const um = resumirLance({ deMs: T, ateMs: T, sinais: [chat('a', T, 2.46), { tipo: 'grito', canal: 'a', ms: T }, { tipo: 'kill', canal: 'a', ms: T }, { tipo: 'kill', canal: 'a', ms: T + 9 * S }] });
  assert.equal(motivoDoLance(um), 'chat 2,5 vezes o normal, grito em 1 ângulo, 2 kills marcadas');
  assert.equal(vezesEmTexto(12.4), '12');
  assert.equal(vezesEmTexto(3), '3');
});

test('só juntam canais do mesmo time ou confirmados pelo som; picos que calharam no mesmo minuto ficam separados', () => {
  const times = new Map([['a1', 'Alfa'], ['a2', 'Alfa'], ['b1', 'Beta']]);
  const grupoDe = (c) => times.get(c) ?? null;
  const sinais = [chat('a1', T, 6), chat('a2', T + 10 * S, 5), chat('b1', T + 20 * S, 8), chat('solto', T + 30 * S, 7), chat('outro', T + 40 * S, 4)];
  const lances = melhoresLances(sinais, { grupoDe });
  assert.deepEqual(lances.map((l) => [...l.canais].sort().join('+')).sort(), ['a1+a2', 'b1', 'outro', 'solto']);
  // O bónus de canais juntos só existe no grupo confirmado.
  const alfa = lances.find((l) => l.canais.includes('a1'));
  assert.deepEqual(alfa.partes.map((p) => p.tipo), ['chat', 'juntos']);
  for (const l of lances.filter((x) => x !== alfa)) assert.ok(!l.partes.some((p) => p.tipo === 'juntos'));
  // A dica: os outros picos perto, sem juntar.
  assert.deepEqual([...alfa.perto].sort(), ['b1', 'outro', 'solto']);
  assert.ok(lances.find((l) => l.canais[0] === 'solto').perto.includes('a1') || lances.find((l) => l.canais[0] === 'solto').perto.includes('a2'));

  // O som confirmou que b1 e solto estavam no mesmo sítio: passam a ser um lance.
  const confirmados = [{ ms: T + 25 * S, canais: ['b1', 'solto'] }];
  const depois = melhoresLances(sinais, { grupoDe, confirmados });
  assert.deepEqual(depois.map((l) => [...l.canais].sort().join('+')).sort(), ['a1+a2', 'b1+solto', 'outro']);
  // Uma confirmação de outra hora não vale aqui.
  assert.equal(mesmoLugar('b1', 'solto', T, { grupoDe, confirmados: [{ ms: T + 10 * MIN, canais: ['b1', 'solto'] }] }), false);
  // Dois sem time nenhum nunca são do mesmo lugar só por isso.
  assert.equal(mesmoLugar('solto', 'outro', T, { grupoDe }), false);
});
