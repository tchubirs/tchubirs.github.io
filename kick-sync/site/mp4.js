// Os pedaços da Kick (MPEG-TS) passados a MP4, cortados no décimo de segundo pedido.
//
// O teste real de 12/10 (QA-REAL.md): o 16:9 saía em `.ts`, colado byte a byte, e até 16 s mais comprido
// do que o pedido, porque só se cortava nas fronteiras dos pedaços de 10 s. TikTok, Instagram e X não
// aceitam `.ts`, e quem clipa tinha de converter e aparar noutro programa.
//
// Aqui não se recodifica nada: o H.264 e o AAC da Kick passam para dentro de um MP4 tal como vêm. O corte
// exato faz-se com a lista de edição do MP4 (`elst`): o ficheiro leva o vídeo desde a imagem-chave
// anterior ao início (sem ela, as imagens seguintes não se descodificam), e a lista diz ao leitor para
// mostrar só a partir do instante pedido e até ao fim pedido. É o que o ffmpeg, o Chrome, o Safari e o
// QuickTime fazem com qualquer MP4 cortado sem recodificar. Uma montagem num vídeo só é a mesma coisa
// com uma entrada da lista por clipe.
//
// O que entra: pacotes TS de 188 bytes com H.264 (tipo 0x1B) e AAC em ADTS (tipo 0x0F), que é o que a Kick
// serve (medido em 31/08 e 12/10). Outra coisa qualquer (HEVC, sem vídeo) dá erro com nome, e quem chama
// devolve o `.ts` como antes, a dizer porquê.

const PACOTE = 188;
const RELOGIO = 90_000;            // o relógio do TS, em tiques por segundo
const ESCALA_FILME = 1000;         // a do mvhd e das durações da lista de edição: milissegundos
const TAXAS_AAC = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

const erro = (nome, msg) => Object.assign(new Error(msg), { name: nome });

// ── TS ───────────────────────────────────────────────────────────────────

function cargaUtil(b, i) {
  const controlo = (b[i + 3] >> 4) & 3;
  if (controlo === 0 || controlo === 2) return -1;
  if (controlo === 1) return i + 4;
  const p = i + 5 + b[i + 4];
  return p < i + PACOTE ? p : -1;
}

const lerPts = (b, p) => ((b[p] & 0x0e) * 536870912)          // bits 32..30 (<< 29)
  + (b[p + 1] << 22) + ((b[p + 2] & 0xfe) << 14) + (b[p + 3] << 7) + (b[p + 4] >> 1);

/** Os PES de vídeo e de áudio de um TS, pela ordem em que vêm, com o PTS e o DTS de cada um. */
function lerPes(b) {
  let pmt = null;
  let video = null;
  let audio = null;
  let outro = null;
  const abertos = new Map();
  const saida = { video: [], audio: [] };
  const fechar = (pid) => {
    const pes = abertos.get(pid);
    abertos.delete(pid);
    if (!pes || !pes.partes.length) return;
    let n = 0;
    for (const x of pes.partes) n += x.length;
    const dados = new Uint8Array(n);
    let o = 0;
    for (const x of pes.partes) { dados.set(x, o); o += x.length; }
    (pid === video ? saida.video : saida.audio).push({ pts: pes.pts, dts: pes.dts, dados });
  };
  for (let i = 0; i + PACOTE <= b.length; i += PACOTE) {
    if (b[i] !== 0x47) {
      // Fora de passo: procura o próximo 0x47 que tenha outro 188 bytes à frente.
      let j = i + 1;
      while (j + PACOTE < b.length && !(b[j] === 0x47 && b[j + PACOTE] === 0x47)) j++;
      if (j + PACOTE > b.length) break;
      i = j - PACOTE;
      continue;
    }
    const pid = ((b[i + 1] & 0x1f) << 8) | b[i + 2];
    const inicio = (b[i + 1] & 0x40) !== 0;
    let p = cargaUtil(b, i);
    if (p < 0) continue;
    if (pid === 0 || (pmt !== null && pid === pmt)) {
      if (!inicio) continue;
      p += 1 + b[p];
      const tam = ((b[p + 1] & 0x0f) << 8) | b[p + 2];
      const fim = Math.min(p + 3 + tam - 4, i + PACOTE);
      if (pid === 0) {
        for (let q = p + 8; q + 4 <= fim; q += 4) {
          const prog = (b[q] << 8) | b[q + 1];
          if (prog !== 0) { pmt = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; break; }
        }
      } else {
        let q = p + 12 + (((b[p + 10] & 0x0f) << 8) | b[p + 11]);
        while (q + 5 <= fim) {
          const tipo = b[q];
          const pidEs = ((b[q + 1] & 0x1f) << 8) | b[q + 2];
          if (tipo === 0x1b && video === null) video = pidEs;
          else if (tipo === 0x0f && audio === null) audio = pidEs;
          else if ((tipo === 0x24 || tipo === 0x11) && outro === null) outro = tipo;
          q += 5 + (((b[q + 3] & 0x0f) << 8) | b[q + 4]);
        }
      }
      continue;
    }
    if (pid !== video && pid !== audio) continue;
    if (inicio) {
      fechar(pid);
      if (!(b[p] === 0 && b[p + 1] === 0 && b[p + 2] === 1)) continue;
      const flags = b[p + 7] >> 6;
      const pts = flags & 2 ? lerPts(b, p + 9) : null;
      const dts = flags === 3 ? lerPts(b, p + 14) : pts;
      abertos.set(pid, { pts, dts, partes: [] });
      p += 9 + b[p + 8];
    }
    const pes = abertos.get(pid);
    if (pes && p < i + PACOTE) pes.partes.push(b.subarray(p, i + PACOTE));
  }
  fechar(video);
  fechar(audio);
  return { ...saida, temVideo: video !== null, temAudio: audio !== null, outro };
}

