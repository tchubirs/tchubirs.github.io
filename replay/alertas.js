/**
 * Alertas da live: o som de um sub, de um follow, de uma doação ou de um kick cai no mesmo áudio que o
 * jogo, e a detecção de explosões toma-o por explosão ("Teve tiroteio e teve explosão" e era um sub novo).
 * A VOD da Kick tem UMA faixa de áudio (voz, jogo, Discord e alertas misturados), então não dá para
 * separar. O que dá para ver é que cada streamer tem os seus alertas, e que um alerta toca SEMPRE o mesmo
 * clipe, quase igual de cada vez, enquanto um estouro do Rust varia (distância, mistura, voz por cima).
 *
 * Por isso aprende-se por live, sem lista de sons de ninguém:
 *   1. de cada som que a detecção marcou guarda-se a "assinatura": o espectro em 20 bandas, de 50 em
 *      50 ms, na forma (sem o volume), mais o quanto ele é tonal (música) ou ruído;
 *   2. assinaturas que se parecem quase por inteiro (correlação alta) formam um grupo; um grupo com 3
 *      ou mais repetições e com cara de jingle é "alerta";
 *   3. o que cai num alerta sai da lista de explosões.
 *
 * O que isto NÃO garante: no Rust o mesmo C4 também toca o mesmo clipe. O que o distingue de um jingle
 * é a mistura (voz, tiros, distância) e o ser ruído e não tom. Por isso o grupo só vira alerta se for
 * tonal, ou se for quase idêntico (limiar mais apertado). Os números são o ponto de partida e não foram
 * afinados com gravações reais (ver FILA.md).
 *
 * E o inverso, um modelo POSITIVO do que é uma explosão do Rust (`treinarPositivo`/`pontuar`): uma nota
 * entre 0 e 1 de quanto a forma do som lembra as explosões confirmadas. É nota e não sim ou não, porque
 * distância, abafamento e o volume do jogo de cada um mudam o som. Sem modelo treinado não faz nada.
 */

import MODELO_EXPLOSAO from './modelo-explosao.js?v=488815493c';

export const TAXA_ESP = 24000;
export const JANELA = 1024;
export const SALTO = 1200; // 50 ms a 24 kHz
export const FPS_ESP = TAXA_ESP / SALTO; // 20
export const BANDAS = 20;
const HZ_MIN = 60;
const HZ_MAX = 11500;
const MAX_QUADROS = 80; // 4 s: um alerta passa disso raramente
const MIN_QUADROS = 6;

export const PADROES = {
  juntar: 0.85, // média da correlação com o grupo para entrar nele
  repetido: 0.9, // média dentro do grupo, para ele valer como alerta
  nRepete: 3, // repetições para valer sem ser quase idêntico
  tonalMax: 0.4, // achatamento médio abaixo disto: tem cara de tom/jingle
  identico: 0.97, // com 2 repetições, só se forem quase iguais E tonais
  tonalIdentico: 0.25,
  lembrado: 0.9, // contra um alerta que o canal já tinha aprendido
  // Tom forte (achatamento até 0,2: explosão do Rust nunca fica tão tonal, o mínimo medido nas explosões do
  // jogo é 0,25): basta repetir 2 vezes e a semelhança cai para 0,85. Medido nos 2 alertas do mesmo sub do
  // tchubi (4 min e 1 h 03 da live de 08/10): semelhança 0,88 e achatamento 0,17.
  tonalForte: 0.2,
  repetidoTonal: 0.85,
  lembradoTonal: 0.85,
  // A forma de onda também tem que se repetir: um alerta toca o MESMO clipe, uma explosão não. Medido com o som do
  // dono (live do tchubi, 08/10, os 2 alertas do mesmo sub, banda de 80 a 4000 Hz, folga de 0,5 s): 0,49. Os 16
  // sons do crreg que a regra do espectro tirava (e que parecem explosões de raid): mediana 0,20, que é o chão do
  // ruído (duas coisas sem relação dão 0,15 a 0,25). O corte fica entre os dois. Sem a forma de onda (som não
  // guardado) vale só o espectro, como antes.
  ondaMin: 0.35,
};

// ── o espectro ──────────────────────────────────────────────────────────────

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function bordas(taxa) {
  const b = [];
  for (let i = 0; i <= BANDAS; i++) {
    const hz = HZ_MIN * (HZ_MAX / HZ_MIN) ** (i / BANDAS);
    b.push(Math.min(JANELA / 2, Math.max(1, Math.round((hz * JANELA) / taxa))));
  }
  return b;
}

