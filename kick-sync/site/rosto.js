// A webcam achada sozinha no 9:16 (IDEIAS.md, ideia 3).
//
// Um vendedor de cortes diz que perder a webcam é o que mais estraga um clipe vertical de jogo. O dono
// já tinha os quatro modelos de canto e o encaixe guardado por streamer (10/10); isto põe por cima um
// detector de rosto que roda no aparelho: olha uns cinco quadros do vídeo do canal, acha o rosto do
// streamer e propõe a caixa da webcam. Cada ângulo tem a sua, porque cada streamer tem a câmera num sítio.
//
// Três coisas que não são óbvias e por isso estão escritas:
//
// 1. O BlazeFace de curto alcance olha para a imagem a 128x128. Um quadro de 720p inteiro encolhido a
//    128 deixa um rosto de webcam com dez pixels, e aí ele não acha nada. Por isso o quadro é lido em
//    ladrilhos quadrados de meia altura, sobrepostos, e cada ladrilho vai ao detector à parte.
// 2. Num jogo há rostos que não são o do streamer (o boneco de outro jogador, um retrato no menu). O do
//    streamer é o que está NO MESMO SÍTIO em vários quadros; o resto anda. Fica o grupo que aparece em
//    mais quadros.
// 3. O quadro tem de sair de uma tela que se pode ler. O vídeo da Kick vem pelo hls.js (MediaSource) e
//    com `crossOrigin` quando vem direto, como no ler-tela.js, e a Kick responde com
//    `access-control-allow-origin: *`; uma tela suja dá erro no `createImageBitmap`, e isso conta como
//    "não deu para ler", nunca como "não há rosto".
//
// A geometria (os ladrilhos, juntar os rostos, a caixa) é pura, para se testar sem navegador.

import { proporcaoDoQuadro, limitar, encaixar, DIVISAO_OMISSAO } from './retrato.js';

/** Quantos quadros se olham por canal. */
export const QUADROS_POR_CANAL = 5;

/**
 * Os pedaços do quadro que vão ao detector, em pixels: o quadro inteiro (um rosto grande, de câmera
 * em tela cheia) e ladrilhos quadrados de meia altura, a andar meio ladrilho de cada vez.
 */
export function ladrilhos(largura, altura) {
  if (!(largura > 0 && altura > 0)) return [];
  const lista = [{ x: 0, y: 0, largura, altura }];
  const lado = Math.round(Math.min(largura, altura) / 2);
  const passo = Math.round(lado / 2);
  const posicoes = (total) => {
    const ps = [];
    for (let p = 0; p + lado <= total; p += passo) ps.push(p);
    // O último encosta à borda: sem isto a faixa da direita (ou de baixo) ficava fora de todos.
    if (ps[ps.length - 1] + lado < total) ps.push(total - lado);
    return ps;
  };
  for (const y of posicoes(altura)) for (const x of posicoes(largura)) lista.push({ x, y, largura: lado, altura: lado });
  return lista;
}

const area = (r) => Math.max(0, r.largura) * Math.max(0, r.altura);

/** Quanto dois retângulos se sobrepõem: a interseção sobre a união, de 0 a 1. */
export function sobreposicao(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.largura, b.x + b.largura);
  const y1 = Math.min(a.y + a.altura, b.y + b.altura);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const uniao = area(a) + area(b) - inter;
  return uniao > 0 ? inter / uniao : 0;
}

/** O mesmo rosto achado em dois ladrilhos vizinhos conta uma vez: fica o de nota maior. */
export function semRepetidos(rostos, limite = 0.3) {
  const ordem = [...rostos].sort((a, b) => b.nota - a.nota);
  const ficam = [];
  for (const r of ordem) {
    if (!ficam.some((f) => sobreposicao(f, r) > limite)) ficam.push(r);
  }
  return ficam;
}

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * O rosto do streamer, a partir do que o detector achou em cada quadro.
 *
 * `porQuadro`: uma lista por quadro lido, com os rostos em fracção da fonte ({ x, y, largura, altura,
 * nota }). Junta-se o que está no mesmo sítio e do mesmo tamanho de quadro para quadro; ganha o grupo
 * visto em mais quadros, depois o de nota média maior. Com dois quadros ou mais lidos, um rosto visto
 * só num não conta: é um boneco que passou.
 *
 * @returns {{x:number,y:number,largura:number,altura:number,nota:number,quadros:number}|null}
 */
