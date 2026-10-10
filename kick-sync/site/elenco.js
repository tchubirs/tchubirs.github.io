// O elenco de um evento, lido do que o organizador tiver à mão.
//
// Um evento de 500 streamers não se escreve canal a canal. O elenco já existe
// algures — a página de times do site do evento, uma folha de cálculo, uma
// mensagem no Discord — e pedir outro formato ao organizador é dar-lhe
// trabalho. Por isso isto lê os formatos que já existem, em qualquer mistura,
// e diz o que deixou de fora em vez de adivinhar.
//
// Medido em 06/10/2026 na página de times do Rust Kick Off 2
// (rustkickoff.com/teams): cada time é um <h3> ("Team Ricoy") seguido dos
// links kick.com/<canal> do capitão, do vice e do resto — 10 times, 150
// canais. E o texto de cada link NÃO é o canal: "Pheetus" aponta para
// impheetus e "Gabi" para blueberrygabi. Numa página conta o endereço do
// link, nunca o que está escrito nele.
//
// O resultado é sempre a mesma forma:
//   { times: [{ nome, canais: [slug] }], soltos: [slug], avisos: [texto] }
// `soltos` são canais sem time (o canal do próprio evento, uma lista solta);
// `avisos` é o que a página deve mostrar antes de alguém carregar 500 canais.
//
// Leituras que o pedido não fixa e que aqui são de propósito:
//  - Um canal com letras fora de [a-z0-9_.-] é recusado com aviso, e não
//    filtrado: "tchübi" sem o ü é o nome de outra pessoa.
//  - Um bloco "nome + um canal por linha" cujo nome também podia ser canal
//    ("Oilrats" por cima de oilrats) só é time quando há dois blocos assim.
//    Sozinho fica canal; se o nome tem maiúsculas e os canais não, um aviso
//    diz como o escrever para ser time ("Oilrats:").
//  - Títulos de papel ("Players", "Capitão") e de "Sem time" não são times.
//  - HTML e texto podem vir no mesmo texto colado: as linhas com marcação são
//    lidas como página, as outras como texto, pela ordem em que aparecem.
//  - `contar` conta os soltos nos canais, e `paraTexto` escreve-os numa linha
//    "Sem time: a, b" no fim.

/**
 * Caminhos da Kick que não são canais.
 *
 * Um link para kick.com/category/rust está em quase todas as páginas de
 * eventos de Rust (a página medida tem três) e não é um streamer. `clip` e
 * `api` não vêm da lista pedida mas são caminhos que a Kick já ocupa —
 * `lerLinkKick` trata `clip` como clipe — e por isso nenhum canal se pode
 * chamar assim.
 */
const NAO_SAO_CANAIS = new Set([
  'category', 'categories', 'video', 'videos', 'clip', 'clips', 'search', 'browse', 'following',
  'dashboard', 'about', 'terms-of-service', 'privacy-policy', 'community-guidelines', 'help',
  'settings', 'subscriptions', 'signup', 'login', 'api',
]);

// A mesma regra de `vodsDoCanal`, de propósito: o que o elenco aceita é o que
// a Kick vai ser perguntada a seguir. É solta pela mesma razão que lá — não sei
// o tamanho mínimo de um nome na Kick, e quem sabe é a API.
const CANAL = /^[a-z0-9_.-]{1,60}$/;

// Uma página com 500 links e tudo duplicado ainda são poucos avisos; mais do
// que isto já não é lido por ninguém, e um ecrã cheio de avisos esconde o
// único que importa.
const MAXIMO_AVISOS = 40;

// Para links: o evento tem 500 canais. Quatro vezes isso chega para qualquer
// evento real, e um link maior do que isto não é um elenco — é alguém a ver
// se a página tenta abrir cem mil canais de uma vez.
const MAXIMO_CANAIS = 2000;
const MAXIMO_LINK = 200_000;           // caracteres de um link codificado
const MAXIMO_DESCOMPRIMIDO = 2 << 20;  // bytes depois de descomprimir

// ── canais ──────────────────────────────────────────────────────────────────

/** Um token parece um endereço: tem esquema, `//`, um domínio com caminho, ou é a Kick. */
function pareceLink(t) {
  return /^(?:https?:)?\/\//i.test(t)
    || /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\//i.test(t)
    || /^(?:www\.)?kick\.com$/i.test(t);
}

/**
 * Um canal a partir de qualquer forma de o escrever, ou o motivo de não ser.
 *
 * Recusa em vez de corrigir: tirar os espaços a "Mills RP" dava "millsrp",
 * que pode ser outra pessoa. Um canal errado no elenco é um ângulo errado na
 * grelha, e ninguém dá por ele.
 */
