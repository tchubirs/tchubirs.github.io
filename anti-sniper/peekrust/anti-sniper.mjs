// GERADO por peekrust/construir.js — NÃO EDITE À MÃO.
// Fonte: src/unicode.js, src/nomes.js, src/indice.js, peekrust/stream-check.js
//
// Copie este arquivo para dentro do PeekRust (ex.: services/anti-sniper.mjs).
// Não tem dependência nenhuma: Node 20+ e mais nada.
//
//   import { criarVerificador, audienciaDoServico, pedacoParaChat }
//     from './anti-sniper.mjs';

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

/**
 * Índice de audiência.
 *
 * Nasceu de uma medição: um servidor de Rust tem até 1.500 jogadores, e um
 * canal acumula milhares de espectadores. Comparar todos contra todos são
 * 7,5 milhões de comparações — e cada uma normalizava as DUAS strings de
 * novo. Rodou mais de dois minutos sem terminar.
 *
 * O conserto tem duas partes:
 *   1. normalizar cada nome UMA vez, não a cada comparação;
 *   2. procurar por tabela em vez de varrer, e só cair na comparação
 *      aproximada para um punhado de candidatos plausíveis.
 */


/**
 * Quais letras a palavra tem, em 32 bits.
 *
 * Serve para dizer NÃO barato. Medido: provar que 750 nomes NÃO casam
 * custava 1.790ms, contra 6ms para os 750 que casam — porque um "não"
 * obrigava a calcular distância de edição contra ~2.000 candidatos. Um XOR
 * de dois inteiros descarta quase todos antes disso.
 *
 * É uma rejeição SEGURA, não um chute: cada edição muda o conjunto de
 * letras em no máximo 2 bits, então duas edições mudam no máximo 4. Se a
 * diferença passa de 4 bits, a distância passa de 2 — sempre.
 */
function mascara(s) {
  let m = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 97 && c <= 122) m |= 1 << (c - 97);        // a-z
    else if (c >= 48 && c <= 57) m |= 1 << 26;          // qualquer dígito
    else m |= 1 << 27;                                  // qualquer outra coisa
  }
  return m;
}

