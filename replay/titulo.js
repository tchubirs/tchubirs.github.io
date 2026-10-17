// O título de um momento a partir do que o índice achou, com a confiança de cada marca (indice.js, calibracao.js).
//
// Só diz o que o som e o chat provam: luta (e quanto tempo de tiros), explosão, morte (com os nomes quando se sabe),
// grito, chat. Nunca diz o tipo de arma nem de explosivo: não existe identificação confiável disso ainda. Marca com
// confiança baixa não entra no título.
//
// Uma etiqueta: `{ tipo: 'tiros' | 'explosao' | 'morte' | 'grito' | 'chat', conf, fonte, n, durS?, acertos?, cabecas?,
// mortes?: [{ matador, vitima }] }`. `conf` é de 0 a 1 (ou null: o detector aceitou, mas não há medida).

import { t, tn } from './idiomas.js?v=648ec4ed6d';
import { confianca } from './calibracao.js?v=648ec4ed6d';
import { curva } from './indice.js?v=648ec4ed6d';

/** Marca com confiança menor que isto não entra no título. */
export const CONF_TITULO = 0.5;
/**
 * O piso do FILTRO (diferente do título): grito e chat saem do detector sempre fracos (indice.js, `curva()` nunca
 * passa de 0,9 e sobe devagar — pico 3 de grito dá 0,43; pico 5 de chat dá 0,45), então exigir 0,5 deles descartava
 * o que o próprio detector tinha aceitado. O dono, 14/10: filtrar Grito ou Chat na live do Kodd dava lista vazia.
 */
export const CONF_FILTRO_POR_TIPO = { tiros: 0.5, explosao: 0.5, morte: 0.5, grito: 0.25, chat: 0.25 };
/**
 * Versão do CRITÉRIO de rótulo (não da calibração — calibracao.js tem a sua): muda quando a REGRA que decide o
 * título e o percentual muda, mesmo com os mesmos números de baixo. Uma lista guardada com versão antiga tem as
 * etiquetas descartadas e recalculadas (simples.js), para um "Luta 99%" de antes não ficar preso no cache.
 */
export const VERSAO_ETIQUETAS = 2;
/** A luta a partir daqui é "longa"; abaixo de LUTA_RAPIDA_S é uma troca de tiros rápida. */
export const LUTA_LONGA_S = 30;
export const LUTA_RAPIDA_S = 12;
/** Quantos exemplos uma faixa precisa ter para o percentual valer como medido. */
export const MIN_EXEMPLOS = 5;
/** Margem em volta do clipe onde uma marca do índice ainda é "deste momento" (a mesma de simples-lista.js). */
const MARGEM_MS = 30_000;

/** Quando o detector aceitou a marca mas ela não tem medida: um valor de partida, sempre dito como estimativa. */
const CONF_PADRAO = { tiros: 0.6, explosao: 0.55, grito: 0.6, chat: 0.5 };
const ORDEM = ['morte', 'tiros', 'explosao', 'grito', 'chat'];
const DO_INDICE = { tiros: 'tiro', explosao: 'explosao', grito: 'grito', chat: 'chat', morte: 'morte' };

const medida = (e) => e?.conf != null
  && (e.fonte === 'servidor' || ((e.fonte === 'rotulos' || e.fonte === 'sintetico') && (e.n ?? 0) >= MIN_EXEMPLOS));
/** O percentual desta etiqueta é medido em exemplos de verdade (e não uma estimativa)? */
export const ehMedida = medida;

/**
 * Só áudio nunca confirma que O PRÓPRIO jogador lutou: um tiro, um acerto, um headshot são indício de combate em
 * algum lugar, não prova de participação. O que confirma é (a) uma morte do SERVIDOR realmente ligada a este POV
 * (`vinculoProprio`, abaixo — não qualquer morte do evento, que pode ser de outro jogador ou sem matador
 * identificado), ou (b) o veredito do contexto visual+fala dizendo `{ tipo: 'combate', participacao: 'confirmada' }`.
 * Um veredito NEGATIVO (`reacao`/`conversa`/`ambiente`, ou `participacao: 'ausente'`) não pode ser revertido por uma
 * morte não ligada a este POV: a Camada C já olhou o quadro certo, uma morte perto é prova mais fraca.
 */