function lerCanal(cru) {
  let t = String(cru ?? '').trim();
  // Uma menção do Discord copiada crua (<@123...>) é o número da pessoa no
  // Discord. Sem os < > e o @ ficava só o número, que passa na regra de canal.
  if (/^<(?:@[!&]?|#)\d+>$/.test(t)) return { motivo: 'mencao', texto: t.slice(0, 60) };
  t = t.replace(/^[(\[{<"'“‘«]+/, '')
    .replace(/[)\]}>"'”’»,;:!?]+$/, '');
  const texto = t.slice(0, 60);
  if (!t) return { motivo: 'vazio', texto };
  if (pareceLink(t)) {
    let u;
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/\//, '')}`); } catch {
      return { motivo: 'invalido', texto };
    }
    if (!/(^|\.)kick\.com$/i.test(u.hostname)) return { motivo: 'outro-site', texto };
    const partes = u.pathname.split('/').filter(Boolean);
    // kick.com/popout/<canal>/chat é o chat destacado: o canal é o segundo.
    let p = partes[0]?.toLowerCase() === 'popout' ? partes[1] : partes[0];
    if (!p) return { motivo: 'nao-e-canal', texto };
    try { p = decodeURIComponent(p); } catch { return { motivo: 'invalido', texto }; }
    t = p;
  } else {
    t = t.replace(/^@+/, '');
  }
  // O ponto final sai. A página medida mostra "xKevv." e o canal é xkevv: um
  // nome da Kick não acaba em ponto. Sai também de um href, para o canal ser
  // um só: o elenco passa por texto em "Corrigir elenco" e no link, e lá o
  // ponto sai sempre.
  t = t.toLowerCase().replace(/\.+$/, '');
  if (NAO_SAO_CANAIS.has(t)) return { motivo: 'nao-e-canal', texto };
  // Só pontuação ("-", "...") passa na regra da Kick mas não é nome de ninguém,
  // e aparece sempre que se parte uma frase como "Time 1 - Os Brabos".
  if (!CANAL.test(t) || !/[a-z0-9]/.test(t)) return { motivo: 'invalido', texto };
  return { slug: t };
}

/**
 * O canal escrito em `texto` — nome, @nome ou link da Kick — ou `null`.
 *
 * É a mesma normalização que o elenco usa, exposta para quem escreve um canal
 * à mão poder ser comparado com o elenco sem diferenças de maiúsculas ou de @.
 */
export function canalDe(texto) {
  return lerCanal(texto).slug ?? null;
}

/** Numa página só conta um link para a Kick: um href relativo é do site do evento. */
function canalDeLink(href) {
  const h = String(href || '').trim();
  return pareceLink(h) ? lerCanal(h).slug ?? null : null;
}

// ── nomes ───────────────────────────────────────────────────────────────────

/**
 * O nome de um time, limpo até já não mudar.
 *
 * Tira o que a leitura do texto também tira (marcadores de lista, `#`, `**`,
 * `:` no fim) para que um nome escrito por `paraTexto` seja lido de volta
 * igual. E tira `<` e `>`: o nome vem da página de outra pessoa e esta app
 * pinta com innerHTML em muitos sítios, por isso um nome nunca abre uma tag.
 * As aspas ficam ("Team "Lobo"", "Tchubi's") — quem puser um nome DENTRO de
 * um atributo continua a ter de o escapar.
 *
 * O U+200C e o U+200D ficam: são eles que juntam um emoji de família ou de
 * profissão, e sem eles o nome mudava de cara. Sozinhos nas pontas saem.
 */
function limparNome(cru) {
  let n = String(cru ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200b\u200e\u200f\u2028-\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/\[([^\]]*)\]\(\s*([^)\s]*)\s*\)/g, ' $2 ')
    .replace(/[<>*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Até já não mudar, sem limite de voltas: cada volta que muda encurta o nome,
  // e com um limite o nome lido uma vez não era o mesmo lido duas vezes.
  for (;;) {
    const antes = n;
    n = n.replace(/^#{1,6}(?:\s+|$)/, '')
      .replace(/^(?:[-•·+]|\d{1,3}[.)]|\d{1,3}\s*[-\u2013\u2014])(?:\s+|$)/, '')
      .slice(0, 80)
      // Cortar aos 80 pode deixar meio emoji no fim.
      .replace(/[\ud800-\udbff]$/, '')
      .replace(/[\s:\u200c\u200d]+$/, '')
      .replace(/^[\u200c\u200d]+/, '')
      .trim();
    if (n === antes) break;
  }
  return n;
}

// Títulos que dizem o PAPEL de quem vem a seguir, não o nome de um time. Os
// cartões de time põem muitas vezes "Capitão", "Jogadores" ou "Reservas" num
// subtítulo, e cada um deles viraria um time falso com metade dos canais.
const ROTULO = new RegExp(`^(?:(?:the|os|as|o|a|los|las|el|la|our)\\s+)?(?:${[
  'co-?\\s?captains?', 'co-?\\s?capit[aã]o', 'vice-?\\s?capit[aã]o', 'captains?', 'capit[aã]o',
  'capit[aã]es', 'capit[aá]n(?:es)?', 'capitanes', 'players?', 'jogador(?:es)?', 'jugador(?:es)?',
  'members?', 'membros?', 'miembros?', 'integrantes?', 'roster', 'elenco', 'plantel', 'line-?\\s?up',
  'escala[cç][aã]o', 'starters?', 'titulares?', 'subs?', 'substitutes?', 'substitutos?', 'reservas?',
  'suplentes?', 'bench', 'banco', 'coach(?:es)?', 'treinador(?:es)?', 'staff', 'streamers?',
  '(?:content\\s+)?creators?', 'criador(?:es)?(?:\\s+de\\s+conte[uú]do)?', 'participantes?', 'participants?',
].join('|')})(?:\\s*[(#]?\\s*\\d+\\s*\\)?)?$`, 'i');

// Títulos que dizem "estes não têm time". O canal do evento e os convidados
// ficam aqui, e é também assim que `paraTexto` escreve os soltos.
const SOLTOS = /^(?:sem\s+(?:time|equipa|equipe|grupo)|soltos?|avulsos?|free\s*agents?|agentes?\s+livres?|no\s+team|unassigned|sin\s+equipo|outros|others)$/i;

const ehRotulo = (n) => ROTULO.test(n);
const ehSoltos = (n) => SOLTOS.test(n);

const PALAVRAS_DE_TIME = new Set(['team', 'teams', 'time', 'times', 'equipa', 'equipas', 'equipe',
  'equipes', 'squad', 'clan', 'clã', 'grupo', 'group']);

const dizTime = (n) => String(n).split(/\s+/).some((p) => PALAVRAS_DE_TIME.has(p.toLowerCase()));

// O aviso de quando um grupo com nome de papel fica sem time. Quase sempre é
// isso mesmo ("Streamers: a, b, c" é uma lista sem times), mas um time que se
// chame "Staff" perdia-se calado.
const avisoDePapel = (n) => `"${n}" parece um papel e não o nome de um time; os canais dele ficaram sem time`;

// Notas de papel ao lado de um membro: "ricoy (C)", "[CPT] kodd", "ricoy - capitão".
// "CPT" e "CO-CPT" são os da página medida; os outros são os títulos de papel.
const NOTA = /^(?:c|vc|cc|cpt|capt|vice|co-?\s?(?:c|cpt|capt))\.?$/i;
const ehNota = (n) => NOTA.test(String(n).trim()) || ehRotulo(String(n).trim());

/** "(C)" ou "[CPT]" no meio de uma lista: é uma nota, e não um canal chamado "c". */
function ehNotaEntreParenteses(token) {
  const m = /^[(\[]\s*([^()[\]]+?)\s*[)\]][.,;:]?$/.exec(String(token));
  return Boolean(m) && ehNota(m[1]);
}

// Um título que fala de vários times ("Times confirmados:", "# Teams", "Grupo A")
// é uma secção: o nome na linha a seguir é o do primeiro time, e não um membro.
const PALAVRAS_DE_SECAO = new Set(['teams', 'times', 'equipas', 'equipes', 'equipos', 'squads', 'clans', 'clãs',
  'grupo', 'grupos', 'group', 'groups', 'fase', 'fases', 'phase', 'stage', 'divisão', 'division']);
const ehSecao = (n) => String(n).toLowerCase().split(/[^\p{L}\p{N}]+/u).some((p) => PALAVRAS_DE_SECAO.has(p));

// ── acumulador ──────────────────────────────────────────────────────────────

/**
 * Onde todas as leituras vão parar, com as regras num sítio só.
 *
 * Um canal pertence a um time e só a um: o primeiro ganha, e o segundo vira
 * aviso com os dois nomes. Repetir o canal no MESMO time não é aviso — um
 * cartão de time pode pôr o capitão e o vice no cabeçalho e outra vez na
 * lista, e isso é a mesma pessoa duas vezes, não um conflito.
 * Um canal que apareceu solto e depois dentro de um time passa para o time:
 * estar num time diz mais do que não estar.
 */
function novoAcumulador() {
  const times = [];
  const porChave = new Map();
  const dono = new Map();          // slug -> time, ou null quando está solto
  const soltos = [];
  const avisos = [];
  const jaAvisado = new Set();
  let avisosAMais = 0;

  const ac = {
    aviso(texto) {
      if (jaAvisado.has(texto)) return;
      jaAvisado.add(texto);
      if (avisos.length < MAXIMO_AVISOS) avisos.push(texto); else avisosAMais++;
    },
    /** O time com este nome; o mesmo nome (sem olhar a maiúsculas) é o mesmo time. */
    time(nome) {
      const n = limparNome(nome);
      if (!n || ehRotulo(n) || ehSoltos(n)) return null;
      const chave = n.toLowerCase();
      let t = porChave.get(chave);
      if (!t) {
        t = { nome: n, canais: [] };
        porChave.set(chave, t);
        times.push(t);
      }
      return t;
    },
    /** Só os times com gente: um título de decoração não é o time número N. */
    quantosTimes: () => times.filter((t) => t.canais.length).length,
    temGente: (nome) => (porChave.get(limparNome(nome).toLowerCase())?.canais.length ?? 0) > 0,
    /** Junta o canal ao time (ou aos soltos) e diz se ele ficou solto. */
    juntar(slug, time) {
      const atual = dono.get(slug);
      if (time) {
        if (atual === undefined || atual === null) {
          dono.set(slug, time);
          time.canais.push(slug);
        } else if (atual !== time) {
          ac.aviso(`"${slug}" aparece em "${atual.nome}" e em "${time.nome}"; ficou em "${atual.nome}"`);
        }
      } else if (atual === undefined) {
        dono.set(slug, null);
        soltos.push(slug);
      }
      return dono.get(slug) === null;
    },
    /** Um token lido de texto: entra (e diz o canal e se ficou solto), ou vira aviso a dizer porquê. */
    token(cru, time) {
      const r = lerCanal(cru);
      if (r.slug) return { slug: r.slug, solto: ac.juntar(r.slug, time) };
      if (r.motivo === 'outro-site') ac.aviso(`"${r.texto}" não é da Kick; ficou de fora`);
      else if (r.motivo === 'nao-e-canal') ac.aviso(`"${r.texto}" é uma página da Kick, não um canal; ficou de fora`);
      else if (r.motivo === 'invalido') ac.aviso(`"${r.texto}" não é um nome de canal da Kick; ficou de fora`);
      else if (r.motivo === 'mencao') ac.aviso(`"${r.texto}" é uma menção do Discord, não um canal da Kick; ficou de fora`);
      return null;
    },
    totalDeCanais: () => dono.size,
    resultado() {
      const saida = {
        // Times vazios saem: um título sem links por baixo ("Official Roster",
        // "COMPETING TEAMS") é decoração da página, não um time.
        times: times.filter((t) => t.canais.length).map((t) => ({ nome: t.nome, canais: [...t.canais] })),
        soltos: soltos.filter((s) => dono.get(s) === null),
        avisos: [...avisos],
      };
      if (avisosAMais) saida.avisos.push(`e mais ${avisosAMais} avisos`);
      return saida;
    },
  };
  return ac;
}

// ── HTML ────────────────────────────────────────────────────────────────────

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodificarEntidades(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

const pareceHtml = (s) => /<(?:a|h[1-6])(?=[\s>])[^>]*>/i.test(s) || /<(?:!doctype\s+html|html|body)\b/i.test(s);

/**
 * O valor de um atributo, lido atributo a atributo.
 *
 * Procurar `\bhref=` no texto todo apanhava `data-href=` (o `\b` casa depois
 * do traço), e um link guardado num atributo de dados passava à frente do
 * link de verdade.
 */
function atributo(attrs, nome) {
  for (const m of String(attrs).matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    if (m[1].toLowerCase() !== nome) continue;
    const valor = m[2] ?? m[3] ?? m[4];
    return valor === undefined ? null : decodificarEntidades(valor);
  }
  return null;
}

/**
 * O texto de um título que abre em `fimAbertura`.
 *
 * Os fechos de cada nível são achados uma vez (`fechos`, por ordem) e aqui só
 * se procura o primeiro depois da abertura, e só se estiver perto: um título
 * sem fecho num ficheiro de cinco MB obrigava a varrer a página inteira por
 * cada título, e nenhum título tem quatro mil caracteres de marcação.
 */
function textoDoTitulo(html, fimAbertura, nivel, attrs, fechos) {
  const lista = fechos[nivel];
  let baixo = 0;
  let alto = lista.length;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if (lista[meio] < fimAbertura) baixo = meio + 1; else alto = meio;
  }
  const fecho = lista[baixo];
  let dentro;
  if (fecho !== undefined && fecho - fimAbertura <= 4000) dentro = html.slice(fimAbertura, fecho);
  else {
    const janela = html.slice(fimAbertura, fimAbertura + 200);
    const aberto = janela.indexOf('<');
    dentro = aberto >= 0 ? janela.slice(0, aberto) : janela;
  }
  const texto = decodificarEntidades(dentro.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (texto) return texto;
  // Um título feito só com o logótipo do time ainda tem nome, no alt.
  const img = dentro.match(/<img\b[^>]*>/i);
  return (img && atributo(img[0], 'alt')) || atributo(attrs, 'aria-label') || '';
}

// Elementos sem fecho: nunca ficam abertos à espera de um.
const VAZIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr']);

// Os elementos que envolvem a página inteira: um rodapé lá dentro é do site.
const RAIZ = new Set(['html', 'body', 'main']);

// Uma etiqueta (de abrir ou de fechar) ou um <!doctype>. Pode atravessar linhas.
const ETIQUETA = /<(\/?)([a-z][a-z0-9-]*)(?=[\s>\/])([^>]*)>?|<![^>]*>?/gi;

/**
 * Os elementos abertos, como o navegador os veria nos casos que aqui contam.
 *
 * Um fecho fecha o elemento com esse nome mais próximo e tudo o que ficou
 * aberto dentro dele; um fecho sem abertura não faz nada. A conta por nome
 * evita procurar a pilha inteira por cada fecho: cem mil </div> sem <div>
 * eram cem mil voltas à pilha.
 */
function novaPilha() {
  const pilha = [];
  const quantos = new Map();
  const tirar = () => {
    const e = pilha.pop();
    quantos.set(e.nome, quantos.get(e.nome) - 1);
    return e;
  };
  const fechar = (nome) => {
    if (!quantos.get(nome)) return;
    while (tirar().nome !== nome);
  };
  return {
    pilha,
    fechar,
    abrir(nome, dados = {}) {
      // Um título nunca fica dentro de outro, nem um link dentro de outro link.
      if (/^h[1-6]$/.test(nome) && /^h[1-6]$/.test(pilha.at(-1)?.nome ?? '')) tirar();
      if (nome === 'a') fechar('a');
      if (VAZIOS.has(nome)) return;
      pilha.push({ nome, ...dados });
      quantos.set(nome, (quantos.get(nome) || 0) + 1);
    },
  };
}

/**
 * O HTML sem comentários, <script> e <style>, numa passagem só.
 *
 * Um <!-- ou um <script> por fechar vai até ao fim, como no navegador, e o que
 * veio antes fica. Com uma regex por abertura, cada abertura sem fecho varria
 * o resto da página: cem mil eram minutos. As quebras de linha ficam, para
 * cada linha continuar a ser a mesma linha.
 */
function semComentariosNemScripts(html) {
  const abertura = /<!--|<(script|style)(?=[\s>\/])/gi;
  let saida = '';
  let desde = 0;
  for (let m = abertura.exec(html); m; m = abertura.exec(html)) {
    let fim;
    if (m[1]) {
      const fecho = new RegExp(`</${m[1]}\\s*>`, 'gi');
      fecho.lastIndex = m.index + m[0].length;
      const f = fecho.exec(html);
      fim = f ? f.index + f[0].length : html.length;
    } else {
      const f = html.indexOf('-->', m.index + 2);
      fim = f >= 0 ? f + 3 : html.length;
    }
    saida += html.slice(desde, m.index) + html.slice(m.index, fim).replace(/[^\n]+/g, ' ');
    desde = fim;
    abertura.lastIndex = fim;
  }
  return saida + html.slice(desde);
}

/**
 * Que linhas são da página: têm marcação, ou ficam dentro de um elemento.
 *
 * As outras são do organizador ("Team A: a1, a2" por cima de um pedaço de
 * HTML) e lêem-se como texto. O texto de um link ou de um título, mesmo numa
 * linha sozinha, é da página: "Pheetus" dentro do <a> de impheetus não é um
 * canal.
 */
function linhasDaPagina(limpo) {
  const inicios = [0];
  for (let i = limpo.indexOf('\n'); i >= 0; i = limpo.indexOf('\n', i + 1)) inicios.push(i + 1);
  const daPagina = new Uint8Array(inicios.length);
  let l = 0;
  const marcar = (de, ate) => {
    if (ate <= de) return;
    while (l + 1 < inicios.length && inicios[l + 1] <= de) l++;
    for (let k = l; k < inicios.length && inicios[k] < ate; k++) daPagina[k] = 1;
  };
  const elementos = novaPilha();
  let fim = 0;
  for (const m of limpo.matchAll(ETIQUETA)) {
    if (elementos.pilha.length) marcar(fim, m.index);
    fim = m.index + m[0].length;
    marcar(m.index, fim);
    if (!m[2]) continue;
    const nome = m[2].toLowerCase();
    if (m[1]) elementos.fechar(nome); else if (!/\/\s*$/.test(m[3])) elementos.abrir(nome);
  }
  if (elementos.pilha.length) marcar(fim, limpo.length);
  return { inicios, daPagina };
}

/**
 * Os títulos que se repetem em secções diferentes e são papéis, não times.
 *
 * "Main" em cada cartão e "Team A" em cada fase do torneio têm a mesma forma:
 * o mesmo nome debaixo de vários pais. Separa-os a conta. Um papel repete-se
 * em muitos cartões e cada cartão tem poucos; um time repete-se em poucas
 * fases e cada fase tem muitos. Na dúvida é time, que é a regra do título mais
 * próximo; e um nome que diz "Team" ou "Time" é sempre um time.
 */
function rotulosRepetidos(estatisticas) {
  const repetidos = [...estatisticas].filter(([, e]) => e.pais.size >= 2 && !e.orfao
    && !ehRotulo(e.nome) && !ehSoltos(e.nome));
  const porPai = new Map();
  for (const [, e] of repetidos) for (const p of e.pais) porPai.set(p, (porPai.get(p) || 0) + 1);
  const rotulos = new Set();
  for (const [chave, e] of repetidos) {
    if (dizTime(e.nome)) continue;
    let irmaos = 0;
    for (const p of e.pais) irmaos = Math.max(irmaos, porPai.get(p));
    if (e.pais.size > irmaos) rotulos.add(chave);
  }
  return rotulos;
}

/**
 * Página de times: cada link da Kick vai para o título mais próximo acima dele.
 *
 * Quatro cuidados que a regra simples não tem:
 *  - Um subtítulo de papel ("Players", "Capitão") por baixo do título do time
 *    não abre time novo. O mesmo para um subtítulo que se repete debaixo de
 *    muitos títulos diferentes ("Main" em cada cartão; ver `rotulosRepetidos`).
 *    Um título repetido debaixo do MESMO pai é a versão de telemóvel do mesmo
 *    cartão, e junta-se ao primeiro.
 *  - O link pertence ao título onde FECHA: `<a href><h3>Team X</h3></a>` é o
 *    capitão do Team X, não do time de cima.
 *  - <nav> e <footer> cortam o time, porque os links do rodapé são do site e
 *    não do último time da página. Menos dentro do cartão do time: o elemento
 *    que envolve o título e o rodapé, e nenhum outro time.
 *  - Um título sem nome nenhum recebe "Time N", com N o lugar dele entre os
 *    times com gente, saltando os números que já são nome de outro título.
 *
 * `textos` são as linhas de texto do organizador no meio da página, já em
 * branco em `html`: lêem-se no sítio onde estão, para a ordem dos times ser a
 * do que se colou. `cru` é a página antes de tirar os <script>, onde uma
 * página montada por JavaScript guarda os links.
 */
function lerHtml(html, ac, textos = [], cru = html) {
  const fechos = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const m of html.matchAll(/<\/h([1-6])\s*>/gi)) fechos[m[1]].push(m.index);

  const titulos = new Map();
  const pilhaDeTitulos = [];
  const estatisticas = new Map();
  for (const m of html.matchAll(/<h([1-6])(?=[\s>\/])([^>]*)>/gi)) {
    const nivel = Number(m[1]);
    const nome = limparNome(textoDoTitulo(html, m.index + m[0].length, nivel, m[2], fechos));
    const chave = nome.toLowerCase();
    while (pilhaDeTitulos.length && pilhaDeTitulos.at(-1).nivel >= nivel) pilhaDeTitulos.pop();
    const pai = pilhaDeTitulos.at(-1)?.chave;
    pilhaDeTitulos.push({ nivel, chave });
    titulos.set(m.index, { nivel, nome, chave });
    if (!chave) continue;
    const e = estatisticas.get(chave) || { nome, n: 0, pais: new Set(), orfao: false };
    e.n++;
    if (pai === undefined) e.orfao = true; else e.pais.add(pai);
    estatisticas.set(chave, e);
  }
  const rotulos = rotulosRepetidos(estatisticas);

  let atual = null;
  let nivelAtual = 0;
  let pendente = null;
  let papel = null;        // o título de papel sem time por cima, para o aviso
  let tituloDoTime = -1;   // onde está o título do time atual
  let abertos = 0;         // títulos que abriram um time até aqui
  let achados = 0;
  const semNome = new Set();
  const elementos = novaPilha();
  const largar = () => {
    if (!pendente) return;
    achados++;
    if (ac.juntar(pendente, atual) && !atual && papel) ac.aviso(avisoDePapel(papel));
    pendente = null;
  };
  // O elemento aberto mais fundo que já envolvia o título do time. Se lá dentro
  // só há este time, é o cartão dele, e um rodapé ali é do cartão.
  const noCartao = () => {
    if (!atual || tituloDoTime < 0) return false;
    const { pilha } = elementos;
    let baixo = 0;
    let alto = pilha.length;
    while (baixo < alto) {
      const meio = (baixo + alto) >> 1;
      if (pilha[meio].pos < tituloDoTime) baixo = meio + 1; else alto = meio;
    }
    const cartao = pilha[baixo - 1];
    return Boolean(cartao) && !RAIZ.has(cartao.nome) && abertos - cartao.abertos === 1;
  };
  let proximoTexto = 0;
  const lerTextosAte = (pos) => {
    while (proximoTexto < textos.length && textos[proximoTexto].inicio < pos) lerTexto(textos[proximoTexto++].texto, ac);
  };

  for (const m of html.matchAll(ETIQUETA)) {
    if (!m[2]) continue;
    lerTextosAte(m.index);
    const fecha = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (fecha) elementos.fechar(tag);
    else if (!/\/\s*$/.test(m[3])) elementos.abrir(tag, { pos: m.index, abertos });
    if (tag === 'a') {
      largar();
      if (!fecha) pendente = canalDeLink(atributo(m[3], 'href'));
    } else if (tag === 'nav' || tag === 'footer') {
      if (!fecha && !noCartao()) { largar(); atual = null; nivelAtual = 0; papel = null; }
    } else if (!fecha && /^h[1-6]$/.test(tag)) {
      const t = titulos.get(m.index);
      if (!t) continue;
      if (t.nome && ehSoltos(t.nome)) { atual = null; nivelAtual = t.nivel; papel = null; continue; }
      if (t.nome && (ehRotulo(t.nome) || rotulos.has(t.chave))) {
        // Fica no time de cima se houver um por cima dele; um "Streamers"
        // mais alto do que os times é uma secção nova, sem time.
        if (!(atual && nivelAtual <= t.nivel)) { atual = null; nivelAtual = t.nivel; papel = t.nome; }
        continue;
      }
      let nome = t.nome;
      if (!nome) {
        // Sem nome nenhum, nem no alt: um nome de recurso é mais honesto do que
        // somar estes canais ao time de cima.
        let n = ac.quantosTimes() + 1;
        while (estatisticas.has(`time ${n}`) || ac.temGente(`Time ${n}`)) n++;
        nome = `Time ${n}`;
      }
      atual = ac.time(nome);
      if (!t.nome && atual) semNome.add(atual);
      nivelAtual = t.nivel;
      papel = null;
      tituloDoTime = m.index;
      abertos++;
    }
  }
  largar();
  lerTextosAte(Infinity);
  for (const t of semNome) if (t.canais.length) ac.aviso(`um título sem nome ficou com o nome "${t.nome}"`);

  if (!achados) {
    // Páginas montadas por JavaScript não têm os links no HTML, mas costumam
    // trazer os dados num <script> (com as barras escapadas: https:\/\/...).
    // Sem títulos não há times, mas os canais ainda servem.
    const crus = String(cru).replace(/\\\//g, '/')
      .match(/(?:https?:)?\/\/(?:[a-z0-9-]+\.)*kick\.com\/[^\s"'<>\\)]+/gi) || [];
    const soltos = new Set();
    for (const u of crus) {
      const slug = canalDeLink(u);
      if (slug && ac.juntar(slug, null)) soltos.add(slug);
    }
    if (soltos.size) {
      ac.aviso(`esta página não tem títulos com links da Kick por baixo; os ${soltos.size} canais encontrados ficaram sem time`);
    }
  }
}

/**
 * Um texto colado que tem HTML: a página, e o texto do organizador à volta dela.
 *
 * Uma página inteira (com <html>) é toda página. Um pedaço de HTML no meio de
 * uma mensagem não apaga a mensagem: as linhas sem marcação, fora de qualquer
 * elemento, lêem-se como texto, cada uma no seu sítio.
 *
 * Mas só o que tem cara de elenco escrito: num grupo de linhas seguidas, a
 * partir da primeira com um "Nome: canais", um @ ou um link. "Bem-vindos" e "sponsor" soltos ao lado
 * dos links são texto da página, e lidos como mensagem davam um time inventado.
 */
function lerPagina(cru, ac) {
  const limpo = semComentariosNemScripts(cru);
  const { inicios, daPagina: marcadas } = linhasDaPagina(limpo);
  const linhas = limpo.split('\n');
  const daPagina = [...marcadas];
  for (let k = 0; k < linhas.length;) {
    if (daPagina[k] || !linhas[k].trim()) { k++; continue; }
    let fim = k;
    while (fim < linhas.length && !daPagina[fim] && linhas[fim].trim()) fim++;
    // O que vem antes da primeira linha assim é da página; o que vem depois
    // pode ser um membro por linha debaixo de "Time A:".
    const i = linhas.slice(k, fim).findIndex(temCaraDeElenco);
    for (let j = k; j < (i < 0 ? fim : k + i); j++) daPagina[j] = true;
    k = fim;
  }
  const textos = [];
  let aberto = null;
  for (let k = 0; k < linhas.length; k++) {
    if (daPagina[k]) { aberto = null; continue; }
    // Uma linha em branco só entra num texto já começado, onde separa blocos.
    if (!aberto && !linhas[k].trim()) continue;
    if (!aberto) { aberto = { inicio: inicios[k], linhas: [], numeros: [] }; textos.push(aberto); }
    aberto.linhas.push(linhas[k]);
    aberto.numeros.push(k);
  }
  if (!textos.length) { lerHtml(limpo, ac, [], cru); return; }
  const crus = cru.split('\n');
  for (const t of textos) {
    for (const k of t.numeros) {
      linhas[k] = ' '.repeat(linhas[k].length);
      crus[k] = '';
    }
  }
  lerHtml(linhas.join('\n'), ac, textos.map((t) => ({ inicio: t.inicio, texto: t.linhas.join('\n') })), crus.join('\n'));
}

/** Uma linha escrita pelo organizador: "Nome: a, b", um @canal ou um link. */
function temCaraDeElenco(linha) {
  const { s } = prepararLinha(linha);
  return Boolean(s) && (Boolean(dividirNome(s)) || tokens(s).some(canalEscrito));
}

// ── texto ───────────────────────────────────────────────────────────────────

/**
 * Limpa o que o Discord e o Markdown põem à volta de uma linha.
 *
 * `branca` é a linha que separa blocos. Uma linha só com tabs não é: numa
 * folha colada é uma linha vazia da tabela, e a tabela continua por baixo.
 */
function prepararLinha(cru) {
  let s = String(cru)
    .replace(/[  -​  　﻿]/g, ' ')
    .replace(/\[([^\]]*)\]\(\s*([^)\s]*)\s*\)/g, ' $2 ')
    .replace(/<((?:https?:)?\/\/[^>\s]+)>/gi, ' $1 ')
    .trim();
  let marcado = false;
  const titulo = s.match(/^#{1,6}\s+(.*)$/);
  if (titulo) { marcado = true; s = titulo[1]; }
  if (/^(?:\*\*.+\*\*|__.+__):?$/.test(s)) { marcado = true; s = s.replace(/^(?:\*\*|__)|(?:\*\*|__)(?=:?$)/g, ''); }
  // Marcadores de lista e numeração: "- ", "1. ", "2) ", "3 - ".
  for (let i = 0; i < 4; i++) s = s.replace(/^(?:[-*•·+>]|\d{1,3}[.)]|\d{1,3}\s*[-–—])\s+/, '');
  s = s.replace(/[*`]/g, '').trim();
  return { s, marcado, branca: !s && !/\t/.test(cru) };
}

// Uma linha de enfeite ("---", "===") separa blocos como uma linha em branco.
// Com "|" é a linha |---|---| de uma tabela Markdown, que é da tabela.
const ehSeparador = (l) => l.branca || /^[-=_~\s:+]+$/.test(l.s);

/**
 * "Nome: a, b" — o nome é tudo até ao ÚLTIMO dois-pontos.
 *
 * O último e não o primeiro, porque um título como "Time 1: Os Brabos" é um
 * nome inteiro, e os canais não podem ter dois-pontos. Os de "https://" não
 * contam. Sem dois-pontos, um traço com espaços também separa, mas só quando
 * o que vem depois é claramente uma lista: "Time 1 - Os Brabos" é um nome.
 */
function dividirNome(s) {
  for (let i = s.length - 1; i > 0; i--) {
    const depois = s[i + 1];
    if (s[i] !== ':' || depois === '/') continue;
    // Entre dois algarismos é uma hora ou um resultado ("18:00", "2:1"), não um nome.
    if (/\d/.test(s[i - 1]) && /\d/.test(depois ?? '')) continue;
    // Colado ao que vem a seguir, pode estar dentro de um endereço
    // (kick.com/x?t=1:30) e aí não separa nada. Seguido de espaço, ou no fim,
    // separa sempre — é assim que `paraTexto` escreve, e o nome pode ser
    // qualquer coisa, até um endereço.
    if (depois !== undefined && !/\s/.test(depois)
      && /:\/\/|^www\.|kick\.com\//i.test(s.slice(s.lastIndexOf(' ', i) + 1, i))) continue;
    // Dentro de uma nota entre parênteses ou colchetes ("[Discord: Fulano]") não separa.
    const antes = s.slice(0, i);
    if ((antes.match(/[[(]/g) || []).length > (antes.match(/[\])]/g) || []).length) continue;
    const nome = antes.trim();
    // "kick.com/x - Discord: Fulano": um link seguido de nota não é o nome de um time.
    if (/\s/.test(nome) && /kick\.com\//i.test(nome.split(/\s+/)[0]) && lerCanal(nome.split(/\s+/)[0]).slug) continue;
    return nome ? { nome, resto: s.slice(i + 1).trim() } : null;
  }
  const m = s.match(/^(.+?)\s+[-–—=]+>?\s+(.+)$/);
  if (m && /[,;|@]|:\/\/|kick\.com\//i.test(m[2])) return { nome: m[1], resto: m[2] };
  return null;
}

function separadorDe(s) {
  const conta = { '\t': 0, ';': 0, '|': 0, ',': 0 };
  let aspas = false;
  for (const ch of s) {
    if (ch === '"') aspas = !aspas;
    else if (!aspas && ch in conta) conta[ch]++;
  }
  let melhor = null;
  for (const sep of ['\t', ';', '|', ',']) if (conta[sep] && (!melhor || conta[sep] > conta[melhor])) melhor = sep;
  return melhor;
}

/** Células de uma linha de CSV, com aspas. As vazias ficam: a posição é a coluna. */
function partirCelulas(s, sep) {
  const celulas = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspas) {
      if (ch !== '"') atual += ch;
      else if (s[i + 1] === '"') { atual += '"'; i++; } else aspas = false;
    } else if (ch === '"' && !atual.trim()) { aspas = true; atual = ''; } else if (ch === sep) {
      celulas.push(atual.trim());
      atual = '';
    } else atual += ch;
  }
  celulas.push(atual.trim());
  // A moldura de uma tabela Markdown: "| a | b |" tem uma célula vazia em cada ponta.
  if (sep === '|') {
    if (celulas[0] === '') celulas.shift();
    if (celulas.at(-1) === '') celulas.pop();
  }
  return celulas;
}

const COLUNA_TIME = /^(?:nome\s+d[oa]\s+|nombre\s+del\s+)?(?:time|team|equipa|equipe|equipo|squad|grupo|clan)(?:\s+name|\s+nome|\s+\d+)?$/i;

// Palavras que, num cabeçalho, dizem "aqui vai o canal": "Canal da Kick",
// "Kick Username", "Channel Name", "Nome na Kick", "Kick URL"...
const PALAVRAS_DE_CANAL = new Set(['canal', 'canais', 'channel', 'channels', 'kick', 'slug', 'link', 'links', 'url',
  'urls', 'user', 'username', 'usuario', 'usuarios', 'nick', 'nickname', 'handle', 'perfil', 'profile', '@',
  'streamer', 'streamers']);

// "Discord Username" e "E-mail" também têm cara de canal, mas são de outro sítio.
const OUTRO_SITIO = /\b(?:discord|twitch|youtube|twitter|instagram|tiktok|steam|e-?mail|kick\s*-?\s*off)\b/;

function ehColunaDeCanal(celula) {
  const c = String(celula).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!c || OUTRO_SITIO.test(c)) return false;
  return c.split(/[^a-z0-9@]+/).some((p) => PALAVRAS_DE_CANAL.has(p)) || ehRotulo(celula);
}

const semAspas = (c) => c.replace(/^["']|["']$/g, '').trim();
const chaveDeColuna = (sep, i, valor) => `${sep}\u0000${i}\u0000${valor.toLowerCase()}`;

/**
 * Onde aparece, em cada coluna, um valor com cara de nome de coluna de time.
 *
 * Serve para não tomar por cabeçalho uma linha de dados: "Time 1,player1" tem
 * cara de cabeçalho, mas se "Time 1" volta a aparecer na mesma coluna noutra
 * linha, é um time, e aquela é a primeira linha dele.
 */
function colunasDoBloco(bloco) {
  const colunas = new Map();
  for (const { s } of bloco) {
    const sep = s && separadorDe(s);
    if (!sep) continue;
    partirCelulas(s, sep).forEach((celula, i) => {
      const valor = semAspas(celula);
      if (!COLUNA_TIME.test(valor)) return;
      const chave = chaveDeColuna(sep, i, valor);
      const linhas = colunas.get(chave) || new Set();
      if (linhas.size < 2) linhas.add(s.toLowerCase());
      colunas.set(chave, linhas);
    });
  }
  return colunas;
}

/**
 * Um cabeçalho de folha de cálculo: diz qual coluna é o time e quais são canais.
 *
 * Uma exportação de formulário traz colunas a mais (carimbo, Discord, e-mail)
 * e as colunas pela ordem que calhou; uma folha de "um time por linha" traz
 * "Jogador 1" a "Jogador 4". Ler pelo cabeçalho serve as duas e deixa o
 * e-mail de fora sem ter de o reconhecer.
 */
function cabecalho(s, sep, colunas) {
  const celulas = partirCelulas(s, sep).map(semAspas);
  let iTime = -1;
  const iCanais = [];
  celulas.forEach((c, i) => {
    if (iTime < 0 && COLUNA_TIME.test(c)) iTime = i;
    else if (ehColunaDeCanal(c)) iCanais.push(i);
  });
  if (iTime < 0 || !iCanais.length) return null;
  if ((colunas.get(chaveDeColuna(sep, iTime, celulas[iTime]))?.size ?? 0) >= 2) return null;
  // As colunas que só dizem quem é ("Jogador", "Player", "Nome") ao lado de uma que diz onde está o
  // canal ("Link", "Canal", "Kick URL"). Em "Time, Jogador, Link" o nome do jogador não é um canal: lido
  // como tal, cada jogador dava dois ângulos, um deles de um desconhecido com esse nome.
  const iNomes = iCanais.filter((i) => ehColunaDeNome(celulas[i]));
  return { sep, iTime, iCanais, iNomes: iNomes.length < iCanais.length ? iNomes : [] };
}

// Num cabeçalho, as palavras que dizem só o nome da pessoa, e não onde está o canal dela.
const PALAVRAS_DE_NOME = new Set(['nome', 'name', 'nombre', 'jogador', 'jogadores', 'player', 'players',
  'jugador', 'jugadores', 'membro', 'member', 'miembro', 'participante', 'participant']);

function ehColunaDeNome(celula) {
  const c = String(celula).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const palavras = c.split(/[^a-z0-9@]+/).filter((p) => p && !/^\d+$/.test(p) && !['do', 'da', 'de', 'del'].includes(p));
  if (palavras.some((p) => PALAVRAS_DE_CANAL.has(p) && p !== 'streamer' && p !== 'streamers')) return false;
  return ehRotulo(celula) || (palavras.length > 0 && palavras.every((p) => PALAVRAS_DE_NOME.has(p)));
}

/**
 * Uma tabela com cabeçalho e sem coluna de time ("kick_url,seguidores,origem"):
 * o canal vem só da coluna do canal, e o resto (números, notas com vírgulas
 * entre aspas, "[Discord: Fulano]") fica de fora. Todos os canais ficam soltos.
 *
 * O cabeçalho tem de ser a primeira linha do bloco, ter uma coluna que diz
 * "canal" por palavra (um rótulo como "Reservas" não basta) e nenhuma célula
 * escrita como canal; e as linhas de baixo têm de trazer canais nessa coluna.
 * Assim "Nick, kick.com/nick" continua a ser uma linha de dados.
 */
function tabelaSemTime(bloco) {
  return cabecalhoSemTime(bloco) || colunaDeLinks(bloco);
}

/**
 * Uma tabela de três ou mais colunas em que os links estão sempre na mesma
 * coluna e só nela ("Fulano,10,https://kick.com/x"), com ou sem cabeçalho:
 * o canal vem só dessa coluna. Uma folha de "um time por linha" tem links em
 * várias colunas e não entra aqui.
 */
function colunaDeLinks(bloco) {
  const linhas = bloco.map((l, i) => ({ s: l.s, i })).filter((l) => l.s);
  if (linhas.length < 2) return null;
  const sep = separadorDe(linhas.at(-1).s);
  if (!sep || linhas.some((l) => !l.s.includes(sep))) return null;
  const filas = linhas.map((l) => ({ ...l, cel: partirCelulas(l.s, sep).map(semAspas) }));
  if (Math.max(...filas.map((f) => f.cel.length)) < 3) return null;
  const link = (c) => umToken(c) && pareceLink(c);
  const colunas = new Set();
  for (const f of filas) f.cel.forEach((c, j) => { if (pareceLink(c)) colunas.add(j); });
  if (colunas.size !== 1) return null;
  const [j] = colunas;
  const semLink = filas.filter((f) => !link(f.cel[j] ?? ''));
  if (filas.length - semLink.length < 2) return null;
  // Só a primeira linha pode ficar sem link: é o cabeçalho, sem coluna de time.
  if (semLink.length > 1 || (semLink.length && (semLink[0] !== filas[0] || semLink[0].cel.some((c) => COLUNA_TIME.test(c))))) {
    return null;
  }
  return { linha: semLink.length ? filas[0].i : -1, tabela: { sep, iTime: -1, iCanais: [j] } };
}

function cabecalhoSemTime(bloco) {
  const i0 = bloco.findIndex((l) => l.s);
  if (i0 < 0) return null;
  const s = bloco[i0].s;
  const sep = separadorDe(s);
  if (!sep) return null;
  const celulas = partirCelulas(s, sep).map(semAspas);
  if (celulas.length < 2 || celulas.some((c) => !c || canalEscrito(c) || COLUNA_TIME.test(c))) return null;
  const iCanais = [];
  celulas.forEach((c, i) => {
    const n = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!OUTRO_SITIO.test(n) && n.split(/[^a-z0-9@]+/).some((p) => PALAVRAS_DE_CANAL.has(p))) iCanais.push(i);
  });
  if (!iCanais.length) return null;
  let dados = 0;
  let comCanal = 0;
  for (const { s: linha } of bloco.slice(i0 + 1)) {
    if (!linha || !linha.includes(sep)) continue;
    dados++;
    const cel = partirCelulas(linha, sep);
    if (iCanais.some((i) => tokens(cel[i] ?? '').some((t) => lerCanal(t).slug))) comCanal++;
  }
  if (!comCanal || comCanal * 2 < dados) return null;
  return { linha: i0, tabela: { sep, iTime: -1, iCanais } };
}

const umToken = (c) => !/\s/.test(c.trim());
const tokens = (s) => String(s).split(/[\s,;|]+/).filter(Boolean);
const canalEscrito = (c) => /^@/.test(c) || pareceLink(c);

const numero = (c) => /^[\d.,\s]+$/.test(c);
/** Ao lado de um link, o que não é canal: um número, uma nota com espaços, "[Discord:". */
const lixo = (c) => !canalEscrito(c) && (numero(c) || /\s/.test(c.trim()) || !lerCanal(c).slug);

/** Uma frase, não uma lista: "Boa sorte a todos!" não são três canais. */
const ehFrase = (s) => /[.!?]$/.test(s) && s.split(/\s+/).length >= 3 && !/@|kick\.com\//i.test(s);

/**
 * Se as linhas "a,b" de um bloco são um CSV time,canal sem cabeçalho.
 *
 * "alpha,a1" tanto é o time alpha como dois canais. Diz que é CSV um time que
 * se repete (num CSV vem uma linha por canal), ou o canal escrito como link ou
 * @ em todas as linhas, com o time escrito como nome. Aí todas as linhas do
 * bloco são time,canal, também a de um time com um canal só.
 *
 * Só pelos links é mais fraco: "Ricoy, kick.com/ricoy" é a lista mais comum de
 * todas, o nome de cada streamer e o link dele. Por isso conta só quando o
 * bloco é todo de pares (um título por cima é um time com os membros assim) e
 * nenhum nome é o do próprio canal. Devolve 'repete', 'links' ou false.
 */
function ehCsvDeTimes(bloco) {
  const pares = [];
  let linhas = 0;
  for (const { s } of bloco) {
    if (!s) continue;
    linhas++;
    if (dividirNome(s)) continue;
    const sep = separadorDe(s);
    if (!sep) continue;
    const celulas = partirCelulas(s, sep).filter(Boolean);
    if (celulas.length === 2) pares.push(celulas);
  }
  const vezes = new Map();
  for (const [a] of pares) vezes.set(a.toLowerCase(), (vezes.get(a.toLowerCase()) || 0) + 1);
  if ([...vezes.values()].some((n) => n >= 2)) return 'repete';
  return pares.length >= 2 && pares.length === linhas
    && pares.every(([a, b]) => canalEscrito(b) && !canalEscrito(a) && !nomeDoCanal(a, b)) ? 'links' : false;
}

/** "Ricoy" e kick.com/ricoy: o nome escrito é o do próprio canal, e não um time. */
function nomeDoCanal(nome, canal) {
  const slug = lerCanal(canal).slug;
  const so = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return Boolean(slug) && so(nome).length > 0 && so(nome) === so(slug);
}

/**
 * O canal de uma linha de membro, sem o que está à volta dele.
 *
 * Uma coroa à frente, "#1 ricoy", "ricoy (C)", "[CPT] ricoy" e "ricoy - capitão"
 * são todos o ricoy: o enfeite e a nota de papel nunca fazem parte do nome. Se
 * sobra mais de uma palavra ("Mills RP", "Gabi (gabi_br)"), não se escolhe
 * uma, porque escolher era pôr o ângulo de outra pessoa.
 */
function lerMembro(linha) {
  const t = String(linha)
    .replace(/[(\[]\s*([^()[\]]{1,40}?)\s*[)\]]/g, (m, dentro) => (ehNota(dentro) ? ' ' : m))
    .replace(/^#\d{1,3}\s+/, '')
    .replace(/\s+[-–—|:]+\s+(.+)$/, (m, nota) => (ehNota(nota) ? '' : m))
    .trim();
  const palavras = t.split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}_.-]+$/gu, ''))
    .filter((p) => /[\p{L}\p{N}]/u.test(p));
  const semNotas = palavras.filter((p) => !ehNota(p));
  const finais = semNotas.length ? semNotas : palavras;
  return finais.length === 1 ? lerCanal(finais[0]) : { motivo: 'espacos' };
}

/**
 * Um título. `explicito` é o que diz que é título por si: marcado em Markdown,
 * acabado em dois-pontos, com a palavra "time", ou um papel. Os outros, a meio
 * de um bloco, são lidos como membro (ver `lerBloco`).
 */
const tituloDe = (nome, explicito) => ({ tipo: 'titulo', nome, explicito, membro: explicito ? null : lerMembro(nome) });

function classificar({ s, marcado }, ctx) {
  if (!s || /^[-=_~\s|:+]+$/.test(s)) return { tipo: 'ignorar' };

  if (ctx.tabela && s.includes(ctx.tabela.sep)) {
    const celulas = partirCelulas(s, ctx.tabela.sep);
    // Com uma coluna de canal (o link) preenchida nesta linha, o canal vem só dela; a do nome do jogador
    // só conta quando a do canal está vazia.
    const { iCanais, iNomes = [] } = ctx.tabela;
    const doCanal = iCanais.filter((i) => !iNomes.includes(i));
    const preenchida = iNomes.length && doCanal.some((i) => tokens(celulas[i] ?? '').length);
    return {
      tipo: 'linha',
      nome: ctx.tabela.iTime < 0 ? '' : celulas[ctx.tabela.iTime] ?? '',
      canais: (preenchida ? doCanal : iCanais).flatMap((i) => tokens(celulas[i] ?? '')),
    };
  }

  const dividido = dividirNome(s);
  if (dividido) {
    if (!dividido.resto) return tituloDe(dividido.nome, true);
    const canais = tokens(dividido.resto);
    // "Nota: o evento começa às 18h." é uma frase. Só conta como tal se tiver
    // algo que nunca seria canal ("às"): "Team A: a, b, c." é uma lista com
    // um ponto no fim, e deitá-la fora perdia o time inteiro.
    if (ehFrase(dividido.resto) && !canais.every((c) => lerCanal(c).slug)) return { tipo: 'ignorar' };
    return { tipo: 'time', nome: dividido.nome, canais };
  }

  const sep = separadorDe(s);
  if (sep) {
    const cab = cabecalho(s, sep, ctx.colunas);
    if (cab) { ctx.tabela = cab; return { tipo: 'ignorar' }; }
    const celulas = partirCelulas(s, sep).filter(Boolean);
    // Uma linha com links e mais colunas de outra coisa (seguidores, notas):
    // "https://kick.com/x,123,nota livre" e "Fulano,10,kick.com/x" dão só os links.
    const links = celulas.filter(canalEscrito);
    if (links.length && celulas.length >= 2
      && (canalEscrito(celulas[0]) ? celulas.slice(1).some(lixo) : celulas.length >= 3 && celulas.some(numero))) {
      return { tipo: 'canais', canais: links };
    }
    if (celulas.length >= 2) {
      // Uma célula com espaços no meio de uma lista com vírgulas é uma frase.
      if (!celulas.slice(1).every(umToken)) return { tipo: 'ignorar' };
      const primeira = celulas[0];
      // Um link ou um @ à cabeça é um canal, mesmo que inválido: nunca o nome de um time.
      if (canalEscrito(primeira)) return { tipo: 'canais', canais: celulas };
      if (!umToken(primeira) || !lerCanal(primeira).slug) {
        // "Team Ricoy, ricoy" (CSV sem cabeçalho) e "Team Ricoy\tricoy\ttchubi" (folha colada).
        return { tipo: 'time', nome: primeira, canais: celulas.slice(1) };
      }
      if (celulas.length === 2 && ctx.csv) return { tipo: 'linha', nome: primeira, canais: [celulas[1]] };
      // "Ricoy, kick.com/ricoy": o nome do streamer e o link dele são um canal só.
      if (celulas.length === 2 && canalEscrito(celulas[1]) && nomeDoCanal(primeira, celulas[1])) {
        return { tipo: 'canais', canais: [celulas[1]] };
      }
      // "ricoy,tchubi" sem nada que diga que é time,canal: dois canais, e se o
      // bloco tem mais linhas assim, um aviso (ver `lerTexto`).
      return { tipo: 'canais', canais: celulas, par: celulas.length === 2 ? sep : null };
    }
  }

  const palavras = s.split(/\s+/);
  // Um link de outro site também é tratado como canal, para virar aviso: lido
  // como nome de time, desaparecia calado num time vazio.
  const k = palavras.findIndex((p) => canalEscrito(p.replace(/^[(\[{<"'“‘«]+/, '')));
  if (k >= 0) {
    // "Team Ricoy @ricoy @tchubi": o que vem antes do primeiro @ só é nome
    // quando não pode ser canal, ou diz "time"; senão é mais uma lista. Um
    // enfeite à frente (um emoji, "1 - @ricoy") não é nome nenhum.
    // "kick.com/x 38000 nick igual [Discord: Fulano]": um link à cabeça seguido
    // de uma nota dá só os links da linha.
    if (k === 0 && palavras.slice(1).some(lixo)) return { tipo: 'canais', canais: palavras.filter(canalEscrito) };
    const antes = palavras.slice(0, k);
    const nome = limparNome(antes.join(' '));
    const ehNome = /[\p{L}\p{N}]/u.test(nome) && (dizTime(nome) || !antes.every((p) => lerCanal(p).slug));
    return ehNome ? { tipo: 'time', nome, canais: palavras.slice(k) }
      : { tipo: 'canais', canais: palavras.filter((p) => /[\p{L}\p{N}]/u.test(p)) };
  }
  const nome = limparNome(s);
  if (marcado || ehRotulo(nome) || ehSoltos(nome)) return tituloDe(s, true);
  if (ehFrase(s)) return { tipo: 'ignorar' };
  // Algo que não pode ser canal é um nome: "Team #1", "Águias", "Los Pibes!".
  if (!palavras.every((p) => lerCanal(p).slug)) return tituloDe(s, dizTime(nome));
  if (palavras.length === 1) return { tipo: 'palavra', nome: s, canais: palavras };
  if (palavras.some((p) => PALAVRAS_DE_TIME.has(p.toLowerCase()))) return tituloDe(s, true);
  // Duas palavras numa linha de membro são um nome com espaço ("Mills RP"), ou
  // um nome com nota ("ricoy (C)"); três ou mais são uma lista.
  return { tipo: 'palavras', nome: s, canais: palavras, membro: palavras.length === 2 ? lerMembro(s) : null };
}

/** Uma linha com um canal só, como as de debaixo do nome de um time. */
const umPorLinha = (c) => Boolean(c) && (((c.tipo === 'palavra' || c.tipo === 'canais') && c.canais.length === 1)
  || ((c.tipo === 'titulo' || c.tipo === 'palavras') && !c.explicito && Boolean(c.membro?.slug)));

/**
 * Texto livre: linhas "Nome: a, b", blocos "nome + um por linha", CSV, soltos.
 *
 * O texto parte-se em blocos nas linhas em branco, e cada bloco é lido à
 * parte: uma tabela acaba no fim do bloco, e um CSV num bloco não muda a
 * leitura de uma lista noutro.
 *
 * O caso difícil é o bloco cujo nome também podia ser um canal ("Oilrats" por
 * cima de oilrats, trausi, posty...). Uma linha destas, sozinha, é um canal.
 * Só é nome quando o texto se mostra organizado em blocos: pelo menos dois
 * blocos separados por linha em branco, cada um com um nome e um canal por
 * linha. Assim uma lista simples nunca perde o primeiro.
 */
function lerTexto(texto, ac) {
  const blocos = [[]];
  for (const l of String(texto).split(/\r\n?|\n/).map(prepararLinha)) {
    if (!ehSeparador(l)) blocos.at(-1).push(l);
    else if (blocos.at(-1).length) blocos.push([]);
  }

  const lidos = blocos.map((bloco) => {
    const semTime = tabelaSemTime(bloco);
    const ctx = semTime ? { tabela: semTime.tabela, colunas: new Map(), csv: false }
      : { tabela: null, colunas: colunasDoBloco(bloco), csv: ehCsvDeTimes(bloco) };
    if (ctx.csv === 'links') {
      const primeira = bloco.find((l) => l.s)?.s;
      ac.aviso(`as linhas como "${primeira}" foram lidas como time,canal, um time por linha; se a primeira coluna for o nome do streamer, apague-a`);
    }
    const lido = [];
    for (const [i, l] of bloco.entries()) {
      if (semTime && i === semTime.linha) continue;
      const c = classificar(l, ctx);
      if (c.tipo !== 'ignorar') lido.push({ ...c, s: l.s });
    }
    return lido;
  }).filter((b) => b.length);

  const classico = (b) => b.length >= 2 && b.slice(1).every(umPorLinha);
  const emBlocos = lidos.filter((b) => classico(b) && ['palavra', 'palavras', 'titulo'].includes(b[0].tipo)).length >= 2;

  for (const bloco of lidos) lerBloco(bloco, ac, { eClassico: classico(bloco), emBlocos });
}

/**
 * Um bloco de linhas, com o time de cada canal.
 *
 * Depois de um título vem um membro por linha até ao fim do bloco. Uma linha
 * que não dá um canal fica de fora com aviso, e não abre um time novo: abrir
 * levava os membros seguintes para um time que não existe. Só abre um time a
 * linha que diz que é título (ver `tituloDe`), ou o primeiro nome debaixo de
 * uma secção ("Times:", e o nome do primeiro time logo a seguir).
 *
 * Uma linha "Time: a, b" fecha-se em si: um canal solto logo a seguir não é
 * desse time, vai para os soltos, e um aviso diz que faltou a linha em branco.
 * Um nome logo a seguir abre outro time, como no começo de um bloco. Uma
 * linha de papel ("Reservas: a3") continua a ser do time de cima.
 */
function lerBloco(bloco, ac, { eClassico, emBlocos }) {
  let atual = null;      // o time que recebe os canais deste bloco
  let titulo = null;     // o último título do bloco: depois dele, um membro por linha
  let membros = 0;       // canais desde esse título
  let deLinha = null;    // o time da última linha "Time: a, b", que não recebe mais nada
  let fechado = false;   // a última linha foi uma "Time: a, b" (ou de tabela), que se fecha em si
  let papel = null;      // o papel sem time que está a mandar canais para os soltos

  const pares = bloco.filter((c) => c.par);
  if (pares.length >= 2) {
    const sep = pares[0].par;
    const cab = sep === '\t' ? 'uma linha de cabeçalho com "time" e "canal"' : `a linha "time${sep}canal"`;
    ac.aviso(`as linhas como "${pares[0].s}" ficaram como dois canais cada; se a primeira coluna for o time, ponha por cima ${cab}`);
  }
  // Uma lista que abre com um nome com maiúsculas ("Oilrats" por cima de
  // oilrats, trausi...) pode ser um time. Sozinha não se sabe, e fica canal.
  const primeiro = bloco[0];
  if (eClassico && !emBlocos && primeiro.tipo === 'palavra' && /\p{Lu}/u.test(primeiro.nome)
    && !bloco.slice(1).some((c) => /\p{Lu}/u.test(c.s))) {
    ac.aviso(`"${primeiro.nome}" ficou como canal; se for o nome de um time, escreva "${primeiro.nome}:"`);
  }

  const ePapel = (nome) => {
    const n = limparNome(nome);
    return Boolean(n) && ehRotulo(n);
  };
  // Um rótulo ("Reservas:") fica no time de cima; "Sem time:" manda para os soltos.
  const definir = (nome) => {
    const n = limparNome(nome);
    if (ehSoltos(n)) { papel = null; return null; }
    if (!n) return atual;
    if (ehRotulo(n)) {
      if (atual) return atual;
      papel = n;
      return null;
    }
    papel = null;
    return ac.time(n);
  };
  const juntar = (lista, time) => {
    for (const cru of lista) {
      if (ehNotaEntreParenteses(cru)) continue;
      const r = ac.token(cru, time);
      if (!r) continue;
      membros++;
      if (r.solto && !time && papel) ac.aviso(avisoDePapel(papel));
    }
  };
  const abrirTitulo = (nome) => {
    atual = definir(nome);
    titulo = { secao: ehSecao(nome) };
    membros = 0;
    deLinha = null;
    fechado = false;
  };
  // Canais sem nome de time na mesma linha.
  const soltar = (lista) => {
    if (!deLinha) { juntar(lista, atual); return; }
    for (const cru of lista) {
      if (ehNotaEntreParenteses(cru)) continue;
      const r = ac.token(cru, null);
      if (r?.solto) ac.aviso(`"${r.slug}" veio logo depois de "${deLinha.nome}" sem linha em branco; ficou sem time`);
    }
  };
  const ficouDeFora = (c) => {
    const time = deLinha ? null : atual;
    const motivo = c.membro?.motivo === 'espacos' ? 'um canal da Kick não tem espaços' : 'não é um nome de canal da Kick';
    ac.aviso(`"${c.s}" ficou de fora${time ? ` de "${time.nome}"` : ''}: ${motivo}`);
  };

  bloco.forEach((c, i) => {
    switch (c.tipo) {
      case 'titulo':
        if (i === 0 || c.explicito) abrirTitulo(c.nome);
        else if (c.membro?.slug) soltar([c.membro.slug]);
        else if (fechado || (titulo?.secao && !membros)) abrirTitulo(c.nome);
        else ficouDeFora(c);
        break;
      case 'time':
        // Um papel com um time por cima é desse time, e não fecha nada.
        if (atual && ePapel(c.nome)) { juntar(c.canais, atual); break; }
        atual = definir(c.nome);
        titulo = null;
        juntar(c.canais, atual);
        deLinha = atual;
        fechado = true;
        break;
      case 'linha': {
        const n = limparNome(c.nome);
        atual = ac.time(n);
        papel = !atual && n && ehRotulo(n) ? n : null;
        titulo = null;
        juntar(c.canais, atual);
        deLinha = atual;
        fechado = true;
        break;
      }
      case 'palavras':
        if (i === 0 && eClassico) abrirTitulo(c.nome);
        // "Os Lobos" logo depois de "Time: a, b", com um canal por linha por baixo, é outro time.
        else if (fechado && c.membro && !c.membro.slug && umPorLinha(bloco[i + 1])) abrirTitulo(c.nome);
        else if (titulo && c.membro) {
          if (c.membro.slug) soltar([c.membro.slug]);
          else if (titulo.secao && !membros) abrirTitulo(c.nome);
          else ficouDeFora(c);
        } else soltar(c.canais);
        break;
      case 'palavra':
        if (i === 0 && eClassico && emBlocos) abrirTitulo(c.nome); else soltar(c.canais);
        break;
      default: soltar(c.canais);
    }
  });
}

// ── API ─────────────────────────────────────────────────────────────────────

/**
 * O elenco escrito em `texto`, seja ele o que for.
 *
 * HTML (o código-fonte da página de times) é lido pelos títulos e pelos links;
 * tudo o resto é lido linha a linha, também as linhas de texto que vierem
 * junto com um pedaço de HTML. Nunca atira: texto que não se percebe dá um
 * elenco vazio e um aviso a dizer isso mesmo.
 */
export function lerElenco(texto) {
  const ac = novoAcumulador();
  const cru = typeof texto === 'string' ? texto : texto == null ? '' : String(texto);
  if (pareceHtml(cru)) lerPagina(cru, ac); else lerTexto(cru, ac);
  const r = ac.resultado();
  // À cabeça: é o único aviso que explica todos os outros, e não pode ficar
  // escondido no "e mais N".
  if (cru.trim() && !ac.totalDeCanais()) r.avisos.unshift('não encontrei nenhum canal da Kick neste texto');
  return r;
}

/**
 * Um elenco qualquer, posto nas regras do `lerElenco`.
 *
 * Um elenco feito à mão, ou vindo de um link de outra pessoa, pode ter canais
 * em maiúsculas, repetidos ou inválidos. Passar tudo pelo mesmo acumulador
 * garante que o que se escreve, codifica ou conta é o mesmo que se leria.
 */
function normalizar(elenco) {
  const ac = novoAcumulador();
  for (const t of Array.isArray(elenco?.times) ? elenco.times : []) {
    const nome = limparNome(typeof t?.nome === 'string' ? t.nome : '');
    const time = ac.time(nome);
    let soltou = false;
    for (const c of Array.isArray(t?.canais) ? t.canais : []) if (ac.token(c, time)?.solto) soltou = true;
    // Um time chamado "Staff" ou "Players" não existe: os canais dele ficam sem
    // time, mas não calados.
    if (soltou && !time && ehRotulo(nome)) ac.aviso(avisoDePapel(nome));
  }
  for (const c of Array.isArray(elenco?.soltos) ? elenco.soltos : []) ac.token(c, null);
  return ac.resultado();
}

/**
 * O elenco em texto, uma linha por time e os soltos no fim.
 *
 * É o formato que se pode mostrar numa caixa para corrigir à mão e colar de
 * volta: `lerElenco(paraTexto(e))` dá o mesmo elenco. Os soltos levam o
 * rótulo "Sem time" em vez de irem sozinhos numa linha, porque um canal
 * sozinho numa linha seria confundido com o nome do time seguinte.
 */
export function paraTexto(elenco) {
  const e = normalizar(elenco);
  const linhas = e.times.map((t) => `${t.nome}: ${t.canais.join(', ')}`);
  if (e.soltos.length) {
    if (linhas.length) linhas.push('');
    linhas.push(`Sem time: ${e.soltos.join(', ')}`);
  }
  return linhas.join('\n');
}

/** Quantos times e quantos canais, contando cada canal uma vez, com os soltos. */
export function contar(elenco) {
  const e = normalizar(elenco);
  return { times: e.times.length, canais: e.times.reduce((s, t) => s + t.canais.length, 0) + e.soltos.length };
}

// ── link ────────────────────────────────────────────────────────────────────

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * O nome do time sem o nome do capitão lá dentro.
 *
 * Medido: no Rust Kick Off 2, oito de dez times chamam-se "Team <capitão>".
 * O deflate não junta "Ricoy" a "ricoy" (maiúscula diferente), por isso cada
 * nome custava o capitão outra vez — ~4 bytes por time, 670 caracteres em 125
 * times, a diferença entre caber e não caber nos 4000. `*` quer dizer "o
 * primeiro canal com maiúscula" e `` ` `` "o primeiro canal tal e qual"; os dois
 * são seguros porque `limparNome` os tira de qualquer nome.
 *
 * Os 4000 só ficam garantidos com nomes assim. Com nomes que não têm nada a
 * ver com os canais ("Night Raiders") o mesmo evento dá uns 4100 a 4350: o
 * link abre na mesma, mas pode não caber numa mensagem de 4000 caracteres.
 */
function marcarNome(nome, primeiro) {
  if (!primeiro) return nome;
  const cap = capitalizar(primeiro);
  if (nome.includes(cap)) return nome.replace(cap, '*');
  if (nome.includes(primeiro)) return nome.replace(primeiro, '`');
  return nome;
}

function desmarcarNome(nome, primeiro) {
  if (!primeiro) return nome;
  return nome.replace('*', () => capitalizar(primeiro)).replace('`', () => primeiro);
}

function paraBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Descomprime, mas desiste antes de passar de `limite` bytes.
 *
 * Um link é texto de outra pessoa. Uns poucos KB de deflate podem pedir
 * gigabytes ao descomprimir, e sem este limite um link no Discord bastava
 * para pendurar o separador de quem clicasse.
 */
async function inflar(bytes, limite) {
  const leitor = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > limite) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  const saida = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { saida.set(p, o); o += p.length; }
  return saida;
}

/**
 * O elenco num texto curto que cabe num endereço (JSON, deflate, base64url),
 * ou `null` se o elenco não se poderia abrir de um link.
 *
 * Para mandar o evento inteiro num link: quem abre não precisa de colar nada.
 * Os canais de um time vão juntos numa só string com espaços (um canal não
 * tem espaços), que é metade das aspas e vírgulas de uma lista.
 *
 * Os limites são os de `descodificar`: um link que ele recusaria era um link
 * estragado na mão de quem o recebe. Quem chama tem de tratar o `null`.
 */
export async function codificar(elenco) {
  const e = normalizar(elenco);
  if (e.times.reduce((n, t) => n + t.canais.length, e.soltos.length) > MAXIMO_CANAIS) return null;
  const json = JSON.stringify({
    v: 1,
    t: e.times.map((t) => [marcarNome(t.nome, t.canais[0]), t.canais.join(' ')]),
    s: e.soltos.join(' '),
  });
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAXIMO_DESCOMPRIMIDO) return null;
  const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const s = paraBase64Url(new Uint8Array(await new Response(fluxo).arrayBuffer()));
  return s.length > MAXIMO_LINK ? null : s;
}

/**
 * O elenco de volta, ou `null` se `s` não for um elenco.
 *
 * Um link chega cortado, editado à mão ou de uma versão que ainda não existe.
 * Tudo o que não se lê inteiro é "não há elenco", nunca meio elenco que parece
 * certo — e o que se lê passa pelas mesmas regras que o texto colado, porque
 * os canais de um link são tão pouco de confiança como os de uma página.
 */
export async function descodificar(s) {
  if (typeof s !== 'string') return null;
  const limpo = s.trim();
  if (!limpo || limpo.length > MAXIMO_LINK || !/^[A-Za-z0-9_-]+$/.test(limpo)) return null;
  let j;
  try {
    const bytes = await inflar(deBase64Url(limpo), MAXIMO_DESCOMPRIMIDO);
    if (!bytes) return null;
    j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }

  if (!j || typeof j !== 'object' || Array.isArray(j) || j.v !== 1 || !Array.isArray(j.t)) return null;
  if (j.s != null && typeof j.s !== 'string') return null;
  if (!j.t.every((p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string')) {
    return null;
  }
  const times = j.t.map(([nome, lista]) => {
    const canais = lista.split(' ').filter(Boolean);
    return { nome: desmarcarNome(nome, canais[0]), canais };
  });
  const soltos = (j.s || '').split(' ').filter(Boolean);
  if (times.length > MAXIMO_CANAIS || times.reduce((n, t) => n + t.canais.length, soltos.length) > MAXIMO_CANAIS) {
    return null;
  }
  return normalizar({ times, soltos });
}
