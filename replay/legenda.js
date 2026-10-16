// A legenda da fala do streamer por cima do clipe exportado, palavra a palavra, como no CapCut.
//
// O dono, 12/10: "legenda da fala do streamer (Whisper no navegador), revisável antes de exportar".
// Vale para o 16:9 e para o 9:16, e a pré-visualização chama exatamente as mesmas funções com o mesmo
// instante: o que se vê na janela é o que sai no vídeo (o mesmo caminho do chat-clipe.js).
//
// O texto vem de um modelo que ouve, e depois da pessoa, que o corrige. Nunca vira HTML: na tela é
// desenhado por `fillText`, e na lista para corrigir vai por `textContent` e `value`.
//
// O relógio é o da noite, como o do chat: cada palavra guarda o instante em que foi dita no relógio
// da noite (o início do clipe mais o tempo dentro do áudio). Assim, aparar as pontas do clipe depois
// de gerar a legenda não desalinha nada.

import { geometria as geometriaDoChat, limparChat, LETRA } from './chat-clipe.js?v=09329c0d2b';
import { ZONA_TIKTOK } from './retrato.js?v=09329c0d2b';
import { limparCaixas } from './caixa-previa.js?v=09329c0d2b';

export const ESTILOS = ['destaque', 'palavra', 'simples'];
export const TAMANHOS = ['p', 'm', 'g'];
export const POSICOES = ['auto', 'baixo', 'meio', 'cima'];
export const IDIOMAS = ['auto', 'pt', 'es', 'en'];
/** As cores do destaque, da paleta do Povix (tokens.css), na versão clara que se lê em cima de um jogo. */
export const CORES = Object.freeze({ turquesa: '#46C6D6', ambar: '#F2B254', branco: '#FFFFFF' });
export const LEGENDA_OMISSAO = Object.freeze({
  ligado: false, estilo: 'destaque', tamanho: 'm', posicao: 'auto', cor: 'turquesa', nome: false,
  idioma: 'auto', traduzir: false, segurar: 0.7, caixas: Object.freeze({ '16:9': null, '9:16': null }),
});

/** Quanto tempo uma fala fica no ecrã depois da última palavra, se a seguinte não começar antes. */
export const SEGURAR_MS = 700;
/** As escolhas de quanto cada fala fica depois da última palavra, em segundos (0,7 é o de sempre). */
export const SEGURAR_S = [0.7, 1.5, 2.5, 4];
export const segurarMs = (l) => (SEGURAR_S.includes(Number(l?.segurar)) ? Number(l.segurar) * 1000 : SEGURAR_MS);
/** Quanto uma fala anda por cada toque nos botões da lista. */
export const PASSO_MS = 100;
/**
 * O que o Whisper base leva por segundo de áudio, num fio. O estudo de 10/10 mediu 0,86 s; em 12/10,
 * com o leitor já feito e clipes reais da Kick, deu de 0,16 a 0,61 s (mais fala, mais conta). Fica 0,7
 * para a conta mostrada não prometer menos do que se espera.
 */
export const SEGUNDOS_POR_SEGUNDO = 0.7;
/** Abrir o modelo já baixado: 3 a 5 s, medido no estudo. */
export const ABRIR_S = 5;

const MAX_LETRAS_PALAVRA = 40;
const MAX_PALAVRAS_LINHA = 40;
const MAX_LINHAS = 600;
// Controlo e marcas de direção do texto: numa legenda só baralham a linha (as mesmas do chat).
const INVISIVEIS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * O idioma da fala para o leitor: o escolhido, ou, em Automático, o que o streamer declarou na Kick
 * ("Portuguese", "Spanish", "English"). Medido em 12/10: num clipe de Rust em português com tiros, a
 * deteção do próprio Whisper ouviu inglês. Sem nada declarado, fica 'auto' (o Whisper decide).
 */
export function idiomaParaOuvir(escolhido, daKick) {
  if (IDIOMAS.includes(escolhido) && escolhido !== 'auto') return escolhido;
  const k = String(daKick ?? '').toLowerCase();
  if (/portug/.test(k)) return 'pt';
  if (/span|espa/.test(k)) return 'es';
  if (/engl|ingl/.test(k)) return 'en';
  return 'auto';
}