export const combatePorContexto = (e) => e?.contexto?.tipo === 'combate' && e?.contexto?.participacao === 'confirmada';
// Só um veredito NEGATIVO explícito bloqueia. "indeterminado" / "indeterminada" não é negativo: não anula uma morte
// verificada ligada ao POV (a IA sem certeza não derruba um fato do servidor).
const contextoNegativo = (e) => Boolean(e?.contexto)
  && (['reacao', 'conversa', 'ambiente'].includes(e.contexto.tipo) || e.contexto.participacao === 'ausente');
/** Fontes que PROVAM uma morte: `servidor` (log real do servidor) e `manual` (a pessoa confirmou o clipe). Vídeo/OCR
 * (`video`), `indice` (legado) e fonte ausente NÃO são prova. */
const FONTES_PROVA = ['servidor', 'manual'];
/** Uma morte confirmável, avaliada MORTE A MORTE (nunca pela fonte da etiqueta, que pode misturar um log do servidor
 * com uma leitura de vídeo): fonte de prova própria, vínculo PRÓPRIO verificado (`vinculoProprio === true`, nunca
 * presumido) e matador E vítima conhecidos. Morte de outro jogador ou de matador desconhecido também não é prova. */
const provaDeMorte = (k) => FONTES_PROVA.includes(k?.fonte) && k.vinculoProprio === true && Boolean(k.matador) && Boolean(k.vitima);
const morteProva = (x) => x.tipo === 'morte' && (x.mortes || []).some(provaDeMorte);
const vinculoDeMorte = (lista) => lista.some(morteProva);
/** 'tiros' é elegível a virar a marca principal (com percentual, ou a palavra "luta" no título) só com confirmação.
 * Exportada para o filtro (simples-filtro.js): o filtro "Luta" tem de significar combate confirmado do próprio
 * jogador, não qualquer indício de som — mas o cartão continua na lista padrão (indício), só não casa o filtro. */
export const tirosConfirmado = (e, lista) => {
  if (contextoNegativo(e)) return false;
  return combatePorContexto(e) || vinculoDeMorte(lista);
};

const arred = (x, c = 2) => Math.round(x * 10 ** c) / 10 ** c;

/** A confiança de um som achado (`pico`, `nota`, `vezes`...) pelo mesmo critério do índice: `{ conf, fonte, n }`. */
export function confDoSom(tipo, c = {}, tabela) {
  if (tipo === 'tiros') {
    const r = Number.isFinite(c.pico) ? confianca('tiro', c.pico, tabela) : null;
    return r ? { conf: r.p, fonte: r.fonte, n: r.n } : { conf: CONF_PADRAO.tiros, fonte: 'estimado', n: 0 };
  }
  if (tipo === 'explosao') {
    const r = Number.isFinite(c.nota) ? confianca('explosao', c.nota, tabela) : null;
    return r ? { conf: r.p, fonte: r.fonte, n: r.n } : { conf: CONF_PADRAO.explosao, fonte: 'estimado', n: 0 };
  }
  if (tipo === 'grito') return { conf: Number.isFinite(c.pico) ? arred(curva(c.pico, 4)) : CONF_PADRAO.grito, fonte: 'estimado', n: 0 };
  if (tipo === 'chat') {
    const forca = Number.isFinite(c.vezes) ? c.vezes : Number.isFinite(c.msgs) ? c.msgs / 5 : null;
    return { conf: forca == null ? CONF_PADRAO.chat : arred(curva(forca, 6)), fonte: 'estimado', n: 0 };
  }
  return { conf: null, fonte: 'estimado', n: 0 };
}