/**
 * O espectro de um pedaço de som: 20 bandas em escala de log, de 50 em 50 ms, em dB guardados num byte
 * (`quadros`, n x 20), e o achatamento de cada quadro (`plano`, 0 = um tom puro, 255 = ruído branco).
 */
export function medirEspectro(amostras, taxa = TAXA_ESP) {
  const salto = Math.round((taxa * SALTO) / TAXA_ESP);
  const n = Math.max(0, Math.floor((amostras.length - JANELA) / salto) + 1);
  const quadros = new Uint8Array(n * BANDAS);
  const plano = new Uint8Array(n);
  const re = new Float64Array(JANELA);
  const im = new Float64Array(JANELA);
  const hann = new Float64Array(JANELA);
  const pot = new Float64Array(JANELA / 2 + 1);
  const cum = new Float64Array(JANELA / 2 + 2);
  for (let i = 0; i < JANELA; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (JANELA - 1));
  const bd = bordas(taxa);
  const k0 = Math.max(1, Math.round((300 * JANELA) / taxa));
  const k1 = Math.min(JANELA / 2, Math.round((8000 * JANELA) / taxa));
  for (let q = 0; q < n; q++) {
    const o = q * salto;
    for (let i = 0; i < JANELA; i++) { re[i] = amostras[o + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < BANDAS; b++) {
      const a = bd[b];
      const z = Math.max(a + 1, bd[b + 1]);
      let e = 0;
      for (let k = a; k < z; k++) e += re[k] * re[k] + im[k] * im[k];
      e /= z - a;
      const db = 10 * Math.log10(e + 1e-9);
      quadros[q * BANDAS + b] = Math.max(0, Math.min(255, Math.round((db + 60) * 2)));
    }
    // Achatamento da estrutura fina: cada bin contra a média dos vizinhos (±16). Ruído dá ~0,56 mesmo
    // com o espectro inclinado; um tom, ou notas com harmónicos, dá bem menos.
    for (let k = 0; k <= JANELA / 2; k++) pot[k] = re[k] * re[k] + im[k] * im[k] + 1e-12;
    cum[0] = 0;
    for (let k = 0; k <= JANELA / 2; k++) cum[k + 1] = cum[k] + pot[k];
    let soma = 0;
    let logs = 0;
    for (let k = k0; k < k1; k++) {
      const a = Math.max(0, k - 16);
      const z = Math.min(JANELA / 2, k + 16) + 1;
      const razao = pot[k] / ((cum[z] - cum[a]) / (z - a));
      soma += razao;
      logs += Math.log(razao);
    }
    const w = k1 - k0;
    plano[q] = Math.round(255 * Math.min(1, Math.exp(logs / w) / (soma / w)));
  }
  return { quadros, plano };
}

/** O pedaço de `esp` entre os quadros `de` e `ate` (para a memória do que já se ouviu). */
export function cortarEsp(esp, de, ate) {
  if (!esp) return null;
  const n = esp.plano.length;
  const a = Math.max(0, Math.min(n, de));
  const b = Math.max(a, Math.min(n, ate));
  return { quadros: esp.quadros.subarray(a * BANDAS, b * BANDAS), plano: esp.plano.subarray(a, b) };
}

/** Os pedaços de várias partes `{ t, esp }` colados no relógio da noite (`deMs`..`ateMs`). */
export function colarEsp(partes, deMs, ateMs) {
  const n = Math.max(0, Math.round(((ateMs - deMs) / 1000) * FPS_ESP));
  const quadros = new Uint8Array(n * BANDAS);
  const plano = new Uint8Array(n);
  for (const p of partes) {
    if (!p.esp) continue;
    const o = Math.round(((p.t - deMs) / 1000) * FPS_ESP);
    const q = p.esp.plano.length;
    for (let i = Math.max(0, -o); i < q && o + i < n; i++) {
      plano[o + i] = p.esp.plano[i];
      for (let b = 0; b < BANDAS; b++) quadros[(o + i) * BANDAS + b] = p.esp.quadros[i * BANDAS + b];
    }
  }
  return { quadros, plano };
}

// ── a assinatura de um som ──────────────────────────────────────────────────

/**
 * A forma de um som achado (de `inicioS` a `fimS`, em segundos no relógio de `esp`): os quadros
 * seguidos, em dB, sem a média (o volume sai da conta), com no máximo 4 s. `plano` é o achatamento
 * médio, e `duracaoS` o do som todo.
 */
export function assinar(esp, inicioS, fimS) {
  const total = esp.plano.length;
  const de = Math.max(0, Math.floor(inicioS * FPS_ESP));
  const ate = Math.min(total, de + MAX_QUADROS, Math.max(de + MIN_QUADROS, Math.ceil(fimS * FPS_ESP)));
  const n = ate - de;
  if (n < MIN_QUADROS) return null;
  const v = new Float32Array(n * BANDAS);
  let soma = 0;
  let plano = 0;
  let topo = -Infinity;
  for (let i = 0; i < n * BANDAS; i++) { v[i] = esp.quadros[de * BANDAS + i] / 2 - 60; if (v[i] > topo) topo = v[i]; }
  // Um chão 40 dB abaixo do pico: o fundo (voz, jogo) não pode pesar mais que o som em si.
  for (let i = 0; i < v.length; i++) { if (v[i] < topo - 40) v[i] = topo - 40; soma += v[i]; }
  const m = soma / v.length;
  for (let i = 0; i < v.length; i++) v[i] -= m;
  for (let i = de; i < ate; i++) plano += esp.plano[i];
  return { n, v, plano: plano / n / 255, duracaoS: Math.max(0, fimS - inicioS) };
}

function correlacao(a, b, desvio) {
  // `b` deslocado `desvio` quadros em relação a `a`.
  const ia = Math.max(0, -desvio);
  const ib = Math.max(0, desvio);
  const n = Math.min(a.n - ia, b.n - ib);
  if (n < MIN_QUADROS) return 0;
  const len = n * BANDAS;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < len; i++) { ma += a.v[ia * BANDAS + i]; mb += b.v[ib * BANDAS + i]; }
  ma /= len; mb /= len;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < len; i++) {
    const x = a.v[ia * BANDAS + i] - ma;
    const y = b.v[ib * BANDAS + i] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/** O quanto dois sons se parecem, de -1 a 1: a melhor correlação com até um quadro de folga. */
export function semelhanca(a, b) {
  if (!a || !b) return 0;
  // Durações muito diferentes não são o mesmo clipe (a detecção corta o fim ao sabor do volume, por
  // isso a folga é larga).
  const maior = Math.max(a.n, b.n);
  const menor = Math.min(a.n, b.n);
  if (menor < 0.5 * maior && maior - menor > 10) return 0;
  return Math.max(correlacao(a, b, 0), correlacao(a, b, 1), correlacao(a, b, -1));
}

// ── a forma de onda de um som achado ────────────────────────────────────────

export const TAXA_ONDA = 6000;
const MAX_ONDA_S = 3.5;
const FOLGA_ONDA_S = 0.5;

/**
 * Um pedaço do som para comparar a forma de onda de dois sons parecidos: de `inicioS` a `fimS` (mais 0,3 s antes e
 * 0,5 s depois, no máximo 3,5 s), a 6 kHz (média de 4 amostras, que é também o passa-baixas) e sem o que está
 * abaixo de uns 80 Hz (menos a média móvel de 12 ms). 84 KB por som: guarda-se só dos sons que podem ser explosão.
 */
export function ondaDe(amostras, taxa, inicioS, fimS) {
  const de = Math.max(0, Math.floor((inicioS - 0.3) * taxa));
  const ate = Math.min(amostras.length, de + Math.round(Math.min(MAX_ONDA_S, fimS - inicioS + 0.8) * taxa));
  const passo = Math.max(1, Math.round(taxa / TAXA_ONDA));
  const n = Math.floor((ate - de) / passo);
  if (n < 256) return null;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < passo; k++) s += amostras[de + i * passo + k];
    v[i] = s / passo;
  }
  const j = Math.round(0.012 * TAXA_ONDA);
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + v[i];
  const saida = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - j);
    const z = Math.min(n, i + j + 1);
    saida[i] = v[i] - (cum[z] - cum[a]) / (z - a);
  }
  return { v: saida, t0S: de / taxa };
}

