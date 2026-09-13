'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { peneirar } = require('../src/peneirar.js');
const { pagina, dinheiro, esc } = require('../src/pagina.js');

const bom = {
  mint: 'M'.repeat(40), simbolo: 'OK', nome: 'Token OK',
  liquidezUsd: 50000, fdv: 200000, vol1h: 1000, vol24h: 5000,
  compras5m: 10, vendas5m: 8, idadeMin: 120,
  mintAuthority: null, freezeAuthority: null, concentracao: null,
};

test('token sem armadilhas nenhumas passa, mas diz que passar nao e prestar', () => {
  const j = peneirar(bom);
  assert.equal(j.veredicto, 'PASSA');
  assert.match(j.aviso, /não quer dizer que preste/);
});

// As duas autoridades são absolutas: não é questão de grau nem de preço.
test('freeze authority activa e sempre FOGE', () => {
  const j = peneirar({ ...bom, freezeAuthority: 'Alguem111' });
  assert.equal(j.veredicto, 'FOGE');
  assert.ok(j.porque.some((p) => /congelar/.test(p)), j.porque.join(' / '));
});

test('mint authority activa e sempre FOGE, por muito boa que a liquidez esteja', () => {
  const j = peneirar({ ...bom, liquidezUsd: 5e6, mintAuthority: 'Alguem111' });
  assert.equal(j.veredicto, 'FOGE');
  assert.ok(j.porque.some((p) => /imprimir/.test(p)));
});

// Liquidez em falta e liquidez zero NÃO são a mesma coisa. A primeira é "não
// sei", a segunda é "não há" — e o Kabosucoin real apareceu das duas formas em
// dez minutos. Tratar "não sei" como zero inventava um facto.
test('liquidez ausente e dita como ausente, nao como zero', () => {
  const j = peneirar({ ...bom, liquidezUsd: null });
  assert.equal(j.veredicto, 'FOGE');
  assert.ok(j.porque.some((p) => /não há dados de liquidez/.test(p)), j.porque.join(' / '));
  assert.ok(!j.porque.some((p) => /\$0 de liquidez/.test(p)));
});

// O HODLER verdadeiro: $58.905 de avaliação com $17,96 no fundo.
test('avaliacao enorme em cima de liquidez nenhuma e FOGE, com a razao dita', () => {
  const j = peneirar({ ...bom, liquidezUsd: 17.96, fdv: 58905 });
  assert.equal(j.veredicto, 'FOGE');
  assert.ok(j.porque.some((p) => /3280x/.test(p)), j.porque.join(' / '));
});

// O ATM/SOL: $26.901 de volume com $0 de liquidez. Não é um token a negociar,
// é a liquidez já retirada — e o volume foi a porta de saída.
test('volume grande com a liquidez a zero e a assinatura de quem ja saiu', () => {
  const j = peneirar({ ...bom, liquidezUsd: 0, vol24h: 26901 });
  assert.equal(j.veredicto, 'FOGE');
  assert.ok(j.porque.some((p) => /já foi retirada/.test(p)), j.porque.join(' / '));
});

test('muitas vendas contra poucas compras e CUIDADO', () => {
  const j = peneirar({ ...bom, compras5m: 2, vendas5m: 20 });
  assert.equal(j.veredicto, 'CUIDADO');
  assert.ok(j.porque.some((p) => /estão a sair/.test(p)));
});

// Quatro vendas e zero compras num token calmo não são uma debandada. Sem um
// mínimo de trocas, qualquer razão dispara e o aviso deixa de querer dizer nada.
//
// O caso tem de ser um que a RAZÃO já dispara (4 > 1x3) mas o VOLUME não
// justifica (4 trocas < 5). Com duas vendas a razão nem chega a disparar, e o
// teste passava sem testar a guarda — foi o que a mutação apanhou.
test('poucas trocas ao todo nao chegam para gritar debandada', () => {
  assert.equal(peneirar({ ...bom, compras5m: 0, vendas5m: 4 }).veredicto, 'PASSA');
  // e com trocas que cheguem, a mesma proporção já avisa
  assert.equal(peneirar({ ...bom, compras5m: 1, vendas5m: 8 }).veredicto, 'CUIDADO');
});

test('token novo demais e CUIDADO, nao PASSA', () => {
  const j = peneirar({ ...bom, idadeMin: 2 });
  assert.equal(j.veredicto, 'CUIDADO');
  assert.ok(j.porque.some((p) => /minutos de vida/.test(p)));
});

// Isto é o que impede a peneira de mentir por omissão.
test('a concentracao nao medida e sempre dita, mesmo num token que passa', () => {
  const j = peneirar(bom);
  assert.ok(j.notas.some((n) => /NÃO medida/.test(n)), j.notas.join(' / '));
});

test('concentracao alta, quando ha, e FOGE', () => {
  assert.equal(peneirar({ ...bom, concentracao: 0.82 }).veredicto, 'FOGE');
  assert.equal(peneirar({ ...bom, concentracao: 0.10 }).veredicto, 'PASSA');
});

test('token nenhum nao rebenta', () => {
  assert.equal(peneirar(null), null);
  assert.equal(peneirar({}), null);
});

// ── A página ──

test('a pagina poe os que se deve evitar primeiro', () => {
  const h = pagina([
    { f: { ...bom, simbolo: 'BOA' }, j: peneirar(bom) },
    { f: { ...bom, simbolo: 'MA' }, j: peneirar({ ...bom, freezeAuthority: 'X' }) },
  ]);
  assert.ok(h.indexOf('MA') < h.indexOf('BOA'), 'o perigoso tem de vir primeiro');
});

// Um nome de token é texto escolhido por quem lançou a moeda. Alguém vai
// chamar-lhe `<script>` mais cedo ou mais tarde.
test('o nome do token nao pode injectar HTML na pagina', () => {
  const h = pagina([{ f: { ...bom, nome: '<img src=x onerror=alert(1)>', simbolo: '<b>' },
                      j: peneirar(bom) }]);
  assert.ok(!h.includes('<img src=x'), 'HTML do nome entrou cru na página');
  assert.ok(h.includes('&lt;img'), 'devia estar escapado');
});

test('a pagina diz sempre que a concentracao nao e medida', () => {
  assert.match(pagina([]), /getTokenLargestAccounts/);
});

// Abaixo de $10 mostram-se cêntimos de propósito: a diferença entre $0,75 de
// liquidez e zero é a diferença entre "quase" e "nada", e arredondar apagava-a.
// Acima disso os cêntimos são ruído.
test('os numeros sao legiveis, e o que falta aparece como travessao', () => {
  assert.equal(dinheiro(2400000), '$2.4M');
  assert.equal(dinheiro(15848.99), '$15.8K');
  assert.equal(dinheiro(17.96), '$18');
  assert.equal(dinheiro(0.75), '$0.75');
  assert.equal(dinheiro(0), '$0.00');
  assert.equal(dinheiro(null), '—');
});