/** As escolhas da legenda com tudo dentro dos limites; o que vier estragado volta ao de omissão. */
export function limparLegenda(o) {
  const l = o && typeof o === 'object' ? o : {};
  return {
    ligado: l.ligado === true,
    estilo: ESTILOS.includes(l.estilo) ? l.estilo : LEGENDA_OMISSAO.estilo,
    tamanho: TAMANHOS.includes(l.tamanho) ? l.tamanho : LEGENDA_OMISSAO.tamanho,
    posicao: POSICOES.includes(l.posicao) ? l.posicao : LEGENDA_OMISSAO.posicao,
    cor: Object.hasOwn(CORES, l.cor) ? l.cor : LEGENDA_OMISSAO.cor,
    nome: l.nome === true,
    idioma: IDIOMAS.includes(l.idioma) ? l.idioma : LEGENDA_OMISSAO.idioma,
    traduzir: l.traduzir === true,
    segurar: SEGURAR_S.includes(Number(l.segurar)) ? Number(l.segurar) : LEGENDA_OMISSAO.segurar,
    // Onde a pessoa pôs a caixa arrastando, por formato (null = o lugar de `posicao`).
    caixas: limparCaixas(l.caixas, { min: 0.15 }),
  };
}

// ── o texto ──────────────────────────────────────────────────────────────────

/** Uma palavra como se guarda: sem invisíveis, sem espaços, no máximo 40 letras. */
function limparPalavra(t) {
  return Array.from(String(t ?? '').replace(INVISIVEIS, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, MAX_LETRAS_PALAVRA).join('');
}

/**
 * Uma transcrição guardada (no aparelho, ou que veio do Worker) com tudo dentro dos limites, ou null.
 * `{ canal, deMs, ateMs, idioma, traduzida, linhas: [{ palavras: [{ t, de, ate }] }] }`, com os
 * tempos em ms no relógio da noite e as linhas por ordem.
 */
export function limparTranscricao(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.linhas)) return null;
  const deMs = Math.round(Number(x.deMs));
  const ateMs = Math.round(Number(x.ateMs));
  if (!Number.isFinite(deMs) || !Number.isFinite(ateMs) || ateMs <= deMs) return null;
  const linhas = [];
  for (const l of x.linhas.slice(0, MAX_LINHAS)) {
    const palavras = [];
    for (const p of (Array.isArray(l?.palavras) ? l.palavras : []).slice(0, MAX_PALAVRAS_LINHA)) {
      const t = limparPalavra(p?.t);
      const de = Math.round(Number(p?.de));
      const ate = Math.round(Number(p?.ate));
      if (!t || !Number.isFinite(de) || !Number.isFinite(ate)) continue;
      palavras.push({ t, de, ate: Math.max(de, ate) });
    }
    if (palavras.length) linhas.push({ palavras });
  }
  linhas.sort((a, b) => a.palavras[0].de - b.palavras[0].de);
  return {
    canal: typeof x.canal === 'string' ? x.canal.slice(0, 60) : '',
    deMs,
    ateMs,
    idioma: IDIOMAS.includes(x.idioma) ? x.idioma : 'auto',
    traduzida: x.traduzida === true,
    linhas,
  };
}

/** As palavras do transformers.js ({ text, timestamp: [de, ate] } em segundos) em { t, de, ate }. */
export function palavrasDe(saida, duracaoS) {
  const lista = [];
  for (const c of saida?.chunks || []) {
    const t = limparPalavra(c?.text);
    const [de, ate] = Array.isArray(c?.timestamp) ? c.timestamp : [];
    if (!t || !Number.isFinite(de)) continue;
    const fim = Number.isFinite(ate) && ate > de ? ate : de + 0.4;
    lista.push({ t, de: Math.max(0, de), ate: Math.min(duracaoS, fim) });
  }
  return lista;
}

/**
 * As janelas em que o áudio é lido: 30 s cada (o que o Whisper ouve de uma vez), a andar 20 s, para
 * cada uma ter 5 s de sobra de cada lado. De cada janela só ficam as palavras do miolo (`deS` a `ateS`,
 * em segundos do áudio todo): uma palavra cortada na beira de uma janela fica inteira no miolo da
 * vizinha. `ini` e `fim` em amostras.
 */
