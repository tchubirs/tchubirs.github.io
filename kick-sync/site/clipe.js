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
