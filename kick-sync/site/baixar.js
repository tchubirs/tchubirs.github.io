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

import { lerMaster, lerPlaylist, segmentosNaJanela } from './kick.js';

/** Kick is not ours to hammer. Nothing here opens more sockets than this. */
const AO_MESMO_TEMPO = 4;
const TENTATIVAS = 3;
// Quanto se espera por UM pedido antes de o dar por perdido.
//
// Um pedido que pára sem fechar nunca acaba sozinho: sem prazo, a montagem
// ficava presa nesse pedaço para sempre, com o botão apagado, e a única saída
// era recarregar a página e perder o que já estava pronto.
//
// O prazo conta o SILÊNCIO, não o pedido inteiro: cada bocado do corpo que
// chega volta a pôr o relógio a zero. Um prazo para o pedido inteiro falhava
// numa ligação lenta mas viva, porque os pedaços vêm quatro de cada vez
// (`AO_MESMO_TEMPO`) e cada um só leva um quarto da ligação: a 2 Mbit/s um
// pedaço de 11 MB demora mais de seis minutos, e cada tentativa recomeçava do
// zero até o corte voltar 'incompleto'. Assim só conta como falha um pedido
// que passa sessenta segundos sem mandar nada.
export const PRAZO_MS = 60_000;

/**
 * Fazer uma coisa com rede dentro de um prazo, e largá-la se o `sinal` cancelar.
 *
 * O `Promise.race` está lá por quem não ouve o sinal: o `fetch` a sério aborta
 * sozinho, mas um pedido que ignore o `AbortSignal` tinha de acabar na mesma.
 */
async function comPrazo(fazer, { sinal, prazoMs = PRAZO_MS } = {}) {
  const vigia = new AbortController();
  const largar = () => vigia.abort();
  if (sinal?.aborted) vigia.abort(); else sinal?.addEventListener('abort', largar, { once: true });
  let relogio = setTimeout(() => vigia.abort(), prazoMs);
  // Sinal de vida: quem recebe dados chama isto e o prazo recomeça.
  const vivo = () => {
    if (vigia.signal.aborted) return;
    clearTimeout(relogio);
    relogio = setTimeout(() => vigia.abort(), prazoMs);
  };
  const desistir = new Promise((_, nao) => {
    const recusar = () => nao(sinal?.aborted
      ? new DOMException('cancelado', 'AbortError')
      : Object.assign(new Error(`sem resposta em ${Math.round(prazoMs / 1000)} s`), { name: 'PRAZO' }));
    if (vigia.signal.aborted) recusar(); else vigia.signal.addEventListener('abort', recusar, { once: true });
  });
  try {
    return await Promise.race([fazer(vigia.signal, vivo), desistir]);
  } finally {
    clearTimeout(relogio);
    sinal?.removeEventListener('abort', largar);
  }
}

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
/** O corpo inteiro, chamando `vivo` a cada bocado que chega. */
async function lerCorpo(r, vivo) {
  const leitor = r.body?.getReader?.();
  if (!leitor) return r.arrayBuffer();
  const bocados = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (value?.byteLength) { bocados.push(value); total += value.byteLength; vivo(); }
  }
  const junto = new Uint8Array(total);
  let i = 0;
  for (const c of bocados) { junto.set(c, i); i += c.byteLength; }
  return junto.buffer;
}

