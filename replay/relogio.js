// The master clock: many channels, many VODs each, one timeline.
//
// A channel is not one VOD. A streamer who crashed and reconnected has several
// VODs covering one night with holes between them. So a channel's timeline is
// an ordered set of VODs plus the gaps, and scrubbing across a gap must either
// switch VODs by itself or show the hole — never quietly play the wrong moment.

import { tempoDeMidia } from './kick.js?v=7d4572c904';

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

  // The overlap is the stretch where a multi-angle clip is even possible. Shown
  // apart from the union because a user who marks outside it gets a clip with
  // one angle, and would rather know before exporting than after.
  const inicioTodos = Math.max(...vivas.map((l) => l.inicio));
  const fimTodos = Math.min(...vivas.map((l) => l.fim));

  // And it can simply not exist. One channel that ended at 20:10 and another
  // that started at 23:30 have no instant in common, and the naive max/min
  // gives back "23:30 -> 20:10" — a window that runs backwards. Printing that
  // is worse than printing nothing: it looks like an answer.
  const haSobreposicao = fimTodos > inicioTodos;

  return {
    inicio: Math.min(...vivas.map((l) => l.inicio)),
    fim: Math.max(...vivas.map((l) => l.fim)),
    haSobreposicao,
    sobreposicaoInicio: haSobreposicao ? inicioTodos : null,
    sobreposicaoFim: haSobreposicao ? fimTodos : null,
    canais: vivas.length,
  };
}

/**
 * Quantos ângulos existem num dado instante — o número que decide se vale a
 * pena marcar ali.
 *
 * With no common overlap across everyone, this is what the UI shows instead:
 * "at 22:15 you have four of six angles" is useful, "no common window" is not.
 */
export function quantosNoAr(linhas, quandoMs, { nudges = {} } = {}) {
  return linhas.filter((l) => onde(l, quandoMs, { nudgeMs: nudges[l.slug] || 0 }).estado === 'toca').length;
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

/**
 * A sessão inteira, num texto — para sobreviver a um F5 e viajar num link.
 *
 * Guarda-se o que custou a chegar aqui: os canais, a noite, o instante, os
 * ajustes, a marca e o tamanho de cada corte. Perder isto por causa de uma
 * página que travou é perder meia hora de procura.
 */
export function paraLink(sessao) {
  const magro = {
    v: 2,
    canais: sessao.canais,
    de: sessao.janela?.inicio ?? null,
    ate: sessao.janela?.fim ?? null,
    nudges: sessao.nudges || {},
    marca: sessao.marca || null,
    agora: Number.isFinite(sessao.agoraMs) ? sessao.agoraMs : null,
    focos: Array.isArray(sessao.focos) ? sessao.focos : [],
    margens: sessao.margens || {},
    mudo: sessao.mudo || {},
    volume: sessao.volume || {},
    momentos: Array.isArray(sessao.momentos) ? sessao.momentos.slice(0, 300) : [],
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(magro))));
}

export function doLink(texto) {
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(String(texto)))));
    // A link is untrusted input: it can arrive truncated, edited by hand, or
    // from a version that did not exist yet. Anything unreadable is "no
    // session" rather than a half-restored one that looks fine and is not.
    //
    // A v1 continua a ser lida: quem tinha uma sessão guardada antes desta
    // versão não a perde por causa de um número que mudou.
    if (!j || (j.v !== 1 && j.v !== 2) || !Array.isArray(j.canais)) return null;
    const objecto = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    return {
      canais: j.canais.filter((c) => typeof c === 'string').slice(0, 50),
      nudges: objecto(j.nudges),
      marca: j.marca && Number.isFinite(j.marca.de) && Number.isFinite(j.marca.ate) ? j.marca : null,
      agora: Number.isFinite(j.agora) ? j.agora : null,
      focos: (Array.isArray(j.focos) ? j.focos : []).filter((c) => typeof c === 'string').slice(0, 2),
      margens: objecto(j.margens),
      mudo: objecto(j.mudo),
      volume: objecto(j.volume),
      // As kills marcadas sao o que mais custa a juntar: uma hora de video
      // vista a procurar. Perde-las num F5 e perder a tarde.
      momentos: (Array.isArray(j.momentos) ? j.momentos : [])
        .filter((m) => m && Number.isFinite(m.ms)).slice(0, 300),
      de: Number.isFinite(j.de) ? j.de : null,
    };
  } catch { return null; }
}
/**
 * O instante do mundo a que o vídeo chegou, ou nada.
 *
 * Existe como função à parte porque a regra é fácil de errar e o sítio onde
 * ela corre — um `requestAnimationFrame` com um `<video>` a descodificar — não
 * se testa. Errei-a à primeira: sem dados descodificados o `currentTime` é
 * zero, e zero não quer dizer "o princípio do vídeo", quer dizer "o salto que
 * pedi ainda não aconteceu". A conta ingénua punha o relógio a andar PARA TRÁS
 * no instante em que se carregava em play.
 *
 * @param {{ms:number, tempoS:number}} ancora onde o relógio estava quando se
 *   mandou tocar, e a que segundo do vídeo isso correspondia
 * @param {{currentTime:number, readyState:number, paused:boolean}} video
 * @returns {number|null} o instante, ou null quando não há resposta honesta
 */
export function instanteSeguindo(ancora, video, { limiteMs = 3_600_000 } = {}) {
  if (!ancora || !video) return null;
  if (video.paused || video.readyState < 2) return null;
  if (!Number.isFinite(video.currentTime) || !Number.isFinite(ancora.ms)) return null;
  const ms = ancora.ms + (video.currentTime - ancora.tempoS) * 1000;
  // Só para a frente: isto segue a reprodução. Atrás da âncora é o leitor
  // ainda a caminho; longe demais é um pedaço novo com o tempo recomeçado.
  if (!Number.isFinite(ms) || ms < ancora.ms || ms - ancora.ms > limiteMs) return null;
  return ms;
}
