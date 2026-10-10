// O mapa do evento, sem browser. As contas testam-se direitas; a pintura
// testa-se com um canvas falso que grava cada chamada, e que rebenta o teste
// se o mapa usar alguma coisa fora do básico da API 2D.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  ALTURAS, CORES, ZOOM_MINIMO_MS,
  montarMapa, linhasVisiveis, xDoTempo, tempoDoX, zoom, oQueEstaAqui, filtrar, pintarMapa,
} from '../site/mapa.js';

const T = Date.parse('2026-10-10T18:00:00.000Z');
const MIN = 60_000;
const H = 60 * MIN;

/**
 * Um evento do tamanho do que vem aí: 125 times de 4 = 500 canais. Cada canal
 * entra a uma hora diferente (determinística, para os testes serem os mesmos
 * em qualquer máquina) e fica quatro horas no ar.
 */
function evento({ nTimes = 125, porTime = 4, soltos = 0 } = {}) {
  const times = [];
  const coberturas = new Map();
  for (let i = 0; i < nTimes; i++) {
    const canais = [];
    for (let k = 0; k < porTime; k++) {
      const slug = `t${i}c${k}`;
      const entra = T + ((i * 7 + k * 13) % 120) * MIN;
      canais.push(slug);
      coberturas.set(slug, [[entra, entra + 4 * H]]);
    }
    times.push({ nome: `Time ${i}`, canais });
  }
  if (soltos) {
    const canais = Array.from({ length: soltos }, (_, i) => `solto${i}`);
    canais.forEach((c) => coberturas.set(c, [[T, T + H]]));
    times.push({ nome: null, canais });
  }
  return { times, coberturas };
}

const todosAbertos = (times) => new Set(times.map((t) => t.nome));

// ── montarMapa ──────────────────────────────────────────────────────────────

test('time aberto: cabeçalho e uma faixa por canal; fechado: cabeçalho e um resumo', () => {
  const coberturas = new Map([['a', [[T, T + H]]], ['b', [[T, T + 2 * H]]], ['c', [[T + H, T + 3 * H]]]]);
  const times = [{ nome: 'Fúria', canais: ['a', 'b'] }, { nome: 'Lobos', canais: ['c'] }];
  const m = montarMapa({ times, coberturas, abertos: new Set(['Fúria']) });
  assert.deepEqual(m.linhas.map((l) => [l.tipo, l.time, l.canal]), [
    ['time', 'Fúria', null],
    ['canal', 'Fúria', 'a'],
    ['canal', 'Fúria', 'b'],
    ['time', 'Lobos', null],
    ['resumo', 'Lobos', null],
  ]);
  assert.equal(m.linhas[0].aberto, true);
  assert.equal(m.linhas[3].aberto, false);
  assert.deepEqual(m.linhas[1].coberturas, [[T, T + H]]);
  assert.deepEqual(m.linhas[4].canais, ['c']);
  assert.deepEqual(m.cabecalhos, [0, 3]);
});

test('cada linha começa onde a de cima acaba, e a altura é a soma de todas', () => {
  const { times, coberturas } = evento();
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  assert.equal(m.linhas.length, 125 + 500);
  let y = 0;
  for (const l of m.linhas) {
    assert.equal(l.y, y);
    assert.equal(l.altura, ALTURAS[l.tipo]);
    y += l.altura;
  }
  assert.equal(m.altura, y);
  assert.equal(m.altura, 125 * ALTURAS.time + 500 * ALTURAS.canal);
});

test('quem não tem time vai para o fim, num grupo só, mesmo que venha à cabeça e aos bocados', () => {
  const times = [
    { nome: null, canais: ['s1'] },
    { nome: 'A', canais: ['a1'] },
    { canais: ['s2'] },                       // sem `nome` é o mesmo que null
    { nome: 'B', canais: ['b1'] },
  ];
  const m = montarMapa({ times, coberturas: new Map(), abertos: new Set(['A', 'B', null]) });
  assert.deepEqual(m.linhas.map((l) => [l.tipo, l.time, l.canal]), [
    ['time', 'A', null], ['canal', 'A', 'a1'],
    ['time', 'B', null], ['canal', 'B', 'b1'],
    ['time', null, null], ['canal', null, 's1'], ['canal', null, 's2'],
  ]);
});

test('um grupo sem time vazio não aparece; um time do elenco sem canais aparece', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: [] }, { nome: null, canais: [] }] });
  // Um time do elenco sem canais lidos é uma coisa a ver (o link falhou); um
  // "Sem time" sem ninguém é só um cabeçalho a dizer que não há nada.
  assert.deepEqual(m.linhas.map((l) => [l.tipo, l.time]), [['time', 'A'], ['resumo', 'A']]);
  assert.deepEqual(m.linhas[1].coberturas, []);
  assert.deepEqual(m.linhas[1].densidade, []);
});

test('as coberturas saem por ordem, juntas quando se tocam, e sem pontas inventadas', () => {
  const coberturas = new Map([['a', [
    [T + 2 * H, T + 3 * H],
    [T, T + H],
    [T + H, T + 90 * MIN],     // toca no anterior: o streamer caiu e voltou
    [T + 80 * MIN, T + 85 * MIN], // dentro do anterior
    [null, T],                 // sem início: não é 1970
    [T, NaN],
    [T + 5 * H, T + 4 * H],    // ao contrário
    [String(T), String(T + H)], // texto não é número
    'lixo',
    null,
  ]]]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }], coberturas, abertos: new Set(['A']) });
  assert.deepEqual(m.linhas[1].coberturas, [[T, T + 90 * MIN], [T + 2 * H, T + 3 * H]]);
});

test('um canal sem coberturas tem uma faixa vazia, e não um erro', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['x', 'y'] }], coberturas: new Map([['y', 'nada']]), abertos: ['A'] });
  assert.deepEqual(m.linhas.slice(1).map((l) => l.coberturas), [[], []]);
  assert.equal(m.inicioMs, null);
  assert.equal(m.fimMs, null);
});

