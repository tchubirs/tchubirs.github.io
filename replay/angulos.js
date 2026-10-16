// Um clipe de vários ângulos: o mesmo lance visto por dois ou mais streamers, com o nome de cada um
// gravado no vídeo.
//
// É o que um clipe de um ângulo só não conta. O YouTube passou a cortar o alcance de vídeos
// reenviados "sem nada vosso" (ver ESTUDO.md), e um corte que mostra o atacante e depois o defensor é
// edição, não reenvio. E o nome no vídeo não é enfeite: o clipe circula sem a página à volta, e quem o
// vê tem de saber de quem é cada imagem. É também a primeira coisa que um streamer pede antes de deixar
// usar a imagem dele.
//
// Dois modos:
//
//   'empilhado'  9:16 (1080x1920). Um ângulo em cima e outro em baixo, cada um recortado ao centro.
//                O formato dos clipes de Rust que circulam no TikTok e nos Shorts.
//   'seguido'    16:9 (1920x1080). Um ângulo de cada vez, trocando nos instantes pedidos: o lance
//                contado por um lado e depois pelo outro.
//
// Como o 9:16 de retrato.js, isto reconverte (desenha cada frame numa tela e grava o que sai), por isso
// custa o tempo do clipe e não sai instantâneo. A geometria e o plano ficam em funções puras, porque é
// aí que um erro passa calado: meio pixel fora da fonte é uma barra preta na beira que ninguém vê na
// pré-visualização.

import {
  RETRATO, formatoQueFunciona, extensaoDe, noSitio, bitsDoVideo, fpsDaFonte, BITS_SOM, capturarSom,
} from './retrato.js?v=bf8f687c0f';

/** O 16:9 do modo seguido. */
export const DEITADO = Object.freeze({ largura: 1920, altura: 1080 });

/** O tamanho da tela de cada modo. */
export function telaDe(modo) {
  return modo === 'empilhado' ? { ...RETRATO } : { ...DEITADO };
}

/**
 * Onde cada ângulo é pintado na tela. No empilhado, metade de cima e metade de baixo; no seguido, a tela
 * inteira (um de cada vez).
 */
export function destinoDe(modo, i) {
  if (modo === 'empilhado') {
    const meia = RETRATO.altura / 2;
    return { x: 0, y: i === 0 ? 0 : meia, largura: RETRATO.largura, altura: meia };
  }
  return { x: 0, y: 0, largura: DEITADO.largura, altura: DEITADO.altura };
}

/**
 * O maior recorte ao centro da fonte com a forma do destino.
 *
 * Ao centro porque é onde está a mira num jogo na primeira pessoa: num lance de Rust o que interessa
 * é o que está à frente do jogador, não o inventário no canto.
 */
export function recorteAoCentro(fonteW, fonteH, alvoW, alvoH) {
  if (!(fonteW > 0 && fonteH > 0 && alvoW > 0 && alvoH > 0)) return null;
  const forma = alvoW / alvoH;
  let largura = fonteW;
  let altura = largura / forma;
  if (altura > fonteH) { altura = fonteH; largura = altura * forma; }
  return { x: (fonteW - largura) / 2, y: (fonteH - altura) / 2, largura, altura };
}

/**
 * O plano de um clipe: que ângulos, em que modo, e quando troca.
 *
 * `trocasS` (modo seguido) são os instantes, contados do início do clipe, em que se passa ao ângulo
 * seguinte. Sem trocas, o clipe é dividido em partes iguais. Um instante fora do clipe ou fora de ordem
 * é deitado fora em vez de produzir um ângulo de zero segundos.
 */
export function planoDeAngulos({ modo = 'seguido', canais = [], duracaoS, trocasS } = {}) {
  const lista = canais.filter((c) => typeof c === 'string' && c);
  if (lista.length < 2) throw new RangeError('um clipe de vários ângulos precisa de pelo menos dois canais');
  if (!(duracaoS > 0)) throw new RangeError(`duração inválida (${duracaoS})`);
  if (modo === 'empilhado') return { modo, canais: lista.slice(0, 2), duracaoS, trocasS: [] };
  let trocas = Array.isArray(trocasS) ? trocasS.filter((s) => Number.isFinite(s) && s > 0 && s < duracaoS) : null;
  if (!trocas || trocas.length !== lista.length - 1) {
    trocas = lista.slice(1).map((_, i) => (duracaoS * (i + 1)) / lista.length);
  }
  trocas = [...trocas].sort((a, b) => a - b);
  return { modo: 'seguido', canais: lista, duracaoS, trocasS: trocas };
}

/** Que ângulos se vêem `tS` segundos depois do início do clipe (índices em `plano.canais`). */
export function quemSeVe(plano, tS) {
  if (plano.modo === 'empilhado') return [0, 1];
  let i = 0;
  while (i < plano.trocasS.length && tS >= plano.trocasS[i]) i++;
  return [i];
}