/**
 * As mortes do momento, com `vinculoProprio`: o servidor ligou o matador OU a vítima ao CANAL deste cartão
 * (`m.canal`)? Sem canal para comparar (lista fora do evento, um streamer só), presume-se ligada — é a mesma
 * live, não tem com quem confundir. No evento (vários canais), uma morte entre dois OUTROS jogadores não prova
 * nada deste POV, mesmo caindo no mesmo lance.
 */
// Sem canal do cartão não há como provar o vínculo: `vinculoProprio` fica FALSO (não presumido). A proveniência
// (`fonte`) é a do produtor, sem valor padrão inventado.
const mortesDe = (m) => {
  const canal = String(m?.canal || '').toLowerCase();
  return (m.mortes || []).filter((x) => x?.vitima).map((x) => ({
    matador: x.matador || '', vitima: x.vitima, fonte: x.fonte || null,
    vinculoProprio: canal ? (String(x.canalMatador || '').toLowerCase() === canal || String(x.canalVitima || '').toLowerCase() === canal) : false,
  }));
};
/** A etiqueta de morte. O percentual (0,95) só existe para a fonte do servidor; de outra origem a confiança é nula
 * (sem medida), e uma morte sem vínculo próprio nem entra na lista (ver etiquetasDoMomento). */
const etiquetaDeMorte = (mortes, { fonte = null, vinculoProprio = false } = {}) => ({
  tipo: 'morte', conf: fonte === 'servidor' ? 0.95 : null, fonte, n: 0, mortes, vinculoProprio,
});

/** O melhor (maior confiança) de uma lista de eventos do índice. */
const melhorDe = (lista) => lista.reduce((a, b) => ((b.conf ?? 0) > (a?.conf ?? -1) ? b : a), null);

/**
 * As etiquetas de um momento da lista. Com o índice da live: a confiança e o tempo de tiros vêm dele (a luta já tem a
 * sua conta). Sem ele (lista antiga, lista do evento): saem dos `tipos` do momento, com a confiança de partida.
 * O que o momento já trouxe (`etiquetas`) vale mais que qualquer conta.
 */
