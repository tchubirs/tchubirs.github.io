// As mortes no evento (IDEIAS.md, item 1): marcas no mapa, na faixa de quem matou e na de quem morreu,
// nos melhores lances e, a pedido, na montagem.
//
// De onde vêm (o dono, 12/10: "Sem essa de bloco de notas, você tem que fazer tudo"): dos próprios
// vídeos. A página procura a tela de morte do Rust e lê quem matou (achar-mortes.js e
// achar-mortes-video.js), sozinha, perto de cada tiroteio que a detecção acha, e o vídeo todo quando se
// carrega em "Achar mortes nos vídeos". O registro do servidor continua a poder entrar (mortes.js), mas
// fica à parte, num details: não é preciso.
//
// Aqui fica a lista, o andamento da procura, a janela do registro, o fuso e o alinhamento das mortes do
// servidor e os nomes do jogo sem canal. As mortes ficam só neste aparelho, por evento, como os lances
// marcados e descartados; as que vão para a montagem viajam no link do projeto com as outras kills.

import { t, tn } from './idiomas.js?v=3195cb16bc';
import { escapar } from './escapar.js?v=3195cb16bc';
import {
  lerMortes, horasDasMortes, casarMortes, nomesSemCanal, marcasDasMortes, juntarMortes, mortesParaGuardar,
  mortesGuardadas, fusoDoAparelho,
} from './mortes.js?v=3195cb16bc';
import { lerApelidos, guardarApelidos, juntarApelidos } from './nomes.js?v=3195cb16bc';
import { morteDoVideo, juntarDoVideo, confirmarPeloTiro, janelasDosTiros } from './achar-mortes.js?v=3195cb16bc';
import { procurarMortes, podeDescodificar } from './achar-mortes-video.js?v=3195cb16bc';
import { abrirQuadros, abrirLeitor, podeLer } from './ler-tela.js?v=3195cb16bc';
import { juntar, tempoFalta } from './ouvir.js?v=3195cb16bc';

const GUARDADO = 'povix.mortes';
const MAX_EVENTOS = 30;
const MAX_NAO_LIDAS = 300;
const ARQUIVO_MAX = 10 * 1024 * 1024;
// Quanto antes da morte os vídeos abrem: a mesma folga dos melhores lances.
export const ANTES_MS = 10_000;
// Os fusos da lista: as horas inteiras e as meias horas que existem.
const FUSOS = [...Array.from({ length: 27 }, (_, i) => (i - 12) * 60), -570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765, 825]
  .sort((a, b) => a - b);

// O que já se olhou de cada canal, guardado com as mortes: abrir o evento outra vez não baixa de novo.
const MAX_VARRIDO = 400;