/**
 * De que ângulo é o som `tS` segundos depois do início do clipe (um índice em `plano.canais`).
 *
 * No seguido é o de quem está na tela: o clipe conta o lance por um lado e depois pelo outro, e o tiro
 * que se ouve tem de ser o da imagem que se vê. No empilhado os dois estão na tela o tempo todo, e o
 * som é o de `somDe` (o ângulo que se estava a ouvir na grelha), ou o de cima.
 */
export function somEm(plano, tS, somDe = 0) {
  if (plano.modo === 'empilhado') return somDe === 1 && plano.canais.length > 1 ? 1 : 0;
  return quemSeVe(plano, tS)[0];
}

/**
 * Um misturador que deixa passar o som de um ângulo de cada vez, pelo Web Audio: uma entrada por
 * vídeo, cada uma com o seu volume, e uma saída que vai para o gravador. Trocar é mudar os volumes,
 * com uma rampa de 15 ms para a troca não estalar. Devolve null quando não há como (sem Web Audio, ou
 * um contexto que o navegador deixou parado): aí o clipe fica com o som de um ângulo só, como antes.
 */
export async function misturador(videos, {
  Contexto = globalThis.AudioContext || globalThis.webkitAudioContext, sinal, arquivosSom = [], exigirSom = false,
} = {}) {
  if (typeof Contexto !== 'function') return null;
  let ctx = null;
  let proprio = false;
  let destino = null;
  const capturas = [];
  const nos = [];
  let fechado = false;
  const fechar = () => {
    if (fechado) return;
    fechado = true;
    for (const n of nos) n.disconnect?.();
    for (const s of capturas) {
      if (s.fechar) s.fechar();
      else for (const f of s.stream?.getTracks?.() || []) f.stop?.();
    }
    for (const f of destino?.stream.getAudioTracks() || []) f.stop?.();
    if (proprio) ctx?.close?.();
  };
  try {
    const entradas = [];
    for (const [i, v] of videos.entries()) {
      try {
        const captura = await capturarSom(v, { sinal, Contexto, arquivoSom: arquivosSom[i] });
        capturas.push(captura);
        entradas.push(captura);
      } catch (e) {
        if (exigirSom || e.name === 'AbortError') throw e;
        entradas.push(null);
      }
    }
    if (!capturas.length) { fechar(); return null; }
    // As capturas de MP4 usam o contexto já liberado pelo toque. Abrir
    // outro aqui voltaria à restrição de áudio do Safari pós-download.
    ctx = capturas.find((s) => s.contexto)?.contexto;
    if (!ctx) { ctx = new Contexto(); proprio = true; }
    if (ctx.state === 'suspended') await Promise.race([ctx.resume?.(), new Promise((ok) => setTimeout(ok, 500))]);
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') { fechar(); return null; }
    destino = ctx.createMediaStreamDestination();
    const ganhos = entradas.map((s) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(destino);
      nos.push(g);
      if (s) {
        const fonte = ctx.createMediaStreamSource(s.stream);
        fonte.connect(g);
        nos.push(fonte);
      }
      return g;
    });
    let atual = -1;
    return {
      faixas: destino.stream.getAudioTracks(),
      ouvir(i) {
        if (i === atual) return;
        const agora = ctx.currentTime;
        for (const [k, g] of ganhos.entries()) {
          const alvo = k === i ? 1 : 0;
          if (atual === -1) g.gain.value = alvo;
          else g.gain.setTargetAtTime(alvo, agora, 0.015);
        }
        atual = i;
      },
      get atual() { return atual; },
      fechar,
    };
  } catch (e) {
    fechar();
    if (exigirSom || e.name === 'AbortError') throw e;
    return null;
  }
}

/** O crédito que vai no vídeo: o endereço do canal, que é o que quem vê pode procurar. */
export const credito = (canal) => `kick.com/${canal}`;

/**
 * O crédito no canto de baixo à esquerda do destino, numa pastilha escura com letra branca: lê-se
 * sobre neve, sobre noite e sobre o clarão de uma explosão.
 */