/** Os 33 bits do relógio do TS dão a volta a cada 26,5 h: desenrolar a partir do anterior. */
function desenrolar(lista, campo) {
  const VOLTA = 2 ** 33;
  let ant = null;
  for (const x of lista) {
    if (x[campo] == null) continue;
    if (ant != null) {
      while (x[campo] - ant > VOLTA / 2) x[campo] -= VOLTA;
      while (ant - x[campo] > VOLTA / 2) x[campo] += VOLTA;
    }
    ant = x[campo];
  }
}

// ── H.264 ────────────────────────────────────────────────────────────────

function semEmulacao(nal) {
  const s = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
    s.push(nal[i]);
  }
  return new Uint8Array(s);
}

class Bits {
  constructor(d) { this.d = d; this.p = 0; }
  bit() { const b = (this.d[this.p >> 3] >> (7 - (this.p & 7))) & 1; this.p++; return b; }
  n(k) { let v = 0; for (let i = 0; i < k; i++) v = v * 2 + this.bit(); return v; }
  ue() { let z = 0; while (this.bit() === 0 && z < 32) z++; return z ? (2 ** z - 1 + this.n(z)) : 0; }
  se() { const k = this.ue(); return k & 1 ? (k + 1) / 2 : -k / 2; }
}

/** Largura e altura de um SPS, já com o recorte (1080 e não 1088). */
export function lerSps(nal) {
  const r = new Bits(semEmulacao(nal));
  r.n(8);
  const perfil = r.n(8);
  r.n(16);
  r.ue();
  let croma = 1;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(perfil)) {
    croma = r.ue();
    if (croma === 3) r.bit();
    r.ue(); r.ue(); r.bit();
    if (r.bit()) {
      for (let i = 0; i < (croma === 3 ? 12 : 8); i++) {
        if (!r.bit()) continue;
        let ult = 8;
        let prox = 8;
        for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
          if (prox !== 0) prox = (ult + r.se() + 256) % 256;
          ult = prox === 0 ? ult : prox;
        }
      }
    }
  }
  r.ue();
  const poc = r.ue();
  if (poc === 0) r.ue();
  else if (poc === 1) { r.bit(); r.se(); r.se(); const n = r.ue(); for (let i = 0; i < n; i++) r.se(); }
  r.ue(); r.bit();
  const mbsL = r.ue() + 1;
  const mapasA = r.ue() + 1;
  const soQuadros = r.bit();
  if (!soQuadros) r.bit();
  r.bit();
  let [cl, cr, ct, cb] = [0, 0, 0, 0];
  if (r.bit()) { cl = r.ue(); cr = r.ue(); ct = r.ue(); cb = r.ue(); }
  const ux = croma === 1 || croma === 2 ? 2 : 1;
  const uy = (croma === 1 ? 2 : 1) * (2 - soQuadros);
  return {
    largura: mbsL * 16 - (cl + cr) * ux,
    altura: (2 - soQuadros) * mapasA * 16 - (ct + cb) * uy,
  };
}

