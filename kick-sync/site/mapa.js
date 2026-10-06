// O mapa do evento: quinhentos canais numa linha do tempo só, uma faixa por
// canal, agrupados por time, a rolar na vertical.
//
// É um canvas do tamanho do ecrã, e não uma lista de elementos, porque 500
// faixas com barras e marcas em DOM são milhares de nós que o browser volta a
// medir a cada rolagem — e quase todos estão fora do ecrã. Aqui só se calcula
// e só se pinta o que se vê: umas trinta faixas, quer o evento tenha 50 canais
// quer tenha 500. Isso não fica só dito: há um teste que pinta os dois e conta
// as chamadas ao canvas, e têm de ser as mesmas.
//
// Tudo o que é conta (onde fica cada faixa, que instante está debaixo do rato,
// o que a procura deixa ver) vive em funções sem DOM, porque é aí que os
// enganos moram — a última faixa cortada a meio, o time que fica sem
// cabeçalho, o nome com acento que a procura não acha — e isso testa-se em
// node sem browser nenhum. `pintarMapa` é a única que toca no canvas, e só
// usa o básico da API 2D, para que um contexto falso a possa gravar inteira.

/**
 * A altura de cada tipo de linha, em px de CSS.
 *
 * Vinte px chegam para um nome a 11 px por cima de uma barra de 12, e é a
 * densidade que deixa ver uns trinta canais de uma vez num portátil. O
 * cabeçalho é mais alto de propósito: é ele que se carrega para abrir e
 * fechar o time, e um alvo do tamanho de uma faixa falha-se.
 */
export const ALTURAS = Object.freeze({ time: 24, canal: 20, resumo: 20 });

/**
 * O mais perto que o zoom deixa chegar.
 *
 * As coberturas vêm do `start_time` da API, que o kick.js mediu a 2,6-4,5 s
 * do relógio do próprio vídeo, e entre canais o alinhar.js mediu até 5,7 s
 * num evento real. Com 30 s no ecrã inteiro, um lance ainda se vê com o antes
 * e o depois; mais perto do que isto, a linha mostraria uma precisão que o
 * mapa não tem.
 */
export const ZOOM_MINIMO_MS = 30_000;

/**
 * As cores de omissão: as mesmas do tokens.css (--sup-0, --sup-1, --sup-2,
 * --linha, --tinta, --tinta-2, --acento, --marca, --perigo, --acento-eco).
 *
 * A página passa as do tema; estas servem para o mapa ter a cara do resto
 * quando ninguém passa nada (um teste, uma página sem o CSS), em vez de sair
 * preto sobre preto.
 */
export const CORES = Object.freeze({
  fundo: '#131211',
  faixa: '#191817',
  time: '#1F1E1C',
  linha: '#302D2A',
  texto: '#F3F0EA',
  texto2: '#B4AEA4',
  cobertura: '#2FB3C4',
  marca: '#E4A13A',
  // O nome de um canal que não existe na Kick: o mesmo vermelho dos avisos.
  perigo: '#EE7068',
  // O fundo da faixa escolhida, por cima do da faixa. Meio transparente, para
  // ser o mesmo realce em qualquer tema.
  escolha: '#2fb3c424',
  // A cabeça é branca e não âmbar: o âmbar já são as marcas, e no clipe.js a
  // cabeça é "a barra branca que diz onde está o vídeo". A mesma coisa tem de
  // ter a mesma cor nos dois sítios.
  cabeca: '#F3F0EA',
});

const LETRA = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";

// ── leitura ─────────────────────────────────────────────────────────────────

/**
 * Um `Map` ou um objecto simples (o que vem de um JSON), lidos da mesma
 * maneira.
 *
 * `Object.hasOwn` e não `objecto[slug]`: `constructor` passa na regra de
 * nomes da Kick (/^[a-z0-9_.-]{1,60}$/), e num objecto simples
 * `objecto.constructor` é a função Object. Hoje quem lê a seguir só aceita
 * listas e isso cai fora por acaso; a leitura não pode depender de quem vem
 * depois se lembrar disso.
 */
function leitor(colecao) {
  if (colecao instanceof Map) return (slug) => colecao.get(slug);
  if (colecao && typeof colecao === 'object') {
    return (slug) => (Object.hasOwn(colecao, slug) ? colecao[slug] : undefined);
  }
  return () => undefined;
}

/**
 * Intervalos limpos: só os que têm duas pontas a sério, por ordem, e os que
 * se tocam ou se sobrepõem juntos num só.
 *
 * Juntar não é cosmética. Dois VODs seguidos (o streamer caiu e voltou no
 * mesmo minuto) são, para o mapa, o mesmo "estava no ar", e as procuras
 * binárias de baixo só estão certas sobre intervalos que não se cruzam.
 */
