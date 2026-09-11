'use strict';
/**
 * Ler o painel de morte do Rust no vídeo do próprio streamer.
 *
 * É a terceira fonte do lado do jogo, e nasceu de uma pergunta dele que
 * desmontou o desenho todo: *"pra que tu precisa de API?"*
 *
 * Tinha razão. O A2S (`rust-a2s.js`) dá a lista INTEIRA do servidor e pode
 * vir censurada; o BattleMetrics passou a exigir subscrição paga — medido a
 * 11/09/2026, a API responde `403 Access denied. A subscription is required`.
 * Só que nenhuma das duas responde à pergunta que interessa, que não é *quem
 * está no servidor* mas **quem o matou**. E essa pessoa escreve o próprio
 * nome no ecrã dele, em letras grandes, de cada vez que o mata:
 *
 *     VIVEU DURANTE 3m25s — MORTO POR Dehxter — COM UM(A) Thompson — À 33.1m
 *
 * O vídeo é público, não precisa de chave, de login nem da cooperação de
 * ninguém. Funciona com qualquer streamer de Rust, ao vivo ou em VOD.
 *
 * ## O que é puro aqui, e porquê
 *
 * `caixasDaFila`, `agrupar` e `votar` não tocam em disco nem em rede: foram
 * exactamente as três coisas que se partiram ao construir isto, e por isso
 * são as três que têm teste. O `ffmpeg` e o `tesseract` ficam nas bordas.
 */

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const correr = promisify(execFile);

/** A faixa de cima do ecrã, onde o painel vive. */
const FAIXA = 'crop=iw:ih*0.13:0:ih*0.015';
/** Dentro dela, a fila das caixas — sem o rótulo por cima nem as estatísticas por baixo. */
const FILA = 'crop=iw:ih*0.42:0:ih*0.14';
const LETRAS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.[]';

/**
 * As colunas onde há caixa vermelha, numa fila já recortada.
 *
 * @param {Buffer|Uint8Array} rgb - a fila em RGB24, linha a linha
 * @param {number} largura
 * @param {number} altura
 * @returns {Array<[number, number]>} pares [x0, x1), da esquerda para a direita
 *
 * O limite é 45% da altura DESTA fila, e não da faixa inteira. Medido: a
 * caixa ocupa 23% da faixa, o limite estava em 25%, e por isso só passavam as
 * colunas mais saturadas — saíam caixas de 32 px onde a verdadeira tem 105, e
 * o texto lá dentro vinha cortado ao meio. Falhava por dois pontos
 * percentuais e parecia que o OCR é que não prestava.
 */
function caixasDaFila(rgb, largura, altura, { minLargura = 25, juntarAte = 6 } = {}) {
  if (!rgb || !(largura > 0) || !(altura > 0)) return [];
  const coluna = new Array(largura).fill(0);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 3;
      const r = rgb[i]; const g = rgb[i + 1]; const b = rgb[i + 2];
      if (r > 100 && r > g * 1.6 && r > b * 1.6) coluna[x]++;
    }
  }
  const limite = altura * 0.45;
  const cru = [];
  let ini = null;
  for (let x = 0; x < largura; x++) {
    const forte = coluna[x] > limite;
    if (forte && ini === null) ini = x;
    if (!forte && ini !== null) { cru.push([ini, x]); ini = null; }
  }
  if (ini !== null) cru.push([ini, largura]);

  // Colar caixas quase encostadas (o texto claro parte a coluna ao meio) e
  // deitar fora o que for estreito demais para ser uma caixa.
  const juntas = [];
  for (const [a, b] of cru) {
    const ultima = juntas[juntas.length - 1];
    if (ultima && a - ultima[1] <= juntarAte) ultima[1] = b;
    else juntas.push([a, b]);
  }
  return juntas.filter(([a, b]) => b - a >= minLargura);
}

/**
 * Juntar leituras seguidas na MESMA morte.
 *
 * O ecrã de morte fica no ar dezenas de segundos, e a uma imagem por segundo
 * isso são dezenas de leituras do mesmo acontecimento. Sem isto, uma hora de
 * live dava "44 mortes" onde tinham sido dez.
 *
 * @param {Array<{quandoS:number}>} leituras
 */
