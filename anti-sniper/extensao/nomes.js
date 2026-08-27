'use strict';
// GERADO por extensao/construir.js — NÃO EDITE À MÃO.
// Fonte: src/unicode.js e src/nomes.js. Se editar aqui, o navegador passa a
// usar uma regra diferente da que os testes verificam.
(function (raiz) {

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

/** Letras soltas SEGURAS: versalete e fonética. Estas nunca aparecem num
 *  alfabeto real — quem as usa está enfeitando o próprio nome latino. */
const SOLTAS = {
  'ᴀ':'a','ʙ':'b','ᴄ':'c','ᴅ':'d','ᴇ':'e','ꜰ':'f','ɢ':'g','ʜ':'h','ɪ':'i',
  'ᴊ':'j','ᴋ':'k','ʟ':'l','ᴍ':'m','ɴ':'n','ᴏ':'o','ᴘ':'p','ǫ':'q','ʀ':'r',
  'ꜱ':'s','ᴛ':'t','ᴜ':'u','ᴠ':'v','ᴡ':'w','x':'x','ʏ':'y','ᴢ':'z',
  'ʟ':'l','ɐ':'a','ǝ':'e','ɹ':'r','ʇ':'t','ʞ':'k',
};

/**
 * Cirílico e grego que se parecem com latino.
 *
 * ⚠️ SEPARADO de propósito, e NÃO faz parte de `dobrar`. Aplicar sempre
 * destrói nome russo legítimo: `Опасный Поцык` — um jogador real — virava
 * `опachыйпoцыk`, e `Е.В.П.А.Т.И.Й` virava string vazia.
 *
 * Só use quando o cirílico for MINORIA na string. Aí sim é letra latina
 * disfarçada, como em `ѕniрer`, que é o caso que importa detectar.
 */
const DISFARCE_CIRILICO = {
  'а':'a','в':'b','с':'c','е':'e','н':'h','к':'k','м':'m','о':'o','р':'p',
  'т':'t','у':'y','х':'x','і':'i','ѕ':'s','ј':'j',
  'α':'a','β':'b','ε':'e','ι':'i','κ':'k','ν':'v','ο':'o','ρ':'p','τ':'t',
  'υ':'u','χ':'x','ѵ':'v',
};

/** Desfaz o disfarce. Só chame quando souber que é disfarce. */
function desdisfarcar(s) {
  if (typeof s !== 'string') return '';
  let out = '';
  for (const ch of s) out += DISFARCE_CIRILICO[ch] ?? ch;
  return out;
}

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



/**
 * Cruzamento de nome: jogador no servidor  <->  espectador no chat.
 *
 * Isto tem que rodar AO VIVO, no instante. Stream sniper se pega no ato:
 * relatório de terça passada não serve para nada, porque quando o relatório
 * fica pronto a base já foi raidada.
 *
 * O problema é que ninguém usa o mesmo nome exato nos dois lugares. A pessoa
 * é `xX_Ma7ador_Xx` no Rust e `matador` na Twitch. Comparar string crua acha
 * quase nada; comparar frouxo demais acusa inocente. O meio-termo é
 * normalizar em camadas e devolver CONFIANÇA, nunca um veredito.
 */

/** Decoração que gente põe no nome e que não carrega identidade nenhuma. */

const TAG_CLA = /^[\[\(\{<|][^\]\)\}>|]{1,6}[\]\)\}>|]\s*/;
const SO_DECORACAO = /[ -㌀\uD83C-􏰀-\uDFFF←-⇿☀-➿]/g;

/** Leet comum. Cuidado: `l`->`i` é agressivo e cria colisão, então fica de
 *  fora do passe conservador e só entra no agressivo. */
const LEET_SEGURO = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const LEET_AGRESSIVO = { ...LEET_SEGURO, '1': 'i', 'l': 'i', '|': 'i', '8': 'b', '6': 'g', '9': 'g' };

function tirarAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Quanto da string é cirílico de verdade. Decide se as letras cirílicas
 *  são um nome russo legítimo ou latinas disfarçadas. */
function fracaoCirilica(s) {
  const letras = s.replace(/[^\p{L}]/gu, '');
  if (!letras) return 0;
  const cir = letras.replace(/[^\u0400-\u04FF\u0500-\u052F]/g, '');
  return cir.length / letras.length;
}

function limpar(s) {
  return s
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/^(x+)(.+?)\1$/u, '$2')
    .replace(/(.)\1{2,}/gu, '$1$1')
    .replace(/^(ttv|twitch|yt|youtube|kick)/u, '')
    .replace(/(ttv|tv|twitch|yt|youtube|kick|live|stream)$/u, '');
}

