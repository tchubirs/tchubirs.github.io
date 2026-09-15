'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { valorEmDinheiro, diasQueFaltam, normalizar } = require('../src/devpost.js');
const { julgar, ordenar } = require('../src/julgar.js');
const { pagina, dinheiro, pct } = require('../src/pagina.js');

const bom = {
  titulo: 'Concurso', url: 'https://devpost.com/x', organizacao: 'Org',
  aberto: true, online: true, local: 'Online', soPorConvite: false,
  premioTotal: 40000, premiosEmDinheiro: 4, outrosPremios: 0,
  inscritos: 125, diasQueFaltam: 30, prazoTexto: 'about 1 month left',
};

// ── Ler o que o Devpost manda ──

// O prémio vem embrulhado: `$<span data-currency-value>40,000</span>`. Sem tirar
// as etiquetas primeiro, os dígitos dos atributos entram na conta.
test('o premio sai de dentro do HTML, com a virgula dos milhares', () => {
  assert.equal(valorEmDinheiro('$<span data-currency-value>40,000</span>'), 40000);
  assert.equal(valorEmDinheiro('$<span data-currency-value>0</span>'), 0);
  assert.equal(valorEmDinheiro('$1,247'), 1247);
  // Atributos COM dígitos: sem tirar as etiquetas, o `1` de `h1` era o prémio.
  assert.equal(valorEmDinheiro('$<span class="h1" data-x="2">40,000</span>'), 40000);
  assert.equal(valorEmDinheiro(''), 0);
  assert.equal(valorEmDinheiro(null), 0);
});

// Um prazo ilegível não pode parecer que fecha hoje: isso eliminava concursos
// bons por causa de uma frase que o Devpost escreveu de outra maneira.
test('prazo ilegivel e desconhecido, nunca zero', () => {
  assert.equal(diasQueFaltam('15 days left'), 15);
  assert.equal(diasQueFaltam('about 1 month left'), 30);
  assert.equal(diasQueFaltam('a day left'), 1);
  assert.equal(diasQueFaltam('about 5 hours left'), 0);
  assert.equal(diasQueFaltam(''), null);
  assert.equal(diasQueFaltam('qualquer coisa estranha'), null);
  // Um número com unidade que não conhecemos continua a ser desconhecido.
  assert.equal(diasQueFaltam('5 fortnights left'), null);
});

test('normalizar recusa lixo e nao inventa campos', () => {
  assert.equal(normalizar(null), null);
  assert.equal(normalizar({}), null);
  const n = normalizar({ title: 'X', open_state: 'open', prize_amount: '$<span>500</span>',
    prizes_counts: { cash: 2, other: 1 }, registrations_count: 50,
    displayed_location: { location: 'Online' }, url: '//devpost.com/a' });
  assert.equal(n.premioTotal, 500);
  assert.equal(n.premiosEmDinheiro, 2);
  assert.equal(n.online, true);
  assert.equal(n.url, 'https://devpost.com/a', 'a URL do Devpost vem sem esquema');
});

// ── As eliminações, todas medidas na amostra de 15/09/2026 ──

// 21 dos 49 concursos abertos não tinham dinheiro nenhum. É a eliminação mais
// comum de todas, e o Devpost mostra-os ao lado dos que pagam.
test('sem dinheiro nenhum e FORA', () => {
  const j = julgar({ ...bom, premioTotal: 0 });
  assert.equal(j.veredicto, 'FORA');
  assert.ok(j.porque.some((p) => /não tem dinheiro/.test(p)), j.porque.join(' / '));
});

// O caso traiçoeiro: anuncia um prémio grande que é todo em produtos.
test('premio grande sem nada em dinheiro e FORA, e diz o valor que anunciava', () => {
  const j = julgar({ ...bom, premioTotal: 25000, premiosEmDinheiro: 0, outrosPremios: 6 });
  assert.equal(j.veredicto, 'FORA');
  assert.ok(j.porque.some((p) => /25.000/.test(p) && /nenhum prémio é em dinheiro/.test(p)),
    j.porque.join(' / '));
});

// 9 dos 49 eram presenciais — e o MELHOR rácio de toda a amostra era um deles,
// em Bengaluru. Sem este filtro, o radar põe no topo uma coisa impossível.
test('presencial e FORA, e diz onde', () => {
  const j = julgar({ ...bom, online: false, local: 'Bengaluru, India' });
  assert.equal(j.veredicto, 'FORA');
  assert.ok(j.porque.some((p) => /Bengaluru/.test(p)), j.porque.join(' / '));
});

test('so por convite e fechado sao FORA', () => {
  assert.equal(julgar({ ...bom, soPorConvite: true }).veredicto, 'FORA');
  assert.equal(julgar({ ...bom, aberto: false }).veredicto, 'FORA');
});

test('sem tempo para construir e TARDE', () => {
  const j = julgar({ ...bom, diasQueFaltam: 2 });
  assert.equal(j.veredicto, 'TARDE');
  assert.ok(j.porque.some((p) => /faltam 2 dias/.test(p)));
});

