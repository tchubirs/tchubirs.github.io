// Os melhores lances do evento numa lista só, cada um com o motivo em palavras (IDEIAS.md, item 2).
//
// Quem testou o OpusClip diz que a nota dele falha: clipes com nota baixa foram melhor do que os
// "vencedores", e um número sem motivo não ajuda a decidir. Aqui não há nota escondida: cada lance diz
// o que o pôs na lista ("chat 6 vezes o normal em 3 canais, tiros ouvidos em 4 ângulos, 1 kill
// marcada") e a nota é uma soma que fica escrita ao lado, parte a parte.
//
// Os sinais são os que o Povix já tem: os picos de chat de cada canal (lidos no mapa ou na faixa), o que
// a detecção ouviu (tiros, explosões, gritos) e as kills marcadas na montagem. Sinais de canais
// diferentes a menos de um minuto uns dos outros são o mesmo lance quando os canais são do mesmo time
// ou o som confirmou que estavam no mesmo sítio: é isso que nenhuma ferramenta de um canal só consegue
// dizer, "4 POVs ouviram a mesma briga". Dois picos que só calharam no mesmo minuto ficam separados.
//
// O chat conta pelo normal de cada canal, e não pelo número de mensagens: 30 mensagens num minuto num
// canal de 2 por minuto é um lance; num canal de 200 mil seguidores é o chat a passar.
//
// Tudo aqui é conta, sem página: os testes correm em node.

import { t, tn, idiomaActual } from './idiomas.js';

// Dois sinais a menos disto um do outro (de qualquer canal) são o mesmo lance.
export const JUNTAR_MS = 60_000;
// Mas um lance não cresce sem fim: numa hora de luta seguida, juntar sinal a sinal dava um lance só.
export const LANCE_MAX_MS = 3 * 60_000;
// Quanto antes do lance o vídeo abre: o chat reage depois do que aconteceu (o atraso da live mais o
// tempo de ler e escrever), e é a mesma folga dos botões de pico do mapa.
export const ANTES_MS = 10_000;

// Os pontos de cada sinal. O chat dá as vezes que passou do normal daquele canal, até 10 por canal;
// tiros e explosões dão 2 por ângulo que os ouviu; um grito, 1; uma kill marcada à mão, 5; e cada
// canal a mais no mesmo lance, 2. São escolhas, e estão escritas na página (melhores.como).
export const PONTOS = Object.freeze({ chatMax: 10, tiros: 2, explosao: 2, grito: 1, kill: 5, canal: 2 });

const SONS = ['tiros', 'explosao', 'grito'];

