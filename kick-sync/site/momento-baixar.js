// Baixar um momento direto da tela Momentos, sem abrir o evento (o dono, 17/10: "na minha cabeça era pra já
// estar pronto, coisa rápida"). O 16:9 é cópia dos bytes da Kick cortada em MP4 (baixar.js + mp4.js), como o
// "Tela cheia" do modo simples; o 9:16 grava esse MP4 num quadro vertical (retrato.js), com a webcam por cima
// quando o rosto do streamer se acha (rosto.js) e o meio do jogo quando não.

import { fonteDoVod, clipeDaKick, lerMaster, lerPlaylist } from './kick.js';
import { executarCorte } from './baixar.js';
import {
  gravar, enquadramentoInicial, reformar, limitar, divisaoDoQuadro, DIVISAO_OMISSAO, extensaoDe,
} from './retrato.js';
import {
  abrirDetector, procurarRosto, caixaDaWebcam, instantesDoClipe, rostoGuardado, guardarRosto,
} from './rosto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIPE = /^clip_[A-Za-z0-9]{10,40}$/;
// O rosto tem este tempo para se achar (a primeira vez o detector baixa uns 12 MB); depois fica o meio do jogo.
const PRAZO_ROSTO_MS = 25_000;

async function lerTexto(url, sinal) {
  const r = await fetch(url, { signal: sinal });
  if (!r.ok) throw Object.assign(new Error(`playlist ${r.status}`), { name: 'SEM-VIDEO' });
  return r.text();
}

/** A playlist do degrau mais alto de um m3u8 (master ou já de um degrau só, como a dos clipes). */
async function melhorPlaylist(url, sinal) {
  const texto = await lerTexto(url, sinal);
  const escada = lerMaster(texto, url);
  if (!escada.length) return { playlist: lerPlaylist(texto, url), qualidade: {} };
  const melhor = escada[0];
  return { playlist: lerPlaylist(await lerTexto(melhor.url, sinal), melhor.url), qualidade: melhor };
}

/**
 * O MP4 16:9 do momento. Com VOD, a janela que a tela toca: de `antesS` antes de `aosS` até ao fim do momento,
 * contada no tempo do próprio vídeo (o mesmo que o player usa). Sem VOD, o clipe da Kick inteiro.
 */
export async function cortarMomento(m, { antesS = 3, sinal, aoProgresso } = {}) {
  let url;
  let deS;
  let ateS;
  if (UUID.test(m.uuid || '') && Number.isFinite(m.aosS)) {
    url = (await fonteDoVod(m.uuid, { sinal })).m3u8;
    deS = Math.max(0, m.aosS - antesS);
    ateS = m.aosS + (m.fimMs - m.inicioMs) / 1000;
  } else if (CLIPE.test(m.clipe || '')) {
    url = (await clipeDaKick(m.clipe, { sinal })).m3u8;
  } else {
    throw Object.assign(new Error('sem vídeo'), { name: 'SEM-VIDEO' });
  }
  const { playlist, qualidade } = await melhorPlaylist(url, sinal);
  if (deS == null) { deS = 0; ateS = playlist.duracaoS; }
  const segmentos = playlist.segmentos.filter((s) => s.mediaT + s.duracaoS > deS && s.mediaT < ateS);
  if (!segmentos.length) throw Object.assign(new Error('o vídeo não cobre o momento'), { name: 'SEM-VIDEO' });
  // O relógio do corte é o do vídeo, em ms: mp4.js só precisa de onde o primeiro pedaço começa e do pedido.
  const plano = {
    estado: 'ok',
    canal: m.canal,
    segmentos,
    qualidade,
    inicioReal: segmentos[0].mediaT * 1000,
    pedido: { deMs: deS * 1000, ateMs: ateS * 1000 },
    nome: 'momento.mp4',
  };
  const r = await executarCorte(plano, {
    sinal,
    aoProgresso: (p) => aoProgresso?.({ feito: p.prontos, total: p.total }),
  });
  if (r.estado !== 'pronto') throw Object.assign(new Error(`faltaram ${(r.total ?? 0) - (r.obtidos ?? 0)} pedaços`), { name: 'INCOMPLETO' });
  return { blob: new Blob([r.bytes], { type: r.tipo }), tipo: r.tipo, duracaoS: r.duracaoS ?? ateS - deS, fps: qualidade.fps };
}