// ── A conta que decide ──

// Esta é a tese inteira do projecto. O Devpost ordena por prémio; o prémio é a
// pergunta errada quando o objectivo é UM pagamento.
test('a hipotese e premios em dinheiro a dividir pelos inscritos', () => {
  const j = julgar({ ...bom, premiosEmDinheiro: 4, inscritos: 125 });
  assert.ok(Math.abs(j.hipotese - 0.032) < 0.0005, `esperava 3,2%, veio ${j.hipotese}`);
  assert.equal(j.porInscrito, 40000 / 125);
});

// $50.000 com um só vencedor entre 3.000 pessoas tem de perder para $400
// repartidos por 3 prémios entre 234. Se esta ordem se inverter, o projecto
// deixa de ter razão de existir.
test('a lotaria grande perde para o premio pequeno com hipotese real', () => {
  const lotaria = { c: { ...bom, titulo: 'Lotaria', premioTotal: 50000, premiosEmDinheiro: 1, inscritos: 3000 } };
  const pequeno = { c: { ...bom, titulo: 'Pequeno', premioTotal: 400, premiosEmDinheiro: 3, inscritos: 234 } };
  lotaria.j = julgar(lotaria.c); pequeno.j = julgar(pequeno.c);
  assert.ok(pequeno.j.hipotese > lotaria.j.hipotese);
  const ord = ordenar([lotaria, pequeno]);
  assert.equal(ord[0].c.titulo, 'Pequeno', 'a ordem do Devpost é por prémio; a nossa não pode ser');
});

// O caso anterior ganhava na PRIMEIRA chave (veredictos diferentes) e nunca
// chegava ao desempate. Estes dois têm o mesmo veredicto de propósito: se a
// ordenação voltar a ser por prémio, só este teste dá por isso.
test('entre dois que valem, ganha a maior hipotese e nao o maior premio', () => {
  const gordo = { c: { ...bom, titulo: 'Gordo', premioTotal: 90000, premiosEmDinheiro: 2, inscritos: 100 } };
  const magro = { c: { ...bom, titulo: 'Magro', premioTotal: 900, premiosEmDinheiro: 9, inscritos: 100 } };
  gordo.j = julgar(gordo.c); magro.j = julgar(magro.c);
  assert.equal(gordo.j.veredicto, magro.j.veredicto, 'o teste exige o mesmo veredicto nos dois');
  assert.equal(ordenar([gordo, magro])[0].c.titulo, 'Magro');
});

test('hipotese de rifa e FRACO, nao VALE', () => {
  const j = julgar({ ...bom, premiosEmDinheiro: 1, inscritos: 500 });
  assert.equal(j.veredicto, 'FRACO');
});

// Zero inscritos com dois prémios dava hipótese infinita e ia parar ao topo.
test('concurso sem inscritos nao inventa hipotese nenhuma', () => {
  const j = julgar({ ...bom, inscritos: 0 });
  assert.equal(j.hipotese, null);
  assert.equal(j.porInscrito, null);
  assert.ok(j.notas.some((n) => /sem inscritos/.test(n)), j.notas.join(' / '));
});

test('VALE diz sempre que nao e promessa', () => {
  assert.match(julgar(bom).aviso, /não quer dizer que ganhas/);
  assert.equal(julgar({ ...bom, premioTotal: 0 }).aviso, null);
});

test('concurso nenhum nao rebenta', () => {
  assert.equal(julgar(null), null);
  assert.equal(julgar({}), null);
});

// ── A página ──

test('a pagina esconde os FORA mas conta-os no resumo', () => {
  const linhas = [
    { c: { ...bom, titulo: 'Bom' }, j: julgar(bom) },
    { c: { ...bom, titulo: 'SemDinheiro', premioTotal: 0 }, j: julgar({ ...bom, premioTotal: 0 }) },
  ];
  const h = pagina(linhas);
  assert.ok(h.includes('Bom'));
  assert.ok(!h.includes('SemDinheiro'), 'os FORA não ocupam espaço na página');
  assert.match(h, />1 fora</, 'mas têm de estar contados');
});

// O título de um concurso é texto escrito por quem o criou.
test('o titulo nao pode injectar HTML', () => {
  const h = pagina([{ c: { ...bom, titulo: '<img src=x onerror=alert(1)>' }, j: julgar(bom) }]);
  assert.ok(!h.includes('<img src=x'));
  assert.ok(h.includes('&lt;img'));
});

test('a pagina diz o que NAO mede', () => {
  const h = pagina([]);
  assert.match(h, /elegibilidade/i, 'tem de avisar que as regras de cada concurso não são lidas');
  assert.match(h, /Ler as regras antes/);
});

test('os numeros sao legiveis e o que falta e travessao', () => {
  assert.equal(dinheiro(40000), '$40.0K');
  assert.equal(dinheiro(0), '$0');
  assert.equal(pct(0.032), '3.2%');
  assert.equal(pct(null), '—');
});