function intervalos(lista) {
  if (!Array.isArray(lista)) return [];
  const bons = [];
  for (const par of lista) {
    const de = par?.[0];
    const ate = par?.[1];
    // `Number.isFinite` não converte: um `null` não passa a ser 1970.
    if (Number.isFinite(de) && Number.isFinite(ate) && ate > de) bons.push([de, ate]);
  }
  bons.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const juntos = [];
  for (const [de, ate] of bons) {
    const ultimo = juntos.at(-1);
    if (ultimo && de <= ultimo[1]) {
      if (ate > ultimo[1]) ultimo[1] = ate;
    } else {
      juntos.push([de, ate]);
    }
  }
  return juntos;
}

/**
 * Quantos canais do time estavam no ar, troço a troço: [[de, ate, quantos]].
 *
 * Num time fechado, a união diz só "alguém estava ligado". Quantos é o que
 * deixa adivinhar o raide: um time de quatro ataca quando os quatro estão no
 * ar, e é aí que um lance tem vários ângulos (inferência, não medição — mas é
 * o caso que o produto existe para apanhar).
 */
function densidadeDe(listas) {
  const pontos = [];
  for (const lista of listas) for (const [de, ate] of lista) pontos.push([de, 1], [ate, -1]);
  pontos.sort((a, b) => a[0] - b[0]);
  const saida = [];
  let n = 0;
  let desde = 0;
  let i = 0;
  while (i < pontos.length) {
    const t = pontos[i][0];
    if (n > 0 && t > desde) {
      const anterior = saida.at(-1);
      if (anterior && anterior[2] === n && anterior[1] === desde) anterior[1] = t;
      else saida.push([desde, t, n]);
    }
    // Todas as mudanças do mesmo instante entram de uma vez, antes de abrir o
    // troço seguinte: um canal que acaba quando outro começa não são dois no
    // ar ao mesmo tempo, nem por um troço de largura zero.
    while (i < pontos.length && pontos[i][0] === t) n += pontos[i++][1];
    desde = t;
  }
  return saida;
}

/** O índice do último intervalo que começa em `ms` ou antes; -1 se nenhum. */
function ultimoAte(lista, ms, ponta = (x) => x[0]) {
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (ponta(lista[meio]) <= ms) lo = meio + 1;
    else hi = meio;
  }
  return lo - 1;
}

/** Se `ms` cai dentro de algum intervalo. Pontas incluídas, como no `noArEm`. */
function cobre(lista, ms) {
  const i = ultimoAte(lista, ms);
  return i >= 0 && ms <= lista[i][1];
}

// ── o mapa ──────────────────────────────────────────────────────────────────

/**
 * As linhas do mapa, de cima para baixo, com a posição de cada uma.
 *
 * `times` é [{ nome, canais: [slug] }]; os canais sem time chegam num time
 * com `nome: null` e vão SEMPRE para o fim, num grupo só, mesmo que venham
 * em vários bocados ou à cabeça. Primeiro procura-se quem tem time; quem não
 * tem é o resto.
 *
 * Um time aberto dá o cabeçalho e uma faixa por canal; fechado dá o
 * cabeçalho e UMA faixa de resumo. Com 125 times de quatro, abertos são 500
 * faixas e fechados são 250 linhas — e é fechado que se encontra o time.
 *
 * Cada linha: { tipo: 'time'|'canal'|'resumo', time, canal, y, altura,
 * coberturas }. O cabeçalho e o resumo levam também `canais` (os do time) e a
 * união das coberturas; o cabeçalho leva `aberto`, o resumo leva `densidade`.
 *
 * `inicioMs`/`fimMs` são as pontas de tudo o que está no mapa, ou `null`
 * quando ninguém tem vídeo: um início inventado punha a linha em 1970.
 *
 * `alturas` muda a altura de cada tipo de linha (as de omissão são
 * `ALTURAS`); um valor que não é um número positivo fica na de omissão.
 */
