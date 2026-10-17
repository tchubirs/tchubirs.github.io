/**
 * O índice de uma live: uma passada de análise acha TUDO o que há de som e de chat e guarda cada coisa com a hora, uma etiqueta
 * e uma confiança de 0 a 1. Depois o filtro, a lista e a busca só consultam o índice: nada se ouve de novo, e o som em si não
 * fica guardado (só números pequenos).
 *
 * Cada evento: `{ id, tipo, ms, deMs, ateMs, conf, fonte, n, ...medidas }`.
 *   tiro       uma região de som alto (`pico` em vezes o chão, `nImp` impulsos, `vozMed` parte de voz)
 *   acerto     o estalo de acertar um jogador (acertos.js); `nota` é a correlação com o clipe do jogo
 *   headshot   o mesmo, com o som de tiro na cabeça
 *   abate      o som de abate (matar alguém)
 *   explosao   som grave e longo que o modelo do Rust aceita (`nota` do modelo)
 *   alerta     sub, follow, doação: um som que se repete igual (fora da lista de explosões)
 *   grito      a voz do streamer muito acima do normal dele
 *   chat       um pico de mensagens
 *   morte      uma morte dita pelo servidor ou lida na tela (vem de quem chama)
 *   voz        a região de tiro que parece só gente falando (confiança de "não é tiro")
 *   farm       a região que parece farm ou corpo a corpo (confiança de "não é tiro")
 *
 * `conf` vem de `calibracao.js`: a fração de acertos que a medida teve em exemplos conhecidos, com a fonte (`rotulos`,
 * `sintetico`, `estimado`) e o número de exemplos (`n`). Só as de fonte `rotulos` e `sintetico` com `n` de verdade valem como
 * percentual; as `estimado` servem para ordenar.
 *
 * As lutas (`lutas`) já saem juntas: tiros fortes e acertos a menos de 25 s viram UMA luta, de no máximo 75 s (uma luta
 * mais longa é cortada onde as marcas deixam, e cada pedaço é uma luta).
 */

import { CALIBRACAO, VERSAO_CALIBRACAO, confianca } from './calibracao.js?v=9b7d41859d';

export const VERSAO_INDICE = 1;
/** Região de tiro com confiança a partir daqui é semente de luta. */
export const CONF_SEMENTE = 0.6;
/** Luta com confiança a partir daqui aparece inteira na lista, sem o corte por hora. */
export const CONF_SEM_CORTE = 0.85;
/** Marcas a menos disto uma da outra são a mesma luta. */
export const JUNTAR_LUTA_MS = 25_000;
/** A luta mais longa (a que passa disso é cortada). */
export const MAX_LUTA_MS = 75_000;
/** Um acerto sozinho (sem região de tiro) vale esta janela em volta dele. */
const JANELA_ACERTO_MS = 3000;
/** Região fraca (pico abaixo disto) e longa, ou cheia de impulsos, é farm ou corpo a corpo. */
const PICO_FRACO = 60;
const FARM_DURACAO_S = 15;
const VOZ_MIN = 0.58;

const arred = (x, c = 3) => Math.round(x * 10 ** c) / 10 ** c;

function evento(tipo, ms, deMs, ateMs, c, extras = {}) {
  return {
    id: `${tipo}|${Math.round(ms)}`, tipo, ms: Math.round(ms), deMs: Math.round(deMs), ateMs: Math.round(ateMs),
    conf: c.p == null ? null : arred(c.p, 2), fonte: c.fonte, n: c.n, ...extras,
  };
}

/** Uma curva que sobe de 0 e fica abaixo de 0,9: para o que ainda não tem exemplo que o meça (grito, chat). */
export const curva = (forca, meio) => Math.min(0.9, forca / (forca + meio));

/**
 * Do resultado de `varrerNoite` (e do chat, e das mortes) ao índice. `som` é o que `varrerNoite` devolveu (com
 * `candidatosTodos`, `explosoesTodas`, `gritosTodos`, `acertos`, `alertasFora`); qualquer parte pode faltar.
 * `picos`: `[{ ms, msgs, vezes }]` do chat. `mortes`: `[{ ms, vitima, matador }]` já achadas por fora.
 */
