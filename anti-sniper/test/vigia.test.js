'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const n = require('../src/nomes');
const { Vigia } = require('../src/vigia');

const T = Date.parse('2026-08-27T21:00:00Z');

function bancada(op = {}) {
  let t = T;
  const alertas = [];
  const v = new Vigia({ aoAlertar: (a) => alertas.push(a), agora: () => t, ...op });
  return { v, alertas, avancar: (ms) => { t += ms; }, agora: () => t, setT: (x) => { t = x; } };
}

test('normalizar tira enfeite e mantém identidade', () => {
  assert.equal(n.normalizar('xX_Ma7ador_Xx'), 'matador');
  assert.equal(n.normalizar('[BR] Tchubi'), 'tchubi');
  assert.equal(n.normalizar('GamerBR🔥'), 'gamerbr');
  assert.equal(n.normalizar('João_Silva'), 'joaosilva');
  assert.equal(n.normalizar('Ph0enix'), 'phoenix');
});

test('nome curto não casa por conter — "ana" em "banana" não é sinal', () => {
  assert.equal(n.comparar('ana', 'banana').confianca, 0);
  assert.equal(n.comparar('joe', 'joel').confianca, 0);
});

test('nomes diferentes não casam', () => {
  for (const [a, b] of [['Pedro', 'Carlos'], ['DarkWolf', 'LightFox'], ['abcde', 'vwxyz']]) {
    assert.equal(n.comparar(a, b).confianca, 0, `${a} vs ${b}`);
  }
});

test('leet casa, mas com confiança menor que idêntico', () => {
  const exato = n.comparar('matador', 'matador').confianca;
  const leet = n.comparar('sn1per', 'sniper').confianca;
  assert.equal(exato, 1);
  assert.ok(leet > 0.8 && leet < 1, `leet veio ${leet}`);
});

test('nome vazio depois de normalizar não casa com nada', () => {
  assert.equal(n.comparar('🔥🔥🔥', 'fulano').confianca, 0);
  assert.equal(n.comparar(null, 'fulano').confianca, 0);
});

test('quem JÁ ESTAVA no servidor não gera alerta', () => {
  const { v, alertas } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }, { nome: 'Zeca', steamid: '2' }]);
  assert.deepEqual(alertas, [], 'linha de base não pode alertar');
});

test('quem entra depois gera alerta na hora', () => {
  const { v, alertas, avancar } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }]);
  avancar(40000);
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }, { nome: 'Novato', steamid: '9' }]);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].tipo, 'entrou-logo-depois');
  assert.equal(alertas[0].segundosDepoisDoAoVivo, 40);
});

test('quem entra muito depois da janela não é suspeito', () => {
  const { v, alertas, avancar } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }]);
  avancar(10 * 60 * 1000);
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }, { nome: 'Tardio', steamid: '9' }]);
  assert.deepEqual(alertas, []);
});

test('nome batendo + entrou depois = urgência alta', () => {
  const { v, alertas, avancar } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }]);
  avancar(40000);
  v.servidor([{ nome: 'Pedrinho', steamid: '1' }, { nome: 'xX_Ma7ador_Xx', steamid: '9' }]);
  avancar(20000);
  v.chat([{ nome: 'matador', id: 'u9' }]);
  const alto = alertas.find((a) => a.urgencia === 'alta');
  assert.ok(alto, 'tinha que sair alerta de urgência alta');
  assert.equal(alto.tipo, 'nome-bate-e-entrou-depois');
  assert.equal(alto.chat, 'matador');
});

test('só o nome batendo, sem ter entrado depois, é urgência média', () => {
  const { v, alertas } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'xX_Ma7ador_Xx', steamid: '9' }]);
  v.chat([{ nome: 'matador', id: 'u9' }]);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].urgencia, 'media');
  assert.equal(alertas[0].tipo, 'nome-bate');
});

test('não repete o mesmo alerta a cada varredura', () => {
  const { v, alertas, avancar } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'xX_Ma7ador_Xx', steamid: '9' }]);
  for (let i = 0; i < 20; i++) { avancar(5000); v.chat([{ nome: 'matador', id: 'u9' }]); }
  assert.equal(alertas.length, 1, `saiu ${alertas.length} alertas para o mesmo suspeito`);
});

test('depois do silêncio, volta a alertar', () => {
  const { v, alertas, avancar } = bancada({ silencioMs: 60000 });
  v.ficouAoVivo();
  v.servidor([{ nome: 'xX_Ma7ador_Xx', steamid: '9' }]);
  v.chat([{ nome: 'matador', id: 'u9' }]);
  avancar(61000);
  v.chat([{ nome: 'matador', id: 'u9' }]);
  assert.equal(alertas.length, 2);
});

test('fora do ar não alerta nada', () => {
  const { v, alertas, avancar } = bancada();
  v.servidor([{ nome: 'xX_Ma7ador_Xx', steamid: '9' }]);
  v.chat([{ nome: 'matador', id: 'u9' }]);
  avancar(40000);
  v.servidor([{ nome: 'xX_Ma7ador_Xx', steamid: '9' }, { nome: 'Outro', steamid: '8' }]);
  assert.deepEqual(alertas, [], 'sem live, sem alerta');
});

test('quem sai do servidor some do estado', () => {
  const { v } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'A', steamid: '1' }, { nome: 'B', steamid: '2' }]);
  assert.equal(v.estado().noServidor, 2);
  v.servidor([{ nome: 'A', steamid: '1' }]);
  assert.equal(v.estado().noServidor, 1);
});

test('estado do overlay lista os suspeitos ordenados por confiança', () => {
  const { v } = bancada();
  v.ficouAoVivo();
  v.servidor([{ nome: 'matador', steamid: '9' }, { nome: 'sn1per', steamid: '8' },
              { nome: 'Ninguem', steamid: '7' }]);
  v.chat([{ nome: 'matador', id: 'a' }, { nome: 'sniper', id: 'b' }]);
  const s = v.estado().suspeitos;
  assert.equal(s.length, 2, 'só os dois que casam');
  assert.ok(s[0].confianca >= s[1].confianca, 'maior confiança primeiro');
});

test('aoAlertar é obrigatório', () => {
  assert.throws(() => new Vigia({}), /aoAlertar/);
});