export function montarMapa({ times, coberturas, abertos, alturas } = {}) {
  const A = { ...ALTURAS };
  // `Number.isFinite` e não `> 0` sozinho: '30' > 0 é verdade, e a seguir
  // `y += '30'` cola texto em vez de somar, e o mapa inteiro fica em NaN.
  for (const k of Object.keys(A)) if (Number.isFinite(alturas?.[k]) && alturas[k] > 0) A[k] = alturas[k];

  const lerCobertura = leitor(coberturas);
  const limpas = new Map();
  const coberturaDe = (slug) => {
    if (!limpas.has(slug)) limpas.set(slug, intervalos(lerCobertura(slug)));
    return limpas.get(slug);
  };
  const estaAberto = abertos instanceof Set ? (n) => abertos.has(n)
    : Array.isArray(abertos) ? (n) => abertos.includes(n)
      : () => false;

  const grupos = [];
  const soltos = [];
  for (const t of Array.isArray(times) ? times : []) {
    if (!t) continue;
    const canais = Array.isArray(t.canais) ? t.canais.filter((c) => typeof c === 'string' && c) : [];
    if (t.nome == null) soltos.push(...canais);
    else grupos.push({ nome: t.nome, canais });
  }
  // Um grupo "Sem time" vazio é um cabeçalho a dizer que não há nada.
  if (soltos.length) grupos.push({ nome: null, canais: soltos });

  const linhas = [];
  const cabecalhos = [];
  let y = 0;
  let inicioMs = Infinity;
  let fimMs = -Infinity;
  for (const g of grupos) {
    // Um canal repetido dentro do time seria a mesma faixa duas vezes.
    const canais = [...new Set(g.canais)];
    const listas = canais.map(coberturaDe);
    const uniao = intervalos(listas.flat());
    if (uniao.length) {
      inicioMs = Math.min(inicioMs, uniao[0][0]);
      fimMs = Math.max(fimMs, uniao.at(-1)[1]);
    }
    const aberto = estaAberto(g.nome);
    cabecalhos.push(linhas.length);
    linhas.push({
      tipo: 'time', time: g.nome, canal: null, y, altura: A.time, coberturas: uniao, canais, aberto,
    });
    y += A.time;
    if (aberto) {
      canais.forEach((canal, i) => {
        linhas.push({ tipo: 'canal', time: g.nome, canal, y, altura: A.canal, coberturas: listas[i] });
        y += A.canal;
      });
    } else {
      linhas.push({
        tipo: 'resumo', time: g.nome, canal: null, y, altura: A.resumo, coberturas: uniao, canais,
        densidade: densidadeDe(listas),
      });
      y += A.resumo;
    }
  }

  return {
    linhas,
    // Os índices das linhas de cabeçalho, por ordem. É o que deixa saber de
    // que time é a faixa no topo do ecrã sem andar para trás linha a linha.
    cabecalhos,
    altura: y,
    inicioMs: Number.isFinite(inicioMs) ? inicioMs : null,
    fimMs: Number.isFinite(fimMs) ? fimMs : null,
  };
}

/** A primeira linha cujo fundo passa de `yc` (a que contém `yc`, se houver). */
function primeiraAbaixo(linhas, yc) {
  let lo = 0;
  let hi = linhas.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (linhas[meio].y + linhas[meio].altura <= yc) lo = meio + 1;
    else hi = meio;
  }
  return lo;
}

/**
 * As linhas que se vêem numa janela de `altura` px a começar em `topo`.
 *
 * Procura binária em `y`, porque isto corre a cada evento de rolagem e de
 * rato: percorrer 625 linhas sessenta vezes por segundo para achar trinta é
 * trabalho deitado fora. O teste pede 10 000 chamadas sobre 500 canais em
 * menos de 200 ms.
 *
 * Meio aberto: uma linha que acaba exactamente no `topo`, ou que começa
 * exactamente no fundo, não se vê, e por isso não se pinta.
 */
export function linhasVisiveis(mapa, { topo = 0, altura = 0 } = {}) {
  const linhas = mapa?.linhas;
  if (!Array.isArray(linhas) || !linhas.length) return [];
  if (!Number.isFinite(topo) || !(altura > 0)) return [];
  const de = primeiraAbaixo(linhas, topo);
  const fundo = topo + altura;
  let lo = de;
  let hi = linhas.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (linhas[meio].y < fundo) lo = meio + 1;
    else hi = meio;
  }
  return linhas.slice(de, lo);
}

/** O índice da linha que contém `yc`, ou -1. */
function indiceEm(linhas, yc) {
  const i = primeiraAbaixo(linhas, yc);
  return i < linhas.length && linhas[i].y <= yc ? i : -1;
}

/** Os cabeçalhos do mapa; refeitos se o mapa não veio do `montarMapa`. */
function cabecalhosDe(mapa) {
  if (Array.isArray(mapa.cabecalhos)) return mapa.cabecalhos;
  const saida = [];
  mapa.linhas.forEach((l, i) => { if (l.tipo === 'time') saida.push(i); });
  return saida;
}

/**
 * O cabeçalho que fica preso no topo do ecrã, ou `null`.
 *
 * A meio do grupo "Sem time" (que leva os 500 quando o elenco veio de uma
 * lista solta), ou já no terceiro canal de um time aberto, o cabeçalho subiu
 * e a faixa "tchubi" sozinha não diz de que lado está — que é a pergunta
 * toda num lance de ataque e defesa. Por isso o
 * cabeçalho do time que está no topo fica lá, por cima das faixas.
 *
 * Não fica quando o cabeçalho do time seguinte já está ao alcance: os dois
 * sobrepunham-se, e o seguinte já se lê no sítio dele.
 *
 * Isto é usado por `pintarMapa` e por `oQueEstaAqui`, e é por ser a MESMA
 * conta que o que se vê é o que se clica.
 */
function cabecalhoPreso(mapa, topo) {
  const linhas = mapa?.linhas;
  if (!Array.isArray(linhas) || !linhas.length || !(topo > 0)) return null;
  const i = primeiraAbaixo(linhas, topo);
  if (i >= linhas.length) return null;
  const cabs = cabecalhosDe(mapa);
  const k = ultimoAte(cabs, i, (x) => x);
  if (k < 0) return null;
  const cab = linhas[cabs[k]];
  if (cab.y >= topo) return null;
  const seguinte = linhas[cabs[k + 1]];
  if (seguinte && seguinte.y - topo < cab.altura) return null;
  return cab;
}

// ── tempo <-> px ────────────────────────────────────────────────────────────