export function janelasDoAudio(n, taxa, { janelaS = 30, sobraS = 5 } = {}) {
  const janela = Math.round(janelaS * taxa);
  const passo = Math.round((janelaS - 2 * sobraS) * taxa);
  const lista = [];
  for (let ini = 0; ; ini += passo) {
    const fim = Math.min(n, ini + janela);
    const ultima = fim >= n;
    lista.push({
      ini, fim,
      deS: ini === 0 ? 0 : (ini + sobraS * taxa) / taxa,
      ateS: ultima ? Infinity : (ini + janela - sobraS * taxa) / taxa,
    });
    if (ultima) break;
  }
  return lista;
}

/**
 * As palavras de todas as janelas num só texto, em segundos do áudio todo: de cada janela, as que têm
 * o meio dentro do miolo dela.
 */
export function juntarJanelas(resultados, taxa) {
  const saida = [];
  for (const { janela: j, palavras } of resultados) {
    const desvio = j.ini / taxa;
    for (const p of palavras) {
      const de = p.de + desvio;
      const ate = p.ate + desvio;
      const meio = (de + ate) / 2;
      if (meio >= j.deS && meio < j.ateS) saida.push({ t: p.t, de, ate });
    }
  }
  return saida.sort((a, b) => a.de - b.de);
}

// Frases que o Whisper escreve quando não há fala (aprendeu-as nos créditos de legendas da internet).
const INVENTADAS = [
  /amara\.org/i, /legendas pela comunidade/i, /subt[ií]tulos (realizados|por) /i, /legendado por/i,
  /^(obrigad[oa] por assistir|thanks for watching|gracias por ver)[.!]*$/i,
];

