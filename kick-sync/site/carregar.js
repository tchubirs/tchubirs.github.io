// Carregar centenas de canais depressa sem a Kick nos fechar a porta, e
// encontrar quem está ao vivo num evento.
//
// O evento para que isto existe tem ~500 streamers de Rust em equipas de 4. Um
// a um, como `carregar()` em app.js faz para meia dúzia de canais, são minutos
// a olhar para uma barra; todos de uma vez é a forma mais rápida de levar um
// 429 e ficar sem nenhum. O meio-termo está aqui:
//
//   - Medido em 06/10/2026: 120 chamadas a kick.com/api/v2/channels/<slug>/
//     videos, 4 e 8 de cada vez, todas 200, 8 s no total. Daí os 8 por
//     defeito. Pelas mesmas contas (~0,5 s por pedido) os 500 em fila indiana
//     levariam uns quatro minutos; a 8 de cada vez, pouco mais de meio.
//   - NÃO medido: onde fica o limite da Kick. Nessas 120 chamadas não veio
//     nenhum 429, por isso a reacção a um é prudente e não afinada —
//     abranda-se para metade e volta-se a pedir, sem desistir do canal à
//     primeira. Quando houver um 429 a sério, é aqui que se afina.

import { vodsDoCanal, DESCONHECIDO } from './kick.js';

/** O mesmo erro que o resto da página usa para "o utilizador desistiu". */
function cancelado() {
  return new DOMException('cancelado', 'AbortError');
}

/**
 * Uma promessa que rejeita quando `sinal` dispara, para pôr em corrida com o
 * que estiver à espera.
 *
 * Sem ela, cancelar a meio de uma espera de 4 s ficava preso os 4 s, e um
 * pedido que a `buscar` não soubesse largar segurava o cancelamento até ao
 * fim. "Cancelar" que demora não é cancelar: a pessoa carrega outra vez e fica
 * com duas cargas a correr.
 */
function quandoCancelar(sinal) {
  let largar = () => {};
  const promessa = new Promise((_, nao) => {
    if (!sinal) return;
    if (sinal.aborted) { nao(cancelado()); return; }
    const f = () => nao(cancelado());
    sinal.addEventListener('abort', f, { once: true });
    largar = () => sinal.removeEventListener('abort', f);
  });
  // Esta promessa só é ouvida enquanto houver uma corrida. Se o sinal disparar
  // depois de tudo acabar, a rejeição não pode sair como "não tratada" — no
  // Node isso mata o processo, no browser suja a consola com um falso erro.
  promessa.catch(() => {});
  return { promessa, largar };
}

/**
 * A mesma regra de nome que `vodsDoCanal` usa por dentro.
 *
 * Tem de ser a mesma: se as duas divergissem, "@Tchubi" e "tchubi" eram
 * pedidos duas vezes (ou, pior, dois canais diferentes eram fundidos num só).
 */
function chaveDoCanal(slug) {
  return String(slug || '').trim().replace(/^@/, '').toLowerCase();
}

/**
 * Os estados que podem dar outra coisa se se pedir outra vez.
 *
 * Um 404 não passa a existir daqui a um segundo, e um canal sem VODs não
 * ganha VODs por insistência. Voltar a pedir esses é só gastar a paciência da
 * Kick com pedidos que já se sabe como acabam — e é essa paciência que
 * segura os outros 499.
 */
function transitorio(estado) {
  return estado === 'rate-limit' || estado === 'sem-rede' || /^http-5\d\d$/.test(estado);
}

/**
 * Os VODs de muitos canais, na MESMA ordem em que foram pedidos.
 *
 * Cada posição é exactamente o objecto de `vodsDoCanal` (de `kick.js`), com o
 * seu `estado` — um canal que falha é uma linha com nome, não um buraco na
 * lista nem uma excepção que leva os outros com ele.
 *
 * - `paralelos`: quantos pedidos no ar ao mesmo tempo (medido: 8 não bloqueia).
 * - `tentativas`: quantas vezes se VOLTA a pedir um canal depois da primeira,
 *   e só nos estados transitórios. Com 3, as esperas são 1 s, 2 s e 4 s.
 * - `esperar(ms)`: injectável para os testes não dormirem de verdade.
 * - `aoProgredir({ feitos, total, slug, estado, paralelos })`: uma vez por
 *   canal, quando o canal está DECIDIDO (não a cada tentativa). `total` conta
 *   canais distintos, porque é isso que se vai carregar: com repetidos na
 *   lista, uma barra que os contasse nunca chegava ao fim. `paralelos` é o
 *   limite em vigor, para a página poder dizer porque é que abrandou.
 * - `sinal`: um AbortSignal. Ao disparar, não sai mais nenhum pedido, o sinal
 *   segue para a `buscar` (um fetch a meio é largado) e isto rejeita logo com
 *   um AbortError.
 */
