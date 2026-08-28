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
