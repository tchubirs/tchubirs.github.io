// Phase 0 / probe 1 + 2 — throwaway. Real calls, saved fixtures, real numbers.
//
// Question the owner asked us to test rather than trust: "the m3u8 path encodes
// absolute start time". Three clocks claim to answer it, and they disagree:
//
//   1. the path            /2026/8/30/20/47/   -> minute resolution, no seconds
//   2. the API             start_time          -> second resolution
//   3. EXT-X-PROGRAM-DATE-TIME in the playlist -> millisecond, per segment
//
// This measures the disagreement in seconds across samples, and records the
// CORS headers for master playlist, media playlist AND segment separately —
// they often differ, and that difference is what decides web vs desktop.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const ORIGIN = 'https://not-kick.example';
const AQUI = new URL('.', import.meta.url).pathname;

const pegar = async (url, extra = {}) => fetch(url, {
  headers: { 'User-Agent': UA, Origin: ORIGIN, ...extra.headers },
  ...extra,
});

const cors = (r) => ({
  status: r.status,
  allowOrigin: r.headers.get('access-control-allow-origin'),
  allowMethods: r.headers.get('access-control-allow-methods'),
  type: r.headers.get('content-type'),
  acceptsRange: r.status === 206 || r.headers.get('accept-ranges') === 'bytes',
});

async function amostra(canal) {
  const out = { canal };
  const rv = await pegar(`https://kick.com/api/v2/channels/${canal}/videos`);
  out.videosEndpoint = cors(rv);
  if (!rv.ok) return out;
  const lista = await rv.json();
  out.vodCount = Array.isArray(lista) ? lista.length : 0;
  if (!out.vodCount) return out;

  const v = lista[0];
  out.vod = {
    id: v.id, createdAt: v.created_at, startTime: v.start_time,
    durationMs: v.duration, isPrivate: v.video?.is_private, isPruned: v.video?.is_pruned,
  };
  out.source = v.source;

  // clock 1 — the path
  const m = String(v.source).match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\//);
  out.pathClock = m
    ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString()
    : null;

  // clock 2 — the API. Kick serves it without a zone; treat as UTC and say so.
  out.apiClock = v.start_time ? `${v.start_time.replace(' ', 'T')}Z` : null;

  const rm = await pegar(v.source);
  out.masterPlaylist = cors(rm);
  if (!rm.ok) return out;
  const master = await rm.text();
  writeFileSync(`${AQUI}fixtures/${canal}-master.m3u8`, master);

  out.ladder = [...master.matchAll(/RESOLUTION=(\d+x\d+).*?FRAME-RATE=([\d.]+)/g)]
    .map((x, i) => ({
      resolution: x[1],
      fps: Number(x[2]),
      bandwidth: Number((master.match(/BANDWIDTH=(\d+)/g) || [])[i]?.slice(10)),
    }));
  out.lowestRung = out.ladder.at(-1) || null;

  const rend = (master.split('\n').filter((l) => l && !l.startsWith('#'))
    .find((l) => /160/.test(l)) || master.split('\n').filter((l) => l && !l.startsWith('#')).at(-1) || '').trim();
  const base = v.source.replace(/\/master\.m3u8.*$/, '');

  const rp = await pegar(`${base}/${rend}`);
  out.mediaPlaylist = { ...cors(rp), rendition: rend };
  if (!rp.ok) return out;
  const media = await rp.text();
  writeFileSync(`${AQUI}fixtures/${canal}-media.m3u8`, media.slice(0, 20000));

  // clock 3 — PROGRAM-DATE-TIME, the media's own clock
  const pdts = [...media.matchAll(/#EXT-X-PROGRAM-DATE-TIME:(\S+)/g)].map((x) => x[1]);
  out.programDateTime = {
    present: pdts.length > 0,
    count: pdts.length,
    first: pdts[0] || null,
    targetDuration: Number((media.match(/#EXT-X-TARGETDURATION:(\d+)/) || [])[1]) || null,
    playlistType: (media.match(/#EXT-X-PLAYLIST-TYPE:(\S+)/) || [])[1] || null,
  };

  const seg = (media.split('\n').filter((l) => l && !l.startsWith('#'))[0] || '').trim();
  if (seg) {
    const rs = await pegar(`${base}/${rend.replace(/\/[^/]+$/, '')}/${seg}`,
      { headers: { Range: 'bytes=0-65535' } });
    out.segment = { ...cors(rs), name: seg };
  }

  // the numbers the decision needs
  const s = (a, b) => (a && b ? Number(((new Date(b) - new Date(a)) / 1000).toFixed(3)) : null);
  out.disagreementSeconds = {
    pathVsApi: s(out.pathClock, out.apiClock),
    pathVsPdt: s(out.pathClock, out.programDateTime.first),
    apiVsPdt: s(out.apiClock, out.programDateTime.first),
  };
  return out;
}

const canais = process.argv.slice(2);
mkdirSync(`${AQUI}fixtures`, { recursive: true });
const tudo = [];
for (const c of canais) {
  try { tudo.push(await amostra(c)); } catch (e) { tudo.push({ canal: c, erro: e.message }); }
}
writeFileSync(`${AQUI}fixtures/clock-probe.json`, `${JSON.stringify(tudo, null, 2)}\n`);

for (const a of tudo) {
  if (a.erro || !a.vodCount) { console.log(`${a.canal.padEnd(16)} ${a.erro || 'sem VODs'}`); continue; }
  const d = a.disagreementSeconds;
  console.log(`${a.canal.padEnd(16)} vods:${String(a.vodCount).padEnd(3)} `
    + `low:${a.lowestRung?.resolution || '?'}@${a.lowestRung?.bandwidth || '?'} `
    + `pdt:${a.programDateTime.count} `
    + `Δpath→api:${String(d.pathVsApi).padStart(7)}s  Δapi→pdt:${String(d.apiVsPdt).padStart(7)}s`);
}
