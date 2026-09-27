import { CanvasTexture } from '@iwsdk/core';

/**
 * Epicurus, Principal Doctrines I-V (Usener, Epicurea, 1887 - public domain),
 * written the way a Herculaneum scribe would: capitals, no spaces, no accents.
 */
const DOCTRINES = [
  'Τὸ μακάριον καὶ ἄφθαρτον οὔτε αὐτὸ πράγματα ἔχει οὔτε ἄλλῳ παρέχει ὥστε οὔτε ὀργαῖς οὔτε χάρισι συνέχεται ἐν ἀσθενεῖ γὰρ πᾶν τὸ τοιοῦτον',
  'Ὁ θάνατος οὐδὲν πρὸς ἡμᾶς τὸ γὰρ διαλυθὲν ἀναισθητεῖ τὸ δ ἀναισθητοῦν οὐδὲν πρὸς ἡμᾶς',
  'Ὅρος τοῦ μεγέθους τῶν ἡδονῶν ἡ παντὸς τοῦ ἀλγοῦντος ὑπεξαίρεσις ὅπου δ ἂν τὸ ἡδόμενον ἐνῇ καθ ὃν ἂν χρόνον ᾖ οὐκ ἔστι τὸ ἀλγοῦν ἢ λυπούμενον ἢ τὸ συναμφότερον',
  'Οὐ χρονίζει τὸ ἀλγοῦν συνεχῶς ἐν τῇ σαρκί ἀλλὰ τὸ μὲν ἄκρον τὸν ἐλάχιστον χρόνον πάρεστι τὸ δὲ μόνον ὑπερτεῖνον τὸ ἡδόμενον κατὰ σάρκα οὐ πολλὰς ἡμέρας συμμένει',
  'Οὐκ ἔστιν ἡδέως ζῆν ἄνευ τοῦ φρονίμως καὶ καλῶς καὶ δικαίως οὐδὲ φρονίμως καὶ καλῶς καὶ δικαίως ἄνευ τοῦ ἡδέως',
];

/** The word the player is looking for, and where to find it in the text. */
export const TARGET_WORD = 'ΗΔΟΝΩΝ';

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
export function createInk(width = 4096, height = 768): InkLayout {
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

  const text = DOCTRINES.map(toMajuscule).join('');
  const lettersPerLine = 18;
  const lineStep = fontPx * 1.25;
  const marginY = height * 0.09;
  const linesPerColumn = Math.floor((height - 2 * marginY) / lineStep);
  const columnWidth = ctx.measureText('Ω'.repeat(lettersPerLine)).width;
  const columnGap = columnWidth * 0.35;
  const startX = width * 0.03;
  const targetAt = text.indexOf(TARGET_WORD);
  let target: [number, number, number, number] = [0, 0, 0, 0];

  let i = 0;
  for (let col = 0; ; col++) {
    const x = startX + col * (columnWidth + columnGap);
    if (x + columnWidth > width || i >= text.length) break;
    for (let line = 0; line < linesPerColumn && i < text.length; line++) {
      let take = lettersPerLine;
      // Never split the target word across two lines: end this line before it.
      if (targetAt > i && targetAt < i + take && targetAt + TARGET_WORD.length > i + take) {
        take = targetAt - i;
      }
      const chunk = text.slice(i, i + take);
      const y = marginY + line * lineStep;
      ctx.fillText(chunk, x, y);
      if (targetAt >= i && targetAt < i + take) {
        const before = ctx.measureText(chunk.slice(0, targetAt - i)).width;
        const word = ctx.measureText(TARGET_WORD).width;
        // CanvasTexture flips Y, so v runs from the bottom of the canvas up.
        target = [
          (x + before) / width,
          1 - (y + fontPx) / height,
          (x + before + word) / width,
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