/**
 * Os PES de vídeo passam a amostras: NALs com 4 bytes de tamanho, sem AUD, e as SPS/PPS à parte.
 *
 * Um PES não é uma imagem. Medido em 12/10 num pedaço de `polys0800`: a Kick parte imagens grandes por
 * vários PES, e o segundo começa a meio de um NAL. Tratar cada PES como uma imagem cortava ~100 bytes ao
 * fim de muitas e o ffmpeg dava "error while decoding MB". Junta-se tudo num fluxo só, e as imagens
 * separam-se pelo AUD (o NAL 9 que a Kick põe à frente de cada uma); o tempo é o do PES onde ela começa.
 */
function amostrasDeVideo(pes) {
  let n = 0;
  for (const p of pes) n += p.dados.length;
  const fluxo = new Uint8Array(n);
  const marcas = [];
  let o = 0;
  for (const p of pes) {
    marcas.push({ o, pts: p.pts, dts: p.dts });
    fluxo.set(p.dados, o);
    o += p.dados.length;
  }
  // As posições de cada NAL no fluxo, para saber em que PES começa.
  const nals = [];
  let i = 0;
  let inicio = -1;
  const fecharNal = (fim) => {
    while (fim > inicio && fluxo[fim - 1] === 0) fim--;
    if (fim > inicio) nals.push({ o: inicio, d: fluxo.subarray(inicio, fim) });
  };
  while (i + 2 < fluxo.length) {
    if (fluxo[i] === 0 && fluxo[i + 1] === 0 && fluxo[i + 2] === 1) {
      if (inicio >= 0) fecharNal(i);
      i += 3;
      inicio = i;
    } else i++;
  }
  if (inicio >= 0) fecharNal(fluxo.length);
  const temAud = nals.some((x) => (x.d[0] & 0x1f) === 9);
  let m = 0;
  const marcaDe = (pos) => {
    while (m + 1 < marcas.length && marcas[m + 1].o <= pos) m++;
    return marcas[m];
  };
  const amostras = [];
  let sps = null;
  let pps = null;
  let atual = null;
  let ultimaMarca = null;
  const fechar = () => {
    if (atual?.corpo.length && atual.pts != null) amostras.push(atual);
    atual = null;
  };
  for (const x of nals) {
    const tipo = x.d[0] & 0x1f;
    const mk = marcaDe(x.o);
    // Sem AUD: uma imagem nova começa no primeiro NAL de um PES com tempo.
    const nova = temAud ? tipo === 9 : (mk !== ultimaMarca && mk.pts != null);
    if (nova || !atual) {
      fechar();
      atual = { pts: mk.pts, dts: mk.dts ?? mk.pts, chave: false, corpo: [], params: [] };
    }
    ultimaMarca = mk;
    if (tipo === 9) continue;
    if (tipo === 7) { sps = sps || x.d; atual.params.push(x.d); continue; }
    if (tipo === 8) { pps = pps || x.d; atual.params.push(x.d); continue; }
    if (tipo === 5) atual.chave = true;
    atual.corpo.push(x.d);
  }
  fechar();
  return { amostras, sps, pps };
}

function emTamanhos(nals) {
  let n = 0;
  for (const x of nals) n += 4 + x.length;
  const d = new Uint8Array(n);
  let o = 0;
  for (const x of nals) {
    d[o] = x.length >>> 24; d[o + 1] = (x.length >> 16) & 255; d[o + 2] = (x.length >> 8) & 255; d[o + 3] = x.length & 255;
    d.set(x, o + 4);
    o += 4 + x.length;
  }
  return d;
}

// ── AAC ──────────────────────────────────────────────────────────────────