export function montarIndice({
  slug, inicioMs, fimMs = null, som = {}, picos = [], mortes = [], tabela = CALIBRACAO, agora = Date.now(),
}) {
  const eventos = [];
  for (const c of som.candidatosTodos || []) {
    const { p, n, fonte } = confianca('tiro', c.pico, tabela);
    eventos.push(evento('tiro', c.ms, c.combateDeMs, c.combateAteMs, { p, n, fonte }, {
      pico: arred(c.pico, 1), quenteS: c.tiros, nImp: c.nImp ?? null, nAltos: c.nAltos ?? null, vozMed: c.vozMed ?? null,
      duracaoS: arred(c.duracaoS, 1),
    }));
    if (c.pico < PICO_FRACO && (c.vozMed ?? 0) >= VOZ_MIN) {
      eventos.push(evento('voz', c.ms, c.combateDeMs, c.combateAteMs, confianca('voz', 0, tabela), { vozMed: c.vozMed }));
    }
    if (c.pico < PICO_FRACO && c.duracaoS >= FARM_DURACAO_S) {
      eventos.push(evento('farm', c.ms, c.combateDeMs, c.combateAteMs, confianca('farm', 0, tabela), { duracaoS: arred(c.duracaoS, 1) }));
    }
  }
  for (const a of som.acertos || []) {
    const tipo = a.tipo === 'cabeca' ? 'headshot' : a.tipo === 'morte' ? 'abate' : 'acerto';
    eventos.push(evento(tipo, a.ms, a.ms - 500, a.ms + 500, confianca('acerto', a.nota, tabela), { nota: arred(a.nota, 2), modelo: a.id }));
  }
  for (const e of som.explosoesTodas || []) {
    const c = e.nota != null ? confianca('explosao', e.nota, tabela) : { p: null, n: 0, fonte: 'estimado' };
    eventos.push(evento('explosao', e.ms, e.combateDeMs, e.combateAteMs, c, { pico: arred(e.pico, 1), nota: e.nota != null ? arred(e.nota, 2) : null }));
  }
  for (const a of (som.alertasFora || []).filter((x) => x.porque === 'repete' || x.porque === 'lembrado')) {
    const c = a.onda != null ? confianca('alerta', a.onda, tabela) : { p: a.porque === 'lembrado' ? 0.7 : 0.5, n: 0, fonte: 'estimado' };
    eventos.push(evento('alerta', a.ms, a.ms - 500, a.ms + 6000, c, { porque: a.porque, semelhanca: a.semelhanca != null ? arred(a.semelhanca, 2) : null, onda: a.onda != null ? arred(a.onda, 2) : null }));
  }
  for (const g of som.gritosTodos || []) {
    eventos.push(evento('grito', g.ms, g.combateDeMs, g.combateAteMs, { p: curva(g.pico, 4), n: 0, fonte: 'estimado' }, { pico: arred(g.pico, 1) }));
  }
  for (const p of picos) {
    if (!Number.isFinite(p.ms)) continue;
    const forca = Number.isFinite(p.vezes) ? p.vezes : (p.msgs || 0) / 5;
    eventos.push(evento('chat', p.ms, p.ms - 25_000, p.ms + 5000, { p: curva(forca, 6), n: 0, fonte: 'estimado' }, { msgs: p.msgs ?? null, vezes: p.vezes ?? null }));
  }
  for (const m of mortes) {
    if (Number.isFinite(m.ms)) eventos.push(evento('morte', m.ms, m.ms - 3000, m.ms + 2000, { p: 0.95, n: 0, fonte: 'servidor' }, { vitima: m.vitima || '', matador: m.matador || '' }));
  }
  eventos.sort((a, b) => a.ms - b.ms || a.tipo.localeCompare(b.tipo));
  return {
    v: VERSAO_INDICE, calibracao: VERSAO_CALIBRACAO, slug, inicio: inicioMs, fim: fimMs, criado: agora,
    // Os modelos de acerto que se repetiram nesta live (acertos.js). Vazio: o canal não tem som de acerto audível, e a lista
    // segue só com os tiros.
    acertosAtivos: (som.modelosAcerto || []).some((m) => m.vale),
    modelosAcerto: som.modelosAcerto || [],
    eventos,
    lutas: montarLutas(eventos),
  };
}

// ── as lutas ─────────────────────────────────────────────────────────────────

const TIPOS_ACERTO = new Set(['acerto', 'headshot', 'abate']);

/** A confiança de várias provas juntas (prova independente, o que é uma simplificação): 1 menos o produto dos erros. */
function juntarConf(lista) {
  const v = lista.filter((x) => x != null).sort((a, b) => b - a).slice(0, 6);
  if (!v.length) return null;
  return Math.min(0.99, arred(1 - v.reduce((t, x) => t * (1 - x), 1), 2));
}

/**
 * Tiros fortes (confiança de semente) e acertos viram lutas: marcas a menos de 25 s uma da outra são a mesma luta, e a que
 * passa de 75 s é cortada. Uma região fraca dentro do tempo de uma luta entra nela. Devolve, pela hora, `{ id, ms, deMs,
 * ateMs, conf, tiros, acertos, cabecas, abates, mortes, pico, pontos, marcas: [ids] }`.
 */
