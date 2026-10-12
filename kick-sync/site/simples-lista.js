// As contas do modo simples (ESTUDO-FACIL.md, plano 1, 2 e 6), sem tela: o que a pessoa escreveu na
// caixa, a lista dos melhores momentos de UM vídeo e o nome do arquivo baixado.
//
// À parte do melhores.js de propósito: aquele junta os lances de um evento inteiro (vários canais, times,
// mortes do servidor) e está a ser mexido por outro trabalho. Aqui é um streamer só e um vídeo só: os
// picos do chat dele e o que o som dele achou, juntos num momento quando caem a menos de um minuto.

import { lerLinkKick } from './kick.js';

/** O nome de um evento salvo como o arquivo dele: "Abisal" e "abisal" são eventos/abisal.json. */
export function nomeDeEvento(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * O que a pessoa colou ou escreveu. Por ordem: um link de evento (?e=abisal, #evento=), um link da Kick
 * (canal, aba de vídeos ou de clipes, vídeo, clipe) e o nome solto, que pode ser de um evento salvo ou de
 * um streamer (quem decide é quem chama, que pode perguntar ao site se o evento existe).
 *
 * Devolve { tipo: 'evento', nome } | { tipo: 'eventoLink', hash } | { tipo: 'nome', slug, evento }
 * | { tipo: 'canal', slug } | { tipo: 'vod', id } | { tipo: 'clipe', id } | null.
 */
export function lerEntrada(texto) {
  const cru = String(texto || '').trim();
  if (!cru) return null;
  const hash = /#.*\bevento=[^&\s]+.*$/.exec(cru);
  if (hash) return { tipo: 'eventoLink', hash: hash[0] };
  const e = /[?&]e=([^&#\s]+)/.exec(cru);
  if (e) {
    let nome = '';
    try { nome = nomeDeEvento(decodeURIComponent(e[1])); } catch { nome = ''; }
    return nome ? { tipo: 'evento', nome } : null;
  }
  const kick = lerLinkKick(cru);
  const evento = nomeDeEvento(cru);
  if (kick?.tipo === 'canal' && !/kick\.com/i.test(cru)) return { tipo: 'nome', slug: kick.slug, evento };
  if (kick) return kick;
  // Duas palavras ("kick off") não são um streamer, mas podem ser um evento salvo.
  if (evento && !/[./:]/.test(cru) && cru.length <= 60) return { tipo: 'nome', slug: null, evento };
  return null;
}

// ── a lista ───────────────────────────────────────────────────────────────

/** Dois sinais a menos disto são o mesmo momento. */
export const JUNTAR_MS = 60_000;
/** Quantos momentos a lista mostra. */
export const QUANTOS = 10;
/** O clipe: uns segundos antes da luta e depois dela, e nunca mais do que um minuto. */
export const ANTES_MS = 5000;
export const DEPOIS_MS = 3000;
export const MAX_CLIPE_MS = 60_000;
export const MIN_CLIPE_MS = 12_000;
/** O chat reage depois do lance: o clipe de um pico do chat começa antes dele. */
export const CHAT_ANTES_MS = 25_000;
export const CHAT_DEPOIS_MS = 5000;

// O chat que fala do som da live, e não do jogo: no Abisal o primeiro lugar da lista era o som do xguiry
// a cair ("esta muted no?", ThisIsFine). Um pico assim vale pouco.
const FALHA = /\b(mut(e|ed|ado|ou)|mudo|sem (som|audio|áudio)|sin (audio|sonido)|no audio|audio|áudio|lag+|lagando|caiu|cay[oó]|se cayo|f5|volume|thisisfine|travou|travando|freez)/i;

/** Quanto do chat em volta de `ms` reclama do som ou da live (0 a 1). */
export function partesDeFalha(mensagens = [], ms) {
  const perto = mensagens.filter((m) => m.ms >= ms - 60_000 && m.ms <= ms + 30_000);
  if (perto.length < 5) return 0;
  return perto.filter((m) => FALHA.test(String(m.texto || ''))).length / perto.length;
}

function pontosDe(s) {
  if (s.tipo === 'chat') return 2 + Math.min(3, Number.isFinite(s.vezes) ? s.vezes / 3 : (s.msgs || 0) / 15);
  if (s.tipo === 'tiros') return 2 + Math.min(3, (s.tiros || 0) / 3);
  if (s.tipo === 'explosao') return 2;
  if (s.tipo === 'grito') return 1.5;
  return 1;
}

/**
 * Os melhores momentos de um vídeo, do melhor para o pior.
 *
 * `picos`: os do chat ({ ms, msgs, vezes }). `sons`: os do som ({ ms, tipo: 'tiros' | 'explosao' | 'grito',
 * combateDeMs, combateAteMs, tiros }). `mensagens`: o chat lido, para descontar as quedas de som.
 * `limites`: { deMs, ateMs } do vídeo, para o clipe não sair dele.
 *
 * Cada momento: { ms, deMs, ateMs, tipos: [...], pontos, nota: 'muitoBom' | 'bom' | 'talvez', falha }.
 */
export function montarLista({ picos = [], sons = [], mensagens = [], limites = null, quantos = QUANTOS } = {}) {
  const sinais = [
    ...picos.filter((p) => Number.isFinite(p.ms)).map((p) => ({ ...p, tipo: 'chat' })),
    ...sons.filter((s) => Number.isFinite(s.ms)),
  ].sort((a, b) => a.ms - b.ms);
  const grupos = [];
  for (const s of sinais) {
    const g = grupos.at(-1);
    if (g && s.ms - g.ultimoMs <= JUNTAR_MS) { g.sinais.push(s); g.ultimoMs = s.ms; } else grupos.push({ sinais: [s], ultimoMs: s.ms });
  }
  const lista = grupos.map(({ sinais: ss }) => {
    const tipos = [...new Set(ss.map((s) => s.tipo))];
    const forte = ss.reduce((a, b) => (pontosDe(b) > pontosDe(a) ? b : a));
    let pontos = Math.max(...ss.map(pontosDe)) + (tipos.length > 1 ? 2 : 0) + Math.min(1, (ss.length - 1) * 0.25);
    const doSom = ss.filter((s) => s.tipo !== 'chat');
    let deMs;
    let ateMs;
    if (doSom.length) {
      deMs = Math.min(...doSom.map((s) => s.combateDeMs ?? s.ms)) - ANTES_MS;
      ateMs = Math.max(...doSom.map((s) => s.combateAteMs ?? s.ms)) + DEPOIS_MS;
    } else {
      deMs = forte.ms - CHAT_ANTES_MS;
      ateMs = forte.ms + CHAT_DEPOIS_MS;
    }
    // Um minuto no máximo, em volta do sinal mais forte; e nunca curto demais para se entender.
    if (ateMs - deMs > MAX_CLIPE_MS) {
      const centro = Math.min(Math.max(forte.ms, deMs + MAX_CLIPE_MS / 2), ateMs - MAX_CLIPE_MS / 2);
      deMs = centro - MAX_CLIPE_MS / 2;
      ateMs = centro + MAX_CLIPE_MS / 2;
    }
    if (ateMs - deMs < MIN_CLIPE_MS) {
      const falta = MIN_CLIPE_MS - (ateMs - deMs);
      deMs -= falta / 2;
      ateMs += falta / 2;
    }
    if (limites) {
      if (deMs < limites.deMs) { ateMs += limites.deMs - deMs; deMs = limites.deMs; }
      if (ateMs > limites.ateMs) { deMs = Math.max(limites.deMs, deMs - (ateMs - limites.ateMs)); ateMs = limites.ateMs; }
    }
    const falha = tipos.includes('chat') && partesDeFalha(mensagens, forte.ms) >= 0.3;
    if (falha) pontos *= 0.3;
    return {
      ms: forte.ms, deMs: Math.round(deMs), ateMs: Math.round(ateMs), tipos, pontos, falha,
      tiros: Math.max(0, ...ss.map((s) => s.tiros || 0)),
    };
  });
  lista.sort((a, b) => b.pontos - a.pontos || a.ms - b.ms);
  return lista.slice(0, quantos).map((m) => ({
    ...m, nota: m.pontos >= 6 ? 'muitoBom' : m.pontos >= 4 ? 'bom' : 'talvez',
  }));
}

// ── o arquivo ─────────────────────────────────────────────────────────────

const dois = (n) => String(n).padStart(2, '0');

/**
 * "xguiry - 10-10 - tiroteio.mp4": o streamer, o dia no relógio do aparelho e o que aconteceu. O
 * `xguiry__20261010-000936Z.mp4` de antes tinha a hora em UTC e um Z que ninguém entende.
 */
export function nomeDoArquivo({ canal, ms, motivo = '', deitado = false, deitadoTexto = 'deitado', extensao = 'mp4' }) {
  const d = new Date(ms);
  const limpo = (x) => String(x || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const partes = [limpo(canal) || 'clipe', `${dois(d.getDate())}-${dois(d.getMonth() + 1)}`, limpo(motivo)].filter(Boolean);
  return `${partes.join(' - ')}${deitado ? ` (${limpo(deitadoTexto)})` : ''}.${extensao}`;
}

/** Quanto tempo depois do começo da live: "1h23" ou "12 min". */
export function tempoNaLive(ms, inicioMs) {
  const min = Math.max(0, Math.floor((ms - inicioMs) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}h${dois(min % 60)}` : `${min} min`;
}

// ── a lista do evento ─────────────────────────────────────────────────────

/** Quantos nomes de quem estava no lance cabem na frase; o resto vira "e mais N". */
export const NOMES_NO_LANCE = 4;
/** A conta do melhores.js tem outra escala (chat até 10 por canal, morte 6, tiros 2 por ângulo). */
const MUITO_BOM_EVENTO = 14;
const BOM_EVENTO = 8;

/**
 * Os lances do evento (melhores.js, com a morte do servidor já dentro) como a lista simples de um vídeo:
 * cada um num canal só (o que mais somou e estava no ar), com o clipe, o motivo e a nota. As mortes e quem
 * mais estava no lance entram na nota (a conta do melhores.js já as soma) e no motivo (`mortes`, `outros`).
 *
 * `lances`: de `filtrarLances`, cada um com `noAr` (os canais com vídeo na hora). `mensagens`: Map canal ->
 * chat, para descontar o pico que só reclama do som. Do melhor para o pior; quem corta é quem chama.
 */
export function lancesParaLista(lances = [], { mensagens = new Map() } = {}) {
  const itens = [];
  for (const l of lances) {
    const canal = (l.noAr || l.canais || [])[0];
    if (!canal || !Number.isFinite(l.ms)) continue;
    const sons = l.sons || {};
    const tipos = [];
    if (l.chat?.canais || l.pedidosClip) tipos.push('chat');
    for (const s of ['tiros', 'explosao', 'grito']) if (sons[s]?.length) tipos.push(s);
    const mortes = (l.mortes || []).filter((m) => m?.vitima).map((m) => ({ matador: m.matador || '', vitima: m.vitima }));
    if (mortes.length) tipos.push('morte');
    const forte = tipos.some((x) => x !== 'chat') || l.kills > 0 || l.voce > 0;
    let deMs = forte ? l.ms - ANTES_MS : l.ms - CHAT_ANTES_MS;
    let ateMs = forte ? Math.max(l.ateMs ?? l.ms, l.ms) + DEPOIS_MS : l.ms + CHAT_DEPOIS_MS;
    if (ateMs - deMs > MAX_CLIPE_MS) ateMs = deMs + MAX_CLIPE_MS;
    if (ateMs - deMs < MIN_CLIPE_MS) ateMs = deMs + MIN_CLIPE_MS;
    const falha = !forte && partesDeFalha(mensagens.get(canal) || [], l.ms) >= 0.3;
    const pontos = (l.pontos || 0) * (falha ? 0.3 : 1);
    itens.push({
      ms: l.ms, deMs: Math.round(deMs), ateMs: Math.round(ateMs), tipos, pontos, falha, canal, doEvento: true,
      mortes, outros: (l.canais || []).filter((c) => c !== canal),
      tiros: sons.tiros?.length || 0,
      nota: pontos >= MUITO_BOM_EVENTO ? 'muitoBom' : pontos >= BOM_EVENTO ? 'bom' : 'talvez',
    });
  }
  return itens.sort((a, b) => b.pontos - a.pontos || a.ms - b.ms);
}