function videoEscondido(blob) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;';
  const url = URL.createObjectURL(blob);
  v.src = url;
  document.body.appendChild(v);
  const fechar = () => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); URL.revokeObjectURL(url); };
  return { v, fechar };
}

const esperar = (v, evento, sinal) => new Promise((ok, mal) => {
  const fim = setTimeout(() => mal(Object.assign(new Error('o vídeo não abriu'), { name: 'SEM-VIDEO' })), 20_000);
  v.addEventListener(evento, () => { clearTimeout(fim); ok(); }, { once: true });
  v.addEventListener('error', () => { clearTimeout(fim); mal(Object.assign(new Error('o vídeo não abriu'), { name: 'SEM-VIDEO' })); }, { once: true });
  sinal?.addEventListener('abort', () => { clearTimeout(fim); mal(new DOMException('cancelado', 'AbortError')); }, { once: true });
});

/** O rosto do streamer: o guardado neste aparelho, ou procurado em alguns quadros do próprio MP4. */
async function acharRosto(canal, v, duracaoS, sinal) {
  const guardado = rostoGuardado(canal);
  if (guardado) return guardado;
  let detector = null;
  const tela = document.createElement('canvas');
  try {
    detector = abrirDetector({ limiteMs: PRAZO_ROSTO_MS });
    const quadro = async (ms) => {
      v.currentTime = ms / 1000;
      await esperar(v, 'seeked', sinal);
      tela.width = v.videoWidth; tela.height = v.videoHeight;
      tela.getContext('2d').drawImage(v, 0, 0);
      return { tela };
    };
    const prazo = new Promise((ok) => setTimeout(() => ok({ rosto: null }), PRAZO_ROSTO_MS));
    const { rosto } = await Promise.race([procurarRosto({ instantes: instantesDoClipe(0, duracaoS * 1000), quadro, detector, sinal }), prazo]);
    if (rosto) guardarRosto(canal, rosto);
    return rosto;
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    return null;
  } finally {
    detector?.fechar();
  }
}

/** Os recortes do 9:16: a webcam em cima e o jogo embaixo quando há rosto; o meio do jogo quando não. */
function enquadrar(rosto, fonte) {
  if (!rosto) return { modo: 'um', divisao: DIVISAO_OMISSAO, rects: enquadramentoInicial(fonte.largura, fonte.altura, 'um') };
  const base = enquadramentoInicial(fonte.largura, fonte.altura, 'dois', DIVISAO_OMISSAO);
  const w = rosto.webcam;
  const cam = w ? limitar({
    x: (w.x - w.largura * 0.015) * fonte.largura, y: (w.y - w.altura * 0.015) * fonte.altura,
    largura: w.largura * 1.03 * fonte.largura, altura: w.altura * 1.03 * fonte.altura,
  }, fonte) : null;
  const divisao = cam ? divisaoDoQuadro(cam, 0) : null;
  if (cam && divisao != null) return { modo: 'dois', divisao, rects: reformar([cam, base[1]], { modo: 'dois', divisao, fonte }) };
  const caixa = caixaDaWebcam(rosto, fonte, DIVISAO_OMISSAO);
  return caixa ? { modo: 'dois', divisao: DIVISAO_OMISSAO, rects: [caixa, base[1]] }
    : { modo: 'um', divisao: DIVISAO_OMISSAO, rects: enquadramentoInicial(fonte.largura, fonte.altura, 'um') };
}

/**
 * O 9:16 a partir do MP4 16:9 já cortado. Grava em tempo real (é assim que o navegador sabe gravar): um momento
 * de 30 s leva uns 30 s depois do download. `aoFase('rosto'|'gravar')` e `aoProgresso({feito,total})`.
 */
export async function gravarVertical({ blob, duracaoS, fps, canal, sinal, aoFase, aoProgresso }) {
  const { v, fechar } = videoEscondido(blob);
  try {
    await esperar(v, 'loadeddata', sinal);
    const fonte = { largura: v.videoWidth, altura: v.videoHeight };
    aoFase?.('rosto');
    const rosto = await acharRosto(canal, v, duracaoS, sinal);
    const { modo, divisao, rects } = enquadrar(rosto, fonte);
    v.currentTime = 0;
    aoFase?.('gravar');
    const r = await gravar(v, {
      rects, modo, divisao, duracaoS, aoProgresso, sinal, fps, exigirSom: true, arquivoSom: blob,
    });
    return { blob: r.blob, extensao: r.extensao || extensaoDe(r.tipo), comRosto: modo === 'dois' };
  } finally {
    fechar();
  }
}
