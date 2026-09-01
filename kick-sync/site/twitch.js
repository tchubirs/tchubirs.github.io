/**
 * A Twitch, do lado do browser e sem servidor nenhum.
 *
 * O que da e o que nao da esta medido em `probes/twitch.mjs`, e a fronteira e
 * uma linha de header:
 *
 *   gql.twitch.tv          access-control-allow-origin: *
 *   usher + CDN            so para https://www.twitch.tv
 *
 * Portanto: procurar canais, listar VODs e saber a que horas cada um comecou,
 * tudo isso a pagina pode fazer. Ler os bytes do video, nao — e sem os bytes
 * nao ha sincronia pelo som, nem saber quem morreu, nem clipe. O que fica e o
 * player oficial em iframe, que toca sem nos deixar ler nada.
 *
 * O relogio vem do `publishedAt`. Medido contra o relogio verdadeiro de dentro
 * do m3u8, em dois canais: 1,93 s e 2,39 s. E por isso que a linha sai marcada
 * como 'parcial' e nao 'exato' — sao dois segundos, e a pagina tem de o dizer
 * em vez de desenhar isto como se fosse igual a Kick.
 */

// O ClientID do player web da Twitch. Qualquer pessoa o ve no devtools ao
// abrir twitch.tv; nao e credencial de ninguem e nao identifica ninguem.
export const CLIENTE = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL = 'https://gql.twitch.tv/gql';

/**
 * Uma pergunta ao GQL.
 *
 * Query crua e nao `persistedQuery`: o sha256 de uma persisted query muda
 * quando a Twitch mexe no player, e o codigo morre sem aviso num dia qualquer.
 *
 * @param {(url:string, opcoes:object) => Promise<Response>} buscar a costura
 *   para os testes — isto tem de se poder testar sem rede.
 */
async function perguntar(query, { buscar = fetch, sinal } = {}) {
  const r = await buscar(GQL, {
    method: 'POST',
    headers: { 'Client-ID': CLIENTE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: sinal,
  });
  if (!r.ok) throw new Error(`TWITCH-${r.status}`);
  const j = await r.json();
  // Um erro do GQL vem com http 200. Deixar passar dava `data.user` nulo mais
  // a frente e um "canal nao existe" para um canal que existe.
  if (j?.errors?.length) throw new Error(`TWITCH-GQL: ${j.errors[0].message}`);
  return j?.data;
}

// O login vai dentro de uma string de GraphQL. Um nome com aspas fechava a
// string e o resto passava a ser query — nao ha aqui nada a ganhar, mas nao e
// coisa que se deixe aberta so porque hoje nao da jeito a ninguem.
const seguro = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '').slice(0, 25);

/** Canais cujo nome se parece com o que ele escreveu. */
export async function procurarCanais(termo, opcoes = {}) {
  const t = String(termo || '').trim();
  if (t.length < 2) return [];
  const d = await perguntar(`{ searchUsers(userQuery: ${JSON.stringify(t.slice(0, 40))}, first: 8) {
    edges { node { login displayName profileImageURL(width: 50) } } } }`, opcoes);
  return (d?.searchUsers?.edges || [])
    .map((e) => e?.node).filter((n) => n?.login)
    .map((n) => ({ slug: n.login, nome: n.displayName || n.login, imagem: n.profileImageURL || null }));
}

/**
 * Os VODs gravados de um canal, do mais recente para tras.
 *
 * `type: ARCHIVE` sao as gravacoes das lives. Os outros tipos — highlights e
 * uploads — nao tem hora de emissao verdadeira, e por isso nao servem para
 * sincronizar nada.
 */
export async function vodsDoCanal(login, { primeiros = 20, ...opcoes } = {}) {
  const l = seguro(login);
  if (!l) return [];
  const d = await perguntar(`{ user(login: "${l}") { videos(first: ${Math.min(100, primeiros)}, type: ARCHIVE) {
    edges { node { id title publishedAt lengthSeconds previewThumbnailURL } } } } }`, opcoes);
  return (d?.user?.videos?.edges || []).map((e) => e?.node).filter(Boolean)
    .map((v) => ({
      id: v.id,
      titulo: v.title || '',
      inicio: Date.parse(v.publishedAt),
      duracaoS: Number(v.lengthSeconds) || 0,
      capa: v.previewThumbnailURL || null,
    }))
    .filter((v) => Number.isFinite(v.inicio) && v.duracaoS > 0);
}

/**
 * Um VOD da Twitch na forma que o `relogio.js` ja sabe ler.
 *
 * Um VOD e um video continuo, sem buracos por dentro: um segmento so, do
 * principio ao fim. Assim o `linhaDoCanal`, o `onde`, o `janelaComum`, o
 * `quantosNoAr` e o agrupamento por noite funcionam sem uma linha nova — e o
 * `tempoDeMidia` devolve logo o segundo a que o player tem de saltar.
 *
 * `fonteDoRelogio: 'publicado'` de proposito: faz a linha sair como 'parcial'.
 * Sao dois segundos de erro, e chamar-lhe 'exato' era mentir ao utilizador
 * sobre a unica coisa que aqui interessa.
 */
export function pecaDoVod(vod) {
  return {
    vod: { id: vod.id, titulo: vod.titulo, capa: vod.capa },
    playlist: {
      segmentos: [{ url: null, inicio: vod.inicio, duracaoS: vod.duracaoS, mediaT: 0 }],
      fonteDoRelogio: 'publicado',
      inicio: vod.inicio,
      fim: vod.inicio + vod.duracaoS * 1000,
      duracaoS: vod.duracaoS,
    },
  };
}

/** O endereco do player oficial, ja no instante certo. */
export function enderecoDoPlayer(vodId, segundos, { pai = location.hostname, mudo = true } = {}) {
  const s = Math.max(0, Math.floor(segundos || 0));
  const p = new URLSearchParams({
    video: `v${vodId}`,
    parent: pai,
    autoplay: 'false',
    muted: String(mudo),
    // O player le o tempo neste formato e ignora um numero solto.
    time: `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`,
  });
  return `https://player.twitch.tv/?${p}`;
}
