// O filtro de alertas (alertas.js) em sons feitos de propósito: um jingle que toca igual várias vezes é
// aprendido e sai, e explosões que variam não saem. Prova a regra nos sons de livro; com gravações
// reais os limiares ainda não foram afinados (ver FILA.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './sons-sinteticos.mjs';
import {
  medirEspectro, assinar, semelhanca, aprender, tirarAlertas, paraGuardado, deGuardado, memoriaDoCanal,
  treinarPositivo, pontuar, FPS_ESP, BANDAS,
} from '../site/alertas.js';
import { medirGraves, explosoes } from '../site/explosoes.js';
import { chao } from '../site/tiros.js';

/** Um jingle de sub: ronco grave de 60 Hz e quatro notas, 2 s, sempre o mesmo clipe. */
function jingle(amp = 0.6) {
  const n = Math.round(2 * S.TAXA);
  const a = new Float32Array(n);
  const notas = [523, 659, 784, 1046];
  for (let i = 0; i < n; i++) {
    const t = i / S.TAXA;
    const nota = notas[Math.min(3, Math.floor(t / 0.4))];
    const env = Math.min(1, t * 50) * Math.exp(-(t % 0.4) * 2) * Math.exp(-t / 1.5);
    a[i] = amp * (0.9 * Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t / 1.2)
      + 0.5 * env * (Math.sin(2 * Math.PI * nota * t) + 0.4 * Math.sin(2 * Math.PI * 2 * nota * t)));
  }
  return a;
}

/** Uma explosão que varia: semente, duração e corte do grave mudam de uma para a outra. */
function explosaoVariada(k) {
  const dur = 0.8 + (k % 4) * 0.45;
  const a = S.explosao(0.5 + 0.1 * (k % 3), dur, 100 + k * 7);
  // abafar mais ou menos (distância): passa-baixo de um pólo com corte diferente
  const c = Math.exp((-2 * Math.PI * (400 + 600 * (k % 5))) / S.TAXA);
  let lp = 0;
  for (let i = 0; i < a.length; i++) { lp = c * lp + (1 - c) * a[i]; a[i] = 0.5 * a[i] + 0.5 * lp * 3; }
  return a;
}

function live(segundos, eventos) {
  const base = S.fundo(segundos, 0.004, 5);
  S.por(base, S.conversa(segundos), 0);
  for (const [s, som] of eventos) S.por(base, som, s);
  return base;
}

const janela = (inicioS, som) => ({ inicioS, fimS: inicioS + som.length / S.TAXA });

test('o espectro tem 20 bandas por quadro e um tom é bem menos achatado que o ruído', () => {
  const tom = medirEspectro(S.apito(0.5, 1));
  const ruido = medirEspectro(S.tiro(0.8, 400));
  assert.equal(tom.quadros.length, tom.plano.length * BANDAS);
  assert.ok(Math.abs(tom.plano.length - 20) <= 1);
  const media = (e) => e.plano.reduce((s, x) => s + x, 0) / e.plano.length / 255;
  assert.ok(media(tom) < 0.3, `tom ${media(tom)}`);
  assert.ok(media(ruido) > 0.5, `ruído ${media(ruido)}`);
});

test('o mesmo jingle por cima de fundos diferentes e com volumes diferentes é aprendido', () => {
  const ev = [[10, jingle(0.6)], [40, jingle(0.3)], [75, jingle(0.9)], [120, jingle(0.5)]];
  const esp = medirEspectro(live(140, ev));
  const ass = ev.map(([s, som]) => assinar(esp, ...Object.values(janela(s, som))));
  assert.ok(semelhanca(ass[0], ass[1]) > 0.9, `${semelhanca(ass[0], ass[1])}`);
  const { dosAlertas, grupos } = aprender(ass);
  assert.equal(dosAlertas.size, 4);
  assert.equal(grupos.filter((g) => g.alerta).length, 1);
});

test('explosões que variam não são aprendidas como alerta, nem seis seguidas', () => {
  const ev = [0, 1, 2, 3, 4, 5].map((k) => [10 + k * 20, explosaoVariada(k)]);
  const esp = medirEspectro(live(150, ev));
  const ass = ev.map(([s, som]) => assinar(esp, ...Object.values(janela(s, som))));
  const { dosAlertas } = aprender(ass);
  assert.equal(dosAlertas.size, 0);
});

test('o mesmo clipe de explosão tocado 3 vezes (ruído, não tom) não vira alerta', () => {
  const igual = S.explosao(0.6, 1.5, 33);
  const ev = [[10, igual], [50, igual], [90, igual]];
  const esp = medirEspectro(live(120, ev));
  const ass = ev.map(([s, som]) => assinar(esp, ...Object.values(janela(s, som))));
  const { dosAlertas, grupos } = aprender(ass);
  assert.equal(dosAlertas.size, 0, JSON.stringify(grupos.map((g) => [g.indices, g.media, g.plano])));
});

