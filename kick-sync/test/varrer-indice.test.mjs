// O que `varrerNoite` entrega ao índice (indice.js): todas as regiões e explosões sem o corte por hora, as medidas de cada região
// (impulsos, voz), os acertos e os modelos de acerto vistos. Som feito de propósito, sem rede.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './sons-sinteticos.mjs';
import { varrerNoite } from '../site/procurar-momentos.js';
import { montarIndice } from '../site/indice.js';

const T = Date.parse('2026-10-08T20:42:01Z');

function noite(segundos, rajadasEm, explosoesEm) {
  const base = S.fundo(segundos, 0.004, 5);
  for (const t of rajadasEm) S.por(base, S.rajada(40, 0.11, 0.9), t);
  for (const [t, k] of explosoesEm) S.por(base, S.explosao(0.7, 1.2 + (k % 3) * 0.4, 20 + k), t);
  return base;
}

const chamar = (som, extra = {}) => varrerNoite({
  linha: { slug: 'tchubi' },
  deMs: T,
  ateMs: T + (som.length / S.TAXA) * 1000,
  bocadoS: 300,
  buscar: null,
  lerSom: async (l, quandoMs, duracaoS) => {
    const de = Math.round(((quandoMs - T) / 1000) * S.TAXA);
    return som.subarray(de, de + Math.round(duracaoS * S.TAXA));
  },
  ...extra,
});

test('com o índice pedido, as regiões, explosões e gritos vêm todos, sem o corte por hora, com as medidas de cada um', async () => {
  const rajadas = [40, 140, 240, 340, 440, 540];
  const som = noite(600, rajadas, [[90, 1], [190, 2], [290, 3], [490, 4]]);
  const r = await chamar(som, { filtros: { tiros: true, explosoes: true, gritos: true, acertos: true }, opcoes: { porHora: 1 } });
  assert.equal(r.candidatos.length, 1, 'o corte de uma por hora vale para a lista de sempre');
  assert.ok(r.candidatosTodos.length >= 6, `${r.candidatosTodos.length} regiões`);
  assert.ok(r.explosoesTodas.length > r.explosoes.length, 'as explosões sem corte');
  for (const c of r.candidatosTodos) {
    assert.ok(Number.isFinite(c.pico) && Number.isFinite(c.nImp) && Number.isFinite(c.nAltos), JSON.stringify(c));
    assert.ok(c.vozMed === null || (c.vozMed >= 0 && c.vozMed <= 1), `voz ${c.vozMed}`);
    assert.ok(c.combateDeMs < c.combateAteMs);
  }
  // uma rajada tem muitos impulsos; a região dela os conta
  const daRajada = r.candidatosTodos.find((c) => Math.abs(c.combateDeMs - (T + 40_000)) < 3000);
  assert.ok(daRajada && daRajada.nImp >= 10, JSON.stringify(daRajada));
  // sem clipe de acerto na live, nenhum modelo vale e nenhum acerto sai
  assert.deepEqual(r.acertos, []);
  assert.ok(Array.isArray(r.modelosAcerto));
  assert.ok(r.modelosAcerto.every((m) => m.vale === false));
  // e o índice sai dali inteiro
  const i = montarIndice({ slug: 'tchubi', inicioMs: T, som: r });
  assert.ok(i.eventos.filter((e) => e.tipo === 'tiro').length >= 6);
  assert.equal(i.acertosAtivos, false);
  assert.ok(i.lutas.length >= 6);
});

test('sem pedir acertos nem gritos, a varredura não mede nada disso', async () => {
  const som = noite(300, [40], []);
  const r = await chamar(som, { filtros: { tiros: true, explosoes: false, gritos: false } });
  assert.deepEqual(r.acertos, []);
  assert.deepEqual(r.modelosAcerto, []);
  assert.deepEqual(r.gritosTodos, []);
  assert.ok(r.candidatosTodos.every((c) => c.vozMed === null), 'sem a medida de voz, a parte de voz fica vazia');
});

test('a memória da sessão guarda as formas de onda e os acertos do bocado, e o que já foi ouvido não se mede de novo', async () => {
  const som = noite(300, [40], [[100, 1], [200, 2]]);
  const memoria = new Map();
  let pedidos = 0;
  const opcoes = {
    memoria, filtros: { tiros: true, explosoes: true, gritos: true, acertos: true }, alertas: { lembrados: [], positivo: null },
    lerSom: async (l, quandoMs, duracaoS) => {
      pedidos++;
      const de = Math.round(((quandoMs - T) / 1000) * S.TAXA);
      return som.subarray(de, de + Math.round(duracaoS * S.TAXA));
    },
  };
  const a = await chamar(som, opcoes);
  const guardado = memoria.get('tchubi')[0];
  assert.ok(guardado.ondas.length >= 1 && guardado.acertos);
  assert.ok(guardado.tamanho > guardado.ondas[0].onda.v.byteLength);
  const antes = pedidos;
  const b = await chamar(som, opcoes);
  assert.equal(pedidos, antes, 'o mesmo trecho vem da memória');
  assert.equal(b.candidatosTodos.length, a.candidatosTodos.length);
});
