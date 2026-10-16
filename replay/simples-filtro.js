// O filtro da lista simples (a do streamer e a do evento): as contas, sem tela. Consulta o que a lista já tem (as etiquetas
// do índice em titulo.js e as falas lembradas em falas.js); não analisa nada de novo.

import { t } from './idiomas.js?v=62a404f650';
import { etiquetasDoMomento, etiquetasParaFiltro, tirosConfirmado } from './titulo.js?v=62a404f650';
import { falouIsto } from './falas.js?v=62a404f650';

export const CHAVE_FILTRO = 'povix.simplesFiltro';
/** Os tipos do filtro (o `tipo` da etiqueta) na ordem do painel. */
export const TIPOS_DO_FILTRO = ['tiros', 'explosao', 'morte', 'grito', 'chat'];
export const NOTAS = ['', 'bom', 'muitoBom'];
export const LUTAS_MIN = [0, 10, 20, 30, 60];
export const ORDENS = ['live', 'melhores', 'longas'];
const RANK = { talvez: 0, bom: 1, muitoBom: 2 };

export const FILTRO_VAZIO = Object.freeze({ palavra: '', tipos: [], notaMin: '', lutaMinS: 0, ordem: 'live' });

/** Um filtro com tudo dentro do que o painel oferece; o que vier estragado do aparelho volta ao vazio. */
export function limparFiltro(f) {
  const o = f && typeof f === 'object' ? f : {};
  return {
    palavra: String(o.palavra ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    tipos: TIPOS_DO_FILTRO.filter((x) => Array.isArray(o.tipos) && o.tipos.includes(x)),
    notaMin: NOTAS.includes(o.notaMin) ? o.notaMin : '',
    lutaMinS: LUTAS_MIN.includes(Number(o.lutaMinS)) ? Number(o.lutaMinS) : 0,
    ordem: ORDENS.includes(o.ordem) ? o.ordem : 'live',
  };
}

/** Só a parte que filtra (a ordem não esconde nada). */
export const filtraAlgo = (f) => Boolean(f.palavra || f.tipos.length || f.notaMin || f.lutaMinS);
/** Tem algo fora do padrão (filtro ou ordem)? É o que pede os chips e o "Limpar filtro". */
export const filtroAtivo = (f) => filtraAlgo(f) || f.ordem !== 'live';

export function lerFiltro(armazem) {
  try { return limparFiltro(JSON.parse(armazem.getItem(CHAVE_FILTRO) || 'null')); } catch { return limparFiltro(null); }
}
export function guardarFiltro(armazem, f) {
  try {
    if (filtroAtivo(f)) armazem.setItem(CHAVE_FILTRO, JSON.stringify(f)); else armazem.removeItem(CHAVE_FILTRO);
  } catch { /* janela privada */ }
}

/** Os segundos de tiros do momento, só da luta CONFIRMADA (morte vinculada ao POV, ou contexto) — o mesmo
 * combate que o filtro "Luta" casa; som sem confirmação não entra na duração mínima, mesmo com `durS` medido. */
export function lutaDe(m) {
  const etiquetas = etiquetasDoMomento(m);
  const e = etiquetas.find((x) => x.tipo === 'tiros');
  return e && tirosConfirmado(e, etiquetas) ? (e.durS || 0) : 0;
}

/**
 * `momentos` filtrados e na ordem do filtro. `falas(m)` devolve as linhas já lidas daquele momento (ou null): o filtro por
 * palavra só acha o que já tem texto. Momentos de clipe colado passam sem filtrar o tipo (não têm etiqueta).
 *
 * O filtro "Luta" (tipo `tiros`) significa combate CONFIRMADO do próprio jogador — não qualquer indício de som.
 * Um cartão de som sem confirmação não casa esse filtro, mas continua na lista padrão (sem filtro nenhum
 * marcado): o filtro não apaga candidato nenhum, só decide o que CASA a busca por "Luta".
 */
export function aplicarFiltro(momentos, f, { falas = () => null } = {}) {
  const lista = momentos.filter((m) => {
    if (f.tipos.length) {
      const etiquetas = etiquetasDoMomento(m);
      const validas = etiquetasParaFiltro(etiquetas);
      const casa = (tipo) => validas.some((e) => e.tipo === tipo && (tipo !== 'tiros' || tirosConfirmado(e, etiquetas)));
      if (!f.tipos.some(casa)) return false;
    }
    if (f.notaMin && (RANK[m.nota] ?? 0) < RANK[f.notaMin]) return false;
    if (f.lutaMinS && lutaDe(m) < f.lutaMinS) return false;
    if (f.palavra) {
      const linhas = falas(m);
      if (!linhas || !falouIsto(linhas, f.palavra)) return false;
    }
    return true;
  });
  const dur = (m) => (m.ateMs - m.deMs) / 1000;
  if (f.ordem === 'melhores') lista.sort((a, b) => (b.pontos || 0) - (a.pontos || 0) || a.ms - b.ms);
  else if (f.ordem === 'longas') lista.sort((a, b) => lutaDe(b) - lutaDe(a) || dur(b) - dur(a) || a.ms - b.ms);
  else lista.sort((a, b) => a.ms - b.ms);
  return lista;
}

/** Quantos momentos têm texto de fala para o filtro por palavra procurar. */
export const comFala = (momentos, falas) => momentos.filter((m) => falas(m)).length;

/** Os chips de filtros ativos: `[{ chave, valor?, rotulo }]`, cada um tirável sozinho. */
export function chipsDoFiltro(f) {
  const chips = [];
  if (f.palavra) chips.push({ chave: 'palavra', rotulo: t('filtro.chipPalavra', { palavra: f.palavra }) });
  for (const tipo of f.tipos) chips.push({ chave: 'tipos', valor: tipo, rotulo: t(`filtro.tipo.${tipo}`) });
  if (f.notaMin) chips.push({ chave: 'notaMin', rotulo: t('filtro.chipNota', { nota: t(`simples.nota.${f.notaMin}`) }) });
  if (f.lutaMinS) chips.push({ chave: 'lutaMinS', rotulo: t('filtro.chipLuta', { s: f.lutaMinS }) });
  if (f.ordem !== 'live') chips.push({ chave: 'ordem', rotulo: t(`filtro.ordem.${f.ordem}`) });
  return chips;
}

/** O filtro sem um chip. */
export function semChip(f, { chave, valor }) {
  if (chave === 'tipos') return { ...f, tipos: f.tipos.filter((x) => x !== valor) };
  return { ...f, ...{ palavra: { palavra: '' }, notaMin: { notaMin: '' }, lutaMinS: { lutaMinS: 0 }, ordem: { ordem: 'live' } }[chave] };
}
