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

import { t, tn, idiomaActual } from './idiomas.js?v=72807425b4';
import { termosDoFiltro, momentosDePalavras } from './chat.js?v=72807425b4';

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
// O chat a pedir clipe ("clip", "clipa", "clipe") dá 3 por canal. O que a pessoa marcou ao vivo com a
// tecla dá 5, e além disso vai sempre para o topo da lista: foi ela que viu.
// Uma morte que o servidor registou (mortes.js) dá 6: é o sinal mais certo de todos, o servidor viu.
export const PONTOS = Object.freeze({
  chatMax: 10, tiros: 2, explosao: 2, grito: 1, kill: 5, canal: 2, voce: 5, pedidoClip: 3, morte: 6,
});

// As palavras do pedido de clipe, pelo mesmo filtro de palavras do chat (chat.js): "clip" acha também
// "clipa", "clipou" e "clipar", e as letras repetidas encolhem ("cliiiip").
export const PALAVRAS_CLIPE = 'clip, clipa, clipe';
const TERMOS_CLIPE = termosDoFiltro(PALAVRAS_CLIPE);
// A lista de mensagens de um canal é trocada por outra quando chega chat novo: a conta guarda-se pela
// lista, e a lista dos melhores, que se refaz a cada mudança, não volta a ler as mensagens todas.
const pedidosGuardados = new WeakMap();

/**
 * Os momentos em que o chat de um canal pediu clipe: mensagens com as palavras de `PALAVRAS_CLIPE`, em
 * baldes de 30 s, 3 vezes o normal dessas palavras nesse chat e pelo menos 3 mensagens.
 */
export function pedidosDeClipe(mensagens) {
  if (!Array.isArray(mensagens) || !mensagens.length) return [];
  const ja = pedidosGuardados.get(mensagens);
  if (ja) return ja;
  let de = Infinity;
  let ate = -Infinity;
  for (const m of mensagens) {
    if (!Number.isFinite(m?.ms)) continue;
    de = Math.min(de, m.ms);
    ate = Math.max(ate, m.ms);
  }
  const achados = ate >= de ? momentosDePalavras(mensagens, TERMOS_CLIPE, de, ate + 1, { minimo: 3 }) : [];
  pedidosGuardados.set(mensagens, achados);
  return achados;
}

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
 * lista (`origem: 'lances'`) não contam como kill: marcar um lance não o pode pôr mais acima. Os
 * marcados ao vivo com a tecla (`origem: 'aovivo'`) são um sinal "você" em cada ângulo que estava no
 * ar, no instante de cada um (`vivo: [{ c, ms }]`), e ficam juntos num lance só.
 * `mensagens`: Map canal -> mensagens do chat; o chat a pedir clipe é mais um sinal.
 * `mortes`: as mortes do servidor já com o canal de cada nome (mortes.js, `casarMortes`) e o instante
 * `ms`. Cada uma é um sinal na faixa de quem matou e na de quem morreu, os dois no mesmo lance.
 */
