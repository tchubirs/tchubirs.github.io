// Achar as mortes nos vídeos, no navegador: baixar o 160p, olhar para duas imagens por segundo, e ler
// quem matou num quadro nítido. A conta (o que é uma tela de morte, onde está o nome) é de
// achar-mortes.js; aqui ficam o vídeo, o leitor de texto e o andamento.
//
// Rápido de propósito (o dono: tudo sozinho, sem esperar):
//  - o vídeo vem do degrau mais barato (160p, ~130 MB por hora de live), com quatro segmentos no ar ao
//    mesmo tempo e três pedaços de canais a andar juntos;
//  - as imagens saem do próprio TS pelo descodificador do navegador (WebCodecs), sem <video> nem buscas:
//    um segmento de 12 s descodifica-se de uma vez e só se guardam 2 imagens por segundo, de 160x90;
//  - perto dos tiros achados primeiro (quem morre, morre a lutar), e o vídeo todo só a pedido;
//  - o quadro nítido (1080p) só se pede onde já se viu uma tela de morte: 2 ou 3 quadros por morte.

import { imagensDoTs } from './video-ts.js?v=6425609683';
import {
  medirTela, juntarTelas, caixaDoMatador, zonaDoNome, ampliacaoDoNome, nomeAPretoEBranco, escolherNome, msDoPts, limparNomeLido,
  ATRASO_DA_TELA_MS,
} from './achar-mortes.js?v=6425609683';

const LARGURA = 160;
const ALTURA = 90;

/** Se este navegador descodifica vídeo sozinho (WebCodecs). Chrome, Edge, Safari 16.4+ e Firefox 130+. */
export function podeDescodificar() {
  return typeof VideoDecoder === 'function' && typeof EncodedVideoChunk === 'function';
}

function telaPequena() {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(LARGURA, ALTURA);
  const c = document.createElement('canvas');
  c.width = LARGURA; c.height = ALTURA;
  return c;
}

/**
 * As imagens pequenas de um pedaço de TS, de `cadaMs` em `cadaMs`, no relógio do VOD.
 * `segs`: os segmentos que vieram, com o `inicio` (ms) de cada um; o primeiro dá a hora ao PTS.
 * Chama `aoQuadro({ ms, pixeis })` com cada uma (RGBA 160x90). Devolve quantas imagens viu.
 */
export async function quadrosDoTs(ts, segs, { cadaMs = 500, aoQuadro, sinal } = {}) {
  const r = imagensDoTs(ts);
  if (!r?.imagens.length || !r.codec || !segs?.length) return 0;
  const primeira = r.imagens.findIndex((x) => x.chave);
  if (primeira < 0) return 0;
  const imagens = r.imagens.slice(primeira);
  // O começo do pedaço: o menor PTS das primeiras imagens (as B vêm fora de ordem).
  const pts0 = Math.min(...r.imagens.slice(0, 40).map((x) => x.pts).filter(Number.isFinite));
  const inicio = segs[0].inicio;
  const tela = telaPequena();
  const pincel = tela.getContext('2d', { willReadFrequently: true });
  let proximo = -Infinity;
  let vistos = 0;
  const pendentes = [];
  let erro = null;
  const dec = new VideoDecoder({
    output: (f) => {
      try {
        const ms = f.timestamp / 1000;
        if (ms >= proximo) {
          proximo = ms + cadaMs;
          pincel.drawImage(f, 0, 0, LARGURA, ALTURA);
          const pixeis = pincel.getImageData(0, 0, LARGURA, ALTURA).data;
          vistos++;
          pendentes.push(aoQuadro?.({ ms, pixeis }));
        }
      } finally { f.close(); }
    },
    error: (e) => { erro = e; },
  });
  dec.configure({ codec: r.codec, optimizeForLatency: true });
  for (const x of imagens) {
    if (sinal?.aborted || erro) break;
    const ms = msDoPts(x.pts ?? x.dts, pts0, inicio);
    dec.decode(new EncodedVideoChunk({ type: x.chave ? 'key' : 'delta', timestamp: Math.round(ms * 1000), data: x.dados }));
    // Não encher a fila do descodificador com uma hora de vídeo de uma vez.
    if (dec.decodeQueueSize > 24) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((ok) => dec.addEventListener('dequeue', ok, { once: true }));
    }
  }
  try { if (!erro && !sinal?.aborted) await dec.flush(); } catch (e) { erro = erro || e; }
  try { dec.close(); } catch { /* já fechado */ }
  await Promise.all(pendentes);
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  if (erro) throw erro;
  return vistos;
}