/** A conta do eixo do tempo, ou `null` quando não há eixo que se possa fazer. */
function escala(vista, largura) {
  const de = vista?.deMs;
  const ate = vista?.ateMs;
  if (!Number.isFinite(de) || !Number.isFinite(ate) || !(ate > de)) return null;
  if (!Number.isFinite(largura) || !(largura > 0)) return null;
  return { de, ate, span: ate - de, largura };
}

/**
 * Onde fica um instante, em px a contar da esquerda do mapa.
 *
 * Sem limites de propósito: um instante fora da vista dá um x fora do ecrã,
 * e quem pinta é que decide cortar. `null` quando a vista não é uma vista
 * (sem pontas, ou ao contrário): um NaN espalhava-se pela página calado.
 */
export function xDoTempo(ms, vista, largura) {
  const e = escala(vista, largura);
  if (!e || !Number.isFinite(ms)) return null;
  return ((ms - e.de) / e.span) * e.largura;
}

/** O inverso: que instante está a `x` px da esquerda. */
export function tempoDoX(x, vista, largura) {
  const e = escala(vista, largura);
  if (!e || !Number.isFinite(x)) return null;
  return e.de + (x / e.largura) * e.span;
}

/**
 * As pontas de um intervalo, venham com que nome vierem.
 *
 * O mesmo par chega aqui com três nomes: a vista ({deMs, ateMs}), o próprio
 * mapa ({inicioMs, fimMs}) e a janela do relogio.js ({inicio, fim}). Aceitar
 * os três aqui custa uma linha; três conversões espalhadas pela página são
 * três sítios para trocar o início pelo fim.
 */
function pontas(l) {
  const de = l?.deMs ?? l?.inicioMs ?? l?.inicio;
  const ate = l?.ateMs ?? l?.fimMs ?? l?.fim;
  return Number.isFinite(de) && Number.isFinite(ate) && ate > de ? { de, ate } : null;
}

/**
 * Aproximar (`fator` < 1) ou afastar (`fator` > 1) à volta de `centroMs`.
 *
 * O centro é o ponto que NÃO se mexe: o instante que estava debaixo do rato
 * continua debaixo do rato. É o que fazem os editores de vídeo e os mapas, e
 * é o que deixa aproximar um lance com a roda sem o perder de vista —
 * recentrar no rato fazia a vista saltar a cada passo da roda.
 *
 * Se o centro está FORA da vista (escolheu-se um lance, rolou-se para longe,
 * e carrega-se em "aproximar"), mantê-lo fixo seria aproximar uma coisa que
 * não se vê. Aí a vista centra-se nele.
 *
 * Depois disso, presa: nunca menos de 30 s (`ZOOM_MINIMO_MS`), nunca mais
 * larga do que `limites`, e nunca fora deles — empurrada para dentro em vez
 * de encolhida, para o zoom pedido ser o zoom que se tem. Um evento mais
 * curto do que 30 s mostra-se inteiro: dentro dos limites ganha ao mínimo,
 * porque fora deles não há vídeo de ninguém.
 *
 * Um `fator` que não é um número positivo não mexe no zoom, mas a vista sai
 * presa na mesma; `zoom(vista, c, 1, limites)` serve para endireitar uma vista.
 */
export function zoom(vista, centroMs, fator, limites) {
  const lim = pontas(limites);
  const atual = pontas(vista);
  if (!atual) return lim ? { deMs: lim.de, ateMs: lim.ate } : vista;

  const span0 = atual.ate - atual.de;
  let span = Number.isFinite(fator) && fator > 0 ? span0 * fator : span0;
  span = Math.max(span, ZOOM_MINIMO_MS);
  if (lim) span = Math.min(span, lim.ate - lim.de);

  const c = Number.isFinite(centroMs) ? centroMs : (atual.de + atual.ate) / 2;
  let de = c >= atual.de && c <= atual.ate
    // A razão é a que ficou DEPOIS de prender, e não o `fator`: assim o
    // centro continua fixo mesmo quando o mínimo de 30 s cortou o pedido.
    ? c - (c - atual.de) * (span / span0)
    : c - span / 2;

  if (lim) {
    if (de < lim.de) de = lim.de;
    if (de + span > lim.ate) de = lim.ate - span;
  }
  return { deMs: de, ateMs: de + span };
}

// ── procurar ────────────────────────────────────────────────────────────────

const DOBRAS = { 'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ß': 'ss' };

/**
 * Texto pronto a comparar: sem maiúsculas e sem acentos.
 *
 * A mesma dobra que a procura ao vivo do carregar.js faz aos títulos (NFKD,
 * e as letras que a NFKD não desfaz), para que um nome que se acha lá se ache
 * aqui escrito da mesma maneira. NFKD e não NFD: a K desfaz também as letras
 * "estilizadas" que aparecem em nomes de time (𝐓𝐞𝐚𝐦, Ｔｅａｍ, ³⁰⁰ — os três
 * verificados no teste). As versaletas (ᴛᴇᴀᴍ) não têm decomposição no
 * Unicode e continuam a não bater; não há dobra que as apanhe sem uma tabela
 * escrita à mão.
 */
