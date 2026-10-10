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
    // O fim que vai mais longe, e não o do último a começar: um VOD de uma
    // reconexão pode começar depois e acabar antes do comprido, e com o fim
    // dele o canal dizia "já tinha acabado" com o VOD comprido ainda a tocar.
    fim: boas.length ? Math.max(...boas.map((p) => p.playlist.fim).filter(Number.isFinite)) : null,
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
// Os tectos de uma sessao lida. Eram 50 canais e 300 kills, e o evento tem
// quinhentos streamers: um F5 deixava cinquenta na caixa e o guardar seguinte
// gravava esses cinquenta por cima da lista inteira. Continua a haver tecto,
// para um link escrito a mao nao pedir cinquenta mil canais a Kick.
export const MAXIMO_CANAIS = 1000;
export const MAXIMO_MOMENTOS = 5000;

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
    momentos: Array.isArray(sessao.momentos) ? sessao.momentos.slice(0, MAXIMO_MOMENTOS) : [],
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
    // E o que vem dentro de cada objecto tambem se le. Um nudge em texto virava
    // conta de juntar letras no `onde`, e um volume 'x' dava NaN, que o
    // <video> recusa com um erro que parava a noite a meio de abrir.
    const so = (x, valido) => Object.fromEntries(Object.entries(objecto(x))
      .filter(([, v]) => valido(v)));
    const numero = (v) => typeof v === 'number' && Number.isFinite(v);
    return {
      canais: j.canais.filter((c) => typeof c === 'string').slice(0, MAXIMO_CANAIS),
      nudges: so(j.nudges, numero),
      marca: j.marca && Number.isFinite(j.marca.de) && Number.isFinite(j.marca.ate) ? j.marca : null,
      agora: Number.isFinite(j.agora) ? j.agora : null,
      focos: (Array.isArray(j.focos) ? j.focos : []).filter((c) => typeof c === 'string').slice(0, 2),
      margens: so(j.margens, (m) => m && typeof m === 'object'
        && ['antesS', 'depoisS'].every((k) => m[k] == null || (numero(m[k]) && m[k] >= 0))),
      mudo: so(j.mudo, (v) => typeof v === 'boolean'),
      volume: so(j.volume, (v) => numero(v) && v >= 0 && v <= 1),
      // As kills marcadas sao o que mais custa a juntar: uma hora de video
      // vista a procurar. Perde-las num F5 e perder a tarde.
      momentos: (Array.isArray(j.momentos) ? j.momentos : [])
        .filter((m) => m && Number.isFinite(m.ms)).slice(0, MAXIMO_MOMENTOS),
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

/**
 * Um passo do relógio que segue o vídeo, já com a âncora puxada para a frente.
 *
 * O limite de uma hora de `instanteSeguindo` é para apanhar um salto (um
 * pedaço novo com o tempo recomeçado), não para medir o tempo de reprodução.
 * Mas a âncora só se punha no `irPara`, e quem via a reprodução seguida
 * durante mais de uma hora ficava com o relógio parado: o risco congelava e
 * "Marcar kill" gravava dez minutos antes do que estava no ecrã. Puxando a
 * âncora a cada passo, o limite volta a medir só o salto entre dois passos.
 *
 * @returns {{ms:number|null, ancora:object}}
 */
export function seguirAncora(ancora, video, opcoes) {
  const ms = instanteSeguindo(ancora, video, opcoes);
  if (ms == null) return { ms: null, ancora };
  return { ms, ancora: { ...ancora, ms, tempoS: video.currentTime } };
}

/**
 * Andar no tempo com a tecla carregada.
 *
 * "Podia pôr a letra A e a letra D para voltar e avançar 3 segundos a cada
 *  clique, e se segurasse pressionado fica voltando ou avançando mais — não
 *  sei como fazer isso em escala de tempo."
 *
 * A escala é esta, e a conta que a justifica está ao lado. Um toque vale três
 * segundos, como os botões ‹3s / 3s›. Segurar dispara nove passos por segundo,
 * e o tamanho do passo cresce com o tempo que a tecla leva carregada:
 *
 *   até 1 s carregada     3 s por passo   ≈ 27 s de vídeo por segundo real
 *   até 2 s               10 s            ≈ 90 s/s
 *   até 3,5 s             30 s            ≈ 270 s/s
 *   a partir daí          60 s            ≈ 540 s/s
 *
 * O último degrau é o que decide se isto serve: uma noite de dez horas são
 * 36 000 segundos, e a 540 por segundo atravessa-se em pouco mais de um
 * minuto sem largar a tecla. Mais depressa do que isso passava por cima de
 * tudo; mais devagar não chegava ao outro lado da noite.
 */
export const ARRASTO_INTERVALO_MS = 110;
export const ARRASTO_ESPERA_MS = 350;
export const ARRASTO_ESCADA = [
  { apos: 3500, passo: 60_000 },
  { apos: 2000, passo: 30_000 },
  { apos: 1000, passo: 10_000 },
  { apos: 0, passo: 3_000 },
];

/** O passo de agora, pelo tempo que a tecla já leva carregada. */
export function passoDoArrasto(seguradoMs) {
  const ms = Number.isFinite(seguradoMs) ? Math.max(0, seguradoMs) : 0;
  return ARRASTO_ESCADA.find((d) => ms >= d.apos).passo;
}

/**
 * Que pedaço da noite é que a linha do tempo mostra.
 *
 * "Com tanto tempo aparecendo, as barras ficaram muito pequenas, não? Talvez
 *  um botão pra escolher mostrar mais tempo ou menos nessa linha do tempo."
 *
 * Tinha razão, e a conta diz quanto: a noite dele são 34 horas de janela comum
 * espalhadas por uns 450 px de faixa. Dá 4,5 minutos por pixel — um tiroteio
 * de noventa segundos ocupa um TERÇO de pixel e não existe no ecrã.
 *
 * A vista é uma janela de `zoomS` segundos centrada no instante em que ele
 * está, presa dentro da noite. Com `zoomS` a zero, ou maior do que a noite, é
 * a noite inteira — que é como sempre esteve.
 */
export function vistaDaLinha(janela, agoraMs, zoomS = 0) {
  if (!janela || !(janela.fim > janela.inicio)) return janela;
  const total = janela.fim - janela.inicio;
  const largura = Number.isFinite(zoomS) && zoomS > 0 ? zoomS * 1000 : total;
  if (largura >= total) return { inicio: janela.inicio, fim: janela.fim };
  const centro = Number.isFinite(agoraMs) ? agoraMs : janela.inicio + largura / 2;
  const de = Math.max(janela.inicio, Math.min(centro - largura / 2, janela.fim - largura));
  return { inicio: de, fim: de + largura };
}

/**
 * A vista só se mexe quando o cursor lhe chega perto da beira.
 *
 * Recentrar a cada instante obrigava a repintar dezoito faixas sessenta vezes
 * por segundo, e o cursor ficava pregado ao meio — o que se quer ver é ele a
 * ANDAR. Com uma margem de um quinto, a vista está quieta quase sempre e
 * salta uma vez quando ele sai pela ponta.
 */
export function saiuDaVista(vista, agoraMs, margem = 0.2) {
  if (!vista || !(vista.fim > vista.inicio)) return false;
  const l = vista.fim - vista.inicio;
  return agoraMs < vista.inicio + l * margem || agoraMs > vista.fim - l * margem;
}

// ── o zoom contínuo da linha do tempo ───────────────────────────────────────
//
// O dono, 10/10: "igual nos editores de vídeo: o quanto de linha do tempo aparece, dando zoom e
// diminuindo a linha, ou tirando zoom e aumentando, até ter o máximo". Um deslizante em vez de cinco
// degraus fixos. A escala é logarítmica, como a de qualquer editor: cada passo do deslizante multiplica
// o tempo à vista pelo mesmo fator, e por isso ir de 30 s a 1 min custa o mesmo gesto que de 6 h a 12 h.

/** O menos que a linha mostra: uns 30 segundos, o bastante para ver um tiroteio segundo a segundo. */
export const ZOOM_MIN_MS = 30_000;
/** As posições do deslizante. Mil dão um passo de menos de 1% numa noite de dez horas. */
export const ZOOM_PASSOS = 1000;

/** O mínimo que cabe nesta noite: 30 s, ou a noite inteira se ela for mais curta do que isso. */
const minimoDe = (totalMs) => Math.min(ZOOM_MIN_MS, totalMs);

/**
 * Do deslizante (0 = a noite toda, ZOOM_PASSOS = 30 s) para o tempo à vista, em ms.
 * Fora do intervalo fica na ponta: o máximo é a noite toda, e o mínimo uns 30 s.
 */
export function larguraDoZoom(totalMs, valor) {
  if (!(totalMs > 0)) return 0;
  const min = minimoDe(totalMs);
  const v = Math.min(ZOOM_PASSOS, Math.max(0, Number.isFinite(valor) ? valor : 0));
  return Math.round(totalMs * (min / totalMs) ** (v / ZOOM_PASSOS));
}

/** O contrário: a posição do deslizante para um tempo à vista. */
export function valorDoZoom(totalMs, larguraMs) {
  if (!(totalMs > 0)) return 0;
  const min = minimoDe(totalMs);
  if (min >= totalMs) return 0;
  const l = Math.min(totalMs, Math.max(min, Number.isFinite(larguraMs) && larguraMs > 0 ? larguraMs : totalMs));
  return Math.round((Math.log(l / totalMs) / Math.log(min / totalMs)) * ZOOM_PASSOS);
}

/**
 * Aproximar ou afastar mantendo um instante no mesmo sítio do ecrã, como o Ctrl + roda de um editor:
 * o que está debaixo do rato fica debaixo do rato. `pontoMs` é esse instante; sem ele, o meio da vista.
 * A largura nova fica entre os 30 s e a noite, e a vista nunca sai da noite.
 */
export function zoomEmVolta(janela, vista, larguraMs, pontoMs) {
  if (!janela || !(janela.fim > janela.inicio)) return janela;
  const total = janela.fim - janela.inicio;
  const largura = Math.min(total, Math.max(minimoDe(total), Number.isFinite(larguraMs) ? larguraMs : total));
  if (largura >= total) return { inicio: janela.inicio, fim: janela.fim };
  const v = vista && vista.fim > vista.inicio ? vista : janela;
  const ponto = Number.isFinite(pontoMs) ? Math.min(v.fim, Math.max(v.inicio, pontoMs)) : (v.inicio + v.fim) / 2;
  const fracao = (ponto - v.inicio) / (v.fim - v.inicio);
  const de = Math.min(Math.max(janela.inicio, ponto - fracao * largura), janela.fim - largura);
  return { inicio: Math.round(de), fim: Math.round(de) + largura };
}

/** Andar com a vista, do mesmo tamanho, sem sair da noite. */
export function andarVista(janela, vista, deltaMs) {
  if (!janela || !vista || !(vista.fim > vista.inicio)) return vista;
  const largura = vista.fim - vista.inicio;
  if (largura >= janela.fim - janela.inicio) return { inicio: janela.inicio, fim: janela.fim };
  const de = Math.min(Math.max(janela.inicio, vista.inicio + (Number(deltaMs) || 0)), janela.fim - largura);
  return { inicio: Math.round(de), fim: Math.round(de) + largura };
}
