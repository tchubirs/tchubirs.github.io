// Ler os nomes que aparecem na tela de um streamer de Rust, quadro a quadro.
//
// O dono, 10/10: achar o time pelo som não funcionou bem. No Rust os nomes estão na tela: a lista do
// time no canto de baixo à esquerda (verde, com uma bolinha antes; muitas vezes tapada pela webcam), a
// sobreposição do Discord numa das laterais (às vezes só quem está falando) e o nome em cima de quem
// está perto. Isto recorta essas partes de cada quadro, deixa o texto preto no branco e passa por um
// leitor de texto (o Tesseract, guardado em vendor/ e carregado só quando alguém usa isto).
//
// Medido em 10/10 em VODs reais de Rust na Kick (1080p): a lista do time fica entre 87% e 100% da
// altura e nos primeiros 25% da largura, em duas colunas; o verde dos nomes vai de (106,153,19) a
// (197,245,88). Quem está morto vem a vermelho com um x, e quem saiu do jogo a cinzento.
//
// De onde vem o quadro: o vídeo da Kick chega pelo hls.js, que pede os pedaços com fetch e os entrega
// ao <video> por MediaSource. A Kick responde com `access-control-allow-origin: *` (medido em 10/10 no
// master, na playlist e nos pedaços), e um vídeo alimentado por MediaSource não suja a tela: o
// getImageData funciona. É o mesmo caminho do frames.js, mas no degrau mais nítido em vez do de 160p,
// porque em 160p não há letra que se leia.

import { lerMaster, lerPlaylist, tempoDeMidia } from './kick.js?v=78c992b68e';

/**
 * As partes da tela onde os nomes aparecem, em fração da largura e da altura.
 * `filtro` diz que texto se guarda: o verde (e o vermelho de quem morreu) da lista do time, ou o claro
 * do Discord e dos nomes em cima dos jogadores.
 */
export const REGIOES = [
  { id: 'time', x: 0, y: 0.84, l: 0.3, a: 0.16, filtro: 'verde' },
  { id: 'esquerda', x: 0, y: 0.06, l: 0.24, a: 0.72, filtro: 'claro' },
  { id: 'direita', x: 0.76, y: 0.06, l: 0.24, a: 0.72, filtro: 'claro' },
  { id: 'centro', x: 0.3, y: 0.22, l: 0.4, a: 0.4, filtro: 'claro' },
];

/** Se um pixel é letra, para cada filtro. Puro, para se poder testar sem navegador. */
export function ehLetra(filtro, r, g, b) {
  if (filtro === 'verde') {
    // O verde da lista do Rust, e o vermelho de quem está morto (também é do time).
    const verde = g >= 130 && g - b >= 70 && g - r >= 25;
    const vermelho = r >= 140 && r - g >= 70 && r - b >= 70;
    return verde || vermelho;
  }
  // Claro: branco ou quase, sem cor forte. O Discord escreve os nomes a branco; o jogo, a branco também.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min >= 175 && max - min <= 70;
}

/**
 * Deixa a imagem a preto no branco: letra a preto, o resto a branco. Muda `dados` (RGBA) no sítio e
 * devolve quantos pixéis ficaram letra, para não mandar ao leitor um recorte vazio.
 */
export function limiarizar(dados, filtro) {
  let letras = 0;
  for (let i = 0; i < dados.length; i += 4) {
    const sim = ehLetra(filtro, dados[i], dados[i + 1], dados[i + 2]);
    const v = sim ? 0 : 255;
    if (sim) letras++;
    dados[i] = v; dados[i + 1] = v; dados[i + 2] = v; dados[i + 3] = 255;
  }
  return letras;
}

/** Quanto ampliar: o leitor gosta de letras com uns 30 px, e a lista do time tem uns 17 px em 1080p. */
export const escalaPara = (alturaDoQuadro) => Math.min(4, Math.max(2, Math.round((2 * 1080) / Math.max(1, alturaDoQuadro))));