const normal = (t) => t.toLocaleLowerCase().replace(/[.,!?¿¡;:…"'()-]/g, '');

/**
 * Cortar os laços: quando o modelo se perde no ruído, repete o mesmo bocado sem fim ("o que é o que é
 * o que é...", 40 s disso num clipe de Rust medido em 12/10). Um bocado de 1 a 8 palavras repetido três
 * vezes ou mais seguidas fica só duas vezes (duas é fala normal: "calma, calma").
 */
export function semLacos(palavras) {
  const w = palavras.map((p) => normal(p.t));
  const saida = [];
  let i = 0;
  while (i < palavras.length) {
    let saltou = false;
    for (let g = 1; g <= 8 && i + 3 * g <= palavras.length; g++) {
      let r = 1;
      while (i + (r + 1) * g <= palavras.length && w.slice(i + r * g, i + (r + 1) * g).every((x, j) => x === w[i + j])) r++;
      if (r >= 3) {
        saida.push(...palavras.slice(i, i + 2 * g));
        i += r * g;
        saltou = true;
        break;
      }
    }
    if (!saltou) { saida.push(palavras[i]); i++; }
  }
  return saida;
}

/** Tirar as frases de créditos que o modelo escreve sobre ruído ("Legendas pela comunidade Amara.org"). */
export function semInventadas(linhas) {
  return linhas.filter((l) => !INVENTADAS.some((r) => r.test(l.palavras.map((p) => p.t).join(' '))));
}

/**
 * Partir as palavras em falas (as linhas da lista e da legenda): numa pausa, no fim de uma frase, ou
 * quando a fala já vai longa. `palavras` em ms, por ordem.
 */
export function agruparLinhas(palavras, { maxPalavras = 7, maxMs = 3500, pausaMs = 650, maxLetras = 44 } = {}) {
  const linhas = [];
  let atual = [];
  let letras = 0;
  for (const p of palavras) {
    const ultima = atual.at(-1);
    const quebra = ultima && (
      p.de - ultima.ate >= pausaMs
      || /[.!?…]$/.test(ultima.t)
      || atual.length >= maxPalavras
      || p.ate - atual[0].de > maxMs
      || letras + p.t.length + 1 > maxLetras
    );
    if (quebra) { linhas.push({ palavras: atual }); atual = []; letras = 0; }
    atual.push(p);
    letras += p.t.length + 1;
  }
  if (atual.length) linhas.push({ palavras: atual });
  return linhas;
}

/**
 * A transcrição de um clipe a partir do que o Worker devolveu (segundos dentro do áudio, que começa
 * em `deMs` no relógio da noite).
 */
export function transcricaoDoAudio(palavrasS, { canal, deMs, ateMs, idioma = 'auto', traduzida = false }) {
  const emMs = palavrasS
    .filter((p) => p && Number.isFinite(p.de))
    .map((p) => ({
      t: p.t,
      de: Math.round(deMs + p.de * 1000),
      ate: Math.round(deMs + Math.max(p.de, Number.isFinite(p.ate) ? p.ate : p.de + 0.4) * 1000),
    }))
    .sort((a, b) => a.de - b.de);
  return limparTranscricao({
    canal, deMs, ateMs, idioma, traduzida, linhas: semInventadas(agruparLinhas(semLacos(emMs))),
  });
}

// ── corrigir ─────────────────────────────────────────────────────────────────

export const textoDaLinha = (linha) => linha.palavras.map((p) => p.t).join(' ');

/**
 * Trocar o texto de uma fala. Com o mesmo número de palavras, cada uma fica com o seu tempo; com
 * outro número, o tempo da fala reparte-se pelas palavras novas pelo tamanho de cada uma. Texto vazio
 * apaga a fala. Devolve uma transcrição nova.
 */
export function editarLinha(tr, k, texto) {
  const linha = tr?.linhas?.[k];
  if (!linha) return tr;
  const novas = String(texto ?? '').replace(INVISIVEIS, ' ').split(/\s+/).map(limparPalavra).filter(Boolean)
    .slice(0, MAX_PALAVRAS_LINHA);
  if (!novas.length) return apagarLinha(tr, k);
  let palavras;
  if (novas.length === linha.palavras.length) {
    palavras = linha.palavras.map((p, i) => ({ ...p, t: novas[i] }));
  } else {
    const de = linha.palavras[0].de;
    const ate = linha.palavras.at(-1).ate;
    const pesos = novas.map((t) => Array.from(t).length + 1);
    const soma = pesos.reduce((s, x) => s + x, 0);
    let x = de;
    palavras = novas.map((t, i) => {
      const fim = i === novas.length - 1 ? ate : Math.round(x + ((ate - de) * pesos[i]) / soma);
      const p = { t, de: Math.round(x), ate: Math.max(Math.round(x), fim) };
      x = fim;
      return p;
    });
  }
  return { ...tr, linhas: tr.linhas.map((l, i) => (i === k ? { palavras } : l)) };
}

/** Tirar uma fala inteira. */
export function apagarLinha(tr, k) {
  if (!tr?.linhas?.[k]) return tr;
  return { ...tr, linhas: tr.linhas.filter((_, i) => i !== k) };
}

/**
 * Mexer no tempo de uma fala inteira (`deltaMs`, para trás ou para a frente), sem sair do áudio que
 * foi ouvido. As falas voltam a ficar por ordem.
 */
export function deslocarLinha(tr, k, deltaMs) {
  const linha = tr?.linhas?.[k];
  if (!linha || !Number.isFinite(deltaMs)) return tr;
  const de = linha.palavras[0].de;
  const ate = linha.palavras.at(-1).ate;
  const d = Math.round(Math.min(tr.ateMs - ate, Math.max(tr.deMs - de, deltaMs)));
  if (!d) return tr;
  const nova = { palavras: linha.palavras.map((p) => ({ ...p, de: p.de + d, ate: p.ate + d })) };
  const linhas = tr.linhas.map((l, i) => (i === k ? nova : l)).sort((a, b) => a.palavras[0].de - b.palavras[0].de);
  return { ...tr, linhas };
}

/** O instante de uma fala para a lista, contado do início do clipe: "0:03.2". */
export function rotuloTempo(ms, inicioMs) {
  const d = Math.max(0, Math.round((ms - inicioMs) / 100));
  const s = Math.floor(d / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${d % 10}`;
}

/** Se a transcrição serve para este clipe: o mesmo canal, e o pedaço dentro do que foi ouvido. */
export function cobre(tr, { canal, deMs, ateMs }) {
  if (!tr) return 'falta';
  if (tr.canal && canal && tr.canal !== canal) return 'outroCanal';
  if (deMs < tr.deMs - 250 || ateMs > tr.ateMs + 250) return 'foraDoPedaco';
  return 'ok';
}

/** As falas de que um clipe de `deMs` a `ateMs` precisa (para o guardar na kill sem o resto). */
export function linhasNoPedaco(tr, deMs, ateMs) {
  return (tr?.linhas || []).filter((l) => l.palavras.at(-1).ate >= deMs && l.palavras[0].de <= ateMs);
}

// ── o tempo ──────────────────────────────────────────────────────────────────

/**
 * A fala no ecrã no instante `ms`: a última que já começou, enquanto não passar `SEGURAR_MS` do fim
 * dela nem começar a seguinte. -1 quando não há nenhuma.
 */
export function linhaNoInstante(tr, ms, segurar = SEGURAR_MS) {
  const linhas = tr?.linhas;
  if (!linhas?.length || !Number.isFinite(ms)) return -1;
  let lo = 0;
  let hi = linhas.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (linhas[meio].palavras[0].de <= ms) lo = meio + 1; else hi = meio;
  }
  const k = lo - 1;
  if (k < 0) return -1;
  const fim = linhas[k].palavras.at(-1).ate + segurar;
  const seguinte = linhas[k + 1]?.palavras[0].de ?? Infinity;
  return ms < Math.min(fim, seguinte) ? k : -1;
}

// ── a arrumação ──────────────────────────────────────────────────────────────

// O corpo da letra numa tela de 1080 de altura (16:9) ou de largura (9:16), por estilo e tamanho.
const CORPO = {
  destaque: { p: 54, m: 66, g: 82 },
  palavra: { p: 84, m: 104, g: 128 },
  simples: { p: 36, m: 44, g: 54 },
};
// Quantas palavras e quantas linhas cabem num ecrã de cada estilo.
const POR_ECRA = {
  destaque: { palavras: 4, linhas: 2 },
  palavra: { palavras: 1, linhas: 1 },
  simples: { palavras: 40, linhas: 2 },
};

export const pesoDe = (estilo) => (estilo === 'simples' ? 600 : 700);
export const fonteDe = (estilo, px) => `${pesoDe(estilo)} ${px}px ${LETRA}`;
/** O texto como aparece: em maiúsculas nos estilos grandes, como no CapCut. */
export const comoAparece = (t, estilo) => (estilo === 'simples' ? t : t.toLocaleUpperCase());

/**
 * Partir as palavras de uma fala em ecrãs que cabem em `largura`, com no máximo `porEcra.palavras`
 * palavras e `porEcra.linhas` linhas cada. `medir(texto)` dá a largura de um texto. `prefixo` (o nome
 * de quem fala, no estilo simples) entra no começo de cada ecrã.
 * Devolve `[{ linhas: [[{ i, t, x, w }]], largura, de }]`; `i` é o índice da palavra na fala (-1 no
 * prefixo) e `x` conta do começo da linha.
 */
export function paginar(palavras, { largura, medir, porEcra = POR_ECRA.destaque, prefixo = '' }) {
  const espaco = medir(' ');
  const ecras = [];
  let ecra = null;
  const novoEcra = () => {
    ecra = { linhas: [[]], de: null, n: 0 };
    ecras.push(ecra);
    if (prefixo) ecra.linhas[0].push({ i: -1, t: prefixo, x: 0, w: medir(prefixo) });
  };
  const fimDa = (l) => (l.length ? l.at(-1).x + l.at(-1).w : 0);
  palavras.forEach((p, i) => {
    if (!ecra || ecra.n >= porEcra.palavras) novoEcra();
    const w = medir(p.t);
    let linha = ecra.linhas.at(-1);
    const x = linha.length ? fimDa(linha) + espaco : 0;
    if (linha.length && x + w > largura) {
      if (ecra.linhas.length >= porEcra.linhas) {
        novoEcra();
        linha = ecra.linhas.at(-1);
      } else {
        linha = [];
        ecra.linhas.push(linha);
      }
    }
    linha.push({ i, t: p.t, x: linha.length ? fimDa(linha) + espaco : 0, w });
    ecra.n++;
    if (ecra.de == null) ecra.de = p.de;
  });
  return ecras.map(({ linhas, de }) => ({ linhas, de, largura: Math.max(...linhas.map(fimDa)) }));
}

// As falas já partidas em ecrãs, por fala e por letra: a cada frame só se mede o que mudou.
const arrumadas = new WeakMap();

/**
 * O que se vê no instante `ms`: a fala, o ecrã dela e a palavra que está a ser dita.
 * Devolve `{ k, ecra, atual }` ou null. `atual` é o índice da palavra dita (na fala).
 */
export function quadroNoInstante(tr, ms, legenda, geo, medir, { nome = '' } = {}) {
  const l = limparLegenda(legenda);
  const k = linhaNoInstante(tr, ms, segurarMs(l));
  if (k < 0) return null;
  const linha = tr.linhas[k];
  const prefixo = l.nome && nome && l.estilo === 'simples' ? `${nome}:` : '';
  const chave = `${l.estilo}|${geo.fonte}|${geo.largura}|${prefixo}`;
  let porLetra = arrumadas.get(linha);
  if (!porLetra) { porLetra = new Map(); arrumadas.set(linha, porLetra); }
  let ecras = porLetra.get(chave);
  if (!ecras) {
    const palavras = linha.palavras.map((p) => ({ ...p, t: comoAparece(p.t, l.estilo) }));
    ecras = paginar(palavras, { largura: geo.largura, medir, porEcra: POR_ECRA[l.estilo], prefixo });
    if (porLetra.size > 8) porLetra.clear();
    porLetra.set(chave, ecras);
  }
  let e = 0;
  while (e + 1 < ecras.length && ecras[e + 1].de <= ms) e++;
  let atual = -1;
  linha.palavras.forEach((p, i) => { if (p.de <= ms) atual = i; });
  return { k, ecra: ecras[e], atual };
}

// ── a geometria ──────────────────────────────────────────────────────────────

/** A caixa que o chat pode ocupar (a mais alta, com todas as linhas cheias), ou null. */
export function caixaDoChat(alvo, chat, opcoes) {
  if (!chat?.ligado) return null;
  const c = limparChat(chat);
  const g = geometriaDoChat(alvo, c, opcoes);
  const entre = Math.round(g.fonte * 0.22);
  const alto = c.linhas * (g.alturaLinha + g.folga) + entre * (c.linhas - 1);
  const topo = g.ancora === 'baixo' ? g.y - alto : g.ancora === 'meio' ? g.y - alto / 2 : g.y;
  return { x: g.x, y: topo, largura: g.largura, altura: alto };
}

const cruza = (a, b) => a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura;

/**
 * Onde fica a legenda numa tela de `alvo` (a do ficheiro), e com que letra.
 *
 * `formato` é '16:9' ou '9:16'. No 9:16 o fundo (botões, nome e descrição da TikTok, dos Reels e dos
 * Shorts) e o topo ficam tapados, e a legenda fica no terço de baixo, acima dos botões. Em automático
 * ela foge do chat, se ele estiver ligado: no 16:9 vai para o lado livre do fundo, e no 9:16 sobe para
 * cima dele (ou desce para baixo dele, quando o chat está em cima).
 *
 * Devolve `{ x, y, ancora, largura, fonte, alturaLinha, linhas }`: `x` é o meio da legenda, `y` o
 * fundo ('baixo'), o topo ('cima') ou o meio ('meio') do bloco.
 */
export function geometriaLegenda(alvo, legenda, { formato = '16:9', modo = 'um', divisao = 0.35, chat = null } = {}) {
  const l = limparLegenda(legenda);
  const W = alvo.largura;
  const H = alvo.altura;
  const vertical = formato === '9:16';
  const escala = vertical ? W / 1080 : H / 1080;
  const fonte = Math.round(CORPO[l.estilo][l.tamanho] * escala * (vertical ? 1.2 : 1));
  const alturaLinha = Math.round(fonte * (l.estilo === 'simples' ? 1.3 : 1.18));
  const linhas = POR_ECRA[l.estilo].linhas;
  // O nome em cima da fala (nos estilos grandes) ocupa mais meia linha.
  const altoBloco = linhas * alturaLinha + (l.nome && l.estilo !== 'simples' ? Math.round(alturaLinha * 0.6) : 0);
  const margem = Math.round((vertical ? 40 : 32) * escala);
  // No 9:16 a largura é a da zona livre da TikTok, igual dos dois lados do meio para a legenda ficar
  // centrada: sem a coluna de botões da direita (e o mesmo espaço à esquerda).
  const largura = Math.round(W * (vertical ? 1 - 2 * ZONA_TIKTOK.direita : 0.7));
  const base = { fonte, alturaLinha, linhas, largura, alto: altoBloco };
  // Em baixo, uns 6% acima do fim da zona livre, onde a TikTok põe a legenda dela.
  const fundo = vertical ? Math.round(H * (1 - ZONA_TIKTOK.baixo - 0.06)) : H - Math.round(H * 0.07);
  const topo = vertical ? Math.round(H * 0.14) : Math.round(H * 0.08);
  const em = (pos) => {
    if (pos === 'cima') return { ...base, x: W / 2, y: topo, ancora: 'cima' };
    if (pos === 'meio') return { ...base, x: W / 2, y: Math.round(H / 2), ancora: 'meio' };
    return { ...base, x: W / 2, y: fundo, ancora: 'baixo' };
  };
  const caixa0 = l.caixas[formato];
  if (caixa0) {
    // Arrastada pela pessoa: a largura da caixa escala a letra (a de 'tamanho' é a de largura inteira),
    // e o texto fica centrado no meio da caixa.
    const f = (caixa0.w * W) / largura;
    const fonteC = Math.max(10, Math.round(fonte * f));
    const lh = Math.round(fonteC * (l.estilo === 'simples' ? 1.3 : 1.18));
    const alto = linhas * lh + (l.nome && l.estilo !== 'simples' ? Math.round(lh * 0.6) : 0);
    return {
      fonte: fonteC, alturaLinha: lh, linhas, largura: Math.round(caixa0.w * W), alto,
      x: Math.round((caixa0.x + caixa0.w / 2) * W), y: Math.round(caixa0.y * H + alto / 2), ancora: 'meio',
    };
  }
  if (l.posicao !== 'auto') return em(l.posicao);
  const desejada = em('baixo');
  const caixa = caixaDoChat(alvo, chat, { formato, modo, divisao });
  const caixaDe = (g) => {
    const y = g.ancora === 'baixo' ? g.y - altoBloco : g.ancora === 'meio' ? g.y - altoBloco / 2 : g.y;
    return { x: g.x - g.largura / 2, y, largura: g.largura, altura: altoBloco };
  };
  if (!caixa || !cruza(caixaDe(desejada), caixa)) return desejada;
  if (!vertical) {
    // Primeiro ao meio, mais estreita, até à beira do chat: é onde se lê uma legenda, e longe do canto
    // de baixo à direita, onde o Rust mostra a vida e as balas.
    const folgaMeio = Math.min(Math.abs(W / 2 - (caixa.x + caixa.largura)), Math.abs(caixa.x - W / 2)) - margem;
    const estaDeUmLado = caixa.x + caixa.largura <= W / 2 || caixa.x >= W / 2;
    if (estaDeUmLado && 2 * folgaMeio >= W * 0.3) return { ...desejada, largura: Math.round(Math.min(largura, 2 * folgaMeio)) };
    // Senão, o fundo no lado que o chat deixa livre.
    const esq = caixa.x;
    const dir = W - (caixa.x + caixa.largura);
    const livre = dir >= esq
      ? { de: caixa.x + caixa.largura + margem, ate: W - margem }
      : { de: margem, ate: caixa.x - margem };
    const w = livre.ate - livre.de;
    if (w >= W * 0.4) return { ...desejada, x: Math.round((livre.de + livre.ate) / 2), largura: Math.round(Math.min(largura, w)) };
    return { ...desejada, y: caixa.y - margem };
  }
  // 9:16: por cima do chat, se couber abaixo do topo; senão por baixo dele, e no fim no meio.
  const acima = { ...desejada, y: Math.round(caixa.y - margem) };
  if (acima.y - altoBloco >= topo) return acima;
  const abaixo = { ...desejada, y: Math.round(caixa.y + caixa.altura + margem), ancora: 'cima' };
  if (abaixo.y + altoBloco <= Math.round(H * (1 - ZONA_TIKTOK.baixo))) return abaixo;
  return em('meio');
}

/**
 * A caixa da legenda na prévia, em fração do quadro: `{ x, y, w, h }`. A que a pessoa arrastou, ou a
 * do lugar automático (com a largura inteira, para a letra não mudar no primeiro arrasto).
 */
export function retanguloDaLegenda(alvo, legenda, opcoes) {
  const l = limparLegenda(legenda);
  const formato = opcoes?.formato || '16:9';
  const g = geometriaLegenda(alvo, l, opcoes);
  const topo = g.ancora === 'baixo' ? g.y - g.alto : g.ancora === 'meio' ? g.y - g.alto / 2 : g.y;
  let largura = g.largura;
  if (!l.caixas[formato]) {
    const inteira = alvo.largura * (formato === '9:16' ? 1 - 2 * ZONA_TIKTOK.direita : 0.7);
    largura = Math.max(largura, Math.round(inteira));
  }
  const w = largura / alvo.largura;
  const x = Math.min(Math.max(0, g.x / alvo.largura - w / 2), 1 - w);
  return { x, y: topo / alvo.altura, w, h: g.alto / alvo.altura };
}

// ── o desenho ────────────────────────────────────────────────────────────────

/** O nome de quem fala como se mostra: o slug sem nada que não seja nome. */
export function nomeDeQuemFala(slug) {
  return Array.from(String(slug ?? '').replace(INVISIVEIS, '').trim()).slice(0, 25).join('');
}

function caixaRedonda(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Pintar a legenda de `tr` no instante `ms` (relógio da noite) por cima do que já está em `ctx`.
 * `geo` vem de `geometriaLegenda`; `nome` é o slug do streamer (só aparece com a escolha ligada).
 * Devolve true se pintou alguma coisa.
 */
export function desenharLegenda(ctx, tr, ms, legenda, geo, { nome = '' } = {}) {
  const l = limparLegenda(legenda);
  const px = geo.fonte;
  const fonte = fonteDe(l.estilo, px);
  const quem = l.nome ? nomeDeQuemFala(nome) : '';
  ctx.save();
  ctx.font = fonte;
  const medir = (t) => ctx.measureText(t).width;
  const q = quadroNoInstante(tr, ms, l, geo, medir, { nome: quem });
  if (!q) { ctx.restore(); return false; }
  const { ecra, atual } = q;
  // Uma palavra maior do que a linha (um nome de item colado) encolhe o ecrã inteiro para caber.
  const encolhe = Math.min(1, geo.largura / Math.max(1, ecra.largura));
  const lh = geo.alturaLinha * encolhe;
  const tag = quem && l.estilo !== 'simples' ? Math.round(lh * 0.6) : 0;
  const alto = ecra.linhas.length * lh + tag;
  let y = geo.ancora === 'baixo' ? geo.y - alto : geo.ancora === 'meio' ? geo.y - alto / 2 : geo.y;
  const destaque = CORES[l.cor];
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (tag) {
    const pxNome = Math.round(px * 0.42 * encolhe);
    ctx.font = `700 ${pxNome}px ${LETRA}`;
    const w = ctx.measureText(quem).width;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = Math.max(2, pxNome * 0.22);
    ctx.strokeText(quem, geo.x - w / 2, y + tag / 2);
    ctx.fillStyle = destaque;
    ctx.fillText(quem, geo.x - w / 2, y + tag / 2);
    y += tag;
  }
  ctx.font = encolhe < 1 ? fonteDe(l.estilo, px * encolhe) : fonte;
  if (l.estilo === 'simples') {
    // Legenda de cinema: uma caixa escura à volta das duas linhas, texto claro, sem destaque.
    const folga = Math.round(px * 0.35);
    const larguras = ecra.linhas.map((ln) => (ln.length ? (ln.at(-1).x + ln.at(-1).w) * encolhe : 0));
    ctx.fillStyle = 'rgba(10, 10, 14, 0.66)';
    for (const [r, wl] of larguras.entries()) {
      caixaRedonda(ctx, geo.x - wl / 2 - folga, y + r * lh, wl + 2 * folga, lh, Math.round(px * 0.2));
      ctx.fill();
    }
  }
  for (const [r, ln] of ecra.linhas.entries()) {
    const wl = ln.length ? (ln.at(-1).x + ln.at(-1).w) * encolhe : 0;
    const x0 = geo.x - wl / 2;
    const meio = y + r * lh + lh / 2;
    for (const p of ln) {
      const x = x0 + p.x * encolhe;
      if (l.estilo === 'simples') {
        ctx.fillStyle = p.i < 0 ? destaque : '#F4F5F7';
        ctx.fillText(p.t, x, meio);
        continue;
      }
      // O contorno grosso e preto do CapCut, e a palavra dita na cor escolhida. Com o destaque
      // branco, as outras ficam num cinzento claro para a dita se ver.
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(3, px * encolhe * 0.16);
      ctx.strokeText(p.t, x, meio);
      const dita = p.i === atual;
      ctx.fillStyle = dita ? destaque : l.cor === 'branco' ? '#B9BDC4' : '#FFFFFF';
      ctx.fillText(p.t, x, meio);
    }
  }
  ctx.restore();
  return true;
}
