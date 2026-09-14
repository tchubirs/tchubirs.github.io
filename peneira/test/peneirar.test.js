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

// O mesmo nome vai agora TAMBÉM para dentro de um <script>, nos factos
// cozidos. `JSON.stringify` escapa aspas mas não escapa `<` — e um token
// chamado `</script>…` fugia da etiqueta e corria o que quisesse no telemóvel
// de quem abrisse a página.
test('o nome do token nao pode fugir do bloco de script', () => {
  const mau = '</script><img src=x onerror=alert(1)><script>';
  const h = pagina([{ f: { ...bom, nome: mau, simbolo: 'X' }, j: peneirar(bom) }]);
  assert.ok(!h.includes('</script><img'), 'o nome fechou a etiqueta e escapou');
  assert.ok(h.includes('\\u003c/script'), 'o `<` tinha de sair escapado em \\u003c');
  // e o JSON continua a ser JSON legível pelo browser
  const m = h.match(/var COZIDOS = (\{.*?\});/s);
  assert.ok(m, 'os factos cozidos desapareceram');
  assert.doesNotThrow(() => JSON.parse(m[1].replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>').replace(/\\u0026/g, '&')));
});

test('a pagina diz sempre o que mede e o que nao mede', () => {
  const h = pagina([]);
  assert.match(h, /getTokenLargestAccounts/, 'tem de dizer o que NAO mede');
  assert.match(h, /dentro da piscina/, 'e tem de dizer o que mede');
  assert.match(h, /numa só/, 'e porque e que uma coisa nao substitui a outra');
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

// ── A base do mercado ──

// Sem esta linha, um `PASSA` lê-se como "então compra". O estudo é o contexto
// que diz o que acontece ao token típico, e é isso que impede a peneira de
// mentir por omissão do outro lado.
test('a base do mercado sai no rodape quando ha estudo', () => {
  const { baseDoMercado } = require('../src/pagina.js');
  // Os números são escolhidos para NÃO colidirem entre si: 112/140 = 80% e
  // 70/140 = 50%. Com 126/140 a fracção dava 90% e a expressão `/90%/` casava
  // com a frase errada — o teste passava com a linha dos 90% apagada. Foi o
  // que a mutação apanhou.
  const frase = baseDoMercado({
    medidos: 140, abaixoDaEntrada: 112, perdeu90ouMais: 70, dobrou: 7,
    retornoMedio: 0.62,
  });
  assert.match(frase, /140 tokens/);
  assert.match(frase, /80% ficaram abaixo/);
  assert.match(frase, /50% perderam 90% ou mais/);
  assert.match(frase, /0\.62x/);
  assert.match(frase, /-38%/, 'uma média abaixo de 1 tem de aparecer como perda');
  assert.match(pagina([], { base: frase }), /base do mercado/);
});

test('media acima de 1 aparece como ganho, com sinal', () => {
  const { baseDoMercado } = require('../src/pagina.js');
  assert.match(baseDoMercado({ medidos: 10, abaixoDaEntrada: 2, perdeu90ouMais: 1,
    dobrou: 4, retornoMedio: 1.5 }), /\+50%/);
});

test('sem estudo a pagina sai na mesma, so sem a linha', () => {
  const { baseDoMercado } = require('../src/pagina.js');
  assert.equal(baseDoMercado(null), null);
  assert.equal(baseDoMercado({ medidos: 0 }), null);
  assert.equal(baseDoMercado({}), null);
  const h = pagina([], { base: null });
  assert.ok(!h.includes('base do mercado'));
  assert.ok(h.includes('Peneira'), 'a página tem de sair à mesma');
});

// O defeito que quase foi publicado: a média no papel do grupo de 13/09 deu
// 2,31x, e quatro dos cinco maiores ganhos (77x, 40x, 20x, 19x) estavam em
// piscinas com $0 de liquidez. Publicar os 2,31x era repetir exactamente a
// mentira que este estudo existe para desmontar.
test('a base usa a media REALIZAVEL, nunca a do papel', () => {
  const { baseDoMercado } = require('../src/pagina.js');
  const frase = baseDoMercado({
    medidos: 138, abaixoDaEntrada: 45, perdeu90ouMais: 4, dobrou: 8,
    retornoMedio: 2.3105,        // o papel
    mediaRealizavel: 0.7084,     // o que se consegue vender
  });
  assert.match(frase, /0\.71x/, `usou o numero errado: ${frase}`);
  assert.ok(!frase.includes('2.31x'), 'o numero do papel nao pode sair na pagina');
  assert.match(frase, /-29%/);
  assert.match(frase, /liquidez/, 'tem de dizer porque e que o numero e mais baixo');
});

test('sem media realizavel medida, usa a que ha e nao inventa a explicacao', () => {
  const { baseDoMercado } = require('../src/pagina.js');
  const frase = baseDoMercado({ medidos: 10, abaixoDaEntrada: 5, perdeu90ouMais: 2,
    dobrou: 1, retornoMedio: 1.2 });
  assert.match(frase, /1\.20x/);
  assert.ok(!frase.includes('já não têm liquidez'),
    'nao pode prometer um ajuste que nao foi feito');
});

// Uma peneira velha é pior que nenhuma: um token pode ter perdido a liquidez
// toda entretanto. O horário do GitHub falhou 90 minutos numa medição real, por
// isso a página tem de dizer a idade dela, não só a hora em UTC.
test('a pagina traz consigo a hora exacta, para poder dizer que idade tem', () => {
  const q = new Date('2026-09-14T02:18:00Z');
  const h = pagina([], { quando: q });
  assert.ok(h.includes('datetime="2026-09-14T02:18:00.000Z"'), 'falta a hora legivel por maquina');
  assert.ok(h.includes('id="quando"'), 'o guiao precisa de encontrar a hora');
  assert.ok(h.includes('id="idade"'), 'falta o sitio onde a idade aparece');
  assert.ok(/perdido a liquidez toda/.test(h), 'falta o aviso de leitura velha');
});

// ── Quanto da oferta está dentro da piscina ──
//
// Substitui, de graça, a concentração por carteira que os RPC públicos
// recusam. Não é a mesma coisa e o código diz que não é — mas mede o tamanho
// do martelo que existe do lado de fora da piscina.

test('quase nada da oferta dentro da piscina e FOGE', () => {
  const j = peneirar({ ...bom, fraccaoNaPiscina: 0.00002 });   // o SPEPE real
  assert.equal(j.veredicto, 'FOGE');
  assert.ok(j.porque.some((p) => /0\.002% da oferta/.test(p)), j.porque.join(' / '));
});

// O limite não é inventado: na amostra de 14/09 a mediana foi 11,4% e o p10
// 4,43%. 4% apanha o que está abaixo do décimo percentil, e não mais.
test('a cauda de baixo e CUIDADO, e o resto da amostra passa', () => {
  assert.equal(peneirar({ ...bom, fraccaoNaPiscina: 0.03 }).veredicto, 'CUIDADO');
  assert.equal(peneirar({ ...bom, fraccaoNaPiscina: 0.0443 }).veredicto, 'PASSA'); // o p10
  assert.equal(peneirar({ ...bom, fraccaoNaPiscina: 0.114 }).veredicto, 'PASSA');  // a mediana
});

// Uma fracção pequena mas normal não pode virar alarme: 11% é a MEDIANA.
// Se isto disparasse a 11%, metade dos tokens levava aviso e o aviso deixava
// de querer dizer nada.
test('a mediana medida nao pode disparar aviso nenhum', () => {
  const j = peneirar({ ...bom, fraccaoNaPiscina: 0.114 });
  assert.equal(j.porque.length, 0, `a mediana levou aviso: ${j.porque.join(' / ')}`);
});

test('a fraccao aparece sempre nas notas, mesmo quando esta bem', () => {
  const j = peneirar({ ...bom, fraccaoNaPiscina: 0.32 });
  assert.ok(j.notas.some((n) => /32\.0% da oferta dentro/.test(n)), j.notas.join(' / '));
});

// Isto é o que impede a peneira de se armar em mais do que é.
test('continua a dizer que a concentracao POR CARTEIRA nao e medida', () => {
  const j = peneirar({ ...bom, fraccaoNaPiscina: 0.5 });
  assert.ok(j.notas.some((n) => /por carteira.*NÃO medida/.test(n)), j.notas.join(' / '));
});

test('sem dados da piscina nao se inventa fraccao nenhuma', () => {
  const j = peneirar({ ...bom, fraccaoNaPiscina: null });
  assert.equal(j.veredicto, 'PASSA');
  assert.ok(!j.notas.some((n) => /dentro da piscina/.test(n)));
});

// Medir e esconder não serve de nada. A fracção gatilhava veredictos mas não
// aparecia em cartão nenhum — as `notas` nunca chegavam a ser desenhadas.
test('a fraccao na piscina aparece no cartao, nao so no veredicto', () => {
  const h = pagina([{ f: { ...bom, fraccaoNaPiscina: 0.114 }, j: peneirar(bom) }]);
  assert.match(h, /Na piscina/, 'falta a etiqueta no cartão');
  assert.match(h, /11\.4%/, 'o número tem de estar à vista');
});

test('token sem essa medida mostra travessao, e nao um zero enganador', () => {
  const h = pagina([{ f: { ...bom, fraccaoNaPiscina: null }, j: peneirar(bom) }]);
  assert.match(h, /Na piscina<\/dt><dd>—/);
  assert.ok(!/Na piscina<\/dt><dd>0/.test(h), '"0%" faria parecer medido e vazio');
});

// Sem ícone o browser pede /favicon.ico, leva 404 em toda a visita, e a página
// fica sem cara quando alguém a guarda no telemóvel. Embutido para não haver
// um segundo pedido nem um segundo sítio que possa faltar.
test('a pagina traz o proprio icone, sem pedir ficheiro nenhum', () => {
  const h = pagina([]);
  assert.match(h, /<link rel="icon" href="data:image\/svg\+xml/);
  assert.ok(!/href="[^"]*favicon\.ico"/.test(h), 'não pode depender de um ficheiro à parte');
});
