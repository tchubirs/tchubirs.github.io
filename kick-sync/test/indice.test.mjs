// O índice de uma live (indice.js) e a calibração (calibracao.js): tudo o que se achou fica com hora, etiqueta e confiança;
// as lutas juntam tiros e acertos; a consulta é só filtrar. Entradas feitas à mão, no formato de `varrerNoite`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confianca, CALIBRACAO } from '../site/calibracao.js';
import {
  montarIndice, montarLutas, consultar, lutasDoIndice, precisaoDaBusca, indiceValido, chaveDoIndice,
  CONF_SEM_CORTE, MAX_LUTA_MS, JUNTAR_LUTA_MS,
} from '../site/indice.js';
import { montarLista, MAX_CLIPE_LUTA_MS } from '../site/simples-lista.js';

const T = Date.UTC(2026, 10, 1, 20, 0, 0);
const s = (n) => T + n * 1000;
/** Uma região de som alto no formato de `varrerNoite`. */
const regiao = (seg, pico, durS = 3, extra = {}) => ({
  ms: s(seg + durS / 2), combateDeMs: s(seg), combateAteMs: s(seg + durS), tiros: 1.5, pico, duracaoS: durS, nImp: 5, nAltos: 2, vozMed: 0.45, ...extra,
});

test('a calibração devolve a confiança da faixa, com a fonte e o número de exemplos', () => {
  assert.deepEqual(confianca('tiro', 30), { p: 0.37, n: 52, fonte: 'rotulos' });
  assert.equal(confianca('tiro', 90).p, 0.91);
  assert.equal(confianca('tiro', 500).p, 1);
  assert.equal(confianca('tiro', 70).fonte, 'estimado', 'a faixa sem nenhum exemplo diz que é estimada');
  assert.equal(confianca('acerto', 0.9).p, 1);
  assert.equal(confianca('acerto', 0.7).fonte, 'sintetico');
  assert.equal(confianca('alerta', 0.54).p, 0.9);
  assert.equal(confianca('voz', 0).n, 14);
  assert.deepEqual(confianca('inexistente', 1), { p: null, n: 0, fonte: 'estimado' });
  // toda faixa termina numa sem teto, e os cortes crescem
  for (const [nome, c] of Object.entries(CALIBRACAO)) {
    if (!c.faixas) continue;
    assert.equal(c.faixas.at(-1).ate, null, nome);
    const cortes = c.faixas.slice(0, -1).map((f) => f.ate);
    assert.deepEqual([...cortes].sort((a, b) => a - b), cortes, nome);
  }
});

test('o índice guarda cada achado com hora, tipo, confiança e fonte, e nada de áudio', () => {
  const som = {
    candidatosTodos: [regiao(100, 95), regiao(300, 30, 3, { vozMed: 0.66 }), regiao(500, 40, 33)],
    explosoesTodas: [{ ms: s(700), combateDeMs: s(699), combateAteMs: s(702), pico: 50, nota: 0.7 }],
    gritosTodos: [{ ms: s(800), combateDeMs: s(799), combateAteMs: s(801), pico: 5 }],
    alertasFora: [{ ms: s(900), porque: 'repete', onda: 0.54, semelhanca: 0.88 }, { ms: s(950), porque: 'nao-parece-explosao', nota: 0.1 }],
    acertos: [
      { ms: s(101), nota: 0.9, tipo: 'corpo', id: 'moderno-1' },
      { ms: s(102), nota: 0.8, tipo: 'cabeca', id: 'cabeca' },
      { ms: s(103), nota: 0.78, tipo: 'morte', id: 'morte' },
    ],
    modelosAcerto: [{ id: 'moderno-1', picos: 4, repete: 0.8, vale: true }],
  };
  const i = montarIndice({
    slug: 'tchubi', inicioMs: T, fimMs: s(3600), som, picos: [{ ms: s(120), msgs: 40, vezes: 6 }], mortes: [{ ms: s(104), vitima: 'a', matador: 'b' }], agora: T,
  });
  const por = (t) => i.eventos.filter((e) => e.tipo === t);
  assert.equal(por('tiro').length, 3);
  assert.equal(por('voz').length, 1, 'só a região fraca com muita voz');
  assert.equal(por('farm').length, 1, 'só a região fraca e longa');
  assert.equal(por('acerto').length, 1);
  assert.equal(por('headshot').length, 1);
  assert.equal(por('abate').length, 1);
  assert.equal(por('explosao')[0].conf, 0.57);
  assert.equal(por('alerta').length, 1, 'o que o modelo positivo tirou não é alerta');
  assert.equal(por('alerta')[0].conf, 0.9);
  assert.equal(por('grito').length, 1);
  assert.equal(por('chat').length, 1);
  assert.equal(por('morte')[0].fonte, 'servidor');
  assert.ok(i.acertosAtivos);
  for (const e of i.eventos) {
    assert.ok(e.conf >= 0 && e.conf <= 1, `${e.tipo} ${e.conf}`);
    assert.ok(['rotulos', 'sintetico', 'estimado', 'servidor'].includes(e.fonte), e.fonte);
    assert.ok(e.deMs <= e.ms && e.ms <= e.ateMs, `${e.tipo}: o instante cai dentro do trecho`);
  }
  assert.deepEqual(i.eventos.map((e) => e.ms), [...i.eventos.map((e) => e.ms)].sort((a, b) => a - b));
  // vetores e números, nada que lembre áudio: o JSON do índice inteiro é pequeno e volta igual
  const json = JSON.stringify(i);
  assert.ok(json.length < 8000, `${json.length} bytes`);
  assert.deepEqual(JSON.parse(json), i);
  assert.ok(indiceValido(JSON.parse(json)));
  assert.equal(indiceValido({ ...i, v: 99 }), false);
  assert.equal(indiceValido(null), false);
  assert.equal(chaveDoIndice('tchubi', T), `tchubi|${T}`);
});