test('o resumo de um time fechado diz quando havia alguém e quantos estavam no ar', () => {
  const coberturas = new Map([
    ['a', [[T, T + 3 * H]]],
    ['b', [[T + H, T + 2 * H]]],
    ['c', [[T + 90 * MIN, T + 4 * H]]],
    ['d', [[T + 5 * H, T + 6 * H]]],
  ]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b', 'c', 'd'] }], coberturas });
  const r = m.linhas[1];
  assert.equal(r.tipo, 'resumo');
  assert.deepEqual(r.coberturas, [[T, T + 4 * H], [T + 5 * H, T + 6 * H]]);
  assert.deepEqual(r.densidade, [
    [T, T + H, 1],
    [T + H, T + 90 * MIN, 2],
    [T + 90 * MIN, T + 2 * H, 3],
    [T + 2 * H, T + 3 * H, 2],
    [T + 3 * H, T + 4 * H, 1],
    [T + 5 * H, T + 6 * H, 1],
  ]);
  // O cabeçalho leva a mesma união: dá para saber se o time estava no ar
  // sem o abrir.
  assert.deepEqual(m.linhas[0].coberturas, r.coberturas);
});

test('quem acaba quando outro começa não conta como dois no ar', () => {
  const coberturas = new Map([['a', [[T, T + H]]], ['b', [[T + H, T + 2 * H]]]]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b'] }], coberturas });
  // Um troço só com 1, e não [T, T+H, 1] + [T+H, T+H, 2] + ...
  assert.deepEqual(m.linhas[1].densidade, [[T, T + 2 * H, 1]]);
});

test('inicioMs e fimMs são as pontas de tudo o que está no mapa, abertos ou fechados', () => {
  const coberturas = new Map([['a', [[T + H, T + 2 * H]]], ['b', [[T, T + 30 * MIN]]], ['s', [[T + 5 * H, T + 6 * H]]]]);
  const m = montarMapa({
    times: [{ nome: 'A', canais: ['a'] }, { nome: 'B', canais: ['b'] }, { nome: null, canais: ['s'] }],
    coberturas,
    abertos: new Set(['A']),
  });
  assert.equal(m.inicioMs, T);
  assert.equal(m.fimMs, T + 6 * H);
});

test('ninguém com vídeo: as pontas são null, e não 1970 nem Infinity', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }], coberturas: new Map() });
  assert.equal(m.inicioMs, null);
  assert.equal(m.fimMs, null);
  const vazio = montarMapa();
  assert.deepEqual(vazio, { linhas: [], cabecalhos: [], altura: 0, inicioMs: null, fimMs: null });
});

test('um canal repetido no time só ganha uma faixa', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b', 'a'] }], abertos: new Set(['A']) });
  assert.deepEqual(m.linhas.map((l) => l.canal), [null, 'a', 'b']);
  assert.deepEqual(m.linhas[0].canais, ['a', 'b']);
});

test('coberturas num objeto simples, e um canal chamado constructor não é uma função', () => {
  // `constructor` passa na regra de nomes da Kick; num objecto simples
  // `obj.constructor` é a função Object, e isso não é uma lista de VODs.
  const m = montarMapa({
    times: [{ nome: 'A', canais: ['a', 'constructor', 'toString', '__proto__'] }],
    coberturas: { a: [[T, T + H]] },
    abertos: ['A'],
  });
  assert.deepEqual(m.linhas.slice(1).map((l) => l.coberturas), [[[T, T + H]], [], [], []]);
});

test('entradas estragadas não rebentam', () => {
  const m = montarMapa({
    times: [null, { nome: 'A', canais: 'a,b' }, { nome: 'B', canais: ['b', 7, '', null, 'c'] }],
    coberturas: 'nada',
    abertos: 'B',
  });
  assert.deepEqual(m.linhas.map((l) => [l.tipo, l.time, l.canal]), [
    ['time', 'A', null], ['resumo', 'A', null],
    ['time', 'B', null], ['resumo', 'B', null],
  ]);
  assert.deepEqual(m.linhas[3].canais, ['b', 'c']);
  assert.deepEqual(montarMapa({ times: 'x' }).linhas, []);
});

test('não mexe no que recebe', () => {
  const { times, coberturas } = evento({ nTimes: 3 });
  coberturas.set('t0c0', [[T + H, T + 2 * H], [T, T + 90 * MIN]]); // por juntar
  const antes = JSON.stringify({ times, cob: [...coberturas] });
  const abertos = new Set(['Time 0']);
  montarMapa({ times, coberturas, abertos });
  assert.equal(JSON.stringify({ times, cob: [...coberturas] }), antes);
  assert.deepEqual([...abertos], ['Time 0']);
});

test('alturas à medida, e uma altura escrita como texto não estraga as contas', () => {
  const m = montarMapa({
    times: [{ nome: 'A', canais: ['a', 'b'] }],
    abertos: new Set(['A']),
    alturas: { time: 30, canal: '40', resumo: -1 },
  });
  // '40' em vez de 40 dava `y += '40'`: texto colado, e o mapa todo em NaN.
  assert.deepEqual(m.linhas.map((l) => [l.y, l.altura]), [[0, 30], [30, ALTURAS.canal], [30 + ALTURAS.canal, ALTURAS.canal]]);
  assert.equal(m.altura, 30 + 2 * ALTURAS.canal);
});

// ── linhasVisiveis ──────────────────────────────────────────────────────────

const aMao = (mapa, topo, altura) => mapa.linhas.filter((l) => l.y < topo + altura && l.y + l.altura > topo);

test('as linhas visíveis são exactamente as que cruzam o ecrã, em qualquer ponto da rolagem', () => {
  const { times, coberturas } = evento({ soltos: 7 });
  // Metade aberta, metade fechada: as alturas deixam de ser todas iguais.
  const abertos = new Set(times.filter((_, i) => i % 2).map((t) => t.nome));
  const m = montarMapa({ times, coberturas, abertos });
  for (const altura of [1, 19, 20, 21, 600, 1080]) {
    for (let topo = -50; topo < m.altura + 50; topo += 37) {
      assert.deepEqual(linhasVisiveis(m, { topo, altura }), aMao(m, topo, altura), `topo ${topo} altura ${altura}`);
    }
  }
});

test('meio aberto: a linha que acaba no topo, ou começa no fundo, não se vê', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b', 'c'] }], abertos: new Set(['A']) });
  // linhas: 0-24 (time), 24-44 (a), 44-64 (b), 64-84 (c)
  assert.deepEqual(linhasVisiveis(m, { topo: 24, altura: 20 }).map((l) => l.canal), ['a']);
  assert.deepEqual(linhasVisiveis(m, { topo: 23, altura: 22 }).map((l) => l.canal), [null, 'a', 'b']);
  assert.deepEqual(linhasVisiveis(m, { topo: 0, altura: 24 }).map((l) => l.tipo), ['time']);
});