const horaLocal = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** "UTC−03:00", "UTC+05:30", "UTC". */
export function nomeDoFuso(min) {
  if (!min) return 'UTC';
  const a = Math.abs(min);
  return `UTC${min < 0 ? '−' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

function lerTudo() {
  try {
    const j = JSON.parse(localStorage.getItem(GUARDADO) || '{}');
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

/**
 * @param {object} d
 * @param {() => string[]} d.canais - os canais do evento
 * @param {() => string} d.chave - a chave do evento neste aparelho (a mesma dos melhores lances)
 * @param {() => number|null} d.refMs - o começo do trecho do evento: dá o dia às horas sem data
 * @param {(c, ms) => boolean} d.fora - o canal estava noutro jogo nesse instante
 * @param {(c, ms) => boolean} d.noAr - o canal tinha vídeo nesse instante
 * @param {(canais, ms, foco) => Promise} d.abrir - abrir esses ângulos nesse instante
 * @param {(m) => void} d.marcar - pôr na montagem: { ms, canal, canais, vitimas, origem }
 * @param {() => number|null} d.agoraDoVideo - o instante do vídeo aberto, ou null
 * @param {() => void} d.aoMudar - repintar o mapa, a legenda e os melhores lances
 * @param {(c, deMs, durS, op) => Promise} d.tsDe - os bytes do 160p de um canal: { ts, segs } (alinhar.js, tsDoCanal)
 * @param {(c, ms) => object|null} d.vodEm - o VOD de um canal num instante (para o quadro nítido)
 * @param {() => Array} d.tiros - os tiroteios achados pela detecção: [{ canal, ms, combateDeMs, combateAteMs }]
 * @param {() => Map} d.coberturas - canal -> [[deMs, ateMs]] com vídeo do jogo do evento
 * @param {() => {deMs, ateMs}|null} d.janela - o trecho do evento, para "o vídeo todo"
 * @param {() => boolean} d.ehRust - o evento é de Rust (ou não diz o jogo): a procura sozinha só corre aí
 */
export function montarMortes({
  canais, chave, refMs, fora = () => false, noAr = () => true, abrir, marcar = () => {}, agoraDoVideo = () => null,
  aoMudar = () => {}, dialogo = { mostrar: (m) => { m.hidden = false; }, esconder: (m) => { m.hidden = true; } },
  tsDe = async () => null, vodEm = () => null, tiros = () => [], coberturas = () => new Map(), janela = () => null,
  ehRust = () => true, buscar = fetch,
}) {
  const $ = (id) => document.getElementById(id);
  const st = {
    lista: [], fuso: 'aparelho', ajusteMs: 0, naoLidas: [],
    casadas: [], porId: new Map(), marcas: new Map(), aberta: null, apagar: false,
    // A procura nos vídeos: o controlo dela, o que já se olhou (canal -> intervalos) e se há outra à espera.
    busca: null, varrido: new Map(), deNovo: false, aberto: false,
  };
  let nomesPintados = null;

  const fusoMin = () => {
    const ref = refMs() ?? Date.now();
    return st.fuso === 'aparelho' ? fusoDoAparelho(ref) : st.fuso;
  };

  /** Refazer as horas, os canais e as marcas, e avisar o resto da página. */
  function refazer() {
    const ref = refMs();
    const comHoras = Number.isFinite(ref) ? horasDasMortes(st.lista, { fusoMin: fusoMin(), refMs: ref, ajusteMs: st.ajusteMs }) : [];
    // As do vídeo com quem matou num canal: o tiro dele por perto confirma, e a marca dele vai para o tiro.
    const porCanal = new Map();
    for (const x of tiros() || []) {
      if (!porCanal.has(x.canal)) porCanal.set(x.canal, []);
      porCanal.get(x.canal).push(x);
    }
    st.casadas = casarMortes(comHoras, canais(), lerApelidos()).map((m) => {
      if (m.origem !== 'video' || !m.canalMatador) return m;
      const c = confirmarPeloTiro(m.ms, porCanal.get(m.canalMatador));
      return c.confirmado ? { ...m, confirmado: true, msMatador: c.msMatador } : m;
    });
    st.porId = new Map(st.casadas.map((m) => [m.id, m]));
    st.marcas = marcasDasMortes(st.casadas, { fora });
    if (st.aberta != null && !st.porId.has(st.aberta)) st.aberta = null;
    pintar();
    aoMudar();
  }

  function guardar() {
    const tudo = lerTudo();
    const k = chave();
    if (!st.lista.length && !st.varrido.size) delete tudo[k];
    else {
      tudo[k] = {
        l: mortesParaGuardar(st.lista), f: st.fuso, a: st.ajusteMs, n: st.naoLidas.slice(0, MAX_NAO_LIDAS), q: Date.now(),
        v: Object.fromEntries([...st.varrido].map(([c, l]) => [c, l.slice(-MAX_VARRIDO)])),
      };
    }
    const ficam = Object.entries(tudo).sort((a, b) => (b[1]?.q || 0) - (a[1]?.q || 0)).slice(0, MAX_EVENTOS);
    try { localStorage.setItem(GUARDADO, JSON.stringify(Object.fromEntries(ficam))); } catch { /* janela privada */ }
  }

  /** As mortes guardadas deste evento, ao abri-lo. */
  function carregar() {
    const g = lerTudo()[chave()] || {};
    st.lista = mortesGuardadas(g.l);
    st.fuso = Number.isFinite(g.f) ? g.f : 'aparelho';
    st.ajusteMs = Number.isFinite(g.a) ? g.a : 0;
    st.naoLidas = Array.isArray(g.n) ? g.n.filter((x) => x && typeof x.texto === 'string').slice(0, MAX_NAO_LIDAS) : [];
    st.varrido = new Map(Object.entries(g.v && typeof g.v === 'object' ? g.v : {})
      .map(([c, l]) => [c, (Array.isArray(l) ? l : []).filter((x) => Array.isArray(x) && x.every(Number.isFinite))]));
    st.aberta = null;
    st.apagar = false;
    st.aberto = true;
    $('mortesEstado').textContent = '';
    refazer();
    // Com tiroteios já achados (numa detecção de antes), as mortes perto deles procuram-se sozinhas.
    sinaisMudaram();
  }

  function limpar() {
    st.busca?.abort();
    st.busca = null;
    st.aberto = false;
    st.varrido = new Map();
    st.lista = [];
    st.casadas = [];
    st.porId = new Map();
    st.marcas = new Map();
    st.naoLidas = [];
    st.aberta = null;
    dialogo.esconder($('modalMortes'));
    pintar();
  }

  // ── importar ───────────────────────────────────────────────────────────

  function abrirJanela() {
    $('mortesEstadoJanela').textContent = '';
    $('mortesNaoLidasJanela').innerHTML = '';
    dialogo.mostrar($('modalMortes'));
    $('mortesTexto').focus();
  }

  const motivo = (m) => t(`mortes.motivo.${m}`);
  const linhaNaoLida = (x) => `<li>${escapar(x.texto)} <span>(${escapar(t('mortes.linha', { n: x.linha }))}, ${escapar(motivo(x.motivo))})</span></li>`;

  /** Ler o texto e juntar às mortes que já havia. Devolve quantas mortes novas entraram. */
  function importar(texto) {
    const idioma = (typeof navigator !== 'undefined' && navigator.language) || 'pt';
    const { mortes, naoLidas } = lerMortes(texto, { idioma });
    const r = juntarMortes(st.lista, mortes);
    st.lista = r.mortes;
    st.naoLidas = [...naoLidas, ...st.naoLidas].slice(0, MAX_NAO_LIDAS);
    st.apagar = false;
    guardar();
    refazer();
    const partes = [];
    partes.push(mortes.length ? tn(mortes.length, 'mortes.lidaUma', 'mortes.lidas') : t('mortes.nenhuma'));
    if (r.repetidas) partes.push(tn(r.repetidas, 'mortes.repetidaUma', 'mortes.repetidas'));
    if (naoLidas.length) partes.push(tn(naoLidas.length, 'mortes.naoLidaUma', 'mortes.naoLidasN'));
    const semCanal = nomesSemCanal(st.casadas).length;
    if (semCanal) partes.push(tn(semCanal, 'mortes.nomeSemCanalUm', 'mortes.nomesSemCanal'));
    $('mortesEstadoJanela').textContent = partes.join(' ');
    $('mortesNaoLidasJanela').innerHTML = naoLidas.map(linhaNaoLida).join('');
    $('mortesEstado').textContent = partes.join(' ');
    return r.novas;
  }

  async function lerArquivo(arquivo) {
    if (!arquivo) return;
    const nome = arquivo.name || '';
    if (arquivo.size > ARQUIVO_MAX) { $('mortesEstadoJanela').textContent = t('evento.arquivoGrande', { nome }); return; }
    let texto;
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      if (bytes[0] === 0xff && bytes[1] === 0xfe) texto = new TextDecoder('utf-16le').decode(bytes);
      else {
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { texto = new TextDecoder('windows-1252').decode(bytes); }
      }
    } catch {
      $('mortesEstadoJanela').textContent = t('evento.arquivoErro', { nome });
      return;
    }
    $('mortesTexto').value = texto.replace(/^﻿/, '');
    importar($('mortesTexto').value);
  }

  // ── abrir, alinhar, montagem ───────────────────────────────────────────

  /** Os ângulos de uma morte que têm vídeo: quem matou primeiro. */
  function angulosDa(m, ms) {
    return [...new Set([m.canalMatador, m.canalVitima].filter(Boolean))].filter((c) => noAr(c, ms) && !fora(c, ms));
  }

  async function abrirMorte(id) {
    const m = st.porId.get(id);
    if (!m) return;
    let ms = m.ms - ANTES_MS;
    let lista = angulosDa(m, ms);
    // Quem entrou no ar entre os 10 s de antes e a morte: abre-se no próprio instante.
    if (lista.length < angulosDa(m, m.ms).length) { ms = m.ms; lista = angulosDa(m, ms); }
    st.aberta = id;
    pintar();
    if (!lista.length) {
      $('mortesEstado').textContent = t('mortes.ninguemNoAr', { matador: m.matador || '?', vitima: m.vitima, hora: horaLocal(m.ms) });
      return;
    }
    $('mortesEstado').textContent = '';
    await abrir(lista, ms, lista[0]);
  }

  /** "A morte é agora": a diferença entre a morte aberta e o instante do vídeo vai para todas. */
  function alinhar(id = st.aberta) {
    const m = st.porId.get(id);
    const agora = agoraDoVideo();
    if (!m || !Number.isFinite(agora)) { dizer(t('mortes.semVideo')); return; }
    const delta = Math.round(agora - m.ms);
    st.ajusteMs += delta;
    st.aberta = id;
    guardar();
    refazer();
    dizer(t('mortes.alinhado', { s: segundos(delta) }));
  }
  const segundos = (ms) => {
    const s = Math.round(ms / 100) / 10;
    return `${s > 0 ? '+' : ''}${s.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  };
  function dizer(texto) {
    $('mortesEstado').textContent = texto;
    $('morteAbertaTexto').textContent = texto;
    clearTimeout(dizer.relogio);
    dizer.relogio = setTimeout(pintarAberta, 4000);
  }

  function naMontagem(m) {
    const canal = m.canalMatador || m.canalVitima;
    if (!canal) return false;
    marcar({
      ms: m.ms, canal, canais: [...new Set([m.canalMatador, m.canalVitima].filter(Boolean))],
      vitimas: m.canalVitima && m.canalVitima !== canal ? [m.canalVitima] : [], origem: 'servidor',
    });
    return true;
  }

  // ── achar nos vídeos ───────────────────────────────────────────────────

  /** O que falta olhar de [a, b] num canal, tirando o que já se olhou. */
  function faltaOlhar(c, a, b) {
    const feitos = juntar(st.varrido.get(c) || []);
    let partes = [[a, b]];
    for (const [x, y] of feitos) {
      partes = partes.flatMap(([p, q]) => (y <= p || x >= q ? [[p, q]] : [[p, Math.min(q, x)], [Math.max(p, y), q]]))
        .filter(([p, q]) => q - p >= 5000);
    }
    return partes;
  }

  /** Os pedaços a olhar, por canal: perto dos tiros (com vídeo, do jogo do evento) ou o vídeo todo. */
  function alvosPara(modo) {
    const cob = coberturas();
    const j = janela();
    const porCanal = new Map();
    if (modo === 'tiros') {
      for (const x of tiros() || []) {
        if (!x?.canal || !Number.isFinite(x.ms)) continue;
        if (!porCanal.has(x.canal)) porCanal.set(x.canal, []);
        porCanal.get(x.canal).push(x);
      }
    }
    const alvos = [];
    for (const c of canais()) {
      const comVideo = (cob.get(c) || []).map(([a, b]) => [Math.max(a, j?.deMs ?? a), Math.min(b, j?.ateMs ?? b)]).filter(([a, b]) => b > a);
      if (!comVideo.length) continue;
      const onde = modo === 'tiros' ? janelasDosTiros(porCanal.get(c)) : comVideo;
      const intervalos = [];
      for (const [a, b] of onde) {
        for (const [x, y] of comVideo) {
          const de = Math.max(a, x);
          const ate = Math.min(b, y);
          if (ate > de) intervalos.push(...faltaOlhar(c, de, ate));
        }
      }
      if (intervalos.length) alvos.push({ canal: c, intervalos: juntar(intervalos) });
    }
    return alvos;
  }

  const mb = (bytes) => Math.round(bytes / 1048576);
  /** "40 s", "12 min", "2 h 05": quanto vídeo já se olhou e quanto há. */
  const duracao = (ms) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const min = Math.round(s / 60);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
  };

  /**
   * Procurar as mortes nos vídeos. `auto`: veio sozinha (tiroteios novos), e então não diz nada quando
   * não há o que olhar.
   */
  async function acharMortes({ modo = 'tiros', auto = false } = {}) {
    if (st.busca) { st.deNovo = st.deNovo || auto; return; }
    const telasDe = window.__povixTelas || null;
    if (!telasDe && !podeDescodificar()) {
      if (!auto) $('mortesEstado').textContent = t('mortes.semDescodificador');
      return;
    }
    if (modo === 'tiros' && !(tiros() || []).length) {
      if (!auto) $('mortesEstado').textContent = t('mortes.semTiros');
      return;
    }
    const alvos = alvosPara(modo);
    if (!alvos.length) {
      if (!auto) $('mortesEstado').textContent = t('mortes.nadaNovo');
      return;
    }
    const controlo = new AbortController();
    st.busca = controlo;
    const barra = $('mortesBarra');
    barra.hidden = false;
    barra.value = 0;
    pintar();
    let achadas = 0;
    let falhados = 0;
    const leitor = podeLer() || window.__povixQuadros ? () => abrirLeitor({ modo: '7' }) : null;
    try {
      const { concluidos } = await procurarMortes({
        alvos,
        tsDe,
        vodEm,
        quadros: window.__povixQuadros || ((vod, op) => abrirQuadros(vod, { buscar, ...op })),
        abrirLeitor: leitor,
        telasDe,
        sinal: controlo.signal,
        aoProgresso: (x) => {
          // Um pedaço que ainda estava a chegar quando se carregou em Parar não escreve por cima.
          if (controlo.signal.aborted) return;
          falhados = x.falhados || 0;
          if (x.fase === 'ver') {
            barra.value = x.totalMs ? Math.min(1, x.feitoMs / x.totalMs) : 0;
            $('mortesEstado').textContent = t('mortes.aVer', { feito: duracao(x.feitoMs), total: duracao(x.totalMs), mb: mb(x.bytes) }) + (Number.isFinite(x.faltaMs) && x.faltaMs > 0 ? t('mortes.falta', { tempo: tempoFalta(x.faltaMs) }) : '');
          } else if (x.fase === 'ler') {
            $('mortesEstado').textContent = t('mortes.aLer', { feitas: x.feitas + 1, total: x.total });
          }
        },
        aoAchar: (m) => {
          if (controlo.signal.aborted) return;
          const r = juntarDoVideo(st.lista, [morteDoVideo(m)]);
          st.lista = r.mortes;
          achadas += r.novas;
          guardar();
          refazer();
        },
      });
      // A falha de um pedaço não impede outra tentativa nem repete os que já deram certo.
      for (const a of concluidos) st.varrido.set(a.canal, juntar([...(st.varrido.get(a.canal) || []), [a.deMs, a.ateMs]]));
      guardar();
      $('mortesEstado').textContent = (achadas ? tn(achadas, 'mortes.achadaUma', 'mortes.achadas') : t('mortes.nenhumaVideo'))
        + (falhados ? t('mortes.falhados', { n: falhados }) : '');
    } catch (e) {
      $('mortesEstado').textContent = e?.name === 'AbortError' ? t('mortes.parado', { n: achadas }) : t('mortes.erroVideo');
    } finally {
      if (st.busca === controlo) st.busca = null;
      barra.hidden = true;
      pintar();
      // Chegaram tiroteios novos enquanto esta corria: mais uma volta, só com o que falta.
      if (st.deNovo && st.aberto && !controlo.signal.aborted) { st.deNovo = false; acharMortes({ modo: 'tiros', auto: true }); }
      st.deNovo = false;
    }
  }

  /** A detecção achou tiroteios (ou a montagem mudou): as mortes perto deles procuram-se sozinhas. */
  let relogioSinais = null;
  function sinaisMudaram() {
    clearTimeout(relogioSinais);
    relogioSinais = setTimeout(() => {
      if (!st.aberto || !ehRust()) return;
      refazer();
      if ((tiros() || []).length) acharMortes({ modo: 'tiros', auto: true });
    }, 400);
  }

  // ── pintar ─────────────────────────────────────────────────────────────

  function textoDa(m) {
    if (m.origem === 'video') {
      if (m.matador && m.canalMatador) {
        return t('mortes.matou', { matador: m.matador, vitima: m.vitima })
          + (m.confirmado ? ` (${t('mortes.confirmado', { canal: m.canalMatador })})` : '');
      }
      return t('mortes.morreu', { vitima: m.vitima }) + ` (${m.matador ? t('mortes.quemMatou', { matador: m.matador }) : t('mortes.naoLido')})`;
    }
    const extra = [m.arma, Number.isFinite(m.distancia) ? t('mortes.distancia', { m: Math.round(m.distancia) }) : null].filter(Boolean).join(', ');
    return t('mortes.matou', { matador: m.matador, vitima: m.vitima }) + (extra ? ` (${extra})` : '');
  }

  function pintarAberta() {
    const m = st.porId.get(st.aberta);
    $('morteAberta').hidden = !m;
    if (m) $('morteAbertaTexto').textContent = t('mortes.aberta', { hora: horaLocal(m.ms), texto: textoDa(m) });
  }

  function pintarFuso() {
    const ref = refMs() ?? Date.now();
    const aparelho = fusoDoAparelho(ref);
    $('mortesFuso').innerHTML = `<option value="aparelho">${escapar(t('mortes.fusoAparelho', { fuso: nomeDoFuso(aparelho) }))}</option>`
      + FUSOS.map((f) => `<option value="${f}">${escapar(nomeDoFuso(f))}</option>`).join('');
    $('mortesFuso').value = String(st.fuso);
  }

  function pintar() {
    const tem = st.lista.length > 0;
    // A secção está sempre à vista com o evento aberto: é dela que sai o "Achar mortes nos vídeos".
    $('mortes').hidden = !st.aberto;
    $('legendaMorte').hidden = ![...st.marcas.values()].some((l) => l.length);
    pintarAberta();
    if ($('mortes').hidden) return;
    $('mortesConta').textContent = tem ? String(st.lista.length) : '';
    $('mortesAcharTexto').textContent = st.busca ? t('mortes.parar') : t('mortes.achar');
    $('mortesApagar').hidden = !tem;
    pintarFuso();
    $('mortesAjuste').textContent = st.ajusteMs ? t('mortes.ajuste', { s: segundos(st.ajusteMs) }) : t('mortes.semAjuste');
    $('mortesDesalinhar').hidden = !st.ajusteMs;
    $('mortesApagar').querySelector('span').textContent = st.apagar ? t('mortes.apagarConfirma', { n: st.lista.length }) : t('mortes.apagar');
    $('mortesTodasMontagem').hidden = !st.casadas.some((m) => m.canalMatador || m.canalVitima);
    // Os nomes do jogo sem canal: escolhe-se o canal e fica como apelido dele.
    const soltos = nomesSemCanal(st.casadas);
    $('mortesNomes').hidden = !soltos.length;
    $('mortesNomesTitulo').textContent = t('mortes.nomes', { n: soltos.length });
    const opcoes = `<option value="">${escapar(t('mortes.escolherCanal'))}</option>`
      + canais().map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
    const nomesHtml = soltos.map((s, i) => `<li data-nome="${escapar(s.nome)}"><b id="mortesNome${i}">${escapar(s.nome)}</b>`
      + `<span class="nota">${escapar(tn(s.vezes, 'mortes.vezUma', 'mortes.vezes'))}</span>`
      + `<select aria-labelledby="mortesNome${i}">${opcoes}</select>`
      + `<button type="button" data-acao="nome">${escapar(t('mortes.guardarNome'))}</button></li>`).join('');
    if (nomesHtml !== nomesPintados) {
      const lista = $('mortesNomesLista');
      const escolhas = new Map([...lista.children].map((li) => [li.dataset.nome, li.querySelector('select').value]));
      const ativo = document.activeElement;
      const nomeEmFoco = ativo?.closest('#mortesNomesLista li')?.dataset.nome;
      lista.innerHTML = nomesHtml;
      nomesPintados = nomesHtml;
      for (const li of lista.children) {
        if (escolhas.has(li.dataset.nome)) li.querySelector('select').value = escolhas.get(li.dataset.nome);
        if (li.dataset.nome === nomeEmFoco) li.querySelector(ativo.tagName.toLowerCase())?.focus({ preventScroll: true });
      }
    }
    $('mortesNaoLidas').hidden = !st.naoLidas.length;
    $('mortesNaoLidasTitulo').textContent = t('mortes.naoLidas', { n: st.naoLidas.length });
    $('mortesNaoLidasLista').innerHTML = st.naoLidas.map(linhaNaoLida).join('');
    const ordem = [...st.casadas].sort((a, b) => a.ms - b.ms);
    const semCanal = ` <span class="semCanal">(${escapar(t('mortes.semCanal'))})</span>`;
    $('mortesLista').innerHTML = ordem.map((m) => {
      const doVideo = m.origem === 'video';
      const quem = escapar(textoDa(m)) + (!doVideo && (!m.canalMatador || !m.canalVitima) ? semCanal : '')
        + ` <span class="origemMorte">${escapar(t(doVideo ? 'mortes.doVideo' : 'mortes.doServidor'))}</span>`;
      const angulos = [...new Set([m.canalMatador, m.canalVitima].filter(Boolean))];
      return `<li class="morte${m.id === st.aberta ? ' aberta' : ''}" data-id="${m.id}">`
        + `<p class="morteHora">${escapar(horaLocal(m.ms))}${m.soMinuto && !doVideo ? `<small>${escapar(t('mortes.soMinuto'))}</small>` : ''}</p>`
        + `<p class="morteQuem">${quem}</p>`
        + '<div class="morteAcoes">'
        + `<button type="button" class="principal" data-acao="abrir"${angulos.length ? '' : ' disabled'} title="${escapar(t('mortes.abrirAjuda', { canais: angulos.join(', ') }))}">`
        + `<svg class="ic ic-p" aria-hidden="true"><use href="#i-seta"/></svg><span>${escapar(t('mortes.abrir'))}</span></button>`
        + (doVideo ? '' : `<button type="button" data-acao="agora" title="${escapar(t('mortes.agoraAjuda'))}">${escapar(t('mortes.agora'))}</button>`)
        + `<button type="button" data-acao="montagem"${angulos.length ? '' : ' disabled'} title="${escapar(t('mortes.montagemAjuda'))}">`
        + `<svg class="ic ic-p" aria-hidden="true"><use href="#i-marcador"/></svg><span>${escapar(t('mortes.montagem'))}</span></button>`
        + '</div></li>';
    }).join('');
  }

  // ── ligações ───────────────────────────────────────────────────────────

  $('importarMortes').onclick = abrirJanela;
  $('mortesAchar').onclick = () => {
    if (st.busca) { st.busca.abort(); return; }
    acharMortes({ modo: $('mortesModo').value === 'tudo' ? 'tudo' : 'tiros' });
  };
  $('fecharMortes').onclick = () => dialogo.esconder($('modalMortes'));
  $('modalMortes').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    dialogo.esconder($('modalMortes'));
  });
  $('modalMortes').addEventListener('click', (e) => { if (e.target === $('modalMortes')) dialogo.esconder($('modalMortes')); });
  $('mortesLer').onclick = () => importar($('mortesTexto').value);
  $('mortesArquivo').onclick = () => $('mortesArquivoCampo').click();
  $('mortesArquivoCampo').onchange = async () => {
    await lerArquivo($('mortesArquivoCampo').files?.[0]);
    $('mortesArquivoCampo').value = '';
  };
  $('mortesFuso').onchange = () => {
    const v = $('mortesFuso').value;
    st.fuso = v === 'aparelho' ? 'aparelho' : Number(v);
    guardar();
    refazer();
  };
  $('mortesDesalinhar').onclick = () => { st.ajusteMs = 0; guardar(); refazer(); };
  $('morteAgora').onclick = () => alinhar();
  $('mortesApagar').onclick = () => {
    if (!st.apagar) { st.apagar = true; pintar(); return; }
    st.lista = [];
    st.naoLidas = [];
    st.ajusteMs = 0;
    st.apagar = false;
    // Apagar é também esquecer o que se olhou: a próxima procura olha tudo de novo.
    st.varrido = new Map();
    guardar();
    refazer();
  };
  $('mortesTodasMontagem').onclick = () => {
    let n = 0;
    for (const m of st.casadas) if (naMontagem(m)) n++;
    $('mortesEstado').textContent = tn(n, 'mortes.umaNaMontagem', 'mortes.todasNaMontagem');
  };
  $('mortesLista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acao]');
    const li = b?.closest('li[data-id]');
    if (!b || !li || b.disabled) return;
    const id = Number(li.dataset.id);
    if (b.dataset.acao === 'abrir') abrirMorte(id);
    else if (b.dataset.acao === 'agora') alinhar(id);
    else if (b.dataset.acao === 'montagem') {
      const m = st.porId.get(id);
      if (m && naMontagem(m)) $('mortesEstado').textContent = t('mortes.naMontagem', { hora: horaLocal(m.ms) });
    }
  });
  $('mortesNomesLista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acao="nome"]');
    const li = b?.closest('li[data-nome]');
    const canal = li?.querySelector('select')?.value;
    if (!li || !canal) return;
    const nome = li.dataset.nome;
    guardarApelidos(juntarApelidos(lerApelidos(), new Map([[canal, [nome]]])));
    refazer();
    $('mortesEstado').textContent = t('mortes.nomeGuardado', { nome, canal });
  });

  return {
    carregar, limpar, importar, abrirMorte, alinhar, guardar, acharMortes, sinaisMudaram,
    /** As marcas do mapa: Map canal -> [{ tipo: 'morte', ms, id, papel }]. */
    marcas: () => st.marcas,
    /** As mortes com o instante e os canais, para os melhores lances. */
    casadas: () => st.casadas,
    /** Repintar quando a lista de canais muda (Adicionar streamer, Adicionar lista). */
    refazer,
    estado: st,
  };
}