function dobrar(texto) {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ıłøđß]/g, (c) => DOBRAS[c]);
}

const colado = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Os times que batem com o que se escreveu na caixa de procura.
 *
 * Se o NOME do time bate, o time vem inteiro: quem escreve "Fúria" quer ver
 * a Fúria toda, não só os canais que por acaso têm "furia" no nome. Se não,
 * vêm só os canais que batem, dentro do time deles — o time fica como
 * cabeçalho, porque saber de que lado o streamer está é metade da resposta.
 *
 * Sem maiúsculas nem acentos dos dois lados, e também com os separadores
 * tirados: "tchubi rust" acha "tchubi_rust" e "kickoff" acha "Kick-Off".
 * Isso traz um ou outro falso positivo, que se vê na lista e se ignora; um
 * streamer que não aparece porque se escreveu um espaço onde ele tem um
 * traço é o erro caro.
 *
 * Nunca mexe no que recebe: devolve times novos.
 */
export function filtrar(times, texto) {
  const lista = Array.isArray(times) ? times.filter(Boolean) : [];
  const agulha = dobrar(texto).trim();
  const copia = (t, canais) => ({ ...t, canais });
  const soTexto = (t) => (Array.isArray(t.canais) ? t.canais.filter((c) => typeof c === 'string') : []);
  if (!agulha) return lista.map((t) => copia(t, soTexto(t)));
  const compacta = colado(agulha);
  const bate = (s) => {
    const d = dobrar(s);
    // Uma procura só de pontuação ("_") fica vazia depois de colada, e uma
    // agulha vazia está dentro de tudo. Aí só conta a comparação directa.
    return d.includes(agulha) || (compacta !== '' && colado(d).includes(compacta));
  };
  const saida = [];
  for (const t of lista) {
    const canais = soTexto(t);
    if (t.nome != null && bate(t.nome)) {
      saida.push(copia(t, canais));
      continue;
    }
    const achados = canais.filter(bate);
    if (achados.length) saida.push(copia(t, achados));
  }
  return saida;
}

// ── apontar ─────────────────────────────────────────────────────────────────

/**
 * As marcas de uma linha, como [[canal, marcas], ...]: as do canal, ou as de
 * todos os canais do time num resumo — um time fechado continua a mostrar
 * onde houve luta, que é o que faz querer abri-lo.
 *
 * As listas vêm tal como estão, sem cópia: isto corre a cada pintura, e mil
 * picos de chat por canal copiados trinta vezes por segundo são lixo para o
 * coletor por nada.
 */
function marcasDaLinha(linha, lerMarcas) {
  const canais = linha.tipo === 'canal' ? [linha.canal] : (linha.canais || []);
  const saida = [];
  for (const canal of canais) {
    const m = lerMarcas(canal);
    if (Array.isArray(m) && m.length) saida.push([canal, m]);
  }
  return saida;
}

/**
 * O que está debaixo do ponteiro: { tipo, time, canal, ms, noAr } ou `null`.
 *
 * `x` e `y` são relativos ao canto do mapa no ecrã, e `topo` é quanto já se
 * rolou — a mesma conta que `pintarMapa` faz, incluindo o cabeçalho preso no
 * topo, para que se clique no que se vê.
 *
 * `noAr` diz se aquele canal (ou alguém do time, num cabeçalho ou resumo)
 * tinha vídeo nesse instante; um clique num buraco não é um lance.
 *
 * Com `marcas`, um clique a menos de `raioPx` de uma marca vai à marca e
 * devolve-a em `marca`. Uma marca tem 2 px de largura; acertar-lhe a seco é
 * pedir pontaria a quem só quer ver o pico do chat.
 */
export function oQueEstaAqui(mapa, { x, y, topo = 0, vista, largura, marcas, raioPx = 6 } = {}) {
  const linhas = mapa?.linhas;
  if (!Array.isArray(linhas) || !linhas.length) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(largura > 0)) return null;
  if (x < 0 || x > largura || y < 0) return null;
  const t0 = Number.isFinite(topo) ? topo : 0;

  let linha;
  const preso = cabecalhoPreso(mapa, t0);
  if (preso && y < preso.altura) linha = preso;
  else {
    const i = indiceEm(linhas, t0 + y);
    if (i < 0) return null;
    linha = linhas[i];
  }

  let ms = tempoDoX(x, vista, largura);
  let marca = null;
  if (ms != null && marcas && linha.tipo !== 'time') {
    const ler = leitor(marcas);
    let melhor = Infinity;
    for (const [canal, lista] of marcasDaLinha(linha, ler)) {
      for (const m of lista) {
        const mx = xDoTempo(m?.ms, vista, largura);
        if (mx == null) continue;
        const d = Math.abs(mx - x);
        if (d <= raioPx && d < melhor) { melhor = d; marca = { ms: m.ms, tipo: m.tipo ?? null, canal }; }
      }
    }
    if (marca) ms = marca.ms;
  }

  const saida = {
    tipo: linha.tipo,
    time: linha.time,
    canal: linha.canal,
    ms: ms == null ? null : Math.round(ms),
    noAr: ms != null && cobre(linha.coberturas || [], ms),
  };
  if (marca) saida.marca = marca;
  return saida;
}

