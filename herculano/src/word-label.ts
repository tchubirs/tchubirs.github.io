import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/** The floating gloss that appears above the target word once it is found. */
export function createWordLabel(greek: string, gloss: string, source: string): Mesh {
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
  g.fillStyle = '#ffd98a';
  g.font = '600 140px Georgia, "Noto Serif", "DejaVu Serif", serif';
  g.fillText(greek, c.width / 2, 160);
  g.fillStyle = '#f4e8d2';
  g.font = '52px Georgia, "Noto Serif", "DejaVu Serif", serif';
  g.fillText(gloss, c.width / 2, 238);
  g.fillStyle = '#c6b393';
  g.font = 'italic 36px Georgia, "Noto Serif", "DejaVu Serif", serif';
  g.fillText(source, c.width / 2, 290);

  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  const label = new Mesh(
    new PlaneGeometry(0.3, 0.3 * (c.height / c.width)),
    new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }),
  );
  label.name = 'WordLabel';
  label.visible = false;
  label.renderOrder = 10;
  return label;
}
