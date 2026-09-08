// As contas de um clipe: onde começa, onde acaba, e como se chama o ficheiro.
//
// Separadas da janela e dos botões de propósito. Arrastar uma pega é a parte
// que se vê; o que não se pode errar é o resto — não deixar o fim passar à
// frente do início, não deixar passar do limite, e não deixar sair do vídeo.

export const MAXIMO_S = 180;
export const MINIMO_S = 1;

/**
 * Mexer numa pega, com todos os limites aplicados de uma vez.
 *
 * `qual` diz qual das duas se mexeu, e é isso que decide quem cede quando o
 * limite é atingido: puxar o fim para lá dos 180 s empurra o início, e não o
 * contrário — quem arrasta uma pega espera que ELA vá para onde a levaram.
 */
export function mover({ deMs, ateMs }, qual, novoMs, { limites, maxS = MAXIMO_S, minS = MINIMO_S } = {}) {
  const min = limites?.inicio ?? -Infinity;
  const max = limites?.fim ?? Infinity;
  const preso = Math.min(Math.max(Math.round(novoMs), min), max);

  if (qual === 'de') {
    const de = Math.min(preso, ateMs - minS * 1000);
    return { deMs: Math.max(min, de), ateMs: Math.min(max, Math.min(ateMs, de + maxS * 1000)) };
  }
  const ate = Math.max(preso, deMs + minS * 1000);
  return { ateMs: Math.min(max, ate), deMs: Math.max(min, Math.max(deMs, ate - maxS * 1000)) };
}

/** A janela inicial de um clipe, à volta do instante em que se está. */
export function janelaInicial(centroMs, { antesS = 15, depoisS = 15, limites } = {}) {
  return mover(
    { deMs: centroMs - antesS * 1000, ateMs: centroMs + depoisS * 1000 },
    'ate',
    centroMs + depoisS * 1000,
    { limites },
  );
}

/**
 * O nome do ficheiro, a partir do título que a pessoa escreveu.
 *
 * Um título é texto de gente: leva acentos, barras, dois pontos e emojis, e
 * qualquer um deles estraga um nome de ficheiro em pelo menos um sistema.
 */
export function nomeDoClipe({ titulo, canal, quandoMs, sufixo = 'ts' }) {
  const limpo = String(titulo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]+/g, ' ')
    .trim().replace(/\s+/g, '-')
    .slice(0, 60);
  const d = new Date(quandoMs).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${limpo ? `${limpo}__` : ''}${canal}__${d}Z.${sufixo}`;
}

/**
 * Onde desenhar a cabeça — a barra branca que diz onde está o vídeo.
 *
 * Presa ao pedaço escolhido de propósito, e não por gosto de limites: o
 * relógio de um `<video>` não vale nada no instante a seguir a um salto. O
 * `readyState` já diz que há imagem com o frame ANTIGO ainda no ecrã, e quem
 * lê o `currentTime` aí conta a partir do sítio errado. Se o salto era para
 * trás — e é o que acontece a carregar em ▶ logo depois de apurar o FIM — a
 * conta dá negativo e a cabeça ia parar à esquerda do início.
 *
 * "Essa barra branca aí de onde está o vídeo fica fora das barras verdes."
 * Ficava. O vídeo está sempre dentro do pedaço; desenhá-la fora dele é mentir
 * sobre a única coisa que ela tem para dizer.
 */
export function posicaoDaCabeca({ deMs, ateMs, vista }, ms) {
  const preso = Math.min(Math.max(ms, deMs), ateMs);
  return ((preso - vista.inicio) / Math.max(1, vista.fim - vista.inicio)) * 100;
}
