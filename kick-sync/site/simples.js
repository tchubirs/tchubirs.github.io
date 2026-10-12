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

import { t, tn } from './idiomas.js';
import { procurarCanais, vodsDoCanal, vodDaKick, slugDoNome } from './kick.js';
import { lerEntrada, montarLista, lancesParaLista, nomeDoArquivo, tempoNaLive, NOMES_NO_LANCE, QUANTOS } from './simples-lista.js';
import { varrerNoite } from './procurar-momentos.js';
import { somDoCanal } from './alinhar.js';
import { TAXA_TIROS } from './tiros.js';
import { janelasDosPicos, estimarFalta, tempoFalta } from './ouvir.js';
import { onde } from './relogio.js';
import { abrirQuadrosEscondidos } from './rosto.js';
import { escapar } from './escapar.js';

const CHAVE_MODO = 'povix.modo';
const CHAVE_VISTO = 'povix.simplesVisto';
const CHAVE_NAO = 'povix.simplesNao';
const MAX_NAO = 300;
const $ = (id) => document.getElementById(id);

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

/** Os momentos que a pessoa disse "Não quero", lembrados neste aparelho (a chave é canal|segundo). */
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
  const partes = ['chat', 'tiros', 'explosao', 'grito'].filter((x) => m.tipos.includes(x) && !(noTiroteio && x === 'tiros'))
    .map((x) => t(`simples.motivo.${x}`));
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