export async function carregarCanais(slugs, {
  buscar = fetch,
  paralelos = 8,
  tentativas = 3,
  esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)),
  aoProgredir,
  sinal,
} = {}) {
  // Uma string é iterável e `Array.from('tchubi')` dava seis canais de uma
  // letra. Quem tem texto colado parte-o primeiro (app.js já o faz).
  if (typeof slugs === 'string' || slugs == null || typeof slugs[Symbol.iterator] !== 'function') {
    throw new TypeError('carregarCanais quer uma lista de nomes de canal');
  }
  // Zero em paralelo nunca acaba, e um número partido não quer dizer nada.
  // Isto é um erro de quem chama, e dizê-lo já é melhor do que pendurar.
  if (!Number.isInteger(paralelos) || paralelos < 1) {
    throw new RangeError(`paralelos tem de ser um inteiro >= 1 (veio ${paralelos})`);
  }
  if (!Number.isInteger(tentativas) || tentativas < 0) {
    throw new RangeError(`tentativas tem de ser um inteiro >= 0 (veio ${tentativas})`);
  }
  if (sinal?.aborted) throw cancelado();

  const chaves = Array.from(slugs, chaveDoCanal);
  // Cada canal uma vez só. Numa lista de 500 coladas de três sítios há
  // repetidos de certeza, e cada repetido é um pedido a mais contra o limite.
  const unicos = [...new Set(chaves)];
  const total = unicos.length;
  if (!total) return [];

  // ── os lugares ────────────────────────────────────────────────────────────
  // Um lugar é UM pedido no ar, não um canal. Um canal à espera de voltar a
  // tentar não ocupa lugar: se ocupasse, oito canais em espera de 4 s
  // paravam a carga toda, e quando o limite desce a meio, os que voltam
  // entram pela porta já estreitada em vez de saírem todos ao mesmo tempo.
  //
  // É também por isso que as esperas não levam ruído aleatório (o "jitter"
  // habitual): a manada que volta ao mesmo tempo nunca é maior do que o novo
  // limite, porque tem de passar pelos lugares.
  let limite = paralelos;
  // Nunca abaixo de 2 — um de cada vez são os quatro minutos outra vez — mas
  // também nunca ACIMA do que foi pedido: quem pediu 1 tinha as suas razões.
  const piso = Math.min(2, paralelos);
  let emVoo = 0;
  const fila = [];
  let parar = false;

  const vez = (primeiro) => new Promise((ok) => {
    if (emVoo < limite && !fila.length) { emVoo++; ok(); return; }
    // Quem volta a tentar passa à frente: já esperou o castigo dele, e se
    // fosse para o fim de 500 só se sabia dele no fim da carga.
    if (primeiro) fila.unshift(ok); else fila.push(ok);
  });
  const libertar = () => {
    emVoo--;
    while (!parar && emVoo < limite && fila.length) { emVoo++; fila.shift()(); }
  };

  // ── o abrandamento ────────────────────────────────────────────────────────
  // Depois de um 429, o limite passa a metade até ao fim da carga.
  //
  // Mas só UMA vez por vaga. Quando a Kick começa a recusar, os oito pedidos
  // que já estavam no ar costumam voltar todos com 429: são o mesmo aviso,
  // não oito. Cortar oito vezes atirava o limite logo para o piso por causa
  // de um único momento de aperto. Por isso cada pedido leva a "geração" em
  // que saiu, e só um 429 da geração corrente corta — um 429 de um pedido
  // que já saiu com o limite novo quer dizer que a metade ainda não chegou,
  // e esse sim corta outra vez. (É a mesma ideia do TCP: um corte por ida e
  // volta, não um por pacote perdido.)
  let geracao = 0;

  const abortado = quandoCancelar(sinal);
  // O sinal vai até ao fetch, para um pedido a meio ser largado de facto e
  // não só ignorado quando chegar.
  const buscarComSinal = sinal ? (url, op) => buscar(url, { ...op, signal: sinal }) : buscar;

  async function umCanal(chave) {
    for (let feitas = 0; ; feitas++) {
      await vez(feitas > 0);
      if (parar || sinal?.aborted) { libertar(); throw cancelado(); }
      const minhaGeracao = geracao;
      let r;
      try {
        r = await vodsDoCanal(chave, { buscar: buscarComSinal });
        // ANTES de libertar o lugar: se fosse depois, o lugar livre ia já para
        // o próximo da fila com o limite antigo, e o corte chegava atrasado.
        if (r.estado === 'rate-limit' && minhaGeracao === geracao) {
          limite = Math.max(piso, Math.floor(limite / 2));
          geracao++;
        }
      } finally {
        libertar();
      }
      // Um fetch largado pelo sinal volta como 'sem-rede', que é transitório e
      // seria tentado outra vez. Não pode: a pessoa mandou parar.
      if (sinal?.aborted) throw cancelado();
      if (!transitorio(r.estado) || feitas >= tentativas) return r;
      // A espera não precisa de correr contra o sinal aqui dentro: quem
      // chamou já recebeu o AbortError pela corrida lá de baixo, e quando
      // esta espera acabar o canal dá com o `parar` antes de pedir o que seja.
      await esperar(1000 * 2 ** feitas);
    }
  }

  let feitos = 0;
  const trabalho = Promise.all(unicos.map((chave) => umCanal(chave).then((r) => {
    feitos++;
    aoProgredir?.({ feitos, total, slug: r.slug, estado: r.estado, paralelos: limite });
    return r;
  })));

  try {
    const resultados = await Promise.race([trabalho, abortado.promessa]);
    const porChave = new Map(unicos.map((c, i) => [c, resultados[i]]));
    // O repetido recebe o MESMO objecto: é o mesmo canal, e duas cópias que
    // se podem afastar uma da outra são um erro à espera de acontecer.
    return chaves.map((c) => porChave.get(c));
  } catch (e) {
    // Cancelado, ou um erro a sério (o `aoProgredir` da página a rebentar,
    // por exemplo): em qualquer dos casos não sai mais nenhum pedido. Uma
    // carga que já falhou para quem a pediu não pode continuar a gastar o
    // limite da Kick em segundo plano.
    parar = true;
    throw e;
  } finally {
    abortado.largar();
  }
}

