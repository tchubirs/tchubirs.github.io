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

import { lerElenco, codificar, descodificar, contar, paraTexto } from './elenco.js';
import { carregarCanais, procurarAoVivo } from './carregar.js';
import {
  montarMapa, linhasVisiveis, tempoDoX, xDoTempo, zoom, oQueEstaAqui, filtrar, pintarMapa,
} from './mapa.js';
import { procurarAngulos, ordenarCandidatos, resumo } from './cena.js';
import { lerMaster, lerPlaylist } from './kick.js';
import { linhaDoCanal } from './relogio.js';
import { somDoCanal } from './alinhar.js';
import { t, tn, idiomaActual } from './idiomas.js';
import { escapar } from './escapar.js';
import { idDoCanal, mensagensEntre, calor, picos, segundoDoPico } from './chat.js';
import { agendar } from './aovivo.js';

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

const dataCurta = (ms) => new Date(ms).toLocaleDateString([], { day: '2-digit', month: '2-digit' });
// Ecrã de toque e ecrã estreito: decidem a altura das faixas, a folga de um toque e onde fica o lance.
const tocar = () => window.matchMedia?.('(pointer: coarse)').matches === true;
const estreito = () => window.matchMedia?.('(max-width: 999px)').matches === true;
const semMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const horaLocal = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
// Sem segundos: um pico de chat é um minuto inteiro, e os segundos dele eram sempre ":30".
const horaCurta = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Um VOD que ainda está a ser gravado: a Kick marca-o com `is_live` e duração 0 (medido em 06/10). */
const aoVivoVod = (v) => v.aoVivo === true || v.duracaoMs === 0;

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
      // Uma duração desconhecida não é "ao vivo": só a marca da Kick (ou a duração 0) o diz.
      const fim = aoVivoVod(v) ? agoraMs : v.duracaoMs > 0 ? v.inicioApi + v.duracaoMs : NaN;
      if (Number.isFinite(fim) && fim > v.inicioApi) lista.push([v.inicioApi, fim]);
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
 * para não as pedir à Kick outra vez quando o lance abre. `aoMudarPicos()` avisa que chegaram picos de
 * chat, para a linha do tempo da live os mostrar.
 */
