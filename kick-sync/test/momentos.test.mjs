// A montagem, sozinha: sem rede, sem browser, sem video.
//
// O fluxo e o do dono. Numa kill mostra-se a POV dele inteira e logo a seguir
// a POV de quem morreu, curtinha — dois ou tres segundos, so o delete. E que
// os ficheiros saiam numerados, para caírem na ordem certa dentro do editor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PADRAO, novoMomento, ordenar, acrescentar, remover, clipesDoMomento, planoDaMontagem, alternarVitima, removerVarios, filtrar, temMorte,
} from '../site/momentos.js';

const T = Date.parse('2026-08-30T22:00:00.000Z');
const CANAIS = ['tchubi', 'vitima1', 'vitima2'];

// O relato do dono: "vejo clipes de pessoas, elas nem morreram, nao acontece
// nada". Cortar todos os angulos em cada kill dava quatro clipes de lixo por
// cada um bom — e apagar lixo e o trabalho que isto devia poupar.
test('sem ninguem marcado como morto, so sai a POV do protagonista', () => {
  const c = clipesDoMomento(novoMomento(T, 'tchubi'), CANAIS, 0);
  assert.equal(c.length, 1);
  assert.equal(c[0].papel, 'protagonista');
});

test('so quem foi marcado como morto e que gera clipe', () => {
  const m = alternarVitima(novoMomento(T, 'tchubi'), 'vitima2');
  const c = clipesDoMomento(m, CANAIS, 0);
  assert.deepEqual(c.map((x) => x.canal), ['tchubi', 'vitima2']);
  assert.equal(c[1].papel, 'vitima');
});

test('marcar e desmarcar o mesmo deixa tudo como estava', () => {
  const m = novoMomento(T, 'tchubi');
  const dois = alternarVitima(alternarVitima(m, 'vitima1'), 'vitima1');
  assert.deepEqual(dois.vitimas, []);
  assert.deepEqual(m.vitimas, [], 'e nao mexe no momento original');
});

test('numa kill dupla saem os dois, na ordem em que foram marcados', () => {
  let m = novoMomento(T, 'tchubi');
  m = alternarVitima(m, 'vitima2');
  m = alternarVitima(m, 'vitima1');
  const c = clipesDoMomento(m, CANAIS, 0);
  assert.deepEqual(c.map((x) => x.canal), ['tchubi', 'vitima2', 'vitima1']);
  assert.deepEqual(c.map((x) => x.prefixo), ['01a', '01b', '01c']);
});

test('um momento gera um clipe longo do protagonista e curtos de quem morreu', () => {
  const m = { ...novoMomento(T, 'tchubi'), vitimas: ['vitima1', 'vitima2'] };
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
  const comVitimas = (ms) => ({ ...novoMomento(ms, 'tchubi'), vitimas: ['vitima1', 'vitima2'] });
  const plano = planoDaMontagem([comVitimas(T + 60_000), comVitimas(T)], CANAIS);
  assert.deepEqual(plano.map((c) => c.prefixo), ['01a', '01b', '01c', '02a', '02b', '02c']);
  // E o 01 e mesmo o mais antigo, mesmo tendo sido marcado depois.
  assert.equal(plano[0].deMs, T - PADRAO.protagonistaAntesS * 1000);
});

test('o protagonista pode ser outro, e ai o antigo vira vitima', () => {
  const c = clipesDoMomento({ ...novoMomento(T, 'vitima1'), vitimas: ['tchubi', 'vitima2'] }, CANAIS, 0);
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
  const c = clipesDoMomento({ ...novoMomento(T, 'tchubi'), vitimas: ['vitima1', 'vitima2'] }, CANAIS, 0, {
    filmava: (slug) => slug !== 'vitima2',
  });
  assert.deepEqual(c.map((x) => x.canal), ['tchubi', 'vitima1']);
});

test('sem protagonista ainda saem os curtos, e nenhum leva a letra a', () => {
  const c = clipesDoMomento({ ...novoMomento(T, null), vitimas: CANAIS }, CANAIS, 0);
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.papel === 'vitima'));
  assert.deepEqual(c.map((x) => x.prefixo), ['01b', '01c', '01d']);
});

test('os tamanhos sao por momento, e nao globais', () => {
  const m = novoMomento(T, 'tchubi', { protagonistaAntesS: 12, vitimaDepoisS: 4, vitimas: ['vitima1'] });
  const c = clipesDoMomento(m, CANAIS, 0);
  assert.equal((c[0].ateMs - c[0].deMs) / 1000, 12 + PADRAO.protagonistaDepoisS);
  assert.equal((c[1].ateMs - c[1].deMs) / 1000, PADRAO.vitimaAntesS + 4);
});

