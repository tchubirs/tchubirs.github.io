import { CanvasTexture } from '@iwsdk/core';
import { DOCTRINES, type Reading } from './readings.js';

export function toMajuscule(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents, breathings, iota subscript
    .toUpperCase()
    .replace(/[^Α-Ω]/g, ''); // scriptio continua: letters only
}

export interface InkLayout {
  texture: CanvasTexture;
  /** Target word bounding box in texture UV space (x0, y0, x1, y1), v up. */
  target: [number, number, number, number];
}

/**
 * Columns of majuscule text across a long canvas. Canvas x follows the sheet's
 * length, canvas y its height. Lines are short and stacked, as in a column of
 * a real roll.
 */
export function createInk(reading: Reading, width = 4096, height = 768): InkLayout {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  const fontPx = Math.round(height / 17);
  ctx.font = `600 ${fontPx}px "Noto Serif", "DejaVu Serif", serif`;
  ctx.textBaseline = 'top';

  // Rotate the doctrines so the one holding the word comes after `lead` others.
  const n = DOCTRINES.length;
  const order = Array.from({ length: n }, (_, k) => (reading.doctrine + n - reading.lead + k) % n);
  const parts = order.map((d) => toMajuscule(DOCTRINES[d]));
  const text = parts.join('');
  const word = reading.word;
  const inDoctrine = parts[reading.lead].indexOf(word);
  if (inDoctrine < 0) throw new Error(`${word} is not in doctrine ${reading.doctrine + 1}`);
  const lettersPerLine = 18;
  const lineStep = fontPx * 1.25;
  const marginY = height * 0.09;
  const linesPerColumn = Math.floor((height - 2 * marginY) / lineStep);
  const columnWidth = ctx.measureText('Ω'.repeat(lettersPerLine)).width;
  const columnGap = columnWidth * 0.35;
  const startX = width * 0.03;
  const targetAt = parts.slice(0, reading.lead).join('').length + inDoctrine;
  let target: [number, number, number, number] = [0, 0, 0, 0];

  let i = 0;
  for (let col = 0; ; col++) {
    const x = startX + col * (columnWidth + columnGap);
    if (x + columnWidth > width || i >= text.length) break;
    for (let line = 0; line < linesPerColumn && i < text.length; line++) {
      let take = lettersPerLine;
      // Never split the target word across two lines: end this line before it.
      if (targetAt > i && targetAt < i + take && targetAt + word.length > i + take) {
        take = targetAt - i;
      }
      const chunk = text.slice(i, i + take);
      const y = marginY + line * lineStep;
      ctx.fillText(chunk, x, y);
      if (targetAt >= i && targetAt < i + take) {
        const before = ctx.measureText(chunk.slice(0, targetAt - i)).width;
        const wordW = ctx.measureText(word).width;
        // CanvasTexture flips Y, so v runs from the bottom of the canvas up.
        target = [
          (x + before) / width,
          1 - (y + fontPx) / height,
          (x + before + wordW) / width,
          1 - y / height,
        ];
      }
      i += take;
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 4;
  return { texture, target };
}
