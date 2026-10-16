// O que o streamer falou num pedaço de live, lembrado neste aparelho só em texto (sem o som): serve para a frase do cartão
// ("Ver o que ele falou") e para o filtro por palavra dita. Vem da legenda gerada no editor ou do botão do cartão.

export const CHAVE_FALAS = 'povix.simplesFalas';
/** Quantos pedaços ficam lembrados (os mais velhos saem), quantas falas cada um e o tamanho de cada fala. */
export const MAX_FALAS = 40;
const MAX_LINHAS = 40;
const MAX_LETRAS = 200;
/** Um momento "tem" a fala de um pedaço quando o pedaço cobre ao menos esta parte do clipe dele. */
export const COBRE_MIN = 0.6;

const limpo = (x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LETRAS);

/** As falas de uma transcrição (legenda.js) como `[{ t, de, ate }]` em ms do relógio da live. */
export function linhasDaTranscricao(tr) {
  return (tr?.linhas || []).map((l) => {
    const p = l.palavras || [];
    return { t: limpo(p.map((x) => x.t).join(' ')), de: p[0]?.de ?? 0, ate: p.at(-1)?.ate ?? p[0]?.de ?? 0 };
  }).filter((l) => l.t);
}

export function lerFalas(armazem) {
  try {
    const l = JSON.parse(armazem.getItem(CHAVE_FALAS) || '[]');
    return Array.isArray(l) ? l.filter((e) => e && typeof e.canal === 'string' && Number.isFinite(e.deMs) && Array.isArray(e.linhas)) : [];
  } catch { return []; }
}

/** Lembrar o que se falou em `deMs` a `ateMs` de `canal` (troca o que já havia do mesmo pedaço). */
export function guardarFala(armazem, { canal, deMs, ateMs, linhas }, agora = Date.now()) {
  if (!canal || !Number.isFinite(deMs) || !Number.isFinite(ateMs)) return;
  const nova = {
    canal, deMs: Math.round(deMs), ateMs: Math.round(ateMs), em: agora,
    linhas: (linhas || []).slice(0, MAX_LINHAS).map((l) => ({ t: limpo(l.t), de: Math.round(l.de), ate: Math.round(l.ate) })).filter((l) => l.t),
  };
  const todas = lerFalas(armazem).filter((e) => !(e.canal === canal && Math.abs(e.deMs - nova.deMs) < 1000 && Math.abs(e.ateMs - nova.ateMs) < 1000));
  todas.push(nova);
  try { armazem.setItem(CHAVE_FALAS, JSON.stringify(todas.slice(-MAX_FALAS))); } catch { /* janela privada, ou cheio */ }
}

/**
 * A fala, entre as já lidas, que cobre o clipe de `deMs` a `ateMs` do canal (a que cobre mais), ou null. Se duas
 * cobrem o mesmo, ganha a mais nova (a lista vem da mais velha para a mais nova): a legenda corrigida no editor,
 * num trecho mais largo, passa à frente do que o botão do cartão leu antes.
 */
export function acharNaLista(falas, canal, deMs, ateMs) {
  const dur = ateMs - deMs;
  if (!canal || !(dur > 0)) return null;
  let melhor = null;
  let melhorCobre = 0;
  for (const e of falas) {
    if (e.canal !== canal) continue;
    const cobre = (Math.min(ateMs, e.ateMs) - Math.max(deMs, e.deMs)) / dur;
    if (cobre >= COBRE_MIN && cobre >= melhorCobre) { melhor = e; melhorCobre = cobre; }
  }
  return melhor;
}

export const acharFala = (armazem, canal, deMs, ateMs) => acharNaLista(lerFalas(armazem), canal, deMs, ateMs);

/**
 * A fala mais forte do momento, como frase para o cartão: das falas de 3 a 160 letras, a que mais pesa (mais palavras,
 * exclamação ou pergunta, e perto do instante `ms` do lance). Vazio quando não houve fala que sirva.
 */
export function melhorFala(linhas, ms) {
  let melhor = '';
  let nota = 0;
  for (const l of linhas || []) {
    const texto = limpo(l.t);
    if (texto.length < 3 || texto.length > 160) continue;
    const palavras = texto.split(' ').length;
    const perto = Number.isFinite(ms) ? Math.max(0, 1 - Math.abs((l.de + l.ate) / 2 - ms) / 15_000) : 0;
    const n = Math.min(palavras, 12) + (/[!?]/.test(texto) ? 3 : 0) + perto * 6;
    if (n > nota) { nota = n; melhor = texto; }
  }
  return melhor;
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todas as palavras de `busca` aparecem (sem acento, sem maiúscula) no que se falou? */
export function falouIsto(linhas, busca) {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const texto = semAcento((linhas || []).map((l) => l.t).join(' '));
  return palavras.every((p) => texto.includes(p));
}