test('rolagem para lá das pontas, ecrã sem altura, e mapas estragados dão listas vazias ou o que existe', () => {
  const { times, coberturas } = evento({ nTimes: 2 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  assert.deepEqual(linhasVisiveis(m, { topo: -1000, altura: 1010 }).map((l) => l.y), [0]);
  assert.deepEqual(linhasVisiveis(m, { topo: m.altura, altura: 500 }), []);
  assert.deepEqual(linhasVisiveis(m, { topo: 0, altura: 0 }), []);
  assert.deepEqual(linhasVisiveis(m, { topo: 0, altura: -5 }), []);
  assert.deepEqual(linhasVisiveis(m, { topo: NaN, altura: 500 }), []);
  assert.deepEqual(linhasVisiveis(m, { topo: 0, altura: Infinity }).length, m.linhas.length);
  assert.deepEqual(linhasVisiveis(null, { topo: 0, altura: 500 }), []);
  assert.deepEqual(linhasVisiveis({ linhas: [] }, { topo: 0, altura: 500 }), []);
  assert.deepEqual(linhasVisiveis(m), []);
});

test('rápido: 10 000 pedidos sobre 500 canais em menos de 200 ms', () => {
  const { times, coberturas } = evento();
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  linhasVisiveis(m, { topo: 0, altura: 900 }); // aquecer
  const comeco = performance.now();
  let total = 0;
  for (let i = 0; i < 10_000; i++) {
    total += linhasVisiveis(m, { topo: (i * 7919) % m.altura, altura: 900 }).length;
  }
  const demorou = performance.now() - comeco;
  assert.ok(total > 10_000, 'as chamadas devolveram linhas a sério');
  assert.ok(demorou < 200, `levou ${demorou.toFixed(1)} ms`);
});

// ── tempo <-> px ────────────────────────────────────────────────────────────

const VISTA = { deMs: T, ateMs: T + 2 * H };

test('as pontas da vista são as bordas do mapa', () => {
  assert.equal(xDoTempo(T, VISTA, 1000), 0);
  assert.equal(xDoTempo(T + 2 * H, VISTA, 1000), 1000);
  assert.equal(xDoTempo(T + H, VISTA, 1000), 500);
  assert.equal(tempoDoX(0, VISTA, 1000), T);
  assert.equal(tempoDoX(1000, VISTA, 1000), T + 2 * H);
  assert.equal(tempoDoX(250, VISTA, 1000), T + 30 * MIN);
});

test('ida e volta dá o mesmo instante', () => {
  for (const ms of [T, T + 1, T + 12_345, T + H + 777, T + 2 * H]) {
    const x = xDoTempo(ms, VISTA, 1366);
    assert.ok(Math.abs(tempoDoX(x, VISTA, 1366) - ms) < 1e-3, String(ms));
  }
});

test('fora da vista dá fora do ecrã, sem ser preso: quem pinta é que corta', () => {
  assert.equal(xDoTempo(T - H, VISTA, 1000), -500);
  assert.equal(xDoTempo(T + 3 * H, VISTA, 1000), 1500);
  assert.equal(tempoDoX(-500, VISTA, 1000), T - H);
});

test('uma vista que não é vista dá null, e não NaN', () => {
  for (const v of [null, {}, { deMs: T, ateMs: T }, { deMs: T + 1, ateMs: T }, { deMs: NaN, ateMs: T }]) {
    assert.equal(xDoTempo(T, v, 1000), null);
    assert.equal(tempoDoX(10, v, 1000), null);
  }
  assert.equal(xDoTempo(T, VISTA, 0), null);
  assert.equal(xDoTempo(NaN, VISTA, 1000), null);
  assert.equal(tempoDoX(undefined, VISTA, 1000), null);
});

// ── zoom ────────────────────────────────────────────────────────────────────

const LIMITES = { deMs: T, ateMs: T + 12 * H };
const fracao = (ms, v) => (ms - v.deMs) / (v.ateMs - v.deMs);
const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('o instante debaixo do rato continua debaixo do rato', () => {
  const vista = { deMs: T + H, ateMs: T + 5 * H };
  const rato = T + 2 * H; // a um quarto da largura
  const v = zoom(vista, rato, 0.5, LIMITES);
  assert.equal(v.ateMs - v.deMs, 2 * H);
  assert.ok(perto(fracao(rato, v), 0.25));
  const longe = zoom(vista, rato, 2, LIMITES);
  assert.equal(longe.ateMs - longe.deMs, 8 * H);
  assert.ok(perto(fracao(rato, longe), 0.25));
});

test('com o centro no meio, aproxima-se à volta do meio', () => {
  const v = zoom({ deMs: T + 2 * H, ateMs: T + 6 * H }, T + 4 * H, 0.25, LIMITES);
  assert.deepEqual(v, { deMs: T + 3.5 * H, ateMs: T + 4.5 * H });
});

test('com o centro fora da vista, a vista centra-se nele', () => {
  // O lance escolhido ficou para trás e carrega-se em "aproximar": mantê-lo
  // fixo era aproximar uma coisa que não se vê.
  const v = zoom({ deMs: T, ateMs: T + 2 * H }, T + 8 * H, 0.5, LIMITES);
  assert.deepEqual(v, { deMs: T + 7.5 * H, ateMs: T + 8.5 * H });
});

test('nunca menos de 30 s, e o centro continua fixo quando o mínimo corta o pedido', () => {
  const vista = { deMs: T + H, ateMs: T + H + 2 * MIN };
  const rato = T + H + 30_000; // a um quarto
  const v = zoom(vista, rato, 0.01, LIMITES);
  assert.equal(v.ateMs - v.deMs, ZOOM_MINIMO_MS);
  assert.ok(perto(fracao(rato, v), 0.25));
  // E mais zoom a partir do mínimo não mexe em nada.
  assert.deepEqual(zoom(v, rato, 0.5, LIMITES), v);
});

test('afastar nunca passa dos limites, e afastar muito dá os limites exactos', () => {
  const v = zoom({ deMs: T + 5 * H, ateMs: T + 7 * H }, T + 6 * H, 1000, LIMITES);
  assert.deepEqual(v, LIMITES);
});

test('perto de uma ponta, a vista é empurrada para dentro sem encolher', () => {
  const v = zoom({ deMs: T, ateMs: T + 2 * H }, T + 10 * MIN, 2, LIMITES);
  assert.deepEqual(v, { deMs: T, ateMs: T + 4 * H });
  const fim = zoom({ deMs: T + 10 * H, ateMs: T + 12 * H }, T + 12 * H - MIN, 2, LIMITES);
  assert.deepEqual(fim, { deMs: T + 8 * H, ateMs: T + 12 * H });
});

test('um evento mais curto do que 30 s mostra-se inteiro', () => {
  const curto = { deMs: T, ateMs: T + 10_000 };
  assert.deepEqual(zoom({ ...curto }, T + 5000, 0.1, curto), curto);
});

test('um fator que não é um número positivo não mexe no zoom, mas a vista sai presa', () => {
  const vista = { deMs: T + H, ateMs: T + 3 * H };
  for (const f of [NaN, 0, -2, undefined, '2']) {
    assert.deepEqual(zoom(vista, T + 2 * H, f, LIMITES), vista, String(f));
  }
  // Uma vista que já saiu dos limites volta para dentro.
  assert.deepEqual(zoom({ deMs: T - H, ateMs: T + H }, T, 1, LIMITES), { deMs: T, ateMs: T + 2 * H });
});

test('os limites podem ser o próprio mapa ou a janela do relógio', () => {
  const vista = { deMs: T, ateMs: T + 12 * H };
  const esperado = zoom(vista, T + 12 * H, 1000, LIMITES);
  assert.deepEqual(zoom(vista, T + 12 * H, 1000, { inicioMs: T, fimMs: T + 12 * H }), esperado);
  assert.deepEqual(zoom(vista, T + 12 * H, 1000, { inicio: T, fim: T + 12 * H }), esperado);
});

test('sem limites, só o mínimo de 30 s; sem vista, os limites', () => {
  const v = zoom({ deMs: T, ateMs: T + H }, T + 30 * MIN, 4, null);
  assert.deepEqual(v, { deMs: T - 90 * MIN, ateMs: T + 150 * MIN });
  assert.deepEqual(zoom({ deMs: T, ateMs: T + 1000 }, T + 500, 0.5), { deMs: T + 500 - 15_000, ateMs: T + 500 + 15_000 });
  assert.deepEqual(zoom(null, T, 0.5, LIMITES), LIMITES);
  assert.deepEqual(zoom({ deMs: NaN, ateMs: T }, T, 0.5, LIMITES), LIMITES);
});

test('sem centro, aproxima à volta do meio da vista', () => {
  assert.deepEqual(zoom({ deMs: T, ateMs: T + 4 * H }, undefined, 0.5, LIMITES), { deMs: T + H, ateMs: T + 3 * H });
});

test('não mexe na vista nem nos limites que recebe', () => {
  const vista = { deMs: T + H, ateMs: T + 3 * H };
  const lim = { ...LIMITES };
  const v = zoom(vista, T + 2 * H, 0.5, lim);
  assert.notEqual(v, vista);
  assert.deepEqual(vista, { deMs: T + H, ateMs: T + 3 * H });
  assert.deepEqual(lim, LIMITES);
});

test('aproximar e depois afastar volta à mesma vista', () => {
  const vista = { deMs: T + 2 * H, ateMs: T + 6 * H };
  const rato = T + 3 * H + 17 * MIN;
  let v = vista;
  for (let i = 0; i < 5; i++) v = zoom(v, rato, 0.8, LIMITES);
  for (let i = 0; i < 5; i++) v = zoom(v, rato, 1.25, LIMITES);
  assert.ok(perto(v.deMs, vista.deMs, 1) && perto(v.ateMs, vista.ateMs, 1), JSON.stringify(v));
});

// ── oQueEstaAqui ────────────────────────────────────────────────────────────

function mapaPequeno() {
  const coberturas = new Map([
    ['a', [[T, T + H]]],
    ['b', [[T + H, T + 2 * H]]],
    ['c', [[T, T + 2 * H]]],
  ]);
  // 0-24 time A, 24-44 a, 44-64 b, 64-88 time B, 88-108 resumo B
  return montarMapa({
    times: [{ nome: 'A', canais: ['a', 'b'] }, { nome: 'B', canais: ['c'] }],
    coberturas,
    abertos: new Set(['A']),
  });
}

test('diz que linha e que instante estão debaixo do ponteiro', () => {
  const m = mapaPequeno();
  const base = { topo: 0, vista: VISTA, largura: 1000 };
  assert.deepEqual(oQueEstaAqui(m, { ...base, x: 250, y: 30 }), {
    tipo: 'canal', time: 'A', canal: 'a', ms: T + 30 * MIN, noAr: true,
  });
  assert.deepEqual(oQueEstaAqui(m, { ...base, x: 250, y: 50 }), {
    tipo: 'canal', time: 'A', canal: 'b', ms: T + 30 * MIN, noAr: false,
  });
  assert.equal(oQueEstaAqui(m, { ...base, x: 0, y: 5 }).tipo, 'time');
  assert.deepEqual(oQueEstaAqui(m, { ...base, x: 500, y: 90 }), {
    tipo: 'resumo', time: 'B', canal: null, ms: T + H, noAr: true,
  });
});

test('o instante é o do tempoDoX, arredondado ao milissegundo', () => {
  const m = mapaPequeno();
  const vista = { deMs: T, ateMs: T + 7 };
  const r = oQueEstaAqui(m, { x: 333, y: 30, topo: 0, vista, largura: 1000 });
  assert.equal(r.ms, Math.round(tempoDoX(333, vista, 1000)));
});

test('o y é do ecrã: soma-se o que já se rolou', () => {
  const m = mapaPequeno();
  assert.equal(oQueEstaAqui(m, { x: 10, y: 0, topo: 44, vista: VISTA, largura: 1000 }).canal, 'b');
});

test('fora do mapa não há nada', () => {
  const m = mapaPequeno();
  const base = { topo: 0, vista: VISTA, largura: 1000 };
  assert.equal(oQueEstaAqui(m, { ...base, x: -1, y: 30 }), null);
  assert.equal(oQueEstaAqui(m, { ...base, x: 1001, y: 30 }), null);
  assert.equal(oQueEstaAqui(m, { ...base, x: 10, y: -1 }), null);
  assert.equal(oQueEstaAqui(m, { ...base, x: 10, y: m.altura }), null, 'por baixo da última linha');
  assert.equal(oQueEstaAqui(m, { ...base, x: NaN, y: 10 }), null);
  assert.equal(oQueEstaAqui(m, { ...base, x: 10, y: 10, largura: 0 }), null);
  assert.equal(oQueEstaAqui(null, { ...base, x: 10, y: 10 }), null);
  assert.equal(oQueEstaAqui(montarMapa(), { ...base, x: 10, y: 10 }), null);
});

test('sem vista, ainda se sabe a linha, mas não o instante', () => {
  const r = oQueEstaAqui(mapaPequeno(), { x: 10, y: 30, topo: 0, vista: null, largura: 1000 });
  assert.deepEqual(r, { tipo: 'canal', time: 'A', canal: 'a', ms: null, noAr: false });
});

test('a meio de um time, o cabeçalho preso no topo é o que se clica', () => {
  const { times, coberturas } = evento({ nTimes: 3, porTime: 10 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  // Time 1 começa em 24 + 10*20 = 224; o cabeçalho dele sobe para lá do topo
  // e as faixas t1c3... ficam no ecrã.
  const topo = 224 + 24 + 3 * 20 + 7;
  const r = oQueEstaAqui(m, { x: 10, y: 5, topo, vista: VISTA, largura: 1000 });
  assert.equal(r.tipo, 'time');
  assert.equal(r.time, 'Time 1');
  // Por baixo do cabeçalho preso, as faixas como sempre.
  assert.equal(oQueEstaAqui(m, { x: 10, y: 30, topo, vista: VISTA, largura: 1000 }).canal, 't1c4');
});

test('o cabeçalho não fica preso quando o do time seguinte já está ao alcance', () => {
  const { times, coberturas } = evento({ nTimes: 3, porTime: 10 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  // O cabeçalho do Time 1 está em 224; com o topo a 210 está a 14 px do topo.
  const r = oQueEstaAqui(m, { x: 10, y: 5, topo: 210, vista: VISTA, largura: 1000 });
  assert.equal(r.canal, 't0c9');
  // E no topo exacto de um cabeçalho, é ele próprio, no sítio dele.
  assert.equal(oQueEstaAqui(m, { x: 10, y: 5, topo: 224, vista: VISTA, largura: 1000 }).time, 'Time 1');
});

test('um clique perto de uma marca vai à marca', () => {
  const m = mapaPequeno();
  const marcas = new Map([['a', [{ ms: T + 30 * MIN, tipo: 'chat' }, { ms: T + 31 * MIN, tipo: 'tiro' }]]]);
  const base = { topo: 0, vista: VISTA, largura: 1200, marcas };
  // 1200 px para 2 h: 10 px por minuto. A marca das 30 está em x=300.
  const r = oQueEstaAqui(m, { ...base, x: 304, y: 30 });
  assert.equal(r.ms, T + 30 * MIN);
  assert.deepEqual(r.marca, { ms: T + 30 * MIN, tipo: 'chat', canal: 'a' });
  // A mais perto ganha: x=307 está a 3 px da das 31 e a 7 px da das 30.
  assert.equal(oQueEstaAqui(m, { ...base, x: 307, y: 30 }).marca.tipo, 'tiro');
  // Longe de todas, o instante é o do ponteiro.
  const longe = oQueEstaAqui(m, { ...base, x: 400, y: 30 });
  assert.equal(longe.marca, undefined);
  assert.equal(longe.ms, T + 40 * MIN);
  // As marcas de um canal não puxam o clique noutra faixa.
  assert.equal(oQueEstaAqui(m, { ...base, x: 304, y: 50 }).marca, undefined);
});

test('num time fechado, o clique vai às marcas de qualquer canal do time', () => {
  const m = mapaPequeno();
  const marcas = { c: [{ ms: T + H, tipo: 'morte' }] };
  const r = oQueEstaAqui(m, { x: 598, y: 95, topo: 0, vista: VISTA, largura: 1200, marcas });
  assert.equal(r.tipo, 'resumo');
  assert.deepEqual(r.marca, { ms: T + H, tipo: 'morte', canal: 'c' });
  // E um cabeçalho não vai a marcas: carregar nele abre e fecha o time.
  assert.equal(oQueEstaAqui(m, { x: 600, y: 70, topo: 0, vista: VISTA, largura: 1200, marcas }).marca, undefined);
});

// ── filtrar ─────────────────────────────────────────────────────────────────

const ELENCO = [
  { nome: 'Fúria', canais: ['ana', 'bruno', 'carla', 'duda'] },
  { nome: 'Lobos do Norte', canais: ['tchubi_rust', 'furioso', 'kodd'] },
  { nome: 'Kick-Off Crew', canais: ['eve', 'kıng'] },
  { nome: null, canais: ['solto1', 'furia_tv'] },
];

test('o nome do time bate: vem o time inteiro', () => {
  assert.deepEqual(filtrar(ELENCO, 'lobos'), [{ nome: 'Lobos do Norte', canais: ['tchubi_rust', 'furioso', 'kodd'] }]);
});

test('só um canal bate: vem só ele, dentro do time dele', () => {
  assert.deepEqual(filtrar(ELENCO, 'kodd'), [{ nome: 'Lobos do Norte', canais: ['kodd'] }]);
});

test('sem acentos nem maiúsculas, dos dois lados', () => {
  const nomes = (r) => r.map((t) => [t.nome, t.canais]);
  // "furia" acha a Fúria inteira e o furia_tv sem time; "furioso" não tem
  // "furia" lá dentro e fica de fora.
  assert.deepEqual(nomes(filtrar(ELENCO, 'furia')), [
    ['Fúria', ['ana', 'bruno', 'carla', 'duda']],
    [null, ['furia_tv']],
  ]);
  assert.deepEqual(nomes(filtrar(ELENCO, 'FÚRIA')), nomes(filtrar(ELENCO, 'furia')));
  assert.deepEqual(nomes(filtrar(ELENCO, 'LOBOS DO NORTE')), [['Lobos do Norte', ['tchubi_rust', 'furioso', 'kodd']]]);
});

test('os separadores não contam: um espaço acha um traço e vice-versa', () => {
  assert.deepEqual(filtrar(ELENCO, 'tchubi rust').map((t) => t.canais), [['tchubi_rust']]);
  assert.deepEqual(filtrar(ELENCO, 'kickoff').map((t) => t.nome), ['Kick-Off Crew']);
  assert.deepEqual(filtrar(ELENCO, 'kick off').map((t) => t.nome), ['Kick-Off Crew']);
});

test('letras que a NFKD desfaz e o i sem ponto', () => {
  const times = [
    { nome: '𝐓𝐞𝐚𝐦 Negrito', canais: ['x'] },
    { nome: 'Ｔｅａｍ Larga', canais: ['y'] },
    { nome: '³⁰⁰gang', canais: ['z'] },
  ];
  assert.deepEqual(filtrar(times, 'team').map((t) => t.canais), [['x'], ['y']]);
  assert.deepEqual(filtrar(times, '300').map((t) => t.canais), [['z']]);
  assert.deepEqual(filtrar(ELENCO, 'king').map((t) => t.canais), [['kıng']]);
});

test('uma procura só de pontuação compara à letra, e não acha tudo', () => {
  // Colada, "_" fica vazia, e a vazia está dentro de qualquer nome.
  assert.deepEqual(filtrar(ELENCO, '_').map((t) => t.canais), [['tchubi_rust'], ['furia_tv']]);
  assert.deepEqual(filtrar(ELENCO, '#'), []);
});

test('o grupo sem time procura-se pelos canais, nunca pelo nome', () => {
  assert.deepEqual(filtrar(ELENCO, 'null'), []);
  assert.deepEqual(filtrar(ELENCO, 'solto'), [{ nome: null, canais: ['solto1'] }]);
});

test('procura vazia devolve todos, em cópia', () => {
  for (const vazio of ['', '   ', null, undefined]) {
    const r = filtrar(ELENCO, vazio);
    assert.deepEqual(r, ELENCO);
    assert.notEqual(r[0], ELENCO[0]);
    assert.notEqual(r[0].canais, ELENCO[0].canais);
  }
});

test('ninguém bate: lista vazia', () => {
  assert.deepEqual(filtrar(ELENCO, 'zzzz'), []);
});

test('não mexe no elenco que recebe, e guarda o resto de cada time', () => {
  const antes = JSON.stringify(ELENCO);
  const comMais = [{ nome: 'Fúria', canais: ['ana', 'bruno'], cor: 'azul' }];
  const r = filtrar(comMais, 'ana');
  assert.deepEqual(r, [{ nome: 'Fúria', canais: ['ana'], cor: 'azul' }]);
  r[0].canais.push('intruso');
  assert.deepEqual(comMais[0].canais, ['ana', 'bruno']);
  filtrar(ELENCO, 'furia');
  assert.equal(JSON.stringify(ELENCO), antes);
});

test('entradas estragadas não rebentam', () => {
  assert.deepEqual(filtrar(null, 'a'), []);
  assert.deepEqual(filtrar([null, { nome: 'A' }, { nome: 'B', canais: [3, 'b'] }], 'b'), [{ nome: 'B', canais: ['b'] }]);
  assert.deepEqual(filtrar([{ nome: 7, canais: ['x'] }], '7'), [{ nome: 7, canais: ['x'] }]);
});

// ── pintarMapa ──────────────────────────────────────────────────────────────

const PERMITIDOS = new Set(['fillRect', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'save', 'restore']);

/**
 * Um canvas falso que grava cada chamada com as cores e o alfa desse momento.
 * Qualquer método chamado fica gravado, mesmo os que não deviam — e é o
 * teste que diz se só se usou o permitido.
 */
function ctxFalso() {
  const chamadas = [];
  const estado = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textBaseline: 'alphabetic', textAlign: 'start',
  };
  const pilha = [];
  const ctx = new Proxy({}, {
    get(_, nome) {
      if (nome === 'chamadas') return chamadas;
      if (typeof nome === 'symbol' || nome === 'then') return undefined;
      if (Object.hasOwn(estado, nome)) return estado[nome];
      return (...args) => {
        chamadas.push({ nome, args, ...estado });
        if (nome === 'save') pilha.push({ ...estado });
        if (nome === 'restore') Object.assign(estado, pilha.pop());
      };
    },
    set(_, nome, valor) {
      estado[nome] = valor;
      return true;
    },
  });
  return ctx;
}

/** Os caminhos desenhados, cada um com os seus segmentos e a cor do stroke. */
function caminhos(chamadas) {
  const saida = [];
  let atual = null;
  let de = null;
  for (const c of chamadas) {
    if (c.nome === 'beginPath') atual = { segmentos: [] };
    if (c.nome === 'moveTo') de = c.args;
    if (c.nome === 'lineTo' && atual) atual.segmentos.push([...de, ...c.args]);
    if (c.nome === 'stroke' && atual) { saida.push({ ...atual, cor: c.strokeStyle, largura: c.lineWidth }); atual = null; }
  }
  return saida;
}

const TELA = { largura: 1000, altura: 600 };

function pintar(mapa, opcoes = {}) {
  const ctx = ctxFalso();
  pintarMapa(ctx, mapa, { topo: 0, ...TELA, vista: VISTA, ...opcoes });
  return ctx.chamadas;
}

test('só usa o básico da API 2D, e cada save tem o seu restore', () => {
  const { times, coberturas } = evento({ soltos: 3 });
  const m = montarMapa({ times, coberturas, abertos: new Set(['Time 1', 'Time 2']) });
  const marcas = new Map([['t1c0', [{ ms: T + H, tipo: 'chat' }]], ['t0c1', [{ ms: T + 2 * MIN, tipo: 'tiro' }]]]);
  const chamadas = pintar(m, { topo: 30, agoraMs: T + H, marcas, escolhido: 't1c1' });
  const usados = new Set(chamadas.map((c) => c.nome));
  for (const u of usados) assert.ok(PERMITIDOS.has(u), `usou ${u}`);
  let fundo = 0;
  for (const c of chamadas) {
    if (c.nome === 'save') fundo++;
    if (c.nome === 'restore') fundo--;
    assert.ok(fundo >= 0, 'restore sem save');
  }
  assert.equal(fundo, 0);
  assert.equal(chamadas[0].nome, 'save');
  assert.equal(chamadas.at(-1).nome, 'restore');
});

test('só as linhas que se vêem são pintadas', () => {
  const { times, coberturas } = evento();
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  const topo = 5000;
  const chamadas = pintar(m, { topo });
  const visiveis = linhasVisiveis(m, { topo, altura: TELA.altura });
  const canaisVisiveis = new Set(visiveis.filter((l) => l.tipo === 'canal').map((l) => l.canal));
  const textos = chamadas.filter((c) => c.nome === 'fillText').map((c) => c.args[0]);
  const canaisPintados = textos.filter((t) => /^t\d+c\d+$/.test(t));
  assert.ok(canaisPintados.length >= canaisVisiveis.size - 2, 'quase todas as faixas visíveis têm nome');
  for (const t of canaisPintados) assert.ok(canaisVisiveis.has(t), `${t} não está no ecrã`);
  // E nem uma barra de cobertura a mais do que as das faixas visíveis.
  const barras = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura && c.args[2] > 3);
  assert.ok(barras.length <= canaisVisiveis.size, `${barras.length} barras para ${canaisVisiveis.size} faixas`);
});

test('nada sai do canvas', () => {
  const { times, coberturas } = evento({ soltos: 40 });
  const abertos = new Set(times.filter((_, i) => i % 3).map((t) => t.nome));
  const m = montarMapa({ times, coberturas, abertos });
  const marcas = new Map();
  for (const t of times) for (const c of t.canais) marcas.set(c, [{ ms: T - H }, { ms: T + 10 * MIN }, { ms: T + 3 * H }, { ms: T + 9 * H }]);
  const { largura, altura } = TELA;
  const vista = { deMs: T + 30 * MIN, ateMs: T + 150 * MIN };
  for (let topo = -40; topo < m.altura + 40; topo += 293) {
    const chamadas = pintar(m, { topo, vista, agoraMs: T + H, marcas, escolhido: 't3c1' });
    for (const c of chamadas) {
      const a = c.args;
      if (c.nome === 'fillRect') {
        assert.ok(a[0] >= 0 && a[1] >= 0 && a[2] > 0 && a[3] > 0, `fillRect ${a} em ${topo}`);
        assert.ok(a[0] + a[2] <= largura + 1e-9 && a[1] + a[3] <= altura + 1e-9, `fillRect ${a} em ${topo}`);
      }
      if (c.nome === 'moveTo' || c.nome === 'lineTo') {
        assert.ok(a[0] >= 0 && a[0] <= largura && a[1] >= 0 && a[1] <= altura, `${c.nome} ${a} em ${topo}`);
      }
      if (c.nome === 'fillText') {
        const tam = Number(/(\d+)px/.exec(c.font)[1]);
        assert.ok(a[1] >= 0 && a[1] + a[3] <= largura, `fillText ${a} em ${topo}`);
        assert.ok(a[2] - tam / 2 >= 0 && a[2] + tam / 2 <= altura, `fillText ${a} em ${topo}`);
        assert.equal(c.textBaseline, 'middle');
      }
    }
  }
});

test('a cabeça está em xDoTempo(agoraMs), de cima a baixo, e por cima de tudo', () => {
  const { times, coberturas } = evento({ nTimes: 10 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  const agoraMs = T + 47 * MIN + 123;
  const chamadas = pintar(m, { topo: 100, agoraMs, cores: { cabeca: '#ffffff' } });
  const x = xDoTempo(agoraMs, VISTA, TELA.largura);
  const ultimo = caminhos(chamadas).at(-1);
  assert.equal(ultimo.cor, '#ffffff');
  assert.deepEqual(ultimo.segmentos, [[x, 0, x, TELA.altura]]);
  // Nada se pinta depois dela.
  const iStroke = chamadas.findLastIndex((c) => c.nome === 'stroke');
  assert.deepEqual(chamadas.slice(iStroke + 1).map((c) => c.nome), ['restore']);
});

test('sem agoraMs, ou com ele fora da vista, não há cabeça', () => {
  const { times, coberturas } = evento({ nTimes: 2 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  for (const agoraMs of [null, undefined, NaN, T - 1, T + 2 * H + 1]) {
    const linhas = caminhos(pintar(m, { agoraMs }));
    assert.ok(!linhas.some((p) => p.cor === CORES.cabeca && p.segmentos.some((s) => s[1] === 0 && s[3] === TELA.altura)), String(agoraMs));
  }
});

test('as barras de cobertura vão de onde o canal entra a onde sai, cortadas à vista', () => {
  const coberturas = new Map([['a', [[T - H, T + 30 * MIN], [T + H, T + 3 * H]]]]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }], coberturas, abertos: new Set(['A']) });
  const chamadas = pintar(m);
  const barras = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura).map((c) => c.args);
  // A faixa 'a' está de 24 a 44; a barra deixa 4 px em cima e em baixo.
  assert.deepEqual(barras, [[0, 28, 250, 12], [500, 28, 500, 12]]);
});

test('um VOD curto num evento longo tem pelo menos um pixel', () => {
  const coberturas = new Map([['a', [[T + H, T + H + 1000]]], ['b', [[T + 2 * H - 500, T + 2 * H]]]]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b'] }], coberturas, abertos: new Set(['A']) });
  const barras = pintar(m).filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura).map((c) => c.args);
  assert.equal(barras.length, 2);
  for (const [x, , w] of barras) assert.ok(w >= 1 && x + w <= TELA.largura, `${x} ${w}`);
});

test('as marcas: só as da vista, uma por pixel, e com a cor do tipo', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }], coberturas: new Map([['a', [[T, T + 2 * H]]]]), abertos: new Set(['A']) });
  const marcas = new Map([['a', [
    { ms: T - MIN, tipo: 'chat' },            // antes da vista
    { ms: T + 12 * MIN, tipo: 'chat' },       // x=100
    { ms: T + 12 * MIN + 100, tipo: 'chat' }, // o mesmo pixel
    { ms: T + 60 * MIN, tipo: 'tiro' },       // x=500
    { ms: T + 3 * H, tipo: 'tiro' },          // depois da vista
    { ms: 'lixo' },
  ]]]);
  const linhas = caminhos(pintar(m, { marcas, cores: { marcas: { tiro: '#ff0000' } } }));
  const ambar = linhas.find((p) => p.cor === CORES.marca);
  const vermelho = linhas.find((p) => p.cor === '#ff0000');
  assert.deepEqual(ambar.segmentos, [[100, 25, 100, 43]]);
  assert.deepEqual(vermelho.segmentos, [[500, 25, 500, 43]]);
});