test('consultar só filtra a lista pronta: por tipo, confiança e trecho, na ordem da live', () => {
  const i = montarIndice({
    slug: 'x', inicioMs: T, som: {
      candidatosTodos: [regiao(10, 95), regiao(60, 30), regiao(120, 120)],
      acertos: [{ ms: s(11), nota: 0.9, tipo: 'corpo', id: 'a' }],
    },
  });
  assert.deepEqual(consultar(i, { tipos: ['tiro'] }).map((e) => e.ms), [s(11.5), s(61.5), s(121.5)]);
  assert.equal(consultar(i, { tipos: ['tiro'], confMin: 0.9 }).length, 2);
  assert.equal(consultar(i, { tipos: ['acerto'] }).length, 1);
  assert.equal(consultar(i, { deMs: s(50), ateMs: s(100) }).length, 1);
  assert.equal(consultar(i).length, i.eventos.length);
  assert.equal(consultar(null, {}).length, 0);
});

test('tiros fortes a menos de 25 s viram UMA luta, e o acerto junto dela sobe a confiança e os pontos', () => {
  const sem = montarIndice({ slug: 'x', inicioMs: T, som: { candidatosTodos: [regiao(100, 95), regiao(112, 90), regiao(130, 85)] } });
  assert.equal(sem.lutas.length, 1);
  assert.equal(sem.lutas[0].tiros, 3);
  assert.equal(sem.lutas[0].acertos, 0);
  const com = montarIndice({
    slug: 'x', inicioMs: T, som: {
      candidatosTodos: [regiao(100, 95), regiao(112, 90), regiao(130, 85)],
      acertos: [
        { ms: s(101), nota: 0.9, tipo: 'corpo', id: 'a' },
        { ms: s(113), nota: 0.9, tipo: 'cabeca', id: 'b' },
        { ms: s(131), nota: 0.9, tipo: 'morte', id: 'c' },
      ],
    },
  });
  assert.equal(com.lutas.length, 1);
  const l = com.lutas[0];
  assert.deepEqual([l.acertos, l.cabecas, l.abates], [3, 1, 1]);
  assert.ok(l.pontos > sem.lutas[0].pontos + 3, `${l.pontos} contra ${sem.lutas[0].pontos}`);
  assert.ok(l.conf >= sem.lutas[0].conf);
});

test('duas lutas com mais de 25 s entre elas ficam separadas, e uma luta de mais de 75 s é cortada', () => {
  const afastadas = [regiao(100, 95), regiao(100 + 3 + JUNTAR_LUTA_MS / 1000 + 5, 95)];
  assert.equal(montarLutas(montarIndice({ slug: 'x', inicioMs: T, som: { candidatosTodos: afastadas } }).eventos).length, 2);
  // 12 regiões a cada 10 s: 120 s seguidos, que viram mais de uma luta
  const longa = montarIndice({ slug: 'x', inicioMs: T, som: { candidatosTodos: Array.from({ length: 12 }, (_, k) => regiao(100 + k * 10, 95)) } }).lutas;
  assert.ok(longa.length >= 2);
  for (const l of longa) assert.ok(l.ateMs - l.deMs <= MAX_LUTA_MS, `${(l.ateMs - l.deMs) / 1000} s`);
  assert.equal(longa.reduce((t, l) => t + l.tiros, 0), 12, 'nenhuma região se perde no corte');
});