// ── o nome de quem matou ──────────────────────────────────────────────────

/**
 * Ler o nome da caixa vermelha num quadro nítido (`fonte`: canvas ou imagem, `largura` x `altura`).
 * `leitor`: o do ler-tela.js aberto com o modo 7 (uma linha). Devolve { nome, caixa } ou null.
 */
export async function lerNomeNoQuadro(fonte, largura, altura, leitor) {
  const hFaixa = Math.max(1, Math.round(altura * 0.14));
  const faixa = document.createElement('canvas');
  faixa.width = largura;
  faixa.height = hFaixa;
  const g = faixa.getContext('2d', { willReadFrequently: true });
  g.drawImage(fonte, 0, 0, largura, hFaixa, 0, 0, largura, hFaixa);
  const caixa = caixaDoMatador(g.getImageData(0, 0, largura, hFaixa).data, largura, altura);
  if (!caixa) return null;
  const z = zonaDoNome(caixa);
  const k = ampliacaoDoNome(caixa.y1 - caixa.y0);
  const margem = 20;
  const tela = document.createElement('canvas');
  tela.width = z.l * k + margem * 2;
  tela.height = z.a * k + margem * 2;
  const p = tela.getContext('2d', { willReadFrequently: true });
  p.fillStyle = '#fff';
  p.fillRect(0, 0, tela.width, tela.height);
  p.imageSmoothingEnabled = true;
  p.imageSmoothingQuality = 'high';
  p.drawImage(fonte, z.x, z.y, z.l, z.a, margem, margem, z.l * k, z.a * k);
  const original = p.getImageData(margem, margem, z.l * k, z.a * k);
  // O limite de sempre, e quando não sai nada, um mais apertado e um mais largo.
  for (const fracao of [0.65, 0.8, 0.5]) {
    const img = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
    if (!nomeAPretoEBranco(img.data, { fracao })) continue;
    p.putImageData(img, margem, margem);
    // eslint-disable-next-line no-await-in-loop
    const nome = limparNomeLido((await leitor.ler(tela)).texto);
    if (nome) return { nome, caixa };
  }
  return { nome: '', caixa };
}

// ── o andamento ───────────────────────────────────────────────────────────

/** Cortar os intervalos em pedaços de `pedacoMs`, para andarem vários ao mesmo tempo. */
export function emPedacos(intervalos, pedacoMs = 120_000) {
  const saida = [];
  for (const [a, b] of intervalos) for (let t = a; t < b; t += pedacoMs) saida.push([t, Math.min(b, t + pedacoMs)]);
  return saida;
}

/** Quanto falta, pela velocidade medida até aqui. Null antes de haver medida que preste. */
export function estimarFalta({ feitoMs, totalMs, decorridoMs }) {
  if (!(feitoMs > 0) || decorridoMs < 1500) return null;
  return Math.max(0, ((totalMs - feitoMs) * decorridoMs) / feitoMs);
}

/**
 * Procurar as mortes de vários canais.
 *
 * `alvos`: [{ canal, intervalos: [[deMs, ateMs]] }] no relógio dos vídeos.
 * `tsDe(canal, deMs, duracaoS, { sinal, contador })` -> { ts, segs } | null: o 160p.
 * `vodEm(canal, ms)` -> o VOD (com `master`) para o quadro nítido.
 * `quadros(vod, { qualidade })` -> { quadro(ms) } (o abrirQuadros do ler-tela.js, ou o dos testes).
 * `abrirLeitor()` -> o leitor de texto de uma linha.
 * `telasDe(canal, deMs, ateMs, cadaMs)` (opcional): as imagens pequenas já prontas, [{ ms, pixeis }],
 *   em vez de baixar e descodificar (os testes, num Chromium sem H.264).
 * Devolve { mortes: [{ canal, ms, matador, telaDeMs, telaAteMs, quadros }],
 * concluidos: [{ canal, deMs, ateMs }] }, só com os pedaços que foram descodificados.
 */
