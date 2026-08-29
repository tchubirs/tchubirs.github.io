'use strict';
/**
 * O que a API do steamid.uk dá de facto — medido, não suposto.
 *
 * Ele apertou-me com a pergunta certa: *"se você não conseguir fazer isso com
 * a api você não vai conseguir ter permissão premium"*. Tinha razão em
 * apertar. Eu tinha escrito no código que "os nomes não saem por API" com base
 * numa chamada que estava MAL FEITA — eu passava o SteamID do alvo em `myid`,
 * quando `myid` é o dono da chave. A resposta era um erro de autenticação e eu
 * li-a como "a API não tem isso". Palpite com ar de facto.
 *
 * Medido em 29/08/2026, com a chave dele e o plano Silver activo:
 *
 *     auth.patreon = 1        o plano está mesmo activo
 *     convert.php             1.000.000 chamadas/dia
 *     steamid.php             1.000 chamadas/dia
 *     namehistory_count.php   150 chamadas/dia
 *
 * E o que `steamid.php` devolve, para um alvo:
 *
 *     name_history_count        343
 *     name_history_count_year   [{year:"2016",count:"30"}, {year:"2015",count:"7"}, …]
 *     steamid_optout            0 ou 1
 *     friend_history_count, url_changes, bans…
 *
 * Testei quinze parâmetros à procura da LISTA de nomes — names=1, full=1,
 * expand=names, include=names… A resposta não muda um byte. Então fica dito
 * com todas as letras, e desta vez com a chave a autenticar: **a API dá a
 * CONTAGEM, nunca os nomes.** A lista só existe na página.
 *
 * Mas a contagem não é prémio de consolação. Dá duas coisas que a página não
 * dá de graça:
 *
 *   1. `steamid_optout` — saber ANTES de abrir o navegador que esta conta pediu
 *      remoção e que nem o login a mostra. Poupa quatro minutos de espera por
 *      uma coisa que nunca ia aparecer.
 *   2. O total verdadeiro — para dizer "li 100 de 343" mesmo quando a página
 *      não anuncia nada. É o `incompleto()` a ganhar uma fonte que não depende
 *      do HTML de ninguém.
 */

const BASE = 'https://steamidapi.uk/v2';

/**
 * O que a API sabe sobre uma conta.
 *
 * @param {string} id SteamID64 do ALVO
 * @param {{chave:string, meuId:string, buscar?:Function}} op
 *        `meuId` é o SteamID de QUEM PAGA a chave, não o do alvo. Trocar os
 *        dois devolve `errorid 3`, que é o erro que me enganou.
 * @returns {Promise<object|null>} null quando não deu — e null é "não
 *          perguntei", nunca "não existe".
 */
async function perfil(id, { chave, meuId, buscar = globalThis.fetch } = {}) {
  if (!id || !chave || !meuId) return null;
  const url = `${BASE}/steamid.php?apikey=${encodeURIComponent(chave)}`
    + `&myid=${encodeURIComponent(meuId)}&input=${encodeURIComponent(id)}`;

  let j = null;
  try {
    const r = await buscar(url);
    j = await r.json();
  } catch { return null; }
  if (!j || j.error || j.auth?.auth !== 'ok') return null;

  const d = j.steamid_data || {};
  const anos = Array.isArray(j.name_history_count_year) ? j.name_history_count_year : [];
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

  return {
    // A API escreve tudo como texto ("343", "0"). Deixar assim faria `"0"` ser
    // verdadeiro num `if`, e uma conta invisível passaria por visível.
    total: num(d.name_history_count),
    optout: d.steamid_optout === '1' || d.steamid_optout === 1,
    porAno: anos.map((a) => ({ ano: String(a.year), quantos: num(a.count) || 0 }))
      .filter((a) => /^\d{4}$/.test(a.ano)),
    urlsTrocadas: num(d.url_changes),
    amigosJaTidos: num(d.friend_history_count),
    amigosBanidos: num(d.vac_banned_friends),
    plano: j.auth?.patreon === '1' ? 'silver' : 'grátis',
    restam: num(j.auth?.daily_limit) != null && num(j.auth?.daily_count) != null
      ? num(j.auth.daily_limit) - num(j.auth.daily_count) : null,
  };
}

module.exports = { perfil, BASE };