function agrupar(leituras, { intervaloS = 20 } = {}) {
  const ordenadas = [...(leituras || [])].sort((a, b) => a.quandoS - b.quandoS);
  const grupos = [];
  for (const l of ordenadas) {
    const g = grupos[grupos.length - 1];
    if (g && l.quandoS - g[g.length - 1].quandoS <= intervaloS) g.push(l);
    else grupos.push([l]);
  }
  return grupos;
}

/**
 * O nome mais repetido de um grupo, e quanta confiança isso dá.
 *
 * O painel ANIMA a entrar, e os primeiros quadros apanham o texto ainda a
 * aparecer — saem em lixo (`ete`, `toe`, `gle`). Não se conserta o OCR desses
 * quadros; conserta-se pedindo várias leituras e ficando com a que se repete.
 * Leituras curtas nem votam: duas letras nunca são um nome.
 */
function votar(grupo, { minLetras = 4 } = {}) {
  const bons = (grupo || []).map((l) => l && l.nome).filter((n) => n && n.length >= minLetras);
  if (!bons.length) return { nome: null, votos: 0, de: (grupo || []).length, confianca: 0 };
  const conta = new Map();
  for (const n of bons) conta.set(n, (conta.get(n) || 0) + 1);
  let nome = null; let votos = 0;
  for (const [n, v] of conta) if (v > votos) { nome = n; votos = v; }
  return { nome, votos, de: grupo.length, confianca: votos / grupo.length };
}

/** Um nome só vale como resposta quando se repetiu. Um voto é um palpite. */
const seguro = (v) => Boolean(v && v.nome && v.votos >= 2);

// ── as bordas: ffmpeg e tesseract ───────────────────────────────────────────

async function ffmpegCru(png, filtros) {
  const { stdout } = await correr('ffmpeg',
    ['-v', 'error', '-i', png, '-vf', filtros, '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function ocr(png, filtros, { psm = 7, lista = LETRAS } = {}) {
  const tmp = path.join(os.tmpdir(), `painel-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  try {
    await correr('ffmpeg', ['-v', 'error', '-i', png, '-vf', filtros, tmp, '-y']);
    const args = [tmp, '-', '--psm', String(psm)];
    if (lista) args.push('-c', `tessedit_char_whitelist=${lista}`);
    const { stdout } = await correr('tesseract', args);
    return stdout;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Há painel de morte neste quadro?
 *
 * Procura as PALAVRAS, e não a cor. A primeira versão procurava vermelho e
 * marcava o pôr do sol do Rust, que pinta o ecrã inteiro de laranja.
 *
 * E o contraste tem de ser contraste, não limiar: com `lut` a cortar aos 150
 * o texto cinzento "MORTO POR" desaparecia e só sobrava o branco sobre
 * vermelho — o painel estava lá e o detector dizia que não.
 */
async function temPainel(png) {
  const t = await ocr(png, `${FAIXA},scale=iw*2:ih*2:flags=lanczos,format=gray,eq=contrast=1.8,negate`,
    { psm: 6, lista: null });
  return /MORTO/i.test(t);
}

/**
 * Ler as caixas do painel: a primeira é quem matou, a segunda é a arma.
 *
 * A ampliação é 3x e não 7x. A 7x o `Dehxter` — que se lê a olho na imagem —
 * saía do tesseract como `ar`: ele espera letras de umas dezenas de pixels,
 * não de cem.
 */
async function lerPainel(png, { largura = 1280 } = {}) {
  const rgb = await ffmpegCru(png, `${FAIXA},${FILA},scale=${largura}:-1,format=rgb24`);
  const altura = Math.floor(rgb.length / (largura * 3));
  if (!altura) return { nome: null, arma: null, caixas: [] };
  const caixas = caixasDaFila(rgb, largura, altura);
  const lidas = [];
  for (const [x0, x1] of caixas) {
    const a = x0 / largura; const l = (x1 - x0) / largura;
    const t = await ocr(png,
      `${FAIXA},crop=iw*${l.toFixed(5)}:ih*0.34:iw*${a.toFixed(5)}:ih*0.20,`
      + 'scale=iw*3:ih*3:flags=lanczos,format=gray,eq=contrast=1.6,negate');
    lidas.push(t.replace(/[^A-Za-z0-9_\-.[\]]/g, '').trim());
  }
  return {
    nome: lidas[0] && lidas[0].length >= 2 ? lidas[0] : null,
    arma: lidas[1] || null,
    caixas: caixas.length,
  };
}

module.exports = { caixasDaFila, agrupar, votar, seguro, temPainel, lerPainel, FAIXA, FILA };
