// A força que o site dá ao som em comum de dois canais, em janelas de 20 s, com as funções do próprio
// site (sinal.js). Os ficheiros saem de probes/pcm-8khz.py (8 kHz mono, no relógio absoluto):
//   python3 probes/pcm-8khz.py wowi 2026-09-28T23:00:00Z 15 junto_wowi.f32   (idem para kodd, e longe_*)
//   node probes/calibrar-cena.mjs
import fs from 'node:fs';
import { envolvente, desvio, TAXA } from '../site/sinal.js';
const ler = (f) => new Float32Array(fs.readFileSync(f).buffer.slice(0));
for (const caso of ['junto', 'longe']) {
  const a = ler(`${caso}_wowi.f32`), b = ler(`${caso}_kodd.f32`);
  const JAN = 20 * TAXA, MARG = 8 * TAXA, PASSO = 10 * TAXA;
  const forcas = [], desvios = [];
  for (let i = MARG; i + JAN + MARG <= a.length; i += PASSO) {
    const ea = envolvente(a.subarray(i, i + JAN));
    const eb = envolvente(b.subarray(i, i + JAN));
    const r = desvio(ea, eb, { limiteS: 8 });
    if (r.desvioS == null) continue;
    forcas.push(r.forca); desvios.push(r.desvioS);
  }
  const ord = [...forcas].sort((x, y) => x - y);
  const q = (p) => ord[Math.floor(p * (ord.length - 1))].toFixed(1);
  const fortes = forcas.map((f, k) => [f, desvios[k]]).filter(([f]) => f >= 6);
  console.log(`${caso}: ${forcas.length} janelas, forca p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)}`);
  for (const lim of [5, 6, 7, 8]) {
    const f = forcas.map((x, k) => [x, desvios[k]]).filter(([x]) => x >= lim);
    const ds = f.map(([, d]) => d).sort((x, y) => x - y);
    console.log(`   forca >= ${lim}: ${f.length} janelas, desvio mediano ${ds.length ? ds[Math.floor(ds.length / 2)].toFixed(2) : '-'} s`);
  }
}