const caixaDe = (regiao, { largura, altura }) => ({
  sx: Math.round(regiao.x * largura),
  sy: Math.round(regiao.y * altura),
  sl: Math.round(regiao.l * largura),
  sa: Math.round(regiao.a * altura),
});

/**
 * Um recorte de uma região, ampliado e a preto no branco. Devolve { tela, letras, fracao }: a tela vai
 * ao leitor. A miniatura para o painel é à parte (`miniatura`), só para os recortes que ficam.
 */
export function recortar(fonte, regiao, { largura, altura }) {
  const { sx, sy, sl, sa } = caixaDe(regiao, { largura, altura });
  const e = escalaPara(altura);
  const tela = document.createElement('canvas');
  tela.width = sl * e;
  tela.height = sa * e;
  const g = tela.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(fonte, sx, sy, sl, sa, 0, 0, tela.width, tela.height);
  const img = g.getImageData(0, 0, tela.width, tela.height);
  const letras = limiarizar(img.data, regiao.filtro);
  g.putImageData(img, 0, 0);
  return { tela, letras, fracao: letras / (tela.width * tela.height) };
}

/** A miniatura de uma região: o recorte original, pequeno, em JPEG. Quem confere quer ver o que o vídeo mostrava, e não a máscara. */
export function miniatura(fonte, regiao, { largura, altura }) {
  const { sx, sy, sl, sa } = caixaDe(regiao, { largura, altura });
  const mini = document.createElement('canvas');
  const k = Math.min(1, 240 / sl);
  mini.width = Math.max(1, Math.round(sl * k));
  mini.height = Math.max(1, Math.round(sa * k));
  mini.getContext('2d').drawImage(fonte, sx, sy, sl, sa, 0, 0, mini.width, mini.height);
  return mini.toDataURL('image/jpeg', 0.7);
}

// ── o leitor ──────────────────────────────────────────────────────────────

const VENDOR = new URL('./vendor/tesseract/', import.meta.url).href;

/** Se este navegador corre o leitor: precisa de WebAssembly com SIMD (Chrome, Edge, Firefox, Safari 16.4+). */
export function podeLer() {
  if (typeof WebAssembly !== 'object' || typeof Worker !== 'function') return false;
  // O menor módulo com uma instrução SIMD (v128.const), o mesmo teste do wasm-feature-detect.
  const simd = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0,
    65, 0, 253, 15, 253, 98, 11]);
  try { return WebAssembly.validate(simd); } catch { return false; }
}

/**
 * O leitor de texto, carregado só quando é preciso (uns 6 MB, uma vez; o navegador guarda o resto).
 * Tudo vem deste site: nenhum pedido sai para outro domínio. O trabalhador é um ficheiro nosso, e não
 * um blob, para não herdar a política de segurança da página (que não deixa compilar WebAssembly).
 */
export async function abrirLeitor({ aoProgredir = () => {}, modo = '11' } = {}) {
  const { default: Tesseract } = await import(`${VENDOR}tesseract.esm.min.js`);
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: `${VENDOR}worker.min.js`,
    corePath: `${VENDOR}tesseract-core-simd-lstm.js`,
    langPath: VENDOR.replace(/\/$/, ''),
    workerBlobURL: false,
    gzip: true,
    logger: (m) => { if (typeof m?.progress === 'number') aoProgredir(m); },
  });
  // 11: texto solto, sem esperar parágrafos. Os nomes estão espalhados e em colunas. O nome de quem
  // matou (achar-mortes.js) é uma linha só, e lê-se com o 7.
  // O dpi fixo poupa a estimativa, que o Tesseract anuncia na consola a cada recorte.
  await worker.setParameters({ tessedit_pageseg_mode: modo, preserve_interword_spaces: '1', user_defined_dpi: '300' });
  return {
    async ler(tela) {
      const { data } = await worker.recognize(tela, {}, { text: true, blocks: true });
      const linhas = [];
      for (const bloco of data.blocks || []) {
        for (const par of bloco.paragraphs || []) {
          for (const l of par.lines || []) linhas.push({ texto: l.text.trim(), confianca: l.confidence });
        }
      }
      return { texto: data.text || '', linhas: linhas.filter((l) => l.texto) };
    },
    fechar: () => worker.terminate(),
  };
}

