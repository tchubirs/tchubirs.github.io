import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { sourceOf, type Reading } from './readings.js';

const SERIF = 'Georgia, "Noto Serif", "DejaVu Serif", serif';

interface Line {
  text: string;
  font: string;
  colour: string;
  y: number;
}

function card(widthM: number, lines: Line[], name: string): Mesh {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(18, 12, 7, 0.82)';
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, c.height - 16, 48);
  g.fill();
  g.strokeStyle = 'rgba(255, 210, 130, 0.55)';
  g.lineWidth = 4;
  g.stroke();
  g.textAlign = 'center';
  for (const l of lines) {
    g.font = l.font;
    g.fillStyle = l.colour;
    // Shrink a line that would run past the card's edges.
    const k = Math.min(1, (c.width - 96) / g.measureText(l.text).width);
    g.save();
    g.translate(c.width / 2, l.y);
    g.scale(k, k);
    g.fillText(l.text, 0, 0);
    g.restore();
  }
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(widthM, widthM * (c.height / c.width)),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.name = name;
  mesh.renderOrder = 10;
  return mesh;
}

/** The gloss that rises above the word once it is found. Starts hidden. */
export function createWordLabel(r: Reading): Mesh {
  const label = card(0.3, [
    { text: r.greek, font: `600 140px ${SERIF}`, colour: '#ffd98a', y: 160 },
    { text: `${r.latin.toLowerCase()} · “${r.gloss}”`, font: `52px ${SERIF}`, colour: '#f4e8d2', y: 238 },
    { text: sourceOf(r), font: `italic 36px ${SERIF}`, colour: '#c6b393', y: 290 },
  ], 'WordLabel');
  (label.material as MeshBasicMaterial).opacity = 0;
  label.visible = false;
  return label;
}

/** A museum card beside the scroll: the word to look for, as the scribe wrote it. */
export function createWantedCard(r: Reading): Mesh {
  return card(0.16, [
    { text: 'FIND THIS WORD', font: `600 54px ${SERIF}`, colour: '#c6b393', y: 92 },
    { text: r.word, font: `600 150px "Noto Serif", "DejaVu Serif", serif`, colour: '#ffd98a', y: 250 },
  ], 'WantedCard');
}

export function disposeCard(m: Mesh): void {
  m.removeFromParent();
  m.geometry.dispose();
  const mat = m.material as MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
}
