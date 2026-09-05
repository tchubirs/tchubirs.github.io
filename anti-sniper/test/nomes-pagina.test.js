'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { lerNomesDaPagina } = require('../src/nomes-pagina');

// O desenho vem das capturas que ele mandou do steamid.uk: um bloco
// "Persona History (N)" e linhas com nome + data.
const pagina = (n) => {
  const linhas = Array.from({ length: n }, (_, i) =>
    `<tr><td><a href="#">nome${i}</a></td><td>2${String(i % 9).padStart(1,'0')}/08/2026, 08:4${i % 10}:00</td></tr>`).join('');
  return parseHTML(`<html><head><title>SteamID</title></head><body>
    <div><h2>Persona History (${n})</h2><table><tbody>${linhas}</tbody></table></div>
  </body></html>`).document;
};

test('lê a lista de nomes e o total anunciado', () => {
  const r = lerNomesDaPagina(pagina(61));
  assert.equal(r.nomes.length, 61);
  assert.equal(r.total, 61);
  assert.equal(r.nomes[0].nome, 'nome0');
  assert.match(r.nomes[0].em, /\d{2}\/08\/2026/);
});

test('funciona com <li> em vez de tabela', () => {
  const itens = Array.from({ length: 12 }, (_, i) =>
    `<li><span>jogador_${i}</span> <time>0${(i%9)+1}/07/2025</time></li>`).join('');
  const doc = parseHTML(`<html><body><h3>Name History (12)</h3><ul>${itens}</ul></body></html>`).document;
  const r = lerNomesDaPagina(doc);
  assert.equal(r.nomes.length, 12);
  assert.equal(r.nomes[3].nome, 'jogador_3');
});

test('nome com espaços e símbolos sobrevive', () => {
  const doc = parseHTML(`<html><body><h2>Persona History (6)</h2><table><tbody>
    ${['BIG Rats','Balloon Enjoyer','Juh <3','игрок 03','no.tc.no.problem','messi messi messi']
      .map((n,i)=>`<tr><td>${n.replace('<','&lt;')}</td><td>1${i}/05/2024, 01:00:00</td></tr>`).join('')}
  </tbody></table></body></html>`).document;
  const r = lerNomesDaPagina(doc);
  assert.equal(r.nomes.length, 6);
  assert.equal(r.nomes[1].nome, 'Balloon Enjoyer');
  assert.equal(r.nomes[3].nome, 'игрок 03');
});

// Devolver lista vazia leria como "essa conta não tem nomes". São coisas
// diferentes, e a diferença é a que mais importa neste produto.
test('quando não acha, devolve retrato da página em vez de lista vazia', () => {
  const doc = parseHTML('<html><head><title>Just a moment...</title></head><body><div class="cf">checking</div></body></html>').document;
  const r = lerNomesDaPagina(doc);
  assert.equal(r.nomes, undefined);
  assert.match(r.erro, /não achei/);
  assert.equal(r.retrato.titulo, 'Just a moment...');
});

test('poucas linhas não viram lista — 2 datas soltas é coincidência', () => {
  const doc = parseHTML(`<html><body><h2>Persona History</h2><table><tbody>
    <tr><td>a</td><td>01/01/2024</td></tr><tr><td>b</td><td>02/01/2024</td></tr>
  </tbody></table></body></html>`).document;
  assert.ok(lerNomesDaPagina(doc).erro);
});

// ── Esconder não é não ter ───────────────────────────────────────────────
//
// O steamid.uk deslogado mostra "344 persona's. Results limited." com os
// nomes cortados ("Gat..", "Pl..") e a maioria dos anos vazia. Devolver
// esses pedaços como se fossem a lista é o pior resultado possível: uma
// resposta que parece completa e não é.
const paginaLimitada = () => parseHTML(`<html><head><title>SteamID</title></head><body>
  <div>344 Stored names</div>
  <h3>Previous Community URLS</h3><div>6 previous URLs, login to view.</div>
  <h3>Previous Persona Names</h3>
  <div>344 persona's. Results limited.</div>
  <div>2026 18 Joaozinho Recruta Gat.. Pl.. Blo.. Pic.. C.. Tu.. Bag..</div>
  <div>2025 49 .. jo..</div>
  <div>2024 41</div><div>2023 48</div><div>2022 35</div>
  <h3>Avatar History</h3><div>21 avatar's logged, please log in to view</div>
</body></html>`).document;

