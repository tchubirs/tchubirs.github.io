import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ordenarCandidatos, resumo } from '../site/cena.js';
import { slugDoNome } from '../site/kick.js';

const times = new Map([['ref', 'Time A'], ['colega', ' time a '], ['outro', 'B'], ['fora', 'C']]);
const canais = ['ref', 'colega', 'sem-time', 'outro', 'fora', 'outro'];
const opcoes = { referencia: 'ref', canais, timeDe: (c) => times.get(c), noAr: (c) => c !== 'fora' };

test('busca de adversário põe outros participantes antes dos colegas, sem excluir ou duplicar ninguém', () => {
  assert.deepEqual(ordenarCandidatos({ ...opcoes, priorizarAdversarios: true }), ['sem-time', 'outro', 'colega']);
  assert.deepEqual(ordenarCandidatos(opcoes), ['colega', 'sem-time', 'outro']);
});

test('sem time da referência não inventa vínculo nem prioridade entre participantes', () => {
  assert.deepEqual(ordenarCandidatos({ ...opcoes, timeDe: () => null, priorizarAdversarios: true }), ['colega', 'sem-time', 'outro']);
});

const source = readFileSync(new URL('../site/evento-ui.js', import.meta.url), 'utf8');
const start = source.indexOf('async function procurarPovsDoMomento(');
const end = source.indexOf('// ── os nomes na tela', start);
assert.ok(start > 0 && end > start);
function preparar({ elenco = true, cedo = false } = {}) {
  const pedidos = [];
  const memoria = new Map();
  const ctx = vm.createContext({
    ev: { elenco: elenco ? {} : null, atrasoMin: 15, resultados: canais.map((slug) => ({ slug, estado: 'ok' })), coberturas: {} },
    cedoDemais: () => cedo,
    indiceDeTimes: () => times,
    noArEm: (_, c) => c !== 'fora',
    ordenarCandidatos, resumo, slugDoNome,
    memoriaDaColecao: () => memoria,
    somDe() {},
    async *procurarAngulos(pedido) {
      pedidos.push(pedido);
      for (const canal of pedido.candidatos) yield { canal, estado: 'talvez', desvioS: 0.3, forca: 5.5 };
    },
  });
  const buscar = vm.runInContext(`${source.slice(start, end)}\nprocurarPovsDoMomento`, ctx);
  return { buscar, pedidos, memoria };
}

test('ponte real do modo simples usa a prioridade e preserva sinal, memória, offsets e ambiguidade', async () => {
  const c = preparar();
  const sinal = new AbortController().signal;
  const progresso = [];
  const r = await c.buscar({ referencia: 'ref', ms: 1000, sinal, aoProgresso: (p) => progresso.push(p) });
  assert.equal(c.pedidos.length, 1);
  assert.deepEqual(Array.from(c.pedidos[0].candidatos), ['sem-time', 'outro', 'colega']);
  assert.equal(c.pedidos[0].sinal, sinal);
  assert.equal(c.pedidos[0].memoria, c.memoria);
  assert.deepEqual(r.estava, []);
  assert.deepEqual(r.talvez.map((p) => p.canal), ['sem-time', 'outro', 'colega']);
  assert.ok(r.talvez.every((p) => p.desvioS === 0.3));
  assert.deepEqual(progresso.map((p) => [p.feito, p.total]), [[0, 3], [1, 3], [2, 3], [3, 3]]);
});

test('pistas do momento vêm primeiro apenas entre canais elegíveis, sem promover a evidência', async () => {
  const c = preparar();
  const r = await c.buscar({ referencia: 'ref', ms: 1000, preferidos: [' @Outro ', 'fora', 'ref', 'inexistente', 'outro'] });
  assert.deepEqual(Array.from(c.pedidos[0].candidatos), ['outro', 'sem-time', 'colega']);
  assert.deepEqual(r.estava, []);
  assert.deepEqual(r.talvez.map((p) => p.canal), ['outro', 'sem-time', 'colega']);
  assert.ok(r.talvez.every((p) => p.desvioS === 0.3));
});

test('contagem inicial chega antes de pedir áudio da referência e não contém resultado', async () => {
  const c = preparar();
  const progresso = [];
  await c.buscar({ referencia: 'ref', ms: 1000, aoProgresso(p) {
    if (!progresso.length) {
      assert.equal(c.pedidos.length, 0);
      assert.equal(p.feito, 0);
      assert.equal(p.total, 3);
      assert.equal(p.resultado, undefined);
    }
    progresso.push(p);
  } });
  assert.equal(progresso.length, 4);
});

test('prioridade não contorna atraso do evento nem busca sem elenco', async () => {
  for (const op of [{ cedo: true }, { elenco: false }]) {
    const c = preparar(op);
    const progresso = [];
    assert.ok((await c.buscar({ referencia: 'ref', ms: 1000, aoProgresso: (p) => progresso.push(p) })).erro);
    assert.equal(c.pedidos.length, 0);
    assert.equal(progresso.length, 0);
  }
});
