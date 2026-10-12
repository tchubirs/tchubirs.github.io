// Mede o detector de acertos (site/acertos.js) em som de live de verdade, em bocados de 300 s como o app.
//   node probes/modelo-acertos/4-medir.mjs <live.f32> [--pos inj-pos.json] [--de S] [--ate S]
// Sem --pos: so conta o que acha (o som sem clipes somados: tudo o que sai e falso positivo, ou acerto de verdade do canal).
// Com --pos ([[segundos, id], ...], de 3-injetar.py): diz quantos clipes somados foram achados (a menos de 80 ms), por modelo,
// e quantos acertos aceitos nao estavam em nenhum lugar somado.
import { readFileSync } from 'node:fs';
import { medirAcertos, confirmarAcertos, NOTA_MINIMA, REPETE_MIN } from '../../site/acertos.js';

const args = process.argv.slice(2);
const pega = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return null; return args.splice(i, 2)[1]; };
const posArq = pega('pos');
const de = Number(pega('de') ?? 0);
const ateArg = pega('ate');
const b = readFileSync(args[0]);
const x = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)));
const TAXA = 24000;
const ate = ateArg ? Number(ateArg) : x.length / TAXA;
const cand = [];
const t0 = Date.now();
for (let s = de; s < ate; s += 300) {
  const fim = Math.min(ate, s + 300);
  for (const c of medirAcertos(x.subarray(Math.round(s * TAXA), Math.round(fim * TAXA)), TAXA)) cand.push({ ...c, ms: Math.round((s + c.s) * 1000) });
}
const r = confirmarAcertos(cand, { notaMinima: Number(pega('nota') ?? NOTA_MINIMA), repeteMin: Number(pega('repete') ?? REPETE_MIN) });
console.log(`${((ate - de) / 60).toFixed(0)} min em ${((Date.now() - t0) / 1000).toFixed(1)} s; candidatos ${cand.length}; acertos aceitos ${r.acertos.length}`);
console.log('modelos:', JSON.stringify(r.modelos));
if (posArq) {
  const pos = JSON.parse(readFileSync(posArq, 'utf8')).map(([t, id]) => [de + t, id]).filter(([t]) => t < ate - 1);
  const porModelo = {};
  let achados = 0;
  for (const [t, id] of pos) {
    const ok = r.acertos.some((a) => Math.abs(a.ms / 1000 - t) < 0.08);
    porModelo[id] ??= [0, 0];
    porModelo[id][1]++;
    if (ok) { porModelo[id][0]++; achados++; }
  }
  const falsos = r.acertos.filter((a) => !pos.some(([t]) => Math.abs(a.ms / 1000 - t) < 0.08));
  console.log(`recall ${achados}/${pos.length} = ${(100 * achados / pos.length).toFixed(0)}%;`, Object.entries(porModelo).map(([k, [a, n]]) => `${k} ${a}/${n}`).join(', '));
  console.log(`falsos ${falsos.length}`, falsos.slice(0, 8).map((a) => `${(a.ms / 1000).toFixed(1)}s ${a.id} ${a.nota.toFixed(2)}`).join(' | '));
}
const dump = pega('json');
if (dump && posArq) {
  // para calibrar: cada candidato com nota >= 0,55 e se estava num lugar com clipe somado
  const pos = JSON.parse(readFileSync(posArq, 'utf8')).map(([t, id]) => [de + t, id]);
  const linhas = cand.filter((c) => c.nota >= 0.55).map((c) => ({ nota: Math.round(c.nota * 1000) / 1000, id: c.id, tipo: c.tipo, certo: pos.some(([t]) => Math.abs(c.ms / 1000 - t) < 0.08) }));
  (await import('node:fs')).writeFileSync(dump, JSON.stringify(linhas));
}
