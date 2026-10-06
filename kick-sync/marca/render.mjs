// As imagens da marca (perfil, cabeçalhos, pré-visualização de link), desenhadas em HTML e fotografadas.
//   node marca/render.mjs  ->  marca/*.png
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const LETRA = path.join(AQUI, '..', 'site', 'letra');
const simbolo = fs.readFileSync(path.join(AQUI, 'simbolo.svg'), 'utf8');
// A letra vai embutida: uma página sem origem não pode ir buscar ficheiros, e caía para a letra do sistema.
const dados = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(LETRA, f)).toString('base64')}`;
const fonte = (peso, f) => `@font-face{font-family:Plex;font-weight:${peso};src:url(${dados(f)}) format('woff2')}`;
const CSS = `${fonte(400, 'ibm-plex-sans-400.woff2')}${fonte(500, 'ibm-plex-sans-500.woff2')}${fonte(600, 'ibm-plex-sans-600.woff2')}
@font-face{font-family:PlexMono;font-weight:500;src:url(${dados('ibm-plex-mono-500.woff2')}) format('woff2')}
*{margin:0;box-sizing:border-box}body{background:#131211;color:#F3F0EA;font-family:Plex,sans-serif;overflow:hidden}
.marca{display:flex;align-items:center;gap:.32em}.marca svg{height:1.05em;width:1.05em}.marca b{font-weight:600;letter-spacing:-.02em}`;

// Uma linha do tempo de evento, com faixas de times e o instante marcado: o produto, em desenho.
function faixas({ largura, altura, x0, linhas = 14, semente = 7 }) {
  let s = semente;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const alturaL = altura / linhas;
  let svg = '';
  for (let i = 0; i < linhas; i++) {
    const y = i * alturaL + alturaL * 0.28;
    const h = alturaL * 0.44;
    let x = r() * largura * 0.15;
    while (x < largura) {
      const w = largura * (0.12 + r() * 0.35);
      svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="#2FB3C4" fill-opacity="${(0.16 + r() * 0.30).toFixed(2)}"/>`;
      x += w + largura * (0.02 + r() * 0.08);
    }
    if (r() > 0.55) {
      const xm = r() * largura;
      svg += `<circle cx="${xm.toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" r="${(h * 0.32).toFixed(1)}" fill="#E4A13A" fill-opacity=".55"/>`;
    }
  }
  svg += `<rect x="${x0 - 1.5}" y="0" width="3" height="${altura}" fill="#E4A13A"/>`;
  return `<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">${svg}</svg>`;
}

const PECAS = {
  'perfil-512': { w: 512, h: 512, html: `<div style="display:grid;place-items:center;height:100%">${simbolo.replace('<svg', '<svg width="512" height="512"')}</div>` },
  'cabecalho-1500x500': {
    w: 1500, h: 500,
    html: `<div style="position:absolute;inset:0;opacity:.9">${faixas({ largura: 1500, altura: 500, x0: 1080 })}</div>
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,#131211 0%,#131211ee 38%,#13121166 70%,#13121122)"></div>
      <div style="position:absolute;left:96px;top:150px">
        <div class="marca" style="font-size:96px">${simbolo}<b>Povix</b></div>
        <p style="font-size:34px;color:#B4AEA4;margin-top:22px;font-weight:500">Todos os ângulos. Um só momento.</p>
      </div>`,
  },
  'cabecalho-1920x480': {
    w: 1920, h: 480,
    html: `<div style="position:absolute;inset:0;opacity:.9">${faixas({ largura: 1920, altura: 480, x0: 1420, semente: 11 })}</div>
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,#131211 0%,#131211ee 34%,#13121155 70%,#13121111)"></div>
      <div style="position:absolute;left:150px;top:140px">
        <div class="marca" style="font-size:100px">${simbolo}<b>Povix</b></div>
        <p style="font-size:34px;color:#B4AEA4;margin-top:20px;font-weight:500">Every angle. One moment.</p>
      </div>`,
  },
  'partilha-1200x630': {
    w: 1200, h: 630,
    html: `<div style="position:absolute;left:0;right:0;bottom:0;height:300px;opacity:.95">${faixas({ largura: 1200, altura: 300, x0: 760, linhas: 9, semente: 3 })}</div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,#131211 0%,#131211 46%,#13121188 100%)"></div>
      <div style="position:absolute;left:80px;top:90px">
        <div class="marca" style="font-size:88px">${simbolo}<b>Povix</b></div>
        <p style="font-size:38px;color:#F3F0EA;margin-top:26px;font-weight:500;max-width:960px;line-height:1.25">Cada lance do evento, de todos os ângulos.</p>
        <p style="font-family:PlexMono;font-size:24px;color:#E4A13A;margin-top:18px">povix.app</p>
      </div>`,
  },
};

const nav = await chromium.launch({ executablePath: process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [nome, { w, h, html }] of Object.entries(PECAS)) {
  const p = await nav.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><body style="width:${w}px;height:${h}px;position:relative">${html}</body>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(AQUI, `${nome}.png`) });
  await p.close();
  console.log(nome);
}
await nav.close();
