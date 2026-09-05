#!/usr/bin/env node
'use strict';
/**
 * Gera peekrust/anti-sniper.mjs: um arquivo único, sem dependências, para
 * copiar direto para dentro do PeekRust.
 *
 * Existe por dois motivos concretos:
 *
 *   1. O PeekRust é ESM (`import`) e o anti-sniper é CommonJS (`require`).
 *      Copiar `src/` para lá quebraria na primeira linha.
 *   2. Copiar à mão criaria uma segunda versão do cruzamento de nomes — a
 *      mesma falha que `extensao/construir.js` já existe para evitar. Os
 *      testes rodam sobre `src/`; se o PeekRust usar outra regra, os testes
 *      param de significar alguma coisa e ninguém percebe.
 *
 * Rode depois de mexer em src/ ou em peekrust/stream-check.js:
 *   node peekrust/construir.js
 */
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');

const limpar = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8')
  .replace(/^'use strict';\s*$/m, '')
  .replace(/^const .*= require\(.*\);\s*$/gm, '')
  .replace(/^module\.exports\s*=[\s\S]*?;\s*$/gm, '')
  // Único require que não é destruturação simples: no pacote, `Indice` já
  // está declarado logo acima, então basta apontar para ele.
  .replace(/^const IndicePadrao = require\(.*\)\.Indice;\s*$/m, 'const IndicePadrao = Indice;')
  .trim();

const saida = `// GERADO por peekrust/construir.js — NÃO EDITE À MÃO.
// Fonte: src/unicode.js, src/nomes.js, src/indice.js, peekrust/stream-check.js
//
// Copie este arquivo para dentro do PeekRust (ex.: services/anti-sniper.mjs).
// Não tem dependência nenhuma: Node 20+ e mais nada.
//
//   import { criarVerificador, audienciaDoServico, pedacoParaChat }
//     from './anti-sniper.mjs';

${limpar('src/unicode.js')}

${limpar('src/nomes.js')}

${limpar('src/indice.js')}

${limpar('peekrust/stream-check.js')}

export {
  criarVerificador, audienciaDoServico, pedacoParaChat, textoLongo,
  Indice, normalizar, comparar, compararHistorico, cruzar,
};
`;

const destino = path.join(__dirname, 'anti-sniper.mjs');
fs.writeFileSync(destino, saida);
console.log(`gerado ${path.relative(raiz, destino)} — ${saida.split('\n').length} linhas`);
