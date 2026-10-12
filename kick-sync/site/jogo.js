// Só o jogo do evento.
//
// A lista do Abisal tem canais que, na mesma noite, estavam no GTA RP (o mills_rp às 23:16 apareceu nos
// melhores lances, teste real de 12/10). A Kick diz o jogo de cada live em categories[0].name ("Rust",
// "Grand Theft Auto V (GTA)"), e o kick.js guarda-o em `categoria`. Um evento com `jogo` deixa de fora
// da detecção, dos melhores lances, do time pelo som e do "Guardar todos" as lives de outro jogo; elas
// continuam no mapa, a cinza, e abrem à mão.
//
// Sem `jogo` no evento não se filtra nada, e um VOD sem categoria conta como do jogo: nunca se esconde
// um ângulo por falta de um dado.

/** O nome do jogo para comparar: minúsculas, sem acentos e só letras e números ("Rust " e "rust" dão o mesmo). */
export function chaveDoJogo(nome) {
  return String(nome ?? '')
    .normalize('NFKD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Se um VOD é do jogo do evento. Sem jogo pedido, sem categoria no VOD, ou com uma categoria que não é
 * um jogo ("Just Chatting", `categoriaJogo === false`), é: a Kick guarda uma categoria só por VOD, e
 * no teste real de 12/10 um canal jogou Rust do evento num VOD chamado "Just Chatting". Só um outro
 * jogo de verdade (GTA, LoL) fica de fora.
 */
export function eDoJogo(vod, jogo) {
  const pedido = chaveDoJogo(jogo);
  if (!pedido) return true;
  if (vod?.categoriaJogo === false) return true;
  const nome = chaveDoJogo(vod?.categoria);
  const slug = chaveDoJogo(vod?.categoriaSlug);
  if (!nome && !slug) return true;
  return nome === pedido || slug === pedido;
}

/**
 * As listas de VOD lidas, separadas em duas: `doJogo` (o que entra em tudo) e `outro` (só os VODs de
 * outro jogo, para o mapa os mostrar a cinza). As duas têm a mesma forma das listas do kick.js; um canal
 * sem nada de um lado fica lá com `vods: []`.
 */
export function separarPorJogo(resultados, jogo) {
  const lista = Array.isArray(resultados) ? resultados : [];
  if (!chaveDoJogo(jogo)) return { doJogo: lista, outro: [] };
  const doJogo = [];
  const outro = [];
  for (const r of lista) {
    if (r?.estado !== 'ok' || !Array.isArray(r.vods)) { doJogo.push(r); continue; }
    const fora = r.vods.filter((v) => !eDoJogo(v, jogo));
    doJogo.push(fora.length ? { ...r, vods: r.vods.filter((v) => eDoJogo(v, jogo)) } : r);
    if (fora.length) outro.push({ ...r, vods: fora });
  }
  return { doJogo, outro };
}
