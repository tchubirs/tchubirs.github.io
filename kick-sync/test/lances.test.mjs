// As opções da detecção para quem não é técnico (lances.js): a sensibilidade, que muda o que a escuta
// aceita, e juntar lances próximos. Sem rede nem browser: a escuta corre em som feito de propósito.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SENSIBILIDADES_DETECAO, opcoesDaSensibilidade, juntarProximos } from '../site/lances.js';
import { varrerNoite } from '../site/procurar-momentos.js';
import * as S from './sons-sinteticos.mjs';

const lance = (canal, tipo, deS, ateS, extra = {}) => ({
  canal, tipo, ms: deS * 1000 + 500, combateDeMs: deS * 1000, combateAteMs: ateS * 1000, ...extra,
});

test('três sensibilidades, e a normal é a medida de sempre (sem números por cima)', () => {
  assert.deepEqual(SENSIBILIDADES_DETECAO, ['menos', 'normal', 'mais']);
  assert.deepEqual(opcoesDaSensibilidade('normal'), {});
  assert.deepEqual(opcoesDaSensibilidade('qualquer'), {});
  const menos = opcoesDaSensibilidade('menos');
  const mais = opcoesDaSensibilidade('mais');
  assert.ok(menos.alturaMin > 8 && mais.alturaMin < 8);
  assert.ok(menos.minQuenteS > 0.6 && mais.minQuenteS < 0.6);
  assert.ok(menos.explosoes.alturaMin > mais.explosoes.alturaMin);
  assert.ok(menos.gritos.fator > 3 && mais.gritos.fator < 3);
});

test('juntar: lances da mesma pessoa a menos do intervalo viram um, com o clipe do primeiro ao último', () => {
  const achados = [
    lance('tchubi', 'tiros', 60, 64),
    lance('tchubi', 'explosao', 70, 72),
    lance('outro', 'tiros', 65, 66),
    lance('tchubi', 'chat', 200, 203, { palavras: ['kkk'] }),
    lance('tchubi', 'chat', 205, 206, { palavras: ['clip'] }),
  ];
  const juntos = juntarProximos(achados, 10_000);
  assert.equal(juntos.length, 3);
  const [a, b, c] = juntos;
  assert.deepEqual([a.canal, a.tipo, a.tipos, a.combateDeMs, a.combateAteMs, a.juntos], ['tchubi', 'tiros', ['tiros', 'explosao'], 60_000, 72_000, 2]);
  assert.equal(b.canal, 'outro', 'a outra pessoa nunca se junta');
  assert.deepEqual(c.palavras, ['kkk', 'clip']);
  // Com 5 s, os dos 60 e 70 s (6 s entre o fim de um e o começo do outro) ficam separados.
  assert.equal(juntarProximos(achados, 5000).length, 4);
  // Sem juntar: os mesmos, pela ordem do relógio.
  assert.deepEqual(juntarProximos(achados, 0).map((x) => x.combateDeMs), [60_000, 65_000, 70_000, 200_000, 205_000]);
  assert.deepEqual(juntarProximos(null, 10_000), []);
});

test('a sensibilidade muda o que a escuta acha: uma explosão mais baixa só entra com mais', async () => {
  const T = Date.parse('2026-08-30T22:00:00Z');
  // Dez minutos: a escuta guarda no máximo quinze lances por hora de cada tipo, e em cinco minutos
  // isso é um só.
  const som = S.fundo(600);
  S.por(som, S.conversa(600), 0);
  S.por(som, S.explosao(0.8), 60);
  // Uma explosão a um décimo da força: longe.
  S.por(som, S.explosao(0.08, 1.5, 29), 200);
  const ouvir = (sens) => varrerNoite({
    linha: { slug: 'tchubi' },
    deMs: T,
    ateMs: T + 600_000,
    filtros: { tiros: false, explosoes: true },
    opcoes: opcoesDaSensibilidade(sens),
    lerSom: async (l, quandoMs, duracaoS) => {
      const de = Math.round(((quandoMs - T) / 1000) * S.TAXA);
      return som.subarray(de, de + Math.round(duracaoS * S.TAXA));
    },
  });
  const contar = async (sens) => (await ouvir(sens)).explosoes.length;
  const [menos, normal, mais] = [await contar('menos'), await contar('normal'), await contar('mais')];
  assert.ok(menos <= normal && normal <= mais, `${menos} ${normal} ${mais}`);
  assert.equal(menos, 1, 'menos: só a forte');
  assert.equal(normal, 1, 'normal: só a forte');
  assert.equal(mais, 2, 'mais: também a de longe');
});