test('página que corta a lista é reportada, não entregue pela metade', () => {
  const r = lerNomesDaPagina(paginaLimitada());
  assert.equal(r.nomes, undefined, '18 pedaços de 344 não podem sair como "a lista"');
  assert.equal(r.limitado, true);
  assert.equal(r.totalDito, 344);
  assert.match(r.dica, /login|logue/i);
});

test('a dica muda conforme o motivo — login escondendo vs lista cortada', () => {
  const soLimitada = parseHTML(`<html><body>
    <h3>Previous Persona Names</h3><div>344 persona's. Results limited.</div>
  </body></html>`).document;
  const r = lerNomesDaPagina(soLimitada);
  assert.equal(r.limitado, true);
  assert.doesNotMatch(r.erro, /logado/);
});

test('página normal continua sendo lida — o aviso não engole o caminho bom', () => {
  const doc = parseHTML(`<html><body><h2>Persona History (6)</h2><table><tbody>
    ${['giB Star','RATS','BIG Rats','sh0cker','D10S','HyHo']
      .map((n,i)=>`<tr><td>${n}</td><td>1${i}/05/2024, 01:00:00</td></tr>`).join('')}
  </tbody></table></body></html>`).document;
  const r = lerNomesDaPagina(doc);
  assert.equal(r.nomes.length, 6);
  assert.equal(r.limitado, undefined);
});

// ── O formato REAL do steamid.uk ─────────────────────────────────────────
//
// Não é linha-com-data. O HTML que ele colou agrupa por ANO:
//   Previous Persona Names
//   344 persona's.
//   2026 18  Joaozinho Recruta Gatinho Pluto ...
//   2025 49  ...
// Cada nome é o seu próprio elemento (o site mostra um ícone ao lado).
const paginaPorAno = ({ cortados = false } = {}) => {
  const ano = (a, n, ns) => `<div class="y">${a} ${n}</div>` +
    ns.map((x) => `<a href="#">${x.replace('<','&lt;')}</a>`).join('');
  return parseHTML(`<html><head><title>SteamID</title></head><body><div class="card">
    <h3>Previous Persona Names</h3>
    <div class="bloco">
      ${ano('2026', 18, cortados
        ? ['Joaozinho','Recruta','Gat..','Pl..','Blo..']
        : ['Joaozinho','Recruta','Gatinho','Balloon Enjoyer','Bloco2A'])}
      ${ano('2025', 49, ['Rogerinho do beco','ze polvinho','Kleberson'])}
      ${ano('2024', 41, ['игрок 03','no.tc.no.problem'])}
    </div></div></body></html>`).document;
};

test('lê o formato agrupado por ano do steamid.uk', () => {
  const r = lerNomesDaPagina(paginaPorAno());
  assert.equal(r.comoAchei, 'agrupado por ano');
  assert.equal(r.nomes.length, 10);
  assert.equal(r.total, 18 + 49 + 41, 'o total soma as contagens declaradas por ano');
  // Nome com espaço não pode virar dois nomes.
  assert.ok(r.nomes.some((n) => n.nome === 'Balloon Enjoyer'));
  assert.ok(r.nomes.some((n) => n.nome === 'Rogerinho do beco'));
  assert.ok(r.nomes.some((n) => n.nome === 'игрок 03'));
});

test('cada nome carrega o ANO, e diz que a precisão é o ano', () => {
  const r = lerNomesDaPagina(paginaPorAno());
  const j = r.nomes.find((n) => n.nome === 'Joaozinho');
  assert.equal(j.em, '2026');
  assert.equal(j.precisao, 'ano', 'a página não dá o dia — afirmar um seria inventar');
  assert.equal(r.nomes.find((n) => n.nome === 'Kleberson').em, '2025');
});

// Deslogado o site corta os nomes. Metade de uma palavra não é um nome, e
// guardá-la faria o cruzamento casar com um pedaço.
test('nome cortado pelo site ("Gat..") é descartado, não guardado', () => {
  const r = lerNomesDaPagina(paginaPorAno({ cortados: true }));
  assert.ok(r.nomes.every((n) => !n.nome.endsWith('..')));
  assert.ok(r.nomes.some((n) => n.nome === 'Joaozinho'));
});

