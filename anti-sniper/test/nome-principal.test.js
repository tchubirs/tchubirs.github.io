'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ordenarPorIdentidade, nomesQueValem } = require('../src/nome-principal');

// A regra é dele: "o nome principal da pessoa é o que ela usa mais de uma
// vez e uns dos primeiros da conta".
const historia = [
  { nome: 'Tchubita', em: '2019' },          // o nome dela: cedo
  { nome: 'xX_dark_Xx', em: '2019' },
  { nome: 'Bloco2A', em: '2021' },
  { nome: 'ze polvinho', em: '2022' },
  { nome: 'Tchubita', em: '2024' },          // e VOLTOU
  { nome: 'messi messi messi', em: '2025' },
  { nome: 'Bloco2A', em: '2025' },           // repetiu, mas tarde e seguido
  { nome: 'Recruta', em: '2026' },
];

test('quem voltou ao nome anos depois fica em primeiro', () => {
  const r = ordenarPorIdentidade(historia);
  assert.equal(r[0].nome, 'Tchubita');
  assert.equal(r[0].voltou, true);
  assert.equal(r[0].vezes, 2);
  assert.deepEqual(r[0].anosUsados, [2019, 2024]);
  assert.match(r[0].porque.join(' '), /voltou a usar depois de 5 anos/);
});

// Repetir é sinal; VOLTAR é sinal mais forte. A diferença é o buraco:
// usar em 2024 e 2025 é continuidade, usar em 2019 e 2024 é regressar.
test('repetir em anos SEGUIDOS não é "voltar"', () => {
  const seguidos = [
    { nome: 'Fulano', em: '2020' }, { nome: 'Fulano', em: '2021' },
    { nome: 'outro', em: '2022' }, { nome: 'mais', em: '2023' },
  ];
  const f = ordenarPorIdentidade(seguidos).find((x) => x.nome === 'Fulano');
  assert.equal(f.repetiu, true);
  assert.equal(f.voltou, false, '2020 e 2021 é continuidade, não regresso');
});

test('e voltar depois de um buraco é o sinal mais forte', () => {
  const r = ordenarPorIdentidade(historia);
  const b = r.find((x) => x.nome === 'Bloco2A');
  assert.equal(b.voltou, true, '2021 e 2025 são quatro anos de buraco');
  // Mesmo assim fica atrás da Tchubita: ela voltou E está no começo.
  assert.ok(r.findIndex((x) => x.nome === 'Tchubita') < r.findIndex((x) => x.nome === 'Bloco2A'));
});

test('um nome usado uma vez só, tarde, fica no fim', () => {
  const r = ordenarPorIdentidade(historia);
  const ultimo = r[r.length - 1];
  assert.equal(ultimo.vezes, 1);
  assert.equal(ultimo.pontos, 0);
});

test('estar no começo da conta conta como sinal', () => {
  const r = ordenarPorIdentidade(historia);
  assert.equal(r.find((x) => x.nome === 'xX_dark_Xx').cedo, true);
  assert.equal(r.find((x) => x.nome === 'Recruta').cedo, false);
});

// Com 344 nomes, cruzar todos garante um falso positivo: com trezentos
// tiros, algum acerta por acaso.
test('escolhe os poucos que valem, em vez de cruzar os 344', () => {
  const muitos = [];
  for (let i = 0; i < 344; i++) muitos.push({ nome: `piada${i}`, em: '2025' });
  muitos.push({ nome: 'Tchubita', em: '2015' }, { nome: 'Tchubita', em: '2024' });
  const v = nomesQueValem(muitos);
  assert.ok(v.length <= 12);
  assert.equal(v[0].nome, 'Tchubita');
});

test('sem sinal nenhum, devolve o que há em vez de escolher a esmo', () => {
  const iguais = [{ nome: 'a', em: '2025' }, { nome: 'b', em: '2025' }, { nome: 'c', em: '2025' }];
  const v = nomesQueValem(iguais);
  assert.equal(v.length, 3);
});

test('lista vazia não quebra', () => {
  assert.deepEqual(ordenarPorIdentidade([]), []);
  assert.deepEqual(ordenarPorIdentidade(null), []);
});