export async function procurarMortes({
  alvos, tsDe, vodEm, quadros, abrirLeitor, telasDe = null, sinal, aoProgresso = () => {},
  cadaMs = 500, aoMesmoTempo = 3, aoAchar = () => {},
}) {
  const fila = [];
  for (const a of alvos || []) for (const [de, ate] of emPedacos(a.intervalos)) fila.push({ canal: a.canal, de, ate });
  const totalMs = fila.reduce((s, x) => s + (x.ate - x.de), 0);
  const acertos = new Map();
  const concluidos = [];
  let feitoMs = 0;
  let bytes = 0;
  let imagens = 0;
  let falhados = 0;
  const comecou = Date.now();
  const contar = (fase = 'ver') => aoProgresso({
    fase, feitoMs, totalMs, bytes, imagens, falhados, faltaMs: estimarFalta({ feitoMs, totalMs, decorridoMs: Date.now() - comecou }),
  });
  contar();
  const olhar = (canal) => ({ ms, pixeis }) => {
    if (medirTela(pixeis, LARGURA, ALTURA).sim) {
      if (!acertos.has(canal)) acertos.set(canal, []);
      acertos.get(canal).push({ ms });
    }
  };
  let i = 0;
  const umTrabalhador = async () => {
    while (i < fila.length) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const { canal, de, ate } = fila[i++];
      let concluido = false;
      try {
        let vistos = 0;
        if (telasDe) {
          // eslint-disable-next-line no-await-in-loop
          const lista = await telasDe(canal, de, ate, cadaMs);
          for (const q of lista || []) olhar(canal)(q);
          vistos = (lista || []).length;
        } else {
          // eslint-disable-next-line no-await-in-loop
          const baixado = await tsDe(canal, de, (ate - de) / 1000, { sinal, contador: (n) => { bytes += n; } });
          if (baixado) {
            // eslint-disable-next-line no-await-in-loop
            vistos = await quadrosDoTs(baixado.ts, baixado.segs, {
              cadaMs, sinal, aoQuadro: (q) => { if (q.ms >= de && q.ms < ate) olhar(canal)(q); },
            });
          }
        }
        imagens += vistos;
        concluido = vistos > 0;
        if (!concluido) falhados++;
      } catch (e) {
        if (e?.name === 'AbortError' || sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
        falhados++;
      }
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      if (concluido) concluidos.push({ canal, deMs: de, ateMs: ate });
      feitoMs += ate - de;
      contar();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(aoMesmoTempo, fila.length)) }, umTrabalhador));

  // As telas juntas em mortes, e quem matou lido num quadro nítido de cada uma.
  const achadas = [];
  for (const [canal, lista] of acertos) {
    for (const tela of juntarTelas(lista)) achadas.push({ canal, tela });
  }
  achadas.sort((a, b) => a.tela.deMs - b.tela.deMs);
  const saida = [];
  let leitor = null;
  const fontes = new Map();
  try {
    for (const [k, { canal, tela }] of achadas.entries()) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      aoProgresso({ fase: 'ler', feitas: k, total: achadas.length, feitoMs, totalMs, bytes, imagens, falhados });
      const leituras = [];
      try {
        const vod = vodEm?.(canal, tela.deMs);
        if (vod && quadros && abrirLeitor) {
          if (!leitor) leitor = await abrirLeitor();
          const chave = `${canal}|${vod.id ?? vod.master}`;
          if (!fontes.has(chave)) fontes.set(chave, await quadros(vod, { qualidade: 1080 }));
          const fonte = fontes.get(chave);
          // Até três quadros da tela: o do meio primeiro, depois as pontas (a caixa pode entrar a meio).
          const meio = tela.ms[Math.floor(tela.ms.length / 2)];
          const escolhidos = [...new Set([meio, tela.ms.at(-1), tela.ms[0]])].slice(0, 3);
          for (const ms of escolhidos) {
            if (sinal?.aborted) break;
            // eslint-disable-next-line no-await-in-loop
            const q = await fonte?.quadro(ms);
            if (!q) continue;
            // eslint-disable-next-line no-await-in-loop
            const r = await lerNomeNoQuadro(q.tela, q.largura, q.altura, leitor);
            if (r?.nome) leituras.push(r.nome);
            if (leituras.length >= 2 && escolherNome(leituras) && leituras.filter((x) => x === leituras[0]).length >= 2) break;
          }
        }
      } catch (e) {
        if (e?.name === 'AbortError' || sinal?.aborted) throw e;
      }
      const morte = {
        canal, ms: Math.round(tela.deMs - ATRASO_DA_TELA_MS), matador: escolherNome(leituras),
        telaDeMs: tela.deMs, telaAteMs: tela.ateMs, quadros: tela.quadros,
      };
      saida.push(morte);
      aoAchar(morte);
    }
  } finally {
    for (const f of fontes.values()) f?.fechar?.();
    leitor?.fechar?.();
  }
  aoProgresso({ fase: 'fim', feitoMs, totalMs, bytes, imagens, falhados, mortes: saida.length });
  return { mortes: saida, concluidos };
}
