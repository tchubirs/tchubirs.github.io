import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ordenarCandidatos, resumo } from '../site/cena.js';

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
    ordenarCandidatos, resumo,
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
  assert.deepEqual(c.pedidos[0].candidatos, ['sem-time', 'outro', 'colega']);
  assert.equal(c.pedidos[0].sinal, sinal);
  assert.equal(c.pedidos[0].memoria, c.memoria);
  assert.deepEqual(r.estava, []);
  assert.deepEqual(r.talvez.map((p) => p.canal), ['sem-time', 'outro', 'colega']);
  assert.ok(r.talvez.every((p) => p.desvioS === 0.3));
  assert.deepEqual(progresso.map((p) => [p.feito, p.total]), [[1, 3], [2, 3], [3, 3]]);
});

test('prioridade não contorna atraso do evento nem busca sem elenco', async () => {
  for (const op of [{ cedo: true }, { elenco: false }]) {
    const c = preparar(op);
    assert.ok((await c.buscar({ referencia: 'ref', ms: 1000 })).erro);
    assert.equal(c.pedidos.length, 0);
  }
});
