// O evento inteiro no ecrã: o elenco, os quinhentos canais numa linha do tempo só, e o caminho até um
// lance visto de todos os ângulos.
//
// A página de antes era feita para uma noite de cinco amigos: escrevia-se o nome de cada um. Um evento
// de 500 streamers em times de 4 não cabe nisso, e não cabe numa grelha: o Squad Stream da Twitch, uma
// grelha de quatro, não passou de 1% dos streams e foi retirado porque quem assistia a achava confusa.
// Por isso o evento entra por outra porta. Primeiro vê-se QUANDO aconteceu alguma coisa e QUEM estava
// no ar (o mapa), e só depois se abre o lance, com o time de quem se escolheu e os ângulos que o som
// diz que estavam lá. A grelha, o alinhamento fino e o clipe continuam a ser os da página de sempre:
// este ficheiro só lhes entrega os canais certos e o instante certo.

import { lerElenco, codificar, descodificar, contar } from './elenco.js';
import { carregarCanais, procurarAoVivo } from './carregar.js';
import {
  montarMapa, linhasVisiveis, tempoDoX, xDoTempo, zoom, oQueEstaAqui, filtrar, pintarMapa,
} from './mapa.js';
import { procurarAngulos, ordenarCandidatos, resumo } from './cena.js';
import { lerMaster, lerPlaylist } from './kick.js';
import { linhaDoCanal } from './relogio.js';
import { somDoCanal } from './alinhar.js';
import { t } from './idiomas.js';
import { escapar } from './escapar.js';

// Um canal ao vivo tem na lista um VOD de duração zero que vai crescendo. Até se pedir a lista outra
// vez, o que ele já tem acaba "agora".
const AGORA = () => Date.now();

// Durante o jogo, a busca pelo som só vale para lances com pelo menos isto de idade. As regras do Rust
// Kick Off proíbem ver as lives de times rivais a meio do jogo; "quem ouviu o mesmo som que eu agora"
// diria a um jogador onde estão os rivais. O organizador escolhe outro valor no link (&atraso=<min>).
export const ATRASO_MIN = 15;

/** Se um lance ainda é recente demais para a busca pelo som. */
export function cedoDemais(ms, atrasoMin, agoraMs = Date.now()) {
  return Number.isFinite(ms) && ms > agoraMs - Math.max(0, atrasoMin) * 60_000;
}

const horaLocal = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Os intervalos em que cada canal tem vídeo, a partir das listas de VOD já lidas. */
export function coberturasDe(resultados, agoraMs = AGORA()) {
  const coberturas = new Map();
  for (const r of resultados) {
    if (r?.estado !== 'ok') continue;
    const lista = [];
    for (const v of r.vods) {
      if (!Number.isFinite(v.inicioApi)) continue;
      // Duração zero é a transmissão que está no ar. Sem isto, os canais ao vivo (os mais interessantes
      // durante o evento) apareciam sem nada no mapa.
      const fim = v.duracaoMs > 0 ? v.inicioApi + v.duracaoMs : agoraMs;
      if (fim > v.inicioApi) lista.push([v.inicioApi, fim]);
    }
    if (lista.length) coberturas.set(r.slug, lista.sort((a, b) => a[0] - b[0]));
  }
  return coberturas;
}

/** O time de cada canal, para o lance abrir com os colegas de quem se escolheu. */
export function indiceDeTimes(elenco) {
  const porCanal = new Map();
  for (const time of elenco?.times || []) for (const c of time.canais) porCanal.set(c, time.nome);
  return porCanal;
}

/**
 * O trecho do evento: à volta do instante em que mais canais estavam no ar, enquanto pelo menos metade
 * desse pico continuar no ar, com 15 minutos de folga de cada lado.
 *
 * Os VODs de um canal cobrem 7 a 30 dias. Medido com o Rust ao vivo de 06/10: aberto "tudo", o mapa
 * mostrava um mês e o evento era uma risca de poucos píxeis no fim. O evento é onde a maioria esteve
 * junta, e é aí que o mapa tem de abrir.
 */