test('sem a âncora do título, não inventa anos a partir de números soltos', () => {
  const doc = parseHTML(`<html><body><div>
    <div>2026 18</div><a>coisa</a><div>2025 49</div><a>outra</a><a>mais</a>
  </div></body></html>`).document;
  const r = lerNomesDaPagina(doc);
  assert.equal(r.nomes, undefined);
});

// A página REAL dele, com o que ela realmente trouxe em 28/08/2026. Três
// coisas que o extrator não previa e que entraram na lista como se fossem
// nomes de pessoa:
//
//     2026   18                                  ← a contagem, em elemento
//                                                  separado do ano
//     2015   First name seen by SteamID          ← título de outra secção
//     2015   $('#pd-groupcount').html('0 Grou…   ← jQuery solto no meio
//     2015   Public / Oct 14, 2018               ← histórico de visibilidade
//
// Reproduzo o desenho aqui para o erro não voltar em silêncio.
const paginaReal = () => parseHTML(`<html><head><title>SteamID</title></head><body>
  <div class="card">
    <h3>Previous Persona Names</h3>
    <div class="bloco">
      <div class="y">2026</div><div class="c">18</div>
      <a href="#">Joaozinho</a><a href="#">Recruta</a><a href="#">Gatinho</a>
      <div class="y">2015</div><div class="c">7</div>
      <a href="#">Tufao</a><a href="#">Pluto</a>
    </div>
    <h3>First name seen by SteamID</h3>
    <div>Zezinho</div>
    <script>$('#pd-groupcount').html('0 Groups <br>12 Previous groups');</script>
    <h3>Profile Visibility History</h3>
    <div>Public</div><div>Oct 14, 2018</div>
  </div></body></html>`).document;

test('a contagem do ano vem em elemento separado e não vira nome', () => {
  const r = lerNomesDaPagina(paginaReal());
  assert.ok(!r.nomes.some((n) => n.nome === '18'), '"18" é quantos nomes há em 2026');
  assert.ok(!r.nomes.some((n) => n.nome === '7'));
  assert.equal(r.total, 25, 'a contagem separada ainda soma no total');
  assert.equal(r.nomes.find((n) => n.nome === 'Gatinho').em, '2026');
  assert.equal(r.nomes.find((n) => n.nome === 'Pluto').em, '2015');
});