export function juntarRostos(porQuadro) {
  const lidos = (porQuadro || []).filter(Array.isArray);
  if (!lidos.length) return null;
  const grupos = [];
  lidos.forEach((rostos, q) => {
    for (const r of semRepetidos(rostos.filter((x) => x && x.largura > 0 && x.altura > 0))) {
      const cx = r.x + r.largura / 2;
      const cy = r.y + r.altura / 2;
      const grupo = grupos.find((g) => {
        const k = g.membros[0];
        const gx = k.x + k.largura / 2;
        const gy = k.y + k.altura / 2;
        const tam = Math.max(k.largura, r.largura);
        const razao = r.largura / k.largura;
        return Math.abs(cx - gx) <= tam * 0.6 && Math.abs(cy - gy) <= tam * 0.6 && razao > 0.5 && razao < 2;
      });
      if (grupo) { grupo.membros.push(r); grupo.quadros.add(q); } else grupos.push({ membros: [r], quadros: new Set([q]) });
    }
  });
  const minimo = lidos.length >= 2 ? 2 : 1;
  const bons = grupos.filter((g) => g.quadros.size >= minimo);
  if (!bons.length) return null;
  const media = (g) => g.membros.reduce((s, r) => s + r.nota, 0) / g.membros.length;
  bons.sort((a, b) => b.quadros.size - a.quadros.size || media(b) - media(a));
  const g = bons[0];
  return {
    x: mediana(g.membros.map((r) => r.x)),
    y: mediana(g.membros.map((r) => r.y)),
    largura: mediana(g.membros.map((r) => r.largura)),
    altura: mediana(g.membros.map((r) => r.altura)),
    nota: media(g),
    quadros: g.quadros.size,
  };
}

/** Quantas vezes a largura do rosto cabe na largura da caixa da webcam: a cabeça, o cabelo e os ombros. */
export const FOLGA_ROSTO = 2.6;

/**
 * A caixa da webcam (o recorte 1 do "2 enquadramentos") à volta de um rosto.
 *
 * `rosto` em fracção da fonte. A caixa tem a proporção da faixa de cima (senão sairia esticada), o
 * rosto no meio na horizontal e um pouco acima do meio na vertical, que é como uma webcam enquadra
 * uma pessoa. Perto de uma borda encosta nela (as webcams vivem nos cantos), e nunca sai da fonte.
 */
export function caixaDaWebcam(rosto, fonte, divisao = DIVISAO_OMISSAO) {
  if (!rosto || !(fonte?.largura > 0 && fonte?.altura > 0)) return null;
  const f = {
    x: rosto.x * fonte.largura, y: rosto.y * fonte.altura,
    largura: rosto.largura * fonte.largura, altura: rosto.altura * fonte.altura,
  };
  if (!(f.largura > 0 && f.altura > 0)) return null;
  const prop = proporcaoDoQuadro('dois', 0, divisao);
  const largura = Math.max(f.largura * FOLGA_ROSTO, fonte.largura * 0.1);
  const altura = largura / prop;
  const cx = f.x + f.largura / 2;
  const cy = f.y + f.altura / 2 + f.altura * 0.15;
  const solta = limitar({ x: cx - largura / 2, y: cy - altura / 2, largura, altura }, fonte);
  return limitar(encaixar(solta, fonte).rect, fonte);
}

/** Os instantes a olhar dentro do clipe: espalhados, sem as pontas (a entrada e a saída mudam de cena). */
export function instantesDoClipe(deMs, ateMs, n = QUADROS_POR_CANAL) {
  if (!(ateMs > deMs) || !(n > 0)) return [];
  return Array.from({ length: n }, (_, i) => Math.round(deMs + ((i + 0.5) * (ateMs - deMs)) / n));
}

// ── o detector ───────────────────────────────────────────────────────────────

/**
 * O detector a sério: o Worker com o MediaPipe. `detectar(imagem)` leva um ImageBitmap (que passa a ser
 * do Worker) e devolve os rostos em pixels dessa imagem. `aoBaixar({feito,total})` diz o progresso da
 * primeira vez.
 */
