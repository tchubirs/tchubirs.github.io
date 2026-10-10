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

import {
  lerElenco, codificar, descodificar, contar, paraTexto, juntarElencos, paraArquivo, deArquivo, nomeDoArquivo,
} from './elenco.js';
import { carregarCanais, procurarAoVivo } from './carregar.js';
import {
  montarMapa, linhasVisiveis, tempoDoX, xDoTempo, zoom, oQueEstaAqui, filtrar, pintarMapa, ordenarFaixas, linhasDoTempo,
} from './mapa.js';
import { procurarAngulos, ordenarCandidatos, resumo } from './cena.js';
import { lerMaster, lerPlaylist, procurarCanais, slugDoNome } from './kick.js';
import { linhaDoCanal } from './relogio.js';
import { somDoCanal } from './alinhar.js';
import { t, tn, idiomaActual } from './idiomas.js';
import { atalhos } from './atalhos.js';
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
// "sáb 11/10": o dia da semana sem o ponto da abreviatura, e a data. É o que a régua escreve em cada
// mudança de dia.
// No idioma da página e com a abreviatura do Brasil: o português de Portugal escreve "sábado" inteiro.
const LOCAL_DO_DIA = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
const diaDaSemana = (ms) => new Date(ms).toLocaleDateString(LOCAL_DO_DIA[idiomaActual()] || [], { weekday: 'short' }).replace(/\.$/, '');
export const rotuloDoDia = (ms) => `${diaDaSemana(ms)} ${dataCurta(ms)}`;

// Quantas telas de uma vez antes de avisar. Não é um limite (o dono não quer limite de telas): passado
// isto, o primeiro clique diz quantas são e o segundo abre.
export const MUITAS_TELAS = 12;

