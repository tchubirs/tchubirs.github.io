#!/usr/bin/env node
'use strict';
/**
 * Gera extensao/nomes.js a partir de src/unicode.js + src/nomes.js.
 *
 * Existe para impedir a pior falha possível neste projeto: ter DUAS versões
 * do cruzamento de nomes, uma no Node e outra no navegador, que aos poucos
 * se desencontram. Os testes rodam sobre a do Node; se a do navegador for
 * outra, os testes deixam de significar qualquer coisa — e ninguém percebe.
 *
 * Rode depois de mexer em src/nomes.js ou src/unicode.js:  node extensao/construir.js
 */
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const limpar = (arquivo) => fs.readFileSync(path.join(raiz, 'src', arquivo), 'utf8')
  .replace(/^'use strict';\s*$/m, '')
  .replace(/^const .*= require\(.*\);\s*$/gm, '')
  .replace(/^module\.exports\s*=[\s\S]*?;\s*$/gm, '');

const saida = `'use strict';
// GERADO por extensao/construir.js — NÃO EDITE À MÃO.
// Fonte: src/unicode.js e src/nomes.js. Se editar aqui, o navegador passa a
// usar uma regra diferente da que os testes verificam.
(function (raiz) {
${limpar('unicode.js')}
${limpar('nomes.js')}
raiz.Nomes = { normalizar, comparar, compararHistorico, dobrar, desdisfarcar };
})(globalThis.Detetive = globalThis.Detetive || {});
`;

const destino = path.join(__dirname, 'nomes.js');
fs.writeFileSync(destino, saida);
console.log(`gerado ${path.relative(raiz, destino)} — ${saida.split('\n').length} linhas`);