export function etiquetasDoMomento(m, indice = null) {
  if (Array.isArray(m?.etiquetas)) return m.etiquetas;
  const tipos = m?.tipos || [];
  const eventos = indice?.eventos || [];
  const perto = (e) => e.ms >= m.deMs - MARGEM_MS && e.ms <= m.ateMs + MARGEM_MS;
  const out = [];
  const mortes = mortesDe(m);
  if (mortes.length) {
    // Todas ficam para o título (a morte de outro jogador é dita como tal), mas só a ligada ao POV, de fonte
    // explícita, confirma o combate (morteProva). A confiança 0,95 é só da fonte do servidor.
    // A fonte da etiqueta resume a morte que importa ao POV: a que prova, senão a ligada ao POV, senão a primeira com
    // fonte. Só um resumo: quem confirma o combate é `morteProva`, morte a morte.
    const fonte = (mortes.find((x) => x.vinculoProprio && FONTES_PROVA.includes(x.fonte))
      || mortes.find((x) => x.vinculoProprio && x.fonte)
      || mortes.find((x) => x.fonte))?.fonte || null;
    out.push(etiquetaDeMorte(mortes, { fonte, vinculoProprio: mortes.some((x) => x.vinculoProprio) }));
  } else if (tipos.includes('morte')) {
    // Legado: o índice diz "morte" sem a ligação ao POV. Não é prova e não tem percentual (conf nula).
    const ev = eventos.filter((e) => e.tipo === 'morte' && perto(e));
    out.push(etiquetaDeMorte(ev.map((e) => ({ matador: e.matador || '', vitima: e.vitima || '' })).filter((x) => x.vitima), { fonte: 'indice', vinculoProprio: false }));
  }
  if (tipos.includes('tiros')) {
    const luta = m.luta && indice ? (indice.lutas || []).find((l) => Math.abs(l.ms - m.ms) < 1) : null;
    if (luta) {
      const marcas = new Set(luta.marcas || []);
      const dela = eventos.filter((e) => marcas.has(e.id));
      const forte = melhorDe(dela);
      const durS = Math.round(dela.filter((e) => e.tipo === 'tiro').reduce((s, e) => s + (e.quenteS || 0), 0));
      out.push({
        tipo: 'tiros', conf: luta.conf, fonte: forte?.fonte || 'estimado', n: forte?.n ?? 0, durS: durS || null,
        acertos: luta.acertos || 0, cabecas: luta.cabecas || 0,
      });
    } else {
      const dos = eventos.filter((e) => e.tipo === 'tiro' && e.ateMs >= m.deMs && e.deMs <= m.ateMs);
      const forte = melhorDe(dos);
      if (forte) {
        const durS = Math.round(dos.filter((e) => (e.conf ?? 0) >= CONF_TITULO).reduce((s, e) => s + (e.quenteS || 0), 0));
        out.push({ tipo: 'tiros', conf: forte.conf, fonte: forte.fonte, n: forte.n, durS: durS || null, acertos: m.acertos || 0, cabecas: m.cabecas || 0 });
      } else {
        const c = m.conf != null ? { conf: m.conf, fonte: 'estimado', n: 0 } : { conf: CONF_PADRAO.tiros, fonte: 'estimado', n: 0 };
        out.push({ tipo: 'tiros', ...c, durS: !m.luta && !m.doEvento && m.tiros > 0 ? Math.round(m.tiros) : null, acertos: m.acertos || 0, cabecas: m.cabecas || 0 });
      }
    }
  }
  for (const tipo of ['explosao', 'grito', 'chat']) {
    if (!tipos.includes(tipo)) continue;
    const ev = melhorDe(eventos.filter((e) => e.tipo === DO_INDICE[tipo] && perto(e)));
    out.push(ev ? { tipo, conf: ev.conf, fonte: ev.fonte, n: ev.n } : { tipo, conf: CONF_PADRAO[tipo], fonte: 'estimado', n: 0 });
  }
  return out;
}

/** As etiquetas que valem para o TÍTULO: confiança de 50% para cima (ou sem medida, aceita pelo detector). */
export const etiquetasFortes = (etiquetas) => (etiquetas || []).filter((e) => e.conf == null || e.conf >= CONF_TITULO);
/** As etiquetas que valem para o FILTRO: o piso é por tipo (`CONF_FILTRO_POR_TIPO`), não um só para todos — senão o
 * grito (pico 3 = 0,43) e o chat (pico 5 = 0,45) que o próprio detector aceitou somem da busca por Grito/Chat. */
export const etiquetasParaFiltro = (etiquetas) => (etiquetas || [])
  .filter((e) => e.conf == null || e.conf >= (CONF_FILTRO_POR_TIPO[e.tipo] ?? CONF_TITULO));

const maiuscula = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const minuscula = (s) => s.charAt(0).toLocaleLowerCase() + s.slice(1);

/** A frase da luta: curta nos combos, com os segundos quando é a única coisa dita. */
function fraseDaLuta(e, sozinha) {
  const s = e.durS;
  if (s == null || !(s > 0)) return t('titulo.tiros');
  const chave = s >= LUTA_LONGA_S ? 'titulo.lutaLonga' : s >= LUTA_RAPIDA_S ? 'titulo.luta' : 'titulo.troca';
  const base = t(chave);
  if (!sozinha || s < LUTA_RAPIDA_S) return base;
  const hits = e.acertos > 0 ? t('titulo.acertos', { n: e.acertos }) : '';
  return `${base} (${t('titulo.segTiros', { s })}${hits})`;
}

