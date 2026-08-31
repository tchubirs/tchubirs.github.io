// Tirar o som de dentro de um segmento da Kick, sem ffmpeg e sem servidor.
//
// O browser sabe descodificar AAC (`decodeAudioData`), mas não sabe abrir um
// contentor MPEG-TS — que é o que a Kick serve. Faltava a ponte. São ~120
// linhas de norma bem definida: pacotes de 188 bytes, tabela de programas,
// e o PES do áudio já traz frames ADTS lá dentro, prontos a descodificar.
//
// Isto é o que torna o alinhamento automático possível dentro da página. Sem
// isto, alinhar pelo som obrigaria a um servidor com ffmpeg — e este produto
// não tem servidor nenhum, de propósito.

const PACOTE = 188;
const SYNC = 0x47;

/** Onde começa a carga útil de um pacote TS, ou -1 se não tiver nenhuma. */
function cargaUtil(b, i) {
  const controlo = (b[i + 3] >> 4) & 0b11;
  if (controlo === 0b00 || controlo === 0b10) return -1;   // só adaptação, ou nada
  if (controlo === 0b01) return i + 4;
  const tamanho = b[i + 4];
  const inicio = i + 5 + tamanho;
  return inicio < i + PACOTE ? inicio : -1;
}

/** O PID do áudio, lido da PAT e da PMT — nunca adivinhado. */
function pidDoAudio(b) {
  let pmt = null;
  for (let i = 0; i + PACOTE <= b.length; i += PACOTE) {
    if (b[i] !== SYNC) continue;
    const pid = ((b[i + 1] & 0x1f) << 8) | b[i + 2];
    const inicioSecao = b[i + 1] & 0x40;
    let p = cargaUtil(b, i);
    if (p < 0) continue;
    if (inicioSecao) p += 1 + b[p];                        // pointer_field

    if (pid === 0 && pmt === null) {
      // PAT: salta o cabeçalho de secção e lê o primeiro programa com PID != 0.
      const tamSecao = ((b[p + 1] & 0x0f) << 8) | b[p + 2];
      const fim = p + 3 + tamSecao - 4;                     // menos o CRC
      for (let q = p + 8; q + 4 <= fim; q += 4) {
        const prog = (b[q] << 8) | b[q + 1];
        const alvo = ((b[q + 2] & 0x1f) << 8) | b[q + 3];
        if (prog !== 0) { pmt = alvo; break; }
      }
      continue;
    }

    if (pmt !== null && pid === pmt) {
      const tamSecao = ((b[p + 1] & 0x0f) << 8) | b[p + 2];
      const fim = p + 3 + tamSecao - 4;
      const tamInfo = ((b[p + 10] & 0x0f) << 8) | b[p + 11];
      let q = p + 12 + tamInfo;
      while (q + 5 <= fim) {
        const tipo = b[q];
        const pidEs = ((b[q + 1] & 0x1f) << 8) | b[q + 2];
        const tamEs = ((b[q + 3] & 0x0f) << 8) | b[q + 4];
        // 0x0F = AAC em ADTS, 0x11 = AAC em LATM. A Kick/IVS serve 0x0F, e é
        // o único que sai daqui pronto a entregar ao browser sem reembalar.
        if (tipo === 0x0f) return pidEs;
        q += 5 + tamEs;
      }
    }
  }
  return null;
}

/**
 * MPEG-TS -> stream ADTS puro, que o `decodeAudioData` já aceita.
 *
 * Devolve null quando não há faixa AAC — um segmento só de vídeo, ou um
 * contentor que a Kick mude sem avisar. Null é uma resposta; um array vazio
 * que finge ser silêncio não é.
 */
export function aacDeSegmentos(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pid = pidDoAudio(b);
  if (pid == null) return null;

  const pedacos = [];
  let total = 0;
  for (let i = 0; i + PACOTE <= b.length; i += PACOTE) {
    if (b[i] !== SYNC) continue;
    if ((((b[i + 1] & 0x1f) << 8) | b[i + 2]) !== pid) continue;
    let p = cargaUtil(b, i);
    if (p < 0) continue;

    if (b[i + 1] & 0x40) {
      // Início de um PES: 00 00 01 <stream_id>, e o cabeçalho tem tamanho
      // variável que vem escrito no byte 8.
      if (!(b[p] === 0 && b[p + 1] === 0 && b[p + 2] === 1)) continue;
      p += 9 + b[p + 8];
    }
    if (p >= i + PACOTE) continue;
    const fatia = b.subarray(p, i + PACOTE);
    pedacos.push(fatia);
    total += fatia.length;
  }
  if (!total) return null;

  const saida = new Uint8Array(total);
  let o = 0;
  for (const f of pedacos) { saida.set(f, o); o += f.length; }
  return saida;
}
