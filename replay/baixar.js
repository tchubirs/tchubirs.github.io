// Cutting a clip out of a ten-hour VOD without downloading the VOD.
//
// The whole trick is that HLS already stores the stream in ~10-second pieces
// with a wall clock on each one. So a clip is: work out which pieces overlap
// the window, fetch those, and join them. Three segments instead of nine
// gigabytes.
//
// MPEG-TS segments concatenate byte for byte into a valid stream — no
// remuxing, no re-encoding, no ffmpeg. Measured: the CDN serves them as
// `video/MP2T` with `access-control-allow-origin: *` and honours Range, so the
// browser does all of it and there is no server anywhere in this product.
//
// TWO THINGS THIS FILE REFUSES TO DO
//
// 1. It never quietly gives back a clip that starts somewhere else. A cut
//    without re-encoding can only begin where a segment begins, so the file
//    starts up to ~10 s before the mark. That offset is returned, in seconds,
//    for the UI to show — and it is exactly the number the editor needs to
//    trim by, so it is useful rather than an apology.
//
// 2. It never exports what is on screen. Playback runs at 160p to keep 30
//    tiles alive; the export goes to the top rung of the ladder for the same
//    window. Preview quality and file quality are unrelated on purpose.

import { lerMaster, lerPlaylist, segmentosNaJanela } from './kick.js?v=6bed047769';

/** Kick is not ours to hammer. Nothing here opens more sockets than this. */
const AO_MESMO_TEMPO = 4;
const TENTATIVAS = 3;

/** A name that says what it is and when, without opening the file. */
export function nomeDoFicheiro({ canal, quandoMs, sufixo = 'ts' }) {
  const d = new Date(quandoMs);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const carimbo = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`
    + `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  const limpo = String(canal).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 40) || 'canal';
  return `${limpo}__${carimbo}.${sufixo}`;
}

/**
 * One fetch, with retries, that gives up loudly.
 *
 * A job that produced nothing has to be distinguishable from a job that never
 * ran, so every failure carries the URL and the reason rather than resolving
 * to an empty buffer that looks like a very short clip.
 */
async function pegarSegmento(url, { buscar, sinal, aoTentar }) {
  let ultimo = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    if (sinal?.aborted) throw new Error('cancelado');
    try {
      const r = await buscar(url, { signal: sinal });
      if (r.status === 404 || r.status === 403) { const p = new Error(`HTTP ${r.status}`); p.permanente = true; throw p; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = await r.arrayBuffer();
      if (!b.byteLength) throw new Error('segmento vazio');
      return new Uint8Array(b);
    } catch (e) {
      if (e?.name === 'AbortError' || sinal?.aborted) throw new Error('cancelado');
      ultimo = e;
      if (e.permanente) break;
      aoTentar?.({ url, tentativa, erro: e.message });
      // Backing off matters more than it looks: thirty channels retrying in
      // lockstep is a small denial of service against the CDN, and the first
      // thing that would get this tool blocked.
      if (tentativa < TENTATIVAS) {
        await new Promise((ok) => setTimeout(ok, 400 * (2 ** (tentativa - 1)) * (0.5 + Math.random())));
      }
    }
  }
  throw new Error(`${url} falhou: ${ultimo?.message || 'motivo desconhecido'}`);
}

