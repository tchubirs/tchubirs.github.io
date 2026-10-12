// Tirar o vídeo de dentro de um segmento da Kick, para o navegador o descodificar sozinho.
//
// O irmão do audio-ts.js. A Kick serve MPEG-TS, e o descodificador de vídeo do navegador (WebCodecs,
// `VideoDecoder`) não abre contentores: quer cada imagem comprimida à parte, com a hora dela e a dizer
// se é uma imagem-chave. Isto separa essas imagens (o H.264 em Annex B, como vem no TS) e lê o perfil
// do vídeo no SPS, que é o que o `VideoDecoder.configure` pede ("avc1.4D401F").
//
// Para quê: achar as mortes no vídeo (achar-mortes.js) pede 2 imagens por segundo de cada canal. Pedir
// isso ao <video> é uma busca por imagem (lento); descodificar os segmentos de 160p que a detecção dos
// tiros já baixa para ouvir o som é quase de graça. Medido em 12/10 contra o ffmpeg (PyAV) num segmento
// verdadeiro da Kick: o mesmo número de imagens e as mesmas imagens-chave.

const PACOTE = 188;
const SYNC = 0x47;

function cargaUtil(b, i) {
  const controlo = (b[i + 3] >> 4) & 0b11;
  if (controlo === 0b00 || controlo === 0b10) return -1;
  if (controlo === 0b01) return i + 4;
  const inicio = i + 5 + b[i + 4];
  return inicio < i + PACOTE ? inicio : -1;
}

/** O PID do vídeo H.264 (stream_type 0x1B), lido da PAT e da PMT. */
export function pidDoVideo(b) {
  let pmt = null;
  for (let i = 0; i + PACOTE <= b.length; i += PACOTE) {
    if (b[i] !== SYNC) continue;
    const pid = ((b[i + 1] & 0x1f) << 8) | b[i + 2];
    let p = cargaUtil(b, i);
    if (p < 0) continue;
    if (b[i + 1] & 0x40) p += 1 + b[p];
    if (pid === 0 && pmt === null) {
      const fim = p + 3 + (((b[p + 1] & 0x0f) << 8) | b[p + 2]) - 4;
      for (let q = p + 8; q + 4 <= fim; q += 4) {
        if (((b[q] << 8) | b[q + 1]) !== 0) { pmt = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; break; }
      }
      continue;
    }
    if (pmt !== null && pid === pmt) {
      const fim = p + 3 + (((b[p + 1] & 0x0f) << 8) | b[p + 2]) - 4;
      let q = p + 12 + (((b[p + 10] & 0x0f) << 8) | b[p + 11]);
      while (q + 5 <= fim) {
        const pidEs = ((b[q + 1] & 0x1f) << 8) | b[q + 2];
        if (b[q] === 0x1b) return pidEs;
        q += 5 + (((b[q + 3] & 0x0f) << 8) | b[q + 4]);
      }
    }
  }
  return null;
}

/** Um carimbo de 33 bits do cabeçalho PES (PTS ou DTS), em ticks de 90 kHz. */
function carimbo(b, p) {
  return ((b[p] >> 1) & 0x07) * 2 ** 30 + ((b[p + 1] << 7) | (b[p + 2] >> 1)) * 2 ** 15 + ((b[p + 3] << 7) | (b[p + 4] >> 1));
}

/** Os tipos das unidades NAL de uma imagem em Annex B (00 00 01 ou 00 00 00 01 antes de cada uma). */
export function tiposNal(dados) {
  const tipos = [];
  for (let i = 0; i + 3 < dados.length; i++) {
    if (dados[i] === 0 && dados[i + 1] === 0 && dados[i + 2] === 1) {
      tipos.push({ tipo: dados[i + 3] & 0x1f, em: i + 3 });
      i += 2;
    }
  }
  return tipos;
}

/** O codec para o WebCodecs a partir do SPS: "avc1." + perfil, restrições e nível em hexadecimal. */
export function codecDoSps(dados, em) {
  const h = (x) => x.toString(16).padStart(2, '0').toUpperCase();
  return `avc1.${h(dados[em + 1])}${h(dados[em + 2])}${h(dados[em + 3])}`;
}

/**
 * As imagens comprimidas de um ou mais segmentos TS, pela ordem em que chegam.
 * Devolve { codec, imagens: [{ pts, dts, chave, dados }] } (pts e dts em ticks de 90 kHz), ou null
 * quando não há vídeo H.264.
 */
export function imagensDoTs(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pid = pidDoVideo(b);
  if (pid == null) return null;
  const imagens = [];
  let codec = null;
  let atual = null;
  const fechar = () => {
    if (!atual) return;
    const total = atual.partes.reduce((s, x) => s + x.length, 0);
    const dados = new Uint8Array(total);
    let o = 0;
    for (const x of atual.partes) { dados.set(x, o); o += x.length; }
    let chave = false;
    for (const n of tiposNal(dados)) {
      if (n.tipo === 5) chave = true;
      if (n.tipo === 7 && !codec && n.em + 3 < dados.length) codec = codecDoSps(dados, n.em);
    }
    if (total) imagens.push({ pts: atual.pts, dts: atual.dts, chave, dados });
    atual = null;
  };
  for (let i = 0; i + PACOTE <= b.length; i += PACOTE) {
    if (b[i] !== SYNC) continue;
    if ((((b[i + 1] & 0x1f) << 8) | b[i + 2]) !== pid) continue;
    let p = cargaUtil(b, i);
    if (p < 0) continue;
    if (b[i + 1] & 0x40) {
      fechar();
      if (!(b[p] === 0 && b[p + 1] === 0 && b[p + 2] === 1)) continue;
      const flags = b[p + 7];
      let pts = null;
      let dts = null;
      if (flags & 0x80) pts = carimbo(b, p + 9);
      if ((flags & 0xc0) === 0xc0) dts = carimbo(b, p + 14);
      atual = { pts, dts: dts ?? pts, partes: [] };
      p += 9 + b[p + 8];
    }
    if (!atual || p >= i + PACOTE) continue;
    atual.partes.push(b.subarray(p, i + PACOTE));
  }
  fechar();
  return { codec, imagens };
}
