'use strict';
/**
 * O IP e a porta de um servidor, lidos da página onde eles estão escritos.
 *
 * "Com a API do BattleMetrics não dá para ver servidor dos outros, tem que
 *  acessar de forma normal igual player."
 *
 * A consulta A2S precisa de `IP:porta`, e isso obriga alguém a ir buscá-lo à
 * mão. Um passo manual num sítio onde o programa já sabe o que quer é um
 * passo a mais — por isso o `--bm <id>` abre a página como um browser normal
 * e tira o endereço de lá.
 *
 * A leitura é do TEXTO da página e não de um elemento com nome: um sítio
 * qualquer muda de HTML a cada semestre, e um IPv4 seguido de dois pontos e
 * de uma porta continua a ser a mesma coisa daqui a cinco anos.
 */

// As portas do Rust: a de jogo é quase sempre 28015, e o BattleMetrics mostra
// também a de consulta. Aceita-se qualquer uma — o `consultarEsperto` tenta a
// vizinhança à volta do que lhe derem.
const ENDERECO = /\b((?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})\b/g;

const valido = (ip, porta) => ip.split('.').every((n) => Number(n) <= 255)
  && Number(porta) > 0 && Number(porta) <= 65535
  // 0.0.0.0 e 127.x aparecem em exemplos e em texto de ajuda, nunca num
  // servidor a sério.
  && !ip.startsWith('127.') && ip !== '0.0.0.0';

/**
 * @param {string} texto o texto visível da página
 * @returns {{ip:string, porta:number}|null}
 */
function enderecoDaPagina(texto) {
  const vistos = [];
  for (const m of String(texto || '').matchAll(ENDERECO)) {
    if (!valido(m[1], m[2])) continue;
    vistos.push({ ip: m[1], porta: Number(m[2]) });
  }
  if (!vistos.length) return null;
  // O primeiro que apareça com a porta de jogo ganha; senão, o primeiro de
  // todos. Numa página do BattleMetrics o endereço de ligação vem antes do
  // resto, mas a porta é o sinal mais forte dos dois.
  return vistos.find((v) => v.porta === 28015) || vistos[0];
}

module.exports = { enderecoDaPagina };