test('na live inteira: o jingle sai da lista de explosões e as explosões ficam', () => {
  const ev = [[10, jingle()], [30, explosaoVariada(1)], [55, jingle(0.4)], [80, explosaoVariada(2)], [105, jingle(0.8)]];
  const som = live(130, ev);
  const m = medirGraves(som, S.TAXA);
  const achadas = explosoes(m, chao(m.forca));
  assert.ok(achadas.length >= 5, `a detecção achou ${achadas.length}`);
  const r = tirarAlertas(achadas, medirEspectro(som));
  assert.equal(r.removidos.length, 3);
  assert.ok(r.removidos.every((x) => x.porque === 'repete'));
  assert.deepEqual(r.mantidos.map((x) => Math.round(x.inicioS / 10)), [3, 8]);
  assert.equal(r.novos.length, 1);
});

test('uma única vez no canal só sai se o canal já lembrava o alerta', () => {
  const ev = [[10, jingle()], [40, explosaoVariada(3)]];
  const som = live(70, ev);
  const m = medirGraves(som, S.TAXA);
  const achadas = explosoes(m, chao(m.forca));
  const esp = medirEspectro(som);
  assert.equal(tirarAlertas(achadas, esp).removidos.length, 0);

  // aprender numa live com 3 repetições, guardar, e usar noutra live
  const ev3 = [[10, jingle()], [30, jingle(0.4)], [50, jingle(0.8)]];
  const som3 = live(70, ev3);
  const m3 = medirGraves(som3, S.TAXA);
  const r3 = tirarAlertas(explosoes(m3, chao(m3.forca)), medirEspectro(som3));
  const guardado = new Map();
  const armazem = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) };
  memoriaDoCanal('Abisal', armazem).aoAprender(r3.novos);
  const mem = memoriaDoCanal('abisal', armazem);
  assert.equal(mem.lembrados.length, 1);
  assert.ok(guardado.get('povix.alertas.abisal').length < 4000);
  const r = tirarAlertas(achadas, esp, { lembrados: mem.lembrados });
  assert.equal(r.removidos.length, 1);
  assert.equal(r.removidos[0].porque, 'lembrado');
  assert.equal(r.mantidos.length, achadas.length - 1);
});

test('o modelo guardado volta igual, e lixo no armazenamento não quebra', () => {
  const ev = [[5, jingle()], [25, jingle(0.5)]];
  const esp = medirEspectro(live(40, ev));
  const a = assinar(esp, 5, 7);
  const volta = deGuardado(JSON.parse(JSON.stringify(paraGuardado(a))));
  assert.ok(semelhanca(a, volta) > 0.99);
  assert.equal(deGuardado({ n: 20, q: 'xx' }), null);
  assert.equal(deGuardado(null), null);
  const armazem = { getItem: () => '{lixo', setItem: () => { throw new Error('cheio'); } };
  const mem = memoriaDoCanal('x', armazem);
  assert.deepEqual(mem.lembrados, []);
  assert.doesNotThrow(() => mem.aoAprender([a]));
});

test('o modelo positivo dá nota alta a uma explosão nova e baixa a um jingle e a um tiro', () => {
  const treino = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const som = explosaoVariada(k);
    return assinar(medirEspectro(live(20, [[5, som]])), 5, 5 + som.length / S.TAXA);
  });
  const modelo = treinarPositivo(treino);
  assert.equal(modelo.media.length, BANDAS + 3);
  assert.equal(treinarPositivo(treino.slice(0, 2)), null, 'com poucas amostras não treina');
  const nota = (som) => pontuar(assinar(medirEspectro(live(20, [[5, som]])), 5, 5 + som.length / S.TAXA), modelo);
  const nova = nota(explosaoVariada(11));
  const jing = nota(jingle());
  assert.ok(nova > 0.2, `explosão ${nova}`);
  assert.ok(jing < nova / 3, `jingle ${jing} contra ${nova}`);
  assert.ok(FPS_ESP === 20);
});

