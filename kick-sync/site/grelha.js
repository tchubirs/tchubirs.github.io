// A ordem dos quadrados na grelha.
//
// "Esses vídeos em baixo têm que ficar em alguma ordem, ou de adicionado ou
//  alfabética, porque nunca acho a live de quem tô procurando."
//
// A ordem de adição já lá estava — foi ele que a pediu, e resolveu o problema
// dela: com vinte e três canais a Kick devolvia-os por ordem desconhecida e não
// havia nenhuma. Mas resolver "não há ordem" não é o mesmo que resolver
// "não encontro o fulano": ninguém se lembra em que posição escreveu um nome
// há uma hora. Para PROCURAR alguém, a chave é o nome, e a ordem que serve é a
// alfabética.
//
// Por isso as duas, à escolha, e a de adição continua a ser a de omissão: é a
// que ele pediu, e mudar-lha por minha conta seria trocar uma queixa por outra.
//
// `ordemDosAngulos` e não `ordenar`: já existe um `ordenar` no `momentos.js`,
// e o segundo import com o mesmo nome não dá um aviso — dá um SyntaxError que
// mata o ficheiro inteiro. A página ficava em branco sem um quadrado sequer, e
// o teste que eu tinha à mão só dizia "não apareceu nenhum .tile".
//
// Isto vive num ficheiro só seu, sem DOM, porque a ordem de trinta nomes é
// exactamente o tipo de coisa que se escreve à pressa e sai errada num caso
// que ninguém experimenta — um nome repetido, um vazio, um acento.

export const ORDENS = ['adicionado', 'az'];

/**
 * Os slugs pela ordem escolhida.
 *
 * @param {Array<{slug: string}>} linhas - os canais que estão no ar
 * @param {string} modo - 'adicionado' ou 'az'
 * @param {string[]} escritos - os nomes pela ordem em que ele os escreveu
 */
export function ordemDosAngulos(linhas, modo = 'adicionado', escritos = []) {
  const slugs = linhas.map((l) => l?.slug).filter((s) => typeof s === 'string' && s);
  // Sem duplicados: um nome escrito duas vezes na caixa não pode dar dois
  // lugares na grelha ao mesmo quadrado.
  const unicos = [...new Set(slugs)];

  if (modo === 'az') {
    // `localeCompare` e não `<`: com `<`, "Xlibano" vinha antes de "ay_zarite"
    // porque as maiúsculas são menores em código, e uma lista alfabética que
    // não está por ordem alfabética é pior do que nenhuma.
    return unicos.sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base', numeric: true }));
  }

  // Um canal que já não está na caixa de texto vai para o FIM, e não para o
  // princípio — que é onde um `indexOf` de -1 o punha.
  const posicao = (s) => {
    const i = escritos.indexOf(s);
    return i === -1 ? escritos.length : i;
  };
  return unicos.sort((a, b) => posicao(a) - posicao(b) || a.localeCompare(b));
}

/**
 * Pôr a grelha nessa ordem SEM lhe tocar no DOM.
 *
 * `style.order` e não `appendChild`: mover um `<video>` a tocar de sítio no DOM
 * interrompe-o — está escrito no `aplicarFoco` porque já aconteceu, e ao
 * acrescentar um segundo ângulo o que já corria congelava até tudo recarregar.
 * A propriedade `order` do CSS reordena o que se vê e não mexe em nada.
 */
export function aplicarOrdem(tiles, ordem) {
  const onde = new Map(ordem.map((s, i) => [s, i]));
  let mexidos = 0;
  for (const tile of tiles) {
    const i = onde.get(tile.dataset?.slug);
    const valor = i == null ? String(ordem.length) : String(i);
    if (tile.style.order !== valor) { tile.style.order = valor; mexidos++; }
  }
  return mexidos;
}