/** A palavra do nome do arquivo: o que aconteceu de mais forte. */
function palavraDoArquivo(m) {
  const tipo = ['tiros', 'explosao', 'grito', 'chat'].find((x) => m.tipos.includes(x)) || 'chat';
  return t(`simples.arquivo.${tipo}`);
}

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
  let aBaixar = false;
  // Quantos cartões a lista mostra ("Mostrar mais" soma), os que a pessoa não quer ("Não quero", lembrados
  // neste aparelho) e os que estão na tela agora (o `data-i` de cada cartão conta nesta lista).
  let mostrar = QUANTOS;
  let mostrados = [];
  const naoQuero = lerNaoQuero();
  const feitos = new Map();
  const tocaVideo = tocaVideoDaKick();
  const toque = window.matchMedia?.('(pointer: coarse)').matches;

  // ── os modos ──────────────────────────────────────────────────────────
  $('modoAvancado').onclick = () => {
    parar();
    escolherModo('avancado');
    document.body.classList.remove('simplesTrabalho');
    window.scrollTo({ top: 0 });
  };
  $('modoSimples').onclick = () => {
    escolherModo('simples');
    mostrarInicio();
    window.scrollTo({ top: 0 });
  };
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
  $('simplesDeNovo').onclick = () => { ponte.pararChatDoEvento?.(); parar(); mostrarInicio(); $('simplesErro').hidden = true; caixa.focus(); caixa.select(); };
  $('simplesParar').onclick = () => { busca?.abort(); };

  function erro(texto) {
    mostrarInicio();
    $('simplesErro').textContent = texto;
    $('simplesErro').hidden = false;
  }

  function mostrarInicio() {
    document.body.classList.remove('simplesTrabalho');
    $('simplesForm').hidden = false;
    $('simplesTrabalho').hidden = true;
  }

  function mostrarTrabalho(titulo) {
    document.body.classList.add('simplesTrabalho');
    $('simplesForm').hidden = true;
    $('simplesErro').hidden = true;
    $('simplesParecidos').hidden = true;
    $('simplesTrabalho').hidden = false;
    $('simplesQuem').textContent = titulo;
    $('simplesAviso').hidden = true;
    lista.innerHTML = '';
    ultimos = [];
    mostrados = [];
    mostrar = QUANTOS;
    $('simplesMais').hidden = true;
    window.scrollTo({ top: 0 });
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
    busca?.abort();
    busca = null;
    ponte.aoMudarEvento?.(null);
  }

  // ── começar ───────────────────────────────────────────────────────────
  async function comecar(texto, { soCanal = false } = {}) {
    const e = soCanal ? { tipo: 'canal', slug: String(texto).trim() } : lerEntrada(texto);
    if (!e) { erro(t('simples.naoEntendi')); return; }
    marcarVisto();
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
        const v = await comPrazo(vodDaKick(e.id), 20_000);
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
    if (!tocaVideo) avisar(t('simples.abraNoChrome'));
    const dizerEstado = (e) => {
      $('simplesParar').hidden = !e.lendo;
      const n = queridos().length;
      if (e.lendo) dizer(e.texto ? t('simples.lendoEvento', { texto: e.texto }) : t('simples.abrindoEventoEstado'), null);
      else dizer(n ? tn(n, 'simples.prontoUm', 'simples.pronto', { n }) : t('simples.nadaEvento'), false);
    };
    const atualizar = () => {
      if (minha !== geracao) return;
      const e = ponte.lancesDoEvento();
      ultimos = lancesParaLista(e.lances, { mensagens: e.mensagens }).map((m) => ({ ...m, nomeCanal: m.canal }));
      pintarLista();
      fotografar();
      dizerEstado(e);
    };
    ponte.aoMudarEvento?.(atualizar);
    // A frase de "lendo o chat de fulano" muda sem a lista mudar: só ela se refaz, de segundo em segundo
    // (a lista, não: um cartão que muda debaixo do dedo faz errar o toque).
    const relogio = setInterval(() => {
      if (minha !== geracao) { clearInterval(relogio); return; }
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

  async function abrirStreamer(nome, { inicioMs = null } = {}) {
    const minha = geracao;
    const velha = () => minha !== geracao;
    const slug = slugDoNome(nome);
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
    $('simplesQuem').textContent = t('simples.titulo', { canal: r.slug, dia: diaDe(linha.inicio), hora: horaDe(linha.inicio) });
    if (!tocaVideo) avisar(t('simples.abraNoChrome'));
    await procurar(linha, controlo);
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
  async function procurar(linha, controlo) {
    const slug = linha.slug;
    const vivo = ponte.aoVivoDe(slug);
    if (!vivo) { dizer(t('simples.naoAbriu'), false); return; }
    const sinal = controlo.signal;
    $('simplesParar').hidden = false;
    let picos = [];
    let mensagens = [];
    let sons = [];
    const refazer = () => {
      ultimos = montarLista({ picos, sons, mensagens, limites: vivo, quantos: 60 }).map((m) => ({ ...m, canal: slug }));
      pintarLista();
      fotografar();
    };
    try {
      // 1. O chat: dá os primeiros momentos em segundos.
      dizer(t('simples.lendoChat', { canal: slug, pct: 0 }), 0);
      const chatControlo = new AbortController();
      const pararChat = () => chatControlo.abort();
      sinal.addEventListener('abort', pararChat, { once: true });
      const v1 = vigia({
        desisteMs: DESISTE_CHAT_MS,
        aoAvisar: () => avisar(t('simples.chatDemora')),
        aoDesistir: () => { avisar(t('simples.chatDesistiu')); chatControlo.abort(); },
      });
      try {
        if (ponte.chat && vivo.deMs < Date.now()) {
          await ponte.chat.lerChatTrecho(slug, vivo.deMs, vivo.ateMs, {
            sinal: chatControlo.signal,
            aoProgredir: ({ fracao }) => { v1.andou(); dizer(t('simples.lendoChat', { canal: slug, pct: Math.round(fracao * 100) }), fracao); },
          });
        }
      } catch (x) {
        if (sinal.aborted) throw x;
        if (x?.name !== 'AbortError') avisar(t('simples.chatDesistiu'));
      } finally {
        v1.parar();
        sinal.removeEventListener('abort', pararChat);
      }
      if (!chatControlo.signal.aborted) avisar(tocaVideo ? '' : t('simples.abraNoChrome'));
      picos = (ponte.chat?.estado.marcas?.get(slug) || []).filter((m) => m.ms >= vivo.deMs && m.ms < vivo.ateMs);
      mensagens = ponte.chat?.estado.mensagens?.get(slug) || [];
      refazer();
      if (sinal.aborted) throw new DOMException('parado', 'AbortError');

      // 2. O som: só em volta dos picos do chat (o modo esperto do Detectar lances); sem picos, tudo.
      const intervalos = picos.length ? janelasDosPicos(picos, vivo.deMs, vivo.ateMs) : [[vivo.deMs, vivo.ateMs]];
      const totalMs = intervalos.reduce((s, [a, b]) => s + (b - a), 0);
      const somControlo = new AbortController();
      const pararSom = () => somControlo.abort();
      sinal.addEventListener('abort', pararSom, { once: true });
      let desistiu = false;
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
          filtros: { tiros: true, explosoes: true, gritos: false },
          lerSom: (l, quandoMs, duracaoS, opcoes) => somDoCanal(l, quandoMs, duracaoS, { ...opcoes, taxa: TAXA_TIROS }),
          aoProgresso: (x) => {
            if (!('bytes' in x) && !x.pronto) return;
            v2.andou();
            const feito = x.ouvidoMs || 0;
            const falta = estimarFalta({ feitoMs: feito, restoMs: totalMs - feito, bytes: x.bytes || 0, decorridoMs: Date.now() - comecou });
            dizer(t('simples.ouvindo', { canal: slug })
              + (falta ? t('simples.falta', { tempo: tempoFalta(falta) }) : ''), totalMs ? feito / totalMs : null);
          },
        });
        sons = [
          ...(r.candidatos || []).map((c) => ({ ...c, tipo: 'tiros' })),
          ...(r.explosoes || []).map((c) => ({ ...c, tipo: 'explosao' })),
        ];
        avisar(tocaVideo ? '' : t('simples.abraNoChrome'));
      } catch (x) {
        if (sinal.aborted) throw x;
        avisar(x?.name === 'SEM-DESCODIFICADOR' ? t('simples.semSomNavegador')
          : desistiu ? t('simples.somDesistiu') : t('simples.somFalhou'));
      } finally {
        v2.parar();
        sinal.removeEventListener('abort', pararSom);
      }
      refazer();
      const n = queridos().length;
      dizer(n ? tn(n, 'simples.prontoUm', 'simples.pronto', { n }) : t('simples.nada'), false);
    } catch (x) {
      if (x?.name !== 'AbortError' && !sinal.aborted) throw x;
      const n = queridos().length;
      dizer(n ? t('simples.paradoCom', { n }) : t('simples.parado'), false);
    } finally {
      $('simplesParar').hidden = true;
      if (busca === controlo) busca = null;
    }
  }

  // ── a lista ───────────────────────────────────────────────────────────
  const chave = (m) => `${m.canal}|${Math.round(m.ms / 1000)}`;

  /** Os que a lista mostra agora: sem os "Não quero", e só até onde o "Mostrar mais" chegou. */
  const queridos = () => ultimos.filter((m) => !naoQuero.has(chave(m)));
  const visiveis = () => queridos().slice(0, mostrar);

  function pintarLista() {
    // Um clipe a ser feito agora não pode sumir debaixo do dedo: a lista refaz-se quando ele acabar.
    if (aBaixar) { pintarLista.adiada = true; return; }
    pintarLista.adiada = false;
    const primeiraVez = (() => { try { return !localStorage.getItem('povix.simplesBaixou'); } catch { return true; } })();
    mostrados = visiveis();
    const sobra = queridos().length - mostrados.length;
    $('simplesMais').hidden = sobra <= 0;
    $('simplesMais').textContent = t('simples.mais', { n: Math.min(sobra, QUANTOS) });
    $('simplesDicaLista').hidden = !mostrados.length || !primeiraVez;
    const inicio = linhaAberta?.inicio ?? mostrados[0]?.ms ?? 0;
    lista.innerHTML = mostrados.map((m, i) => {
      const k = chave(m);
      const foto = fotos.get(k);
      const durS = Math.round((m.ateMs - m.deMs) / 1000);
      const motivo = m.doClipe ? t('simples.oClipe') : motivoEmPalavras(m);
      const nota = m.nota ? `<b class="simplesNota nota-${m.nota}">${escapar(t(`simples.nota.${m.nota}`))}</b> ` : '';
      const feito = feitos.get(k);
      return `<li class="simplesCartao" data-i="${i}" data-chave="${escapar(k)}">`
        + `<div class="simplesFoto">${foto ? `<img src="${foto}" alt="">` : `<span class="simplesSemFoto">${escapar(horaDe(m.ms))}<small>${escapar(t('simples.semFoto'))}</small></span>`}</div>`
        + '<div class="simplesInfo">'
        + (m.doEvento ? `<p class="simplesStreamer">${escapar(t('simples.deQuem', { canal: m.nomeCanal || m.canal }))}</p>` : '')
        + `<p class="simplesMotivo">${nota}${escapar(motivo)}</p>`
        + (m.outros?.length ? `<p class="simplesTambem">${escapar(quemEstavaNoLance(m))}</p>` : '')
        + (m.falha ? `<p class="simplesTalvezFalha">${escapar(t('simples.talvezFalha'))}</p>` : '')
        + `<p class="simplesQuando">${escapar(m.doClipe ? t('simples.duracao', { s: durS })
          : t('simples.quando', { tempo: tempoNaLive(m.ms, inicio), hora: horaDe(m.ms), s: durS }))}</p>`
        + '<div class="simplesBotoes">'
        + `<button type="button" class="principal simplesTiktok" data-acao="tiktok"><svg class="ic" aria-hidden="true"><use href="#i-descarregar"/></svg><span>${escapar(t('simples.baixarTiktok'))}</span></button>`
        + `<button type="button" class="simplesSecundario simplesDeitado" data-acao="deitado">${escapar(t('simples.baixarDeitado'))}</button>`
        + `<button type="button" class="simplesSecundario simplesNao" data-acao="nao">${escapar(t('simples.naoQuero'))}</button>`
        + '</div>'
        + `<p class="simplesBaixando" role="status" aria-live="polite">${feito ? escapar(feito.texto) : ''}</p>`
        + `<progress class="simplesBarraClipe" max="1" hidden></progress>`
        + `<button type="button" class="simplesSecundario simplesPartilhar" data-acao="partilhar"${feito?.blob && podePartilhar(feito) ? '' : ' hidden'}>${escapar(t('simples.partilhar'))}</button>`
        + '</div></li>';
    }).join('');
    for (const b of lista.querySelectorAll(BOTOES_DO_CLIPE)) b.disabled = aBaixar;
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const li = b.closest('li');
    const m = mostrados[Number(li.dataset.i)];
    if (!m) return;
    if (b.dataset.acao === 'nao') { dispensar(m, Number(li.dataset.i)); return; }
    if (b.dataset.acao === 'partilhar') { partilhar(feitos.get(li.dataset.chave)); return; }
    baixar(m, li, { deitado: b.dataset.acao === 'deitado' });
  });

  // Os botões que mexem no clipe: ficam parados enquanto um clipe é feito.
  const BOTOES_DO_CLIPE = 'button[data-acao="tiktok"], button[data-acao="deitado"], button[data-acao="nao"]';

  /** "Não quero": o momento sai da lista e não volta (neste aparelho). O foco vai para o cartão que subiu. */
  function dispensar(m, i) {
    naoQuero.add(chave(m));
    guardarNaoQuero(naoQuero);
    pintarLista();
    const cartao = lista.children[Math.min(i, lista.children.length - 1)];
    (cartao?.querySelector('button[data-acao="tiktok"]') || $('simplesQuem')).focus?.({ preventScroll: true });
  }

  $('simplesMais').onclick = () => {
    const antes = mostrados.length;
    mostrar += QUANTOS;
    pintarLista();
    fotografar();
    lista.children[antes]?.querySelector('button[data-acao="tiktok"]')?.focus();
  };

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
    return Boolean(vivo && m.ms >= vivo.deMs && m.ms <= vivo.ateMs && linhaAberta?.slug === m.canal);
  }

  async function baixar(m, li, { deitado }) {
    if (aBaixar) return;
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
      // Um momento do evento é de um canal que pode não estar aberto: abre-se o vídeo dele naquela hora.
      if (m.doEvento && !abertoEm(m)) {
        dizerAqui(t('simples.fase.abrirCanal', { canal }));
        const linha = await comPrazo(ponte.abrirCanal(m.canal, { inicioMs: m.ms }).catch(() => null), ABRIR_MS);
        if (!linha) { dizerAqui(t('simples.canalNaoAbriu', { canal }), false); return; }
        ponte.pausar();
        linhaAberta = linha;
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
      for (const b of lista.querySelectorAll(BOTOES_DO_CLIPE)) b.disabled = false;
      if (pintarLista.adiada) pintarLista();
      // O canal que o clipe abriu pode fotografar os outros momentos dele.
      if (m.doEvento) fotografar();
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
        if (fotos.has(k) || m.canal !== linha.slug) continue;
        const ms = m.doClipe ? m.deMs + 1000 : m.ms;
        const r = onde(linha, ms, { nudgeMs: ponte.estado.nudges[linha.slug] || 0 });
        if (r.estado !== 'toca') continue;
        const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
        const degrau = peca.barato || peca.escada?.at(-1);
        // eslint-disable-next-line no-await-in-loop
        const q = await quadros.quadro({ url: degrau?.url, tempoS: r.tempoS, ms, canal: linha.slug });
        if (!q?.tela) { falhas++; continue; }
        const c = document.createElement('canvas');
        c.width = 320; c.height = 180;
        c.getContext('2d').drawImage(q.tela, 0, 0, 320, 180);
        let url = null;
        try { url = c.toDataURL('image/jpeg', 0.7); } catch { url = null; }
        if (!url) { falhas++; continue; }
        fotos.set(k, url);
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

  return {
    comecar,
    // Para os testes de página.
    get lista() { return ultimos; },
    limparFotos() { fotos = new Map(); },
  };
}