export function montarLutas(eventos, { juntarMs = JUNTAR_LUTA_MS, maxMs = MAX_LUTA_MS } = {}) {
  const acertos = eventos.filter((e) => TIPOS_ACERTO.has(e.tipo));
  const tiros = eventos.filter((e) => e.tipo === 'tiro');
  const perto = (t, a) => a.ms >= t.deMs - 1500 && a.ms <= t.ateMs + 1500;
  const marcas = [];
  for (const t of tiros) {
    const comAcerto = acertos.some((a) => perto(t, a));
    if ((t.conf ?? 0) >= CONF_SEMENTE || comAcerto) marcas.push({ de: t.deMs, ate: t.ateMs, ms: t.ms, ev: t });
  }
  for (const a of acertos) {
    if (!tiros.some((t) => perto(t, a))) marcas.push({ de: a.ms - JANELA_ACERTO_MS, ate: a.ms + JANELA_ACERTO_MS, ms: a.ms, ev: a });
  }
  marcas.sort((a, b) => a.de - b.de);
  const grupos = [];
  for (const m of marcas) {
    const g = grupos.at(-1);
    if (g && m.de - g.ate <= juntarMs && m.ate - g.de <= maxMs) { g.marcas.push(m); g.ate = Math.max(g.ate, m.ate); } else grupos.push({ de: m.de, ate: m.ate, marcas: [m] });
  }
  return grupos.map((g) => {
    const dentro = (e) => e.ms >= g.de - 1000 && e.ms <= g.ate + 1000;
    const hits = acertos.filter(dentro);
    const regioes = tiros.filter((t) => t.ateMs >= g.de && t.deMs <= g.ate);
    const cabecas = hits.filter((h) => h.tipo === 'headshot').length;
    const abates = hits.filter((h) => h.tipo === 'abate').length;
    const mortes = eventos.filter((e) => e.tipo === 'morte' && dentro(e)).length;
    const conf = juntarConf([...regioes.map((t) => t.conf), ...hits.map((h) => h.conf)]);
    const pico = Math.max(0, ...regioes.map((t) => t.pico || 0));
    const forte = regioes.reduce((a, b) => ((b.pico || 0) > (a.pico || 0) ? b : a), regioes[0] || g.marcas[0].ev);
    const durS = (g.ate - g.de) / 1000;
    const pontos = 3 + (conf >= 0.9 ? 1 : 0) + Math.min(2, 0.5 * hits.length) + Math.min(2, cabecas)
      + Math.min(3, 1.5 * abates) + Math.min(3, 1.5 * mortes) + Math.min(1, durS / 60);
    return {
      id: `luta|${Math.round(forte.ms)}`, ms: forte.ms, deMs: g.de, ateMs: g.ate, conf, tiros: regioes.length, acertos: hits.length,
      cabecas, abates, mortes, pico: arred(pico, 1), pontos: arred(pontos, 2),
      marcas: [...regioes.map((t) => t.id), ...hits.map((h) => h.id)],
    };
  });
}

// ── consultar ────────────────────────────────────────────────────────────────

/**
 * Os eventos que passam no filtro, na ordem da live: `{ tipos, confMin, deMs, ateMs }`. Sem recalcular nada: é só filtrar a
 * lista que já está pronta.
 */
export function consultar(indice, { tipos = null, confMin = 0, deMs = -Infinity, ateMs = Infinity } = {}) {
  const t = tipos ? new Set(tipos) : null;
  return (indice?.eventos || []).filter((e) => (!t || t.has(e.tipo)) && (e.conf ?? 0) >= confMin && e.ms >= deMs && e.ms <= ateMs);
}

/** As lutas que passam na confiança mínima, na ordem da live. */
export function lutasDoIndice(indice, { confMin = 0 } = {}) {
  return (indice?.lutas || []).filter((l) => (l.conf ?? 0) >= confMin);
}

/**
 * A precisão de um conjunto de resultados (eventos ou lutas), para mostrar "X%": a média das confianças, e quanto dela é
 * medida de verdade. `percentual` é null quando nenhuma confiança do conjunto tem exemplo que a meça.
 */
export function precisaoDaBusca(itens) {
  const com = itens.filter((i) => i.conf != null);
  const medidos = com.filter((i) => i.fonte === 'rotulos' || i.fonte === 'sintetico' || i.fonte === 'servidor');
  const media = (l) => (l.length ? l.reduce((s, i) => s + i.conf, 0) / l.length : null);
  const m = media(medidos);
  return {
    resultados: itens.length,
    percentual: m == null ? null : Math.round(m * 100),
    medidos: medidos.length,
    estimados: com.length - medidos.length,
    geral: com.length ? Math.round(media(com) * 100) : null,
  };
}

// ── guardar neste aparelho ───────────────────────────────────────────────────

/** A chave do índice de um vídeo no banco do aparelho. */
export const chaveDoIndice = (slug, inicio) => `${slug}|${inicio}`;

/** Um índice sem nada que o torne inválido: versão, eventos e lutas em lista. O que não passa é refeito. */
export function indiceValido(i) {
  return Boolean(i) && i.v === VERSAO_INDICE && Array.isArray(i.eventos) && Array.isArray(i.lutas) && i.calibracao === VERSAO_CALIBRACAO;
}
