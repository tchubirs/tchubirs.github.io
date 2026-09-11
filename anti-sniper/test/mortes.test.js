'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { criar } = require('../servico/servidor');

const CANAL = 'tchubi';
const DIA = 24 * 3600 * 1000;

function servico() {
  const banco = path.join(os.tmpdir(), `mortes-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  const s = criar({ caminhoBanco: banco, chavePem: 'x' });
  return { s, fechar: () => { try { s.db.close(); } catch { /* já fechado */ } fs.rmSync(banco, { force: true }); } };
}

test('uma morte gravada volta a sair, com a arma e a contagem de votos', () => {
  const { s, fechar } = servico();
  try {
    const t = Date.UTC(2026, 8, 11, 3, 14, 56);
    s.receberMorte(CANAL, { quandoMs: t, nome: 'Dehxter', arma: 'Thompson', votos: 5, de: 6 });
    const [m] = s.mortes(CANAL);
    assert.equal(m.nome, 'Dehxter');
    assert.equal(m.arma, 'Thompson');
    assert.equal(m.votos, 5);
    assert.equal(m.quando, t);
  } finally { fechar(); }
});

// Uma morte de que o OCR não leu o nome continua a ser uma morte. Se ela não
// fosse gravada, as noites em que o painel se lê pior contariam MENOS mortes
// — o oposto do que o número devia dizer.
test('morte sem nome tambem conta', () => {
  const { s, fechar } = servico();
  try {
    s.receberMorte(CANAL, { quandoMs: 1000, nome: null, arma: 'Revolver', votos: 0, de: 1 });
    const [m] = s.mortes(CANAL);
    assert.equal(m.nome, null);
    assert.equal(m.arma, 'Revolver');
    assert.equal(s.mortes(CANAL).length, 1);
  } finally { fechar(); }
});

test('gravar a mesma morte duas vezes nao a duplica, e a segunda leitura corrige a primeira', () => {
  const { s, fechar } = servico();
  try {
    s.receberMorte(CANAL, { quandoMs: 5000, nome: null, votos: 0, de: 1 });
    s.receberMorte(CANAL, { quandoMs: 5000, nome: 'Ranger', arma: 'PistolaM92', votos: 3, de: 4 });
    const todas = s.mortes(CANAL);
    assert.equal(todas.length, 1);
    assert.equal(todas[0].nome, 'Ranger');
  } finally { fechar(); }
});

test('as mortes saem da mais recente para a mais antiga', () => {
  const { s, fechar } = servico();
  try {
    s.receberMorte(CANAL, { quandoMs: 1000, nome: 'A', votos: 2, de: 2 });
    s.receberMorte(CANAL, { quandoMs: 9000, nome: 'B', votos: 2, de: 2 });
    s.receberMorte(CANAL, { quandoMs: 5000, nome: 'C', votos: 2, de: 2 });
    assert.deepEqual(s.mortes(CANAL).map((m) => m.nome), ['B', 'C', 'A']);
  } finally { fechar(); }
});

// O que pede explicação não é morrer — num servidor de Rust matam-no o dia
// todo. É o mesmo nome a voltar noite após noite.
test('cinco mortes numa noite nao e o mesmo que cinco em cinco noites', () => {
  const { s, fechar } = servico();
  try {
    const base = Date.UTC(2026, 8, 1, 22, 0, 0);
    for (let i = 0; i < 5; i++) {
      s.receberMorte(CANAL, { quandoMs: base + i * 60000, nome: 'Briga', votos: 3, de: 4 });
    }
    for (let d = 0; d < 5; d++) {
      s.receberMorte(CANAL, { quandoMs: base + d * DIA + 12345, nome: 'Volta', votos: 3, de: 4 });
    }
    const r = s.reincidentes(CANAL);
    const briga = r.find((x) => x.nome === 'Briga');
    const volta = r.find((x) => x.nome === 'Volta');
    assert.equal(briga.vezes, 5);
    assert.equal(briga.noites, 1, 'cinco mortes seguidas sao UMA noite');
    assert.equal(volta.noites, 5);
    assert.equal(r[0].nome, 'Volta', 'quem volta em mais noites vem primeiro');
  } finally { fechar(); }
});

// O painel anima a entrar e as primeiras leituras saem em lixo. Um palpite de
// uma leitura só não pode virar "matou-o duas vezes" numa lista de suspeitas.
test('nomes com um voto so nao entram na lista de quem repete', () => {
  const { s, fechar } = servico();
  try {
    s.receberMorte(CANAL, { quandoMs: 1000, nome: 'toe', votos: 1, de: 6 });
    s.receberMorte(CANAL, { quandoMs: 2 * DIA, nome: 'toe', votos: 1, de: 5 });
    assert.deepEqual(s.reincidentes(CANAL), []);
  } finally { fechar(); }
});

test('quem so matou uma vez nao aparece como quem repete', () => {
  const { s, fechar } = servico();
  try {
    s.receberMorte(CANAL, { quandoMs: 1000, nome: 'Passageiro', votos: 4, de: 5 });
    assert.deepEqual(s.reincidentes(CANAL), []);
  } finally { fechar(); }
});

test('as armas de cada um ficam juntas, sem repetir', () => {
  const { s, fechar } = servico();
  try {
    s.receberMorte(CANAL, { quandoMs: 1000, nome: 'Levian', arma: 'RifleM39', votos: 3, de: 3 });
    s.receberMorte(CANAL, { quandoMs: DIA, nome: 'Levian', arma: 'RifleM39', votos: 3, de: 3 });
    s.receberMorte(CANAL, { quandoMs: 2 * DIA, nome: 'Levian', arma: 'Thompson', votos: 3, de: 3 });
    const [r] = s.reincidentes(CANAL);
    assert.equal(r.vezes, 3);
    assert.deepEqual([...r.armas].sort(), ['RifleM39', 'Thompson']);
  } finally { fechar(); }
});

test('canal sem mortes nenhumas responde vazio, e nao rebenta', () => {
  const { s, fechar } = servico();
  try {
    assert.deepEqual(s.mortes('ninguem'), []);
    assert.deepEqual(s.reincidentes('ninguem'), []);
    assert.deepEqual(s.receberMorte(CANAL, { quandoMs: 0 }), { gravado: false });
  } finally { fechar(); }
});
