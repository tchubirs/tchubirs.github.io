'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Indice } = require('../src/indice');
const { comparar } = require('../src/nomes');

test('acha casamento exato', () => {
  const i = new Indice([{ nome: 'FINIK' }, { nome: 'outro' }]);
  const r = i.procurar('finik_ttv');
  assert.equal(r.entrada.nome, 'FINIK');
  assert.equal(r.confianca, 1);
});

test('acha por leet', () => {
  const i = new Indice([{ nome: 'diper' }]);
  assert.equal(i.procurar('D1per').confianca, 0.9);
});

test('acha tag de clã', () => {
  const i = new Indice([{ nome: 'merfy' }]);
  assert.equal(i.procurar('MF | Dr | Merfy').confianca, 1);
});

test('não inventa casamento para quem não está', () => {
  const i = new Indice([{ nome: 'FINIK' }, { nome: 'diper' }]);
  assert.equal(i.procurar('Опасный Поцык'), null);
  assert.equal(i.procurar('Caraxes'), null);
});

test('mantém a guarda de nome curto', () => {
  const i = new Indice([{ nome: 'banana' }]);
  assert.equal(i.procurar('ana'), null, '"ana" em "banana" é coincidência');
});

test('nome que normaliza vazio não entra no índice', () => {
  const i = new Indice([{ nome: '' }, { nome: '🔥🔥' }, { nome: 'FINIK' }]);
  assert.equal(i.n, 1);
});

test('dá o MESMO resultado que a comparação direta', () => {
  // O índice é otimização, não regra nova. Se divergir da comparação
  // direta, os testes de cruzamento deixam de valer para o que roda.
  const audiencia = ['FINIK', 'diper', 'merfy_ttv', 'banana', 'Опасный Поцык', 'slimeface']
    .map((nome) => ({ nome }));
  const i = new Indice(audiencia);
  const jogadores = ['FINIK', 'D1per', 'MF | Dr | Merfy', 'ana', 'Опасный Поцык',
                     'SLIMEface v.2', 'Caraxes', '322'];
  for (const j of jogadores) {
    const viaIndice = i.procurar(j);
    let melhorDireto = null;
    for (const e of audiencia) {
      const c = comparar(j, e.nome);
      if (c.confianca >= 0.7 && (!melhorDireto || c.confianca > melhorDireto.confianca)) {
        melhorDireto = { nome: e.nome, confianca: c.confianca };
      }
    }
    assert.equal(viaIndice?.confianca ?? null, melhorDireto?.confianca ?? null,
      `divergiu em "${j}"`);
    assert.equal(viaIndice?.entrada.nome ?? null, melhorDireto?.nome ?? null,
      `casou com outro em "${j}"`);
  }
});

test('aguenta a escala real de um servidor cheio', () => {
  // Medido: força bruta em 1.500 × 5.000 levou 147 segundos. O agente
  // roda a cada 90 — ou seja, não terminaria antes da rodada seguinte.
  const faz = (n, mod) => Array.from({ length: n }, (_, k) => ({
    nome: ['FINIK', 'D1per', 'Опасный', `xX_M${k}_Xx`, `clan | nome${k}`, `user${k}`][k % 6] + (k % mod),
  }));
  const t0 = Date.now();
  const i = new Indice(faz(5000, 977));
  i.cruzar(faz(1500, 977));
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `levou ${ms} ms — precisa caber numa rodada de 90 s`);
});

// ── A máscara de letras ───────────────────────────────────────────────────
// Existe porque provar que alguém NÃO casa custava caro: medido, 750 nomes
// que não casam levavam 1.790ms contra 6ms dos 750 que casam. A rejeição
// tem que ser SEGURA — descartar um casamento de verdade seria pior que
// lento.
const { mascara, bits } = require('../src/indice');

test('a máscara nunca descarta um casamento de verdade', () => {
  const pares = [
    ['finik', 'finik'], ['diper', 'd1per'], ['arin', 'arinzinho'],
    ['killer', 'xxkillerxx'], ['sniper', 'snipper'], ['medusa', 'medusaa'],
    ['pedro', 'pedr0'], ['bruno', 'brunno'], ['lucas', 'lucaz'],
  ];
  for (const [a, b] of pares) {
    // A regra: 2 edições mudam no máximo 4 bits. Se a máscara descartasse
    // algum destes, o índice passaria a perder gente de verdade.
    assert.ok(bits(mascara(a) ^ mascara(b)) <= 4, `${a} × ${b} foi descartado por engano`);
  }
});

test('a máscara descarta o que é obviamente diferente', () => {
  assert.ok(bits(mascara('finik') ^ mascara('caraxes')) > 4);
  assert.ok(bits(mascara('zlucas') ^ mascara('medusa')) > 4);
});

test('o índice com máscara acha o MESMO que sem ela', () => {
  // A prova que importa: a otimização não pode mudar nenhum resultado.
  const nomes = ['FINIK', 'diper', 'arin', 'MEDUSA', 'xX_Killer_Xx', 'zLucas',
    'Опасный Поцык', 'merfy', 'bobsburgers', 'Caraxes', 'sniper'];
  const i = new Indice(nomes.map((nome) => ({ nome })));
  const consultas = ['finik_ttv', 'D1per', 'arinzinho', 'medusaa', 'killer', 'zlucaz',
    'ana', 'MF | Dr | Merfy', 'bob', 'snipper', 'joaozinho', '322'];
  for (const q of consultas) {
    const r = i.procurar(q);
    let esperado = null;
    for (const nome of nomes) {
      const c = comparar(q, nome);
      if (c.confianca >= 0.7 && (!esperado || c.confianca > esperado.confianca)) esperado = { nome, ...c };
    }
    assert.equal(r ? r.confianca : 0, esperado ? esperado.confianca : 0, `divergiu em "${q}"`);
  }
});
