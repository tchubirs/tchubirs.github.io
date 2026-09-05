// Ler um VOD da Twitch daqui, que é o que o browser não pode fazer.
//
// "Tão dando stream sniper no meu companheiro." Para dizer QUEM, é preciso
// olhar para o ecrã dele no instante da morte: o Rust escreve lá o nome de
// quem matou. E até agora isso estava fechado do lado da Twitch.
//
// O `site/twitch.js` diz porquê, e diz certo: o `gql.twitch.tv` responde a
// toda a gente, mas o `usher` e o CDN só respondem a `https://www.twitch.tv`.
// Isso é CORS — uma regra do BROWSER. Um servidor não a tem. Medido hoje: daqui
// o master.m3u8 de um VOD vem com 200 e traz o 1080p60 de origem.
//
// Portanto: a página continua sem poder ler os bytes da Twitch, e isso não
// muda. Isto é para o outro lado — para eu poder ir buscar um instante de um
// VOD e olhar para ele.
//
//   node probes/twitch-vod.mjs <canal>                    lista os VODs
//   node probes/twitch-vod.mjs <canal> <vodId> <segundos> tira um frame
//
// O ClientID é o do player web da Twitch, que qualquer pessoa vê no devtools.
// Não é credencial de ninguém e não identifica ninguém.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CLIENTE = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL = 'https://gql.twitch.tv/gql';

async function perguntar(corpo) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'Client-ID': CLIENTE, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`gql respondeu ${r.status}`);
  return r.json();
}

export async function vods(canal, quantos = 20) {
  const d = await perguntar({
    query: `{ user(login: "${canal}") { id displayName videos(first: ${quantos}, sort: TIME) {
      edges { node { id title lengthSeconds publishedAt game { name } } } } } }`,
  });
  const u = d?.data?.user;
  if (!u) return null;
  return {
    id: u.id,
    nome: u.displayName,
    lista: (u.videos?.edges || []).map((e) => e.node),
  };
}

/** O m3u8 de um VOD. Precisa da assinatura, e a assinatura é pública. */
export async function playlist(vodId) {
  const d = await perguntar({
    operationName: 'PlaybackAccessToken',
    query: 'query PlaybackAccessToken($vodID:ID!,$playerType:String!)'
      + '{videoPlaybackAccessToken(id:$vodID,params:{platform:"web",'
      + 'playerBackend:"mediaplayer",playerType:$playerType}){value signature}}',
    variables: { vodID: String(vodId), playerType: 'site' },
  });
  const t = d?.data?.videoPlaybackAccessToken;
  if (!t) throw new Error('a Twitch não deu assinatura para este VOD');
  const url = `https://usher.ttvnw.net/vod/${vodId}.m3u8`
    + `?sig=${t.signature}&token=${encodeURIComponent(t.value)}&allow_source=true&player=twitchweb`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`usher respondeu ${r.status}`);
  const texto = await r.text();
  // A escada, do melhor para o pior, como no `kick.js`.
  const degraus = [];
  const linhas = texto.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const res = linhas[i].match(/RESOLUTION=(\d+)x(\d+)/) || [];
    degraus.push({
      largura: Number(res[1]) || null,
      altura: Number(res[2]) || null,
      bitrate: Number((linhas[i].match(/BANDWIDTH=(\d+)/) || [])[1]) || 0,
      url: linhas[i + 1]?.trim(),
    });
  }
  degraus.sort((a, b) => b.bitrate - a.bitrate);
  return degraus;
}

/** Um frame do VOD, ao segundo. É aqui que se lê quem matou quem. */
export async function frame(vodId, segundos, saida) {
  const [melhor] = await playlist(vodId);
  if (!melhor) throw new Error('sem qualidades no master');
  return new Promise((ok, mal) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-ss', String(segundos), '-i', melhor.url,
      '-frames:v', '1', '-q:v', '3', '-y', saida,
    ]);
    let erro = '';
    ff.stderr.on('data', (d) => { erro += d; });
    ff.on('error', mal);
    ff.on('close', (c) => (c === 0 ? ok(saida) : mal(new Error(erro.trim() || `ffmpeg saiu com ${c}`))));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [canal, vodId, quando] = process.argv.slice(2);
  if (!canal) {
    console.error('uso: node probes/twitch-vod.mjs <canal> [vodId] [segundos]');
    process.exit(2);
  }
  if (!vodId) {
    const r = await vods(canal);
    if (!r) { console.log(`não existe canal "${canal}" na Twitch`); process.exit(1); }
    console.log(`${r.nome}  (id ${r.id})  ·  ${r.lista.length} VODs públicos`);
    for (const v of r.lista) {
      const h = Math.floor(v.lengthSeconds / 3600);
      const m = Math.round((v.lengthSeconds % 3600) / 60);
      console.log(`  ${v.id}  ${v.publishedAt}  ${h}h${String(m).padStart(2, '0')}`
        + `  ${(v.game?.name || '—').slice(0, 18).padEnd(18)}  ${(v.title || '').slice(0, 40)}`);
    }
  } else if (!quando) {
    for (const d of await playlist(vodId)) {
      console.log(`  ${String(d.largura)}x${d.altura}  ${(d.bitrate / 1e6).toFixed(1)} Mbps`);
    }
  } else {
    const f = `frame-${vodId}-${quando}.jpg`;
    await frame(vodId, Number(quando), f);
    console.log('escrito', f);
  }
}