/**
 * O quanto a forma de onda de dois sons se parece, de 0 a 1: a melhor correlação em módulo com até 0,5 s de folga
 * (a detecção corta o começo de cada um ao sabor do volume). Duas coisas sem relação dão 0,15 a 0,25; o mesmo clipe
 * por cima de fundos diferentes, 0,4 a 0,6; um sem mistura, 0,9. Sem onda em um dos dois: null.
 */
export function semelhancaOnda(a, b) {
  if (!a?.v || !b?.v) return null;
  const n = Math.min(a.v.length, b.v.length);
  if (n < 256) return null;
  let N = 1;
  while (N < 2 * n) N <<= 1;
  const ar = new Float64Array(N);
  const ai = new Float64Array(N);
  const br = new Float64Array(N);
  const bi = new Float64Array(N);
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) { ar[i] = a.v[i]; br[i] = b.v[i]; na += ar[i] * ar[i]; nb += br[i] * br[i]; }
  if (!(na > 0 && nb > 0)) return null;
  fft(ar, ai);
  fft(br, bi);
  // A * conj(B); a inversa sai da mesma fft, conjugando a entrada e a saída.
  for (let i = 0; i < N; i++) {
    const re = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = re; ai[i] = -im;
  }
  fft(ar, ai);
  const folga = Math.min(n - 1, Math.round(FOLGA_ONDA_S * TAXA_ONDA));
  let melhor = 0;
  for (let l = -folga; l <= folga; l++) melhor = Math.max(melhor, Math.abs(ar[(l + N) % N]) / N);
  return melhor / Math.sqrt(na * nb);
}

