// "Importar mortes" no evento (IDEIAS.md, item 1): o texto do servidor vira marcas no mapa, na faixa de
// quem matou e na de quem morreu, entra nos melhores lances e, a pedido, na montagem.
//
// A conta (ler, pôr as horas, casar os nomes) está em mortes.js. Aqui fica a janela de colar, a lista,
// o fuso das horas, o alinhamento com uma morte vista e os nomes do jogo sem canal. As mortes ficam só
// neste aparelho, por evento, como os lances marcados e descartados; as que vão para a montagem viajam
// no link do projeto com as outras kills.

import { t, tn } from './idiomas.js';
import { escapar } from './escapar.js';
import {
  lerMortes, horasDasMortes, casarMortes, nomesSemCanal, marcasDasMortes, juntarMortes, mortesParaGuardar,
  mortesGuardadas, fusoDoAparelho,
} from './mortes.js';
import { lerApelidos, guardarApelidos, juntarApelidos } from './nomes.js';

const GUARDADO = 'povix.mortes';
const MAX_EVENTOS = 30;
const MAX_NAO_LIDAS = 300;
const ARQUIVO_MAX = 10 * 1024 * 1024;
// Quanto antes da morte os vídeos abrem: a mesma folga dos melhores lances.
export const ANTES_MS = 10_000;
// Os fusos da lista: as horas inteiras e as meias horas que existem.
const FUSOS = [...Array.from({ length: 27 }, (_, i) => (i - 12) * 60), -570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765, 825]
  .sort((a, b) => a - b);

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
 */
export function montarMortes({
  canais, chave, refMs, fora = () => false, noAr = () => true, abrir, marcar = () => {}, agoraDoVideo = () => null,
  aoMudar = () => {}, dialogo = { mostrar: (m) => { m.hidden = false; }, esconder: (m) => { m.hidden = true; } },
}) {
  const $ = (id) => document.getElementById(id);
  const st = {
    lista: [], fuso: 'aparelho', ajusteMs: 0, naoLidas: [],
    casadas: [], porId: new Map(), marcas: new Map(), aberta: null, apagar: false,
  };

  const fusoMin = () => {
    const ref = refMs() ?? Date.now();
    return st.fuso === 'aparelho' ? fusoDoAparelho(ref) : st.fuso;
  };

  /** Refazer as horas, os canais e as marcas, e avisar o resto da página. */
  function refazer() {
    const ref = refMs();
    const comHoras = Number.isFinite(ref) ? horasDasMortes(st.lista, { fusoMin: fusoMin(), refMs: ref, ajusteMs: st.ajusteMs }) : [];
    st.casadas = casarMortes(comHoras, canais(), lerApelidos());
    st.porId = new Map(st.casadas.map((m) => [m.id, m]));
    st.marcas = marcasDasMortes(st.casadas, { fora });
    if (st.aberta != null && !st.porId.has(st.aberta)) st.aberta = null;
    pintar();
    aoMudar();
  }

  function guardar() {
    const tudo = lerTudo();
    const k = chave();
    if (!st.lista.length) delete tudo[k];
    else {
      tudo[k] = {
        l: mortesParaGuardar(st.lista), f: st.fuso, a: st.ajusteMs, n: st.naoLidas.slice(0, MAX_NAO_LIDAS), q: Date.now(),
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
    st.aberta = null;
    st.apagar = false;
    $('mortesEstado').textContent = '';
    refazer();
  }

  function limpar() {
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
      $('mortesEstado').textContent = t('mortes.ninguemNoAr', { matador: m.matador, vitima: m.vitima, hora: horaLocal(m.ms) });
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

  // ── pintar ─────────────────────────────────────────────────────────────

  function textoDa(m) {
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
    $('mortes').hidden = !tem && !st.naoLidas.length;
    $('legendaMorte').hidden = ![...st.marcas.values()].some((l) => l.length);
    pintarAberta();
    if ($('mortes').hidden) return;
    $('mortesConta').textContent = tem ? String(st.lista.length) : '';
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
    $('mortesNomesLista').innerHTML = soltos.map((s, i) => `<li data-nome="${escapar(s.nome)}"><b id="mortesNome${i}">${escapar(s.nome)}</b>`
      + `<span class="nota">${escapar(tn(s.vezes, 'mortes.vezUma', 'mortes.vezes'))}</span>`
      + `<select aria-labelledby="mortesNome${i}">${opcoes}</select>`
      + `<button type="button" data-acao="nome">${escapar(t('mortes.guardarNome'))}</button></li>`).join('');
    $('mortesNaoLidas').hidden = !st.naoLidas.length;
    $('mortesNaoLidasTitulo').textContent = t('mortes.naoLidas', { n: st.naoLidas.length });
    $('mortesNaoLidasLista').innerHTML = st.naoLidas.map(linhaNaoLida).join('');
    const ordem = [...st.casadas].sort((a, b) => a.ms - b.ms);
    const semCanal = ` <span class="semCanal">(${escapar(t('mortes.semCanal'))})</span>`;
    $('mortesLista').innerHTML = ordem.map((m) => {
      const quem = escapar(textoDa(m)) + (!m.canalMatador || !m.canalVitima ? semCanal : '');
      const angulos = [...new Set([m.canalMatador, m.canalVitima].filter(Boolean))];
      return `<li class="morte${m.id === st.aberta ? ' aberta' : ''}" data-id="${m.id}">`
        + `<p class="morteHora">${escapar(horaLocal(m.ms))}${m.soMinuto ? `<small>${escapar(t('mortes.soMinuto'))}</small>` : ''}</p>`
        + `<p class="morteQuem">${quem}</p>`
        + '<div class="morteAcoes">'
        + `<button type="button" class="principal" data-acao="abrir"${angulos.length ? '' : ' disabled'} title="${escapar(t('mortes.abrirAjuda', { canais: angulos.join(', ') }))}">`
        + `<svg class="ic ic-p" aria-hidden="true"><use href="#i-seta"/></svg><span>${escapar(t('mortes.abrir'))}</span></button>`
        + `<button type="button" data-acao="agora" title="${escapar(t('mortes.agoraAjuda'))}">${escapar(t('mortes.agora'))}</button>`
        + `<button type="button" data-acao="montagem"${angulos.length ? '' : ' disabled'} title="${escapar(t('mortes.montagemAjuda'))}">`
        + `<svg class="ic ic-p" aria-hidden="true"><use href="#i-marcador"/></svg><span>${escapar(t('mortes.montagem'))}</span></button>`
        + '</div></li>';
    }).join('');
  }

  // ── ligações ───────────────────────────────────────────────────────────

  $('importarMortes').onclick = abrirJanela;
  $('mortesMais').onclick = abrirJanela;
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
    carregar, limpar, importar, abrirMorte, alinhar, guardar,
    /** As marcas do mapa: Map canal -> [{ tipo: 'morte', ms, id, papel }]. */
    marcas: () => st.marcas,
    /** As mortes com o instante e os canais, para os melhores lances. */
    casadas: () => st.casadas,
    /** Repintar quando a lista de canais muda (Adicionar streamer, Adicionar lista). */
    refazer,
    estado: st,
  };
}
