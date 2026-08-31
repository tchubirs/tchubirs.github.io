// Quem morreu — a conta, sem imagens verdadeiras.
//
// "Nao faco ideia de quem eu matei, por isso e que ia ver o ecra de todos."
// Perguntar-lhe quem morreu era devolver-lhe o trabalho todo. Isto e a parte
// que olha pelos seis ao mesmo tempo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  medir, diferenca, notaDeMorte, quemMorreu, limiar, pareceMorto, pontoDeViragem,
} from '../site/morte.js';

/** Um frame liso, com cor e brilho a escolha. */
const frame = (r, g, b, n = 400) => {
  const p = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { p[i * 4] = r; p[i * 4 + 1] = g; p[i * 4 + 2] = b; p[i * 4 + 3] = 255; }
  return p;
};
// O jogo: colorido e com luz. O ecra de morte: cinzento e escuro.
const JOGO = frame(150, 90, 40);
const MORTE = frame(45, 45, 48);
const OUTRO_JOGO = frame(120, 130, 60);

test('mede brilho e saturacao de um frame', () => {
  const claro = medir(frame(255, 255, 255));
  assert.ok(claro.brilho > 0.95 && claro.saturacao < 0.01, 'branco: claro e sem cor');
  const escuro = medir(frame(10, 10, 10));
  assert.ok(escuro.brilho < 0.1 && escuro.saturacao < 0.01);
  assert.ok(medir(JOGO).saturacao > 0.5, 'o jogo tem cor');
  assert.ok(medir(MORTE).saturacao < 0.1, 'o ecra de morte nao tem');
});

test('a diferenca e zero entre frames iguais e alta entre opostos', () => {
  assert.equal(diferenca(JOGO, JOGO), 0);
  assert.ok(diferenca(frame(0, 0, 0), frame(255, 255, 255)) > 0.99);
});

test('frames de tamanhos diferentes nao inventam uma diferenca', () => {
  assert.equal(diferenca(frame(10, 10, 10, 100), frame(10, 10, 10, 200)), 0);
});

test('morrer da nota alta; continuar a jogar da nota baixa', () => {
  const morreu = notaDeMorte(JOGO, MORTE);
  const vivo = notaDeMorte(JOGO, OUTRO_JOGO);
  assert.ok(morreu.nota > vivo.nota * 2, `morte ${morreu.nota.toFixed(3)} vs vivo ${vivo.nota.toFixed(3)}`);
  assert.ok(morreu.dessaturou > 0.4, 'perdeu a cor');
  assert.ok(morreu.escureceu > 0.1, 'e escureceu');
});

test('sem frames nao ha nota', () => {
  assert.equal(notaDeMorte(null, MORTE), null);
  assert.equal(notaDeMorte(JOGO, null), null);
});

// O caso real: seis canais, um morreu.
test('aponta o que morreu de entre seis', () => {
  const notas = {
    tchubi: notaDeMorte(JOGO, OUTRO_JOGO),
    a: notaDeMorte(JOGO, OUTRO_JOGO),
    b: notaDeMorte(JOGO, JOGO),
    vitima: notaDeMorte(JOGO, MORTE),
    c: notaDeMorte(OUTRO_JOGO, JOGO),
    d: notaDeMorte(JOGO, OUTRO_JOGO),
  };
  const { sugeridos, ordenados } = quemMorreu(notas);
  assert.deepEqual(sugeridos, ['vitima']);
  assert.equal(ordenados[0].canal, 'vitima', 'e fica no topo da lista');
});

test('numa kill dupla aponta os dois', () => {
  const notas = {
    a: notaDeMorte(JOGO, OUTRO_JOGO),
    b: notaDeMorte(JOGO, JOGO),
    v1: notaDeMorte(JOGO, MORTE),
    v2: notaDeMorte(JOGO, MORTE),
    c: notaDeMorte(JOGO, OUTRO_JOGO),
  };
  assert.deepEqual(quemMorreu(notas).sugeridos.sort(), ['v1', 'v2']);
});

// Uma explosao muda o ecra todo sem ninguem morrer. Se isso bastasse para
// apontar alguem, a sugestao valia menos do que nao sugerir nada.
test('quando ninguem se destaca, nao aponta ninguem', () => {
  const notas = {
    a: notaDeMorte(JOGO, OUTRO_JOGO),
    b: notaDeMorte(JOGO, OUTRO_JOGO),
    c: notaDeMorte(JOGO, OUTRO_JOGO),
    d: notaDeMorte(OUTRO_JOGO, JOGO),
  };
  assert.deepEqual(quemMorreu(notas).sugeridos, []);
});

test('nunca aponta a equipa inteira', () => {
  const notas = Object.fromEntries('abcdef'.split('').map((c) => [c, notaDeMorte(JOGO, MORTE)]));
  assert.ok(quemMorreu(notas).sugeridos.length <= 2, 'em Rust morre um, as vezes dois');
});

test('com um canal so nao ha com quem comparar, e diz-se isso', () => {
  const r = quemMorreu({ a: notaDeMorte(JOGO, MORTE) });
  assert.deepEqual(r.sugeridos, []);
  assert.equal(r.ordenados.length, 1);
});

test('canais sem frame nao entram na conta', () => {
  const r = quemMorreu({ a: notaDeMorte(JOGO, MORTE), b: null, c: notaDeMorte(JOGO, OUTRO_JOGO) });
  assert.deepEqual(r.ordenados.map((x) => x.canal), ['a', 'c']);
});

// ── o instante certo ────────────────────────────────────────────────────────

test('a fronteira fica a meio entre o que se via antes e depois', () => {
  const l = limiar(medir(JOGO), medir(MORTE));
  assert.ok(l.utilizavel);
  assert.ok(l.saturacao < medir(JOGO).saturacao && l.saturacao > medir(MORTE).saturacao);
});

// Uma noite de chuva ja e cinzenta para toda a gente. Sem diferenca nao ha
// fronteira, e fingir uma dava um instante ao calhas com ar de medicao.
test('sem diferenca entre antes e depois nao ha fronteira', () => {
  const l = limiar(medir(JOGO), medir(JOGO));
  assert.equal(l.utilizavel, false);
  assert.equal(pareceMorto(medir(MORTE), l), false);
});

test('encontra o primeiro instante do lado da morte', () => {
  const l = limiar(medir(JOGO), medir(MORTE));
  const amostras = [
    { ms: 1000, medida: medir(JOGO) },
    { ms: 2000, medida: medir(JOGO) },
    { ms: 3000, medida: medir(MORTE) },
    { ms: 4000, medida: medir(MORTE) },
  ];
  assert.equal(pontoDeViragem(amostras, l), 3000);
});

test('amostras fora de ordem nao mudam a resposta', () => {
  const l = limiar(medir(JOGO), medir(MORTE));
  const amostras = [
    { ms: 4000, medida: medir(MORTE) },
    { ms: 1000, medida: medir(JOGO) },
    { ms: 3000, medida: medir(MORTE) },
  ];
  assert.equal(pontoDeViragem(amostras, l), 3000);
});

test('se nunca vira, nao se inventa um instante', () => {
  const l = limiar(medir(JOGO), medir(MORTE));
  assert.equal(pontoDeViragem([{ ms: 1000, medida: medir(JOGO) }], l), null);
});
