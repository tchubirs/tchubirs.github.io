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