export function desenharCredito(ctx, texto, destino) {
  const tamanho = Math.round(Math.max(22, destino.altura * 0.038));
  const margem = Math.round(tamanho * 0.8);
  ctx.save();
  ctx.font = `600 ${tamanho}px 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const largura = (ctx.measureText?.(texto)?.width ?? texto.length * tamanho * 0.55) + tamanho;
  const altura = Math.round(tamanho * 1.6);
  const x = destino.x + margem;
  const y = destino.y + destino.altura - margem - altura;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillRect(x, y, largura, altura);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(texto, x + tamanho / 2, y + altura / 2);
  ctx.restore();
  return { x, y, largura, altura };
}

/**
 * Pintar um frame: o fundo, cada ângulo que se vê no seu destino, e o crédito de cada um.
 *
 * `fontes[i]` é o vídeo do canal `plano.canais[i]`. Um ângulo sem imagem (o vídeo ainda sem tamanho)
 * fica preto com o crédito na mesma: um buraco com nome lê-se como "este não carregou", sem nome lê-se
 * como um defeito.
 */
export function desenharAngulos(ctx, fontes, plano, tS) {
  const tela = telaDe(plano.modo);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, tela.largura, tela.altura);
  const vistos = quemSeVe(plano, tS);
  for (const [lugar, i] of vistos.entries()) {
    const destino = destinoDe(plano.modo, lugar);
    const f = fontes[i];
    const r = f ? recorteAoCentro(f.videoWidth, f.videoHeight, destino.largura, destino.altura) : null;
    if (r) ctx.drawImage(f, r.x, r.y, r.largura, r.altura, destino.x, destino.y, destino.largura, destino.altura);
    desenharCredito(ctx, credito(plano.canais[i]), destino);
  }
  return vistos;
}

/**
 * Gravar o clipe, com todos os vídeos a tocar ao mesmo tempo.
 *
 * Os vídeos chegam já postos no instante certo de cada um (com os ajustes de relógio de cada canal);
 * aqui só se arrancam juntos. O relógio do clipe é o do primeiro.
 *
 * Som: o de quem está na tela (`somEm`), trocando com a imagem, quando o navegador tem Web Audio
 * (`Contexto`); sem ele, o do ângulo `somDe` (por omissão o primeiro) do princípio ao fim. Nenhum com
 * `mudo`. Sem som é a saída para música com direitos de autor tocando ao fundo da live, que é a causa
 * de quase todas as reclamações de direitos (ver ESTUDO.md, riscos). `aoSom(i, tS)` diz cada troca.
 */
export async function gravarAngulos(videos, {
  plano, mudo = false, somDe = 0, aoProgresso = () => {}, sinal, formato, fps: fpsPedido,
  criarTela = () => document.createElement('canvas'),
  MR = globalThis.MediaRecorder,
  Contexto = globalThis.AudioContext || globalThis.webkitAudioContext,
  aoSom = () => {},
  exigirSom = false,
  arquivosSom = [],
} = {}) {
  if (!plano || !Array.isArray(videos) || videos.length < plano.canais.length) {
    throw new RangeError('falta um vídeo para cada ângulo do plano');
  }
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  const tipo = formato || await formatoQueFunciona({ MR, criarTela });
  if (!tipo) throw Object.assign(new Error('sem gravador'), { name: 'SEM-GRAVADOR' });

  const tela = criarTela();
  const medida = telaDe(plano.modo);
  tela.width = medida.largura;
  tela.height = medida.altura;
  const ctx = tela.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // A cadência da live (a do 9:16 e do 16:9 de um ângulo só), e o débito que vai com ela.
  const fps = fpsDaFonte(fpsPedido);
  // Um frame por pincelada, pedido à mão, quando o browser sabe (o mesmo motivo de retrato.js).
  const manual = typeof globalThis.CanvasCaptureMediaStreamTrack?.prototype?.requestFrame === 'function';
  const fluxo = tela.captureStream(manual ? 0 : fps);
  const faixaVideo = manual ? fluxo.getVideoTracks?.()[0] : null;
  let mistura = null;
  let captura = null;
  try {
    await Promise.all(videos.map((v) => noSitio(v, { esperaMs: 15000 })));
    const inicios = videos.map((v) => v.currentTime);
    // A mistura só faz falta quando o som muda de ângulo durante o clipe: no seguido com mais de um.
    if (!mudo) await Promise.all(videos.map((v) => v.play?.().catch?.(() => {})));
    mistura = !mudo && plano.modo === 'seguido' && plano.canais.length > 1
      ? await misturador(videos.slice(0, plano.canais.length), { Contexto, sinal, arquivosSom, exigirSom }) : null;
    let somAtual = -1;
    const trocarSom = (tS) => {
      if (!mistura) return;
      const i = somEm(plano, tS, somDe);
      if (i === somAtual) return;
      somAtual = i;
      mistura.ouvir(i);
      try { aoSom(i, tS); } catch { /* só aviso */ }
    };
    if (mistura) {
      for (const faixa of mistura.faixas) fluxo.addTrack(faixa);
      trocarSom(0);
    } else if (!mudo) {
      try {
        const i = videos[somDe] ? somDe : 0;
        const v = videos[i];
        const som = await capturarSom(v, { sinal, Contexto, arquivoSom: arquivosSom[i] });
        captura = som;
        for (const faixa of som.faixas) fluxo.addTrack(faixa);
        aoSom(i, 0);
      } catch (e) {
        if (exigirSom) {
          if (e.name === 'AbortError') throw e;
          throw e.name === 'SEM-SOM' ? e
          : Object.assign(new Error('o vídeo não tem uma faixa de áudio para gravar'), { name: 'SEM-SOM', cause: e });
        }
      }
    }
    if (!mudo && exigirSom && !(fluxo.getAudioTracks?.().length > 0)) {
      throw Object.assign(new Error('o vídeo não tem uma faixa de áudio para gravar'), { name: 'SEM-SOM' });
    }
    // Conferir áudio toca os vídeos; todos voltam ao instante combinado
    // antes de gravar, incluindo o canal cujo áudio foi conferido primeiro.
    for (const [i, v] of videos.entries()) { v.pause(); v.currentTime = inicios[i]; }
    await Promise.all(videos.map((v) => noSitio(v, { esperaMs: 15000 })));
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    return await gravarFluxo(videos, { plano, fluxo, tipo, ctx, sinal, aoProgresso, MR, trocarSom, fps, faixaVideo });
  } finally {
    mistura?.fechar();
    if (captura?.fechar) captura.fechar();
    else for (const f of captura?.stream.getTracks?.() || []) f.stop?.();
    for (const v of videos) v.pause();
    for (const faixa of fluxo.getTracks?.() || []) faixa.stop?.();
  }
}

async function gravarFluxo(videos, { plano, fluxo, tipo, ctx, sinal, aoProgresso, MR, trocarSom, fps, faixaVideo }) {
  const gravador = new MR(fluxo, { mimeType: tipo, videoBitsPerSecond: bitsDoVideo(fps), audioBitsPerSecond: BITS_SOM });
  const pedacos = [];
  gravador.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };

  await Promise.all(videos.map((v) => noSitio(v)));
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  const relogio = videos[0];
  const inicio = relogio.currentTime;
  let parar = false;
  let paradoDemais = false;
  let voltas = 0;
  let ultimoS = inicio;
  let pincel = null;
  const PARADO_MAX = Math.round(3 * fps);
  const acabar = () => {
    parar = true;
    clearInterval(pincel);
    if (gravador.state !== 'inactive') gravador.stop();
  };
  const pintar = () => {
    if (parar) return;
    const feito = Math.max(0, relogio.currentTime - inicio);
    desenharAngulos(ctx, videos, plano, feito);
    faixaVideo?.requestFrame?.();
    trocarSom(feito);
    voltas = relogio.currentTime > ultimoS ? 0 : voltas + 1;
    ultimoS = Math.max(ultimoS, relogio.currentTime);
    if (voltas > PARADO_MAX) { paradoDemais = true; acabar(); return; }
    aoProgresso({ feito, total: plano.duracaoS });
    if (feito >= plano.duracaoS) acabar();
  };
  const acabou = new Promise((ok, falha) => {
    gravador.onstop = () => {
      tipo = gravador.mimeType || tipo;
      ok(new Blob(pedacos, { type: tipo }));
    };
    gravador.onerror = (e) => falha(e.error || new Error('gravação falhou'));
  });
  sinal?.addEventListener('abort', acabar, { once: true });

  // A primeira imagem antes de o gravador arrancar: sem isto, os primeiros frames do ficheiro eram
  // pretos (o mesmo defeito que retrato.js já teve e mediu).
  let blob;
  try {
    desenharAngulos(ctx, videos, plano, 0);
    gravador.start();
    await Promise.all(videos.map((v) => v.play().catch(() => {})));
    pintar();
    // Acorda mais vezes do que os frames e só pinta quando é a vez: um setInterval seco a 60 fps rende
    // menos (os temporizadores do Windows acordam de 15,6 em 15,6 ms).
    const periodo = 1000 / fps;
    let proxima = performance.now() + periodo;
    pincel = setInterval(() => {
      const agora = performance.now();
      if (agora < proxima - periodo * 0.04) return;
      proxima = Math.max(proxima + periodo, agora - periodo * 0.5);
      pintar();
    }, Math.max(1, periodo / 8));
    blob = await acabou;
  } finally {
    clearInterval(pincel);
    sinal?.removeEventListener('abort', acabar);
    if (gravador.state !== 'inactive') gravador.stop();
    for (const v of videos) v.pause();
  }
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  if (paradoDemais) throw Object.assign(new Error('o vídeo não andou'), { name: 'GRAVACAO-PARADA' });
  if (!blob.size) throw Object.assign(new Error('não saiu nada'), { name: 'GRAVACAO-VAZIA' });
  return { blob, tipo, extensao: extensaoDe(tipo), fps };
}
