// Ir buscar um frame de um canal, num instante qualquer da noite.
//
// É o que falta para a página poder OLHAR em vez de perguntar. Um leitor
// escondido por canal, uma busca ao instante pedido, e o frame desenhado numa
// tela pequena — pequena de propósito: para saber se alguém morreu não é
// preciso resolução, é preciso a cor e o brilho.

import { onde } from './relogio.js?v=498644878a';

const LARGURA = 160;
const ALTURA = 90;

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

  async function carregar(estado, url, tempoS) {
    if (estado.url !== url) {
      estado.hls?.destroy();
      estado.url = url;
      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ startPosition: tempoS, maxBufferLength: 4 });
        estado.hls = hls;
        hls.loadSource(url);
        hls.attachMedia(estado.video);
      } else {
        estado.video.src = url;
      }
    }
    estado.video.currentTime = tempoS;
    await new Promise((pronto) => {
      // Sempre com desistência: um canal que não carrega não pode deixar os
      // outros cinco à espera para sempre.
      const acabou = () => {
        clearTimeout(t);
        clearInterval(vigia);
        estado.video.removeEventListener('seeked', acabou);
        pronto();
      };
      const t = setTimeout(acabou, limiteMs);
      // E desistir DEPRESSA quando não há nada a vir: um navegador sem o codec
      // da Kick fica em readyState 0 para sempre, e esperar seis segundos por
      // cada ângulo só para chegar ao mesmo "não vi nada" são seis segundos a
      // olhar para uma página parada, vezes o número de canais.
      const desde = performance.now();
      const vigia = setInterval(() => {
        if (estado.video.readyState === 0 && performance.now() - desde > 900) acabou();
      }, 150);
      estado.video.addEventListener('seeked', acabou, { once: true });
    });
  }

  const tela = document.createElement('canvas');
  tela.width = LARGURA;
  tela.height = ALTURA;
  const pincel = tela.getContext('2d', { willReadFrequently: true });

  return {
    /** Os pixéis de um canal naquele instante, ou null se ele não filmava. */
    async frame(slug, quandoMs) {
      const linha = linhas.find((l) => l.slug === slug);
      if (!linha) return null;
      const r = onde(linha, quandoMs, { nudgeMs: nudges[slug] || 0 });
      if (r.estado !== 'toca') return null;
      const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
      const estado = leitorDe(slug);
      try {
        await carregar(estado, peca.barato.url, r.tempoS);
        if (!estado.video.videoWidth) return null;
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