// ── pintar ──────────────────────────────────────────────────────────────────

/** As cores pedidas por cima das de omissão; um valor vazio não apaga nada. */
function coresDe(cores) {
  const c = { ...CORES };
  if (cores && typeof cores === 'object') {
    for (const [k, v] of Object.entries(cores)) {
      // `getPropertyValue` de uma variável que não existe dá '', e uma cor
      // vazia no canvas é ignorada em silêncio: ficava a cor ANTERIOR, que é
      // a de outra coisa qualquer.
      if (typeof v === 'string' && v.trim()) c[k] = v.trim();
      else if (k === 'marcas' && v && typeof v === 'object') c.marcas = v;
    }
  }
  return c;
}

/**
 * Corta um texto para caber em `max` letras, com reticências.
 *
 * Por letras e não por unidades de UTF-16: um nome de time com um emoji
 * cortado a meio do par deixava um "�" no ecrã.
 */
function cortar(texto, max) {
  const letras = Array.from(String(texto));
  if (max < 2) return '';
  return letras.length > max ? `${letras.slice(0, max - 1).join('')}…` : letras.join('');
}

/**
 * Um rótulo por cima da faixa, num fundo meio transparente.
 *
 * O eixo do tempo ocupa a largura toda (a régua por cima do mapa faz a mesma
 * conta com a largura toda), por isso o nome não tem coluna sua: vai por cima
 * do começo da faixa, e a barra continua a ver-se por baixo dele.
 *
 * A largura do texto é estimada pelo número de letras, e o canvas recebe-a
 * como `maxWidth`: um nome nunca passa da largura que lhe foi dada, mesmo
 * quando a estimativa falha numa letra larga. Só se pinta se a letra inteira
 * cabe na vertical — meio nome cortado pela beira do ecrã não se lê.
 */
function rotulo(ctx, texto, x, meio, {
  largura, altura, tam, peso = 400, cor, c, letra, sufixo = '', ate = Math.max(96, largura * 0.35),
}) {
  if (meio - tam / 2 < 0 || meio + tam / 2 > altura) return;
  const maximo = Math.min(largura - x - 4, ate);
  const porLetra = tam * 0.6;
  const cabem = Math.floor((maximo - 8) / porLetra);
  // O `sufixo` nunca se corta: num telemóvel, "Lobos do Nor… · 4" ainda diz
  // quantos são; "Lobos do Norte…" já não diz.
  const espaco = cabem - Array.from(sufixo).length;
  const s = espaco >= 2 ? cortar(texto, espaco) + sufixo : cortar(texto + sufixo, cabem);
  if (!s) return;
  const w = Math.min(maximo, Array.from(s).length * porLetra + 8);
  const alto = Math.min(altura, meio + tam / 2 + 2) - Math.max(0, meio - tam / 2 - 2);
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = c.fundo;
  ctx.fillRect(Math.max(0, x - 4), Math.max(0, meio - tam / 2 - 2), w, alto);
  ctx.restore();
  ctx.font = `${peso} ${tam}px ${letra}`;
  ctx.fillStyle = cor;
  ctx.fillText(s, x, meio, w - 4);
}

/** O cabeçalho de um time, em `ry` px do topo do ecrã. */
function pintarCabecalho(ctx, l, ry, o) {
  const { largura, altura, c } = o;
  const de = Math.max(0, ry);
  const ate = Math.min(altura, ry + l.altura);
  if (ate <= de) return;
  ctx.fillStyle = c.time;
  ctx.fillRect(0, de, largura, ate - de);
  // O fio por cima de cada time é o que separa um time do outro a olho,
  // sem ser preciso ler o nome.
  ctx.fillStyle = c.linha;
  if (ry >= 0 && ry < altura) ctx.fillRect(0, ry, largura, 1);
  if (ry + l.altura - 1 >= 0 && ry + l.altura - 1 < altura) ctx.fillRect(0, ry + l.altura - 1, largura, 1);
  const nome = l.time == null ? o.semTime : String(l.time);
  // A seta diz que se carrega ali, e o número diz quantos há lá dentro antes
  // de se abrir. Sem palavras, para não ter de passar pelos idiomas.
  rotulo(ctx, `${l.aberto ? '▾' : '▸'} ${nome}`, 8, ry + l.altura / 2, {
    // O cabeçalho não tem barras por baixo: o nome pode usar a linha toda.
    ...o, tam: 12, peso: 600, cor: c.texto, sufixo: ` · ${l.canais?.length ?? 0}`, ate: Infinity,
  });
}

/** As barras de um conjunto de intervalos, presas à vista e ao ecrã. */
function barras(ctx, lista, e, y0, y1, aoPintar) {
  for (const item of lista) {
    const [de, ate] = item;
    if (ate <= e.de || de >= e.ate) continue;
    const x0 = Math.max(0, ((de - e.de) / e.span) * e.largura);
    const x1 = Math.min(e.largura, ((ate - e.de) / e.span) * e.largura);
    // Um VOD curto num evento de doze horas tem menos de um pixel. Some-se,
    // e "este canal não esteve no ar" é a mentira errada a contar.
    const w = Math.max(1, x1 - x0);
    aoPintar?.(item);
    ctx.fillRect(Math.min(x0, e.largura - w), y0, w, y1 - y0);
  }
}

