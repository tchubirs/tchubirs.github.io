'use strict';
/**
 * Dobra letra disfarçada de volta para o alfabeto normal.
 *
 * Isto não é caso de laboratório. O histórico real da Steam de um artista
 * de skin tinha estes quatro nomes, que são o MESMO nome:
 *
 *     arin      🇦 🇷 🇮 🇳      ᴀʀɪɴ      𝚊𝚛𝚒𝚗
 *
 * Para um humano é óbvio. Para um comparador de string são quatro coisas
 * sem nada em comum. E quem quer esconder o nome usa exatamente isso.
 *
 * O normalizador anterior apagava esses caracteres como se fossem enfeite,
 * e sobrava string vazia — ou seja, o pior resultado possível: não casava e
 * não avisava que não tinha casado.
 */

/** Blocos que são o alfabeto latino repetido em outra roupa. Cada faixa
 *  mapeia posição a posição para a-z ou A-Z. */
const FAIXAS = [
  // Matemáticos: negrito, itálico, script, fraktur, monoespaçado, etc.
  [0x1d400, 0x1d419, 'A'], [0x1d41a, 0x1d433, 'a'],
  [0x1d434, 0x1d44d, 'A'], [0x1d44e, 0x1d467, 'a'],
  [0x1d468, 0x1d481, 'A'], [0x1d482, 0x1d49b, 'a'],
  [0x1d49c, 0x1d4b5, 'A'], [0x1d4b6, 0x1d4cf, 'a'],
  [0x1d4d0, 0x1d4e9, 'A'], [0x1d4ea, 0x1d503, 'a'],
  [0x1d504, 0x1d51d, 'A'], [0x1d51e, 0x1d537, 'a'],
  [0x1d538, 0x1d551, 'A'], [0x1d552, 0x1d56b, 'a'],
  [0x1d56c, 0x1d585, 'A'], [0x1d586, 0x1d59f, 'a'],
  [0x1d5a0, 0x1d5b9, 'A'], [0x1d5ba, 0x1d5d3, 'a'],
  [0x1d5d4, 0x1d5ed, 'A'], [0x1d5ee, 0x1d607, 'a'],
  [0x1d608, 0x1d621, 'A'], [0x1d622, 0x1d63b, 'a'],
  [0x1d63c, 0x1d655, 'A'], [0x1d656, 0x1d66f, 'a'],
  [0x1d670, 0x1d689, 'A'], [0x1d68a, 0x1d6a3, 'a'],
  // Largura inteira
  [0xff21, 0xff3a, 'A'], [0xff41, 0xff5a, 'a'], [0xff10, 0xff19, '0'],
  // Dígitos matemáticos
  [0x1d7ce, 0x1d7d7, '0'], [0x1d7d8, 0x1d7e1, '0'], [0x1d7e2, 0x1d7eb, '0'],
  [0x1d7ec, 0x1d7f5, '0'], [0x1d7f6, 0x1d7ff, '0'],
  // Cercados
  [0x24b6, 0x24cf, 'A'], [0x24d0, 0x24e9, 'a'],
  // Bandeiras: 🇦 a 🇿 são as letras A-Z
  [0x1f1e6, 0x1f1ff, 'A'],
];

/** Letras soltas que não formam faixa contínua: versalete, fonética,
 *  cirílico e grego que se parecem com latino. */
const SOLTAS = {
  'ᴀ':'a','ʙ':'b','ᴄ':'c','ᴅ':'d','ᴇ':'e','ꜰ':'f','ɢ':'g','ʜ':'h','ɪ':'i',
  'ᴊ':'j','ᴋ':'k','ʟ':'l','ᴍ':'m','ɴ':'n','ᴏ':'o','ᴘ':'p','ǫ':'q','ʀ':'r',
  'ꜱ':'s','ᴛ':'t','ᴜ':'u','ᴠ':'v','ᴡ':'w','x':'x','ʏ':'y','ᴢ':'z',
  'а':'a','в':'b','с':'c','е':'e','н':'h','к':'k','м':'m','о':'o','р':'p',
  'т':'t','у':'y','х':'x','і':'i','ѕ':'s','ј':'j',
  'α':'a','β':'b','ε':'e','ι':'i','κ':'k','ν':'v','ο':'o','ρ':'p','τ':'t',
  'υ':'u','χ':'x','ѵ':'v','ʟ':'l','ɐ':'a','ǝ':'e','ɹ':'r','ʇ':'t','ʞ':'k',
};

function dobrarCaractere(ch) {
  if (SOLTAS[ch]) return SOLTAS[ch];
  const cp = ch.codePointAt(0);
  for (const [ini, fim, base] of FAIXAS) {
    if (cp >= ini && cp <= fim) {
      return String.fromCharCode(base.charCodeAt(0) + (cp - ini));
    }
  }
  return ch;
}

/** Dobra a string inteira. Itera por ponto de código, não por índice —
 *  os matemáticos são pares substitutos e `s[i]` os partiria ao meio. */
function dobrar(s) {
  if (typeof s !== 'string') return '';
  let out = '';
  for (const ch of s) out += dobrarCaractere(ch);
  return out;
}

module.exports = { dobrar, dobrarCaractere };
