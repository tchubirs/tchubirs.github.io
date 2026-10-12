/**
 * Os sons de acerto do Rust ("hitmarker"): quando o dono do jogo acerta um jogador, o cliente toca um clipe fixo
 * (um estalo de corpo, e um som diferente para tiro na cabeça e para morte). É o mesmo clipe, sempre igual, tocado
 * em 2D por cima do jogo, então dá para achá-lo no som da live por correlação com um modelo, o que um tiro (que
 * varia com a arma, a distância e o eco) não permite. Um acerto confirma que o tiro foi em um JOGADOR: é o que separa
 * um PvP de bater em árvore ou de gente falando.
 *
 * Como se acha:
 *   1. o som da live (24 kHz) vai para 12 kHz e passa por uma banda (a do modelo): menos a média móvel dos graves,
 *      e uma média curta nos agudos;
 *   2. correlação normalizada com cada modelo (FFT, por pedaços): a nota é de 0 a 1 e não depende do volume;
 *   3. os melhores picos de cada modelo ficam guardados com o trecho de som, e `confirmarAcertos` só aceita um
 *      modelo se esses picos se parecem ENTRE SI (o mesmo clipe): um estalo qualquer parecido com o modelo não
 *      repete a forma. Sem repetição, nenhum acerto: é o que acontece quando o dono do canal desligou o som de
 *      acerto, ou o jogo está baixo na live, e aí a lista cai no que havia antes.
 *
 * Os modelos (`acertos-modelos.js`) são vetores de 3 a 4 mil números em 8 bits, filtrados para a banda de cada um.
 */

import { fft } from './alertas.js?v=78c992b68e';
import MODELOS_PADRAO from './acertos-modelos.js?v=78c992b68e';

export const TAXA_ACERTO = 12000;
/** A nota (correlação) mínima de um pico guardado como candidato. */
export const NOTA_CANDIDATO = 0.45;
/** A nota mínima de um acerto aceito (0,55 deixava passar 115 "acertos" em 2 h de live sem nenhum clipe: estalos e tiros parecidos com o modelo). */
export const NOTA_MINIMA = 0.75;
/** A semelhança mínima entre os picos de um modelo para ele valer neste canal (mediana dos pares). */
export const REPETE_MIN = 0.65;
/** Quantos candidatos por modelo ficam guardados em cada chamada. */
const POR_MODELO = 40;
/** Dois acertos a menos disto são o mesmo (o clipe dura até 0,3 s e o eco dele tem outro pico). */
const REFRACTARIO_S = 0.25;
/** Quanto da repetição do modelo cada pico tem que ter (a mediana dele contra os melhores). */
const PROPRIO = 0.8;

/** Média móvel centrada de `j` amostras (a soma acumulada: uma passagem). */
function mediaMovel(x, j) {
  const n = x.length;
  if (j <= 1) return Float32Array.from(x);
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + x[i];
  const saida = new Float32Array(n);
  const m = Math.floor(j / 2);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - m);
    const z = Math.min(n, i + m + 1);
    saida[i] = (cum[z] - cum[a]) / (z - a);
  }
  return saida;
}

/**
 * A banda de um modelo: `hp` e `lp` são o tamanho (em amostras de 12 kHz) das duas médias. O resultado é a média
 * curta (corta o agudo) menos a longa (corta o grave); com `lp` 1 o agudo passa inteiro.
 */
export function passarBanda(x, { hp, lp }) {
  const baixo = mediaMovel(x, lp);
  const grave = mediaMovel(x, hp);
  const saida = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) saida[i] = baixo[i] - grave[i];
  return saida;
}

/** De 24 kHz (ou outra taxa) para 12 kHz, pela média das amostras de cada passo. */
export function paraDoze(amostras, taxa) {
  const passo = Math.max(1, Math.round(taxa / TAXA_ACERTO));
  const n = Math.floor(amostras.length / passo);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < passo; k++) s += amostras[i * passo + k];
    v[i] = s / passo;
  }
  return v;
}