// "Uns dos primeiros da conta" é POSIÇÃO, não período. Medi por ano antes,
// e numa conta real com os nomes amontoados em 2010-2011 marcou 7 de 10
// como "cedo" — o que não separa nada.
test('"cedo" é um punhado de nomes, não um terço da vida da conta', () => {
  // Na ordem em que a página os dá: do MAIS RECENTE para o mais antigo.
  // Antes eu tinha escrito este fixture ao contrário, com os anos a subir, e
  // por isso ele não apanhava nada — a ordenação por ano deixava-o quieto.
  const amontoados = [
    { nome: 'Sekiro', em: '2019' }, { nome: 'Robin', em: '2019' },
    { nome: 'frase longa', em: '2015' }, { nome: 'Juggernaut', em: '2011' },
    { nome: 'Aeo', em: '2011' }, { nome: 'tastee', em: '2011' },
    { nome: 'vipz', em: '2011' }, { nome: 'Brobin', em: '2010' },
    { nome: 'Brocephales', em: '2010' }, { nome: 'Bob', em: '2010' },
  ];
  const cedos = ordenarPorIdentidade(amontoados).filter((x) => x.cedo);
  assert.ok(cedos.length <= 2, `esperava um punhado, marcou ${cedos.length}`);
  assert.equal(cedos[0].nome, 'Bob');
});

// Sem linha do tempo não existe "primeiro": a ordem dentro de um ano é a
// que a fonte devolveu, e eleger um daí é escolher ao acaso.
test('todos no mesmo ano: ninguém é "o primeiro"', () => {
  const mesmoAno = [
    { nome: 'a', em: '2025' }, { nome: 'b', em: '2025' }, { nome: 'c', em: '2025' },
  ];
  const r = ordenarPorIdentidade(mesmoAno);
  assert.ok(r.every((x) => !x.cedo));
  assert.ok(r.every((x) => x.pontos === 0));
});

// O steamid.uk logado diz qual foi o PRIMEIRO nome da conta, numa secção sem
// ano ("First name seen by SteamID"). Antes disto, ordenar por `ano ?? 9999`
// mandava esse nome para o FIM da linha do tempo — o lugar oposto ao dele.
// A fonte dava a resposta de graça e eu arquivava-a como a mais recente.
test('o nome marcado como primeiro da conta é o mais antigo, não o mais novo', () => {
  const lista = [
    { nome: 'Joaozinho', em: '05 Aug 2026' },
    { nome: 'Pluto', em: '14 Apr 2025' },
    { nome: 'Cdi', em: '02 Mar 2024' },
    { nome: 'Trynity', em: null, secao: 'primeiro-nome' },
  ];
  const r = ordenarPorIdentidade(lista);
  const t = r.find((x) => x.nome === 'Trynity');
  assert.equal(t.cedo, true, 'o primeiro nome da conta tem de contar como "cedo"');
  assert.equal(t.primeiroDaConta, true);
  assert.ok(t.porque.includes('é o primeiro nome que a Steam registou'));
  // E o "Cdi", que era o mais antigo COM data, deixa de ser o 1º da conta.
  const cdi = r.find((x) => x.nome === 'Cdi');
  assert.ok(!cdi.porque.some((p) => p.startsWith('é o 1º')),
    'com a marca presente, o mais antigo com data não é mais o primeiro');
});

// "Unknown" é ignorância, não antiguidade. Tratá-lo como antigo seria inventar.
test('"Unknown" não vira nome antigo por não ter data', () => {
  const lista = [
    { nome: 'Joaozinho', em: '2026' },
    { nome: 'Pluto', em: '2025' },
    { nome: 'Fantasma', em: null, secao: 'sem-data' },
  ];
  const r = ordenarPorIdentidade(lista);
  const f = r.find((x) => x.nome === 'Fantasma');
  assert.equal(f.cedo, false);
  assert.equal(f.pontos, 0);
});

// A marca vem do site; a posição é dedução minha. Com todos os nomes no mesmo
// ano a posição não vale nada — mas a marca continua a valer, porque não há
// nada a deduzir nela.
test('a marca do site vale mesmo sem linha do tempo', () => {
  const r = ordenarPorIdentidade([
    { nome: 'a', em: '2025' }, { nome: 'b', em: '2025' },
    { nome: 'Trynity', em: null, secao: 'primeiro-nome' },
  ]);
  assert.equal(r[0].nome, 'Trynity');
  assert.equal(r[0].pontos, 2);
  assert.ok(r.slice(1).every((x) => x.pontos === 0));
});

