// A montagem, sozinha: sem rede, sem browser, sem video.
//
// O fluxo e o do dono. Numa kill mostra-se a POV dele inteira e logo a seguir
// a POV de quem morreu, curtinha — dois ou tres segundos, so o delete. E que
// os ficheiros saiam numerados, para caírem na ordem certa dentro do editor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PADRAO, novoMomento, ordenar, acrescentar, remover, clipesDoMomento, planoDaMontagem,
} from '../site/momentos.js';

const T = Date.parse('2026-08-30T22:00:00.000Z');
const CANAIS = ['tchubi', 'vitima1', 'vitima2'];

test('um momento gera um clipe longo do protagonista e curtos dos outros', () => {
  const m = novoMomento(T, 'tchubi');
  const c = clipesDoMomento(m, CANAIS, 0);

  assert.equal(c.length, 3);
  assert.equal(c[0].canal, 'tchubi');
  assert.equal(c[0].papel, 'protagonista');
  assert.equal((c[0].ateMs - c[0].deMs) / 1000, PADRAO.protagonistaAntesS + PADRAO.protagonistaDepoisS);

  // Os outros sao curtos, e e essa a diferenca toda.
  for (const v of c.slice(1)) {
    assert.equal(v.papel, 'vitima');
    assert.equal((v.ateMs - v.deMs) / 1000, PADRAO.vitimaAntesS + PADRAO.vitimaDepoisS);
    assert.ok(v.ateMs - v.deMs < c[0].ateMs - c[0].deMs, 'a vitima nunca pode ser mais longa');
  }
});

test('o protagonista comeca antes e acaba depois do instante marcado', () => {
  const [p] = clipesDoMomento(novoMomento(T, 'tchubi'), CANAIS, 0);
  assert.equal(p.deMs, T - PADRAO.protagonistaAntesS * 1000);
  assert.equal(p.ateMs, T + PADRAO.protagonistaDepoisS * 1000);
});

// O nome carrega a ordem: no editor os ficheiros caem certos sozinhos.
test('os nomes ficam numerados pela ordem da montagem', () => {
  const plano = planoDaMontagem(
    [novoMomento(T + 60_000, 'tchubi'), novoMomento(T, 'tchubi')],
    CANAIS,
  );
  assert.deepEqual(plano.map((c) => c.prefixo), ['01a', '01b', '01c', '02a', '02b', '02c']);
  // E o 01 e mesmo o mais antigo, mesmo tendo sido marcado depois.
  assert.equal(plano[0].deMs, T - PADRAO.protagonistaAntesS * 1000);
});

test('o protagonista pode ser outro, e ai o antigo vira vitima', () => {
  const c = clipesDoMomento(novoMomento(T, 'vitima1'), CANAIS, 0);
  assert.equal(c[0].canal, 'vitima1');
  assert.equal(c[0].papel, 'protagonista');
  assert.equal(c.find((x) => x.canal === 'tchubi').papel, 'vitima');
});

// Carregar depressa na tecla nao pode dar duas vezes o mesmo trabalho.
test('duas marcas quase no mesmo instante contam como uma', () => {
  let ms = [];
  ms = acrescentar(ms, novoMomento(T, 'tchubi'));
  ms = acrescentar(ms, novoMomento(T + 900, 'tchubi'));
  assert.equal(ms.length, 1);
  ms = acrescentar(ms, novoMomento(T + 5000, 'tchubi'));
  assert.equal(ms.length, 2);
});

test('a lista fica sempre por ordem de relogio', () => {
  const ms = ordenar([novoMomento(T + 10_000, 'a'), novoMomento(T, 'a'), novoMomento(T + 5000, 'a')]);
  assert.deepEqual(ms.map((m) => m.ms - T), [0, 5000, 10_000]);
});

test('remover tira so aquele momento', () => {
  const ms = [novoMomento(T, 'a'), novoMomento(T + 5000, 'a')];
  assert.deepEqual(remover(ms, T).map((m) => m.ms), [T + 5000]);
});

// Um clipe vazio de quem ja tinha desligado e trabalho a mais para quem monta,
// nao uma cortesia.
test('quem nao estava a filmar nao entra na montagem', () => {
  const c = clipesDoMomento(novoMomento(T, 'tchubi'), CANAIS, 0, {
    filmava: (slug) => slug !== 'vitima2',
  });
  assert.deepEqual(c.map((x) => x.canal), ['tchubi', 'vitima1']);
});

test('sem protagonista ainda saem os curtos, e nenhum leva a letra a', () => {
  const c = clipesDoMomento(novoMomento(T, null), CANAIS, 0);
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.papel === 'vitima'));
  assert.deepEqual(c.map((x) => x.prefixo), ['01b', '01c', '01d']);
});

test('os tamanhos sao por momento, e nao globais', () => {
  const m = novoMomento(T, 'tchubi', { protagonistaAntesS: 12, vitimaDepoisS: 4 });
  const c = clipesDoMomento(m, CANAIS, 0);
  assert.equal((c[0].ateMs - c[0].deMs) / 1000, 12 + PADRAO.protagonistaDepoisS);
  assert.equal((c[1].ateMs - c[1].deMs) / 1000, PADRAO.vitimaAntesS + 4);
});

test('uma montagem sem momentos e uma lista vazia, nao um erro', () => {
  assert.deepEqual(planoDaMontagem([], CANAIS), []);
});