/** Um modelo em texto curto (base64 de números de 8 bits com sinal) para o vetor de decimais. */
export function lerModelo(m) {
  if (m.v) return m;
  const s = atob(m.q);
  const v = new Float32Array(s.length);
  for (let i = 0; i < v.length; i++) { const c = s.charCodeAt(i); v[i] = (c > 127 ? c - 256 : c) / 127; }
  return { ...m, v };
}

/** O contrário: de um vetor filtrado para o texto do modelo (usado só ao gerar `acertos-modelos.js`). */
export function paraTexto(v) {
  let pico = 0;
  for (const x of v) pico = Math.max(pico, Math.abs(x));
  let s = '';
  for (const x of v) s += String.fromCharCode(Math.round((x / (pico || 1)) * 127) & 255);
  return btoa(s);
}

function correlacaoMaxima(a, b, folga) {
  // melhor correlação normalizada entre dois trechos do mesmo tamanho, com `folga` amostras para cada lado
  const n = Math.min(a.length, b.length);
  let N = 1;
  while (N < 2 * n) N <<= 1;
  const ar = new Float64Array(N);
  const ai = new Float64Array(N);
  const br = new Float64Array(N);
  const bi = new Float64Array(N);
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) { ar[i] = a[i]; br[i] = b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!(na > 0 && nb > 0)) return 0;
  fft(ar, ai);
  fft(br, bi);
  for (let i = 0; i < N; i++) {
    const re = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = re; ai[i] = -im;
  }
  fft(ar, ai);
  let melhor = 0;
  for (let l = -folga; l <= folga; l++) melhor = Math.max(melhor, Math.abs(ar[(l + N) % N]) / N);
  return melhor / Math.sqrt(na * nb);
}

/**
 * Procura os modelos no som. Devolve os candidatos, pelo tempo: `[{ s, nota, id, tipo, trecho }]`, `s` em segundos
 * desde o começo de `amostras` e `trecho` o som filtrado no lugar do pico (para `confirmarAcertos`).
 * `janelas` (`[[deS, ateS]]`) limita onde se procura: o resto do som nem se correlaciona.
 */
export function medirAcertos(amostras, taxa, { modelos = MODELOS_PADRAO, janelas = null, nota = NOTA_CANDIDATO } = {}) {
  const lista = modelos.map(lerModelo);
  const x = paraDoze(amostras, taxa);
  const saida = [];
  const filtrados = new Map();
  const filtrar = (b) => {
    const chave = `${b.hp}/${b.lp}`;
    if (!filtrados.has(chave)) filtrados.set(chave, passarBanda(x, b));
    return filtrados.get(chave);
  };
  for (const m of lista) {
    const y = filtrar(m.banda);
    const tn = m.v.length;
    if (y.length < tn + 4) continue;
    let norma = 0;
    for (const v of m.v) norma += v * v;
    norma = Math.sqrt(norma);
    const cum = new Float64Array(y.length + 1);
    for (let i = 0; i < y.length; i++) cum[i + 1] = cum[i] + y[i] * y[i];
    // A correlação por pedaços de N amostras (a FFT do pedaço, vezes a do modelo invertido).
    const N = 1 << 15;
    const passo = N - tn;
    const tr = new Float64Array(N);
    const ti = new Float64Array(N);
    for (let i = 0; i < tn; i++) tr[i] = m.v[tn - 1 - i];
    fft(tr, ti);
    const corr = new Float32Array(y.length - tn + 1);
    const quer = (a, b) => !janelas || janelas.some(([d, z]) => b / TAXA_ACERTO >= d && a / TAXA_ACERTO <= z);
    const sr = new Float64Array(N);
    const si = new Float64Array(N);
    for (let ini = 0; ini < corr.length; ini += passo) {
      const fim = Math.min(y.length, ini + N);
      if (!quer(ini, fim)) continue;
      sr.fill(0); si.fill(0);
      for (let i = ini; i < fim; i++) sr[i - ini] = y[i];
      fft(sr, si);
      for (let i = 0; i < N; i++) {
        const re = sr[i] * tr[i] - si[i] * ti[i];
        const im = sr[i] * ti[i] + si[i] * tr[i];
        sr[i] = re; si[i] = -im;
      }
      fft(sr, si);
      for (let k = 0; k < passo && ini + k < corr.length; k++) {
        const e = cum[ini + k + tn] - cum[ini + k];
        corr[ini + k] = e > 1e-12 ? (sr[k + tn - 1] / N) / (Math.sqrt(e) * norma) : 0;
      }
    }
    // Os melhores picos, com um tempo de descanso entre eles.
    const idx = [];
    for (let i = 1; i < corr.length - 1; i++) if (corr[i] >= nota && corr[i] >= corr[i - 1] && corr[i] >= corr[i + 1]) idx.push(i);
    idx.sort((a, b) => corr[b] - corr[a]);
    const ficam = [];
    for (const i of idx) {
      if (ficam.length >= POR_MODELO) break;
      if (ficam.every((j) => Math.abs(i - j) > REFRACTARIO_S * TAXA_ACERTO)) ficam.push(i);
    }
    for (const i of ficam) {
      // O trecho em 8 bits (a correlação não liga para a escala): 3,6 KB por candidato.
      const t = y.subarray(i, i + tn);
      let pico = 0;
      for (const v of t) pico = Math.max(pico, Math.abs(v));
      const q = new Int8Array(tn);
      for (let k = 0; k < tn; k++) q[k] = Math.round((t[k] / (pico || 1)) * 127);
      saida.push({ s: i / TAXA_ACERTO, nota: corr[i], id: m.id, tipo: m.tipo, trecho: q });
    }
  }
  return saida.sort((a, b) => a.s - b.s);
}