/**
 * Sem confirmação (sem morte do servidor, sem contexto visual/fala): o som é indício, nunca "luta". "Tiros ouvidos"
 * quando o som de acerto (acertos.js) distingue o estalo de acertar alguém; "Som alto" quando só se sabe que esteve
 * alto (o detector de tiro ainda não separa um tiro de outro som sustentado qualquer — ver plano-contexto.md 0.1a).
 */
function fraseDeIndicio(e, sozinha) {
  const distingueTiro = (e.acertos || 0) > 0 || (e.cabecas || 0) > 0 || (e.abates || 0) > 0;
  const base = t(distingueTiro ? 'titulo.indicio.tiros' : 'titulo.indicio.somAlto');
  const s = e.durS;
  if (!sozinha || s == null || !(s > 0)) return base;
  // Sem o som de acerto, `durS` é só quanto tempo esteve ALTO — não quanto tempo teve tiro — e "{s} s de tiros"
  // afirmaria o que não se mediu. Com acerto, aí sim o detector distingue tiro de outro som sustentado qualquer.
  const hits = distingueTiro && e.acertos > 0 ? t('titulo.acertos', { n: e.acertos }) : '';
  return `${base} (${t(distingueTiro ? 'titulo.segTiros' : 'titulo.segAlto', { s })}${hits})`;
}

/** A frase da morte: com nomes quando se sabe; `canal` é quem está no card, para saber quem matou quem. */
function fraseDaMorte(e, canal) {
  const m = e.mortes?.[0];
  if (!m) return { texto: t('titulo.morreu'), comNome: false };
  const mais = e.mortes.length - 1;
  const ele = String(canal || '').toLowerCase();
  let texto;
  // `comecaPorNome`: a frase abre com um apelido, que fica como o dono dele escreve (sem maiúscula forçada).
  let comecaPorNome = false;
  if (m.matador && ele && m.matador.toLowerCase() === ele) texto = t('titulo.matou', { vitima: m.vitima });
  else if (m.matador && ele && m.vitima.toLowerCase() === ele) texto = t('titulo.morreuPara', { matador: m.matador });
  else if (m.matador) { texto = t('titulo.matouDe', m); comecaPorNome = true; } else { texto = t('titulo.morreuNome', m); comecaPorNome = true; }
  if (mais > 0) texto += tn(mais, 'simples.motivo.maisUma', 'simples.motivo.maisN');
  return { texto, comecaPorNome };
}

/**
 * O título: o que mais pesa primeiro (morte, luta, explosão, grito, chat). Um tipo só: "Luta longa (40 s de tiros)",
 * "Explosão", "Matou fulano", "Grito", "O chat explodiu". Vários: "Luta e morte", "Luta longa e explosão". Sem marca
 * que passe da confiança mínima: "Momento a conferir".
 */
export function tituloDeEtiquetas(etiquetas, { canal = '' } = {}) {
  const fortes = etiquetasFortes(etiquetas).sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
  if (!fortes.length) {
    // Nada passou da confiança mínima: diz só o que o sensor mediu, sem afirmar o que aconteceu.
    const fraca = etiquetaPrincipal(etiquetas);
    return fraca && fraca.tipo !== 'morte' ? t(`titulo.fraco.${fraca.tipo}`) : t('titulo.semCerteza');
  }
  const sozinha = fortes.length === 1;
  const luta = fortes.find((e) => e.tipo === 'tiros');
  const ordemTitulo = luta ? ['tiros', 'morte', 'explosao', 'grito', 'chat'] : ORDEM;
  const partes = [];
  let detalheMorte = '';
  let nomeNoComeco = false;
  for (const tipo of ordemTitulo) {
    const e = fortes.find((x) => x.tipo === tipo);
    if (!e) continue;
    if (tipo === 'tiros') partes.push(tirosConfirmado(e, fortes) ? fraseDaLuta(e, sozinha) : fraseDeIndicio(e, sozinha));
    else if (tipo === 'morte') {
      const f = fraseDaMorte(e, canal);
      if (sozinha) { partes.push(f.texto); nomeNoComeco = f.comecaPorNome; } else {
        partes.push(t('titulo.morte'));
        if (e.mortes?.length) detalheMorte = f.comecaPorNome ? f.texto : minuscula(f.texto);
      }
    } else if (tipo === 'explosao') partes.push(t('titulo.explosao'));
    else if (tipo === 'grito') partes.push(t('titulo.grito'));
    else partes.push(t('titulo.chat'));
  }
  const baixas = partes.map((p, i) => (i ? minuscula(p) : p));
  const frase = baixas.length === 1 ? baixas[0]
    : `${baixas.slice(0, -1).join(', ')}${t('simples.e')}${baixas.at(-1)}`;
  const inteira = detalheMorte ? `${frase}: ${detalheMorte}` : frase;
  return nomeNoComeco ? inteira : maiuscula(inteira);
}