// ── quem está ao vivo ───────────────────────────────────────────────────────

const AO_VIVO = 'https://kick.com/stream/livestreams/en';

/**
 * Letras que a decomposição Unicode não parte em "letra + acento".
 *
 * O `ı` não é teoria: em 06/10/2026, entre os 39 ao vivo de Rust, um tinha a
 * etiqueta "Englısh" (i sem ponto, de um teclado turco), e "english" não a
 * encontrava. O `ł`, `ø`, `đ` e `ß` falham da mesma maneira e pela mesma
 * razão — são letras próprias, não letras com acento.
 */
const DOBRAS = { ı: 'i', ł: 'l', ø: 'o', đ: 'd', ß: 'ss' };

/**
 * Texto pronto a comparar: sem maiúsculas e sem acentos.
 *
 * NFKD e não só NFD. A NFD tira os acentos; a K também desfaz as letras
 * "estilizadas". Medido em 06/10/2026 sobre 295 títulos ao vivo: 16 mudam
 * entre uma e outra, e entre eles "ᵒˡᵃᵇⁱˡⁱʳ" (letras em expoente) e
 * "³⁰⁰gang". Quem procura escreve com o teclado normal, e com a NFD esses
 * títulos eram invisíveis.
 *
 * Depois disto, nos dois lados, tudo o que não é letra nem número sai: as
 * palavras procuradas partem-se aí, e o texto onde se procura fica COLADO.
 * Assim "kickoff" encontra "Kick-Off" e "KICK OFF", e "kick off" encontra
 * "#RustKickOff". Um falso positivo aparece na lista com o título ao lado e
 * tira-se com um clique; um participante que falta não aparece em lado
 * nenhum, e é esse o erro caro.
 */
function dobrar(texto) {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ıłøđß]/g, (c) => DOBRAS[c]);
}