// Empate: sem esta regra o nome marcado perdia sempre, por `primeiroEm` ser
// null e cair para 9999 na desempate — ou seja, o mais recente de todos.
test('em empate de pontos, o marcado pelo site fica à frente', () => {
  // 5 pontos cada: o Zeca por ter sido usado 4× (2+3), a Trynity por 2×
  // (2+1) mais a marca do site (+2).
  const r = ordenarPorIdentidade([
    { nome: 'Zeca', em: '2019' }, { nome: 'Zeca', em: '2019' },
    { nome: 'Zeca', em: '2019' }, { nome: 'Zeca', em: '2019' },
    { nome: 'Trynity', em: null, secao: 'primeiro-nome' },
    { nome: 'Trynity', em: null, secao: 'primeiro-nome' },
  ]);
  assert.equal(r[0].nome, 'Trynity');
  assert.equal(r[0].pontos, r[1].pontos, 'o teste só vale se houver mesmo empate');
});

// O erro que ele viu no ecrã: o programa tinha o DIA e ordenava pelo ANO.
// `sort` é estável, a página vem do mais recente para o mais antigo, e por
// isso dois nomes do mesmo ano saíam na ordem invertida. Nos sete nomes de
// 2015 dele, dava "Trynity Blood" (06 Dez) como primeiro nome da conta
// quando o primeiro é "em procura do fefeufumafuma" (26 Jan).
test('dentro do mesmo ano, quem manda é o DIA — não a ordem da página', () => {
  const dele = [
    { nome: 'Carlos Hatchock', em: '29 Oct 2016' },
    { nome: '[BDM]Senhor recruta', em: '01 Jan 2016' },
    { nome: 'Trynity Blood', em: '06 Dec 2015' },
    { nome: 'VL Sniper', em: '22 May 2015' },
    { nome: 'Trynitythegod', em: '08 May 2015' },
    { nome: 'o futuro matador de gringo', em: '03 May 2015' },
    { nome: 'o futuro Sambr', em: '28 Apr 2015' },
    { nome: 'Fefeufumafuma', em: '29 Jan 2015' },
    { nome: 'em procura do fefeufumafuma', em: '26 Jan 2015' },
  ];
  const cedos = ordenarPorIdentidade(dele).filter((x) => x.cedo);
  assert.equal(cedos[0].nome, 'em procura do fefeufumafuma',
    'o primeiro nome da conta é o de 26 Jan, não o de 06 Dez');
  assert.ok(!cedos.some((x) => x.nome === 'Trynity Blood'),
    '"Trynity Blood" é o mais NOVO de 2015 — não pode ser dos primeiros');
});

// As três fontes escrevem a data de maneiras diferentes. Se a ordenação só
// entender uma delas, a lista junta sai baralhada sem dar erro nenhum.
test('lê o dia nos três formatos das fontes', () => {
  const misto = [
    { nome: 'novo', em: '28/08/2026, 05:52:04' },  // steamhistory.net
    { nome: 'meio', em: '05 Aug 2026' },           // steamid.uk logado
    { nome: 'velho', em: 'May 7, 2019 @ 11:04pm' },// Steam
  ];
  const cedos = ordenarPorIdentidade(misto).filter((x) => x.cedo);
  assert.equal(cedos[0].nome, 'velho', '2019 é anterior a 2026 em qualquer formato');

  // E dentro do MESMO mês, o dia tem de separar os dois formatos com dia.
  const mesmoMes = ordenarPorIdentidade([
    { nome: 'dia28', em: '28/08/2026, 05:52:04' },
    { nome: 'dia05', em: '05 Aug 2026' },
    { nome: 'ancora', em: '01 Jan 2020' },
  ]);
  const pos = (n) => mesmoMes.find((x) => x.nome === n).posicao;
  assert.ok(pos('dia05') < pos('dia28'), '05 Aug vem antes de 28 Aug');
});

// Sem dia, o que resta é a ordem da página — e essa vem ao contrário.
test('só com o ano, a ordem da página é invertida', () => {
  const soAno = [
    { nome: 'ultimo', em: '2015' },
    { nome: 'meio', em: '2015' },
    { nome: 'primeiro', em: '2015' },
    { nome: 'ancora', em: '2010' },
  ];
  const r = ordenarPorIdentidade(soAno);
  const pos = (n) => r.find((x) => x.nome === n).posicao;
  assert.ok(pos('primeiro') < pos('meio') && pos('meio') < pos('ultimo'));
});