/** Se este navegador decodifica o vídeo da Kick (H.264), por MediaSource ou HLS nativo (o mesmo teste do frames.js). */
export function podeVerVideo() {
  const MS = window.MediaSource || window.ManagedMediaSource;
  if (MS?.isTypeSupported?.('video/mp4; codecs="avc1.42E01E"')) return true;
  return Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
}

// ── os quadros ────────────────────────────────────────────────────────────

/** O degrau mais nítido até 1080p, ou o de 720p quando se pede para gastar menos. */
export function degrauPara(escada, qualidade = 1080) {
  const ate = escada.filter((d) => (d.altura || 0) <= qualidade).sort((a, b) => (b.altura || 0) - (a.altura || 0));
  return ate[0] || escada[0] || null;
}

/** Os instantes a ler: de `passoMs` em `passoMs`, em volta de `ms`, o mais perto primeiro não; por ordem. */
export function instantesEmVolta(ms, { antesMs = 45_000, depoisMs = 45_000, passoMs = 6_000 } = {}) {
  const lista = [];
  for (let t = ms - antesMs; t <= ms + depoisMs; t += passoMs) lista.push(Math.round(t));
  return lista;
}

/**
 * Um apanhador de quadros nítidos de um VOD. `vod` é o do ev.resultados (com `master`).
 * Devolve { degrau, quadro(ms) -> {tela, largura, altura} | null, fechar() }.
 */
export async function abrirQuadros(vod, { buscar = fetch, qualidade = 1080, limiteMs = 15_000 } = {}) {
  const escada = lerMaster(await (await buscar(vod.master)).text(), vod.master);
  const degrau = degrauPara(escada, qualidade);
  if (!degrau) return null;
  const playlist = lerPlaylist(await (await buscar(degrau.url)).text(), degrau.url);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  // Fora do ecrã mas desenhado: com display:none o quadro sai preto.
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0.01;';
  document.body.append(video);
  let hls = null;
  let falhou = false;
  let carregado = false;
  const tela = document.createElement('canvas');

  function carregar(tempoS) {
    if (carregado) return;
    carregado = true;
    if (window.Hls?.isSupported()) {
      hls = new window.Hls({ startPosition: tempoS, maxBufferLength: 8, maxMaxBufferLength: 12, capLevelToPlayerSize: false });
      if (hls.on && window.Hls.Events?.ERROR) hls.on(window.Hls.Events.ERROR, (_, d) => { if (d?.fatal) falhou = true; });
      hls.loadSource(degrau.url);
      hls.attachMedia(video);
    } else {
      video.src = degrau.url;
    }
  }

  function chegar(tempoS) {
    video.currentTime = tempoS;
    return new Promise((pronto) => {
      const acabou = (ok) => { clearTimeout(t); clearInterval(vigia); video.removeEventListener('seeked', aoChegar); pronto(ok); };
      const aoChegar = () => acabou(true);
      const t = setTimeout(() => acabou(false), limiteMs);
      const vigia = setInterval(() => { if (falhou || video.error) acabou(false); }, 150);
      video.addEventListener('seeked', aoChegar, { once: true });
    });
  }

  return {
    degrau,
    async quadro(ms) {
      const tempoS = tempoDeMidia(playlist, ms);
      if (tempoS == null) return null;
      carregar(tempoS);
      if (!(await chegar(tempoS)) || !video.videoWidth) return null;
      tela.width = video.videoWidth;
      tela.height = video.videoHeight;
      tela.getContext('2d').drawImage(video, 0, 0);
      return { tela, largura: tela.width, altura: tela.height };
    },
    fechar() { hls?.destroy(); video.remove(); },
  };
}