test('num time fechado, o resumo mostra as marcas de todos e é mais forte onde há mais gente', () => {
  const coberturas = new Map([['a', [[T, T + H]]], ['b', [[T + 30 * MIN, T + H]]]]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b'] }], coberturas });
  const marcas = new Map([['b', [{ ms: T + 45 * MIN, tipo: 'tiro' }]]]);
  const chamadas = pintar(m, { marcas });
  const barras = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura);
  assert.equal(barras.length, 2);
  const [um, dois] = barras;
  assert.deepEqual([um.args[0], um.args[2]], [0, 250]);
  assert.deepEqual([dois.args[0], dois.args[2]], [250, 250]);
  assert.ok(dois.globalAlpha > um.globalAlpha, `${dois.globalAlpha} > ${um.globalAlpha}`);
  assert.ok(um.globalAlpha >= 0.35);
  assert.equal(dois.globalAlpha, 1);
  assert.ok(caminhos(chamadas).some((p) => p.cor === CORES.marca && p.segmentos[0][0] === 375));
  // O resumo diz quem está lá dentro, e o cabeçalho quantos são.
  const textos = chamadas.filter((c) => c.nome === 'fillText').map((c) => c.args[0]);
  assert.ok(textos.includes('▸ A (2)'), textos.join(' | '));
  assert.ok(textos.includes('a, b'), textos.join(' | '));
});