function amostrasDeAudio(pes) {
  const amostras = [];
  let config = null;
  for (const p of pes) {
    if (p.pts == null) continue;
    const d = p.dados;
    let i = 0;
    let k = 0;
    while (i + 7 <= d.length) {
      if (d[i] !== 0xff || (d[i + 1] & 0xf0) !== 0xf0) { i++; continue; }
      const semCrc = d[i + 1] & 1;
      const perfil = (d[i + 2] >> 6) + 1;
      const iTaxa = (d[i + 2] >> 2) & 15;
      const canais = ((d[i + 2] & 1) << 2) | (d[i + 3] >> 6);
      const tam = ((d[i + 3] & 3) << 11) | (d[i + 4] << 3) | (d[i + 5] >> 5);
      const cab = semCrc ? 7 : 9;
      if (tam < cab || i + tam > d.length) break;
      const taxa = TAXAS_AAC[iTaxa];
      if (!taxa) break;
      if (!config) config = { taxa, canais, asc: new Uint8Array([(perfil << 3) | (iTaxa >> 1), ((iTaxa & 1) << 7) | (canais << 3)]) };
      amostras.push({ pts: p.pts + Math.round((k * 1024 * RELOGIO) / taxa), dados: d.subarray(i + cab, i + tam) });
      k++;
      i += tam;
    }
  }
  return { amostras, config };
}

// ── ler e recortar ───────────────────────────────────────────────────────

/** Abrir os bytes de um ou mais pedaços TS seguidos. */
export function lerTs(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pes = lerPes(b);
  if (!pes.temVideo) throw erro('MP4-SEM-H264', pes.outro ? 'o vídeo não é H.264' : 'sem vídeo H.264');
  desenrolar(pes.video, 'pts');
  desenrolar(pes.video, 'dts');
  desenrolar(pes.audio, 'pts');
  const v = amostrasDeVideo(pes.video);
  if (!v.sps || !v.pps || !v.amostras.length) throw erro('MP4-SEM-H264', 'sem SPS/PPS');
  const a = amostrasDeAudio(pes.audio);
  return {
    video: { amostras: v.amostras, sps: v.sps, pps: v.pps, ...lerSps(v.sps) },
    audio: a.config && a.amostras.length ? { amostras: a.amostras, ...a.config } : null,
  };
}

/**
 * O pedaço [deMs, ateMs] de um TS cujo primeiro pedaço começa em `inicioMs` (o PROGRAM-DATE-TIME).
 * Devolve o clipe pronto a juntar num MP4, e onde ficou de facto (`deMs`/`ateMs` reais: menos do que o
 * pedido só quando o vídeo não chega lá).
 */
export function recortar(ts, { inicioMs, deMs, ateMs }) {
  const v = ts.video.amostras;
  const a = ts.audio?.amostras || [];
  // O PROGRAM-DATE-TIME é a hora da primeira amostra do pedaço.
  const primeiros = v.slice(0, 8).map((x) => x.pts);
  if (a.length) primeiros.push(a[0].pts);
  const p0 = Math.min(...primeiros);
  const paraPts = (ms) => p0 + Math.round((ms - inicioMs) * (RELOGIO / 1000));
  const ultimoV = Math.max(...v.slice(-8).map((x) => x.pts)) + (v.length > 1 ? Math.abs(v.at(-1).dts - v.at(-2).dts) : 0);
  const O = Math.max(paraPts(deMs), Math.min(...v.slice(0, 8).map((x) => x.pts)));
  const E = Math.min(paraPts(ateMs), ultimoV);
  if (!(E > O)) throw erro('MP4-JANELA', 'nada no pedaço pedido');

  // Do último quadro-chave com PTS <= O (pela ordem de descodificação) até ao último quadro com PTS < E.
  let i0 = 0;
  for (let i = 0; i < v.length; i++) if (v[i].chave && v[i].pts <= O) i0 = i;
  if (!v[i0].chave) {
    const k = v.findIndex((x) => x.chave);
    if (k < 0) throw erro('MP4-SEM-CHAVE', 'sem quadro-chave');
    i0 = k;
  }
  let i1 = i0;
  for (let i = i0; i < v.length; i++) if (v[i].pts < E) i1 = i;
  const video = v.slice(i0, i1 + 1);
  // Um quadro-chave que está depois de O (o vídeo começa mais tarde do que o pedido): o início real é ele.
  const inicioV = Math.min(...video.slice(0, 8).map((x) => x.pts));
  const Oreal = Math.max(O, inicioV);
  const audio = a.filter((x, i) => {
    const fim = a[i + 1]?.pts ?? x.pts + Math.round((1024 * RELOGIO) / ts.audio.taxa);
    return fim > Oreal && x.pts < E;
  });
  return {
    video,
    audio,
    O: Oreal,
    E,
    sps: ts.video.sps,
    pps: ts.video.pps,
    largura: ts.video.largura,
    altura: ts.video.altura,
    som: ts.audio ? { taxa: ts.audio.taxa, canais: ts.audio.canais, asc: ts.audio.asc } : null,
    deMs: inicioMs + (Oreal - p0) / (RELOGIO / 1000),
    ateMs: inicioMs + (E - p0) / (RELOGIO / 1000),
  };
}

