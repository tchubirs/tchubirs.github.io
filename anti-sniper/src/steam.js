'use strict';
/**
 * Histórico de nomes da Steam.
 *
 * Esta é a peça que faz o cruzamento funcionar, e a razão é simples:
 * **ninguém usa o mesmo nome na Steam e na Twitch.** Comparar só o nome de
 * hoje não acha quase nada.
 *
 * Mas a pessoa trocou de nome muitas vezes ao longo dos anos, e a Steam
 * guarda tudo num endereço público do próprio perfil. **Basta UM desses
 * nomes bater.** O nome de hoje é só a linha mais recente do histórico.
 *
 * Escopo, de propósito: só o perfil público da Steam. Nada de Discord,
 * Twitter, e-mail ou IP — isso é o art. 226-18 do código penal francês, e
 * além de ilegal não é necessário para responder a pergunta.
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function ehSteamId64(v) {
  return typeof v === 'string' && /^7656119\d{10}$/.test(v);
}

/**
 * @param {string} steamId64
 * @param {(url:string,op:object)=>Promise<Response>} [buscar] injetável para teste
 * @returns {Promise<{steamId:string, nomes:string[], trocas:Array<{nome:string,em:string}>}>}
 */
async function historicoDeNomes(steamId64, buscar = globalThis.fetch) {
  if (!ehSteamId64(steamId64)) {
    throw new Error(`SteamID64 inválido: ${steamId64}`);
  }
  const url = `https://steamcommunity.com/profiles/${steamId64}/ajaxaliases`;
  const r = await buscar(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);

  const bruto = await r.json();
  if (!Array.isArray(bruto)) throw new Error('resposta da Steam em formato inesperado');

  const trocas = bruto
    .filter((x) => x && typeof x.newname === 'string')
    .map((x) => ({ nome: x.newname, em: x.timechanged ?? null }));

  // Perfil privado ou sem trocas devolve lista vazia. Isso não é erro — é
  // informação: não dá para cruzar histórico de quem não tem histórico.
  return {
    steamId: steamId64,
    nomes: [...new Set(trocas.map((t) => t.nome))],
    trocas,
  };
}

module.exports = { ehSteamId64, historicoDeNomes };
