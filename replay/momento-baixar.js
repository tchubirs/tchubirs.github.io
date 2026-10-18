// Baixar um momento direto da tela Momentos, sem abrir o evento (o dono, 17/10: "na minha cabeça era pra já
// estar pronto, coisa rápida"). O 16:9 é cópia dos bytes da Kick cortada em MP4 (baixar.js + mp4.js), como o
// "Tela cheia" do modo simples; o 9:16 grava esse MP4 num quadro vertical (retrato.js), com a webcam por cima
// quando o rosto do streamer se acha (rosto.js) e o meio do jogo quando não.

import { fonteDoVod, clipeDaKick, lerMaster, lerPlaylist } from './kick.js?v=488815493c';
import { executarCorte, emMp4 } from './baixar.js?v=488815493c';
import { lerTs, recortar, juntarMp4 } from './mp4.js?v=488815493c';
import { juntarGravados } from './juntar-gravados.js?v=488815493c';
import {
  gravar, enquadramentoInicial, reformar, limitar, divisaoDoQuadro, DIVISAO_OMISSAO, extensaoDe, RETRATO,
} from './retrato.js?v=488815493c';
import { geometriaLegenda, desenharLegenda, limparTranscricao, LEGENDA_OMISSAO } from './legenda.js?v=488815493c';
import {
  abrirDetector, procurarRosto, caixaDaWebcam, instantesDoClipe, rostoGuardado, guardarRosto,
} from './rosto.js?v=488815493c';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIPE = /^clip_[A-Za-z0-9]{10,40}$/;
// O rosto tem este tempo para se achar (a primeira vez o detector baixa uns 12 MB); depois fica o meio do jogo.
const PRAZO_ROSTO_MS = 25_000;

// Gancho nos 2 s (SUBSTITUIR-CONECTORES.md, item 1): o vídeo abre com o pico do momento e depois segue do começo
// do contexto até ao fim. 1 s antes do pico e 1 s depois.
export const GANCHO_S = 2;
const GANCHO_ANTES_MS = 1000;
// Pico colado ao começo do contexto: o vídeo já abre nele, o gancho só repetia.
const GANCHO_MIN_MS = 4000;

/**
 * Onde está o pico do momento, no relógio da noite (ms), quando se sabe. `picoMs` se o arquivo o traz; senão o
 * instante do id (`canal-<ms>`, ver montar.mjs) só nos achados do Povix, em que ele é o pico do som. Nos do chat
 * é o meio de uma janela de 60 s e nos do público o meio do clipe: não são pico, e aí não há gancho.
 */