/** A mediana da semelhança de onda entre os pares do grupo que têm onda, ou null se nenhum par tem. */
function ondaDoGrupo(indices, ondas) {
  const v = [];
  for (let x = 0; x < indices.length; x++) {
    for (let y = x + 1; y < indices.length; y++) {
      const c = semelhancaOnda(ondas[indices[x]], ondas[indices[y]]);
      if (c !== null) v.push(c);
    }
  }
  if (!v.length) return null;
  v.sort((p, q) => p - q);
  return v[Math.floor(v.length / 2)];
}

// ── aprender o que se repete ────────────────────────────────────────────────

/**
 * Agrupa as assinaturas (pela ordem em que vêm) e diz quais grupos são alertas.
 * Devolve `{ grupos: [{ indices, media, plano, alerta, modelo }], dosAlertas: Set<índice> }`.
 */
export function aprender(assinaturas, opcoes = {}, ondas = []) {
  const o = { ...PADROES, ...opcoes };
  const grupos = [];
  const sims = [];
  const sim = (i, j) => {
    const [a, b] = i < j ? [i, j] : [j, i];
    sims[a] ??= [];
    return (sims[a][b] ??= semelhanca(assinaturas[a], assinaturas[b]));
  };
  assinaturas.forEach((s, i) => {
    if (!s) return;
    let melhor = null;
    let melhorMedia = o.juntar;
    for (const g of grupos) {
      const media = g.indices.reduce((t, j) => t + sim(i, j), 0) / g.indices.length;
      if (media >= melhorMedia) { melhor = g; melhorMedia = media; }
    }
    if (melhor) melhor.indices.push(i); else grupos.push({ indices: [i] });
  });
  const dosAlertas = new Set();
  for (const g of grupos) {
    const k = g.indices.length;
    let t = 0;
    let c = 0;
    for (let x = 0; x < k; x++) for (let y = x + 1; y < k; y++) { t += sim(g.indices[x], g.indices[y]); c++; }
    g.media = c ? t / c : 0;
    g.plano = g.indices.reduce((s, j) => s + assinaturas[j].plano, 0) / k;
    g.alerta = (k >= o.nRepete && g.media >= o.repetido && g.plano <= o.tonalMax)
      || (k >= 2 && g.media >= o.identico && g.plano <= o.tonalIdentico)
      || (k >= 2 && g.media >= o.repetidoTonal && g.plano <= o.tonalForte);
    g.onda = ondaDoGrupo(g.indices, ondas);
    g.pelaOnda = false;
    // Parecido no espectro, mas a forma de onda não se repete: não é o mesmo clipe, é som parecido (explosões).
    if (g.alerta && g.onda !== null && g.onda < o.ondaMin) { g.alerta = false; g.pelaOnda = true; }
    if (g.alerta) {
      // O modelo é o membro mais parecido com os outros.
      let melhorI = g.indices[0];
      let melhorS = -Infinity;
      for (const i of g.indices) {
        const s = g.indices.reduce((tt, j) => tt + (i === j ? 0 : sim(i, j)), 0);
        if (s > melhorS) { melhorS = s; melhorI = i; }
      }
      g.modelo = assinaturas[melhorI];
      for (const i of g.indices) dosAlertas.add(i);
    }
  }
  return { grupos, dosAlertas };
}