// ── MP4 ──────────────────────────────────────────────────────────────────

const txt = (s) => [...s].map((c) => c.charCodeAt(0));
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
const u16 = (n) => [(n >> 8) & 255, n & 255];
function i32(n) { return u32(n < 0 ? n + 2 ** 32 : n); }

function caixa(tipo, ...partes) {
  let n = 8;
  const arr = partes.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  for (const p of arr) n += p.length;
  const out = new Uint8Array(n);
  out.set(u32(n), 0);
  out.set(txt(tipo), 4);
  let o = 8;
  for (const p of arr) { out.set(p, o); o += p.length; }
  return out;
}
const cheia = (tipo, versao, flags, ...partes) => caixa(tipo, [versao, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...partes);
const MATRIZ = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];

function descritor(tag, corpo) {
  const n = corpo.length;
  return [tag, 0x80 | ((n >> 21) & 127), 0x80 | ((n >> 14) & 127), 0x80 | ((n >> 7) & 127), n & 127, ...corpo];
}

function stsdVideo(c, avc3) {
  const avcC = caixa('avcC', [1, c.sps[1], c.sps[2], c.sps[3], 0xff, 0xe1, ...u16(c.sps.length), ...c.sps, 1, ...u16(c.pps.length), ...c.pps]);
  const entrada = caixa(avc3 ? 'avc3' : 'avc1', [0, 0, 0, 0, 0, 0, 0, 1, ...new Array(16).fill(0), ...u16(c.largura), ...u16(c.altura),
    ...u32(0x480000), ...u32(0x480000), ...u32(0), ...u16(1), ...new Array(32).fill(0), ...u16(0x18), ...u16(0xffff)], avcC);
  return cheia('stsd', 0, 0, u32(1), entrada);
}

function stsdAudio(s) {
  const dsi = descritor(5, [...s.asc]);
  const dcd = descritor(4, [0x40, 0x15, 0, 0, 0, ...u32(0), ...u32(0), ...dsi]);
  const esd = descritor(3, [...u16(1), 0, ...dcd, ...descritor(6, [2])]);
  const entrada = caixa('mp4a', [0, 0, 0, 0, 0, 0, ...u16(1), ...u32(0), ...u32(0), ...u16(s.canais), ...u16(16), 0, 0, 0, 0,
    ...u16(s.taxa > 65535 ? 0 : s.taxa), 0, 0], cheia('esds', 0, 0, esd));
  return cheia('stsd', 0, 0, u32(1), entrada);
}

/** Pares (contagem, valor) seguidos iguais. */
function corridas(valores) {
  const out = [];
  for (const v of valores) {
    if (out.length && out.at(-1)[1] === v) out.at(-1)[0]++;
    else out.push([1, v]);
  }
  return out;
}

