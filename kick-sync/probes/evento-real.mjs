// O teste real: cinco canais que estiveram no MESMO evento, na mesma noite.
//
// Não é uma simulação. Vai à Kick, lê os VODs de cada um, tira o relógio de
// dentro do vídeo (EXT-X-PROGRAM-DATE-TIME) e responde à única pergunta que
// interessa: às tais horas, em que segundo do vídeo de cada um está o mesmo
// instante?
//
//   node probes/evento-real.mjs wowi dilanzito yopickeosola ...

import { linhaDoCanal, janelaComum, onde, quantosNoAr } from '../site/relogio.js';
import { lerMaster, lerPlaylist } from '../site/kick.js';

const CANAIS = process.argv.slice(2);
if (!CANAIS.length) { console.error('dá-me nomes de canais'); process.exit(1); }

const CAB = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
};

const hora = (ms) => new Date(ms).toISOString().slice(11, 19);
const dia = (ms) => new Date(ms).toISOString().slice(0, 10);
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(4)}min ${String(Math.floor(s % 60)).padStart(2, '0')}s`;

async function texto(url, tipo = 'text') {
  const r = await fetch(url, { headers: CAB });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return tipo === 'json' ? r.json() : r.text();
}

/** Os VODs de um canal, com o master de cada um. */
async function vods(slug) {
  const j = await texto(`https://kick.com/api/v2/channels/${slug}/videos`, 'json');
  const lista = Array.isArray(j) ? j : (j?.data ?? []);
  return lista.map((v) => ({
    id: v.id,
    titulo: v.session_title || '',
    inicioApi: Date.parse(String(v.start_time || '').replace(' ', 'T') + 'Z'),
    duracaoMs: v.duration || 0,
    master: v.source || v.video?.source || null,
  })).filter((v) => v.master && Number.isFinite(v.inicioApi));
}

const linhas = [];
const falhas = [];

for (const slug of CANAIS) {
  process.stdout.write(`  ${slug.padEnd(16)}`);
  try {
    const lista = await vods(slug);
    if (!lista.length) { console.log('sem VODs públicos'); falhas.push([slug, 'sem VODs']); continue; }

    // A noite mais recente: agrupa por 6 h de intervalo, como faz a página.
    lista.sort((a, b) => b.inicioApi - a.inicioApi);
    const maisNovo = lista[0].inicioApi;
    const daNoite = lista.filter((v) => Math.abs(v.inicioApi - maisNovo) < 12 * 3600_000);

    const pecas = [];
    for (const v of daNoite) {
      const escada = lerMaster(await texto(v.master), v.master);
      if (!escada.length) continue;
      const barato = escada.at(-1);
      // O degrau de baixo é o mesmo vídeo, os mesmos carimbos, e uma
      // fracção do download. Para medir o relógio chega e sobra.
      const playlist = lerPlaylist(await texto(barato.url), barato.url);
      pecas.push({ vod: v, playlist, escada, barato });
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!pecas.length) { console.log('VODs sem playlist legível'); falhas.push([slug, 'sem playlist']); continue; }

    const l = linhaDoCanal(slug, pecas);
    linhas.push(l);
    console.log(`${pecas.length} VOD · ${dia(l.inicio)} ${hora(l.inicio)} → ${hora(l.fim)} · relógio ${l.relogio}`
      + `${l.buracos.length ? ` · ${l.buracos.length} buraco(s)` : ''}`);
  } catch (e) {
    console.log(`✗ ${e.message}`);
    falhas.push([slug, e.message]);
  }
  await new Promise((r) => setTimeout(r, 600));
}

if (!linhas.length) { console.log('\nnenhum canal utilizável.'); process.exit(0); }

// ── o que os carimbos dizem ────────────────────────────────────────────────
console.log('\n─── O RELÓGIO, CANAL A CANAL ───\n');
for (const l of linhas) {
  const p = l.pecas[0].playlist;
  const desvio = (p.inicio - l.pecas[0].vod.inicioApi) / 1000;
  console.log(`  ${l.slug.padEnd(16)} 1º carimbo ${new Date(p.inicio).toISOString()}`
    + `   (API dizia ${desvio >= 0 ? '+' : ''}${desvio.toFixed(2)}s)   ${p.segmentos.length} segmentos`);
}

const j = janelaComum(linhas);
console.log(`\n  a noite toda:  ${hora(j.inicio)} → ${hora(j.fim)}  (${j.canais} canais)`);
if (j.haSobreposicao) {
  const min = Math.round((j.sobreposicaoFim - j.sobreposicaoInicio) / 60000);
  console.log(`  TODOS no ar:   ${hora(j.sobreposicaoInicio)} → ${hora(j.sobreposicaoFim)}   (${min} min de evento em comum)`);
} else {
  console.log('  TODOS no ar:   nunca — não há um instante com todos');
}

// ── a prova ────────────────────────────────────────────────────────────────
const base = j.haSobreposicao ? j.sobreposicaoInicio : j.inicio;
const fimAmostra = j.haSobreposicao ? j.sobreposicaoFim : j.fim;
const instantes = [0.25, 0.5, 0.75].map((f) => Math.round(base + (fimAmostra - base) * f));

for (const t of instantes) {
  console.log(`\n─── ÀS ${hora(t)}Z — ${quantosNoAr(linhas, t)} de ${linhas.length} ângulos ───\n`);
  for (const l of linhas) {
    const r = onde(l, t);
    const diz = r.estado === 'toca'
      ? `→ segundo ${String(Math.round(r.tempoS)).padStart(6)}  (${mmss(r.tempoS)}) do VOD dele`
      : r.estado === 'antes' ? `ainda não estava a transmitir (faltavam ${Math.round(r.faltamS / 60)} min)`
        : r.estado === 'depois' ? `já tinha acabado há ${Math.round(r.passouS / 60)} min`
          : r.estado === 'buraco' ? 'estava fora do ar' : 'sem vídeo';
    console.log(`  ${l.slug.padEnd(16)} ${diz}`);
  }
}

if (falhas.length) {
  console.log('\n─── não deu ───');
  for (const [s, p] of falhas) console.log(`  ${s.padEnd(16)} ${p}`);
}
console.log();