/** Fetch many, a few at a time, keeping the order of the results. */
async function emLotes(itens, tarefa, { limite = AO_MESMO_TEMPO } = {}) {
  const saida = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await tarefa(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return saida;
}

/**
 * Which pieces of which VOD cover this window, at the best rendition there is.
 *
 * Deliberately re-reads the top rung's own playlist instead of reusing the
 * 160p index: the renditions are aligned in practice but nothing guarantees
 * their segment boundaries match, and an export is the one place where a
 * borrowed index would put the cut in the wrong second.
 */
export async function planearCorte({ linha, deMs, ateMs, buscar = fetch, cache = new Map() }) {
  if (!(ateMs > deMs)) return { estado: 'janela-invalida' };

  const peca = linha.pecas.find((p) => deMs < p.playlist.fim && ateMs > p.playlist.inicio);
  if (!peca) {
    // Off air, or outside this channel's night. Both are real answers and the
    // UI must show them; neither is an error and neither is an empty file.
    const buraco = linha.buracos?.find((h) => deMs >= h.de && deMs < h.ate);
    return { estado: buraco ? 'buraco' : 'fora-da-noite', buraco };
  }

  const chave = peca.vod.master;
  if (!cache.has(chave)) {
    const rm = await buscar(chave);
    if (!rm.ok) return { estado: 'master-falhou', http: rm.status };
    const escada = lerMaster(await rm.text(), chave);
    if (!escada.length) return { estado: 'sem-renditions' };
    const melhor = escada[0];
    const rp = await buscar(melhor.url);
    if (!rp.ok) return { estado: 'playlist-falhou', http: rp.status };
    cache.set(chave, { melhor, playlist: lerPlaylist(await rp.text(), melhor.url) });
  }
  const { melhor, playlist } = cache.get(chave);

  const segs = segmentosNaJanela(playlist, deMs, ateMs);
  if (!segs.length) return { estado: 'sem-segmentos' };

  // Where the file will ACTUALLY start. Said out loud, always.
  const inicioReal = segs[0].inicio;
  const fimReal = segs.at(-1).inicio + segs.at(-1).duracaoS * 1000;

  return {
    estado: 'ok',
    canal: linha.slug,
    qualidade: { largura: melhor.largura, altura: melhor.altura, fps: melhor.fps, bitrate: melhor.bitrate },
    segmentos: segs,
    // The two numbers the user actually needs, and the reason this is not an
    // apology: `sobraInicioS` is exactly how much to trim in the editor.
    inicioReal,
    fimReal,
    sobraInicioS: (deMs - inicioReal) / 1000,
    sobraFimS: (fimReal - ateMs) / 1000,
    bytesEstimados: Math.round((melhor.bitrate / 8) * segs.reduce((t, s) => t + s.duracaoS, 0)),
    nome: nomeDoFicheiro({ canal: linha.slug, quandoMs: deMs }),
  };
}

/**
 * Fetch the planned pieces and join them into one file.
 *
 * Resumable by construction: `jaTemos` is a map of url -> bytes that survives
 * between attempts, so a dropped connection re-fetches only what is missing.
 */
export async function executarCorte(plano, {
  buscar = fetch, sinal, aoProgresso, jaTemos = new Map(),
} = {}) {
  if (plano.estado !== 'ok') return { estado: plano.estado, plano };

  let prontos = 0;
  const falhas = [];
  const partes = await emLotes(plano.segmentos, async (s) => {
    if (jaTemos.has(s.url)) { prontos++; aoProgresso?.({ prontos, total: plano.segmentos.length }); return jaTemos.get(s.url); }
    try {
      const b = await pegarSegmento(s.url, { buscar, sinal });
      jaTemos.set(s.url, b);
      prontos++;
      aoProgresso?.({ prontos, total: plano.segmentos.length });
      return b;
    } catch (e) {
      falhas.push({ url: s.url, erro: e.message });
      return null;
    }
  });

  // A hole in the middle is not a shorter clip — it is a clip that jumps, and
  // an editor would only find out on the timeline. Refuse it and say which
  // piece is missing.
  if (falhas.length) {
    return { estado: 'incompleto', plano, falhas, obtidos: prontos, total: plano.segmentos.length };
  }

  const total = partes.reduce((t, p) => t + p.length, 0);
  const juntos = new Uint8Array(total);
  let deslocamento = 0;
  for (const p of partes) { juntos.set(p, deslocamento); deslocamento += p.length; }

  return {
    estado: 'pronto',
    plano,
    bytes: juntos,
    // `video/mp2t`, not mp4: this is the transport stream as the CDN stores it,
    // joined and not transformed. Calling it mp4 would be a lie that Premiere
    // would believe until it opened the file.
    tipo: 'video/mp2t',
    nome: plano.nome,
  };
}

/**
 * The same instant, every angle — the thing this whole tool exists for.
 *
 * Sequential across channels on purpose. Thirty channels × four sockets is a
 * hundred and twenty sockets at one CDN from one address, which is how a free
 * tool gets itself blocked for everyone on the first night it is posted.
 */
export async function cortarTodosOsAngulos({
  linhas, deMs, ateMs, buscar = fetch, sinal, aoProgresso, nudges = {}, margens = {},
}) {
  const cache = new Map();
  const resultados = [];
  for (const [i, linha] of linhas.entries()) {
    if (sinal?.aborted) break;
    const nudge = nudges[linha.slug] || 0;
    // Cada canal pode ter o seu proprio tamanho: o mesmo momento pede mais
    // arranque num angulo e mais rabo noutro, e obrigar todos ao mesmo corte
    // so faz o editor voltar aqui a pedir outra vez.
    const m = margens[linha.slug] || {};
    const antes = (m.antesS || 0) * 1000;
    const depois = (m.depoisS || 0) * 1000;
    aoProgresso?.({ fase: 'planear', canal: linha.slug, feito: i, total: linhas.length });
    const plano = await planearCorte({
      linha, deMs: deMs + nudge - antes, ateMs: ateMs + nudge + depois, buscar, cache,
    });
    if (plano.estado !== 'ok') { resultados.push({ canal: linha.slug, ...plano }); continue; }
    const r = await executarCorte(plano, {
      buscar,
      sinal,
      aoProgresso: (p) => aoProgresso?.({ fase: 'baixar', canal: linha.slug, ...p, feito: i, total: linhas.length }),
    });
    resultados.push({ canal: linha.slug, ...r });
  }
  return resultados;
}