export function trechoDoEvento(coberturas, { folgaMs = 15 * 60_000 } = {}) {
  const pontos = [];
  for (const lista of coberturas.values()) {
    for (const [de, ate] of lista) { pontos.push([de, 1]); pontos.push([ate, -1]); }
  }
  if (!pontos.length) return null;
  // Num empate, as saídas antes das entradas: um canal que acaba quando outro começa não conta como dois.
  pontos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0;
  let pico = 0;
  let iPico = 0;
  const contagem = [];
  for (const [i, [ms, d]] of pontos.entries()) {
    n += d;
    contagem.push(n);
    if (n > pico) { pico = n; iPico = i; }
  }
  const metade = Math.max(1, Math.ceil(pico / 2));
  let i0 = iPico;
  while (i0 > 0 && contagem[i0 - 1] >= metade) i0--;
  let i1 = iPico;
  while (i1 < pontos.length - 1 && contagem[i1] >= metade) i1++;
  return { deMs: pontos[i0][0] - folgaMs, ateMs: pontos[i1][0] + folgaMs };
}

/** Quem estava no ar num instante: só esses podem ter ouvido o lance. */
export function noArEm(coberturas, slug, ms) {
  return (coberturas.get(slug) || []).some(([de, ate]) => ms >= de && ms <= ate);
}

/**
 * Montar o evento sobre a página.
 *
 * `abrirLance(canais, ms, foco)` é da página de sempre: carrega aqueles canais, abre a noite onde está
 * `ms` e põe o vídeo nesse instante. `memorizarVods(resultados)` passa-lhe as listas de VOD já lidas,
 * para não as pedir à Kick outra vez quando o lance abre.
 */
