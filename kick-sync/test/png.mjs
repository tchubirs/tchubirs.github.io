// Ler um PNG no Node, para os testes com quadros verdadeiros (test/telas-morte/). Só o que os
// recortes usam: 8 bits por cor, RGB ou RGBA, sem entrelaçado. Devolve RGBA, como o getImageData.

import fs from 'node:fs';
import zlib from 'node:zlib';

export function lerPng(caminho) {
  const b = fs.readFileSync(caminho);
  let p = 8;
  let largura = 0;
  let altura = 0;
  let tipo = 0;
  const idat = [];
  while (p < b.length) {
    const n = b.readUInt32BE(p);
    const nome = b.toString('ascii', p + 4, p + 8);
    const d = b.subarray(p + 8, p + 8 + n);
    if (nome === 'IHDR') {
      largura = d.readUInt32BE(0);
      altura = d.readUInt32BE(4);
      if (d[8] !== 8 || d[12] !== 0) throw new Error('PNG que estes testes não leem');
      tipo = d[9];
    } else if (nome === 'IDAT') idat.push(d);
    p += 12 + n;
  }
  const canais = tipo === 6 ? 4 : tipo === 2 ? 3 : 0;
  if (!canais) throw new Error(`PNG de tipo ${tipo}`);
  const cru = zlib.inflateSync(Buffer.concat(idat));
  const linha = largura * canais;
  const px = new Uint8Array(linha * altura);
  for (let y = 0; y < altura; y++) {
    const f = cru[y * (linha + 1)];
    const src = cru.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1));
    const o = y * linha;
    for (let x = 0; x < linha; x++) {
      const a = x >= canais ? px[o + x - canais] : 0;
      const c = y ? px[o - linha + x] : 0;
      const ac = x >= canais && y ? px[o - linha + x - canais] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += c;
      else if (f === 3) v += (a + c) >> 1;
      else if (f === 4) {
        const pp = a + c - ac;
        const pa = Math.abs(pp - a); const pb = Math.abs(pp - c); const pc = Math.abs(pp - ac);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? c : ac;
      }
      px[o + x] = v & 255;
    }
  }
  const rgba = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0, j = 0; i < px.length; i += canais, j += 4) {
    rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = canais === 4 ? px[i + 3] : 255;
  }
  return { largura, altura, pixeis: rgba };
}

/** Um quadro inteiro (largura x altura) cinzento como a faixa da tela de morte, com o recorte posto no sítio dele. */
export function quadroComRecorte(recorte, { largura, altura, x, y }, fundo = [32, 32, 32]) {
  const px = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = fundo[0]; px[i + 1] = fundo[1]; px[i + 2] = fundo[2]; px[i + 3] = 255; }
  for (let ry = 0; ry < recorte.altura; ry++) {
    for (let rx = 0; rx < recorte.largura; rx++) {
      const s = (ry * recorte.largura + rx) * 4;
      const d = ((y + ry) * largura + x + rx) * 4;
      px[d] = recorte.pixeis[s]; px[d + 1] = recorte.pixeis[s + 1]; px[d + 2] = recorte.pixeis[s + 2];
    }
  }
  return px;
}
