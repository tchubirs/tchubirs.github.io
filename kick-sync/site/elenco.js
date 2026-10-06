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
  let t = String(cru ?? '').trim()
    .replace(/^[(\[{<"'“‘«]+/, '')
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
  // ponto no fim de um nome é pontuação muito mais vezes do que é nome.
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
 */
function limparNome(cru) {
  let n = String(cru ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/\[([^\]]*)\]\(\s*([^)\s]*)\s*\)/g, ' $2 ')
    .replace(/[<>*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 8; i++) {
    const antes = n;
    n = n.replace(/^#{1,6}(?:\s+|$)/, '')
      .replace(/^(?:[-•·+]|\d{1,3}[.)])(?:\s+|$)/, '')
      .slice(0, 80)
      .replace(/[\s:]+$/, '')
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
    quantosTimes: () => times.length,
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
    },
    /** Um token lido de texto: entra, ou vira aviso a dizer porquê. */
    token(cru, time) {
      const r = lerCanal(cru);
      if (r.slug) { ac.juntar(r.slug, time); return true; }
      if (r.motivo === 'outro-site') ac.aviso(`"${r.texto}" não é da Kick; ficou de fora`);
      else if (r.motivo === 'nao-e-canal') ac.aviso(`"${r.texto}" é uma página da Kick, não um canal; ficou de fora`);
      else if (r.motivo === 'invalido') ac.aviso(`"${r.texto}" não é um nome de canal da Kick; ficou de fora`);
      return false;
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

function atributo(attrs, nome) {
  const m = String(attrs).match(new RegExp(`\\b${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodificarEntidades(m[1] ?? m[2] ?? m[3]) : null;
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

/**
 * Página de times: cada link da Kick vai para o título mais próximo acima dele.
 *
 * Três cuidados que a regra simples não tem:
 *  - Um subtítulo de papel ("Players", "Capitão") por baixo do título do time
 *    não abre time novo. O mesmo para um subtítulo que se repete debaixo de
 *    títulos DIFERENTES ("Main" em cada cartão) — o nome de um time não se
 *    repete em times diferentes. Um título repetido debaixo do MESMO pai é a
 *    versão de telemóvel do mesmo cartão, e junta-se ao primeiro.
 *  - O link pertence ao título onde FECHA: `<a href><h3>Team X</h3></a>` é o
 *    capitão do Team X, não do time de cima.
 *  - <nav> e <footer> fora de um <article> cortam o time: os links do rodapé
 *    são do site, não do último time da página.
 */
function lerHtml(html, ac) {
  const limpo = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ');

  const fechos = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const m of limpo.matchAll(/<\/h([1-6])\s*>/gi)) fechos[m[1]].push(m.index);

  const titulos = new Map();
  const pilha = [];
  const estatisticas = new Map();
  for (const m of limpo.matchAll(/<h([1-6])(?=[\s>\/])([^>]*)>/gi)) {
    const nivel = Number(m[1]);
    const nome = limparNome(textoDoTitulo(limpo, m.index + m[0].length, nivel, m[2], fechos));
    const chave = nome.toLowerCase();
    while (pilha.length && pilha.at(-1).nivel >= nivel) pilha.pop();
    const pai = pilha.at(-1)?.chave;
    pilha.push({ nivel, chave });
    titulos.set(m.index, { nivel, nome, chave });
    if (!chave) continue;
    const e = estatisticas.get(chave) || { n: 0, pais: new Set(), orfao: false };
    e.n++;
    if (pai === undefined) e.orfao = true; else e.pais.add(pai);
    estatisticas.set(chave, e);
  }
  const repetidoComoRotulo = (chave) => {
    const e = estatisticas.get(chave);
    return Boolean(e && e.n >= 2 && !e.orfao && e.pais.size >= 2);
  };

  let atual = null;
  let nivelAtual = 0;
  let pendente = null;
  let artigos = 0;
  const largar = () => { if (pendente) ac.juntar(pendente, atual); pendente = null; };

  for (const m of limpo.matchAll(/<(\/?)(a|h[1-6]|nav|footer|article)(?=[\s>\/])([^>]*)>/gi)) {
    const fecha = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'a') {
      largar();
      if (!fecha) pendente = canalDeLink(atributo(m[3], 'href'));
    } else if (tag === 'article') {
      artigos = fecha ? Math.max(0, artigos - 1) : artigos + 1;
    } else if (tag === 'nav' || tag === 'footer') {
      if (!fecha && !artigos) { largar(); atual = null; nivelAtual = 0; }
    } else if (!fecha) {
      const t = titulos.get(m.index);
      if (!t) continue;
      if (t.nome && ehSoltos(t.nome)) { atual = null; nivelAtual = t.nivel; continue; }
      if (t.nome && (ehRotulo(t.nome) || repetidoComoRotulo(t.chave))) {
        // Fica no time de cima se houver um por cima dele; um "Streamers"
        // mais alto do que os times é uma secção nova, sem time.
        if (!(atual && nivelAtual <= t.nivel)) { atual = null; nivelAtual = t.nivel; }
        continue;
      }
      // Sem nome nenhum, nem no alt: um nome de recurso é mais honesto do que
      // somar estes canais ao time de cima.
      atual = ac.time(t.nome || `Time ${ac.quantosTimes() + 1}`);
      nivelAtual = t.nivel;
    }
  }
  largar();

  if (!ac.totalDeCanais()) {
    // Páginas montadas por JavaScript não têm os links no HTML, mas costumam
    // trazer os dados num <script> (com as barras escapadas: https:\/\/...).
    // Sem títulos não há times, mas os canais ainda servem.
    const crus = String(html).replace(/\\\//g, '/')
      .match(/(?:https?:)?\/\/(?:[a-z0-9-]+\.)*kick\.com\/[^\s"'<>\\)]+/gi) || [];
    for (const u of crus) {
      const slug = canalDeLink(u);
      if (slug) ac.juntar(slug, null);
    }
    if (ac.totalDeCanais()) {
      ac.aviso(`esta página não tem títulos com links da Kick por baixo; os ${ac.totalDeCanais()} canais encontrados ficaram sem time`);
    }
  }
}

// ── texto ───────────────────────────────────────────────────────────────────

/** Limpa o que o Discord e o Markdown põem à volta de uma linha. */
function prepararLinha(cru) {
  let s = String(cru)
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/\[([^\]]*)\]\(\s*([^)\s]*)\s*\)/g, ' $2 ')
    .replace(/<((?:https?:)?\/\/[^>\s]+)>/gi, ' $1 ')
    .trim();
  let marcado = false;
  const titulo = s.match(/^#{1,6}\s+(.*)$/);
  if (titulo) { marcado = true; s = titulo[1]; }
  if (/^(?:\*\*.+\*\*|__.+__):?$/.test(s)) { marcado = true; s = s.replace(/^(?:\*\*|__)|(?:\*\*|__)(?=:?$)/g, ''); }
  for (let i = 0; i < 4; i++) s = s.replace(/^(?:[-*•·+>]|\d{1,3}[.)])\s+/, '');
  return { s: s.replace(/[*`]/g, '').trim(), marcado };
}

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
    const nome = s.slice(0, i).trim();
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

const COLUNA_TIME = /^(?:nome\s+d[oa]\s+)?(?:time|team|equipa|equipe|squad|grupo|clan)(?:\s+name|\s+\d+)?$/i;
const COLUNA_CANAL = /^(?:canal|canais|channel|channels|kick|slug|link|links|url|user(?:name)?|nick(?:name)?|usu[aá]rio|handle|@)(?:\s+(?:d[aoe]|na|no|on|in)\s+kick|\s+kick|\s+\d+|\s+url|\s+link)?$/i;

/**
 * Um cabeçalho de folha de cálculo: diz qual coluna é o time e quais são canais.
 *
 * Uma exportação de formulário traz colunas a mais (carimbo, Discord, e-mail)
 * e as colunas pela ordem que calhou; uma folha de "um time por linha" traz
 * "Jogador 1" a "Jogador 4". Ler pelo cabeçalho serve as duas e deixa o
 * e-mail de fora sem ter de o reconhecer.
 */
function cabecalho(s, sep) {
  const celulas = partirCelulas(s, sep).map((c) => c.replace(/^["']|["']$/g, '').trim());
  let iTime = -1;
  const iCanais = [];
  celulas.forEach((c, i) => {
    if (iTime < 0 && COLUNA_TIME.test(c)) iTime = i;
    else if (COLUNA_CANAL.test(c) || ROTULO.test(c)) iCanais.push(i);
  });
  return iTime >= 0 && iCanais.length ? { sep, iTime, iCanais } : null;
}

const umToken = (c) => !/\s/.test(c.trim());
const tokens = (s) => String(s).split(/[\s,;|]+/).filter(Boolean);

/** Uma frase, não uma lista: "Boa sorte a todos!" não são três canais. */
const ehFrase = (s) => /[.!?]$/.test(s) && s.split(/\s+/).length >= 3 && !/@|kick\.com\//i.test(s);

function classificar({ s, marcado }, ctx) {
  if (!s || /^[-=_~\s|:+]+$/.test(s)) return { tipo: 'vazia' };

  if (ctx.tabela && s.includes(ctx.tabela.sep)) {
    const celulas = partirCelulas(s, ctx.tabela.sep);
    return {
      tipo: 'linha',
      nome: celulas[ctx.tabela.iTime] ?? '',
      canais: ctx.tabela.iCanais.flatMap((i) => tokens(celulas[i] ?? '')),
    };
  }

  const dividido = dividirNome(s);
  if (dividido) {
    if (!dividido.resto) return { tipo: 'titulo', nome: dividido.nome };
    const canais = tokens(dividido.resto);
    // "Nota: o evento começa às 18h." é uma frase. Só conta como tal se tiver
    // algo que nunca seria canal ("às"): "Team A: a, b, c." é uma lista com
    // um ponto no fim, e deitá-la fora perdia o time inteiro.
    if (ehFrase(dividido.resto) && !canais.every((c) => lerCanal(c).slug)) return { tipo: 'ignorar' };
    return { tipo: 'time', nome: dividido.nome, canais };
  }

  const sep = separadorDe(s);
  if (sep) {
    const cab = cabecalho(s, sep);
    if (cab) { ctx.tabela = cab; return { tipo: 'ignorar' }; }
    const celulas = partirCelulas(s, sep).filter(Boolean);
    if (celulas.length >= 2) {
      // Uma célula com espaços no meio de uma lista com vírgulas é uma frase.
      if (!celulas.slice(1).every(umToken)) return { tipo: 'ignorar' };
      const primeira = celulas[0];
      // Um link ou um @ à cabeça é um canal, mesmo que inválido: nunca o nome de um time.
      if (/^@/.test(primeira) || pareceLink(primeira)) return { tipo: 'canais', canais: celulas };
      if (!umToken(primeira) || !lerCanal(primeira).slug) {
        // "Team Ricoy, ricoy" (CSV sem cabeçalho) e "Team Ricoy\tricoy\ttchubi" (folha colada).
        return { tipo: 'time', nome: primeira, canais: celulas.slice(1) };
      }
      // "ricoy,tchubi" tanto é um CSV time,canal como dois canais. Num CSV o
      // time repete-se em cada linha (quatro por time); dois canais soltos não.
      if (celulas.length === 2 && (ctx.repetidos.get(primeira.toLowerCase()) || 0) >= 2) {
        return { tipo: 'linha', nome: primeira, canais: [celulas[1]] };
      }
      return { tipo: 'canais', canais: celulas };
    }
  }

  const palavras = s.split(/\s+/);
  // Um link de outro site também é tratado como canal, para virar aviso: lido
  // como nome de time, desaparecia calado num time vazio.
  const k = palavras.findIndex((p) => {
    const nu = p.replace(/^[(\[{<"'“‘«]+/, '');
    return /^@/.test(nu) || pareceLink(nu);
  });
  if (k >= 0) {
    // "Team Ricoy @ricoy @tchubi": o que vem antes do primeiro @ só é nome
    // quando não pode ser canal, ou diz "time"; senão é mais uma lista.
    const antes = palavras.slice(0, k);
    const ehNome = antes.length && (antes.some((p) => PALAVRAS_DE_TIME.has(p.toLowerCase()))
      || !antes.every((p) => lerCanal(p).slug));
    return ehNome ? { tipo: 'time', nome: antes.join(' '), canais: palavras.slice(k) }
      : { tipo: 'canais', canais: palavras };
  }
  const nome = limparNome(s);
  if (marcado || ehRotulo(nome) || ehSoltos(nome)) return { tipo: 'titulo', nome: s };
  if (ehFrase(s)) return { tipo: 'ignorar' };
  // Algo que não pode ser canal é um nome: "Team #1", "Águias", "Los Pibes!".
  if (!palavras.every((p) => lerCanal(p).slug)) return { tipo: 'titulo', nome: s };
  if (palavras.length === 1) return { tipo: 'palavra', nome: s, canais: palavras };
  if (palavras.some((p) => PALAVRAS_DE_TIME.has(p.toLowerCase()))) return { tipo: 'titulo', nome: s };
  return { tipo: 'palavras', nome: s, canais: palavras };
}

/**
 * Texto livre: linhas "Nome: a, b", blocos "nome + um por linha", CSV, soltos.
 *
 * O caso difícil é o bloco cujo nome também podia ser um canal ("Oilrats" por
 * cima de oilrats, trausi, posty...). Uma linha destas, sozinha, é um canal.
 * Só é nome quando o texto se mostra organizado em blocos — pelo menos dois
 * blocos separados por linha em branco, cada um com um nome e um canal por
 * linha. Assim uma lista simples de canais nunca perde o primeiro.
 */
function lerTexto(texto, ac) {
  const linhas = String(texto).split(/\r\n?|\n/).map(prepararLinha);

  const repetidos = new Map();
  for (const { s } of linhas) {
    if (!s || dividirNome(s)) continue;
    const sep = separadorDe(s);
    if (!sep) continue;
    const celulas = partirCelulas(s, sep).filter(Boolean);
    if (celulas.length !== 2) continue;
    const chave = celulas[0].toLowerCase();
    repetidos.set(chave, (repetidos.get(chave) || 0) + 1);
  }

  const ctx = { repetidos, tabela: null };
  const blocos = [[]];
  for (const l of linhas) {
    const c = classificar(l, ctx);
    if (c.tipo === 'vazia') { if (blocos.at(-1).length) blocos.push([]); continue; }
    if (c.tipo !== 'ignorar') blocos.at(-1).push(c);
  }

  const umCanalPorLinha = (c) => (c.tipo === 'palavra' || c.tipo === 'canais') && c.canais.length === 1;
  const classico = (b) => b.length >= 2 && b.slice(1).every(umCanalPorLinha);
  const emBlocos = blocos.filter((b) => classico(b) && ['palavra', 'palavras', 'titulo'].includes(b[0].tipo)).length >= 2;

  for (const bloco of blocos) {
    let atual = null;
    // Um rótulo ("Reservas:") fica no time de cima; "Sem time:" manda para os soltos.
    const definir = (nome) => {
      const n = limparNome(nome);
      if (ehSoltos(n)) return null;
      if (!n || ehRotulo(n)) return atual;
      return ac.time(n);
    };
    const juntar = (canais, time) => { for (const c of canais) ac.token(c, time); };
    const eClassico = classico(bloco);

    bloco.forEach((c, i) => {
      const nomeDoBloco = i === 0 && eClassico;
      switch (c.tipo) {
        case 'titulo': atual = definir(c.nome); break;
        case 'time': atual = definir(c.nome); juntar(c.canais, atual); break;
        case 'linha': atual = ac.time(c.nome); juntar(c.canais, atual); break;
        case 'palavras':
          if (nomeDoBloco) atual = definir(c.nome); else juntar(c.canais, atual);
          break;
        case 'palavra':
          if (nomeDoBloco && emBlocos) atual = definir(c.nome); else juntar(c.canais, atual);
          break;
        default: juntar(c.canais, atual);
      }
    });
  }
}

// ── API ─────────────────────────────────────────────────────────────────────

/**
 * O elenco escrito em `texto`, seja ele o que for.
 *
 * HTML (o código-fonte da página de times) é lido pelos títulos e pelos links;
 * tudo o resto é lido linha a linha. Nunca atira: texto que não se percebe dá
 * um elenco vazio e um aviso a dizer isso mesmo.
 */
export function lerElenco(texto) {
  const ac = novoAcumulador();
  const cru = typeof texto === 'string' ? texto : texto == null ? '' : String(texto);
  if (pareceHtml(cru)) lerHtml(cru, ac); else lerTexto(cru, ac);
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
    const time = ac.time(typeof t?.nome === 'string' ? t.nome : '');
    for (const c of Array.isArray(t?.canais) ? t.canais : []) ac.token(c, time);
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

/** Quantos times e quantos canais, contando cada canal uma vez. */
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
 * O elenco num texto curto que cabe num endereço (JSON, deflate, base64url).
 *
 * Para mandar o evento inteiro num link: quem abre não precisa de colar nada.
 * Os canais de um time vão juntos numa só string com espaços (um canal não
 * tem espaços), que é metade das aspas e vírgulas de uma lista.
 */
export async function codificar(elenco) {
  const e = normalizar(elenco);
  const dados = {
    v: 1,
    t: e.times.map((t) => [marcarNome(t.nome, t.canais[0]), t.canais.join(' ')]),
    s: e.soltos.join(' '),
  };
  const fluxo = new Blob([JSON.stringify(dados)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return paraBase64Url(new Uint8Array(await new Response(fluxo).arrayBuffer()));
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
