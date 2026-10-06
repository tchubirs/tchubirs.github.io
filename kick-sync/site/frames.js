// Ir buscar um frame de um canal, num instante qualquer da noite.
//
// É o que falta para a página poder OLHAR em vez de perguntar. Um leitor
// escondido por canal, uma busca ao instante pedido, e o frame desenhado numa
// tela pequena — pequena de propósito: para saber se alguém morreu não é
// preciso resolução, é preciso a cor e o brilho.

import { onde } from './relogio.js';

const LARGURA = 160;
const ALTURA = 90;

/**
 * Este navegador sabe mostrar o video da Kick (H.264)?
 *
 * Perguntado de uma vez, e nao adivinhado pelo relogio de cada leitor: um
 * navegador sem o codec ficava em readyState 0 para sempre, e esperar por cada
 * angulo so para chegar ao mesmo "nao vi nada" eram segundos a olhar para uma
 * pagina parada, vezes o numero de canais.
 */
export function podeVerKick() {
  const MS = window.MediaSource || window.ManagedMediaSource;
  if (MS?.isTypeSupported?.('video/mp4; codecs="avc1.42E01E"')) return true;
  // O Safari antigo toca HLS sem MediaSource nenhuma.
  return Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
}

/**
 * Um apanhador de frames, com um leitor por canal reaproveitado entre buscas.
 *
 * Criar e destruir um leitor por cada frame fazia doze arranques de vídeo para
 * seis canais. Assim são seis, e as buscas seguintes são só um `currentTime`.
 */
export function criarApanhador({ linhas, nudges = {}, limiteMs = 6000 } = {}) {
  const leitores = new Map();

  function leitorDe(slug) {
    if (leitores.has(slug)) return leitores.get(slug);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    // Fora do ecrã, mas NÃO `display:none`: um vídeo escondido assim não
    // desenha nada, e o que sai da tela seria preto.
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:160px;height:90px;opacity:0.01;';
    document.body.append(video);
    const estado = { video, hls: null, url: null };
    leitores.set(slug, estado);
    return estado;
  }

  /** Devolve se o leitor chegou MESMO ao instante pedido. */
  async function carregar(estado, url, tempoS) {
    if (estado.url !== url) {
      estado.hls?.destroy();
      estado.url = url;
      estado.falhou = false;
      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ startPosition: tempoS, maxBufferLength: 4 });
        estado.hls = hls;
        // Um erro fatal do hls.js e a resposta que antes se adivinhava pelo
        // relogio: quando chega, nao vale a pena esperar mais.
        if (hls.on && window.Hls.Events?.ERROR) {
          hls.on(window.Hls.Events.ERROR, (_, d) => { if (d?.fatal) estado.falhou = true; });
        }
        hls.loadSource(url);
        hls.attachMedia(estado.video);
      } else {
        estado.video.src = url;
      }
    }
    estado.video.currentTime = tempoS;
    return new Promise((pronto) => {
      // Sempre com desistência: um canal que não carrega não pode deixar os
      // outros cinco à espera para sempre.
      const acabou = (chegou) => {
        clearTimeout(t);
        clearInterval(vigia);
        estado.video.removeEventListener('seeked', aoChegar);
        pronto(chegou);
      };
      const aoChegar = () => acabou(true);
      const t = setTimeout(() => acabou(false), limiteMs);
      // E desistir DEPRESSA quando o leitor diz que nao vai dar: um erro do
      // video ou um erro fatal do hls.js.
      //
      // Antes desistia-se ao fim de 900 ms em readyState 0, a pensar no
      // navegador sem o codec da Kick. Mas um arranque frio normal tambem esta
      // em readyState 0 durante esse tempo: a playlist de 160p sao 354 KB em
      // 0,42 s, e o primeiro bocado de video mais 0,2 a 0,9 s. Cada "quem
      // morreu" comeca com todos os canais a frio, e o "antes" de todos caia
      // na desistencia: os cartoes diziam "nao estava gravando" de quem estava.
      // O navegador sem codec e apanhado antes de pedir o que quer que seja,
      // em `podeVerKick`.
      const vigia = setInterval(() => {
        if (estado.falhou || estado.video.error) acabou(false);
      }, 150);
      estado.video.addEventListener('seeked', aoChegar, { once: true });
    });
  }

  const tela = document.createElement('canvas');
  tela.width = LARGURA;
  tela.height = ALTURA;
  const pincel = tela.getContext('2d', { willReadFrequently: true });
  const podeVer = podeVerKick();

  return {
    /** Os pixéis de um canal naquele instante, ou null se ele não filmava. */
    async frame(slug, quandoMs) {
      if (!podeVer) return null;
      const linha = linhas.find((l) => l.slug === slug);
      if (!linha) return null;
      const r = onde(linha, quandoMs, { nudgeMs: nudges[slug] || 0 });
      if (r.estado !== 'toca') return null;
      const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
      const estado = leitorDe(slug);
      try {
        // Sem ter chegado ao instante nao ha frame: o que o leitor mostra e o
        // sitio ANTERIOR. Desenha-lo como se fosse este punha a bisseccao do
        // `afinarInstante` a decidir com a imagem errada, numa rede lenta.
        const chegou = await carregar(estado, peca.barato.url, r.tempoS);
        if (!chegou || !estado.video.videoWidth) return null;
        pincel.drawImage(estado.video, 0, 0, LARGURA, ALTURA);
        return { pixeis: pincel.getImageData(0, 0, LARGURA, ALTURA).data, imagem: tela.toDataURL('image/jpeg', 0.6) };
      } catch { return null; }
    },
    fechar() {
      for (const e of leitores.values()) { e.hls?.destroy(); e.video.remove(); }
      leitores.clear();
    },
  };
}