function palavrasDe(palavras) {
  const cru = Array.isArray(palavras) ? palavras.join(' ') : String(palavras ?? '');
  return dobrar(cru).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * A Kick escreve `start_time` sem fuso ("2026-10-06 07:29:00"). É UTC — a
 * mesma regra de `vodsDoCanal`, medida lá contra o PROGRAM-DATE-TIME do
 * próprio vídeo. Se um dia vier com fuso, respeita-se o fuso.
 */
function instanteUtc(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return DESCONHECIDO;
  const t = texto.trim().replace(' ', 'T');
  const ms = Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t}Z`);
  return Number.isFinite(ms) ? ms : DESCONHECIDO;
}

/** Um erro com nome e o que já se tinha encontrado, como `SEM-CLIPE` em kick.js. */
function semLista(estado, pagina, parcial, detalhe) {
  return Object.assign(new Error(`lista ao vivo: ${estado} na página ${pagina}${detalhe ? ` (${detalhe})` : ''}`), {
    name: 'SEM-LISTA-AO-VIVO', estado, pagina, parcial,
  });
}

/**
 * Quem está ao vivo agora numa categoria, filtrado por palavras do título.
 *
 * É a porta para o evento quando ninguém tem a lista de participantes: no
 * dia, os 500 põem o nome do evento no título, e isto encontra-os.
 *
 * O endereço não é oficial. Medido em 06/10/2026:
 *   - devolve `{ current_page, data: [...], next_page_url }`, cada item com
 *     `session_title`, `viewer_count`, `language` ("Spanish", o nome e não o
 *     código), `start_time`, `tags` e `channel.slug`. Atenção que o item TAMBÉM
 *     tem um `slug` — é o da emissão ("481e6a45b3c2feb5-volvimos-…"), não o do
 *     canal. Usar esse dava 500 canais que não existem.
 *   - `limit=100` é ignorado acima de 32 por página. Os 500 do evento são
 *     umas 16 páginas; `maxPaginas = 30` cobre perto de mil.
 *   - `next_page_url` vem SEM o filtro (".../en?page=2"): segui-lo à letra
 *     trazia a Kick inteira a partir da segunda página. Por isso o endereço
 *     de cada página é feito aqui e o `next_page_url` só diz se há mais.
 *
 * Todas as palavras têm de aparecer (no título ou nas etiquetas), sem ligar a
 * maiúsculas nem acentos. Sem palavras, vêm todos. Um canal aparece uma vez
 * só: a lista vem por espectadores e mexe enquanto se pagina, e o mesmo canal
 * pode saltar de uma página para a seguinte.
 *
 * Uma página que falha atira `SEM-LISTA-AO-VIVO` com `estado`, `pagina` e o
 * `parcial` já encontrado. Devolver só o parcial calado era mentir: "estes
 * são os participantes" quando são só os das primeiras páginas, e quem falta
 * nunca seria procurado.
 */
export async function procurarAoVivo({
  palavras, subcategoria = 'rust', buscar = fetch, maxPaginas = 30, sinal,
} = {}) {
  const procurar = palavrasDe(palavras);
  const ultima = Math.max(1, Math.floor(Number(maxPaginas)) || 1);
  const vistos = new Set();
  const achados = [];

  for (let pagina = 1; pagina <= ultima; pagina++) {
    if (sinal?.aborted) throw cancelado();
    const q = new URLSearchParams({ page: String(pagina), limit: '100' });
    // Sem subcategoria, a Kick inteira — para um evento que começa em "Just
    // Chatting" antes de entrar no servidor.
    if (subcategoria) q.set('subcategory', String(subcategoria));
    q.set('sort', 'desc');

    let r;
    try {
      r = await buscar(`${AO_VIVO}?${q}`, { signal: sinal });
    } catch (e) {
      if (sinal?.aborted) throw cancelado();
      throw semLista('sem-rede', pagina, achados, e?.message);
    }
    if (r.status === 429) throw semLista('rate-limit', pagina, achados);
    if (!r.ok) throw semLista(`http-${r.status}`, pagina, achados);
    let j;
    try { j = await r.json(); } catch {
      if (sinal?.aborted) throw cancelado();
      throw semLista('resposta-ilegivel', pagina, achados);
    }
    const dados = j?.data;
    if (!Array.isArray(dados)) throw semLista('formato-inesperado', pagina, achados);

    for (const d of dados) {
      const slug = typeof d?.channel?.slug === 'string' ? d.channel.slug.trim().toLowerCase() : '';
      if (!slug || vistos.has(slug)) continue;
      const etiquetas = Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : [];
      // Título e etiquetas num só texto, colado: uma palavra pode estar num e
      // outra noutra ("rust" na etiqueta, "kick off" no título).
      const onde = dobrar([d.session_title, ...etiquetas].join(' ')).replace(/[^\p{L}\p{N}]+/gu, '');
      if (!procurar.every((p) => onde.includes(p))) continue;
      vistos.add(slug);
      achados.push({
        slug,
        titulo: typeof d.session_title === 'string' ? d.session_title : DESCONHECIDO,
        espectadores: Number.isFinite(d.viewer_count) ? d.viewer_count : DESCONHECIDO,
        idioma: typeof d.language === 'string' ? d.language : DESCONHECIDO,
        inicioMs: instanteUtc(d.start_time),
      });
    }
    if (!dados.length || !j.next_page_url) break;
  }
  if (sinal?.aborted) throw cancelado();
  return achados;
}