/** A mediana dos valores acima de zero (o mesmo "normal" de `picos` em chat.js), ou 0 sem nenhum. */
export function normalDoChat(listas) {
  const v = [];
  for (const l of listas || []) for (const x of l || []) if (Number.isFinite(x) && x > 0) v.push(x);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  const meio = v.length >> 1;
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Juntar janelas que se tocam ou sobrepõem: [[de, ate], ...] pela ordem do relógio. */
export function unirJanelas(janelas) {
  const ordem = [...(janelas || [])].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const saida = [];
  for (const [a, b] of ordem) {
    const ultima = saida.at(-1);
    if (ultima && a <= ultima[1]) ultima[1] = Math.max(ultima[1], b);
    else saida.push([a, b]);
  }
  return saida;
}

/**
 * Os sinais do evento a partir das peças que a página guarda.
 *
 * `marcas`: Map canal -> picos de chat ({ ms, msgs, vezes }). `momentos`: as kills e os achados da
 * montagem (momentos.js), com `protagonista`, `auto`, `tipo`/`tipos` e `vitimas`. Os que vieram desta
 * lista (`origem: 'lances'`) não contam como kill: marcar um lance não o pode pôr mais acima.
 */
export function sinaisDoEvento({ marcas = new Map(), momentos = [] } = {}) {
  const sinais = [];
  for (const [canal, lista] of marcas) {
    for (const m of lista || []) {
      if (m?.tipo !== 'chat' || !Number.isFinite(m.ms)) continue;
      sinais.push({ tipo: 'chat', canal, ms: m.ms, vezes: Number.isFinite(m.vezes) ? m.vezes : null, msgs: m.msgs ?? null });
    }
  }
  for (const m of momentos || []) {
    if (!m || !Number.isFinite(m.ms) || !m.protagonista) continue;
    const canal = m.protagonista;
    const kill = (!m.auto && m.origem !== 'lances') || (Array.isArray(m.vitimas) && m.vitimas.length > 0);
    if (kill) sinais.push({ tipo: 'kill', canal, ms: m.ms });
    if (!m.auto) continue;
    const tipos = new Set(m.tipos?.length ? m.tipos : [m.tipo]);
    const ateMs = Number.isFinite(m.combateAteMs) ? m.combateAteMs : m.ms;
    const deMs = Number.isFinite(m.combateDeMs) ? Math.min(m.combateDeMs, m.ms) : m.ms;
    for (const tipo of SONS) if (tipos.has(tipo)) sinais.push({ tipo, canal, ms: deMs, ateMs });
  }
  return sinais;
}

/**
 * Se dois canais podem estar no mesmo lance: o mesmo canal, o mesmo time da lista, ou o som que os pôs
 * no mesmo sítio ("Achar quem mais estava") a menos de `juntarMs` deste instante.
 *
 * Sem isto, o teste real do ABISAL de 12/10 juntava picos de chat que só caíram no mesmo minuto por
 * acaso: com 33 canais no ar há sempre outro pico a menos de um minuto, e o "canais juntos" premiava
 * a coincidência (até um canal de GTA RP entrava num lance de Rust).
 */
export function mesmoLugar(a, b, ms, { grupoDe = (c) => c, confirmados = [], juntarMs = JUNTAR_MS } = {}) {
  if (a === b) return true;
  const ga = grupoDe(a);
  if (ga != null && ga === grupoDe(b)) return true;
  return (confirmados || []).some((k) => Math.abs(k.ms - ms) <= juntarMs && k.canais.includes(a) && k.canais.includes(b));
}

/**
 * Agrupar os sinais em lances: pela ordem do relógio, um sinal entra num lance aberto se começou a
 * menos de `juntarMs` do fim dele, o lance não passa de `maxMs` e algum canal do lance é do mesmo
 * lugar que o dele (`mesmoLugar`). Cada lance é { deMs, ateMs, sinais }.
 *
 * `grupoDe(canal)` dá o time (ou null); `confirmados` são as buscas pelo som: [{ ms, canais }].
 */
export function agrupar(sinais, {
  juntarMs = JUNTAR_MS, maxMs = LANCE_MAX_MS, grupoDe = (c) => c, confirmados = [],
} = {}) {
  const ordem = [...(sinais || [])].filter((s) => Number.isFinite(s?.ms)).sort((a, b) => a.ms - b.ms);
  const grupos = [];
  for (const s of ordem) {
    const fim = Math.max(s.ms, Number.isFinite(s.ateMs) ? s.ateMs : s.ms);
    const aberto = grupos.find((g) => s.ms - g.ateMs <= juntarMs && s.ms - g.deMs <= maxMs
      && g.sinais.some((x) => mesmoLugar(x.canal, s.canal, s.ms, { grupoDe, confirmados, juntarMs })));
    if (aberto) {
      aberto.sinais.push(s);
      aberto.ateMs = Math.max(aberto.ateMs, fim);
      continue;
    }
    grupos.push({ deMs: s.ms, ateMs: fim, sinais: [s] });
  }
  return grupos;
}

/**
 * Um grupo de sinais como lance: quem esteve nele, o que cada sinal soma e o total.
 *
 * O instante do lance é o do primeiro som ou kill, quando há; senão, o do primeiro pico de chat. O
 * vídeo abre `ANTES_MS` antes dele. A marca na montagem fica no som ou na kill, ou 10 s antes do chat:
 * o chat reage depois do que aconteceu.
 */
export function resumirLance(grupo) {
  const porCanal = new Map();
  const doCanal = (c) => {
    if (!porCanal.has(c)) porCanal.set(c, { canal: c, vezes: null, msgs: 0, sons: new Set(), kills: 0, pontos: 0 });
    return porCanal.get(c);
  };
  const kills = [];
  for (const s of grupo.sinais) {
    const c = doCanal(s.canal);
    if (s.tipo === 'chat') {
      const v = Number.isFinite(s.vezes) ? s.vezes : 0;
      if (c.vezes == null || v > c.vezes) { c.vezes = v; c.msgs = s.msgs ?? c.msgs; }
    } else if (s.tipo === 'kill') {
      // A mesma kill marcada duas vezes (dois cliques, ou a do link e a do aparelho) conta uma.
      if (!kills.some((k) => k.canal === s.canal && Math.abs(k.ms - s.ms) < 2000)) { kills.push(s); c.kills++; }
    } else if (SONS.includes(s.tipo)) c.sons.add(s.tipo);
  }
  const canais = [...porCanal.values()];
  for (const c of canais) {
    c.chatPontos = c.vezes != null ? Math.round(Math.min(c.vezes, PONTOS.chatMax)) : 0;
    c.pontos = c.chatPontos + [...c.sons].reduce((n, tipo) => n + PONTOS[tipo], 0) + c.kills * PONTOS.kill;
  }
  const comChat = canais.filter((c) => c.vezes != null);
  const sons = Object.fromEntries(SONS.map((tipo) => [tipo, canais.filter((c) => c.sons.has(tipo)).map((c) => c.canal)]));
  const partes = [];
  const chatPontos = comChat.reduce((n, c) => n + c.chatPontos, 0);
  if (comChat.length) partes.push({ tipo: 'chat', pontos: chatPontos });
  for (const tipo of SONS) if (sons[tipo].length) partes.push({ tipo, pontos: sons[tipo].length * PONTOS[tipo] });
  if (kills.length) partes.push({ tipo: 'kill', pontos: kills.length * PONTOS.kill });
  if (canais.length > 1) partes.push({ tipo: 'juntos', pontos: (canais.length - 1) * PONTOS.canal, canais: canais.length });
  const pontos = partes.reduce((n, p) => n + p.pontos, 0);
  // Quem mais somou vai à frente: é o foco quando o lance abre.
  canais.sort((a, b) => b.pontos - a.pontos || a.canal.localeCompare(b.canal));
  const fortes = grupo.sinais.filter((s) => s.tipo !== 'chat').map((s) => s.ms);
  const primeiroChat = Math.min(...grupo.sinais.filter((s) => s.tipo === 'chat').map((s) => s.ms));
  const ms = fortes.length ? Math.min(...fortes) : primeiroChat;
  return {
    ms,
    deMs: grupo.deMs,
    ateMs: grupo.ateMs,
    msAbrir: ms - ANTES_MS,
    msMarcar: fortes.length ? ms : ms - ANTES_MS,
    canais: canais.map((c) => c.canal),
    porCanal: canais,
    chat: {
      canais: comChat.length,
      vezesMax: comChat.length ? Math.max(...comChat.map((c) => c.vezes)) : 0,
      // Picos lidos sem o normal do canal (um canal com uma janela só, quase calada) contam como pico,
      // mas sem pontos: não há com que comparar.
      semNormal: comChat.filter((c) => !(c.vezes > 0)).length,
    },
    sons,
    kills: kills.length,
    partes,
    pontos,
  };
}

/**
 * Os lances de uma lista de sinais, do mais forte para o mais fraco. Num empate vai à frente o que tem
 * mais canais, e depois o mais cedo.
 */
export function melhoresLances(sinais, opcoes = {}) {
  const juntarMs = opcoes.juntarMs ?? JUNTAR_MS;
  const lances = agrupar(sinais, opcoes).map(resumirLance);
  // Os outros lances a menos de um minuto, sem juntar: ficam como uma dica na linha ("outro pico perto"),
  // para quem conhece o evento decidir se é a mesma briga.
  for (const l of lances) {
    l.perto = lances.filter((o) => o !== l && o.deMs - l.ateMs <= juntarMs && l.deMs - o.ateMs <= juntarMs)
      .map((o) => o.canais[0]).filter((c) => !l.canais.includes(c));
    l.perto = [...new Set(l.perto)];
  }
  return lances.sort((a, b) => b.pontos - a.pontos || b.canais.length - a.canais.length || a.ms - b.ms);
}

/**
 * Se um lance é o de uma marca guardada (descartada ou marcada): o instante cai nele, com folga, e a
 * marca é de algum canal dele. Uma marca é { ms, c: [canais] }; um número solto vale só pelo instante.
 * Sem os canais, dois lances separados no mesmo minuto (dois canais sem time) eram descartados juntos.
 */
export function coincide(lance, guardados, folgaMs = 30_000) {
  return (guardados || []).some((g) => {
    const ms = typeof g === 'number' ? g : g?.ms;
    if (!(ms >= lance.deMs - folgaMs && ms <= lance.ateMs + folgaMs)) return false;
    return !Array.isArray(g?.c) || g.c.some((c) => lance.canais.includes(c));
  });
}

/**
 * Os filtros da lista: pelo menos `minCanais` canais, só com kill, só dentro de [deMs, ateMs]. Os
 * descartados saem, menos com `comDescartados`. Cada lance volta com `descartado` e `marcado`.
 */
export function filtrarLances(lances, {
  minCanais = 1, soKills = false, deMs = -Infinity, ateMs = Infinity, descartados = [], marcados = [], comDescartados = false,
} = {}) {
  const saida = [];
  for (const l of lances || []) {
    if (l.canais.length < minCanais) continue;
    if (soKills && !l.kills) continue;
    if (l.ateMs < deMs || l.deMs > ateMs) continue;
    const descartado = coincide(l, descartados);
    if (descartado && !comDescartados) continue;
    saida.push({ ...l, descartado, marcado: coincide(l, marcados) });
  }
  return saida;
}

/** "6", "2,5": uma casa abaixo de 10, inteiro daí para cima. */
export function vezesEmTexto(v) {
  const n = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  try { return n.toLocaleString(idiomaActual(), { maximumFractionDigits: 1 }); } catch { return String(n); }
}

/** O motivo em palavras: "chat 6 vezes o normal em 3 canais, tiros ouvidos em 4 ângulos, 1 kill marcada". */
export function motivoDoLance(l) {
  const partes = [];
  if (l.chat.canais) {
    const forte = l.chat.vezesMax > 0;
    if (!forte) partes.push(tn(l.chat.canais, 'melhores.chatSemNormalUm', 'melhores.chatSemNormal'));
    else if (l.chat.canais === 1) partes.push(t('melhores.chatUm', { vezes: vezesEmTexto(l.chat.vezesMax) }));
    else partes.push(t('melhores.chatVarios', { vezes: vezesEmTexto(l.chat.vezesMax), n: l.chat.canais }));
  }
  const n = (tipo) => l.sons[tipo]?.length || 0;
  if (n('tiros')) partes.push(tn(n('tiros'), 'melhores.tirosUm', 'melhores.tiros'));
  if (n('explosao')) partes.push(tn(n('explosao'), 'melhores.explosoesUm', 'melhores.explosoes'));
  if (n('grito')) partes.push(tn(n('grito'), 'melhores.gritosUm', 'melhores.gritos'));
  if (l.kills) partes.push(tn(l.kills, 'melhores.killUm', 'melhores.kills'));
  return partes.join(', ');
}

/** A soma escrita: [{ rotulo, pontos }], na ordem do motivo. O total é `l.pontos`. */
export function contaDoLance(l) {
  return l.partes.map((p) => ({
    rotulo: p.tipo === 'juntos' ? t('melhores.ptsJuntos', { n: p.canais }) : t(`melhores.pts.${p.tipo}`),
    pontos: p.pontos,
  }));
}
