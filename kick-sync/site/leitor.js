/**
 * O que fazer a um leitor: tocar, parar, ou nada.
 *
 * Isto e tres linhas, e uma delas esteve errada desde o principio. O sitio
 * onde vivia — dentro de um `if` de saida antecipada, no meio de cem linhas
 * que mexem no DOM — nao se testa, e por isso ninguem deu por ela.
 *
 * O erro: quando o leitor ja estava no MESMO video, a funcao acertava o
 * instante e saia sem mandar tocar. Num computador nao se notava, porque o
 * primeiro `play()` da pagina passa e o video nunca mais para. Num telemovel
 * nota-se em cheio: o iOS recusa o primeiro `play()` porque nao veio de um
 * toque, o video fica parado, e a partir dai TUDO o que mexe no relogio cai
 * naquela saida antecipada. Ele carregava em Rever e nada acontecia — nao era
 * o telemovel dele, era isto.
 *
 * @param {boolean} correr este angulo devia estar a andar
 * @param {boolean} parado a pagina inteira esta em pausa (o botao de pausa)
 * @param {boolean} pausado o leitor esta parado NESTE momento
 */
export function queFazerComOLeitor({ correr, parado, pausado }) {
  // A pausa da pagina ganha sempre: o botao diz parado e o quadrado andar e a
  // pior das duas coisas.
  if (parado) return pausado ? 'nada' : 'parar';
  if (correr) return pausado ? 'tocar' : 'nada';
  return pausado ? 'nada' : 'parar';
}