test('a meio de um time, o cabeçalho dele fica preso no topo', () => {
  const { times, coberturas } = evento({ nTimes: 3, porTime: 10 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  const topo = 224 + 24 + 3 * 20 + 7;
  const chamadas = pintar(m, { topo });
  const textos = chamadas.filter((c) => c.nome === 'fillText');
  const preso = textos.find((c) => c.args[0] === '▾ Time 1 (10)');
  assert.ok(preso, textos.map((c) => c.args[0]).join(' | '));
  assert.equal(preso.args[2], 12, 'no meio dos 24 px do topo');
  // E é pintado depois das faixas que tapa.
  const iPreso = chamadas.indexOf(preso);
  const iFaixa = chamadas.findIndex((c) => c.nome === 'fillText' && c.args[0] === 't1c4');
  assert.ok(iFaixa >= 0 && iFaixa < iPreso);
});

test('o grupo sem time chama-se "Sem time", ou o que a página mandar', () => {
  const m = montarMapa({ times: [{ nome: null, canais: ['s'] }], coberturas: new Map() });
  const textos = (o) => pintar(m, o).filter((c) => c.nome === 'fillText').map((c) => c.args[0]);
  assert.ok(textos().includes('▸ Sem time (1)'));
  assert.ok(textos({ semTime: 'No team' }).includes('▸ No team (1)'));
});

test('um nome comprido é cortado com reticências, sem partir um emoji a meio', () => {
  // Um 'A' à frente para o corte cair a meio de um par: só emojis, o corte
  // caía num número par de unidades e o teste passava por sorte.
  const nome = `A${'🔥'.repeat(80)}`;
  const m = montarMapa({ times: [{ nome, canais: ['s'] }] });
  const texto = pintar(m, { largura: 300 }).find((c) => c.nome === 'fillText').args[0];
  assert.ok(texto.endsWith('… (1)'), texto);
  assert.ok(texto.length < nome.length);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(texto), 'meio emoji');
});

test('num ecrã estreito, corta-se o nome do time e não quantos são', () => {
  const m = montarMapa({ times: [{ nome: 'Lobos do Norte do Servidor Oficial', canais: ['a', 'b', 'c', 'd'] }] });
  const texto = pintar(m, { largura: 160 }).find((c) => c.nome === 'fillText').args[0];
  assert.match(texto, /^▸ Lobos.*… \(4\)$/);
  // O cabeçalho não tem barras: num telemóvel o nome usa a linha toda, e não
  // só o terço que as faixas deixam aos nomes dos canais.
  const largo = pintar(m, { largura: 380 }).find((c) => c.nome === 'fillText').args[0];
  assert.equal(largo, '▸ Lobos do Norte do Servidor Oficial (4)');
  // E se nem o número cabe, corta-se tudo, mas não se pinta fora.
  const apertado = pintar(m, { largura: 40 }).filter((c) => c.nome === 'fillText');
  for (const c of apertado) assert.ok(c.args[1] + c.args[3] <= 40);
});

test('o canal escolhido fica realçado, e o time fechado dele também', () => {
  const coberturas = new Map([['a', [[T, T + H]]], ['b', [[T, T + H]]]]);
  const realce = (abertos) => {
    const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b'] }], coberturas, abertos });
    return pintar(m, { escolhido: 'b' })
      .filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura && c.args[0] === 0 && c.args[2] === 3)
      .map((c) => c.args[1]);
  };
  assert.deepEqual(realce(new Set(['A'])), [44], 'a faixa b, de 44 a 64');
  assert.deepEqual(realce(new Set()), [24], 'o resumo do time');
});

