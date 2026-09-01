// Conferir a deteccao a olho, sem trabalho do dono.
//
// Baixa o som de um bocado da noite, acha os tiroteios e tira uma imagem a
// meio de cada um. Depois abre-se `/tmp/ver2/tudo.png` e ve-se: um ecra de
// combate, um ecra de MORTO ou um inventario? E assim que se mede a precisao
// sem lhe pedir a ele que veja quinze clipes.
//
// Corrido em 2026-08-30 22:00, vinte minutos: cinco dos seis candidatos eram
// combate a serio — um deles o ecra de MORTO — e o sexto era o inventario.
//
//   node probes/conferir-deteccao.mjs tchubi 2026-08-30T22:00:00Z 1200
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { vodsDoCanal, lerMaster, lerPlaylist, segmentosNaJanela } from '../site/kick.js';
import { energia, chao, impulsos, lutas, TAXA_TIROS } from '../site/tiros.js';

const CAB = { 'user-agent': 'Mozilla/5.0 Chrome/128.0', accept: '*/*' };
const txt = async (u) => (await fetch(u, { headers: CAB })).text();
const [CANAL = 'tchubi', QUANDO = '2026-08-30T22:00:00Z', SEGS = '1200'] = process.argv.slice(2);
const T0 = Date.parse(QUANDO);
const DUR = Number(SEGS);
const D = '/tmp/ver2'; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });

const c = await vodsDoCanal(CANAL, { buscar: (u) => fetch(u, { headers: CAB }) });
let barato = null; let caro = null;
for (const v of c.vods) {
  const esc = lerMaster(await txt(v.master), v.master);
  if (!esc.length) continue;
  const pl = lerPlaylist(await txt(esc.at(-1).url), esc.at(-1).url);
  if (T0 >= pl.inicio && T0 < pl.fim) {
    barato = pl;
    const rung = esc.find((e) => /720|540/.test(e.url)) || esc[0];
    caro = lerPlaylist(await txt(rung.url), rung.url);
    break;
  }
}
if (!barato) { console.log('nada'); process.exit(1); }

const segs = segmentosNaJanela(barato, T0, T0 + DUR * 1000);
console.log(`a baixar ${segs.length} segmentos de som…`);
const partes = [];
for (const s of segs) partes.push(Buffer.from(await (await fetch(s.url, { headers: CAB })).arrayBuffer()));
fs.writeFileSync(`${D}/a.ts`, Buffer.concat(partes));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${D}/a.ts`, '-ss', String((T0 - segs[0].inicio) / 1000),
  '-t', String(DUR), '-ac', '1', '-ar', String(TAXA_TIROS), '-f', 'f32le', `${D}/a.raw`]);
const raw = fs.readFileSync(`${D}/a.raw`);
const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));

const b = energia(x);
const g = lutas(impulsos(b, chao(b))).slice(0, 6);
console.log(`\n${DUR / 60} min · ${g.length} tiroteios, do mais alto para baixo:\n`);
const nomes = [];
for (const [i, l] of g.entries()) {
  const quando = T0 + l.inicioS * 1000;
  console.log(`  ${i + 1}. ${new Date(quando).toISOString().slice(11, 19)} → `
    + `${new Date(T0 + l.fimS * 1000).toISOString().slice(11, 19)}  `
    + `${String(l.tiros).padStart(3)} disparos  pico x${l.pico.toFixed(0)}`);
  // Uma imagem a meio do combate, que e onde se ve se e mesmo um.
  const meio = quando + Math.min(l.duracaoS * 1000 / 2, 8000);
  const ss = segmentosNaJanela(caro, meio, meio + 1000);
  if (!ss.length) continue;
  fs.writeFileSync(`${D}/s.ts`, Buffer.from(await (await fetch(ss[0].url, { headers: CAB })).arrayBuffer()));
  const nome = `${D}/${i + 1}.png`;
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${D}/s.ts`, '-ss', String((meio - ss[0].inicio) / 1000),
      '-frames:v', '1', '-vf', 'scale=760:-1', nome]);
    nomes.push(nome);
  } catch { /* segmento mau */ }
}
execFileSync('ffmpeg', ['-y', '-v', 'error', ...nomes.flatMap((f) => ['-i', f]),
  '-filter_complex', `${nomes.map((_, i) => `[${i}]pad=iw:ih+6:0:0:white[p${i}]`).join(';')};${nomes.map((_, i) => `[p${i}]`).join('')}vstack=inputs=${nomes.length}`,
  `${D}/tudo.png`]);
console.log('\nimagem:', `${D}/tudo.png`);