function bits(n) {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

/** Chave de balde: nomes só podem ser "quase iguais" se tiverem tamanho
 *  parecido. Agrupar por tamanho corta o espaço de busca drasticamente
 *  sem descartar nenhum par que a distância de edição aceitaria. */
function baldes(norm, folga = 2) {
  const fora = [];
  for (let d = -folga; d <= folga; d++) {
    const t = norm.length + d;
    if (t >= 3) fora.push(t);
  }
  return fora;
}

class Indice {
  /** @param {Array<{nome:string}>} pessoas */
  constructor(pessoas) {
    this.exato = new Map();      // normalizado -> [entradas]
    this.leet = new Map();       // normalizado com leet -> [entradas]
    this.porTamanho = new Map(); // comprimento -> [entradas]
    this.n = 0;

    for (const p of pessoas || []) {
      const norm = normalizar(p.nome);
      if (!norm) continue;
      const entrada = {
        ...p, norm,
        normLeet: normalizar(p.nome, { agressivo: true }),
        mascara: mascara(norm),
      };
      this.n += 1;
      for (const [mapa, chave] of [[this.exato, entrada.norm], [this.leet, entrada.normLeet]]) {
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(entrada);
      }
      const t = norm.length;
      if (!this.porTamanho.has(t)) this.porTamanho.set(t, []);
      this.porTamanho.get(t).push(entrada);
    }
  }

  /**
   * Procura o melhor casamento para um nome de jogador.
   * @returns {null|{entrada:object, confianca:number, motivo:string}}
   */
  procurar(nomeJogador, { minimo = 0.7 } = {}) {
    const a = normalizar(nomeJogador);
    if (!a) return null;

    const achado = this.exato.get(a);
    if (achado) return { entrada: achado[0], confianca: 1.0, motivo: 'idêntico após normalizar' };

    const aLeet = normalizar(nomeJogador, { agressivo: true });
    const porLeet = this.leet.get(aLeet);
    if (porLeet) return { entrada: porLeet[0], confianca: 0.90, motivo: 'idêntico tratando leet' };

    if (minimo > 0.9) return null;  // quem pede só casamento forte já terminou

    // Só agora a parte cara, e apenas contra candidatos de tamanho próximo
    // que a máscara de letras não descartou.
    const ma = mascara(a);
    let melhor = null;
    for (const t of baldes(a)) {
      for (const e of this.porTamanho.get(t) ?? []) {
        const curto = Math.min(a.length, e.norm.length);
        const longo = Math.max(a.length, e.norm.length);
        if (curto >= 4 && curto / longo >= 0.6) {
          // Para um conter o outro, o menor não pode ter letra que o maior
          // não tenha. Duas comparações de inteiro em vez de duas buscas.
          const cabe = a.length <= e.norm.length ? (ma & ~e.mascara) === 0 : (e.mascara & ~ma) === 0;
          if (cabe && (a.includes(e.norm) || e.norm.includes(a))) {
            if (!melhor || melhor.confianca < 0.75) melhor = { entrada: e, confianca: 0.75, motivo: 'um contém o outro' };
            continue;
          }
        }
        if (curto < 5) continue;
        if (bits(ma ^ e.mascara) > 4) continue;   // não há como estar a 2 edições
        const d = distancia(a, e.norm, 2);
        if (d === 1 && (!melhor || melhor.confianca < 0.70)) melhor = { entrada: e, confianca: 0.70, motivo: '1 caractere de diferença' };
        else if (d === 2 && curto >= 7 && (!melhor || melhor.confianca < 0.55)) melhor = { entrada: e, confianca: 0.55, motivo: '2 caracteres de diferença' };
      }
    }
    return melhor && melhor.confianca >= minimo ? melhor : null;
  }

  /** Cruza uma lista inteira de jogadores de uma vez. */
  cruzar(jogadores, op) {
    const fora = [];
    for (const j of jogadores || []) {
      const r = this.procurar(j.nome ?? j, op);
      if (r) fora.push({ jogador: j.nome ?? j, ...r });
    }
    return fora.sort((x, y) => y.confianca - x.confianca);
  }
}

/**
 * Acrescenta ao PeekRust a pergunta que ele ainda não responde:
 * **essa pessoa está assistindo sua live?**
 *
 * O `/peek` já diz quem o jogador é — horas de Rust, aim train, bans, nível.
 * Falta o elo com a stream, e é justamente o elo que transforma "esse cara é
 * bom" em "esse cara sabe onde você está".
 *
 * Encaixa em `player-lookup.js` como mais uma promessa no Promise.all, e em
 * `chat-formatter.js` como mais um pedaço da linha.
 *
 * O PeekRust é ESM e este arquivo é CommonJS, porque é aqui que os testes
 * rodam. O que se copia para lá é `peekrust/anti-sniper.mjs`, gerado por
 * `peekrust/construir.js` a partir DESTE arquivo — nunca há duas versões
 * escritas à mão.
 */

const IndicePadrao = Indice;
/**
 * @param {object} deps
 * @param {(id:string)=>Promise<Array<string|{name:string}>>} deps.nomesDoJogador
 *        todos os nomes já usados. No PeekRust é getPlayerNameHistory, que
 *        devolve o histórico COMPLETO das sessões do BattleMetrics — não o
 *        teto de 5 nomes que a Steam entrega.
 *        ATENÇÃO: essa função recebe o **id do BattleMetrics**, não a
 *        SteamID. O que você passar em verificar() é o que chega aqui.
 * @param {()=>Promise<Array<{nome:string,minutosAssistidos:number}>>} deps.audiencia
 * @param {Function} [deps.Indice] construtor de índice (o padrão já serve)
 */
function criarVerificador({ nomesDoJogador, audiencia, Indice = IndicePadrao, ttlMs = 5 * 60 * 1000, agora = Date.now }) {
  let cache = null;

  /** O índice da audiência é caro de montar e muda devagar. Remontar a cada
   *  /peek desperdiçaria centenas de milissegundos numa resposta que precisa
   *  caber no chat do jogo sem o jogador achar que travou. */
  async function indiceAtual() {
    if (cache && agora() - cache.em < ttlMs) return cache.idx;
    const lista = await audiencia();
    cache = { idx: new Indice(lista), em: agora() };
    return cache.idx;
  }

  return async function verificar(idDoJogador, nomeNoJogo) {
    let idx;
    // Se o serviço estiver fora do ar, o /peek continua respondendo o resto.
    // Perder a linha da live é ruim; derrubar o comando inteiro é pior.
    try { idx = await indiceAtual(); } catch { return { estado: 'indisponivel' }; }
    if (idx.n === 0) return { estado: 'sem-audiencia' };

    // O nome que aparece no jogo AGORA é o mais provável de casar, então
    // vai primeiro e evita ida à rede quando já resolve.
    if (nomeNoJogo) {
      const r = idx.procurar(nomeNoJogo);
      if (r) {
        return {
          estado: 'assistindo',
          espectador: r.entrada.nome,
          confianca: r.confianca,
          minutosAssistidos: r.entrada.minutosAssistidos ?? null,
          via: 'nome no jogo',
        };
      }
    }

    // Só então o histórico completo. Uma pessoa que trocou de nome 200 vezes
    // tem 200 chances de bater, e basta uma.
    let historico = [];
    try { historico = await nomesDoJogador(idDoJogador); } catch { historico = []; }
    for (const antigo of historico || []) {
      const nome = typeof antigo === 'string' ? antigo : antigo?.name;
      if (!nome) continue;
      const r = idx.procurar(nome);
      if (r) {
        return {
          estado: 'assistindo',
          espectador: r.entrada.nome,
          confianca: r.confianca,
          minutosAssistidos: r.entrada.minutosAssistidos ?? null,
          via: `nome antigo "${nome}"`,
        };
      }
    }

    // NUNCA "limpo". Não achar não é inocentar: quem usa nome diferente nos
    // dois lados passa batido, e dizer "limpo" viraria falsa segurança.
    const conferidos = (historico || []).length + (nomeNoJogo ? 1 : 0);
    return { estado: 'nao-encontrado', nomesConferidos: conferidos };
  };
}

/**
 * Busca a audiência no serviço do anti-sniper.
 *
 * É a função que se passa como `audiencia` — deixa o PeekRust sem nenhuma
 * dependência de banco: só uma URL.
 */
function audienciaDoServico(urlBase, canal, { buscar = globalThis.fetch, tempoLimiteMs = 4000 } = {}) {
  return async function () {
    const alvo = `${String(urlBase).replace(/\/+$/, '')}/api/audiencia?canal=${encodeURIComponent(canal)}`;
    // Sem prazo, um serviço lento vira um /peek travado no meio de um raid.
    const corte = AbortSignal.timeout ? AbortSignal.timeout(tempoLimiteMs) : undefined;
    const res = await buscar(alvo, { signal: corte });
    if (!res.ok) throw new Error(`serviço respondeu ${res.status}`);
    const dados = await res.json();
    return dados.audiencia || [];
  };
}

/**
 * Pedaço para a linha do chat do jogo.
 *
 * O `chat-formatter.js` corta em 120 caracteres, e o chat de equipe do Rust
 * é estreito — então isto precisa ser curtíssimo e legível de relance, no
 * meio de um tiroteio.
 */
function pedacoParaChat(r) {
  if (!r || r.estado === 'sem-audiencia' || r.estado === 'indisponivel') return null;
  if (r.estado === 'nao-encontrado') return 'LIVE ?';
  const h = r.minutosAssistidos != null ? `${Math.floor(r.minutosAssistidos / 60)}h` : '?';
  // "!" grita sem acusar. Quem lê entende "olha esse", não "é culpado".
  return `LIVE ${h}!`;
}

/** Versão longa, para Discord, onde há espaço para o porquê. */
function textoLongo(r) {
  if (!r || r.estado === 'sem-audiencia') return null;
  if (r.estado === 'indisponivel') {
    return '⚠️ Não consegui falar com o serviço da live agora — o resto da consulta vale, essa linha não.';
  }
  if (r.estado === 'nao-encontrado') {
    return `⚪ Nenhum dos ${r.nomesConferidos} nomes dessa conta apareceu na sua live. ` +
           'Isso **não inocenta** — pode usar nome diferente nos dois lados.';
  }
  const h = r.minutosAssistidos != null
    ? `${Math.floor(r.minutosAssistidos / 60)}h${String(r.minutosAssistidos % 60).padStart(2, '0')}`
    : 'tempo desconhecido';
  return `🔴 Esteve na sua live como **${r.espectador}** — ${h} assistidos ` +
         `(${Math.round(r.confianca * 100)}%, por ${r.via}).`;
}

export {
  criarVerificador, audienciaDoServico, pedacoParaChat, textoLongo,
  Indice, normalizar, comparar, compararHistorico, cruzar,
};