export function montarEvento({ abrirLance, memorizarVods = () => {}, aoMudarPicos = () => {}, buscar = fetch } = {}) {
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
    // As mensagens lidas para achar os picos, por canal: o chat ao lado do vídeo mostra-as no tempo certo.
    mensagens: new Map(),
    cancelar: null,
    link: '',
    atrasoMin: ATRASO_MIN,
    // Times que se juntaram ao lance (um raid tem dois), e os ângulos a mais que vieram num link.
    juntados: new Set(),
    extrasDoLink: [],
    trecho: null,
    feitos: 0,
    // Os canais que a Kick não conhece: o mapa pinta o nome deles a vermelho.
    falhados: new Set(),
    // Onde está o teclado no mapa: a linha `i` de ev.mapa.linhas e o instante `ms`.
    cursor: null,
  };

  // ── abrir ──────────────────────────────────────────────────────────────

  async function abrirElenco(elenco, { quandoMs = null } = {}) {
    ev.cancelar?.abort();
    const controlo = new AbortController();
    ev.cancelar = controlo;
    ev.elenco = elenco;
    ev.juntados = new Set();
    ev.extrasDoLink = [];
    ev.escolha = null;
    ev.cursor = null;
    ev.falhados = new Set();
    $('lance').hidden = true;
    $('picosChat').innerHTML = '';
    const todos = [...new Set([...elenco.times.flatMap((x) => x.canais), ...elenco.soltos])];
    if (!todos.length) { $('estadoEvento').textContent = t('evento.vazio'); return; }
    $('evento').hidden = false;
    $('nomeEvento').textContent = elenco.nome || t('evento.semNome');
    const { canais } = contar(elenco);
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
    const aoVivo = pintarResumo();
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
    ev.trecho = { ...ev.vista };
    if (Number.isFinite(quandoMs)) ev.vista = zoom(ev.vista, quandoMs, 0.1, ev.limites);
    ev.link = await codificar(elenco);
    lembrarEvento();
    $('partilharEventoTexto').textContent = t('evento.partilharEvento');
    pintar();
    seguirAoVivo(aoVivo > 0);
    procurarNovatos();
    $('mapaRolo').focus({ preventScroll: true });
  }

  // Quem não carregou, agrupado pelo motivo. Num elenco de 500 há sempre um nome mal escrito, e uma
  // faixa vazia sem explicação parece um streamer que não transmitiu. Os nomes que não existem têm um
  // botão para voltar ao elenco com o primeiro deles já selecionado.
  const RUINS = ['canal-nao-existe', 'nome-invalido'];
  function pintarAvisos() {
    const motivos = {
      'nome-invalido': t('estado.nomeInvalido'),
      'sem-vods': t('estado.semVods'), 'vods-indisponiveis': t('estado.vodsIndisponiveis'),
      'rate-limit': t('estado.rateLimit'), 'sem-rede': t('estado.semRede'),
    };
    const nomes = (slugs) => slugs.slice(0, 12).join(', ') + (slugs.length > 12 ? ` +${slugs.length - 12}` : '');
    const naoExistem = [];
    const porMotivo = new Map();
    for (const r of ev.resultados) {
      if (!r || r.estado === 'ok') continue;
      if (r.estado === 'canal-nao-existe') { naoExistem.push(r.slug); continue; }
      const m = motivos[r.estado] || r.estado;
      if (!porMotivo.has(m)) porMotivo.set(m, []);
      porMotivo.get(m).push(r.slug);
    }
    const partes = [];
    if (naoExistem.length) {
      partes.push(tn(naoExistem.length, 'evento.naoExisteUm', 'evento.naoExistem', { nomes: nomes(naoExistem) }));
    }
    for (const [m, slugs] of porMotivo) partes.push(`${nomes(slugs)}: ${m}`);
    $('avisosEvento').hidden = !partes.length;
    $('avisosTexto').textContent = partes.join('; ');
    ev.falhados = new Set(ev.resultados.filter((r) => r && RUINS.includes(r.estado)).map((r) => r.slug));
    $('corrigirElenco').hidden = !ev.falhados.size;
  }

  function corrigirElenco() {
    const ruins = ev.resultados.filter((r) => r && RUINS.includes(r.estado)).map((r) => r.slug);
    const texto = paraTexto(ev.elenco);
    fecharEvento();
    $('elenco').value = texto;
    $('elenco').focus();
    const i = ruins.length ? texto.indexOf(ruins[0]) : -1;
    if (i >= 0) $('elenco').setSelectionRange(i, i + ruins[0].length);
  }

  // Colar a página de times: o que interessa está nos links (kick.com/<canal>), e o texto visível só
  // traz os nomes de exibição. Quando o que se cola tem HTML com links da Kick, lê-se o HTML.
  function colarPagina(e) {
    const html = e.clipboardData?.getData('text/html') || '';
    if (!/kick\.com\//i.test(html)) return;
    e.preventDefault();
    const elenco = lerElenco(html);
    if (!elenco.times.length && !elenco.soltos.length) { $('estadoEvento').textContent = t('evento.semCanais'); return; }
    $('elenco').value = paraTexto(elenco);
    const { times, canais } = contar(elenco);
    $('estadoEvento').textContent = t('evento.paginaColada', { times, canais })
      + (elenco.avisos.length ? ` ${elenco.avisos.slice(0, 3).join('; ')}` : '');
  }

  async function abrirDoTexto() {
    const elenco = lerElenco($('elenco').value);
    if (elenco.avisos.length) $('estadoEvento').textContent = elenco.avisos.slice(0, 3).join('; ');
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
    // Parou no limite de páginas com a Kick a dizer que havia mais: quem tem poucos espectadores
    // pode não estar aqui, e isso tem de se dizer.
    $('estadoEvento').textContent = t(achados.incompleto ? 'evento.achadosCortados' : 'evento.achadosAoVivo', { n: achados.length });
    // O próximo passo é o Abrir, que ficou lá em cima: o botão diz quantos abre e recebe o foco.
    $('abrirElencoTexto').textContent = t('evento.abrirN', { n: achados.length });
    $('elenco').scrollIntoView({ block: 'nearest' });
    $('abrirElenco').focus();
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
    await abrirElenco({ nome: t('evento.exemploNome', { n: soltos.length }), times: [], soltos, avisos: [] });
  }

  // ── o mapa ─────────────────────────────────────────────────────────────

  function remontar() {
    const texto = $('procurarEvento').value.trim();
    const times = texto ? filtrar(ev.times, texto) : ev.times;
    // A procurar, tudo aberto: quem escreveu um nome quer ver a faixa dele, e não um time fechado.
    const abertos = texto ? new Set(times.map((x) => x.nome)) : ev.abertos;
    // Num ecrã de toque as faixas crescem para um dedo (36 px em vez de 20).
    const alturas = tocar() ? { canal: 36, time: 40, resumo: 36 } : undefined;
    ev.mapa = montarMapa({ times, coberturas: ev.coberturas, abertos, alturas });
    // A caixa tem a altura do conteúdo, até 62% do ecrã (45% num ecrã estreito, para o lance caber por
    // baixo); daí para cima rola.
    const rolo = $('mapaRolo');
    const fracao = $('evento').classList.contains('comMapa') ? 0.34 : estreito() ? 0.45 : 0.62;
    const teto = Math.max(160, Math.round(window.innerHeight * fracao));
    rolo.style.height = `${Math.min(teto, ev.mapa.altura + 2)}px`;
    // O espaçador é o resto da altura: o canvas por cima dele já ocupa a altura do que se vê.
    $('mapaAltura').style.height = `${Math.max(0, ev.mapa.altura - rolo.clientHeight)}px`;
  }

  let pedido = 0;
  // O trecho que está à vista, em palavras: com o zoom e o arrasto, sem isto não se sabia onde se estava.
  function pintarTrecho() {
    const v = ev.vista;
    if (!v) { $('trechoVisto').textContent = ''; return; }
    const outroDia = dataCurta(v.deMs) !== dataCurta(v.ateMs);
    const ponta = (ms) => (outroDia ? `${dataCurta(ms)} ${horaCurta(ms)}` : horaCurta(ms));
    const min = Math.round((v.ateMs - v.deMs) / 60_000);
    const dur = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
    $('trechoVisto').textContent = t('evento.trecho', { de: ponta(v.deMs), ate: ponta(v.ateMs), dur });
  }

  function pintar() {
    pintarTrecho();
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
        // Quem o lance vai abrir fica com uma risca: é o que muda ao juntar um time ou achar pelo som.
        realcados: ev.escolha ? new Set(canaisDoLance(ev.escolha)) : null,
        falhados: ev.falhados,
        naoAchado: t('evento.naoAchado'),
        cursor: ev.cursor && rolo.matches(':focus-visible') ? ev.cursor : null,
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
      perigo: v('--perigo'), escolha: v('--acento-eco'),
      marcas: { chat: v('--marca') },
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
    // Quantos rótulos cabem: um a cada 70 px. Dez fixos embaralhavam a régua num telemóvel.
    const cabem = Math.max(2, Math.floor(largura / 70));
    const passo = passos.find((p) => span / p <= cabem) || passos.at(-1);
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
      // Um clique perto de um pico do chat vai ao pico: acertar numa risca de 2 px a seco é pedir
      // pontaria a quem só quer ver o momento.
      marcas: ev.marcas,
      raioPx: tocar() ? 16 : 8,
    });
  }

  function escolher(alvo) {
    if (!alvo) return;
    if (alvo.tipo === 'time' || alvo.tipo === 'resumo') {
      // Sem times, o grupo "Sem time" é toda a gente: fechá-lo punha o evento inteiro numa linha só, e
      // isso assustava (o dono, 07/10). Só fecha quando há times à volta.
      if (alvo.time == null && !ev.elenco?.times.length) return;
      if (ev.abertos.has(alvo.time)) ev.abertos.delete(alvo.time);
      else ev.abertos.add(alvo.time);
      remontar();
      pintar();
      return;
    }
    ev.escolha = { canal: alvo.canal, ms: alvo.ms, time: alvo.time };
    lembrarEvento();
    ev.procura?.abort();
    ev.achados = [];
    ev.extrasDoLink = [];
    const proprio = indiceDeTimes(ev.elenco).get(alvo.canal);
    if (proprio != null) ev.juntados.delete(proprio);
    $('estadoLance').textContent = '';
    pintarLance();
    pintar();
    destaparMapa();
    lerChatDoTime(ev.escolha);
  }

  // Num ecrã estreito o lance fica preso ao fundo do ecrã (o botão que abre o vídeo está sempre à
  // vista), e por isso tapava o mapa: medido num 390x844, o painel ia de 480 a 844 px e o mapa de 500
  // a 726, e a faixa que se acabou de tocar sumia. Rola-se a página até o mapa ficar por cima dele.
  function destaparMapa() {
    if (!estreito() || $('lance').hidden) return;
    const falta = () => $('mapaRolo').getBoundingClientRect().bottom - $('lance').getBoundingClientRect().top + 8;
    if (falta() > 0) window.scrollBy({ top: falta(), behavior: semMovimento() ? 'auto' : 'smooth' });
    // O que está por cima do mapa ainda pode mudar de altura a meio do rolar (o chat, a legenda, o trecho
    // à vista). Confere-se outra vez quando o rolar acaba, e acerta-se o que faltar.
    clearTimeout(ev.destapar);
    ev.destapar = setTimeout(() => {
      if (!estreito() || $('lance').hidden) return;
      if (falta() > 0) window.scrollBy({ top: falta(), behavior: 'auto' });
    }, 700);
  }

  // ── o teclado no mapa ──────────────────────────────────────────────────
  //
  // O mapa é um canvas: sem isto só se escolhia um lance com o rato ou o dedo. ↑ ↓ trocam de linha,
  // ← → andam no tempo (com Shift, mais depressa), Home e End vão às pontas da vista, Enter ou Espaço
  // escolhem (num time, abrem ou fecham), + e − dão zoom. O que fica sob o cursor é dito a quem usa
  // leitor de ecrã, em #mapaVoz.
  function teclaNoMapa(e) {
    if (!ev.mapa?.linhas.length || !ev.vista || e.altKey || e.ctrlKey || e.metaKey) return;
    const linhas = ev.mapa.linhas;
    const span = ev.vista.ateMs - ev.vista.deMs;
    if (!ev.cursor || !linhas[ev.cursor.i]) {
      const i = ev.escolha ? linhas.findIndex((l) => l.canal === ev.escolha.canal) : -1;
      ev.cursor = { i: Math.max(0, i), ms: ev.escolha?.ms ?? (ev.vista.deMs + ev.vista.ateMs) / 2 };
    }
    let { i, ms } = ev.cursor;
    switch (e.key) {
      case 'ArrowUp': i = Math.max(0, i - 1); break;
      case 'ArrowDown': i = Math.min(linhas.length - 1, i + 1); break;
      case 'ArrowLeft': ms -= span / (e.shiftKey ? 5 : 20); break;
      case 'ArrowRight': ms += span / (e.shiftKey ? 5 : 20); break;
      case 'Home': ms = ev.vista.deMs; break;
      case 'End': ms = ev.vista.ateMs; break;
      case '+': case '=': $('aproximar').click(); break;
      case '-': case '_': $('afastar').click(); break;
      case 'Enter': case ' ': break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (ev.limites) ms = Math.min(Math.max(ms, ev.limites.deMs), ev.limites.ateMs);
    // Sair da vista arrasta a vista atrás do cursor, do mesmo tamanho.
    if (ms < ev.vista.deMs) ev.vista = { deMs: ms, ateMs: ms + span };
    else if (ms > ev.vista.ateMs) ev.vista = { deMs: ms - span, ateMs: ms };
    ev.cursor = { i, ms };
    if (e.key === 'Enter' || e.key === ' ') {
      const l = linhas[i];
      if (l.tipo === 'canal') escolher({ tipo: 'canal', canal: l.canal, ms, time: l.time });
      else {
        escolher({ tipo: l.tipo, time: l.time });
        // Abrir ou fechar um time muda as linhas: o cursor fica no cabeçalho dele.
        ev.cursor.i = Math.max(0, ev.mapa.linhas.findIndex((x) => x.tipo === 'time' && x.time === l.time));
      }
    }
    verCursor();
    dizerCursor();
    pintar();
  }

  /** Rolar as faixas até a linha do cursor se ver, por baixo do cabeçalho preso do time. */
  function verCursor() {
    const l = ev.mapa.linhas[ev.cursor.i];
    const rolo = $('mapaRolo');
    const cabeca = l.tipo === 'time' ? 0 : ev.mapa.linhas[ev.mapa.cabecalhos[0]]?.altura ?? 0;
    if (l.y - cabeca < rolo.scrollTop) rolo.scrollTop = Math.max(0, l.y - cabeca);
    else if (l.y + l.altura > rolo.scrollTop + rolo.clientHeight) rolo.scrollTop = l.y + l.altura - rolo.clientHeight;
    ev.topo = rolo.scrollTop;
  }

  function dizerCursor() {
    const l = ev.mapa.linhas[ev.cursor.i];
    const time = l.time ?? t('evento.semTime');
    $('mapaVoz').textContent = l.tipo === 'canal'
      ? [l.canal, time, horaLocal(ev.cursor.ms),
        t(ev.falhados.has(l.canal) ? 'evento.naoAchado' : noArEm(ev.coberturas, l.canal, ev.cursor.ms) ? 'evento.noAr' : 'evento.foraDoArCurto')].join(', ')
      : [time, tn(l.canais?.length ?? 0, 'evento.canalUm', 'evento.canaisN'), t(l.aberto ? 'evento.aberto' : 'evento.fechado')].join(', ');
  }

  // ── o chat ─────────────────────────────────────────────────────────────
  //
  // Onde o chat do time explodiu, à volta do lance escolhido. É texto e não vídeo (uma hora de um
  // canal pequeno custou 12 pedidos, medido em 06/10), por isso lê-se sozinho a cada escolha, e só do
  // time: os 500 de uma vez eram dezenas de milhares de pedidos.
  const CHAT_JANELA_MS = 2 * 3600e3;
  // A janela começa numa meia hora certa: duas escolhas perto uma da outra (um pico e o seguinte) caem
  // na mesma janela e não leem o chat outra vez. Com o início ao minuto, cada clique era uma janela
  // nova e uns 12 pedidos por hora e por canal. A escolha fica sempre com 1 h antes e 30 min depois.
  const CHAT_GRELHA_MS = 30 * 60e3;
  const PICOS_BOTOES = 8;
  // Quanto antes do segundo do pico o vídeo abre: o lance vem antes da reacção do chat.
  const ANTES_DO_PICO_MS = 10_000;
  const chatLido = new Set();
  let chatControlo = null;
  // A sensibilidade dos picos (o dono, 07/10: num canal pequeno quase nunca se chega a 8 mensagens num
  // minuto). Normal é a medida de `picos` em chat.js; as outras baixam o fator e o mínimo.
  const SENSIBILIDADES = { normal: { fator: 3, minimo: 8 }, alta: { fator: 2, minimo: 5 }, maxima: { fator: 1.5, minimo: 3 } };
  const GUARDADA_SENS = 'povix.sensibilidade';
  let sensibilidade = 'normal';
  try { sensibilidade = SENSIBILIDADES[localStorage.getItem(GUARDADA_SENS)] ? localStorage.getItem(GUARDADA_SENS) : 'normal'; } catch { /* janela privada */ }
  // As janelas de chat já lidas por canal: com elas os picos refazem-se sem pedir nada à Kick.
  const janelasLidas = new Map();
  // Para os testes: que janelas de chat de um canal já foram lidas.
  ev.janelasDoChat = (c) => janelasLidas.get(c) || [];
  function marcasDoChat(c) {
    const msgs = ev.mensagens.get(c) || [];
    // Janelas que se sobrepõem (duas escolhas a meia hora uma da outra, ou um trecho escolhido à mão por
    // cima de uma janela já lida) acham o mesmo pico duas vezes: fica um por minuto.
    const porMinuto = new Map();
    for (const [deMs, ateMs] of janelasLidas.get(c) || []) {
      const dentro = msgs.filter((m) => m.ms >= deMs && m.ms < ateMs);
      for (const i of picos(calor(dentro, deMs, ateMs), SENSIBILIDADES[sensibilidade])) {
        const de = deMs + i * 60_000;
        const ms = segundoDoPico(dentro, de, Math.min(ateMs, de + 60_000));
        const minuto = Math.floor(ms / 60_000);
        if (!porMinuto.has(minuto)) porMinuto.set(minuto, { ms, tipo: 'chat' });
      }
    }
    return [...porMinuto.values()].sort((a, b) => a.ms - b.ms);
  }
  /** O que falta ler do chat de `c` entre `deMs` e `ateMs`: os pedaços que nenhuma janela lida cobre. */
  function faltaLer(c, deMs, ateMs) {
    const lidas = [...(janelasLidas.get(c) || [])].sort((a, b) => a[0] - b[0]);
    const falta = [];
    let de = deMs;
    for (const [a, b] of lidas) {
      if (b <= de) continue;
      if (a >= ateMs) break;
      if (a > de) falta.push([de, a]);
      de = Math.max(de, b);
      if (de >= ateMs) break;
    }
    if (de < ateMs) falta.push([de, ateMs]);
    // Menos de um segundo por ler é a fronteira entre duas janelas, e não chat.
    return falta.filter(([a, b]) => b - a >= 1000);
  }
  function pintarComoPico() {
    const { fator, minimo } = SENSIBILIDADES[sensibilidade];
    $('sensibilidade').value = sensibilidade;
    $('comoPico').textContent = t('lance.comoPico', { fator: fator.toLocaleString(idiomaActual()), minimo });
  }
  let chatDeTodos = false;
  async function lerChatDoTime(e, { todos = false } = {}) {
    chatControlo?.abort();
    const controlo = new AbortController();
    chatControlo = controlo;
    chatDeTodos = todos;
    $('chatTodos').textContent = t(todos ? 'lance.chatTodosParar' : 'lance.chatTodos');
    const deMs = Math.floor((e.ms - CHAT_JANELA_MS / 2) / CHAT_GRELHA_MS) * CHAT_GRELHA_MS;
    const ateMs = Math.min(Date.now(), deMs + CHAT_JANELA_MS);
    const base = todos
      ? [e.canal, ...ev.resultados.filter((r) => r.estado === 'ok' && r.slug !== e.canal).map((r) => r.slug)]
      : colegas(e.canal);
    const doTime = base.filter((c) => noArEm(ev.coberturas, c, e.ms));
    const canais = doTime.filter((c) => !chatLido.has(`${c}|${deMs}`) && faltaLer(c, deMs, ateMs).length);
    let feitos = 0;
    const aLer = todos ? 'lance.aLerChatTodos' : 'lance.aLerChat';
    if (canais.length) $('estadoChat').textContent = t(aLer, { feitos, total: canais.length });
    for (const c of canais) {
      if (controlo.signal.aborted) return;
      try {
        await lerJanela(c, deMs, ateMs, controlo.signal);
      } catch (erro) {
        if (erro?.name === 'AbortError') return;
      }
      feitos++;
      $('estadoChat').textContent = t(aLer, { feitos, total: canais.length });
      pintar();
    }
    if (controlo.signal.aborted) return;
    chatDeTodos = false;
    $('chatTodos').textContent = t('lance.chatTodos');
    ultimaLeitura = { e, doTime, deMs, ateMs, todos };
    pintarPicos(e, doTime, deMs, ateMs, todos);
    if (!todos) await adiantarPicos(doTime, deMs, controlo.signal).catch(() => {});
  }
  let ultimaLeitura = null;

  // Uma janela de chat de um canal: as mensagens ficam (para o chat ao lado do vídeo) e os picos refazem-se.
  //
  // Com `soOQueVeio`, a janela só conta como lida até onde a leitura chegou: um trecho escolhido à mão
  // que parou a meio (o travão de pedidos, a Kick a recusar, o botão Parar) volta a ler só o que faltou.
  async function lerJanela(c, deMs, ateMs, sinal, { soOQueVeio = false, maxPedidos = 120, aoProgredir = () => {} } = {}) {
    // O número do canal não muda: um trecho lido aos bocados pergunta-o uma vez só.
    const id = idsDoChat.get(c) ?? await idDoCanal(c, { buscar: buscarChat, sinal });
    if (id != null) idsDoChat.set(c, id);
    let chegouMs = ateMs;
    const msgs = await mensagensEntre(id, deMs, ateMs, {
      buscar: buscarChat, sinal, maxPedidos,
      aoProgredir: (p) => { chegouMs = p.chegouMs; aoProgredir(p); },
    });
    juntarMensagens(c, msgs);
    const lida = !soOQueVeio || !msgs.incompleto ? [deMs, ateMs]
      : id != null && chegouMs < ateMs ? [Math.max(deMs, chegouMs), ateMs] : null;
    if (lida) janelasLidas.set(c, [...(janelasLidas.get(c) || []), lida]);
    ev.marcas.set(c, marcasDoChat(c));
    aoMudarPicos();
    if (!soOQueVeio) chatLido.add(`${c}|${deMs}`);
    return { msgs, id };
  }
  const idsDoChat = new Map();
  function juntarMensagens(c, msgs) {
    const porId = new Map((ev.mensagens.get(c) || []).map((m) => [m.id ?? `${m.ms}|${m.autor}|${m.texto}`, m]));
    for (const m of msgs) porId.set(m.id ?? `${m.ms}|${m.autor}|${m.texto}`, m);
    ev.mensagens.set(c, [...porId.values()].sort((a, b) => a.ms - b.ms));
  }

  // ── o chat de um trecho escolhido à mão ────────────────────────────────
  //
  // O dono, 10/10: "tem que me pedir quanto chat é pra ler, de que hora até que hora". A tela do vídeo
  // tem duas alças na linha do tempo e um botão; isto lê o chat de UM canal nesse trecho, e só o que
  // ainda não se leu. Não depende do mapa do evento: na noite sem evento funciona igual, porque o chat
  // vem do canal e não do elenco. As mensagens e os picos vão para o mesmo sítio dos do evento.
  const TRECHO_MAX_PEDIDOS = 400;
  const TRECHO_BOCADO_MS = 5 * 60_000;
  async function lerChatTrecho(c, deMs, ateMs, { sinal, aoProgredir = () => {} } = {}) {
    const ate = Math.min(ateMs, Date.now());
    const falta = faltaLer(c, deMs, ate);
    const total = falta.reduce((s, [a, b]) => s + (b - a), 0);
    // Em bocados de 5 minutos, por ordem de relógio: parar a meio guarda os bocados que já vieram, e um
    // clique a seguir lê só o resto. Custa um pedido a mais por bocado, que é o da fronteira.
    const bocados = [];
    for (const [a, b] of falta) for (let x = a; x < b; x += TRECHO_BOCADO_MS) bocados.push([x, Math.min(b, x + TRECHO_BOCADO_MS)]);
    const antes = (ev.mensagens.get(c) || []).length;
    let andado = 0;
    let motivo = null;
    let semCanal = false;
    for (const [a, b] of bocados) {
      if (sinal?.aborted) throw new DOMException('parado', 'AbortError');
      const { msgs, id } = await lerJanela(c, a, b, sinal, {
        soOQueVeio: true,
        maxPedidos: TRECHO_MAX_PEDIDOS,
        aoProgredir: ({ fracao }) => aoProgredir({ fracao: total ? (andado + fracao * (b - a)) / total : 1 }),
      });
      andado += b - a;
      aoProgredir({ fracao: total ? andado / total : 1 });
      if (id == null) { semCanal = true; break; }
      if (msgs.incompleto) { motivo = msgs.motivo; break; }
    }
    if (falta.length && !semCanal && !motivo) {
      // O trecho inteiro passa a ser uma janela só, para os picos se medirem contra o trecho que se pediu,
      // e não contra os bocados que por acaso faltavam.
      janelasLidas.set(c, [...(janelasLidas.get(c) || []), [deMs, ate]]);
      ev.marcas.set(c, marcasDoChat(c));
      aoMudarPicos();
    }
    if (ev.mapa) pintar();
    const lista = ev.mensagens.get(c) || [];
    return {
      jaLido: !falta.length,
      novas: lista.length - antes,
      noTrecho: lista.filter((m) => m.ms >= deMs && m.ms < ate).length,
      picos: (ev.marcas.get(c) || []).filter((m) => m.ms >= deMs && m.ms < ate).length,
      semCanal,
      motivo,
    };
  }

  // Com a página parada, os picos das janelas vizinhas, para trás e para a frente (o dono, 07/10). Só
  // começa depois de uns segundos sem escolha nova, e pára assim que se escolhe outra coisa (o sinal é o
  // da leitura do time). Cada pedido continua a esperar o vídeo (`buscarChat`).
  const ADIANTAR_ESPERA_MS = 4000;
  async function adiantarPicos(doTime, deMs, sinal) {
    await new Promise((ok, mal) => {
      const r = setTimeout(ok, ADIANTAR_ESPERA_MS);
      sinal.addEventListener('abort', () => { clearTimeout(r); mal(new DOMException('parado', 'AbortError')); }, { once: true });
    });
    for (const passo of [-1, 1, -2, 2]) {
      const de = deMs + passo * CHAT_JANELA_MS;
      const ate = Math.min(Date.now(), de + CHAT_JANELA_MS);
      if (!(ate > de)) continue;
      for (const c of doTime) {
        if (sinal.aborted) return;
        if (chatLido.has(`${c}|${de}`)) continue;
        const noAr = (ev.coberturas.get(c) || []).some(([a, b]) => a < ate && b > de);
        if (!noAr) continue;
        try { await lerJanela(c, de, ate, sinal); } catch (erro) { if (erro?.name === 'AbortError') return; }
        pintar();
      }
    }
  }

  // Os picos do time também como botões com a hora: no telemóvel uma marca de 3 px no mapa é difícil
  // de acertar, e o botão diz logo a que horas foi. Ficam os mais perto do momento escolhido.
  function pintarPicos(e, doTime, deMs, ateMs, todos = false) {
    const porMinuto = new Map();
    for (const c of doTime) {
      for (const m of ev.marcas.get(c) || []) {
        if (m.ms < deMs || m.ms > ateMs) continue;
        const minuto = Math.floor(m.ms / 60_000);
        // Dois colegas com um pico no mesmo minuto são o mesmo lance: fica o de quem se escolheu.
        if (!porMinuto.has(minuto) || c === e.canal) porMinuto.set(minuto, { canal: c, ms: m.ms });
      }
    }
    const lista = [...porMinuto.values()];
    const quem = t(todos ? 'lance.deTodos' : 'lance.doTime');
    $('estadoChat').textContent = !doTime.length ? ''
      : lista.length ? tn(lista.length, 'lance.umPicoChat', 'lance.picosChat', { quem }) : t('lance.semPicoChat', { quem });
    const perto = lista.sort((a, b) => Math.abs(a.ms - e.ms) - Math.abs(b.ms - e.ms))
      .slice(0, PICOS_BOTOES).sort((a, b) => a.ms - b.ms);
    $('picosChat').innerHTML = perto.length
      ? `<span class="nota">${escapar(t('lance.picosBotoes'))}</span>${perto.map((p) => (
        `<button type="button" class="pico" data-ms="${p.ms}" data-canal="${escapar(p.canal)}" title="${escapar(p.canal)}">${escapar(horaCurta(p.ms))}</button>`
      )).join('')}`
      : '';
    pintarLegenda();
    // A legenda aparece por cima do mapa e empurra-o para baixo: no telemóvel, por baixo do lance.
    if (ev.escolha === e) destaparMapa();
  }

  // A legenda das marcas aparece quando há alguma no mapa: sem ela, ninguém sabe o que são.
  function pintarLegenda() {
    const canais = ev.elenco ? [...ev.elenco.times.flatMap((x) => x.canais), ...ev.elenco.soltos] : [];
    $('legendaPico').hidden = !canais.some((c) => ev.marcas.get(c)?.length);
  }

  // ── o lance ────────────────────────────────────────────────────────────

  function colegas(canal) {
    const time = indiceDeTimes(ev.elenco).get(canal);
    if (time == null) return [canal];
    const doTime = ev.elenco.times.find((x) => x.nome === time)?.canais || [canal];
    return [canal, ...doTime.filter((c) => c !== canal)];
  }

  // Os canais que o lance abre: o time de quem se escolheu, os que o som achou, os times juntados à
  // mão e os que vieram num link. Só quem estava no ar naquele instante.
  function canaisDoLance(e) {
    const doTime = (nome) => ev.elenco.times.find((x) => x.nome === nome)?.canais || [];
    const juntados = [...ev.juntados].flatMap(doTime);
    const achados = resumo(ev.achados).estava.map((a) => a.canal);
    return [...new Set([...colegas(e.canal), ...achados, ...juntados, ...ev.extrasDoLink])]
      .filter((c) => noArEm(ev.coberturas, c, e.ms));
  }

  function pintarLance() {
    pintarComoPico();
    const e = ev.escolha;
    $('lance').hidden = !e;
    $('partilharEventoTexto').textContent = t(e ? 'evento.partilharLance' : 'evento.partilharEvento');
    if (!e) return;
    const time = indiceDeTimes(ev.elenco).get(e.canal);
    const noAr = colegas(e.canal).filter((c) => noArEm(ev.coberturas, c, e.ms));
    $('lanceTitulo').textContent = `${e.canal}, ${horaLocal(e.ms)}`;
    $('lanceTime').textContent = time != null
      ? t('lance.time', { time, n: noAr.length })
      : t('lance.semTime');
    const r = resumo(ev.achados);
    // Os "talvez" também aparecem, marcados: ficaram entre 5 e 6 de força sem segunda janela para
    // decidir (ao vivo, o trecho seguinte ainda não estava gravado). Quem olha decide. A força vai no
    // título: um número solto no ecrã não diz nada a quem não fez a medição.
    $('lanceAchados').innerHTML = [
      ...r.estava.map((a) => `<li title="${a.forca.toFixed(1)}"><b>${escapar(a.canal)}</b><span class="nota">${t('lance.forca')}</span></li>`),
      ...r.talvez.map((a) => `<li class="talvez"><b>${escapar(a.canal)}</b><span class="nota">${t('lance.talvez')}</span></li>`),
    ].join('');

    // O botão diz quantos ângulos abre. "Ver este lance com o time" abria um só no exemplo sem times,
    // e quem chegava achava que a página não funcionava.
    const noArAgora = noArEm(ev.coberturas, e.canal, e.ms);
    const n = canaisDoLance(e).length;
    $('verLanceTexto').textContent = n > 1 ? t('lance.verN', { n }) : t('lance.verSo', { canal: e.canal });
    const cedo = cedoDemais(e.ms, ev.atrasoMin);
    $('verLance').disabled = !noArAgora;
    $('verLance').title = noArAgora ? '' : t('lance.foraDoAr', { canal: e.canal, hora: horaLocal(e.ms) });
    if (!noArAgora && !ev.procura) $('estadoLance').textContent = t('lance.foraDoAr', { canal: e.canal, hora: horaLocal(e.ms) });
    // Com um ângulo só e a busca liberada, o passo útil a seguir é procurar os outros: é ele que leva o
    // destaque.
    const buscaPrincipal = n === 1 && !cedo && noArAgora;
    $('verLance').classList.toggle('principal', !buscaPrincipal);
    $('procurarOutros').classList.toggle('principal', buscaPrincipal);
    $('procurarOutros').disabled = !noArAgora || (cedo && !ev.procura);
    $('notaOutros').hidden = !cedo;
    if (cedo) {
      $('notaOutros').textContent = t('lance.liberadoAs', { hora: horaLocal(e.ms + ev.atrasoMin * 60_000), min: ev.atrasoMin });
    }
    pintarJuntar(e);
    // As riscas do mapa dizem quem o lance abre, e isso muda ao juntar um time ou achar alguém pelo som.
    pintar();
  }

  // Juntar outro time ao lance: um raid tem dois, e o time do outro lado só entrava pelo som (que está
  // fechado durante o jogo) ou escrevendo nomes à mão.
  function pintarJuntar(e) {
    const campo = $('juntarCampo');
    const proprio = indiceDeTimes(ev.elenco).get(e.canal);
    campo.hidden = ev.elenco.times.length < 2;
    if (!campo.hidden) {
      const opcoes = ev.elenco.times
        .filter((x) => x.nome !== proprio && !ev.juntados.has(x.nome))
        .map((x) => ({ nome: x.nome, n: x.canais.filter((c) => noArEm(ev.coberturas, c, e.ms)).length }))
        .filter((x) => x.n > 0);
      $('juntarTime').innerHTML = `<option value="">${escapar(t('lance.juntarPh'))}</option>`
        + opcoes.map((x) => `<option value="${escapar(x.nome)}">${escapar(t('lance.noArN', { nome: x.nome, n: x.n }))}</option>`).join('');
    }
    $('juntados').innerHTML = [...ev.juntados].map((nome) => `<button class="chip" data-time="${escapar(nome)}"`
      + ` aria-label="${escapar(t('lance.tirarTime', { time: nome }))}">${escapar(nome)} ✕</button>`).join('');
    for (const b of $('juntados').querySelectorAll('button[data-time]')) {
      b.onclick = () => { ev.juntados.delete(b.dataset.time); pintarLance(); };
    }
  }

  // O vídeo primeiro, o chat depois. Ler o chat de um time são até 120 pedidos por canal, e a correr
  // ao mesmo tempo que as playlists do lance faziam a live demorar a abrir (o dono, 07/10: "lento").
  // Enquanto um lance abre, cada pedido do chat espera; a seguir continua de onde estava.
  let livre = Promise.resolve();
  const buscarChat = async (...args) => { await livre; return buscar(...args); };

  async function verLance() {
    const e = ev.escolha;
    if (!e) return;
    const canais = canaisDoLance(e);
    mostrarMapa(false);
    let soltar;
    livre = new Promise((r) => { soltar = r; });
    try {
      await abrirLance(canais, e.ms, e.canal);
    } finally {
      soltar();
    }
  }

  // O som de um canal num instante, lendo só o VOD que cobre esse instante. As playlists ficam
  // guardadas: procurar o lance seguinte não as volta a pedir.
  const pecas = new Map();
  async function somDe(slug, deMs, duracaoS) {
    const r = ev.resultados.find((x) => x.slug === slug);
    const vod = r?.vods.find((v) => deMs >= v.inicioApi - 60_000
      && deMs <= (aoVivoVod(v) ? AGORA() : v.inicioApi + (v.duracaoMs > 0 ? v.duracaoMs : 0)));
    if (!vod) return null;
    // Um VOD ao vivo cresce: a playlist lida há minutos não tem o lance de agora.
    const chave = aoVivoVod(vod) ? `${vod.id}@${Math.floor(deMs / 30_000)}` : vod.id;
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
    // A meio de uma busca o botão é "Parar busca": com 500 canais ela pode levar minutos.
    if (ev.procura) {
      ev.procura.abort();
      ev.procura = null;
      $('estadoLance').textContent = t('lance.parado', { n: resumo(ev.achados).estava.length, feitos: ev.feitos });
      return;
    }
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
    ev.feitos = 0;
    $('estadoLance').textContent = t('lance.aOuvir', { feitos: 0, total });
    $('procurarOutrosTexto').textContent = t('lance.parar');
    try {
      for await (const r of procurarAngulos({
        quandoMs: e.ms, referencia: e.canal, candidatos, somDe, sinal: controlo.signal,
      })) {
        ev.feitos++;
        ev.achados.push(r);
        $('estadoLance').textContent = t('lance.aOuvir', { feitos: ev.feitos, total });
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
      if (ev.procura === controlo) ev.procura = null;
      $('procurarOutrosTexto').textContent = t('lance.outros');
      if (ev.escolha) pintarLance();
    }
  }

  // ── ao vivo ────────────────────────────────────────────────────────────
  //
  // Enquanto houver alguém no ar, o fim das faixas de quem está ao vivo anda com o relógio, sem pedir
  // nada à Kick (a gravação em curso fica 2 a 12 s atrás do ar, medido em 06/10). Quem estava a olhar
  // para o fim do mapa continua a olhar para o fim. O ritmo e as pausas com o separador escondido são
  // os do aovivo.js.
  const ATRAS_DO_AR_MS = 20_000;
  let aoVivoControlo = null;
  function seguirAoVivo(sim) {
    aoVivoControlo?.abort();
    aoVivoControlo = null;
    $('irAoVivo').hidden = !sim;
    if (!sim) return;
    const controlo = new AbortController();
    aoVivoControlo = controlo;
    agendar({
      intervaloMs: 30_000,
      sinal: controlo.signal,
      atualizar: async () => {
        if (!ev.mapa) return;
        const noFim = ev.vista && ev.limites && ev.limites.ateMs - ev.vista.ateMs < 60_000;
        ev.coberturas = coberturasDe(ev.resultados);
        remontar();
        const fim = ev.mapa.fimMs;
        if (Number.isFinite(fim) && ev.limites) {
          const passou = fim - ev.limites.ateMs;
          ev.limites = { ...ev.limites, ateMs: fim };
          if (noFim && passou > 0) ev.vista = { deMs: ev.vista.deMs + passou, ateMs: ev.vista.ateMs + passou };
        }
        pintar();
      },
    });
  }

  // O resumo por cima do mapa: times, canais, com vídeo e ao vivo. Devolve quantos estão ao vivo.
  function pintarResumo(extra = '') {
    const { times, canais } = contar(ev.elenco);
    const comVideo = ev.coberturas.size;
    const aoVivo = ev.resultados.filter((r) => r.estado === 'ok' && r.vods.some(aoVivoVod)).length;
    $('resumoEvento').textContent = [
      times ? tn(times, 'evento.resumoTimeUm', 'evento.resumoTimes', { times }) : '',
      tn(canais, 'evento.resumoCanalUm', 'evento.resumoCanais', { canais, comVideo }),
      aoVivo ? t('evento.resumoAoVivo', { aoVivo }) : '',
      extra,
    ].filter(Boolean).join(', ');
    $('seloAoVivo').hidden = aoVivo === 0;
    return aoVivo;
  }

  // Quem entra no ar depois de o evento abrir. Antes só aparecia ao recarregar a página: o ao vivo
  // estendia quem já estava no ar, mas não voltava a pedir a lista de VODs de mais ninguém (ABISAL.md).
  // De 2 em 2 minutos, com a página à vista, pede de novo os que não estão no ar, 25 de cada vez e à
  // vez, para 500 canais não serem 500 pedidos de uma vez. Só num evento de hoje.
  const NOVATOS_LOTE = 25;
  let novatosControlo = null;
  function procurarNovatos() {
    novatosControlo?.abort();
    novatosControlo = null;
    if (!ev.limites || ev.limites.ateMs < Date.now() - 6 * 3600e3) return;
    const controlo = new AbortController();
    novatosControlo = controlo;
    let vez = 0;
    agendar({
      intervaloMs: window.__povixNovatosMs || 120_000,
      sinal: controlo.signal,
      atualizar: async () => {
        if (!ev.elenco) return;
        const fora = ev.resultados.filter((r) => !(r.estado === 'ok' && r.vods.some(aoVivoVod))).map((r) => r.slug);
        if (!fora.length) return;
        const lote = Array.from({ length: Math.min(NOVATOS_LOTE, fora.length) }, (_, i) => fora[(vez + i) % fora.length]);
        vez = (vez + lote.length) % fora.length;
        const novos = await carregarCanais(lote, { buscar, sinal: controlo.signal, paralelos: 4 });
        const entraram = novos.filter((r) => r.estado === 'ok' && r.vods.some(aoVivoVod));
        if (!entraram.length) return;
        const porSlug = new Map(novos.map((r) => [r.slug, r]));
        ev.resultados = ev.resultados.map((r) => porSlug.get(r.slug) || r);
        memorizarVods(ev.resultados);
        ev.coberturas = coberturasDe(ev.resultados);
        pintarResumo(t('evento.entraram', { lista: entraram.map((r) => r.slug).join(', ') }));
        remontar();
        if (Number.isFinite(ev.mapa.fimMs) && ev.limites) ev.limites = { ...ev.limites, ateMs: Math.max(ev.limites.ateMs, ev.mapa.fimMs) };
        if (!aoVivoControlo) seguirAoVivo(true);
        pintar();
      },
    });
  }

  // O lance escolhido (ou o primeiro streamer no ar) quase no ar: 20 s atrás, onde todos já gravaram.
  async function irAoVivo() {
    const agora = Date.now() - ATRAS_DO_AR_MS;
    const canal = ev.escolha && noArEm(ev.coberturas, ev.escolha.canal, agora) ? ev.escolha.canal
      : [...ev.coberturas.keys()].find((c) => noArEm(ev.coberturas, c, agora));
    if (!canal) return;
    ev.escolha = { canal, ms: agora, time: indiceDeTimes(ev.elenco).get(canal) ?? null };
    pintarLance();
    await verLance();
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
    esquecerEvento();
    ev.cancelar?.abort();
    ev.procura?.abort();
    ev.elenco = null;
    ev.escolha = null;
    ev.achados = [];
    seguirAoVivo(false);
    novatosControlo?.abort();
    novatosControlo = null;
    $('evento').hidden = true;
    $('lance').hidden = true;
    $('avisosEvento').hidden = true;
    ev.juntados = new Set();
    ev.extrasDoLink = [];
    mostrarMapa(false);
    // pushState e não replaceState: o Voltar do browser traz o evento de volta (ver o popstate).
    if (/[#&]evento=/.test(location.hash)) history.pushState(null, '', location.pathname + location.search);
  }

  // ── ligações ───────────────────────────────────────────────────────────

  function ligar() {
    $('abrirElenco').onclick = abrirDoTexto;
    $('procurarAoVivo').onclick = procurarParticipantes;
    $('exemploAoVivo').onclick = abrirExemplo;
    $('procurarEvento').oninput = () => { remontar(); pintar(); };
    $('mapaRolo').onscroll = () => { ev.topo = $('mapaRolo').scrollTop; pintar(); };
    $('mapaRolo').onclick = (e) => {
      if (acabouDeArrastar) { acabouDeArrastar = false; return; }
      escolher(aquiDe(e));
    };
    $('mapaRolo').onkeydown = teclaNoMapa;
    // O cursor só aparece com o foco do teclado: um clique de rato não o deve deixar pintado.
    $('mapaRolo').onfocus = () => pintar();
    $('mapaRolo').onblur = () => pintar();
    $('mapaRolo').onmousemove = (e) => {
      const alvo = aquiDe(e);
      $('mapaRolo').title = alvo?.canal ? `${alvo.canal}, ${horaLocal(alvo.ms)}` : (alvo?.time ?? '');
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
    // Arrastar para os lados anda no tempo (o dono, 07/10: "o mapa não anda"). Para cima e para baixo
    // continua a rolar as faixas. Um arrasto não é um clique: não escolhe nada ao largar.
    let arrasto = null;
    let acabouDeArrastar = false;
    $('mapaRolo').addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !ev.vista) return;
      arrasto = { x: e.clientX, vista: { ...ev.vista }, andou: false, id: e.pointerId };
    });
    $('mapaRolo').addEventListener('pointermove', (e) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const dx = e.clientX - arrasto.x;
      if (!arrasto.andou && Math.abs(dx) < 6) return;
      if (!arrasto.andou) {
        arrasto.andou = true;
        try { $('mapaRolo').setPointerCapture(e.pointerId); } catch { /* já saiu */ }
        $('mapaRolo').classList.add('aArrastar');
      }
      const msPorPx = (arrasto.vista.ateMs - arrasto.vista.deMs) / $('mapaRolo').clientWidth;
      const vista = { deMs: arrasto.vista.deMs - dx * msPorPx, ateMs: arrasto.vista.ateMs - dx * msPorPx };
      ev.vista = zoom(vista, null, 1, ev.limites);
      pintar();
    });
    const largar = (e) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      acabouDeArrastar = arrasto.andou;
      arrasto = null;
      $('mapaRolo').classList.remove('aArrastar');
    };
    $('mapaRolo').addEventListener('pointerup', largar);
    $('mapaRolo').addEventListener('pointercancel', largar);
    // Uma roda de lado (touchpad, ou Shift + roda) também anda no tempo.
    $('mapaRolo').addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.altKey || !ev.vista) return;
      const lado = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (!lado || Math.abs(lado) < Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
      e.preventDefault();
      const msPorPx = (ev.vista.ateMs - ev.vista.deMs) / $('mapaRolo').clientWidth;
      ev.vista = zoom({ deMs: ev.vista.deMs + lado * msPorPx, ateMs: ev.vista.ateMs + lado * msPorPx }, null, 1, ev.limites);
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
    // "Evento inteiro" é o trecho onde a maioria esteve, e não os 7 a 30 dias de VODs de cada canal.
    $('verTudo').onclick = () => { ev.vista = { ...(ev.trecho || ev.limites) }; pintar(); };
    $('verLance').onclick = verLance;
    // Os picos de todos, e não só do time: um botão, porque são até 120 pedidos por canal. Carregar outra
    // vez pára a leitura; o que já se leu fica.
    $('chatTodos').onclick = () => {
      if (chatDeTodos) {
        chatControlo?.abort();
        chatDeTodos = false;
        $('chatTodos').textContent = t('lance.chatTodos');
        $('estadoChat').textContent = '';
        return;
      }
      if (ev.escolha) lerChatDoTime(ev.escolha, { todos: true });
    };
    $('sensibilidade').onchange = () => {
      sensibilidade = SENSIBILIDADES[$('sensibilidade').value] ? $('sensibilidade').value : 'normal';
      try { localStorage.setItem(GUARDADA_SENS, sensibilidade); } catch { /* janela privada */ }
      for (const c of janelasLidas.keys()) ev.marcas.set(c, marcasDoChat(c));
      pintarComoPico();
      aoMudarPicos();
      pintar();
      const u = ultimaLeitura;
      if (u && u.e === ev.escolha) pintarPicos(u.e, u.doTime, u.deMs, u.ateMs, u.todos);
    };
    pintarComoPico();
    $('mostrarMapa').onclick = () => mostrarMapa(!$('evento').classList.contains('comMapa'));
    $('fecharEvento').onclick = fecharEvento;
    $('irAoVivo').onclick = irAoVivo;
    $('procurarOutros').onclick = procurarOutros;
    $('partilharEvento').onclick = async () => {
      // `codificar` dá null a um elenco que não se poderia abrir de um link (mais de 2000 canais):
      // um "#evento=null" chegava a quem o recebe como um link estragado, sem dizer porquê.
      if (ev.link === null) { $('estadoPartilhaEvento').textContent = t('evento.linkGrande'); return; }
      const e = ev.escolha;
      // O link do lance leva o streamer escolhido e os ângulos a mais: sem isso quem o abria ficava com
      // o primeiro streamer do primeiro time, que é quase sempre outro.
      const extras = e ? canaisDoLance(e).filter((c) => !colegas(e.canal).includes(c)) : [];
      const url = `${location.origin}${location.pathname}#evento=${ev.link}`
        + (e ? `&t=${Math.round(e.ms)}&c=${encodeURIComponent(e.canal)}` : '')
        + (extras.length ? `&mais=${extras.map(encodeURIComponent).join(',')}` : '')
        + (ev.atrasoMin !== ATRASO_MIN ? `&atraso=${ev.atrasoMin}` : '');
      try {
        await navigator.clipboard.writeText(url);
        $('estadoPartilhaEvento').textContent = e
          ? t('evento.lanceCopiado', { canal: e.canal, n: canaisDoLance(e).length, data: dataCurta(e.ms), hora: horaLocal(e.ms) })
          : t('evento.linkCopiado');
      } catch {
        // Sem área de transferência, o link vai para a barra de endereço (de onde se copia), e não
        // para o ecrã: com 500 canais são milhares de caracteres.
        history.replaceState(null, '', url);
        $('estadoPartilhaEvento').textContent = t('partilha.falhou');
      }
    };
    $('corrigirElenco').onclick = corrigirElenco;
    $('elenco').addEventListener('paste', colarPagina);
    $('elenco').addEventListener('input', () => { $('abrirElencoTexto').textContent = t('evento.abrir'); });
    $('juntarTime').onchange = () => {
      const nome = $('juntarTime').value;
      if (nome) ev.juntados.add(nome);
      pintarLance();
    };
    // Um pico é para ver, e não só para escolher: o botão abre logo o vídeo (o dono esperava isso a
    // 07/10). A marca é o segundo em que o chat explodiu, e o vídeo abre 10 s antes dele, porque o
    // chat reage depois do lance (o atraso da live mais o tempo de ler e escrever).
    $('picosChat').onclick = async (evento) => {
      const b = evento.target.closest('button[data-ms]');
      if (!b) return;
      const canal = b.dataset.canal;
      const pico = Number(b.dataset.ms);
      const ms = noArEm(ev.coberturas, canal, pico - ANTES_DO_PICO_MS) ? pico - ANTES_DO_PICO_MS : pico;
      escolher({ tipo: 'canal', canal, ms, time: indiceDeTimes(ev.elenco).get(canal) ?? null });
      if (noArEm(ev.coberturas, canal, ms)) await verLance();
    };
    window.addEventListener('popstate', () => {
      if (/[#&]evento=/.test(location.hash) && !ev.elenco) abrirDoLink();
    });
    window.addEventListener('resize', () => { if (ev.mapa) remontar(); pintar(); });
  }

  /** Abrir um evento que veio num link (#evento=...&t=...&c=...&mais=...). Devolve true se havia um. */
  // ── o evento guardado ──────────────────────────────────────────────────
  //
  // A noite aberta já era guardada e voltava ao recarregar a página; o evento não, e quem abria um
  // lance e recarregava ficava com os vídeos e sem caminho de volta ao mapa (visto pelo dono a 07/10).
  // Guarda-se o mesmo que vai num link (o elenco e o lance escolhido), e só por uma semana: os VODs
  // de um canal sem verificação duram 7 dias.
  const GUARDADO = 'povix.evento';
  const GUARDADO_MAX_MS = 7 * 86400e3;
  function lembrarEvento() {
    if (!ev.link) return;
    const e = ev.escolha;
    try {
      localStorage.setItem(GUARDADO, JSON.stringify({
        link: ev.link, t: e?.ms ?? null, c: e?.canal ?? null, atraso: ev.atrasoMin, quando: Date.now(),
      }));
    } catch { /* janela privada: fica sem memória, como antes */ }
  }
  function esquecerEvento() {
    try { localStorage.removeItem(GUARDADO); } catch { /* nada */ }
  }

  /** Reabrir o evento guardado, por baixo da noite que a página já restaurou. Devolve true se havia um. */
  async function abrirGuardado() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem(GUARDADO) || 'null'); } catch { g = null; }
    if (!g?.link || !(Date.now() - g.quando < GUARDADO_MAX_MS)) { esquecerEvento(); return false; }
    const hash = `#evento=${g.link}`
      + (Number.isFinite(g.t) ? `&t=${Math.round(g.t)}` : '')
      + (g.c ? `&c=${encodeURIComponent(g.c)}` : '')
      + (Number.isFinite(g.atraso) && g.atraso !== ATRASO_MIN ? `&atraso=${g.atraso}` : '');
    // Os vídeos já voltam pela sessão guardada da página: abrir o lance outra vez trocava a noite e
    // apagava as kills marcadas nela.
    return abrirDoLink(hash, { abrirLance: false });
  }

  async function abrirDoLink(hash = location.hash, { abrirLance = true } = {}) {
    const m = /[#&]evento=([^&]+)/.exec(hash);
    if (!m) return false;
    const elenco = await descodificar(m[1]);
    if (!elenco) { $('estadoEvento').textContent = t('evento.linkEstragado'); return false; }
    const tq = /[&#]t=(\d+)/.exec(hash);
    const aq = /[&#]atraso=(\d+)/.exec(hash);
    const cq = /[&#]c=([^&]+)/.exec(hash);
    const mq = /[&#]mais=([^&]+)/.exec(hash);
    ev.atrasoMin = aq ? Number(aq[1]) : ATRASO_MIN;
    $('elenco').value = '';
    await abrirElenco(elenco, { quandoMs: tq ? Number(tq[1]) : null });
    if (!tq) return true;
    const ms = Number(tq[1]);
    const ler = (x) => { try { return decodeURIComponent(x); } catch { return ''; } };
    const pedido = cq ? ler(cq[1]) : '';
    const todos = [...ev.elenco.times.flatMap((x) => x.canais), ...ev.elenco.soltos];
    const canal = (pedido && noArEm(ev.coberturas, pedido, ms) ? pedido : null)
      ?? todos.find((c) => noArEm(ev.coberturas, c, ms));
    if (!canal) return true;
    escolher({ tipo: 'canal', canal, ms, time: indiceDeTimes(ev.elenco).get(canal) ?? null });
    ev.extrasDoLink = mq ? mq[1].split(',').map(ler).filter((c) => todos.includes(c)) : [];
    pintarLance();
    // Quem recebeu o link de um lance quer ver o lance, não um mapa: abre-se direto. Sem streamer no
    // link (um link antigo), escolhe-se o primeiro no ar e diz-se o que fazer.
    if (!abrirLance) return true;
    if (pedido && canal === pedido) await verLance();
    else $('estadoLance').textContent = t('evento.lanceDoLink', { canal, hora: horaLocal(ms) });
    return true;
  }

  ligar();
  // Num ecrã de toque não há roda nem Ctrl: a dica fala dos botões − e +.
  if (window.matchMedia?.('(hover: none)').matches) {
    const dica = document.querySelector('#evento .dica');
    if (dica) { dica.dataset.t = 'evento.dicaToque'; dica.textContent = t('evento.dicaToque'); }
  }
  return { abrirElenco, abrirDoTexto, abrirDoLink, abrirGuardado, esquecerEvento, lerChatTrecho, faltaLer, estado: ev };
}
