// Um pedaço verdadeiro da Kick (probes/fixtures/segmento-kodd.ts) com o relógio do TS empurrado para a
// frente a cada número, para o vídeo seguir de pedaço em pedaço como na Kick. Partilhado pelos testes que
// exportam de verdade (a montagem, o guardar antes que suma, o pacote do lance).

import fs from 'node:fs';

const SEG = fs.readFileSync(new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url));

/** O mesmo pedaço com PTS e DTS mais `n` vezes 12,6 s (o pedaço dura 12,5 s). */
export function pedacoNumero(n) {
  const b = Buffer.from(SEG);
  const mais = n * 12_600 * 90;
  const escrever = (o, v, prefixo) => {
    b[o] = (prefixo << 4) | ((Math.floor(v / 2 ** 30) & 7) << 1) | 1;
    b[o + 1] = (v >> 22) & 255;
    b[o + 2] = (((v >> 15) & 127) << 1) | 1;
    b[o + 3] = (v >> 7) & 255;
    b[o + 4] = ((v & 127) << 1) | 1;
  };
  const ler = (o) => ((b[o] & 0x0e) * 2 ** 29) + (b[o + 1] << 22) + ((b[o + 2] & 0xfe) << 14) + (b[o + 3] << 7) + (b[o + 4] >> 1);
  for (let i = 0; i + 188 <= b.length; i += 188) {
    if (!(b[i + 1] & 0x40)) continue;
    const afc = (b[i + 3] >> 4) & 3;
    const p = afc === 3 ? i + 5 + b[i + 4] : i + 4;
    if (afc === 2 || !(b[p] === 0 && b[p + 1] === 0 && b[p + 2] === 1)) continue;
    const flags = b[p + 7] >> 6;
    if (flags & 2) escrever(p + 9, (ler(p + 9) + mais) % 2 ** 33, flags === 3 ? 3 : 2);
    if (flags === 3) escrever(p + 14, (ler(p + 14) + mais) % 2 ** 33, 1);
  }
  return b;
}