async function pegarSegmento(url, { buscar, sinal, aoTentar, prazoMs }) {
  let ultimo = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    if (sinal?.aborted) throw new Error('cancelado');
    try {
      // O prazo cobre o pedido E o corpo: um servidor que manda os
      // cabeçalhos e depois se cala prendia o `arrayBuffer()` para sempre.
      // O corpo lê-se aos bocados para que cada bocado conte como sinal de
      // vida (ver `PRAZO_MS`).
      const b = await comPrazo(async (signal, vivo) => {
        const r = await buscar(url, { signal });
        if (r.status === 404 || r.status === 403) { const p = new Error(`HTTP ${r.status}`); p.permanente = true; throw p; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        vivo();
        return lerCorpo(r, vivo);
      }, { sinal, prazoMs });
      if (!b.byteLength) throw new Error('segmento vazio');
      return new Uint8Array(b);
    } catch (e) {
      // Só o cancelamento de quem pediu é que pára as tentativas. Um prazo
      // esgotado também chega como aborto, e esse é uma falha como as outras.
      if (sinal?.aborted) throw new Error('cancelado');
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
/** O que identifica uma peca: o master do VOD, ou a playlist de um clipe. */
const chaveDaPeca = (p) => p.vod.master || p.barato?.url;

export async function planearCorte({
  linha, deMs, ateMs, buscar = fetch, cache = new Map(), sinal, prazoMs, saltar = [],
}) {
  if (!(ateMs > deMs)) return { estado: 'janela-invalida' };

  // `saltar` são os VODs (pelo master) de que já se tirou uma parte deste
  // corte: o resto de uma reconexão pede-se ao VOD seguinte, e não outra vez
  // ao que acabou (ver `oQueFalta`).
  const peca = linha.pecas.find((p) => !saltar.includes(chaveDaPeca(p))
    && deMs < p.playlist.fim && ateMs > p.playlist.inicio);
  if (!peca) {
    // Off air, or outside this channel's night. Both are real answers and the
    // UI must show them; neither is an error and neither is an empty file.
    const buraco = linha.buracos?.find((h) => deMs >= h.de && deMs < h.ate);
    return { estado: buraco ? 'buraco' : 'fora-da-noite', buraco };
  }

  const chave = chaveDaPeca(peca);
  // Um clipe colado nao tem master: a Kick da logo a playlist de um degrau so,
  // que ja esta lida na peca. Pedir `vod.master` era pedir 'undefined'.
  if (!peca.vod.master && peca.playlist?.segmentos) {
    cache.set(chave, { melhor: { bitrate: 0, ...peca.barato }, playlist: peca.playlist });
  }
  if (!cache.has(chave)) {
    // Com o mesmo prazo e o mesmo sinal dos pedaços: sem eles, um Parar a
    // meio do plano só se notava depois de a Kick responder, e uma lista que
    // nunca chegasse prendia a exportação inteira.
    const ler = (url) => comPrazo(async (signal) => {
      const r = await buscar(url, { signal });
      return { ok: r.ok, status: r.status, texto: r.ok ? await r.text() : '' };
    }, { sinal, prazoMs });
    const rm = await ler(chave);
    if (!rm.ok) return { estado: 'master-falhou', http: rm.status };
    const escada = lerMaster(rm.texto, chave);
    if (!escada.length) return { estado: 'sem-renditions' };
    const melhor = escada[0];
    const rp = await ler(melhor.url);
    if (!rp.ok) return { estado: 'playlist-falhou', http: rp.status };
    cache.set(chave, { melhor, playlist: lerPlaylist(rp.texto, melhor.url) });
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
    master: chave,
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
  buscar = fetch, sinal, aoProgresso, jaTemos = new Map(), prazoMs,
} = {}) {
  if (plano.estado !== 'ok') return { estado: plano.estado, plano };

  let prontos = 0;
  const falhas = [];
  const partes = await emLotes(plano.segmentos, async (s) => {
    if (jaTemos.has(s.url)) { prontos++; aoProgresso?.({ prontos, total: plano.segmentos.length }); return jaTemos.get(s.url); }
    try {
      const b = await pegarSegmento(s.url, { buscar, sinal, prazoMs });
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
    // Um canal que rebenta não leva os outros com ele. O `planearCorte` deixa
    // passar a rejeição do `fetch` (a rede caiu, o DNS falhou), e sem este
    // `try` um erro no primeiro canal deitava fora o resultado de todos.
    try {
      const plano = await planearCorte({
        linha, deMs: deMs + nudge - antes, ateMs: ateMs + nudge + depois, buscar, cache, sinal,
      });
      if (plano.estado !== 'ok') { resultados.push({ canal: linha.slug, ...plano }); continue; }
      const r = await executarCorte(plano, {
        buscar,
        sinal,
        aoProgresso: (p) => aoProgresso?.({ fase: 'baixar', canal: linha.slug, ...p, feito: i, total: linhas.length }),
      });
      resultados.push({ canal: linha.slug, ...r });
    } catch (e) {
      if (sinal?.aborted) break;
      resultados.push({ canal: linha.slug, estado: 'erro', erro: e?.message || String(e) });
    }
  }
  return resultados;
}

/**
 * O resto de um corte que a live partiu ao meio, quando há resto a buscar.
 *
 * Numa reconexão a Kick fecha um VOD e abre outro, e o `planearCorte` lê um
 * só: o que vinha depois da queda ficava de fora, e o ficheiro dizia-se
 * pronto. Num evento de quinhentos streamers um OBS que religa a meio de um
 * raid não é raro, e a kill pode estar justamente do lado de lá. Isto diz se
 * outro VOD do mesmo canal cobre o que falta, e de onde o pedir, para o resto
 * sair num ficheiro a seguir (dois ficheiros e não um: juntar pedaços de dois
 * VODs num .ts só dá um relógio que salta, e os editores tropeçam nisso).
 *
 * @param {{pecas: Array}} linha
 * @param {object} plano o que o `planearCorte` devolveu para a primeira parte
 * @param {number} ateMs o fim pedido, no relógio da playlist
 * @param {string[]} [saltar] os VODs de partes anteriores
 * @returns {{deMs: number, ateMs: number, saltar: string[]} | null}
 */
export function oQueFalta(linha, plano, ateMs, saltar = []) {
  if (plano?.estado !== 'ok' || !(plano.sobraFimS < -0.05)) return null;
  const fora = [...saltar, plano.master];
  const deMs = plano.fimReal;
  const ha = linha.pecas.some((p) => !fora.includes(chaveDaPeca(p))
    && deMs < p.playlist.fim && ateMs > p.playlist.inicio);
  return ha ? { deMs, ateMs, saltar: fora } : null;
}

/**
 * Soltar da cache da montagem os pedaços que nenhum clipe que falta vai pedir.
 *
 * A montagem passa um `jaTemos` só a todos os cortes, e um pedaço de 10 s a
 * 1080p60 pesa perto de 11 MB. Guardar tudo até ao fim eram gigas presos numa
 * noite de quarenta kills, e o separador morria a meio sem entregar nada. A
 * cache só ajuda quando o MESMO canal volta a precisar do mesmo pedaço (duas
 * kills próximas do mesmo protagonista); ângulos diferentes têm endereços
 * diferentes e nunca a partilham.
 *
 * @param {Map<string, Uint8Array>} jaTemos url -> bytes
 * @param {Map<string, {canal: string, inicio: number, fim: number}>} sitios
 *   de que canal e de que instante é cada pedaço guardado
 * @param {{canal: string, deMs: number, ateMs: number}[]} faltam os cortes que
 *   ainda vêm, no relógio da playlist (já com o ajuste do canal)
 */
export function largarOQueNaoServe(jaTemos, sitios, faltam) {
  for (const url of [...jaTemos.keys()]) {
    const s = sitios.get(url);
    const serve = s && faltam.some((c) => c.canal === s.canal && c.deMs < s.fim && c.ateMs > s.inicio);
    if (!serve) { jaTemos.delete(url); sitios.delete(url); }
  }
}