/**
 * Tira de `achados` (`[{ inicioS, fimS, ... }]`, no relógio de `esp`) os que são alertas: os que se
 * repetem dentro da live e os que casam com um alerta que o canal já tinha (`lembrados`, modelos de
 * `deGuardado`). Devolve `{ mantidos, removidos, novos, notas }`: `removidos[i].porque` é 'repete' ou
 * 'lembrado' (com `.grupo`), `novos` os modelos de alerta aprendidos agora (para guardar no canal) e
 * `notas` a nota do modelo positivo de cada mantido, quando há `positivo: { modelo, minimo }`.
 */
export function tirarAlertas(achados, esp, { lembrados = [], opcoes = {}, positivo = null } = {}) {
  const o = { ...PADROES, ...opcoes };
  if (!achados.length || !esp?.plano?.length) return { mantidos: [...achados], removidos: [], novos: [], grupos: [] };
  const ass = achados.map((e) => assinar(esp, e.inicioS, e.fimS));
  const { grupos, dosAlertas } = aprender(ass, opcoes, achados.map((e) => e.onda || null));
  const mantidos = [];
  const removidos = [];
  achados.forEach((e, i) => {
    if (dosAlertas.has(i)) {
      const g = grupos.findIndex((x) => x.indices.includes(i));
      removidos.push({
        ...e, porque: 'repete', grupo: g, repeticoes: grupos[g].indices.length, semelhanca: grupos[g].media, onda: grupos[g].onda,
      });
      return;
    }
    let casou = -1;
    let melhor = 0;
    lembrados.forEach((m, j) => {
      const s = semelhanca(ass[i], m);
      if (s >= (m.plano <= o.tonalForte ? o.lembradoTonal : o.lembrado) && s > melhor) { melhor = s; casou = j; }
    });
    if (casou >= 0) { removidos.push({ ...e, porque: 'lembrado', grupo: casou, semelhanca: melhor }); return; }
    if (positivo?.modelo && ass[i]) {
      const nota = pontuar(ass[i], positivo.modelo);
      if (nota < (positivo.minimo ?? 0.05)) { removidos.push({ ...e, porque: 'nao-parece-explosao', nota }); return; }
      mantidos.push({ ...e, nota });
      return;
    }
    mantidos.push(e);
  });
  const novos = grupos.filter((g) => g.alerta).map((g) => g.modelo);
  return { mantidos, removidos, novos, grupos, assinaturas: ass };
}

// ── guardar no canal (localStorage) ─────────────────────────────────────────

const MAX_LEMBRADOS = 8;

/** Um modelo de alerta em texto curto: quadros em meio dB num byte com sinal, em base64. */
export function paraGuardado(m) {
  const b = new Int8Array(m.v.length);
  for (let i = 0; i < b.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round(m.v[i] * 2)));
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i] & 255);
  return { n: m.n, plano: Math.round(m.plano * 1000) / 1000, d: Math.round(m.duracaoS * 100) / 100, q: btoa(s) };
}

export function deGuardado(g) {
  if (!g || !Number.isInteger(g.n) || g.n < MIN_QUADROS || g.n > MAX_QUADROS || typeof g.q !== 'string') return null;
  let s;
  try { s = atob(g.q); } catch { return null; }
  if (s.length !== g.n * BANDAS) return null;
  const v = new Float32Array(s.length);
  for (let i = 0; i < v.length; i++) { const c = s.charCodeAt(i); v[i] = (c > 127 ? c - 256 : c) / 2; }
  return { n: g.n, v, plano: Number(g.plano) || 0, duracaoS: Number(g.d) || 0 };
}

/**
 * A memória de um canal no aparelho: `lembrados` (o que já se aprendeu) e `aoAprender(novos)`, que junta
 * o que veio agora ao que havia (sem repetir o que já se parece) e guarda. Sem armazenamento, não guarda.
 */
export function memoriaDoCanal(slug, armazem = globalThis.localStorage) {
  const chave = `povix.alertas.${String(slug || '').toLowerCase()}`;
  let lembrados = [];
  try { lembrados = (JSON.parse(armazem?.getItem(chave) || '[]') || []).map(deGuardado).filter(Boolean); } catch { lembrados = []; }
  return {
    lembrados,
    aoAprender(novos) {
      const todos = [...lembrados];
      for (const m of novos) if (!todos.some((x) => semelhanca(x, m) >= PADROES.lembrado)) todos.push(m);
      lembrados = todos.slice(-MAX_LEMBRADOS);
      try { armazem?.setItem(chave, JSON.stringify(lembrados.map(paraGuardado))); } catch { /* sem espaço ou bloqueado */ }
    },
  };
}

