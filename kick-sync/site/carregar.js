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
  // Quantos canais estão agora a cumprir a espera de um 429. Enquanto houver
  // um, não sai pedido nenhum (ver "a pausa", abaixo).
  let pausas = 0;

  const andar = () => {
    while (!parar && !pausas && emVoo < limite && fila.length) { emVoo++; fila.shift()(); }
  };
  const vez = (primeiro) => {
    // Quem volta a tentar passa à frente: já esperou o castigo dele, e se
    // fosse para o fim de 500 só se sabia dele no fim da carga.
    const p = new Promise((ok) => { if (primeiro) fila.unshift(ok); else fila.push(ok); });
    // Só depois de quem pediu estar à espera desta promessa. Soltá-la já aqui
    // punha-a atrás dos outros soltos na mesma volta, e o primeiro da fila
    // saía depois deles.
    queueMicrotask(andar);
    return p;
  };
  const libertar = () => { emVoo--; andar(); };

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
  // volta, não um por pacote perdido.) Um 429 atrasado de antes do corte
  // não corta, mas pára toda a gente como qualquer outro.
  let geracao = 0;

  // ── a pausa ───────────────────────────────────────────────────────────────
  // Um 429 é a Kick a pedir calma a TODOS, não só a este canal. Se o lugar do
  // canal castigado fosse logo para outro, o ritmo só caía para metade e nunca
  // parava, justamente quando a Kick pedia menos: com o limite a durar, cada
  // canal gastava as tentativas todas (100 canais, 400 pedidos). Por isso a
  // espera depois de um 429 vale para a carga inteira. Um 503 ou uma falha de
  // rede são desse canal, e esses esperam sozinhos.
  //
  // E se a Kick está fechada, não se insiste: quando um canal sobe a escada
  // toda só com 429 e nesse tempo outros também levaram 429 e ninguém teve
  // outra resposta, o resto fica 'rate-limit' sem se pedir. Um canal sozinho
  // a levar 429 não prova nada sobre os outros, por isso esse não fecha.
  let recusas = 0;
  let outras = 0;
  let fechada = false;

  const abortado = quandoCancelar(sinal);
  // O sinal vai até ao fetch, para um pedido a meio ser largado de facto e
  // não só ignorado quando chegar.
  const buscarComSinal = sinal ? (url, op) => buscar(url, { ...op, signal: sinal }) : buscar;

  async function umCanal(chave) {
    let antes = null;
    for (let feitas = 0; ; feitas++) {
      await vez(feitas > 0);
      if (parar || sinal?.aborted) { libertar(); throw cancelado(); }
      if (fechada) { libertar(); return { slug: chave, estado: 'rate-limit', vods: [] }; }
      const minhaGeracao = geracao;
      let r;
      try {
        r = await vodsDoCanal(chave, { buscar: buscarComSinal });
        // ANTES de libertar o lugar: se fosse depois, o lugar livre ia já para
        // o próximo da fila com o limite antigo, e o corte chegava atrasado.
        if (r.estado === 'rate-limit') {
          recusas++;
          if (minhaGeracao === geracao) {
            limite = Math.max(piso, Math.floor(limite / 2));
            geracao++;
          }
        } else {
          outras++;
        }
      } finally {
        libertar();
      }
      // Um fetch largado pelo sinal volta como 'sem-rede', que é transitório e
      // seria tentado outra vez. Não pode: a pessoa mandou parar.
      if (sinal?.aborted || parar) throw cancelado();
      const de429 = r.estado === 'rate-limit';
      if (de429 && !antes) antes = { recusas: recusas - 1, outras: outras };
      if (!transitorio(r.estado) || feitas >= tentativas) {
        if (de429 && antes && outras === antes.outras && recusas - antes.recusas > feitas + 1) fechada = true;
        return r;
      }
      // A espera não precisa de correr contra o sinal aqui dentro: quem
      // chamou já recebeu o AbortError pela corrida lá de baixo, e quando
      // esta espera acabar o canal dá com o `parar` antes de pedir o que seja.
      if (de429) pausas++;
      try {
        await esperar(1000 * 2 ** feitas);
      } finally {
        if (de429) pausas--;
      }
    }
  }

  let feitos = 0;
  const trabalho = Promise.all(unicos.map((chave) => umCanal(chave).then((r) => {
    // Depois de a carga ter rejeitado (o aoProgredir rebentou, por exemplo),
    // a página já mostrou o erro: não pode voltar a ver progresso.
    if (parar) throw cancelado();
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
 * Texto pronto a comparar: sem acentos e com as letras próprias dobradas. As
 * maiúsculas ficam: `partes` precisa delas para ver onde começa cada palavra
 * de um "#RustKickOff". Quem compara baixa-as depois.
 *
 * NFKD e não só NFD. A NFD tira os acentos; a K também desfaz as letras
 * "estilizadas". Medido em 06/10/2026 sobre 295 títulos ao vivo: 16 mudam
 * entre uma e outra, e entre eles "ᵒˡᵃᵇⁱˡⁱʳ" (letras em expoente) e
 * "³⁰⁰gang". Quem procura escreve com o teclado normal, e com a NFD esses
 * títulos eram invisíveis.
 */
function dobrar(texto) {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ıłøđßŁØĐ]/g, (c) => {
      const d = DOBRAS[c.toLowerCase()];
      return c === c.toLowerCase() ? d : d.toUpperCase();
    });
}

/**
 * As partes de um campo (o título, ou uma etiqueta), em minúsculas.
 *
 * Parte-se em tudo o que não é letra nem número, onde uma minúscula passa a
 * maiúscula ("RustKickOff" dá rust, kick, off) e onde uma letra passa a número
 * ("Off2" dá off, 2). Uma palavra procurada tem de ser uma ou mais partes
 * SEGUIDAS do mesmo campo: assim "kickoff" encontra "Kick-Off" e "#RustKickOff",
 * mas "rust" não encontra "Trust", "off" não encontra "Office", "2" não
 * encontra "2026", e o fim do título não se cola ao começo de uma etiqueta.
 * (Antes o texto ia todo colado, e uma palavra curta do evento como "dia"
 * puxava para a lista quem tinha "India" no título.)
 */
function partes(campo) {
  return dobrar(campo)
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{L})(\p{N})|(\p{N})(\p{L})/gu, (_, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function palavrasDe(palavras) {
  const cru = Array.isArray(palavras) ? palavras.join(' ') : String(palavras ?? '');
  return dobrar(cru).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Todos os textos que se podem formar colando partes seguidas de um campo.
 * Um título tem poucas dezenas de partes, por isso isto são umas centenas de
 * textos curtos, o que não pesa nem com 30 páginas.
 */
function pedacosDe(campos) {
  const pedacos = new Set();
  for (const campo of campos) {
    const p = partes(campo);
    for (let i = 0; i < p.length; i++) {
      let colado = '';
      for (let j = i; j < p.length && j < i + 12; j++) { colado += p[j]; pedacos.add(colado); }
    }
  }
  return pedacos;
}

/**
 * Cada palavra procurada tem de aparecer. Palavras seguidas da busca também
 * podem aparecer coladas: "kick off" encontra a etiqueta "kickoff".
 */
function bate(procurar, pedacos) {
  const coberta = procurar.map(() => false);
  for (let i = 0; i < procurar.length; i++) {
    let colado = '';
    for (let j = i; j < procurar.length; j++) {
      colado += procurar[j];
      if (pedacos.has(colado)) for (let k = i; k <= j; k++) coberta[k] = true;
    }
  }
  return coberta.every(Boolean);
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
 * Uma falha passageira (429, 5xx, rede) volta a ser pedida, à espera de 1 s,
 * 2 s e 4 s, como em `carregarCanais`: um soluço na página 12 de 16 não pode
 * deitar fora a busca toda. Uma página que falha mesmo atira
 * `SEM-LISTA-AO-VIVO` com `estado`, `pagina` e o `parcial` já encontrado.
 * Devolver só o parcial calado era mentir: "estes são os participantes"
 * quando são só os das primeiras páginas, e quem falta nunca seria procurado.
 *
 * Pela mesma razão, a lista devolvida leva `incompleto: true` quando parou em
 * `maxPaginas` com a Kick a dizer que ainda havia mais. Com 32 por página, 30
 * páginas são os mil mais vistos, e numa categoria cheia os participantes com
 * poucos espectadores ficavam de fora sem ninguém saber.
 *
 * `sinal` cancela logo, mesmo que a `buscar` não largue o pedido, e mesmo a
 * meio de uma espera.
 */
export async function procurarAoVivo({
  palavras, subcategoria = 'rust', buscar = fetch, maxPaginas = 30, sinal,
  tentativas = 3, esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)),
} = {}) {
  // Um 0 não quer dizer "uma página": é um erro de quem chama, e dizê-lo já é
  // melhor do que pedir o que ninguém pediu.
  if (!Number.isInteger(maxPaginas) || maxPaginas < 1) {
    throw new RangeError(`maxPaginas tem de ser um inteiro >= 1 (veio ${maxPaginas})`);
  }
  if (!Number.isInteger(tentativas) || tentativas < 0) {
    throw new RangeError(`tentativas tem de ser um inteiro >= 0 (veio ${tentativas})`);
  }
  const procurar = palavrasDe(palavras);
  const vistos = new Set();
  const achados = [];
  let incompleto = false;
  const abortado = quandoCancelar(sinal);
  // O que estiver à espera corre contra o cancelamento, como em carregarCanais.
  const ouCancelar = (p) => (sinal ? Promise.race([p, abortado.promessa]) : p);

  /** Uma página, já lida, ou { estado, detalhe } quando falhou. */
  async function umaPagina(pagina) {
    const q = new URLSearchParams({ page: String(pagina), limit: '100' });
    // Sem subcategoria, a Kick inteira — para um evento que começa em "Just
    // Chatting" antes de entrar no servidor.
    if (subcategoria) q.set('subcategory', String(subcategoria));
    q.set('sort', 'desc');
    let r;
    try {
      r = await ouCancelar(buscar(`${AO_VIVO}?${q}`, { signal: sinal }));
    } catch (e) {
      if (sinal?.aborted) throw cancelado();
      return { estado: 'sem-rede', detalhe: e?.message };
    }
    if (r.status === 429) return { estado: 'rate-limit' };
    if (!r.ok) return { estado: `http-${r.status}` };
    try {
      return { j: await ouCancelar(r.json()) };
    } catch {
      if (sinal?.aborted) throw cancelado();
      return { estado: 'resposta-ilegivel' };
    }
  }

  try {
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      if (sinal?.aborted) throw cancelado();
      let lida;
      for (let feitas = 0; ; feitas++) {
        lida = await umaPagina(pagina);
        if (lida.j !== undefined || !transitorio(lida.estado) || feitas >= tentativas) break;
        await ouCancelar(esperar(1000 * 2 ** feitas));
        if (sinal?.aborted) throw cancelado();
      }
      if (lida.j === undefined) throw semLista(lida.estado, pagina, achados, lida.detalhe);
      const { j } = lida;
      const dados = j?.data;
      if (!Array.isArray(dados)) throw semLista('formato-inesperado', pagina, achados);

      for (const d of dados) {
        const slug = typeof d?.channel?.slug === 'string' ? d.channel.slug.trim().toLowerCase() : '';
        if (!slug || vistos.has(slug)) continue;
        const etiquetas = Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : [];
        // Cada campo à parte: uma palavra pode estar num e outra noutra ("rust"
        // na etiqueta, "kick off" no título), mas uma palavra não se forma
        // com o fim de um e o começo do outro.
        if (procurar.length && !bate(procurar, pedacosDe([d.session_title, ...etiquetas]))) continue;
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
      if (pagina === maxPaginas) incompleto = true;
    }
  } finally {
    abortado.largar();
  }
  if (sinal?.aborted) throw cancelado();
  return Object.assign(achados, { incompleto });
}