export function abrirDetector({
  criar = () => new Worker(new URL('./rosto-worker.js', import.meta.url), { type: 'module' }),
  aoBaixar = () => {},
  limiteMs = 120_000,
} = {}) {
  const w = criar();
  const espera = new Map();
  let id = 0;
  let morto = null;
  const falharTodos = (e) => {
    morto = e;
    for (const [, p] of espera) p.falha(e);
    espera.clear();
  };
  w.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.tipo === 'baixar') { aoBaixar({ feito: m.feito, total: m.total }); return; }
    const p = espera.get(m.id);
    if (!p) return;
    espera.delete(m.id);
    if (m.tipo === 'pronto') p.ok(m.rostos || []);
    else p.falha(Object.assign(new Error(m.mensagem || 'detector'), { name: m.nome || 'Error' }));
  };
  w.onerror = (e) => { e?.preventDefault?.(); falharTodos(Object.assign(new Error(e?.message || 'worker'), { name: 'WORKER' })); };
  return {
    detectar(imagem) {
      if (morto) { imagem?.close?.(); return Promise.reject(morto); }
      const meu = ++id;
      return new Promise((ok, falha) => {
        // O primeiro pedido espera pelo download (12 MB); os outros são milissegundos.
        const relogio = setTimeout(() => { espera.delete(meu); falha(Object.assign(new Error('demorou'), { name: 'TEMPO' })); }, limiteMs);
        espera.set(meu, {
          ok: (r) => { clearTimeout(relogio); ok(r); },
          falha: (e) => { clearTimeout(relogio); falha(e); },
        });
        w.postMessage({ tipo: 'detectar', id: meu, imagem }, imagem ? [imagem] : []);
      });
    },
    fechar() { falharTodos(Object.assign(new Error('fechado'), { name: 'AbortError' })); w.terminate(); },
  };
}

/** Maior lado de um ladrilho mandado ao detector: o modelo lê a 128, e mandar 4K não ajuda nada. */
const LADO_MAX = 320;

/**
 * Os rostos de um quadro, em fracção da fonte: o quadro passa ladrilho a ladrilho pelo detector e os
 * repetidos (o mesmo rosto em dois ladrilhos) saem.
 */
export async function rostosDoQuadro(tela, detector, { criarImagem = globalThis.createImageBitmap } = {}) {
  const largura = tela.width;
  const altura = tela.height;
  const achados = [];
  for (const l of ladrilhos(largura, altura)) {
    const k = Math.min(1, LADO_MAX / Math.max(l.largura, l.altura));
    const iw = Math.max(1, Math.round(l.largura * k));
    const ih = Math.max(1, Math.round(l.altura * k));
    const imagem = await criarImagem(tela, l.x, l.y, l.largura, l.altura, { resizeWidth: iw, resizeHeight: ih, resizeQuality: 'high' });
    const rostos = await detector.detectar(imagem);
    for (const r of rostos) {
      achados.push({
        x: (l.x + r.x / k) / largura,
        y: (l.y + r.y / k) / altura,
        largura: r.largura / k / largura,
        altura: r.altura / k / altura,
        nota: r.nota ?? 0,
      });
    }
  }
  return semRepetidos(achados);
}

/**
 * Procurar o rosto do streamer em alguns instantes do vídeo dele.
 *
 * `quadro(ms)` devolve { tela } ou null (um instante sem imagem, um vídeo que não carregou). Lê-se um
 * de cada vez, que o vídeo escondido só está num sítio de cada vez.
 *
 * @returns {Promise<{rosto: object|null, lidos: number}>}
 */
export async function procurarRosto({ instantes, quadro, detector, sinal, criarImagem }) {
  const porQuadro = [];
  for (const ms of instantes) {
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    const q = await quadro(ms);
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    if (!q?.tela?.width) continue;
    porQuadro.push(await rostosDoQuadro(q.tela, detector, { criarImagem }));
  }
  return { rosto: juntarRostos(porQuadro), lidos: porQuadro.length };
}

// ── os quadros ───────────────────────────────────────────────────────────────

/** O degrau a ler: o de 720p (ou o mais alto abaixo), que chega para um rosto de webcam e baixa pouco. */
export function degrauDoRosto(escada = []) {
  const ate = escada.filter((d) => (d.altura || 0) <= 720 && (d.altura || 0) >= 360)
    .sort((a, b) => (b.altura || 0) - (a.altura || 0));
  return ate[0] || escada[0] || null;
}