test('pintar 500 canais custa o mesmo que pintar 50', () => {
  // O ponto do canvas: o custo é o do ecrã, não o do evento.
  const pequeno = evento({ nTimes: 13 });
  const grande = evento({ nTimes: 125 });
  const contar = ({ times, coberturas }) => {
    const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
    return pintar(m, { topo: 300, agoraMs: T + H }).map((c) => c.nome).join(',');
  };
  assert.equal(contar(grande), contar(pequeno));
});

test('sem vista, pinta as faixas e os nomes, mas nem barras nem cabeça', () => {
  const { times, coberturas } = evento({ nTimes: 2 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  const chamadas = pintar(m, { vista: null, agoraMs: T + H });
  assert.ok(chamadas.some((c) => c.nome === 'fillText' && c.args[0] === 't0c0'));
  assert.ok(!chamadas.some((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura));
  assert.ok(!chamadas.some((c) => c.nome === 'stroke'));
});

test('um mapa vazio pinta só o fundo', () => {
  const chamadas = pintar(montarMapa(), { agoraMs: null });
  assert.deepEqual(chamadas.filter((c) => c.nome === 'fillRect').map((c) => [c.args, c.fillStyle]), [[[0, 0, 1000, 600], CORES.fundo]]);
});

test('cores vazias do tema caem nas de omissão, e não na cor anterior', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }], coberturas: new Map([['a', [[T, T + H]]]]), abertos: new Set(['A']) });
  const chamadas = pintar(m, { cores: { fundo: '', cobertura: '  ', faixa: '#123456', texto: 7 } });
  assert.equal(chamadas.find((c) => c.nome === 'fillRect').fillStyle, CORES.fundo);
  assert.ok(chamadas.some((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura));
  assert.ok(chamadas.some((c) => c.nome === 'fillRect' && c.fillStyle === '#123456'));
  assert.ok(chamadas.filter((c) => c.nome === 'fillText').every((c) => typeof c.fillStyle === 'string'));
});