function trak({ id, video, escala, amostras, edicoes, stsd, pedacos, deslocamento }) {
  const durMedia = amostras.reduce((t, s) => t + s.dur, 0);
  const durFilme = edicoes.reduce((t, e) => t + e.dur, 0);
  const elst = cheia('elst', 0, 0, u32(edicoes.length), ...edicoes.map((e) => [...u32(e.dur), ...i32(e.media), ...u32(0x10000)]));
  const stts = corridas(amostras.map((s) => s.dur));
  const temCtts = amostras.some((s) => s.cts);
  const ctts = temCtts ? corridas(amostras.map((s) => s.cts || 0)) : null;
  const chaves = video ? amostras.map((s, i) => (s.chave ? i + 1 : 0)).filter(Boolean) : null;
  const stsc = [];
  for (const [i, p] of pedacos.entries()) {
    if (!stsc.length || stsc.at(-1)[1] !== p.n) stsc.push([i + 1, p.n]);
  }
  const stbl = caixa('stbl',
    stsd,
    cheia('stts', 0, 0, u32(stts.length), ...stts.map(([n, d]) => [...u32(n), ...u32(d)])),
    ...(temCtts ? [cheia('ctts', 0, 0, u32(ctts.length), ...ctts.map(([n, d]) => [...u32(n), ...u32(d)]))] : []),
    ...(chaves && chaves.length < amostras.length ? [cheia('stss', 0, 0, u32(chaves.length), ...chaves.map(u32))] : []),
    cheia('stsc', 0, 0, u32(stsc.length), ...stsc.map(([c, n]) => [...u32(c), ...u32(n), ...u32(1)])),
    cheia('stsz', 0, 0, u32(0), u32(amostras.length), ...amostras.map((s) => u32(s.tam))),
    cheia('stco', 0, 0, u32(pedacos.length), ...pedacos.map((p) => u32(p.pos + deslocamento))));
  const minf = caixa('minf',
    video ? cheia('vmhd', 0, 1, new Array(8).fill(0)) : cheia('smhd', 0, 0, [0, 0, 0, 0]),
    caixa('dinf', cheia('dref', 0, 0, u32(1), cheia('url ', 0, 1))),
    stbl);
  const mdia = caixa('mdia',
    cheia('mdhd', 0, 0, u32(0), u32(0), u32(escala), u32(durMedia), u16(0x55c4), u16(0)),
    cheia('hdlr', 0, 0, u32(0), txt(video ? 'vide' : 'soun'), new Array(12).fill(0), txt(video ? 'VideoHandler' : 'SoundHandler'), [0]),
    minf);
  const tkhd = cheia('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(durFilme), new Array(8).fill(0),
    u16(0), u16(video ? 0 : 1), u16(video ? 0 : 0x100), u16(0), MATRIZ,
    u32(video ? video.largura * 65536 : 0), u32(video ? video.altura * 65536 : 0));
  return { caixa: caixa('trak', tkhd, caixa('edts', elst), mdia), durFilme };
}

/**
 * Um MP4 com um ou mais clipes seguidos (os de `recortar`). Cada clipe mostra exatamente [O, E].
 * @returns {{bytes: Uint8Array, duracaoS: number}}
 */
