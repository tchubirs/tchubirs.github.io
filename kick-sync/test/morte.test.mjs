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

// Tres canais, dois morreram. A "mediana" dos dois de baixo era o de CIMA
// deles (o indice len/2 de uma lista par), ou seja a outra vitima: e ninguem
// passava a 1,6x dela.
test('com tres canais e dois mortos, aponta os dois', () => {
  const nota = (n) => ({ nota: n });
  assert.deepEqual(quemMorreu({ a: nota(0.5), b: nota(0.45), c: nota(0.05) }).sugeridos.sort(), ['a', 'b']);
});

// O protagonista entra na conta como termo de comparacao, mas nunca e
// sugerido. Ele a abrir o saco do morto escurece o ecra como uma morte, e
// ficava com um dos dois lugares: "parece que morreu: tchubi", e a segunda
// vitima de verdade de fora.
test('quem matou nunca ocupa o lugar de uma vitima', () => {
  const notas = {
    tchubi: notaDeMorte(JOGO, MORTE),
    v1: notaDeMorte(JOGO, MORTE),
    v2: notaDeMorte(JOGO, MORTE),
    a: notaDeMorte(JOGO, OUTRO_JOGO),
    b: notaDeMorte(JOGO, JOGO),
    c: notaDeMorte(OUTRO_JOGO, JOGO),
  };
  const r = quemMorreu(notas, { excluir: ['tchubi'] });
  assert.deepEqual(r.sugeridos.sort(), ['v1', 'v2']);
  assert.ok(r.ordenados.some((o) => o.canal === 'tchubi'), 'continua na lista, para os cartoes');
});

test('com dois canais, o protagonista ainda serve de comparacao', () => {
  const r = quemMorreu({ tchubi: notaDeMorte(JOGO, OUTRO_JOGO), v: notaDeMorte(JOGO, MORTE) },
    { excluir: ['tchubi'] });
  assert.deepEqual(r.sugeridos, ['v']);
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

// ── o inventário não é uma morte (QA-REAL.md, 12/10) ─────────────────────────

const L = 160;
const A = 90;
/** Um quadro de 160x90 pintado com retângulos [x, y, l, a, r, g, b], por cima de um fundo. */
function pintado(fundo, retangulos = [], ruido = 0) {
  const p = new Uint8ClampedArray(L * A * 4);
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      const i = (y * L + x) * 4;
      const c = typeof fundo === 'function' ? fundo(x, y) : fundo;
      for (let k = 0; k < 3; k++) p[i + k] = c[k] + (ruido ? (rnd() - 0.5) * ruido : 0);
      p[i + 3] = 255;
    }
  }
  for (const [x0, y0, l, a, r, g, b] of retangulos) {
    for (let y = y0; y < y0 + a; y++) for (let x = x0; x < x0 + l; x++) {
      const i = (y * L + x) * 4;
      p[i] = r; p[i + 1] = g; p[i + 2] = b;
    }
  }
  return p;
}
// O jogo: chão, céu e coisas, com ruído (nada é liso num quadro de jogo).
const jogo = () => pintado((x, y) => (y < 40 ? [110, 130, 150] : [90, 100, 50]), [[60, 30, 20, 40, 60, 40, 30]], 40);
// O inventário do Rust: fundo oliva liso, a grelha de casas dos itens, o boneco à esquerda.
const inventario = () => {
  const casas = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) casas.push([60 + c * 9, 55 + r * 8, 7, 6, 70, 68, 60]);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) casas.push([105 + c * 8, 45 + r * 7, 6, 5, 75, 72, 62]);
  return pintado([38, 38, 32], [...casas, [20, 45, 14, 40, 120, 60, 50], [50, 8, 70, 6, 60, 60, 55]]);
};
// O ecrã de morte: escuro e puxado ao vermelho, o "you died" e os botões de renascer ao meio.
const morte = () => pintado((x, y) => [40 + Math.round(20 * (1 - Math.abs(y - 45) / 45)), 14, 16],
  [[50, 35, 60, 8, 190, 40, 40], [60, 60, 40, 7, 90, 30, 30], [60, 70, 40, 7, 90, 30, 30]], 6);

test('o inventário pintado e o ecrã de morte pintado distinguem-se', async () => {
  const { pareceInventario } = await import('../site/morte.js');
  assert.equal(pareceInventario(inventario()).sim, true);
  assert.equal(pareceInventario(morte()).sim, false);
  assert.equal(pareceInventario(jogo()).sim, false);
  // Os quadros planos dos testes de cima (o cinzento de morte é azulado, não oliva) também não.
  assert.equal(pareceInventario(MORTE, 20).sim, false);
});

test('abrir o inventário não faz de ninguém vítima; morrer continua a fazer', () => {
  const notas = {
    saqueia: notaDeMorte(jogo(), inventario()),
    morreu: notaDeMorte(jogo(), morte()),
    vivo: notaDeMorte(jogo(), jogo()),
  };
  assert.equal(notas.saqueia.inventario, true);
  assert.ok(notas.morreu.nota > notas.saqueia.nota * 5, `morreu ${notas.morreu.nota}, saqueia ${notas.saqueia.nota}`);
  assert.deepEqual(quemMorreu(notas).sugeridos, ['morreu']);
});

test('nos quadros verdadeiros do teste real: o inventário do nikots sim, o jogo não', async () => {
  const fs = await import('node:fs');
  const { pareceInventario } = await import('../site/morte.js');
  const ler = (nome) => {
    const rgb = fs.readFileSync(new URL(`../probes/fixtures/${nome}-160x90.rgb`, import.meta.url));
    const p = new Uint8ClampedArray(L * A * 4);
    for (let i = 0; i < L * A; i++) { p[i * 4] = rgb[i * 3]; p[i * 4 + 1] = rgb[i * 3 + 1]; p[i * 4 + 2] = rgb[i * 3 + 2]; p[i * 4 + 3] = 255; }
    return p;
  };
  const inv = pareceInventario(ler('inventario-nikots'));
  assert.ok(inv.sim && inv.fracao > 0.4, `fração ${inv.fracao}`);
  for (const nome of ['jogo-nikots', 'jogo-polys0800']) assert.equal(pareceInventario(ler(nome)).fracao, 0, nome);
  const n = notaDeMorte(ler('jogo-nikots'), ler('inventario-nikots'));
  assert.equal(n.inventario, true);
});
