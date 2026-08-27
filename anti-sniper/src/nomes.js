'use strict';
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
const { dobrar } = require('./unicode');

const TAG_CLA = /^[\[\(\{<|][^\]\)\}>|]{1,6}[\]\)\}>|]\s*/;
const SO_DECORACAO = /[ -㌀\uD83C-􏰀-\uDFFF←-⇿☀-➿]/g;

/** Leet comum. Cuidado: `l`->`i` é agressivo e cria colisão, então fica de
 *  fora do passe conservador e só entra no agressivo. */
const LEET_SEGURO = { '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const LEET_AGRESSIVO = { ...LEET_SEGURO, '1': 'i', 'l': 'i', '|': 'i', '8': 'b', '6': 'g', '9': 'g' };

function tirarAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizar(nome, { agressivo = false } = {}) {
  if (typeof nome !== 'string') return '';
  // Dobrar ANTES de qualquer coisa. Se apagar decoração primeiro, 𝚊𝚛𝚒𝚗
  // vira string vazia em vez de virar "arin" — foi o que acontecia antes,
  // e era o pior resultado possível: não casava e não avisava.
  let s = dobrar(nome).trim();
  s = s.replace(TAG_CLA, '');          // [BR] Fulano -> Fulano
  s = s.replace(SO_DECORACAO, '');     // emoji e símbolos
  s = tirarAcento(s).toLowerCase();

  const mapa = agressivo ? LEET_AGRESSIVO : LEET_SEGURO;
  s = s.replace(/./g, (c) => mapa[c] ?? c);

  s = s.replace(/[^a-z0-9]/g, '');     // sobra só letra e número
  // xX_nome_Xx e nomeee -> nome. Repetição é enfeite, não identidade.
  s = s.replace(/^(x+)(.+?)\1$/, '$2');
  s = s.replace(/(.)\1{2,}/g, '$1$1');
  // Sufixo e prefixo de divulgação: gente põe o canal no nome do jogo o
  // tempo todo. `arin_tv` e `arin` são a mesma pessoa, e sem tirar isto a
  // comparação falha justamente no caso mais comum.
  s = s.replace(/^(ttv|twitch|yt|youtube|kick)/, '');
  s = s.replace(/(ttv|tv|twitch|yt|youtube|kick|live|stream)$/, '');
  return s;
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

module.exports = { normalizar, distancia, comparar, compararHistorico, cruzar };