export function juntarMp4(clipes) {
  if (!clipes.length) throw erro('MP4-VAZIO', 'nada para juntar');
  const igual = (x, y) => x.length === y.length && x.every((b, i) => b === y[i]);
  const avc3 = clipes.some((c) => !igual(c.sps, clipes[0].sps) || !igual(c.pps, clipes[0].pps));
  const comSom = clipes.every((c) => c.som && c.audio.length) ? clipes[0].som : null;
  if (comSom && clipes.some((c) => c.som.taxa !== comSom.taxa || c.som.canais !== comSom.canais)) {
    throw erro('MP4-SOM-DIFERENTE', 'som com taxas diferentes');
  }
  const largura = Math.max(...clipes.map((c) => c.largura));
  const altura = Math.max(...clipes.map((c) => c.altura));

  // As amostras de cada faixa, com o tempo já seguido de clipe para clipe.
  const sv = [];
  const sa = [];
  const ev = [];
  const ea = [];
  let baseV = 0;
  let baseA = 0;
  const durAudio = comSom ? 1024 : 0;
  for (const c of clipes) {
    const d0 = c.video[0].dts;
    for (const [i, s] of c.video.entries()) {
      const prox = c.video[i + 1];
      const dur = prox ? prox.dts - s.dts : (c.video.length > 1 ? s.dts - c.video[i - 1].dts : 3000);
      const nals = avc3 && i === 0 && !s.params.length ? [c.sps, c.pps, ...s.corpo] : avc3 ? [...s.params, ...s.corpo] : s.corpo;
      sv.push({ dados: emTamanhos(nals), dur: Math.max(1, dur), cts: s.pts - s.dts, chave: s.chave, t: baseV + s.dts - d0 });
    }
    const durV = sv.slice(sv.length - c.video.length).reduce((t, s) => t + s.dur, 0);
    ev.push({ dur: Math.round(((c.E - c.O) / RELOGIO) * ESCALA_FILME), media: baseV + (c.O - d0) });
    baseV += durV;
    if (comSom) {
      // O tempo do áudio conta-se em amostras de som, e cada quadro AAC tem 1024. `t` (em tiques de
      // 90 kHz, no mesmo eixo do vídeo) só serve para intercalar os pedaços no mdat.
      const a0 = c.audio[0].pts;
      for (const [k, s] of c.audio.entries()) {
        sa.push({ dados: s.dados, dur: durAudio, t: ((baseA + k * 1024) * RELOGIO) / comSom.taxa });
      }
      ea.push({ dur: Math.round(((c.E - c.O) / RELOGIO) * ESCALA_FILME), media: baseA + Math.round(((c.O - a0) * comSom.taxa) / RELOGIO) });
      baseA += c.audio.length * 1024;
    }
  }
  for (const s of sv) s.tam = s.dados.length;
  for (const s of sa) s.tam = s.dados.length;

  // Pedaços de meio segundo, intercalados pelo tempo: um leitor que vai lendo do início não salta de um
  // lado para o outro do ficheiro.
  const emPedacos = (lista, faixa) => {
    const out = [];
    for (const s of lista) {
      const p = out.at(-1);
      if (p && s.t - p.t0 < RELOGIO / 2) { p.amostras.push(s); p.n++; } else out.push({ faixa, t0: s.t, amostras: [s], n: 1 });
    }
    return out;
  };
  const pv = emPedacos(sv, 'v');
  const pa = emPedacos(sa, 'a');
  const todos = [...pv, ...pa].sort((x, y) => x.t0 - y.t0 || (x.faixa === 'v' ? -1 : 1));
  let pos = 0;
  for (const p of todos) { p.pos = pos; for (const s of p.amostras) pos += s.tam; }
  const tamMdat = pos;

  const montarMoov = (desloc) => {
    const tv = trak({
      id: 1, video: { largura, altura }, escala: RELOGIO, amostras: sv, edicoes: ev,
      stsd: stsdVideo({ ...clipes[0], largura, altura }, avc3), pedacos: pv, deslocamento: desloc,
    });
    const ta = comSom ? trak({
      id: 2, video: null, escala: comSom.taxa, amostras: sa, edicoes: ea,
      stsd: stsdAudio(comSom), pedacos: pa, deslocamento: desloc,
    }) : null;
    const dur = Math.max(tv.durFilme, ta?.durFilme || 0);
    const mvhd = cheia('mvhd', 0, 0, u32(0), u32(0), u32(ESCALA_FILME), u32(dur), u32(0x10000), u16(0x100), new Array(10).fill(0),
      MATRIZ, new Array(24).fill(0), u32(comSom ? 3 : 2));
    return { moov: caixa('moov', mvhd, tv.caixa, ...(ta ? [ta.caixa] : [])), dur };
  };
  const ftyp = caixa('ftyp', txt('isom'), u32(0x200), txt('isom'), txt('iso2'), txt('avc1'), txt('mp41'));
  const ensaio = montarMoov(0);
  const grande = tamMdat + 8 > 0xffffffff;
  if (grande) throw erro('MP4-GRANDE', 'mais de 4 GB');
  const inicioDados = ftyp.length + ensaio.moov.length + 8;
  const { moov, dur } = montarMoov(inicioDados);
  const out = new Uint8Array(inicioDados + tamMdat);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  out.set([...u32(tamMdat + 8), ...txt('mdat')], ftyp.length + moov.length);
  let o = inicioDados;
  for (const p of todos) for (const s of p.amostras) { out.set(s.dados, o); o += s.tam; }
  return { bytes: out, duracaoS: dur / ESCALA_FILME };
}

/** O atalho de um clipe só: pedaços TS -> MP4 com [deMs, ateMs]. */
export function tsParaMp4(bytes, { inicioMs, deMs, ateMs }) {
  const clipe = recortar(lerTs(bytes), { inicioMs, deMs, ateMs });
  const { bytes: mp4, duracaoS } = juntarMp4([clipe]);
  return { bytes: mp4, duracaoS, deMs: clipe.deMs, ateMs: clipe.ateMs, clipe };
}