// "Perto" de um instante, para ordenar as faixas: no ar até meia hora antes ou depois.
const PERTO_MS = 30 * 60_000;
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
export function montarEvento({
  abrirLance, memorizarVods = () => {}, aoMudarPicos = () => {}, buscar = fetch,
  // As janelas (com o foco preso dentro e devolvido ao fechar) são da página: ela passa as suas.
  dialogo = { mostrar: (m) => { m.hidden = false; }, esconder: (m) => { m.hidden = true; } },
} = {}) {
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
    // A ordem das faixas: 'time' (a de omissão), 'instante' (quem tem vídeo em `ms` primeiro), 'aoVivo',
    // 'tempo' ou 'az'. Fora da ordem por time, os grupos são os da ordem, e os fechados guardam-se aqui.
    ordem: { modo: 'time', ms: null },
    fechadasOrdem: new Set(),
    // A data, a duração e a descrição do evento, quando vieram de um evento salvo ou de um link.
    info: null,
    // O "abrir N vídeos" à espera do segundo clique, quando são muitos.
    confirmar: null,
  };

  // ── abrir ──────────────────────────────────────────────────────────────

  async function abrirElenco(elenco, { quandoMs = null, info = null } = {}) {
    ev.cancelar?.abort();
    const controlo = new AbortController();
    ev.cancelar = controlo;
    ev.elenco = elenco;
    ev.juntados = new Set();
    ev.extrasDoLink = [];
    ev.escolha = null;
    ev.cursor = null;
    ev.falhados = new Set();
    ev.ordem = { modo: ordemInicial(), ms: null };
    ev.fechadasOrdem = new Set();
    ev.info = info;
    ev.confirmar = null;
    $('lance').hidden = true;
    $('picosChat').innerHTML = '';
    $('estadoAdicionar').textContent = '';
    const todos = [...new Set([...elenco.times.flatMap((x) => x.canais), ...elenco.soltos])];
    if (!todos.length) { $('estadoEvento').textContent = t('evento.vazio'); return; }
    $('evento').hidden = false;
    $('nomeEvento').textContent = elenco.nome || t('evento.semNome');
    pintarInfo();
    pintarFuso();
    pintarOrdem();
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

  /**
   * Um .csv, .tsv ou .txt para o campo do elenco. Lido aqui, no navegador, e nunca enviado. Uma planilha
   * salva pelo Excel pode vir em UTF-16 (com a marca no início) ou em Windows-1252, e não só em UTF-8:
   * lido como UTF-8, um "ç" de Windows virava um losango e o nome do time ficava estragado.
   */
  const ARQUIVO_MAX = 5 * 1024 * 1024;
  /** O texto de um arquivo de elenco, ou { erro } com a frase a mostrar. Serve ao #elenco e ao Adicionar lista. */
  async function textoDoArquivo(arquivo) {
    const nome = arquivo.name || '';
    if (arquivo.size > ARQUIVO_MAX) return { erro: t('evento.arquivoGrande', { nome }) };
    let texto;
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      if (bytes[0] === 0xff && bytes[1] === 0xfe) texto = new TextDecoder('utf-16le').decode(bytes);
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) texto = new TextDecoder('utf-16be').decode(bytes);
      else {
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { texto = new TextDecoder('windows-1252').decode(bytes); }
      }
    } catch {
      return { erro: t('evento.arquivoErro', { nome }) };
    }
    return { texto: texto.replace(/^\uFEFF/, '') };
  }
  async function lerArquivoElenco(arquivo) {
    const nome = arquivo.name || '';
    const lido = await textoDoArquivo(arquivo);
    if (lido.erro) { $('estadoEvento').textContent = lido.erro; return; }
    $('elenco').value = lido.texto;
    $('abrirElencoTexto').textContent = t('evento.abrir');
    const elenco = lerElenco($('elenco').value);
    if (!elenco.times.length && !elenco.soltos.length) {
      $('estadoEvento').textContent = t('evento.arquivoSemCanais', { nome });
      $('elenco').focus();
      return;
    }
    const { times, canais } = contar(elenco);
    $('estadoEvento').textContent = t('evento.arquivoLido', { nome, times, canais });
    $('abrirElenco').focus();
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

  // O nome de cada grupo numa ordem que não é a dos times. É ele que fica no cabeçalho, e por isso diz
  // qual é a ordem sem ser preciso olhar para o seletor.
  function nomeDoGrupo(chave) {
    switch (chave) {
      case 'comVideo': return t('ordem.grupoComVideo', { hora: quandoCurto(ev.ordem.ms) });
      case 'perto': return t('ordem.grupoPerto', { min: PERTO_MS / 60_000 });
      case 'resto': return t('ordem.grupoResto');
      case 'aoVivo': return t('ordem.grupoAoVivo');
      case 'foraDoAr': return t('ordem.grupoForaDoAr');
      case 'tempo': return t('ordem.grupoTempo');
      case 'az': return t('ordem.grupoAz');
      default: return t('ordem.grupoTodos');
    }
  }
  // A hora de um instante, com a data quando a vista passa de um dia: "21:05" ou "sáb 11/10 21:05".
  function quandoCurto(ms) {
    const v = ev.vista;
    const variosDias = v && dataCurta(v.deMs) !== dataCurta(v.ateMs);
    return variosDias ? `${rotuloDoDia(ms)} ${horaCurta(ms)}` : horaCurta(ms);
  }
  const vivosAgora = () => new Set(ev.resultados.filter((r) => r?.estado === 'ok' && r.vods.some(aoVivoVod)).map((r) => r.slug));

  function remontar() {
    const texto = $('procurarEvento').value.trim();
    let times = texto ? filtrar(ev.times, texto) : ev.times;
    // A procurar, tudo aberto: quem escreveu um nome quer ver a faixa dele, e não um time fechado.
    let abertos = texto ? new Set(times.map((x) => x.nome)) : ev.abertos;
    let timeDe;
    if (ev.ordem.modo !== 'time') {
      // Noutra ordem os grupos são os da ordem, e cada faixa leva o nome do time ao lado do canal.
      const grupos = ordenarFaixas(times.flatMap((x) => x.canais), {
        modo: ev.ordem.modo, ms: ev.ordem.ms, coberturas: ev.coberturas, aoVivo: vivosAgora(), janela: ev.trecho, pertoMs: PERTO_MS,
      });
      times = grupos.map((g) => ({ nome: nomeDoGrupo(g.chave), canais: g.canais }));
      abertos = new Set(times.map((x) => x.nome).filter((n) => texto || !ev.fechadasOrdem.has(n)));
      timeDe = indiceDeTimes(ev.elenco);
    }
    // Num ecrã de toque as faixas crescem para um dedo (36 px em vez de 20).
    const alturas = tocar() ? { canal: 36, time: 40, resumo: 36 } : undefined;
    ev.mapa = montarMapa({ times, coberturas: ev.coberturas, abertos, alturas, timeDe });
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
        grade: { ...linhasDoTempo(ev.vista, largura), ordemMs: ev.ordem.modo === 'instante' ? ev.ordem.ms : null },
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

  // A régua: as horas em cima das faixas e, em cada mudança de dia, um traço grosso com a data escrita
  // ("sáb 11/10"). As horas são do fuso do aparelho, e isso fica escrito por baixo do mapa (#fusoEvento).
  function pintarRegua() {
    const regua = $('reguaEvento');
    if (!regua || !ev.vista) return;
    const largura = $('mapaRolo').clientWidth;
    const span = ev.vista.ateMs - ev.vista.deMs;
    // As pontas ficam de fora: um rótulo centrado no x=0 saía metade para fora da caixa.
    const margem = 24;
    // Um traço a cada passo "redondo" que dê uns 6 a 10 rótulos na largura do ecrã.
    const DIA = 86400e3;
    const passos = [60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3, 12 * 3600e3];
    // Quantos rótulos cabem: um a cada 56 px. Dez fixos embaralhavam a régua num telemóvel.
    const cabem = Math.max(2, Math.floor(largura / 56));
    const passo = passos.find((p) => span / p <= cabem) || null;
    const { dias } = linhasDoTempo(ev.vista, largura);
    let html = '';
    // Onde já há texto escrito, para as horas não se escreverem por cima das datas.
    const ocupados = [];
    let ultimoDia = -Infinity;
    for (const ms of dias) {
      const x = xDoTempo(ms, ev.vista, largura);
      html += `<i style="left:${x.toFixed(1)}px"></i>`;
      // Com muitos dias no ecrã as datas não cabem todas: o traço fica, a data só onde há espaço.
      if (x - ultimoDia < 76) continue;
      ultimoDia = x;
      const noFim = x > largura - 76;
      html += `<span class="dia${noFim ? ' fimDaRegua' : ''}" style="left:${x.toFixed(1)}px">${escapar(rotuloDoDia(ms))}</span>`;
      ocupados.push(noFim ? [x - 76, x + 4] : [x - 4, x + 76]);
    }
    // Os dois riscos que atravessam o mapa levam o nome escrito na régua (o dono, 10/10: "porque tem o
    // risco branco e outro azul"). O branco é o momento escolhido; o azul, o horário que ordena as faixas.
    const marcasRegua = [];
    if (ev.ordem.modo === 'instante' && Number.isFinite(ev.ordem.ms)) {
      marcasRegua.push({ ms: ev.ordem.ms, classe: 'ordem', texto: t('regua.ordem', { hora: horaCurta(ev.ordem.ms) }) });
    }
    if (Number.isFinite(ev.escolha?.ms)) {
      marcasRegua.push({ ms: ev.escolha.ms, classe: 'lance', texto: t('regua.lance', { hora: horaCurta(ev.escolha.ms) }) });
    }
    let chips = '';
    for (const m of marcasRegua) {
      const x = xDoTempo(m.ms, ev.vista, largura);
      if (!Number.isFinite(x) || x < 0 || x > largura) continue;
      const w = m.texto.length * 6.2 + 12;
      // Perto das pontas a etiqueta encosta para dentro, para não sair cortada.
      const lado = x < w / 2 ? ' aEsquerda' : x > largura - w / 2 ? ' aDireita' : '';
      const [a, b] = lado === ' aEsquerda' ? [x, x + w] : lado === ' aDireita' ? [x - w, x] : [x - w / 2, x + w / 2];
      // Duas etiquetas uma em cima da outra: fica a do momento escolhido, que é a que se mexe.
      if (m.classe === 'lance') for (let k = ocupados.length - 1; k >= 0; k--) {
        if (ocupados[k].ordem && b > ocupados[k][0] && a < ocupados[k][1]) { chips = chips.replace(ocupados[k].html, ''); ocupados.splice(k, 1); }
      }
      const html1 = `<b class="marcaRegua ${m.classe}${lado}" style="left:${x.toFixed(1)}px">${escapar(m.texto)}</b>`;
      chips += html1;
      const faixa = [a - 4, b + 4];
      if (m.classe === 'ordem') { faixa.ordem = true; faixa.html = html1; }
      ocupados.push(faixa);
    }
    if (passo) {
      // As divisões como num editor de vídeo: um traço maior em cada hora escrita e traços pequenos entre
      // elas, a cada fração redonda do passo (o dono, 10/10).
      const sub = { 60e3: 10e3, [5 * 60e3]: 60e3, [15 * 60e3]: 5 * 60e3, [30 * 60e3]: 5 * 60e3, 3600e3: 15 * 60e3,
        [2 * 3600e3]: 30 * 60e3, [6 * 3600e3]: 3600e3, [12 * 3600e3]: 3600e3 }[passo];
      const fusoR = new Date(ev.vista.deMs).getTimezoneOffset() * 60_000;
      if (sub && span / sub <= largura / 6) {
        for (let ms = Math.ceil((ev.vista.deMs - fusoR) / sub) * sub + fusoR; ms <= ev.vista.ateMs; ms += sub) {
          const x = xDoTempo(ms, ev.vista, largura);
          if (!Number.isFinite(x)) continue;
          const grande = Math.abs(((ms - fusoR) % passo + passo) % passo) < 1;
          html += `<em class="${grande ? 'tique grande' : 'tique'}" style="left:${x.toFixed(1)}px"></em>`;
        }
      }
      // Os passos de uma hora ou mais começam numa hora cheia do fuso do aparelho, e não do UTC: num fuso
      // de meia hora as horas da régua caíam a meio das riscas do mapa.
      const fuso = new Date(ev.vista.deMs).getTimezoneOffset() * 60_000;
      for (let ms = Math.ceil((ev.vista.deMs - fuso) / passo) * passo + fuso; ms <= ev.vista.ateMs; ms += passo) {
        const x = xDoTempo(ms, ev.vista, largura);
        if (x < margem || x > largura - margem) continue;
        if (ocupados.some(([a, b]) => x + 22 > a && x - 22 < b)) continue;
        const d = new Date(ms);
        if (d.getHours() === 0 && d.getMinutes() === 0) continue;
        html += `<span style="left:${x.toFixed(1)}px">${horaCurta(ms)}</span>`;
      }
    }
    if (ev.ordem.modo === 'instante' && Number.isFinite(ev.ordem.ms)) {
      const x = xDoTempo(ev.ordem.ms, ev.vista, largura);
      if (x >= 0 && x <= largura) html += `<i class="ordem" style="left:${x.toFixed(1)}px"></i>`;
    }
    regua.innerHTML = html + chips;
    regua.dataset.passo = String(passo ?? DIA);
  }

  // O fuso do aparelho, escrito por baixo do mapa: todas as horas da página são as dele.
  function pintarFuso() {
    let zona = '';
    let curto = '';
    try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* sem Intl */ }
    try {
      curto = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value || '';
    } catch { /* sem Intl */ }
    const fuso = [...new Set([zona.replace(/_/g, ' '), curto].filter(Boolean))].join(', ');
    $('fusoEvento').textContent = fuso ? t('evento.fuso', { fuso }) : t('evento.fusoSem');
  }

  // A data, a duração e a descrição, quando o evento as tem.
  function pintarInfo() {
    const i = ev.info || {};
    const data = i.data ? new Date(`${i.data}T12:00:00`).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const cabeca = [data, i.duracao].filter(Boolean).join(', ');
    const texto = [cabeca, i.descricao].filter(Boolean).join('. ');
    $('infoEvento').textContent = texto;
    $('infoEvento').hidden = !texto;
  }

  // ── a ordem das faixas ─────────────────────────────────────────────────

  // Os times só existem quando a lista os traz (uma coluna de time na planilha, ou "Time: canal1, canal2"
  // no texto colado). Sem eles a ordem "por time" era uma pergunta sem resposta (o dono, 10/10: "nao faço
  // ideia como voce vai saber quem sao os times"): a opção some, e a ordem de partida é quem está ao vivo
  // primeiro e depois quem saiu do ar há menos tempo.
  const temTimes = () => !!ev.elenco?.times?.length;
  const ordemInicial = () => (temTimes() ? 'time' : 'aoVivo');

  function ordenar(modo, ms = null) {
    const modos = ['time', 'instante', 'aoVivo', 'tempo', 'az'];
    const m = modos.includes(modo) && (modo !== 'time' || temTimes()) ? modo : ordemInicial();
    let quando = ms;
    if (m === 'instante' && !Number.isFinite(quando)) {
      quando = ev.cursor?.ms ?? ev.escolha?.ms ?? ev.ordem.ms ?? (ev.vista ? (ev.vista.deMs + ev.vista.ateMs) / 2 : null);
    }
    if (m === 'instante' && !Number.isFinite(quando)) return;
    ev.ordem = { modo: m, ms: m === 'instante' ? Math.round(quando) : null };
    ev.fechadasOrdem = new Set();
    ev.cursor = null;
    if (!ev.mapa) { pintarOrdem(); return; }
    remontar();
    // Os primeiros da ordem nova são o que se pediu: o mapa volta ao topo para eles se verem.
    $('mapaRolo').scrollTop = 0;
    ev.topo = 0;
    pintarOrdem();
    pintar();
  }

  function pintarOrdem() {
    // A lista mudou de times (Adicionar lista, Corrigir elenco): sem times não se fica na ordem por time.
    if (ev.ordem.modo === 'time' && !temTimes()) ev.ordem = { modo: ordemInicial(), ms: null };
    const o = ev.ordem;
    const porTime = $('ordemFaixas').querySelector('option[value="time"]');
    if (porTime) { porTime.hidden = !temTimes(); porTime.disabled = !temTimes(); }
    $('ordemFaixas').value = o.modo;
    const opcao = $('ordemFaixas').querySelector('option[value="instante"]');
    if (opcao) opcao.textContent = o.modo === 'instante' ? t('ordem.instanteHora', { hora: quandoCurto(o.ms) }) : t('ordem.instante');
    const inicial = ordemInicial();
    $('ordemVoltar').hidden = o.modo === inicial;
    $('ordemVoltarTime').hidden = inicial !== 'time';
    $('ordemVoltarAoVivo').hidden = inicial === 'time';
    $('ordemAtiva').textContent = o.modo === 'instante' ? t('ordem.ativaInstante', { hora: quandoCurto(o.ms) })
      : o.modo === inicial ? '' : t('ordem.ativa', { ordem: t(`ordem.${o.modo}`) });
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
    if (alvo.ordenar) {
      // O ícone de ordenar no cabeçalho: abre a ordem das faixas, sem fechar o grupo.
      const seletor = $('ordemFaixas');
      seletor.scrollIntoView?.({ block: 'nearest' });
      seletor.focus();
      try { seletor.showPicker?.(); } catch { /* sem showPicker, o foco já mostra onde é */ }
      return;
    }
    if ((alvo.tipo === 'time' || alvo.tipo === 'resumo') && ev.ordem.modo !== 'time') {
      // Um grupo só é toda a gente: fechá-lo deixava o evento numa linha só (como o "Sem time", abaixo).
      const grupos = new Set(ev.mapa.linhas.filter((x) => x.tipo === 'time' || x.tipo === 'resumo').map((x) => x.time));
      if (grupos.size <= 1 && !ev.fechadasOrdem.has(alvo.time)) return;
      if (ev.fechadasOrdem.has(alvo.time)) ev.fechadasOrdem.delete(alvo.time);
      else ev.fechadasOrdem.add(alvo.time);
      remontar();
      pintar();
      return;
    }
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
    ev.confirmar = null;
    $('avisoMuitos').textContent = '';
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
    // O zoom do mapa usa as mesmas teclas do zoom da linha do tempo, as que a pessoa escolheu.
    const zoomId = atalhos.acaoDe(e)?.id;
    if (zoomId === 'zoomMais') $('aproximar').click();
    else if (zoomId === 'zoomMenos') $('afastar').click();
    else switch (e.key) {
      case 'ArrowUp': i = Math.max(0, i - 1); break;
      case 'ArrowDown': i = Math.min(linhas.length - 1, i + 1); break;
      case 'ArrowLeft': ms -= span / (e.shiftKey ? 5 : 20); break;
      case 'ArrowRight': ms += span / (e.shiftKey ? 5 : 20); break;
      case 'Home': ms = ev.vista.deMs; break;
      case 'End': ms = ev.vista.ateMs; break;
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
  // A escolha mora no último passo do Ler chat da faixa (o dono, 10/10: "lembra que no chat tem a opção
  // da precisão"). Saiu do painel do lance do mapa ("isso deixa só quando tiver na outra tela do editor");
  // continua guardada e vale para os picos do mapa também.
  function pintarComoPico() {
    const { fator, minimo } = SENSIBILIDADES[sensibilidade];
    const frase = t('lance.comoPico', { fator: fator.toLocaleString(idiomaActual()), minimo });
    if (!$('sensibilidadeFaixa')) return;
    $('sensibilidadeFaixa').value = sensibilidade;
    $('comoPicoFaixa').textContent = frase;
  }
  async function lerChatDoTime(e) {
    chatControlo?.abort();
    const controlo = new AbortController();
    chatControlo = controlo;
    const deMs = Math.floor((e.ms - CHAT_JANELA_MS / 2) / CHAT_GRELHA_MS) * CHAT_GRELHA_MS;
    const ateMs = Math.min(Date.now(), deMs + CHAT_JANELA_MS);
    const doTime = colegas(e.canal).filter((c) => noArEm(ev.coberturas, c, e.ms));
    const canais = doTime.filter((c) => !chatLido.has(`${c}|${deMs}`) && faltaLer(c, deMs, ateMs).length);
    let feitos = 0;
    const aLer = 'lance.aLerChat';
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
    ultimaLeitura = { e, doTime, deMs, ateMs };
    pintarPicos(e, doTime, deMs, ateMs);
    await adiantarPicos(doTime, deMs, controlo.signal).catch(() => {});
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
  function pintarPicos(e, doTime, deMs, ateMs) {
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
    const quem = t('lance.doTime');
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
    pintarAbrirVarios(e);
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

  async function verLance(lista = null, opcoes = {}) {
    const e = ev.escolha;
    if (!e) return;
    const canais = Array.isArray(lista) ? lista : canaisDoLance(e);
    if (!canais.length) return;
    const foco = canais.includes(e.canal) ? e.canal : canais[0];
    mostrarMapa(false);
    let soltar;
    livre = new Promise((r) => { soltar = r; });
    try {
      await abrirLance(canais, e.ms, foco, opcoes);
      // O dono, 10/10: com o lance aberto o que importa é o visor. Se o mapa voltou a abrir enquanto os
      // vídeos carregavam, fecha-se outra vez na barra, e num ecrã estreito a página desce até ao visor.
      mostrarMapa(false);
      irAoVisor();
    } finally {
      soltar();
    }
  }

  /** Pôr o visor do lance à vista. No PC a página não rola (ver estilo.css), no telemóvel desce até ele. */
  function irAoVisor() {
    const palco = document.getElementById('palco');
    if (!palco || palco.hidden) return;
    if (window.innerWidth >= 1080 && window.innerHeight >= 640) { window.scrollTo({ top: 0 }); return; }
    // Dois quadros: no primeiro a barra do evento ainda está a encolher, e o visor ficava cortado no topo.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, palco.getBoundingClientRect().top + window.scrollY - 16) });
    }));
  }

  // ── abrir mais do que o time ───────────────────────────────────────────
  //
  // O dono, 10/10: escolher um momento e abrir TODOS os que têm vídeo nesse horário (as gravações, também
  // de quem já saiu do ar), ou só quem continua ao vivo. Quem se escolheu vai à frente.
  function comVideoEm(e) {
    const ok = ev.resultados.filter((r) => r?.estado === 'ok').map((r) => r.slug);
    const lista = ok.filter((c) => noArEm(ev.coberturas, c, e.ms));
    return lista.includes(e.canal) ? [e.canal, ...lista.filter((c) => c !== e.canal)] : lista;
  }
  function aoVivoEm(e) {
    const vivos = vivosAgora();
    return comVideoEm(e).filter((c) => vivos.has(c));
  }
  function pintarAbrirVarios(e) {
    const todos = comVideoEm(e);
    const vivos = aoVivoEm(e);
    const espera = ev.confirmar;
    $('abrirTodosVodTexto').textContent = espera?.tipo === 'todos' ? t('lance.abrirMesmo', { n: todos.length })
      : t('lance.abrirTodosVod', { n: todos.length });
    $('abrirTodosVod').disabled = !todos.length;
    $('abrirTodosVod').title = t('lance.abrirTodosVodAjuda');
    $('abrirSoAoVivoTexto').textContent = espera?.tipo === 'vivos' ? t('lance.abrirMesmo', { n: vivos.length })
      : t('lance.abrirSoAoVivo', { n: vivos.length });
    $('abrirSoAoVivo').disabled = !vivos.length;
    $('abrirSoAoVivo').title = vivos.length ? t('lance.abrirSoAoVivoAjuda') : t('lance.ninguemAoVivo');
  }
  async function abrirVarios(tipo) {
    const e = ev.escolha;
    if (!e) return;
    const canais = tipo === 'todos' ? comVideoEm(e) : aoVivoEm(e);
    if (!canais.length) return;
    // Muitos de uma vez: o primeiro clique avisa, o segundo abre. Nada é cortado.
    const chave = `${tipo}|${e.ms}|${canais.length}`;
    if (canais.length > MUITAS_TELAS && ev.confirmar?.chave !== chave) {
      ev.confirmar = { tipo, chave };
      $('avisoMuitos').textContent = t('lance.muitos', { n: canais.length });
      pintarAbrirVarios(e);
      return;
    }
    ev.confirmar = null;
    $('avisoMuitos').textContent = '';
    pintarAbrirVarios(e);
    await verLance(canais, { exato: true });
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
    ev.info = null;
    dialogo.esconder($('modalPartilhar'));
    dialogo.esconder($('modalAdicionar'));
    mostrarMapa(false);
    // pushState e não replaceState: o Voltar do browser traz o evento de volta (ver o popstate).
    if (salvoDoEndereco()) history.pushState(null, '', location.pathname);
    else if (/[#&]evento=/.test(location.hash)) history.pushState(null, '', location.pathname + location.search);
  }

  // ── compartilhar ───────────────────────────────────────────────────────
  //
  // O dono, 10/10: o link com a lista inteira tem milhares de letras. O evento ganha um nome (e, se quiser,
  // data, duração e descrição), e quando ele está salvo no site (eventos/<nome>.json) o link é curto:
  // index.html?e=<nome>. Um site estático não guarda nada sozinho; para um evento que ainda não está lá,
  // sai o link longo de sempre, com o nome dentro, e o arquivo pronto para quem publica o site.

  /** O nome do evento salvo pedido no endereço (?e=<nome>), já no formato do arquivo, ou ''. */
  function salvoDoEndereco(busca = location.search) {
    let pedido = '';
    try { pedido = new URLSearchParams(busca).get('e') || ''; } catch { pedido = ''; }
    return nomeDoArquivo(pedido);
  }

  /** O evento salvo em eventos/<nome>.json (mesma origem), ou null. */
  async function lerSalvo(nome) {
    if (!/^[a-z0-9-]{1,60}$/.test(nome)) return null;
    try {
      const r = await fetch(`eventos/${nome}.json`, { cache: 'no-cache' });
      if (!r.ok) return null;
      return deArquivo(JSON.parse(await r.text()));
    } catch { return null; }
  }

  /** O nome e os dados do evento como parâmetros do link longo. */
  function paramsDoNome(nome, info) {
    const enc = encodeURIComponent;
    return (nome ? `&nome=${enc(nome)}` : '')
      + (info?.data ? `&data=${enc(info.data)}` : '')
      + (info?.duracao ? `&dur=${enc(info.duracao)}` : '')
      + (info?.descricao ? `&desc=${enc(info.descricao)}` : '');
  }

  /** O lance escolhido como parâmetros: o instante, o streamer, os ângulos a mais e o atraso. */
  function paramsDoLance(e) {
    // O link do lance leva o streamer escolhido e os ângulos a mais: sem isso quem o abria ficava com
    // o primeiro streamer do primeiro time, que é quase sempre outro.
    const extras = e ? canaisDoLance(e).filter((c) => !colegas(e.canal).includes(c)) : [];
    return (e ? `&t=${Math.round(e.ms)}&c=${encodeURIComponent(e.canal)}` : '')
      + (extras.length ? `&mais=${extras.map(encodeURIComponent).join(',')}` : '')
      + (ev.atrasoMin !== ATRASO_MIN ? `&atraso=${ev.atrasoMin}` : '');
  }

  function abrirPartilhar() {
    if (!ev.elenco) return;
    const nome = ev.elenco.nome && ev.elenco.nome !== t('evento.semNome') ? ev.elenco.nome : '';
    $('partilharNome').value = nome;
    $('partilharNome').removeAttribute('aria-invalid');
    $('partilharNomeErro').hidden = true;
    $('partilharData').value = ev.info?.data || '';
    $('partilharDuracao').value = ev.info?.duracao || '';
    $('partilharDescricao').value = ev.info?.descricao || '';
    const e = ev.escolha;
    $('partilharLanceCampo').hidden = !e;
    $('partilharComLance').checked = !!e;
    if (e) $('partilharLanceTexto').textContent = t('partilhar.comLance', { canal: e.canal, hora: horaLocal(e.ms) });
    $('resultadoPartilhar').hidden = true;
    $('estadoPartilhar').textContent = '';
    dialogo.mostrar($('modalPartilhar'));
    $('partilharNome').focus();
  }

  let paraBaixar = null;
  async function gerarLink(evento) {
    evento?.preventDefault();
    const nome = $('partilharNome').value.trim().slice(0, 80);
    if (!nome) {
      $('partilharNomeErro').hidden = false;
      $('partilharNome').setAttribute('aria-invalid', 'true');
      $('partilharNome').focus();
      return;
    }
    const info = {
      data: $('partilharData').value || null,
      duracao: $('partilharDuracao').value.trim() || null,
      descricao: $('partilharDescricao').value.trim() || null,
    };
    // O nome e os dados ficam no evento aberto: o título muda, e o próximo link já os leva.
    ev.elenco.nome = nome;
    ev.info = info;
    $('nomeEvento').textContent = nome;
    pintarInfo();
    lembrarEvento();
    const e = ev.escolha && !$('partilharLanceCampo').hidden && $('partilharComLance').checked ? ev.escolha : null;
    const arquivo = nomeDoArquivo(nome);
    const salvo = arquivo ? await lerSalvo(arquivo) : null;
    const base = `${location.origin}${location.pathname}`;
    const lance = paramsDoLance(e);
    let url;
    let nota;
    if (salvo) {
      url = `${base}?e=${arquivo}${lance ? `#${lance.slice(1)}` : ''}`;
      const doSite = new Set([...salvo.times.flatMap((x) => x.canais), ...salvo.soltos]);
      const aqui = [...ev.elenco.times.flatMap((x) => x.canais), ...ev.elenco.soltos];
      const iguais = aqui.length === doSite.size && aqui.every((c) => doSite.has(c));
      nota = iguais ? t('partilhar.curto') : t('partilhar.curtoDiferente', { n: doSite.size, m: aqui.length });
      paraBaixar = null;
    } else {
      // `codificar` dá null a um elenco que não se poderia abrir de um link (mais de 2000 canais).
      if (ev.link === null) {
        $('resultadoPartilhar').hidden = false;
        $('linkPartilhar').value = '';
        $('estadoPartilhar').textContent = t('evento.linkGrande');
        return;
      }
      url = `${base}#evento=${ev.link}${paramsDoNome(nome, info)}${lance}`;
      nota = t('partilhar.longo');
      paraBaixar = { arquivo: arquivo || 'evento', dados: paraArquivo(ev.elenco, { nome, ...info }) };
    }
    $('baixarArquivoEvento').hidden = !paraBaixar;
    $('linkPartilhar').value = url;
    $('resultadoPartilhar').hidden = false;
    $('estadoPartilhar').textContent = nota;
    await copiarLink(nota);
  }

  async function copiarLink(nota = '') {
    const url = $('linkPartilhar').value;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      $('estadoPartilhar').textContent = [nota, t('partilhar.copiado')].filter(Boolean).join(' ');
    } catch {
      // Sem área de transferência o link fica no campo, escolhido, pronto a copiar à mão.
      $('estadoPartilhar').textContent = [nota, t('partilhar.copieAMao')].filter(Boolean).join(' ');
      $('linkPartilhar').focus();
      $('linkPartilhar').select();
    }
  }

  function baixarArquivo() {
    if (!paraBaixar) return;
    const blob = new Blob([`${JSON.stringify(paraBaixar.dados, null, 2)}\n`], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${paraBaixar.arquivo}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ── adicionar gente ao evento aberto ───────────────────────────────────
  //
  // O dono, 10/10: um streamer pela busca da Kick (com time ou sem), ou uma lista colada ou aberta de um
  // arquivo. Só os novos são pedidos à Kick; o mapa, a vista, o lance e os times abertos ficam como estão.

  function abrirAdicionar(modo) {
    if (!ev.elenco) return;
    const um = modo === 'um';
    $('adicionarTitulo').textContent = t(um ? 'adicionar.streamerTitulo' : 'adicionar.listaTitulo');
    $('adicionarUm').hidden = !um;
    $('adicionarVarios').hidden = um;
    $('estadoAdicionarJanela').textContent = '';
    if (um) {
      $('adicionarProcura').value = '';
      $('adicionarSugestoes').innerHTML = '';
      $('adicionarTime').value = '';
      $('adicionarTimes').innerHTML = ev.elenco.times.map((x) => `<option value="${escapar(x.nome)}"></option>`).join('');
    }
    dialogo.mostrar($('modalAdicionar'));
    $(um ? 'adicionarProcura' : 'adicionarTexto').focus();
  }

  const noEvento = (slug) => ev.elenco.times.some((x) => x.canais.includes(slug)) || ev.elenco.soltos.includes(slug);
  const seguidoresCurto = (n) => {
    try { return new Intl.NumberFormat(idiomaActual(), { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(n); }
  };
  let procuraAdicionar = { timer: null, controlo: null };
  function procurarParaAdicionar() {
    const termo = $('adicionarProcura').value.trim();
    clearTimeout(procuraAdicionar.timer);
    procuraAdicionar.controlo?.abort();
    $('adicionarSugestoes').innerHTML = '';
    if (termo.length < 2) return;
    procuraAdicionar.timer = setTimeout(async () => {
      const controlo = new AbortController();
      procuraAdicionar.controlo = controlo;
      let achados = [];
      try { achados = await procurarCanais(termo, { buscar, sinal: controlo.signal }); } catch { return; }
      if (controlo.signal.aborted) return;
      $('adicionarSugestoes').innerHTML = achados.map((c) => {
        const ja = noEvento(c.slug);
        const nota = ja ? t('adicionar.jaNoEvento')
          : [t('procurar.seguidores', { n: seguidoresCurto(c.seguidores) }), c.aoVivo ? t('procurar.aoVivo') : ''].filter(Boolean).join(', ');
        return `<li><button type="button" data-slug="${escapar(c.slug)}"${ja ? ' disabled' : ''}>`
          + `<span>${escapar(c.slug)}</span><span class="nota">${escapar(nota)}</span></button></li>`;
      }).join('');
    }, 250);
  }

  async function adicionarUm(slug = null) {
    const nome = slugDoNome(slug ?? $('adicionarProcura').value);
    if (!nome) { $('estadoAdicionarJanela').textContent = t('adicionar.escreva'); $('adicionarProcura').focus(); return; }
    const time = $('adicionarTime').value.trim();
    const extra = time ? { times: [{ nome: time, canais: [nome] }], soltos: [] } : { times: [], soltos: [nome] };
    await acrescentar(extra);
  }

  async function adicionarLista() {
    const extra = lerElenco($('adicionarTexto').value);
    if (!extra.times.length && !extra.soltos.length) {
      $('estadoAdicionarJanela').textContent = t('evento.semCanais');
      $('adicionarTexto').focus();
      return;
    }
    const feito = await acrescentar(extra);
    if (feito) $('adicionarTexto').value = '';
  }

  /** Juntar `extra` ao evento aberto e ler na Kick só os canais novos. Devolve quantos entraram. */
  async function acrescentar(extra) {
    if (!ev.elenco) return 0;
    const { elenco, novos } = juntarElencos(ev.elenco, extra);
    if (!novos.length) { $('estadoAdicionarJanela').textContent = t('adicionar.nadaNovo'); return 0; }
    $('estadoAdicionarJanela').textContent = t('adicionar.aCarregar', { feitos: 0, total: novos.length });
    let lidos;
    try {
      lidos = await carregarCanais(novos, {
        buscar,
        aoProgredir: ({ feitos, total }) => { $('estadoAdicionarJanela').textContent = t('adicionar.aCarregar', { feitos, total }); },
      });
    } catch {
      $('estadoAdicionarJanela').textContent = t('evento.erro');
      return 0;
    }
    if (!ev.elenco) return 0;
    elenco.nome = ev.elenco.nome;
    ev.elenco = elenco;
    ev.resultados = [...ev.resultados.filter((r) => !novos.includes(r?.slug)), ...lidos];
    memorizarVods(ev.resultados);
    pintarAvisos();
    ev.coberturas = coberturasDe(ev.resultados);
    const aoVivo = pintarResumo();
    ev.times = [...elenco.times];
    if (elenco.soltos.length) ev.times.push({ nome: null, canais: elenco.soltos });
    // O time que recebeu gente abre, para os novos se verem; os outros ficam como estavam.
    for (const x of elenco.times) if (x.canais.some((c) => novos.includes(c))) ev.abertos.add(x.nome);
    if (elenco.soltos.some((c) => novos.includes(c))) ev.abertos.add(null);
    remontar();
    const { inicioMs, fimMs } = ev.mapa;
    if (Number.isFinite(inicioMs) && Number.isFinite(fimMs)) {
      const tinha = ev.limites && Number.isFinite(ev.limites.deMs) && Number.isFinite(ev.limites.ateMs);
      ev.limites = tinha
        ? { deMs: Math.min(ev.limites.deMs, inicioMs), ateMs: Math.max(ev.limites.ateMs, fimMs) }
        : { deMs: inicioMs, ateMs: fimMs };
      // Um evento que abriu sem vídeo nenhum ganha agora a vista que não tinha.
      if (!tinha || !ev.vista || !Number.isFinite(ev.vista.deMs)) {
        const trecho = trechoDoEvento(ev.coberturas);
        ev.vista = trecho
          ? { deMs: Math.max(ev.limites.deMs, trecho.deMs), ateMs: Math.min(ev.limites.ateMs, trecho.ateMs) }
          : { ...ev.limites };
        ev.trecho = { ...ev.vista };
      }
    }
    ev.link = await codificar(ev.elenco);
    lembrarEvento();
    if (aoVivo > 0 && !aoVivoControlo) seguirAoVivo(true);
    if (ev.escolha) pintarLance(); else pintar();
    const lista = novos.length > 6 ? `${novos.slice(0, 6).join(', ')} +${novos.length - 6}` : novos.join(', ');
    const semVideo = lidos.filter((r) => r?.estado !== 'ok').length;
    const frase = tn(novos.length, 'adicionar.feitoUm', 'adicionar.feitos', { n: novos.length, lista })
      + (semVideo ? ` ${t('adicionar.semVideo', { n: semVideo })}` : '');
    $('estadoAdicionar').textContent = frase;
    dialogo.esconder($('modalAdicionar'));
    return novos.length;
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
    const mudarSensibilidade = (e) => {
      sensibilidade = SENSIBILIDADES[e.target.value] ? e.target.value : 'normal';
      try { localStorage.setItem(GUARDADA_SENS, sensibilidade); } catch { /* janela privada */ }
      for (const c of janelasLidas.keys()) ev.marcas.set(c, marcasDoChat(c));
      pintarComoPico();
      aoMudarPicos();
      pintar();
      const u = ultimaLeitura;
      if (u && u.e === ev.escolha) pintarPicos(u.e, u.doTime, u.deMs, u.ateMs);
    };
    if ($('sensibilidadeFaixa')) $('sensibilidadeFaixa').onchange = mudarSensibilidade;
    pintarComoPico();
    $('mostrarMapa').onclick = () => mostrarMapa(!$('evento').classList.contains('comMapa'));
    $('fecharEvento').onclick = fecharEvento;
    $('irAoVivo').onclick = irAoVivo;
    $('procurarOutros').onclick = procurarOutros;
    $('partilharEvento').onclick = abrirPartilhar;
    $('formPartilhar').addEventListener('submit', gerarLink);
    $('fecharPartilhar').onclick = () => dialogo.esconder($('modalPartilhar'));
    $('copiarLinkPartilhar').onclick = () => copiarLink();
    $('baixarArquivoEvento').onclick = baixarArquivo;
    $('partilharNome').addEventListener('input', () => {
      $('partilharNomeErro').hidden = true;
      $('partilharNome').removeAttribute('aria-invalid');
    });
    // A ordem das faixas: o seletor, o voltar, e um clique na régua.
    $('ordemFaixas').onchange = () => ordenar($('ordemFaixas').value);
    $('ordemVoltar').onclick = () => { ordenar(ordemInicial()); $('ordemFaixas').focus(); };
    $('reguaEvento').addEventListener('click', (e) => {
      if (!ev.vista) return;
      const caixa = $('mapaRolo').getBoundingClientRect();
      const ms = tempoDoX(e.clientX - caixa.left, ev.vista, $('mapaRolo').clientWidth);
      if (ms != null) ordenar('instante', ms);
    });
    $('abrirTodosVod').onclick = () => abrirVarios('todos');
    $('abrirSoAoVivo').onclick = () => abrirVarios('vivos');
    // Adicionar gente com o evento aberto.
    $('adicionarStreamer').onclick = () => abrirAdicionar('um');
    $('adicionarLista').onclick = () => abrirAdicionar('lista');
    $('fecharAdicionar').onclick = () => dialogo.esconder($('modalAdicionar'));
    $('adicionarProcura').oninput = procurarParaAdicionar;
    $('adicionarProcura').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarUm(); } };
    $('adicionarUmBotao').onclick = () => adicionarUm();
    $('adicionarSugestoes').onclick = (e) => {
      const b = e.target.closest('button[data-slug]');
      if (b && !b.disabled) adicionarUm(b.dataset.slug);
    };
    $('adicionarVariosBotao').onclick = adicionarLista;
    $('adicionarArquivo').onclick = () => $('adicionarArquivoCampo').click();
    $('adicionarArquivoCampo').addEventListener('change', async () => {
      const arquivo = $('adicionarArquivoCampo').files?.[0];
      $('adicionarArquivoCampo').value = '';
      if (!arquivo) return;
      const lido = await textoDoArquivo(arquivo);
      if (lido.erro) { $('estadoAdicionarJanela').textContent = lido.erro; return; }
      $('adicionarTexto').value = lido.texto;
      const extra = lerElenco(lido.texto);
      const { times, canais } = contar(extra);
      $('estadoAdicionarJanela').textContent = canais
        ? t('evento.arquivoLido', { nome: arquivo.name || '', times, canais })
        : t('evento.arquivoSemCanais', { nome: arquivo.name || '' });
      $(canais ? 'adicionarVariosBotao' : 'adicionarTexto').focus();
    });
    // As duas janelas do evento: o Esc e um clique fora fecham, como as da página.
    for (const id of ['modalPartilhar', 'modalAdicionar']) {
      $(id).addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        dialogo.esconder($(id));
      });
      $(id).addEventListener('click', (e) => { if (e.target === $(id)) dialogo.esconder($(id)); });
    }
    $('corrigirElenco').onclick = corrigirElenco;
    $('elenco').addEventListener('paste', colarPagina);
    $('elenco').addEventListener('input', () => { $('abrirElencoTexto').textContent = t('evento.abrir'); });
    // Abrir a lista de um arquivo (o dono, 10/10). O botão abre o seletor de arquivos do sistema (no
    // celular, o dos arquivos do telefone), e o texto vai para o campo como se tivesse sido colado.
    $('abrirArquivoElenco').onclick = () => $('arquivoElenco').click();
    $('arquivoElenco').addEventListener('change', async () => {
      const arquivo = $('arquivoElenco').files?.[0];
      $('arquivoElenco').value = '';
      if (arquivo) await lerArquivoElenco(arquivo);
    });
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
      if ((/[#&]evento=/.test(location.hash) || salvoDoEndereco()) && !ev.elenco) abrirDoLink();
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
        nome: ev.elenco?.nome || null, info: ev.info || null,
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
      + paramsDoNome(g.nome, g.info)
      + (Number.isFinite(g.t) ? `&t=${Math.round(g.t)}` : '')
      + (g.c ? `&c=${encodeURIComponent(g.c)}` : '')
      + (Number.isFinite(g.atraso) && g.atraso !== ATRASO_MIN ? `&atraso=${g.atraso}` : '');
    // Os vídeos já voltam pela sessão guardada da página: abrir o lance outra vez trocava a noite e
    // apagava as kills marcadas nela.
    return abrirDoLink(hash, { abrirLance: false });
  }

  async function abrirDoLink(hash = location.hash, { abrirLance = true, busca = location.search } = {}) {
    const m = /[#&]evento=([^&]+)/.exec(hash);
    const ler = (x) => { try { return decodeURIComponent(x); } catch { return ''; } };
    const param = (nome) => { const r = new RegExp(`[&#]${nome}=([^&]*)`).exec(hash); return r ? ler(r[1]) : ''; };
    let elenco;
    let info = null;
    if (m) {
      elenco = await descodificar(m[1]);
      if (!elenco) { $('estadoEvento').textContent = t('evento.linkEstragado'); return false; }
      // O nome e os dados do evento vão no link longo, ao lado da lista.
      elenco.nome = param('nome').slice(0, 80) || elenco.nome;
      info = { data: /^\d{4}-\d{2}-\d{2}$/.test(param('data')) ? param('data') : null, duracao: param('dur').slice(0, 40) || null, descricao: param('desc').slice(0, 500) || null };
    } else {
      // O link curto: index.html?e=<nome> lê eventos/<nome>.json, salvo no site.
      const pedido = salvoDoEndereco(busca);
      if (!pedido) return false;
      const lido = await lerSalvo(pedido);
      if (!lido) { $('estadoEvento').textContent = t('evento.salvoNaoExiste', { nome: pedido }); return false; }
      elenco = { times: lido.times, soltos: lido.soltos, avisos: [], nome: lido.nome };
      info = lido.info;
    }
    const tq = /[&#]t=(\d+)/.exec(hash);
    const aq = /[&#]atraso=(\d+)/.exec(hash);
    const cq = /[&#]c=([^&]+)/.exec(hash);
    const mq = /[&#]mais=([^&]+)/.exec(hash);
    ev.atrasoMin = aq ? Number(aq[1]) : ATRASO_MIN;
    $('elenco').value = '';
    await abrirElenco(elenco, { quandoMs: tq ? Number(tq[1]) : null, info });
    if (!tq) return true;
    const ms = Number(tq[1]);
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
  return {
    abrirElenco, abrirDoTexto, abrirDoLink, abrirGuardado, esquecerEvento, lerChatTrecho, faltaLer, pintarComoPico, ordenar, estado: ev,
  };
}
