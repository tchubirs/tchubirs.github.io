// O modo simples (ESTUDO-FACIL.md): uma caixa, um botão, e a lista dos melhores momentos com Baixar.
//
// O pedido do dono, 12/10: a esposa dele, que clipa, não conseguiu usar o Povix. Isto é a tela dela: cola
// o nome (ou o link, ou o evento), toca um botão, e o Povix faz o resto sozinho com o que já existia: abre
// o último vídeo do streamer, lê o chat (rápido), ouve os tiros só em volta dos picos do chat, e mostra os
// momentos com uma imagem, o motivo em palavras e um "Baixar para TikTok" que já sai em pé, com o rosto do
// streamer achado sozinho. Nada do que existia saiu: está tudo em "Modo avançado".
//
// As contas (o que se escreveu, a lista, o nome do arquivo) vivem em simples-lista.js. O que é da página de
// sempre (abrir o canal, gravar o clipe) chega pela `ponte` que o app.js passa: este arquivo não mexe no
// estado dele por conta própria.

import { t, tn } from './idiomas.js?v=5786e60976';
import { procurarCanais, vodsDoCanal, vodDaKick, slugDoNome } from './kick.js?v=5786e60976';
import {
  lerEntrada, montarLista, lancesParaLista, nomeDoArquivo, tempoNaLive, NOMES_NO_LANCE, QUANTOS,
  acharVod, guardarVod, mensagensDosPicos, lerUltimo, guardarUltimo,
} from './simples-lista.js?v=5786e60976';
import { varrerNoite } from './procurar-momentos.js?v=5786e60976';
import { somDoCanal } from './alinhar.js?v=5786e60976';
import { TAXA_TIROS } from './tiros.js?v=5786e60976';
import { alertasDoCanal } from './alertas.js?v=5786e60976';
import { montarIndice, chaveDoIndice, indiceValido } from './indice.js?v=5786e60976';
import { janelasDosPicos, estimarFalta, estimarFaltaFracao, tempoFalta } from './ouvir.js?v=5786e60976';
import { onde } from './relogio.js?v=5786e60976';
import { abrirQuadrosEscondidos } from './rosto.js?v=5786e60976';
import { escapar } from './escapar.js?v=5786e60976';
import {
  tituloDoMomento, etiquetasDoMomento, confExibida, confMedia, VERSAO_ETIQUETAS, textoDoContexto,
} from './titulo.js?v=5786e60976';
import {
  lerFiltro, guardarFiltro, limparFiltro, filtroAtivo, filtraAlgo, aplicarFiltro, chipsDoFiltro, semChip, comFala, TIPOS_DO_FILTRO,
} from './simples-filtro.js?v=5786e60976';
import { lerFalas, guardarFala, acharNaLista, melhorFala } from './falas.js?v=5786e60976';
import {
  analisarCandidatos, comContexto, contextoVigente, contextoDoMomento, precisaDeContexto, MAX_CANDIDATOS_POR_LIVE, ENDPOINT_PADRAO,
} from './contexto-candidatos.js?v=5786e60976';
import { VERSAO_CONTRATO, MAX_IMAGEM_BYTES } from './contexto-rust.js?v=5786e60976';
import { fundirPovsPorCanal } from './simples-lista.js?v=5786e60976';

const CHAVE_MODO = 'povix.modo';
const CHAVE_VISTO = 'povix.simplesVisto';
const CHAVE_NAO = 'povix.simplesNao';
const CHAVE_MEUPOV = 'povix.simplesMeuPov';
const MAX_NAO = 300;
const $ = (id) => document.getElementById(id);

// O que já se achou de um vídeo fica neste aparelho (simples-lista.js): a lista no localStorage, as imagens
// no IndexedDB (pesam demais para o localStorage). O `localStorage` só é tocado dentro das funções de lá,
// que já se defendem de uma janela privada.
const armazem = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
};
const prefixoDe = (v) => `${v.slug}|${v.inicio}|`;
// 13/10: as imagens de 640x360 a partir do 480p ficam sob "f2|"; as velhas, borradas, só servem até haver estas.
const NITIDA = 'f2|';
let bancoDeFotos = null;
function banco() {
  bancoDeFotos ??= new Promise((ok) => {
    try {
      // Versão 2: o índice de cada live (indice.js) vai numa loja ao lado das imagens.
      const r = indexedDB.open('povix-simples', 2);
      r.onupgradeneeded = () => {
        for (const loja of ['fotos', 'indices']) if (!r.result.objectStoreNames.contains(loja)) r.result.createObjectStore(loja);
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch { ok(null); }
  });
  return bancoDeFotos;
}
/** Uma operação numa loja do banco; sem banco (janela privada) é como se não houvesse nada guardado. */
async function naLoja(loja, modo, fazer, seNao) {
  const db = await banco();
  if (!db) return seNao;
  return new Promise((ok) => {
    try {
      const tx = db.transaction(loja, modo);
      const r = fazer(tx.objectStore(loja));
      tx.oncomplete = () => ok(r?.result ?? seNao);
      tx.onerror = () => ok(seNao);
      tx.onabort = () => ok(seNao);
    } catch { ok(seNao); }
  });
}
const faixaDe = (prefixo) => IDBKeyRange.bound(prefixo, `${prefixo}\uffff`);
const nasFotos = (modo, fazer, seNao) => naLoja('fotos', modo, fazer, seNao);
/** O índice de uma live (indice.js): de uma passada de análise, para consultar sem ouvir de novo. */
const guardarIndice = (indice) => naLoja('indices', 'readwrite', (s) => s.put(indice, chaveDoIndice(indice.slug, indice.inicio)), null);
const tirarIndice = (v) => naLoja('indices', 'readwrite', (s) => s.delete(chaveDoIndice(v.slug, v.inicio)), null);
export const lerIndice = async (slug, inicio) => {
  const i = await naLoja('indices', 'readonly', (s) => s.get(chaveDoIndice(slug, inicio)), null);
  return indiceValido(i) ? i : null;
};
/** As imagens lembradas de um vídeo: Map chave-do-cartão -> data URL. */
async function fotosGuardadas(prefixo) {
  const mapa = new Map();
  const chaves = await nasFotos('readonly', (s) => s.getAllKeys(faixaDe(prefixo)), []);
  const valores = await nasFotos('readonly', (s) => s.getAll(faixaDe(prefixo)), []);
  chaves.forEach((c, i) => { if (typeof valores[i] === 'string') mapa.set(String(c).slice(prefixo.length), valores[i]); });
  return mapa;
}
const guardarFoto = (prefixo, k, url) => nasFotos('readwrite', (s) => s.put(url, prefixo + k), null);
const tirarFotos = (prefixo) => nasFotos('readwrite', (s) => s.delete(faixaDe(prefixo)), null);

/** Quanto tempo uma espera pode ficar parada antes de dizer alguma coisa, e antes de desistir. */
export const AVISO_MS = 30_000;
export const DESISTE_CHAT_MS = 90_000;
export const DESISTE_SOM_MS = 120_000;
const ABRIR_MS = 60_000;

export const modoSimples = () => document.documentElement.dataset.modo === 'simples';

/** Trocar de modo, e lembrar neste aparelho (o caminho-cedo.js lê isto antes do primeiro desenho). */
export function escolherModo(modo) {
  const m = modo === 'avancado' ? 'avancado' : 'simples';
  document.documentElement.dataset.modo = m;
  try { localStorage.setItem(CHAVE_MODO, m); } catch { /* janela privada */ }
}

/** Se este navegador toca o vídeo da Kick (H.264 em HLS). Sem isso o "em pé" não sai, e diz-se já. */
export function tocaVideoDaKick() {
  const v = document.createElement('video');
  if (v.canPlayType('application/vnd.apple.mpegurl')) return true;
  const MS = window.MediaSource || window.ManagedMediaSource;
  return Boolean(MS?.isTypeSupported?.('video/mp4; codecs="avc1.64001f,mp4a.40.2"'));
}

const dormir = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

/** Espera até `pronto()` dar verdade, no máximo `limiteMs`. */
async function esperar(pronto, limiteMs, sinal) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (sinal?.aborted) return false;
    if (pronto()) return true;
    // eslint-disable-next-line no-await-in-loop
    await dormir(150);
  }
  return Boolean(pronto());
}

/** Uma promessa com prazo: passado o prazo, devolve `seNao` (a promessa continua, mas ninguém espera). */
function comPrazo(promessa, ms, seNao = null) {
  let r;
  return Promise.race([
    promessa.finally(() => clearTimeout(r)),
    new Promise((ok) => { r = setTimeout(() => ok(seNao), ms); }),
  ]);
}

/**
 * Um vigia para as esperas longas: se o andamento não mexe há `avisoMs`, chama `aoAvisar` (uma frase que
 * diz o que fazer); se não mexe há `desisteMs`, chama `aoDesistir`. `andou()` a cada passo de verdade.
 * O estudo viu "faltam uns 1 min" parado sete minutos sem aviso nenhum; isto não deixa acontecer.
 */
function vigia({ avisoMs = AVISO_MS, desisteMs, aoAvisar, aoDesistir }) {
  let ultimo = Date.now();
  let avisado = false;
  const r = setInterval(() => {
    const parado = Date.now() - ultimo;
    if (parado >= desisteMs) { clearInterval(r); aoDesistir(); return; }
    if (parado >= avisoMs && !avisado) { avisado = true; aoAvisar(); }
  }, 1000);
  return {
    andou() { ultimo = Date.now(); avisado = false; },
    parar() { clearInterval(r); },
  };
}