test('um acerto sozinho (sem região de tiro) também é uma luta, e tiro fraco sozinho não é', () => {
  const i = montarIndice({
    slug: 'x', inicioMs: T, som: {
      candidatosTodos: [regiao(200, 30), regiao(400, 45, 40)],
      acertos: [{ ms: s(600), nota: 0.95, tipo: 'corpo', id: 'a' }],
    },
  });
  assert.equal(i.lutas.length, 1);
  assert.equal(i.lutas[0].acertos, 1);
  assert.ok(i.lutas[0].conf >= 0.9);
  // uma região fraca só entra numa luta quando há acerto em cima dela
  const com = montarIndice({ slug: 'x', inicioMs: T, som: { candidatosTodos: [regiao(200, 30)], acertos: [{ ms: s(201), nota: 0.9, tipo: 'corpo', id: 'a' }] } });
  assert.equal(com.lutas.length, 1);
  assert.equal(com.lutas[0].tiros, 1);
});

test('a precisão da busca é a média das confianças medidas, e diz quantas são só estimadas', () => {
  const i = montarIndice({
    slug: 'x', inicioMs: T, som: { candidatosTodos: [regiao(10, 95), regiao(60, 30)], gritosTodos: [{ ms: s(80), combateDeMs: s(79), combateAteMs: s(81), pico: 5 }] },
  });
  const p = precisaoDaBusca(consultar(i));
  assert.equal(p.resultados, 3);
  assert.equal(p.estimados, 1);
  assert.equal(p.medidos, 2);
  assert.equal(p.percentual, Math.round(((0.91 + 0.37) / 2) * 100));
  assert.equal(precisaoDaBusca([]).percentual, null);
  assert.equal(precisaoDaBusca(consultar(i, { tipos: ['grito'] })).percentual, null, 'só estimado: não há percentual a mostrar');
  assert.equal(lutasDoIndice(i, { confMin: 0.9 }).length, 1);
});

test('na lista, a luta de confiança alta aparece inteira, sem o corte, e leva o chat em volta', () => {
  const regioes = Array.from({ length: 30 }, (_, k) => regiao(100 + k * 200, 95));
  const i = montarIndice({ slug: 'x', inicioMs: T, som: { candidatosTodos: regioes, acertos: [{ ms: s(101), nota: 0.9, tipo: 'cabeca', id: 'b' }] } });
  assert.equal(i.lutas.length, 30);
  const lista = montarLista({ lutas: i.lutas, picos: [{ ms: s(130), msgs: 30, vezes: 4 }], limites: { deMs: T, ateMs: s(7000) }, quantos: 5 });
  assert.equal(lista.length, 30, 'o corte de 5 não vale para as lutas de confiança alta');
  assert.ok(lista.every((m) => m.luta && m.conf >= CONF_SEM_CORTE));
  const primeira = lista.find((m) => m.ms === i.lutas[0].ms);
  assert.ok(primeira.tipos.includes('acerto') && primeira.tipos.includes('chat'));
  assert.equal(primeira.cabecas, 1);
  assert.equal(lista.filter((m) => m.tipos.includes('chat')).length, 1, 'o pico do chat entrou na luta e não virou outro momento');
  assert.ok(lista.every((m) => m.ateMs - m.deMs <= MAX_CLIPE_LUTA_MS));
  assert.equal(primeira.nota, 'muitoBom');
});

test('a luta de confiança baixa entra no corte como os outros, e sem lutas a lista é a de antes', () => {
  const sons = Array.from({ length: 8 }, (_, k) => ({ ms: s(100 + k * 300), tipo: 'tiros', tiros: 3, combateDeMs: s(98 + k * 300), combateAteMs: s(102 + k * 300) }));
  const antes = montarLista({ sons, quantos: 4 });
  assert.equal(antes.length, 4);
  const fraca = [{ id: 'l', ms: s(5000), deMs: s(4990), ateMs: s(5010), conf: 0.5, tiros: 1, acertos: 0, cabecas: 0, abates: 0, mortes: 0, pontos: 3 }];
  const com = montarLista({ sons, quantos: 4, lutas: fraca });
  assert.equal(com.length, 4);
  assert.ok(com.every((m) => !m.luta || m.conf < CONF_SEM_CORTE));
});
