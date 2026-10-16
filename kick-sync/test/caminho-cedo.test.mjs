import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const codigo = readFileSync(new URL('../site/caminho-cedo.js', import.meta.url), 'utf8');

// Armazenamento falso: falhas controladas por opção (leitura ou escrita).
function storage(dados = {}, { falhaLeitura = false, falhaEscrita = false } = {}) {
  const d = { ...dados };
  return {
    d,
    getItem(k) { if (falhaLeitura) throw new Error('leitura'); return k in d ? d[k] : null; },
    setItem(k, v) { if (falhaEscrita) throw new Error('QuotaExceededError'); d[k] = String(v); },
  };
}

// Corre o script real num contexto limpo; devolve o modo final e o armazenamento.
function correr({ dados, opcoes, url = 'https://povix.test/', ls }) {
  const armazem = ls ?? storage(dados, opcoes);
  const u = new URL(url);
  const documentElement = { dataset: {} };
  const ctx = {
    localStorage: armazem,
    document: { documentElement },
    location: { hash: u.hash, search: u.search },
    URLSearchParams,
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return { modo: documentElement.dataset.modo, dicaVista: documentElement.dataset.simplesVisto, ls: armazem };
}

test('primeira visita entra no simples, guarda a escolha e segunda execução mantém simples', () => {
  const ls = storage();
  const primeira = correr({ ls });
  assert.equal(primeira.modo, 'simples');
  assert.equal(ls.d['povix.modo'], 'simples');
  // O app grava replay.caminho depois da primeira execução.
  ls.d['replay.caminho'] = 'evento';
  const segunda = correr({ ls });
  assert.equal(segunda.modo, 'simples');
});

test('legado com sessão ou porta guardada começa avançado e guarda essa escolha', () => {
  const sessao = storage({ replay: '{"x":1}' });
  assert.equal(correr({ ls: sessao }).modo, 'avancado');
  assert.equal(sessao.d['povix.modo'], 'avancado');

  const porta = storage({ 'replay.caminho': 'vod' });
  assert.equal(correr({ ls: porta }).modo, 'avancado');
  assert.equal(porta.d['povix.modo'], 'avancado');
});

test('modos válidos guardados são respeitados e não são regravados', () => {
  const avancadoSemLegado = storage({ 'povix.modo': 'avancado' });
  assert.equal(correr({ ls: avancadoSemLegado }).modo, 'avancado');
  assert.equal(avancadoSemLegado.d['povix.modo'], 'avancado');

  const simplesComLegado = storage({ 'povix.modo': 'simples', replay: 'x', 'replay.caminho': 'evento' });
  assert.equal(correr({ ls: simplesComLegado }).modo, 'simples');
  assert.equal(simplesComLegado.d['povix.modo'], 'simples');
});

test('valor inválido em povix.modo é tratado como ausente', () => {
  const ls = storage({ 'povix.modo': 'outro' });
  assert.equal(correr({ ls }).modo, 'simples');
  assert.equal(ls.d['povix.modo'], 'simples');
});

test('escrita que falha não muda o modo calculado', () => {
  const simples = storage({}, { falhaEscrita: true });
  assert.equal(correr({ ls: simples }).modo, 'simples');
  assert.equal('povix.modo' in simples.d, false);

  const legado = storage({ replay: 'x' }, { falhaEscrita: true });
  assert.equal(correr({ ls: legado }).modo, 'avancado');
  assert.equal('povix.modo' in legado.d, false);
});

test('leitura que falha fica simples', () => {
  const ls = storage({ replay: 'x' }, { falhaLeitura: true });
  assert.equal(correr({ ls }).modo, 'simples');
  assert.equal('povix.modo' in ls.d, false);
});

test('a dica da primeira visita é decidida antes do primeiro desenho', () => {
  assert.equal(correr({ dados: {} }).dicaVista, undefined);
  assert.equal(correr({ dados: { 'povix.simplesVisto': '1' } }).dicaVista, '1');
  assert.equal(correr({ dados: {}, opcoes: { falhaLeitura: true } }).dicaVista, undefined);
});

test('link compartilhado s= abre avançado sem trocar a preferência simples guardada', () => {
  const guardado = storage({ 'povix.modo': 'simples' });
  assert.equal(correr({ ls: guardado, url: 'https://povix.test/#s=abc' }).modo, 'avancado');
  assert.equal(guardado.d['povix.modo'], 'simples');

  const ausente = storage();
  assert.equal(correr({ ls: ausente, url: 'https://povix.test/?s=abc' }).modo, 'avancado');
  assert.equal('povix.modo' in ausente.d, false);
});
