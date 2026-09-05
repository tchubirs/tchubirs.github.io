// Dá para fazer o Replay na Twitch sem servidor? Medido, não adivinhado.
//
// RESPOSTA CURTA: metade. O que decide é uma linha de header.
//
//   gql.twitch.tv          access-control-allow-origin: *
//       -> listar VODs, saber a que horas cada um começou, procurar canais.
//          Tudo isto o browser pode fazer, de qualquer site.
//
//   usher.ttvnw.net e o CDN (d2nvs31859zcd8.cloudfront.net)
//       -> devolvem o header SÓ para https://www.twitch.tv. De qualquer outra
//          origem não vem header nenhum, e o browser recusa a leitura.
//
// O `Origin` é posto pelo browser e a página não lhe pode mexer, por isso não
// há truque do lado do cliente. Sem ler os bytes não há:
//   · sincronia automática pelo som   (preciso das amostras)
//   · saber quem morreu               (preciso dos pixéis)
//   · descarregar o clipe             (preciso dos segmentos)
//
// O que SOBRA, e funciona: o player oficial em iframe. `player.twitch.tv`
// responde `Content-Security-Policy: frame-ancestors <o teu domínio>` quando
// se passa `parent=`, e o embed traz uma API de `seek`/`play`/`pause`. Dá um
// visualizador multi-POV sincronizado — que é o essencial — mas não a
// clipagem nem a busca automática.
//
// O relógio para esse visualizador vem do GQL: `publishedAt` do VOD mais o
// tempo do player. Precisão de segundos, e não de milissegundos como na Kick.
// Ele já tinha dito que 10 a 20 s chegava, e os nudges manuais fecham o resto.
//
// Correr:  node probes/twitch.mjs [canal]
const CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // o do player web, visível no devtools de toda a gente
const ORIGEM_NOSSA = 'https://tchubirs.github.io';

const gql = async (query) => {
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': CLIENT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { estado: r.status, cors: r.headers.get('access-control-allow-origin'), corpo: await r.json() };
};

const canal = process.argv[2] || 'summit1g';

console.log(`== 1. os VODs de ${canal} ==`);
const vods = await gql(`{ user(login: "${canal}") { videos(first: 4, type: ARCHIVE) {
  edges { node { id title publishedAt lengthSeconds } } } } }`);
console.log('  http', vods.estado, ' access-control-allow-origin:', vods.cors);
const lista = vods.corpo?.data?.user?.videos?.edges?.map((e) => e.node) || [];
for (const v of lista) console.log(`  ${v.id}  ${v.publishedAt}  ${v.lengthSeconds}s  ${(v.title || '').slice(0, 40)}`);
if (!lista.length) { console.log('  nada:', JSON.stringify(vods.corpo).slice(0, 300)); process.exit(1); }

console.log('\n== 2. o token do VOD ==');
const id = lista[0].id;
const tok = await gql(`{ videoPlaybackAccessToken(id: "${id}", params: {
  platform: "web", playerBackend: "mediaplayer", playerType: "site" }) { value signature } }`);
console.log('  http', tok.estado, ' access-control-allow-origin:', tok.cors);
const t = tok.corpo?.data?.videoPlaybackAccessToken;
if (!t) { console.log('  sem token:', JSON.stringify(tok.corpo).slice(0, 300)); process.exit(1); }
console.log('  token ok, assinatura', t.signature.slice(0, 12), '…');

const url = `https://usher.ttvnw.net/vod/${id}.m3u8?`
  + new URLSearchParams({ nauth: t.value, nauthsig: t.signature, allow_source: 'true', player: 'twitchweb' });
const master = await (await fetch(url)).text();
const media = master.split('\n').find((l) => l.startsWith('http'));
const texto = await (await fetch(media)).text();
const seg = new URL(texto.split('\n').find((l) => l && !l.startsWith('#')), media).href;

console.log('\n== 3. o CORS, por origem ==');
console.log('  (o header do CDN é o que decide se isto é possível ou não)');
for (const [nome, alvo] of [['usher', url], ['media m3u8', media], ['segmento', seg]]) {
  for (const O of ['https://www.twitch.tv', ORIGEM_NOSSA]) {
    // eslint-disable-next-line no-await-in-loop
    const g = await fetch(alvo, { headers: { Origin: O } });
    console.log(`  ${nome.padEnd(11)} Origin=${O.padEnd(28)} http ${g.status}  `
      + `ACAO=${g.headers.get('access-control-allow-origin') ?? 'NENHUM  <-- o browser bloqueia'}`);
  }
}

console.log('\n== 4. o que o m3u8 traz, se lá chegássemos ==');
const linhas = texto.split('\n');
console.log('  tags:', [...new Set(linhas.filter((l) => l.startsWith('#')).map((l) => l.split(':')[0]))].join(' '));
const pdt = linhas.filter((l) => l.startsWith('#EXT-X-PROGRAM-DATE-TIME'));
console.log('  EXT-X-PROGRAM-DATE-TIME:', pdt.length ? `${pdt.length}x, o primeiro ${pdt[0].split(':').slice(1).join(':')}` : 'NENHUM');
const segs = linhas.filter((l) => l && !l.startsWith('#'));
console.log('  segmentos:', segs.length, ' formato:', /\.mp4$/.test(segs[0]) ? 'fMP4 (o demuxer de TS não serve)' : 'MPEG-TS');
console.log('  mudos por copyright:', segs.filter((s) => s.includes('muted')).length);

// O numero que decide o visualizador por iframe. La dentro nao se le o m3u8,
// so se sabe `publishedAt` (do GQL, que e publico) e o tempo do player. Se
// esses dois relogios estiverem longe um do outro, os POVs nunca alinham.
const inicioReal = Date.parse(pdt[0].split(/:(.*)/)[1]);
const inicioDito = Date.parse(lista[0].publishedAt);
console.log(`  publishedAt vs. relogio real do VOD: ${((inicioDito - inicioReal) / 1000).toFixed(2)} s`
  + '   <- e este o erro com que o iframe arranca');

console.log('\n== 5. o player em iframe, que é a saída ==');
const emb = await fetch(`https://player.twitch.tv/?video=${id}&parent=tchubirs.github.io&autoplay=false`);
console.log('  http', emb.status, ' frame-ancestors:',
  /frame-ancestors ([^;]*)/.exec(emb.headers.get('content-security-policy') || '')?.[1] ?? 'nenhum');