test('um canvas sem tamanho, ou sem contexto, não pinta nada nem rebenta', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }] });
  assert.deepEqual(pintar(m, { largura: 0 }), []);
  assert.deepEqual(pintar(m, { altura: NaN }), []);
  assert.doesNotThrow(() => pintarMapa(null, m, { ...TELA, vista: VISTA }));
  assert.doesNotThrow(() => pintarMapa(ctxFalso(), null, { ...TELA, vista: VISTA }));
});

test('a faixa escolhida tem fundo de acento, contorno e nome em negrito; os colegas têm a risca', () => {
  const coberturas = new Map([['a', [[T, T + H]]], ['b', [[T, T + H]]], ['c', [[T, T + H]]]]);
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b', 'c'] }], coberturas, abertos: new Set(['A']) });
  const chamadas = pintar(m, { escolhido: 'b', realcados: new Set(['a', 'b']) });
  // As faixas: a de 24 a 44, b de 44 a 64, c de 64 a 84.
  const fundoB = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.escolha).map((c) => c.args);
  assert.deepEqual(fundoB, [[0, 44, 1000, 20]]);
  const contorno = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.texto).map((c) => c.args);
  assert.deepEqual(contorno, [[0, 44, 1000, 1], [0, 63, 1000, 1], [0, 44, 1, 20], [999, 44, 1, 20]]);
  const riscas = chamadas
    .filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura && c.args[0] === 0 && c.args[2] === 3)
    .map((c) => c.args[1]);
  assert.deepEqual(riscas, [24, 44], 'a e b vão abrir, c não');
  const nome = (n) => chamadas.find((c) => c.nome === 'fillText' && c.args[0] === n);
  assert.match(nome('b').font, /^600 12px/);
  assert.match(nome('a').font, /^400 12px/);
});