/**
 * O resumo FACTUAL de um veredito do contexto já validado (quadro + fala): `titulo` é a categoria curta, `resumo` é o
 * que o contrato validou (texto cru: quem insere na página escapa), `status` diz se a análise teve fala ou só imagem.
 * Nunca um percentual, nunca o nome de arma. `null` sem veredito.
 */
export function textoDoContexto(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const chave = ctx.tipo === 'combate'
    ? (ctx.participacao === 'confirmada' ? 'combate' : ctx.participacao === 'ausente' ? 'combateAusente' : 'combateIndeterminado')
    : ['reacao', 'conversa', 'ambiente', 'indeterminado'].includes(ctx.tipo) ? ctx.tipo : null;
  if (!chave) return null;
  const resumo = typeof ctx.resumo === 'string' ? ctx.resumo.trim() : '';
  return {
    titulo: t(`contexto.resumo.${chave}`),
    resumo,
    status: t(ctx.recebeuFala ? 'contexto.status.imagemFala' : 'contexto.status.imagem'),
  };
}

/** O título de um momento (com o índice quando se tem). */
export const tituloDoMomento = (m, indice = null) => tituloDeEtiquetas(etiquetasDoMomento(m, indice), { canal: m?.canal || '' });

// ── a confiança na tela ──────────────────────────────────────────────────────

const ROTULO_DO_TIPO = { tiros: 'luta', explosao: 'explosao', morte: 'morte', grito: 'grito', chat: 'chat' };

/** A etiqueta principal de um momento (a primeira da ordem que tem confiança). Usada pelo título fraco (diz o que o
 * sensor mediu mesmo sem confirmação, já com palavra honesta como "Som alto" — nunca um percentual de combate). */
export function etiquetaPrincipal(etiquetas) {
  const lista = (etiquetas || []).filter((e) => e.conf != null);
  return ORDEM.map((tipo) => lista.find((e) => e.tipo === tipo)).find(Boolean) || null;
}

/** Como `etiquetaPrincipal`, mas para quem mostra um estado de combate: 'tiros' só entra se confirmado (morte
 * vinculada ao POV, ou contexto), senão o som fica de fora e a tela mostra o próximo tipo (explosão, grito,
 * chat) ou nada. */
function principalConfirmado(etiquetas) {
  const lista = (etiquetas || []).filter((e) => e.conf != null);
  return ORDEM.map((tipo) => lista.find((e) => e.tipo === tipo && (tipo !== 'tiros' || tirosConfirmado(e, lista)))).find(Boolean) || null;
}

/** Como `etiquetaPrincipal`, mas só para quem mostra PERCENTUAL: 'tiros' nunca entra (confirmado ou não) — o
 * número vem da calibração do SOM (indice.js/calibracao.js), que mede "isto soou como luta em algum lugar", não
 * "é a luta do jogador". Confirmar o combate muda a PALAVRA (ver `confExibida`), nunca inventa um percentual. */
