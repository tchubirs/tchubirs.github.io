// A busca automática, contra a Kick a sério.
//
// Uma conta que só foi testada com ruído sintético não vale nada até ver som
// verdadeiro. Isto varre uma hora de um canal e mostra o que acha.
//
//   node probes/achar-kills.mjs tchubi 2026-08-30T22:00:00Z 3600

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { vodsDoCanal, lerMaster, lerPlaylist, segmentosNaJanela } from '../site/kick.js';
import { linhaDoCanal } from '../site/relogio.js';
import { varrerNoite, custoVarrerMB } from '../site/procurar-momentos.js';
import { TAXA_TIROS as TAXA } from '../site/tiros.js';

const [slug, quando, segundos = '3600'] = process.argv.slice(2);
const T0 = Date.parse(quando);
const DIR = '/tmp/achar';
fs.mkdirSync(DIR, { recursive: true });
const CAB = { 'user-agent': 'Mozilla/5.0 Chrome/128.0', accept: '*/*' };
const txt = async (u) => (await fetch(u, { headers: CAB })).text();

const c = await vodsDoCanal(slug, { buscar: (u) => fetch(u, { headers: CAB }) });
const pecas = [];
for (const v of c.vods.filter((v) => Math.abs(v.inicioApi - T0) < 24 * 3600_000)) {
  const escada = lerMaster(await txt(v.master), v.master);
  if (!escada.length) continue;
  pecas.push({ vod: v, playlist: lerPlaylist(await txt(escada.at(-1).url), escada.at(-1).url), escada, barato: escada.at(-1) });
}
const linha = linhaDoCanal(slug, pecas);
linha.pecasCompletas = linha.pecas;
console.log(`  ${slug}: ${linha.pecas.length} VOD, ${new Date(linha.inicio).toISOString()} → ${new Date(linha.fim).toISOString()}`);
console.log(`  a varrer ${segundos}s a partir de ${quando} — cerca de ${custoVarrerMB(Number(segundos) * 1000)} MB\n`);

/** Som real: baixa os segmentos, tira o áudio com o ffmpeg, devolve amostras. */
const lerSom = async (l, quandoMs, duracaoS, { contador }) => {
  const p = l.pecas.find((x) => quandoMs >= x.playlist.inicio && quandoMs < x.playlist.fim);
  if (!p) return null;
  const segs = segmentosNaJanela(p.playlist, quandoMs, quandoMs + duracaoS * 1000);
  if (!segs.length) return null;
  const partes = [];
  for (const s of segs) {
    const r = await fetch(s.url, { headers: CAB });
    if (!r.ok) return null;
    partes.push(Buffer.from(await r.arrayBuffer()));
  }
  const ts = Buffer.concat(partes);
  contador?.(ts.length);
  fs.writeFileSync(`${DIR}/b.ts`, ts);
  const recorte = Math.max(0, (quandoMs - segs[0].inicio) / 1000);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${DIR}/b.ts`, '-ss', String(recorte),
    '-t', String(duracaoS), '-ac', '1', '-ar', String(TAXA), '-f', 'f32le', `${DIR}/b.raw`]);
  const raw = fs.readFileSync(`${DIR}/b.raw`);
  return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
};

const hora = (ms) => new Date(ms).toISOString().slice(11, 19);
const r = await varrerNoite({
  linha,
  deMs: T0,
  ateMs: T0 + Number(segundos) * 1000,
  bocadoS: 300,
  lerSom,
  aoProgresso: (p) => process.stdout.write(`\r  bocado ${p.feito}/${p.total} · ${(p.bytes / 1048576).toFixed(0)} MB   `),
});
console.log(`\n\n  ${r.candidatos.length} candidatos, ${(r.bytes / 1048576).toFixed(0)} MB ouvidos:\n`);
for (const [i, k] of r.candidatos.entries()) {
  console.log(`   ${String(i + 1).padStart(2)}  ${hora(k.ms)}Z   ${String(k.tiros).padStart(3)} tiros em ${k.duracaoS.toFixed(1)}s   pico x${k.pico.toFixed(0)}`);
}