test('um canal que não existe na Kick tem o nome a vermelho e diz porquê', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['bom', 'gralha'] }], coberturas: new Map([['bom', [[T, T + H]]]]), abertos: new Set(['A']) });
  const chamadas = pintar(m, { falhados: new Set(['gralha']), naoAchado: 'não achado' });
  const textos = chamadas.filter((c) => c.nome === 'fillText');
  const gralha = textos.find((c) => c.args[0].startsWith('gralha'));
  assert.equal(gralha.args[0], 'gralha (não achado)');
  assert.equal(gralha.fillStyle, CORES.perigo);
  assert.equal(textos.find((c) => c.args[0] === 'bom').fillStyle, CORES.texto);
  // Sem o texto traduzido, fica só a cor.
  const semTexto = pintar(m, { falhados: new Set(['gralha']) }).filter((c) => c.nome === 'fillText').map((c) => c.args[0]);
  assert.ok(semTexto.includes('gralha'), semTexto.join(' | '));
});

test('cada marca tem uma bandeirinha no topo da faixa, presa ao ecrã', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a'] }], coberturas: new Map([['a', [[T, T + 2 * H]]]]), abertos: new Set(['A']) });
  const marcas = new Map([['a', [{ ms: T + 12 * MIN, tipo: 'chat' }, { ms: T, tipo: 'chat' }, { ms: T + 2 * H, tipo: 'chat' }]]]);
  const chamadas = pintar(m, { marcas });
  const linhas = caminhos(chamadas).filter((p) => p.cor === CORES.marca);
  assert.equal(linhas[0].largura, 3);
  const quadrados = chamadas.filter((c) => c.nome === 'fillRect' && c.args[2] === 7 && c.args[3] === 7).map((c) => c.args);
  // x=100 no meio, e as duas das pontas encostadas às beiras em vez de saírem do ecrã.
  assert.deepEqual(quadrados, [[97, 25, 7, 7], [0, 25, 7, 7], [993, 25, 7, 7]]);
  const cor = chamadas.filter((c) => c.nome === 'fillRect' && c.args[2] === 5 && c.args[3] === 5);
  assert.ok(cor.every((c) => c.fillStyle === CORES.marca) && cor.length === 3);
});

test('a cabeça tem um fio escuro de cada lado, pintado antes dela', () => {
  const { times, coberturas } = evento({ nTimes: 2 });
  const m = montarMapa({ times, coberturas, abertos: todosAbertos(times) });
  const agoraMs = T + H;
  const chamadas = pintar(m, { agoraMs });
  const x = xDoTempo(agoraMs, VISTA, TELA.largura);
  const fios = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.fundo && c.args[2] === 1).map((c) => c.args);
  assert.deepEqual(fios, [[x - 2, 0, 1, TELA.altura], [x + 1, 0, 1, TELA.altura]]);
  const iStroke = chamadas.findLastIndex((c) => c.nome === 'stroke');
  assert.ok(chamadas.findLastIndex((c) => c.nome === 'fillRect') < iStroke);
});

test('num ecrã estreito, o nome de um canal que não existe não é comido pelo aviso', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['terceiro'] }], coberturas: new Map(), abertos: new Set(['A']) });
  const textos = pintar(m, { largura: 365, falhados: new Set(['terceiro']), naoAchado: 'não achado' })
    .filter((c) => c.nome === 'fillText').map((c) => c.args[0]);
  assert.ok(textos.includes('terceiro (não achado)'), textos.join(' | '));
});

test('o cursor do teclado contorna a linha e marca o instante, sem sair do ecrã', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['a', 'b'] }], coberturas: new Map([['a', [[T, T + H]]]]), abertos: new Set(['A']) });
  const chamadas = pintar(m, { cursor: { i: 1, ms: T + 12 * MIN } });
  const azuis = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.cobertura && (c.args[2] === 2 || c.args[3] === 2)).map((c) => c.args);
  assert.deepEqual(azuis, [[0, 24, 1000, 2], [0, 42, 1000, 2], [0, 24, 2, 20], [998, 24, 2, 20]]);
  const traco = chamadas.filter((c) => c.nome === 'fillRect' && c.fillStyle === CORES.texto && c.args[2] === 2).map((c) => c.args);
  assert.deepEqual(traco, [[99, 24, 2, 20]]);
  // Uma linha que não existe não pinta nada.
  assert.doesNotThrow(() => pintar(m, { cursor: { i: 99, ms: T } }));
});