export function montarEvento({ abrirLance, memorizarVods = () => {}, buscar = fetch } = {}) {
  const $ = (id) => document.getElementById(id);
  const ev = {
    elenco: null,
    resultados: [],
    coberturas: new Map(),
    times: [],
    abertos: new Set(),
    vista: null,
    limites: null,
    topo: 0,
    escolha: null,
    procura: null,
    achados: [],
    mapa: null,
    marcas: new Map(),
    cancelar: null,
    link: '',
    atrasoMin: ATRASO_MIN,
  };

  // ── abrir ──────────────────────────────────────────────────────────────

  async function abrirElenco(elenco, { quandoMs = null } = {}) {
    ev.cancelar?.abort();
    const controlo = new AbortController();
    ev.cancelar = controlo;
    ev.elenco = elenco;
    const todos = [...new Set([...elenco.times.flatMap((x) => x.canais), ...elenco.soltos])];
    if (!todos.length) { $('estadoEvento').textContent = t('evento.vazio'); return; }
    $('evento').hidden = false;
    $('nomeEvento').textContent = elenco.nome || t('evento.semNome');
    const { times, canais } = contar(elenco);
    $('resumoEvento').textContent = t('evento.aCarregar', { feitos: 0, total: canais });
    try {
      ev.resultados = await carregarCanais(todos, {
        buscar,
        sinal: controlo.signal,
        aoProgredir: ({ feitos, total }) => {
          $('resumoEvento').textContent = t('evento.aCarregar', { feitos, total });
        },
      });
    } catch (e) {
      if (e?.name === 'AbortError') return;
      $('resumoEvento').textContent = t('evento.erro');
      return;
    }
    memorizarVods(ev.resultados);
    pintarAvisos();
    ev.coberturas = coberturasDe(ev.resultados);
    const comVideo = ev.coberturas.size;
    const aoVivo = ev.resultados.filter((r) => r.estado === 'ok' && r.vods.some((v) => !(v.duracaoMs > 0))).length;
    $('resumoEvento').textContent = t('evento.resumo', { times, canais, comVideo, aoVivo });
    $('seloAoVivo').hidden = aoVivo === 0;
    ev.times = [...elenco.times];
    if (elenco.soltos.length) ev.times.push({ nome: null, canais: elenco.soltos });
    // Os times começam fechados quando são muitos: 125 times abertos são 500 faixas e ninguém acha
    // nada. Com poucos, abertos, porque aí ver toda a gente é o que se quer.
    ev.abertos = new Set(ev.times.length <= 12 ? ev.times.map((x) => x.nome) : []);
    remontar();
    ev.limites = { deMs: ev.mapa.inicioMs, ateMs: ev.mapa.fimMs };
    const trecho = trechoDoEvento(ev.coberturas);
    ev.vista = trecho
      ? { deMs: Math.max(ev.limites.deMs, trecho.deMs), ateMs: Math.min(ev.limites.ateMs, trecho.ateMs) }
      : { ...ev.limites };
    if (Number.isFinite(quandoMs)) ev.vista = zoom(ev.vista, quandoMs, 0.1, ev.limites);
    ev.link = await codificar(elenco);
    pintar();
    $('mapaRolo').focus({ preventScroll: true });
  }

  // Quem não carregou, agrupado pelo motivo. Num elenco de 500 há sempre um nome mal escrito, e uma
  // faixa vazia sem explicação parece um streamer que não transmitiu.
  function pintarAvisos() {
    const motivos = {
      'canal-nao-existe': t('estado.canalNaoExiste'), 'nome-invalido': t('estado.nomeInvalido'),
      'sem-vods': t('estado.semVods'), 'vods-indisponiveis': t('estado.vodsIndisponiveis'),
      'rate-limit': t('estado.rateLimit'), 'sem-rede': t('estado.semRede'),
    };
    const porMotivo = new Map();
    for (const r of ev.resultados) {
      if (!r || r.estado === 'ok') continue;
      const m = motivos[r.estado] || r.estado;
      if (!porMotivo.has(m)) porMotivo.set(m, []);
      porMotivo.get(m).push(r.slug);
    }
    const aviso = $('avisosEvento');
    aviso.hidden = porMotivo.size === 0;
    aviso.textContent = [...porMotivo].map(([m, slugs]) => `${slugs.slice(0, 12).join(', ')}`
      + `${slugs.length > 12 ? ` +${slugs.length - 12}` : ''}: ${m}`).join(' · ');
  }

  async function abrirDoTexto() {
    const elenco = lerElenco($('elenco').value);
    if (elenco.avisos.length) $('estadoEvento').textContent = elenco.avisos.slice(0, 3).join(' · ');
    if (!elenco.times.length && !elenco.soltos.length) {
      $('estadoEvento').textContent = t('evento.semCanais');
      return;
    }
    await abrirElenco(elenco);
  }

  async function procurarParticipantes() {
    const palavras = $('palavrasAoVivo').value.trim().split(/\s+/).filter(Boolean);
    $('estadoEvento').textContent = t('evento.aProcurar');
    let achados = [];
    try {
      achados = await procurarAoVivo({ palavras, buscar });
    } catch (e) {
      // A lista ao vivo vem às páginas; se uma falha a meio, o que já veio serve, mas tem de se dizer
      // que está incompleto.
      if (!e?.parcial?.length) { $('estadoEvento').textContent = t('evento.erro'); return; }
      achados = e.parcial;
      $('elenco').value = achados.map((a) => a.slug).join('\n');
      $('estadoEvento').textContent = t('evento.achadosParcial', { n: achados.length });
      return;
    }
    if (!achados.length) { $('estadoEvento').textContent = t('evento.ninguemAoVivo'); return; }
    // Vão para a caixa do elenco, e não direto para o mapa: quem procurou por palavra quase sempre
    // apanha um ou outro que não é do evento, e tem de poder tirá-los antes.
    $('elenco').value = achados.map((a) => a.slug).join('\n');
    $('estadoEvento').textContent = t('evento.achadosAoVivo', { n: achados.length });
  }

  // Um evento de exemplo feito na hora: os canais de Rust mais vistos que estão no ar agora, sem time.
  // Abre direto no mapa, para quem chega sem elenco perceber em segundos o que a página faz.
  const EXEMPLO_CANAIS = 24;
  async function abrirExemplo() {
    $('estadoEvento').textContent = t('evento.aProcurar');
    let achados = [];
    try {
      achados = await procurarAoVivo({ palavras: [], buscar, maxPaginas: 1 });
    } catch (e) {
      achados = e?.parcial || [];
    }
    if (!achados.length) { $('estadoEvento').textContent = t('evento.semExemplo'); return; }
    $('estadoEvento').textContent = '';
    const soltos = achados.slice(0, EXEMPLO_CANAIS).map((a) => a.slug);
    await abrirElenco({ nome: t('evento.exemploNome'), times: [], soltos, avisos: [] });
  }

  // ── o mapa ─────────────────────────────────────────────────────────────

  function remontar() {
    const texto = $('procurarEvento').value.trim();
    const times = texto ? filtrar(ev.times, texto) : ev.times;
    // A procurar, tudo aberto: quem escreveu um nome quer ver a faixa dele, e não um time fechado.
    const abertos = texto ? new Set(times.map((x) => x.nome)) : ev.abertos;
    ev.mapa = montarMapa({ times, coberturas: ev.coberturas, abertos });
    // A caixa tem a altura do conteúdo, até 62% do ecrã; daí para cima rola.
    const rolo = $('mapaRolo');
    const teto = Math.max(160, Math.round(window.innerHeight * ($('evento').classList.contains('comMapa') ? 0.34 : 0.62)));
    rolo.style.height = `${Math.min(teto, ev.mapa.altura + 2)}px`;
    // O espaçador é o resto da altura: o canvas por cima dele já ocupa a altura do que se vê.
    $('mapaAltura').style.height = `${Math.max(0, ev.mapa.altura - rolo.clientHeight)}px`;
  }

  let pedido = 0;
  function pintar() {
    cancelAnimationFrame(pedido);
    pedido = requestAnimationFrame(() => {
      if (!ev.mapa || !ev.vista) return;
      const tela = $('mapa');
      const rolo = $('mapaRolo');
      const largura = rolo.clientWidth;
      const altura = rolo.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (tela.width !== Math.round(largura * dpr) || tela.height !== Math.round(altura * dpr)) {
        tela.width = Math.round(largura * dpr);
        tela.height = Math.round(altura * dpr);
        tela.style.width = `${largura}px`;
        tela.style.height = `${altura}px`;
      }
      const ctx = tela.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, largura, altura);
      pintarMapa(ctx, ev.mapa, {
        topo: ev.topo,
        altura,
        largura,
        vista: ev.vista,
        agoraMs: ev.escolha?.ms ?? null,
        marcas: ev.marcas,
        escolhido: ev.escolha?.canal ?? null,
        cores: coresDoTema(),
        semTime: t('evento.semTime'),
      });
      pintarRegua();
    });
  }

  function coresDoTema() {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    return {
      fundo: v('--sup-0'), faixa: v('--sup-1'), time: v('--sup-2'), linha: v('--linha'),
      texto: v('--tinta'), texto2: v('--tinta-2'), cobertura: v('--acento'), marca: v('--marca'),
    };
  }

  function pintarRegua() {
    const regua = $('reguaEvento');
    if (!regua || !ev.vista) return;
    const largura = $('mapaRolo').clientWidth;
    const span = ev.vista.ateMs - ev.vista.deMs;
    // As pontas ficam de fora: um rótulo centrado no x=0 saía metade para fora da caixa.
    const margem = 24;
    // Um traço a cada passo "redondo" que dê uns 6 a 10 rótulos na largura do ecrã.
    const DIA = 86400e3;
    const passos = [60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3, 12 * 3600e3, DIA, 2 * DIA, 7 * DIA];
    const passo = passos.find((p) => span / p <= 10) || passos.at(-1);
    // Em passos de dia o rótulo é a data; nos outros é a hora, e a data aparece à meia-noite.
    const rotulo = (ms) => {
      const d = new Date(ms);
      const data = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
      if (passo >= DIA) return data;
      const hora = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return d.getHours() === 0 && d.getMinutes() === 0 && span > DIA / 2 ? `${data} ${hora}` : hora;
    };
    let html = '';
    for (let ms = Math.ceil(ev.vista.deMs / passo) * passo; ms <= ev.vista.ateMs; ms += passo) {
      const x = xDoTempo(ms, ev.vista, largura);
      if (x < margem || x > largura - margem) continue;
      html += `<span style="left:${x}px">${rotulo(ms)}</span>`;
    }
    regua.innerHTML = html;
  }

  function aquiDe(evento) {
    const rolo = $('mapaRolo');
    const caixa = rolo.getBoundingClientRect();
    return oQueEstaAqui(ev.mapa, {
      x: evento.clientX - caixa.left,
      y: evento.clientY - caixa.top,
      topo: ev.topo,
      vista: ev.vista,
      largura: rolo.clientWidth,
    });
  }

  function escolher(alvo) {
    if (!alvo) return;
    if (alvo.tipo === 'time' || alvo.tipo === 'resumo') {
      if (ev.abertos.has(alvo.time)) ev.abertos.delete(alvo.time);
      else ev.abertos.add(alvo.time);
      remontar();
      pintar();
      return;
    }
    ev.escolha = { canal: alvo.canal, ms: alvo.ms, time: alvo.time };
    ev.procura?.abort();
    ev.achados = [];
    pintarLance();
    pintar();
  }

  // ── o lance ────────────────────────────────────────────────────────────

  function colegas(canal) {
    const time = indiceDeTimes(ev.elenco).get(canal);
    if (time == null) return [canal];
    const doTime = ev.elenco.times.find((x) => x.nome === time)?.canais || [canal];
    return [canal, ...doTime.filter((c) => c !== canal)];
  }

  function pintarLance() {
    const e = ev.escolha;
    $('lance').hidden = !e;
    if (!e) return;
    const time = indiceDeTimes(ev.elenco).get(e.canal);
    const noAr = colegas(e.canal).filter((c) => noArEm(ev.coberturas, c, e.ms));
    $('lanceTitulo').textContent = `${e.canal} · ${horaLocal(e.ms)}`;
    $('lanceTime').textContent = time != null
      ? t('lance.time', { time, n: noAr.length })
      : t('lance.semTime');
    const r = resumo(ev.achados);
    // Os "talvez" também aparecem, marcados: ficaram entre 5 e 6 de força sem segunda janela para
    // decidir (ao vivo, o trecho seguinte ainda não estava gravado). Quem olha decide.
    $('lanceAchados').innerHTML = [
      ...r.estava.map((a) => `<li><b>${escapar(a.canal)}</b><span class="nota">${t('lance.forca', { f: a.forca.toFixed(1) })}</span></li>`),
      ...r.talvez.map((a) => `<li class="talvez"><b>${escapar(a.canal)}</b><span class="nota">${t('lance.talvez')}</span></li>`),
    ].join('');
    $('verLance').disabled = !noArEm(ev.coberturas, e.canal, e.ms);
  }

  async function verLance() {
    const e = ev.escolha;
    if (!e) return;
    const outros = resumo(ev.achados).estava.map((a) => a.canal);
    const canais = [...new Set([...colegas(e.canal), ...outros])].filter((c) => noArEm(ev.coberturas, c, e.ms));
    mostrarMapa(false);
    await abrirLance(canais, e.ms, e.canal);
  }

  // O som de um canal num instante, lendo só o VOD que cobre esse instante. As playlists ficam
  // guardadas: procurar o lance seguinte não as volta a pedir.
  const pecas = new Map();
  async function somDe(slug, deMs, duracaoS) {
    const r = ev.resultados.find((x) => x.slug === slug);
    const vod = r?.vods.find((v) => deMs >= v.inicioApi - 60_000
      && deMs <= (v.duracaoMs > 0 ? v.inicioApi + v.duracaoMs : AGORA()));
    if (!vod) return null;
    // Um VOD ao vivo cresce: a playlist lida há minutos não tem o lance de agora.
    const chave = vod.duracaoMs > 0 ? vod.id : `${vod.id}@${Math.floor(deMs / 30_000)}`;
    let peca = pecas.get(chave);
    if (!peca) {
      const master = lerMaster(await (await buscar(vod.master)).text(), vod.master);
      if (!master.length) return null;
      const barato = master.at(-1);
      const playlist = lerPlaylist(await (await buscar(barato.url)).text(), barato.url);
      peca = { vod, playlist, escada: master, barato };
      pecas.set(chave, peca);
    }
    const linha = { ...linhaDoCanal(slug, [peca]), pecasCompletas: [peca] };
    return somDoCanal(linha, deMs, duracaoS, { buscar });
  }

  async function procurarOutros() {
    const e = ev.escolha;
    if (!e) return;
    if (cedoDemais(e.ms, ev.atrasoMin)) {
      $('estadoLance').textContent = t('lance.cedoDemais', { min: ev.atrasoMin });
      return;
    }
    ev.procura?.abort();
    const controlo = new AbortController();
    ev.procura = controlo;
    ev.achados = [];
    const times = indiceDeTimes(ev.elenco);
    const todos = ev.resultados.filter((r) => r.estado === 'ok').map((r) => r.slug);
    const candidatos = ordenarCandidatos({
      referencia: e.canal,
      canais: todos,
      timeDe: (c) => times.get(c) ?? null,
      noAr: (c) => noArEm(ev.coberturas, c, e.ms),
    });
    const total = candidatos.length;
    let feitos = 0;
    $('estadoLance').textContent = t('lance.aOuvir', { feitos, total });
    $('procurarOutros').disabled = true;
    try {
      for await (const r of procurarAngulos({
        quandoMs: e.ms, referencia: e.canal, candidatos, somDe, sinal: controlo.signal,
      })) {
        feitos++;
        ev.achados.push(r);
        $('estadoLance').textContent = t('lance.aOuvir', { feitos, total });
        pintarLance();
      }
      const r = resumo(ev.achados);
      $('estadoLance').textContent = t('lance.fim', { n: r.estava.length, total });
    } catch (erro) {
      if (erro?.name === 'AbortError') return;
      // Os dois erros que não melhoram de canal para canal têm frase própria: sem descodificador de
      // áudio nenhum canal vai dar, e sem som na referência o problema é o canal escolhido.
      $('estadoLance').textContent = erro?.name === 'SEM-DESCODIFICADOR' ? t('lance.semDescodificador')
        : erro?.name === 'REFERENCIA-SEM-SOM' ? t('lance.referenciaSemSom', { canal: e.canal })
          : t('lance.erroSom');
    } finally {
      $('procurarOutros').disabled = false;
    }
  }

  // ── com um lance aberto ────────────────────────────────────────────────

  // Com a grelha do lance no ecrã o mapa encolhe numa barra (ver estilo.css); este botão volta a
  // abri-lo por cima dela, para escolher o lance seguinte sem perder o que está a tocar.
  function mostrarMapa(sim) {
    $('evento').classList.toggle('comMapa', sim);
    $('mostrarMapa').setAttribute('aria-expanded', String(sim));
    $('mostrarMapa').textContent = t(sim ? 'evento.esconderMapa' : 'evento.mostrarMapa');
    if (sim) { remontar(); pintar(); }
  }

  function fecharEvento() {
    ev.cancelar?.abort();
    ev.procura?.abort();
    ev.elenco = null;
    ev.escolha = null;
    ev.achados = [];
    $('evento').hidden = true;
    $('lance').hidden = true;
    $('avisosEvento').hidden = true;
    mostrarMapa(false);
    if (/[#&]evento=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }

  // ── ligações ───────────────────────────────────────────────────────────

  function ligar() {
    $('abrirElenco').onclick = abrirDoTexto;
    $('procurarAoVivo').onclick = procurarParticipantes;
    $('exemploAoVivo').onclick = abrirExemplo;
    $('procurarEvento').oninput = () => { remontar(); pintar(); };
    $('mapaRolo').onscroll = () => { ev.topo = $('mapaRolo').scrollTop; pintar(); };
    $('mapaRolo').onclick = (e) => escolher(aquiDe(e));
    $('mapaRolo').onmousemove = (e) => {
      const alvo = aquiDe(e);
      $('mapaRolo').title = alvo?.canal ? `${alvo.canal} · ${horaLocal(alvo.ms)}` : (alvo?.time ?? '');
    };
    // Roda do rato com Ctrl (ou o gesto de pinça do touchpad, que chega como Ctrl+roda) aproxima o
    // tempo à volta do ponteiro; sem Ctrl a roda rola as faixas, que é o que toda a gente espera dela.
    $('mapaRolo').addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.altKey) return;
      e.preventDefault();
      const caixa = $('mapaRolo').getBoundingClientRect();
      const centro = tempoDoX(e.clientX - caixa.left, ev.vista, $('mapaRolo').clientWidth);
      ev.vista = zoom(ev.vista, centro, e.deltaY > 0 ? 1.25 : 0.8, ev.limites);
      pintar();
    }, { passive: false });
    $('aproximar').onclick = () => {
      const centro = ev.escolha?.ms ?? (ev.vista.deMs + ev.vista.ateMs) / 2;
      ev.vista = zoom(ev.vista, centro, 0.5, ev.limites);
      pintar();
    };
    $('afastar').onclick = () => {
      const centro = ev.escolha?.ms ?? (ev.vista.deMs + ev.vista.ateMs) / 2;
      ev.vista = zoom(ev.vista, centro, 2, ev.limites);
      pintar();
    };
    $('verTudo').onclick = () => { ev.vista = { ...ev.limites }; pintar(); };
    $('verLance').onclick = verLance;
    $('mostrarMapa').onclick = () => mostrarMapa(!$('evento').classList.contains('comMapa'));
    $('fecharEvento').onclick = fecharEvento;
    $('procurarOutros').onclick = procurarOutros;
    $('partilharEvento').onclick = async () => {
      const url = `${location.origin}${location.pathname}#evento=${ev.link}`
        + (ev.escolha ? `&t=${Math.round(ev.escolha.ms)}` : '')
        + (ev.atrasoMin !== ATRASO_MIN ? `&atraso=${ev.atrasoMin}` : '');
      try {
        await navigator.clipboard.writeText(url);
        $('estadoPartilhaEvento').textContent = t('evento.linkCopiado');
      } catch {
        $('estadoPartilhaEvento').textContent = url;
      }
    };
    window.addEventListener('resize', () => { if (ev.mapa) remontar(); pintar(); });
  }

  /** Abrir um evento que veio num link (#evento=...&t=...). Devolve true se havia um. */
  async function abrirDoLink(hash = location.hash) {
    const m = /[#&]evento=([^&]+)/.exec(hash);
    if (!m) return false;
    const elenco = await descodificar(m[1]);
    if (!elenco) { $('estadoEvento').textContent = t('evento.linkEstragado'); return false; }
    const tq = /[&#]t=(\d+)/.exec(hash);
    const aq = /[&#]atraso=(\d+)/.exec(hash);
    ev.atrasoMin = aq ? Number(aq[1]) : ATRASO_MIN;
    $('elenco').value = '';
    await abrirElenco(elenco, { quandoMs: tq ? Number(tq[1]) : null });
    if (tq) {
      const ms = Number(tq[1]);
      const primeiro = ev.elenco.times[0]?.canais.find((c) => noArEm(ev.coberturas, c, ms));
      if (primeiro) escolher({ tipo: 'canal', canal: primeiro, ms, time: ev.elenco.times[0].nome });
    }
    return true;
  }

  ligar();
  return { abrirElenco, abrirDoTexto, abrirDoLink, estado: ev };
}