/**
 * Um apanhador de quadros escondido, à parte da prévia do editor (que a pessoa está a ver e não pode
 * saltar sozinha). `quadro({ url, tempoS })`: o quadro desse instante, numa tela que se pode ler.
 */
export function abrirQuadrosEscondidos({ limiteMs = 15_000 } = {}) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Direto da CDN (sem hls.js): sem isto a tela fica suja e não se lê nada.
  video.crossOrigin = 'anonymous';
  // Fora do ecrã mas desenhado: com display:none o quadro sai preto.
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0.01;pointer-events:none;';
  video.setAttribute('aria-hidden', 'true');
  document.body.append(video);
  let hls = null;
  let url = null;
  let falhou = false;
  const tela = document.createElement('canvas');

  function carregar(novo, tempoS) {
    if (url === novo) return;
    hls?.destroy();
    hls = null;
    url = novo;
    falhou = false;
    if (window.Hls?.isSupported()) {
      hls = new window.Hls({ startPosition: tempoS, maxBufferLength: 4, maxMaxBufferLength: 8, capLevelToPlayerSize: false });
      if (hls.on && window.Hls.Events?.ERROR) hls.on(window.Hls.Events.ERROR, (_, d) => { if (d?.fatal) falhou = true; });
      hls.loadSource(novo);
      hls.attachMedia(video);
    } else {
      video.src = novo;
    }
  }

  function chegar(tempoS) {
    return new Promise((pronto) => {
      const acabou = (ok) => {
        clearTimeout(t); clearInterval(vigia);
        video.removeEventListener('seeked', ver); video.removeEventListener('loadeddata', ver);
        pronto(ok);
      };
      function ver() { if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - tempoS) < 1) acabou(true); }
      const t = setTimeout(() => acabou(false), limiteMs);
      const vigia = setInterval(() => { if (falhou || video.error) acabou(false); else ver(); }, 150);
      video.addEventListener('seeked', ver);
      video.addEventListener('loadeddata', ver);
      if (Math.abs(video.currentTime - tempoS) > 0.04) video.currentTime = tempoS;
      ver();
    });
  }

  return {
    async quadro({ url: novo, tempoS }) {
      if (!novo || !Number.isFinite(tempoS)) return null;
      carregar(novo, tempoS);
      if (!(await chegar(tempoS)) || !video.videoWidth) return null;
      tela.width = video.videoWidth;
      tela.height = video.videoHeight;
      tela.getContext('2d').drawImage(video, 0, 0);
      return { tela, largura: tela.width, altura: tela.height };
    },
    // Pode ser chamado duas vezes (o cancelar e o fim da procura). O `falhou` solta um salto pendurado.
    fechar() {
      falhou = true;
      hls?.destroy();
      hls = null;
      video.removeAttribute('src');
      video.load?.();
      video.remove();
    },
  };
}

// ── a memória ────────────────────────────────────────────────────────────────

/** Onde fica o rosto achado de cada streamer: no aparelho, para não procurar de novo. */
export const CHAVE_ROSTOS = 'replay.rostos';

/** O rosto guardado de um streamer, em fracções da fonte, ou `null`. */
export function rostoGuardado(slug, armazem = globalThis.localStorage) {
  try {
    const todos = JSON.parse(armazem?.getItem(CHAVE_ROSTOS) || '{}');
    const r = todos?.[slug];
    const ok = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
    if (r && ok(r.x) && ok(r.y) && ok(r.largura) && ok(r.altura) && r.largura > 0 && r.altura > 0) {
      return { x: r.x, y: r.y, largura: r.largura, altura: r.altura };
    }
  } catch { /* estragado ou sem armazém: procura-se de novo */ }
  return null;
}

/** Guardar o rosto achado de um streamer. */
export function guardarRosto(slug, rosto, armazem = globalThis.localStorage) {
  try {
    const todos = JSON.parse(armazem?.getItem(CHAVE_ROSTOS) || '{}');
    const limpo = todos && typeof todos === 'object' && !Array.isArray(todos) ? todos : {};
    limpo[slug] = { x: rosto.x, y: rosto.y, largura: rosto.largura, altura: rosto.altura };
    armazem?.setItem(CHAVE_ROSTOS, JSON.stringify(limpo));
  } catch { /* janela privada: fica só nesta sessão */ }
}
