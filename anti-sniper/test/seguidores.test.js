'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entradas, seguidores } = require('../src/seguidores');

const M = 60000;
/** Fotografias de meia em meia hora, escritas como minutos desde o início. */
const foto = (min, ...nomes) => ({ ms: min * M, nomes });

test('quem fica a noite toda conta como UMA entrada, e não como cinquenta', () => {
  const e = entradas([
    foto(0, 'Lauta'), foto(1, 'Lauta'), foto(2, 'Lauta'), foto(3, 'Lauta'),
  ]);
  assert.deepEqual(e.get('Lauta'), [0]);
});

test('sair e voltar são duas entradas', () => {
  const e = entradas([
    foto(0, 'Lauta'), foto(1), foto(2, 'Lauta'),
  ]);
  assert.deepEqual(e.get('Lauta'), [0, 2 * M]);
});

test('as fotografias fora de ordem não estragam a conta', () => {
  const e = entradas([foto(2, 'Lauta'), foto(0, 'Lauta'), foto(1)]);
  assert.deepEqual(e.get('Lauta'), [0, 2 * M]);
});

// O caso dele. Cinco noites, e em todas o mesmo nome entra três minutos
// depois — enquanto outra pessoa entra à toa, sem relação nenhuma.
test('quem entra sempre logo a seguir sobe ao topo', () => {
  // Uma linha do tempo a sério: cada fotografia lista TODA a gente que está
  // lá naquele minuto. A primeira versão deste teste falhou por causa disto —
  // eu tinha escrito fotografias com uma pessoa de cada vez, e uma fotografia
  // sem o Lauta quer dizer que ele saiu. Ele "saía" e "entrava" cinquenta
  // vezes por noite, e a conta ficava certa a medir a coisa errada.
  const presente = (quem, min) => quem.some(([de, ate]) => min >= de && min < ate);
  const gente = {
    Lauta: [], sombra: [], passante: [],
  };
  for (let noite = 0; noite < 5; noite++) {
    const base = noite * 1440;
    gente.Lauta.push([base, base + 61]);
    gente.sombra.push([base + 3, base + 61]);
  }
  // Alguém que entra e sai a noite toda, sem relação com ele — e a horas que
  // não são as dele.
  for (let i = 0; i < 30; i++) gente.passante.push([i * 97 + 200, i * 97 + 210]);

  const fotos = [];
  for (let min = 0; min <= 5 * 1440; min += 1) {
    fotos.push({
      ms: min * M,
      nomes: Object.keys(gente).filter((n) => presente(gente[n], min)),
    });
  }

  const r = seguidores(fotos, 'Lauta');
  assert.equal(r[0].nome, 'sombra', `o primeiro foi ${r[0]?.nome}`);
  assert.equal(r[0].vezes, 5, `contou ${r[0].vezes} e eram cinco noites`);
  assert.equal(r[0].fatia, 1, 'todas as entradas dele foram a seguir às dele');
  assert.equal(r[0].atrasoMedianoS, 180, `atraso de ${r[0].atrasoMedianoS}s e eram 180`);
});

test('a equipa não aparece na lista', () => {
  const fotos = [
    foto(0), foto(1, 'Lauta'), foto(2, 'Lauta', 'cTapp', 'sombra'),
  ];
  const r = seguidores(fotos, 'Lauta', { ignorar: ['cTapp'] });
  assert.deepEqual(r.map((x) => x.nome), ['sombra']);
});

test('o nome da equipa é comparado sem ligar a maiúsculas', () => {
  const fotos = [foto(0), foto(1, 'Lauta'), foto(2, 'Lauta', 'CTAPP')];
  assert.deepEqual(seguidores(fotos, 'Lauta', { ignorar: ['ctapp'] }), []);
});

test('quem já lá estava não te seguiu a lado nenhum', () => {
  const fotos = [
    foto(0, 'sombra'), foto(1, 'sombra', 'Lauta'), foto(2, 'sombra', 'Lauta'),
  ];
  assert.deepEqual(seguidores(fotos, 'Lauta'), []);
});

test('fora da janela não conta', () => {
  const fotos = [
    foto(0), foto(1, 'Lauta'), foto(30, 'Lauta', 'tarde'),
  ];
  assert.deepEqual(seguidores(fotos, 'Lauta', { janelaMin: 10 }), []);
  assert.equal(seguidores(fotos, 'Lauta', { janelaMin: 40 })[0].nome, 'tarde');
});

test('sem o alvo nas fotografias não há seguidores nenhuns', () => {
  assert.deepEqual(seguidores([foto(0, 'a'), foto(1, 'a', 'b')], 'Lauta'), []);
});