/** O lado da bandeirinha de uma marca, em px: o contorno de 1 px e 5 px de cor. */
const BANDEIRA = 7;

/** Os traços das marcas, um caminho por cor. */
function tracos(ctx, grupos, e, y0, y1, c) {
  const porCor = new Map();
  for (const [, lista] of grupos) for (const m of lista) {
    if (!Number.isFinite(m?.ms) || m.ms < e.de || m.ms > e.ate) continue;
    const x = ((m.ms - e.de) / e.span) * e.largura;
    const cor = c.marcas?.[m.tipo] || c.marca;
    let grupo = porCor.get(cor);
    if (!grupo) { grupo = new Map(); porCor.set(cor, grupo); }
    // Mil picos de chat numa noite inteira caem dezenas no mesmo pixel.
    // Pintar o mesmo traço vinte vezes não mostra nada a mais.
    const px = Math.round(x);
    if (!grupo.has(px)) grupo.set(px, x);
  }
  for (const [cor, xs] of porCor) {
    ctx.strokeStyle = cor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const x of xs.values()) {
      const xx = Math.min(Math.max(x, 1), e.largura - 1);
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx, y1);
    }
    ctx.stroke();
    // Uma bandeirinha no topo de cada marca. Um traço âmbar sobre a barra
    // azul quase não se distingue dela (1,1:1); um quadrado com contorno escuro
    // lê-se como "aqui há qualquer coisa" mesmo entre centenas de faixas.
    if (y1 - y0 < BANDEIRA) continue;
    for (const x of xs.values()) {
      const bx = Math.min(Math.max(Math.round(x) - (BANDEIRA - 1) / 2, 0), e.largura - BANDEIRA);
      if (bx < 0) continue;
      ctx.fillStyle = c.fundo;
      ctx.fillRect(bx, y0, BANDEIRA, BANDEIRA);
      ctx.fillStyle = cor;
      ctx.fillRect(bx + 1, y0 + 1, BANDEIRA - 2, BANDEIRA - 2);
    }
  }
}

/** Uma faixa de canal ou de resumo, em `ry` px do topo do ecrã. */
function pintarFaixa(ctx, l, ry, o) {
  const { largura, altura, c, e } = o;
  const de = Math.max(0, ry);
  const ate = Math.min(altura, ry + l.altura);
  if (ate <= de) return;
  const escolhida = o.escolhido != null
    && (l.tipo === 'canal' ? l.canal === o.escolhido : (l.canais || []).includes(o.escolhido));
  // Os colegas de quem se escolheu: são os que o lance vai abrir, e quem
  // escolhe tem de os ver antes de carregar no botão.
  const realcada = escolhida || (l.tipo === 'canal' && o.realcados?.has(l.canal));
  const falhou = l.tipo === 'canal' && o.falhados?.has(l.canal);

  ctx.fillStyle = c.faixa;
  ctx.fillRect(0, de, largura, ate - de);
  // A faixa escolhida tinha só o fundo um tom acima (1,06:1): entre centenas
  // de faixas, perdia-se qual era. Agora tem fundo de acento e contorno.
  if (escolhida) {
    ctx.fillStyle = c.escolha;
    ctx.fillRect(0, de, largura, ate - de);
  }
  const fio = ry + l.altura - 1;
  if (fio >= de && fio < ate) {
    ctx.fillStyle = c.linha;
    ctx.fillRect(0, fio, largura, 1);
  }

  // A barra deixa 4 px em cima e em baixo: faixas coladas umas às outras
  // viravam um bloco só, e é a separação que deixa contar quantos estavam.
  const y0 = Math.max(de, ry + 4);
  const y1 = Math.min(ate, ry + l.altura - 4);
  if (e && y1 > y0) {
    ctx.fillStyle = c.cobertura;
    if (l.tipo === 'resumo') {
      const total = Math.max(1, l.canais?.length || 1);
      ctx.save();
      barras(ctx, l.densidade || l.coberturas || [], e, y0, y1, (d) => {
        // Mais forte quanto mais do time estava no ar. Nunca abaixo de um
        // terço: um só no ar continua a ser "estava alguém".
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, (d[2] ?? total) / total);
      });
      ctx.restore();
    } else {
      barras(ctx, l.coberturas || [], e, y0, y1);
    }
    if (o.lerMarcas) {
      const ms = marcasDaLinha(l, o.lerMarcas);
      if (ms.length) tracos(ctx, ms, e, Math.max(de, ry + 1), Math.min(ate, ry + l.altura - 1), c);
    }
  }

  const texto = l.tipo === 'canal' ? l.canal : (l.canais || []).join(' · ');
  // Um nome que a Kick não conhece fica a vermelho e diz porquê: a faixa
  // vazia dele era igual à de quem só não transmitiu.
  rotulo(ctx, texto, 16, ry + l.altura / 2, {
    ...o,
    tam: 12,
    peso: escolhida ? 600 : 400,
    cor: falhou ? c.perigo : l.tipo === 'canal' ? c.texto : c.texto2,
    sufixo: falhou && o.naoAchado ? ` · ${o.naoAchado}` : '',
    // Um canal que não existe não tem barras por baixo: o nome pode usar a linha toda, e num telemóvel
    // o "não achado" já não comia o nome até "t…".
    ate: falhou ? Infinity : undefined,
  });

  if (realcada) {
    ctx.fillStyle = c.cobertura;
    ctx.fillRect(0, de, Math.min(3, largura), ate - de);
  }
  if (escolhida) contorno(ctx, ry, l.altura, o);
}