function principalNumerico(etiquetas) {
  const lista = (etiquetas || []).filter((e) => e.conf != null && e.tipo !== 'tiros');
  return ORDEM.map((tipo) => lista.find((e) => e.tipo === tipo)).find(Boolean) || null;
}

/**
 * Para a tela: `{ tipo, rotulo, pct, estimativa, texto }`. Com `tiros` confirmado: `pct: null` e um texto de
 * ESTADO ("Luta confirmada"), nunca o percentual do som (que não mede a luta do jogador, só o som). Com morte ou
 * explosão/grito/chat, o percentual de sempre. `null` sem etiqueta com confiança (ou com só som sem confirmação:
 * aí não há nada de combate a mostrar, honestamente).
 */
export function confExibida(etiquetas) {
  const e = principalConfirmado(etiquetas);
  if (!e) return null;
  if (e.tipo === 'tiros') {
    return { tipo: 'tiros', rotulo: t('titulo.rotulo.luta'), pct: null, estimativa: false, texto: t('titulo.lutaConfirmada') };
  }
  const pct = Math.round(e.conf * 100);
  const estimativa = !medida(e);
  const rotulo = t(`titulo.rotulo.${ROTULO_DO_TIPO[e.tipo]}`);
  return { tipo: e.tipo, rotulo, pct, estimativa, texto: `${rotulo} ${estimativa ? '~' : ''}${pct}%` };
}

/** A média das confianças principais da lista de agora: `{ pct, estimativa, n }`, ou null sem nenhuma. Nunca
 * conta `tiros` (confirmado ou não — ver `principalNumerico`): a média seria o som, não a luta. */
export function confMedia(momentos) {
  const principais = (momentos || []).map((m) => principalNumerico(etiquetasDoMomento(m))).filter(Boolean);
  if (!principais.length) return null;
  const soma = principais.reduce((s, e) => s + e.conf, 0);
  return { pct: Math.round((soma / principais.length) * 100), estimativa: principais.some((e) => !medida(e)), n: principais.length };
}

// ── o modo avançado ──────────────────────────────────────────────────────────

/**
 * As etiquetas de um momento da lista do avançado (achado por "Detectar lances": `tipo` ou `tipos`, `tiros` em segundos
 * quentes, `acertos`, `conf`/`confFonte` do tipo principal; as mortes vêm das vítimas marcadas na kill).
 */
export function etiquetasDeDeteccao(m) {
  const tipos = m?.tipos?.length > 1 ? m.tipos : m?.tipo ? [m.tipo] : [];
  const out = [];
  // Marcação manual ("Quem morreu?"): a pessoa confirmou com os olhos que esta vítima morreu neste clipe do
  // protagonista — vínculo próprio por construção, não por nome batendo.
  const vitima = (m.vitimas || [])[0] || (m.vitimasTexto || [])[0] || '';
  if (vitima) out.push(etiquetaDeMorte([{ matador: m.protagonista || '', vitima, fonte: 'manual', vinculoProprio: true }], { fonte: 'manual', vinculoProprio: true }));
  for (const tipo of tipos) {
    if (!ORDEM.includes(tipo) && tipo !== 'tiros') continue;
    const propria = tipo === m.tipo && m.conf != null;
    const c = propria ? { conf: m.conf, fonte: m.confFonte || 'estimado', n: m.confN ?? 0 } : { conf: CONF_PADRAO[tipo] ?? null, fonte: 'estimado', n: 0 };
    out.push(tipo === 'tiros'
      ? { tipo, ...c, durS: m.tiros > 0 ? Math.round(m.tiros) : null, acertos: m.acertos || 0, cabecas: m.cabecas || 0 }
      : { tipo, ...c });
  }
  return out;
}

/** O título de um momento do avançado, que também serve de nome do arquivo do clipe. */
export const tituloDeDeteccao = (m) => tituloDeEtiquetas(etiquetasDeDeteccao(m), { canal: m?.protagonista || '' });