// O erro que ele apanhou na saída: nove nomes com a mesma raiz davam sinal
// ZERO, porque eu só contava repetição exacta. Sem sinal nenhum, o desempate
// escolhia um nome ao acaso — e a saída apontava para quem não era.
test('a raiz partilhada ganha ao nome de uso único', () => {
  const lista = [
    { nome: 'Capitao', em: '01 Jan 2016' },
    { nome: 'C4pitaoTV', em: '02 Feb 2019' },
    { nome: '[YT] Capitao Nave', em: '03 Mar 2022' },
    { nome: '[BDM]capitao', em: '04 Apr 2024' },
    { nome: 'Capitãozinho', em: '05 May 2026' },
    { nome: 'Melancia', em: '06 Jun 2020' },
    { nome: 'Owl', em: '07 Jul 2020' },
    { nome: 'Milk', em: '08 Aug 2020' },
    { nome: 'Monster', em: '09 Sep 2020' },
  ];
  const r = ordenarPorIdentidade(lista);
  assert.ok(/capit/i.test(r[0].nome), `o topo devia ser da família Capitao, veio "${r[0].nome}"`);
  assert.equal(r[0].raizEm, 5);
  // "Capitao" é a forma limpa, por isso a frase é a da raiz e não a de quem
  // apenas a partilha — as duas dizem a mesma coisa por lados diferentes.
  assert.ok(r[0].porque.some((p) => /^(é a raiz que|partilha a raiz)/.test(p)));
  // E os nomes de uso único continuam sem sinal, em vez de subirem por sorteio.
  assert.equal(r.find((x) => x.nome === 'Melancia').pontos, 0);
});

// Entre variações, a mais curta é o nome; as outras são moldura.
test('entre variações da mesma raiz, a mais curta fica à frente', () => {
  const r = ordenarPorIdentidade([
    { nome: '[BDM]Senhor capitao', em: '2016' },
    { nome: 'Capitao', em: '2016' },
    { nome: '[YT CANAL] Senhor capitao', em: '2016' },
    { nome: 'Melancia', em: '2016' }, { nome: 'Owl', em: '2016' },
    { nome: 'Milk', em: '2016' }, { nome: 'Monster', em: '2016' },
  ]);
  assert.equal(r[0].nome, 'Capitao');
});

// Juntar as famílias DEPOIS de cortar pelo tecto é cortar informação: as nove
// variações de uma raiz enchem a lista e empurram para fora um nome que tinha
// sinal próprio. Foi o que aconteceu ao primeiro nome da conta.
test('porRaiz junta as famílias ANTES do tecto, não depois', () => {
  const lista = [
    ...['Capitao', 'C4pitaoTV', '[YT] Capitao Nave', '[BDM]capitao', 'Capitãozinho',
      'Capitao do mar', 'SenhorCapitao', '[BR] Capitao', 'Capitao Zero']
      .map((nome, i) => ({ nome, em: `0${(i % 9) + 1} Jan 201${i % 6}` })),
    { nome: 'Alicerce', em: null, secao: 'primeiro-nome' },
    { nome: 'Melancia', em: '01 Jan 2020' },
  ];
  const cru = nomesQueValem(lista, { teto: 5 });
  assert.ok(!cru.some((n) => n.nome === 'Alicerce'),
    'sem porRaiz, as variações enchem a lista — é o defeito que isto documenta');

  const junto = nomesQueValem(lista, { teto: 5, porRaiz: true });
  assert.ok(junto.some((n) => n.nome === 'Alicerce'),
    'com porRaiz, o primeiro nome da conta cabe');
  assert.equal(junto.filter((n) => n.raiz === 'capitao').length, 1,
    'a família inteira vale um candidato');
});

// Ele confirmou a olhar para os dados: "recruta é o correto". As outras formas
// da família são esta com moldura por cima — prefixo de canal, sufixo, leet.
// E o desempate tem de vir ANTES da data: a forma limpa costuma ser recente e
// a forma com moldura antiga, e a data sozinha elegia sempre a errada.
test('a família elege o nome que É a raiz, mesmo sendo o mais recente', () => {
  const r = ordenarPorIdentidade([
    { nome: 'SenhorCapitao', em: '05 Oct 2016' },
    { nome: '[YT] Senhor Capitao', em: '18 Apr 2016' },
    { nome: '[BDM]Senhor capitao', em: '01 Jan 2016' },
    { nome: 'C4pitaoTV', em: '03 Dec 2025' },
    { nome: 'Capitao', em: '30 Jul 2026' },
    { nome: 'Melancia', em: '01 Jan 2020' }, { nome: 'Owl', em: '02 Jan 2020' },
    { nome: 'Milk', em: '03 Jan 2020' }, { nome: 'Monster', em: '04 Jan 2020' },
  ]);
  assert.equal(r[0].nome, 'Capitao', 'o nome sem moldura é a resposta');
  assert.equal(r[0].ehARaiz, true);
  assert.ok(r[0].porque.some((p) => p.startsWith('é a raiz que')));
});
