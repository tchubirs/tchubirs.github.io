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

import { RETRATO, formatoQueFunciona, extensaoDe, noSitio, BITS_VIDEO, BITS_SOM } from './retrato.js';

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
 * Som: o do ângulo `somDe` (por omissão o primeiro), ou nenhum com `mudo`. Sem som é a saída para
 * música com direitos de autor tocando ao fundo da live, que é a causa de quase todas as reclamações
 * de direitos (ver ESTUDO.md, riscos).
 */
export async function gravarAngulos(videos, {
  plano, mudo = false, somDe = 0, aoProgresso = () => {}, sinal, formato,
  criarTela = () => document.createElement('canvas'),
  MR = globalThis.MediaRecorder,
} = {}) {
  if (!plano || !Array.isArray(videos) || videos.length < plano.canais.length) {
    throw new RangeError('falta um vídeo para cada ângulo do plano');
  }
  const tipo = formato || await formatoQueFunciona({ MR, criarTela });
  if (!tipo) throw Object.assign(new Error('sem gravador'), { name: 'SEM-GRAVADOR' });

  const tela = criarTela();
  const medida = telaDe(plano.modo);
  tela.width = medida.largura;
  tela.height = medida.altura;
  const ctx = tela.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const fluxo = tela.captureStream(30);
  if (!mudo) {
    try {
      const v = videos[somDe] || videos[0];
      const som = v.captureStream?.() || v.mozCaptureStream?.();
      for (const faixa of som?.getAudioTracks?.() || []) fluxo.addTrack(faixa);
    } catch { /* sem som: o vídeo continua a valer */ }
  }
  const gravador = new MR(fluxo, { mimeType: tipo, videoBitsPerSecond: BITS_VIDEO, audioBitsPerSecond: BITS_SOM });
  const pedacos = [];
  gravador.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };

  await Promise.all(videos.map((v) => noSitio(v)));
  const relogio = videos[0];
  const inicio = relogio.currentTime;
  let parar = false;
  let paradoDemais = false;
  let voltas = 0;
  let pincel = null;
  const PARADO_MAX = 90; // 3 s sem o relógio andar
  const acabar = () => {
    parar = true;
    clearInterval(pincel);
    if (gravador.state !== 'inactive') gravador.stop();
  };
  const pintar = () => {
    if (parar) return;
    const feito = Math.max(0, relogio.currentTime - inicio);
    desenharAngulos(ctx, videos, plano, feito);
    voltas = feito > 0.05 ? 0 : voltas + 1;
    if (voltas > PARADO_MAX) { paradoDemais = true; acabar(); return; }
    aoProgresso({ feito, total: plano.duracaoS });
    if (feito >= plano.duracaoS) acabar();
  };
  const acabou = new Promise((ok, falha) => {
    gravador.onstop = () => ok(new Blob(pedacos, { type: tipo }));
    gravador.onerror = (e) => falha(e.error || new Error('gravação falhou'));
  });
  sinal?.addEventListener('abort', acabar, { once: true });

  // A primeira imagem antes de o gravador arrancar: sem isto, os primeiros frames do ficheiro eram
  // pretos (o mesmo defeito que retrato.js já teve e mediu).
  desenharAngulos(ctx, videos, plano, 0);
  gravador.start();
  await Promise.all(videos.map((v) => v.play().catch(() => {})));
  pintar();
  pincel = setInterval(pintar, 1000 / 30);
  const blob = await acabou;
  clearInterval(pincel);
  for (const v of videos) v.pause();
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  if (paradoDemais) throw Object.assign(new Error('o vídeo não andou'), { name: 'GRAVACAO-PARADA' });
  if (!blob.size) throw Object.assign(new Error('não saiu nada'), { name: 'GRAVACAO-VAZIA' });
  return { blob, tipo, extensao: extensaoDe(tipo) };
}