test('varrerNoite com alertas: tira o jingle que repete, devolve o que saiu e aprende para o canal', async () => {
  const { varrerNoite } = await import('../site/procurar-momentos.js');
  const T = Date.parse('2026-08-30T22:00:00Z');
  const NOITE = 600;
  const som = live(NOITE, [[40, jingle(0.9)], [130, explosaoVariada(2)], [250, jingle(0.8)], [330, explosaoVariada(1)], [470, jingle(1)]]);
  const aprendidos = [];
  const chamar = (alertas) => varrerNoite({
    linha: { slug: 'abisal' },
    deMs: T,
    ateMs: T + NOITE * 1000,
    bocadoS: 300,
    filtros: { tiros: false, explosoes: true, gritos: false },
    alertas,
    opcoes: { porHora: 100 },
    lerSom: async (linha, quandoMs, duracaoS) => {
      const de = Math.round(((quandoMs - T) / 1000) * S.TAXA);
      return som.subarray(de, de + Math.round(duracaoS * S.TAXA));
    },
  });
  const sem = await chamar(null);
  assert.equal(sem.explosoes.length, 5, 'sem o filtro os 3 jingles contam como explosão');
  assert.deepEqual(sem.alertasFora, []);
  const com = await chamar({ lembrados: [], aoAprender: (n) => aprendidos.push(...n) });
  assert.equal(com.explosoes.length, 2, JSON.stringify(com.explosoes));
  assert.equal(com.alertasFora.length, 3);
  assert.ok(com.alertasFora.every((x) => x.porque === 'repete'));
  assert.equal(aprendidos.length, 1);
});

// ── o que o dono confirmou na live do tchubi de 08/10: nenhum desses 8 sons era explosão ────────────────

import { readFileSync } from 'node:fs';
import { alertasDoCanal, POSITIVO, PADROES } from '../site/alertas.js';
import MODELO from '../site/modelo-explosao.js';

const tchubi = JSON.parse(readFileSync(new URL('./tchubi-alertas/eventos.json', import.meta.url), 'utf8'))
  .eventos.map((e) => ({ ...e, a: deGuardado(e) }));

test('o modelo do app tem os 23 traços e desvios positivos', () => {
  assert.equal(MODELO.media.length, BANDAS + 3);
  assert.equal(MODELO.desvio.length, BANDAS + 3);
  assert.ok(MODELO.desvio.every((d) => d > 0));
  assert.ok(MODELO.n >= 500);
});

test('live do tchubi: o modelo positivo dá a todos os 8 sons sem explosão uma nota abaixo do corte do app', () => {
  assert.equal(tchubi.length, 8);
  for (const e of tchubi) {
    const nota = pontuar(e.a, MODELO);
    assert.ok(nota < POSITIVO.minimo, `${e.rotulo} aos ${e.liveS} s: nota ${nota.toFixed(2)}`);
  }
});

test('live do tchubi: os dois alertas do mesmo sub (4 min e 1 h 03) viram um alerta aprendido, os tiros não', () => {
  const ass = tchubi.map((e) => e.a);
  const { grupos, dosAlertas } = aprender(ass);
  const alertas = tchubi.map((e, i) => [e, i]).filter(([e]) => e.rotulo.startsWith('alerta')).map(([, i]) => i);
  assert.equal(alertas.length, 2);
  assert.ok(semelhanca(ass[alertas[0]], ass[alertas[1]]) < PADROES.identico, 'a semelhança real é menor que a de 2 repetições idênticas');
  assert.deepEqual([...dosAlertas].sort(), alertas.sort());
  assert.equal(grupos.filter((g) => g.alerta).length, 1);
});

test('tom forte repetido 2 vezes com semelhança 0,85 vira alerta; com achatamento de ruído não', () => {
  const n = 40;
  const base = new Float32Array(n * BANDAS).map((_, i) => 10 * Math.sin(i * 0.37) + 4 * Math.cos(i * 0.11));
  const com = (ruido, plano) => ({ n, v: base.map((x, i) => x + ruido * Math.sin(i * 12.9898) * 3), plano, duracaoS: 2 });
  const par = (plano) => aprender([com(1, plano), com(-1, plano)]);
  assert.ok(semelhanca(com(1, 0.1), com(-1, 0.1)) >= PADROES.repetidoTonal && semelhanca(com(1, 0.1), com(-1, 0.1)) < PADROES.identico);
  assert.equal(par(0.15).dosAlertas.size, 2);
  assert.equal(par(0.3).dosAlertas.size, 0);
});

test('alertasDoCanal junta a memória do canal e o modelo positivo, igual para o modo simples e o avançado', () => {
  const a = alertasDoCanal('tchubi', { getItem: () => null, setItem() {} });
  assert.deepEqual(a.lembrados, []);
  assert.equal(typeof a.aoAprender, 'function');
  assert.equal(a.positivo.modelo, MODELO);
  assert.equal(a.positivo.minimo, POSITIVO.minimo);
  for (const f of ['simples.js', 'app.js']) {
    const src = readFileSync(new URL(`../site/${f}`, import.meta.url), 'utf8');
    assert.match(src, /alertas: alertasDoCanal\(/, `${f} passa os alertas para varrerNoite`);
  }
});