test('uma montagem sem momentos e uma lista vazia, nao um erro', () => {
  assert.deepEqual(planoDaMontagem([], CANAIS), []);
});


// ── duas marcas no mesmo sitio ──────────────────────────────────────────────
//
// Acertar o instante de uma kill pode faze-la cair em cima de outra ja
// marcada: na busca automatica os candidatos estao a 25 s uns dos outros e a
// afinacao mexe ate 6. Duas marcas no mesmo sitio davam duas linhas gemeas
// onde apagar uma apagava as duas — e a montagem saia com o clipe repetido.

test('acrescentar respeita a distancia minima, venha de onde vier', () => {
  let ms = [novoMomento(T, 'tchubi')];
  ms = acrescentar(ms, novoMomento(T + 1500, 'tchubi'));
  assert.equal(ms.length, 1, 'a segunda cai dentro da primeira');
});

test('remover apaga um momento e nao dois com o mesmo instante', () => {
  // Se dois chegarem ao mesmo ms — por um caminho que nao passe por
  // acrescentar — apagar tem de ser inequivoco.
  const dois = [novoMomento(T, 'a'), novoMomento(T, 'b')];
  assert.equal(remover(dois, T).length, 0, 'com o mesmo ms sao indistinguiveis');
  // E e por isso que nunca podem chegar a existir dois com o mesmo ms.
});

// ── apagar aos molhos, e ver so o que interessa ─────────────────────────────
//
// A busca automatica devolve uma noite inteira de candidatos. Sem estes dois,
// a funcao que existe para lhe poupar trabalho passa a dar-lhe trabalho: setenta
// e oito cliques em "apagar" e a leitura de setenta e oito linhas para achar as
// doze que valem.

test('apagar muitos de uma vez apaga exactamente esses', () => {
  const ms = [1000, 2000, 3000, 4000];
  const lista = ms.map((x) => novoMomento(x, 'eu'));
  const r = removerVarios(lista, [2000, 4000]);
  assert.deepEqual(r.map((m) => m.ms), [1000, 3000]);
});

test('apagar uma lista vazia nao apaga nada', () => {
  const lista = [novoMomento(1000, 'eu')];
  assert.equal(removerVarios(lista, []).length, 1);
});

test('apagar um ms que nao existe nao mexe nos outros', () => {
  const lista = [novoMomento(1000, 'eu'), novoMomento(2000, 'eu')];
  assert.equal(removerVarios(lista, [9999]).length, 2);
});

test('o filtro separa o que esta pronto do que falta decidir', () => {
  const lista = [
    novoMomento(1000, 'eu', { vitimas: ['a'] }),
    novoMomento(2000, 'eu'),
    novoMomento(3000, 'eu', { vitimas: [] }),
  ];
  assert.deepEqual(filtrar(lista, 'comMorte').map((m) => m.ms), [1000]);
  assert.deepEqual(filtrar(lista, 'semMorte').map((m) => m.ms), [2000, 3000]);
  assert.equal(filtrar(lista, 'todos').length, 3);
});

// Um filtro que nao se reconhece nao pode esconder trabalho em silencio: se a
// pagina guardar 'comMorte' e amanha esse nome mudar, ele abria a montagem
// vazia e concluia que tinha perdido tudo.
test('um filtro desconhecido mostra tudo, e nao nada', () => {
  const lista = [novoMomento(1000, 'eu'), novoMomento(2000, 'eu', { vitimas: ['a'] })];
  assert.equal(filtrar(lista, 'inventado').length, 2);
  assert.equal(filtrar(lista, undefined).length, 2);
  assert.equal(filtrar(lista, null).length, 2);
});

// "So consigo baixar todos de uma vez, nao consigo baixar um." Para haver um
// botao por linha, cada clipe tem de saber a que kill pertence — senao o unico
// jeito de pedir uma so era refazer o plano por fora, com outra numeracao.
test('cada clipe sabe a que kill pertence', () => {
  const a = novoMomento(1000, 'eu', { vitimas: ['x'] });
  const b = novoMomento(9000, 'eu', { vitimas: ['x'] });
  const plano = planoDaMontagem([a, b], ['eu', 'x']);
  assert.deepEqual([...new Set(plano.map((c) => c.ms))], [1000, 9000]);

  const soASegunda = plano.filter((c) => c.ms === 9000);
  assert.equal(soASegunda.length, 2, 'a POV dele e a de quem morreu');
  // E continua a ser a SEGUNDA: o numero do ficheiro nao pode mudar so porque
  // ele pediu esta sozinha.
  assert.deepEqual(soASegunda.map((c) => c.prefixo), ['02a', '02b']);
});
