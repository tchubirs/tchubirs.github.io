// The Kick adapter. Every call to Kick goes through this file and nowhere else.
//
// Kick's endpoints are undocumented and change without notice. Keeping them in
// one place means a change breaks one file loudly instead of leaking failures
// into the UI. `probes/fixtures/` holds recorded responses; the contract test
// replays them so a shape change fails a test rather than a user's session.
//
// Measured 31/08/2026, and the numbers decide the design:
//   - kick.com/api/v2 reflects the caller's Origin back in
//     access-control-allow-origin, so a static page can call it directly.
//   - the CDN answers `*` on master playlist, media playlist AND segments,
//     and accepts Range. So there is no server in this product at all.

const API = 'https://kick.com/api/v2';

/** Unknown is a first-class value here — never a fabricated name or time. */
export const DESCONHECIDO = null;

/**
 * The VODs a channel has, newest first.
 *
 * Every failure mode is a normal state with a name, because each one is a real
 * thing the user will hit: a channel that never streamed, one whose VODs
 * expired, a name typed wrong. None of them may render as an empty tile.
 */
export async function vodsDoCanal(slug, { buscar = fetch } = {}) {
  const nome = String(slug || '').trim().replace(/^@/, '').toLowerCase();
  // Deliberately loose. I do not know Kick's minimum username length, and a
  // validator built on a guess rejects a real channel and blames the user for
  // it. This only refuses what cannot be a path segment at all; anything else
  // goes to the API, which is the thing that actually knows.
  if (!nome || !/^[a-z0-9_.-]{1,60}$/.test(nome)) {
    return { slug: nome, estado: 'nome-invalido', vods: [] };
  }
  let r;
  try {
    r = await buscar(`${API}/channels/${encodeURIComponent(nome)}/videos`);
  } catch (e) {
    return { slug: nome, estado: 'sem-rede', erro: e.message, vods: [] };
  }
  if (r.status === 404) return { slug: nome, estado: 'canal-nao-existe', vods: [] };
  if (r.status === 429) return { slug: nome, estado: 'rate-limit', vods: [] };
  if (!r.ok) return { slug: nome, estado: `http-${r.status}`, vods: [] };

  let lista;
  try { lista = await r.json(); } catch { return { slug: nome, estado: 'resposta-ilegivel', vods: [] }; }
  if (!Array.isArray(lista)) return { slug: nome, estado: 'formato-inesperado', vods: [] };
  if (!lista.length) return { slug: nome, estado: 'sem-vods', vods: [] };

  const vods = lista.map((v) => ({
    id: v.id,
    titulo: v.session_title ?? DESCONHECIDO,
    // Kick serves this without a zone. Treated as UTC: measured against the
    // media's own PROGRAM-DATE-TIME the deltas are 2.6-4.5 s, which a wrong
    // zone would have made a whole hour.
    inicioApi: v.start_time ? Date.parse(`${v.start_time.replace(' ', 'T')}Z`) : DESCONHECIDO,
    duracaoMs: Number.isFinite(v.duration) ? v.duration : DESCONHECIDO,
    master: v.source ?? DESCONHECIDO,
    privado: v.video?.is_private === true,
    apagado: v.video?.is_pruned === true || Boolean(v.video?.deleted_at),
  })).filter((v) => v.master && !v.privado && !v.apagado);

  if (!vods.length) return { slug: nome, estado: 'vods-indisponiveis', vods: [] };
  vods.sort((a, b) => (a.inicioApi ?? 0) - (b.inicioApi ?? 0));
  return { slug: nome, estado: 'ok', vods };
}

/**
 * The rendition ladder of one VOD.
 *
 * Measured identical across four unrelated channels (an IVS account preset):
 * 1080p60, 720p60, 480p, 360p and 160p @ 230 kbps. The 160p rung is what makes
 * a 30-tile grid a home-connection problem instead of a server problem.
 */
export function lerMaster(texto, urlDoMaster) {
  const base = String(urlDoMaster).replace(/\/[^/]*$/, '');
  const linhas = String(texto).split('\n').map((l) => l.trim());
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const caminho = linhas[i + 1];
    if (!caminho || caminho.startsWith('#')) continue;
    const num = (re) => Number((linhas[i].match(re) || [])[1]) || DESCONHECIDO;
    const res = (linhas[i].match(/RESOLUTION=(\d+)x(\d+)/) || []);
    saida.push({
      largura: Number(res[1]) || DESCONHECIDO,
      altura: Number(res[2]) || DESCONHECIDO,
      fps: num(/FRAME-RATE=([\d.]+)/),
      bitrate: num(/BANDWIDTH=(\d+)/),
      nome: (linhas[i].match(/VIDEO="([^"]+)"/) || [])[1] ?? DESCONHECIDO,
      url: /^https?:/.test(caminho) ? caminho : `${base}/${caminho}`,
    });
  }
  // Highest first. `.at(-1)` is then the cheapest rung and `[0]` the best —
  // which is exactly the two the product needs and never anything between.
  saida.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return saida;
}