/**
 * Dos candidatos de uma live (`medirAcertos` de todos os bocados, com `ms` no relógio da noite) aos acertos: um
 * modelo só vale se os seus melhores picos (pelo menos 3, com nota de 0,55 ou mais) repetem a forma entre si,
 * com mediana de semelhança de `REPETE_MIN`. Devolve `{ acertos, modelos }`: `acertos` pelo tempo
 * (`{ ms, nota, tipo, id, confianca }`), e em `modelos` o que se viu de cada modelo (quantos picos, repetição, se valeu).
 */
export function confirmarAcertos(candidatos, { notaMinima = NOTA_MINIMA, repeteMin = REPETE_MIN, minimoPicos = 3 } = {}) {
  const porModelo = new Map();
  for (const c of candidatos) {
    if (!porModelo.has(c.id)) porModelo.set(c.id, []);
    porModelo.get(c.id).push(c);
  }
  const acertos = [];
  const modelos = [];
  for (const [id, todos] of porModelo) {
    const fortes = todos.filter((c) => c.nota >= notaMinima).sort((a, b) => b.nota - a.nota);
    const topo = fortes.slice(0, 8);
    const pares = [];
    for (let i = 0; i < topo.length; i++) {
      for (let j = i + 1; j < topo.length; j++) pares.push(correlacaoMaxima(topo[i].trecho, topo[j].trecho, 120));
    }
    pares.sort((a, b) => a - b);
    const repete = pares.length ? pares[Math.floor(pares.length / 2)] : 0;
    const vale = topo.length >= minimoPicos && repete >= repeteMin;
    modelos.push({ id, picos: fortes.length, repete: Math.round(repete * 100) / 100, vale });
    if (!vale) continue;
    // Cada pico tem que se parecer com os melhores (a mediana da semelhança com eles), senão é um estalo que só
    // lembra o modelo.
    for (const c of fortes) {
      const contra = topo.filter((o) => o !== c).map((o) => correlacaoMaxima(c.trecho, o.trecho, 120)).sort((a, b) => a - b);
      const propria = contra.length ? contra[Math.floor(contra.length / 2)] : 0;
      if (propria >= repeteMin * PROPRIO) acertos.push({ ms: c.ms, nota: c.nota, tipo: c.tipo, id, repete, propria });
    }
  }
  acertos.sort((a, b) => a.ms - b.ms);
  return { acertos, modelos };
}