test('a leitura para no fim da secção — nada depois dela é nome', () => {
  const r = lerNomesDaPagina(paginaReal());
  assert.equal(r.nomes.length, 5, 'só os 5 apelidos reais');
  for (const lixo of ['First name seen by SteamID', 'Zezinho', 'Public', 'Oct 14, 2018']) {
    assert.ok(!r.nomes.some((n) => n.nome === lixo), `"${lixo}" não é apelido de ninguém`);
  }
  assert.ok(!r.nomes.some((n) => /\$\(|html\(/.test(n.nome)), 'código não é nome');
});

// "Groups" é título de secção, mas também pode ser o apelido de alguém. Por
// isso o corte exige o texto INTEIRO: começar por "Groups" cortaria a lista
// no meio e engoliria todos os nomes seguintes.
test('só o título exato corta a lista, não um apelido parecido', () => {
  const pag = (ultimo) => parseHTML(`<html><body><div class="card">
    <h3>Previous Persona Names</h3><div>
    <div>2026</div><div>4</div>
    <a>Joaozinho</a><a>${ultimo}</a><a>Recruta</a><a>Pluto</a>
    </div></div></body></html>`).document;
  const comApelido = lerNomesDaPagina(pag('Groupsito'));
  assert.equal(comApelido.nomes.length, 4, 'um apelido parecido não corta nada');
  assert.ok(comApelido.nomes.some((n) => n.nome === 'Groupsito'));
  const comTitulo = lerNomesDaPagina(pag('Groups'));
  assert.ok(comTitulo === null || comTitulo.nomes === undefined
    || comTitulo.nomes.length === 1, 'o título exato corta ali');
});

// Este número é o que separa "a conta teve 2 nomes" de "o site mostrou-me 2
// de 18". Sem ele a saída é idêntica nos dois casos.
test('conta quantos nomes o site entregou cortados', () => {
  const r = lerNomesDaPagina(paginaPorAno({ cortados: true }));
  assert.equal(r.cortados, 3, '"Gat..", "Pl.." e "Blo.." foram cortados pelo site');
  assert.equal(lerNomesDaPagina(paginaPorAno()).cortados, 0, 'logado, nada vem cortado');
});

// A página do steamhistory.net, do retrato que ele mandou. Duas coisas que
// nenhuma outra fonte dá: o DIA E A HORA de cada troca, e a lista sem login.
//
//     Persona History (133)
//     123               28/08/2026, 05:52:04
//     1                 07/08/2026, 11:46:22
//     Joaozinho         04/08/2026, 18:10:11
//     ...
//     Go to page [1] of 14   Show [10] per page   [Next]  [View All]
//
// O ícone de link fica DENTRO da célula do nome. Se o extrator lesse a linha
// como texto colado, o nome sairia grudado na data.
const paginaHistorico = (linhas) => parseHTML(`<html><head><title>SteamHistory</title></head>
  <body><div class="card">
    <h2 class="title">Persona History <span>(133)</span></h2>
    <table><tbody>
      ${linhas.map(([n, d]) => `<tr>
        <td><span>${n}</span><a href="/x" title="abrir"><svg></svg></a></td>
        <td class="data">${d}</td></tr>`).join('')}
    </tbody></table>
    <div class="pag">Go to page <input value="1"> of 14 Show <select><option>10</option></select> per page</div>
  </div></body></html>`).document;

const LINHAS = [
  ['123', '28/08/2026, 05:52:04'],
  ['1', '07/08/2026, 11:46:22'],
  ['Joaozinho', '04/08/2026, 18:10:11'],
  ['Recruta', '30/07/2026, 13:54:00'],
  ['DeepSea simulator', '28/07/2026, 01:07:31'],
  ['Renatinho', '25/07/2026, 01:40:04'],
  ['To nervoso irmão', '24/07/2026, 21:10:00'],
  ['GatoNet', '16/07/2026, 11:15:00'],
  ['Pluto', '13/07/2026, 11:21:00'],
  ['jorge', '11/07/2026, 11:21:00'],
];

test('lê a tabela do steamhistory.net com nome e data em células separadas', () => {
  const r = lerNomesDaPagina(paginaHistorico(LINHAS));
  assert.equal(r.nomes.length, 10);
  // O ícone dentro da célula não pode grudar no nome nem virar nome.
  assert.equal(r.nomes[0].nome, '123');
  assert.equal(r.nomes[0].em, '28/08/2026');
  // Nome com espaço e com acento inteiro, não partido.
  assert.ok(r.nomes.some((n) => n.nome === 'DeepSea simulator'));
  assert.ok(r.nomes.some((n) => n.nome === 'To nervoso irmão'));
  // Nome que é só um número continua a ser um nome — aqui não há ano nenhum
  // a confundir, a data está na sua própria célula.
  assert.ok(r.nomes.some((n) => n.nome === '1'));
});

test('o total declarado no título é lido, e denuncia a lista paginada', () => {
  const r = lerNomesDaPagina(paginaHistorico(LINHAS));
  assert.equal(r.total, 133, '"(133)" é quantos nomes a conta tem');
  assert.ok(r.nomes.length < r.total, 'a página 1 traz 10 de 133 — é isto que manda ir ao /history/0/');
});

test('a paginação não vira nome', () => {
  const r = lerNomesDaPagina(paginaHistorico(LINHAS));
  for (const n of r.nomes) {
    assert.ok(!/Go to page|per page|of 14/i.test(n.nome), `"${n.nome}" é o rodapé da tabela`);
  }
});

// A data completa é o que o steamhistory dá a mais. "Voltou ao nome" deixa
// de ser "nalgum ano" e passa a ser datável.
test('a data com dia sobrevive até a regra do nome principal', () => {
  const { ordenarPorIdentidade } = require('../src/nome-principal');
  const r = lerNomesDaPagina(paginaHistorico([
    ...LINHAS, ['Joaozinho', '11/03/2015, 09:00:00'],
  ]));
  const j = ordenarPorIdentidade(r.nomes).find((x) => x.nome === 'Joaozinho');
  assert.deepEqual(j.anosUsados, [2015, 2026], 'o ano sai da data em dd/mm/aaaa');
  assert.ok(j.voltou, 'usou em 2015, largou, e voltou em 2026');
});

// A estrutura REAL do steamid.uk logado, do HTML que ele colou. Os nomes
// aqui são inventados de propósito: o que estou a testar é o DESENHO da
// página, e o histórico de uma pessoa real não tem que viver no repositório.
const { lerSteamidUk } = require('../src/nomes-pagina');

const ukAno = (ano, quantos) => `<div class="row mt-3 mb-2"><strong>` +
  `<span class="badge bg-secondary me-1">${ano} </span>` +
  `<span class="badge bg-info">${quantos}</span></strong></div>`;
const ukTitulo = (t) => `<div class="row mt-3 mb-2"><strong>` +
  `<span class="badge bg-secondary me-1">${t} </span></strong></div>`;
const ukNome = (n, quando) => `<span class="namehistory-name-badge badge bg-secondary m-1">` +
  `<a style="color: var(--si-accent);" href="/advanced_player_search.php?playername=${encodeURIComponent(n)}">${n}</a>` +
  `<br><small style="color: var(--si-text-muted); font-size: 0.75rem;">${quando}</small></span>`;

const paginaUk = () => parseHTML(`<html><head><title>SteamID.uk</title></head><body>
  <div class="card">
    <div class="card-header"><h5 class="mb-0 d-inline">Previous Persona Names</h5>
      <span class="ms-2">Currently showing all gamer persona history</span></div>
    <div class="card-body"><div class="container-fluid"><ul class="list-group">
    <div class="row"><div class="col-sm-12"><div class="namehistory-names">
      ${ukAno(2026, 4)}
      ${ukNome('Joaozinho', '(seen) Wed, 05 Aug 2026')}
      ${ukNome('Recruta', 'Thu, 30 Jul 2026')}
      ${ukNome('Balloon Enjoyer', 'Thu, 02 Jul 2026')}
      ${ukNome('( ͡° ͜ʖ ͡°)', 'Wed, 02 Jul 2026')}
      ${ukAno(2015, 2)}
      ${ukNome('Joaozinho', 'Fri, 22 May 2015')}
      ${ukNome('o futuro matador de gringo', 'Sun, 03 May 2015')}
      ${ukTitulo('First name seen by SteamID')}
      ${ukNome('Trynitythegod', '')}
      ${ukTitulo('Unknown')}
      ${ukNome('Recrutáxi', '')}
    </div></div></div>
    </ul></div></div>
  </div>
  <div class="card"><div class="card-header"><h5>Steam Level History</h5></div>
    <div class="card-body">Biggest Jump +21 <small>(2019-07-16)</small></div></div>
  </body></html>`).document;

test('lê a estrutura real do steamid.uk pelas classes, não por parecença', () => {
  const r = lerNomesDaPagina(paginaUk());
  assert.equal(r.comoAchei, 'steamid.uk (namehistory-names)');
  assert.equal(r.nomes.length, 8);
  assert.equal(r.total, 6, 'o total soma as contagens dos anos');
  // Nome com espaço, com acento e com kaomoji tem de sair inteiro.
  assert.ok(r.nomes.some((n) => n.nome === 'Balloon Enjoyer'));
  assert.ok(r.nomes.some((n) => n.nome === 'o futuro matador de gringo'));
  assert.ok(r.nomes.some((n) => n.nome === '( ͡° ͜ʖ ͡°)'));
});

// Eu andei a escrever "a página dá o ano, não o dia". Estava a descrever o
// site DESLOGADO. Logado, a data é completa.
test('logado, a data é o dia — não o ano', () => {
  const r = lerNomesDaPagina(paginaUk());
  const j = r.nomes.find((n) => n.nome === 'Joaozinho');
  assert.equal(j.em, '05 Aug 2026', 'sem "(seen)" e sem o dia da semana');
  assert.equal(j.precisao, 'dia');
  assert.equal(j.visto, true, '"(seen)" = o site viu o perfil com este nome');
  assert.equal(r.nomes.find((n) => n.nome === 'Recruta').visto, undefined);
});

// Estas duas secções não têm ano. Deitá-las fora perdia justamente o nome
// mais antigo da conta.
test('"First name seen by SteamID" e "Unknown" entram marcados, não descartados', () => {
  const r = lerNomesDaPagina(paginaUk());
  const t = r.nomes.find((n) => n.nome === 'Trynitythegod');
  assert.equal(t.secao, 'primeiro-nome', 'a própria página diz que é o mais antigo');
  assert.equal(t.em, null, 'e não inventa data para ele');
  assert.equal(r.nomes.find((n) => n.nome === 'Recrutáxi').secao, 'sem-data');
  assert.equal(r.precisao, 'mista', 'uns com dia, dois sem data — não prometo "dia"');
});

// A página tem outras tabelas com datas: níveis da Steam, contas com o mesmo
// nome. O caminho genérico podia apanhá-las; o preciso não olha para elas.
test('não apanha as outras tabelas da mesma página', () => {
  const r = lerNomesDaPagina(paginaUk());
  for (const n of r.nomes) {
    assert.ok(!/Biggest Jump|Steam Level|2019-07-16/.test(n.nome), `"${n.nome}" é de outra secção`);
  }
});

test('sem a estrutura do steamid.uk, o leitor preciso sai de cena', () => {
  assert.equal(lerSteamidUk(paginaHistorico(LINHAS), (el) => (el?.textContent || '').trim()), null);
});

// O título do steamhistory traz DOIS números entre parênteses:
//   "Historic Persona for 123 (76561198155380495) (123)"
// O primeiro é o SteamID, o segundo é o total. Ficar pelo primeiro dava um
// total impróprio — e pior: 17 dígitos não cabem num inteiro seguro do
// JavaScript, então na tela dele apareceu "a página diz 76561198155380500".
// Repara no fim: o SteamID acaba em 495. O 500 era invenção do Number().
test('o total é o parêntese certo, não o SteamID do título', () => {
  const linhas = Array.from({ length: 5 }, (_, i) =>
    `<tr><td>nome${i}</td><td>1${i}/05/2024, 01:00:00</td></tr>`).join('');
  const doc = parseHTML(`<html><body>
    <h2>Historic Persona for 123 (76561198155380495) (123)</h2>
    <table><tbody>${linhas}</tbody></table></body></html>`).document;
  assert.equal(lerNomesDaPagina(doc).total, 123);
});

test('sem um parêntese plausível, o total fica vazio em vez de errado', () => {
  const linhas = Array.from({ length: 5 }, (_, i) =>
    `<tr><td>nome${i}</td><td>1${i}/05/2024, 01:00:00</td></tr>`).join('');
  for (const titulo of [
    'Persona History (76561198155380495)',   // só o SteamID
    'Persona History (999999999)',           // grande de mais para ser nomes
  ]) {
    const doc = parseHTML(`<html><body><h2>${titulo}</h2>
      <table><tbody>${linhas}</tbody></table></body></html>`).document;
    assert.equal(lerNomesDaPagina(doc).total, null, titulo);
  }
});

test('separador de milhar no total continua a ser lido', () => {
  const linhas = Array.from({ length: 5 }, (_, i) =>
    `<tr><td>nome${i}</td><td>1${i}/05/2024, 01:00:00</td></tr>`).join('');
  const doc = parseHTML(`<html><body><h2>Persona History (1,234)</h2>
    <table><tbody>${linhas}</tbody></table></body></html>`).document;
  assert.equal(lerNomesDaPagina(doc).total, 1234);
});

// O caminho de recurso corre quando o leitor preciso desiste (menos de 3
// nomes) — ou seja, justamente nas contas pequenas. Faltava-lhe o formato de
// data da página LOGADA, e a data ia parar à coluna dos nomes, como se alguém
// se chamasse "05 Aug 2026".
test('a data do steamid.uk logado não vira nome no caminho de recurso', () => {
  const doc = parseHTML(`<html><body>
    <div class="card"><h3>Previous Persona Names</h3>
      <div class="bloco">
        <div class="y">2026</div><div class="c">2</div>
        <div>Klaus</div><div>(seen) Wed, 05 Aug 2026</div>
        <div>zeca</div><div>(seen) Mon, 03 Feb 2026</div>
        <div class="y">2025</div><div class="c">2</div>
        <div>Bolt</div><div>Sat, 14 Sep 2025</div>
        <div>MangaVerde</div><div>05 Jun 2025</div>
      </div>
    </div></body></html>`).document;
  const r = lerNomesDaPagina(doc);
  const nomes = r.nomes.map((n) => n.nome);
  assert.deepEqual(nomes, ['Klaus', 'zeca', 'Bolt', 'MangaVerde']);
  for (const n of nomes) {
    assert.doesNotMatch(n, /\d{4}/, `"${n}" tem um ano dentro — é data, não nome`);
    assert.doesNotMatch(n, /seen/i);
  }
});

// O crachá "First name seen by SteamID" repete um nome que já está numa secção
// de ano. Empurrá-lo outra vez anunciava mais um nome do que a página tem, e
// dava "usou 2×" a um nome que a página mostra uma vez só.
test('o crachá de resumo marca o nome que já existe, não acrescenta outro', () => {
  // O caso real do HTML dele: "Trynitythegod" está na secção de 2015 COM data,
  // e outra vez no fim sob "First name seen by SteamID", sem data.
  const doc = parseHTML(`<html><body><div class="namehistory-names">
    ${ukAno(2026, 2)}
    ${ukNome('Joaozinho', '(seen) Wed, 05 Aug 2026')}
    ${ukNome('Recruta', 'Thu, 30 Jul 2026')}
    ${ukAno(2015, 2)}
    ${ukNome('Trynitythegod', 'Fri, 08 May 2015')}
    ${ukNome('Fefeufumafuma', 'Thu, 29 Jan 2015')}
    ${ukTitulo('First name seen by SteamID')}
    ${ukNome('Trynitythegod', '')}
    ${ukTitulo('Unknown')}
    ${ukNome('Recrutáxi', '')}
  </div></body></html>`).document;
  const r = lerNomesDaPagina(doc);

  const trynity = r.nomes.filter((n) => /^Trynitythegod$/i.test(n.nome));
  assert.equal(trynity.length, 1, 'uma entrada só, não duas');
  assert.equal(trynity[0].secao, 'primeiro-nome', 'mas guarda a marca');
  assert.equal(trynity[0].em, '08 May 2015', 'e mantém a data que a página lhe deu');
  assert.equal(r.nomes.length, 5, '4 nomes datados + o "Unknown"');
});

// Mas quando o crachá traz um nome que não está em lado nenhum, ele ENTRA:
// é a única forma de o ver, e deitá-lo fora perdia o nome mais antigo.
test('o crachá de resumo com nome novo continua a entrar', () => {
  const r = lerNomesDaPagina(paginaUk());
  const t = r.nomes.filter((n) => n.nome === 'Trynitythegod');
  assert.equal(t.length, 1);
  assert.equal(t[0].secao, 'primeiro-nome');
  assert.equal(t[0].em, null, 'sem data, porque a página não lhe deu nenhuma');
});

// A CLI escrevia "uns com o dia, outros com o ano" mesmo quando nenhum nome
// tinha só o ano — os sem-dia eram as secções do fim, sem data nenhuma.
test('conta os três casos em separado, para a saída poder dizer a verdade', () => {
  const r = lerNomesDaPagina(paginaUk());
  assert.equal(r.comData + r.soAno + r.semData, r.nomes.length);
  assert.equal(r.soAno, 0, 'nesta página nenhum nome tem SÓ o ano');
  assert.ok(r.semData >= 1, 'mas há pelo menos um sem data nenhuma');
});

// O ano e a contagem vivem em dois crachás separados. Ler o texto da linha
// inteira só funciona porque o site põe espaço entre eles — sem espaço,
// "2026" e "30" colam-se em "202630" e o total fica NULO, sem um erro.
//
// E um total nulo não é um detalhe: é o `incompleto()` a deixar de disparar e
// a saída a voltar a dizer "é o 1º nome da conta" sobre meia lista. Uma
// minificação do lado deles bastaria para isso acontecer sozinho.
test('o total do ano sai mesmo com o HTML colado, sem espaços', () => {
  const semEspaco = parseHTML(`<html><body><div class="namehistory-names">`
    + `<div class="row"><strong><span class="badge">2026</span></strong>`
    + `<strong><span class="badge">30</span></strong></div>`
    + ukNome('Capitao', '(seen) Wed, 05 Aug 2026')
    + ukNome('C4pitaoTV', 'Mon, 14 Jul 2026')
    + `<div class="row"><strong><span class="badge">2025</span></strong>`
    + `<strong><span class="badge">30</span></strong></div>`
    + ukNome('Melancia', 'Sun, 06 Dec 2025')
    + `</div></body></html>`).document;
  const r = lerNomesDaPagina(semEspaco);
  assert.equal(r.total, 60, 'a página anuncia 30+30 mesmo sem espaço entre os crachás');
  assert.equal(r.nomes.length, 3);
  assert.equal(r.nomes[0].em, '05 Aug 2026', 'e o ano continua a aplicar-se aos nomes');
});