/**
 * The wall clock of one rendition, segment by segment.
 *
 * This replaces what the owner believed. He thought the m3u8 path carried the
 * absolute start; measured, the path is truncated to the MINUTE and is wrong by
 * 0-59 s (samples: +7, +52, +31, +22 s against the API's own start_time). With
 * 30 angles a 52-second error is not drift, it is a different fight.
 *
 * EXT-X-PROGRAM-DATE-TIME is on every segment, to the millisecond, and it is
 * the media's own clock rather than a field written by the ingest.
 */
export function lerPlaylist(texto, urlDaPlaylist) {
  const base = String(urlDaPlaylist).replace(/\/[^/]*$/, '');
  const linhas = String(texto).split('\n').map((l) => l.trim());
  const segmentos = [];
  let pdt = DESCONHECIDO;
  let dur = DESCONHECIDO;
  let descontinuidade = false;
  let mediaT = 0;

  for (const l of linhas) {
    if (l.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) { pdt = Date.parse(l.slice(25)); continue; }
    if (l.startsWith('#EXTINF:')) { dur = parseFloat(l.slice(8)) || 0; continue; }
    if (l === '#EXT-X-DISCONTINUITY') { descontinuidade = true; continue; }
    if (!l || l.startsWith('#')) continue;

    segmentos.push({
      url: /^https?:/.test(l) ? l : `${base}/${l}`,
      // `inicio` is wall clock in ms. When a segment has no PDT of its own we
      // carry the previous one forward by its duration — that is arithmetic on
      // a measured value, not an invented timestamp.
      inicio: pdt,
      duracaoS: dur ?? 0,
      mediaT,
      descontinuidade,
    });
    mediaT += dur ?? 0;
    if (Number.isFinite(pdt) && Number.isFinite(dur)) pdt += dur * 1000;
    descontinuidade = false;
    dur = DESCONHECIDO;
  }

  const comRelogio = segmentos.filter((s) => Number.isFinite(s.inicio));
  return {
    segmentos,
    // Said out loud so the UI can label it. Without PDT the sync falls back to
    // the API's start_time and the accuracy claim changes; the user has to know
    // which one they are looking at.
    fonteDoRelogio: comRelogio.length === segmentos.length ? 'program-date-time'
      : comRelogio.length ? 'program-date-time-parcial' : 'sem-relogio',
    inicio: comRelogio[0]?.inicio ?? DESCONHECIDO,
    fim: comRelogio.length
      ? comRelogio.at(-1).inicio + comRelogio.at(-1).duracaoS * 1000
      : DESCONHECIDO,
    duracaoS: mediaT,
  };
}

/**
 * Which segments cover a wall-clock window — the whole reason a clip is cheap.
 *
 * Never downloads a VOD. A 20-second clip out of a ten-hour stream fetches
 * three segments.
 */
export function segmentosNaJanela({ segmentos }, deMs, ateMs) {
  return segmentos.filter((s) => {
    if (!Number.isFinite(s.inicio)) return false;
    const fim = s.inicio + s.duracaoS * 1000;
    return fim > deMs && s.inicio < ateMs;
  });
}

/**
 * Wall clock -> position inside this VOD's media, in seconds.
 *
 * Returns null outside the VOD. Null means "this angle was not filming then",
 * which is a real answer the grid must show honestly rather than seeking to 0
 * and displaying the wrong moment.
 */
export function tempoDeMidia({ segmentos }, quandoMs) {
  for (const s of segmentos) {
    if (!Number.isFinite(s.inicio)) continue;
    const fim = s.inicio + s.duracaoS * 1000;
    if (quandoMs >= s.inicio && quandoMs < fim) {
      return s.mediaT + (quandoMs - s.inicio) / 1000;
    }
  }
  return DESCONHECIDO;
}