/**
 * Um contorno de 1 px à volta da faixa escolhida, feito com fillRect (o mapa
 * não usa strokeRect) e cortado ao ecrã: um lado fora do ecrã não se pinta.
 */
function contorno(ctx, ry, alto, { largura, altura, c }) {
  const de = Math.max(0, ry);
  const ate = Math.min(altura, ry + alto);
  if (ate <= de || largura < 2) return;
  ctx.fillStyle = c.texto;
  if (ry >= 0) ctx.fillRect(0, ry, largura, 1);
  if (ry + alto - 1 >= 0 && ry + alto <= altura) ctx.fillRect(0, ry + alto - 1, largura, 1);
  ctx.fillRect(0, de, 1, ate - de);
  ctx.fillRect(largura - 1, de, 1, ate - de);
}

/**
 * Pintar o pedaço do mapa que está no ecrã.
 *
 * `topo` é quanto já se rolou, `altura` e `largura` são as do canvas em px
 * de CSS (quem chama trata do devicePixelRatio com `setTransform`), `vista` é
 * o pedaço do tempo que a largura mostra, `agoraMs` é onde está a cabeça
 * (`null` para não haver), `marcas` é Map slug -> [{ ms, tipo }] e `escolhido`
 * é o canal que se escolheu, que fica realçado (a faixa dele, ou o resumo do
 * time dele quando está fechado). `cores` são as do tema, por cima de
 * `CORES`, e `cores.marcas` dá uma cor a cada tipo de marca ({ tiro: '#…' }).
 * `semTime` é o nome do grupo sem time, para a página o passar já traduzido,
 * e `letra` é a família da letra (o canvas não lê variáveis de CSS).
 * `realcados` (Set de slugs) são os colegas de quem se escolheu, com uma
 * risca à esquerda; `falhados` (Set de slugs) são os canais que não existem
 * na Kick, com o nome a vermelho seguido de `naoAchado`.
 *
 * Só toca no canvas com fillRect, fillText, beginPath, moveTo, lineTo,
 * stroke, save e restore (e as propriedades de cor, letra e alfa). Nada sai
 * do canvas: tudo é cortado às bordas antes de se pintar, e não depois.
 */
export function pintarMapa(ctx, mapa, {
  topo = 0, altura, largura, vista, agoraMs = null, marcas, cores, escolhido = null,
  semTime = 'Sem time', letra = LETRA, realcados = null, falhados = null, naoAchado = '',
} = {}) {
  if (!ctx || !(largura > 0) || !(altura > 0)) return;
  const t0 = Number.isFinite(topo) ? topo : 0;
  const c = coresDe(cores);
  const e = escala(vista, largura);
  const o = {
    largura, altura, c, e, escolhido, semTime, letra,
    realcados: realcados instanceof Set ? realcados : null,
    falhados: falhados instanceof Set ? falhados : null,
    naoAchado: typeof naoAchado === 'string' ? naoAchado : '',
    lerMarcas: marcas ? leitor(marcas) : null,
  };

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = c.fundo;
  ctx.fillRect(0, 0, largura, altura);

  for (const l of linhasVisiveis(mapa, { topo: t0, altura })) {
    const ry = l.y - t0;
    if (l.tipo === 'time') pintarCabecalho(ctx, l, ry, o);
    else pintarFaixa(ctx, l, ry, o);
  }

  const preso = cabecalhoPreso(mapa, t0);
  if (preso && preso.altura <= altura) pintarCabecalho(ctx, preso, 0, o);

  // A cabeça por cima de tudo, até do cabeçalho preso: é a única coisa no
  // mapa que diz "é aqui que estás", e não pode ficar tapada por nada.
  if (e && Number.isFinite(agoraMs) && agoraMs >= e.de && agoraMs <= e.ate) {
    const x = xDoTempo(agoraMs, vista, largura);
    // Um fio escuro de cada lado: a cabeça branca sobre as barras azuis dava
    // 2,5:1, e é a única coisa que diz onde se está.
    ctx.fillStyle = c.fundo;
    if (x - 2 >= 0) ctx.fillRect(x - 2, 0, 1, altura);
    if (x + 2 <= largura) ctx.fillRect(x + 1, 0, 1, altura);
    ctx.strokeStyle = c.cabeca;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, altura);
    ctx.stroke();
  }
  ctx.restore();
}
