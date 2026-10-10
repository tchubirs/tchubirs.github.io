// As opções da detecção que fazem sentido para quem não é técnico (o dono, 10/10: "no de PvP não sei
// quais opções extras tem"). Por dentro, a detecção tem uma dúzia de números (tiros.js, explosoes.js,
// gritos.js); por fora ficam dois: quão exigente ela é, e juntar lances perto uns dos outros. As margens
// do clipe são as da montagem, e não vivem aqui.

export const SENSIBILIDADES_DETECAO = ['menos', 'normal', 'mais'];

/**
 * Os números por dentro de cada sensibilidade, no formato das `opcoes` de `varrerNoite`.
 *
 * Normal é o que foi medido no som verdadeiro (ver `regioes` em tiros.js): oito vezes o chão da noite, e
 * pelo menos 0,6 s quente. "Menos" pede mais força e mais tempo, e deixa de fora os tiroteios curtos ou
 * longe; "mais" aceita sons mais baixos e mais curtos, e traz mais lances que não são nada. Nas explosões
 * e nos gritos muda a força pedida da mesma maneira.
 */
export function opcoesDaSensibilidade(sens) {
  if (sens === 'menos') {
    return { alturaMin: 12, minQuenteS: 1.2, explosoes: { alturaMin: 14 }, gritos: { fator: 4 } };
  }
  if (sens === 'mais') {
    return { alturaMin: 5, minQuenteS: 0.3, explosoes: { alturaMin: 4 }, gritos: { fator: 2.2 } };
  }
  return {};
}

/**
 * Juntar os lances da mesma pessoa que estão a menos de `juntarMs` uns dos outros (do fim de um ao
 * começo do seguinte), de qualquer tipo: uma explosão logo a seguir a uma troca de tiros é o mesmo
 * lance, e dois clipes quase iguais são trabalho a dobrar na montagem.
 *
 * O lance junto fica com o instante e o tipo do primeiro, e o clipe vai do começo do primeiro ao fim do
 * último. Os tipos todos ficam em `tipos` (e as palavras do chat, juntas, em `palavras`). Com `juntarMs`
 * a zero, ou nada para juntar, devolve os lances como vieram, pela ordem do relógio.
 */
export function juntarProximos(achados, juntarMs = 0) {
  const ordem = [...(achados || [])].sort((a, b) => (a.combateDeMs ?? a.ms) - (b.combateDeMs ?? b.ms));
  if (!(juntarMs > 0)) return ordem;
  const saida = [];
  const ultimoDe = new Map();
  for (const c of ordem) {
    const de = c.combateDeMs ?? c.ms;
    const ate = c.combateAteMs ?? c.ms;
    const antes = ultimoDe.get(c.canal);
    if (antes && de - (antes.combateAteMs ?? antes.ms) < juntarMs) {
      antes.combateDeMs = Math.min(antes.combateDeMs ?? antes.ms, de);
      antes.combateAteMs = Math.max(antes.combateAteMs ?? antes.ms, ate);
      if (!antes.tipos.includes(c.tipo)) antes.tipos.push(c.tipo);
      if (c.palavras?.length) antes.palavras = [...new Set([...(antes.palavras || []), ...c.palavras])];
      antes.juntos += 1;
      continue;
    }
    const novo = { ...c, combateDeMs: de, combateAteMs: ate, tipos: [c.tipo], juntos: 1 };
    saida.push(novo);
    ultimoDe.set(c.canal, novo);
  }
  return saida;
}
