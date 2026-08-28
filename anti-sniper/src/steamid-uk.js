'use strict';
/**
 * A conta dele no steamid.uk — chave e SteamID, num sítio só.
 *
 * Ele apanhou uma coisa que eu não tinha verificado: todas as consultas do
 * dia saíram com `myid=76561198066116229`, que eu tinha copiado do exemplo
 * da documentação. Conferi depois: essa SteamID **é a dele** — a página de
 * API vem preenchida com a conta de quem está logado. Ou seja, estava certo
 * por acaso, não por eu ter olhado.
 *
 * Passa a vir da configuração, por dois motivos:
 *
 *   - `myid` é a identidade de QUEM PERGUNTA, e a API conta as consultas na
 *     conta dele. Um ID errado aqui gastaria a cota de outra pessoa, ou
 *     falharia com "Issue with myid" sem dizer porquê.
 *   - a chave passou pelo chat três vezes hoje. Uma chave em arquivo
 *     ignorado pelo git é menos pior que uma espalhada pelo código.
 */
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = path.join(__dirname, '..', 'detetive.config.json');

/**
 * Lê a configuração da conta.
 *
 * A variável de ambiente ganha do arquivo: é o que permite testar com outra
 * chave sem tocar na configuração dele.
 */
function conta({ caminho = CONFIG } = {}) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch { /* sem config */ }

  const chave = process.env.STEAMID_UK_CHAVE || cfg.steamidUk?.chave || '';
  const meuId = process.env.STEAMID_UK_MEUID || cfg.meuSteamId || '';

  return {
    chave,
    meuId,
    // "Ligado" é as DUAS coisas presentes. Faltar uma e tentar assim mesmo
    // devolve um erro da API que não explica qual faltou.
    ligado: Boolean(chave && meuId),
    falta: !chave && !meuId ? 'a chave e o teu SteamID'
      : !chave ? 'a chave da API'
        : !meuId ? 'o teu SteamID (meuSteamId)' : null,
  };
}

/** Onde pôr a chave, dito de uma vez, para não repetir em cada comando. */
function comoLigar() {
  return [
    'Para ligar a raridade de nomes, põe a chave em detetive.config.json:',
    '',
    '  "meuSteamId": "76561198066116229",',
    '  "steamidUk": { "chave": "SUA_CHAVE_AQUI", "ligado": true }',
    '',
    'A chave sai de https://steamid.uk/steamidapi/ (secção "Your API Key").',
    'Ou, sem tocar no arquivo:  STEAMID_UK_CHAVE=... npm run ...',
  ].join('\n');
}

module.exports = { conta, comoLigar, CONFIG };