const dois = (n) => String(n).padStart(2, '0');
const horaDe = (ms) => { const d = new Date(ms); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const diaDe = (ms) => { const d = new Date(ms); return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`; };

/** Os momentos que a pessoa disse "Excluir", lembrados neste aparelho (a chave é canal|segundo). */
function lerNaoQuero() {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE_NAO) || '[]');
    return new Set(Array.isArray(l) ? l.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function guardarNaoQuero(conjunto) {
  try { localStorage.setItem(CHAVE_NAO, JSON.stringify([...conjunto].slice(-MAX_NAO))); } catch { /* janela privada */ }
}

/** O motivo do momento numa frase: "O chat explodiu e teve tiroteio". */
export function motivoEmPalavras(m) {
  // Uma morte do servidor (ou achada na tela de morte) diz quem matou quem, e o tiroteio vira o lugar dela.
  const morte = m.mortes?.[0];
  const noTiroteio = Boolean(morte) && m.tipos.includes('tiros');
  // Com acerto confirmado pelo som do jogo, o tiroteio é um PvP, e a frase diz quantos acertos (e quantos na cabeça).
  const pvp = m.acertos > 0 && !noTiroteio;
  const partes = ['chat', 'tiros', 'explosao', 'grito'].filter((x) => m.tipos.includes(x) && !(noTiroteio && x === 'tiros'))
    .map((x) => (x === 'tiros' && pvp
      ? t(m.cabecas > 0 ? 'simples.motivo.pvpAcertosCabeca' : 'simples.motivo.pvpAcertos', { n: m.acertos, c: m.cabecas })
      : t(`simples.motivo.${x}`)));
  if (morte) {
    const mais = m.mortes.length - 1;
    const quem = morte.matador ? t(noTiroteio ? 'simples.motivo.matouNoTiroteio' : 'simples.motivo.matou', morte)
      : t(noTiroteio ? 'simples.motivo.morreuNoTiroteio' : 'simples.motivo.morreu', morte);
    partes.unshift(mais > 0 ? `${quem}${tn(mais, 'simples.motivo.maisUma', 'simples.motivo.maisN')}` : quem);
  }
  if (!partes.length) return '';
  const frase = partes.length === 1 ? partes[0]
    : `${partes.slice(0, -1).join(', ')}${t('simples.e')}${partes.at(-1)}`;
  // Um apelido de streamer fica como ele escreve: só se põe a maiúscula na frase que começa por palavra.
  return morte ? frase : frase.charAt(0).toLocaleUpperCase() + frase.slice(1);
}

/** Quem mais estava no lance, para a frase do cartão: "a, b, c e mais 2". */
export function quemEstavaNoLance(m) {
  const outros = m.outros || [];
  if (!outros.length) return '';
  const nomes = outros.slice(0, NOMES_NO_LANCE).join(', ');
  const sobra = outros.length - NOMES_NO_LANCE;
  return t('simples.tambem', { nomes: sobra > 0 ? `${nomes}${t('simples.eMais', { n: sobra })}` : nomes });
}

/** A palavra do nome do arquivo: o mesmo título do cartão (titulo.js). */
function palavraDoArquivo(m) {
  return tituloDoMomento(m);
}

// Os ícones do player da prévia: brancos, sem caixa (o CSS pinta com currentColor).
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${d}"/></svg>`;
const ICONES = {
  toca: svg('M8 5v14l11-7z'),
  pausa: svg('M6 5h4v14H6zM14 5h4v14h-4z'),
  som: svg('M3 9v6h4l5 5V4L7 9zM16.5 12A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'),
  mudo: svg('M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.4 2.4c.1-.2.1-.4.1-.6zM19 12a7 7 0 0 1-.9 3.4l1.5 1.5A9 9 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1A7 7 0 0 1 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3a7 7 0 0 1-2.3 1.1v2.1a9 9 0 0 0 3.7-1.8l2 2 1.3-1.3L12 7.7zM12 4 9.9 6.1 12 8.2z'),
  cheia: svg('M5 5h5v2H7v3H5zM14 5h5v5h-2V7h-3zM5 14h2v3h3v2H5zM17 14h2v5h-5v-2h3z'),
};

const seguidores = (n) => {
  try { return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(n); }
};

/**
 * Montar o modo simples. A `ponte` é o que o app.js empresta:
 * - `estado`: o estado da página (as linhas, os ajustes, a memória do som);
 * - `chat`: o leitor de chat do evento (`lerChatTrecho`, `estado.marcas`, `estado.mensagens`);
 * - `abrirCanal(slug, { inicioMs })`: abre a noite do vídeo mais recente (ou da hora dada) e devolve a linha;
 * - `memorizarVods(r)`, `aoVivoDe(slug)`, `pausar()`;
 * - `carregarClipe(id)`: um clipe da Kick como linha;
 * - `baixar(momento, opcoes)`: o arquivo pronto ({ blob, nome }) ou { erro };
 * - `abrirEvento({ nome } | { hash })`, `lerChatDoEvento()`, `eventoDoLink` (a promessa do ?e= do endereço).
 */
export function montarSimples(ponte) {
  const caixa = $('simplesCaixa');
  const lista = $('simplesLista');
  let busca = null;
  // Cada busca tem o seu número: o que chega atrasado de uma busca velha (outra caixa, Começar de novo,
  // Modo avançado) não mexe na tela da nova.
  let geracao = 0;
  let ultimos = [];
  let linhaAberta = null;
  let fotos = new Map();
  let nitidas = new Set();
  let aBaixar = false;
  // A prévia aberta num cartão (uma só): { k, li, video, hls, alternar, acabou }. Com ela aberta a lista não se
  // refaz (o cartão não pode sumir debaixo do dedo), como enquanto um clipe é feito.
  let previa = null;
  // O cartão cujo Editar abriu o avançado, para o "Voltar para a lista" cair nele.
  let ultimoEditado = null;
  // Quantos cartões a lista mostra ("Mostrar mais" soma), os que a pessoa não quer ("Excluir", lembrados
  // neste aparelho) e os que estão na tela agora (o `data-i` de cada cartão conta nesta lista).
  let mostrar = QUANTOS;
  let mostrados = [];
  // O vídeo da lista de agora ({ slug, inicio }, a chave do cache e das imagens guardadas) e, quando a lista
  // veio do cache sem abrir o vídeo, o início dele (a "hora na live" dos cartões).
  let vodAtual = null;
  let inicioGuardado = null;
  let guardadoAtual = null;
  const naoQuero = lerNaoQuero();
  // O filtro da lista (simples-filtro.js), lembrado neste aparelho, e o que o streamer falou em cada momento (falas.js).
  let filtro = lerFiltro(armazem);
  let falasLidas = null;
  const todasFalas = () => (falasLidas ??= lerFalas(armazem));
  const falaDe = (m) => acharNaLista(todasFalas(), m.canal, m.deMs, m.ateMs)?.linhas || null;
  // A fala que está sendo lida agora ({ k, controlo, texto }) e o erro da última de cada cartão.
  let transcrevendo = null;
  const errosFala = new Map();
  const feitos = new Map();
  const buscasPov = new Map();
  const opcoesPovRenderizadas = new Map();
  let canaisDoEvento = [];
  let nomeDoEventoAtual = null;
  let canalPrincipalDoEvento = null;
  let atualizarEventoLista = null;
  let meuCanalSalvo = '';
  try { meuCanalSalvo = armazem.getItem(CHAVE_MEUPOV) || ''; } catch { /* armazenamento indisponível */ }
  let abrindoPov = false;
  const tocaVideo = tocaVideoDaKick();
  const toque = window.matchMedia?.('(pointer: coarse)').matches;

  // ── contexto automático (quadro + fala) de cada candidato a luta ─────────
  // Nunca abre decodificador nenhum sem antes saber que o servidor existe de verdade (o GitHub Pages, sem
  // backend, não pode baixar quadro nem Whisper à toa). `saude` fica em cache por sessão (uma pergunta só).
  let saude = null;
  let contextoAtivo = null; // { controlo, decoder, chave }
  let avisouIndisponivel = false;

  async function saudeContexto(sinal) {
    if (window.__povixSaudeContexto) return window.__povixSaudeContexto();
    if (saude) return saude;
    const buscar = typeof fetch !== 'undefined' ? fetch : null;
    if (!buscar) { saude = { ok: false }; return saude; }
    try {
      // GET /health (server/contexto-servidor.mjs): { ok, temChave, versaoContrato, versaoPrompt, limites }.
      // No GitHub Pages (sem backend nenhum) isto é um 404 estático comum — a MESMA resposta honesta de
      // "indisponível": nunca finge que analisou.
      const r = await buscar('/health', { method: 'GET', signal: sinal });
      if (!r.ok) { saude = { ok: false }; return saude; }
      const j = await r.json().catch(() => null);
      const disponivel = Boolean(j && j.ok && j.temChave);
      const contratoOk = Boolean(j && j.versaoContrato === VERSAO_CONTRATO);
      saude = { ok: disponivel && contratoOk };
    } catch { saude = { ok: false }; }
    return saude;
  }

  /** Para o que estiver em andamento (um novo vídeo, "Começar de novo", preview ou exportação). */
  function pararContexto() {
    contextoAtivo?.controlo.abort();
    contextoAtivo?.decoder?.fechar?.();
    contextoAtivo = null;
  }

  /** O cartão aberto (Assistir/Editar/Baixar) entra primeiro na fila: o resto espera, de fundo. */
  function priorizarContexto(m) {
    prioridadeContexto = chave(m);
  }
  let prioridadeContexto = null;

  function salvarContextoAtualizado() {
    if (!guardadoAtual?.slug || !Number.isFinite(guardadoAtual?.inicio)) return;
    guardadoAtual = { ...guardadoAtual, lista: ultimos };
    for (const s of guardarVod(armazem, guardadoAtual)) { tirarFotos(prefixoDe(s)); tirarIndice(s); }
  }

  /** O quadro do contexto: largura máxima e qualidade JPEG (o servidor aceita até 1 MB por quadro). */
  const QUADRO_CONTEXTO_LARGURA_MAX = 960;
  const QUADRO_CONTEXTO_QUALIDADE = 0.75;

  /** O quadro no instante `ms`, já em JPEG — reaproveita o decodificador escondido de fotografar() (um só
   * decodificador de cada vez: a captura é sempre pedida em sequência, nunca duas ao mesmo tempo). */
  function obterQuadroContexto(decoder) {
    return async (ms) => {
      if (!linhaAberta) return null;
      const r = onde(linhaAberta, ms, { nudgeMs: ponte.estado.nudges[linhaAberta.slug] || 0 });
      if (r.estado !== 'toca') return null;
      const peca = linhaAberta.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
      const degrau = peca.escada?.filter((d) => d.altura >= 360).sort((a, b) => Math.abs(a.altura - 480) - Math.abs(b.altura - 480))[0]
        || peca.barato || peca.escada?.at(-1);
      if (!degrau?.url) return null;
      const q = await decoder.quadro({ url: degrau.url, tempoS: r.tempoS });
      if (!q?.tela || !(q.tela.width > 0)) return null;
      // Mantém a proporção do quadro real (480p = 852x480 não vira 320x180) e nunca amplia: no máximo 960 px de largura.
      const escala = Math.min(1, QUADRO_CONTEXTO_LARGURA_MAX / q.tela.width);
      const c = document.createElement('canvas');
      c.width = Math.round(q.tela.width * escala);
      c.height = Math.round(q.tela.height * escala);
      c.getContext('2d').drawImage(q.tela, 0, 0, c.width, c.height);
      let url;
      try { url = c.toDataURL('image/jpeg', QUADRO_CONTEXTO_QUALIDADE); } catch { return null; }
      const base64 = url?.split(',')[1];
      // O servidor recusa mais de 1 MB por quadro (em bruto): um quadro que passa disso nunca é mandado.
      if (!base64 || Math.ceil((base64.length * 3) / 4) > MAX_IMAGEM_BYTES) return null;
      return { jpegBase64: base64 };
    };
  }

  /** A fala, no formato cru que falas.js (`linhasDaTranscricao`) sabe reler: devolve o que `ponte.transcrever`
   * já deixa pronto (o mesmo "Ver o que ele falou" do cartão), sem pedir Whisper de novo se já está em cache.
   * `window.__povixTranscreverContexto`, quando definido (só em teste), substitui o Whisper real — o mesmo
   * padrão de `__povixSaudeContexto`/`__povixQuadrosContexto`: nunca finge fala, só deixa o teste mockar de
   * forma explícita o que de outro modo exigiria o CDN do modelo (bloqueado nos testes de Chromium/CI). */
  function transcreverParaContexto({ canal, deMs, ateMs, sinal }) {
    if (window.__povixTranscreverContexto) return window.__povixTranscreverContexto({ canal, deMs, ateMs, sinal });
    if (!ponte.transcrever) return Promise.resolve(null);
    return ponte.transcrever({ canal, deMs, ateMs }, { sinal, aoProgresso: () => {} })
      .then((r) => ({ linhas: (r?.linhas || []).map((l) => ({ palavras: [{ t: l.t, de: l.de, ate: l.ate }] })) }))
      .catch(() => null);
  }

  /** A fila de fundo: até 20 candidatos desta live, o cartão aberto primeiro, parada por aBaixar/previa/novo
   * vídeo. Nunca baixa quadro nem fala sem o servidor confirmar que existe (health antes de tudo). */
  let contextoIniciando = false;
  async function analisarContextoFundo(opcoes = {}) {
    if (!linhaAberta || !modoSimples() || contextoAtivo || contextoIniciando) return;
    contextoIniciando = true;
    const minha = geracao;
    const controlo = new AbortController();
    let s;
    try { s = await saudeContexto(controlo.signal); } finally { contextoIniciando = false; }
    // Depois do await do health: o vídeo pode ter mudado, ou o cartão ter sido aberto de novo.
    if (minha !== geracao || contextoAtivo || controlo.signal.aborted || !linhaAberta || !modoSimples()) return;
    // Só depois do health é que se tira miniatura/quadro (capture) — com ou sem chave.
    opcoes.depoisDaSaude?.();
    if (!s.ok) {
      // Honesto, não um erro: é a regra (sem backend, GitHub Pages inclusive, a lista fica só com os
      // indícios de som, como sempre foi). Diz-se baixinho, uma vez, e só se não houver outro aviso na tela.
      if (!avisouIndisponivel && $('simplesAviso').hidden) avisar(t('simples.contexto.indisponivel'));
      avisouIndisponivel = true;
      return;
    }
    const decoder = window.__povixQuadrosContexto?.() || abrirQuadrosEscondidos({ limiteMs: 12_000 });
    contextoAtivo = { controlo, decoder };
    const canal = linhaAberta.slug;
    const comPrioridade = prioridadeContexto
      ? ultimos.map((m) => (chave(m) === prioridadeContexto ? { ...m, pontos: Number.POSITIVE_INFINITY } : m))
      : ultimos;
    const doCanal = comPrioridade.filter((m) => m.canal === canal);
    const vivoAgora = ponte.aoVivoDe(canal);
    // A identidade da LIVE para o servidor (teto de 20/cache): canal + início do VOD, nunca o relógio de
    // agora — o mesmo vídeo reaberto noutro dia tem de bater na mesma live.
    const liveId = `${canal}-${linhaAberta.inicio}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
    try {
      const r = await analisarCandidatos({
        momentos: doCanal,
        canal,
        liveId,
        limites: vivoAgora ? { deMs: vivoAgora.deMs, ateMs: vivoAgora.ateMs } : null,
        obterQuadro: obterQuadroContexto(decoder),
        transcrever: (p) => transcreverParaContexto({ ...p, sinal: controlo.signal }),
        armazemFalas: { lerFalas: () => lerFalas(armazem), guardarFala: (e) => guardarFala(armazem, e) },
        endpoint: ENDPOINT_PADRAO,
        max: MAX_CANDIDATOS_POR_LIVE,
        concorrencia: 1, // o leitor de voz (vozDaLegenda, em app.js) é um só de cada vez: nunca duas falas ao mesmo tempo.
        sinal: controlo.signal,
        aindaValido: () => minha === geracao && !aBaixar && !abrindoPov && !(previa && !previa.video?.paused) && modoSimples(),
        aoResultado: (id, contexto) => {
          // Um resultado tardio (outro vídeo, outra live, cartão de outro canal) nunca é aplicado.
          if (minha !== geracao || !contexto || linhaAberta?.slug !== canal) return;
          const i = ultimos.findIndex((m) => (m.id || m.ms) === id);
          if (i < 0) return;
          ultimos = ultimos.map((m, j) => (j === i ? comContexto(m, contexto) : m));
          salvarContextoAtualizado();
          if (mostrados.some((mm) => chave(mm) === chave(ultimos[i]))) pintarLista();
        },
      });
      // Status real, sem ecoar corpo nem chave: a causa diz se é a cota da sessão (global), o teto desta live,
      // o servidor sem chave, ou só falhas pontuais de alguns candidatos.
      if (minha === geracao && linhaAberta?.slug === canal && r.indisponivel && !avisouIndisponivel) {
        const chaveAviso = {
          cota_sessao: 'simples.contexto.cotaSessao', teto_live: 'simples.contexto.tetoLive',
          ocupado: 'simples.contexto.ocupado', sem_chave: 'simples.contexto.indisponivel', indisponivel: 'simples.contexto.falha',
        }[r.motivo] || 'simples.contexto.limite';
        if ($('simplesAviso').hidden) avisar(t(chaveAviso));
        avisouIndisponivel = true;
      } else if (minha === geracao && r.falhas > 0 && $('simplesAviso').hidden) {
        avisar(t('simples.contexto.falhas', { n: r.falhas }));
      }
    } catch { /* fila de fundo: um erro aqui nunca deve travar a lista normal */ } finally {
      decoder.fechar?.();
      if (contextoAtivo?.decoder === decoder) contextoAtivo = null;
    }
  }

  function agendarContexto(opcoes) {
    if (!linhaAberta || aBaixar || previa) return;
    analisarContextoFundo(opcoes);
  }

  // ── os modos ──────────────────────────────────────────────────────────
  $('modoAvancado').onclick = $('modoAvancadoLista').onclick = () => {
    parar();
    escolherModo('avancado');
    document.body.classList.remove('simplesTrabalho');
    window.scrollTo({ top: 0 });
  };
  $('modoSimples').onclick = () => {
    // Os vídeos do avançado não podem seguir tocando por trás da caixa.
    ponte.pausar();
    if (document.body.classList.contains('veioDaLista')) { voltarParaLista(); return; }
    escolherModo('simples');
    mostrarInicio();
    window.scrollTo({ top: 0 });
  };
  $('voltarLista').onclick = () => voltarParaLista();
  $('voltarListaClipe').onclick = () => voltarParaLista();
  // A frase da primeira vez, só até ela começar a primeira busca.
  let visto = false;
  try { visto = Boolean(localStorage.getItem(CHAVE_VISTO)); } catch { visto = false; }
  $('simplesDica').hidden = visto;
  const marcarVisto = () => {
    try { localStorage.setItem(CHAVE_VISTO, '1'); } catch { /* janela privada */ }
  };

  // ── a caixa e as sugestões ──────────────────────────────────────────────
  let timerSugestoes = null;
  let pedidoSugestoes = null;
  const fecharSugestoes = () => {
    $('simplesSugestoes').hidden = true;
    $('simplesSugestoes').innerHTML = '';
  };
  caixa.addEventListener('input', () => {
    $('simplesErro').hidden = true;
    $('simplesParecidos').hidden = true;
    clearTimeout(timerSugestoes);
    pedidoSugestoes?.abort();
    const texto = caixa.value.trim();
    // Só um nome procura sugestões: um link já diz quem é.
    if (texto.length < 2 || /[/.:?#]/.test(texto)) { fecharSugestoes(); return; }
    timerSugestoes = setTimeout(async () => {
      const controlo = new AbortController();
      pedidoSugestoes = controlo;
      const canais = await procurarCanais(texto, { sinal: controlo.signal, quantos: 5 });
      if (controlo.signal.aborted || caixa.value.trim() !== texto) return;
      pintarSugestoes(canais);
    }, 300);
  });
  function pintarSugestoes(canais) {
    const ul = $('simplesSugestoes');
    if (!canais.length) { fecharSugestoes(); return; }
    ul.innerHTML = canais.map((c) => `<li><button type="button" class="simplesSugestao" data-slug="${escapar(c.slug)}">`
      + `<b>${escapar(c.slug)}</b><span>${escapar(t('simples.seguidores', { n: seguidores(c.seguidores) }))}`
      + `${c.aoVivo ? escapar(t('simples.aoVivo')) : ''}</span></button></li>`).join('');
    ul.hidden = false;
  }
  // Tocar numa sugestão já começa: sem "Carregar" (o estudo, travamento 3).
  $('simplesSugestoes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-slug]');
    if (!b) return;
    caixa.value = b.dataset.slug;
    fecharSugestoes();
    comecar(b.dataset.slug, { soCanal: true });
  });
  caixa.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharSugestoes();
    if (e.key === 'ArrowDown' && !$('simplesSugestoes').hidden) {
      e.preventDefault();
      $('simplesSugestoes').querySelector('button')?.focus();
    }
  });
  $('simplesSugestoes').addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const bs = [...$('simplesSugestoes').querySelectorAll('button')];
    const i = bs.indexOf(document.activeElement);
    const j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (j < 0) caixa.focus(); else bs[Math.min(j, bs.length - 1)]?.focus();
  });
  $('simplesParecidos').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-slug]');
    if (!b) return;
    caixa.value = b.dataset.slug;
    comecar(b.dataset.slug, { soCanal: true });
  });
  $('simplesForm').addEventListener('submit', (e) => {
    e.preventDefault();
    fecharSugestoes();
    comecar(caixa.value);
  });
  // A caixa volta com o que estava escrito, já selecionado: escrever outro nome troca tudo de uma vez.
  $('simplesDeNovo').onclick = () => {
    ponte.pararChatDoEvento?.(); parar(); mostrarInicio(); guardarUltimo(armazem, null);
    $('simplesErro').hidden = true; caixa.focus(); caixa.select();
  };
  $('simplesRefazer').onclick = () => {
    const v = vodAtual;
    if (!v || busca || aBaixar || abrindoPov) return;
    if (guardadoAtual?.varrido === 'picos') { completarBusca(guardadoAtual); return; }
    parar();
    abrirStreamer(v.slug, { inicioMs: v.inicio, forcar: true });
  };
  $('simplesParar').onclick = () => { busca?.abort(); };
  $('simplesCanalPov').addEventListener('change', aplicarCanalPrincipalDoEvento);
  $('simplesCanalPov').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    aplicarCanalPrincipalDoEvento();
  });

  function atualizarSeletorDeCanal({ nome, canais = [] }) {
    canaisDoEvento = [...new Set(canais)];
    if (nome !== nomeDoEventoAtual) {
      nomeDoEventoAtual = nome;
      canalPrincipalDoEvento = canaisDoEvento.find((c) => slugDoNome(c) === slugDoNome(meuCanalSalvo)) || null;
      $('simplesCanalPov').value = canalPrincipalDoEvento || '';
      $('simplesMeuPovEstado').textContent = canalPrincipalDoEvento
        ? t('simples.meuPov.ativo', { canal: canalPrincipalDoEvento })
        : t(meuCanalSalvo ? 'simples.meuPov.foraEvento' : 'simples.meuPov.dica');
    }
    const datalist = $('simplesCanaisPov');
    if (datalist.options.length !== canaisDoEvento.length
      || [...datalist.options].some((o, i) => o.value !== canaisDoEvento[i])) {
      datalist.innerHTML = canaisDoEvento.map((c) => `<option value="${escapar(c)}"></option>`).join('');
    }
    $('simplesMeuPov').hidden = !canaisDoEvento.length;
  }

  function aplicarCanalPrincipalDoEvento() {
    if (aBaixar || abrindoPov) return;
    const valor = $('simplesCanalPov').value.trim();
    const canal = valor && canaisDoEvento.find((c) => slugDoNome(c) === slugDoNome(valor));
    if (valor && !canal) {
      $('simplesMeuPovEstado').textContent = t('simples.meuPov.invalido');
      return;
    }
    const mudou = canalPrincipalDoEvento !== (canal || null) || meuCanalSalvo !== (canal || '');
    canalPrincipalDoEvento = canal || null;
    meuCanalSalvo = canal || '';
    $('simplesCanalPov').value = meuCanalSalvo;
    $('simplesMeuPovEstado').textContent = canal
      ? t('simples.meuPov.ativo', { canal }) : t('simples.meuPov.limpo');
    if (!mudou) return;
    try {
      if (canal) armazem.setItem(CHAVE_MEUPOV, canal); else armazem.removeItem(CHAVE_MEUPOV);
    } catch { /* a escolha ainda vale nesta sessão */ }
    pararPrevia();
    pararBuscasPov();
    buscasPov.clear();
    opcoesPovRenderizadas.clear();
    atualizarEventoLista?.();
  }

  function erro(texto) {
    mostrarInicio();
    $('simplesErro').textContent = texto;
    $('simplesErro').hidden = false;
  }

  function mostrarInicio() {
    document.body.classList.remove('simplesTrabalho');
    $('simplesForm').hidden = false;
    $('simplesTrabalho').hidden = true;
    atualizarEventoLista = null;
  }

  function mostrarTrabalho(titulo) {
    pararPrevia();
    document.body.classList.add('simplesTrabalho');
    $('simplesForm').hidden = true;
    $('simplesErro').hidden = true;
    $('simplesParecidos').hidden = true;
    $('simplesTrabalho').hidden = false;
    $('simplesQuem').textContent = titulo;
    $('simplesMeuPov').hidden = true;
    $('simplesAviso').hidden = true;
    $('simplesRefazer').hidden = true;
    vodAtual = null;
    guardadoAtual = null;
    inicioGuardado = null;
    lista.innerHTML = '';
    ultimos = [];
    mostrados = [];
    mostrar = QUANTOS;
    $('simplesMais').hidden = true;
    window.scrollTo({ top: 0 });
  }

  function atualizarBotaoRefazer() {
    const b = $('simplesRefazer');
    const k = guardadoAtual?.varrido === 'picos' ? 'simples.ouvirResto' : 'simples.refazer';
    b.dataset.t = k;
    b.textContent = t(k);
    b.hidden = false;
  }

  function dizer(texto, fracao = null) {
    $('simplesEstado').textContent = texto;
    const barra = $('simplesBarra');
    barra.hidden = fracao === false;
    if (fracao == null || fracao === false) barra.removeAttribute('value'); else barra.value = Math.max(0, Math.min(1, fracao));
  }

  function avisar(texto) {
    $('simplesAviso').textContent = texto;
    $('simplesAviso').hidden = !texto;
  }

  function parar() {
    geracao++;
    pararPrevia();
    pararBuscasPov();
    pararContexto();
    prioridadeContexto = null;
    buscasPov.clear();
    document.body.classList.remove('veioDaLista');
    busca?.abort();
    busca = null;
    ponte.aoMudarEvento?.(null);
    atualizarEventoLista = null;
    nomeDoEventoAtual = null;
    canalPrincipalDoEvento = null;
    opcoesPovRenderizadas.clear();
  }

  // ── começar ───────────────────────────────────────────────────────────
  async function comecar(texto, { soCanal = false } = {}) {
    const e = soCanal ? { tipo: 'canal', slug: String(texto).trim() } : lerEntrada(texto);
    if (!e) { erro(t('simples.naoEntendi')); return; }
    marcarVisto();
    // Quem nunca tocou no botão de modo ainda não tem escolha guardada, e depois de usar o simples a sessão
    // salva fazia o caminho-cedo.js entrar no avançado ao recarregar.
    escolherModo('simples');
    $('simplesDica').hidden = true;
    parar();
    if (e.tipo === 'evento') { await abrirEvento({ nome: e.nome }); return; }
    if (e.tipo === 'eventoLink') { await abrirEvento({ hash: e.hash }); return; }
    if (e.tipo === 'nome') {
      if (e.evento && await eventoExiste(e.evento)) { await abrirEvento({ nome: e.evento }); return; }
      if (!e.slug) { erro(t('simples.naoAchei', { nome: texto.trim() })); return; }
      await abrirStreamer(e.slug);
      return;
    }
    if (e.tipo === 'canal') { await abrirStreamer(e.slug); return; }
    if (e.tipo === 'vod') {
      mostrarTrabalho(t('simples.abrindoTitulo'));
      dizer(t('simples.lendoLink'));
      const minha = geracao;
      try {
        const v = await comPrazo(vodDaKick(e.id, { slug: e.slug }), 20_000);
        if (minha !== geracao) return;
        if (!v) throw new Error('prazo');
        await abrirStreamer(v.slug, { inicioMs: v.inicioMs });
      } catch (x) {
        if (minha !== geracao) return;
        erro(x?.name === 'SEM-VOD' ? t('simples.vodSumiu') : t('simples.semRede'));
      }
      return;
    }
    if (e.tipo === 'clipe') await abrirClipe(e.id);
  }

  async function eventoExiste(nome) {
    if (!/^[a-z0-9-]{1,60}$/.test(nome)) return false;
    try {
      const r = await comPrazo(fetch(`eventos/${nome}.json`, { cache: 'no-cache' }), 8000);
      if (!r?.ok) return false;
      JSON.parse(await r.text());
      return true;
    } catch { return false; }
  }

  async function abrirEvento(qual) {
    guardarUltimo(armazem, null);
    mostrarTrabalho(t('simples.abrindoEvento'));
    dizer(t('simples.abrindoEventoEstado'));
    const minha = geracao;
    const aberto = await ponte.abrirEvento(qual);
    if (minha !== geracao) return;
    if (!aberto) {
      erro(qual.nome ? t('simples.semEvento', { nome: qual.nome }) : t('simples.naoEntendi'));
      return;
    }
    mostrarEvento();
  }

  /**
   * O evento aberto como a mesma lista de um vídeo: os melhores momentos de todos os canais, cada um com o
   * nome do streamer. Sem segundo toque: o chat de todos começa a ser lido já, e a lista cresce sozinha
   * (a página avisa quando muda). O mapa fica no "Modo avançado".
   */
  function mostrarEvento() {
    const minha = geracao;
    const controlo = new AbortController();
    busca = controlo;
    linhaAberta = null;
    const atual = ponte.lancesDoEvento();
    mostrarTrabalho(atual.nome ? t('simples.tituloEvento', { nome: atual.nome }) : t('simples.tituloEventoSemNome'));
    atualizarSeletorDeCanal({ nome: atual.nome || '', canais: atual.canais });
    if (!tocaVideo) avisar(t('simples.abraNoChrome'));
    const dizerEstado = (e) => {
      $('simplesParar').hidden = !e.lendo;
      const n = queridos().length;
      if (e.lendo) dizer(e.texto ? t('simples.lendoEvento', { texto: e.texto }) : t('simples.abrindoEventoEstado'), null);
      else dizer(n ? tn(n, 'simples.prontoUm', 'simples.pronto', { n })
        : canalPrincipalDoEvento ? t('simples.nadaMeuCanal', { canal: canalPrincipalDoEvento }) : t('simples.nadaEvento'), false);
    };
    const atualizar = () => {
      if (minha !== geracao) return;
      const e = ponte.lancesDoEvento();
      atualizarSeletorDeCanal({ nome: e.nome || '', canais: e.canais });
      ultimos = lancesParaLista(e.lances, { mensagens: e.mensagens, canalPrincipal: canalPrincipalDoEvento })
        .map((m) => ({ ...m, nomeCanal: m.canal, etiquetas: etiquetasDoMomento(m) }));
      pintarLista();
      fotografar();
      dizerEstado(e);
    };
    atualizarEventoLista = atualizar;
    ponte.aoMudarEvento?.(atualizar);
    // A frase de "lendo o chat de fulano" muda sem a lista mudar: só ela se refaz, de segundo em segundo
    // (a lista, não: um cartão que muda debaixo do dedo faz errar o toque).
    const relogio = setInterval(() => {
      if (minha !== geracao) { clearInterval(relogio); return; }
      atualizarBotoesClipe();
      const e = ponte.lancesDoEvento();
      if (e.lendo) dizerEstado(e);
    }, 1000);
    controlo.signal.addEventListener('abort', () => {
      clearInterval(relogio);
      if (minha !== geracao) return;
      ponte.pararChatDoEvento?.();
      $('simplesParar').hidden = true;
      const n = queridos().length;
      dizer(n ? t('simples.paradoCom', { n }) : t('simples.parado'), false);
    }, { once: true });
    ponte.lerChatDoEvento()?.finally?.(() => { if (minha === geracao) atualizar(); });
    atualizar();
  }

  async function abrirStreamer(nome, { inicioMs = null, forcar = false } = {}) {
    const minha = geracao;
    const velha = () => minha !== geracao;
    const slug = slugDoNome(nome);
    // Um vídeo já procurado neste aparelho abre na hora, sem rede e sem barra.
    const jaTinha = !forcar && inicioMs != null ? acharVod(armazem, slug, inicioMs) : null;
    if (jaTinha?.completo) { await mostrarGuardado(jaTinha); return; }
    mostrarTrabalho(t('simples.abrindoTitulo'));
    dizer(t('simples.procurandoVideo', { canal: slug }));
    let r = await comPrazo(vodsDoCanal(slug), 20_000, { slug, estado: 'sem-rede', vods: [] });
    if (r.estado === 'sem-rede' || r.estado === 'rate-limit') {
      // A Kick às vezes responde sem permissão e volta logo a seguir (o teste real de 12/10).
      await dormir(1000);
      r = await comPrazo(vodsDoCanal(slug), 20_000, { slug, estado: 'sem-rede', vods: [] });
    }
    if (velha()) return;
    if (r.estado !== 'ok') {
      if (r.estado === 'canal-nao-existe' || r.estado === 'nome-invalido') {
        erro(t('simples.ninguem'));
        mostrarParecidos(slug);
      } else if (['sem-vods', 'vods-indisponiveis'].includes(r.estado)) erro(t('simples.semVideo', { canal: slug }));
      else erro(t('simples.semRede'));
      return;
    }
    ponte.memorizarVods(r);
    // Sem o início dito, é a live mais recente da lista.
    const guardado = forcar ? null : acharVod(armazem, r.slug, inicioMs ?? r.vods.at(-1)?.inicioApi);
    if (guardado?.completo) { await mostrarGuardado(guardado); return; }
    const controlo = new AbortController();
    busca = controlo;
    dizer(t('simples.abrindoVideo', { canal: r.slug }));
    const linha = await comPrazo(ponte.abrirCanal(r.slug, { inicioMs }).catch(() => null), ABRIR_MS);
    if (controlo.signal.aborted || velha()) return;
    if (!linha) {
      dizer(t('simples.naoAbriu'), false);
      busca = null;
      return;
    }
    ponte.pausar();
    linhaAberta = linha;
    vodAtual = { slug: r.slug, inicio: linha.inicio };
    guardarUltimo(armazem, vodAtual);
    $('simplesQuem').textContent = t('simples.titulo', { canal: r.slug, dia: diaDe(linha.inicio), hora: horaDe(linha.inicio) });
    if (!tocaVideo) avisar(t('simples.abraNoChrome'));
    await procurar(linha, controlo, guardado);
  }

  /**
   * A lista de um vídeo já procurado, do cache: sem abrir o vídeo (Baixar, a prévia e Editar abrem quando a
   * pessoa tocar, como no evento) e sem barra. "Procurar de novo" refaz tudo.
   */
  async function mostrarGuardado(e) {
    mostrarTrabalho(t('simples.titulo', { canal: e.slug, dia: diaDe(e.inicio), hora: horaDe(e.inicio) }));
    const minha = geracao;
    vodAtual = { slug: e.slug, inicio: e.inicio };
    inicioGuardado = e.inicio;
    guardarUltimo(armazem, vodAtual);
    for (const [k, url] of await comPrazo(fotosGuardadas(prefixoDe(vodAtual)), 1500, new Map())) {
      if (k.startsWith(NITIDA)) { fotos.set(k.slice(NITIDA.length), url); nitidas.add(k.slice(NITIDA.length)); } else if (!nitidas.has(k)) fotos.set(k, url);
    }
    if (minha !== geracao) return;
    // Lista guardada antes do índice por etiqueta: lê o índice da live para dar a cada momento o título e a confiança.
    // Uma lista de uma versão de etiquetas antiga (o "Luta 99%" de antes de 14/10) tem as etiquetas descartadas e
    // recalculadas do índice: a lista, as fotos e os clipes feitos não se perdem, só o rótulo é refeito.
    const desatualizada = e.indiceV !== VERSAO_ETIQUETAS;
    // O veredito do contexto (quadro+fala, já validado) é mais caro e mais forte que o rótulo de som: um
    // "Luta 99%" antigo é descartado e recalculado à vontade, mas um contexto já confirmado por esta MESMA
    // versão do contrato não pode sumir só porque a versão da ETIQUETA mudou — senão cada ajuste no título
    // reanalisaria 20 candidatos de graça, ou pior, voltaria a mostrar "Som alto" onde já havia confirmação.
    const contextosGuardados = new Map();
    if (desatualizada) {
      for (const m of (e.lista || [])) {
        const ctx = (m.etiquetas || []).find((x) => x.tipo === 'tiros')?.contexto;
        if (contextoVigente(ctx)) contextosGuardados.set(chave(m), ctx);
      }
    }
    const guardada = (e.lista || []).map((m) => {
      const limpa = semContextoObsoleto(m);
      return desatualizada ? { ...limpa, etiquetas: undefined } : limpa;
    });
    const indice = guardada.some((m) => !m.etiquetas) ? await comPrazo(lerIndice(e.slug, e.inicio), 1500, null) : null;
    if (minha !== geracao) return;
    ultimos = guardada.map((m) => (m.etiquetas ? m : { ...m, etiquetas: etiquetasDoMomento(m, indice) }));
    if (contextosGuardados.size) {
      ultimos = ultimos.map((m) => {
        const ctx = contextosGuardados.get(chave(m));
        return ctx ? comContexto(m, ctx) : m;
      });
    }
    guardadoAtual = e;
    if (!tocaVideo) avisar(t('simples.abraNoChrome'));
    pintarLista();
    const n = queridos().length;
    dizer(e.varrido === 'picos' ? t(e.pendente ? 'simples.audioPendente' : 'simples.buscaParcial', { n })
      : n ? tn(n, 'simples.prontoUm', 'simples.pronto', { n }) : t('simples.nada'), false);
    atualizarBotaoRefazer();
    // Imagens borradas de antes (ou nenhuma): abre a live por trás e tira as nítidas, sem tocar nada.
    const falta = mostrados.find((m) => m && !nitidas.has(chave(m)) && m.canal === e.slug);
    // Um candidato que ainda precisa de análise (veredito de outra versão ou ausente) também abre o canal,
    // mesmo com as miniaturas prontas e o filtro vazio. O health roda antes de qualquer captura.
    const precisa = ultimos.find((m) => m && m.canal === e.slug && precisaDeContexto(m));
    const alvo = falta || precisa;
    if (alvo && tocaVideo) abrirCanalDoMomento(alvo).then((l) => {
      if (l && minha === geracao) agendarContexto({ depoisDaSaude: () => { if (falta) fotografar(); } });
    });
  }

  /** Um veredito de outra versão do contrato/prompt sai da lista (não aparece como "vigente"). */
  function semContextoObsoleto(m) {
    const ctx = contextoDoMomento(m);
    if (!ctx || contextoVigente(ctx)) return m;
    const { contexto: _c, ...resto } = m;
    return { ...resto, etiquetas: m.etiquetas?.map((x) => { if (x.tipo !== 'tiros') return x; const { contexto: _x, ...q } = x; return q; }) };
  }

  async function completarBusca(guardado) {
    const minha = geracao;
    const controlo = new AbortController();
    busca = controlo;
    pararPrevia();
    pararBuscasPov();
    $('simplesRefazer').hidden = true;
    $('simplesParar').hidden = false;
    dizer(t('simples.abrindoVideo', { canal: guardado.slug }));
    try {
      const linha = await comPrazo(ponte.abrirCanal(guardado.slug, { inicioMs: guardado.inicio }).catch(() => null), ABRIR_MS);
      if (minha !== geracao || controlo.signal.aborted) return;
      if (!linha) { dizer(t('simples.naoAbriu'), false); return; }
      ponte.pausar();
      linhaAberta = linha;
      await procurar(linha, controlo, guardado, { completar: true });
    } finally {
      if (busca === controlo) busca = null;
      if (minha === geracao) {
        $('simplesParar').hidden = true;
        atualizarBotaoRefazer();
      }
    }
  }

  async function mostrarParecidos(slug) {
    const canais = await procurarCanais(slug, { quantos: 4 });
    const outros = canais.filter((c) => c.slug.toLowerCase() !== slug.toLowerCase());
    if (!outros.length) return;
    $('simplesParecidos').innerHTML = `<p>${escapar(t('simples.talvez'))}</p>`
      + outros.map((c) => `<button type="button" class="simplesSugestao" data-slug="${escapar(c.slug)}"><b>${escapar(c.slug)}</b>`
        + `<span>${escapar(t('simples.seguidores', { n: seguidores(c.seguidores) }))}</span></button>`).join('');
    $('simplesParecidos').hidden = false;
  }

  async function abrirClipe(id) {
    guardarUltimo(armazem, null);
    const minha = geracao;
    mostrarTrabalho(t('simples.abrindoTitulo'));
    dizer(t('simples.lendoLink'));
    try {
      const r = await comPrazo(ponte.carregarClipe(id), 30_000);
      if (minha !== geracao) return;
      if (!r) throw new Error('prazo');
      ponte.pausar();
      linhaAberta = ponte.estado.linhas.find((l) => l.slug === r.slug) || null;
      $('simplesQuem').textContent = t('simples.tituloClipe', { canal: r.c.canal });
      if (!tocaVideo) avisar(t('simples.abraNoChrome'));
      ultimos = [{
        ms: r.playlist.inicio, deMs: r.playlist.inicio, ateMs: r.playlist.fim, tipos: [], pontos: 0, nota: null, canal: r.slug,
        doClipe: true, nomeCanal: r.c.canal,
      }];
      pintarLista();
      dizer(t('simples.clipePronto'), false);
      fotografar();
    } catch (x) {
      if (minha !== geracao) return;
      erro(x?.name === 'SEM-CLIPE' ? t('simples.clipeSumiu') : t('simples.semRede'));
    }
  }

  // ── procurar: o chat primeiro, depois o som ──────────────────────────────
  async function procurar(linha, controlo, guardado = null, { completar = false } = {}) {
    const minha = geracao;
    const slug = linha.slug;
    const vivo = ponte.aoVivoDe(slug);
    if (!vivo) { dizer(t('simples.naoAbriu'), false); return; }
    const sinal = controlo.signal;
    $('simplesParar').hidden = false;
    let picos = guardado?.picos || [];
    let mensagens = guardado?.mensagens || [];
    let sons = guardado?.sons || [];
    // O que já se achou deste vídeo (o chat) não se refaz; o que se acha agora fica lembrado, passo a passo.
    const chatGuardado = Array.isArray(guardado?.picos);
    const lembrar = (mais) => {
      if (minha !== geracao) return;
      guardadoAtual = { ...(guardadoAtual || guardado), slug, inicio: linha.inicio, ateMs: vivo.ateMs, ...mais };
      for (const s of guardarVod(armazem, guardadoAtual)) { tirarFotos(prefixoDe(s)); tirarIndice(s); }
    };
    let lutas = guardado?.lutas || [];
    let indiceDaBusca = null;
    const refazer = () => {
      if (minha !== geracao) return;
      ultimos = montarLista({ picos, sons, mensagens, limites: vivo, quantos: 60, lutas })
        .map((m) => ({ ...m, canal: slug, etiquetas: etiquetasDoMomento(m, indiceDaBusca) }));
      pintarLista();
      fotografar();
      agendarContexto();
    };
    try {
      // 1. O chat: dá os primeiros momentos em segundos.
      if (!chatGuardado) dizer(t('simples.lendoChat', { canal: slug, pct: 0 }), 0);
      const chatControlo = new AbortController();
      const pararChat = () => chatControlo.abort();
      sinal.addEventListener('abort', pararChat, { once: true });
      const v1 = vigia({
        desisteMs: DESISTE_CHAT_MS,
        aoAvisar: () => avisar(t('simples.chatDemora')),
        aoDesistir: () => { avisar(t('simples.chatDesistiu')); chatControlo.abort(); },
      });
      try {
        if (!chatGuardado && ponte.chat && vivo.deMs < Date.now()) {
          const comecouChat = Date.now();
          let maiorChat = 0;
          await ponte.chat.lerChatTrecho(slug, vivo.deMs, vivo.ateMs, {
            sinal: chatControlo.signal,
            aoProgredir: ({ fracao }) => {
              v1.andou();
              const falta = estimarFaltaFracao({ fracao, anterior: maiorChat, decorridoMs: Date.now() - comecouChat });
              if (Number.isFinite(fracao)) maiorChat = Math.max(maiorChat, fracao);
              dizer(t('simples.lendoChat', { canal: slug, pct: Math.round(fracao * 100) })
                + (falta ? t('simples.faltaChat', { tempo: tempoFalta(falta) }) : ''), fracao);
            },
          });
        }
      } catch (x) {
        if (sinal.aborted) throw x;
        if (x?.name !== 'AbortError') avisar(t('simples.chatDesistiu'));
      } finally {
        v1.parar();
        sinal.removeEventListener('abort', pararChat);
      }
      // A geração atual decide ANTES de qualquer aviso: uma busca velha (outro vídeo já aberto por cima) não
      // pode gritar "abra no Chrome" ou qualquer outra frase por cima do que já está na tela agora.
      if (minha !== geracao) return;
      if (!chatControlo.signal.aborted) avisar(tocaVideo ? '' : t('simples.abraNoChrome'));
      if (chatGuardado) {
        picos = guardado.picos;
        mensagens = guardado.mensagens || [];
      } else {
        picos = (ponte.chat?.estado.marcas?.get(slug) || []).filter((m) => m.ms >= vivo.deMs && m.ms < vivo.ateMs);
        mensagens = ponte.chat?.estado.mensagens?.get(slug) || [];
      }
      refazer();
      // O chat lido até o fim (e não largado pelo vigia) fica lembrado: se a página fechar no meio do som, volta daqui.
      const chatFeito = chatGuardado || (Boolean(ponte.chat) && vivo.deMs < Date.now() && !chatControlo.signal.aborted);
      if (chatFeito && !chatGuardado) lembrar({ picos, mensagens: mensagensDosPicos(mensagens, picos) });
      if (sinal.aborted) throw new DOMException('parado', 'AbortError');

      // 2. O som: só em volta dos picos do chat (o modo esperto do Detectar lances); sem picos, tudo.
      const intervalos = picos.length && !completar ? janelasDosPicos(picos, vivo.deMs, vivo.ateMs) : [[vivo.deMs, vivo.ateMs]];
      const totalMs = intervalos.reduce((s, [a, b]) => s + (b - a), 0);
      const somControlo = new AbortController();
      const pararSom = () => somControlo.abort();
      sinal.addEventListener('abort', pararSom, { once: true });
      let desistiu = false;
      let somFeito = false;
      let cobreTudo = false;
      let pendente = false;
      const v2 = vigia({
        desisteMs: DESISTE_SOM_MS,
        aoAvisar: () => avisar(t('simples.somDemora')),
        aoDesistir: () => { desistiu = true; somControlo.abort(); },
      });
      const comecou = Date.now();
      dizer(t('simples.ouvindo', { canal: slug }), 0);
      try {
        const r = await varrerNoite({
          linha,
          deMs: vivo.deMs,
          ateMs: vivo.ateMs,
          intervalos,
          nudgeMs: ponte.estado.nudges[slug] || 0,
          sinal: somControlo.signal,
          memoria: ponte.estado.somOuvido,
          // O índice leva tudo (gritos e acertos também): o que a lista mostra é só uma consulta dele.
          filtros: { tiros: true, explosoes: true, gritos: true, acertos: true },
          alertas: alertasDoCanal(slug),
          lerSom: (l, quandoMs, duracaoS, opcoes) => somDoCanal(l, quandoMs, duracaoS, { ...opcoes, taxa: TAXA_TIROS }),
          aoProgresso: (x) => {
            if (minha !== geracao || sinal.aborted) return;
            if (!('bytes' in x) && !x.pronto) return;
            v2.andou();
            const feito = x.ouvidoMs || 0;
            const falta = estimarFalta({ feitoMs: feito, restoMs: totalMs - feito, bytes: x.bytes || 0, decorridoMs: Date.now() - comecou });
            dizer(t('simples.ouvindo', { canal: slug })
              + (falta ? t('simples.falta', { tempo: tempoFalta(falta) }) : ''), totalMs ? feito / totalMs : null);
          },
        });
        if (minha !== geracao) return;
        const novosSons = [
          ...(r.candidatos || []).map((c) => ({ ...c, tipo: 'tiros' })),
          ...(r.explosoes || []).map((c) => ({ ...c, tipo: 'explosao' })),
          ...(r.gritos || []).map((c) => ({ ...c, tipo: 'grito' })),
        ];
        sons = [...new Map([...sons, ...novosSons].map((c) => [`${c.tipo}|${c.ms}`, c])).values()];
        const indice = montarIndice({ slug, inicioMs: linha.inicio, fimMs: vivo.ateMs, som: r, picos });
        lutas = [...new Map([...lutas, ...indice.lutas].map((c) => [c.id, c])).values()];
        indiceDaBusca = indice;
        // "Cobriu tudo" só faz sentido quando este passo pediu a live inteira (sem picos, ou "Buscar no
        // restante"): a busca rápida só ouve em volta do chat, e nunca é "tudo" mesmo com os picos inteiros.
        // Com `alvos` (o que varrerNoite viu de disponível de verdade nas peças do VOD — exclui buracos de
        // queda que nunca vão ter o que ouvir), a conta é contra o disponível, não contra a duração nominal da
        // live; sem `alvos` (um `varrerNoite` de teste mais simples), cai no que já havia.
        // "Cobriu tudo" só faz sentido quando este passo pediu a live inteira (sem picos, ou "Buscar no
        // restante"): a busca rápida só ouve em volta do chat, e nunca é "tudo" mesmo com os picos inteiros.
        // Com `alvos` (o que varrerNoite viu de disponível de verdade nas peças do VOD — exclui buracos de
        // queda que nunca vão ter o que ouvir), a conta é contra o disponível, não contra a duração nominal da
        // live; sem `alvos` (um `varrerNoite` de teste mais simples), cai no que já havia.
        const pedindoTudo = !picos.length || completar;
        const cobreAlvo = (a, b) => (r.cobertura || []).some(([x, y]) => x <= a + 1 && y >= b - 1);
        cobreTudo = pedindoTudo && (r.alvos?.length
          ? r.alvos.every(([a, b]) => cobreAlvo(a, b)) && !(r.naoOuvidos || []).length
          : cobreAlvo(vivo.deMs, vivo.ateMs));
        pendente = r.falhados > 0;
        if (!completar || cobreTudo) guardarIndice(indice);
        somFeito = true;
        avisar(pendente ? t('simples.somFalhou') : tocaVideo ? '' : t('simples.abraNoChrome'));
      } catch (x) {
        if (sinal.aborted) throw x;
        avisar(x?.name === 'SEM-DESCODIFICADOR' ? t('simples.semSomNavegador')
          : desistiu ? t('simples.somDesistiu') : t('simples.somFalhou'));
      } finally {
        v2.parar();
        sinal.removeEventListener('abort', pararSom);
      }
      refazer();
      if (somFeito && chatFeito) lembrar({ completo: true, lista: ultimos, sons, lutas, indiceV: VERSAO_ETIQUETAS,
        varrido: cobreTudo ? 'tudo' : 'picos', pendente });
      const n = queridos().length;
      if (minha !== geracao) return;
      dizer(guardadoAtual?.varrido === 'picos' ? t(guardadoAtual.pendente ? 'simples.audioPendente' : 'simples.buscaParcial', { n })
        : n ? tn(n, 'simples.prontoUm', 'simples.pronto', { n }) : t('simples.nada'), false);
      atualizarBotaoRefazer();
    } catch (x) {
      if (x?.name !== 'AbortError' && !sinal.aborted) throw x;
      if (minha !== geracao) return;
      const n = queridos().length;
      dizer(n ? t('simples.paradoCom', { n }) : t('simples.parado'), false);
      atualizarBotaoRefazer();
    } finally {
      if (minha === geracao) $('simplesParar').hidden = true;
      if (busca === controlo) busca = null;
    }
  }

  // ── a lista ───────────────────────────────────────────────────────────
  const chave = (m) => `${m.canal}|${Math.round(m.ms / 1000)}`;

  /** Os que a lista mostra agora: sem os "Excluir", e só até onde o "Mostrar mais" chegou. */
  const queridos = () => ultimos.filter((m) => !naoQuero.has(chave(m)));
  // Na ordem da live, para o streamer seguir a noite, e mais cartões ao rolar até o fim (o dono, 13/10).
  // O filtro manda na ordem (a da live é a de omissão) e esconde o que não passa; "Excluir" vale antes dele.
  const filtrados = () => aplicarFiltro(queridos(), filtro, { falas: falaDe });

  // ── a confiança, a fala e o filtro de cada cartão ─────────────────────
  /** "Luta 88%" (medida em rótulos) ou "Luta ~70%" (estimativa, com a dica no mouse). */
  function confHtml(m) {
    const c = m.doClipe ? null : confExibida(etiquetasDoMomento(m));
    if (!c) return '';
    return `<p class="simplesConf"><span class="simplesConfPct${c.estimativa ? ' estimativa' : ''}" tabindex="0" title="${escapar(t(c.estimativa ? 'filtro.estimativa' : 'filtro.medida'))}">${escapar(c.texto)}</span></p>`;
  }

  /** O resumo factual do veredito validado e "Análise por imagem" ou "...e fala" (nunca um número). Escapado: o
   * resumo vem de fora (o modelo), nunca entra na página como HTML. */
  function analiseHtml(m) {
    const r = m.doClipe ? null : textoDoContexto(contextoDoMomento(m));
    if (!r) return '';
    return (r.resumo ? `<p class="simplesConf">${escapar(r.resumo)}</p>` : '') + `<p class="simplesConf">${escapar(r.status)}</p>`;
  }

  /** O que o cartão diz da fala: a frase mais forte entre aspas, ou o botão que lê só este trecho. */
  function falaHtml(m) {
    if (m.doClipe) return '';
    const k = chave(m);
    const erroDela = errosFala.get(k) ? `<p class="simplesFalaEstado erro">${escapar(t('fala.erro', { motivo: errosFala.get(k) }))}</p>` : '';
    if (transcrevendo?.k === k) {
      return `<p class="simplesFalaEstado" role="status">${escapar(transcrevendo.texto)}</p>`
        + `<button type="button" class="simplesFalaBotao" data-acao="fala">${escapar(t('fala.parar'))}</button>`;
    }
    const linhas = falaDe(m);
    if (linhas) {
      const frase = melhorFala(linhas, m.ms);
      return frase ? `<p class="simplesFala">"${escapar(frase)}"</p>` : `<p class="simplesFalaEstado">${escapar(t('fala.nada'))}</p>`;
    }
    return `<button type="button" class="simplesFalaBotao" data-acao="fala"${transcrevendo ? ' disabled' : ''}>${escapar(t('fala.ver'))}</button>${erroDela}`;
  }

  function povsDo(m) {
    const buscaAtual = buscasPov.get(chave(m));
    // Ordem = prioridade no fundir (a primeira entrada de cada canal fica): morte real, depois som medido,
    // depois sugestão visual, e por fim o "talvez" do som.
    const opcoes = [
      ...(m.povs || []).filter((p) => p.origem !== 'video').map((p) => ({ ...p, tipo: 'morte' })),
      ...(buscaAtual?.estava || []).map((p) => ({ ...p, tipo: 'som' })),
      ...(m.povs || []).filter((p) => p.origem === 'video').map((p) => ({ ...p, tipo: 'video' })),
      ...(buscaAtual?.talvez || []).map((p) => ({ ...p, tipo: 'talvez' })),
    ];
    return fundirPovsPorCanal(opcoes);
  }

  function opcoesPov(m) {
    const achados = povsDo(m);
    const opcoes = [];
    for (const tipo of ['morte', 'som']) {
      const achadosDoTipo = achados.filter((p) => p.tipo === tipo).slice(0, 3);
      if (!achadosDoTipo.length) continue;
      const canais = [...new Set([m.canal, ...achadosDoTipo.map((p) => p.canal)])];
      const ajustes = Object.fromEntries(achadosDoTipo.filter((p) => Number.isFinite(p.desvioS))
        .map((p) => [p.canal, Math.round(p.desvioS * 1000)]));
      const pessoas = achadosDoTipo.map((p) => p.pessoa || p.canal).join(', ');
      opcoes.push({ tipo, canais, ajustes, pessoas, relacao: achadosDoTipo[0].relacao, canal: achadosDoTipo[0].canal });
    }
    for (const p of achados.filter((x) => x.tipo === 'talvez' || x.tipo === 'video')) {
      opcoes.push({ ...p, canais: [m.canal, p.canal], ajustes: Number.isFinite(p.desvioS) ? { [p.canal]: Math.round(p.desvioS * 1000) } : {} });
    }
    return opcoes;
  }

  function estadoPov(m) {
    const s = buscasPov.get(chave(m));
    if (!s) {
      const limite = ponte.povsLiberados?.(m.ms);
      return limite && !limite.liberado ? t('simples.pov.cedo', { min: limite.min }) : '';
    }
    if (s.estado === 'buscando') return t('simples.pov.busca', { feito: s.feito, total: s.total });
    if (s.erro === 'cedo') return t('simples.pov.cedo', { min: s.atrasoMin });
    if (s.erro === 'referencia') return t('simples.pov.semSom');
    if (s.erro === 'leitor') return t('simples.pov.semLeitor');
    if (s.erro) return t('simples.pov.erro');
    if (s.estado === 'parada') return t('simples.pov.parada');
    if (s.estado === 'fim' && !s.estava?.length && !s.talvez?.length) return t('simples.pov.nenhum');
    return s.estado === 'fim' ? t('simples.pov.pronto') : '';
  }

  function povsHtml(m) {
    if (!m.doEvento) return '';
    const buscaAtual = buscasPov.get(chave(m));
    const liberado = ponte.povsLiberados?.(m.ms)?.liberado !== false;
    const buscar = buscaAtual?.estado === 'buscando' ? t('simples.pov.pararBusca') : t('simples.pov.buscar');
    return `<div class="simplesPovs"><p class="simplesPovsTitulo">${escapar(t('simples.pov.titulo'))}</p><div class="simplesPovOpcoes">${povBotoesHtml(m)}</div><button type="button" class="simplesPovBuscar" data-acao="procurarPovs"${aBaixar || !liberado ? ' disabled' : ''}>${escapar(buscar)}</button><p class="simplesPovEstado" role="status" aria-live="polite">${escapar(estadoPov(m))}</p></div>`;
  }

  function povBotoesHtml(m) {
    const liberado = ponte.povsLiberados?.(m.ms)?.liberado !== false;
    return opcoesPov(m).map((p) => {
      const id = `${chave(m)}|${p.tipo}|${p.canais.join(',')}`;
      opcoesPovRenderizadas.set(id, p);
      const rotulo = p.tipo === 'talvez' || p.canais.length === 2
        ? t('simples.pov.criar', { canal: p.canal })
        : t('simples.pov.criarGrupo', { n: p.canais.length });
      const origem = p.tipo === 'morte'
        ? t(p.canais.length > 2 ? 'simples.pov.kills' : p.relacao === 'vitima' ? 'simples.pov.vitima' : 'simples.pov.matador', { pessoa: p.pessoas, nomes: p.pessoas })
        : t(p.tipo === 'video' ? 'simples.pov.video' : p.tipo === 'talvez' ? 'simples.pov.talvez'
          : p.canais.length > 2 ? 'simples.pov.somGrupo' : 'simples.pov.som', { nomes: p.pessoas });
      return `<div class="simplesPovOpcao"><button type="button" class="simplesPovBotao" data-acao="pov" data-pov="${escapar(id)}" aria-label="${escapar(rotulo)}"${aBaixar || abrindoPov || !liberado ? ' disabled' : ''}>${escapar(rotulo)}</button><span>${escapar(origem)}</span></div>`;
    }).join('');
  }

  function pintarEstadoPov(m, atualizarOpcoes = false) {
    const cartao = [...lista.children].find((li) => li.dataset.chave === chave(m));
    const opcoes = cartao?.querySelector('.simplesPovOpcoes');
    if (atualizarOpcoes && opcoes && !opcoes.contains(document.activeElement)) opcoes.innerHTML = povBotoesHtml(m);
    const texto = cartao?.querySelector('.simplesPovEstado');
    if (texto) texto.textContent = estadoPov(m);
    const botao = cartao?.querySelector('button[data-acao="procurarPovs"]');
    if (botao) botao.textContent = t(buscasPov.get(chave(m))?.estado === 'buscando' ? 'simples.pov.pararBusca' : 'simples.pov.buscar');
  }

  function pararBuscasPov() {
    for (const [k, buscaAtual] of buscasPov) {
      if (buscaAtual.estado !== 'buscando') continue;
      buscaAtual.controle.abort();
      buscaAtual.estado = 'parada';
      const m = ultimos.find((x) => chave(x) === k);
      if (m) pintarEstadoPov(m);
    }
  }

  async function procurarPovs(m) {
    if (aBaixar || abrindoPov) return;
    if (ponte.povsLiberados?.(m.ms)?.liberado === false) { pintarEstadoPov(m); return; }
    const k = chave(m);
    const anterior = buscasPov.get(k);
    if (anterior?.estado === 'buscando') {
      anterior.controle.abort();
      buscasPov.set(k, { estado: 'parada', estava: anterior.estava || [], talvez: anterior.talvez || [] });
      pintarEstadoPov(m);
      return;
    }
    pararBuscasPov();
    const buscaAtual = { estado: 'buscando', controle: new AbortController(), feito: 0, total: 0, estava: [], talvez: [] };
    buscasPov.set(k, buscaAtual);
    pintarEstadoPov(m);
    try {
      const resultado = await ponte.procurarPovs({
        referencia: m.canal,
        ms: m.ms,
        sinal: buscaAtual.controle.signal,
        aoProgresso: ({ feito, total, resultado: achado }) => {
          if (buscasPov.get(k) !== buscaAtual) return;
          buscaAtual.feito = feito;
          buscaAtual.total = total;
          const lista = achado?.estado === 'estava' ? buscaAtual.estava
            : achado?.estado === 'talvez' ? buscaAtual.talvez : null;
          let mudou = false;
          if (lista && !lista.some((p) => p.canal === achado.canal)) {
            lista.push(achado);
            mudou = true;
          }
          pintarEstadoPov(m, mudou);
        },
      });
      if (buscaAtual.controle.signal.aborted || buscasPov.get(k) !== buscaAtual) return;
      if (resultado.erro) {
        buscaAtual.estado = 'fim';
        buscaAtual.erro = resultado.erro;
        buscaAtual.atrasoMin = resultado.atrasoMin;
      } else {
        buscaAtual.estado = 'fim';
        buscaAtual.estava = resultado.estava || [];
        buscaAtual.talvez = resultado.talvez || [];
      }
    } catch (erro) {
      if (buscaAtual.controle.signal.aborted) return;
      buscaAtual.estado = 'fim';
      buscaAtual.erro = erro?.name === 'REFERENCIA-SEM-SOM' ? 'referencia'
        : erro?.name === 'SEM-DESCODIFICADOR' ? 'leitor' : 'falha';
    }
    pintarEstadoPov(m, true);
  }

  async function abrirPov(m, id) {
    if (aBaixar || abrindoPov) return;
    if (ponte.povsLiberados?.(m.ms)?.liberado === false) { pintarEstadoPov(m); return; }
    const p = opcoesPovRenderizadas.get(id);
    if (!p || !ponte.abrirPovs) return;
    const minha = geracao;
    abrindoPov = true;
    pararPrevia();
    pararBuscasPov();
    atualizarBotoesClipe();
    const status = () => [...lista.children].find((item) => item.dataset.chave === chave(m))?.querySelector('.simplesBaixando');
    if (status()) status().textContent = t('simples.pov.abrindo', { canal: p.canal });
    try {
      const abriu = await ponte.abrirPovs({ canais: p.canais, ms: m.ms, foco: m.canal, ajustes: p.ajustes });
      if (minha !== geracao || !modoSimples()) return;
      if (!abriu) {
        if (status()) status().textContent = t('simples.pov.naoAbriu');
        return;
      }
      escolherModo('avancado');
      if (!ponte.editar({ canal: m.canal, ms: m.ms, deMs: m.deMs, ateMs: m.ateMs, canais: p.canais })) {
        escolherModo('simples');
        if (status()) status().textContent = t('simples.pov.semTrecho');
        return;
      }
      ultimoEditado = chave(m);
      document.body.classList.add('veioDaLista');
      document.body.classList.remove('simplesTrabalho');
      window.scrollTo({ top: 0 });
    } catch {
      if (minha === geracao && status()) status().textContent = t('simples.pov.naoAbriu');
    } finally {
      abrindoPov = false;
      atualizarBotoesClipe();
      if (pintarLista.adiada) pintarLista();
    }
  }

  /** "Ver o que ele falou": lê só o trecho deste cartão (o leitor da legenda) e mostra a frase mais forte. */
  async function verFala(m, li) {
    const k = chave(m);
    if (transcrevendo) { if (transcrevendo.k === k) transcrevendo.controlo.abort(); return; }
    const atual = { k, controlo: new AbortController(), texto: t('fala.lendo') };
    transcrevendo = atual;
    errosFala.delete(k);
    const caixa = () => [...lista.children].find((x) => x.dataset.chave === k)?.querySelector('.simplesFalaCaixa');
    const pintar = () => { const c = caixa(); if (c) c.innerHTML = falaHtml(m); };
    const dizerAqui = (texto) => { atual.texto = texto; const e = caixa()?.querySelector('.simplesFalaEstado'); if (e) e.textContent = texto; };
    const travar = (parado) => { for (const b of lista.querySelectorAll('button[data-acao="fala"]')) if (b.closest('li') !== li) b.disabled = parado; };
    pintar();
    travar(true);
    try {
      if (!abertoEm(m)) {
        dizerAqui(t('simples.fase.abrirCanal', { canal: m.nomeCanal || m.canal }));
        if (!await abrirCanalDoMomento(m)) throw Object.assign(new Error(t('simples.canalNaoAbriu', { canal: m.nomeCanal || m.canal })), { name: 'SEM-PLANO' });
      }
      dizerAqui(t('fala.lendo'));
      await ponte.transcrever(m, {
        sinal: atual.controlo.signal,
        aoProgresso: (p) => {
          if (p.fase === 'baixar') dizerAqui(t('fala.baixando', { mb: Math.max(1, Math.round((p.total || 0) / 1e6)) }));
          else if (p.fase === 'ouvir') dizerAqui(t('fala.ouvindo', { pct: Math.round((p.fracao || 0) * 100) }));
          else dizerAqui(t('fala.lendo'));
        },
      });
    } catch (x) {
      if (x?.name !== 'AbortError') errosFala.set(k, String(ponte.motivoDaFala ? ponte.motivoDaFala(x) : x?.message || x).slice(0, 160).replace(/[.\s]+$/, ''));
    } finally {
      transcrevendo = null;
      falasLidas = null;
      travar(false);
      // Com um filtro por palavra ligado a fala nova pode mudar quem passa; sem ele só este cartão muda.
      if (filtro.palavra) pintarLista(); else pintar();
    }
  }

  const painel = $('simplesFiltro');
  /** O painel mostra o filtro de agora. */
  function preencherPainel() {
    $('filtroPalavra').value = filtro.palavra;
    for (const c of painel.querySelectorAll('input[name="filtroTipo"]')) c.checked = filtro.tipos.includes(c.value);
    $('filtroNota').value = filtro.notaMin;
    $('filtroLuta').value = String(filtro.lutaMinS);
    $('filtroOrdem').value = filtro.ordem;
    dicaDaPalavra();
  }
  function dicaDaPalavra() {
    const q = queridos();
    $('filtroPalavraDica').textContent = t('filtro.palavraDica', { n: comFala(q, falaDe), total: q.length });
  }
  function filtroDoPainel() {
    return limparFiltro({
      palavra: $('filtroPalavra').value,
      tipos: [...painel.querySelectorAll('input[name="filtroTipo"]:checked')].map((c) => c.value).filter((v) => TIPOS_DO_FILTRO.includes(v)),
      notaMin: $('filtroNota').value,
      lutaMinS: Number($('filtroLuta').value),
      ordem: $('filtroOrdem').value,
    });
  }
  function abrirPainel(abrir) {
    painel.hidden = !abrir;
    $('simplesFiltrar').setAttribute('aria-expanded', String(abrir));
    if (abrir) { falasLidas = null; preencherPainel(); $('filtroPalavra').focus({ preventScroll: true }); }
  }
  function mudarFiltro(novo) {
    filtro = novo;
    guardarFiltro(armazem, filtro);
    mostrar = QUANTOS;
    pintarLista();
    fotografar();
  }
  /** Botão Filtrar, chips dos filtros ativos, a confiança média e o "Nada com esse filtro". */
  function pintarCabecalho(passam) {
    const soClipe = ultimos.length > 0 && ultimos.every((m) => m.doClipe);
    const q = queridos();
    $('simplesFiltrar').hidden = soClipe || (!q.length && !filtroAtivo(filtro));
    if ($('simplesFiltrar').hidden) painel.hidden = true;
    const chips = chipsDoFiltro(filtro);
    $('simplesChips').hidden = !chips.length;
    $('simplesChips').innerHTML = chips.map((c, i) => `<li><button type="button" class="simplesChip" data-i="${i}" aria-label="${escapar(t('filtro.tirar', { nome: c.rotulo }))}">`
      + `${escapar(c.rotulo)}<svg class="ic ic-p" aria-hidden="true"><use href="#i-fechar"/></svg></button></li>`).join('');
    $('simplesChips').chipsAtuais = chips;
    const media = soClipe ? null : confMedia(passam);
    $('simplesMedia').hidden = !media;
    if (media) {
      const texto = `${media.estimativa ? '~' : ''}${media.pct}%`;
      $('simplesMedia').innerHTML = `<span class="simplesConfPct${media.estimativa ? ' estimativa' : ''}" tabindex="0" title="${escapar(t(media.estimativa ? 'filtro.estimativa' : 'filtro.medida'))}">`
        + `${escapar(t('filtro.media', { pct: texto }))}</span>`
        + (filtraAlgo(filtro) ? ` <span class="simplesMediaConta">${escapar(t('filtro.mostrando', { n: passam.length, total: q.length }))}</span>` : '');
    }
    $('simplesVazio').hidden = !(filtroAtivo(filtro) && q.length && !passam.length);
    if (!painel.hidden) dicaDaPalavra();
  }
  $('simplesFiltrar').onclick = () => abrirPainel(painel.hidden);
  painel.addEventListener('submit', (e) => { e.preventDefault(); abrirPainel(false); mudarFiltro(filtroDoPainel()); });
  const limparTudo = () => { abrirPainel(false); mudarFiltro(limparFiltro(null)); };
  $('filtroLimpar').onclick = $('simplesLimparFiltro').onclick = limparTudo;
  painel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { abrirPainel(false); $('simplesFiltrar').focus(); } });
  $('simplesChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    const chip = b && $('simplesChips').chipsAtuais?.[Number(b.dataset.i)];
    if (chip) mudarFiltro(semChip(filtro, chip));
  });

  function pintarLista() {
    // Um clipe a ser feito agora não pode sumir debaixo do dedo: a lista refaz-se quando ele acabar.
    // Uma prévia tocando (ou abrindo) também segura a lista; parada, ela cede o lugar.
    if (aBaixar || abrindoPov || (previa && !previa.video?.paused)) { pintarLista.adiada = true; return; }
    pintarLista.adiada = false;
    pararPrevia();
    const primeiraVez = (() => { try { return !localStorage.getItem('povix.simplesBaixou'); } catch { return true; } })();
    falasLidas = null;
    const passam = filtrados();
    mostrados = passam.slice(0, mostrar);
    const sobra = passam.length - mostrados.length;
    pintarCabecalho(passam);
    $('simplesMais').hidden = sobra <= 0;
    $('simplesMais').textContent = t('simples.mais', { n: Math.min(sobra, QUANTOS) });
    $('simplesDicaLista').hidden = !mostrados.length || !primeiraVez;
    const inicio = linhaAberta?.inicio ?? inicioGuardado ?? mostrados[0]?.ms ?? 0;
    lista.innerHTML = mostrados.map((m, i) => {
      const k = chave(m);
      const foto = fotos.get(k);
      const durS = Math.round((m.ateMs - m.deMs) / 1000);
      const resumo = m.doClipe ? null : textoDoContexto(contextoDoMomento(m));
      const motivo = m.doClipe ? t('simples.oClipe') : (resumo?.titulo || tituloDoMomento(m));
      const nota = m.nota ? `<b class="simplesNota nota-${m.nota}">${escapar(t(`simples.nota.${m.nota}`))}</b> ` : '';
      const feito = feitos.get(k);
      return `<li class="simplesCartao" data-i="${i}" data-chave="${escapar(k)}">`
        + `<button type="button" class="simplesFoto" data-acao="assistir" aria-label="${escapar(t('simples.assistirAria'))}">${foto ? `<img src="${foto}" alt="">` : `<span class="simplesSemFoto">${escapar(horaDe(m.ms))}<small>${escapar(t('simples.semFoto'))}</small></span>`}</button>`
        + '<div class="simplesPrevia" hidden></div>'
        + '<div class="simplesInfo"><div class="simplesDetalhes">'
        + (m.doEvento ? `<p class="simplesStreamer">${escapar(t(m.meuPov ? 'simples.seuPov' : 'simples.deQuem', { canal: m.nomeCanal || m.canal }))}</p>` : '')
        + `<p class="simplesMotivo">${nota}${escapar(motivo)}</p>`
        + confHtml(m) + analiseHtml(m)
        + `<div class="simplesFalaCaixa">${falaHtml(m)}</div>`
        + (m.outros?.length ? `<p class="simplesTambem">${escapar(quemEstavaNoLance(m))}</p>` : '')
        + (m.falha ? `<p class="simplesTalvezFalha">${escapar(t('simples.talvezFalha'))}</p>` : '')
        + `<p class="simplesQuando">${escapar(m.doClipe ? t('simples.duracao', { s: durS })
          : t('simples.quando', { tempo: tempoNaLive(m.ms, inicio), hora: horaDe(m.ms), s: durS }))}</p>`
        + '</div><div class="simplesRodape">'
        + '<div class="simplesBotoes">'
        + `<button type="button" class="principal simplesTiktok" data-acao="tiktok" aria-label="${escapar(t('simples.baixarTiktok'))}" title="${escapar(t('simples.baixarTiktok'))}"><svg class="ic" aria-hidden="true"><use href="#i-descarregar"/></svg><span class="longo">${escapar(t('simples.baixarTiktok'))}</span><span class="curto" aria-hidden="true">${escapar(t('simples.baixarTiktokCurto'))}</span></button>`
        + `<button type="button" class="simplesSecundario simplesDeitado" data-acao="deitado" aria-label="${escapar(t('simples.baixarDeitado'))}" title="${escapar(t('simples.baixarDeitado'))}"><svg class="ic" aria-hidden="true"><use href="#i-descarregar"/></svg><span class="longo">${escapar(t('simples.baixarDeitado'))}</span><span class="curto" aria-hidden="true">${escapar(t('simples.baixarDeitadoCurto'))}</span></button>`
        + `<button type="button" class="simplesSecundario simplesEditar" data-acao="editar"><svg class="ic" aria-hidden="true"><use href="#i-tesoura"/></svg>${escapar(t('simples.editar'))}</button>`
        + `<button type="button" class="simplesSecundario simplesNao" data-acao="nao" aria-label="${escapar(t('simples.naoQuero'))}" title="${escapar(t('simples.naoQuero'))}"><svg class="ic" aria-hidden="true"><use href="#i-lixo"/></svg><span>${escapar(t('simples.naoQuero'))}</span></button>`
        + '</div>'
        + `<p class="simplesBaixando" role="status" aria-live="polite">${feito ? escapar(feito.texto) : ''}</p>`
        + `<progress class="simplesBarraClipe" max="1" hidden></progress>`
        + `<button type="button" class="simplesSecundario simplesPartilhar" data-acao="partilhar"${feito?.blob && podePartilhar(feito) ? '' : ' hidden'}>${escapar(t('simples.partilhar'))}</button>`
        + '</div></div>' + povsHtml(m) + '</li>';
    }).join('');
    atualizarBotoesClipe();
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const li = b.closest('li');
    const m = mostrados[Number(li.dataset.i)];
    if (!m) return;
    if (b.dataset.acao === 'fala') { verFala(m, li); return; }
    if (b.dataset.acao === 'nao') { dispensar(m, Number(li.dataset.i)); return; }
    if (b.dataset.acao === 'assistir') { assistir(m, li); return; }
    if (b.dataset.acao === 'editar') { editar(m, li); return; }
    if (b.dataset.acao === 'procurarPovs') { procurarPovs(m); return; }
    if (b.dataset.acao === 'pov') { abrirPov(m, b.dataset.pov); return; }
    if (b.dataset.acao === 'pausar') { previa?.alternar(); return; }
    if (b.dataset.acao === 'partilhar') { partilhar(feitos.get(li.dataset.chave)); return; }
    baixar(m, li, { deitado: b.dataset.acao === 'deitado' });
  });

  // Os botões que mexem no clipe: ficam parados enquanto um clipe é feito.
  // Assistir (a imagem) e Editar também: os dois abrem o vídeo e a janela que o clipe em andamento está usando.
  const BOTOES_DO_CLIPE = ['tiktok', 'deitado', 'nao', 'assistir', 'editar', 'pov', 'procurarPovs'].map((a) => `button[data-acao="${a}"]`).join(', ');

  function atualizarBotoesClipe() {
    for (const b of lista.querySelectorAll(BOTOES_DO_CLIPE)) {
      const m = mostrados[Number(b.closest('li')?.dataset.i)];
      const varios = b.dataset.acao === 'pov' || b.dataset.acao === 'procurarPovs';
      b.disabled = aBaixar || abrindoPov || Boolean(varios && m && ponte.povsLiberados?.(m.ms)?.liberado === false);
    }
    $('simplesCanalPov').disabled = aBaixar || abrindoPov;
  }

  /** "Excluir": o momento sai da lista e não volta (neste aparelho). O foco vai para o cartão que subiu. */
  function dispensar(m, i) {
    pararPrevia();
    naoQuero.add(chave(m));
    guardarNaoQuero(naoQuero);
    pintarLista();
    const cartao = lista.children[Math.min(i, lista.children.length - 1)];
    (cartao?.querySelector('button[data-acao="tiktok"]') || $('simplesQuem')).focus?.({ preventScroll: true });
  }

  // O fim da lista à vista (ou quase) traz os próximos; com uma prévia a tocar, espera ela parar.
  new IntersectionObserver((vistos) => {
    if (!vistos.some((v) => v.isIntersecting) || $('simplesMais').hidden || pintarLista.adiada) return;
    mostrar += QUANTOS;
    pintarLista();
    fotografar();
  }, { rootMargin: '600px 0px' }).observe($('simplesMais'));

  function arquivoDe(f) {
    try { return new File([f.blob], f.nome, { type: f.blob.type || 'video/mp4' }); } catch { return null; }
  }
  function podePartilhar(f) {
    const arquivo = arquivoDe(f);
    try { return Boolean(arquivo && navigator.canShare?.({ files: [arquivo] })); } catch { return false; }
  }
  async function partilhar(f) {
    const arquivo = f && arquivoDe(f);
    if (!arquivo) return;
    try { await navigator.share({ files: [arquivo], title: f.nome }); } catch { /* ela fechou a folha */ }
  }

  /** O vídeo aberto agora é o do canal do momento e cobre a hora dele. */
  function abertoEm(m) {
    const vivo = ponte.aoVivoDe(m.canal);
    const linha = ponte.estado.linhas.find((l) => l.slug === m.canal);
    if (!linha || !vivo || m.ms < vivo.deMs || m.ms > vivo.ateMs) return false;
    linhaAberta = linha;
    return true;
  }

  /** Abre a live do canal do momento na hora dele (o que o evento, ou um Editar na volta do avançado, pede). */
  async function abrirCanalDoMomento(m) {
    const linha = await comPrazo(ponte.abrirCanal(m.canal, { inicioMs: m.ms }).catch(() => null), ABRIR_MS);
    if (!linha) return null;
    ponte.pausar();
    linhaAberta = linha;
    return linha;
  }

  // ── assistir: o pedaço do momento toca no próprio cartão ──────────────────
  // Tocar fora do cartão que toca (e fora dos outros cartões, que tratam o seu próprio play) devolve-o à imagem.
  document.addEventListener('pointerdown', (e) => {
    if (previa && !previa.li.contains(e.target) && !e.target.closest?.('#simplesLista > li')) pararPrevia();
  });
  function pararPrevia() {
    const p = previa;
    if (!p) return;
    previa = null;
    p.limpar?.();
    p.hls?.destroy();
    if (p.video) {
      p.video.pause();
      p.video.removeAttribute('src');
      p.video.load?.();
    }
    if (p.li.isConnected) {
      const caixa = p.li.querySelector('.simplesPrevia');
      caixa.replaceChildren();
      caixa.hidden = true;
      p.li.querySelector('.simplesFoto').hidden = false;
      p.li.classList.remove('comPrevia');
    }
    if (pintarLista.adiada) pintarLista();
    agendarContexto();
  }

  /**
   * Assistir: o vídeo da live, com som, só no pedaço do clipe (o mesmo que o Baixar corta), no lugar da imagem
   * do cartão. É um <video> do próprio cartão com a mesma fonte do editor (a melhor qualidade da live); o
   * vídeo escondido do avançado fica quieto. Só uma toca por vez: dar play em outro cartão devolve este à imagem.
   */
  async function assistir(m, li) {
    if (aBaixar) return;
    priorizarContexto(m);
    pararContexto();
    pararPrevia();
    const p = { k: chave(m), li, video: null, hls: null, arrastando: false, alternar: null };
    previa = p;
    const nota = li.querySelector('.simplesBaixando');
    const falhou = () => { if (previa !== p) return; nota.textContent = t('simples.previaNao'); pararPrevia(); };
    nota.textContent = t('simples.fase.abrir');
    if (!m.doClipe && !abertoEm(m)) {
      nota.textContent = t('simples.fase.abrirCanal', { canal: m.nomeCanal || m.canal });
      const aberta = await abrirCanalDoMomento(m);
      if (previa !== p) return;
      if (!aberta) { falhou(); return; }
    }
    const linha = ponte.estado.linhas.find((l) => l.slug === m.canal);
    const r = linha && onde(linha, m.deMs, { nudgeMs: ponte.estado.nudges[m.canal] || 0 });
    if (r?.estado !== 'toca') { falhou(); return; }
    const peca = linha.pecasCompletas?.find((x) => x.vod.id === r.peca.vod.id) || r.peca;
    const url = (peca.escada?.[0] || peca.barato)?.url;
    if (!url) { falhou(); return; }
    nota.textContent = '';
    const inicioS = r.tempoS;
    const fimS = inicioS + (m.ateMs - m.deMs) / 1000;
    const v = document.createElement('video');
    v.playsInline = true;
    // Um player como o do YouTube, do tamanho do cartão: os controles por cima do vídeo, embaixo, com a barra
    // do tempo só do pedaço do lance. Somem depois de uns segundos sem mexer e voltam ao mexer ou tocar.
    const jogador = document.createElement('div');
    jogador.className = 'simplesPlayer';
    jogador.innerHTML = '<div class="simplesControles">'
      + `<input type="range" class="simplesLinha" min="0" max="${(fimS - inicioS).toFixed(1)}" step="0.1" value="0" aria-label="${escapar(t('simples.barraPrevia'))}">`
      + '<div class="simplesControlesLinha">'
      + '<button type="button" class="simplesIcone simplesToca" data-acao="pausar"></button>'
      + '<span class="simplesVol"><button type="button" class="simplesIcone simplesMudo"></button>'
      + `<input type="range" class="simplesVolume" min="0" max="1" step="0.05" value="1" aria-label="${escapar(t('simples.volumePrevia'))}"></span>`
      + '<span class="simplesTempoPlayer">0:00 / 0:00</span>'
      + `<button type="button" class="simplesIcone simplesCheia" aria-label="${escapar(t('simples.telaCheiaPrevia'))}">${ICONES.cheia}</button>`
      + '</div></div>';
    jogador.prepend(v);
    const q = (c) => jogador.querySelector(c);
    const [botaoPausa, botaoMudo, botaoCheia, barra, volume, tempo] = ['.simplesToca', '.simplesMudo', '.simplesCheia', '.simplesLinha', '.simplesVolume', '.simplesTempoPlayer'].map(q);
    const minutos = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const totalS = fimS - inicioS;
    const pintarTempo = (s) => {
      const aqui = Math.min(totalS, Math.max(0, s));
      tempo.textContent = `${minutos(aqui)} / ${minutos(totalS)}`;
      barra.value = aqui;
      barra.style.setProperty('--feito', `${totalS ? (aqui / totalS) * 100 : 0}%`);
    };
    const rotulo = (tocando) => {
      botaoPausa.innerHTML = tocando ? ICONES.pausa : ICONES.toca;
      botaoPausa.setAttribute('aria-label', t(tocando ? 'simples.pausar' : 'simples.continuar'));
    };
    const rotuloSom = () => {
      const mudo = v.muted || v.volume === 0;
      botaoMudo.innerHTML = mudo ? ICONES.mudo : ICONES.som;
      botaoMudo.setAttribute('aria-label', t('simples.volumePrevia'));
    };
    rotulo(true);
    rotuloSom();
    pintarTempo(0);
    const caixa = li.querySelector('.simplesPrevia');
    caixa.replaceChildren(jogador);
    caixa.hidden = false;
    li.querySelector('.simplesFoto').hidden = true;
    li.classList.add('comPrevia');
    p.video = v;
    p.alternar = () => { if (v.paused) v.play().catch(() => {}); else v.pause(); };
    // Pular dentro do pedaço (as teclas A, D, J, L e as setas), sem sair dele.
    p.pular = (s) => {
      v.currentTime = Math.min(fimS - 0.1, Math.max(inicioS, v.currentTime + s));
      pintarTempo(v.currentTime - inicioS);
    };
    // Os controles aparecem ao mexer e somem em 2,5 s com o vídeo tocando. O primeiro toque num celular só
    // os mostra; com eles à vista, tocar no vídeo pausa ou toca.
    let sumir = null;
    const mostrar = () => {
      jogador.classList.remove('semControles');
      clearTimeout(sumir);
      if (!v.paused) sumir = setTimeout(() => jogador.classList.add('semControles'), 2500);
    };
    p.limpar = () => clearTimeout(sumir);
    for (const ev of ['pointermove', 'pointerdown', 'focusin', 'keydown']) jogador.addEventListener(ev, mostrar);
    v.addEventListener('click', () => {
      if (jogador.classList.contains('semControles')) { mostrar(); return; }
      p.alternar();
    });
    v.addEventListener('play', () => { rotulo(true); mostrar(); });
    v.addEventListener('pause', () => { rotulo(false); mostrar(); });
    // No fim do pedaço volta ao começo, parado: o play (ou a barra) vê de novo.
    const noFim = () => {
      v.pause();
      v.currentTime = inicioS;
      pintarTempo(0);
    };
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= fimS) { noFim(); return; }
      if (!p.arrastando) pintarTempo(v.currentTime - inicioS);
    });
    barra.addEventListener('input', () => {
      p.arrastando = true;
      v.currentTime = inicioS + Number(barra.value);
      pintarTempo(Number(barra.value));
    });
    barra.addEventListener('change', () => { p.arrastando = false; });
    volume.addEventListener('input', () => { v.volume = Number(volume.value); v.muted = v.volume === 0; });
    v.addEventListener('volumechange', () => { volume.value = v.muted ? 0 : v.volume; rotuloSom(); });
    botaoMudo.addEventListener('click', () => {
      v.muted = !v.muted;
      if (!v.muted && v.volume === 0) v.volume = 0.5;
    });
    botaoCheia.addEventListener('click', () => {
      if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
      if (jogador.requestFullscreen) jogador.requestFullscreen().catch(() => {});
      else v.webkitEnterFullscreen?.();
    });
    v.addEventListener('ended', noFim);
    v.addEventListener('error', falhou);
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({ startPosition: inicioS, maxBufferLength: 20, backBufferLength: 30 });
      p.hls = hls;
      hls.on(window.Hls.Events.ERROR, (_, d) => { if (d?.fatal) falhou(); });
      hls.loadSource(url);
      hls.attachMedia(v);
    } else {
      v.addEventListener('loadedmetadata', () => { v.currentTime = inicioS; }, { once: true });
      v.src = url;
    }
    v.play().catch(() => rotulo(false));
    li.scrollIntoView?.({ block: 'nearest' });
  }

  // As teclas da prévia aberta, as mesmas do avançado: espaço pausa; A e D saltam 3 s; J, L e as setas saltam
  // 1 s (10 s com Shift); o Esc devolve o cartão à imagem. Só nela, e nunca com o cursor numa caixa de texto.
  document.addEventListener('keydown', (e) => {
    if (!previa?.video || !modoSimples() || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    if (alvo?.isContentEditable || alvo?.tagName === 'TEXTAREA' || (alvo?.tagName === 'INPUT' && alvo.type !== 'range')) return;
    if (e.key === 'Escape') { pararPrevia(); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const salto = { a: -3, d: 3, j: -(e.shiftKey ? 10 : 1), l: e.shiftKey ? 10 : 1, ArrowLeft: -(e.shiftKey ? 10 : 1), ArrowRight: e.shiftKey ? 10 : 1 }[k];
    if (salto !== undefined) {
      // A barra e o volume já andam sozinhos com as setas.
      if (alvo?.type === 'range' && k.startsWith('Arrow')) return;
      e.preventDefault();
      previa.pular(salto);
      return;
    }
    if (e.code !== 'Space' || alvo?.closest?.('button, a, input:not([type="range"]), select, textarea, summary')) return;
    e.preventDefault();
    previa.alternar();
  });

  // ── editar: o momento no editor do avançado, e o caminho de volta ──────────
  async function editar(m, li) {
    if (aBaixar) return;
    priorizarContexto(m);
    pararContexto();
    pararPrevia();
    const nota = li.querySelector('.simplesBaixando');
    const canal = m.nomeCanal || m.canal;
    if (!m.doClipe && !abertoEm(m)) {
      nota.textContent = t('simples.fase.abrirCanal', { canal });
      if (!await abrirCanalDoMomento(m)) { nota.textContent = t('simples.editarNao'); return; }
      nota.textContent = '';
    }
    escolherModo('avancado');
    if (!ponte.editar({ canal: m.canal, deMs: m.deMs, ateMs: m.ateMs })) {
      escolherModo('simples');
      nota.textContent = t('simples.editarNao');
      return;
    }
    ultimoEditado = chave(m);
    document.body.classList.add('veioDaLista');
    document.body.classList.remove('simplesTrabalho');
    window.scrollTo({ top: 0 });
  }

  /** Do avançado de volta à lista simples, do jeito que estava: o editor fecha, os vídeos ficam quietos. */
  function voltarParaLista() {
    ponte.fecharEditor?.();
    ponte.pausar();
    escolherModo('simples');
    document.body.classList.remove('veioDaLista');
    document.body.classList.add('simplesTrabalho');
    $('simplesForm').hidden = true;
    $('simplesTrabalho').hidden = false;
    pintarLista();
    window.scrollTo({ top: 0 });
    const cartao = ultimoEditado ? lista.querySelector(`li[data-chave="${CSS.escape(ultimoEditado)}"]`) : null;
    cartao?.scrollIntoView?.({ block: 'center' });
    (cartao?.querySelector('button.simplesEditar') || $('simplesQuem')).focus?.({ preventScroll: true });
    agendarContexto();
  }

  async function baixar(m, li, { deitado }) {
    if (aBaixar || abrindoPov) return;
    priorizarContexto(m);
    pararContexto();
    if (!deitado) ponte.prepararSom?.();
    pararPrevia();
    pararBuscasPov();
    aBaixar = true;
    const k = chave(m);
    for (const b of lista.querySelectorAll(BOTOES_DO_CLIPE)) b.disabled = true;
    const nota = li.querySelector('.simplesBaixando');
    const barra = li.querySelector('.simplesBarraClipe');
    li.querySelector('.simplesPartilhar').hidden = true;
    const dizerAqui = (texto, fracao = null) => {
      nota.textContent = texto;
      barra.hidden = fracao === false;
      if (fracao == null || fracao === false) barra.removeAttribute('value'); else barra.value = Math.max(0, Math.min(1, fracao));
    };
    let fase = deitado ? 'cortar' : 'abrir';
    dizerAqui(t(`simples.fase.${fase}`));
    const motivo = m.doClipe ? t('simples.arquivo.clipe') : palavraDoArquivo(m);
    const canal = m.nomeCanal || m.canal;
    try {
      // Um momento do evento é de um canal que pode não estar aberto (e na volta do avançado, o de um
      // streamer só também): abre-se o vídeo dele naquela hora.
      if (!m.doClipe && !abertoEm(m)) {
        dizerAqui(t('simples.fase.abrirCanal', { canal }));
        if (!await abrirCanalDoMomento(m)) { dizerAqui(t('simples.canalNaoAbriu', { canal }), false); return; }
        dizerAqui(t(`simples.fase.${fase}`));
      }
      const r = await ponte.baixar({ canal: m.canal, deMs: m.deMs, ateMs: m.ateMs }, {
        deitado,
        // A legenda pesa: no computador sai ligada; no celular fica para a parte 2 (um botão "pôr legenda").
        legenda: !deitado && !toque,
        nome: (extensao) => nomeDoArquivo({ canal, ms: m.ms, motivo, deitado, deitadoTexto: t('simples.arquivo.deitado'), extensao }),
        aoFase: (f) => { fase = f; dizerAqui(t(`simples.fase.${f}`)); },
        aoProgresso: ({ feito, total }) => {
          if (fase === 'gravar') dizerAqui(t('simples.fase.gravando', { feito: Math.round(feito), total: Math.round(total) }), total ? feito / total : null);
          else dizerAqui(t('simples.fase.cortando', { feito, total }), total ? feito / total : null);
        },
      });
      if (r?.blob) {
        // A nota do avançado fala de "9:16" e de segundos com décimas: aqui, uma frase só.
        const texto = t('simples.baixou') + (r.curto ? ` ${t('simples.curto')}` : '');
        feitos.set(k, { texto, blob: r.blob, nome: r.nome });
        dizerAqui(texto, false);
        try { localStorage.setItem('povix.simplesBaixou', '1'); } catch { /* janela privada */ }
        const p = li.querySelector('.simplesPartilhar');
        p.hidden = !podePartilhar(feitos.get(k));
      } else {
        const semVideo = r?.erro === 'semVideo';
        const texto = semVideo ? (tocaVideo ? t('simples.videoNaoAbriu') : t('simples.abraNoChrome'))
          : t('simples.naoDeu', { motivo: r?.erro || t('simples.semMotivo') });
        dizerAqui(texto, false);
      }
    } catch (x) {
      dizerAqui(t('simples.naoDeu', { motivo: String(x?.message || x).slice(0, 120) }), false);
    } finally {
      aBaixar = false;
      atualizarBotoesClipe();
      if (pintarLista.adiada) pintarLista();
      // O canal que o clipe abriu pode fotografar os outros momentos dele.
      if (m.doEvento) fotografar();
      agendarContexto();
    }
  }

  // ── as fotos: um quadro de cada momento ────────────────────────────────
  let fotografando = null;
  async function fotografar() {
    if (fotografando || !linhaAberta) return;
    const linha = linhaAberta;
    const quadros = window.__povixQuadrosSimples?.() || abrirQuadrosEscondidos({ limiteMs: 12_000 });
    fotografando = quadros;
    let falhas = 0;
    try {
      for (let i = 0; i < mostrados.length && falhas < 2; i++) {
        // Um clipe a ser gravado tem a máquina toda: a foto espera (num celular as duas juntas travam).
        // eslint-disable-next-line no-await-in-loop
        while (aBaixar) await dormir(500);
        const m = mostrados[i];
        if (!m) break;
        const k = chave(m);
        if (nitidas.has(k) || m.canal !== linha.slug) continue;
        const ms = m.doClipe ? m.deMs + 1000 : m.ms;
        const r = onde(linha, ms, { nudgeMs: ponte.estado.nudges[linha.slug] || 0 });
        if (r.estado !== 'toca') continue;
        const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
        // O 480p (ou o mais perto acima de 360p): o 160p dava a foto borrada no cartão; o 720p pesa o dobro.
        const meio = peca.escada?.filter((d) => d.altura >= 360).sort((a, b) => Math.abs(a.altura - 480) - Math.abs(b.altura - 480))[0];
        const degrau = meio || peca.barato || peca.escada?.at(-1);
        // eslint-disable-next-line no-await-in-loop
        const q = await quadros.quadro({ url: degrau?.url, tempoS: r.tempoS, ms, canal: linha.slug });
        if (!q?.tela) { falhas++; continue; }
        const c = document.createElement('canvas');
        c.width = 640; c.height = 360;
        c.getContext('2d').drawImage(q.tela, 0, 0, 640, 360);
        let url = null;
        try { url = c.toDataURL('image/jpeg', 0.82); } catch { url = null; }
        if (!url) { falhas++; continue; }
        fotos.set(k, url);
        nitidas.add(k);
        if (vodAtual && !m.doEvento && !m.doClipe && vodAtual.slug === linha.slug) guardarFoto(prefixoDe(vodAtual) + NITIDA, k, url);
        const img = lista.querySelector(`li[data-chave="${CSS.escape(k)}"] .simplesFoto`);
        if (img) img.innerHTML = `<img src="${url}" alt="">`;
      }
    } finally {
      quadros.fechar?.();
      fotografando = null;
    }
  }

  // ── o link de um evento (?e=abisal) aberto no modo simples ───────────────
  if (ponte.eventoDoLink && modoSimples()) {
    ponte.eventoDoLink.then((aberto) => { if (aberto) { marcarVisto(); $('simplesDica').hidden = true; mostrarEvento(); } }).catch(() => {});
  }

  // A página recarregada volta ao último vídeo que a pessoa via, com a lista lembrada (ou continua de onde o
  // som parou). Um evento do endereço manda; "Começar de novo" apaga o último.
  const ultimo = ponte.eventoDoLink || !modoSimples() ? null : lerUltimo(armazem);
  const lembrado = ultimo && acharVod(armazem, ultimo.slug, ultimo.inicio);
  if (lembrado) {
    marcarVisto();
    $('simplesDica').hidden = true;
    if (lembrado.completo) mostrarGuardado(lembrado);
    else abrirStreamer(ultimo.slug, { inicioMs: ultimo.inicio });
  }

  return {
    comecar,
    // Para os testes de página.
    get lista() { return ultimos; },
    limparFotos() { fotos = new Map(); nitidas = new Set(); },
  };
}
