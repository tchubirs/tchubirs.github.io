// The master clock: many channels, many VODs each, one timeline.
//
// A channel is not one VOD. A streamer who crashed and reconnected has several
// VODs covering one night with holes between them. So a channel's timeline is
// an ordered set of VODs plus the gaps, and scrubbing across a gap must either
// switch VODs by itself or show the hole — never quietly play the wrong moment.

import { tempoDeMidia } from './kick.js';

/**
 * One channel's night: its VODs in order, and the holes between them.
 *
 * @param {Array<{vod:object, playlist:object}>} pecas
 */
export function linhaDoCanal(slug, pecas) {
  const boas = pecas
    .filter((p) => Number.isFinite(p.playlist?.inicio))
    .sort((a, b) => a.playlist.inicio - b.playlist.inicio);

  const buracos = [];
  for (let i = 1; i < boas.length; i++) {
    const fimAnterior = boas[i - 1].playlist.fim;
    const inicioSeguinte = boas[i].playlist.inicio;
    // Two seconds of slack: consecutive VODs from one reconnect touch almost
    // exactly, and calling a 200 ms seam a "hole" would put a warning on the
    // screen for something nobody can see.
    if (inicioSeguinte - fimAnterior > 2000) {
      buracos.push({ de: fimAnterior, ate: inicioSeguinte, segundos: (inicioSeguinte - fimAnterior) / 1000 });
    }
  }

  return {
    slug,
    pecas: boas,
    buracos,
    inicio: boas[0]?.playlist.inicio ?? null,
    fim: boas.at(-1)?.playlist.fim ?? null,
    // Said out loud: with no PDT anywhere, this channel cannot be trusted on
    // the shared clock and the UI has to say so instead of drawing it as equal.
    //
    // The emptiness check comes FIRST, and that ordering is the whole fix:
    // `[].every()` is true, so a channel with no video at all was claiming a
    // perfect clock. Vacuous truth, and it would have put a confident green
    // label on the one tile that has nothing behind it.
    relogio: !boas.length ? 'nenhum'
      : boas.every((p) => p.playlist.fonteDoRelogio === 'program-date-time') ? 'exato'
        : 'parcial',
  };
}

/** The window every channel shares — where the night actually is. */
export function janelaComum(linhas) {
  const vivas = linhas.filter((l) => Number.isFinite(l.inicio) && Number.isFinite(l.fim));
  if (!vivas.length) return null;
  return {
    inicio: Math.min(...vivas.map((l) => l.inicio)),
    fim: Math.max(...vivas.map((l) => l.fim)),
    // The overlap is the part where a multi-angle clip is even possible. Shown
    // apart from the union because a user who marks outside it gets a clip with
    // one angle and would rather know before exporting than after.
    sobreposicaoInicio: Math.max(...vivas.map((l) => l.inicio)),
    sobreposicaoFim: Math.min(...vivas.map((l) => l.fim)),
    canais: vivas.length,
  };
}

/**
 * Where one channel is at a given instant.
 *
 * Four honest answers, and the UI renders each differently:
 *   {peca, tempoS}       playing, seek here
 *   {buraco}             this channel was off air right then
 *   {antes} / {depois}   outside this channel's night
 */
export function onde(linha, quandoMs, { nudgeMs = 0 } = {}) {
  const t = quandoMs + nudgeMs;
  if (!linha.pecas.length) return { estado: 'sem-video' };
  if (t < linha.inicio) return { estado: 'antes', faltamS: (linha.inicio - t) / 1000 };
  if (t > linha.fim) return { estado: 'depois', passouS: (t - linha.fim) / 1000 };

  for (const p of linha.pecas) {
    const tempoS = tempoDeMidia(p.playlist, t);
    if (tempoS != null) return { estado: 'toca', peca: p, tempoS };
  }
  const b = linha.buracos.find((h) => t >= h.de && t < h.ate);
  return b ? { estado: 'buraco', buraco: b } : { estado: 'sem-video' };
}

/**
 * The manual nudge, per channel, persisted with the session.
 *
 * PROGRAM-DATE-TIME is per segment and segments are ~10 s, so alignment is
 * exact at a boundary and interpolated inside one. Frame accuracy is not
 * reachable from PDT alone — which makes the nudge mandatory, not a nicety.
 */
export function comNudge(sessao, slug, ms) {
  return { ...sessao, nudges: { ...sessao.nudges, [slug]: Math.round(ms) } };
}

/** A session that survives a refresh, a crash and a shared link. */
export function paraLink(sessao) {
  const magro = {
    v: 1,
    canais: sessao.canais,
    de: sessao.janela?.inicio ?? null,
    ate: sessao.janela?.fim ?? null,
    nudges: sessao.nudges || {},
    marca: sessao.marca || null,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(magro))));
}

export function doLink(texto) {
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(String(texto)))));
    // A link is untrusted input: it can arrive truncated, edited by hand, or
    // from a version that did not exist yet. Anything unreadable is "no
    // session" rather than a half-restored one that looks fine and is not.
    if (!j || j.v !== 1 || !Array.isArray(j.canais)) return null;
    return {
      canais: j.canais.filter((c) => typeof c === 'string').slice(0, 50),
      nudges: j.nudges && typeof j.nudges === 'object' ? j.nudges : {},
      marca: j.marca && Number.isFinite(j.marca.de) && Number.isFinite(j.marca.ate) ? j.marca : null,
    };
  } catch { return null; }
}
