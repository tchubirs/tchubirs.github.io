'use strict';
/**
 * A data de um nome, como número — e não como o site a escreveu.
 *
 * Isto era o buraco por baixo de três defeitos que a auditoria apanhou de uma
 * vez. Eu guardava em `em` o texto do ecrã, e cada fonte escreve o MESMO dia
 * de maneira diferente:
 *
 *     steamid.uk      "08 May 2015"
 *     steamhistory    "08/05/2015, 05:52:04"
 *     Steam           "May 7, 2019 @ 11:04pm"
 *
 * Consequência, com as duas fontes juntas: a chave de deduplicação era
 * `nome|em`, as duas linhas nunca batiam certo, e o mesmo evento entrava duas
 * vezes. A partir daí o sinal REPETIU dizia "usou 2×" sobre quase todos os
 * nomes — não porque a pessoa voltou ao nome, mas porque eu li a mesma coisa
 * em dois sítios. O sinal mais forte do programa a ser produzido pelo número
 * de fontes consultadas.
 *
 * Aqui o dia vira um inteiro comparável (20150508) e passa a haver UMA forma
 * de dizer cada data. Comparar, ordenar e deduplicar usam todos a mesma.
 */

const MES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** O ano, venha em que formato vier. `null` quando não há. */
function ano(o) {
  const m = String(o?.em ?? o ?? '').match(/(19[89]\d|20[0-4]\d)/);
  return m ? Number(m[1]) : null;
}

/**
 * O dia como inteiro comparável: 29 Oct 2016 → 20161029.
 *
 *   -Infinity  o nome que a página marca como o primeiro da conta
 *   AAAA0000   só o ano (a página deslogada) — o dia não existe
 *   +Infinity  sem data nenhuma: fica no fim, porque não ter data é
 *              ignorância e não antiguidade
 */
function momento(o) {
  if (o?.secao === 'primeiro-nome') return -Infinity;
  const s = String(o?.em ?? o ?? '');

  // Uma data que não pode existir não é uma data. Sem esta verificação
  // "99/99/9999" virava 99999999 e ordenava-se muito bem — depois do fim do
  // mundo, mas sem se queixar. Número plausível é pior que erro: passa.
  const feito = (aa, mm, dd) => (
    mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && aa >= 1980 && aa <= 2099
      ? aa * 10000 + mm * 100 + dd
      : null);

  let m; let n;
  // "28/08/2026, 05:52:04" — dia/mês/ano
  if ((m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/))) {
    n = feito(Number(m[3]), Number(m[2]), Number(m[1]));
    if (n) return n;
  }
  // "05 Aug 2026"
  if ((m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\b/)) && MES[m[2].toLowerCase()]) {
    n = feito(Number(m[3]), MES[m[2].toLowerCase()], Number(m[1]));
    if (n) return n;
  }
  // "May 7, 2019 @ 11:04pm"
  if ((m = s.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/)) && MES[m[1].toLowerCase()]) {
    n = feito(Number(m[3]), MES[m[1].toLowerCase()], Number(m[2]));
    if (n) return n;
  }
  const a = ano(o);
  return a != null ? a * 10000 : Infinity;
}

/**
 * A mesma data escrita sempre igual, para servir de CHAVE.
 *
 * Devolve texto e não número de propósito: entra numa chave de deduplicação
 * junto com o nome, e `-Infinity` dentro de uma string ficava ilegível na
 * primeira vez que alguém abrisse o JSON para perceber o que se passou.
 */
function chaveDoDia(o) {
  const n = momento(o);
  if (n === -Infinity) return 'primeiro';
  if (n === Infinity) return 'sem-data';
  return String(n);
}

module.exports = { momento, ano, chaveDoDia, MES };
