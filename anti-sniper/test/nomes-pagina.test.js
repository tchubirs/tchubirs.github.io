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