/**
 * Liga o modelo positivo e diz o corte. Ligado porque, na live do tchubi de 08/10, os 8 sons que a detecção
 * tomava por explosão (2 alertas de sub e 6 tiros de perto; o dono confirmou: nenhum era explosão) ficam todos
 * abaixo de 0,4, e 91% das explosões do jogo (aumentadas, não vistas no treino) ficam acima. O corte foi
 * escolhido nessa mesma live: afinado dentro da amostra.
 */
export const POSITIVO = { ligado: true, minimo: 0.4 };

/**
 * O que `varrerNoite` recebe em `alertas`, igual nos modos simples e avançado: a memória do canal (alertas
 * já aprendidos) e, se ligado, o modelo positivo.
 */
export function alertasDoCanal(slug, armazem) {
  const memoria = memoriaDoCanal(slug, armazem);
  return { ...memoria, positivo: POSITIVO.ligado ? { modelo: MODELO_EXPLOSAO, minimo: POSITIVO.minimo } : null };
}

// ── o modelo positivo: parece uma explosão do Rust? ─────────────────────────

/**
 * O que se mede de uma assinatura para o modelo positivo: forma média do espectro (20 números), duração,
 * queda e achatamento (tom contra ruído; uma explosão é ruído, um jingle ou uma voz cantada não é).
 */
export function tracos(a) {
  const forma = new Float32Array(BANDAS);
  for (let i = 0; i < a.n; i++) for (let b = 0; b < BANDAS; b++) forma[b] += a.v[i * BANDAS + b] / a.n;
  // A queda: dB por segundo da força média, entre os primeiros e os últimos quadros.
  const nivel = (i) => { let s = 0; for (let b = 0; b < BANDAS; b++) s += a.v[i * BANDAS + b]; return s / BANDAS; };
  const k = Math.min(a.n - 1, 3);
  let queda = 0;
  if (a.n > 2 * k) {
    let ini = 0;
    let fim = 0;
    for (let i = 0; i < k + 1; i++) { ini += nivel(i); fim += nivel(a.n - 1 - i); }
    queda = ((fim - ini) / (k + 1)) / (a.n / FPS_ESP);
  }
  return [...forma, Math.log2(Math.max(0.3, a.duracaoS)), queda, a.plano];
}

/** Treina o modelo com assinaturas de explosões confirmadas: média e desvio de cada traço. */
export function treinarPositivo(assinaturas, { minimo = 4 } = {}) {
  const t = assinaturas.filter(Boolean).map(tracos);
  if (t.length < minimo) return null;
  const media = t[0].map((_, j) => t.reduce((s, x) => s + x[j], 0) / t.length);
  // Pisos: uma amostra pequena não pode dizer que a variação é zero.
  const piso = [...new Array(BANDAS).fill(2), 0.4, 3, 0.04];
  const desvio = media.map((m, j) => Math.max(piso[j], Math.sqrt(t.reduce((s, x) => s + (x[j] - m) ** 2, 0) / t.length)));
  const r = (x) => Math.round(x * 100) / 100;
  return { n: t.length, media: media.map(r), desvio: desvio.map(r) };
}

/**
 * Nota de 0 a 1 de quanto a assinatura lembra o modelo (1 = igual à média; cai com o desvio). A forma do
 * espectro conta como UM traço (a média dos 20 desvios) e a duração, a queda e o achatamento contam um
 * cada: assim uma coisa muito fora (um tom de 6 s, um tiro com agudo demais) derruba a nota, e não se
 * dilui nas 20 bandas.
 */
export function pontuar(a, modelo) {
  if (!a || !modelo || modelo.media?.length !== BANDAS + 3) return null;
  const t = tracos(a);
  const z = (j) => ((t[j] - modelo.media[j]) / modelo.desvio[j]) ** 2;
  let forma = 0;
  for (let j = 0; j < BANDAS; j++) forma += z(j);
  const z2 = (forma / BANDAS + z(BANDAS) + z(BANDAS + 1) + z(BANDAS + 2)) / 4;
  return Math.exp(-0.5 * z2);
}