export function sinaisDoEvento({ marcas = new Map(), momentos = [], mensagens = new Map(), mortes = [] } = {}) {
  const sinais = [];
  for (const m of mortes || []) {
    if (!m || !Number.isFinite(m.ms)) continue;
    const morte = {
      id: m.id, matador: m.matador, vitima: m.vitima, canalMatador: m.canalMatador || null, canalVitima: m.canalVitima || null,
      ...(m.origem === 'video' ? { origem: 'video' } : {}),
      // A proveniência como o produtor a deu (servidor = log lido; video = tela de morte). Sem default.
      ...(m.fonte ? { fonte: m.fonte } : {}),
    };
    const msMatador = Number.isFinite(m.msMatador) ? m.msMatador : m.ms;
    if (m.canalMatador) sinais.push({ tipo: 'morte', canal: m.canalMatador, ms: msMatador, marca: `morte:${m.id}`, papel: 'matou', morte });
    if (m.canalVitima && m.canalVitima !== m.canalMatador) {
      sinais.push({ tipo: 'morte', canal: m.canalVitima, ms: m.ms, marca: `morte:${m.id}`, papel: 'morreu', morte });
    }
  }
  for (const [canal, lista] of marcas) {
    for (const m of lista || []) {
      if (m?.tipo !== 'chat' || !Number.isFinite(m.ms)) continue;
      sinais.push({ tipo: 'chat', canal, ms: m.ms, vezes: Number.isFinite(m.vezes) ? m.vezes : null, msgs: m.msgs ?? null });
    }
  }
  for (const [canal, lista] of mensagens || []) {
    for (const p of pedidosDeClipe(lista)) sinais.push({ tipo: 'pedidoClip', canal, ms: p.ms, vezes: p.vezes });
  }
  for (const m of momentos || []) {
    if (!m || !Number.isFinite(m.ms) || !m.protagonista) continue;
    const canal = m.protagonista;
    if (m.origem === 'aovivo') {
      const vivo = Array.isArray(m.vivo) && m.vivo.length ? m.vivo : [{ c: canal, ms: m.ms }];
      for (const v of vivo) {
        if (typeof v?.c === 'string' && v.c && Number.isFinite(v.ms)) {
          sinais.push({ tipo: 'voce', canal: v.c, ms: v.ms, marca: m.ms, principal: v.c === canal });
        }
      }
    }
    // Uma morte do servidor posta na montagem já conta como morte do servidor: não conta outra vez.
    const kill = m.origem !== 'servidor'
      && ((!m.auto && m.origem !== 'lances' && m.origem !== 'aovivo') || (Array.isArray(m.vitimas) && m.vitimas.length > 0));
    // As vítimas que a montagem já tem (slugs de canal, sem confirmação de morte) seguem com a kill como
    // sugestão visual: não contam como kill, não mudam a nota, e não viram morte.
    if (kill) {
      const vitimas = [...new Set((Array.isArray(m.vitimas) ? m.vitimas : [])
        .filter((v) => typeof v === 'string' && v && v !== canal))];
      sinais.push({ tipo: 'kill', canal, ms: m.ms, ...(vitimas.length ? { vitimas } : {}) });
    }
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
    // Os ângulos de uma marca ao vivo são o mesmo lance, sejam de que time forem: foi a pessoa que os
    // viu juntos.
    const aberto = grupos.find((g) => s.ms - g.ateMs <= juntarMs && s.ms - g.deMs <= maxMs
      && g.sinais.some((x) => (s.marca != null && x.marca === s.marca)
        || mesmoLugar(x.canal, s.canal, s.ms, { grupoDe, confirmados, juntarMs })));
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
    if (!porCanal.has(c)) porCanal.set(c, { canal: c, vezes: null, msgs: 0, sons: new Set(), kills: 0, pedidos: 0, voce: 0, morte: 0, pontos: 0 });
    return porCanal.get(c);
  };
  const kills = [];
  const marcasVoce = new Set();
  const mortes = new Map();
  // Ligações sugestivas por canal de quem matou: vítimas sem confirmação (só para a tela, não entram na conta).
  const sugeridos = new Map();
  for (const s of grupo.sinais) {
    const c = doCanal(s.canal);
    if (s.tipo === 'kill' && Array.isArray(s.vitimas)) {
      for (const v of s.vitimas) {
        if (typeof v !== 'string' || !v || v === s.canal) continue;
        if (!sugeridos.has(s.canal)) sugeridos.set(s.canal, new Set());
        sugeridos.get(s.canal).add(v);
      }
    }
    if (s.tipo === 'voce') {
      // O ângulo que se estava a ver quando se marcou vai à frente: é ele que abre com o lance.
      c.voce = Math.max(c.voce || 0, s.principal ? 2 : 1);
      marcasVoce.add(s.marca ?? s.ms);
    } else if (s.tipo === 'pedidoClip') {
      c.pedidos = Math.max(c.pedidos, Number.isFinite(s.vezes) ? s.vezes : 1);
    } else if (s.tipo === 'chat') {
      const v = Number.isFinite(s.vezes) ? s.vezes : 0;
      if (c.vezes == null || v > c.vezes) { c.vezes = v; c.msgs = s.msgs ?? c.msgs; }
    } else if (s.tipo === 'morte') {
      mortes.set(s.morte?.id ?? s.marca, s.morte);
      // Quem matou vai à frente quando o lance abre; quem morreu vem logo atrás.
      c.morte = Math.max(c.morte, s.papel === 'matou' ? PONTOS.morte : 1);
    } else if (s.tipo === 'kill') {
      // A mesma kill marcada duas vezes (dois cliques, ou a do link e a do aparelho) conta uma.
      if (!kills.some((k) => k.canal === s.canal && Math.abs(k.ms - s.ms) < 2000)) { kills.push(s); c.kills++; }
    } else if (SONS.includes(s.tipo)) c.sons.add(s.tipo);
  }
  const canais = [...porCanal.values()];
  for (const c of canais) {
    c.chatPontos = c.vezes != null ? Math.round(Math.min(c.vezes, PONTOS.chatMax)) : 0;
    c.pontos = c.chatPontos + [...c.sons].reduce((n, tipo) => n + PONTOS[tipo], 0) + c.kills * PONTOS.kill
      + (c.pedidos ? PONTOS.pedidoClip : 0) + c.voce + c.morte;
  }
  const comChat = canais.filter((c) => c.vezes != null);
  const sons = Object.fromEntries(SONS.map((tipo) => [tipo, canais.filter((c) => c.sons.has(tipo)).map((c) => c.canal)]));
  const pedidos = canais.filter((c) => c.pedidos > 0).length;
  const partes = [];
  // Marcado por você vem primeiro, na conta e no motivo: é o que põe o lance no topo.
  if (marcasVoce.size) partes.push({ tipo: 'voce', pontos: PONTOS.voce });
  const chatPontos = comChat.reduce((n, c) => n + c.chatPontos, 0);
  if (comChat.length) partes.push({ tipo: 'chat', pontos: chatPontos });
  if (pedidos) partes.push({ tipo: 'pedidoClip', pontos: pedidos * PONTOS.pedidoClip });
  for (const tipo of SONS) if (sons[tipo].length) partes.push({ tipo, pontos: sons[tipo].length * PONTOS[tipo] });
  if (mortes.size) partes.push({ tipo: 'morte', pontos: mortes.size * PONTOS.morte });
  if (kills.length) partes.push({ tipo: 'kill', pontos: kills.length * PONTOS.kill });
  if (canais.length > 1) partes.push({ tipo: 'juntos', pontos: (canais.length - 1) * PONTOS.canal, canais: canais.length });
  const pontos = partes.reduce((n, p) => n + p.pontos, 0);
  // Quem mais somou vai à frente: é o foco quando o lance abre.
  canais.sort((a, b) => b.pontos - a.pontos || a.canal.localeCompare(b.canal));
  // O chat (e o chat a pedir clipe) reage depois do lance; o resto marca o próprio instante.
  const doChat = (s) => s.tipo === 'chat' || s.tipo === 'pedidoClip';
  const fortes = grupo.sinais.filter((s) => !doChat(s)).map((s) => s.ms);
  const primeiroChat = Math.min(...grupo.sinais.filter(doChat).map((s) => s.ms));
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
    mortes: [...mortes.values()].filter(Boolean),
    voce: marcasVoce.size,
    pedidosClip: pedidos,
    partes,
    pontos,
    // Só existe quando há sugestão: { canal (quem matou), vitimas (slugs) }. Não altera nota nem partes.
    ...(sugeridos.size ? { povsSugeridos: [...sugeridos].map(([canal, vs]) => ({ canal, vitimas: [...vs] })) } : {}),
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
  // O que a pessoa marcou ao vivo vai à frente de tudo; entre esses, e entre os outros, a nota manda.
  return lances.sort((a, b) => (b.voce > 0) - (a.voce > 0) || b.pontos - a.pontos || b.canais.length - a.canais.length || a.ms - b.ms);
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
    if (soKills && !l.kills && !l.mortes?.length) continue;
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
  if (l.voce) partes.push(t('melhores.voce'));
  if (l.chat.canais) {
    const forte = l.chat.vezesMax > 0;
    if (!forte) partes.push(tn(l.chat.canais, 'melhores.chatSemNormalUm', 'melhores.chatSemNormal'));
    else if (l.chat.canais === 1) partes.push(t('melhores.chatUm', { vezes: vezesEmTexto(l.chat.vezesMax) }));
    else partes.push(t('melhores.chatVarios', { vezes: vezesEmTexto(l.chat.vezesMax), n: l.chat.canais }));
  }
  if (l.pedidosClip) partes.push(tn(l.pedidosClip, 'melhores.pedidoClipUm', 'melhores.pedidoClip'));
  const n = (tipo) => l.sons[tipo]?.length || 0;
  if (n('tiros')) partes.push(tn(n('tiros'), 'melhores.tirosUm', 'melhores.tiros'));
  if (n('explosao')) partes.push(tn(n('explosao'), 'melhores.explosoesUm', 'melhores.explosoes'));
  if (n('grito')) partes.push(tn(n('grito'), 'melhores.gritosUm', 'melhores.gritos'));
  const mortes = l.mortes || [];
  // Uma morte achada no vídeo pode não ter quem matou (o nome não se leu): diz-se só quem morreu.
  const frase = (m) => (m.matador ? t('melhores.morteDe', { matador: m.matador, vitima: m.vitima }) : t('melhores.morreu', { vitima: m.vitima }));
  if (mortes.length === 1) {
    partes.push(mortes[0].origem === 'video' ? t('melhores.morteVideoUm', { frase: frase(mortes[0]) })
      : t('melhores.morteUm', { matador: mortes[0].matador, vitima: mortes[0].vitima }));
  } else if (mortes.length > 1) {
    const lista = mortes.slice(0, 2).map(frase).join('; ');
    const doVideo = mortes.every((m) => m.origem === 'video');
    partes.push(t(doVideo ? 'melhores.mortesVideo' : 'melhores.mortes', { n: mortes.length, lista: mortes.length > 2 ? `${lista}; …` : lista }));
  }
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
