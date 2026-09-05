// Valida site/sinal.js contra os MESMOS ficheiros que a análise em Python
// usou. Se o código que vai para o browser não reproduzir o número que eu
// medi, o número não vale nada.
//
//   node probes/alinhar-offline.mjs <pasta-com-aud_*>

import fs from 'node:fs';
import path from 'node:path';
import { envolvente, desvio, consolidar, resolver } from '../site/sinal.js';

const BASE = process.argv[2];

/** WAV PCM 16-bit mono -> Float32 normalizado. */
function lerWav(f) {
  const b = fs.readFileSync(f);
  let o = 12;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4);
    const tam = b.readUInt32LE(o + 4);
    if (id === 'data') {
      const n = Math.floor(tam / 2);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
      return x;
    }
    o += 8 + tam + (tam % 2);
  }
  throw new Error(`sem data em ${f}`);
}

const pastas = fs.readdirSync(BASE).filter((d) => d.startsWith('aud_')).sort();
const env = new Map();
const canais = [];
for (const p of pastas) {
  const lista = JSON.parse(fs.readFileSync(path.join(BASE, p, 'lista.json')));
  for (const r of lista) {
    env.set(`${p}|${r.slug}`, envolvente(lerWav(r.wav)));
    if (!canais.includes(r.slug)) canais.push(r.slug);
  }
}
console.log(`${canais.length} canais × ${pastas.length} janelas\n`);

const pares = [];
console.log(`  ${'par'.padEnd(30)}${pastas.map((p) => p.slice(15, 21).padStart(13)).join('')}   consolidado`);
for (let i = 0; i < canais.length; i++) {
  for (let k = i + 1; k < canais.length; k++) {
    const a = canais[i];
    const b = canais[k];
    const meds = [];
    let cel = '';
    for (const p of pastas) {
      const ea = env.get(`${p}|${a}`);
      const eb = env.get(`${p}|${b}`);
      if (!ea?.length || !eb?.length) { cel += '—'.padStart(13); continue; }
      const m = desvio(ea, eb);
      meds.push(m);
      cel += (m.forca >= 5 ? `${m.desvioS >= 0 ? '+' : ''}${m.desvioS.toFixed(2)}s/${m.forca.toFixed(1)}` : `·/${m.forca.toFixed(1)}`).padStart(13);
    }
    const c = consolidar(meds);
    if (c.desvioS != null) pares.push({ a, b, desvioS: c.desvioS });
    console.log(`  ${`${a} ↔ ${b}`.padEnd(30)}${cel}   `
      + (c.desvioS != null
        ? `${c.desvioS >= 0 ? '+' : ''}${c.desvioS.toFixed(2)}s  (${c.janelas} janelas${c.descartadas ? `, ${c.descartadas} fora` : ''})`
        : `— (${c.janelas} janela${c.janelas === 1 ? '' : 's'})`));
  }
}

const { ajustes, semLigacao } = resolver(pares, canais);
console.log('\n  AJUSTE A PÔR EM CADA CANAL:\n');
for (const c of canais) {
  console.log(`   ${c.padEnd(16)}` + (c in ajustes
    ? `${ajustes[c] >= 0 ? '+' : ''}${ajustes[c].toFixed(2)}s`
      + `   (chegou à Kick ${Math.abs(ajustes[c]) < 0.3 ? 'como a maioria'
        : ajustes[c] > 0 ? `${ajustes[c].toFixed(1)}s mais tarde` : `${(-ajustes[c]).toFixed(1)}s mais cedo`})`
    : 'sem som em comum — à mão'));
}
if (semLigacao.length) console.log(`\n  sem ligação: ${semLigacao.join(', ')}`);
