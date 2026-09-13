'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taxaRealizada, queimaPorDia, julgar } = require('../src/julgar.js');

const DIA = 24 * 3600 * 1000;
/** `n` dias de views iguais, o último sendo hoje. */
const dias = (n, views) => Array.from({ length: n }, (_, i) => ({
  dia: new Date(Date.now() - (n - 1 - i) * DIA).toISOString(), views,
}));

const campanha = (extra = {}) => ({
  nome: 'X', estado: 'active', agenciaVerificada: true, privada: false,
  exigeCandidatura: false, cpmMin: 1, cpmMax: 1,
  orcamento: 1000, gasto: 100, restante: 900, progresso: 0.1,
  clippers: 10, viewsTotais: 0, porDia: [], listadaEm: null, ...extra,
});

// O CPM anunciado é tecto, não média. O Rex Stax anuncia $1 e teve 15,8M de
// views: a $1 seriam $15.842, mas pagou $4.553 — submissões reprovadas e o
// tecto por vídeo comem o resto. Prever com o CPM do anúncio dava uma campanha
// a morrer 3,4x mais depressa do que morre, e fazia recusar campanhas boas.
test('a taxa usada e a que a campanha pagou mesmo, nao a que anuncia', () => {
  const c = campanha({ gasto: 4553.75, viewsTotais: 15842270 });
  assert.ok(Math.abs(taxaRealizada(c) - 0.2874) < 0.001,
    `esperava ~$0,287 por mil, veio ${taxaRealizada(c)}`);
  assert.ok(taxaRealizada(c) < c.cpmMin, 'a taxa real tem de ficar abaixo do anunciado');
});

// O furo que a mutação encontrou: eu testava `taxaRealizada` sozinha, mas nada
// verificava que o JUÍZO a usa. Trocar a taxa real pelo CPM do anúncio não
// partia teste nenhum — e é a diferença entre "morre em 11 dias" e "em 39".
test('o juizo conta os dias com a taxa real, nao com o CPM do anuncio', () => {
  const c = campanha({
    cpmMin: 1, gasto: 4553.75, viewsTotais: 15842270, restante: 1046.25,
    porDia: dias(7, 93777),
  });
  const j = julgar(c);
  assert.ok(Math.abs(j.taxaPorMil - 0.2874) < 0.001,
    `o juizo tinha de usar a taxa real, usou ${j.taxaPorMil}`);
  // Com o CPM anunciado ($1) dariam ~11 dias; com a taxa real, ~39.
  assert.ok(j.diasRestantes > 30,
    `com a taxa real sobram ~39 dias, o juizo diz ${j.diasRestantes?.toFixed(1)}`);
});

test('sem taxa real medida, o juizo usa o CPM anunciado e diz que e esse', () => {
  const j = julgar(campanha({ cpmMin: 2, viewsTotais: 0, restante: 1000, porDia: dias(7, 50000) }));
  assert.equal(j.taxaPorMil, 2);
  assert.match(j.queimaDe, /anunciado/);
});

test('sem views suficientes nao se inventa taxa nenhuma', () => {
  assert.equal(taxaRealizada(campanha({ viewsTotais: 0 })), null);
  assert.equal(taxaRealizada(campanha({ viewsTotais: 900, gasto: 5 })), null);
  assert.equal(taxaRealizada(campanha({ viewsTotais: 1e6, gasto: 0 })), null);
});

// O último ponto é o dia de hoje, ainda a meio. Contá-lo baixa a média e faz
// uma campanha a morrer parecer que tem semanas pela frente.
test('o dia de hoje, que ainda vai a meio, nao entra na media', () => {
  const pontos = [...dias(3, 100000), { dia: new Date().toISOString(), views: 1 }];
  const q = queimaPorDia(campanha({ porDia: pontos }));
  assert.equal(q.dias, 3, 'devia ter usado 3 dias fechados, usou ' + q.dias);
  assert.equal(q.valor, 100, '100.000 views/dia a $1 por mil são $100/dia');
});

test('sem historico nenhum cai para a media desde que foi listada, e diz que caiu', () => {
  const q = queimaPorDia(campanha({ porDia: [], gasto: 200, viewsTotais: 0,
    listadaEm: new Date(Date.now() - 10 * DIA).toISOString() }));
  assert.ok(Math.abs(q.valor - 20) < 0.5, `$200 em 10 dias são $20/dia, veio ${q.valor}`);
  assert.match(q.de, /media/);
});

test('sem historico e sem data nao se inventa uma queima', () => {
  const q = queimaPorDia(campanha({ porDia: [], listadaEm: null, gasto: 0 }));
  assert.equal(q.valor, null);
  assert.equal(julgar(campanha({ porDia: [], listadaEm: null, gasto: 0 })).diasRestantes, null);
});

// A armadilha verdadeira: a Propaganda continuava a anunciar "CPM aumentado"
// numa campanha com o orçamento a zero.
test('orcamento gasto a cem por cento e MORTA, por muito que a anunciem', () => {
  const j = julgar(campanha({ gasto: 3465, restante: 0, progresso: 1 }));
  assert.equal(j.veredicto, 'MORTA');
  assert.ok(j.porque.some((p) => p.includes('100.0%')), j.porque.join(' / '));
});

test('campanha fechada e MORTA mesmo com dinheiro por gastar', () => {
  const j = julgar(campanha({ estado: 'paused', restante: 5000 }));
  assert.equal(j.veredicto, 'MORTA');
});

test('menos de uma semana de orcamento e CUIDADO, nao ENTRA', () => {
  const j = julgar(campanha({ restante: 300, porDia: dias(4, 100e6), viewsTotais: 0 }));
  assert.equal(j.veredicto, 'CUIDADO');
  assert.ok(j.diasRestantes < 7);
});

test('exigir candidatura ou ser privada baixa para CUIDADO', () => {
  assert.equal(julgar(campanha({ exigeCandidatura: true })).veredicto, 'CUIDADO');
  assert.equal(julgar(campanha({ privada: true })).veredicto, 'CUIDADO');
  assert.equal(julgar(campanha({ agenciaVerificada: false })).veredicto, 'CUIDADO');
});

// Um veredicto que não diz porquê não é um veredicto, é um palpite com ar de
// autoridade — e não dá para lhe discordar.
test('todo veredicto vem com o motivo escrito', () => {
  for (const c of [campanha(), campanha({ estado: 'ended' }), campanha({ privada: true })]) {
    assert.ok(julgar(c).porque.length > 0, 'veredicto sem motivo');
  }
});

test('o que sobra por clipper e a medida da concorrencia', () => {
  assert.equal(julgar(campanha({ restante: 20000, clippers: 47 })).porClipper, 20000 / 47);
  assert.equal(julgar(campanha({ clippers: null })).porClipper, null);
  assert.equal(julgar(campanha({ clippers: 0 })).porClipper, null);
});

test('campanha nenhuma nao rebenta o juizo', () => {
  assert.equal(julgar(null), null);
});
