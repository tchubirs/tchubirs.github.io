'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { caixasDaFila, agrupar, votar, seguro } = require('../src/jogo/painel-morte');

/** Uma fila de pixels de mentira, com caixas vermelhas onde eu mandar. */
function fila(largura, altura, caixas, { alturaDaCaixa = 1 } = {}) {
  const b = Buffer.alloc(largura * altura * 3, 40); // fundo escuro
  const alto = Math.round(altura * alturaDaCaixa);
  const y0 = Math.floor((altura - alto) / 2);
  for (const [a, z] of caixas) {
    for (let y = y0; y < y0 + alto; y++) {
      for (let x = a; x < z; x++) {
        const i = (y * largura + x) * 3;
        b[i] = 180; b[i + 1] = 58; b[i + 2] = 40;   // o vermelho do painel
      }
    }
  }
  return b;
}

test('acha as duas caixas do painel, pela ordem em que estao no ecra', () => {
  const b = fila(1280, 39, [[534, 632], [663, 762]]);
  assert.deepEqual(caixasDaFila(b, 1280, 39), [[534, 632], [663, 762]]);
});

test('a caixa continua inteira quando o texto claro parte a coluna ao meio', () => {
  // O nome é branco: as colunas das letras não são vermelhas.
  const b = fila(400, 30, [[100, 140], [146, 200]]);
  const c = caixasDaFila(b, 400, 30);
  assert.equal(c.length, 1, `dois pedaços colados são UMA caixa, vieram ${c.length}`);
  assert.deepEqual(c[0], [100, 200]);
});

// Este é o teste do defeito que custou a tarde inteira.
//
// A caixa ocupa 23% da FAIXA e o limite estava em 25% da faixa: só passavam as
// colunas mais saturadas, e saíam caixas de 32 px onde a verdadeira tem 105.
// O recorte ia para o tesseract com o nome cortado ao meio, e eu andei a
// culpar o OCR. Medir contra a FILA, que é o que a função recebe, arruma isso.
test('a caixa e achada inteira, e nao so o pedaco mais saturado', () => {
  const b = fila(1280, 39, [[534, 639]]);
  const [c] = caixasDaFila(b, 1280, 39);
  assert.ok(c[1] - c[0] >= 100, `a caixa tem 105 px e veio com ${c[1] - c[0]}`);
});

test('nada vermelho, nenhuma caixa — e nao rebenta', () => {
  assert.deepEqual(caixasDaFila(Buffer.alloc(300 * 20 * 3, 30), 300, 20), []);
  assert.deepEqual(caixasDaFila(null, 100, 10), []);
  assert.deepEqual(caixasDaFila(Buffer.alloc(30), 0, 0), []);
});

test('riscos finos nao sao caixas', () => {
  const b = fila(400, 30, [[50, 60], [300, 308]]);
  assert.deepEqual(caixasDaFila(b, 400, 30), []);
});

// "44 mortes" numa hora em que ele morreu dez vezes: o ecrã de morte fica no
// ar dezenas de segundos e cada segundo virava uma morte nova.
test('o mesmo ecra de morte durante meio minuto e UMA morte', () => {
  const leituras = [0, 1, 2, 3, 4, 5].map((s) => ({ quandoS: s, nome: 'Dehxter' }));
  assert.equal(agrupar(leituras).length, 1);
});

test('duas mortes separadas por minutos sao duas', () => {
  const leituras = [
    { quandoS: 10, nome: 'Levian' }, { quandoS: 11, nome: 'Levian' },
    { quandoS: 200, nome: 'Ranger' },
  ];
  const g = agrupar(leituras);
  assert.equal(g.length, 2);
  assert.equal(g[0].length, 2);
  assert.equal(g[1][0].nome, 'Ranger');
});

test('leituras fora de ordem sao arrumadas antes de agrupar', () => {
  const g = agrupar([{ quandoS: 300 }, { quandoS: 1 }, { quandoS: 2 }]);
  assert.equal(g.length, 2);
  assert.equal(g[0][0].quandoS, 1);
});

// O painel anima a entrar: os primeiros quadros dão lixo. Não se conserta o
// OCR desses quadros — pede-se várias leituras e fica-se com a que se repete.
test('o nome certo ganha ao lixo da animacao de entrada', () => {
  const g = [
    { nome: 'ete' }, { nome: 'toe' }, { nome: 'Dehxter' },
    { nome: 'Dehxter' }, { nome: 'Dehxter' }, { nome: 'Dehxter' },
  ];
  const v = votar(g);
  assert.equal(v.nome, 'Dehxter');
  assert.equal(v.votos, 4);
  assert.ok(seguro(v));
});

test('duas letras nunca sao um nome, por muito que se repitam', () => {
  const v = votar([{ nome: 'ie' }, { nome: 'ie' }, { nome: 'ie' }]);
  assert.equal(v.nome, null, 'nao pode eleger "ie" so por ser o mais frequente');
  assert.equal(seguro(v), false);
});

test('um voto so e palpite, e diz-se que e', () => {
  const v = votar([{ nome: 'Peeters' }, { nome: 'eae' }, { nome: null }, { nome: 'x' }]);
  assert.equal(v.nome, 'Peeters');
  assert.equal(v.votos, 1);
  assert.equal(seguro(v), false, 'uma leitura unica nao pode passar por certeza');
});

test('grupo sem leitura nenhuma nao inventa nome', () => {
  const v = votar([{ nome: null }, { nome: null }]);
  assert.equal(v.nome, null);
  assert.equal(v.confianca, 0);
  assert.equal(seguro(v), false);
});
