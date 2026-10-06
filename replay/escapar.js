/**
 * Texto de fora a entrar numa página como HTML: nome de canal, título de
 * transmissão, mensagem de erro, o que vem num link partilhado.
 *
 * Um nome de canal que a Kick recusa volta tal como foi escrito, e um link
 * `?s=` traz a lista de canais de quem o fez. Sem isto, um link com
 * `<img onerror=…>` no lugar de um nome corria código na página de quem o
 * abrisse.
 */
export const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
