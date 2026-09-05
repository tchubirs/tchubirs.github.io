// Quanto é que os ângulos estão REALMENTE desalinhados?
//
// O PROGRAM-DATE-TIME é o instante em que o pedaço chegou ao servidor da Kick.
// Entre a placa de captura de cada um e esse servidor há o buffer do OBS, o
// encoder e a subida — e isso é diferente em cada casa. Essa diferença é o
// único erro que sobra, e não se mede com carimbos: mede-se com o som.
//
// Baixa o mesmo minuto de relógio de cada canal, decodifica o áudio, e alinha
// cada um contra o primeiro por correlação cruzada. O pico diz o desvio.
//
//   node probes/desvio-real.mjs 2026-08-30T23:00:00Z wowi dilanzito ...

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { lerMaster, lerPlaylist, segmentosNaJanela } from '../site/kick.js';

const [quando, ...CANAIS] = process.argv.slice(2);
const T0 = Date.parse(quando);
const JANELA_S = Number(process.env.JANELA_S || 90);
const DIR = process.env.DIR || '/tmp/audio';
fs.mkdirSync(DIR, { recursive: true });

const CAB = { 'user-agent': 'Mozilla/5.0 Chrome/128.0', accept: '*/*' };
const txt = async (u) => (await fetch(u, { headers: CAB })).text();

// Margem: o desvio pode ser de segundos, por isso puxa-se mais som do que a
// janela pedida, senão o pico verdadeiro fica fora do que se baixou.
const MARGEM_S = 30;

async function audioDoCanal(slug) {
  const j = await (await fetch(`https://kick.com/api/v2/channels/${slug}/videos`, { headers: CAB })).json();
  const lista = (Array.isArray(j) ? j : j.data)
    .filter((v) => v.source)
    .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));

  for (const v of lista.slice(0, 4)) {
    const escada = lerMaster(await txt(v.source), v.source);
    if (!escada.length) continue;
    // O degrau mais barato: o áudio é o MESMO em todos os degraus, e este
    // pesa 230 kbps em vez de 9 Mbps. Baixar 1080p para ouvir som é absurdo.
    const p = lerPlaylist(await txt(escada.at(-1).url), escada.at(-1).url);
    const de = T0 - MARGEM_S * 1000;
    const ate = T0 + (JANELA_S + MARGEM_S) * 1000;
    const segs = segmentosNaJanela(p, de, ate);
    if (!segs.length) continue;

    const partes = [];
    for (const s of segs) {
      const r = await fetch(s.url, { headers: CAB });
      if (!r.ok) throw new Error(`segmento ${r.status}`);
      partes.push(Buffer.from(await r.arrayBuffer()));
    }
    const ts = `${DIR}/${slug}.ts`;
    fs.writeFileSync(ts, Buffer.concat(partes));

    // O primeiro segmento baixado começa no relógio dele; tudo o que vier
    // antes de T0 é cortado, para que todos os WAV comecem no MESMO instante.
    const recorte = (T0 - segs[0].inicio) / 1000;
    const wav = `${DIR}/${slug}.wav`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', ts,
      '-ss', String(Math.max(0, recorte)), '-t', String(JANELA_S),
      '-ac', '1', '-ar', '8000', '-f', 'wav', wav]);
    const bytes = fs.statSync(ts).size;
    // O .ts já não serve para nada e o disco desta máquina é uma cota fixa.
    fs.unlinkSync(ts);
    return { slug, wav, segs: segs.length, bytes, recorte, vod: v.id, instante: quando };
  }
  return null;
}

const feitos = [];
for (const slug of CANAIS) {
  process.stdout.write(`  ${slug.padEnd(16)}`);
  try {
    const r = await audioDoCanal(slug);
    if (!r) { console.log('não filmava a essa hora'); continue; }
    console.log(`${r.segs} segmentos · ${(r.bytes / 1048576).toFixed(1)} MB · corte ${r.recorte.toFixed(2)}s`);
    feitos.push(r);
  } catch (e) { console.log(`✗ ${e.message}`); }
}
fs.writeFileSync(`${DIR}/lista.json`, JSON.stringify(feitos, null, 2));
console.log(`\n${feitos.length} ficheiros em ${DIR}`);