function normalizar(nome, { agressivo = false } = {}) {
  if (typeof nome !== 'string') return '';
  let s = dobrar(nome).trim();

  // Tag de clã: além de [BR] Fulano, existe "MF | Dr | Merfy" e "CL/Nome".
  // O nome é o ÚLTIMO pedaço, e é ele que a pessoa usa. Nomes reais do
  // painel dele quebraram a versão que só tratava colchete.
  s = s.replace(TAG_CLA, '');
  const pedacos = s.split(/\s*[|\/]\s*/u).filter((x) => x.trim());
  if (pedacos.length > 1) s = pedacos[pedacos.length - 1];

  s = s.replace(SO_DECORACAO, '');

  // ⚠️ Cirílico só é dobrado para latino quando é MINORIA na string —
  // aí sim é letra latina disfarçada, como em `ѕniрer`. Quando a string é
  // majoritariamente cirílica, é um nome russo de verdade: dobrar destrói.
  // `Опасный Поцык` virava `achok` e `Е.В.П.А.Т.И.Й` virava string VAZIA.
  const russoDeVerdade = fracaoCirilica(s) > 0.4;
  if (!russoDeVerdade) s = tirarAcento(desdisfarcar(s)).toLowerCase();
  else s = s.toLowerCase();

  // Leet só faz sentido onde há letras. Um nome só de dígitos, como `322`,
  // não é leet de nada — convertê-lo produzia `e22`.
  const temLetra = /\p{L}/u.test(s);
  if (temLetra && !russoDeVerdade) {
    const mapa = agressivo ? LEET_AGRESSIVO : LEET_SEGURO;
    s = s.replace(/./gu, (c) => mapa[c] ?? c);
  }

  const limpo = limpar(s);
  // Nunca devolver vazio quando havia conteúdo: sem isto o nome some e o
  // cruzamento diz "sem semelhança" quando na verdade não olhou nada.
  if (limpo) return limpo;
  const cru = dobrar(nome).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return cru;
}

/** Levenshtein com corte: se já passou do limite, para. Numa live isto roda
 *  contra centenas de pares a cada poucos segundos, então importa. */
function distancia(a, b, limite = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let melhorNaLinha = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + custo);
      if (atual[j] < melhorNaLinha) melhorNaLinha = atual[j];
    }
    if (melhorNaLinha > limite) return limite + 1;
    ant = atual;
  }
  return ant[b.length];
}

/**
 * Compara um nome do jogo com um do chat.
 * @returns {{confianca:number, motivo:string}} confiança de 0 a 1
 */
function comparar(nomeJogo, nomeChat) {
  const a = normalizar(nomeJogo);
  const b = normalizar(nomeChat);
  if (!a || !b) return { confianca: 0, motivo: 'nome vazio depois de normalizar' };

  if (a === b) return { confianca: 1.0, motivo: 'idêntico após normalizar' };

  const ag = normalizar(nomeJogo, { agressivo: true });
  const bg = normalizar(nomeChat, { agressivo: true });
  if (ag === bg) return { confianca: 0.90, motivo: 'idêntico tratando leet' };

  // Nome curto demais é armadilha: "ana" dentro de "banana" não é sinal.
  // Mas exigir 5 letras cortava `arin`, que é nome real. A regra certa não
  // é tamanho absoluto: é QUANTO do nome maior o menor ocupa.
  //   "arin" em "arintv"  -> 4/6 = 67%  ✓ mesma pessoa
  //   "ana"  em "banana"  -> 3/6 = 50%  ✗ coincidência
  const curto = Math.min(a.length, b.length);
  const longo = Math.max(a.length, b.length);
  if (curto >= 4 && curto / longo >= 0.6 && (a.includes(b) || b.includes(a))) {
    return { confianca: 0.75, motivo: 'um contém o outro' };
  }

  if (curto >= 5) {
    const d = distancia(a, b, 2);
    if (d === 1) return { confianca: 0.70, motivo: '1 caractere de diferença' };
    if (d === 2 && curto >= 7) return { confianca: 0.55, motivo: '2 caracteres de diferença' };
  }
  return { confianca: 0, motivo: 'sem semelhança' };
}

/**
 * Cruza a lista do servidor com a do chat, agora.
 * @param {Array<{nome:string,steamid?:string}>} noServidor
 * @param {Array<{nome:string,id?:string}>} noChat
 * @param {number} minimo confiança mínima para aparecer
 */
function cruzar(noServidor, noChat, minimo = 0.55) {
  const achados = [];
  for (const j of noServidor || []) {
    let melhor = null;
    for (const c of noChat || []) {
      const r = comparar(j.nome, c.nome);
      if (r.confianca >= minimo && (!melhor || r.confianca > melhor.confianca)) {
        melhor = { ...r, chat: c.nome, chatId: c.id };
      }
    }
    if (melhor) {
      achados.push({
        jogo: j.nome, steamid: j.steamid,
        chat: melhor.chat, chatId: melhor.chatId,
        confianca: melhor.confianca, motivo: melhor.motivo,
      });
    }
  }
  return achados.sort((x, y) => y.confianca - x.confianca);
}

/**
 * Compara TODO o histórico de nomes de um jogador contra um nome de chat.
 *
 * Ninguém usa o mesmo nome na Steam e na Twitch — comparar só o nome atual
 * acha quase nada. Mas a pessoa trocou de nome muitas vezes ao longo dos
 * anos, e **basta um** desses nomes bater. É o histórico que faz o
 * cruzamento funcionar; o nome de hoje é só a linha mais recente dele.
 */
function compararHistorico(historicoDeNomes, nomeChat) {
  let melhor = { confianca: 0, motivo: 'nenhum nome do histórico bate', nomeUsado: null };
  for (const antigo of historicoDeNomes || []) {
    const r = comparar(antigo, nomeChat);
    if (r.confianca > melhor.confianca) {
      melhor = { ...r, nomeUsado: antigo };
    }
  }
  return melhor;
}


raiz.Nomes = { normalizar, comparar, compararHistorico, dobrar, desdisfarcar };
})(globalThis.Detetive = globalThis.Detetive || {});
