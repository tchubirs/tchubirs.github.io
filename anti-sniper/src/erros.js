'use strict';
/**
 * Separar "não há nada" de "não consegui perguntar".
 *
 * Esta distinção custou-lhe uma corrida inteira. As três contas saíram assim:
 *
 *     steamid.uk         — nada
 *     steamhistory.net   — nada
 *
 * e a leitura óbvia é "estas contas não têm histórico". Não era: a janela do
 * navegador tinha desaparecido a meio, e a partir daí todo o `goto` e todo o
 * `evaluate` rebentam. Eu apanhava a excepção, seguia em frente calado, e
 * escrevia "nada" — a mesma palavra para o vazio e para a cegueira.
 *
 * É o mesmo erro que eu já tinha corrigido para o Cloudflare, noutro sítio.
 * Um muro à porta não é uma casa vazia.
 */

/** As frases com que o Playwright diz "a página/navegador já não existe". */
const MORTA = /Target (page|closed)|Target page, context or browser has been closed|has been closed|Browser closed|Session closed|Protocol error.*Target closed|browserContext\.close|Execution context was destroyed/i;

/**
 * @param {unknown} e uma excepção, ou a sua mensagem
 * @returns {boolean} true quando o que falhou foi o navegador, não o site
 */
function janelaFoiFechada(e) {
  const m = typeof e === 'string' ? e : (e && e.message) || '';
  return MORTA.test(m);
}

/** A primeira linha do erro, curta o bastante para caber numa linha da saída. */
function resumoDoErro(e, teto = 90) {
  const m = typeof e === 'string' ? e : (e && e.message) || String(e);
  return m.split('\n')[0].slice(0, teto);
}

module.exports = { janelaFoiFechada, resumoDoErro };