export function picoDoMomento(m) {
  if (Number.isFinite(m?.picoMs)) return m.picoMs;
  if (m?.origem !== 'povix') return null;
  const ms = Number(String(m.id || '').match(/-(\d{12,14})$/)?.[1]);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Os 2 s do gancho no relógio da noite, ou null se o pico não serve (fora do momento ou colado ao começo). Pico
 * colado ao fim: os 2 s que acabam no fim.
 */
export function ganchoDoMomento(m) {
  const pico = picoDoMomento(m);
  if (pico == null || pico > m.fimMs || pico - m.inicioMs < GANCHO_MIN_MS) return null;
  const deMs = Math.min(pico - GANCHO_ANTES_MS, m.fimMs - GANCHO_S * 1000);
  return { deMs, ateMs: deMs + GANCHO_S * 1000 };
}

/**
 * A transcrição (formato de legenda.js) das falas de um momento (`falas.json` do evento: [[deMs, ateMs, texto]]
 * desde `inicioMs`). A transcrição guarda só o tempo da fala inteira: cada palavra leva um pedaço dele do
 * tamanho das suas letras, que é o bastante para o destaque andar com a voz.
 */
export function transcricaoDasFalas(linhas, { canal = '', inicioMs, fimMs }) {
  const saida = [];
  for (const [de, ate, texto] of Array.isArray(linhas) ? linhas : []) {
    const palavras = String(texto || '').split(/\s+/).filter(Boolean);
    if (!palavras.length || !(ate >= de)) continue;
    const letras = palavras.reduce((n, p) => n + p.length, 0);
    let t = inicioMs + de;
    const passo = (ate - de) / letras;
    saida.push({ palavras: palavras.map((p) => { const w = { t: p, de: t, ate: t + p.length * passo }; t = w.ate; return w; }) });
  }
  return limparTranscricao({ canal, deMs: inicioMs - 10_000, ateMs: fimMs + 10_000, linhas: saida });
}

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
 *
 * `gancho` (só com VOD e pico conhecido): {deS, ateS} dos ~2 s do pico no tempo do arquivo sem gancho, para o
 * 9:16 gravar à frente. Com `comGancho`, o MP4 já sai com eles à frente: duas entradas na lista de edição, sem
 * reconverter (mp4.js), e `comGancho: true` na volta.
 */
export async function cortarMomento(m, { antesS = 3, comGancho = false, sinal, aoProgresso } = {}) {
  let url;
  let deS;
  let ateS;
  let g = null;
  if (UUID.test(m.uuid || '') && Number.isFinite(m.aosS)) {
    url = (await fonteDoVod(m.uuid, { sinal })).m3u8;
    deS = Math.max(0, m.aosS - antesS);
    ateS = m.aosS + (m.fimMs - m.inicioMs) / 1000;
    const gm = ganchoDoMomento(m);
    if (gm) g = { deS: m.aosS + (gm.deMs - m.inicioMs) / 1000, ateS: m.aosS + (gm.ateMs - m.inicioMs) / 1000 };
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
  const embutir = comGancho && g;
  // Com gancho, os pedaços vêm colados (sem `pedido`) e o MP4 monta-se aqui com os dois trechos.
  let r = await executarCorte(embutir ? { ...plano, pedido: null } : plano, {
    sinal,
    aoProgresso: (p) => aoProgresso?.({ feito: p.prontos, total: p.total }),
  });
  if (r.estado !== 'pronto') throw Object.assign(new Error(`faltaram ${(r.total ?? 0) - (r.obtidos ?? 0)} pedaços`), { name: 'INCOMPLETO' });
  let embutido = false;
  if (embutir) {
    try {
      const ts = lerTs(r.bytes);
      const trecho = (de, ate) => recortar(ts, { inicioMs: plano.inicioReal, deMs: de * 1000, ateMs: ate * 1000 });
      const { bytes, duracaoS } = juntarMp4([trecho(g.deS, g.ateS), trecho(deS, ateS)]);
      r = { ...r, bytes, duracaoS, tipo: 'video/mp4' };
      embutido = true;
    } catch {
      // O que o MP4 daqui não sabe juntar sai como sempre saiu (o corte simples, ou o .ts).
      r = emMp4(plano, r.bytes);
    }
  }
  // O gancho no tempo do arquivo sem ele: o arquivo começa onde o vídeo de facto começou (sobra negativa = mais tarde).
  const inicioS = deS - (r.plano?.sobraInicioS || 0);
  const gancho = g && !embutido && r.tipo === 'video/mp4' ? { deS: g.deS - inicioS, ateS: g.ateS - inicioS } : null;
  return {
    blob: new Blob([r.bytes], { type: r.tipo }), tipo: r.tipo, duracaoS: r.duracaoS ?? ateS - deS, fps: qualidade.fps,
    gancho, comGancho: embutido,
    // O relógio da noite no segundo 0 do arquivo (para a legenda), quando o corte saiu de um VOD.
    relogioMs: Number.isFinite(m.aosS) && UUID.test(m.uuid || '') ? m.inicioMs + (inicioS - m.aosS) * 1000 : null,
  };
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
 *
 * Com `gancho` ({deS, ateS} de cortarMomento), grava primeiro esse trecho e depois o momento inteiro, e junta as
 * duas gravações sem reconverter (juntar-gravados.js). Se não juntarem, sai o momento sem gancho.
 *
 * Com `legenda` ({transcricao, relogioMs}: transcricaoDasFalas e o relógio do segundo 0 do arquivo), a fala vai
 * queimada no vídeo, no estilo de omissão do editor (destaque palavra a palavra).
 */
export async function gravarVertical({ blob, duracaoS, fps, canal, gancho = null, legenda = null, sinal, aoFase, aoProgresso }) {
  const { v, fechar } = videoEscondido(blob);
  try {
    await esperar(v, 'loadeddata', sinal);
    const fonte = { largura: v.videoWidth, altura: v.videoHeight };
    aoFase?.('rosto');
    const rosto = await acharRosto(canal, v, duracaoS, sinal);
    const { modo, divisao, rects } = enquadrar(rosto, fonte);
    aoFase?.('gravar');
    const ganchoS = gancho ? gancho.ateS - gancho.deS : 0;
    const total = duracaoS + ganchoS;
    const estilo = { ...LEGENDA_OMISSAO, ligado: true };
    const geo = legenda?.transcricao?.linhas.length && Number.isFinite(legenda.relogioMs)
      ? geometriaLegenda(RETRATO, estilo, { formato: '9:16', modo, divisao }) : null;
    const trecho = (deS, durS, antes) => {
      v.currentTime = deS;
      const porCima = geo ? (ctx, feitoS) => desenharLegenda(ctx, legenda.transcricao, legenda.relogioMs + (deS + feitoS) * 1000, estilo, geo) : null;
      return gravar(v, {
        rects, modo, divisao, duracaoS: durS, sinal, fps, exigirSom: true, arquivoSom: blob, porCima,
        aoProgresso: (p) => aoProgresso?.({ ...p, feito: antes + p.feito, total }),
      });
    };
    const g = ganchoS > 0 ? await trecho(gancho.deS, ganchoS, 0) : null;
    const r = await trecho(0, duracaoS, ganchoS);
    const extensao = r.extensao || extensaoDe(r.tipo);
    let saida = r.blob;
    let comGancho = false;
    if (g && g.tipo === r.tipo) {
      try {
        const partes = await Promise.all([g.blob, r.blob].map(async (b) => new Uint8Array(await b.arrayBuffer())));
        saida = new Blob(juntarGravados(partes).partes, { type: r.tipo });
        comGancho = true;
      } catch { /* formatos que não se juntam: fica o momento sem gancho */ }
    }
    return { blob: saida, extensao, comRosto: modo === 'dois', comGancho, comLegenda: Boolean(geo) };
  } finally {
    fechar();
  }
}