/**
 * Procurar canais pelo nome, para não ser preciso saber o slug de cor.
 *
 * Medido em 31/08/2026: `kick.com/api/search` devolve 200 sem autenticação e
 * reflecte a Origin de volta, por isso a página chama-o directamente. Devolve
 * até 20 canais; aqui ficam os mais seguidos, que é o desempate certo quando
 * meia dúzia de pessoas tem um nome parecido.
 */
export async function procurarCanais(texto, { buscar = fetch, sinal, quantos = 8 } = {}) {
  const termo = String(texto || '').trim();
  // Uma letra devolve o mundo inteiro e não ajuda ninguém a escolher.
  if (termo.length < 2) return [];
  let r;
  try {
    r = await buscar(`${API.replace('/v2', '')}/search?searched_word=${encodeURIComponent(termo)}`, { signal: sinal });
  } catch { return []; }
  if (!r.ok) return [];
  let j;
  try { j = await r.json(); } catch { return []; }
  const canais = Array.isArray(j?.channels) ? j.channels : [];
  return canais
    .filter((c) => typeof c?.slug === 'string')
    .map((c) => ({
      slug: c.slug,
      seguidores: Number(c.followersCount ?? c.followers_count) || 0,
      aoVivo: c.is_live === true,
    }))
    .sort((a, b) => b.seguidores - a.seguidores)
    .slice(0, quantos);
}

/**
 * O que é este link.
 *
 * "A pessoa cola o link do clip ou VOD, você carrega e abre." Colar é o gesto
 * mais barato que existe — não obriga a saber o slug do canal, nem a procurar
 * a noite certa numa lista. Só que a Kick escreve o mesmo sítio de várias
 * maneiras, e por isso isto lê a FORMA e não o endereço inteiro.
 *
 * Devolve `null` para o que não reconhece, e nunca adivinha: mandar alguém
 * para o canal errado é pior do que dizer que não percebi o link.
 */
export function lerLinkKick(texto) {
  const cru = String(texto || '').trim();
  if (!cru) return null;
  // Um id de clipe colado sozinho, sem endereço nenhum à volta.
  if (/^clip_[A-Za-z0-9]+$/.test(cru)) return { tipo: 'clipe', id: cru };
  let u;
  try { u = new URL(/^https?:\/\//i.test(cru) ? cru : `https://${cru}`); } catch { return null; }
  if (!/(^|\.)kick\.com$/i.test(u.hostname)) return null;
  // O clipe pode vir no caminho ou como `?clip=`.
  const doPar = u.searchParams.get('clip');
  if (doPar && /^clip_/.test(doPar)) return { tipo: 'clipe', id: doPar };
  const partes = u.pathname.split('/').filter(Boolean);
  const iClip = partes.findIndex((p) => p === 'clips' || p === 'clip');
  if (iClip >= 0 && partes[iClip + 1]) return { tipo: 'clipe', id: partes[iClip + 1] };
  const iVod = partes.findIndex((p) => p === 'video' || p === 'videos');
  if (iVod >= 0 && partes[iVod + 1]) return { tipo: 'vod', id: partes[iVod + 1] };
  // O que sobra com uma parte só é um canal: kick.com/tchubi.
  if (partes.length === 1 && /^[A-Za-z0-9_-]+$/.test(partes[0])) {
    return { tipo: 'canal', slug: partes[0] };
  }
  return null;
}

/** Um clipe da Kick: o que é preciso para o pôr no relógio e para o cortar. */
export async function clipeDaKick(id, { buscar = fetch, sinal } = {}) {
  const r = await buscar(`https://kick.com/api/v2/clips/${encodeURIComponent(id)}`, { signal: sinal });
  if (!r.ok) throw Object.assign(new Error(`clipe ${r.status}`), { name: 'SEM-CLIPE' });
  const { clip } = await r.json();
  if (!clip?.video_url && !clip?.clip_url) {
    throw Object.assign(new Error('clipe sem vídeo'), { name: 'SEM-CLIPE' });
  }
  return {
    id: clip.id,
    titulo: clip.title || '',
    canal: clip.channel?.slug || clip.creator?.slug || 'clipe',
    duracaoS: Number(clip.duration) || 0,
    // O endereço vem SEMPRE da API. O caminho tem um par de letras no meio
    // (…/clips/e1/… , …/clips/22/…) que não se deduz do id — construí-lo à
    // mão dá 403 e parece um clipe apagado.
    m3u8: clip.video_url || clip.clip_url,
    vodId: clip.livestream_id ? String(clip.livestream_id) : null,
  };
}
