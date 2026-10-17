// The page. Everything runs in the browser; there is no server in this product.
//
// Only the focus tile decodes at a real rendition and carries sound. The rest
// run at 160p @ 230 kbps, which measured on four unrelated channels is the
// bottom rung of Kick's ladder and is what makes thirty tiles a home-connection
// problem rather than a server problem.

import './dicas.js';
import {
  vodsDoCanal, lerMaster, lerPlaylist, procurarCanais, lerLinkKick, clipeDaKick, vodDaKick, idDaPaginaDoVod, DESCONHECIDO, slugDoNome,
  segmentosNaJanela,
} from './kick.js?v=72807425b4';
import {
  linhaDoCanal, janelaComum, onde, trechoComum, quantosNoAr, comNudge, paraLink, doLink, seguirAncora,
  passoDoArrasto, ARRASTO_INTERVALO_MS, ARRASTO_ESPERA_MS, vistaDaLinha, saiuDaVista,
  ZOOM_MIN_MS, larguraDoZoom, valorDoZoom, zoomEmVolta, andarVista,
} from './relogio.js?v=72807425b4';
import { cortarTodosOsAngulos } from './baixar.js?v=72807425b4';
import { juntarMp4 } from './mp4.js?v=72807425b4';
import { juntarGravados } from './juntar-gravados.js?v=72807425b4';
import { instanteAoVivo, bordaAoVivo, medirAtraso, instantesAoVivo, ATRASO_PADRAO_MS } from './aovivo.js?v=72807425b4';
import { alinharPeloSom, custoEstimadoMB, instantesParaOuvir } from './alinhar.js?v=72807425b4';
import { abrirJanela, irAEcraCheio, capacidades } from './janela.js?v=72807425b4';
import { ordemDosAngulos, aplicarOrdem } from './grelha.js?v=72807425b4';
import {
  RETRATO, enquadramentoInicial, limitar, desenhar, gravar, formatoQueFunciona, extensaoDe, prepararSomDaGravacao,
  reformar, limparDivisao, DIVISAO_OMISSAO, divisaoDoQuadro, proporcaoDoQuadro, encaixar,
  MODELO_OMISSAO, limparModelo, paraFraccoes, deFraccoes, DEITADO, ZONA_TIKTOK,
} from './retrato.js?v=72807425b4';
import {
  abrirDetector, abrirQuadrosEscondidos, procurarRosto, caixaDaWebcam, instantesDoClipe, degrauDoRosto,
  rostoGuardado, guardarRosto,
} from './rosto.js?v=72807425b4';
import {
  limparChat, geometria as geometriaDoChat, desenharChat, mensagensDoClipe, prepararEmotes,
  VIDA_MAX_MS as VIDA_CHAT_MS, LETRA as LETRA_CHAT, retanguloDoChat, CHAT_OMISSAO,
} from './chat-clipe.js?v=72807425b4';
import { ligarCaixa, estiloDaCaixa } from './caixa-previa.js?v=72807425b4';
import {
  limparLegenda, limparTranscricao, geometriaLegenda, desenharLegenda, transcricaoDoAudio, textoDaLinha,
  editarLinha, apagarLinha, deslocarLinha, rotuloTempo, cobre, linhaNoInstante, PASSO_MS, fonteDe as fonteDaLegenda,
  idiomaParaOuvir, segurarMs, retanguloDaLegenda, LEGENDA_OMISSAO,
} from './legenda.js?v=72807425b4';
import { abrirVoz, somDosPedacos, degrauDoSom, estimativaS, faltaBaixar } from './legenda-voz.js?v=72807425b4';
import { guardarFala, linhasDaTranscricao } from './falas.js?v=72807425b4';
import { tituloDeDeteccao, confDoSom } from './titulo.js?v=72807425b4';
import { podeLer } from './ler-tela.js?v=72807425b4';
import { planoDeAngulos, gravarAngulos } from './angulos.js?v=72807425b4';
import { agruparPorNoite, rotuloDaNoite, noiteParaAbrir } from './noites.js?v=72807425b4';
import {
  novoMomento, acrescentar, remover, removerVarios, planoDaMontagem, ordenar,
  alternarVitima, filtrar, temMorte, clipesDoMomento, comAjuste, numeroNaMontagem,
  ajusteDe, ajustesQueContam, momentosParaLink, momentosDoLink, comVitimaEscrita, semVitimaEscrita,
} from './momentos.js?v=72807425b4';
import { lerApelidos } from './nomes.js?v=72807425b4';
import {
  planearCorte, executarCorte, nomeDoFicheiro, largarOQueNaoServe, oQueFalta,
} from './baixar.js?v=72807425b4';
import { criarZip, crc32 } from './zip.js?v=72807425b4';
import { retencaoDoCanal, prazoDoVod, ordemDeGuardar } from './prazo.js?v=72807425b4';
import { eDoJogo } from './jogo.js?v=72807425b4';
import { fcpxmlMulticam, textoDoPacote, linkDoVod } from './pacote.js?v=72807425b4';
import { queFazerComOLeitor, limitarSaltos } from './leitor.js?v=72807425b4';
import { criarApanhador } from './frames.js?v=72807425b4';
import { varrerNoite, custoVarrerMB } from './procurar-momentos.js?v=72807425b4';
import { alertasDoCanal } from './alertas.js?v=72807425b4';
import {
  ESPERTO_A_PARTIR_MS, janelasDosPicos, msPorOuvir, somaMs, juntar, eMuito, estimarFalta, tempoFalta,
} from './ouvir.js?v=72807425b4';
import { TAXA_TIROS } from './tiros.js?v=72807425b4';
import { termosDoFiltro, momentosDePalavras } from './chat.js?v=72807425b4';
import { SENSIBILIDADES_DETECAO, opcoesDaSensibilidade, juntarProximos } from './lances.js?v=72807425b4';
import { parecidos, juntarPerto } from './aprender.js?v=72807425b4';
import { somDoCanal } from './alinhar.js?v=72807425b4';
import {
  MAXIMO_S, mover, janelaInicial, nomeDoClipe, posicaoDaCabeca, dentroDosLimites, duracaoCurta,
} from './clipe.js?v=72807425b4';
import { IDIOMAS, t, tn, definirIdioma, idiomaDoBrowser, idiomaActual, aplicarIdioma } from './idiomas.js?v=72807425b4';
import { notaDeMorte, quemMorreu, medir, limiar, pareceMorto } from './morte.js?v=72807425b4';
import { escapar } from './escapar.js?v=72807425b4';
import { montarEvento, rotuloDoDia } from './evento-ui.js?v=72807425b4';
import { montarPortas } from './portas.js?v=72807425b4';
import { montarSimples, modoSimples } from './simples.js?v=72807425b4';
import { prepararPovs } from './povs-preparar.js?v=72807425b4';
import { atalhos, ACAO, comboDoEvento, partes } from './atalhos.js?v=72807425b4';
import { montarPainelAtalhos, pintarDicas } from './atalhos-painel.js?v=72807425b4';

/* Os glifos dos controlos do vídeo são DESENHO e não emoji.
   Um ⏸ ou um 🔇 sai diferente em cada sistema — no iPhone sai a cores, no
   Android sai de outra família, e no Windows sai de uma terceira. Uma barra
   de leitor com três desenhos de três sítios diferentes não é uma barra:
   é o que estava aqui. Os símbolos vivem no sprite da página (ver o topo do
   index.html) e herdam a cor do texto como tudo o resto. */
const ICONE = (nome, classe = 'ic ic-p') =>
  `<svg class="${classe}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

const $ = (id) => document.getElementById(id);
const estado = {
  linhas: [],
  janela: null,
  // Como estão dispostos os quadrados: 'adicionado' ou 'az'. É uma preferência
  // dele e não parte da noite, por isso vive no dispositivo e não no link.
  ordemGrelha: 'adicionado',
  // Quantos segundos de noite é que a linha do tempo mostra. Zero = a noite
  // toda, que é como sempre esteve.
  zoomS: 0,
  vista: null,
  // A forma do som de cada canal em cada instante medido. Vive aqui e não
  // dentro do alinhamento para sobreviver entre sincronizações: acrescentar
  // um canal a uma noite já medida passa a ouvir só o canal novo. Com trinta
  // ângulos, isso é 14 MB em vez de 434.
  memoriaAlinhar: new Map(),
  agoraMs: 0,
  marca: { de: null, ate: null },
  nudges: {},
  focos: [],
  margens: {},
  mudo: {},
  // O ângulo escolhido para ouvir sozinho (clique no vídeo, ou o 1 a 9). Só nesta visita.
  ouvir: null,
  // O atraso de cada canal ao vivo, medido a cada leitura da playlist dele: { slug: { ms, em } }.
  atrasosVivo: {},
  momentos: [],
  // As kills das outras noites. A lista de cima so mostra as da noite aberta,
  // e mudar de noite filtrava-as para fora de vez: quarenta kills do dia 1
  // sumiam por se ter ido espreitar o dia 2. Ficam aqui, e vao no guardar.
  momentosFora: [],
  // A seleccao e o filtro sao a maneira de ele lidar com uma noite varrida:
  // dezenas de candidatos de que a maioria nao e kill. A seleccao vive so
  // enquanto a pagina estiver aberta — guardar caixas marcadas de ontem seria
  // uma surpresa desagradavel. O filtro guarda-se, que e uma preferencia.
  // Onde o relogio estava quando mandei tocar, para poder andar sozinho a
  // partir dai. E a previa: a kill que ele esta a ver em ciclo.
  ancora: null,
  previa: null,
  // A janela à parte que está aberta, se houver. Uma de cada vez: duas janelas
  // com dois ângulos seria bonito e não é o que ele pediu — ele quer UM ângulo
  // no segundo monitor e a grelha no primeiro.
  aparte: null,
  // A forma de cada estouro da ultima varredura, e o exemplo que ele
  // confirmou. Com um exemplo, a busca deixa de ser um palpite meu sobre o que
  // e um tiro e passa a procurar O MESMO SOM.
  estouros: [],
  exemplo: null,
  // O que o "quem morreu" viu em cada kill: as imagens, as notas e se a caixa
  // esta aberta. Vivia so no DOM, e o primeiro clique num cartao redesenhava a
  // lista e levava as imagens todas; na busca automatica nem chegavam a ver-se.
  // So em memoria: sao imagens, e voltar a olhar e um clique.
  olhares: new Map(),
  tique: 0,
  selecao: new Set(),
  filtro: 'todos',
  // O que se apagou da ultima vez, para o "anular". Setenta e oito linhas
  // apagadas por engano sao uma noite de trabalho perdida, e um `confirm()`
  // e uma caixa que ele carrega em OK sem ler.
  apagados: null,
  restaurar: null,
  // O que já se foi buscar à Kick, para não ir buscar outra vez.
  //
  // "Quando adiciono streamer novo à tabela quero só incluir ele em tudo, não
  //  ter que recarregar tudo." E "quando volto quero voltar de onde eu parei".
  // As duas queixas são a mesma coisa: cada Carregar refazia trinta pedidos de
  // listas de VOD e sessenta de playlists, para chegar ao sítio onde já
  // estava. A lista de VOD de um canal não muda depois de a live acabar, e a
  // playlist de um VOD nunca muda — por isso ficam aqui, por canal e por VOD.
  vodsPorCanal: new Map(),
  // As listas de VOD que o evento já leu (até 500 canais). Ficam só em memória: guardá-las com as da
  // noite eram megabytes no localStorage a cada Carregar, para servir uma vez, quando o lance abre.
  vodsDoEvento: new Map(),
  pecasLidas: new Map(),
  volume: {},
  parado: false,
  clipe: null,
  players: new Map(),
  // Cada ficheiro gerado fica INTEIRO na memória enquanto o endereço existir.
  // Trinta e seis clipes de doze megas sao quase meio giga de RAM presa, e
  // ninguem os liberta sozinho — foi por aqui que a pagina comecou a travar.
  ficheiros: [],
  // O que pára a sincronia pelo som em curso. Ela escreve aqui o seu `abort` e
  // volta a pôr null no fim; escrever aqui mostra ou esconde o botão Parar.
  // A montagem, a detecção e o corte de cada canal têm o seu, logo abaixo.
  pararTarefa: null,
  get cancelar() { return this.pararTarefa; },
  set cancelar(fn) { this.pararTarefa = fn || null; pintarParar(); },
  // Os trabalhos longos que se podem parar, cada um com o seu: a montagem, a
  // detecção automática, e o corte de cada canal. Um só `cancelar` para todos
  // parava o que não era, e nunca ninguém o chamava.
  montagem: null,
  varredura: null,
  // O que a detecção já ouviu nesta sessão: as medidas do som por canal (a memória da varredura, para
  // não baixar outra vez) e, por canal, os intervalos ouvidos no relógio da noite (mais escuros na faixa).
  somOuvido: new Map(),
  ouvidoNaFaixa: new Map(),
  // O resto por ouvir do último modo esperto: { quem, quanto }. Dá o Continuar ouvindo o resto.
  restoPorOuvir: null,
  aBaixar: new Map(),
  geracao: 0,
  sugestoes: [],
  escolhido: -1,
  timerProcura: null,
  procuraEmCurso: null,
  timerSecundarios: null,
};

/** O botão Parar só existe enquanto há alguma coisa para parar. */
function pintarParar() {
  const b = $('parar');
  if (b) b.hidden = !estado.pararTarefa;
}

const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
// A hora local, como no mapa do evento: com o mapa a dizer 07:20 e a régua 05:20Z, o dono não sabia
// qual era a certa (07/10). Os nomes de ficheiro continuam em UTC, que é o que ordena bem.
const doisDigitos = (n) => String(n).padStart(2, '0');
const relogioCurto = (ms) => {
  const d = new Date(ms);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`;
};
const diaLocal = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

// ── guardar a sessao ────────────────────────────────────────────────────────

/**
 * Guardar tudo o que custou a chegar aqui, a cada mudanca.
 *
 * A versao anterior so guardava no `beforeunload` — que num telemovel muitas
 * vezes nunca chega a correr, e nunca corre quando a pagina trava. Um F5 depois
 * de meia hora a procurar o momento devolvia uma caixa de texto vazia.
 */
// Os picos de chat que o evento já leu, por canal. Vazio até o evento montar.
let picosDoEvento = () => new Map();
let mensagensDoEvento = () => new Map();
let timerGuardar = null;
// Os dois separadores do painel da direita (o separador e o painel de cada um), e quantas kills havia
// na última pintura da lista (-1 antes da primeira, para a sessão guardada não trocar de painel).
const PAINEIS = { montagem: ['abaMontagem', 'montagem'], exportar: ['abaExportar', 'exportacoes'] };
let killsPintadas = -1;
// Depois do "Recomecar" confirmado nao se guarda mais nada: o `beforeunload`
// escrevia a sessao inteira outra vez no sitio de onde ela acabava de sair.
let semGuardar = false;

/** As kills todas, as da noite aberta e as das outras, sem repetir nenhuma. */
function unirMomentos(...listas) {
  const porMs = new Map();
  for (const l of listas) for (const m of l || []) if (!porMs.has(m.ms)) porMs.set(m.ms, m);
  return [...porMs.values()].sort((a, b) => a.ms - b.ms);
}

/**
 * A sessao como vai para o localStorage.
 *
 * Os canais sao os da caixa de texto, e nao os que entraram na noite aberta:
 * guardar so esses deixava de fora quem nao transmitiu nesta noite, quem a Kick
 * travou por excesso de pedidos e quem ainda nao tinha carregado, e o F5 a
 * seguir escrevia a lista curta por cima da caixa. O `·clipe` de um link colado
 * tambem nao e um canal, e na caixa partia o Carregar seguinte.
 */
function sessaoParaGuardar() {
  const caixa = listaDeCanais();
  return paraLink({
    canais: caixa.length ? caixa
      : estado.linhas.map((l) => l.slug).filter((c) => !c.endsWith('·clipe')),
    janela: estado.janela,
    nudges: estado.nudges,
    marca: estado.marca,
    agoraMs: estado.agoraMs,
    focos: estado.focos,
    margens: estado.margens,
    mudo: estado.mudo,
    volume: estado.volume,
    momentos: unirMomentos(estado.momentos, estado.momentosFora),
  });
}

function guardar() {
  clearTimeout(timerGuardar);
  if (semGuardar) return;
  timerGuardar = setTimeout(() => {
    if (semGuardar) return;
    guardarRolar();
    try {
      localStorage.setItem('replay', sessaoParaGuardar());
    } catch { /* janela privada, quota, o que for — nunca partir a pagina por isto */ }
  }, 400);
}

/**
 * As listas de VOD sobrevivem a fechar o separador — por vinte minutos.
 *
 * É o que faz "voltar" ser voltar: sem isto, cada regresso repetia trinta
 * pedidos à Kick antes de mostrar o sítio onde ele estava. Vinte minutos
 * porque um canal AO VIVO ainda muda a lista; quem quer forçar tem o Repor
 * sessão, que apaga isto também.
 */
const VODS_VALEM_MS = 20 * 60 * 1000;
function guardarVods() {
  try {
    localStorage.setItem('replay.vods', JSON.stringify({
      quando: Date.now(),
      porCanal: Object.fromEntries(estado.vodsPorCanal),
    }));
  } catch { /* quota, janela privada — nunca partir a página por isto */ }
}
function reporVods() {
  try {
    const g = JSON.parse(localStorage.getItem('replay.vods') || 'null');
    if (!g || !(Date.now() - g.quando < VODS_VALEM_MS)) return;
    for (const [slug, r] of Object.entries(g.porCanal || {})) {
      if (r?.estado === 'ok' && Array.isArray(r.vods)) estado.vodsPorCanal.set(slug, r);
    }
  } catch { /* um JSON estragado é o mesmo que não haver */ }
}
// E o sítio da página. "Quando volto, quero voltar de onde eu parei, não ter
// que procurar de novo onde eu tava." O instante e o foco já voltavam; a
// página é que abria em cima, com a lista de kills a um ecrã de distância.
function guardarRolar() {
  try { localStorage.setItem('replay.rolar', String(Math.round(window.scrollY))); } catch { /* idem */ }
}

// ── procurar canais ─────────────────────────────────────────────────────────

/**
 * O slug da Kick nem sempre é o nome que se vê no ecrã, e obrigar alguém a
 * descobri-lo antes de poder usar isto era um passo a mais por cada canal —
 * multiplicado por trinta.
 */
const listaDeCanais = () => $('canais').value.split('\n').map((s) => s.trim()).filter(Boolean);

// Já lá está, mesmo que escrito de outra maneira: "Tchubi" e "tchubi" são o
// mesmo canal, e a caixa guarda o nome como ele o escreveu.
const jaNaLista = (slug) => listaDeCanais().some((n) => slugDoNome(n) === slugDoNome(slug));

function acrescentarCanal(slug) {
  if (jaNaLista(slug)) return;
  const v = $('canais').value.replace(/\s*$/, '');
  $('canais').value = v ? `${v}\n${slug}` : slug;
  $('procurar').value = '';
  fecharSugestoes();
  $('procurar').focus();
}

function fecharSugestoes() {
  $('sugestoes').hidden = true;
  $('sugestoes').innerHTML = '';
  // A lista em memória vai com a do ecrã. Ficar com ela fazia o Enter seguinte
  // (no intervalo da busca, ou com a caixa já vazia) acrescentar o primeiro de
  // uma busca antiga, que ele já não estava a ver.
  estado.sugestoes = [];
  estado.escolhido = -1;
  $('procurar').setAttribute('aria-expanded', 'false');
  $('procurar').removeAttribute('aria-activedescendant');
}

// "8,9 mil" como a própria Kick mostra, e não "8.948" colado ao nome (o dono, 10/10).
function seguidoresCurto(n) {
  try { return new Intl.NumberFormat(idiomaActual(), { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(n); }
}

function pintarSugestoes(canais) {
  $('sugestoes').innerHTML = canais.map((c, i) => {
    const ja = jaNaLista(c.slug);
    return `<li id="sugestao${i}" data-slug="${escapar(c.slug)}" data-i="${i}" class="${ja ? 'ja' : ''}" role="option" aria-selected="false">`
      + `<span>${escapar(c.slug)}${c.aoVivo ? ` <b class="vivo">${t('procurar.aoVivo')}</b>` : ''}</span>`
      + `<span class="quantos">${ja ? t('procurar.jaEsta')
        : t('procurar.seguidores', { n: seguidoresCurto(c.seguidores) })}</span></li>`;
  }).join('');
  $('sugestoes').hidden = !canais.length;
  $('procurar').setAttribute('aria-expanded', String(canais.length > 0));
  estado.sugestoes = canais;
  estado.escolhido = -1;
  for (const li of $('sugestoes').querySelectorAll('li:not(.ja)')) {
    li.onclick = () => acrescentarCanal(li.dataset.slug);
  }
}

function realcar(n) {
  const itens = [...$('sugestoes').querySelectorAll('li')];
  if (!itens.length) return;
  estado.escolhido = (n + itens.length) % itens.length;
  itens.forEach((li, i) => li.setAttribute('aria-selected', String(i === estado.escolhido)));
  itens[estado.escolhido].scrollIntoView({ block: 'nearest' });
  $('procurar').setAttribute('aria-activedescendant', itens[estado.escolhido].id);
}

$('procurar').oninput = () => {
  const termo = $('procurar').value;
  clearTimeout(estado.timerProcura);
  // Uma chamada por tecla seria uma busca a cada 80 ms. Espera-se que a mão
  // pare, e cancela-se a anterior — senão uma resposta lenta chega depois de
  // uma rápida e a lista mostra o que já não se procura.
  estado.procuraEmCurso?.abort();
  // Fechar JÁ. Deixar a lista anterior no ecrã enquanto a nova não chega
  // deixa escolher da lista errada — e como o nome escolhido até existe,
  // ninguém percebe que acrescentou o canal que já não estava a procurar.
  fecharSugestoes();
  if (termo.trim().length < 2) return;
  estado.timerProcura = setTimeout(async () => {
    const controlo = new AbortController();
    estado.procuraEmCurso = controlo;
    try {
      const r = await procurarCanais(termo, { sinal: controlo.signal });
      if (!controlo.signal.aborted) pintarSugestoes(r);
    } catch { /* uma busca que falha não é um erro que valha a pena mostrar */ }
  }, 250);
};

$('procurar').onkeydown = (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); realcar(estado.escolhido + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); realcar(estado.escolhido - 1); }
  else if (e.key === 'Escape') {
    // Com a lista aberta, o Esc fecha só a lista; o seguinte é que fecha o painel Canais.
    if (!$('sugestoes').hidden) e.stopPropagation();
    fecharSugestoes();
  }
  else if (e.key === 'Enter') {
    e.preventDefault();
    // Um link colado (canal, vídeo ou clipe da Kick): o canal entra na lista; vídeo e clipe abrem como no campo do link.
    const link = /kick\.com/i.test($('procurar').value) ? lerLinkKick($('procurar').value) : null;
    if (link?.tipo === 'canal') { acrescentarCanal(link.slug.toLowerCase()); return; }
    if (link) { $('linkKick').value = $('procurar').value.trim(); $('procurar').value = ''; fecharSugestoes(); abrirLinkKick(); return; }
    // A ordem: o que ele escolheu com as setas; senão o nome igual ao que
    // escreveu, mesmo que não seja o mais seguido; só depois o primeiro.
    const escrito = $('procurar').value.trim().toLowerCase();
    const lista = estado.sugestoes || [];
    const escolha = lista[estado.escolhido]
      ?? lista.find((c) => c.slug.toLowerCase() === escrito) ?? lista[0];
    // Enter sem sugestões escreve o que lá está: quem já sabe o slug não tem
    // de esperar por uma lista para o confirmar.
    if (escolha) acrescentarCanal(escolha.slug);
    else if ($('procurar').value.trim()) acrescentarCanal($('procurar').value.trim().toLowerCase());
  }
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.procura')) fecharSugestoes();
});

/**
 * Em que passo do caminho ele está.
 *
 * Não muda nada do que a página faz: lê o estado que já existe e acende o
 * passo certo. Quem chega vê duas caixas vazias e um botão, e isto é a única
 * explicação de que precisa.
 */
function pintarPassos() {
  const passo = estado.momentos.length || estado.marca.de != null ? 3
    : estado.linhas.length ? 2 : 1;
  for (const li of document.querySelectorAll('#passos li')) {
    const n = Number(li.dataset.passo);
    li.classList.toggle('aqui', n === passo);
    li.classList.toggle('feito', n < passo);
  }
  // Um botão cheio de cor de cada vez. Com a noite já carregada, "Carregar"
  // deixa de ser a acção principal — e três botões verdes ao mesmo tempo são
  // o mesmo que nenhum.
  $('carregar').classList.toggle('principal', passo === 1);
}

/**
 * Quanto se pode confiar no alinhamento, dito em voz alta.
 *
 * Este é o pior caso do produto e não tinha sítio nenhum na interface: um
 * ângulo desalinhado exporta um clipe errado com ar de certo, e ninguém dá por
 * nada até estar montado. O dado já existia — `linha.relogio` diz `exato`,
 * `parcial` ou `nenhum` — e estava numa letra pequena no canto de um quadrado.
 */
function pintarConfianca() {
  const caixa = $('confianca');
  if (!caixa) return;
  const linhas = estado.linhas;
  if (!linhas.length) { caixa.textContent = ''; caixa.className = 'confianca'; return; }
  const semRelogio = linhas.filter((l) => l.relogio !== 'exato');
  const ajustados = Object.values(estado.nudges).filter((v) => v).length;
  const estadoConf = !semRelogio.length ? 'exacto'
    : semRelogio.length === linhas.length ? 'nenhum' : 'parcial';
  caixa.className = `confianca ${estadoConf}`;
  caixa.textContent = t(`confianca.${estadoConf}`, {
    n: estadoConf === 'exacto' ? linhas.length : semRelogio.length,
  }) + (ajustados ? t('confianca.ajustado', { n: ajustados }) : '');
}

// ── carregar ────────────────────────────────────────────────────────────────

/**
 * O hls.js é nosso desde que saiu do cdnjs — mas um ficheiro nosso também se
 * perde: uma publicação a meio, uma cache envenenada, um bloqueador demasiado
 * zeloso. Sem ele os quadrados ficam pretos e a página parece partida por uma
 * razão que ninguém adivinha — por isso diz-se, uma vez, e diz-se o que fazer.
 */
function temPlayer() {
  const aviso = $('avisoPlayer');
  if (window.Hls?.isSupported()) { aviso.hidden = true; return true; }
  // Safari plays HLS natively, so a missing hls.js there is not fatal.
  if (document.createElement('video').canPlayType('application/vnd.apple.mpegurl')) {
    aviso.hidden = true;
    return true;
  }
  // Its own element on purpose. The first version wrote this into the progress
  // line and the very next statement overwrote it with "asking Kick…" — the
  // warning existed for about a millisecond, which is the same as not existing.
  aviso.textContent = t('leitor.aviso');
  aviso.hidden = false;
  return false;
}

/**
 * Uma carga de cada vez.
 *
 * O ✕ de uma ficha, o "você quis dizer" e um link colado chamam isto
 * directamente, e não pelo botão: com uma carga a meio corriam duas ao mesmo
 * tempo, em fila cada uma, com o dobro dos pedidos à Kick e o ecrã decidido
 * por quem acabasse por último. E um link colado com o botão cinzento não
 * carregava nada e não dizia nada.
 *
 * Quem pede a meio não perde o pedido: fica marcado, e a carga em curso volta
 * a correr uma vez no fim, já com a caixa como ele a deixou.
 */
let cargaEmCurso = null;
let cargaPendente = false;
function carregar() {
  if (cargaEmCurso) { cargaPendente = true; return cargaEmCurso; }
  cargaEmCurso = (async () => {
    try {
      do {
        cargaPendente = false;
        // eslint-disable-next-line no-await-in-loop
        await carregarAgora();
      } while (cargaPendente);
    } finally {
      cargaEmCurso = null;
    }
  })();
  return cargaEmCurso;
}

async function carregarAgora() {
  // Pelo slug: "Tchubi" e "@tchubi" na mesma caixa são um canal, e não dois
  // pedidos à Kick e duas fichas iguais.
  const nomes = [...new Set(listaDeCanais().map(slugDoNome))];
  if (!nomes.length) return;
  temPlayer();
  $('carregar').disabled = true;
  $('estadoCarga').textContent = t('canais.aPerguntar');

  const canais = [];
  // Sequential, and that is deliberate: thirty parallel calls from five hundred
  // people is what gets a free tool rate-limited for everyone on day one.
  for (const [i, nome] of nomes.entries()) {
    const chave = slugDoNome(nome);
    const memo = estado.vodsPorCanal.get(chave) || estado.vodsDoEvento.get(chave);
    // Um canal que já deu certo não se pede outra vez; um que deu erro
    // (rate-limit, rede) pede-se, porque da próxima pode dar.
    if (memo && memo.estado === 'ok') { canais.push(memo); continue; }
    $('estadoCarga').textContent = `${i + 1}/${nomes.length}: ${nome}`;
    let r = await vodsDoCanal(nome);
    // A Kick às vezes responde sem o cabeçalho de permissão (CORS), e o browser vê isso como "sem rede"
    // (teste real de 12/10: o `xguiry` falhou assim e voltou a dar logo a seguir). Mais uma vez, 1 s depois.
    if (r.estado === 'sem-rede') {
      await new Promise((k) => setTimeout(k, 1000));
      r = await vodsDoCanal(nome);
    }
    if (r.estado === 'ok') estado.vodsPorCanal.set(r.slug, r);
    canais.push(r);
  }
  guardarVods();
  $('estadoCarga').textContent = '';
  $('carregar').disabled = false;

  pintarCanais(canais);
  const noites = agruparPorNoite(canais);
  if (!noites.length) { $('estadoCarga').textContent = t('canais.semUtilizavel'); return; }
  pintarNoites(noites);
  // Voltar a noite onde se estava, e nao a mais recente.
  //
  // Vale para o F5 e vale para acrescentar um canal a meio: quem acrescenta
  // alguem que esta AO VIVO agora cria uma noite nova, de hoje, que passava a
  // ser a mais recente e roubava o ecra. Ele ficava sem a noite em que estava
  // a trabalhar e sem perceber porque.
  // E sem sítio onde estar, a noite com mais dos canais pedidos (ver `noiteParaAbrir`).
  const i = noiteParaAbrir(noites, {
    fixoMs: estado.restaurar?.agora ?? null,
    ondeEstavaMs: estado.linhas.length ? estado.agoraMs : null,
  });
  $('noite').value = String(i >= 0 ? i : 0);
  await abrirNoite(noites[i >= 0 ? i : 0]);
}

function pintarNoites(noites) {
  $('noites').hidden = false;
  // O dono (13/10): o dia e a hora em que o vídeo começa e acaba; sem a contagem de canais.
  const p2 = (x) => String(x).padStart(2, '0');
  const data = (ms) => { const d = new Date(ms); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const hora = (ms) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  // Atravessando a meia-noite, o fim diz o dia; com mais de um canal, do primeiro que começa ao último que acaba, e quantos.
  $('noite').innerHTML = noites.map((n, i) => {
    const fim = data(n.fim) === data(n.inicio) ? hora(n.fim) : `${data(n.fim).slice(0, 5)} ${hora(n.fim)}`;
    const quantos = n.canais > 1 ? ` · ${t('noite.canais', { n: n.canais })}` : '';
    return `<option value="${i}" title="${rotuloDaNoite(n, { t })}">${data(n.inicio)}, ${hora(n.inicio)} ${t('noite.ate')} ${fim}${quantos}</option>`;
  }).join('');
  $('noite').onchange = () => abrirNoite(noites[Number($('noite').value)]);
}

/**
 * O estado de cada canal pedido — e, quando correu mal, o que fazer a seguir.
 *
 * "sem VODs" sozinho não chega: quem escreveu o nome mal fica sem saber se
 * errou ou se o canal existe mesmo e não tem gravações. São duas situações
 * diferentes com a mesma cara, e a segunda não tem conserto enquanto a
 * primeira só precisa de uma letra.
 */
let ultimosCanais = [];

function pintarCanais(canais) {
  ultimosCanais = canais;
  $('canaisEstado').hidden = false;
  const rotulo = {
    ok: '',
    'canal-nao-existe': t('estado.canalNaoExiste'),
    'sem-vods': t('estado.semVods'),
    'vods-indisponiveis': t('estado.vodsIndisponiveis'),
    'rate-limit': t('estado.rateLimit'),
    'sem-rede': t('estado.semRede'),
    'nome-invalido': t('estado.nomeInvalido'),
    'resposta-ilegivel': t('estado.ilegivel'),
    'formato-inesperado': t('estado.inesperado'),
  };
  $('listaCanais').innerHTML = canais.map((c) => {
    const mau = c.estado !== 'ok';
    return `<li class="${mau ? 'mau' : ''}" data-slug="${escapar(c.slug)}" data-estado="${escapar(c.estado)}"><b>${escapar(c.slug)}</b>`
      + `<span class="nota">${mau ? (rotulo[c.estado] || escapar(c.estado))
        : t('canais.vods', { n: c.vods.length })}</span>`
      + '<span class="parecidos"></span>'
      // Tirar um canal daqui. Um nome mal escrito ficava na lista para sempre,
      // e a unica saida era ir a caixa de texto apaga-lo a mao.
      + `<button class="tirar" title="${t('canais.tirar')}">✕</button></li>`;
  }).join('');
  for (const li of $('listaCanais').querySelectorAll('li[data-slug]')) {
    li.querySelector('.tirar').onclick = () => {
      // Pelo slug, e não pelo texto: a ficha traz o slug da Kick e a caixa o
      // nome como ele o escreveu. "Gaules" nunca era igual a "gaules", e o ✕
      // recarregava tudo sem tirar nada.
      $('canais').value = listaDeCanais().filter((n) => slugDoNome(n) !== li.dataset.slug).join('\n');
      guardar();
      if (listaDeCanais().length) carregar();
      else { li.remove(); $('estadoCarga').textContent = t('canais.semCanais'); }
    };
  }
  sugerirParecidos(canais.filter((c) => c.estado !== 'ok'));
}

/**
 * Para cada canal que não deu, procurar nomes parecidos e oferecê-los.
 *
 * É a resposta à pergunta que a mensagem de erro não responde: "escrevi mal?".
 * Um clique troca o nome na caixa e volta a carregar.
 */
async function sugerirParecidos(maus) {
  for (const c of maus) {
    if (c.estado === 'sem-rede' || c.estado === 'rate-limit') continue;
    const li = $('listaCanais').querySelector(`li[data-slug="${CSS.escape(c.slug)}"] .parecidos`);
    if (!li) continue;
    let achados = [];
    try {
      achados = (await procurarCanais(c.slug, { quantos: 4 })).filter((x) => x.slug !== c.slug);
    } catch { /* sem sugestões é um resultado, não um erro a mostrar */ }
    if (!achados.length) continue;
    li.innerHTML = `<span class="nota">${t('canais.quisesteDizer')}</span>`
      + achados.map((x) => `<button data-slug="${escapar(x.slug)}">${escapar(x.slug)}</button>`).join('');
    for (const b of li.querySelectorAll('button')) {
      b.onclick = () => {
        // Trocar o nome na caixa, e não acrescentar: quem escreveu mal quer o
        // certo no lugar do errado, senão fica a carregar os dois.
        $('canais').value = listaDeCanais()
          .map((n) => (slugDoNome(n) === c.slug ? b.dataset.slug : n))
          .filter((n, i, a) => a.findIndex((x) => slugDoNome(x) === slugDoNome(n)) === i)
          .join('\n');
        carregar();
      };
    }
  }
}

/** Read the ladders and the clocks for one night, then build the timeline. */
/**
 * Quantas vezes já se mandou abrir uma noite.
 *
 * Sem isto, duas mudanças seguidas correm ao mesmo tempo e a que ACABAR
 * primeiro não é a que ele escolheu por último: são trinta canais e dois
 * pedidos de rede por cada, e quem acaba primeiro é quem tiver menos VODs.
 * O ecrã ficava com a noite errada e nada dizia porquê.
 */
let vezNoite = 0;

/**
 * Abrir uma noite, e garantir que o selector volta a abrir.
 *
 * O `finally` não é zelo a mais: se um `fetch` rebentar a meio dos sessenta
 * pedidos, sem ele o selector ficava trancado e a única saída era recarregar
 * a página — com a sessão dele lá dentro.
 */
async function abrirNoite(noite, opcoes) {
  // A vez DESTA leitura. O `lerNoite` soma-a logo na primeira linha, antes de
  // esperar por nada. Comparar com uma variável escrita ao mesmo tempo que a
  // outra dava sempre verdade, e a leitura velha que acabava destrancava o
  // selector com a nova ainda a meio.
  const minhaVez = vezNoite + 1;
  try {
    return await lerNoite(noite, opcoes);
  } finally {
    if (vezNoite === minhaVez) $('noite').disabled = false;
  }
}

/**
 * O texto de uma playlist da Kick, ou um erro.
 *
 * O `fetch` só rebenta sem rede. Um 403 ou um 503 do CDN chegam como uma
 * resposta normal, e o corpo (uma página de erro em XML) era lido como uma
 * playlist sem relógio: o canal sumia da grelha sem aviso, e a peça estragada
 * ficava guardada para todos os Carregar seguintes.
 *
 * E com tempo limite: são dois pedidos por canal, em fila, e um só pendurado
 * deixava "lendo os relógios…" no ecrã para sempre, com o selector trancado.
 */
async function lerTexto(url, { limiteMs = 20_000, sinal } = {}) {
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  const controlo = new AbortController();
  const parar = () => controlo.abort();
  sinal?.addEventListener('abort', parar, { once: true });
  const relogio = setTimeout(() => controlo.abort(), limiteMs);
  try {
    const r = await fetch(url, { signal: controlo.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(relogio);
    sinal?.removeEventListener('abort', parar);
  }
}

/** Quantas listas (master e playlist) se pedem ao mesmo tempo ao abrir uma noite. */
const LISTAS_DE_UMA_VEZ = 6;

async function lerNoite(noite, { preparadas } = {}) {
  const minhaVez = ++vezNoite;
  const desactualizada = () => minhaVez !== vezNoite;
  const dizer = (frase) => { if (!desactualizada()) $('estadoNoite').textContent = frase; };
  // O selector fecha-se enquanto lê: trinta canais são sessenta pedidos, e
  // deixá-lo aberto convida a mudar outra vez a meio.
  $('noite').disabled = true;
  dizer(t('canais.aLerRelogios'));
  // Se já havia uma noite aberta, o sítio onde ele estava vale como se fosse
  // uma sessão guardada: o mesmo instante, o mesmo foco, a mesma marca e as
  // mesmas kills. É o que faz "juntar um streamer" ser juntar, e não
  // recomeçar — o bloco de restauro lá em baixo já sabe validar isto tudo.
  if (!estado.restaurar && estado.linhas.length && estado.janela) {
    estado.restaurar = {
      agora: estado.agoraMs, focos: estado.focos, marca: estado.marca, momentos: estado.momentos,
    };
  }
  const porCanal = new Map();
  // Quem não se conseguiu ler, para o dizer pelo nome no fim.
  const naoLidos = new Set();
  // Várias de cada vez, e o canal em foco primeiro. O teste real de 12/10: "Abrir todos" com 33
  // canais eram 66 pedidos um a seguir ao outro antes do primeiro vídeo, e levava 40 s. Seis no ar de
  // cada vez é pouco para a Kick e chega para as listas (texto pequeno) não esperarem umas pelas outras.
  const primeiros = new Set(estado.restaurar?.focos || estado.focos || []);
  const itens = [...noite.itens].sort((a, b) => (primeiros.has(b.slug) ? 1 : 0) - (primeiros.has(a.slug) ? 1 : 0));
  const lidas = new Map();
  let proximo = 0;
  const lerUm = async ({ slug, v }) => {
    if (!v.master) return;
    const chave = `${slug}|${v.id}`;
    // A playlist de um VOD acabado nunca muda; a de quem está no ar cresce a cada segmento. Guardada,
    // abrir um lance de agora mostrava o vídeo de quando se carregou da primeira vez.
    const lida = preparadas ? preparadas.get(chave) : (v.aoVivo ? null : estado.pecasLidas.get(chave));
    if (preparadas && !lida) { naoLidos.add(slug); return; }
    if (lida) {
      lidas.set(chave, lida);
      if (v.aoVivo) estado.atrasosVivo[slug] = medirAtraso(lida.playlist.fim) || estado.atrasosVivo[slug];
      return;
    }
    try {
      const master = lerMaster(await lerTexto(v.master), v.master);
      if (!master.length) { naoLidos.add(slug); return; }
      const barato = master.at(-1);
      const playlist = lerPlaylist(await lerTexto(barato.url), barato.url);
      if (v.aoVivo) estado.atrasosVivo[slug] = medirAtraso(playlist.fim) || estado.atrasosVivo[slug];
      const peca = { vod: v, playlist, escada: master, barato };
      // Só se guarda o que tem relógio. Uma peça sem ele não entra na linha do
      // canal, e guardada impedia o Carregar seguinte de a tentar outra vez.
      if (Number.isFinite(playlist.inicio)) estado.pecasLidas.set(chave, peca);
      lidas.set(chave, peca);
    } catch { naoLidos.add(slug); }
  };
  const trabalhador = async () => {
    // Uma leitura que já não interessa a ninguém pára aqui. Continuava a pedir
    // as playlists todas até ao fim, ao mesmo tempo que a nova.
    while (proximo < itens.length && !desactualizada()) await lerUm(itens[proximo++]);
  };
  await Promise.all(Array.from({ length: Math.min(LISTAS_DE_UMA_VEZ, itens.length) }, trabalhador));
  // Pela ordem da noite, como antes, para a ordem das peças de cada canal não depender de quem chegou primeiro.
  for (const { slug, v } of noite.itens) {
    const peca = lidas.get(`${slug}|${v.id}`);
    if (!peca) continue;
    if (!porCanal.has(slug)) porCanal.set(slug, []);
    porCanal.get(slug).push(peca);
  }
  if (!desactualizada()) $('noite').disabled = false;
  // Se ele mudou de noite outra vez enquanto isto lia, esta resposta já não
  // interessa a ninguém — e escrevê-la no ecrã seria mostrar-lhe a noite
  // errada com ar de certa.
  if (desactualizada()) return;
  // Os que não vieram, pelo nome. Um canal sem playlist legível não tem linha
  // nem quadrado, e sumia da grelha sem ninguém dizer nada: com quinhentos
  // canais ninguém dá pela falta de quinze.
  const faltam = naoLidos.size
    ? t('noite.naoLidos', { lista: [...naoLidos].join(', ') }) : '';
  dizer(faltam);

  // Pela ordem em que ELE os escreveu, e não pela ordem por que a Kick os
  // devolveu. "Está difícil achar as POV em baixo": com vinte e três canais,
  // procurar um nome numa grelha em ordem desconhecida é trabalho a sério, e a
  // lista de fichas lá em cima já está na ordem certa.
  const ordem = listaDeCanais().map(slugDoNome);
  const posicao = (slug) => {
    const i = ordem.indexOf(slug);
    // Um canal que já não está na caixa de texto vai para o fim, e não para o
    // princípio — que é onde o −1 o punha.
    return i === -1 ? ordem.length : i;
  };
  estado.linhas = [...porCanal]
    .sort(([a], [b]) => posicao(a) - posicao(b) || a.localeCompare(b))
    .map(([slug, pecas]) => ({
      ...linhaDoCanal(slug, pecas),
      pecasCompletas: pecas,
    }));
  estado.janela = janelaComum(estado.linhas);
  if (!estado.janela) {
    // Limpar o palco, e não só desistir.
    //
    // Ficava a grelha da noite anterior no ecrã, órfã: os vídeos continuavam a
    // tocar mas `estado.linhas` já estava vazio, por isso o pause não
    // encontrava nada para parar e os quadrados respondiam a nada. Uma noite
    // que não abre tem de deixar o ecrã vazio e dizer porquê.
    limparPalco();
    dizer(faltam || t('noite.semRelogio'));
    return;
  }

  // Apertar a janela à NOITE escolhida.
  //
  // Sem isto, um canal 24/7 com um VOD de 38 horas manda na barra do tempo:
  // a noite inteira ficava espremida num canto, todas as outras barras
  // amontoadas à direita, e o instante de arranque caía FORA da noite — a
  // página mostrava "1 de 6 ângulos" e cinco quadrados a dizer "ainda não
  // tinha começado". A noite é a que está escolhida em cima; a barra tem de
  // ser a dessa noite e de mais nada.
  if (Number.isFinite(noite?.inicio) && Number.isFinite(noite?.fim) && noite.fim > noite.inicio) {
    const inicio = Math.max(estado.janela.inicio, noite.inicio);
    const fim = Math.min(estado.janela.fim, noite.fim);
    if (fim > inicio) estado.janela = { ...estado.janela, inicio, fim };
  }

  // Start where the most angles are. When everyone overlaps that is the common
  // window; when they do not — one ended at 20:10, another began at 23:30 —
  // there is no such instant, and `sobreposicaoInicio` is null on purpose.
  // Reading it blindly put the whole page at NaN and every tile went black.
  // E o instante de arranque tem de cair dentro da janela, mesmo quando a
  // sobreposição de todos acontece fora desta noite.
  const dentro = (t) => Number.isFinite(t) && t >= estado.janela.inicio && t <= estado.janela.fim;
  // Ficar onde já se estava, se esse instante ainda existir nesta janela.
  //
  // Acrescentar um canal a meio do trabalho não pode atirar ninguém de volta
  // para o início da noite: o instante era o que ele tinha acabado de
  // encontrar, e reencontrá-lo é o trabalho todo outra vez.
  const ondeEstava = dentro(estado.agoraMs) ? estado.agoraMs : null;
  estado.agoraMs = ondeEstava
    ?? (estado.janela.haSobreposicao && dentro(estado.janela.sobreposicaoInicio)
      ? estado.janela.sobreposicaoInicio
      : estado.janela.inicio);
  estado.focos = estado.linhas[0] ? [estado.linhas[0].slug] : [];

  // O que estava guardado, mas só o que ainda faz sentido nesta noite: um
  // instante fora dela ou um canal que já não está aqui restauram nada.
  const g = estado.restaurar;
  if (g) {
    const existe = (c) => estado.linhas.some((l) => l.slug === c);
    // O "Ver ao vivo agora" (e qualquer instante depois do fim do vídeo de uma live): prende-se à borda
    // do que já está gravado, com folga. Antes caía fora da janela e ficava o começo da noite: a live
    // abria 50 min atrás do ar (teste real de 12/10, ver `instanteAoVivo`).
    const live = estado.linhas.some((l) => l.pecas.some((p) => p.vod?.aoVivo));
    if (g.aoVivo || (live && g.agora > estado.janela.fim)) {
      const r = instanteAoVivo(estado.linhas, { pedidoMs: g.agora, nudges: estado.nudges });
      if (r) estado.agoraMs = Math.max(estado.janela.inicio, Math.min(r.ms, estado.janela.fim));
    } else if (g.agora >= estado.janela.inicio && g.agora <= estado.janela.fim) estado.agoraMs = g.agora;
    const focos = (g.focos || []).filter(existe);
    if (focos.length) estado.focos = focos;
    if (g.marca && g.marca.de >= estado.janela.inicio && g.marca.ate <= estado.janela.fim) {
      estado.marca = g.marca;
    }
    const todas = unirMomentos(g.momentos, estado.momentosFora);
    const naNoite = (m) => m.ms >= estado.janela.inicio && m.ms <= estado.janela.fim;
    estado.momentos = todas.filter(naNoite);
    estado.momentosFora = todas.filter((m) => !naNoite(m));
    estado.restaurar = null;
  }
  mostrarPalco();
  // Quem esta nesta noite, pelo nome. "Nunca estiveram todos no ar ao mesmo
  // tempo" era um aviso a fingir de problema: nao ter todos nao impede nada,
  // corta-se na mesma com os que la estavam. O que faz falta e saber QUEM.
  $('resumoNoite').textContent = estado.linhas.map((l) => l.slug).join(', ')
    + (estado.janela.haSobreposicao && !soUmCanal()
      ? `, ${t('noite.todosJuntos', {
        de: relogioCurto(estado.janela.sobreposicaoInicio),
        ate: relogioCurto(estado.janela.sobreposicaoFim),
      })}`
      : '');
  // Alinhar pelo som e uma operacao entre canais. Com um so, o botao existia
  // para nao fazer nada.
  $('alinhar').hidden = soUmCanal();
  // O "Marcar agora" só existe com alguém ao vivo na noite aberta.
  $('marcarAoVivo').hidden = !estado.linhas.some((l) => l.pecas.some((p) => p.vod?.aoVivo));
  $('estadoAoVivo').textContent = '';
  // Sem noite aberta não há nada para partilhar, e um botão que copia um link
  // vazio é pior do que um botão que não está lá.
  $('partilhar').disabled = !estado.linhas.length || !estado.janela;
  pintarPartilha();
  // Os segundos de quem morreu so fazem sentido se houver quem morrer.
  $('margensVitima').hidden = soUmCanal();
  pintarResumoMargens();
  montarGrade();
  seguirVideo();
  pintarConfianca();
  // Noite nova, vista nova: a de antes apontava para instantes que já não
  // existem nesta.
  estado.vista = null;
  acertarVista({ forcar: true });
  irPara(estado.agoraMs);
  pintarMarca();
  pintarMomentos();
  guardar();
  seguirLives();
  // Só na primeira noite depois de abrir a página: a seguir, quem rola é ele.
  if (rolarPendente != null) {
    const y = rolarPendente;
    rolarPendente = null;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
}
let rolarPendente = null;

// Com alguém ao vivo na noite aberta, as playlists dele leem-se outra vez de tempos a tempos: sem isso
// o fim de cada faixa ficava no instante em que a noite abriu, e o relógio da página dava o canal como
// "acabou" enquanto o vídeo (ver `carregadorAoVivo`) continuava a andar.
const RELER_AO_VIVO_MS = 15_000;
let releitura = null;
function seguirLives() {
  clearTimeout(releitura);
  releitura = null;
  const vivas = () => estado.linhas.filter((l) => l.pecas.some((p) => p.vod?.aoVivo));
  if (!vivas().length) return;
  const minhaNoite = vezNoite;
  const reler = async () => {
    if (minhaNoite !== vezNoite) return;
    if (document.visibilityState !== 'hidden') {
      const lista = vivas();
      let i = 0;
      const um = async () => {
        while (i < lista.length) {
          const l = lista[i++];
          const pecas = l.pecasCompletas || l.pecas;
          const peca = pecas.find((p) => p.vod?.aoVivo);
          if (!peca) continue;
          try {
            // eslint-disable-next-line no-await-in-loop
            const playlist = lerPlaylist(await lerTexto(peca.barato.url), peca.barato.url);
            // O atraso de agora (para o "Marcar agora"), mesmo quando a playlist não cresceu.
            if (minhaNoite === vezNoite) estado.atrasosVivo[l.slug] = medirAtraso(playlist.fim) || estado.atrasosVivo[l.slug];
            if (minhaNoite !== vezNoite || !Number.isFinite(playlist.fim) || !(playlist.fim > peca.playlist.fim)) continue;
            peca.playlist = playlist;
            Object.assign(l, linhaDoCanal(l.slug, pecas), { pecasCompletas: pecas });
          } catch { /* fica a de antes; tenta-se na volta seguinte */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(LISTAS_DE_UMA_VEZ, lista.length) }, um));
      if (minhaNoite !== vezNoite || !estado.janela) return;
      const fim = Math.max(...estado.linhas.map((l) => l.fim).filter(Number.isFinite));
      if (fim > estado.janela.fim) {
        estado.janela = { ...janelaComum(estado.linhas), inicio: estado.janela.inicio, fim };
        pintarFaixas();
      }
    }
    releitura = setTimeout(reler, RELER_AO_VIVO_MS);
  };
  releitura = setTimeout(reler, RELER_AO_VIVO_MS);
}

/* Num telemovel o palco nasce a dois mil pixels do topo: por cima dele estao a
   caixa dos canais, a lista de noites e o estado de cada canal — 1 680 px de
   PREPARACAO, medidos num ecra de 390x844 com dezassete canais, que ja nao
   interessam a ninguem no segundo em que a noite abre.

   "Pra versao de celular isso tem que ficar perto do player principal, porque
    se eu quero passar pra frente e pra tras eu tenho que rolar pra baixo
    muito ate chegar nessa parte."

   Da PRIMEIRA vez que o palco aparece, a pagina desce ate ele; a seguir quem
   rola e ele. Tres travoes, e cada um tem um motivo:
   - so quando o palco estava escondido: acrescentar um streamer a uma noite
     ja aberta nao pode dar um salto no ecra ("quero so incluir ele em tudo");
   - so quando nao ha scroll guardado para repor, senao roubava-lhe o sitio
     onde ficou;
   - so num ecra estreito: no PC a pagina inteira e a area de trabalho e nao
     rola de todo, por isso nao havia nada para onde descer. */
let palcoJaAberto = false;
function mostrarPalco() {
  const palco = $('palco');
  const primeira = palco.hidden && !palcoJaAberto;
  // O vídeo acabou de abrir: a porta de entrada sai da frente (ver `editarCanais`).
  if (palco.hidden) alternarCanais(false);
  palco.hidden = false;
  if (!primeira) return;
  palcoJaAberto = true;
  if (rolarPendente != null || window.innerWidth >= 1080) return;
  requestAnimationFrame(() => palco.scrollIntoView({ block: 'start' }));
}

/** Deitar fora tudo o que estava no ecrã, sem deixar leitores a tocar sozinhos. */
/**
 * Fechar a janela à parte sem esperar por ela. O do PiP de vídeo devolve uma
 * promessa, que rejeita se ele já saiu.
 */
function fecharAparte() {
  const aparte = estado.aparte;
  estado.aparte = null;
  try { Promise.resolve(aparte?.fechar?.()).catch(() => {}); } catch { /* já fechada */ }
}

function limparPalco() {
  // A janela à parte também: o leitor dela vai com os outros, e deixá-la
  // aberta era um quadro preto no segundo monitor a fingir que está vivo.
  if (estado.aparte) fecharAparte();
  estado.players.forEach((p) => p.destroy?.());
  estado.players.clear();
  for (const tile of tiles()) tile.querySelector('video')?.pause?.();
  quadros.clear();
  esquecerVista();
  $('palcoFoco').innerHTML = '';
  $('grade').innerHTML = '';
  $('faixas').querySelectorAll('.faixa').forEach((f) => f.remove());
  $('regua').innerHTML = '';
  $('listaMomentos').innerHTML = '';
  estado.linhas = [];
  estado.janela = null;
  // A memória do som é de UMA noite. As chaves levam o instante absoluto, por
  // isso outra noite falharia sozinha — mas ficava lá a ocupar memória para
  // sempre, e ao fim de uma sessão longa são dezenas de MB de Float32.
  estado.memoriaAlinhar.clear();
  $('angulos').textContent = '';
}

/**
 * Uma barra por canal, com o tempo em que esteve mesmo no ar.
 *
 * Sem isto, procurar o momento era arrastar a barra às cegas: os buracos e as
 * sobreposições só se descobriam batendo com o nariz neles. Aqui vê-se de
 * relance onde há dois ângulos e onde há um só, e clica-se lá directamente.
 */
/** O pedaço da noite que está desenhado agora. */
const vistaAgora = () => estado.vista || estado.janela;

/**
 * Acertar a vista e repintar o que ela desenha — mas só quando muda mesmo.
 *
 * As faixas são dezoito linhas de DOM: repintá-las a cada instante enquanto o
 * vídeo anda seria sessenta reconstruções por segundo. Com o `saiuDaVista`, a
 * vista está quieta quase sempre e salta uma vez quando o cursor lhe chega à
 * ponta — e é aí, e só aí, que se paga o repinte.
 */
function acertarVista({ forcar = false } = {}) {
  if (!estado.janela) return false;
  // Uma vista posta à mão (zoom num ponto, ou arrastada para o lado) fica onde ele a pôs enquanto o
  // instante não sair dela. Quando sai (o vídeo andou para lá da ponta, ou ele foi para outro sítio),
  // a vista volta a seguir o instante.
  if (!forcar && estado.vista && vistaPresa) {
    if (estado.agoraMs >= estado.vista.inicio && estado.agoraMs <= estado.vista.fim) return false;
    vistaPresa = false;
  }
  if (forcar) vistaPresa = false;
  if (!forcar && estado.vista && !saiuDaVista(estado.vista, estado.agoraMs)) return false;
  const nova = vistaDaLinha(estado.janela, estado.agoraMs, estado.zoomS);
  if (!forcar && estado.vista
    && nova.inicio === estado.vista.inicio && nova.fim === estado.vista.fim) return false;
  estado.vista = nova;
  pintarFaixas();
  pintarRegua();
  pintarZoom();
  return true;
}

// ── o zoom da linha do tempo ────────────────────────────────────────────────
//
// O dono, 10/10: "igual nos editores de vídeo: o quanto de linha do tempo aparece, dando zoom e
// diminuindo a linha, ou tirando zoom e aumentando, até ter o máximo". Era um seletor de cinco degraus;
// passa a ser contínuo, entre a noite toda e uns 30 segundos: o deslizante com menos e mais, Ctrl + roda
// do mouse sobre as faixas (o instante debaixo do mouse fica no lugar), a pinça com dois dedos e as
// teclas + e -. Com zoom, arrastar as faixas ou a régua para o lado, ou rolar na horizontal, anda pela
// noite sem mexer no vídeo.
let vistaPresa = false;
// Um arrasto que andou com a vista não é um clique: o trilho não leva o vídeo para onde se largou.
let vistaArrastada = false;
// A largura com que a régua foi pintada da última vez.
let reguaMedida = 0;
const ZOOM_PASSO = 2;

/** Pôr a vista com `larguraMs` de tempo à vista, com o instante `pontoMs` no mesmo sítio do ecrã. */
function aplicarZoom(larguraMs, pontoMs) {
  if (!estado.janela) return;
  const total = estado.janela.fim - estado.janela.inicio;
  const vista = vistaAgora();
  let ponto = pontoMs;
  // Sem ponto (o deslizante, os botões e as teclas), o zoom é em volta do instante do vídeo se ele está
  // à vista, como num editor, e do meio da vista se não está.
  if (!Number.isFinite(ponto)) {
    ponto = estado.agoraMs >= vista.inicio && estado.agoraMs <= vista.fim ? estado.agoraMs : (vista.inicio + vista.fim) / 2;
  }
  const nova = zoomEmVolta(estado.janela, vista, larguraMs, ponto);
  const largura = nova.fim - nova.inicio;
  estado.zoomS = largura >= total ? 0 : largura / 1000;
  try { localStorage.setItem('replay.zoom', String(estado.zoomS)); } catch { /* janela privada */ }
  vistaPresa = largura < total;
  if (estado.vista && nova.inicio === estado.vista.inicio && nova.fim === estado.vista.fim) { pintarZoom(); return; }
  estado.vista = nova;
  pintarFaixas();
  pintarRelogio(estado.agoraMs);
  pintarZoom();
}

/** Multiplicar o tempo à vista: menos de 1 aproxima, mais de 1 afasta. */
function zoomPor(fator, pontoMs) {
  const v = vistaAgora();
  if (!v || !(v.fim > v.inicio)) return;
  aplicarZoom((v.fim - v.inicio) * fator, pontoMs);
}

/** Andar com a vista para o lado, do mesmo tamanho. Só com zoom: a noite toda não tem para onde ir. */
function andarComVista(deltaMs) {
  const v = vistaAgora();
  if (!estado.janela || !v) return;
  const nova = andarVista(estado.janela, v, deltaMs);
  if (nova.inicio === v.inicio && nova.fim === v.fim) return;
  estado.vista = nova;
  vistaPresa = true;
  pintarFaixas();
  pintarRelogio(estado.agoraMs);
}

/** O deslizante e o texto "10 min à vista" a dizer o zoom que está. */
function pintarZoom() {
  const el = $('zoomTempo');
  if (!el) return;
  const j = estado.janela;
  const v = vistaAgora();
  const total = j ? j.fim - j.inicio : 0;
  const largura = v ? v.fim - v.inicio : 0;
  const tudo = !j || largura >= total;
  el.value = String(tudo ? 0 : valorDoZoom(total, largura));
  const texto = tudo ? t('tempo.zoomTudo') : t('tempo.zoomVe', { dur: duracaoTrecho(largura) });
  el.setAttribute('aria-valuetext', texto);
  $('zoomQuanto').textContent = texto;
  el.disabled = !j;
  $('zoomMenos').disabled = !j || tudo;
  $('zoomMais').disabled = !j || largura <= Math.min(ZOOM_MIN_MS, total) + 1;
}

/** O instante debaixo do ponteiro, nas colunas do tempo (a régua e os trilhos medem o mesmo). */
function msNaLinha(clientX) {
  const v = vistaAgora();
  const r = $('regua').getBoundingClientRect();
  if (!v || !(r.width > 0)) return NaN;
  return v.inicio + ((clientX - r.left) / r.width) * (v.fim - v.inicio);
}

function ligarZoom() {
  const deslizante = $('zoomTempo');
  deslizante.addEventListener('input', () => {
    if (!estado.janela) return;
    aplicarZoom(larguraDoZoom(estado.janela.fim - estado.janela.inicio, Number(deslizante.value)));
  });
  $('zoomMais').onclick = () => zoomPor(1 / ZOOM_PASSO);
  $('zoomMenos').onclick = () => zoomPor(ZOOM_PASSO);
  // A roda do mouse sobre as faixas e a régua. Com Ctrl (e a pinça de um trackpad, que chega como
  // Ctrl + roda), zoom no ponto do mouse; na horizontal, ou com Shift, anda pela noite. A roda sozinha
  // continua a rolar as faixas para cima e para baixo.
  const roda = (e) => {
    if (!estado.janela) return;
    const v = vistaAgora();
    const largura = v.fim - v.inicio;
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomPor(Math.exp(Math.max(-1, Math.min(1, e.deltaY * px * 0.0025))), msNaLinha(e.clientX));
      return;
    }
    const lado = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!lado || largura >= estado.janela.fim - estado.janela.inicio) return;
    e.preventDefault();
    const r = $('regua').getBoundingClientRect();
    andarComVista((lado * px / Math.max(1, r.width)) * largura);
  };
  for (const el of [$('faixas'), document.querySelector('.reguaLinha')]) el.addEventListener('wheel', roda, { passive: false });

  // Arrastar para o lado e a pinça, com o rato ou com os dedos. Os toques ficam guardados por ponteiro:
  // um dedo arrasta, dois fazem a pinça (o instante entre os dedos fica no lugar).
  const toques = new Map();
  let pinca = null;
  let arrasto = null;
  const caixas = [$('faixas'), document.querySelector('.reguaLinha')];
  const deixa = (e) => !e.target.closest('button, .alca, .chatTrechoFaixa, .acoesFaixa, input, select');
  const fim = (e) => {
    toques.delete(e.pointerId);
    if (toques.size < 2) pinca = null;
    if (!toques.size) {
      arrasto = null;
      // O clique chega depois do pointerup: a marca de arrasto só cai a seguir a ele.
      setTimeout(() => { vistaArrastada = false; }, 0);
    }
  };
  for (const caixa of caixas) {
    caixa.addEventListener('pointerdown', (e) => {
      if (!estado.janela || e.button > 0 || !deixa(e)) return;
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (toques.size === 2) {
        // Os dois dedos ficam presos à caixa: o zoom refaz as faixas, e o trilho onde o dedo pousou deixa
        // de existir a meio do gesto.
        for (const id of toques.keys()) { try { caixa.setPointerCapture(id); } catch { /* um ponteiro sintético não se prende */ } }
        const [a, b] = [...toques.values()];
        const v = vistaAgora();
        pinca = { distancia: Math.max(10, Math.abs(a.x - b.x)), largura: v.fim - v.inicio, ponto: msNaLinha((a.x + b.x) / 2) };
        arrasto = null;
      } else if (toques.size === 1) {
        arrasto = { x: e.clientX, y: e.clientY, vista: vistaAgora(), andou: false };
      }
    });
    caixa.addEventListener('pointermove', (e) => {
      if (!toques.has(e.pointerId)) return;
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinca && toques.size >= 2) {
        const [a, b] = [...toques.values()];
        vistaArrastada = true;
        aplicarZoom(pinca.largura * (pinca.distancia / Math.max(10, Math.abs(a.x - b.x))), pinca.ponto);
        return;
      }
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x;
      const total = estado.janela.fim - estado.janela.inicio;
      const largura = arrasto.vista.fim - arrasto.vista.inicio;
      if (largura >= total) return;
      // Só depois de 6 px para o lado (e mais para o lado do que para baixo): um clique com a mão a tremer
      // continua a ser um clique, e um dedo a rolar as faixas para baixo continua a rolar.
      if (!arrasto.andou && (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(e.clientY - arrasto.y))) return;
      if (!arrasto.andou) {
        arrasto.andou = true;
        try { caixa.setPointerCapture(e.pointerId); } catch { /* um ponteiro sintético não se prende */ }
      }
      vistaArrastada = true;
      const r = $('regua').getBoundingClientRect();
      const nova = andarVista(estado.janela, arrasto.vista, (-dx / Math.max(1, r.width)) * largura);
      if (nova.inicio === vistaAgora().inicio) return;
      estado.vista = nova;
      vistaPresa = true;
      pintarFaixas();
      pintarRelogio(estado.agoraMs);
    });
    caixa.addEventListener('pointerup', fim);
    caixa.addEventListener('pointercancel', fim);
    // Um clique que acabou um arrasto não é um clique: nem o trilho nem uma kill da régua levam o vídeo.
    caixa.addEventListener('click', (e) => {
      if (!vistaArrastada) return;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }
}

/** O "some em N dias" no fim do trilho de uma faixa. Sem prazo conhecido (live no ar, sem hora), nada. */
function prazoNaFaixa(slug) {
  const p = prazoDe(slug);
  if (!p) return '';
  const { texto, ajuda, perto } = textoDoPrazo(p);
  return `<span class="prazoFaixa${perto ? ' perto' : ''}" title="${escapar(ajuda)}">${escapar(texto)}</span>`;
}

/**
 * Se a faixa de `slug` é de outro jogo (ver jogo.js): só num canal do evento aberto que tem `jogo`, e
 * quando todos os VODs dela (ou o que tem o instante `ms`) são de outro jogo. Fica fora da detecção, do
 * ler chat de todos e do "Guardar todos agora"; abre-se e vê-se como qualquer outra.
 */
function foraDoJogo(slug, ms = null) {
  const ev = chatDoEvento?.estado;
  if (!ev?.jogo || !ev.elenco) return false;
  if (!ev.elenco.soltos.includes(slug) && !ev.elenco.times.some((x) => x.canais.includes(slug))) return false;
  const l = estado.linhas.find((x) => x.slug === slug);
  if (!l) return false;
  const nudge = estado.nudges[slug] || 0;
  const pecas = (l.pecasCompletas || l.pecas || []).filter((p) => ms == null
    || (p.playlist && ms + nudge >= p.playlist.inicio && ms + nudge <= p.playlist.fim));
  return pecas.length > 0 && pecas.every((p) => !eDoJogo(p.vod, ev.jogo));
}

function pintarFaixas() {
  const { inicio, fim } = vistaAgora() || {};
  const alvo = $('faixas');
  // A barra de ler chat e detectar e as alças são peças fixas que moram dentro das faixas: saem antes
  // de as faixas irem, e o `colocarAcoes` põe-nas outra vez no sítio no fim.
  alvo.append($('chatTrecho'), $('acoesFaixa'));
  [...alvo.querySelectorAll('.faixa, .faixaGeral')].forEach((f) => f.remove());
  if (inicio == null || !(fim > inicio)) { colocarAcoes(); return; }
  const pct = (ms) => ((ms - inicio) / (fim - inicio)) * 100;
  // Clicar no trilho vai directo ao instante. E desliga a prévia, como qualquer navegação à mão: sem
  // isso, o ciclo da kill que estava a tocar puxava-o de volta no quadro seguinte e o clique parecia não
  // ter feito nada. Clicar na faixa de alguém também escolhe essa pessoa para o chat ao lado do vídeo.
  const irAoClique = (e, slug) => {
    if (vistaArrastada) return;
    const r = e.currentTarget.getBoundingClientRect();
    largarPrevia();
    if (slug) {
      if (faixaEscolhida && faixaEscolhida !== slug) abrirAcoes(slug);
      else if (slug !== chatEscolhido) { chatEscolhido = slug; pintarChatVideo(estado.agoraMs, true); }
    }
    irPara(Math.round(inicio + ((fim - inicio) * (e.clientX - r.left)) / r.width));
  };

  // A faixa geral, Todos, em cima das outras: é a que lê o chat ou detecta de toda a gente. Com um
  // canal só, Todos seria ele mesmo, e a faixa dele chega.
  if (estado.linhas.length > 1) {
    const g = document.createElement('div');
    g.className = 'faixaGeral';
    g.dataset.quem = TODOS;
    g.innerHTML = `<button type="button" class="nome" data-quem="${TODOS}" aria-expanded="false" `
      + `aria-label="${escapar(t('faixa.escolherTodos'))}" title="${escapar(t('faixa.escolherTodos'))}">${escapar(t('faixa.todos'))}</button>`
      + `<div class="trilho trilhoGeral">${marcasLidas(TODOS, inicio, fim)}${marcasOuvidas(TODOS, inicio, fim)}</div>`;
    g.querySelector('.trilho').onclick = (e) => irAoClique(e, null);
    alvo.append(g);
  }
  let fila = 0;
  for (const linha of estado.linhas) {
    const nudge = estado.nudges[linha.slug] || 0;
    const f = document.createElement('div');
    const outro = foraDoJogo(linha.slug);
    f.className = `faixa${outro ? ' outroJogo' : ''}${fila++ % 2 ? ' par' : ''}`;
    f.dataset.slug = linha.slug;
    f.dataset.quem = linha.slug;
    f.innerHTML = `<button type="button" class="nome" data-quem="${escapar(linha.slug)}" aria-expanded="false" `
      + `aria-label="${escapar(t('faixa.escolher', { canal: linha.slug }))}" title="${escapar(linha.slug)}">${escapar(linha.slug)}</button>`
      + `<div class="trilho">${linha.pecas.map((p) => {
        // Só o que cai dentro da vista. Com a linha do tempo aproximada, um VOD
        // que acabou antes dela dava um `left` de 0 e a largura mínima, e cada
        // faixa ganhava um risco aceso no princípio a fingir vídeo que lá não
        // está. O trilho só esconde o que passa à direita.
        if (p.playlist.fim - nudge <= inicio || p.playlist.inicio - nudge >= fim) return '';
        const de = Math.max(0, pct(p.playlist.inicio - nudge));
        const ate = Math.min(100, pct(p.playlist.fim - nudge));
        return `<i style="left:${de}%;width:${Math.max(0.4, ate - de)}%"></i>`;
      }).join('')}${marcasLidas(linha.slug, inicio, fim)}${marcasOuvidas(linha.slug, inicio, fim)}${prazoNaFaixa(linha.slug)}`
      + `${outro ? `<span class="outroJogoFaixa">${escapar(t('evento.outroJogo'))}</span>` : ''}</div>`;
    f.querySelector('.trilho').onclick = (e) => irAoClique(e, linha.slug);
    // O prazo é um aviso, e não um sítio da faixa: clicar nele não leva o vídeo para o fim do trilho.
    const pz = f.querySelector('.prazoFaixa');
    if (pz) pz.onclick = (e) => e.stopPropagation();
    alvo.append(f);
  }
  marcarFaixas();
  colocarAcoes();
  pintarRegua();
  pintarTrecho();
  pintarAgulha();
}

/**
 * Os passos da régua, do mais fino ao mais largo, cada um com as divisões pequenas entre duas horas
 * escritas. Abaixo de um minuto a hora leva os segundos.
 */
const PASSOS_REGUA = [
  // Traços pequenos densos como num editor (o dono, 13/10): uns 5 a 15 por divisão escrita; os que ficariam
  // a menos de 5 px uns dos outros não se desenham.
  [5e3, 500], [10e3, 1e3], [15e3, 1e3], [30e3, 2e3], [60e3, 5e3], [2 * 60e3, 10e3], [5 * 60e3, 30e3],
  [10 * 60e3, 60e3], [15 * 60e3, 60e3], [30 * 60e3, 2 * 60e3], [3600e3, 5 * 60e3], [2 * 3600e3, 10 * 60e3],
  [3 * 3600e3, 15 * 60e3], [6 * 3600e3, 30 * 60e3], [12 * 3600e3, 3600e3], [24 * 3600e3, 2 * 3600e3],
];

/**
 * Onde cai cada hora escrita e cada divisão na vista `inicio`..`fim`, numa régua de `largura` px.
 *
 * Como a régua do mapa do evento e a de um editor de vídeo: um passo redondo que dê uns 6 a 10 rótulos
 * na largura que há (num telemóvel menos, para não se tocarem), um traço maior em cada hora escrita e
 * traços pequenos entre elas. As horas são do fuso do aparelho: num fuso de meia hora, as horas cheias
 * caíam a meio dos traços se o passo contasse do UTC.
 */
function marcasDaRegua(inicio, fim, largura) {
  const total = fim - inicio;
  const cabe = (passo) => {
    const larguraRotulo = passo < 60e3 ? 84 : 64;
    return total / passo <= Math.max(3, Math.min(10, Math.floor(largura / larguraRotulo)));
  };
  const [passo, sub] = PASSOS_REGUA.find(([p]) => cabe(p)) || PASSOS_REGUA.at(-1);
  const fuso = new Date(inicio).getTimezoneOffset() * 60_000;
  const alinhar = (de, p) => Math.ceil((de - fuso) / p) * p + fuso;
  const horas = [];
  for (let t = alinhar(inicio, passo); t <= fim; t += passo) horas.push(t);
  const tiques = [];
  // Os traços pequenos só quando ficam a mais de 5 px uns dos outros.
  if ((sub / total) * largura >= 5) {
    for (let t = alinhar(inicio, sub); t <= fim; t += sub) {
      if (Math.abs((((t - fuso) % passo) + passo) % passo) >= 1) tiques.push(t);
    }
  }
  return { passo, sub, horas, tiques, comSegundos: passo < 60e3 };
}

/**
 * A régua: as horas em cima das faixas, as divisões e as kills marcadas nela.
 *
 * Sem isto sabe-se que se está "algures no meio" e mais nada. Com ela, olha-se uma vez e sabe-se que
 * horas são naquele ponto, até onde já se andou, e onde já se marcou. As horas seguem o zoom: com 30 s
 * à vista escrevem os segundos, com a noite toda escrevem de meia em meia hora.
 */
function pintarRegua() {
  const { inicio, fim } = vistaAgora() || {};
  const alvo = $('regua');
  if (!alvo) return;
  if (inicio == null || !(fim > inicio)) { alvo.innerHTML = ''; pintarSobreFaixas(null, null, []); return; }
  const total = fim - inicio;
  const pct = (ms) => ((ms - inicio) / total) * 100;
  const larguraPx = alvo.clientWidth || 600;
  reguaMedida = larguraPx;
  const px = (ms) => ((ms - inicio) / total) * larguraPx;
  const { horas, tiques, comSegundos, sub } = marcasDaRegua(inicio, fim, larguraPx);

  const partes = [];
  // Onde já há texto, em px: as datas primeiro, depois as horas, depois os números das kills. Nada se
  // escreve por cima de nada; o que não cabe fica só com o traço.
  const ocupados = [];
  const livre = (a, b) => !ocupados.some(([x, y]) => a < y + 5 && b > x - 5);

  for (const ms of tiques) partes.push(`<em class="tique" style="left:${pct(ms)}%"></em>`);
  // A passagem de um dia para o outro escreve a data, como no mapa ("ter 06/10"). Numa noite que começa
  // às onze da manhã e acaba às quatro da manhã seguinte, é a única coisa que diz em que dia se está.
  const grade = [];
  let diaAnterior = diaLocal(inicio);
  const rotulos = [];
  for (const ms of horas) {
    const dia = diaLocal(ms);
    const vira = dia !== diaAnterior;
    diaAnterior = dia;
    grade.push({ ms, vira });
    partes.push(`<em class="tique grande${vira ? ' vira' : ''}" style="left:${pct(ms)}%"></em>`);
    rotulos.push({ ms, vira, texto: vira ? rotuloDoDia(ms) : relogioCurto(ms).slice(0, comSegundos ? 8 : 5) });
  }
  // As datas antes das horas, para uma hora nunca tapar a data.
  for (const r of [...rotulos.filter((q) => q.vira), ...rotulos.filter((q) => !q.vira)]) {
    const x = px(r.ms);
    const w = r.texto.length * 6.7 + (r.vira ? 4 : 0);
    // Nas pontas a etiqueta encosta para dentro, para não sair cortada.
    const lado = r.vira ? (x > larguraPx - w - 2 ? 'aDireita' : 'aEsquerda')
      : x < w / 2 + 2 ? 'aEsquerda' : x > larguraPx - w / 2 - 2 ? 'aDireita' : '';
    const [a, b] = lado === 'aEsquerda' ? [x, x + w] : lado === 'aDireita' ? [x - w, x] : [x - w / 2, x + w / 2];
    if (!livre(a, b)) continue;
    ocupados.push([a, b]);
    r.html = `<b class="hora${r.vira ? ' vira' : ''}${lado ? ` ${lado}` : ''}" style="left:${pct(r.ms)}%">${escapar(r.texto)}</b>`;
  }
  for (const r of rotulos) if (r.html) partes.push(r.html);
  // O NÚMERO da kill só quando há sítio para ele.
  //
  // "Coloca a linha do tempo, o timer, do lado de cima; aí tá tudo amontoado." Estava: numa noite com
  // quinze kills, metade delas em dois tiroteios seguidos, os números caíam uns por cima dos outros e o
  // que se lia era uma mancha. O risco fica sempre (é ele que diz ONDE) e o número só entra se o
  // anterior estiver a mais de catorze pixels. Em cima de uma hora escrita o número desce para o lado
  // do risco, para nenhum dos dois tapar o outro: uma kill marcada num minuto certo caía mesmo em cima
  // da hora.
  let ultimoNumero = -Infinity;
  for (const [i, m] of ordenar(estado.momentos).entries()) {
    if (m.ms < inicio || m.ms > fim) continue;
    const x = px(m.ms);
    const w = String(i + 1).length * 6.7 + 4;
    const cabe = x - ultimoNumero >= 14;
    const baixo = cabe && !livre(x - w / 2, x + w / 2);
    if (cabe) ultimoNumero = x;
    partes.push(`<button type="button" class="kill" data-ms="${m.ms}" style="left:${pct(m.ms)}%" `
      + `title="kill ${i + 1}: ${relogioCurto(m.ms)}">${cabe ? `<span${baixo ? ' class="baixo"' : ''}>${i + 1}</span>` : ''}</button>`);
  }

  alvo.innerHTML = partes.join('');
  // Os traços pequenos também descem: a faixa fica cortada como a régua e segue o zoom (o dono, 13/10).
  // Nas faixas, os pequenos só com folga (12 px), para a barra não virar risca.
  const pequenos = (sub / total) * larguraPx >= 12 ? tiques.map((ms) => ({ ms, menor: true })) : [];
  pintarSobreFaixas(inicio, fim, [...grade, ...pequenos]);
  for (const b of alvo.querySelectorAll('.kill')) {
    // A marca de outra kill desliga a prévia desta, senão volta para trás logo.
    b.onclick = () => { largarPrevia(); irPara(Number(b.dataset.ms)); };
  }
  // As alças do trecho de chat vivem na mesma vista da régua: mudam juntas.
  pintarChatTrecho();
}
// Quando o painel muda de largura, o passo da régua muda com ela.
new ResizeObserver(() => {
  const r = $('regua');
  if (r && r.clientWidth && Math.abs(r.clientWidth - reguaMedida) >= 1) pintarRegua();
}).observe($('regua'));

/**
 * Os picos de chat em cima da faixa de quem os teve, e não na régua: "esses pontos amarelos deveria ser
 * em cima da linha do tempo da dona delas" (o dono, 11/10). Assim vê-se de quem é cada pico sem passar o
 * rato. Um por minuto em cada canal. Na faixa Todos fica só um risco fraco por minuto, para dizer que ali
 * houve alguma coisa sem encher a faixa geral de losangos. E as linhas da régua, por baixo de tudo isto.
 */
function pintarSobreFaixas(inicio, fim, grade) {
  const caixa = $('faixas');
  if (!caixa) return;
  for (const v of caixa.querySelectorAll('.picoChat, .picoGeral, .linhaHora')) v.remove();
  if (inicio == null) return;
  const total = fim - inicio;
  // As linhas da régua descem pelas faixas, muito fracas, como as horas no mapa: vê-se até onde já
  // se andou sem ter de subir os olhos até à régua.
  const linhas = grade.map(({ ms, vira, menor }) => `<span class="linhaHora${vira ? ' vira' : ''}${menor ? ' menor' : ''}" aria-hidden="true" `
    + `style="left:${((ms - inicio) / total) * 100}%"></span>`).join('');
  if (linhas) for (const tr of caixa.querySelectorAll('.faixa > .trilho, .faixaGeral > .trilho')) tr.insertAdjacentHTML('afterbegin', linhas);
  // Preso a meio losango das pontas: o trilho corta o que sai dele, e um pico no primeiro segundo
  // da vista ficava cortado ao meio.
  const lugar = (ms) => `left:clamp(6px,${((ms - inicio) / total) * 100}%,calc(100% - 6px))`;
  const trilhos = new Map();
  for (const f of caixa.querySelectorAll('.faixa')) trilhos.set(f.dataset.slug, f.querySelector('.trilho'));
  const geral = caixa.querySelector('.faixaGeral .trilho');
  const minutosGerais = new Set();
  for (const [canal, lista] of picosDoEvento()) {
    const trilho = trilhos.get(canal);
    if (!trilho) continue;
    const minutos = new Set();
    for (const m of lista) {
      if (m.tipo !== 'chat' || m.ms < inicio || m.ms > fim) continue;
      const minuto = Math.floor(m.ms / 60_000);
      if (minutos.has(minuto)) continue;
      minutos.add(minuto);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'picoChat';
      b.dataset.ms = String(m.ms);
      b.dataset.canal = canal;
      b.setAttribute('style', lugar(m.ms));
      b.title = t('regua.picoChat', { hora: relogioCurto(m.ms), canal });
      b.setAttribute('aria-label', b.title);
      // Abre 10 s antes, como o botão do pico no evento: o chat reage depois do lance. E o clique
      // fica no losango: o trilho por baixo levava o vídeo ao sítio exacto do clique logo a seguir.
      b.onclick = (e) => {
        e.stopPropagation();
        if (vistaArrastada) return;
        largarPrevia();
        irPara(m.ms - 10_000);
      };
      trilho.append(b);
      if (geral && !minutosGerais.has(minuto)) {
        minutosGerais.add(minuto);
        const r = document.createElement('i');
        r.className = 'picoGeral';
        r.setAttribute('aria-hidden', 'true');
        r.setAttribute('style', lugar(m.ms));
        geral.append(r);
      }
    }
  }
}

function marcarFaixas() {
  for (const f of $('faixas').querySelectorAll('.faixa')) {
    f.classList.toggle('principal', ehPrincipal(f.dataset.slug));
  }
}

// ── grelha ──────────────────────────────────────────────────────────────────

/**
 * Todos os quadrados, incluindo o que está noutra janela.
 *
 * Um `document.querySelectorAll` deixa de o ver assim que ele muda de janela —
 * e ele viu-o: "abro uma janela à parte, pauso, e não pausa os outros". Não era
 * só o pause: o relógio, o volume e o ajuste passavam-lhe todos ao lado, o que
 * é pior, porque o ângulo ficava a andar sozinho com ar de estar sincronizado.
 *
 * Por isso nada aqui procura quadrados por si: procuram-se por aqui.
 *
 * E por um mapa do slug para o quadro, preenchido no `montarGrade`, e não por
 * um `querySelectorAll` a cada pergunta. O `irPara`, o `aplicarFoco` e o
 * cursor de volume perguntam por cada canal, e com o documento inteiro varrido
 * a cada pergunta isso era quadrático: com quinhentos canais, um +10s
 * prendia a página quase um segundo e um clique num quadro dois. O quadro da
 * janela à parte está no mapa como os outros, porque é o mesmo nó.
 */
const quadros = new Map();
const tiles = () => [...quadros.values()];
const tileDe = (slug) => quadros.get(slug) || null;
const ehFoco = (slug) => estado.focos.includes(slug);
const ehPrincipal = (slug) => estado.focos[0] === slug;

// Os quadros da grelha que estão fora da vista: abaixo da dobra, ou
// escondidos pela procura da grelha.
//
// Cada salto movia todos os secundários para o novo instante, e cada um ia
// buscar um pedaço de vídeo para isso. Com quinhentos ângulos eram quinhentos
// pedidos por salto (uns 140 MB) para quadros que ninguém estava a ver. Um
// quadro fora da vista fica com o leitor que tinha e só é posto no instante
// certo quando volta a aparecer: é aí que alguém olha para ele.
const foraDaVista = new Set();
const porAcertar = new Set();
const vigiaDaVista = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const slug = e.target.dataset.slug;
      if (e.isIntersecting) {
        foraDaVista.delete(slug);
        if (porAcertar.delete(slug)) acertarSecundario(slug);
      } else foraDaVista.add(slug);
    }
  })
  : null;
const naoSeVe = (slug) => foraDaVista.has(slug) && tileDe(slug) !== estado.aparte?.tile;
function esquecerVista() {
  vigiaDaVista?.disconnect();
  foraDaVista.clear();
  porAcertar.clear();
}

/** Pôr um secundário que voltou à vista no instante em que a grelha está. */
function acertarSecundario(slug) {
  const linha = estado.linhas.find((l) => l.slug === slug);
  const tile = tileDe(slug);
  if (!linha || !tile || ehFoco(slug)) return;
  const r = onde(linha, estado.agoraMs, { nudgeMs: estado.nudges[slug] || 0 });
  if (r.estado === 'toca') tocar(linha, r, tile.querySelector('video'), { alta: false, correr: false });
}

/**
 * Qual dos dois manda: o principal é o que tem som e o que corre em qualidade.
 *
 * Faltava isto. Com dois no ecrã não havia como dizer "agora quero ESTE" — e
 * como o som segue o principal, também não havia como ouvir o outro.
 */
/**
 * Este quadrado tem som?
 *
 * Por omissão só o principal fala — dois áudios de surpresa é barulho. Mas
 * assim que alguém carrega no altifalante, a escolha é dele e mantém-se.
 */
/**
 * Parar tudo, ou voltar a andar.
 *
 * É global de propósito: o valor desta página é os ângulos andarem juntos, e
 * um pause que parasse só um quadrado desfazia isso sem dizer nada.
 */
/**
 * O botão de tocar e pausar do transporte, sob o vídeo. O desenho diz o que
 * ACONTECE se carregar (parado mostra o triângulo), como em qualquer leitor.
 */
function pintarTocarPausar() {
  const b = $('tocarPausar');
  if (!b) return;
  b.innerHTML = ICONE(estado.parado ? 'tocar' : 'pausa', 'ic');
  b.setAttribute('aria-pressed', String(estado.parado));
  b.classList.toggle('parado', estado.parado);
}

function alternarPausa() {
  estado.parado = !estado.parado;
  // Não chega mandar parar uma vez.
  //
  // Um `play()` que já estava a caminho — o hls.js a acabar de encher o
  // buffer, uma promessa pendente de um `tocar` anterior — chegava DEPOIS do
  // pause e voltava a pôr tudo a andar. O botão dizia parado e o vídeo
  // continuava, que foi exactamente o que aconteceu.
  //
  // Por isso a pausa fica de guarda: qualquer `play` enquanto estiver parada é
  // desfeito no instante em que acontece.
  // Pelos quadrados que estão MESMO no ecrã, e não pela lista em memória: era
  // aí que o pause falhava calado quando as duas deixavam de coincidir.
  for (const tile of tiles()) {
    const v = tile.querySelector('video');
    const slug = tile.dataset.slug;
    if (!v) continue;
    if (estado.parado) {
      v.pause?.();
      if (!v.__guarda) {
        v.__guarda = () => { if (estado.parado) v.pause?.(); };
        v.addEventListener('play', v.__guarda);
        v.addEventListener('playing', v.__guarda);
      }
    } else if (ehFoco(slug)) {
      v.play?.().catch(() => {});
    }
  }
  for (const tile of tiles()) {
    const b = tile.querySelector('.pausa');
    if (b) b.innerHTML = ICONE(estado.parado ? 'tocar' : 'pausa');
  }
  pintarTocarPausar();
  $('agora').classList.toggle('parado', estado.parado);
}

/**
 * O relogio anda com o video.
 *
 * Ele nunca me disse isto, e via-se em qualquer captura de ecra dele: o vídeo
 * tocava e o risco branco ficava parado no sítio onde ele carregou. A página
 * parecia congelada mesmo a tocar, e o "21:22:11Z" mentia a partir do segundo
 * seguinte.
 *
 * Não chama `irPara`: isso mandava o leitor saltar para onde já está, sessenta
 * vezes por segundo. Só pinta.
 */
function seguirVideo() {
  cancelAnimationFrame(estado.tique);
  const passo = () => {
    estado.tique = requestAnimationFrame(passo);
    if (!estado.ancora || estado.parado || !estado.janela) return;
    const v = tileDe(estado.ancora.slug)?.querySelector('video');
    const passo1 = seguirAncora(estado.ancora, v);
    if (passo1.ms == null) return;
    const { ms } = passo1;
    estado.ancora = passo1.ancora;
    estado.agoraMs = ms;
    pintarRelogio(ms);

    // A previa: chega ao fim do clipe e volta ao princípio, em ciclo, até ele
    // desligar. É assim que se vê quinze candidatos sem descarregar nenhum.
    if (estado.previa && ms >= estado.previa.ate) irPara(estado.previa.de);
  };
  passo();
}

/**
 * Ver a kill antes de a descarregar.
 *
 * "Não consegui ver ainda se os clipes estão bons ou não." A busca pelo som dá
 * quinze candidatos e a maioria não presta — e até agora a única maneira de
 * saber era descarregar e abrir no editor. Isto toca exactamente o pedaço que
 * ia sair no ficheiro, em ciclo, no próprio sítio onde ele decide.
 */
function verMomento(ms) {
  const m = estado.momentos.find((x) => x.ms === ms);
  if (!m) return;
  // Se já estava a ver esta, carregar outra vez desliga.
  if (estado.previa?.ms === ms) {
    estado.previa = null;
    pintarMomentos();
    return;
  }
  // A janela é a MESMA que vai para o ficheiro — combate inteiro e margens por
  // fora. Uma prévia com outros limites mostrava-lhe uma coisa e entregava-lhe
  // outra, e era assim que ele descobria o corte errado só no editor.
  const clipe = clipesDoMomento(m, [m.protagonista], 0)[0];
  estado.previa = clipe
    ? { ms, de: clipe.deMs, ate: clipe.ateMs }
    : { ms, de: ms - (m.protagonistaAntesS ?? 5) * 1000, ate: ms + (m.protagonistaDepoisS ?? 2) * 1000 };
  // E o ângulo é o MESMO que vai para o ficheiro: o de quem matou. Tocava o que
  // estivesse em foco, e quem revia quinze kills a olhar para a vítima aprovava
  // clipes que não tinha visto; com esse ângulo fora do ar nesse instante, a
  // prévia nem andava. É o mesmo gesto de carregar no quadrado dele.
  if (m.protagonista && !ehPrincipal(m.protagonista) && estado.linhas.some((l) => l.slug === m.protagonista)) {
    if (ehFoco(m.protagonista)) estado.focos = [m.protagonista, ...estado.focos.filter((s) => s !== m.protagonista)];
    else estado.focos = [m.protagonista];
    aplicarFoco();
  }
  // Sair da pausa antes de saltar, e nao depois: o `irPara` e que manda tocar.
  if (estado.parado) alternarPausa();
  irPara(estado.previa.de);
  // E, no fim, um `play()` directo ao angulo principal. No iOS um `play()` so
  // vale se sair DENTRO do toque que o utilizador deu — e este sai.
  const v = tileDe(estado.focos[0] || estado.linhas[0]?.slug)?.querySelector('video');
  aplicar(v, 'tocar');
  pintarMomentos();
}

function temSom(slug) {
  // Um ângulo escolhido para ouvir (clique ou tecla de 1 a 9) fala sozinho enquanto estiver no visor.
  if (estado.ouvir && ehFoco(estado.ouvir)) return slug === estado.ouvir;
  if (slug in estado.mudo) return !estado.mudo[slug];
  return ehPrincipal(slug);
}

/**
 * Ouvir este ângulo e só este. Num ângulo do visor só o som muda de sítio; um da grelha abre no
 * visor, como sempre abriu com um clique, e já com o som. Sem `estado.mudo`: essa é a mistura feita à
 * mão no altifalante de cada quadrado, e fica guardada para quando se voltar a ela.
 */
function ouvirAngulo(slug) {
  if (!estado.linhas.some((l) => l.slug === slug)) return;
  const abrir = !ehFoco(slug);
  if (abrir) estado.focos = [slug];
  estado.ouvir = slug;
  // Escolher ouvir um ângulo com o volume a zero era não ouvir nada.
  if (estado.volume[slug] === 0) estado.volume[slug] = 1;
  aplicarFoco();
  if (abrir) irPara(estado.agoraMs);
  // O `play()` sai do clique ou da tecla: o navegador só deixa tocar com som depois de um gesto.
  const v = tileDe(slug)?.querySelector('video');
  if (v && !estado.parado && ehFoco(slug)) v.play?.().catch(() => {});
  guardar();
}

/** O número do ângulo (1 a 9) na ordem da grelha, a mesma que se vê no canto de cada quadrado. */
function angulosNumerados() {
  return ordemDosAngulos(estado.linhas, estado.ordemGrelha, listaDeCanais()).slice(0, 9);
}

/**
 * Passar do "só este" para a mistura à mão: cada quadrado do visor fica com o som que tem agora, e o
 * altifalante ou o volume mexem a partir daí. Sem isto, ligar o som do outro com um ângulo escolhido
 * não fazia nada, porque o escolhido continuava a mandar.
 */
function largarOuvir() {
  if (!estado.ouvir) return;
  for (const s of estado.focos) estado.mudo[s] = !temSom(s);
  estado.ouvir = null;
}

function alternarSom(slug) {
  largarOuvir();
  estado.mudo[slug] = temSom(slug);
  aplicarFoco();
  const v = tileDe(slug)?.querySelector('video');
  // Este `play()` sai de um clique, e e por isso que existe: o browser so
  // deixa tocar com som depois de alguem carregar em alguma coisa.
  if (v && temSom(slug)) v.play?.().catch(() => {});
  guardar();
}

/**
 * Pôr ou tirar um ângulo do par. Dois é o limite, e é de propósito: o objectivo
 * é decidir se vale a pena baixar, e para isso comparam-se dois.
 */
function alternarPar(slug) {
  if (ehFoco(slug)) {
    if (estado.focos.length > 1) estado.focos = estado.focos.filter((s) => s !== slug);
  } else {
    estado.focos = [...estado.focos, slug].slice(-2);
  }
  aplicarFoco();
  irPara(estado.agoraMs);
  guardar();
}

/**
 * Mudar o foco MOVE os quadrados, não os recria.
 *
 * A versão anterior deitava a grelha inteira fora e reconstruía tudo — cada
 * troca de foco matava os leitores todos, e voltava a descarregar o que já
 * estava carregado. Mover um `<video>` de um sítio para o outro no DOM mantém-
 * -o vivo, e só quem mudou de papel é que volta a carregar (porque muda de
 * degrau de qualidade), que são dois quadrados e não trinta.
 */
function aplicarFoco() {
  for (const slug of [...estado.focos, ...estado.linhas.map((l) => l.slug)]) {
    const tile = tileDe(slug);
    if (!tile) continue;
    const foco = ehFoco(slug);
    const destino = foco ? $('palcoFoco') : $('grade');
    // Só mexer no DOM quando o quadrado está mesmo no sítio errado.
    //
    // A versão anterior voltava a inserir TODOS os quadrados em foco a cada
    // passagem, para os reordenar. Reinserir um `<video>` a tocar interrompe-o:
    // por isso, ao acrescentar um segundo ângulo, o que já estava a correr
    // congelava até tudo voltar a carregar. Agora um nó que já está na posição
    // certa não é tocado.
    const posicao = foco ? estado.focos.indexOf(slug) : -1;
    const jaCerto = tile.parentElement === destino
      && (!foco || destino.children[posicao] === tile);
    // O que está na janela à parte fica lá. Sem esta linha, qualquer coisa que
    // repinta o foco — carregar no som, mudar de ângulo, marcar uma kill —
    // arrancava-o da janela e trazia-o de volta para a grelha a meio do que
    // ele estava a ver.
    const naJanela = tile === estado.aparte?.tile;
    if (!jaCerto && !naJanela) {
      const antes = foco ? destino.children[posicao] : null;
      destino.insertBefore(tile, antes || null);
    }
    tile.classList.toggle('foco', foco);
    tile.classList.toggle('principal', ehPrincipal(slug));
    // O botão do canto muda de DESENHO e de NOME com o papel do quadrado.
    // "Tá difícil de entender o que significam os ícones." Estava: era um "+"
    // na miniatura — com um "+" e um "−" de acerto de relógio logo por baixo,
    // no mesmo quadrado — e um "✓" no ângulo aberto, que não diz o que
    // acontece se se carregar nele. Agora a miniatura mostra dois painéis
    // lado a lado, que é o que o botão faz, e o ângulo aberto mostra um olho,
    // que é o que ele já está a fazer. E os dois têm a sua própria frase.
    const par = tile.querySelector('.par');
    par.innerHTML = ICONE('olho');
    const dizPar = t(foco ? 'tile.aVer' : 'tile.par');
    par.title = dizPar;
    par.setAttribute('aria-label', dizPar);
    // O som é de cada quadrado, e não do papel de principal. Assim dá para ter
    // os dois a falar, os dois calados, ou um só — que é o que se quer quando
    // se compara um tiro visto de dois sítios.
    //
    // Muda no instante do clique e não no carregamento diferido: ficar com dois
    // a falar por cima até os pedidos de vídeo acabarem é insuportável.
    const cala = temSom(slug) === false;
    const nivel = estado.volume[slug] ?? 1;
    const v = tile.querySelector('video');
    v.muted = cala;
    v.toggleAttribute('muted', cala);
    v.volume = Math.min(1, Math.max(0, nivel));

    // A marca de quem tem som: o altifalante ao lado do número, e o fio do quadrado noutra cor.
    const ouve = foco && !cala && nivel > 0;
    tile.classList.toggle('ouvindo', ouve);
    tile.querySelector('.comSomLeitor').hidden = !ouve;
    // A dica de que o clique no vídeo é o som: só onde há outro ângulo para onde o tirar.
    const dica = foco && estado.linhas.length > 1 ? t('tile.ouvirDica') : '';
    if (dica) tile.title = dica;
    else tile.removeAttribute('title');

    const som = tile.querySelector('.som');
    som.hidden = !foco;
    const botao = som.querySelector('.somBtn');
    botao.innerHTML = ICONE(cala || nivel === 0 ? 'mudo' : 'som');
    // O nome que o leitor de ecrã lê vai com a dica: antes dizia "pausar" e
    // havia dois botões de pausa por quadrado.
    const nomeSom = cala ? 'tile.ligarSom' : 'tile.calar';
    botao.title = t(nomeSom);
    botao.dataset.tAria = nomeSom;
    botao.setAttribute('aria-label', t(nomeSom));
    som.querySelector('.vol').value = String(Math.round(nivel * 100));
    som.querySelector('.pausa').innerHTML = ICONE(estado.parado ? 'tocar' : 'pausa');
  }
  $('palcoFoco').classList.toggle('dois', estado.focos.length > 1);
  marcarFaixas();
  // O chat ao lado e o "Chat de" do trecho seguem quem está em foco, até se escolher outro à mão.
  pintarChatTrecho();
  pintarChatVideo(estado.agoraMs, true);
  // A ordem é reposta aqui e não no `montarGrade`: um quadrado que desce do
  // foco para a grelha é ACRESCENTADO ao fim, e sem isto ficava lá.
  pintarOrdemDaGrelha();
}

/**
 * Pôr os quadrados pela ordem escolhida.
 *
 * Pelo CSS e não pelo DOM: mover um `<video>` a tocar interrompe-o — está
 * escrito no `aplicarFoco` porque já aconteceu.
 */
function pintarOrdemDaGrelha() {
  const barra = $('barraGrelha');
  const tiles = [...$('grade').querySelectorAll('.tile')];
  // O título (com quantos ângulos há) aparece logo com um ângulo na grelha; a ordem e a procura só com
  // dois ou mais, que é quando há o que ordenar ou procurar.
  barra.hidden = tiles.length < 1;
  barra.classList.toggle('soUm', tiles.length < 2);
  $('contaAngulos').textContent = String(estado.linhas.length);
  // O foco TAMBÉM é uma grelha. Um quadrado que sobe da grelha para o foco
  // levava consigo o `order` que tinha lá em baixo, e com dois em foco isso
  // trocava-os um pelo outro — o principal deixava de ser o da esquerda.
  for (const tile of $('palcoFoco').querySelectorAll('.tile')) tile.style.order = '';
  aplicarOrdem(tiles, ordemDosAngulos(estado.linhas, estado.ordemGrelha, listaDeCanais()));
  pintarNumeros();
  for (const b of document.querySelectorAll('.ordemGrelha')) {
    b.setAttribute('aria-pressed', String(b.dataset.ordem === estado.ordemGrelha));
  }
  pintarFiltroDaGrelha();
}

/**
 * O número de cada ângulo, que é a tecla que lhe passa o som. Com um ângulo só não há o que trocar, e
 * o número não aparece. O que tem som leva o altifalante à frente do número.
 */
function pintarNumeros() {
  const numerados = angulosNumerados();
  const varios = estado.linhas.length > 1;
  for (const [slug, tile] of quadros) {
    const b = tile.querySelector('.numAngulo');
    if (!b) continue;
    const i = numerados.indexOf(slug);
    const ouve = tile.classList.contains('ouvindo');
    const numero = varios && i >= 0 ? String(i + 1) : '';
    b.hidden = !numero && !(ouve && varios);
    const html = `${ouve && varios ? ICONE('som') : ''}${numero}`;
    if (b.innerHTML !== html) b.innerHTML = html;
  }
}

/**
 * Esconder da grelha os ângulos que não interessam agora.
 *
 * "Adiciona um lugar de pesquisa pra pesquisar as miniaturas de vídeo em
 *  baixo." Com dezassete quadrados de 150 px, achar um pelo nome é passar os
 * olhos por todos; com trinta é desistir.
 *
 * ESCONDE, e não tira: um `<video>` arrancado do DOM pára e volta a carregar,
 * e limpar a caixa devolvia trinta quadrados a descarregar tudo outra vez.
 * Com `display: none` o leitor continua vivo e sincronizado por trás — o que
 * ele quer é ver menos, não desligar nada.
 *
 * O contador só aparece quando há filtro: sem ele diria "17 de 17", e ali ao
 * lado já há um "17 de 17 ângulos" na linha do tempo que quer dizer OUTRA
 * coisa — quantos estavam no ar naquele instante. Dois contadores iguais com
 * sentidos diferentes é pior do que nenhum.
 */
function pintarFiltroDaGrelha() {
  const procura = ($('filtrarGrelha').value || '').trim().toLowerCase();
  const tiles = [...$('grade').querySelectorAll('.tile')];
  let vistos = 0;
  for (const tile of tiles) {
    const cabe = !procura || tile.dataset.slug.toLowerCase().includes(procura);
    tile.classList.toggle('foraDoFiltro', !cabe);
    if (cabe) vistos++;
  }
  const nota = $('quantosNaGrelha');
  nota.classList.toggle('mau', procura !== '' && vistos === 0);
  nota.textContent = !procura ? ''
    : vistos === 0 ? t('grelha.nenhum')
      : t('grelha.deQuantos', { n: vistos, total: tiles.length });
}

function montarGrade() {
  // O quadro da janela à parte fica vivo, com o leitor dele, se o canal
  // continuar nesta noite. Juntar um streamer reconstrói a grelha toda, e o
  // segundo monitor ficava com um quadro de leitor destruído: preto, com
  // controlos que pareciam vivos e já não mandavam em nada. Um canal que saiu
  // da noite fecha a janela, que é o que ela mostraria de qualquer maneira.
  // O PiP de vídeo não leva quadro nenhum: o vídeo dele é o de um quadro que
  // vai ser deitado fora, e por isso fecha sempre.
  const fora = estado.aparte?.tile || null;
  const ficaFora = fora && estado.linhas.some((l) => l.slug === fora.dataset.slug) ? fora : null;
  if (estado.aparte && !ficaFora) fecharAparte();
  const leitorFora = ficaFora ? estado.players.get(ficaFora.dataset.slug) : null;
  $('grade').innerHTML = '';
  $('palcoFoco').innerHTML = '';
  estado.players.forEach((p) => { if (p !== leitorFora) p.destroy?.(); });
  estado.players.clear();
  if (leitorFora) estado.players.set(ficaFora.dataset.slug, leitorFora);
  quadros.clear();
  esquecerVista();

  for (const linha of estado.linhas) {
    if (ficaFora && linha.slug === ficaFora.dataset.slug) {
      quadros.set(linha.slug, ficaFora);
      continue;
    }
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.slug = linha.slug;
    tile.innerHTML = '<video muted playsinline preload="none"></video>'
      // O número do ângulo (a tecla que lhe passa o som) e, no que tem som, o altifalante.
      + `<span class="rotulo"><b class="numAngulo" aria-hidden="true"></b>${linha.slug}`
      + `<span class="soLeitor comSomLeitor" data-t="tile.comSom" hidden>${t('tile.comSom')}</span>`
      + `${linha.relogio !== 'exato' ? ` <b class="aviso" data-t-titulo="tile.relogioIncerto" title="${t('tile.relogioIncerto')}">≈</b>` : ''}`
      + ' <b class="posicao"></b></span>'
      + '<span class="estadoTile"></span>'
      // Os dois grupos numa barra só, e não cada um colado ao seu canto.
      //
      // Colados aos cantos batiam um no outro assim que o quadrado ficava
      // pequeno — e com dezoito canais na grelha todos ficam pequenos. Ele
      // viu-o: "tem botões e coisas sobrepondo". Numa barra com
      // `space-between` isso deixa de ser possível.
      + '<span class="controlos">'
      // O som à esquerda, com o cursor de volume ao lado — o mesmo sítio da
      // Twitch, da Kick e do YouTube. Um controlo que toda a gente já sabe
      // usar não se põe noutro sítio só porque dá jeito.
      + '<span class="som" hidden>'
      + `<button class="pausa" data-t-titulo="tile.pausa" title="${t('tile.pausa')}">${ICONE('pausa')}</button>`
      + `<button class="somBtn" data-t-aria="tile.calar" aria-label="${t('tile.calar')}">${ICONE('mudo')}</button>`
      + `<input class="vol" type="range" min="0" max="100" value="100" data-t-aria="tile.volume" aria-label="${t('tile.volume')}">`
      + '</span>'
      // O relógio da Kick põe cada ângulo dentro de um segmento da verdade, o
      // que já está dentro do que o dono pediu. Isto é para o resto: um stream
      // com mais buffer, ou um olho que diz "este está meio segundo à frente".
      + '<span class="ajuste">'
      // O nome do que isto é: "0.0s" com um mais e um menos, solto no vídeo, não dizia que era a sincronia.
      // O nome saiu do vídeo (o dono, 13/10): a explicação aparece ao parar o mouse no número ou nos botões.
      + `<button data-passo="-1" data-t-titulo="tile.atrasar" title="${t('tile.atrasar')}">−</button>`
      + `<b class="nudge" data-t-titulo="tile.sincroniaDica" title="${t('tile.sincroniaDica')}">0.0s</b>`
      + `<button data-passo="1" data-t-titulo="tile.adiantar" title="${t('tile.adiantar')}">+</button>`
      + '</span>'
      // Ecrã cheio e janela à parte no canto de baixo à direita, como no YouTube e na Twitch (o dono, 13/10).
      + '<span class="cantoDir">'
      + `<button class="aparte" data-t-titulo="tile.aparte" data-t-aria="tile.aparte" title="${t('tile.aparte')}" aria-label="${t('tile.aparte')}" hidden>`
      + `${ICONE('janela')}</button>`
      + `<button class="ecraCheio" data-t-titulo="tile.ecraCheio" data-t-aria="tile.ecraCheio" title="${t('tile.ecraCheio')}" aria-label="${t('tile.ecraCheio')}">`
      + `${ICONE('ecra-cheio')}</button>`
      + '</span>'
      + '</span>'
      // Em cima à direita fica só o botão do papel do quadrado (o olho no ângulo aberto).
      + '<span class="fora">'
      + `<button class="par" title="${t('tile.par')}" aria-label="${t('tile.par')}">${ICONE('lado-a-lado')}</button>`
      + '</span>';

    tile.onclick = () => {
      // Clicar num vídeo dá-lhe o som, e cala os outros (IDEIAS.md, item 8). Num quadrado que já
      // está em foco, mais nada muda: antes o clique promovia-o a principal e o par trocava de lado,
      // e quem só queria ouvir o outro perdia o sítio de cada um. Na grelha, o clique continua a
      // abrir o ângulo no visor, já com o som.
      // O dono (13/10): tocar numa miniatura, em qualquer sítio, abre-a grande, ou ao lado do player que já está aberto.
      if (!ehFoco(linha.slug) && estado.focos.length) { alternarPar(linha.slug); estado.ouvir = linha.slug; aplicarFoco(); return; }
      ouvirAngulo(linha.slug);
    };
    for (const b of tile.querySelectorAll('.ajuste button')) {
      b.onclick = (e) => {
        // Sem isto o clique também acerta no quadrado e muda o foco, ou seja
        // duas coisas ao mesmo tempo e uma delas não foi pedida.
        e.stopPropagation();
        empurrar(linha.slug, Number(b.dataset.passo) * (e.shiftKey ? 10_000 : 1000));
      };
    }
    tile.querySelector('.par').onclick = (e) => { e.stopPropagation(); alternarPar(linha.slug); };
    // Arrastar (o dono, 13/10): um player aberto para cima do outro troca os dois de lugar; uma miniatura para
    // cima de um player aberto entra no lugar dele.
    tile.draggable = true;
    tile.addEventListener('dragstart', (e) => {
      if (e.target.closest('button, input')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/povix-angulo', linha.slug);
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('aArrastar');
    });
    tile.addEventListener('dragend', () => tile.classList.remove('aArrastar'));
    tile.addEventListener('dragover', (e) => {
      if (!ehFoco(linha.slug) || !e.dataTransfer.types.includes('text/povix-angulo')) return;
      e.preventDefault();
      tile.classList.add('alvoArrastar');
    });
    tile.addEventListener('dragleave', () => tile.classList.remove('alvoArrastar'));
    tile.addEventListener('drop', (e) => {
      tile.classList.remove('alvoArrastar');
      const de = e.dataTransfer.getData('text/povix-angulo');
      if (!de || de === linha.slug || !ehFoco(linha.slug)) return;
      e.preventDefault();
      const focos = [...estado.focos];
      const iAlvo = focos.indexOf(linha.slug);
      const iDe = focos.indexOf(de);
      if (iDe >= 0) [focos[iAlvo], focos[iDe]] = [focos[iDe], focos[iAlvo]];
      else focos[iAlvo] = de;
      estado.focos = focos;
      aplicarFoco();
      irPara(estado.agoraMs);
      guardar();
    });
    tile.querySelector('.ecraCheio').onclick = async (e) => {
      e.stopPropagation();
      // Sair, se já lá está. Um botão que só sabe entrar deixa a pessoa presa
      // ao Esc, e no telemóvel não há Esc.
      const doc = tile.ownerDocument;
      if (doc.fullscreenElement) { await doc.exitFullscreen(); return; }
      // Numa janela à parte isto costuma ser NEGADO — o browser não dá ecrã
      // cheio a uma janela que já está sempre à frente de tudo. Tentar e dizer
      // porque falhou é melhor do que esconder o botão: escondido, ele foi lá
      // procurá-lo e não o encontrou.
      try {
        await irAEcraCheio(tile, { janela: doc.defaultView || globalThis });
      } catch {
        // A explicação tem de aparecer DENTRO da janela onde ele carregou —
        // uma mensagem na página principal, atrás desta, não se vê.
        //
        // Num recado à parte, e não por cima do rótulo: apagar o rótulo levava o
        // `.posicao` com ele, e durante seis segundos o `irPara` rebentava a
        // cada salto e o vídeo deixava de andar com o relógio.
        tile.querySelector('.recado')?.remove();
        const r = doc.createElement('span');
        r.className = 'recado';
        r.setAttribute('role', 'status');
        // A janela à parte tem o recado dela; na página normal a culpa não é
        // de janela nenhuma.
        r.textContent = t(doc === document ? 'tile.semEcraCheio' : 'tile.semEcraCheioAparte');
        tile.append(r);
        setTimeout(() => r.remove(), 6000);
      }
    };
    const aparte = tile.querySelector('.aparte');
    // Só aparece onde funciona. Um botão que não faz nada é pior do que não ter
    // botão nenhum, porque a pessoa carrega, não acontece nada, e fica sem
    // saber se se enganou ou se a página está avariada.
    const podeAparte = capacidades();
    aparte.hidden = !(podeAparte.documentoPiP || podeAparte.videoPiP);
    aparte.onclick = async (e) => {
      e.stopPropagation();
      if (estado.aparte) { estado.aparte.fechar(); return; }
      // O foco vai com ele: tirar um ângulo para o segundo monitor e deixá-lo
      // mudo e pequeno seria tirar o ângulo errado.
      if (!ehFoco(linha.slug)) { estado.focos = [linha.slug]; aplicarFoco(); irPara(estado.agoraMs); }
      estado.aparte = await abrirJanela(tile, {
        aoFechar: () => {
          estado.aparte = null;
          // A grelha pode ter sido refeita com ele lá fora, e o sítio de onde
          // saiu já não existe: volta para a grelha, se ainda é o quadro dele.
          if (quadros.get(linha.slug) === tile && !$('grade').contains(tile) && !$('palcoFoco').contains(tile)) {
            $('grade').append(tile);
          }
          aplicarFoco();
        },
      }).catch(() => null);
    };
    tile.querySelector('.pausa').onclick = (e) => { e.stopPropagation(); alternarPausa(); };
    tile.querySelector('.somBtn').onclick = (e) => { e.stopPropagation(); alternarSom(linha.slug); };
    const vol = tile.querySelector('.vol');
    vol.onclick = (e) => e.stopPropagation();
    vol.oninput = (e) => {
      e.stopPropagation();
      estado.volume[linha.slug] = Number(vol.value) / 100;
      // Mexer no volume LIGA o som: ninguém arrasta o cursor de um canal
      // calado à espera de continuar a não ouvir nada.
      largarOuvir();
      if (Number(vol.value) > 0) estado.mudo[linha.slug] = false;
      aplicarFoco();
      guardar();
    };
    $('grade').append(tile);
    quadros.set(linha.slug, tile);
    vigiaDaVista?.observe(tile);
  }
  aplicarFoco();
}

/** Ajuste manual de um ângulo — o resto da grelha não se mexe. */
function empurrar(slug, ms) {
  const { nudges } = comNudge({ nudges: estado.nudges }, slug, (estado.nudges[slug] || 0) + ms);
  estado.nudges = nudges;
  irPara(estado.agoraMs);
  pintarConfianca();
  guardar();
  // O tamanho do corte é por canal, e mexer no relógio de um canal muda quem
  // aparece na janela marcada. Não repintar deixava a lista a mentir.
  pintarCorte();
  // E a faixa desse canal desloca-se com ele, senão mostra o sítio antigo.
  pintarFaixas();
}

/**
 * Move every angle to the same instant.
 *
 * Só UM ângulo toca — o que está em foco. Os outros ficam parados e apenas
 * saltam para o frame daquele instante, que é uma imagem descodificada de vez
 * em quando em vez de um vídeo a correr. É o que faz trinta ângulos serem
 * possíveis: trinta descodificadores a andar ao mesmo tempo derretem qualquer
 * máquina, e ninguém está a OLHAR para trinta ao mesmo tempo.
 */
/**
 * O relogio no ecra, sem mandar ninguem saltar.
 *
 * Isto e so pintura: o texto das horas, o cursor branco, a barra e a linha que
 * fica acesa na lista. Existe separado do `irPara` por causa do vídeo a
 * ANDAR — a cada quadro o relógio avança, e se avançar chamando `irPara`
 * mandava o leitor saltar para onde ele já está, sessenta vezes por segundo.
 */
function pintarRelogio(quandoMs) {
  $('agora').textContent = `${relogioCurto(quandoMs)}`;
  const vivos = quantosNoAr(estado.linhas, quandoMs, { nudges: estado.nudges });
  for (const li of $('listaMomentos').querySelectorAll('li[data-ms]')) {
    li.classList.toggle('aqui', Math.abs(Number(li.dataset.ms) - quandoMs) < 1500);
  }
  // Com um canal so isto dizia "1 de 1 angulos" a vermelho, como se faltasse
  // alguem. Nao falta: e o que ele pediu.
  $('angulos').textContent = soUmCanal() ? '' : t('tempo.angulos', { n: vivos, total: estado.linhas.length });
  $('angulos').classList.toggle('mau', !soUmCanal() && vivos < 2);
  // Sem noite não há barra a pintar. Acontecia com uma tecla carregada antes
  // de abrir a noite, ou depois de uma que falhou: rebentava a cada toque.
  const vista = vistaAgora();
  if (!vista) return;
  const { inicio, fim } = vista;
  const fraccao = Math.min(1, Math.max(0, (quandoMs - inicio) / (fim - inicio)));
  $('barra').value = String(Math.round(fraccao * 1000));
  // O cursor vive por cima das faixas e não dentro de uma delas: é um instante
  // só, partilhado por todos os canais — que é a ideia toda desta página.
  fraccaoDaAgulha = fraccao;
  pintarAgulha();
  // A frase do link diz o instante, e o instante anda. Reescrevê-la a cada
  // frame era trabalho para nada: só quando o segundo muda.
  const segundo = Math.floor(quandoMs / 1000);
  if (segundo !== ultimoSegundo) { ultimoSegundo = segundo; pintarPartilha(); pintarChatVideo(quandoMs); }
}
let ultimoSegundo = -1;

// ── a agulha ────────────────────────────────────────────────────────────────
//
// O dono, 10/10: a bolinha da barra de posição não ficava em cima da linha branca das faixas. Eram duas
// contas: o pino nativo do input anda entre meia largura do pino de cada lado, e a linha andava pela
// coluna das faixas sem o espaço entre colunas. Agora é uma peça só, como a agulha de um editor: a
// cabeça e a linha são o mesmo elemento, posto com um `left` em píxeis tirado do eixo do tempo das
// faixas (o trilho), e o rato e o dedo na barra usam essa mesma conta ao contrário.
let fraccaoDaAgulha = 0;

/** O eixo do tempo no ecrã: o trilho da primeira faixa, ou a barra quando ainda não há faixas. */
function eixoDoTempo() {
  const trilho = $('faixas').querySelector('.trilho');
  const r = trilho?.getBoundingClientRect();
  return r && r.width > 0 ? r : $('barra').getBoundingClientRect();
}

function pintarAgulha() {
  const agulha = $('cursor');
  const relogio = agulha.parentElement;
  if (!vistaAgora() || !relogio) { agulha.hidden = true; return; }
  const eixo = eixoDoTempo();
  const caixa = relogio.getBoundingClientRect();
  const barra = $('barra').getBoundingClientRect();
  const faixas = $('faixas').getBoundingClientRect();
  if (!eixo.width || !caixa.width) { agulha.hidden = true; return; }
  agulha.hidden = false;
  const x = eixo.left + eixo.width * fraccaoDaAgulha;
  const topo = barra.top + barra.height / 2;
  agulha.style.left = `${x - caixa.left - relogio.clientLeft - 1}px`;
  agulha.style.top = `${topo - caixa.top - relogio.clientTop}px`;
  agulha.style.height = `${Math.max(0, faixas.bottom - topo)}px`;
}

/** Arrastar pela cabeça ou pela barra: o ponteiro vira um instante pela conta da agulha. */
function ligarAgulha() {
  const msDoPonteiro = (e) => {
    const vista = vistaAgora();
    if (!vista) return null;
    const eixo = eixoDoTempo();
    const f = Math.min(1, Math.max(0, (e.clientX - eixo.left) / eixo.width));
    return Math.round(vista.inicio + (vista.fim - vista.inicio) * f);
  };
  const agarrar = (el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !vistaAgora()) return;
      e.preventDefault();
      $('barra').focus({ preventScroll: true });
      try { el.setPointerCapture(e.pointerId); } catch { /* um ponteiro sintético não se prende */ }
      $('cursor').classList.add('aArrastar');
      largarPrevia();
      // Arrastando, a agulha e a hora andam já com o rato, mas os vídeos só saltam uns 4 vezes por
      // segundo; ao largar, salta-se para o ponto exato.
      const saltos = limitarSaltos(irPara);
      let ultimoMs = msDoPonteiro(e);
      saltos.pedir(ultimoMs);
      const mover = (m) => {
        const ms = msDoPonteiro(m);
        if (ms == null) return;
        ultimoMs = ms;
        estado.agoraMs = ms;
        pintarRelogio(ms);
        saltos.pedir(ms);
      };
      const largar = () => {
        $('cursor').classList.remove('aArrastar');
        el.removeEventListener('pointermove', mover);
        el.removeEventListener('pointerup', largar);
        el.removeEventListener('pointercancel', largar);
        if (ultimoMs != null) saltos.fechar(ultimoMs);
      };
      el.addEventListener('pointermove', mover);
      el.addEventListener('pointerup', largar);
      el.addEventListener('pointercancel', largar);
    });
  };
  agarrar(document.querySelector('.barraLinha'));
  agarrar($('cabecaAgulha'));
  // As faixas mudam de tamanho (a barra da faixa abre, o vídeo abre ao lado, a janela muda) e rolam
  // por dentro: a agulha volta ao sítio em cada uma dessas.
  const ver = new ResizeObserver(() => pintarAgulha());
  ver.observe($('cursor').parentElement);
  ver.observe($('faixas'));
  $('faixas').addEventListener('scroll', pintarAgulha, { passive: true });
  window.addEventListener('resize', pintarAgulha);
}

// ── o chat ao lado do vídeo ─────────────────────────────────────────────────
//
// As últimas mensagens do canal em foco até ao instante do vídeo, a andar com ele. Mostram o que o
// chat dizia naquele segundo, e por isso, num pico, o que aconteceu (o dono, 07/10).
const CHAT_LINHAS = 40;
const EMOTE_CHAT = /\[emote:\d+:([^\]]+)\]/g;
let chatPintado = '';
function pintarChatVideo(quandoMs, forcar = false) {
  const canal = canalDoChat();
  const lista = (canal && mensagensDoEvento().get(canal)) || [];
  const caixa = $('chatVideo');
  if (!lista.length || !estado.linhas.length) {
    caixa.hidden = true;
    chatPintado = '';
    return;
  }
  // A última mensagem até agora, por busca binária: uma noite de chat são milhares.
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (lista[meio].ms <= quandoMs) lo = meio + 1; else hi = meio;
  }
  const chave = `${canal}|${lo}|${lista.length}`;
  if (!forcar && chave === chatPintado) return;
  chatPintado = chave;
  caixa.hidden = false;
  $('chatVideoTitulo').textContent = t('chat.de', { canal });
  const vistas = lista.slice(Math.max(0, lo - CHAT_LINHAS), lo);
  $('chatLinhas').innerHTML = vistas.length
    ? vistas.map((m) => `<li><span class="hora">${relogioCurto(m.ms)}</span> <b>${escapar(m.autor || '')}</b> `
      + `${escapar(String(m.texto || '').replace(EMOTE_CHAT, '$1'))}</li>`).join('')
    : `<li class="nota">${escapar(t('chat.nada'))}</li>`;
  const ol = $('chatLinhas');
  ol.scrollTop = ol.scrollHeight;
}

// ── ler chat e detectar, a partir da faixa de uma pessoa (ou de todos) ──────
//
// O dono, 10/10: "em cima da linha do tempo da pessoa: escolhe a pessoa ou clica nela, clica em ler chat e
// escolhe ler de que ponto a que ponto ou ler todo, e ter opção de ler chat de todos". E a seguir: "a
// detecção automática também deveria ter as mesmas opções". Clicar no nome de uma faixa (ou em Todos, a
// faixa geral de cima) abre por baixo dela uma barra com quatro escolhas: ler chat ou detectar, de um
// trecho ou de tudo. Trecho põe duas alças em cima dessa faixa, como a seleção de um editor; tudo é o
// tempo todo que a pessoa esteve ao vivo na noite aberta. A leitura do chat é a do evento (evento-ui.js,
// lerChatTrecho), que já sabe o que foi lido e não o pede outra vez; com ou sem evento aberto, porque o
// chat vem do canal e não do elenco. O chat ao lado do vídeo é sempre o da pessoa escolhida.
const TRECHO_PADRAO_MS = 10 * 60_000;
const TRECHO_MIN_MS = 5000;
const TODOS = '*';
let chatTrecho = null;
let chatEscolhido = null;
let chatTrechoControlo = null;
// O aviso antes de ouvir muito, quando está aberto (ver `perguntarAntes`).
let avisoAberto = null;
// O módulo do evento, que lê o chat. Só existe depois de montado, no fim deste ficheiro.
let chatDoEvento = null;
// De quem é a barra aberta (um canal, ou TODOS), e onde vai o assistente dela: a acção ('chat' ou
// 'detetar'), quanto ('trecho' ou 'tudo') e o passo (1 a 4). As alças estão à vista no passo 3 e 4 do
// trecho. A última escolha de cada passo fica guardada no aparelho, e o passo 1 e o 2 abrem com ela
// destacada e com o foco nela, sem saltar passos sozinhos.
let faixaEscolhida = null;
let acaoFaixa = null;
let quantoFaixa = null;
let passoFaixa = 1;
let ultimaEscolha = { acao: null, quanto: null };
try {
  const g = JSON.parse(localStorage.getItem('povix.assistente') || 'null');
  if (g && ['chat', 'detetar'].includes(g.acao)) ultimaEscolha.acao = g.acao;
  if (g && ['trecho', 'tudo'].includes(g.quanto)) ultimaEscolha.quanto = g.quanto;
} catch { /* janela privada */ }
const alcasAVista = () => quantoFaixa === 'trecho' && passoFaixa >= 3;
// A entrada e a saída que já viraram trecho uma vez: a marca nova passa para as alças, a mesma não volta
// a desfazer o que se arrastou depois.
let marcaUsada = '';

/** De quem é o chat: o escolhido, se ainda está aberto, ou o do vídeo em foco. */
function canalDoChat() {
  if (chatEscolhido && estado.linhas.some((l) => l.slug === chatEscolhido)) return chatEscolhido;
  return estado.focos[0] || estado.linhas[0]?.slug || null;
}

/** Quando é que o canal esteve ao vivo nesta noite, no relógio da noite (com o ajuste dele). */
function aoVivoDe(slug) {
  const l = estado.linhas.find((x) => x.slug === slug);
  if (!l || !Number.isFinite(l.inicio) || !Number.isFinite(l.fim)) return null;
  const nudge = estado.nudges[slug] || 0;
  return l.fim > l.inicio ? { deMs: l.inicio - nudge, ateMs: l.fim - nudge } : null;
}

/** Dez minutos à volta de `ms`, dentro da noite; encostado à ponta quando não cabe. */
function trechoEmVolta(ms) {
  const { inicio, fim } = estado.janela;
  const dur = Math.min(TRECHO_PADRAO_MS, fim - inicio);
  let de = Math.round(ms - dur / 2);
  de = Math.min(Math.max(de, inicio), fim - dur);
  return { deMs: de, ateMs: de + dur };
}

/** O trecho sempre dentro da noite aberta e com o início antes do fim. Uma noite nova traz um novo. */
function acertarChatTrecho() {
  if (!estado.janela) { chatTrecho = null; return null; }
  const { inicio, fim } = estado.janela;
  if (!chatTrecho || chatTrecho.ateMs <= inicio || chatTrecho.deMs >= fim) {
    chatTrecho = trechoEmVolta(Number.isFinite(estado.agoraMs) ? estado.agoraMs : inicio);
  }
  const de = Math.min(Math.max(chatTrecho.deMs, inicio), fim - TRECHO_MIN_MS);
  const ate = Math.max(Math.min(chatTrecho.ateMs, fim), de + TRECHO_MIN_MS);
  chatTrecho = { deMs: de, ateMs: ate };
  return chatTrecho;
}

/** Mexer numa alça. A outra não se mexe: a que anda pára a 5 s dela, e nunca a passa. */
function moverAlca(qual, ms) {
  if (!acertarChatTrecho()) return;
  const { inicio, fim } = estado.janela;
  const alvo = Math.round(ms);
  if (qual === 'inicio') chatTrecho.deMs = Math.min(Math.max(alvo, inicio), chatTrecho.ateMs - TRECHO_MIN_MS);
  else chatTrecho.ateMs = Math.max(Math.min(alvo, fim), chatTrecho.deMs + TRECHO_MIN_MS);
  pintarChatTrecho();
}

/** Mover o trecho inteiro, do mesmo tamanho. */
function moverTrecho(deMs) {
  if (!acertarChatTrecho()) return;
  const { inicio, fim } = estado.janela;
  const dur = chatTrecho.ateMs - chatTrecho.deMs;
  const de = Math.min(Math.max(Math.round(deMs), inicio), fim - dur);
  chatTrecho = { deMs: de, ateMs: de + dur };
  pintarChatTrecho();
}

function duracaoTrecho(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${doisDigitos(min % 60)}` : ''}`;
}

/** Para Todos, só o que é comum a toda a gente: o que foi feito de todos ao mesmo tempo. */
function comumATodos(de) {
  let comum = null;
  for (const l of estado.linhas) {
    const suas = de(l.slug);
    if (comum === null) { comum = suas.map(([a, b]) => [a, b]); continue; }
    const novo = [];
    for (const [a, b] of comum) for (const [c, d] of suas) if (Math.min(b, d) > Math.max(a, c)) novo.push([Math.max(a, c), Math.min(b, d)]);
    comum = novo;
    if (!comum.length) break;
  }
  return comum || [];
}

/** As janelas lidas de um canal; para Todos, só o que foi lido de todos ao mesmo tempo. */
function lidasDe(quem) {
  const de = (c) => chatDoEvento?.estado.janelasDoChat?.(c) || [];
  return quem === TODOS ? comumATodos(de) : de(quem);
}

/** O que a detecção já ouviu de um canal (ou de todos ao mesmo tempo), no relógio da noite. */
function ouvidasDe(quem) {
  const de = (c) => estado.ouvidoNaFaixa.get(c) || [];
  return quem === TODOS ? comumATodos(de) : de(quem);
}

/** Riscos mais escuros dentro do trilho de uma faixa, de `classe`, nos intervalos dados. */
function riscos(lista, classe, inicio, fim, titulo = '') {
  const pct = (ms) => Math.min(100, Math.max(0, ((ms - inicio) / (fim - inicio)) * 100));
  const tt = titulo ? ` title="${escapar(titulo)}"` : '';
  return lista.filter(([a, b]) => b > inicio && a < fim)
    .map(([a, b]) => `<b class="${classe}"${tt} style="left:${pct(a)}%;width:${Math.max(0.3, pct(b) - pct(a))}%"></b>`).join('');
}

/** O que já foi lido, mais escuro dentro do trilho de uma faixa. */
function marcasLidas(quem, inicio, fim) {
  return riscos(lidasDe(quem), 'lido', inicio, fim);
}

/** O que a detecção já ouviu, mais escuro em cima do trilho, como o chat lido em baixo. */
function marcasOuvidas(quem, inicio, fim) {
  return riscos(ouvidasDe(quem), 'ouvido', inicio, fim);
}

/**
 * Abrir o assistente na faixa de alguém (ou de Todos), no passo 1, ou com `acao` já escolhida no passo 2.
 * Escolher uma pessoa muda também o chat ao lado do vídeo. Devolve false quando essa faixa não existe.
 */
function abrirAcoes(quem, { focar = false, acao = null } = {}) {
  if (quem !== TODOS && !estado.linhas.some((l) => l.slug === quem)) return false;
  const outra = quem !== faixaEscolhida;
  if (outra) $('estadoChatTrecho').textContent = '';
  faixaEscolhida = quem;
  if (quem !== TODOS && quem !== chatEscolhido) {
    chatEscolhido = quem;
    pintarChatVideo(estado.agoraMs, true);
  }
  if (acao) {
    acaoFaixa = acao;
    passoFaixa = 2;
  } else if (outra && !(estado.varredura || chatTrechoControlo)) {
    // Outra pessoa, o mesmo passo e as mesmas escolhas: só o "de quem" muda. A primeira vez, o passo 1.
    if (!acaoFaixa) passoFaixa = 1;
  }
  colocarAcoes();
  if (focar) focarPasso();
  return true;
}

function fecharAcoes() {
  const quem = faixaEscolhida;
  faixaEscolhida = null;
  passoFaixa = 1;
  acaoFaixa = null;
  quantoFaixa = null;
  colocarAcoes();
  const nome = [...$('faixas').querySelectorAll('button[data-quem]')].find((b) => b.dataset.quem === quem);
  nome?.focus({ preventScroll: true });
}

/** O foco no sítio de cada passo: a última escolha (ou a primeira), a alça do começo, o botão final. */
function focarPasso() {
  const alvo = passoFaixa === 1 ? $(ultimaEscolha.acao === 'detetar' ? 'escolherDetetar' : 'escolherChat')
    : passoFaixa === 2 ? $(ultimaEscolha.quanto === 'tudo' ? 'escolherTudo' : 'escolherTrecho')
      : passoFaixa === 3 ? $('alcaInicio')
        : $(acaoFaixa === 'chat' ? 'lerChatTrecho' : 'detetarTrecho');
  $('acoesFaixa').scrollIntoView({ block: 'nearest' });
  alvo.focus({ preventScroll: true });
}

function guardarEscolha() {
  try { localStorage.setItem('povix.assistente', JSON.stringify(ultimaEscolha)); } catch { /* janela privada */ }
}

/** Passo 1: ler chat ou detectar. */
function escolherAcao(acao) {
  acaoFaixa = acao;
  ultimaEscolha.acao = acao;
  guardarEscolha();
  passoFaixa = 2;
  colocarAcoes();
  focarPasso();
}

/** Passo 2: um trecho (as alças, a partir da entrada e da saída se houver uma marca nova) ou tudo. */
function escolherQuanto(quanto) {
  if (!faixaEscolhida || !estado.janela) return;
  quantoFaixa = quanto;
  ultimaEscolha.quanto = quanto;
  guardarEscolha();
  if (quanto === 'trecho') {
    const { de, ate } = estado.marca || {};
    const chave = de != null && ate != null && ate > de ? `${de}|${ate}` : '';
    if (chave && chave !== marcaUsada) {
      marcaUsada = chave;
      chatTrecho = { deMs: de, ateMs: ate };
    }
  }
  passoFaixa = quanto === 'trecho' ? 3 : 4;
  colocarAcoes();
  focarPasso();
}

/** Voltar um passo; do passo 1, fechar. */
function voltarPasso() {
  if (estado.varredura || chatTrechoControlo) return;
  if (passoFaixa <= 1) { fecharAcoes(); return; }
  passoFaixa = passoFaixa === 4 && quantoFaixa !== 'trecho' ? 2 : passoFaixa - 1;
  colocarAcoes();
  focarPasso();
}

/** De quem, dito na frase do resumo. */
const quemDaFaixa = () => (faixaEscolhida === TODOS ? t('faixa.quemTodos') : faixaEscolhida);

/** A linha de cima: o que vai acontecer, com o que já se escolheu. */
function pintarResumoFaixa() {
  if (!faixaEscolhida) return;
  const quem = quemDaFaixa();
  const trecho = acertarChatTrecho();
  const quando = quantoFaixa === 'tudo' ? t('faixa.quandoTudo')
    : trecho ? t('faixa.quandoTrecho', { de: relogioCurto(trecho.deMs).slice(0, 5), ate: relogioCurto(trecho.ateMs).slice(0, 5) }) : '';
  let frase;
  if (passoFaixa === 1) frase = t('faixa.resumo1', { quem });
  else if (passoFaixa === 2) frase = t(acaoFaixa === 'chat' ? 'faixa.resumo2Chat' : 'faixa.resumo2Detetar', { quem });
  else if (passoFaixa === 3) frase = t(acaoFaixa === 'chat' ? 'faixa.resumo3Chat' : 'faixa.resumo3Detetar', { quem, quando });
  else if (acaoFaixa === 'chat') frase = t('faixa.resumo4Chat', { quem, quando });
  else {
    const marcados = filtrosMarcados();
    frase = t('faixa.resumo4Detetar', { quem, quando, lista: marcados.length ? listaDeFiltros(marcados) : t('filtros.nenhumMarcado') });
  }
  $('acoesResumo').textContent = frase;
  $('acoesPassoN').textContent = t('faixa.passo', { n: passoFaixa });
  $('escolherTudoAjuda').textContent = faixaEscolhida === TODOS ? t('faixa.tudoAjudaTodos') : t('faixa.tudoAjuda', { quem });
}

/**
 * A barra e as alças no sítio: a barra numa linha logo abaixo da faixa escolhida, as alças por cima do
 * trilho dela. São as mesmas peças para todos e mudam de faixa; as faixas refazem-se a cada mudança de
 * vista, e isto corre no fim de cada vez.
 */
function colocarAcoes() {
  const barra = $('acoesFaixa');
  const calha = $('chatTrecho');
  const alvo = $('faixas');
  const linha = faixaEscolhida == null ? null
    : [...alvo.querySelectorAll('.faixa, .faixaGeral')].find((f) => f.dataset.quem === faixaEscolhida);
  for (const b of alvo.querySelectorAll('[data-quem]')) {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-expanded', String(b.dataset.quem === faixaEscolhida && Boolean(linha)));
  }
  for (const f of alvo.querySelectorAll('.faixa, .faixaGeral')) f.classList.toggle('escolhida', f === linha);
  if (!linha) {
    if (faixaEscolhida != null && faixaEscolhida !== TODOS && !estado.linhas.some((l) => l.slug === faixaEscolhida)) {
      faixaEscolhida = null;
      passoFaixa = 1;
      acaoFaixa = null;
      quantoFaixa = null;
    }
    barra.hidden = true;
    calha.hidden = true;
    alvo.append(calha, barra);
    acertarFlutua();
    return;
  }
  if (linha.nextElementSibling !== barra) linha.after(barra);
  barra.hidden = false;
  const quem = faixaEscolhida === TODOS ? t('faixa.todos') : faixaEscolhida;
  $('acoesGrupo').setAttribute('aria-label', t('faixa.grupo', { quem }));
  if (alcasAVista()) {
    if (calha.parentElement !== linha) linha.append(calha);
    calha.hidden = false;
  } else {
    calha.hidden = true;
    if (calha.parentElement !== alvo) alvo.append(calha);
  }
  for (const n of [1, 2, 3, 4]) $(`passo${n}`).hidden = passoFaixa !== n;
  $('passo4Chat').hidden = acaoFaixa !== 'chat';
  $('passo4Detetar').hidden = acaoFaixa !== 'detetar';
  $('voltarAcoes').hidden = passoFaixa <= 1;
  // A última escolha de cada passo, destacada e dita.
  for (const [id, sim] of [['escolherChat', ultimaEscolha.acao === 'chat'], ['escolherDetetar', ultimaEscolha.acao === 'detetar'],
    ['escolherTrecho', ultimaEscolha.quanto === 'trecho'], ['escolherTudo', ultimaEscolha.quanto === 'tudo']]) {
    $(id).classList.toggle('ultima', sim);
    $(id).querySelector('.ultimaVez').hidden = !sim;
  }
  if (passoFaixa === 4 && acaoFaixa === 'detetar') pintarOpcoesDetecao();
  pintarChatTrecho();
  acertarFlutua();
}

function pintarChatTrecho() {
  const caixa = $('chatTrecho');
  if (!caixa) return;
  const vista = vistaAgora();
  const trecho = acertarChatTrecho();
  const ocupado = Boolean(chatTrechoControlo || estado.varredura);
  const semNoite = !trecho || !estado.linhas.length;
  for (const id of ['escolherChat', 'escolherDetetar', 'escolherTrecho', 'escolherTudo', 'usarTrecho', 'lerChatTrecho', 'detetarTrecho']) {
    $(id).disabled = semNoite || ocupado;
  }
  // A correr, o progresso e o Parar ficam no mesmo sítio, e nada muda de passo por baixo deles. Com o
  // aviso aberto, quem responde é o Continuar e o Cancelar dele.
  $('pararChatTrecho').hidden = !ocupado || Boolean(avisoAberto);
  $('barraOuvir').hidden = !estado.varredura || Boolean(avisoAberto);
  $('continuarOuvindo').hidden = ocupado || !estado.restoPorOuvir || estado.restoPorOuvir.quem !== faixaEscolhida
    || acaoFaixa !== 'detetar' || passoFaixa !== 4;
  // Sem nada ouvido ainda (o chat sem picos), o mesmo botão ouve tudo.
  const rotuloResto = faixaEscolhida && ouvidasDe(faixaEscolhida).length ? 'rapido.continuar' : 'rapido.ouvirTudo';
  const spanResto = $('continuarOuvindo').querySelector('span');
  if (spanResto.dataset.t !== rotuloResto) { spanResto.dataset.t = rotuloResto; spanResto.textContent = t(rotuloResto); }
  $('voltarAcoes').disabled = ocupado;
  $('filtrosLista').disabled = ocupado;
  $('maisOpcoes').classList.toggle('ocupado', ocupado);
  for (const id of ['sensDetecao', 'margemAntes', 'margemDepois', 'juntarLances', 'sensibilidadeFaixa']) $(id).disabled = ocupado;
  pintarResumoFaixa();
  $('chatTrechoAqui').disabled = !trecho;
  if (!trecho || !vista) {
    $('chatTrechoHoras').textContent = '';
    $('chatTrechoFaixa').style.display = 'none';
    return;
  }
  const { inicio, fim } = vista;
  const pct = (ms) => ((ms - inicio) / (fim - inicio)) * 100;
  const prender = (x) => Math.min(100, Math.max(0, x));
  const de = pct(trecho.deMs);
  const ate = pct(trecho.ateMs);
  const faixa = $('chatTrechoFaixa');
  faixa.style.display = ate <= 0 || de >= 100 ? 'none' : '';
  faixa.style.left = `${prender(de)}%`;
  faixa.style.width = `${Math.max(0, prender(ate) - prender(de))}%`;
  // Uma alça fora da vista fica encostada à ponta, mais apagada, e continua a andar pelo teclado.
  for (const [id, x, ms] of [['alcaInicio', de, trecho.deMs], ['alcaFim', ate, trecho.ateMs]]) {
    const a = $(id);
    a.style.left = `${prender(x)}%`;
    a.classList.toggle('fora', x < 0 || x > 100);
    a.setAttribute('aria-valuemin', String(Math.round((id === 'alcaInicio' ? estado.janela.inicio : trecho.deMs + TRECHO_MIN_MS) / 1000)));
    a.setAttribute('aria-valuemax', String(Math.round((id === 'alcaInicio' ? trecho.ateMs - TRECHO_MIN_MS : estado.janela.fim) / 1000)));
    a.setAttribute('aria-valuenow', String(Math.round(ms / 1000)));
    a.setAttribute('aria-valuetext', relogioCurto(ms));
    a.title = `${t(id === 'alcaInicio' ? 'chatTrecho.inicio' : 'chatTrecho.fim')}: ${relogioCurto(ms)}`;
  }
  $('chatTrechoHoras').textContent = t('chatTrecho.horas', {
    de: relogioCurto(trecho.deMs), ate: relogioCurto(trecho.ateMs), dur: duracaoTrecho(trecho.ateMs - trecho.deMs),
  });
}

/** O instante do ponteiro dentro da calha do trecho, na vista que está desenhada. */
function msDoPonteiro(e) {
  const vista = vistaAgora();
  const r = $('chatTrecho').getBoundingClientRect();
  return vista.inicio + ((e.clientX - r.left) / r.width) * (vista.fim - vista.inicio);
}

function ligarChatTrecho() {
  // Arrastar com o rato ou o dedo. O ponteiro fica preso à alça enquanto se arrasta, mesmo que saia dela.
  const arrastar = (el, aoMover) => {
    el.addEventListener('pointerdown', (e) => {
      if (!vistaAgora() || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.focus({ preventScroll: true });
      try { el.setPointerCapture(e.pointerId); } catch { /* um ponteiro sintético não se prende */ }
      const largar = aoMover(e);
      const mover = (m) => largar(m);
      const fim = () => {
        el.removeEventListener('pointermove', mover);
        el.removeEventListener('pointerup', fim);
        el.removeEventListener('pointercancel', fim);
        el.classList.remove('aArrastar');
      };
      el.classList.add('aArrastar');
      el.addEventListener('pointermove', mover);
      el.addEventListener('pointerup', fim);
      el.addEventListener('pointercancel', fim);
    });
    // O clique que acaba um arrasto não chega ao trilho por baixo (que levaria o vídeo para lá).
    el.addEventListener('click', (e) => e.stopPropagation());
  };
  arrastar($('alcaInicio'), () => (m) => moverAlca('inicio', msDoPonteiro(m)));
  arrastar($('alcaFim'), () => (m) => moverAlca('fim', msDoPonteiro(m)));
  arrastar($('chatTrechoFaixa'), (e) => {
    const desde = msDoPonteiro(e);
    const de0 = chatTrecho?.deMs ?? 0;
    return (m) => moverTrecho(de0 + msDoPonteiro(m) - desde);
  });
  // Pelo teclado: setas 5 s, com Shift 1 min; Home e End às pontas da noite; Esc fecha as alças.
  for (const [id, qual] of [['alcaInicio', 'inicio'], ['alcaFim', 'fim']]) {
    $(id).addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !acertarChatTrecho()) return;
      const passo = e.shiftKey ? 60_000 : 5000;
      const agora = qual === 'inicio' ? chatTrecho.deMs : chatTrecho.ateMs;
      let ms;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ms = agora - passo;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') ms = agora + passo;
      else if (e.key === 'PageDown') ms = agora - 60_000;
      else if (e.key === 'PageUp') ms = agora + 60_000;
      else if (e.key === 'Home') ms = estado.janela.inicio;
      else if (e.key === 'End') ms = estado.janela.fim;
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarPasso(); return; }
      else return;
      e.preventDefault();
      e.stopPropagation();
      moverAlca(qual, ms);
    });
  }
  // O nome de cada faixa (e o Todos) abre e fecha a barra dela. Um só ouvinte para as faixas todas,
  // porque elas refazem-se a cada mudança de vista.
  $('faixas').addEventListener('click', (e) => {
    const nome = e.target.closest('button[data-quem]');
    if (!nome) return;
    if (faixaEscolhida === nome.dataset.quem) fecharAcoes();
    else abrirAcoes(nome.dataset.quem);
  });
  $('escolherChat').onclick = () => escolherAcao('chat');
  $('escolherDetetar').onclick = () => escolherAcao('detetar');
  $('escolherTrecho').onclick = () => escolherQuanto('trecho');
  $('escolherTudo').onclick = () => escolherQuanto('tudo');
  $('usarTrecho').onclick = () => {
    if (!acertarChatTrecho()) return;
    passoFaixa = 4;
    colocarAcoes();
    focarPasso();
  };
  $('lerChatTrecho').onclick = () => lerChat(faixaEscolhida, quantoFaixa || 'tudo');
  $('detetarTrecho').onclick = () => detetar(faixaEscolhida, quantoFaixa || 'tudo');
  $('continuarOuvindo').onclick = () => {
    const r = estado.restoPorOuvir;
    if (r) detetar(r.quem, r.quanto, { resto: true });
  };
  $('voltarAcoes').onclick = voltarPasso;
  $('fecharAcoes').onclick = fecharAcoes;
  // Esc recua um passo (e no passo 1 fecha). Dentro de uma caixa de texto ou de uma lista, o Esc é dela.
  $('acoesFaixa').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || ondeSeEscreve(e.target)) return;
    if (e.target.closest('#maisOpcoes') && $('maisOpcoes').open) {
      e.preventDefault();
      e.stopPropagation();
      $('maisOpcoes').open = false;
      $('maisOpcoes').querySelector('summary').focus({ preventScroll: true });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    voltarPasso();
  });
  $('chatTrechoAqui').onclick = () => {
    if (!estado.janela) return;
    chatTrecho = trechoEmVolta(estado.agoraMs);
    pintarChatTrecho();
  };
  $('pararChatTrecho').onclick = () => {
    chatTrechoControlo?.abort();
    estado.varredura?.abort();
  };
}

/** De onde a onde ler para cada canal: o trecho das alças, ou o tempo todo ao vivo. */
function pedidosDe(quem, quanto) {
  // Todos são os do jogo do evento: uma live de outro jogo só entra pedida pelo nome (ver `foraDoJogo`).
  const canais = quem === TODOS ? estado.linhas.map((l) => l.slug).filter((c) => !foraDoJogo(c)) : [quem];
  const trecho = quanto === 'trecho' ? acertarChatTrecho() : null;
  const pedidos = [];
  for (const canal of canais) {
    const vivo = aoVivoDe(canal);
    if (!vivo) continue;
    pedidos.push(trecho ? { canal, deMs: trecho.deMs, ateMs: trecho.ateMs, vivo } : { canal, ...vivo, vivo });
  }
  return pedidos;
}

/** Ler o chat de um canal ou de todos, do trecho ou de tudo. O que já foi lido não se pede outra vez. */
async function lerChat(quem, quanto) {
  if (!quem || chatTrechoControlo || estado.varredura || !chatDoEvento || !acertarChatTrecho()) return;
  const estadoEl = $('estadoChatTrecho');
  const pedidos = pedidosDe(quem, quanto);
  if (!pedidos.length) { estadoEl.textContent = t('chatTrecho.semAoVivo', { canal: quem === TODOS ? t('faixa.todos') : quem }); return; }
  if (pedidos.every((p) => p.deMs >= Date.now())) { estadoEl.textContent = t('chatTrecho.futuro'); return; }
  const controlo = new AbortController();
  chatTrechoControlo = controlo;
  pintarChatTrecho();
  const todos = quem === TODOS;
  let msgs = 0;
  let picos = 0;
  try {
    for (const [k, { canal, deMs, ateMs }] of pedidos.entries()) {
      const quando = { canal, de: relogioCurto(deMs), ate: relogioCurto(ateMs) };
      const dizer = (fracao) => {
        if (controlo.signal.aborted) return;
        const pct = Math.round(fracao * 100);
        estadoEl.textContent = todos ? t('chatTrecho.aLerTodos', { canal, k: k + 1, n: pedidos.length, pct })
          : t('chatTrecho.aLer', { ...quando, pct });
      };
      dizer(0);
      if (deMs >= Date.now()) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await chatDoEvento.lerChatTrecho(canal, deMs, ateMs, {
        sinal: controlo.signal,
        aoProgredir: ({ fracao }) => dizer(fracao),
      });
      msgs += r.noTrecho;
      picos += r.picos;
      if (todos) continue;
      const m = tn(r.noTrecho, 'chatTrecho.umaMsg', 'chatTrecho.msgs');
      const p = tn(r.picos, 'chatTrecho.umPico', 'chatTrecho.picos');
      if (r.semCanal) estadoEl.textContent = t('chatTrecho.semCanal', { canal });
      else if (r.jaLido) estadoEl.textContent = t('chatTrecho.jaLido', { ...quando, msgs: m, picos: p });
      else if (r.motivo === 'rate-limit' || r.motivo === 'sem-rede') estadoEl.textContent = t('chatTrecho.bloqueado', { ...quando, msgs: m });
      else if (r.motivo) estadoEl.textContent = t('chatTrecho.parou', { ...quando, msgs: m });
      else estadoEl.textContent = t('chatTrecho.lido', { ...quando, msgs: m, picos: p });
    }
    if (todos) {
      estadoEl.textContent = t('chatTrecho.lidoTodos', {
        n: pedidos.length, msgs: tn(msgs, 'chatTrecho.umaMsg', 'chatTrecho.msgs'), picos: tn(picos, 'chatTrecho.umPico', 'chatTrecho.picos'),
      });
    }
  } catch (e) {
    if (e?.name !== 'AbortError') throw e;
    estadoEl.textContent = todos ? t('chatTrecho.paradoTodos') : t('chatTrecho.parado', { canal: quem });
  } finally {
    chatTrechoControlo = null;
    pintarChatTrecho();
    pintarFaixas();
    pintarChatVideo(estado.agoraMs, true);
  }
}

function irPara(quandoMs) {
  estado.agoraMs = quandoMs;
  guardar();
  acertarVista();
  pintarRelogio(quandoMs);

  const principal = [];
  const segundo = [];
  const secundarios = [];
  for (const linha of estado.linhas) {
    const tile = tileDe(linha.slug);
    if (!tile) continue;
    const video = tile.querySelector('video');
    const nota = tile.querySelector('.estadoTile');
    const empurrao = (estado.nudges[linha.slug] || 0) / 1000;
    tile.querySelector('.nudge').textContent = `${empurrao > 0 ? '+' : ''}${empurrao.toFixed(1)}s`;
    tile.querySelector('.ajuste').classList.toggle('ativo', empurrao !== 0);
    const r = onde(linha, quandoMs, { nudgeMs: estado.nudges[linha.slug] || 0 });

    if (r.estado !== 'toca') {
      // Never seek to zero for a moment this angle did not film: that shows a
      // confident, wrong frame, which is worse than showing nothing.
      nota.textContent = r.estado === 'buraco' ? t('tile.foraDoAr', { s: Math.round(r.buraco.segundos) })
        : r.estado === 'antes' ? t('tile.antes')
          : r.estado === 'depois' ? t('tile.depois') : t('tile.semVideo');
      tile.classList.add('vazio');
      pararTile(linha.slug, video);
      continue;
    }
    nota.textContent = '';
    tile.classList.remove('vazio');
    // Onde cada um está DENTRO do vídeo dele. É o número que mostra o avanço e
    // o atraso, e aparece já — antes de qualquer imagem carregar.
    const posicao = tile.querySelector('.posicao');
    if (posicao) posicao.textContent = mmss(r.tempoS);

    if (ehPrincipal(linha.slug)) principal.push([linha, r, video]);
    else if (ehFoco(linha.slug)) segundo.push([linha, r, video]);
    else secundarios.push([linha, r, video]);
  }

  // O principal primeiro, e sozinho. Trinta pedidos ao mesmo tempo fazem o
  // quadrado que interessa chegar em último — e quem anda a saltar de dez em
  // dez segundos está a olhar para esse e mais nenhum.
  for (const [l, r, v] of principal) tocar(l, r, v, { alta: true, correr: true, comSom: temSom(l.slug) });
  // A ancora do relogio que anda: a que instante do mundo corresponde ESTE
  // segundo do video principal. O resto e uma subtraccao, e nao ha que
  // inverter mapa nenhum.
  estado.ancora = principal.length ? { slug: principal[0][0].slug, ms: quandoMs, tempoS: principal[0][1].tempoS } : null;

  // Os outros só depois de o principal ter imagem. E só quando a barra
  // descansa: arrastar o cursor pedia um pedaço de vídeo por pixel, a trinta
  // canais — um ataque ao CDN feito com o rato.
  const geracao = ++estado.geracao;
  clearTimeout(estado.timerSecundarios);
  estado.timerSecundarios = setTimeout(async () => {
    await primeiroFrame(principal[0]?.[2], 4000);
    if (geracao !== estado.geracao) return;
    // O segundo do par também em qualidade: se estão os dois no ecrã, é para
    // olhar para os dois. Vem depois do principal, e não ao mesmo tempo — que
    // era o que fazia o par demorar o dobro a aparecer.
    for (const [l, r, v] of segundo) tocar(l, r, v, { alta: true, correr: true, comSom: temSom(l.slug) });
    // Os à vista, poucos de cada vez (o teste real de 12/10: 33 ângulos pediam tudo ao mesmo tempo e o
    // primeiro vídeo levava 40 s). Cada lote espera que o anterior tenha imagem, ou 3 s.
    let lote = [];
    for (const [l, r, v] of secundarios) {
      if (lote.length >= LEITORES_DE_UMA_VEZ) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(lote.map((x) => primeiroFrame(x, 3000)));
        if (geracao !== estado.geracao) return;
        lote = [];
      }
      if (naoSeVe(l.slug)) {
        porAcertar.add(l.slug);
        // Quem saiu do foco volta para a grelha, e quase sempre para um lugar
        // fora da vista. Sem isto ficava com o leitor de 1080p (trinta
        // segundos de buffer, a andar) até alguém rolar até ele, e cada troca
        // de foco deixava mais um. Largado aqui não pede nada à Kick; o
        // `porAcertar` cria-lhe o de 160p quando voltar a aparecer.
        if (leitorCaro(l, r, v)) pararTile(l.slug, v);
        continue;
      }
      porAcertar.delete(l.slug);
      const tinha = estado.players.get(l.slug);
      tocar(l, r, v, { alta: false, correr: false });
      if (estado.players.get(l.slug) !== tinha) lote.push(v);
    }
  }, 220);
}

/** O `pLoader` do hls.js que tira o ENDLIST das playlists de quem está ao vivo (ver `tocar`). */
function carregadorAoVivo() {
  const Base = window.Hls?.DefaultConfig?.loader;
  if (!Base) return {};
  class AoVivo extends Base {
    load(contexto, config, chamadas) {
      const sucesso = chamadas.onSuccess;
      super.load(contexto, config, {
        ...chamadas,
        onSuccess: (resposta, ...resto) => {
          if (typeof resposta?.data === 'string') resposta.data = resposta.data.replace(/#EXT-X-ENDLIST\s*/g, '');
          sucesso(resposta, ...resto);
        },
      });
    }
  }
  return { pLoader: AoVivo };
}

/** Quantos leitores novos de 160p arrancam ao mesmo tempo (ver o lote dos secundários). */
const LEITORES_DE_UMA_VEZ = 4;

/** Um leitor que não é o de um secundário: degrau de cima, ou a andar. */
function leitorCaro(linha, r, video) {
  const p = estado.players.get(linha.slug);
  if (!p) return false;
  const peca = linha.pecasCompletas?.find((x) => x.vod.id === r.peca.vod.id) || r.peca;
  return p.url !== peca.barato.url || !video.paused;
}

/**
 * Esperar que um vídeo tenha mesmo imagem — com desistência.
 *
 * Sem o limite, um ângulo que nunca carrega deixava a grelha inteira em branco
 * para sempre. Melhor tarde e todos do que nunca.
 */
function primeiroFrame(video, limiteMs) {
  if (!video) return Promise.resolve();
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((pronto) => {
    const acabou = () => { clearTimeout(t); video.removeEventListener('loadeddata', acabou); pronto(); };
    const t = setTimeout(acabou, limiteMs);
    video.addEventListener('loadeddata', acabou, { once: true });
  });
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Tirar o `src` e mandar `load()`. Só tirar o atributo não chega: pela regra
 * do HTML isso não volta a correr o carregamento, e o elemento fica com o
 * vídeo que tinha e continua a tocá-lo, com som. No caminho do hls.js nunca se
 * viu porque o `destroy` dele já faz o `load()`; no Safari, onde o vídeo é
 * nativo, o quadro dizia "fora do ar" e mostrava o instante anterior.
 */
function largarVideo(video) {
  // Um quadro já vazio não precisa de outro `load()`: com quinhentos canais o
  // `irPara` passa aqui por cada um que está fora do ar, a cada salto.
  if (!video.hasAttribute('src') && !video.currentSrc) return;
  video.removeAttribute('src');
  video.load?.();
}

function pararTile(slug, video) {
  const p = estado.players.get(slug);
  if (p) { p.destroy(); estado.players.delete(slug); }
  largarVideo(video);
}

/**
 * `play()` devolve uma promessa que rejeita quando o browser recusa tocar sem
 * um toque. Ignorada de propósito: rebentar aqui deixava a página sem grelha
 * nenhuma, e o utilizador carrega no quadrado e resolve-se.
 */
function aplicar(video, ordem) {
  if (!video) return;
  if (ordem === 'tocar') video.play?.().catch(() => {});
  else if (ordem === 'parar') video.pause?.();
}

function tocar(linha, r, video, { alta = false, correr = false, comSom = false } = {}) {
  const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  // Focus gets the best rung the ladder has; everything else stays at 160p.
  // A qualidade segue o PRINCIPAL, e não o facto de estar a correr: o segundo
  // do par corre, mas a 160p — dois degraus de cima ao mesmo tempo era o que
  // fazia o par demorar o dobro a aparecer.
  const alvo = alta ? peca.escada[0] : peca.barato;
  const anterior = estado.players.get(linha.slug);

  if (anterior && anterior.url === alvo.url) {
    if (Math.abs(video.currentTime - r.tempoS) > 0.35) video.currentTime = r.tempoS;
    aplicar(video, queFazerComOLeitor({ correr, parado: estado.parado, pausado: video.paused }));
    return;
  }
  anterior?.destroy();

  if (window.Hls?.isSupported()) {
    // Um ângulo parado precisa do pedaço onde está e de mais nada. Trinta
    // buffers de trinta segundos são trezentos MB de RAM a não servir para
    // coisa nenhuma.
    // O que já passou também fica: o hls.js guarda tudo o que tocou
    // (`backBufferLength` infinito de origem). Com trinta ângulos numa noite
    // de horas era essa a memória que crescia até o separador cair.
    const hls = new window.Hls({
      startPosition: r.tempoS, maxBufferLength: alta ? 30 : correr ? 8 : 2, backBufferLength: alta ? 30 : 10,
      // Quem está ao vivo: a Kick serve a gravação em curso como uma playlist EVENT já fechada com
      // ENDLIST, e o hls.js tocava-a como VOD e parava no fim do que estava gravado quando a leu (medido
      // a 12/10: o "Ver ao vivo agora" congelava ~15 s depois). Sem o ENDLIST, o hls.js volta a pedi-la
      // a cada segmento e o vídeo continua.
      ...(peca.vod?.aoVivo ? carregadorAoVivo() : {}),
    });
    const leitor = { url: alvo.url, destroy: () => hls.destroy() };
    // Um erro fatal (403, 429, a rede que caiu) faz o hls.js parar de carregar
    // de vez. O leitor ficava guardado com o mesmo endereço, cada salto a seguir
    // reaproveitava-o, e o quadro ficava preto até ao fim da sessão sem dizer
    // porquê. Esquecido aqui, o próximo salto ou clique cria um novo.
    hls.on?.(window.Hls.Events?.ERROR || 'hlsError', (_, dados) => {
      if (!dados?.fatal || estado.players.get(linha.slug) !== leitor) return;
      // Fora deste aviso: destruído aqui dentro, o hls.js ainda acabava o que estava a fazer com as
      // peças já soltas e rebentava ("reading 'trigger'"), visto contra a Kick real a 09/10.
      setTimeout(() => hls.destroy(), 0);
      estado.players.delete(linha.slug);
      const tile = tileDe(linha.slug);
      tile?.classList.add('vazio');
      const nota = tile?.querySelector('.estadoTile');
      if (nota) nota.textContent = t('tile.erroVideo');
    });
    hls.loadSource(alvo.url);
    hls.attachMedia(video);
    estado.players.set(linha.slug, leitor);
  } else {
    // O Safari toca HLS de raiz, e o hls.js recusa-se a trabalhar la — no
    // iPhone nem sequer ha MediaSource. Por isso este ramo NAO e um caso de
    // canto: e o unico caminho no telemovel dele.
    video.src = alvo.url;
    // O `currentTime` so aceita um valor depois de haver metadados. Antes
    // disso e uma atribuicao que nao faz nada, e o video comecava do
    // principio do VOD em vez do instante pedido.
    const irAoSitio = () => { try { video.currentTime = r.tempoS; } catch { /* ainda nao */ } };
    if (video.readyState >= 1) irAoSitio();
    else video.addEventListener('loadedmetadata', irAoSitio, { once: true });
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => largarVideo(video) });
  }
  // Propriedade E atributo. A propriedade e que manda no som, mas deixar o
  // atributo `muted` do HTML para tras faz o quadrado dizer uma coisa e fazer
  // outra — e foi assim que "nao sai som de nenhum dos dois" passou nos testes.
  video.muted = !comSom;
  video.toggleAttribute('muted', !comSom);
  aplicar(video, queFazerComOLeitor({ correr, parado: estado.parado, pausado: video.paused }));
  // Um leitor criado durante a pausa nasce com a mesma guarda: sem isto,
  // trocar de ângulo com a página parada punha o novo a andar.
  if (estado.parado && !video.__guarda) {
    video.__guarda = () => { if (estado.parado) video.pause?.(); };
    video.addEventListener('play', video.__guarda);
    video.addEventListener('playing', video.__guarda);
  }
}

/**
 * O resumo das margens, para se saber o que lá está sem abrir.
 *
 * As quatro caixas de número estavam permanentemente ao lado do "Marcar kill"
 * e ocupavam duas filas inteiras num telemóvel. Acertam-se uma vez e nunca
 * mais se tocam — mas quem as fecha tem de continuar a saber o que lá deixou.
 */
function pintarResumoMargens() {
  const n = (id) => Number($(id).value) || 0;
  const meu = `${n('protAntes')}/${n('protDepois')}s`;
  $('resumoMargens').textContent = soUmCanal()
    ? meu
    : `${meu}, ${n('vitAntes')}/${n('vitDepois')}s`;
}

// ── alinhar pelo som ────────────────────────────────────────────────────────

/**
 * O carimbo da Kick é o instante em que o pedaço CHEGOU ao servidor dela.
 * Entre a captura de cada um e esse instante há o buffer do OBS, o encoder e a
 * subida, e isso é diferente em cada casa. Esse resto não se lê em lado
 * nenhum: mede-se a ouvir.
 *
 * Medido num evento real com cinco canais: quatro alinharam a 0,14 s só com o
 * carimbo, e o quinto estava 5,7 s à frente. Ou seja, isto é para o quinto.
 */
async function alinhar() {
  if (!estado.linhas.length || !estado.janela) return;
  // A noite que se vai medir. Medir demora minutos, e se entretanto ele abriu
  // outra noite, os ajustes desta iam parar aos canais com o mesmo nome dela.
  const linhasMedidas = estado.linhas;
  const controlo = new AbortController();
  const botao = $('alinhar');
  const nota = $('estadoAlinhar');
  nota.classList.remove('mau');

  // Com trinta ângulos isto passa a ser umas centenas de MB. Perguntar é mais
  // barato do que gastar os dados de alguém e explicar depois.
  // O que falta OUVIR, e não quantos canais há: perguntar "vais gastar 434 MB?"
  // para acrescentar um canal a uma noite já medida seria mentira, e ele dizia
  // que não a uma coisa que custava catorze.
  const instantes = instantesParaOuvir(estado.linhas, estado.janela, { memoria: estado.memoriaAlinhar });
  const faltam = estado.linhas.filter(
    (l) => instantes.some((i) => !estado.memoriaAlinhar.has(`${i}|${l.slug}`)),
  ).length;
  const mb = custoEstimadoMB(faltam);
  if (mb > 80 && !confirm(t('alinhar.custo', { n: faltam, mb }))) return;
  botao.disabled = true;
  // O botão Parar serve também aqui. O controlo existia e ninguém lhe chegava:
  // a única saída de uma sincronia de centenas de MB era fechar o separador.
  estado.cancelar = () => controlo.abort();

  // Os do lance primeiro (o teste real de 12/10: 33 ângulos, 30 min, um de cada vez): com muitos
  // ângulos, os que estão em foco e no ar neste instante medem-se e aplicam-se antes, e só depois todos,
  // nos mesmos minutos (o que já se ouviu não se ouve outra vez).
  const noAr = (l) => onde(l, estado.agoraMs, { nudgeMs: estado.nudges[l.slug] || 0 }).estado === 'toca';
  const doLance = [...new Set([...estado.focos, ...estado.linhas.filter(noAr).map((l) => l.slug)])]
    .slice(0, MUITOS_ANGULOS);
  const progresso = (prefixo) => (p) => {
    nota.textContent = prefixo + (p.fase === 'ouvir'
      ? t('alinhar.aOuvir', {
        canal: p.canal, feito: p.feito, total: p.total, mb: (p.bytes / 1048576).toFixed(0),
      })
      : p.total ? t('alinhar.aCompararQuantos', { feito: p.feito, total: p.total })
        : t('alinhar.aComparar'));
  };
  try {
    if (estado.linhas.length > MUITOS_ANGULOS && doLance.length > 1) {
      const r1 = await alinharPeloSom({
        linhas: estado.linhas.filter((l) => doLance.includes(l.slug)),
        janela: estado.janela,
        instantes,
        memoria: estado.memoriaAlinhar,
        sinal: controlo.signal,
        aoProgresso: progresso(t('alinhar.primeiro', { n: doLance.length })),
      });
      if (estado.linhas !== linhasMedidas) {
        nota.classList.add('mau');
        nota.textContent = t('alinhar.noiteMudou');
        return;
      }
      for (const [slug, ms] of Object.entries(r1.ajustesMs)) estado.nudges[slug] = ms;
      pintarFaixas();
      irPara(estado.agoraMs);
    }
    const r = await alinharPeloSom({
      linhas: estado.linhas,
      janela: estado.janela,
      instantes,
      memoria: estado.memoriaAlinhar,
      sinal: controlo.signal,
      primeiro: doLance,
      aoProgresso: progresso(''),
    });
    if (estado.linhas !== linhasMedidas) {
      nota.classList.add('mau');
      nota.textContent = t('alinhar.noiteMudou');
      return;
    }

    // Substitui, não soma: correr duas vezes seguidas não pode empurrar o
    // dobro. E o que foi medido à mão para um canal sem ligação fica de pé.
    for (const [slug, ms] of Object.entries(r.ajustesMs)) estado.nudges[slug] = ms;

    const mexidos = Object.entries(r.ajustesMs).filter(([, ms]) => Math.abs(ms) >= 250);
    nota.textContent = t('alinhar.feito', { n: Object.keys(r.ajustesMs).length, total: estado.linhas.length })
      + (mexidos.length
        ? t('alinhar.corrigi', { lista: mexidos.map(([s, ms]) => `${s} ${(ms / 1000).toFixed(1)}s`).join(', ') })
        : t('alinhar.jaCertos'))
      + (r.semLigacao.length ? t('alinhar.semSom', { lista: r.semLigacao.join(', ') }) : '')
      // Um canal que não se conseguiu baixar não é a mesma coisa que um canal
      // que não tem som em comum, e chamar-lhes o mesmo esconde uma falha de
      // rede atrás de uma explicação que soa razoável.
      + (r.problemas.length
        ? t('alinhar.naoOuvi', { lista: [...new Set(r.problemas.map((x) => x.canal))].join(', ') })
        : '');
    nota.classList.toggle('mau', !Object.keys(r.ajustesMs).length);
    pintarConfianca();
    // Sem reconstruir a grelha: o `irPara` já põe cada leitor no relógio novo,
    // e só cria um leitor onde o ajuste mudou de VOD. O `montarGrade` deitava
    // fora todos os leitores (e o da janela à parte com eles) para os pedir
    // outra vez à Kick logo a seguir. As faixas andam com o ajuste, como no
    // `empurrar`.
    pintarFaixas();
    irPara(estado.agoraMs);
  } catch (e) {
    nota.classList.add('mau');
    nota.textContent = e.name === 'AbortError' ? t('alinhar.cancelado')
      : e.name === 'SEM-DESCODIFICADOR' ? t('alinhar.semCodec')
        : t('alinhar.erro', { erro: e.message });
  } finally {
    botao.disabled = false;
    estado.cancelar = null;
  }
}

// ── procurar as kills sozinho ───────────────────────────────────────────────

/**
 * Ouvir a POV do dono à procura de tiroteios, e depois olhar para quem morreu.
 *
 * As duas metades juntas são a coisa toda. O som acha as LUTAS — medido, meia
 * hora de Rust dá oito, e uma noite a rever à mão dá muito mais do que isso em
 * tempo perdido. Mas uma luta não é uma kill: só é kill se alguém morreu, e
 * isso vê-se nos ecrãs dos outros. Por isso a seguir a cada tiroteio a página
 * vai ver os frames de toda a gente e marca quem foi.
 *
 * O que sobra sem ninguém marcado fica na lista na mesma: pode ter morrido
 * alguém que não está entre os canais abertos, e apagar isso por ele seria
 * decidir uma coisa que não sei.
 */
// ── os filtros da detecção ──────────────────────────────────────────────────
//
// O dono, 10/10: "a pessoa coloca informações específicas, ex: palavras no chat, ou palavras do streamer,
// ou estouros de rocket, ou de disparo, ou gritos do streamer". São o passo final do assistente quando se
// escolhe Detectar lances, com os tiros marcados por omissão, para quem nunca mexeu detectar como sempre.
// As palavras faladas pelo streamer aparecem desligadas: transformar voz em texto no navegador ainda é
// pesado demais. Em Mais opções, fechado por omissão, o que a detecção já tinha por dentro e faz sentido
// para quem não é técnico: quão exigente ela é, quanto entra antes e depois, e juntar lances próximos.
// Tudo fica guardado no aparelho.
const FILTROS_PADRAO = {
  tiros: true, explosoes: false, gritos: false, chat: false, palavras: '', sens: 'normal', juntarS: 0,
};
const CAIXAS_FILTRO = { tiros: 'filtroTiros', explosoes: 'filtroExplosoes', gritos: 'filtroGritos', chat: 'filtroChat' };
const NOMES_FILTRO = {
  tiros: 'filtros.nomeTiros', explosoes: 'filtros.nomeExplosoes', gritos: 'filtros.nomeGritos', chat: 'filtros.nomeChat',
};
const JUNTAR_S = [0, 5, 10, 20, 30];
let filtros = { ...FILTROS_PADRAO };
try {
  const g = JSON.parse(localStorage.getItem('povix.filtros') || 'null');
  if (g && typeof g === 'object') {
    for (const k of Object.keys(CAIXAS_FILTRO)) if (typeof g[k] === 'boolean') filtros[k] = g[k];
    if (typeof g.palavras === 'string') filtros.palavras = g.palavras.slice(0, 300);
    if (SENSIBILIDADES_DETECAO.includes(g.sens)) filtros.sens = g.sens;
    if (JUNTAR_S.includes(g.juntarS)) filtros.juntarS = g.juntarS;
  }
} catch { /* janela privada, ou um valor estragado: ficam os de omissão */ }

const filtrosMarcados = () => Object.keys(CAIXAS_FILTRO).filter((k) => filtros[k]);
const listaDeFiltros = (ks) => ks.map((k) => t(NOMES_FILTRO[k])).join(', ');
const guardarFiltros = () => {
  try { localStorage.setItem('povix.filtros', JSON.stringify(filtros)); } catch { /* janela privada */ }
};

function pintarFiltros() {
  for (const [k, id] of Object.entries(CAIXAS_FILTRO)) $(id).checked = Boolean(filtros[k]);
  if ($('filtroPalavras').value !== filtros.palavras) $('filtroPalavras').value = filtros.palavras;
  $('sensDetecao').value = filtros.sens;
  $('juntarLances').value = String(filtros.juntarS);
  pintarResumoFaixa();
}

/** As margens de Mais opções são as da montagem: mostram o que lá está. */
function pintarOpcoesDetecao() {
  if (document.activeElement !== $('margemAntes')) $('margemAntes').value = $('protAntes').value;
  if (document.activeElement !== $('margemDepois')) $('margemDepois').value = $('protDepois').value;
}

function ligarFiltros() {
  for (const [k, id] of Object.entries(CAIXAS_FILTRO)) {
    $(id).addEventListener('change', () => { filtros[k] = $(id).checked; guardarFiltros(); pintarFiltros(); });
  }
  // Escrever palavras é querer procurá-las: a caixa marca-se sozinha, e desmarca-se quando o campo fica vazio.
  $('filtroPalavras').addEventListener('input', () => {
    filtros.palavras = $('filtroPalavras').value;
    filtros.chat = termosDoFiltro(filtros.palavras).length > 0;
    guardarFiltros();
    pintarFiltros();
  });
  $('sensDetecao').addEventListener('change', () => {
    filtros.sens = SENSIBILIDADES_DETECAO.includes($('sensDetecao').value) ? $('sensDetecao').value : 'normal';
    guardarFiltros();
  });
  $('juntarLances').addEventListener('change', () => {
    const v = Number($('juntarLances').value);
    filtros.juntarS = JUNTAR_S.includes(v) ? v : 0;
    guardarFiltros();
  });
  // As margens escrevem nas da montagem, e a montagem trata do resto (guardar, repintar a lista).
  for (const [meu, dela] of [['margemAntes', 'protAntes'], ['margemDepois', 'protDepois']]) {
    $(meu).addEventListener('input', () => {
      $(dela).value = $(meu).value;
      $(dela).dispatchEvent(new Event('input'));
    });
    $(dela).addEventListener('input', pintarOpcoesDetecao);
  }
  window.addEventListener('resize', acertarFlutua);
  window.addEventListener('scroll', acertarFlutua, true);
  pintarFiltros();
  pintarOpcoesDetecao();
}

/**
 * Com o vídeo aberto num ecrã largo, as faixas são uma caixa baixa que rola, e o assistente lá dentro
 * ficava espremido em duas linhas à vista. Aí ele abre por cima do vídeo, encostado ao transporte: as
 * faixas (com as alças) ficam à vista por baixo, e o transporte e a Detecção automática (que é o Parar
 * enquanto ouve) continuam a poder carregar-se.
 */
function acertarFlutua() {
  const barra = $('acoesFaixa');
  const faixas = $('faixas');
  const apertado = !barra.hidden && /auto|scroll/.test(getComputedStyle(faixas).overflowY) && faixas.clientHeight < 320;
  barra.classList.toggle('flutua', apertado);
  if (!apertado) return;
  const f = faixas.getBoundingClientRect();
  const transporte = document.querySelector('.transporte')?.getBoundingClientRect();
  const topo = transporte && transporte.height && transporte.top < f.top ? transporte.top : f.top;
  const corpo = $('acoesGrupo');
  const largura = Math.min(820, window.innerWidth - 32);
  corpo.style.setProperty('--flutua-x', `${Math.max(16, Math.min(f.left, window.innerWidth - largura - 16))}px`);
  corpo.style.setProperty('--flutua-largura', `${largura}px`);
  corpo.style.setProperty('--flutua-baixo', `${Math.max(8, window.innerHeight - topo + 6)}px`);
  corpo.style.setProperty('--flutua-alto', `${Math.max(160, topo - 16)}px`);
}

/** Quantos de cada tipo, numa frase: "2 tiroteios, 1 explosão". */
function contagemPorTipo(conta) {
  const chaves = {
    tiros: ['filtros.umTiroteio', 'filtros.tiroteios'],
    explosao: ['filtros.umaExplosao', 'filtros.explosoesN'],
    grito: ['filtros.umGrito', 'filtros.gritosN'],
    chat: ['filtros.umChat', 'filtros.chatN'],
  };
  return Object.entries(chaves).filter(([k]) => conta[k]).map(([k, [um, varios]]) => tn(conta[k], um, varios)).join(', ');
}

/** A confiança do que a detecção ouviu (a mesma conta do índice), para o título dizer só o que se sabe. */
function confDaDeteccao(c) {
  if (!['tiros', 'explosao', 'grito', 'chat'].includes(c.tipo)) return {};
  const r = confDoSom(c.tipo, c);
  return r.conf == null ? {} : { conf: r.conf, confFonte: r.fonte, confN: r.n };
}

/** O tipo de um momento achado pela detecção, como aparece na lista. */
function rotuloDoTipo(m) {
  // O título diz o que aconteceu, com o que o som provou (titulo.js); o chat achado por palavra mantém as palavras.
  if (!(m.tipo === 'chat' && m.palavras?.length)) return tituloDeDeteccao(m);
  if (m.tipos?.length > 1) return m.tipos.map((tipo) => rotuloDoTipo({ ...m, tipos: null, tipo })).join(', ');
  if (m.tipo === 'tiros') return m.acertos > 0 ? t('filtros.tipoPvp', { n: m.acertos }) : t('filtros.tipoTiros');
  if (m.tipo === 'explosao') return t('filtros.tipoExplosao');
  if (m.tipo === 'grito') return t('filtros.tipoGrito');
  if (m.tipo === 'chat') return t('filtros.tipoChat', { palavras: (m.palavras || []).join(', ') });
  return '';
}

/**
 * O botão Detecção automática. De quem e quanto escolhe-se na linha do tempo, com as mesmas escolhas do
 * chat (o dono, 10/10: "a detecção automática também deveria ter as mesmas opções de ler o chat"): o
 * botão abre a barra na faixa de quem está no vídeo, e a correr é o Parar dela.
 */
function procurarKills() {
  // A correr, o mesmo botão pára. Ouvir uma noite inteira leva minutos, e sem
  // isto a única saída era recarregar a página.
  if (estado.varredura) { estado.varredura.abort(); return; }
  if (!estado.linhas.length || !estado.janela) return;
  const nota = $('estadoMontagem');
  nota.classList.remove('mau');
  nota.textContent = t('auto.escolha');
  // Direto no passo 2 de Detectar lances, na faixa de quem está no vídeo.
  abrirAcoes(estado.focos[0] || estado.linhas[0].slug, { focar: true, acao: 'detetar' });
}

// O aviso antes de ouvir muito (o dono, 10/10: "10 h de live"), dentro do assistente e não numa caixa
// do navegador: as horas, os megas, e Continuar ou Cancelar. Só aparece quando é muito; um trecho de
// minutos começa logo. Resolve com sim ou não, e o Parar da detecção fecha-o.
function perguntarAntes(texto, sinal) {
  return new Promise((sim, mal) => {
    const caixa = $('avisoOuvir');
    $('avisoOuvirTexto').textContent = texto;
    const fechar = (resposta) => {
      avisoAberto = null;
      caixa.hidden = true;
      $('avisoContinuar').onclick = null;
      $('avisoCancelar').onclick = null;
      pintarChatTrecho();
      return resposta;
    };
    avisoAberto = { fechar };
    caixa.hidden = false;
    pintarChatTrecho();
    $('avisoContinuar').onclick = () => sim(fechar(true));
    $('avisoCancelar').onclick = () => sim(fechar(false));
    sinal.addEventListener('abort', () => { fechar(); mal(new DOMException('parado', 'AbortError')); }, { once: true });
    $('acoesFaixa').scrollIntoView({ block: 'nearest' });
    $('avisoContinuar').focus({ preventScroll: true });
  });
}

/** Juntar o que acabou de ser ouvido aos intervalos ouvidos do canal (os da faixa). */
function marcarOuvido(canal, intervalos) {
  if (!intervalos?.length) return;
  estado.ouvidoNaFaixa.set(canal, juntar([...(estado.ouvidoNaFaixa.get(canal) || []), ...intervalos]));
}

/**
 * Ouvir a POV de uma pessoa (ou de cada uma) à procura de tiroteios, num trecho ou no tempo todo ao vivo.
 * Tudo no relógio da noite, que é o dos momentos e o do cursor: o início e o fim do canal estão no
 * relógio do VOD dele, e o ajuste leva de um ao outro.
 *
 * Mais rápido (o dono, 10/10: "Ouvindo kodd: 1/121, 0 MB", 10 h baixadas um segmento de cada vez):
 * - quatro segmentos no ar ao mesmo tempo, e dois bocados a ser ouvidos ao mesmo tempo (`varrerNoite`);
 * - o modo esperto, quando há mais de meia hora para ouvir: primeiro o chat (o que faltar ler), e só uns
 *   minutos em volta dos picos dele; os achados aparecem logo, e o Continuar ouvindo o resto faz o resto;
 * - o progresso em horas de live, os megas e quanto falta, pela velocidade medida;
 * - o aviso antes de começar, quando é muito;
 * - o que já se ouviu de uma pessoa não se baixa outra vez (a memória da sessão, `estado.somOuvido`).
 */
async function detetar(quem, quanto, { resto = false } = {}) {
  if (!quem || estado.varredura || chatTrechoControlo || !estado.linhas.length || !acertarChatTrecho()) return;
  const botao = $('procurarKills');
  const nota = $('estadoMontagem');
  const naFaixa = $('estadoChatTrecho');
  const dizer = (texto, mau = false) => {
    nota.classList.toggle('mau', mau);
    nota.textContent = texto;
    naFaixa.textContent = texto;
  };
  // O que procurar, dos filtros. Sem nenhum marcado não há o que fazer, e o painel abre-se para o dizer.
  const marcados = filtrosMarcados();
  const termos = filtros.chat ? termosDoFiltro(filtros.palavras) : [];
  if (!marcados.length) {
    dizer(t('filtros.marqueUm'));
    $('filtroTiros').focus({ preventScroll: true });
    return;
  }
  if (filtros.chat && !termos.length) {
    dizer(t('filtros.semPalavras'));
    $('filtroPalavras').focus({ preventScroll: true });
    return;
  }
  const comSom = filtros.tiros || filtros.explosoes || filtros.gritos;
  const comChat = termos.length > 0 && Boolean(chatDoEvento);
  // Só os tiros é a detecção de sempre, e diz-se como sempre: "2 tiroteios em tchubi".
  const soTiros = marcados.length === 1 && filtros.tiros;
  // O trecho de cada um é o pedaço das alças em que ele esteve ao vivo.
  const pedidos = pedidosDe(quem, quanto).map((p) => ({
    ...p, deMs: Math.max(p.deMs, p.vivo.deMs), ateMs: Math.min(p.ateMs, p.vivo.ateMs),
  })).filter((p) => p.ateMs > p.deMs);
  if (!pedidos.length) {
    const vivo = quem === TODOS ? null : aoVivoDe(quem);
    dizer(quem === TODOS ? t('auto.ninguemNoTrecho')
      : vivo ? t('auto.horasFora', { canal: quem, de: relogioCurto(vivo.deMs).slice(0, 5), ate: relogioCurto(vivo.ateMs).slice(0, 5) })
        : t('chatTrecho.semAoVivo', { canal: quem }));
    return;
  }
  const totalMs = pedidos.reduce((s, p) => s + (p.ateMs - p.deMs), 0);
  const todos = quem === TODOS;
  // O modo esperto: só com som para ouvir, chat para ler e mais de meia hora. Um trecho curto ouve-se
  // todo, direto; o Continuar ouvindo o resto ouve o que o modo esperto deixou.
  const esperto = comSom && !resto && Boolean(chatDoEvento) && totalMs > ESPERTO_A_PARTIR_MS;
  // O resto por ouvir volta a ser dito no fim (ou ao parar), se ainda houver.
  estado.restoPorOuvir = null;

  const controlo = new AbortController();
  estado.varredura = controlo;
  trocarRotulo(botao, 'montagem.parar');
  pintarChatTrecho();
  let canal = pedidos[0].canal;
  try {
    // Onde ouvir: em volta dos picos do chat de cada um (lido agora, se faltar), ou tudo.
    let picosAchados = 0;
    if (esperto) {
      for (const p of pedidos) {
        if (controlo.signal.aborted) throw new DOMException('parado', 'AbortError');
        canal = p.canal;
        if (p.deMs < Date.now()) {
          // eslint-disable-next-line no-await-in-loop
          await chatDoEvento.lerChatTrecho(canal, p.deMs, p.ateMs, {
            sinal: controlo.signal,
            aoProgredir: ({ fracao }) => dizer(t('rapido.aLerPicos', { canal, pct: Math.round(fracao * 100) })),
          });
        }
        const marcas = (chatDoEvento.estado.marcas?.get(canal) || []).filter((m) => m.ms >= p.deMs && m.ms < p.ateMs);
        picosAchados += marcas.length;
        p.intervalos = janelasDosPicos(marcas, p.deMs, p.ateMs);
      }
      pintarFaixas();
    }
    for (const p of pedidos) if (!p.intervalos) p.intervalos = [[p.deMs, p.ateMs]];
    const planoMs = pedidos.reduce((s, p) => s + somaMs(p.intervalos), 0);
    if (esperto && !planoMs) {
      // Sem picos não há por onde começar: diz-se, e o botão ouve tudo.
      estado.restoPorOuvir = { quem, quanto };
      dizer(todos ? t('rapido.semPicosTodos') : t('rapido.semPicos', { canal }));
      return;
    }
    // O que ainda não foi ouvido é o que custa: o resto vem da memória da sessão.
    const porOuvirMs = pedidos.reduce((s, p) => s + msPorOuvir(p.intervalos, estado.ouvidoNaFaixa.get(p.canal)), 0);
    const mb = custoVarrerMB(porOuvirMs);
    if (comSom && eMuito(porOuvirMs, mb)) {
      naFaixa.textContent = '';
      nota.classList.remove('mau');
      nota.textContent = t('rapido.aviso', { horas: duracaoTrecho(porOuvirMs), mb });
      const sim = await perguntarAntes(t('rapido.aviso', { horas: duracaoTrecho(porOuvirMs), mb }), controlo.signal);
      if (!sim) {
        if (esperto || resto) estado.restoPorOuvir = { quem, quanto };
        dizer(t('rapido.cancelado'));
        return;
      }
    }

    const achados = [];
    const porCanal = [];
    const estouros = [];
    const conta = {};
    let falhados = 0;
    let ouvido = null;
    let avisosChat = '';
    // O progresso de todos os pedidos juntos, em horas de live, e a velocidade medida desde aqui.
    const comecou = Date.now();
    let feitoAntes = 0;
    let novoAntes = 0;
    let bytesAntes = 0;
    let ultimoDesenho = 0;
    let desenhoAdiado = null;
    $('barraOuvir').value = 0;
    for (const p of pedidos) {
      if (controlo.signal.aborted) throw new DOMException('parado', 'AbortError');
      canal = p.canal;
      const linha = estado.linhas.find((l) => l.slug === canal);
      const doCanal = [];
      if (comSom) {
        let reaproveitado = null;
        let feitoAqui = 0;
        let novoAqui = 0;
        let bytesAqui = 0;
        const desenhar = () => {
          const feito = feitoAntes + feitoAqui;
          const bytes = bytesAntes + bytesAqui;
          const falta = estimarFalta({
            feitoMs: novoAntes + novoAqui, restoMs: planoMs - feito, bytes, decorridoMs: Date.now() - comecou,
          });
          $('barraOuvir').value = planoMs ? Math.min(1, feito / planoMs) : 0;
          dizer(t('rapido.aOuvir', {
            canal, feito: duracaoTrecho(feito), total: duracaoTrecho(planoMs), mb: (bytes / 1048576).toFixed(0),
          }) + (falta ? t('rapido.falta', { tempo: tempoFalta(falta) }) : ''));
        };
        // eslint-disable-next-line no-await-in-loop
        const r = await varrerNoite({
          linha,
          deMs: p.deMs,
          ateMs: p.ateMs,
          intervalos: p.intervalos,
          nudgeMs: estado.nudges[canal] || 0,
          sinal: controlo.signal,
          memoria: estado.somOuvido,
          // Os sons de acerto do jogo só entram com os tiros: marcam o tiroteio que é PvP (acertou um jogador).
          filtros: { tiros: filtros.tiros, explosoes: filtros.explosoes, gritos: filtros.gritos, acertos: filtros.tiros },
          opcoes: opcoesDaSensibilidade(filtros.sens),
          alertas: alertasDoCanal(canal),
          // 24 kHz, e nao os 8 do alinhamento: o tiro vive no agudo.
          lerSom: (l, quandoMs, duracaoS, opcoes) => somDoCanal(l, quandoMs, duracaoS, { ...opcoes, taxa: TAXA_TIROS }),
          aoProgresso: (x) => {
            // Cada bocado ouvido fica logo mais escuro na faixa (no máximo uma vez por segundo).
            if (x.pronto) {
              marcarOuvido(canal, [x.pronto]);
              if (Date.now() - ultimoDesenho > 1000) { ultimoDesenho = Date.now(); pintarFaixas(); }
              else if (!desenhoAdiado) {
                desenhoAdiado = setTimeout(() => { desenhoAdiado = null; ultimoDesenho = Date.now(); pintarFaixas(); }, 1000);
              }
            }
            if (!('bytes' in x)) return;
            if (reaproveitado === null) reaproveitado = x.ouvidoMs || 0;
            feitoAqui = x.ouvidoMs ?? feitoAqui;
            novoAqui = Math.max(0, feitoAqui - reaproveitado);
            bytesAqui = x.bytes || 0;
            desenhar();
          },
        });
        feitoAntes += somaMs(p.intervalos);
        novoAntes += novoAqui;
        bytesAntes += bytesAqui;
        marcarOuvido(canal, r.cobertura || p.intervalos);
        for (const e of r.estouros || []) estouros.push(e.canal ? e : { ...e, canal });
        falhados += r.falhados || 0;
        ouvido = r.ouvido || ouvido;
        for (const c of r.candidatos || []) {
          const hs = (r.acertos || []).filter((a) => a.ms >= c.combateDeMs - 1500 && a.ms <= c.combateAteMs + 1500);
          doCanal.push({ ...c, canal, tipo: 'tiros', ...(hs.length ? { acertos: hs.length, cabecas: hs.filter((a) => a.tipo === 'cabeca').length } : {}) });
        }
        for (const c of r.explosoes || []) doCanal.push({ ...c, canal, tipo: 'explosao' });
        for (const c of r.gritos || []) doCanal.push({ ...c, canal, tipo: 'grito' });
      }
      if (comChat && p.deMs < Date.now()) {
        // O chat do trecho, lido como o Ler chat o lê: o que já se leu não se pede outra vez.
        // eslint-disable-next-line no-await-in-loop
        const lido = await chatDoEvento.lerChatTrecho(canal, p.deMs, p.ateMs, {
          sinal: controlo.signal,
          aoProgredir: ({ fracao }) => dizer(t('filtros.aLerChat', { canal, pct: Math.round(fracao * 100) })),
        });
        if (lido.semCanal) avisosChat += t('filtros.semChat', { canal });
        else if (lido.motivo) avisosChat += t('filtros.chatIncompleto', { canal });
        const mensagens = chatDoEvento.estado.mensagens?.get(canal) || [];
        for (const c of momentosDePalavras(mensagens, termos, p.deMs, p.ateMs)) {
          doCanal.push({ ...c, canal, tipo: 'chat', palavras: c.termos });
        }
      }
      // Lances perto uns dos outros viram um só, quando ele o pediu em Mais opções.
      const juntos = juntarProximos(doCanal, filtros.juntarS * 1000);
      for (const c of juntos) conta[c.tipo] = (conta[c.tipo] || 0) + 1;
      achados.push(...juntos);
      if (juntos.length) porCanal.push(`${canal} ${juntos.length}`);
    }
    if (comSom) estado.estouros = estouros;
    // O que o modo esperto ouviu, dito, e o resto à distância de um botão.
    let esperteza = '';
    if (esperto) {
      const faltaMs = pedidos.reduce((s, p) => s + msPorOuvir([[p.deMs, p.ateMs]], estado.ouvidoNaFaixa.get(p.canal)), 0);
      if (faltaMs > 0) estado.restoPorOuvir = { quem, quanto };
      esperteza = t('rapido.esperto', {
        ouvido: duracaoTrecho(planoMs), total: duracaoTrecho(totalMs), picos: tn(picosAchados, 'rapido.umPico', 'rapido.picos'),
      });
    }
    // Os bocados que a Kick nao mandou, ditos. Sem isto um buraco de rede a
    // meio da noite passava por uma hora sem tiroteios.
    const falhas = (falhados ? t('auto.falhados', { n: falhados }) : '') + avisosChat + esperteza;
    if (!achados.length) {
      // Dizer o que se ouviu, e nao so que nao se achou. "Da isso, porem eu sei
      // que ta tendo tiroteio" — e sem estes tres numeros nao ha como saber se
      // o detector ouviu o pedaco errado, se apertou demais, ou se faltou um
      // tiro para fazer grupo.
      if (!soTiros) {
        const lista = listaDeFiltros(marcados);
        dizer((todos ? t('filtros.nenhumTodos', { lista }) : t('filtros.nenhum', { canal, lista })) + falhas);
        return;
      }
      if (todos) { dizer(t('auto.nenhumTodos') + falhas); return; }
      const o = ouvido;
      dizer(t('auto.nenhum', { canal })
        + (!o ? '' : !o.altos ? t('auto.ouviNada') : t('auto.ouvi', o))
        + falhas);
      return;
    }

    // Cada um com o seu tipo escrito, para a lista dizer o que o achou.
    for (const c of achados) {
      estado.momentos = acrescentar(
        estado.momentos,
        novoMomento(c.ms, c.canal, {
          ...tamanhos(), auto: true, tipo: c.tipo,
          ...(c.tipos?.length > 1 ? { tipos: c.tipos } : {}),
          ...(c.tipo === 'tiros' ? { tiros: c.tiros } : {}),
          ...confDaDeteccao(c),
          ...(c.tipo === 'tiros' && c.acertos ? { acertos: c.acertos, cabecas: c.cabecas } : {}),
          ...(c.tipo === 'chat' ? { palavras: c.palavras } : {}),
          combateDeMs: c.combateDeMs, combateAteMs: c.combateAteMs,
        }),
      );
    }
    pintarMomentos();
    guardar();

    // E agora a outra metade: quem morreu em cada um.
    //
    // Com um canal só não há ecrãs para comparar, e o botão dessa parte nem é
    // desenhado. A busca chamava-a na mesma, rebentava num null, e a mensagem
    // falava de uma sincronia que ele nunca pediu.
    let comMorte = 0;
    for (const [i, c] of (soUmCanal() ? [] : achados).entries()) {
      if (controlo.signal.aborted) break;
      dizer(t('auto.aVer', { feito: i + 1, total: achados.length }));
      // A kill DESTE canal. Uma marca de outro streamer a menos de dois
      // segundos é outra kill, e não pode ser re-cronometrada por esta.
      const antes = estado.momentos.find((m) => m.protagonista === c.canal && Math.abs(m.ms - c.ms) < 2000);
      if (!antes) continue;
      // eslint-disable-next-line no-await-in-loop
      const houve = await verQuemMorreu(antes.ms, { silencioso: true });
      if (houve) comMorte++;
    }

    // Redesenhar PRIMEIRO, e só depois escrever o resultado: o `pintarMomentos`
    // acaba a pôr o resumo da montagem nesta mesma linha, e o "N tiroteios em X"
    // de uma busca de minutos sumia no instante em que aparecia.
    pintarMomentos();
    guardar();
    const n = achados.length;
    const lista = contagemPorTipo(conta);
    const resultado = soTiros
      ? (todos ? t('auto.acheiTodos', { n, lista: porCanal.join(', ') }) : t('auto.achei', { n, canal }))
      : (todos ? tn(n, 'filtros.umMomentoTodos', 'filtros.momentosTodos', { lista, canais: porCanal.join(', ') })
        : tn(n, 'filtros.umMomento', 'filtros.momentos', { canal, lista }));
    dizer(resultado + (comMorte ? t('auto.comMorte', { n: comMorte }) : '') + falhas);
  } catch (e) {
    // O erro desta busca é desta busca: o `alinhar.erro` falava de sincronia e
    // mandava alinhar à mão, que não é o que falhou nem o que resolve.
    // Parado a meio, o que já se ouviu fica guardado, e o Continuar ouvindo o resto retoma daí.
    if (e.name === 'AbortError' && comSom) estado.restoPorOuvir = { quem, quanto };
    dizer(e.name === 'AbortError' ? (comSom ? t('rapido.parado') : t('alinhar.cancelado'))
      : e.name === 'SEM-DESCODIFICADOR' ? t('auto.semCodec')
        : t('auto.erro', { canal }), true);
  } finally {
    // No `finally`, e não no fim do caminho feliz: a busca que não acha nada
    // sai mais cedo, e o botão ficava com o Parar até recarregar a página, com
    // a mensagem a mandar escolher outro trecho.
    estado.varredura = null;
    trocarRotulo(botao, 'auto.botao');
    pintarChatTrecho();
    // As partes do chat que a detecção leu e as do som que ouviu ficam marcadas na faixa.
    if (comChat || comSom) pintarFaixas();
  }
}

// ── montagem ────────────────────────────────────────────────────────────────

const tamanhos = () => ({
  protagonistaAntesS: Math.max(0, Number($('protAntes').value) || 0),
  protagonistaDepoisS: Math.max(0, Number($('protDepois').value) || 0),
  vitimaAntesS: Math.max(0, Number($('vitAntes').value) || 0),
  vitimaDepoisS: Math.max(0, Number($('vitDepois').value) || 0),
});

/** Quem estava mesmo a filmar naquele bocado — o resto não entra. */
const filmava = (slug, deMs, ateMs) => {
  const l = estado.linhas.find((x) => x.slug === slug);
  if (!l) return false;
  const nudge = estado.nudges[slug] || 0;
  return onde(l, deMs, { nudgeMs: nudge }).estado === 'toca'
    || onde(l, ateMs, { nudgeMs: nudge }).estado === 'toca';
};

// ── o prazo do VOD (IDEIAS.md, item 7) ──────────────────────────────────────
// A Kick apaga o VOD 7 dias depois da live (30 nos canais verificados), e um lance marcado no primeiro
// dia do evento pode sumir antes do recap. Cada faixa diz quando o VOD dela some, e a Montagem guarda
// os lances começando pelos que somem primeiro. As contas estão em prazo.js.

/** O prazo do VOD de `slug` que tem o instante `ms`; sem `ms`, o do VOD da faixa que some primeiro. */
function prazoDe(slug, ms = null) {
  const l = estado.linhas.find((x) => x.slug === slug);
  if (!l) return null;
  const ret = retencaoDoCanal((estado.vodsPorCanal.get(slug) || estado.vodsDoEvento.get(slug))?.vods);
  const nudge = estado.nudges[slug] || 0;
  const pecas = (l.pecasCompletas || l.pecas || []).filter((p) => ms == null
    || (p.playlist && ms + nudge >= p.playlist.inicio && ms + nudge <= p.playlist.fim));
  const agoraMs = Date.now();
  let melhor = null;
  for (const p of pecas) {
    const prazo = prazoDoVod(p.vod, { retencaoDias: ret.dias, agoraMs });
    if (prazo && (!melhor || prazo.expiraMs < melhor.expiraMs)) melhor = prazo;
  }
  return melhor && { ...melhor, visto: ret.visto };
}

/** O prazo de um lance: o do ângulo dele que some primeiro. */
function prazoDoLance(m) {
  const canais = estado.linhas.map((l) => l.slug);
  let melhor = null;
  for (const c of planoDaMontagem([m], canais, { filmava })) {
    const p = prazoDe(c.canal, c.deMs);
    if (p && (!melhor || p.expiraMs < melhor.expiraMs)) melhor = { ...p, canal: c.canal };
  }
  return melhor;
}

/** "some em 3 dias", e a explicação da conta para o `title`. */
function textoDoPrazo(p) {
  const texto = p.dias <= 0 ? t('prazo.jaPode') : tn(p.dias, 'prazo.umDia', 'prazo.dias');
  const data = new Date(p.expiraMs).toLocaleDateString(idiomaActual(), { day: 'numeric', month: 'short' });
  return { texto, ajuda: t(p.visto ? 'prazo.ajuda30' : 'prazo.ajuda7', { data }), perto: p.dias <= 2 };
}

/**
 * Marcar ao vivo com uma tecla (IDEIAS.md, item 9): o que se acabou de ver, em todos os ângulos ao
 * vivo abertos. A tocar o ao vivo aqui, o instante é o que está na tela; senão (a ver na Kick, ou com
 * a página parada), é o agora menos o atraso medido de cada canal (`instantesAoVivo`). Entra na
 * montagem como um lance (guardado como as kills) e nos melhores lances como "marcado por você".
 */
const NA_TELA_AO_VIVO_MS = 60_000;
function marcarAoVivo() {
  const agora = Date.now();
  const vivas = estado.linhas.filter((l) => l.pecas.some((p) => p.vod?.aoVivo));
  const { vivos } = bordaAoVivo(vivas, { agoraMs: agora, nudges: estado.nudges });
  const canais = vivas.map((l) => l.slug).filter((s) => vivos.includes(s));
  const dizer = (texto) => { $('estadoAoVivo').textContent = texto; };
  if (!canais.length) { dizer(t('aoVivoMarca.nenhum')); return; }
  const atras = agora - estado.agoraMs;
  const naTela = !estado.parado && atras >= 0 && atras <= NA_TELA_AO_VIVO_MS ? estado.agoraMs : null;
  const marcas = instantesAoVivo(canais, { agoraMs: agora, medidos: estado.atrasosVivo, nudges: estado.nudges, naTelaMs: naTela });
  const prot = canais.includes(estado.focos[0]) ? estado.focos[0] : canais[0];
  const daProt = marcas.find((m) => m.slug === prot);
  const novo = novoMomento(daProt.ms, prot, {
    ...tamanhos(),
    origem: 'aovivo',
    vivo: marcas.map(({ slug, ms, atrasoMs, fonte }) => ({ c: slug, ms, atrasoMs, fonte })),
  });
  const antes = estado.momentos;
  estado.momentos = acrescentar(estado.momentos, novo);
  if (estado.momentos === antes) { dizer(t('aoVivoMarca.jaMarcado', { hora: relogioCurto(novo.ms) })); return; }
  pintarMomentos();
  guardar();
  chatDoEvento?.marcadoAoVivo?.({ ms: novo.ms, canais });
  dizer(textoDaMarcaAoVivo(novo.ms, marcas));
}

/** "Marcado 21:04:10 em 3 ângulos ao vivo, descontando o atraso de cada canal (medido: 3 a 8 s)." */
function textoDaMarcaAoVivo(ms, marcas) {
  const hora = relogioCurto(ms);
  const angulos = tn(marcas.length, 'aoVivoMarca.umAngulo', 'aoVivoMarca.angulos');
  if (marcas[0]?.fonte === 'tela') return t('aoVivoMarca.feitoTela', { hora, angulos });
  const segundos = (x) => Math.round(x / 1000);
  const medidos = marcas.filter((m) => m.fonte === 'medido').map((m) => segundos(m.atrasoMs));
  const partes = [];
  if (medidos.length) {
    const de = Math.min(...medidos);
    const ate = Math.max(...medidos);
    partes.push(de === ate ? t('aoVivoMarca.medidoUm', { s: de }) : t('aoVivoMarca.medido', { de, ate }));
  }
  const semMedida = marcas.length - medidos.length;
  if (semMedida) partes.push(tn(semMedida, 'aoVivoMarca.padraoUm', 'aoVivoMarca.padrao', { s: segundos(ATRASO_PADRAO_MS) }));
  return t('aoVivoMarca.feito', { hora, angulos, atrasos: partes.join(', ') });
}

function marcarKill() {
  if (!estado.linhas.length) return;
  estado.momentos = acrescentar(
    estado.momentos,
    novoMomento(estado.agoraMs, estado.focos[0] || estado.linhas[0].slug, tamanhos()),
  );
  pintarMomentos();
  guardar();
}

/**
 * Olhar pelos seis ao mesmo tempo e dizer quem morreu.
 *
 * "Não faço ideia de quem eu matei, por isso é que ia ver o ecrã de todos."
 * Perguntar-lhe quem morreu era devolver-lhe o trabalho todo — e este era o
 * trabalho.
 *
 * Vai buscar um frame antes do tiro e outro depois, a cada canal, e compara.
 * Quem morreu foi para um ecrã cinzento e escuro; quem não morreu continua a
 * ver o jogo. A sugestão fica marcada, e as imagens ficam à vista para ele
 * corrigir num clique — porque uma sugestão que não se pode ver nem corrigir
 * é pior do que não existir.
 */
async function verQuemMorreu(ms, { silencioso = false } = {}) {
  const momento = estado.momentos.find((m) => m.ms === ms);
  if (!momento) return false;
  // A linha da lista pode não estar desenhada, e a conta não precisa dela.
  // O filtro "com vítima" (que se guarda de uma noite para a outra) esconde
  // justamente as kills novas da busca automática, e era aí que a busca
  // desistia calada de ver quem morreu em todas.
  const li = $('listaMomentos').querySelector(`li[data-ms="${ms}"]`);
  const caixa = li?.querySelector('.olhar');
  const botao = li?.querySelector('.verMortes');
  if (botao) botao.disabled = true;
  if (!silencioso && caixa) {
    caixa.hidden = false;
    caixa.innerHTML = `<span class="nota">${t('montagem.aOlhar')}</span>`;
  }

  const apanhador = criarApanhador({ linhas: estado.linhas, nudges: estado.nudges });
  const notas = {};
  const imagens = {};
  let sugeridos = [];
  let ordenados = [];
  let afinado = null;

  // `finally` a fechar o apanhador, e não uma chamada no fim do caminho feliz.
  // São seis `<video>` por instante, e a busca automática faz isto vinte vezes
  // seguidas: uma bissecção que rebentasse deixava cento e vinte leitores
  // vivos e a página ia ficando pesada sem razão à vista.
  try {
    // Os canais ao mesmo tempo, e nao um de cada vez.
    //
    // Cada canal tem o seu proprio <video>: seis leitores a saltar para o
    // mesmo instante e o mesmo trabalho que a grelha ja faz quando toca. Em
    // fila indiana isto eram seis esperas somadas por cada kill, e a busca
    // automatica faz isto vinte vezes — dez minutos que passam a dois.
    //
    // Dentro de cada canal continua em fila: sao dois saltos no MESMO leitor,
    // e pedi-los ao mesmo tempo dava dois frames do mesmo sitio.
    let vistos = 0;
    await Promise.all(estado.linhas.map(async (l) => {
      try {
        const antes = await apanhador.frame(l.slug, ms - 2000);
        const depois = await apanhador.frame(l.slug, ms + 2500);
        imagens[l.slug] = depois?.imagem || null;
        notas[l.slug] = antes && depois ? notaDeMorte(antes.pixeis, depois.pixeis) : null;
      } catch {
        // Um ângulo que não se lê é um cartão sem imagem, e não o fim da
        // medição para os outros cinco.
        notas[l.slug] = null;
      }
      vistos += 1;
      if (!silencioso && caixa) {
        caixa.innerHTML = `<span class="nota">${t('montagem.aOlharQuantos',
          { feito: vistos, total: estado.linhas.length })}</span>`;
      }
    }));

    // O protagonista entra na conta como termo de comparação, e nunca como
    // sugestão. A saquear o morto o ecrã dele também escurece, e ficava com um
    // dos dois lugares: "parece que morreu: tchubi", a segunda vítima de fora,
    // a bissecção a acertar o instante pelo ecrã DELE, e a kill contada como
    // "com vítima identificada" sem vítima nenhuma.
    ({ sugeridos, ordenados } = quemMorreu(notas, { excluir: [momento.protagonista] }));
    // Marcar já os sugeridos: o objectivo é ele não ter de escolher nada
    // quando a página acertou.
    if (sugeridos.length) {
      estado.momentos = estado.momentos.map((m) => {
        if (m.ms !== ms) return m;
        const juntos = [...new Set([...(m.vitimas || []), ...sugeridos])];
        return { ...m, vitimas: juntos.filter((v) => v !== m.protagonista) };
      });

      // O instante certo, agora que se sabe quem morreu. Ele marca a kill à
      // volta do sítio porque não sabe o timing — e não tem de saber. O ecrã
      // do morto vira num instante só, e essa fronteira encontra-se por
      // bissecção: seis ou sete imagens em vez de cem.
      afinado = await afinarInstante(apanhador, sugeridos[0], ms);
      if (afinado != null && afinado !== ms) {
        // Acertar o instante pode fazê-lo cair em cima de outra kill já
        // marcada — na busca automática os candidatos estão a 25 s uns dos
        // outros e a afinação mexe até 6. Duas marcas no mesmo sítio davam
        // duas linhas gémeas onde apagar uma apagava as duas.
        const colide = estado.momentos.some((m) => m.ms !== ms && Math.abs(m.ms - afinado) < 2000);
        if (colide) {
          const meu = estado.momentos.find((m) => m.ms === ms);
          estado.momentos = estado.momentos
            .filter((m) => m.ms !== ms)
            .map((m) => (Math.abs(m.ms - afinado) < 2000
              ? { ...m, vitimas: [...new Set([...(m.vitimas || []), ...(meu?.vitimas || [])])] }
              : m));
          afinado = estado.momentos.find((m) => Math.abs(m.ms - afinado) < 2000)?.ms ?? afinado;
        } else {
          estado.momentos = estado.momentos.map((m) => (m.ms === ms ? { ...m, ms: afinado } : m));
        }
      }
      guardar();
    }
  } finally {
    apanhador.fechar();
  }

  const msFinal = afinado ?? ms;

  // O que se viu fica guardado, e é o `pintarMomentos` que desenha os cartões.
  //
  // Viviam só no DOM: o primeiro clique num cartão redesenhava a lista e
  // levava-os todos, e ver a segunda vítima obrigava a ir buscar outra vez um
  // frame a cada canal. Em busca automática ficam guardados mas fechados:
  // vinte tiroteios abertos ao mesmo tempo eram uma página de dois metros, e o
  // "Identificar vítimas" dessa kill abre-os sem voltar a olhar.
  estado.olhares.delete(ms);
  estado.olhares.set(msFinal, {
    notas,
    imagens,
    sugeridos,
    ordenados,
    acertei: afinado != null && afinado !== ms ? afinado : null,
    aberto: !silencioso,
  });
  pintarMomentos();
  return sugeridos.length > 0;
}

/** Os cartões de uma kill, a partir do que o "quem morreu" guardou dela. */
function cartoesDoOlhar(m, o) {
  const cartoes = estado.linhas.map((l) => {
    const n = o.notas[l.slug];
    const eSugerido = o.sugeridos.includes(l.slug);
    // O cartão diz o estado da kill AGORA, e não o da sugestão: é nele que ele
    // corrige, e o clique tem de se ver no sítio onde foi dado.
    const marcado = (m.vitimas || []).includes(l.slug);
    const posicao = o.ordenados.findIndex((x) => x.canal === l.slug);
    return `<button class="cartao ${marcado ? 'morreu' : ''}" data-canal="${escapar(l.slug)}"`
      + ` aria-pressed="${marcado}">`
      + (o.imagens[l.slug] ? `<img src="${o.imagens[l.slug]}" alt="">`
        : `<span class="semImagem">${t('montagem.semImagem')}</span>`)
      + `<b>${escapar(l.slug)}</b>`
      + `<span class="nota">${n ? `${eSugerido ? t('montagem.morreu') : ''}${posicao + 1}º`
        : t('montagem.naoFilmava')}</span>`
      + '</button>';
  }).join('');

  const semNada = !Object.values(o.notas).some(Boolean);
  const dito = o.acertei != null
    ? t('montagem.acerteiInstante', { hora: `${relogioCurto(o.acertei)}` })
    : '';
  return (semNada
    ? `<span class="nota mau">${t('montagem.naoVi')}</span>`
    : `<span class="nota">${o.sugeridos.length
      ? t('montagem.pareceMorreu', { lista: escapar(o.sugeridos.join(', ')) })
      : t('montagem.ninguem')}${dito}</span>`) + cartoes;
}

/**
 * A bissecção que encontra o instante em que o ecrã do morto vira.
 *
 * Meia dúzia de imagens, e não cem: o estado é monótono dentro da janela —
 * antes está vivo, depois está morto — e é exactamente isso que uma bissecção
 * precisa para funcionar.
 */
async function afinarInstante(apanhador, slug, ms, { janelaS = 6, precisaoMs = 250 } = {}) {
  const inicio = ms - janelaS * 1000;
  const fim = ms + janelaS * 1000;
  // Uma ponta de cada vez. O apanhador tem UM leitor por canal, e pedir as
  // duas ao mesmo tempo mandava-o saltar para o fim antes de chegar ao
  // princípio: as duas imagens saíam do mesmo sítio, iguais, e o limiar dava
  // "sem diferença" em todas as kills. O instante nunca era acertado.
  const vivo = await apanhador.frame(slug, inicio);
  const morto = vivo ? await apanhador.frame(slug, fim) : null;
  if (!vivo || !morto) return null;
  const lim = limiar(medir(vivo.pixeis), medir(morto.pixeis));
  // Sem diferença entre as pontas não há fronteira nenhuma a encontrar, e
  // devolver um número aqui era inventar precisão.
  if (!lim.utilizavel) return null;

  let a = inicio;
  let b = fim;
  while (b - a > precisaoMs) {
    const meio = Math.round((a + b) / 2);
    const f = await apanhador.frame(slug, meio);
    if (!f) return null;
    if (pareceMorto(medir(f.pixeis), lim)) b = meio;
    else a = meio;
  }
  return b;
}

/**
 * Com um canal so, metade desta pagina nao tem nada para dizer.
 *
 * "Tem comentario a falar de grupo, e eu so tenho um VOD." E verdade: nao ha
 * quem morreu para escolher, nao ha nada para alinhar, nao ha "1 de 1
 * angulos" e nao ha "todos juntos". Sao rotulos que existem por causa de um
 * caso que nao e o dele naquele momento, e que enchem o ecra de um telemovel.
 */
const soUmCanal = () => estado.linhas.length < 2;

function pintarMomentos() {
  // Os melhores lances do evento contam com as kills e com o que a detecção ouviu.
  chatDoEvento?.sinaisMudaram?.();
  $('montagem').classList.toggle('semKills', !estado.momentos.length);
  // A conta no separador da Montagem, e a Montagem à vista quando entra uma kill nova (marcada ou achada).
  $('contaMontagem').textContent = estado.momentos.length ? String(estado.momentos.length) : '';
  if (estado.momentos.length > killsPintadas && killsPintadas >= 0) mostrarPainel('montagem');
  killsPintadas = estado.momentos.length;
  // Uma prévia de uma kill que já não existe pára aqui. O Remover e o apagar
  // aos molhos tiravam a kill e deixavam o ciclo a tocar, e o botão Parar
  // estava na linha que acabara de sair: a única maneira de o desligar era
  // recarregar a página.
  if (estado.previa && !estado.momentos.some((m) => m.ms === estado.previa.ms)) estado.previa = null;
  const canais = estado.linhas.map((l) => l.slug);
  const sozinho = soUmCanal();
  const lista = ordenar(estado.momentos);
  const visiveis = filtrar(lista, estado.filtro);
  // A seleccao nao pode guardar fantasmas: um momento apagado cujo ms ficasse
  // marcado voltava a contar no "3 seleccionados" para sempre.
  const vivos = new Set(lista.map((m) => m.ms));
  for (const ms of estado.selecao) if (!vivos.has(ms)) estado.selecao.delete(ms);
  // E o que o "quem morreu" viu de uma kill apagada vai com ela.
  for (const ms of estado.olhares.keys()) if (!vivos.has(ms)) estado.olhares.delete(ms);

  $('listaMomentos').innerHTML = visiveis.map((m) => {
    // O numero e a posicao na montagem INTEIRA e nao na lista filtrada: e este
    // o numero que vai no nome do ficheiro, e duas contagens diferentes para a
    // mesma kill seriam um erro a espera de acontecer na mesa de montagem.
    const i = lista.indexOf(m);
    const clipes = planoDaMontagem([m], canais, { filmava });
    const n = clipes.length;
    const ajustados = ajustesQueContam(m);
    // Quanto dura o clipe dele. Os tiroteios vao de quatro segundos a noventa,
    // e sem este numero ele so descobre o tamanho depois de exportar.
    const seg = clipes.find((c) => c.papel === 'protagonista') || clipes[0];
    const dur = seg ? Math.round((seg.ateMs - seg.deMs) / 1000) : 0;
    // As fichas de quem morreu. Sem isto a página cortava todos os ângulos em
    // cada kill, e saíam quatro clipes de lixo por cada um bom.
    //
    // Cada ficha é um interruptor, e diz o estado em `aria-pressed`: a cor
    // sozinha não chega a quem usa um leitor de ecrã. E a razão de uma ficha
    // apagada vai no nome dela, e não só no `title`, que nem o toque nem os
    // leitores de ecrã mostram.
    const fichas = sozinho ? '' : canais.filter((c) => c !== m.protagonista).map((c) => {
      const morreu = (m.vitimas || []).includes(c);
      const havia = filmava(c, m.ms - 3000, m.ms + 3000);
      return `<button class="vit ${morreu ? 'sim' : ''}" data-canal="${escapar(c)}" aria-pressed="${morreu}"`
        + `${havia ? '' : ` disabled title="${t('montagem.naoFilmava')}"`
          + ` aria-label="${escapar(c)}: ${t('montagem.naoFilmava')}"`}>${escapar(c)}</button>`;
    }).join('');
    // O nome de quem morreu escrito à mão: serve para quem não tem botão aqui (o jogador sem canal na
    // montagem) e para achar a POV de quem matou. Nome de canal ou apelido guardado liga-se ao botão.
    const nomesEscritos = (m.vitimasTexto || []).map((nome) => `<button type="button" class="vit vitTexto sim" data-nome="${escapar(nome)}"`
      + ` title="${escapar(t('montagem.nomeMortoTirar', { nome }))}" aria-label="${escapar(t('montagem.nomeMortoTirar', { nome }))}">`
      + `${escapar(nome)}<svg class="ic ic-p" aria-hidden="true"><use href="#i-fechar"/></svg></button>`).join('');
    const campoNome = `<span class="vitEscrever"><input type="text" class="vitNome" maxlength="40" autocomplete="off"`
      + ` placeholder="${escapar(t('montagem.nomeMorto'))}" aria-label="${escapar(t('montagem.nomeMorto'))}">`
      + `<button type="button" class="vitAnotar">${t('montagem.nomeMortoAdd')}</button></span>`;
    const olhar = estado.olhares.get(m.ms);
    return `<li data-ms="${m.ms}" class="${Math.abs(m.ms - estado.agoraMs) < 1500 ? 'aqui' : ''}`
      + `${temMorte(m) ? ' confirmada' : ''}">`
      + `<input type="checkbox" class="pega" ${estado.selecao.has(m.ms) ? 'checked' : ''}`
      + ` aria-label="${relogioCurto(m.ms)}">`
      + `<b class="n">${numeroNaMontagem(i, lista.length)}</b>`
      + `<span>${relogioCurto(m.ms)}</span>`
      + `<span class="quem">${escapar(m.protagonista || '')}</span>`
      // O que a detecção achou ali, quando foi ela: tiroteio, explosão, grito, ou as palavras do chat.
      + (m.tipo ? `<span class="tipo">${escapar(rotuloDoTipo(m))}</span>` : '')
      + (m.origem === 'aovivo' ? `<span class="tipo">${escapar(t('aoVivoMarca.tipo'))}</span>` : '')
      + prazoNoLance(m)
      + `<button class="ver ${estado.previa?.ms === m.ms ? 'aVer' : ''}">`
      + `${t(estado.previa?.ms === m.ms ? 'montagem.parar' : 'montagem.ver')}</button>`
      + `<button class="cliparUma">${t('montagem.clipar')}</button>`
      + `<button class="baixarUma" ${n && !estado.montagem ? '' : 'disabled'}>${t('montagem.baixarUma')}</button>`
      + `<button class="pacoteUma" ${n && !estado.montagem ? '' : 'disabled'} title="${escapar(t('pacote.ajuda'))}">${t('pacote.botao')}</button>`
      + (estado.estouros.length ? `<button class="foiKill">${t('auto.foiKill')}</button>` : '')
      + `<button class="fora">${t('montagem.apagar')}</button>`
      + (sozinho ? '' : `<button class="verMortes">${t('montagem.verMortes')}</button>`)
      + `<span class="quantos">${dur ? `${dur}s, ` : ''}`
      + `${tn(n, 'montagem.umClipe', 'montagem.clipes')}</span>`
      // A kill que já tem ajustes guardados diz-o — é assim que ele sabe por
      // onde vai, numa lista de trinta.
      // Só os ajustes de ângulos que ainda entram na kill (ver `ajustesQueContam`).
      + (ajustados.length ? `<span class="ajustado">${t(ajustados.some((a) => a.formato)
        ? 'montagem.ajustadoRetrato' : 'montagem.ajustado')}${ajustados.some((a) => a.chat?.ligado)
        ? `, ${t('montagem.comChat')}` : ''}${ajustados.some((a) => a.legenda?.ligado)
        ? `, ${t('montagem.comLegenda')}` : ''}</span>` : '')
      // "Vítimas" só quando há alguma. Antes a etiqueta estava lá sempre, em
      // cima de uma fila de nomes que ninguém tinha medido — e dizer "Vítimas"
      // por cima de seis nomes que não morreram é afirmar uma coisa que a
      // página não sabe. Sem ninguém marcado é uma PERGUNTA, e os botões são a
      // resposta.
      + `<span class="vitimas${temMorte(m) ? ' ha' : ''}">`
        + `<span class="nota">${t(temMorte(m) ? 'montagem.matou' : 'montagem.quemMorreu')}</span>`
        + `${fichas}${nomesEscritos}${campoNome}</span>`
      + `<div class="olhar"${olhar?.aberto ? '' : ' hidden'}>${olhar ? cartoesDoOlhar(m, olhar) : ''}</div></li>`;
  }).join('') || `<li class="nota">${t('montagem.vazia')}</li>`;

  for (const li of $('listaMomentos').querySelectorAll('li[data-ms]')) {
    const ms = Number(li.dataset.ms);
    li.querySelector('.ver').onclick = () => verMomento(ms);
    const fk = li.querySelector('.foiKill');
    if (fk) fk.onclick = () => aprenderCom(ms);
    li.querySelector('.cliparUma').onclick = () => {
      const m = estado.momentos.find((x) => x.ms === ms);
      if (m) abrirClipe(m);
    };
    li.querySelector('.baixarUma').onclick = () => {
      const m = estado.momentos.find((x) => x.ms === ms);
      if (m) baixarMontagem([m]);
    };
    li.querySelector('.pacoteUma').onclick = () => {
      const m = estado.momentos.find((x) => x.ms === ms);
      if (m) baixarPacote(m);
    };
    const vm = li.querySelector('.verMortes');
    if (vm) {
      vm.onclick = () => {
        // O que a busca automática viu e guardou fechado abre-se sem voltar a
        // olhar: são dois frames por canal, e já foram buscados.
        const o = estado.olhares.get(ms);
        if (o && !o.aberto) { o.aberto = true; pintarMomentos(); return; }
        verQuemMorreu(ms);
      };
    }
    for (const b of li.querySelectorAll('.olhar .cartao')) {
      b.onclick = () => {
        estado.momentos = estado.momentos.map((m) => (m.ms === ms ? alternarVitima(m, b.dataset.canal) : m));
        pintarMomentos();
        guardar();
      };
    }
    li.querySelector('.fora').onclick = () => {
      estado.momentos = remover(estado.momentos, ms);
      pintarMomentos();
      guardar();
    };
    li.querySelector('.pega').onchange = (e) => {
      if (e.target.checked) estado.selecao.add(ms); else estado.selecao.delete(ms);
      pintarSelecao();
    };
    for (const b of li.querySelectorAll('.vit:not(.vitTexto)')) {
      b.onclick = () => {
        estado.momentos = estado.momentos.map((m) => (m.ms === ms ? alternarVitima(m, b.dataset.canal) : m));
        pintarMomentos();
        guardar();
      };
    }
    for (const b of li.querySelectorAll('.vitTexto')) {
      b.onclick = () => {
        estado.momentos = estado.momentos.map((m) => (m.ms === ms ? semVitimaEscrita(m, b.dataset.nome) : m));
        pintarMomentos();
        guardar();
      };
    }
    const anotar = () => {
      const campo = li.querySelector('.vitNome');
      const texto = campo.value;
      if (!texto.trim()) return;
      estado.momentos = estado.momentos.map((m) => (m.ms === ms
        ? comVitimaEscrita(m, texto, estado.linhas.map((l) => l.slug), lerApelidos()) : m));
      pintarMomentos();
      guardar();
      $('listaMomentos').querySelector(`li[data-ms="${ms}"] .vitNome`)?.focus();
    };
    li.querySelector('.vitAnotar').onclick = anotar;
    li.querySelector('.vitNome').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); anotar(); } };
  }
  pintarRegua();
  pintarSelecao();
  pintarPassos();
  const total = planoDaMontagem(lista, canais, { filmava }).length;
  // A correr, o botão é o Parar dela e fica sempre aceso; parado, só acende
  // quando há o que exportar.
  if (estado.montagem) trocarRotulo($('baixarMontagem'), 'montagem.parar'); else pintarSelecao();
  $('baixarMontagem').disabled = estado.montagem ? false : !total;
  pintarGuardar(lista, total);
  const semVitima = sozinho ? 0 : lista.filter((m) => !temMorte(m)).length;
  const escondidos = lista.length - visiveis.length;
  $('estadoMontagem').textContent = total
    ? t('montagem.resumo', {
      kills: tn(lista.length, 'montagem.umaKill', 'montagem.kills'), ficheiros: total,
    }) + (semVitima ? t('montagem.semVitima', { n: semVitima }) : '')
      // O filtro nunca pode esconder trabalho em silencio: a montagem que se
      // descarrega e a lista INTEIRA, e nao a que esta a ver.
      + (escondidos ? t('sel.escondidos', { n: escondidos }) : '')
    : '';
}

/** O prazo de um lance na lista da Montagem. */
function prazoNoLance(m) {
  const p = prazoDoLance(m);
  if (!p) return '';
  const { texto, ajuda, perto } = textoDoPrazo(p);
  return `<span class="prazo${perto ? ' perto' : ''}" title="${escapar(`${p.canal}: ${ajuda}`)}">${escapar(texto)}</span>`;
}

/**
 * "Guardar todos agora": a cópia rápida de todos os lances marcados, os que somem primeiro à frente.
 * A correr, o botão é o Parar dela; outra exportação a correr apaga-o.
 */
function pintarGuardar(lista, total) {
  const botao = $('guardarLances');
  $('guardarAgora').hidden = !lista.length;
  if (estado.montagem) {
    trocarRotulo(botao, estado.guardando ? 'montagem.parar' : 'prazo.guardar');
    botao.disabled = !estado.guardando;
    return;
  }
  trocarRotulo(botao, 'prazo.guardar');
  botao.disabled = !total;
  let primeiro = null;
  for (const m of lista) {
    const p = prazoDoLance(m);
    if (p && (!primeiro || p.expiraMs < primeiro.expiraMs)) primeiro = p;
  }
  const nota = $('prazoMontagem');
  nota.classList.toggle('mau', Boolean(primeiro && primeiro.dias <= 2));
  nota.textContent = primeiro
    ? t('prazo.primeiro', { quando: textoDoPrazo(primeiro).texto, canal: primeiro.canal })
    : '';
}

/** Os botoes da barra dizem sempre o que fazem sobre quantos. */
function pintarSelecao() {
  const n = estado.selecao.size;
  $('apagarSelecionados').disabled = !n;
  $('estadoSelecao').textContent = n ? t('sel.quantos', { n }) : '';
  // O botão da montagem diz o que exporta: as marcadas, quando há, e senão todas.
  if (!estado.montagem) {
    trocarRotulo($('baixarMontagem'), 'montagem.baixar');
    if (n) $('baixarMontagem').querySelector('span[data-t]').textContent = t('montagem.baixarSel', { n });
  }
}

/**
 * Apagar aos molhos, com volta atras.
 *
 * Um `confirm()` aqui nao protegia nada — e uma caixa em que ele carrega em OK
 * sem ler. O que protege e conseguir desfazer depois de ver o estrago.
 */
function apagarSelecionados() {
  if (!estado.selecao.size) return;
  const fora = [...estado.selecao];
  estado.apagados = estado.momentos.filter((m) => estado.selecao.has(m.ms));
  estado.momentos = removerVarios(estado.momentos, fora);
  estado.selecao.clear();
  $('anularApagar').hidden = false;
  pintarMomentos();
  guardar();
  $('estadoSelecao').textContent = t('sel.apagados', { n: fora.length });
}

function anularApagar() {
  if (!estado.apagados?.length) return;
  // `acrescentar` um a um, e nao uma concatenacao: se ele entretanto marcou
  // uma kill no mesmo sitio, a que ja la esta ganha.
  for (const m of estado.apagados) estado.momentos = acrescentar(estado.momentos, m);
  estado.apagados = null;
  $('anularApagar').hidden = true;
  pintarMomentos();
  guardar();
}

/**
 * A montagem, em ordem e com os nomes numerados.
 *
 * Um ficheiro de cada vez e com a cache partilhada: os clipes de uma mesma
 * kill caem quase todos nos mesmos segundos, e voltar a pedir o mesmo pedaço a
 * cada ângulo era pagar três vezes o mesmo download.
 *
 * @param {object[]|null} soEsta uma kill so, do botão dessa linha. "Só consigo
 *   baixar todos de uma vez, não consigo baixar um" — e ele tem razão: numa
 *   noite de quinze kills, querer a terceira e ter de esperar pelas quinze é
 *   ridículo. Nesse caso a lista NÃO é limpa: ele pode ir buscando uma a uma e
 *   elas juntam-se em baixo.
 */
async function baixarMontagem(soEsta = null, { guardar = false } = {}) {
  prepararSomDaGravacao();
  // Uma exportação de cada vez.
  //
  // Qualquer redesenho da lista (marcar quem morreu, filtrar, Rever) voltava a
  // acender o botão a meio, e um segundo clique corria o `limparFila` por
  // cima da primeira: os links dos clipes já prontos deixavam de abrir, e as
  // duas corridas disputavam a linha de estado e o ZIP. Agora, enquanto uma
  // corre, o botão é o Parar dela e os botões de cada kill ficam apagados.
  if (estado.montagem) return;
  const canais = estado.linhas.map((l) => l.slug);
  const todas = ordenar(estado.momentos);
  // Só as marcadas na caixa, quando há alguma marcada (o teste real de 12/10: com 2 de 8 marcadas,
  // exportava as 8). O botão diz quantas (ver `pintarSelecao`).
  // "Guardar todos agora" leva todas, sem olhar à seleção: é o seguro contra o VOD sumir.
  const escolhidas = soEsta || (!guardar && estado.selecao.size ? todas.filter((m) => estado.selecao.has(m.ms)) : null);
  // A numeração é sempre a da montagem inteira, mesmo a pedir uma só: é este
  // número que vai no nome do ficheiro, e tem de ser o mesmo nos dois caminhos.
  let plano = planoDaMontagem(todas, canais, { filmava })
    .filter((c) => !escolhidas || escolhidas.some((m) => m.ms === c.ms));
  // A guardar, o que some primeiro vai primeiro (ver prazo.js), e só a cópia rápida dos bytes da Kick:
  // sem 9:16, sem chat nem legenda gravados por cima, que levam o tempo do clipe a tocar e podem
  // esperar pelo VOD guardado.
  const prazos = new Map();
  if (guardar) {
    // Os ângulos de outro jogo (ver `foraDoJogo`) não se guardam: não são do evento.
    plano = plano.filter((c) => !foraDoJogo(c.canal, c.deMs));
    for (const c of plano) prazos.set(c, prazoDe(c.canal, c.deMs));
    plano = ordemDeGuardar(plano, (c) => prazos.get(c)?.expiraMs)
      .map((c) => ({ ...c, retrato: null, chat: null, legenda: null, guardar: true }));
  }
  // "Um vídeo só": os clipes juntam-se pela ordem num ficheiro (o 16:9 no mp4.js, o 9:16 em
  // juntar-gravados.js), em vez de um ficheiro por clipe e o ZIP.
  const umSo = !soEsta && !guardar && $('formatoMontagem').value.endsWith('-um');
  const para16 = [];
  const para916 = [];
  // O formato para todos de uma vez (o dono, 07/10: "escolher TikTok para todos"). Com 9:16, a POV de
  // cada kill sai também em vertical; sem enquadramento guardado, o do meio (ver `renderizarGravado`).
  if (!guardar && $('formatoMontagem').value.startsWith('ambos')) {
    for (const c of plano) {
      if (c.papel === 'protagonista' && !c.retrato) c.retrato = retratoLembrado(c.canal);
    }
  }
  const controlo = new AbortController();
  estado.montagem = controlo;
  estado.guardando = guardar;
  if (!soEsta) limparFila();
  pintarMomentos();
  $('estadoMontagem').classList.remove('mau');

  const cache = new Map();
  // Os pedaços já baixados, para o mesmo canal não os pedir duas vezes quando
  // duas kills dele se tocam. Só ficam enquanto um clipe que falta os puder
  // usar (ver `largarOQueNaoServe`): guardar tudo até ao fim eram gigas numa
  // noite de quarenta kills, e o separador morria antes de entregar o ZIP.
  const jaTemos = new Map();
  const sitios = new Map();
  const noRelogioDaPlaylist = (c) => {
    const n = estado.nudges[c.canal] || 0;
    return { canal: c.canal, deMs: c.deMs + n, ateMs: c.ateMs + n };
  };
  // A soma de controlo calcula-se agora, com os bytes ja na mao. Guardar os
  // clipes para os reler no fim era pedir meio giga de memoria uma segunda vez.
  const paraZip = [];
  // Os que SAIRAM, e nao os que se tentaram. "36/36 exportados" com a rede
  // em baixo e todos a falhar mandava-o para casa a pensar que tinha tudo.
  let prontos = 0;
  let falhas = 0;
  const mau = (item, clipe, texto) => {
    item.innerHTML = `<b>${clipe.prefixo} ${escapar(clipe.canal)}</b> <span class="nota mau">${escapar(texto)}</span>`;
  };

  for (const [i, clipe] of plano.entries()) {
    if (controlo.signal.aborted) break;
    const linha = estado.linhas.find((l) => l.slug === clipe.canal);
    const nudge = estado.nudges[clipe.canal] || 0;
    const prazo = clipe.guardar ? prazoDe(clipe.canal, clipe.deMs) : null;
    $('estadoMontagem').textContent = `${i + 1}/${plano.length}: ${clipe.prefixo} ${clipe.canal}`
      + (prazo ? `, ${textoDoPrazo(prazo).texto}` : '');

    // O 9:16 deste clipe, numa linha à parte da fila. 'parar' quando a montagem foi parada a meio.
    const tirarRetrato = async (nome) => {
      const item2 = document.createElement('li');
      $('fila').append(item2);
      const rotulo = `${i + 1}/${plano.length}: ${clipe.prefixo} ${clipe.canal}, 9:16`;
      $('estadoMontagem').textContent = rotulo;
      try {
        const gravado2 = await renderizarGravado(linha, clipe, {
          sinal: controlo.signal,
          aoProgresso: ({ emPausa }) => {
            $('estadoMontagem').textContent = emPausa ? t('retrato.emPausa') : rotulo;
          },
        });
        const { blob: b2, tipo: t2, gravadoS } = gravado2;
        const nome2 = `${nome.replace(/\.[a-z0-9]+$/i, '')}-retrato.${extensaoDe(t2)}`;
        const bytes2 = new Uint8Array(await b2.arrayBuffer());
        if (umSo) {
          para916.push({ bytes: bytes2, tipo: t2 });
          item2.remove();
          return null;
        }
        paraZip.push({ nome: nome2, blob: b2, crc: crc32(bytes2), tamanho: bytes2.length });
        const curto = [notaDoRetratoCurto(gravadoS, (clipe.ateMs - clipe.deMs) / 1000), notaDoEngasgo(gravado2)]
          .filter(Boolean).join(', ');
        linhaDeFicheiro(item2, {
          nome: nome2,
          url: guardarFicheiro(b2),
          nota: `${(b2.size / 1048576).toFixed(1)} MB, ${t('fila.retratoDe')} ${clipe.prefixo}`
            + (curto ? `, ${curto}` : ''),
          momentoMs: clipe.ms,
        });
        if (curto) item2.querySelector('.nota')?.classList.add('mau');
      } catch (e) {
        if (e.name === 'AbortError') { item2.remove(); return 'parar'; }
        falhas++;
        item2.innerHTML = `<b>${clipe.prefixo} ${escapar(clipe.canal)}, 9:16</b> `
          + `<span class="nota mau">${t('fila.retratoFalhou', { erro: escapar(motivoDoRetrato(e)) })}</span>`;
      }
      return null;
    };
    const item = document.createElement('li');
    $('fila').append(item);
    try {
      // Com o chat por cima (guardado nesta kill), o 16:9 grava-se em tempo real como o 9:16, com o
      // chat DESTE canal: os pixels mudam, e copiar os bytes da Kick não os muda.
      // Num vídeo só, o 16:9 é o da Kick sem recodificar, e por isso sai sem o chat por cima.
      const extrasDoClipe = [clipe.chat ? t('chatClipe.naFila') : '', legendaDoClipeGuardado(clipe) ? t('legenda.naFila') : '']
        .filter(Boolean).join(', ');
      if (extrasDoClipe && !umSo) {
        const rotulo = `${i + 1}/${plano.length}: ${clipe.prefixo} ${clipe.canal}, ${extrasDoClipe}`;
        $('estadoMontagem').textContent = rotulo;
        let gravado;
        try {
          gravado = await renderizarGravado(linha, clipe, {
            deitado: true,
            sinal: controlo.signal,
            aoProgresso: ({ emPausa }) => {
              $('estadoMontagem').textContent = emPausa ? t('retrato.emPausa') : rotulo;
            },
          });
        } catch (e) {
          if (e.name === 'AbortError' || controlo.signal.aborted) { item.remove(); break; }
          falhas++;
          mau(item, clipe, t('clipe.naoDeu', { erro: motivoDoRetrato(e) }));
          continue;
        }
        const { blob, tipo, gravadoS } = gravado;
        const nome = `${clipe.prefixo}_${nomeDoFicheiro({ canal: clipe.canal, quandoMs: clipe.deMs })
          .replace(/\.[a-z0-9]+$/i, '')}.${extensaoDe(tipo)}`;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        paraZip.push({ nome, blob, crc: crc32(bytes), tamanho: bytes.length });
        prontos++;
        const totalS = (clipe.ateMs - clipe.deMs) / 1000;
        const curto = [gravadoS >= 0 && gravadoS < totalS - 0.5
          ? t('chatClipe.curto', { feito: gravadoS.toFixed(1), total: totalS.toFixed(1) }) : '', notaDoEngasgo(gravado)]
          .filter(Boolean).join(', ');
        linhaDeFicheiro(item, {
          nome,
          url: guardarFicheiro(blob),
          nota: `${(blob.size / 1048576).toFixed(1)} MB, `
            + `${clipe.papel === 'protagonista' ? t('fila.tuaPov') : t('fila.quemMorreu')}, ${extrasDoClipe}`
            + (curto ? `, ${curto}` : ''),
          momentoMs: clipe.ms,
        });
        if (curto) item.querySelector('.nota')?.classList.add('mau');
        if (clipe.retrato && await tirarRetrato(nome) === 'parar') break;
        continue;
      }
      const p = await planearCorte({
        linha, deMs: clipe.deMs + nudge, ateMs: clipe.ateMs + nudge, cache, sinal: controlo.signal,
        saltar: clipe.saltar,
      });
      if (p.estado !== 'ok') {
        mau(item, clipe, porqueNaoSaiu(p));
        falhas++;
        continue;
      }
      const r = await executarCorte(p, { sinal: controlo.signal, jaTemos, guardarClipe: umSo });
      for (const s of p.segmentos) {
        sitios.set(s.url, { canal: clipe.canal, inicio: s.inicio, fim: s.inicio + s.duracaoS * 1000 });
      }
      largarOQueNaoServe(jaTemos, sitios, plano.slice(i + 1).map(noRelogioDaPlaylist));
      if (controlo.signal.aborted) { item.remove(); break; }
      if (r.estado !== 'pronto') {
        item.innerHTML = `<b>${clipe.prefixo} ${escapar(clipe.canal)}</b> `
          + `<span class="nota mau">${t('corte.incompleto', { obtidos: r.obtidos ?? 0, total: r.total ?? 0 })}</span>`;
        falhas++;
        continue;
      }
      const nome = `${clipe.prefixo}_${nomeDoFicheiro({ canal: clipe.canal, quandoMs: clipe.deMs, sufixo: sufixoDe(r.tipo) })}`;
      const resto = oQueFalta(linha, p, clipe.ateMs + nudge, clipe.saltar);
      if (resto) {
        plano.splice(i + 1, 0, {
          ...clipe, deMs: resto.deMs - nudge, saltar: resto.saltar, parte: (clipe.parte || 1) + 1, retrato: null,
        });
      }
      if (umSo) {
        if (!r.clipe) {
          falhas++;
          mau(item, clipe, t('montagem.umSoFora', { erro: r.semMp4 || '?' }));
        } else {
          para16.push(r.clipe);
          prontos++;
          item.remove();
        }
        if (clipe.retrato && await tirarRetrato(nome) === 'parar') break;
        continue;
      }
      const blob = new Blob([r.bytes], { type: r.tipo });
      paraZip.push({ nome, blob, crc: crc32(r.bytes), tamanho: r.bytes.length });
      prontos++;
      // A live caiu e voltou a meio deste clipe: o resto está noutro VOD do
      // mesmo canal, e entra na fila logo a seguir, como um ficheiro com o
      // mesmo número e a hora de onde continua (ver `oQueFalta`). Sem isto o
      // clipe saía cortado na queda, e a kill podia estar do lado de lá.
      const sobra = notaDaSobra(r.plano, { continua: Boolean(resto), parte: clipe.parte, semMp4: r.semMp4 });
      linhaDeFicheiro(item, {
        nome,
        url: guardarFicheiro(blob),
        nota: `${(r.bytes.length / 1048576).toFixed(1)} MB, `
          + `${clipe.papel === 'protagonista' ? t('fila.tuaPov') : t('fila.quemMorreu')}`
          // Só quando falta pedaço ou o clipe se parte em dois: na montagem a
          // folga de cada lado é a de sempre, mas um clipe cortado por uma
          // reconexão tem de se ver aqui e não na linha do tempo do editor.
          + (sobra.falta || sobra.partido ? `, ${sobra.texto}` : ''),
        momentoMs: clipe.ms,
      });
      if (sobra.falta) item.querySelector('.nota')?.classList.add('mau');
      // E o 9:16, quando ele guardou o enquadramento nesta kill. "Faça tudo
      // funcionar perfeitamente, o 9x16 no modo automático" — o vertical sai
      // na mesma volta que o resto, e não um a um à mão.
      if (clipe.retrato && await tirarRetrato(nome) === 'parar') break;
    } catch (e) {
      if (e.name === 'AbortError' || controlo.signal.aborted) { item.remove(); break; }
      falhas++;
      mau(item, clipe, porqueNaoSaiu({ estado: 'erro', erro: e.message }));
    }
  }

  const parada = controlo.signal.aborted;
  jaTemos.clear();
  if (umSo && !parada) juntarNumSo(para16, para916);
  estado.montagem = null;
  estado.guardando = false;
  // Redesenhar devolve o botão e os de cada kill ao normal; a frase do fim vem
  // depois, para não ser tapada pelo resumo da lista.
  pintarMomentos();
  $('estadoMontagem').classList.toggle('mau', Boolean(falhas) && !parada);
  $('estadoMontagem').textContent = parada
    ? t(guardar ? 'prazo.parado' : 'montagem.parada', { feitos: prontos, total: plano.length })
    : t('montagem.pronto', { feitos: prontos, total: plano.length })
      + (falhas ? t('montagem.falharam', { n: falhas }) : '');
  // O ZIP é da montagem inteira. A pedir uma kill só, juntar num ZIP era pôr
  // ali um botão que só levava a última coisa que ele carregou.
  if (!soEsta && !umSo) oferecerZip(paraZip);
}

// Sem o id da página o pacote sai sem link, mas o ângulo já cortado não se perde por causa dele, nem o
// pacote fica preso numa Kick que não responde.
// Só os achados ficam guardados: um que falhou tenta de novo no pacote seguinte.
const vodIdsAchados = new Map();
async function vodIdDoPacote(vod, sinal) {
  if (typeof vod?.uuid !== 'string') return null;
  if (vodIdsAchados.has(vod.uuid)) return vodIdsAchados.get(vod.uuid);
  if (sinal.aborted) throw new DOMException('cancelado', 'AbortError');
  const vigia = new AbortController();
  const largar = () => vigia.abort();
  sinal.addEventListener('abort', largar, { once: true });
  const relogio = setTimeout(largar, 10_000);
  try {
    const id = await idDaPaginaDoVod(vod.uuid, { sinal: vigia.signal });
    if (id) vodIdsAchados.set(vod.uuid, id);
    return id;
  } catch (e) {
    if (sinal.aborted) throw e;
    return null;
  } finally {
    clearTimeout(relogio);
    sinal.removeEventListener('abort', largar);
  }
}

/**
 * O pacote do lance para o editor (IDEIAS.md, item 6): um ZIP com o trecho de cada ângulo que filmava o
 * lance (a cópia rápida, em MP4), um projeto multicâmera .fcpxml com os ângulos alinhados e um texto com
 * nomes, horários e links dos VODs. Cada trecho sai cortado no relógio comum, já com o atraso medido de
 * cada canal (o mesmo corte da montagem); o que sobra de diferença no início de cada ficheiro vai no
 * .fcpxml como o deslocamento do ângulo. As contas e o XML estão em pacote.js.
 *
 * Um ângulo de cada vez, com o Parar e o progresso da montagem. Um ângulo que não sai fica de fora e é
 * dito; os outros vão no pacote.
 */
async function baixarPacote(m) {
  if (estado.montagem) return;
  const canais = estado.linhas.map((l) => l.slug);
  const todas = ordenar(estado.momentos);
  const num = numeroNaMontagem(todas.indexOf(m), todas.length);
  const clipes = planoDaMontagem([m], canais, { filmava });
  const base = clipes.find((c) => c.papel === 'protagonista') || clipes[0];
  if (!base) return;
  const { deMs, ateMs } = base;
  // Quem de quem marcou o lance primeiro: é o ângulo que o projeto abre ligado.
  const linhas = [...estado.linhas]
    .sort((a, b) => (b.slug === m.protagonista) - (a.slug === m.protagonista))
    .filter((l) => filmava(l.slug, deMs, ateMs));
  const controlo = new AbortController();
  estado.montagem = controlo;
  estado.guardando = false;
  pintarMomentos();
  const estadoEl = $('estadoMontagem');
  estadoEl.classList.remove('mau');
  const cache = new Map();
  const angulos = [];
  const ficheiros = [];
  const falhas = [];
  for (const [i, linha] of linhas.entries()) {
    if (controlo.signal.aborted) break;
    const nudge = estado.nudges[linha.slug] || 0;
    estadoEl.textContent = t('pacote.aBaixar', { i: i + 1, n: linhas.length, canal: linha.slug });
    try {
      const p = await planearCorte({ linha, deMs: deMs + nudge, ateMs: ateMs + nudge, cache, sinal: controlo.signal });
      if (p.estado !== 'ok') { falhas.push(`${linha.slug} (${porqueNaoSaiu(p)})`); continue; }
      const r = await executarCorte(p, { sinal: controlo.signal });
      if (controlo.signal.aborted) break;
      if (r.estado !== 'pronto') {
        falhas.push(`${linha.slug} (${t('corte.incompleto', { obtidos: r.obtidos ?? 0, total: r.total ?? 0 })})`);
        continue;
      }
      // Onde o ficheiro começa no relógio da playlist: o pedido, mais o que faltou (sobra negativa) ou
      // menos o que veio a mais (o .ts de recurso começa no pedaço inteiro).
      const inicioPlaylist = r.plano.pedido.deMs - r.plano.sobraInicioS * 1000;
      const duracaoS = Number.isFinite(r.duracaoS) ? r.duracaoS : (r.plano.fimReal - r.plano.inicioReal) / 1000;
      const ficheiro = `${num}_${linha.slug}.${sufixoDe(r.tipo)}`;
      const peca = (linha.pecasCompletas || linha.pecas || []).find((x) => x.playlist
        && inicioPlaylist >= x.playlist.inicio && inicioPlaylist < x.playlist.fim);
      angulos.push({
        canal: linha.slug,
        ficheiro,
        inicioMs: inicioPlaylist - nudge,
        duracaoS,
        largura: p.qualidade?.largura,
        altura: p.qualidade?.altura,
        fps: p.qualidade?.fps,
        atrasoMs: nudge,
        link: linkDoVod(linha.slug, { vodId: await vodIdDoPacote(peca?.vod, controlo.signal) }),
        noVodS: peca ? (inicioPlaylist - peca.playlist.inicio) / 1000 : null,
      });
      ficheiros.push({ nome: ficheiro, blob: new Blob([r.bytes], { type: r.tipo }), crc: crc32(r.bytes), tamanho: r.bytes.length });
    } catch (e) {
      if (e.name === 'AbortError' || controlo.signal.aborted) break;
      falhas.push(`${linha.slug} (${porqueNaoSaiu({ estado: 'erro', erro: e.message })})`);
    }
  }
  const parada = controlo.signal.aborted;
  estado.montagem = null;
  pintarMomentos();
  if (parada) { estadoEl.textContent = t('pacote.parado'); return; }
  if (!angulos.length) {
    estadoEl.classList.add('mau');
    estadoEl.textContent = t('pacote.nada', { falhas: falhas.join(', ') || '?' });
    return;
  }
  const titulo = t('pacote.titulo', { n: num, hora: relogioCurto(m.ms) });
  const texto = (conteudo) => {
    const bytes = new TextEncoder().encode(conteudo);
    return { blob: new Blob([bytes]), crc: crc32(bytes), tamanho: bytes.length };
  };
  ficheiros.push({ nome: `${num}_lance.fcpxml`, ...texto(fcpxmlMulticam({ titulo, angulos })) });
  ficheiros.push({ nome: `${num}_lance.txt`, ...texto(textoDoPacote({ titulo, instanteMs: m.ms, angulos, t })) });
  let zip;
  try {
    zip = criarZip(ficheiros);
  } catch (e) {
    estadoEl.classList.add('mau');
    estadoEl.textContent = t(e.message === 'ZIP-GRANDE-DEMAIS' ? 'fila.zipGrande' : 'fila.zipErro');
    return;
  }
  const item = document.createElement('li');
  $('fila').prepend(item);
  linhaDeFicheiro(item, {
    nome: `lance-${num}-${diaLocal(m.ms)}.zip`,
    url: guardarFicheiro(zip),
    nota: `${(zip.size / 1048576).toFixed(1)} MB, ${tn(angulos.length, 'pacote.umAngulo', 'pacote.angulos')}`,
    momentoMs: m.ms,
  });
  estadoEl.classList.toggle('mau', Boolean(falhas.length));
  estadoEl.textContent = t('pacote.pronto', { n: angulos.length })
    + (falhas.length ? t('pacote.ficaramFora', { lista: falhas.join(', ') }) : '');
}

/**
 * O fim do "Um vídeo só": os clipes de 16:9 num MP4, e os de 9:16 noutro, cada um pela ordem da montagem.
 * Se os 9:16 não se deixarem juntar (gravados em formatos diferentes), saem soltos, a dizer porquê.
 */
function juntarNumSo(para16, para916) {
  const dia = new Date().toISOString().slice(0, 10);
  const pronto = (blob, nome, duracaoS, n) => {
    const item = document.createElement('li');
    $('fila').prepend(item);
    linhaDeFicheiro(item, {
      nome,
      url: guardarFicheiro(blob),
      nota: `${(blob.size / 1048576).toFixed(1)} MB, ${t('montagem.umSoNota', { n, s: duracaoS.toFixed(1) })}`,
    });
  };
  if (para16.length) {
    try {
      const { bytes, duracaoS } = juntarMp4(para16);
      pronto(new Blob([bytes], { type: 'video/mp4' }), `montagem-${dia}.mp4`, duracaoS, para16.length);
    } catch (e) {
      const item = document.createElement('li');
      $('fila').prepend(item);
      item.innerHTML = `<span class="nota mau">${escapar(t('montagem.umSoErro', { erro: e.message }))}</span>`;
    }
  }
  if (para916.length) {
    const tipo = para916[0].tipo;
    try {
      const { partes, duracaoS } = juntarGravados(para916.map((x) => x.bytes));
      pronto(new Blob(partes, { type: tipo }), `montagem-${dia}-retrato.${extensaoDe(tipo)}`, duracaoS, para916.length);
    } catch (e) {
      const item = document.createElement('li');
      $('fila').prepend(item);
      item.innerHTML = `<span class="nota mau">${escapar(t('montagem.umSoErro', { erro: e.message }))}</span>`;
      for (const [k, x] of para916.entries()) {
        const solto = document.createElement('li');
        $('fila').append(solto);
        const blob = new Blob([x.bytes], { type: x.tipo });
        linhaDeFicheiro(solto, { nome: `montagem-${dia}-${k + 1}-retrato.${extensaoDe(x.tipo)}`, url: guardarFicheiro(blob), nota: `${(blob.size / 1048576).toFixed(1)} MB` });
      }
    }
  }
}

/**
 * O porquê de um corte não ter saído, numa frase que diz o que fazer a seguir.
 *
 * Saíam os códigos internos ("janela-invalida", "master-falhou") e, no editor,
 * um "tente de novo, ou encurte o clipe" que não ajudava em nenhum deles.
 */
function porqueNaoSaiu(r) {
  switch (r?.estado) {
    case 'buraco': return t('corte.porqueBuraco');
    case 'fora-da-noite': return t('corte.porqueForaDaNoite');
    case 'sem-segmentos': return t('corte.porqueSemSegmentos');
    case 'janela-invalida': return t('corte.porqueJanela');
    case 'master-falhou': return t('corte.porqueMaster', { http: r.http ?? '?' });
    case 'sem-renditions': return t('corte.porqueSemQualidade');
    case 'playlist-falhou': return t('corte.porquePlaylist', { http: r.http ?? '?' });
    default: return t('corte.porqueRede', { erro: r?.erro || r?.estado || '?' });
  }
}

/** A extensão de um ficheiro pelo tipo: .mp4 do corte exato, .ts do de recurso. */
const sufixoDe = (tipo) => (tipo === 'video/mp4' ? 'mp4' : 'ts');

/**
 * O que o ficheiro tem a mais ou a menos do que se pediu, dito por extenso.
 *
 * Sem recodificar, um corte começa e acaba onde começam e acabam os pedaços
 * de 10 s: até quase 10 s a mais de cada lado. E quando o vídeo do canal
 * acaba a meio do pedido (a live caiu e voltou noutro VOD) o ficheiro sai
 * mais curto. As duas coisas tinham de ser ditas, e só uma era, e só num sítio.
 */
function notaDaSobra(plano, { continua = false, parte = 1, semMp4 = null } = {}) {
  const partes = [];
  // Numa parte que continua outra, o buraco do início é o da própria queda,
  // e não um "o canal ainda não estava no ar".
  const seguinte = parte > 1;
  const faltaInicio = plano.sobraInicioS < -0.05 && !seguinte;
  const corteNoFim = plano.sobraFimS < -0.05;
  if (seguinte) partes.push(t('corte.continuacao'));
  else if (faltaInicio) partes.push(t('corte.faltaInicio', { s: (-plano.sobraInicioS).toFixed(1) }));
  // Desde 12/10 o ficheiro sai em MP4 cortado na marca (ver mp4.js): dizer "começa 0.0s antes" era
  // ruído. Só o .ts de recurso continua a ter sobra, e diz porquê.
  else if (plano.exato) partes.push(t('corte.exato'));
  else {
    if (semMp4) partes.push(t('corte.semMp4', { erro: semMp4 }));
    partes.push(t('corte.comeca', { s: Math.max(0, plano.sobraInicioS).toFixed(1) }));
  }
  if (corteNoFim) {
    partes.push(continua ? t('corte.continua') : t('corte.faltaFim', { s: (-plano.sobraFimS).toFixed(1) }));
  } else if (plano.sobraFimS > 0.05) partes.push(t('corte.acaba', { s: plano.sobraFimS.toFixed(1) }));
  return {
    texto: partes.join(', '),
    falta: faltaInicio || (corteNoFim && !continua),
    partido: seguinte || (corteNoFim && continua),
  };
}

/**
 * O porquê de um 9:16 não ter saído, curto, para caber entre parênteses.
 *
 * Saía o `e.message`, que é uma frase interna em português ("sem gravador",
 * "o vídeo não andou") e aparecia assim mesmo no meio do inglês e do espanhol.
 * Um erro sem nome conhecido é do browser (o `MediaRecorder` a falhar) e
 * já vem na língua dele.
 */
function motivoDoRetrato(e) {
  const chave = {
    'SEM-GRAVADOR': 'retrato.motivoSemGravador',
    'GRAVACAO-PARADA': 'retrato.motivoParou',
    'GRAVACAO-VAZIA': 'retrato.motivoVazio',
    'SEM-IMAGEM': 'retrato.motivoSemImagem',
    'SEM-SOM': 'retrato.motivoSemSom',
  }[e?.name];
  return chave ? t(chave) : (e?.message || String(e));
}

/**
 * O aviso de um 9:16 que saiu mais curto do que o clipe, ou nada.
 *
 * O vídeo do canal pode acabar a meio do clipe (a live caiu e voltou noutro
 * VOD). O gravador entrega o que gravou até ali, e isso tem de ser dito na
 * linha do ficheiro: um vertical de 4 s com cara de pronto era a mesma
 * mentira do 16:9 cortado pela reconexão.
 */
/** Se a gravação perdeu mais de 5% dos frames (o PC não deu conta), a frase que avisa; senão vazio. */
function notaDoEngasgo(r) {
  return r?.engasgou ? t('retrato.engasgou', { perda: String(Math.round(r.perdaPct)) }) : '';
}

function notaDoRetratoCurto(gravadoS, totalS) {
  if (!(gravadoS >= 0) || gravadoS >= totalS - 0.5) return '';
  return t('retrato.curto', { feito: gravadoS.toFixed(1), total: totalS.toFixed(1) });
}

/**
 * Um botão que passa a ser o Parar do trabalho que lançou, e volta.
 *
 * Pelo `data-t` e não só pelo texto: trocar de língua a meio repõe o rótulo
 * pela chave, e o Parar continuava a dizer Exportar.
 */
function trocarRotulo(botao, chave) {
  const alvo = botao.querySelector('span[data-t]') || botao;
  alvo.dataset.t = chave;
  alvo.textContent = t(chave);
}

/**
 * Tirar o 9:16 de um clipe da montagem, num vídeo fora do ecrã.
 *
 * O `gravar` só sabe pintar a partir de um `<video>` a tocar. Na montagem não
 * há prévia aberta, por isso cria-se um vídeo escondido, liga-se-lhe a mesma
 * fonte que a prévia usaria (o degrau de cima da escada, no instante certo),
 * espera-se pela primeira imagem e grava-se. No fim deita-se tudo fora — o
 * leitor HLS, o elemento, os bytes.
 *
 * Os enquadramentos foram guardados em pixels do degrau de cima; é esse o
 * degrau que se usa aqui, e é por isso que os números batem.
 */
/**
 * Um vídeo escondido de um canal, já parado no instante pedido, para gravar a partir dele (o 9:16 da
 * montagem e o clipe de vários ângulos). `fechar` larga o hls e o elemento.
 */
async function abrirVideoEscondido(linha, quandoMs, { sinal, ateMs } = {}) {
  const nudge = estado.nudges[linha.slug] || 0;
  const r = onde(linha, quandoMs, { nudgeMs: nudge });
  if (r.estado !== 'toca') throw new Error(porqueNaoSaiu({ estado: r.estado === 'buraco' ? 'buraco' : 'fora-da-noite' }));
  const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  const alvo = peca.escada[0] || peca.barato;
  const v = document.createElement('video');
  // Sem MSE (um iPhone sem ManagedMediaSource) o vídeo vem directo da CDN,
  // que é outro domínio: sem `crossOrigin` a tela fica "suja" e o gravador
  // não tira dela frame nenhum. A CDN responde com
  // `access-control-allow-origin: *`, por isso 'anonymous' basta.
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;';
  document.body.appendChild(v);
  let hls = null;
  let urlLocal = null;
  let arquivoSom = null;
  let inicioS = r.tempoS;
  const fechar = () => {
    hls?.destroy();
    v.pause();
    v.removeAttribute('src');
    v.remove();
    if (urlLocal) URL.revokeObjectURL(urlLocal);
  };
  try {
    if (!(v.captureStream || v.mozCaptureStream) && Number.isFinite(ateMs)) {
      const plano = await planearCorte({ linha, deMs: quandoMs + nudge, ateMs: ateMs + nudge, sinal });
      if (plano.estado !== 'ok') throw Object.assign(new Error('o trecho não abriu'), { name: 'SEM-IMAGEM' });
      const corte = await executarCorte(plano, { sinal });
      if (corte.estado !== 'pronto' || corte.tipo !== 'video/mp4'
        || corte.plano.sobraInicioS < -0.1 || corte.plano.sobraFimS < -0.1) {
        throw Object.assign(new Error('o vídeo não cobre esse trecho'), { name: 'SEM-IMAGEM' });
      }
      arquivoSom = new Blob([corte.bytes], { type: 'video/mp4' });
      urlLocal = URL.createObjectURL(arquivoSom);
      inicioS = 0;
      v.src = urlLocal;
    } else if (window.Hls?.isSupported()) {
      hls = new window.Hls({ startPosition: r.tempoS, maxBufferLength: 30, backBufferLength: 10 });
      hls.loadSource(alvo.url);
      hls.attachMedia(v);
    } else {
      v.src = alvo.url;
      v.currentTime = r.tempoS;
    }
    let acordando = true;
    v.play().then(() => { if (acordando) v.pause(); }).catch(() => {});
    await new Promise((ok, mal) => {
      // Com nome, e não só com a frase: a frase é portuguesa e interna, e a
      // linha da montagem traduz pelo nome (ver `motivoDoRetrato`).
      const semImagem = (porque) => Object.assign(new Error(porque), { name: 'SEM-IMAGEM' });
      const fim = setTimeout(() => mal(semImagem('sem imagem em 20 s')), 20000);
      v.addEventListener('loadeddata', () => { clearTimeout(fim); ok(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(fim); mal(semImagem('o vídeo não carregou')); }, { once: true });
      sinal?.addEventListener('abort', () => { clearTimeout(fim); mal(new DOMException('cancelado', 'AbortError')); }, { once: true });
    });
    acordando = false;
    v.pause();
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    if (Math.abs(v.currentTime - inicioS) > 0.01) v.currentTime = inicioS;
  } catch (e) {
    fechar();
    throw e;
  }
  return { v, fechar, fps: alvo.fps, arquivoSom };
}

async function renderizarGravado(linha, clipe, { deitado = false, sinal, aoProgresso } = {}) {
  // O chat primeiro, antes de abrir o vídeo: ler à Kick pode demorar, e um vídeo aberto e parado à
  // espera desistia por falta de imagem.
  const chat = clipe.chat?.ligado ? limparChat(clipe.chat) : null;
  const legenda = legendaDoClipeGuardado(clipe);
  if (legenda) await carregarLetraDaLegenda(legenda);
  if (chat) {
    try {
      await prepararChat(clipe.canal, clipe.deMs, clipe.ateMs, { sinal });
    } catch (e) {
      if (e?.name === 'AbortError' || sinal?.aborted) throw e;
      // Sem chat lido, o clipe sai na mesma com o que houver.
    }
  }
  const { v, fechar, fps, arquivoSom } = await abrirVideoEscondido(linha, clipe.deMs, { sinal, ateMs: clipe.ateMs });
  try {
    // Som: de mudo sai uma faixa silenciosa. Volume a zero para não se ouvir
    // a gravação na sala — a mesma conta do `guardarRetrato`.
    v.muted = Boolean(arquivoSom);
    v.volume = 0;
    const formato = await formatoQueFunciona();
    if (!formato) throw Object.assign(new Error('sem gravador'), { name: 'SEM-GRAVADOR' });
    const alvo = deitado ? DEITADO : RETRATO;
    // Sem enquadramento guardado (o 9:16 para todos), a fita mais alta que cabe, ao meio: a mesma com
    // que o editor abre.
    // Com o encaixe que o streamer tem guardado no aparelho, se tiver (ver `retratoLembrado`).
    const fonteV = { largura: v.videoWidth || 1920, altura: v.videoHeight || 1080 };
    const r = clipe.retrato || { modo: 'um' };
    const rects = deitado ? [] : r.rects?.length ? r.rects
      : deFraccoes(r.fraccoes, fonteV, r.modo, r.divisao)
        || enquadramentoInicial(fonteV.largura, fonteV.altura, r.modo, r.divisao, r.modelo);
    const divisao = Number.isFinite(r.divisao) ? r.divisao : DIVISAO_OMISSAO;
    return await gravar(v, {
      arquivoSom,
      rects,
      modo: deitado ? 'inteiro' : r.modo,
      divisao,
      alvo,
      porCima: porCimaDoClipe({
        canal: clipe.canal, deMs: clipe.deMs, ateMs: clipe.ateMs, chat, legenda, alvo,
        formato: deitado ? '16:9' : '9:16', modo: r.modo, divisao,
      }),
      duracaoS: (clipe.ateMs - clipe.deMs) / 1000,
      formato,
      fps,
      exigirSom: true,
      sinal,
      aoProgresso,
    });
  } finally {
    fechar();
  }
}

/**
 * Aprender com uma kill que ele confirmou.
 *
 * "Assisti todos os clipes automaticos e estao todos errados" — e o problema
 * de fundo e que eu estava a adivinhar o que e o som de uma kill. Ele
 * descreveu quatro sons, e tres deles sao amostras do jogo: o mesmo ficheiro
 * tocado outra vez, sempre igual. Entao nao e preciso adivinhar. Ele aponta
 * UMA kill que sabe que foi kill, e a pagina procura essa mesma forma de onda
 * na noite inteira.
 *
 * Nao volta a baixar nada: os recortes ficaram guardados da varredura.
 */
function aprenderCom(ms) {
  if (!estado.estouros.length) return;
  // O estouro mais alto ali ao pe: e esse o som da kill, e nao o instante
  // exacto em que ele carregou no botao.
  const perto = estado.estouros
    .filter((e) => Math.abs(e.ms - ms) < 4000)
    .sort((a, b) => b.altura - a.altura)[0];
  // A varredura correu (o botão só existe com estouros guardados), por isso
  // "corra a detecção primeiro" não era o próximo passo: o que falta é um som
  // alto perto DESTA kill.
  if (!perto) { $('estadoMontagem').textContent = t('auto.semEstouroPerto'); return; }

  estado.exemplo = perto.recorte;
  const iguais = juntarPerto(parecidos(estado.exemplo, estado.estouros));
  if (!iguais.length) { $('estadoMontagem').textContent = t('auto.semSom'); return; }

  // A lista passa a ser esta. Os candidatos velhos eram o palpite; estes sao o
  // som que ele confirmou — deitar fora o palpite e o ponto todo.
  //
  // O palpite, e só ele. Uma kill da busca em que ele já confirmou a vítima,
  // ou já guardou o corte e o 9:16, é trabalho dele e fica. E o que sai pode
  // voltar com o Anular, como num apagar à mão.
  //
  // Os achados são de quem foi OUVIDO, e não de quem está em foco no clique:
  // ele foi espreitar outro ângulo e a lista inteira passava a cortar a POV
  // errada.
  const canal = perto.canal || estado.focos[0] || estado.linhas[0]?.slug;
  const fica = (m) => !m.auto || temMorte(m) || m.ajuste || m.ajustes;
  const fora = estado.momentos.filter((m) => !fica(m));
  estado.momentos = estado.momentos.filter(fica);
  if (fora.length) {
    estado.apagados = fora;
    $('anularApagar').hidden = false;
  }
  const usados = iguais.slice(0, 60);
  for (const g of usados) {
    estado.momentos = acrescentar(
      estado.momentos,
      novoMomento(g.ms, canal, { ...tamanhos(), auto: true, tiros: g.quantos }),
    );
  }
  pintarMomentos();
  guardar();
  // O número dito é o que ficou na lista, e não o que se achou: com mais de
  // sessenta, dizia setenta e mostrava sessenta.
  $('estadoMontagem').textContent = t('auto.aprendi', { n: usados.length });
}

/**
 * Trinta e seis ficheiros num so, com um clique em vez de trinta e seis.
 *
 * O ZIP nao volta a ler nada: os `Blob` sao os mesmos que ja estao na lista, e
 * juntar `Blob` nao copia bytes nenhuns — o browser guarda-os em disco. Por
 * isso isto e quase de graca, mesmo com meio giga de clipes.
 */
function oferecerZip(ficheiros) {
  const caixa = $('zip');
  caixa.innerHTML = '';
  // Com um ficheiro so, o ZIP e um passo a mais para chegar ao mesmo sitio.
  if (ficheiros.length < 2) return;
  let blob;
  try {
    blob = criarZip(ficheiros);
  } catch (e) {
    caixa.innerHTML = `<span class="nota mau">${t(e.message === 'ZIP-GRANDE-DEMAIS'
      ? 'fila.zipGrande' : 'fila.zipErro')}</span>`;
    return;
  }
  const mb = ficheiros.reduce((s, f) => s + f.tamanho, 0) / 1048576;
  const nome = `montagem-${new Date().toISOString().slice(0, 10)}.zip`;
  // O endereco do ZIP entra na conta da memoria como os outros: e ele que
  // segura os bytes enquanto existir.
  const url = guardarFicheiro(blob, { auxiliar: true });
  caixa.innerHTML = `<a class="botaoZip" href="${url}" download="${nome}">`
    + `${t('fila.zip', { n: ficheiros.length })}</a> `
    + `<span class="nota">${mb.toFixed(0)} MB</span>`;
}

// ── marcar e cortar ─────────────────────────────────────────────────────────

/** O máximo de cada margem da lista de corte, o mesmo `max` dos campos. */
const MARGEM_MAX_S = 120;

function pintarMarca() {
  const { de, ate } = estado.marca;
  $('marca').textContent = de == null ? ''
    : ate == null ? t('marca.faltaFim', { de: `${relogioCurto(de)}` })
      : t('marca.feita', { de: `${relogioCurto(de)}`, ate: `${relogioCurto(ate)}`, dur: hhmmss(ate - de) });
  pintarTrecho();
  pintarCorte();
}

/**
 * O trecho entre entrada e saída, desenhado em cima das faixas.
 *
 * Em todo editor de vídeo (Premiere, Resolve, CapCut) e de clipe (Medal,
 * Outplayed) o trecho escolhido aparece sobre a linha do tempo: a pessoa vê o
 * que vai sair sem ler horas. Só com a entrada marcada fica um risco.
 */
function pintarTrecho() {
  const el = $('trechoMarcado');
  if (!el) return;
  const { de, ate } = estado.marca;
  const vista = vistaAgora();
  if (de == null || !vista || !(vista.fim > vista.inicio)) { el.hidden = true; return; }
  const { inicio, fim } = vista;
  const fim2 = ate == null ? de : Math.max(de, ate);
  if (fim2 < inicio || de > fim) { el.hidden = true; return; }
  const f = (ms) => Math.min(1, Math.max(0, (ms - inicio) / (fim - inicio)));
  el.hidden = false;
  el.classList.toggle('semSaida', ate == null);
  el.style.left = `calc(var(--coluna) + (100% - var(--coluna)) * ${f(de)})`;
  el.style.width = `calc((100% - var(--coluna)) * ${f(fim2) - f(de)})`;
}

/**
 * A lista de corte: um ficheiro de cada vez, e cada um com o seu tamanho.
 *
 * Baixar tudo de uma vez era a versão anterior e estava errada — na prática
 * saem dois ângulos, não trinta, e o mesmo momento pede mais arranque num e
 * mais rabo noutro. Um botão por canal, e dois campos de segundos.
 */
function pintarCorte() {
  const { de, ate } = estado.marca;
  const valida = de != null && ate != null && ate > de;
  // Sem marca, a secção INTEIRA desaparece.
  //
  // "Exclui isso, pois não faz nada — isso é somente pra dizer os atalhos."
  // Tinha razão sobre o que ele estava a ver: uma caixa com um título e uma
  // frase a repetir duas teclas que já estão escritas nos Atalhos e nos dois
  // botões de marcar. A secção continua a existir e a fazer o que faz —
  // um botão de baixar por canal, com as margens de cada um — mas só aparece
  // quando há mesmo um pedaço marcado para cortar.
  //
  // (A versão anterior deixava-a sempre à vista para se descobrir que dava
  //  para baixar. A descoberta ficou nos dois botões e na lista de atalhos.)
  $('corte').hidden = !valida;
  $('comoCortar').innerHTML = t('corte.como', { i: '<kbd>I</kbd>', o: '<kbd>O</kbd>' });
  $('comoCortar').hidden = true;
  $('listaCorte').hidden = !valida;
  if (!valida) { $('listaCorte').innerHTML = ''; return; }

  const presentes = estado.linhas.filter((l) => {
    const nudge = estado.nudges[l.slug] || 0;
    return onde(l, de, { nudgeMs: nudge }).estado === 'toca'
      || onde(l, ate, { nudgeMs: nudge }).estado === 'toca';
  });

  $('listaCorte').innerHTML = presentes.map((l) => {
    const m = estado.margens[l.slug] || {};
    return `<li data-slug="${escapar(l.slug)}">`
      + `<b>${escapar(l.slug)}</b>`
      + `<label>${t('corte.antes')} <input class="antes" type="number" value="${m.antesS || 0}" min="0" max="120" step="1">s</label>`
      + `<label>${t('corte.depois')} <input class="depois" type="number" value="${m.depoisS || 0}" min="0" max="120" step="1">s</label>`
      + '<span class="dur"></span>'
      + `<button class="baixarUm">${t(estado.aBaixar.has(l.slug) ? 'montagem.parar' : 'corte.baixar')}</button>`
      + `<span class="estadoCorte nota"></span>`
      + `</li>`;
  }).join('')
    || `<li class="nota">${t('corte.ninguem')}</li>`;

  for (const li of $('listaCorte').querySelectorAll('li[data-slug]')) {
    const slug = li.dataset.slug;
    const ler = () => {
      // O `max="120"` do campo só vale para as setas: escrito à mão, passava
      // tudo. Preso aqui, que é onde o número é lido.
      const margem = (campo) => Math.min(MARGEM_MAX_S, Math.max(0, Number(li.querySelector(campo).value) || 0));
      const antesS = margem('.antes');
      const depoisS = margem('.depois');
      estado.margens[slug] = { antesS, depoisS };
      guardar();
      const durS = (ate - de) / 1000 + antesS + depoisS;
      const dur = li.querySelector('.dur');
      dur.textContent = duracaoCurta(durS);
      // O que o ficheiro vai ter de verdade, dito antes de baixar (o dono, 07/10: 4 s marcados saíram 24 s).
      // Sem reconverter, o corte começa e acaba onde a Kick corta os pedaços dela.
      const previsto = previsaoDoCorte(estado.linhas.find((l) => l.slug === slug),
        de - antesS * 1000, ate + depoisS * 1000);
      if (previsto && (previsto.antesS > 0.5 || previsto.depoisS > 0.5)) {
        dur.textContent += `, ${t('corte.saiCom', {
          dur: duracaoCurta(previsto.durS), antes: Math.round(previsto.antesS), depois: Math.round(previsto.depoisS),
        })}${previsto.mb ? `, ~${previsto.mb} MB` : ''}`;
      }
      // O mesmo tecto do editor. Sem ele, uma marca de três horas (o I às
      // 20:00 esquecido e o O às 23:00) eram mil pedaços de 11 MB pedidos
      // para a memória do separador, e o separador morria.
      const longo = durS > MAXIMO_S;
      dur.classList.toggle('mau', longo);
      const nota = li.querySelector('.estadoCorte');
      if (longo) {
        nota.textContent = t('corte.longoDemais', { dur: duracaoCurta(durS), max: MAXIMO_S });
        nota.classList.add('mau');
        nota.dataset.longo = '1';
      } else if (nota.dataset.longo) {
        nota.textContent = '';
        nota.classList.remove('mau');
        delete nota.dataset.longo;
      }
      if (!estado.aBaixar.has(slug)) li.querySelector('.baixarUm').disabled = longo;
    };
    li.querySelector('.antes').oninput = ler;
    li.querySelector('.depois').oninput = ler;
    li.querySelector('.baixarUm').onclick = () => baixarUm(slug);
    ler();
  }
}

/**
 * O que um corte sem reconverter vai ter mesmo, antes de baixar: a duração, quanto sobra de cada lado e o
 * tamanho. Lê-se das playlists já carregadas (os pedaços têm as mesmas pontas em todas as qualidades).
 */
function previsaoDoCorte(linha, deMs, ateMs) {
  if (!linha) return null;
  const nudge = estado.nudges[linha.slug] || 0;
  const de = deMs + nudge;
  const ate = ateMs + nudge;
  const peca = (linha.pecasCompletas || linha.pecas || []).find((p) => p.playlist?.segmentos
    && de < p.playlist.fim && ate > p.playlist.inicio);
  if (!peca) return null;
  const segs = segmentosNaJanela(peca.playlist, de, ate);
  if (!segs.length) return null;
  const inicio = segs[0].inicio;
  const fim = segs.at(-1).inicio + segs.at(-1).duracaoS * 1000;
  const durS = (fim - inicio) / 1000;
  const bitrate = peca.escada?.[0]?.bitrate || 0;
  return {
    durS,
    antesS: Math.max(0, (de - inicio) / 1000),
    depoisS: Math.max(0, (fim - ate) / 1000),
    mb: bitrate ? Math.max(1, Math.round((bitrate / 8) * durS / 1048576)) : 0,
  };
}

async function baixarUm(slug) {
  const linha = estado.linhas.find((l) => l.slug === slug);
  // A linha procura-se de cada vez, e não se guarda: marcar outra vez o I ou
  // o O redesenha a lista a meio de um corte, e o progresso ia para uma linha
  // que já não está no ecrã.
  const aqui = () => $('listaCorte').querySelector(`li[data-slug="${CSS.escape(slug)}"]`);
  const li = aqui();
  if (!linha || !li) return;
  // O mesmo botão pára o corte que lançou.
  const emCurso = estado.aBaixar.get(slug);
  if (emCurso) { emCurso.abort(); return; }

  const { de, ate } = estado.marca;
  const m = estado.margens[slug] || {};
  if ((ate - de) / 1000 + (m.antesS || 0) + (m.depoisS || 0) > MAXIMO_S) return;

  const nota = () => aqui()?.querySelector('.estadoCorte') || document.createElement('span');
  const botao = () => aqui()?.querySelector('.baixarUm') || document.createElement('button');
  const controlo = new AbortController();
  estado.aBaixar.set(slug, controlo);
  trocarRotulo(botao(), 'montagem.parar');
  nota().classList.remove('mau');

  let r;
  // Tudo o que pode rebentar fica dentro do `try`. Sem ele, uma falha de rede
  // a pedir a lista de qualidades deixava o botão apagado e o aviso de "preparando"
  // no ecrã até alguém redesenhar a lista.
  try {
    [r] = await cortarTodosOsAngulos({
      linhas: [linha],
      deMs: de,
      ateMs: ate,
      sinal: controlo.signal,
      nudges: estado.nudges,
      margens: estado.margens,
      aoProgresso: (p) => {
        nota().textContent = p.fase === 'planear' ? t('montagem.aPreparar')
          : t('montagem.pedacos', { prontos: p.prontos, total: p.total });
      },
    });
  } catch (e) {
    r = { estado: 'erro', erro: e?.message || String(e) };
  } finally {
    estado.aBaixar.delete(slug);
    trocarRotulo(botao(), 'corte.baixar');
    nota().textContent = '';
  }

  if (controlo.signal.aborted) {
    nota().textContent = t('corte.parado');
    return;
  }
  const item = document.createElement('li');
  $('fila').prepend(item);

  if (r?.estado === 'pronto') {
    // A sobra não é um pedido de desculpas — é o número por onde aparar no editor.
    const sobra = notaDaSobra(r.plano, { semMp4: r.semMp4 });
    linhaDeFicheiro(item, {
      nome: r.nome,
      url: guardarFicheiro(new Blob([r.bytes], { type: r.tipo })),
      nota: `${(r.bytes.length / 1048576).toFixed(1)} MB, `
        + `${r.plano.qualidade.altura}p${r.plano.qualidade.fps}, ${sobra.texto}`,
    });
    if (sobra.falta) item.querySelector('.nota')?.classList.add('mau');
  } else if (r?.estado === 'incompleto') {
    nota().classList.add('mau');
    item.innerHTML = `<b>${escapar(slug)}</b> <span class="nota mau">`
      + `${t('corte.incompleto', { obtidos: r.obtidos, total: r.total })}</span>`;
  } else {
    item.innerHTML = `<b>${escapar(slug)}</b> <span class="nota mau">${escapar(porqueNaoSaiu(r))}</span>`;
  }
}

// ── criar clipe ─────────────────────────────────────────────────────────────
//
// "Não achei como se baixa um clipe só, um de cada vez." A montagem é para
// juntar uma noite inteira; isto é para quando se quer UM, agora.

const CONTEXTO_S = 150;   // o que a barra mostra de cada lado do instante

/**
 * Abrir o editor de clipe. Sem argumentos e no instante em que se está; com
 * um momento, NESSE momento e já com o pedaço dele escolhido.
 *
 * "Quando marco a kill não consigo ajeitar os tamanhos depois de marcado —
 *  tipo o botão clip, depois de já ter exportado ou antes, para escolher o
 *  formato que eu quero e como quero."
 *
 * A lista de kills só sabia exportar com as margens fixas lá de cima. Quem
 * quisesse apurar as pontas ou escolher 9:16 tinha de ir à linha do tempo,
 * procurar o instante outra vez à mão e carregar em Clipar. Agora cada kill
 * tem o mesmo editor, aberto no sítio certo — e o pedaço que ele começa a
 * mostrar é o combate que a busca mediu, não uma janela fixa à volta do ponto.
 */
function abrirClipe(momento = null) {
  if (!estado.linhas.length) return;
  // Com um canal só não há vários ângulos para juntar.
  for (const id of ['angulosSeguido', 'angulosEmpilhado']) $(id).hidden = estado.linhas.length < 2;
  const daLista = momento != null && estado.momentos.some((x) => x.ms === momento.ms);
  // Um editor que fecha a meio de uma gravação ou de uma exportação pára-a
  // (ver `fecharClipe`); abrir outro por cima faz o mesmo.
  if (estado.clipe) fecharClipe();
  // No ângulo do último ajuste guardado: os enquadramentos guardados estão em
  // pixels DESSE vídeo, e abri-los noutro punha as caixas no sítio errado.
  const ultimo = momento?.ajuste?.canal;
  const canal = (ultimo && estado.linhas.some((l) => l.slug === ultimo) ? ultimo : null)
    || momento?.protagonista || estado.focos[0] || estado.linhas[0].slug;
  const linha = estado.linhas.find((l) => l.slug === canal) || estado.linhas[0];
  // Cada ângulo tem o seu ajuste (ver `comAjuste`): o deste, e só o deste.
  const aj = momento ? ajusteDe(momento, linha.slug) : null;
  // O encaixe que este streamer tem guardado no aparelho: o modo e o modelo da webcam abrem como ficaram.
  const lembrado = encaixeDe(linha.slug);
  // Não deixar escolher um pedaço que este ângulo não filmou: os limites são
  // os do vídeo dele, e não os da noite.
  const limites = { inicio: linha.inicio, fim: linha.fim };
  // Sem kill e com entrada e saída marcadas (I e O), o editor abre nelas: é aí que se acerta o corte a
  // arrastar e a ver o quadro (o dono, 07/10).
  const m0 = estado.marca;
  const marcada = !momento && m0?.de != null && m0?.ate != null && m0.ate > m0.de ? { deMs: m0.de, ateMs: m0.ate } : null;
  const centro = Math.min(Math.max(momento?.ms ?? (marcada ? (marcada.deMs + marcada.ateMs) / 2 : estado.agoraMs),
    limites.inicio), limites.fim);
  // O ajuste que ele guardou manda; sem ajuste, o MESMO pedaço que a
  // montagem exporta (o combate e as margens por fora); sem kill nenhuma,
  // quinze segundos para cada lado.
  //
  // Abria com o combate cru, ou com ±15 s numa kill marcada à mão, enquanto a
  // montagem e o Rever usavam as margens. Quem abria só para enquadrar o
  // 9:16 e carregava em Salvar ajustes mudava o clipe sem saber: a kill
  // automática perdia os 5 s de entrada, e a manual passava de 7 s para 30.
  const daKill = momento ? clipesDoMomento(momento, [linha.slug], 0) : [];
  const daMontagem = daKill.find((c) => c.canal === linha.slug) || daKill[0] || null;
  const janela = aj
    ? dentroDosLimites({ deMs: aj.deMs, ateMs: aj.ateMs }, limites)
    : daMontagem
      ? dentroDosLimites({ deMs: daMontagem.deMs, ateMs: daMontagem.ateMs }, limites)
      : marcada ? dentroDosLimites(marcada, limites) : null;

  estado.clipe = {
    canal: linha.slug,
    limites,
    vista: {
      inicio: Math.max(limites.inicio, centro - CONTEXTO_S * 1000),
      fim: Math.min(limites.fim, centro + CONTEXTO_S * 1000),
    },
    ...(janela || janelaInicial(centro, { limites })),
    hls: null,
    // O retrato: o modo e os enquadramentos, em pixels do vídeo de origem.
    // Nascem vazios porque só se sabe o tamanho da fonte depois de ela ter
    // metadados — antes disso, qualquer enquadramento seria um palpite.
    modo: aj?.formato || lembrado?.modo || 'um',
    // Onde fica a webcam na tela deste streamer (os quatro modelos do "2 enquadramentos").
    modelo: limparModelo(lembrado?.modelo),
    // Os enquadramentos guardados voltam tal e qual; sem ajuste nascem vazios
    // e o `prepararRetrato` enche-os quando souber o tamanho da fonte.
    rects: (aj?.rects || []).map((r) => ({ ...r })),
    // Quanto do 9:16 fica para o quadro de cima. Só conta no modo de dois.
    divisao: Number.isFinite(aj?.divisao) ? aj.divisao : DIVISAO_OMISSAO,
    // Se ele mexeu no 9:16. O editor do retrato abre sempre, com um
    // enquadramento de partida, e era isso que o "Salvar ajustes" lia: toda a
    // kill ajustada saía também em 9:16, que a montagem grava em tempo real
    // (quinze minutos a mais numa noite de trinta kills). Só conta se ele o
    // escolheu: arrastou, redimensionou, trocou de modo ou mexeu no divisor.
    retratoMexido: Boolean(aj?.formato),
    // O tamanho da fonte em que os enquadramentos estão medidos, para os
    // levar com ele quando a fonte muda de tamanho (outro ângulo).
    rectsFonte: null,
    // De que kill da lista isto veio, se veio de alguma. É o que liga o
    // "Guardar ajustes" à kill certa.
    // So uma kill que esta mesmo na lista. Um clipe colado abre com um
    // momento feito na hora, e o "Guardar ajustes" aparecia para nao guardar
    // em sitio nenhum e dizer que tinha guardado.
    momentoMs: daLista ? momento.ms : null,
    // O chat por cima do vídeo: as escolhas que ficaram no aparelho, e ligado só se esta kill o
    // guardou ligado (cada clipe começa sem chat).
    chat: limparChat({ ...chatLembrado(), ...(aj?.chat || {}), ligado: aj?.chat?.ligado === true }),
    // A legenda da fala: como o chat, ligada só se esta kill a guardou ligada. O texto (já corrigido)
    // volta com ela.
    legenda: limparLegenda({ ...legendaLembrada(), ...(aj?.legenda || {}), ligado: aj?.legenda?.ligado === true }),
    transcricao: aj?.legenda?.ligado ? limparTranscricao(aj.legenda.transcricao) : null,
  };
  // O botão de guardar só existe quando há uma kill onde guardar.
  $('guardarAjustes').hidden = !daLista;
  // O aviso da webcam achada era do clipe anterior.
  avisarWebcam('');
  $('acharWebcam').disabled = false;
  pintarModos();
  pintarChatClipe();
  carregarChatDoClipe();
  pintarLegendaClipe();

  $('canalClipe').innerHTML = estado.linhas
    .map((l) => `<option value="${escapar(l.slug)}"${l.slug === linha.slug ? ' selected' : ''}>${escapar(l.slug)}</option>`)
    .join('');
  // O nome do arquivo parte do que aconteceu quando a kill veio da detecção; o dono pode trocar.
  $('tituloClipe').value = daLista && momento.tipo ? tituloDeDeteccao(momento) : '';
  $('estadoClipe').textContent = '';
  trancarEditor(false);
  $('guardarClipe').disabled = false;
  mostrarDialogo($('modalClipe'));
  // Fechado até o editor do retrato existir. Estava aberto desde o princípio,
  // e como o `guardarRetrato` desistia em silêncio quando não havia
  // enquadramentos, carregar nele não fazia RIGOROSAMENTE NADA — nem uma
  // mensagem. Ele carregou e veio dizer-mo, e tinha toda a razão.
  $('guardarRetrato').disabled = true;
  $('semRetrato').hidden = true;
  // A grelha pára ao abrir o clipe.
  //
  // "Quando aperto em clip, pausa os players principais, ou o player se for
  //  1 só." Não parava: ficavam a andar por trás da janela, e quando ele
  // voltava o instante já não era o que ele tinha escolhido — além de se
  // ouvirem dois sons ao mesmo tempo. Só se retoma se tiver sido isto a
  // parar: quem já a tinha em pausa não quer que ela arranque ao fechar.
  estado.clipe.retomarGrelha = !estado.parado;
  if (estado.clipe.retomarGrelha) alternarPausa();
  pintarClipe();
  preverClipe(estado.clipe.deMs);
  prepararRetrato();
}

// ── o retrato ───────────────────────────────────────────────────────────────

/**
 * Ligar o editor do retrato assim que a fonte tiver tamanho.
 *
 * Antes de `loadedmetadata` o vídeo não tem `videoWidth`, e um enquadramento
 * calculado a partir de zero é uma caixa de zero pixels que não se vê nem se
 * arrasta — o utilizador via um editor vazio e concluía que estava avariado.
 */
/**
 * O tamanho da imagem de origem.
 *
 * O `<video>` é a verdade — mas só depois de ter metadados, e num iPhone isso
 * pode demorar ou não acontecer de todo. Foi o que ele viu: a janela abria, o
 * lado do 9:16 nunca aparecia, e o botão de exportar ficava apagado com um
 * aviso a dizer para esperar. "Onde está a opção onde eu seleciono onde está
 * a minha webcam, onde está a minha tela? Porque esse botão não dá para
 * clicar."
 *
 * Não precisava de esperar por byte nenhum. O manifesto HLS já traz
 * `RESOLUTION=` de cada qualidade, e é exactamente o mesmo número que o vídeo
 * vai dar. Por isso o editor abre com o do manifesto e troca para o do vídeo
 * assim que ele chegar: um editor que aparece já vale mais do que um certo que
 * ninguém vê.
 *
 * @returns {{largura: number, altura: number}|null}
 */
function fonteDoClipe() {
  const v = $('previaClipe');
  if (v.videoWidth > 0) return { largura: v.videoWidth, altura: v.videoHeight };
  const c = estado.clipe;
  if (c?.fonteW > 0 && c?.fonteH > 0) return { largura: c.fonteW, altura: c.fonteH };
  return null;
}

function prepararRetrato() {
  const v = $('previaClipe');
  const ligar = () => {
    const c = estado.clipe;
    const fonte = fonteDoClipe();
    if (!c || !fonte) return;
    // Só a primeira vez: um `loadedmetadata` a chegar depois do manifesto não
    // pode atirar fora os enquadramentos que ele já arrastou.
    let procurar = false;
    if (!c.rects.length) {
      const partida = encaixeDePartida(c.canal, c.modo, fonte, c.modelo);
      c.rects = partida.rects;
      c.divisao = partida.divisao;
      c.origem = partida.origem;
      c.rectsFonte = { ...fonte };
      procurar = c.modo === 'dois' && partida.origem === 'modelo';
    }
    acertarRecortes();
    $('ladoRetrato').hidden = false;
    $('recortes').hidden = false;
    $('modelosWebcam').hidden = false;
    pintarModos();
    pintarRecortes();
    pintarDivisor();
    seguirRetrato();
    if (procurar) proporWebcam();
  };
  // O EXPORTAR é outra coisa: reconverte a partir da imagem, e para isso o
  // vídeo tem mesmo de ter frames. O editor abre com o manifesto; o botão só
  // acende quando há imagem.
  const acenderExportar = () => {
    const temImagem = v.readyState >= 2;
    $('guardarRetrato').disabled = !(temImagem && estado.clipe?.rects.length);
    // O aviso é sobre a IMAGEM, e não sobre o editor. Se o editor abrisse a
    // calar o aviso, voltávamos ao botão apagado sem explicação — que foi a
    // queixa dele da vez passada.
    if (temImagem) { $('semRetrato').hidden = true; clearTimeout(estado.esperaRetrato); }
  };
  v.removeEventListener('loadeddata', estado.ouvinteFrames || (() => {}));
  estado.ouvinteFrames = () => { ligar(); acenderExportar(); };
  v.addEventListener('loadeddata', estado.ouvinteFrames);
  // Substituir e não acumular: o modal abre muitas vezes por sessão, e cada
  // abertura deixava mais um ouvinte pendurado no mesmo `<video>`.
  //
  // O que se tira tem de ser o MESMO que se pôs. Guardava-se o `ligar` e
  // pendurava-se uma seta nova, e por isso nada saía: cada abertura deixava
  // mais um ouvinte, e cada um arrancava mais um ciclo de pintura do 9:16.
  v.removeEventListener('loadedmetadata', estado.ouvinteRetrato || (() => {}));
  estado.ouvinteRetrato = () => { ligar(); acenderExportar(); };
  v.addEventListener('loadedmetadata', estado.ouvinteRetrato);
  ligar();
  acenderExportar();

  // E se não carregar, dizer. Um botão apagado sem explicação é a mesma coisa
  // que um botão que não faz nada: a pessoa fica sem saber se se enganou.
  clearTimeout(estado.esperaRetrato);
  estado.esperaRetrato = setTimeout(() => {
    // A guarda é sobre a IMAGEM. Era sobre os enquadramentos, e desde que eles
    // passaram a nascer do manifesto isso queria dizer "cala-te sempre".
    if (!estado.clipe || v.readyState >= 2) return;
    $('semRetrato').textContent = t('retrato.semPrevia');
    $('semRetrato').hidden = false;
    $('semRetrato').onclick = () => {
      const video = $('previaClipe');
      video.load?.();
      preverClipe(estado.clipe?.deMs ?? 0);
    };
  }, 6000);
}

/** As caixas por cima do vídeo, em percentagem — para seguirem a fonte. */
/**
 * As caixas por cima do vídeo, e as linhas de encaixe quando alguma agarra.
 *
 * "Podia colocar as ajudas para deixar centralizado, de baixo para cima, do
 *  lado para o outro." As linhas só existem enquanto o dedo está em baixo: uma
 * ajuda que fica no ecrã depois de servir passa a ser sujidade.
 */
function pintarRecortes(linhas = []) {
  const c = estado.clipe;
  const v = $('previaClipe');
  const alvo = $('recortes');
  const fonte = fonteDoClipe();
  if (!c || !fonte) return;
  const focado = document.activeElement?.closest('#recortes .recorte')?.dataset.i;
  const GUIAS = {
    centroX: 'left:50%;top:0;width:0;height:100%',
    centroY: 'left:0;top:50%;width:100%;height:0',
    esquerda: 'left:0;top:0;width:0;height:100%',
    direita: 'left:100%;top:0;width:0;height:100%',
    cima: 'left:0;top:0;width:100%;height:0',
    baixo: 'left:0;top:100%;width:100%;height:0',
  };
  pintarFaixasRetrato();
  alvo.innerHTML = linhas.map((n) => `<div class="guia" style="${GUIAS[n] || ''}"></div>`).join('')
    + c.rects.map((r, i) => `<div class="recorte" data-i="${i}" tabindex="0" role="button"`
    + ` aria-label="${t('retrato.recorteTeclado', { n: i + 1 })}" style="`
    + `left:${(r.x / fonte.largura) * 100}%;top:${(r.y / fonte.altura) * 100}%;`
    + `width:${(r.largura / fonte.largura) * 100}%;height:${(r.altura / fonte.altura) * 100}%">`
    + (c.rects.length > 1 ? `<b class="ordem">${i === 0 ? '1' : '2'}</b>` : '')
    // Os quatro cantos, e nao so o de baixo a direita.
    //
    // "Esses ponto verde maior para alterar escala tem que estar nos quatro
    //  cantos dos 2." Com um canto so, encolher pela esquerda obrigava a
    // encolher pela direita e depois arrastar a caixa de volta — dois gestos
    // para um. Puxar um canto ancora o canto OPOSTO, que e o que toda a gente
    // espera de um rectangulo.
    + ['no', 'ne', 'so', 'se'].map((k) => `<span class="puxar ${k}" data-canto="${k}"></span>`).join('')
    + '</div>').join('');
  for (const caixa of alvo.querySelectorAll('.recorte')) ligarArrasto(caixa);
  if (focado !== undefined) alvo.querySelector(`.recorte[data-i="${focado}"]`)?.focus({ preventScroll: true });
}

/**
 * Arrastar para mover, e o canto para redimensionar.
 *
 * A proporção fica presa de propósito: o destino é 9:16 (ou 9:8 no modo de
 * dois), e deixar esticar só daria uma imagem espremida com ar de defeito de
 * codificação. Quem quer outro enquadramento move e faz zoom, não deforma.
 */
function ligarArrasto(caixa) {
  const i = Number(caixa.dataset.i);
  const emPixels = (e) => {
    const cx = $('fonteClipe').getBoundingClientRect();
    return { escala: (fonteDoClipe()?.largura || cx.width) / cx.width, x: e.clientX, y: e.clientY };
  };
  const comecar = (e, redimensionar) => {
    e.preventDefault();
    e.stopPropagation();
    // A gravar, o recorte é o que o gravador está a ler, no mesmo objecto.
    if (estado.clipe?.aGravar) return;
    const canto = e.target.dataset?.canto || 'se';
    const p0 = emPixels(e);
    const r0 = { ...estado.clipe.rects[i] };
    const fonte = fonteDoClipe();
    if (!fonte) return;
    const mover = (m) => {
      const c = estado.clipe;
      if (!c || c.aGravar) return;
      c.retratoMexido = true;
      c.origem = 'mao';
      const dx = (m.clientX - p0.x) * p0.escala;
      const dy = (m.clientY - p0.y) * p0.escala;

      if (!redimensionar) {
        // Arrastar: encaixa no meio e nas bordas, e a linha aparece.
        const { rect, linhas } = encaixar({ ...r0, x: r0.x + dx, y: r0.y + dy }, fonte);
        c.rects[i] = limitar(rect, fonte);
        pintarRecortes(linhas);
        return;
      }

      // Redimensionar e ZOOM, e mais nada.
      //
      // "Os da esquerda so dao zoom na direita." E o modelo da Twitch, e o
      // certo: o rectangulo da esquerda escolhe QUE PEDACO da fonte entra na
      // faixa; quanto da altura do 9:16 essa faixa ocupa decide-se no divisor
      // da direita — e quando ele se mexe, os dois rectangulos reformam-se
      // sozinhos.
      //
      // Da volta passada eu tinha ligado isto ao contrario: arrastar o canto
      // da webcam mudava a divisao. Duas coisas ao mesmo tempo num gesto so,
      // e nenhuma delas previsivel.
      //
      // Uma dimensao manda e a outra vem da proporcao da faixa: com as duas a
      // mandar, arrastar na diagonal dava saltos, e uma faixa com proporcao
      // diferente da sua so pode entrar esticada.
      // O canto puxado manda; o oposto fica onde esta. Um `no` que anda 10 px
      // para a direita ENCOLHE a caixa e move-lhe o x — nao a estica.
      const oeste = canto === 'no' || canto === 'so';
      const norte = canto === 'no' || canto === 'ne';
      const w = r0.largura + (oeste ? -dx : dx);
      if (w < 40) return;
      const prop = proporcaoDoQuadro(c.modo, i, c.divisao);
      const h = w / prop;
      c.rects[i] = limitar({
        largura: w,
        altura: h,
        x: oeste ? r0.x + (r0.largura - w) : r0.x,
        y: norte ? r0.y + (r0.altura - h) : r0.y,
      }, fonte);
      pintarRecortes();
    };
    const largar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', largar);
      pintarRecortes();
      if (estado.clipe?.retratoMexido) lembrarEncaixe();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', largar);
  };
  caixa.addEventListener('pointerdown', (e) => comecar(e, false));
  for (const p of caixa.querySelectorAll('.puxar')) {
    p.addEventListener('pointerdown', (e) => comecar(e, true));
  }
  // E pelo teclado, como o divisor: as setas movem (com Shift, mais longe), o
  // + e o - mudam o tamanho à volta do centro. Só com rato ou dedo, quem usa
  // teclado abria o editor do 9:16 e não conseguia pôr a webcam no sítio.
  caixa.addEventListener('keydown', (e) => {
    const c = estado.clipe;
    const fonte = fonteDoClipe();
    const r = c?.rects[i];
    if (!c || !fonte || !r || c.aGravar) return;
    const passo = fonte.largura * (e.shiftKey ? 0.05 : 0.01);
    const mexer = {
      ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo],
    }[e.key];
    const zoom = { '+': 1.05, '=': 1.05, '-': 1 / 1.05 }[e.key];
    if (!mexer && !zoom) return;
    e.preventDefault();
    let novo;
    if (mexer) {
      novo = { ...r, x: r.x + mexer[0], y: r.y + mexer[1] };
    } else {
      const largura = r.largura * zoom;
      if (largura < 40) return;
      const altura = largura * (r.altura / r.largura);
      novo = {
        x: r.x + (r.largura - largura) / 2, y: r.y + (r.altura - altura) / 2, largura, altura,
      };
    }
    c.rects[i] = limitar(novo, fonte);
    c.retratoMexido = true;
    c.origem = 'mao';
    lembrarEncaixe();
    pintarRecortes();
    // O redesenho troca as caixas por novas: o foco tem de voltar a esta.
    $('recortes').querySelector(`.recorte[data-i="${i}"]`)?.focus();
  });
}

/** O 9:16 a sério, pintado enquanto o modal estiver aberto. */
/**
 * O divisor, à altura certa, e só quando há dois quadros para repartir.
 *
 * Mede-se sobre a TELA e não sobre a moldura: a tela é 9:16 e a moldura pode
 * ser mais larga, e a diferença punha o pill fora da linha por onde o vídeo
 * parte mesmo.
 */
/**
 * As faixas do lado direito, pintadas da cor do recorte que lhes corresponde.
 *
 * "Cada quadrado com sua cor e a mesma cor na direita, igual Twitch." Sem
 * isso, com dois enquadramentos, nada dizia QUAL dos dois rectangulos da
 * esquerda ia dar em qual faixa — descobria-se por tentativa.
 *
 * Sao `<div>` por cima do canvas e nao um traco DENTRO dele de proposito: o
 * canvas e o que a gravacao le, e uma moldura desenhada la ficava dentro do
 * video exportado.
 */
function pintarFaixasRetrato() {
  const c = estado.clipe;
  const moldura = $('molduraRetrato');
  for (const v of moldura.querySelectorAll('.faixaRetrato')) v.remove();
  if (!c || !c.rects.length) return;
  const partes = c.modo === 'dois'
    ? [[0, 0, c.divisao], [1, c.divisao, 1 - c.divisao]]
    : [[0, 0, 1]];
  for (const [i, topo, alto] of partes) {
    const d = document.createElement('div');
    d.className = `faixaRetrato q${i}`;
    d.style.cssText = `top:${topo * 100}%;height:${alto * 100}%`;
    moldura.appendChild(d);
  }
}

function pintarDivisor() {
  const c = estado.clipe;
  const botao = $('divisor');
  if (!c || c.modo !== 'dois') { botao.hidden = true; return; }
  const tela = $('telaRetrato');
  const moldura = $('molduraRetrato');
  const r = tela.getBoundingClientRect();
  const m = moldura.getBoundingClientRect();
  botao.hidden = false;
  botao.style.top = `${(r.top - m.top) + r.height * c.divisao}px`;
  botao.style.left = `${r.left - m.left}px`;
  botao.style.width = `${r.width}px`;
  botao.setAttribute('aria-valuenow', String(Math.round(c.divisao * 100)));
}

/**
 * Arrastar o divisor — e o lado esquerdo muda com ele.
 *
 * "Mexer na direita afeta directamente os tamanhos na esquerda." Afecta, e é
 * obrigatório que afecte: dar 70% da altura ao quadro de cima muda a proporção
 * do destino, logo muda a proporção do RECORTE. Se o rectângulo da esquerda
 * ficasse como estava, o editor passaria a mostrar um enquadramento que não é
 * o que sai no ficheiro.
 */
function ligarDivisor() {
  const botao = $('divisor');
  const aplicar = (d) => {
    const c = estado.clipe;
    const v = $('previaClipe');
    if (!c || !fonteDoClipe() || c.aGravar) return;
    c.retratoMexido = true;
    c.divisao = limparDivisao(d);
    c.rects = reformar(c.rects, {
      modo: c.modo,
      divisao: c.divisao,
      fonte: fonteDoClipe(),
    });
    pintarRecortes();
    pintarDivisor();
  };
  botao.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const tela = $('telaRetrato');
    const mover = (m) => {
      const r = tela.getBoundingClientRect();
      aplicar((m.clientY - r.top) / Math.max(1, r.height));
    };
    const largar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', largar);
      lembrarEncaixe();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', largar);
  });
  // Também pelo teclado: um controlo que só existe para o rato deixa de fora
  // quem não usa rato, e isto é um botão, não um enfeite.
  botao.addEventListener('keydown', (e) => {
    const passo = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowUp') { e.preventDefault(); aplicar(estado.clipe.divisao - passo); lembrarEncaixe(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); aplicar(estado.clipe.divisao + passo); lembrarEncaixe(); }
  });
}

function seguirRetrato() {
  // Um ciclo só. O `ligar` chama isto a cada `loadeddata` e `loadedmetadata`
  // (e outra vez a cada troca de ângulo), e cada chamada arrancava mais um:
  // medido, quatro ciclos depois da primeira abertura e onze depois da oitava,
  // cada um a pintar 1080x1920 a cada frame.
  if (estado.ciclo9x16) return;
  const tela = $('telaRetrato');
  const ctx = tela.getContext('2d');
  const passo = () => {
    const c = estado.clipe;
    if (!c || $('modalClipe').hidden) { estado.ciclo9x16 = null; return; }
    if (c.rects.length) desenhar(ctx, $('previaClipe'), c.rects, c.modo, c.divisao);
    // O chat por cima, com a mesma função e o mesmo instante com que entra no ficheiro.
    pintarChatPrevias(ctx);
    pintarCaixasPrevia();
    estado.ciclo9x16 = requestAnimationFrame(passo);
  };
  estado.ciclo9x16 = requestAnimationFrame(passo);
}

/**
 * Levar os enquadramentos para a fonte nova, quando ela muda de tamanho.
 *
 * Os recortes estão em pixels da fonte. Trocar de um streamer a 1080p para um
 * a 720p deixava uma caixa em x=1300 numa imagem de 1280 de largura: desenhada
 * fora da imagem, e no 9:16 exportado uma faixa preta. Escalam-se com a fonte
 * e mantêm a forma, que é a da faixa do 9:16 e não a da imagem.
 */
function acertarRecortes() {
  const c = estado.clipe;
  const f = fonteDoClipe();
  if (!c || !f) return;
  const antes = c.rectsFonte;
  if (antes && c.rects.length && (antes.largura !== f.largura || antes.altura !== f.altura)) {
    const sx = f.largura / antes.largura;
    const sy = f.altura / antes.altura;
    c.rects = c.rects.map((r) => {
      const largura = r.largura * sx;
      return limitar({ x: r.x * sx, y: r.y * sy, largura, altura: largura * (r.altura / r.largura) }, f);
    });
  }
  c.rectsFonte = { largura: f.largura, altura: f.altura };
}

function trocarModo(modo) {
  const c = estado.clipe;
  const fonte = fonteDoClipe();
  if (!c || !fonte || c.aGravar) return;
  c.retratoMexido = true;
  c.modo = modo;
  // O encaixe deste streamer nesse modo, se ele já o acertou; senão o modelo.
  const partida = encaixeDePartida(c.canal, modo, fonte, c.modelo);
  c.rects = partida.rects;
  c.divisao = partida.divisao;
  c.origem = partida.origem;
  c.rectsFonte = { ...fonte };
  lembrarEncaixe();
  pintarModos();
  pintarRecortes();
  pintarDivisor();
  // A webcam achada sozinha, quando o que está é só o modelo (ver `proporWebcam`).
  if (modo === 'dois' && partida.origem === 'modelo') proporWebcam();
}

/**
 * Um dos quatro modelos de onde fica a webcam. Põe o recorte 1 nesse canto e o 2 ao meio, já em dois
 * enquadramentos, e o modelo fica guardado com o streamer. Escolher um modelo é recomeçar dele: o que se
 * tinha ajustado à mão para o canto antigo não serve no novo.
 */
function escolherModelo(modelo) {
  const c = estado.clipe;
  const fonte = fonteDoClipe();
  if (!c || !fonte || c.aGravar) return;
  c.modelo = limparModelo(modelo);
  c.modo = 'dois';
  voltarAoModelo();
}

/** "Voltar ao modelo": desfaz os ajustes do modo em que se está e volta ao enquadramento de partida. */
function voltarAoModelo() {
  const c = estado.clipe;
  const fonte = fonteDoClipe();
  if (!c || !fonte || c.aGravar) return;
  c.retratoMexido = true;
  c.divisao = DIVISAO_OMISSAO;
  c.rects = enquadramentoInicial(fonte.largura, fonte.altura, c.modo, c.divisao, c.modelo);
  c.origem = 'modelo';
  c.rectsFonte = { ...fonte };
  // Uma procura a meio não pode vir pôr a caixa achada por cima do modelo que ele acabou de pedir.
  c.rostoBusca?.abort();
  avisarWebcam('');
  lembrarEncaixe();
  pintarModos();
  pintarRecortes();
  pintarDivisor();
}

/** Os botões do modo e dos modelos, com o que está escolhido carregado. */
function pintarModos() {
  const c = estado.clipe;
  if (!c) return;
  for (const b of document.querySelectorAll('.modoRetrato')) {
    b.setAttribute('aria-pressed', String(b.dataset.modo === c.modo));
  }
  // O modelo só está "carregado" em dois enquadramentos: num só, a webcam não tem faixa. Com a caixa
  // posta no rosto achado também não: o teste real de 12/10 achou a webcam em cima à direita e o botão
  // de "embaixo à esquerda" continuava carregado.
  for (const b of document.querySelectorAll('.modeloWebcam')) {
    b.setAttribute('aria-pressed', String(c.modo === 'dois' && c.origem !== 'rosto' && b.dataset.modelo === c.modelo));
  }
}

// ── a webcam achada sozinha ─────────────────────────────────────────────────
//
// IDEIAS.md, ideia 3: no "2 enquadramentos", olhar uns cinco quadros do vídeo deste canal, achar o rosto
// do streamer e pôr a caixa 1 à volta dele. Só sobre o modelo (o canto, sem ajuste): o que ele acertou à
// mão nunca é trocado, e o botão "Achar webcam" pede uma procura nova quando ele quiser. O rosto achado
// fica guardado por streamer no aparelho (rosto.js), e da próxima vez a caixa vem sem procurar nada.

/** O detector, um por página: o Worker carrega o modelo uma vez e serve todos os canais. */
function detectorDeRosto() {
  if (estado.detectorRosto) return estado.detectorRosto;
  const falso = window.__povixRosto?.();
  estado.detectorRosto = falso || abrirDetector({
    aoBaixar: ({ feito, total }) => {
      if (estado.clipe?.rostoBusca) {
        avisarWebcam(t('retrato.rostoBaixar', { pct: Math.min(100, Math.round((100 * feito) / Math.max(1, total))) }));
      }
    },
  });
  return estado.detectorRosto;
}

/** A linha de aviso por baixo dos modelos. Vazia, some. */
function avisarWebcam(texto) {
  const el = $('webcamAchada');
  el.textContent = texto;
  el.hidden = !texto;
}

/** O aviso de achada: diz se a caixa pegou a câmera inteira ou só o rosto. */
const avisoAchada = (rosto, canal) => t(rosto.webcam ? 'retrato.webcamAchada' : 'retrato.rostoAchado', { canal });

/** Pôr a caixa 1 à volta de um rosto (em fracções da fonte). */
function aplicarRosto(c, rosto) {
  const fonte = fonteDoClipe();
  // Com as bordas da webcam achadas, a caixa é ela inteira e a faixa de cima ganha a proporção dela;
  // sem elas, a caixa à volta do rosto, como antes.
  const w = rosto.webcam;
  const cam = w ? limitar({
    x: (w.x - w.largura * 0.015) * fonte.largura,
    y: (w.y - w.altura * 0.015) * fonte.altura,
    largura: w.largura * 1.03 * fonte.largura, altura: w.altura * 1.03 * fonte.altura,
  }, fonte) : null;
  const divisao = cam ? divisaoDoQuadro(cam, 0) : null;
  if (cam && divisao != null) {
    c.divisao = divisao;
    c.rects = reformar([cam, c.rects[1]], { modo: 'dois', divisao, fonte });
    pintarDivisor();
  } else {
    const caixa = caixaDaWebcam(rosto, fonte, c.divisao);
    if (!caixa) return false;
    c.rects[0] = caixa;
  }
  c.rectsFonte = { ...fonte };
  c.origem = 'rosto';
  lembrarEncaixe();
  pintarModos();
  pintarRecortes();
  return true;
}

/**
 * Procurar a webcam do canal aberto e propor a caixa. `forcar`: o botão, que procura de novo mesmo com
 * o rosto guardado e mesmo sobre um ajuste à mão (foi ele que pediu).
 */
async function proporWebcam({ forcar = false } = {}) {
  const c = estado.clipe;
  const fonte = fonteDoClipe();
  if (!c || !fonte || c.modo !== 'dois' || c.aGravar) return;
  const canal = c.canal;
  estado.rostos = estado.rostos || new Map();
  // Já procurado (nesta sessão ou noutra): sem ler quadro nenhum.
  if (!forcar) {
    const memo = estado.rostos.has(canal) ? estado.rostos.get(canal) : rostoGuardado(canal);
    if (memo) { if (aplicarRosto(c, memo)) avisarWebcam(avisoAchada(memo, canal)); return; }
    if (estado.rostos.has(canal)) { avisarWebcam(t('retrato.rostoNada', { canal })); return; }
  }
  c.rostoBusca?.abort();
  const controlo = new AbortController();
  c.rostoBusca = controlo;
  // A caixa como estava ao começar: se ele mexer nela durante a procura, a dele ganha.
  const antes = JSON.stringify(c.rects[0]);
  const linha = estado.linhas.find((l) => l.slug === canal);
  avisarWebcam(t('retrato.rostoProcurando', { canal }));
  $('acharWebcam').disabled = true;
  const quadros = window.__povixQuadrosRosto?.() || abrirQuadrosEscondidos();
  // Cancelado (fechou, trocou de canal, foi gravar): o vídeo escondido sai já, e não no fim do salto.
  controlo.signal.addEventListener('abort', () => quadros.fechar?.(), { once: true });
  try {
    const quadro = async (ms) => {
      const r = onde(linha, ms, { nudgeMs: estado.nudges[canal] || 0 });
      if (r.estado !== 'toca') return null;
      const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
      const degrau = degrauDoRosto(peca.escada) || peca.barato;
      return quadros.quadro({ url: degrau?.url, tempoS: r.tempoS, ms, canal });
    };
    const { rosto, lidos } = await procurarRosto({
      instantes: instantesDoClipe(c.deMs, c.ateMs), quadro, detector: detectorDeRosto(), sinal: controlo.signal,
    });
    if (controlo.signal.aborted) return;
    if (!lidos) { avisarWebcam(t('retrato.rostoSemQuadros')); return; }
    estado.rostos.set(canal, rosto);
    if (rosto) guardarRosto(canal, rosto);
    // O editor mudou entretanto (outro canal, outro modo, ou ele mexeu): o achado fica guardado, e não se impõe.
    if (estado.clipe !== c || c.canal !== canal || c.modo !== 'dois' || c.aGravar) return;
    if (!rosto) { avisarWebcam(t('retrato.rostoNada', { canal })); return; }
    if (JSON.stringify(c.rects[0]) !== antes) { avisarWebcam(''); return; }
    avisarWebcam(aplicarRosto(c, rosto) ? avisoAchada(rosto, canal) : t('retrato.rostoNada', { canal }));
  } catch (e) {
    if (e?.name === 'AbortError' || controlo.signal.aborted) return;
    if (estado.clipe === c && c.canal === canal) avisarWebcam(t('retrato.rostoErro'));
    // Um detector que não abriu (sem rede, um arquivo que não bateu) tenta de novo na próxima vez.
    if (!window.__povixRosto) { estado.detectorRosto?.fechar?.(); estado.detectorRosto = null; }
  } finally {
    quadros.fechar?.();
    if (c.rostoBusca === controlo) c.rostoBusca = null;
    if (!estado.clipe?.rostoBusca) $('acharWebcam').disabled = false;
  }
}

/** O botão: procurar de novo, já em dois enquadramentos. */
function acharWebcam() {
  const c = estado.clipe;
  if (!c || !fonteDoClipe() || c.aGravar) return;
  if (c.modo !== 'dois') {
    c.retratoMexido = true;
    c.modo = 'dois';
    const partida = encaixeDePartida(c.canal, 'dois', fonteDoClipe(), c.modelo);
    c.rects = partida.rects;
    c.divisao = partida.divisao;
    c.origem = partida.origem;
    c.rectsFonte = { ...fonteDoClipe() };
    lembrarEncaixe();
    pintarModos();
    pintarRecortes();
    pintarDivisor();
  }
  proporWebcam({ forcar: true });
}

// ── o encaixe de cada streamer, guardado no aparelho ────────────────────────
//
// O dono (10/10): a webcam de cada streamer está sempre no mesmo sítio, e acertar o 9:16 a cada clipe
// era fazer o mesmo trabalho outra vez. Fica no aparelho, por streamer, em fracções da fonte (servem a
// qualquer qualidade do vídeo): o modo, o modelo da webcam e, para cada modo, os recortes e a divisão.
// 13/10: chave nova porque a faixa da webcam passou a nascer em 16:9; os encaixes velhos (faixa de 0,35)
// abriam a webcam com o quadro inteiro.
const CHAVE_ENCAIXES = 'replay.encaixes.169';

function lerEncaixes() {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE_ENCAIXES) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

/** O encaixe guardado de um streamer, ou `null`. */
function encaixeDe(slug) {
  const e = lerEncaixes()[slug];
  if (!e || typeof e !== 'object') return null;
  return { ...e, modo: e.modo === 'dois' || e.modo === 'um' ? e.modo : null };
}

/** Guardar o encaixe do editor aberto como o deste streamer. */
function lembrarEncaixe() {
  const c = estado.clipe;
  const fonte = c?.rectsFonte || fonteDoClipe();
  const fraccoes = c ? paraFraccoes(c.rects, fonte) : null;
  if (!fraccoes) return;
  const todos = lerEncaixes();
  const antes = todos[c.canal] && typeof todos[c.canal] === 'object' ? todos[c.canal] : {};
  todos[c.canal] = {
    ...antes,
    modo: c.modo,
    modelo: c.modelo,
    // De onde veio o encaixe: 'modelo' (o canto, sem ajuste), 'rosto' (achado sozinho) ou 'mao'. Só
    // sobre um modelo é que se procura a webcam ao abrir; o que ele acertou à mão nunca é trocado.
    [c.modo]: { rects: fraccoes, divisao: c.modo === 'dois' ? c.divisao : DIVISAO_OMISSAO, origem: c.origem || 'mao' },
  };
  try { localStorage.setItem(CHAVE_ENCAIXES, JSON.stringify(todos)); } catch { /* janela privada */ }
}

/**
 * Com que recortes um streamer começa num modo: os que ele guardou, ou o modelo do canto da webcam.
 * @returns {{rects: object[], divisao: number, origem: string}}
 */
function encaixeDePartida(slug, modo, fonte, modelo = MODELO_OMISSAO) {
  const guardado = encaixeDe(slug)?.[modo];
  const divisao = modo === 'dois' ? limparDivisao(guardado?.divisao) : DIVISAO_OMISSAO;
  const rects = guardado ? deFraccoes(guardado.rects, fonte, modo, divisao) : null;
  // Um encaixe de antes desta marca não diz de onde veio: conta como acertado à mão, que é o seguro.
  if (rects) return { rects, divisao, origem: ['modelo', 'rosto', 'mao'].includes(guardado.origem) ? guardado.origem : 'mao' };
  return {
    rects: enquadramentoInicial(fonte.largura, fonte.altura, modo, DIVISAO_OMISSAO, modelo),
    divisao: DIVISAO_OMISSAO,
    origem: 'modelo',
  };
}

/** O 9:16 de um streamer para a montagem "9:16 para todos": o que ele guardou, ou o do meio. */
function retratoLembrado(slug) {
  const e = encaixeDe(slug);
  const modo = e?.modo || 'um';
  const guardado = e?.[modo];
  return {
    modo,
    rects: [],
    divisao: modo === 'dois' ? limparDivisao(guardado?.divisao) : DIVISAO_OMISSAO,
    modelo: limparModelo(e?.modelo),
    fraccoes: Array.isArray(guardado?.rects) ? guardado.rects : null,
  };
}

/**
 * Gravar o retrato e entregar o ficheiro.
 *
 * Em tempo real, e dito antes de começar: um clipe de sete segundos são sete
 * segundos de espera. É o preço de mudar os pixels de sítio, e o botão do lado
 * continua a copiar os bytes sem reconverter nada.
 */
// `simples`: o modo simples (simples.js) pede o arquivo sem a janela à vista. Dá o nome do arquivo
// (`nome(extensao)`), quer saber do andamento (`aoProgresso`) e recebe o arquivo pronto (`aoPronto`).
async function guardarRetrato({ deitado = false, simples = null } = {}) {
  prepararSomDaGravacao();
  const c = estado.clipe;
  const v = $('previaClipe');
  const mudoAntes = v.muted;
  const volumeAntes = v.volume;
  const devolverSom = () => { v.muted = mudoAntes; v.volume = volumeAntes; };
  // O 16:9 com o chat por cima grava-se como o 9:16 (o chat tem de entrar nos pixels), pelo botão do
  // 16:9. Sem chat, o 16:9 continua a copiar os bytes (`guardarClipe`).
  const botao = $(deitado ? 'guardarClipe' : 'guardarRetrato');
  // O que acontece depois de um `await` só vale se este editor ainda for o
  // que está aberto. Fechar e abrir outra kill a meio punha as mensagens (e o
  // botão aceso) no editor da outra.
  const aindaEste = () => estado.clipe === c;
  if (!c || (!deitado && !c.rects.length)) {
    // Nunca em silêncio. Era assim que estava, e "o botão nem fez nada quando
    // apertava" é exactamente o que se sente do outro lado.
    $('estadoClipe').textContent = t('retrato.semPrevia');
    return;
  }
  if (c.aGravar || (deitado && c.pararExportar)) return;
  // O início do clipe tem de estar no ar. Num buraco a prévia nem salta (ver
  // `preverClipe`), e o vídeo ficava onde estava: o 9:16 gravava a duração
  // do clipe a partir do último sítio espreitado, e dizia que estava pronto.
  const linha = estado.linhas.find((l) => l.slug === c.canal);
  if (onde(linha, c.deMs, { nudgeMs: estado.nudges[c.canal] || 0 }).estado !== 'toca') {
    $('estadoClipe').textContent = t('retrato.foraDoAr', { canal: c.canal });
    return;
  }
  // A legenda também: as escolhas e o texto corrigido deste instante.
  const legendaAqui = legendaParaDesenhar(c);
  if (c.legenda?.ligado && !legendaAqui) {
    // Ligada sem texto que sirva para este pedaço: dizer, em vez de sair um clipe sem legenda.
    $('estadoClipe').textContent = motivoSemLegenda(c);
    return;
  }
  botao.disabled = true;
  const controlo = new AbortController();
  c.pararGravacao = () => controlo.abort();
  // O chat entra com as escolhas deste instante: mexer nelas a meio não muda o ficheiro.
  const chatAqui = c.chat?.ligado ? limparChat(c.chat) : null;
  let videoLocal = null;

  try {
    c.aGravar = true;
    c.rostoBusca?.abort();
    trancarEditor(true);
    const formato = await formatoQueFunciona();
    if (!aindaEste()) return;
    if (!formato) {
      $('estadoClipe').textContent = t('retrato.semGravador');
      botao.disabled = false;
      return;
    }
    if (chatAqui) {
      $('estadoClipe').textContent = t('montagem.aPreparar');
      await carregarChatDoClipe();
      await prepararChat(c.canal, c.deMs, c.ateMs, { sinal: controlo.signal });
      if (!aindaEste() || controlo.signal.aborted) return;
    }
    if (legendaAqui) await carregarLetraDaLegenda(legendaAqui);
    const extras = t(chatAqui && legendaAqui ? 'porCima.ambos' : legendaAqui ? 'porCima.legenda' : 'porCima.chat');
    const duracaoS = (c.ateMs - c.deMs) / 1000;
    // Do princípio do clipe, e não de onde a pré-visualização parou.
    await preverClipe(c.deMs);
    if (!aindaEste()) return;
    // E o editor fica quieto. O ▶, as pegas, os ±0,5 s e a troca de ângulo
    // mexem todos no MESMO `<video>` que está a ser gravado: um "fim +0,5 s"
    // a meio saltava o vídeo para o fim e o 9:16 saía com três segundos, e o
    // ▶ gravava o início duas vezes. O Exportar 16:9 fechava o editor por
    // baixo da gravação. Fechar (Esc, ✕, Cancelar) pára a gravação.
    trancarEditor(true);
    // E sem som não vale nada: um `captureStream` de um vídeo em mudo dá uma
    // faixa de áudio SILENCIOSA. O volume fica a zero para não se ouvir a
    // gravação na sala, mas a faixa passa a ter sinal.
    v.muted = !(v.captureStream || v.mozCaptureStream);
    v.volume = 0;
    const alvo = deitado ? DEITADO : RETRATO;
    if (!(v.captureStream || v.mozCaptureStream)) {
      videoLocal = await abrirVideoEscondido(linha, c.deMs, { sinal: controlo.signal, ateMs: c.ateMs });
      if (!aindaEste() || controlo.signal.aborted) return;
    }
    const gravacao = await gravar(videoLocal?.v || v, {
      arquivoSom: videoLocal?.arquivoSom,
      fps: c.fonteFps,
      // Uma cópia: o gravador lê os recortes a cada frame, e um arrasto que
      // escapasse à tranca mexia no ficheiro a meio.
      rects: c.rects.map((r) => ({ ...r })),
      modo: deitado ? 'inteiro' : c.modo,
      divisao: c.divisao,
      alvo,
      porCima: porCimaDoClipe({
        canal: c.canal, deMs: c.deMs, ateMs: c.ateMs, chat: chatAqui, legenda: legendaAqui, alvo,
        formato: deitado ? '16:9' : '9:16', modo: c.modo, divisao: c.divisao,
        // A prévia segue o instante que está a ser gravado, e não a agulha parada.
        aoInstante: (ms) => { c.chatAgoraMs = ms; },
      }),
      duracaoS,
      formato,
      exigirSom: true,
      sinal: controlo.signal,
      aoProgresso: ({ feito, total, emPausa }) => {
        if (!aindaEste()) return;
        pintarAvisoGravando(feito);
        simples?.aoProgresso?.({ feito, total });
        $('estadoClipe').textContent = emPausa ? t('retrato.emPausa')
          : deitado ? t('porCima.aGravar', { extras, feito: feito.toFixed(1), total: total.toFixed(1) })
            : t('retrato.aGravar', { feito: feito.toFixed(1), total: total.toFixed(1) });
      },
    });
    const { blob, tipo, gravadoS } = gravacao;
    const base = nomeDoClipe({ titulo: $('tituloClipe').value, canal: c.canal, quandoMs: c.deMs });
    const nome = simples?.nome ? simples.nome(extensaoDe(tipo))
      : `${base.replace(/\.[a-z0-9]+$/i, '')}${deitado ? '' : '-retrato'}.${extensaoDe(tipo)}`;
    const url = guardarFicheiro(blob);
    const item = document.createElement('li');
    $('fila').prepend(item);
    const curtoSo = deitado
      ? (gravadoS >= 0 && gravadoS < duracaoS - 0.5
        ? t('chatClipe.curto', { feito: gravadoS.toFixed(1), total: duracaoS.toFixed(1) }) : '')
      : notaDoRetratoCurto(gravadoS, duracaoS);
    // O aviso do engasgo entra junto: o PC não deu conta de todos os frames e o clipe pode ficar com falhas.
    const curto = [curtoSo, notaDoEngasgo(gravacao)].filter(Boolean).join(' ');
    linhaDeFicheiro(item, {
      nome, url,
      nota: `${(blob.size / 1048576).toFixed(1)} MB, ${alvo.largura}x${alvo.altura}`
        + (chatAqui ? `, ${t('chatClipe.naFila')}` : '')
        + (legendaAqui ? `, ${t('legenda.naFila')}` : '')
        + (curto ? `, ${curto}` : ''),
    });
    if (curto) item.querySelector('.nota')?.classList.add('mau');
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    simples?.aoPronto?.({ blob, nome, curto });
    if (aindaEste()) {
      $('estadoClipe').textContent = curto || (deitado ? t('porCima.pronto', { extras }) : t('retrato.pronto'));
    }
  } catch (e) {
    // Parada por quem fechou o editor: não há a quem dizer nada.
    if (e.name === 'AbortError' || !aindaEste()) return;
    $('estadoClipe').textContent = e.name === 'SEM-GRAVADOR' ? t('retrato.semGravador')
      : e.name === 'GRAVACAO-PARADA' ? t('retrato.parou')
        : e.name === 'GRAVACAO-VAZIA' ? t('retrato.vazio')
          : t('clipe.naoDeu', { erro: motivoDoRetrato(e) });
  } finally {
    // A marca sai mesmo que a gravação rebente: senão o `acordarPrevia` fica
    // calado para sempre e a prévia nunca mais carrega uma imagem. E é a
    // deste clipe, e não a de outro que entretanto se tenha aberto.
    c.aGravar = false;
    c.pararGravacao = null;
    c.chatAgoraMs = null;
    if (aindaEste()) devolverSom();
    videoLocal?.fechar();
    if (aindaEste()) {
      trancarEditor(false);
      botao.disabled = false;
    }
  }
}

// ── o chat no vídeo ─────────────────────────────────────────────────────────
//
// O dono, 12/10: o chat do streamer por cima do clipe baixado, com posição, tamanho e quantas linhas.
// As contas e o desenho vivem em chat-clipe.js; aqui é a ligação à janela do clipe, à leitura do chat
// (a mesma do evento, `lerChatTrecho`, que não lê duas vezes o que já leu) e à gravação.

const GUARDADO_CHAT = 'povix.chatClipe';

/** As escolhas do chat que ficam no aparelho. O ligar não fica: cada clipe começa sem chat. */
function chatLembrado() {
  try {
    return limparChat({ ...JSON.parse(localStorage.getItem(GUARDADO_CHAT) || 'null'), ligado: false });
  } catch { return limparChat(null); }
}

function lembrarChat(chat) {
  try {
    const { posicao, tamanho, linhas, fundo, vida, cor, caixas } = limparChat(chat);
    localStorage.setItem(GUARDADO_CHAT, JSON.stringify({ posicao, tamanho, linhas, fundo, vida, cor, caixas }));
  } catch { /* janela privada */ }
}

const mensagensDoCanal = (canal) => mensagensDoEvento().get(canal) || [];
const carregarLetraDoChat = () => Promise.all(['500', '600']
  .map((peso) => document.fonts?.load?.(`${peso} 34px ${LETRA_CHAT}`))).catch(() => {});

/**
 * Tudo o que o chat de um clipe precisa antes de gravar: as mensagens (lidas à Kick, se faltarem), as
 * imagens dos emotes e a letra. Sem a letra carregada a primeira frase saía noutra letra.
 */
async function prepararChat(canal, deMs, ateMs, { sinal, aoProgredir } = {}) {
  let r = null;
  if (chatDoEvento) {
    r = await chatDoEvento.lerChatTrecho(canal, deMs - VIDA_CHAT_MS, ateMs, { sinal, aoProgredir });
  }
  const lista = mensagensDoClipe(mensagensDoCanal(canal), deMs, ateMs);
  await Promise.all([prepararEmotes(lista), carregarLetraDoChat()]);
  return { r, lista };
}

/**
 * O pincel do que vai por cima do vídeo, para `gravar` e para as prévias: o chat e a legenda, cada um
 * só se vier. As mensagens do clipe tiram-se uma vez, e a cada frame desenha-se o instante da noite em
 * que o vídeo está (o início do clipe mais o que já se gravou). A legenda vem por cima do chat e foge
 * dele (ver `geometriaLegenda`). `legenda` é `{ ...escolhas, transcricao }`, ou null.
 */
function porCimaDoClipe({ canal, deMs, ateMs, chat, legenda, alvo, formato, modo, divisao, aoInstante, mensagens }) {
  if (!chat && !legenda) return null;
  // A prévia passa a lista toda do canal (procura-se por busca binária); a gravação, só as do clipe.
  const lista = chat ? mensagens || mensagensDoClipe(mensagensDoCanal(canal), deMs, ateMs) : null;
  const geoChat = chat ? geometriaDoChat(alvo, chat, { formato, modo, divisao }) : null;
  const geoLegenda = legenda ? geometriaLegenda(alvo, legenda, { formato, modo, divisao, chat }) : null;
  return (ctx, feitoS) => {
    const ms = deMs + feitoS * 1000;
    aoInstante?.(ms);
    if (chat) desenharChat(ctx, lista, ms, chat, geoChat);
    if (legenda) desenharLegenda(ctx, legenda.transcricao, ms, legenda, geoLegenda, { nome: canal });
  };
}

/** O instante da noite que a prévia mostra: o da gravação, se há uma; senão o da agulha. */
function instanteDoChat(c) {
  if (c.aGravar && Number.isFinite(c.chatAgoraMs)) return c.chatAgoraMs;
  return Number.isFinite(c.cabecaMs) ? c.cabecaMs : c.deMs;
}

/** O chat e a legenda por cima das duas prévias, a cada frame do ciclo do 9:16. */
let chatFontePintada = false;
function pintarChatPrevias(ctx9x16) {
  const c = estado.clipe;
  const chatLigado = Boolean(c?.chat?.ligado);
  const legenda = legendaParaDesenhar(c);
  const ligado = chatLigado || Boolean(legenda);
  // Desligado, a tela do 16:9 limpa-se uma vez e fica quieta: o ciclo corre a cada frame.
  if (!ligado && !chatFontePintada) return;
  const tela = $('chatFonte');
  const g = tela.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, tela.width, tela.height);
  chatFontePintada = ligado;
  if (!ligado) return;
  const lista = mensagensDoCanal(c.canal);
  const ms = instanteDoChat(c);
  // O 16:9 na mesma conta de 1920x1080 do ficheiro, só que em ponto pequeno.
  g.setTransform(tela.width / DEITADO.largura, 0, 0, tela.height / DEITADO.altura, 0, 0);
  const pincel16 = porCimaDoClipe({
    canal: c.canal, deMs: c.deMs, ateMs: c.ateMs, chat: chatLigado ? c.chat : null, legenda, alvo: DEITADO, formato: '16:9',
    mensagens: lista,
  });
  pincel16?.(g, (ms - c.deMs) / 1000);
  if (ctx9x16 && c.rects.length) {
    const pincel9 = porCimaDoClipe({
      canal: c.canal, deMs: c.deMs, ateMs: c.ateMs, chat: chatLigado ? c.chat : null, legenda,
      alvo: RETRATO, formato: '9:16', modo: c.modo, divisao: c.divisao, mensagens: lista,
    });
    pincel9?.(ctx9x16, (ms - c.deMs) / 1000);
  }
  if (legenda) marcarFalaAgora(linhaNoInstante(legenda.transcricao, ms, segurarMs(legenda)));
}

/**
 * Ler o chat do clipe aberto, se ele o quer, e dizer quantas mensagens tem. Uma leitura de cada vez;
 * mexer nas pontas a meio troca-a pela do pedaço novo.
 */
function carregarChatDoClipe() {
  const c = estado.clipe;
  if (!c?.chat?.ligado || !chatDoEvento) return Promise.resolve(null);
  const canal = c.canal;
  const deMs = c.deMs;
  const ateMs = c.ateMs;
  const chave = `${canal}|${deMs}|${ateMs}`;
  if (c.chatLeitura?.chave === chave) return c.chatLeitura.promessa;
  c.chatLeitura?.controlo.abort();
  const controlo = new AbortController();
  const leitura = { chave, controlo };
  c.chatLeitura = leitura;
  const nota = $('estadoChatClipe');
  const aindaEsta = () => estado.clipe === c && c.chatLeitura === leitura;
  nota.classList.remove('mau');
  nota.textContent = t('chatClipe.aLer', { canal, pct: 0 });
  leitura.promessa = (async () => {
    let r = null;
    try {
      r = await chatDoEvento.lerChatTrecho(canal, deMs - VIDA_CHAT_MS, ateMs, {
        sinal: controlo.signal,
        aoProgredir: ({ fracao }) => {
          if (aindaEsta()) nota.textContent = t('chatClipe.aLer', { canal, pct: Math.round(fracao * 100) });
        },
      });
    } catch (e) {
      if (e?.name === 'AbortError' || !aindaEsta()) return null;
      r = { motivo: 'erro' };
    }
    if (!aindaEsta()) return r;
    const n = mensagensDoCanal(canal).filter((m) => m.ms >= deMs && m.ms <= ateMs).length;
    const msgs = tn(n, 'chatClipe.umaMsg', 'chatClipe.msgs', { n });
    nota.classList.toggle('mau', Boolean(r?.semCanal || r?.motivo));
    nota.textContent = r?.semCanal ? t('chatClipe.semCanal', { canal })
      : r?.motivo ? t('chatClipe.parou', { msgs })
        : n ? t('chatClipe.lido', { canal, msgs }) : t('chatClipe.nada', { canal });
    // As imagens dos emotes, sem esperar: a prévia apanha-as quando chegarem.
    prepararEmotes(mensagensDoClipe(mensagensDoCanal(canal), deMs, ateMs)).catch(() => {});
    carregarLetraDoChat();
    return r;
  })();
  return leitura.promessa;
}

let esperaChatClipe = null;
/** Depois de mexer nas pontas: ler o que falta do pedaço novo, quando a mão parar. */
function agendarChatDoClipe() {
  clearTimeout(esperaChatClipe);
  if (!estado.clipe?.chat?.ligado) return;
  esperaChatClipe = setTimeout(() => { carregarChatDoClipe(); }, 450);
}

/** Os controlos do chat a dizer o que o clipe aberto tem. */
function pintarChatClipe() {
  const c = estado.clipe;
  if (!c) return;
  const ch = c.chat;
  $('chatClipeLigado').checked = ch.ligado;
  $('chatClipeOpcoes').hidden = !ch.ligado;
  $('chatClipeVida').value = String(ch.vida);
  $('chatClipeLinhas').value = String(ch.linhas);
  $('chatClipeFundo').value = ch.fundo;
  for (const r of document.querySelectorAll('input[name="chatCor"]')) r.checked = r.value === ch.cor;
  $('chatClipeAuto').disabled = Boolean(c.aGravar) || !(ch.caixas['16:9'] || ch.caixas['9:16']);
  // A tela por cima do 16:9 é do chat e da legenda: fica à vista com qualquer um dos dois.
  $('chatFonte').hidden = !(ch.ligado || c.legenda?.ligado);
  if (!ch.ligado) {
    $('estadoChatClipe').textContent = '';
    $('estadoChatClipe').classList.remove('mau');
  }
  // O ciclo das prévias também pinta o chat do 16:9, que existe antes de haver 9:16.
  if (ch.ligado) seguirRetrato();
}

function ligarChatClipe() {
  $('chatClipeLigado').addEventListener('change', (e) => {
    const c = estado.clipe;
    if (!c || c.aGravar) return;
    c.chat = limparChat({ ...c.chat, ligado: e.target.checked });
    pintarChatClipe();
    if (c.chat.ligado) carregarChatDoClipe();
    else { c.chatLeitura?.controlo.abort(); c.chatLeitura = null; }
  });
  const escolher = (chave, valor) => {
    const c = estado.clipe;
    if (!c || c.aGravar) return;
    c.chat = limparChat({ ...c.chat, [chave]: valor });
    lembrarChat(c.chat);
    pintarChatClipe();
  };
  for (const [id, chave] of [['chatClipeVida', 'vida'], ['chatClipeLinhas', 'linhas'], ['chatClipeFundo', 'fundo']]) {
    $(id).addEventListener('change', (e) => escolher(chave, e.target.value));
  }
  for (const r of document.querySelectorAll('input[name="chatCor"]')) {
    r.addEventListener('change', () => { if (r.checked) escolher('cor', r.value); });
  }
  $('chatClipeAuto').addEventListener('click', () => escolher('caixas', CHAT_OMISSAO.caixas));
}
ligarChatClipe();

// ── a legenda da fala ────────────────────────────────────────────────────────
//
// O dono, 12/10: a fala do streamer como legenda no clipe baixado, revisável antes de exportar. As
// contas e o desenho vivem em legenda.js; o som e o leitor de voz em legenda-voz.js (e o Worker em
// legenda-worker.js). Aqui é a ligação à janela do clipe, à lista para corrigir e à gravação.

const GUARDADO_LEGENDA = 'povix.legenda';
let vozDaLegenda = null;

/** As escolhas da legenda que ficam no aparelho. O ligar não fica: cada clipe começa sem legenda. */
function legendaLembrada() {
  try {
    return limparLegenda({ ...JSON.parse(localStorage.getItem(GUARDADO_LEGENDA) || 'null'), ligado: false });
  } catch { return limparLegenda(null); }
}

function lembrarLegenda(l) {
  try {
    const { ligado, ...resto } = limparLegenda(l);
    void ligado;
    localStorage.setItem(GUARDADO_LEGENDA, JSON.stringify(resto));
  } catch { /* janela privada */ }
}

/** A legenda a desenhar no clipe aberto (escolhas e texto), ou null se não há o que pôr. */
function legendaParaDesenhar(c) {
  if (!c?.legenda?.ligado || !c.transcricao) return null;
  if (cobre(c.transcricao, { canal: c.canal, deMs: c.deMs, ateMs: c.ateMs }) !== 'ok') return null;
  return { ...c.legenda, transcricao: c.transcricao };
}

/** Por que a legenda ligada não entra no clipe aberto, numa frase. */
function motivoSemLegenda(c) {
  const tr = c?.transcricao;
  const porque = cobre(tr, { canal: c.canal, deMs: c.deMs, ateMs: c.ateMs });
  if (porque === 'outroCanal') return t('legenda.outroCanal', { canal: tr.canal, atual: c.canal });
  if (porque === 'foraDoPedaco') return t('legenda.foraDoPedaco', { de: relogioCurto(tr.deMs), ate: relogioCurto(tr.ateMs) });
  return t('legenda.falta');
}

/** A legenda guardada numa kill, para a montagem: só ligada, e só com texto da voz deste canal. */
function legendaDoClipeGuardado(clipe) {
  const l = limparLegenda(clipe?.legenda);
  if (!l.ligado) return null;
  const tr = limparTranscricao(clipe.legenda.transcricao);
  if (!tr || cobre(tr, { canal: clipe.canal, deMs: tr.deMs, ateMs: tr.ateMs }) !== 'ok') return null;
  return { ...l, transcricao: tr };
}

/** A letra grossa da legenda tem de estar carregada antes do primeiro frame, como a do chat. */
const carregarLetraDaLegenda = (l) => Promise.all([fonteDaLegenda(l.estilo, 64), fonteDaLegenda('destaque', 32)]
  .map((f) => document.fonts?.load?.(f))).catch(() => {});

let falaMarcada = -1;
/** Na lista, a fala que a prévia está a mostrar. */
function marcarFalaAgora(k) {
  if (k === falaMarcada) return;
  falaMarcada = k;
  for (const li of $('legendaFalas').children) li.classList.toggle('agora', Number(li.dataset.k) === k);
}

const mbDe = (bytes) => Math.max(1, Math.round(bytes / 1e6));

/** O aviso do que se baixa e de quanto demora, e o rótulo do botão. */
function pintarAvisoDaLegenda() {
  const c = estado.clipe;
  if (!c) return;
  const durS = Math.round((c.ateMs - c.deMs) / 1000);
  const estimativa = t('legenda.estimativa', { dur: durS, s: estimativaS(durS) });
  const falta = c.legendaFalta;
  const aviso = $('legendaBaixar');
  const botao = $('gerarLegendaTexto');
  const podeAqui = podeLer();
  $('gerarLegenda').disabled = !podeAqui || Boolean(c.aGravar);
  if (!podeAqui) {
    aviso.textContent = t('legenda.semLeitor');
    aviso.classList.add('mau');
    return;
  }
  aviso.classList.remove('mau');
  aviso.textContent = falta == null || falta.bytes > 0
    ? `${t(falta && !falta.guarda ? 'legenda.semCache' : 'legenda.baixarPrimeira', { mb: mbDe(falta?.bytes ?? BYTES_LEITOR) })} ${estimativa}`
    : `${t('legenda.jaBaixado')} ${estimativa}`;
  botao.textContent = c.legendaGerar ? t('legenda.parar')
    : falta?.bytes > 0 ? t('legenda.gerarBaixar', { mb: mbDe(falta.bytes) })
      : c.transcricao ? t('legenda.gerarDeNovo') : t('legenda.gerar');
  $('gerarLegenda').classList.toggle('principal', !c.transcricao && !c.legendaGerar);
}
// O que se baixa da primeira vez, enquanto o cache não responde (legenda-arquivos.js soma 107 MB).
const BYTES_LEITOR = 107_000_000;

/** A lista das falas para corrigir. Texto só por `value` e `textContent`: nunca vira HTML. */
function pintarFalas({ foco } = {}) {
  const c = estado.clipe;
  const lista = $('legendaFalas');
  const tr = c?.transcricao;
  const mostrar = Boolean(c?.legenda?.ligado && tr && cobre(tr, { canal: c.canal, deMs: tr.deMs, ateMs: tr.ateMs }) === 'ok');
  $('legendaTexto').hidden = !mostrar;
  lista.replaceChildren();
  falaMarcada = -1;
  if (!mostrar) return;
  const inicio = tr.deMs;
  tr.linhas.forEach((l, k) => {
    const quando = rotuloTempo(l.palavras[0].de, inicio);
    const li = document.createElement('li');
    li.className = 'fala';
    li.dataset.k = String(k);
    const tempo = document.createElement('button');
    tempo.type = 'button';
    tempo.className = 'falaTempo';
    tempo.dataset.acao = 'ver';
    tempo.textContent = quando;
    tempo.setAttribute('aria-label', t('legenda.verFala', { t: quando }));
    const texto = document.createElement('input');
    texto.type = 'text';
    texto.className = 'falaTexto';
    texto.maxLength = 400;
    texto.spellcheck = true;
    texto.value = textoDaLinha(l);
    texto.setAttribute('aria-label', t('legenda.textoFala', { t: quando }));
    const botao = (acao, rotulo, aria, icone) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `falaBotao ${acao}`;
      b.dataset.acao = acao;
      b.setAttribute('aria-label', aria);
      b.title = aria;
      if (icone) {
        b.innerHTML = ICONE(icone);
      } else {
        b.textContent = rotulo;
      }
      return b;
    };
    li.append(
      tempo, texto,
      botao('antes', t('legenda.menos'), t('legenda.antes', { t: quando })),
      botao('depois', t('legenda.mais'), t('legenda.depois', { t: quando })),
      botao('apagar', '', t('legenda.apagar', { t: quando }), 'lixo'),
    );
    lista.append(li);
  });
  if (foco) lista.querySelector(`li[data-k="${foco.k}"] [data-acao="${foco.acao}"]`)?.focus();
  if (c.aGravar) for (const el of lista.querySelectorAll('input, button')) el.disabled = true;
}

/** Os controlos da legenda a dizer o que o clipe aberto tem. */
function pintarLegendaClipe() {
  const c = estado.clipe;
  if (!c) return;
  const l = c.legenda;
  $('legendaLigada').checked = l.ligado;
  $('legendaOpcoes').hidden = !l.ligado;
  $('legendaIdioma').value = l.idioma;
  $('legendaTraduzir').checked = l.traduzir;
  $('legendaEstilo').value = l.estilo;
  $('legendaSegurar').value = String(l.segurar);
  $('legendaAuto').disabled = Boolean(c.aGravar) || !(l.caixas['16:9'] || l.caixas['9:16']);
  for (const r of document.querySelectorAll('input[name="legendaCor"]')) r.checked = r.value === l.cor;
  $('legendaNome').checked = l.nome;
  $('chatFonte').hidden = !(c.chat?.ligado || l.ligado);
  const nota = $('estadoLegenda');
  if (!l.ligado) {
    nota.textContent = '';
    nota.classList.remove('mau');
    $('legendaProgresso').hidden = true;
  } else if (!c.legendaGerar) {
    $('legendaProgresso').hidden = true;
    const porque = cobre(c.transcricao, { canal: c.canal, deMs: c.deMs, ateMs: c.ateMs });
    if (porque === 'ok') {
      nota.classList.remove('mau');
      if (!c.legendaNota) {
        nota.textContent = t(c.transcricao.traduzida ? 'legenda.temTraduzida' : 'legenda.tem',
          { falas: tn(c.transcricao.linhas.length, 'legenda.umaFala', 'legenda.falas', { n: c.transcricao.linhas.length }) });
      }
    } else if (c.transcricao) {
      nota.textContent = motivoSemLegenda(c);
      nota.classList.add('mau');
    } else if (!c.legendaNota) {
      nota.textContent = '';
    }
  }
  pintarAvisoDaLegenda();
  pintarFalas();
  if (l.ligado) {
    seguirRetrato();
    if (c.legendaFalta == null) {
      faltaBaixar().then((f) => {
        if (estado.clipe !== c) return;
        c.legendaFalta = f;
        pintarAvisoDaLegenda();
      }, () => {});
    }
  }
}

let esperaLegenda = null;
/** Depois de mexer nas pontas: dizer se o texto ainda cobre o pedaço, quando a mão parar. */
function agendarLegendaDoClipe() {
  clearTimeout(esperaLegenda);
  const c = estado.clipe;
  if (!c?.legenda?.ligado || c.legendaGerar) return;
  esperaLegenda = setTimeout(() => {
    if (estado.clipe !== c) return;
    c.legendaNota = null;
    pintarLegendaClipe();
  }, 350);
}

/** O erro do caminho todo (som, leitor, modelo) numa frase para quem usa. */
function motivoDaLegenda(e) {
  if (e?.name === 'INTEGRIDADE') return t('legenda.integridade');
  if (e?.name === 'SEM-LEITOR') return t('legenda.semLeitor');
  if (e?.name === 'SEM-SOM' || e?.name === 'SEM-DESCODIFICADOR') return t('legenda.semSom');
  if (e?.name === 'SEM-PLANO') return e.message;
  if (e?.name === 'TypeError' || /fetch|network|rede/i.test(String(e?.message))) return t('legenda.semRede');
  return t('legenda.erro', { erro: String(e?.message || e).slice(0, 160) });
}

/**
 * Gerar a legenda do clipe aberto: o som só deste pedaço e deste streamer, o leitor de voz (baixado da
 * primeira vez), e o texto na lista. Carregar outra vez a meio pára.
 */
async function gerarLegenda() {
  const c = estado.clipe;
  if (!c || c.aGravar) return;
  if (c.legendaGerar) { c.legendaGerar.controlo.abort(); return; }
  if (!podeLer()) { pintarAvisoDaLegenda(); return; }
  const controlo = new AbortController();
  const g = { controlo };
  c.legendaGerar = g;
  c.legendaNota = 'aGerar';
  const aindaEste = () => estado.clipe === c && c.legendaGerar === g;
  const nota = $('estadoLegenda');
  const barra = $('legendaProgresso');
  const dizer = (texto, fracao) => {
    if (!aindaEste()) return;
    nota.classList.remove('mau');
    nota.textContent = texto;
    barra.hidden = false;
    if (fracao == null) barra.removeAttribute('value'); else barra.value = Math.max(0, Math.min(1, fracao));
  };
  const { canal, deMs, ateMs } = c;
  const linha = estado.linhas.find((x) => x.slug === canal);
  const { traduzir } = c.legenda;
  // Automático: o idioma que a live declara na Kick, se declara (o Whisper sozinho erra em clipe curto).
  const daLive = linha ? onde(linha, deMs + (estado.nudges[canal] || 0)).peca?.vod?.idioma : null;
  const idioma = idiomaParaOuvir(c.legenda.idioma, daLive);
  const nudge = estado.nudges[canal] || 0;
  const t0 = performance.now();
  pintarAvisoDaLegenda();
  dizer(t('legenda.aPreparar'), null);
  try {
    const plano = await planearCorte({
      linha, deMs: deMs + nudge, ateMs: ateMs + nudge, cache: new Map(), sinal: controlo.signal, degrau: degrauDoSom,
    });
    if (plano.estado !== 'ok') throw Object.assign(new Error(porqueNaoSaiu(plano)), { name: 'SEM-PLANO' });
    const audio = await somDosPedacos(plano.segmentos, deMs + nudge, ateMs + nudge, {
      sinal: controlo.signal,
      aoBaixar: ({ prontos, total }) => dizer(t('legenda.aBaixarSom', { prontos, total }), prontos / total),
    });
    const falta = await faltaBaixar();
    if (aindaEste()) c.legendaFalta = falta;
    vozDaLegenda ??= abrirVoz();
    const durS = (ateMs - deMs) / 1000;
    let inicioOuvir = null;
    const r = await vozDaLegenda.transcrever(audio, {
      idioma, traduzir, sinal: controlo.signal, faltaBytes: falta.bytes,
      aoProgresso: (p) => {
        if (p.fase === 'baixar') {
          dizer(t('legenda.aBaixarLeitor', { feito: mbDe(p.feito), total: mbDe(p.total) }), p.fracao);
        } else if (p.fase === 'abrir') {
          dizer(t('legenda.aAbrir'), null);
        } else if (p.fase === 'ouvir') {
          const agora = performance.now();
          inicioOuvir ??= agora;
          const passou = (agora - inicioOuvir) / 1000;
          const resta = p.fracao > 0.05 ? (passou / p.fracao) * (1 - p.fracao) : durS * 0.9 - passou;
          dizer(t('legenda.aOuvir', { pct: Math.round(p.fracao * 100), s: Math.max(1, Math.round(resta)) }), p.fracao);
        }
      },
    });
    if (!aindaEste()) return;
    const tr = transcricaoDoAudio(r.palavras, { canal, deMs, ateMs, idioma, traduzida: traduzir });
    c.transcricao = tr;
    // O texto fica lembrado para a frase do cartão e o filtro por palavra do modo simples.
    if (tr?.linhas.length) guardarFala(localStorage, { canal, deMs, ateMs, linhas: linhasDaTranscricao(tr) });
    c.legendaFalta = { bytes: 0, guarda: falta.guarda };
    const s = Math.round((performance.now() - t0) / 1000);
    nota.classList.remove('mau');
    nota.textContent = tr?.linhas.length
      ? t('legenda.pronta', { falas: tn(tr.linhas.length, 'legenda.umaFala', 'legenda.falas', { n: tr.linhas.length }), s })
      : t('legenda.nenhumaFala');
    c.legendaNota = 'pronta';
  } catch (e) {
    if (!aindaEste() && e?.name !== 'AbortError') return;
    if (estado.clipe !== c) return;
    nota.textContent = e?.name === 'AbortError' ? t('legenda.parou') : motivoDaLegenda(e);
    nota.classList.toggle('mau', e?.name !== 'AbortError');
    c.legendaNota = 'erro';
  } finally {
    if (c.legendaGerar === g) c.legendaGerar = null;
    if (estado.clipe === c) {
      $('legendaProgresso').hidden = true;
      pintarLegendaClipe();
    }
  }
}

/**
 * "Ver o que ele falou" de um cartão do modo simples: o som só deste pedaço, o mesmo leitor da legenda, e o texto fica
 * lembrado (falas.js). Não mexe no editor. `aoProgresso({ fase: 'som' | 'baixar' | 'abrir' | 'ouvir', fracao, feito, total })`.
 */
async function transcreverParaCartao({ canal, deMs, ateMs }, { sinal, aoProgresso = () => {} } = {}) {
  if (!podeLer()) throw Object.assign(new Error('sem leitor'), { name: 'SEM-LEITOR' });
  const linha = estado.linhas.find((x) => x.slug === canal);
  if (!linha) throw Object.assign(new Error(t('simples.semMotivo')), { name: 'SEM-PLANO' });
  const nudge = estado.nudges[canal] || 0;
  const idioma = idiomaParaOuvir('auto', onde(linha, deMs + nudge).peca?.vod?.idioma);
  const plano = await planearCorte({
    linha, deMs: deMs + nudge, ateMs: ateMs + nudge, cache: new Map(), sinal, degrau: degrauDoSom,
  });
  if (plano.estado !== 'ok') throw Object.assign(new Error(porqueNaoSaiu(plano)), { name: 'SEM-PLANO' });
  const audio = await somDosPedacos(plano.segmentos, deMs + nudge, ateMs + nudge, {
    sinal, aoBaixar: ({ prontos, total }) => aoProgresso({ fase: 'som', fracao: prontos / total }),
  });
  const falta = await faltaBaixar();
  vozDaLegenda ??= abrirVoz();
  const r = await vozDaLegenda.transcrever(audio, {
    idioma, traduzir: false, sinal, faltaBytes: falta.bytes, aoProgresso: (p) => aoProgresso(p),
  });
  const linhas = linhasDaTranscricao(transcricaoDoAudio(r.palavras, { canal, deMs, ateMs, idioma, traduzida: false }));
  guardarFala(localStorage, { canal, deMs, ateMs, linhas });
  return { linhas };
}

function ligarLegendaClipe() {
  $('legendaLigada').addEventListener('change', (e) => {
    const c = estado.clipe;
    if (!c || c.aGravar) return;
    c.legenda = limparLegenda({ ...c.legenda, ligado: e.target.checked });
    if (!c.legenda.ligado) c.legendaGerar?.controlo.abort();
    c.legendaNota = null;
    pintarLegendaClipe();
  });
  const escolha = (chave, valor) => {
    const c = estado.clipe;
    if (!c || c.aGravar) return;
    c.legenda = limparLegenda({ ...c.legenda, [chave]: valor });
    lembrarLegenda(c.legenda);
    if (chave === 'estilo' || chave === 'nome') carregarLetraDaLegenda(c.legenda);
    pintarLegendaClipe();
  };
  for (const [id, chave] of [['legendaIdioma', 'idioma'], ['legendaEstilo', 'estilo'], ['legendaSegurar', 'segurar']]) {
    $(id).addEventListener('change', (e) => escolha(chave, e.target.value));
  }
  $('legendaAuto').addEventListener('click', () => escolha('caixas', LEGENDA_OMISSAO.caixas));
  $('legendaTraduzir').addEventListener('change', (e) => escolha('traduzir', e.target.checked));
  $('legendaNome').addEventListener('change', (e) => escolha('nome', e.target.checked));
  for (const r of document.querySelectorAll('input[name="legendaCor"]')) {
    r.addEventListener('change', () => { if (r.checked) escolha('cor', r.value); });
  }
  $('gerarLegenda').addEventListener('click', () => gerarLegenda());
  // A lista: um ouvinte só, para todas as falas.
  const lista = $('legendaFalas');
  lista.addEventListener('change', (e) => {
    const c = estado.clipe;
    const campo = e.target.closest('.falaTexto');
    if (!c?.transcricao || !campo || c.aGravar) return;
    const k = Number(campo.closest('li').dataset.k);
    const antes = c.transcricao.linhas.length;
    c.transcricao = editarLinha(c.transcricao, k, campo.value);
    guardarFala(localStorage, { canal: c.transcricao.canal, deMs: c.transcricao.deMs, ateMs: c.transcricao.ateMs, linhas: linhasDaTranscricao(c.transcricao) });
    if (c.transcricao.linhas.length !== antes) pintarFalas({ foco: { k: Math.min(k, c.transcricao.linhas.length - 1), acao: 'ver' } });
    else campo.value = textoDaLinha(c.transcricao.linhas[k]);
  });
  // Enter no texto confirma, como num formulário, sem sair da lista.
  lista.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('.falaTexto')) { e.preventDefault(); e.target.blur(); e.target.focus(); }
  });
  lista.addEventListener('click', (e) => {
    const c = estado.clipe;
    const b = e.target.closest('button[data-acao]');
    if (!c?.transcricao || !b || c.aGravar) return;
    const k = Number(b.closest('li').dataset.k);
    const fala = c.transcricao.linhas[k];
    if (!fala) return;
    if (b.dataset.acao === 'ver') { levarAgulha(fala.palavras[0].de); return; }
    if (b.dataset.acao === 'apagar') {
      c.transcricao = apagarLinha(c.transcricao, k);
      guardarFala(localStorage, { canal: c.transcricao.canal, deMs: c.transcricao.deMs, ateMs: c.transcricao.ateMs, linhas: linhasDaTranscricao(c.transcricao) });
      pintarFalas({ foco: { k: Math.min(k, c.transcricao.linhas.length - 1), acao: 'apagar' } });
      if (!c.transcricao.linhas.length) $('legendaLigada').focus();
      return;
    }
    const delta = b.dataset.acao === 'antes' ? -PASSO_MS : PASSO_MS;
    c.transcricao = deslocarLinha(c.transcricao, k, delta);
    guardarFala(localStorage, { canal: c.transcricao.canal, deMs: c.transcricao.deMs, ateMs: c.transcricao.ateMs, linhas: linhasDaTranscricao(c.transcricao) });
    // A mesma fala depois de andar (pode ter trocado de lugar com a vizinha): o mesmo texto, perto.
    const texto = textoDaLinha(fala);
    let novoK = k;
    let melhor = Infinity;
    c.transcricao.linhas.forEach((l, i) => {
      const d = Math.abs(l.palavras[0].de - (fala.palavras[0].de + delta));
      if (textoDaLinha(l) === texto && d < melhor) { melhor = d; novoK = i; }
    });
    pintarFalas({ foco: { k: novoK, acao: b.dataset.acao } });
    levarAgulha(c.transcricao.linhas[novoK].palavras[0].de);
  });
}
ligarLegendaClipe();

// ── as caixas do chat e da legenda nas prévias ──────────────────────────────
//
// O dono, 13/10: mover e redimensionar o chat e a legenda arrastando direto na prévia, como a caixa da
// webcam, no 16:9 e no 9:16. A caixa que se vê é a mesma conta do desenho (`retanguloDoChat` e
// `retanguloDaLegenda`); o que se arrasta fica em `escolhas.caixas[formato]`, em fração do quadro, e o
// ficheiro lê a mesma fração. No 9:16 a caixa fica presa à zona livre do TikTok até a pessoa a puxar
// bem para fora (caixa-previa.js).
const ZONA_9X16 = { x0: 0, y0: ZONA_TIKTOK.cima, x1: 1 - ZONA_TIKTOK.direita, y1: 1 - ZONA_TIKTOK.baixo };
const CAIXAS_PREVIA = [];
function montarCaixasPrevia() {
  for (const item of ['chat', 'legenda']) {
    const chaveT = item === 'chat' ? 'chatClipe' : 'legenda';
    for (const [formato, camada, alvo, quadro] of [['16:9', 'caixasFonte', DEITADO, 'fonteClipe'], ['9:16', 'caixasRetrato', RETRATO, 'telaRetrato']]) {
      const el = document.createElement('div');
      el.className = `caixaPrevia ${item}`;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.dataset.tAria = `${chaveT}.caixaAria`;
      el.hidden = true;
      el.innerHTML = `<span class="etiquetaCaixa" data-t="${chaveT}.etiqueta"></span>`
        + ['no', 'ne', 'so', 'se'].map((k) => `<span class="puxar ${k}" data-canto="${k}"></span>`).join('');
      $(camada).append(el);
      const caixa = { item, formato, alvo, el, ultimo: '' };
      ligarCaixa(el, {
        quadro: () => $(quadro),
        ler: () => retanguloDaCaixa(caixa),
        pode: () => Boolean(estado.clipe) && !estado.clipe.aGravar,
        zona: () => (formato === '9:16' ? ZONA_9X16 : null),
        aoMexer: (r) => {
          const c = estado.clipe;
          const limpar = item === 'chat' ? limparChat : limparLegenda;
          c[item] = limpar({ ...c[item], caixas: { ...c[item].caixas, [formato]: r } });
        },
        aoSoltar: () => {
          const c = estado.clipe;
          if (!c) return;
          if (item === 'chat') { lembrarChat(c.chat); pintarChatClipe(); } else { lembrarLegenda(c.legenda); pintarLegendaClipe(); }
        },
      });
      CAIXAS_PREVIA.push(caixa);
    }
  }
  aplicarIdioma($('caixasFonte'));
  aplicarIdioma($('caixasRetrato'));
}
/** A caixa de um item num formato agora, ou null se ele não se vê nesse quadro. */
function retanguloDaCaixa({ item, formato, alvo }) {
  const c = estado.clipe;
  if (!c || c.aGravar) return null;
  if (formato === '9:16' && $('ladoRetrato').hidden) return null;
  const opcoes = { formato, modo: c.modo, divisao: c.divisao };
  if (item === 'chat') return c.chat?.ligado ? retanguloDoChat(alvo, c.chat, opcoes) : null;
  return legendaParaDesenhar(c) ? retanguloDaLegenda(alvo, c.legenda, { ...opcoes, chat: c.chat }) : null;
}
/** Pôr cada caixa onde está, a cada frame do ciclo das prévias; só mexe no DOM quando algo muda. */
function pintarCaixasPrevia() {
  for (const cx of CAIXAS_PREVIA) {
    const r = retanguloDaCaixa(cx);
    if (!r) {
      if (!cx.el.hidden) { cx.el.hidden = true; cx.ultimo = ''; }
      continue;
    }
    const css = estiloDaCaixa(r);
    if (css === cx.ultimo && !cx.el.hidden) continue;
    cx.ultimo = css;
    cx.el.style.cssText = css;
    cx.el.hidden = false;
  }
}
montarCaixasPrevia();

/**
 * Trancar o editor enquanto o 9:16 grava, e destrancá-lo no fim.
 *
 * Os botões ficam apagados para se ver que estão parados; as pegas e os
 * recortes, que se arrastam, verificam `aGravar` por si.
 */
/**
 * O clipe de vários ângulos (angulos.js): o mesmo pedaço visto por mais de um streamer, com o nome de
 * cada um no vídeo. 'seguido' é 16:9, um ângulo depois do outro (até 4); 'empilhado' é 9:16, dois, um
 * em cima do outro. Os ângulos são o do editor, os em foco e depois os outros, só os que estavam no ar
 * no começo do clipe. Reconverte, por isso leva o tempo do clipe.
 */
function angulosDoClipe(c, modo) {
  const ordem = c.canaisClipe?.length ? [c.canal, ...c.canaisClipe] : [c.canal, ...estado.focos, ...estado.linhas.map((l) => l.slug)];
  const noAr = [...new Set(ordem)].filter((slug) => {
    const l = estado.linhas.find((x) => x.slug === slug);
    return l && onde(l, c.deMs, { nudgeMs: estado.nudges[slug] || 0 }).estado === 'toca';
  });
  return noAr.slice(0, modo === 'empilhado' ? 2 : 4);
}

async function guardarAngulos(modo) {
  prepararSomDaGravacao();
  const c = estado.clipe;
  if (!c || c.aGravar) return;
  const aindaEste = () => estado.clipe === c;
  const canais = angulosDoClipe(c, modo);
  const limites = trechoComum(canais.map((slug) => estado.linhas.find((l) => l.slug === slug)), c.deMs, { nudges: estado.nudges });
  if (!limites || c.deMs < limites.inicio || c.ateMs > limites.fim) {
    $('estadoClipe').textContent = t('simples.pov.semTrecho');
    return;
  }
  if (canais.length < 2) {
    $('estadoClipe').textContent = t('angulos.poucos', { canal: c.canal });
    return;
  }
  const duracaoS = (c.ateMs - c.deMs) / 1000;
  const plano = planoDeAngulos({ modo, canais, duracaoS });
  window.__ultimoPlanoAngulos = plano;
  const controlo = new AbortController();
  c.aGravar = true;
  c.rostoBusca?.abort();
  c.pararGravacao = () => controlo.abort();
  trancarEditor(true);
  const abertos = [];
  try {
    const formato = await formatoQueFunciona();
    if (!aindaEste() || controlo.signal.aborted) return;
    if (!formato) { $('estadoClipe').textContent = t('retrato.semGravador'); return; }
    $('estadoClipe').textContent = t('angulos.aAbrir', { n: canais.length });
    for (const slug of canais) {
      const linha = estado.linhas.find((l) => l.slug === slug);
      abertos.push(await abrirVideoEscondido(linha, c.deMs, { sinal: controlo.signal, ateMs: c.ateMs }));
    }
    // O som segue quem está na tela (angulos.js, `somEm`): todos saem do mudo, com o volume a zero
    // para não se ouvirem aqui, e o gravador deixa passar um de cada vez. No 9:16 empilhado, os dois
    // estão na tela, e o som é o do ângulo que se estava a ouvir na grelha, se for um deles.
    for (const a of abertos) { a.v.muted = Boolean(a.arquivoSom); a.v.volume = 0; }
    const ouvido = canais.findIndex((slug) => ehFoco(slug) && temSom(slug));
    const trocas = [];
    window.__ultimoSomAngulos = { canais, trocas };
    const { blob, extensao } = await gravarAngulos(abertos.map((a) => a.v), {
      arquivosSom: abertos.map((a) => a.arquivoSom),
      plano,
      formato,
      exigirSom: true,
      somDe: Math.max(0, ouvido),
      fps: c.fonteFps,
      aoSom: (i, tS) => trocas.push({ canal: canais[i], tS }),
      sinal: controlo.signal,
      aoProgresso: ({ feito, total }) => {
        if (!aindaEste()) return;
        pintarAvisoGravando(feito);
        $('estadoClipe').textContent = t('angulos.aGravar', { n: canais.length, feito: feito.toFixed(1), total: total.toFixed(1) });
      },
    });
    const base = nomeDoClipe({ titulo: $('tituloClipe').value, canal: c.canal, quandoMs: c.deMs });
    const nome = `${base.replace(/\.[a-z0-9]+$/i, '')}-angulos.${extensao}`;
    const url = guardarFicheiro(blob);
    const item = document.createElement('li');
    $('fila').prepend(item);
    linhaDeFicheiro(item, { nome, url, nota: `${(blob.size / 1048576).toFixed(1)} MB, ${canais.join(', ')}` });
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    if (aindaEste()) $('estadoClipe').textContent = t('angulos.pronto');
  } catch (e) {
    if (e.name === 'AbortError' || !aindaEste()) return;
    $('estadoClipe').textContent = e.name === 'SEM-GRAVADOR' ? t('retrato.semGravador')
      : e.name === 'GRAVACAO-PARADA' ? t('retrato.parou')
        : e.name === 'GRAVACAO-VAZIA' ? t('retrato.vazio')
          : t('clipe.naoDeu', { erro: motivoDoRetrato(e) });
  } finally {
    for (const a of abertos) a.fechar();
    c.aGravar = false;
    c.pararGravacao = null;
    if (aindaEste()) trancarEditor(false);
  }
}

/** O aviso por cima do editor trancado, com os segundos já gravados. */
function pintarAvisoGravando(feito = 0) {
  const c = estado.clipe;
  const total = c ? Math.round((c.ateMs - c.deMs) / 1000) : 0;
  $('avisoGravandoTexto').textContent = t('clipe.gravando', { feito: Math.min(total, Math.floor(feito)), total });
}

function trancarEditor(sim) {
  $('avisoGravando').hidden = !sim;
  if (sim) pintarAvisoGravando(0);
  for (const id of ['inicioMenos', 'inicioMais', 'fimMenos', 'fimMais', 'verClipe', 'canalClipe',
    'guardarClipe', 'guardarAjustes', 'modoUm', 'modoDois', 'divisor', 'angulosSeguido', 'angulosEmpilhado',
    'voltarModelo', 'chatClipeLigado', 'chatClipeVida', 'chatClipeAuto', 'chatClipeLinhas', 'chatClipeFundo',
    'legendaLigada', 'legendaIdioma', 'legendaTraduzir', 'gerarLegenda', 'legendaEstilo', 'legendaSegurar',
    'legendaAuto', 'legendaNome']) {
    const el = $(id);
    if (el) el.disabled = sim;
  }
  for (const p of $('barraClipe').querySelectorAll('.pega')) p.disabled = sim;
  for (const b of document.querySelectorAll('.modeloWebcam')) b.disabled = sim;
  for (const b of document.querySelectorAll('#legendaClipe input[name="legendaCor"], #chatClipe input[name="chatCor"], #legendaFalas input, #legendaFalas button')) {
    b.disabled = sim;
  }
  // O Gerar volta a dizer se este navegador o corre, e não só "destrancado".
  if (!sim && estado.clipe) pintarAvisoDaLegenda();
  // A agulha não é um botão: sai da ordem do Tab e diz que está apagada.
  $('agulhaClipe').tabIndex = sim ? -1 : 0;
  $('agulhaClipe').setAttribute('aria-disabled', String(sim));
}

function fecharClipe() {
  clearTimeout(estado.esperaRetrato);
  // Fechar é desistir do que este editor tinha a correr. Sem isto, um 16:9
  // que acabasse depois guardava um ficheiro que ele já não queria e fechava
  // o editor da kill seguinte, com o que ele lá tinha mexido; e um 9:16 a
  // meio continuava a gravar um vídeo que já não estava lá.
  estado.clipe?.pararExportar?.();
  estado.clipe?.pararGravacao?.();
  estado.clipe?.chatLeitura?.controlo.abort();
  // Uma legenda a ser gerada para este clipe: parar (o leitor de voz é fechado a meio da conta).
  estado.clipe?.legendaGerar?.controlo.abort();
  estado.clipe?.rostoBusca?.abort();
  clearTimeout(esperaChatClipe);
  const retomarGrelha = estado.clipe?.retomarGrelha;
  pararVer();
  estado.clipe?.hls?.destroy();
  const v = $('previaClipe');
  v.pause?.();
  v.removeAttribute('src');
  estado.clipe = null;
  $('avisoGravando').hidden = true;
  esconderDialogo($('modalClipe'));
  if (retomarGrelha && estado.parado) alternarPausa();
}

const posClipe = (ms) => {
  const { inicio, fim } = estado.clipe.vista;
  return ((ms - inicio) / Math.max(1, fim - inicio)) * 100;
};

/**
 * A cabeça vai sempre pelo mesmo sítio, e sai de lá presa ao pedaço. É também a agulha que se arrasta:
 * guarda onde ficou (para as setas andarem a partir dali) e diz-o a quem usa leitor de tela.
 */
const porCabeca = (ms) => {
  const c = estado.clipe;
  if (!c) return;
  const agulha = $('agulhaClipe');
  agulha.style.left = `${posicaoDaCabeca(c, ms)}%`;
  c.cabecaMs = Math.min(Math.max(ms, c.deMs), c.ateMs);
  const dur = (c.ateMs - c.deMs) / 1000;
  const aqui = (c.cabecaMs - c.deMs) / 1000;
  agulha.setAttribute('aria-valuemax', dur.toFixed(1));
  agulha.setAttribute('aria-valuenow', aqui.toFixed(1));
  agulha.setAttribute('aria-valuetext', t('clipe.agulhaValor', { s: aqui.toFixed(1), dur: dur.toFixed(1) }));
};

function pintarClipe() {
  const c = estado.clipe;
  if (!c) return;
  // A barra mostra ±150 s à volta da kill, e o pedaço escolhido pode passar
  // disso: um combate de 170 s que acaba na kill, os ±0,5 s a empurrar uma
  // ponta para fora, ou outro ângulo. A pega ficava fora da barra, invisível
  // e impossível de agarrar. Quando sai, a vista volta a centrar-se no pedaço.
  // Arrastar nunca dispara isto: o arrasto fica preso à largura da barra.
  if (c.deMs < c.vista.inicio || c.ateMs > c.vista.fim) {
    const meio = (c.deMs + c.ateMs) / 2;
    const meia = Math.max(CONTEXTO_S * 1000, (c.ateMs - c.deMs) / 2 + 10_000);
    c.vista = {
      inicio: Math.max(c.limites.inicio, Math.min(c.deMs, meio - meia)),
      fim: Math.min(c.limites.fim, Math.max(c.ateMs, meio + meia)),
    };
  }
  $('barraClipe').querySelector('.seleccao').style.cssText =
    `left:${posClipe(c.deMs)}%;width:${Math.max(0.5, posClipe(c.ateMs) - posClipe(c.deMs))}%`;
  $('barraClipe').querySelector('.pega.de').style.left = `${posClipe(c.deMs)}%`;
  $('barraClipe').querySelector('.pega.ate').style.left = `${posClipe(c.ateMs)}%`;
  const dur = (c.ateMs - c.deMs) / 1000;
  $('tempoClipe').textContent = t('clipe.tempo', {
    de: relogioCurto(c.deMs), ate: relogioCurto(c.ateMs), dur: dur.toFixed(1), max: MAXIMO_S,
  });
  $('tempoClipe').classList.toggle('mau', dur >= MAXIMO_S);
  agendarChatDoClipe();
  agendarLegendaDoClipe();
}

/**
 * A prévia: o mesmo ângulo, no ponto onde o clipe começa. Com `fino`, salta mesmo para perto (a agulha
 * anda 0,1 s com Shift, e o salto de 0,3 s das pegas não a deixava mexer a imagem).
 */
function preverClipe(quandoMs, { fino = false } = {}) {
  const c = estado.clipe;
  if (!c) return;
  const linha = estado.linhas.find((l) => l.slug === c.canal);
  const r = onde(linha, quandoMs, { nudgeMs: estado.nudges[c.canal] || 0 });
  const v = $('previaClipe');
  porCabeca(quandoMs);
  if (r.estado !== 'toca') { v.pause?.(); return; }
  const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  const alvo = peca.escada[0] || peca.barato;
  // O tamanho vem do manifesto e não do vídeo: é o mesmo número, e chega
  // meia noite mais cedo. Sem isto o editor do 9:16 esperava por bytes.
  if (alvo.largura > 0 && alvo.altura > 0) { c.fonteW = alvo.largura; c.fonteH = alvo.altura; }
  // A cadência também vem do manifesto: é com ela que o 9:16 e o 16:9 gravados saem.
  c.fonteFps = alvo.fps;
  if (c.url !== alvo.url) {
    c.hls?.destroy();
    c.url = alvo.url;
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({ startPosition: r.tempoS, maxBufferLength: 20, backBufferLength: 30 });
      c.hls = hls;
      hls.loadSource(alvo.url);
      hls.attachMedia(v);
    } else {
      // Directo da CDN, que é outro domínio: sem `crossOrigin` a tela do 9:16
      // fica "suja" e o gravador não tira dela frame nenhum (ver
      // `renderizarGravado`).
      v.crossOrigin = 'anonymous';
      v.src = alvo.url;
    }
  }
  // O instante pedido, guardado: é por ele que o ▶ sabe se o salto já
  // assentou antes de começar a contar (ver `verClipe`).
  c.alvoS = r.tempoS;
  if (Math.abs(v.currentTime - r.tempoS) > (fino ? 0.04 : 0.3)) v.currentTime = r.tempoS;
  acordarPrevia();
}

/**
 * Um empurrão para o iPhone.
 *
 * Um `<video>` que nunca toca pode ficar sem carregar nada — no iOS o
 * `preload` é uma sugestão, e em poupança de energia é ignorado de vez. A
 * prévia aqui nunca toca (serve para mostrar um frame de cada vez), e por isso
 * ficava vazia: nem metadados, nem imagem, nem botão de exportar aceso.
 *
 * Um `play()` calado é permitido em qualquer lado, e um `pause()` logo a
 * seguir deixa tudo como estava — mas o browser já carregou. Não se faz se ele
 * estiver mesmo a ver o clipe: aí a pausa tirava-lhe o vídeo da frente.
 */
function acordarPrevia() {
  const v = $('previaClipe');
  if (estado.clipe?.aVer || estado.clipe?.aGravar || v.readyState >= 2) return;
  const p = v.play?.();
  // O `pause` é ADIADO — chega quando a promessa do `play` resolve, e isso
  // pode ser meio segundo depois. Se entretanto a gravação começou, este
  // pause cai a meio dela e congela o vídeo: o 9:16 saía com uma FOTO e sem
  // som, que foi exactamente o que ele apanhou no primeiro export a sério.
  p?.then?.(() => {
    if (!estado.clipe?.aVer && !estado.clipe?.aGravar) v.pause?.();
  })?.catch?.(() => {});
}

/**
 * Ver só o pedaço escolhido, com som, sem exportar nada.
 *
 * "Não tem um botão de play lá dentro para estar a ver o clipe pronto como
 *  está." Não tinha: a prévia servia só para mostrar UM frame de cada vez,
 * calada, enquanto se arrastavam as pegas.
 *
 * Duas coisas que não são óbvias e que custaram a acertar:
 *
 *  - A grelha continua a tocar por trás da janela. Sem a parar, ouviam-se dois
 *    sons ao mesmo tempo. Pára-se aqui, e só se retoma se tiver sido este
 *    botão a pará-la — quem já a tinha em pausa não quer que ela arranque.
 *  - O `currentTime` não vale nada no instante a seguir ao `preverClipe`:
 *    se a fonte mudou, o HLS ainda está a carregar e o relógio está a zero.
 *    Por isso o início só é lido quando o vídeo tem mesmo imagem.
 */
function verClipe(desdeMs) {
  const c = estado.clipe;
  if (!c || c.aGravar) return;
  const v = $('previaClipe');
  // Já a tocar (a agulha saltou a meio): recomeça dali, sem mexer outra vez na grelha.
  if (c.vigia) cancelAnimationFrame(c.vigia);
  if (!c.aVer) {
    c.retomar = !estado.parado;
    if (c.retomar) alternarPausa();
  }
  c.aVer = true;
  v.muted = false;
  const botao = $('verClipe');
  botao.textContent = '⏹';
  botao.setAttribute('aria-pressed', 'true');
  botao.title = t('clipe.parar');

  // Do sítio da agulha, se ela estiver dentro do pedaço e longe do fim; senão do início.
  const pedido = desdeMs ?? c.cabecaMs;
  const deMs = Number.isFinite(pedido) && pedido > c.deMs && pedido < c.ateMs - 500 ? pedido : c.deMs;
  preverClipe(deMs, { fino: true });
  const duracaoS = (c.ateMs - deMs) / 1000;
  let inicioS = null;
  let esperas = 0;
  // Onde o vídeo estava da última vez que andou, e desde quando.
  let ultimoS = null;
  let paradoDesde = 0;
  const vigiar = () => {
    if (!estado.clipe?.aVer) return;
    if (inicioS === null) {
      // Ter imagem não chega: a seguir a um salto o `readyState` já é 2 com o
      // frame ANTIGO ainda no ecrã, e o `currentTime` ainda é o de antes.
      // Começar a contar aí punha a cabeça a andar a partir do sítio errado —
      // e quando o salto era para trás ela ia parar À ESQUERDA do início,
      // fora do verde. Espera-se que o relógio chegue ao instante pedido.
      const assentou = v.readyState >= 2 && !v.seeking
        && (c.alvoS == null || Math.abs(v.currentTime - c.alvoS) < 1);
      // Dez segundos à espera e desiste — melhor parar do que ficar um botão
      // de stop aceso para sempre por cima de um vídeo que não veio. Se houver
      // imagem mas o relógio nunca bater certo, conta-se com o que há.
      if (!assentou && esperas++ < 600) { c.vigia = requestAnimationFrame(vigiar); return; }
      if (v.readyState < 2) { pararVer(); return; }
      inicioS = v.currentTime;
    }
    if (v.currentTime - inicioS >= duracaoS) { pararVer(); return; }
    // Um vídeo que acabou, deu erro ou deixou de andar também acaba aqui. Um
    // pedaço que atravessa uma reconexão chega ao fim da primeira peça antes
    // do fim do pedaço, e o ⏹ ficava aceso para sempre com a grelha parada
    // por trás. Cinco segundos sem andar é desistir, como na espera de cima.
    if (v.ended || v.error) { pararVer(); return; }
    const agora = performance.now();
    if (v.currentTime !== ultimoS) { ultimoS = v.currentTime; paradoDesde = agora; }
    else if (agora - paradoDesde > 5000) { pararVer(); return; }
    porCabeca(deMs + (v.currentTime - inicioS) * 1000);
    c.vigia = requestAnimationFrame(vigiar);
  };
  v.play?.()?.catch?.(() => {});
  c.vigia = requestAnimationFrame(vigiar);
}

/**
 * Parar de ver, e deixar tudo como estava antes. Sem `voltar`, a imagem fica onde está: é o que a agulha
 * pede quando se agarra nela a meio do vídeo.
 */
function pararVer({ voltar = true } = {}) {
  const c = estado.clipe;
  const v = $('previaClipe');
  if (c?.vigia) cancelAnimationFrame(c.vigia);
  const botao = $('verClipe');
  botao.textContent = '\u25B6';
  botao.setAttribute('aria-pressed', 'false');
  botao.title = t('clipe.ver');
  v.pause?.();
  v.muted = true;
  if (!c) return;
  c.vigia = null;
  const retomar = c.aVer && c.retomar;
  c.aVer = false;
  c.retomar = false;
  if (retomar) alternarPausa();
  if (voltar) preverClipe(c.deMs);
}

function arrastar(qual) {
  return (ev) => {
    ev.preventDefault();
    if (!estado.clipe || estado.clipe.aGravar) return;
    const barra = $('barraClipe');
    const mexer = (e) => {
      const r = barra.getBoundingClientRect();
      const x = Math.min(Math.max((e.clientX ?? e.touches?.[0]?.clientX) - r.left, 0), r.width);
      const { inicio, fim } = estado.clipe.vista;
      const ms = inicio + ((fim - inicio) * x) / r.width;
      Object.assign(estado.clipe, mover(estado.clipe, qual, ms, { limites: estado.clipe.limites }));
      pintarClipe();
      preverClipe(qual === 'de' ? estado.clipe.deMs : estado.clipe.ateMs);
    };
    const largar = () => {
      window.removeEventListener('pointermove', mexer);
      window.removeEventListener('pointerup', largar);
    };
    window.addEventListener('pointermove', mexer);
    window.addEventListener('pointerup', largar);
    mexer(ev);
  };
}

async function guardarClipe({ simples = null } = {}) {
  const c = estado.clipe;
  if (!c || c.aGravar || c.pararExportar) return;
  // Com o chat, os pixels mudam: o 16:9 grava-se como o 9:16, com o chat pintado em cada frame.
  if (c.chat?.ligado || c.legenda?.ligado) { await guardarRetrato({ deitado: true, simples }); return; }
  const linha = estado.linhas.find((l) => l.slug === c.canal);
  const nudge = estado.nudges[c.canal] || 0;
  // Fechar o editor (Esc, ✕, Cancelar) pára isto. E tudo o que vem depois de
  // um `await` só mexe no editor se ele ainda for ESTE: um 16:9 que acabava
  // tarde fechava o editor da kill seguinte, com o que ele lá tinha mexido.
  const controlo = new AbortController();
  c.pararExportar = () => controlo.abort();
  const aindaEste = () => estado.clipe === c && !controlo.signal.aborted;
  $('guardarClipe').disabled = true;
  $('estadoClipe').textContent = t('montagem.aPreparar');

  try {
    const plano = await planearCorte({
      linha, deMs: c.deMs + nudge, ateMs: c.ateMs + nudge, sinal: controlo.signal,
    });
    if (!aindaEste()) return;
    if (plano.estado !== 'ok') {
      $('estadoClipe').textContent = porqueNaoSaiu(plano);
      $('guardarClipe').disabled = false;
      return;
    }
    const r = await executarCorte(plano, {
      sinal: controlo.signal,
      aoProgresso: (p) => {
        if (aindaEste()) $('estadoClipe').textContent = t('montagem.pedacos', { prontos: p.prontos, total: p.total });
        simples?.aoProgresso?.({ feito: p.prontos, total: p.total });
      },
    });
    if (!aindaEste()) return;
    if (r.estado !== 'pronto') {
      $('estadoClipe').textContent = t('corte.incompleto', { obtidos: r.obtidos ?? 0, total: r.total ?? 0 });
      $('guardarClipe').disabled = false;
      return;
    }
    const nome = simples?.nome ? simples.nome(sufixoDe(r.tipo))
      : nomeDoClipe({ titulo: $('tituloClipe').value, canal: c.canal, quandoMs: c.deMs, sufixo: sufixoDe(r.tipo) });
    const blob = new Blob([r.bytes], { type: r.tipo });
    const url = guardarFicheiro(blob);
    const item = document.createElement('li');
    $('fila').prepend(item);
    // O editor deixa apurar ao décimo de segundo, e o ▶ toca exactamente o
    // pedaço escolhido; o ficheiro, sem recodificar, começa e acaba nos
    // pedaços de 10 s da Kick. Dito na linha do ficheiro, que é o que fica
    // depois de o editor fechar.
    const sobra = notaDaSobra(r.plano, { semMp4: r.semMp4 });
    linhaDeFicheiro(item, {
      nome,
      url,
      nota: `${(r.bytes.length / 1048576).toFixed(1)} MB, ${plano.qualidade.altura}p${plano.qualidade.fps}`
        + `, ${sobra.texto}`,
    });
    if (sobra.falta) item.querySelector('.nota')?.classList.add('mau');
    // Guardar já, sem obrigar a caçar o link na lista: quem carregou em
    // "Guardar clipe" quis o ficheiro, não uma linha para clicar depois.
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    simples?.aoPronto?.({ blob, nome, curto: sobra.falta ? sobra.texto : '' });
    c.pararExportar = null;
    // Com um 9:16 a gravar no mesmo editor, fechar era matá-lo.
    if (!c.aGravar) fecharClipe();
  } catch (e) {
    if (!aindaEste()) return;
    $('estadoClipe').textContent = porqueNaoSaiu({ estado: 'erro', erro: e.message });
    $('guardarClipe').disabled = false;
  } finally {
    c.pararExportar = null;
  }
}

// ── memória e limpeza ───────────────────────────────────────────────────────

/**
 * Um ficheiro pronto, e a conta da memória que ele custa.
 *
 * `createObjectURL` prende o Blob até alguém o soltar. Sem isto, uma noite de
 * trabalho enchia a memória do browser com clipes já guardados no disco, e a
 * página ia ficando lenta sem razão visível.
 */
/**
 * @param {Blob} blob
 * @param {boolean} auxiliar para um `Blob` que so aponta para outros que ja
 *   estao na conta. O ZIP da montagem e feito dos mesmos pedacos que ja estao
 *   na lista: conta-lo dizia-lhe "3 ficheiros, o dobro dos megas" quando estao
 *   dois na memoria. O endereco entra na lista na mesma — e preciso solta-lo.
 */
function guardarFicheiro(blob, { auxiliar = false } = {}) {
  const url = URL.createObjectURL(blob);
  estado.ficheiros.push({ url, bytes: blob.size, auxiliar });
  mostrarMemoria();
  return url;
}

/**
 * Uma linha de ficheiro pronto, com o seu próprio botão de apagar.
 *
 * "Limpar a lista" deitava tudo fora ou nada. Numa montagem de trinta clipes
 * há sempre dois ou três que não prestam, e apagar os bons com eles é pior do
 * que não ter botão nenhum.
 */
function linhaDeFicheiro(item, { nome, url, nota, momentoMs = null }) {
  item.innerHTML = `<a href="${escapar(url)}" download="${escapar(nome)}">${escapar(nome)}</a> `
    + `<span class="nota">${nota}</span>`
    // "Depois que eu clico exportar montagem, também queria um botão de editar
    // os clipes na exportação." Abre a mesma kill no editor; ao guardar e
    // exportar outra vez, sai por cima.
    + (momentoMs != null ? `<button class="editarUm">${t('fila.editar')}</button>` : '')
    + `<button class="apagarUm" title="${t('fila.apagarUm')}">✕</button>`;
  item.querySelector('.editarUm')?.addEventListener('click', () => {
    const m = estado.momentos.find((x) => x.ms === momentoMs);
    if (m) abrirClipe(m);
  });
  item.querySelector('.apagarUm').onclick = () => {
    // Soltar ESTE endereço: é o que devolve a memória deste ficheiro.
    URL.revokeObjectURL(url);
    estado.ficheiros = estado.ficheiros.filter((f) => f.url !== url);
    item.remove();
    mostrarMemoria();
  };
}

function mostrarMemoria() {
  const reais = estado.ficheiros.filter((f) => !f.auxiliar);
  const mb = reais.reduce((s, f) => s + f.bytes, 0) / 1048576;
  $('memoria').textContent = reais.length
    ? t('fila.memoria', { n: reais.length, mb: mb.toFixed(0) })
    : '';
  $('memoria').classList.toggle('mau', mb > 500);
}

function limparFila() {
  // Soltar cada endereço: e isto que devolve a memoria ao browser. Apagar so
  // a lista deixava os Blobs presos para sempre.
  for (const f of estado.ficheiros) URL.revokeObjectURL(f.url);
  estado.ficheiros = [];
  $('fila').innerHTML = '';
  // O ZIP tambem: deixar la o link depois de soltar o endereco dava um botao
  // que parecia bom e descarregava um ficheiro vazio.
  $('zip').innerHTML = '';
  mostrarMemoria();
}

/**
 * Recomeçar: apaga a sessão guardada e volta ao princípio.
 *
 * Pergunta primeiro, porque leva as kills marcadas — que é o que mais custa a
 * juntar e o que ninguém quer perder por engano.
 */
/** Pergunta numa janela própria, com o que vai ser apagado e o Cancelar em foco (o dono, 13/10). */
function confirmarRecomecar(quantas) {
  return new Promise((ok) => {
    const d = document.createElement('dialog');
    d.className = 'confirmarRecomecar';
    const itens = [t('recomecar.itemCanais'), t('recomecar.itemAjustes'), quantas ? t('recomecar.itemKills', { n: quantas }) : null].filter(Boolean);
    d.innerHTML = `<h2>${escapar(t('recomecar.titulo'))}</h2><p>${escapar(t('recomecar.diz'))}</p><ul>${itens.map((i) => `<li>${escapar(i)}</li>`).join('')}</ul>`
      + `<p class="nota">${escapar(t('recomecar.naoVolta'))}</p><div class="botoes"><button type="button" class="cancelar">${escapar(t('recomecar.cancelar'))}</button>`
      + `<button type="button" class="apagar">${escapar(t('recomecar.apagar'))}</button></div>`;
    document.body.append(d);
    const fim = (sim) => { d.close(); d.remove(); ok(sim); };
    d.querySelector('.cancelar').onclick = () => fim(false);
    d.querySelector('.apagar').onclick = () => fim(true);
    d.addEventListener('cancel', (e) => { e.preventDefault(); fim(false); });
    d.showModal();
    d.querySelector('.cancelar').focus();
  });
}

async function recomecar() {
  const quantas = unirMomentos(estado.momentos, estado.momentosFora).length;
  // Pergunta antes de apagar seja o que for: um Cancelar tem de deixar tudo
  // como estava, e apagava a memoria dos VODs, o que com quinhentos canais
  // eram quinhentos pedidos a Kick no Carregar seguinte.
  if (!(await confirmarRecomecar(quantas))) return;
  // O memo vai junto: Repor é a maneira de forçar a Kick outra vez.
  estado.vodsPorCanal.clear();
  estado.pecasLidas.clear();
  limparFila();
  semGuardar = true;
  clearTimeout(timerGuardar);
  try {
    for (const k of ['replay', 'replay.vods', 'replay.rolar']) localStorage.removeItem(k);
  } catch { /* janela privada */ }
  // Recomeçar é voltar à entrada: o evento guardado não pode reabrir sozinho a seguir.
  evento.esquecerEvento();
  location.href = location.pathname;
}

/**
 * Voltar à tela de entrada (as duas portas). Fecha a noite aberta e mais nada: o evento, se havia um,
 * volta aberto com o mapa, que é a tela de onde quase sempre se veio, e a memória dos VODs fica.
 * Só pergunta quando há kills marcadas, porque são elas que se perdem.
 */
function voltarAoInicio() {
  const quantas = unirMomentos(estado.momentos, estado.momentosFora).length;
  if (quantas && !confirm(t('inicio.comKills', { n: quantas }))) return;
  limparFila();
  // Como no Recomeçar: o `beforeunload` escrevia a noite outra vez, e ela voltava ao recarregar.
  semGuardar = true;
  clearTimeout(timerGuardar);
  try { localStorage.removeItem('replay'); } catch { /* janela privada */ }
  // Sem o ?s= nem o #evento= do endereço, senão a noite voltava logo a seguir.
  location.href = location.pathname;
}

// Uma janela para os testes olharem para dentro. Sem isto, verificar que a
// previa arranca no sitio certo obrigava a adivinhar pelo texto do ecra.
window.__estado = estado;

// ── ligações ────────────────────────────────────────────────────────────────

$('carregar').onclick = carregar;
$('parar').onclick = () => estado.cancelar?.();

/**
 * Passar esta noite pronta a outra pessoa.
 *
 * "Queria passar essa configuração pronta assim, com todos esses streamers e
 *  dia, para outros streamers testarem. Tem como?"
 *
 * Tinha — e já tinha antes de ele perguntar: a página lê `?s=` desde sempre,
 * e era assim que ela se restaurava a si própria. Só nunca houve um botão, o
 * que na prática é o mesmo que não existir.
 *
 * O que vai no link não é a lista de nomes: é o TRABALHO. Colar trinta nomes
 * é chato mas é um minuto; os dezasseis ajustes que ele acertou um a um
 * custaram-lhe a noite, e sem eles quem abrir o link vê os mesmos trinta
 * ângulos desalinhados que ele viu no princípio.
 *
 * Vai a noite e vão os ajustes; NÃO vão as kills marcadas, o volume nem o
 * ângulo em foco. Isso é a sessão dele, não a configuração — e trezentas kills
 * num endereço fariam um link que não cabe numa mensagem.
 */
/* O que o link leva, escrito ao lado do botão.
   "Na parte do link deveria estar escrito: partilhar projeto atual com (x)
    transmissões, data (x), tempo atual de reprodução (x)."
   Tinha razão — o botão dizia "Copiar link" e mais nada, e ninguém copia um
   link sem saber o que vai dentro. As três coisas que ele nomeou são as três
   que o `paraLink` mesmo guarda, por isso a frase não promete nada a mais.
   Vive na mesma caixa onde aparece o "copiado": é a única folga que a barra
   de cima tem, e a mensagem de copiado volta a dar lugar à frase ao fim de
   quatro segundos. */
let voltarAPartilha = 0;
function pintarPartilha() {
  const nota = $('estadoPartilha');
  if (voltarAPartilha) return;
  // O dono (13/10): a frase fixa ("1 transmissões, data, hora") não ajudava; só o "copiado" aparece aqui.
  nota.textContent = '';
}

function linkDaNoite() {
  if (!estado.linhas.length || !estado.janela) return '';
  // Com as kills marcadas e as margens (o teste real de 12/10: o link saía com "momentos":[]).
  const magro = paraLink({
    canais: estado.linhas.map((l) => l.slug),
    janela: estado.janela,
    nudges: estado.nudges,
    agoraMs: estado.agoraMs,
    margens: estado.margens,
    momentos: momentosParaLink(estado.momentos),
  });
  const base = `${location.origin}${location.pathname}`;
  // Depois do #, e nao no ?s=: o que vem depois do # nao vai ao servidor. Uma
  // noite de quinhentos canais da um link de trinta mil letras, e o GitHub
  // Pages responde 414 a partir das oito mil.
  return `${base}#s=${encodeURIComponent(magro)}`;
}

$('partilhar').onclick = async () => {
  const u = linkDaNoite();
  if (!u) return;
  const nota = $('estadoPartilha');
  try {
    await navigator.clipboard.writeText(u);
    nota.textContent = t('partilha.copiado');
    nota.classList.remove('mau');
    clearTimeout(voltarAPartilha);
    voltarAPartilha = setTimeout(() => { voltarAPartilha = 0; pintarPartilha(); }, 4000);
  } catch {
    // Sem permissão para a área de transferência — acontece em http e em
    // alguns telemóveis. Pôr o link na barra de endereço é o plano B honesto:
    // fica lá para ele copiar à mão em vez de um erro que não resolve nada.
    history.replaceState(null, '', u);
    nota.textContent = t('partilha.falhou');
    nota.classList.add('mau');
    // E fica lá tempo para se ler. Sem isto o relógio da grelha reescrevia a
    // frase do link no segundo seguinte, e ele nunca sabia onde o link foi parar.
    clearTimeout(voltarAPartilha);
    voltarAPartilha = setTimeout(() => { voltarAPartilha = 0; pintarPartilha(); }, 15_000);
  }
};
// Qualquer navegacao a mao desliga a previa: se ele foi procurar outra coisa,
// nao pode ficar a ser puxado de volta para o clipe em ciclo.
const largarPrevia = () => { if (estado.previa) { estado.previa = null; pintarMomentos(); } };
$('barra').oninput = () => {
  // Na VISTA e não na noite: com a linha do tempo em dez minutos, a barra
  // inteira passa a valer dez minutos — que é o que a torna precisa.
  const { inicio, fim } = vistaAgora() || {};
  if (inicio == null) return;
  largarPrevia();
  irPara(Math.round(inicio + ((fim - inicio) * Number($('barra').value)) / 1000));
};
// Os saltos que faltavam. A barra serve para procurar a noite; isto serve para
// caçar o momento, que é uma coisa diferente e a barra faz mal.
const saltar = (ms) => () => { largarPrevia(); irPara(estado.agoraMs + ms); };
$('filtrarGrelha').oninput = pintarFiltroDaGrelha;
try { estado.zoomS = Math.max(0, Number(localStorage.getItem('replay.zoom')) || 0); } catch { /* nada */ }
ligarZoom();
pintarZoom();
$('menos1m').onclick = saltar(-60_000);
$('mais1m').onclick = saltar(60_000);
// "Adiciona botão de 3 segundos pra trás e 3 pra frente, e 5 minutos pra trás
// e 5 minutos pra frente." Cinco minutos para achar o sítio; três segundos
// para apurar sem saltar por cima da kill.
$('menos5m').onclick = saltar(-300_000);
$('mais5m').onclick = saltar(300_000);
$('menos3s').onclick = saltar(-3_000);
$('mais3s').onclick = saltar(3_000);
$('tocarPausar').onclick = () => alternarPausa();
pintarTocarPausar();
$('marcarIn').onclick = () => { estado.marca = { de: estado.agoraMs, ate: null }; pintarMarca(); guardar(); };
$('marcarOut').onclick = () => { estado.marca.ate = estado.agoraMs; pintarMarca(); guardar(); };
$('alinhar').onclick = alinhar;
$('marcarKill').onclick = marcarKill;
$('marcarAoVivo').onclick = marcarAoVivo;
// O resumo tem de acompanhar as caixas, senão fechá-las mente sobre o que lá está.
// As margens só aparecem depois da primeira kill (o dono, 07/10), e cada kill guarda as suas ao ser
// marcada. Mudar as margens passa então para as kills que ainda têm as de antes; as que foram
// acertadas uma a uma ficam como estão.
let margensDeAntes = tamanhos();
function mudarMargens() {
  const novas = tamanhos();
  let mudou = false;
  for (const m of estado.momentos) {
    for (const [k, v] of Object.entries(novas)) {
      if (m[k] === margensDeAntes[k] && v !== m[k]) { m[k] = v; mudou = true; }
    }
  }
  margensDeAntes = novas;
  pintarResumoMargens();
  if (mudou) { guardar(); pintarMomentos(); }
}
for (const id of ['protAntes', 'protDepois', 'vitAntes', 'vitDepois']) {
  $(id).addEventListener('input', mudarMargens);
}
pintarResumoMargens();
$('apagarSelecionados').onclick = apagarSelecionados;
$('anularApagar').onclick = anularApagar;
$('selecionarNada').onclick = () => { estado.selecao.clear(); pintarMomentos(); };
// "Seleccionar tudo" e tudo o que ESTA A VER. Com o filtro em "faltam decidir"
// isto mais o apagar e o gesto que limpa uma noite varrida de uma vez, e se
// seleccionasse tambem o que esta escondido apagava-lhe o trabalho bom.
$('selecionarTudo').onclick = () => {
  for (const m of filtrar(estado.momentos, estado.filtro)) estado.selecao.add(m.ms);
  pintarMomentos();
};
$('filtroMomentos').onchange = (e) => {
  estado.filtro = e.target.value;
  try { localStorage.setItem('replay.filtro', estado.filtro); } catch { /* janela privada */ }
  pintarMomentos();
};
$('procurarKills').onclick = procurarKills;
// O menu Ferramentas fecha ao escolher um item e ao tocar fora dele.
{
  const menu = document.querySelector('details.ferramentas');
  menu?.querySelector('.ferramentasMenu').addEventListener('click', (e) => { if (e.target.closest('button')) menu.open = false; });
  document.addEventListener('pointerdown', (e) => { if (menu?.open && !menu.contains(e.target)) menu.open = false; });
  menu?.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { e.stopPropagation(); menu.open = false; menu.querySelector('summary').focus(); } });
}
// Seta, e nao a funcao directamente: o `onclick` passa o evento como primeiro
// argumento, e ele ia parar ao `soEsta` como se fosse uma lista de kills.
try {
  const f = localStorage.getItem('povix.formato');
  if (['ambos', '16x9-um', 'ambos-um'].includes(f)) $('formatoMontagem').value = f;
} catch { /* janela privada */ }
$('formatoMontagem').onchange = () => {
  try { localStorage.setItem('povix.formato', $('formatoMontagem').value); } catch { /* janela privada */ }
};
$('baixarMontagem').onclick = () => (estado.montagem ? estado.montagem.abort() : baixarMontagem());
$('guardarLances').onclick = () => (estado.montagem ? estado.montagem.abort() : baixarMontagem(null, { guardar: true }));
$('limparFila').onclick = limparFila;

// ── Montagem e Exportar, dois separadores no mesmo painel ─────────────────────
// O dono (10/10): as tarefas com nomes claros, e um painel que não seja uma pilha de caixas. A troca é
// sozinha quando a tarefa muda: marcar uma kill mostra a Montagem, e um trecho marcado com entrada e
// saída mostra o Exportar, onde ele se exporta por ângulo. Um arquivo pronto só acende o separador.
function mostrarPainel(nome, { focar = false } = {}) {
  if (!PAINEIS[nome]) return;
  for (const [chave, [aba, painel]] of Object.entries(PAINEIS)) {
    const sim = chave === nome;
    $(aba).setAttribute('aria-selected', String(sim));
    $(aba).tabIndex = sim ? 0 : -1;
    $(painel).hidden = !sim;
    if (sim) $(aba).classList.remove('novidade');
  }
  if (focar) $(PAINEIS[nome][0]).focus();
}
for (const [nome, [aba]] of Object.entries(PAINEIS)) $(aba).onclick = () => mostrarPainel(nome);
// As setas andam entre os separadores, como em qualquer lista de separadores (WAI-ARIA).
document.querySelector('.abasTrabalho').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  const nomes = Object.keys(PAINEIS);
  const agora = nomes.findIndex((n) => $(PAINEIS[n][0]).getAttribute('aria-selected') === 'true');
  const i = e.key === 'Home' ? 0 : e.key === 'End' ? nomes.length - 1
    : (agora + (e.key === 'ArrowRight' ? 1 : -1) + nomes.length) % nomes.length;
  mostrarPainel(nomes[i], { focar: true });
});
// Quantos arquivos há na lista, no separador; e a frase de lista vazia quando não há nada.
function pintarContaExportar() {
  const n = $('fila').querySelectorAll(':scope > li').length;
  $('contaExportar').textContent = n ? String(n) : '';
  $('filaVazia').hidden = n > 0 || !$('corte').hidden;
}
new MutationObserver((mudancas) => {
  // Um arquivo novo não tira a pessoa da Montagem (ela pode estar a exportar kill a kill): o separador
  // Exportar acende, com a conta, até ser aberto.
  if ($('exportacoes').hidden && mudancas.some((m) => [...m.addedNodes].some((no) => no.nodeName === 'LI'))) {
    $('abaExportar').classList.add('novidade');
  }
  pintarContaExportar();
}).observe($('fila'), { childList: true });
new MutationObserver(() => {
  if (!$('corte').hidden) mostrarPainel('exportar');
  pintarContaExportar();
}).observe($('corte'), { attributes: true, attributeFilter: ['hidden'] });
pintarContaExportar();
$('lerChat').onclick = () => abrirAssistente('chat');
// Sem argumento nenhum, e não `= abrirClipe`: assim o objecto do clique ia
// como momento, e um dia em que ele passe a ter um `.ms` isto abre o clipe no
// sítio errado sem avisar ninguém.
/**
 * Colar um link da Kick e abri-lo pronto a cortar.
 *
 * "A pessoa cola o link do clip ou VOD, você carrega e abre o como se tivesse
 *  clicado em clip pra pessoa baixar."
 *
 * Um clipe da Kick é uma playlist HLS com os mesmos `EXT-X-PROGRAM-DATE-TIME`
 * dos VODs — medido, incluindo `access-control-allow-origin: *` na playlist e
 * nos segmentos. Ou seja: entra no MESMO relógio e no mesmo editor, e não
 * precisa de um caminho à parte nem de servidor nenhum. Aparece como mais um
 * ângulo, com o nome do canal e um `·clipe` atrás para se distinguir do VOD
 * inteiro do mesmo canal.
 */
/** Um clipe da Kick como mais um ângulo, no mesmo relógio (ver `abrirLinkKick`). Também do modo simples. */
async function carregarClipeDaKick(id) {
  const c = await clipeDaKick(id);
  const playlist = lerPlaylist(await (await fetch(c.m3u8)).text(), c.m3u8);
  if (!Number.isFinite(playlist.inicio)) throw new Error('clipe sem relógio');
  const degrau = { url: c.m3u8, largura: DESCONHECIDO, altura: DESCONHECIDO };
  const peca = { vod: { id: c.id }, playlist, escada: [degrau], barato: degrau };
  const slug = `${c.canal}·clipe`;
  estado.linhas = [
    ...estado.linhas.filter((l) => l.slug !== slug),
    { ...linhaDoCanal(slug, [peca]), pecasCompletas: [peca] },
  ];
  estado.focos = [slug];
  estado.janela = janelaComum(estado.linhas);
  estado.agoraMs = playlist.inicio;
  mostrarPalco();
  montarGrade();
  seguirVideo();
  pintarConfianca();
  estado.vista = null;
  estado.agoraMs = playlist.inicio;
  acertarVista({ forcar: true });
  irPara(playlist.inicio);
  pintarMomentos();
  guardar();
  return { c, slug, playlist };
}

async function abrirLinkKick() {
  const nota = $('estadoLink');
  const botao = $('abrirLink');
  const lido = lerLinkKick($('linkKick').value);
  nota.classList.remove('mau');
  if (!lido) { nota.classList.add('mau'); nota.textContent = t('link.naoPercebi'); return; }

  if (lido.tipo === 'canal') {
    // Um canal não tem nada de especial: é o caminho normal, com a caixa cheia.
    $('canais').value = [$('canais').value.trim(), lido.slug].filter(Boolean).join('\n');
    nota.textContent = '';
    // Directo, e não pelo botão: com uma carga a meio o botão está cinzento e
    // o clique não fazia nada.
    carregar();
    return;
  }
  if (lido.tipo === 'vod') {
    // Um VOD identifica um canal e uma noite. A página já sabe carregar a noite
    // inteira de um canal — e é isso que ele quer de um VOD, porque é assim que
    // pode escolher qualquer pedaço dele.
    try {
      botao.disabled = true;
      nota.textContent = t('link.aLer');
      const { slug, inicioMs } = await vodDaKick(lido.id, { slug: lido.slug });
      const ja = listaDeCanais().map(slugDoNome);
      if (!ja.includes(slugDoNome(slug))) {
        $('canais').value = [$('canais').value.trim(), slug].filter(Boolean).join('\n');
      }
      nota.textContent = '';
      // A noite DESTE vídeo, e não a mais recente do canal: o `carregar` volta
      // à noite onde cai o instante a restaurar. As kills que já havia vão
      // junto, e as de fora da noite ficam guardadas (ver `momentosFora`).
      if (inicioMs != null) {
        estado.restaurar = {
          agora: inicioMs, focos: [slugDoNome(slug)], marca: null,
          momentos: estado.momentos,
        };
      }
      carregar();
    } catch (e) {
      nota.classList.add('mau');
      nota.textContent = e.name === 'SEM-VOD' ? t('link.semVod') : t('link.erroVod');
    } finally { botao.disabled = false; }
    return;
  }

  try {
    botao.disabled = true;
    nota.textContent = t('link.aLer');
    const { c, slug, playlist } = await carregarClipeDaKick(lido.id);
    nota.textContent = t('link.clipeAberto', {
      canal: c.canal, dur: Math.round(c.duracaoS || (playlist.fim - playlist.inicio) / 1000),
    });
    abrirClipe({ ms: playlist.inicio, protagonista: slug,
      combateDeMs: playlist.inicio, combateAteMs: playlist.fim });
  } catch (e) {
    nota.classList.add('mau');
    // Uma mensagem deste caixa, e não a da sincronia: essa dizia "a sincronia
    // falhou, alinhe à mão", que não é o que falhou nem o que resolve, e
    // colava o erro cru ("Failed to fetch", "clipe sem relógio") no meio do
    // inglês e do espanhol.
    nota.textContent = e.name === 'SEM-CLIPE' ? t('link.semClipe') : t('link.erro');
  } finally { botao.disabled = false; }
}
$('abrirLink').onclick = abrirLinkKick;
$('linkKick').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); abrirLinkKick(); } };
$('clipar').onclick = () => abrirClipe();
$('angulosSeguido').onclick = () => guardarAngulos('seguido');
$('angulosEmpilhado').onclick = () => guardarAngulos('empilhado');
$('fecharClipe').onclick = fecharClipe;
/**
 * Guardar na kill o que ele apurou, sem exportar nada.
 *
 * "Quando eu clico em ajeitar e ajeito, quero um botão pra salvar alteração;
 *  aí vou fazendo em tudo e depois baixo tudo junto." É o fluxo certo para
 * trinta kills: apurar uma a uma custa atenção, exportar custa tempo de
 * máquina — e as duas coisas não têm de andar juntas. O enquadramento do
 * 9:16 vai junto: se ele o mexeu, é porque quer o vertical dessa kill.
 */
function guardarAjustes() {
  const c = estado.clipe;
  if (!c || c.momentoMs == null || c.aGravar) return;
  const m = estado.momentos.find((x) => x.ms === c.momentoMs);
  if (!m) return;
  // O ajuste vale para o clipe do ângulo em que foi feito (ver
  // `clipesDoMomento`). Um ângulo que não entra nesta kill não tem clipe nenhum
  // onde o pôr: guardá-lo era perder o trabalho em silêncio.
  if (c.canal !== m.protagonista && !(m.vitimas || []).includes(c.canal)) {
    $('estadoClipe').textContent = t('clipe.anguloForaDaKill', { canal: c.canal });
    return;
  }
  // O 9:16 só vai junto se ele mexeu nele (ver `retratoMexido`).
  const querRetrato = c.retratoMexido && c.rects.length > 0;
  estado.momentos = estado.momentos.map((x) => (x.ms === c.momentoMs
    ? comAjuste(x, {
      deMs: c.deMs, ateMs: c.ateMs, canal: c.canal,
      formato: querRetrato ? c.modo : null, rects: c.rects, divisao: c.divisao,
      chat: c.chat?.ligado ? c.chat : null,
      // A legenda vai com o texto corrigido: é trabalho dele, e a montagem desenha-o igual.
      legenda: c.legenda?.ligado ? { ...c.legenda, transcricao: c.transcricao } : null,
    })
    : x));
  const n = ordenar(estado.momentos).findIndex((x) => x.ms === c.momentoMs) + 1;
  guardar();
  pintarMomentos();
  fecharClipe();
  $('estadoMontagem').classList.remove('mau');
  $('estadoMontagem').textContent = t('clipe.ajustesGuardados', { n });
}
$('guardarAjustes').onclick = guardarAjustes;
$('cancelarClipe').onclick = fecharClipe;
// Parar a gravação sem fechar o editor: os ajustes voltam e o clipe fica como estava.
$('pararGravandoClipe').onclick = () => {
  if (!estado.clipe?.pararGravacao) return;
  estado.clipe.pararGravacao();
  $('estadoClipe').textContent = t('clipe.gravacaoParada');
};
$('guardarClipe').onclick = () => guardarClipe();
$('guardarRetrato').onclick = () => guardarRetrato();
for (const b of document.querySelectorAll('.modoRetrato')) {
  b.onclick = () => trocarModo(b.dataset.modo);
}
for (const b of document.querySelectorAll('.modeloWebcam')) {
  b.onclick = () => escolherModelo(b.dataset.modelo);
}
$('voltarModelo').onclick = voltarAoModelo;
$('acharWebcam').onclick = acharWebcam;
// A ordem, e a preferência guardada no dispositivo.
for (const b of document.querySelectorAll('.ordemGrelha')) {
  b.onclick = () => {
    estado.ordemGrelha = b.dataset.ordem;
    try { localStorage.setItem('replay.ordem', estado.ordemGrelha); } catch { /* janela privada */ }
    pintarOrdemDaGrelha();
  };
}

ligarDivisor();
// O divisor é medido em pixels do ecrã: se a janela muda de tamanho, a conta
// deixa de bater certo e o pill fica ao lado da linha por onde o vídeo parte.
window.addEventListener('resize', () => { if (estado.clipe) pintarDivisor(); });
$('canalClipe').onchange = () => {
  const c = estado.clipe;
  const l = estado.linhas.find((x) => x.slug === $('canalClipe').value);
  if (!l || !c) return;
  if (c.aGravar) { $('canalClipe').value = c.canal; return; }
  c.hls?.destroy();
  // Cada streamer tem o seu enquadramento: a webcam de um não está no mesmo sítio que a do outro, e
  // acertar um estragava o outro (o dono, 10/10). Guarda-se o deste e volta o do outro, ou nenhum,
  // e aí o `prepararRetrato` faz o de partida quando o vídeo novo disser o tamanho.
  c.porCanal = c.porCanal || {};
  c.porCanal[c.canal] = {
    rects: c.rects.map((r) => ({ ...r })), rectsFonte: c.rectsFonte, divisao: c.divisao, modo: c.modo, modelo: c.modelo,
    origem: c.origem,
  };
  const guardado = c.porCanal[l.slug];
  // Sem nada nesta sessão do editor, o que o streamer tem guardado no aparelho (o modelo aqui; os
  // recortes vêm no `prepararRetrato`, quando se souber o tamanho do vídeo dele).
  const doAparelho = guardado ? null : encaixeDe(l.slug);
  const mesmoModo = guardado && guardado.modo === c.modo;
  c.rects = mesmoModo ? guardado.rects.map((r) => ({ ...r })) : [];
  c.rectsFonte = mesmoModo ? guardado.rectsFonte : null;
  if (mesmoModo) { c.divisao = guardado.divisao; c.origem = guardado.origem; }
  c.modelo = limparModelo(guardado ? guardado.modelo : doAparelho?.modelo);
  Object.assign(c, { canal: l.slug, hls: null, url: null,
    limites: c.canaisClipe?.length ? c.limites : { inicio: l.inicio, fim: l.fim } });
  // O pedaço inteiro para dentro do vídeo do outro, e não só o início: com o
  // `mover` de uma pega só, um ângulo que entrou no ar depois do fim dava um
  // pedaço ao contrário, e o exportar respondia "janela-invalida".
  Object.assign(c, dentroDosLimites(c, c.limites));
  pintarClipe();
  preverClipe(c.deMs);
  // Sem `acertarRecortes` aqui: o vídeo ainda é o do canal anterior, e escalar pelo tamanho dele
  // estragava o enquadramento guardado. O ouvinte de metadados do `prepararRetrato` acerta-o.
  pintarModos();
  pintarRecortes();
  pintarDivisor();
  // O texto da legenda é da voz de quem estava: com outro ângulo, a página diz que é preciso ouvir este.
  c.legendaGerar?.controlo.abort();
  pintarLegendaClipe();
  // A webcam procurada era a do outro streamer: a deste procura-se quando o vídeo dele disser o tamanho.
  c.rostoBusca?.abort();
  avisarWebcam('');
};
$('barraClipe').querySelector('.pega.de').onpointerdown = arrastar('de');
$('barraClipe').querySelector('.pega.ate').onpointerdown = arrastar('ate');

// ── a agulha do clipe: assistir pulando ─────────────────────────────────────
//
// O dono (10/10): ver o clipe a saltar para o ponto que quiser. A agulha é a da linha do tempo (a cabeça e
// a linha), na mesma conta de posição das pegas; arrasta-se com o mouse e o dedo, e clicar na barra fora
// das pegas leva-a ali. Fica sempre dentro do pedaço escolhido, que é o que o vídeo do clipe mostra.

/** Levar a agulha (e a imagem) a um instante. A tocar, o vídeo continua dali. */
function levarAgulha(ms) {
  const c = estado.clipe;
  if (!c || c.aGravar) return;
  const alvo = Math.min(Math.max(ms, c.deMs), c.ateMs);
  if (c.aVer) { verClipe(alvo); return; }
  preverClipe(alvo, { fino: true });
}

/** O instante debaixo do ponteiro: a mesma conta das pegas (ver `arrastar`). */
function instanteNaBarra(e) {
  const r = $('barraClipe').getBoundingClientRect();
  const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
  const { inicio, fim } = estado.clipe.vista;
  return inicio + ((fim - inicio) * x) / Math.max(1, r.width);
}

$('barraClipe').addEventListener('pointerdown', (ev) => {
  const c = estado.clipe;
  // As pegas têm o seu arrasto, e um toque nelas nunca pode levar a agulha (nem o contrário).
  if (!c || c.aGravar || ev.target.closest('.pega') || ev.button > 0) return;
  ev.preventDefault();
  const barra = $('barraClipe');
  // Agarrada a tocar: pára enquanto se arrasta, e continua de onde se largar.
  const voltarAVer = c.aVer;
  if (voltarAVer) pararVer({ voltar: false });
  barra.classList.add('aArrastar');
  $('agulhaClipe').focus({ preventScroll: true });
  const mexer = (e) => { if (estado.clipe === c) levarAgulha(instanteNaBarra(e)); };
  const largar = () => {
    window.removeEventListener('pointermove', mexer);
    window.removeEventListener('pointerup', largar);
    window.removeEventListener('pointercancel', largar);
    barra.classList.remove('aArrastar');
    if (voltarAVer && estado.clipe === c) verClipe(c.cabecaMs);
  };
  window.addEventListener('pointermove', mexer);
  window.addEventListener('pointerup', largar);
  window.addEventListener('pointercancel', largar);
  mexer(ev);
});

// Com foco, as setas andam 1 s (com Shift, 0,1 s); Home e End vão ao início e ao fim do pedaço.
$('agulhaClipe').addEventListener('keydown', (e) => {
  const c = estado.clipe;
  if (!c || c.aGravar) return;
  const passo = e.shiftKey ? 100 : 1000;
  const aqui = c.cabecaMs ?? c.deMs;
  const alvo = {
    ArrowLeft: aqui - passo, ArrowDown: aqui - passo, ArrowRight: aqui + passo, ArrowUp: aqui + passo,
    Home: c.deMs, End: c.ateMs,
  }[e.key];
  if (alvo == null) return;
  e.preventDefault();
  e.stopPropagation();
  levarAgulha(alvo);
});
// "Os botões que estão lá dentro −1 segundo e +1 segundo só mexem no final do
// vídeo." Mexiam: estavam presos ao `ate`. E depois de mexerem, a imagem
// ficava onde estava — "não aparece na tela onde acaba, e é bom de ver".
//
// Agora são quatro, com o nome da ponta à frente, e CADA UM LEVA A IMAGEM ao
// sítio que acabou de mexer. É o que a Twitch e o YouTube fazem quando se
// arrasta uma pega: o vídeo mostra o frame de onde a pega está. Sem isso,
// apurar o fim é adivinhar.
for (const [id, qual, delta] of [
  ['inicioMenos', 'de', -1], ['inicioMais', 'de', 1],
  ['fimMenos', 'ate', -1], ['fimMais', 'ate', 1],
]) {
  $(id).onclick = (e) => {
    if (!estado.clipe || estado.clipe.aGravar) return;
    // Meio segundo, e não um. "Fiz o teste, às vezes um segundo passa do ponto
    // que eu quero" — e passa mesmo: entre o disparo e a morte cabem menos de
    // dois segundos, e um passo de um segundo salta metade disso de uma vez.
    // Com Shift são 0,1 s, que é onde ele acaba de apurar.
    const passo = delta * (e.shiftKey ? 100 : 500);
    const agora = qual === 'de' ? estado.clipe.deMs : estado.clipe.ateMs;
    Object.assign(estado.clipe, mover(estado.clipe, qual, agora + passo,
      { limites: estado.clipe.limites }));
    pintarClipe();
    preverClipe(qual === 'de' ? estado.clipe.deMs : estado.clipe.ateMs);
  };
}
$('verClipe').onclick = () => (estado.clipe?.aVer ? pararVer() : verClipe());
$('modalClipe').onclick = (e) => { if (e.target === $('modalClipe')) fecharClipe(); };
$('recomecar').onclick = recomecar;
$('inicio').onclick = voltarAoInicio;

/**
 * Os formulários de canais, atrás de um botão, enquanto há vídeo na tela.
 *
 * A porta de entrada (colar link, procurar canal, lista) ocupava
 * metade da primeira tela em 390 px e uma faixa inteira em 1440. Com um vídeo
 * aberto quem trabalha precisa dele e da linha do tempo; para mudar os canais
 * abre-se isto, como o painel de projeto de um editor. A classe é
 * do `body` e só tem efeito com o palco aberto (estilo.css).
 */
function alternarCanais(abrir) {
  const aberto = abrir ?? !document.body.classList.contains('canaisAbertos');
  document.body.classList.toggle('canaisAbertos', aberto);
  $('editarCanais').setAttribute('aria-expanded', String(aberto));
  if (aberto && !$('palco').hidden) {
    // Com o painel aberto o foco vai para o primeiro campo, e não fica num botão que acabou de sumir de lugar.
    ($('procurar') || $('canais')).focus({ preventScroll: false });
  }
}
$('editarCanais').onclick = () => alternarCanais();
// O vídeo aberto também como classe do `body`, ao lado do `:has(#palco:not([hidden]))` do estilo.css: num
// navegador sem `:has()` (Safari antes do 15.4, Firefox antes do 121) a tela do vídeo continua arrumada.
const marcarVideoAberto = () => document.body.classList.toggle('videoAberto', !$('palco').hidden);
new MutationObserver(marcarVideoAberto).observe($('palco'), { attributes: true, attributeFilter: ['hidden'] });
marcarVideoAberto();
// Os dois caminhos da tela inicial: Evento inteiro e VOD ou poucos canais (portas.js).
montarPortas();

const alternarAjuda = (abrir) => {
  if (abrir) {
    painelAtalhos.pintar();
    mostrarDialogo($('modalAjuda'));
  } else {
    painelAtalhos.largar();
    esconderDialogo($('modalAjuda'));
  }
};

// ── o foco do teclado dentro das janelas ────────────────────────────────────
//
// As duas janelas dizem `aria-modal` mas o foco ficava na página de trás: o
// leitor de ecrã lia o que estava por baixo, e o Tab saía da janela para os
// links da página. Ao abrir, o foco entra; enquanto está aberta, o Tab dá a
// volta lá dentro; ao fechar, volta para onde estava.
const FOCAVEIS = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
function focaveisDe(modal) {
  return [...modal.querySelectorAll(FOCAVEIS)].filter((el) => !el.closest('[hidden]') && el.getClientRects().length);
}
function mostrarDialogo(modal) {
  if (!modal.hidden) return;
  const ativo = document.activeElement;
  modal.voltarA = ativo && ativo !== document.body ? ativo : null;
  modal.hidden = false;
  const caixa = modal.querySelector('[role="dialog"]') || modal;
  if (!caixa.hasAttribute('tabindex')) caixa.setAttribute('tabindex', '-1');
  caixa.focus({ preventScroll: true });
}
function esconderDialogo(modal) {
  if (modal.hidden) return;
  modal.hidden = true;
  const volta = modal.voltarA;
  modal.voltarA = null;
  if (volta?.isConnected && !volta.closest('[hidden]')) volta.focus({ preventScroll: true });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const modal = [...document.querySelectorAll('.modal')].find((m) => !m.hidden);
  if (!modal) return;
  const lista = focaveisDe(modal);
  if (!lista.length) { e.preventDefault(); return; }
  const primeiro = lista[0];
  const ultimo = lista[lista.length - 1];
  const dentro = modal.contains(document.activeElement);
  if (e.shiftKey && (!dentro || document.activeElement === primeiro
    || document.activeElement === modal.querySelector('[role="dialog"]'))) {
    e.preventDefault(); ultimo.focus();
  } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
    e.preventDefault(); primeiro.focus();
  }
});
$('ajuda').onclick = () => alternarAjuda(true);
$('fecharAjuda').onclick = () => alternarAjuda(false);
$('modalAjuda').onclick = (e) => { if (e.target.id === 'modalAjuda') alternarAjuda(false); };

// Onde se escreve, a tecla é do texto. Um `input` de escrever, e não todos: o
// cursor da barra, o volume e as caixas das kills também são INPUT, e com eles
// em foco os atalhos morriam até se clicar noutro sítio. O `select` também não
// é sítio de escrever: o zoom, o filtro das kills e a noite ficam com o foco
// depois de escolhidos com o rato, e com eles os atalhos morriam do mesmo modo.
const ESCREVER = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week)$/;
function ondeSeEscreve(el) {
  if (!el?.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && ESCREVER.test(el.type || 'text');
}

// Quem chegou a um botão pelo Tab, e quem lá ficou de um clique. O
// `:focus-visible` não serve: o Chromium passa a dá-lo a QUALQUER foco assim
// que se carrega numa tecla, e o espaço deixava de pausar depois de um clique.
const focadosPeloTeclado = new WeakSet();
let ultimoFoiTeclado = false;
document.addEventListener('keydown', (e) => { if (e.key === 'Tab') ultimoFoiTeclado = true; }, true);
document.addEventListener('pointerdown', () => { ultimoFoiTeclado = false; }, true);
document.addEventListener('focusin', (e) => {
  if (ultimoFoiTeclado) focadosPeloTeclado.add(e.target);
  else focadosPeloTeclado.delete(e.target);
});

// ── os atalhos ──────────────────────────────────────────────────────────────
//
// As teclas vêm do mapa de atalhos.js, que cada pessoa muda na janela do "?". Aqui fica só o que
// cada acção FAZ. Uma acção com `botao` carrega nesse botão, se ele estiver à vista e ligado: é o
// mesmo gesto do rato, com as mesmas regras.
const botaoVivo = (id) => {
  const el = $(id);
  return el && !el.disabled && !el.closest('[hidden]') && el.getClientRects().length ? el : null;
};
function irAoLance(sentido) {
  const lista = ordenar(estado.momentos).map((m) => m.ms);
  const alvo = sentido > 0 ? lista.find((ms) => ms > estado.agoraMs + 1000)
    : lista.filter((ms) => ms < estado.agoraMs - 1000).pop();
  if (alvo == null) return;
  largarPrevia();
  irPara(alvo);
}
function abrirAssistente(acao) {
  const quem = faixaEscolhida ?? estado.focos[0] ?? TODOS;
  // Sem faixa aberta (um foco que já não tem linha) o passo 2 ficava escolhido para a próxima faixa.
  if (abrirAcoes(quem)) escolherAcao(acao);
}
const FAZER = {
  pausa: () => alternarPausa(),
  voltar: (largo) => { largarPrevia(); irPara(estado.agoraMs - (largo ? 10_000 : 1000)); },
  avancar: (largo) => { largarPrevia(); irPara(estado.agoraMs + (largo ? 10_000 : 1000)); },
  correrTras: () => comecarArrasto(-1),
  correrFrente: () => comecarArrasto(1),
  lanceAnterior: () => irAoLance(-1),
  // O M marca mesmo com o separador Exportar aberto (o botão está escondido, na Montagem); a kill nova
  // abre a Montagem.
  marcarKill: () => marcarKill(),
  lanceSeguinte: () => irAoLance(1),
  // O F de full screen, como no YouTube e na Twitch: o vídeo em foco, pelo mesmo botão do canto (que
  // também sai, se já está em tela cheia).
  ecraCheio: () => document.querySelector('#palcoFoco .tile .ecraCheio')?.click(),
  // O + e o - dão zoom na linha do tempo; na tela do evento, sem vídeo aberto, no mapa.
  zoomMais: () => (estado.janela && estado.linhas.length ? zoomPor(1 / ZOOM_PASSO) : botaoVivo('aproximar')?.click()),
  zoomMenos: () => (estado.janela && estado.linhas.length ? zoomPor(ZOOM_PASSO) : botaoVivo('afastar')?.click()),
  // O ângulo em foco anda sozinho: alinhar à vista, sem tirar a mão do teclado.
  ajusteMenos: (largo) => { if (estado.focos[0]) empurrar(estado.focos[0], -(largo ? 10_000 : 1000)); },
  ajusteMais: (largo) => { if (estado.focos[0]) empurrar(estado.focos[0], largo ? 10_000 : 1000); },
  canais: () => {
    alternarCanais();
    if (!document.body.classList.contains('canaisAbertos')) $('editarCanais').focus({ preventScroll: true });
  },
  lerChat: () => abrirAssistente('chat'),
  detetar: () => abrirAssistente('detetar'),
  // O V marca o agora de todos os ângulos ao vivo, mesmo com o separador Exportar aberto (como o M).
  marcarAgora: () => marcarAoVivo(),
  // O 1 a 9: o som passa para o ângulo com esse número (o do canto de cada quadrado).
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`ouvir${i + 1}`, () => {
    const slug = angulosNumerados()[i];
    if (slug) ouvirAngulo(slug);
  }])),
};
// Com o editor "Ajustar clipe" aberto, o teclado anda pela prévia do clipe e não pela noite: o espaço
// pausa e continua (do ponto onde parou), J e L andam 1 s, A e D 3 s, o I e o O põem o início e o fim
// onde a agulha está. O dono, 13/10: "todos os atalhos têm de funcionar com a janela aberta".
const PASSO_ATALHO_CLIPE_MS = 3000;
const andarNoClipe = (ms) => {
  const c = estado.clipe;
  if (c && !c.aGravar) levarAgulha((c.cabecaMs ?? c.deMs) + ms);
};
const marcarNoClipe = (qual) => {
  const c = estado.clipe;
  if (!c || c.aGravar) return;
  const aqui = c.cabecaMs ?? c.deMs;
  Object.assign(c, mover(c, qual, aqui, { limites: c.limites }));
  pintarClipe();
  // A imagem fica onde a agulha está: o ponto marcado é o que se vê.
  if (!c.aVer) preverClipe(aqui, { fino: true });
};
const FAZER_CLIPE = {
  pausa: () => {
    const c = estado.clipe;
    if (!c || c.aGravar) return;
    if (c.aVer) pararVer({ voltar: false }); else verClipe();
  },
  voltar: (largo) => andarNoClipe(largo ? -10_000 : -1000),
  avancar: (largo) => andarNoClipe(largo ? 10_000 : 1000),
  correrTras: () => andarNoClipe(-PASSO_ATALHO_CLIPE_MS),
  correrFrente: () => andarNoClipe(PASSO_ATALHO_CLIPE_MS),
  marcarIn: () => marcarNoClipe('de'),
  marcarOut: () => marcarNoClipe('ate'),
};
const painelAtalhos = montarPainelAtalhos({ atalhos, t, raiz: $('modalAjuda') });
// A lista existe desde o arranque, e não só depois de abrir: quem lê a página (e o leitor de ecrã) acha-a lá.
painelAtalhos.pintar();
atalhos.aoMudar(() => pintarDicas(atalhos, t));
// Outro separador mudou os atalhos: este fica com os mesmos.
window.addEventListener('storage', (e) => { if (e.key === 'replay.atalhos') atalhos.recarregar(); });

document.addEventListener('keydown', (e) => {
  // No modo simples os vídeos do avançado estão escondidos: o espaço e as outras teclas não podem tocar
  // nem andar com eles (o espaço tocava o som de um vídeo que ninguém vê). A prévia do cartão tem a sua tecla.
  // O editor do clipe é o mesmo nos dois modos, e as teclas dele valem em ambos.
  const noClipe = !$('modalClipe').hidden;
  if (modoSimples() && !noClipe) return;
  const alvo = e.target;
  const achada = atalhos.acaoDe(e);
  // Ctrl, Cmd e Alt são do sistema: Ctrl+C copia, Ctrl+A escolhe tudo, Ctrl+D guarda a página. Com
  // eles carregados só dispara o que a pessoa gravou de propósito com eles.
  if ((e.ctrlKey || e.metaKey || e.altKey) && !achada) return;
  // O Esc fecha a janela aberta mesmo com o cursor numa caixa de texto dela:
  // quem está a escrever o título do clipe também tem de poder sair.
  if (e.key === 'Escape' && !$('modalAjuda').hidden) { alternarAjuda(false); return; }
  if (e.key === 'Escape' && !$('modalClipe').hidden) { fecharClipe(); return; }
  // O Esc fecha o painel Canais, como fecha um painel de editor, mesmo com o cursor na caixa de procurar,
  // e o foco volta ao botão que o abriu: sem isso o teclado ficava num campo que deixou de se ver.
  if (e.key === 'Escape' && document.body.classList.contains('canaisAbertos') && !$('palco').hidden) {
    e.preventDefault();
    alternarCanais(false);
    $('editarCanais').focus({ preventScroll: true });
    return;
  }
  if (ondeSeEscreve(alvo)) return;
  // As janelas do evento (Compartilhar, Adicionar) têm o teclado só para elas, como a do clipe.
  if (document.querySelector('.modal.doEvento:not([hidden])')) return;
  if (!achada) return;
  const { id, combo, largo } = achada;
  const acao = ACAO[id];
  // Com a janela dos atalhos aberta, o teclado é dela; a tecla que a abre também a fecha.
  if (!$('modalAjuda').hidden) {
    if (id === 'atalhos') alternarAjuda(false);
    return;
  }
  if (id === 'atalhos') { alternarAjuda(true); return; }
  // Com a janela do clipe aberta, o teclado é dela: o resto não pode andar com
  // o tempo por baixo do que se está a cortar. E as acções dela só valem com ela aberta.
  const doClipe = noClipe && FAZER_CLIPE[id];
  if (noClipe ? !doClipe && !acao.clipe : acao.clipe) return;
  const { tecla } = partes(combo);
  // As caixas de enquadramento, do chat e da legenda, e o divisor têm as setas e o + e o - para elas.
  if (noClipe && /^(Arrow|[-+=]$)/.test(tecla) && alvo?.closest?.('#divisor, .recorte, .caixaPrevia')) return;
  // Um botão ou um sumário a que se chegou pelo Tab: o espaço e o Enter carregam-no, como
  // em qualquer página. Só o foco que ficou de um clique de rato (sem anel)
  // deixa o espaço pausar, senão o Pausar deixava de funcionar depois de
  // carregar num botão qualquer.
  const tabulado = focadosPeloTeclado.has(alvo)
    && alvo.matches('button, summary, a[href], [role="button"], input, select');
  if ((tecla === 'Space' || tecla === 'Enter') && (tabulado || alvo?.type === 'checkbox' || alvo?.type === 'radio')) return;
  // As setas num cursor ou num seletor são dele: mudam o valor ou a escolha.
  const cursor = (alvo?.tagName === 'INPUT' && (alvo.type === 'range' || alvo.type === 'radio')) || alvo?.tagName === 'SELECT'
    || alvo?.getAttribute?.('role') === 'slider';
  if (cursor && /^(Arrow|Home$|End$|Page)/.test(tecla)) return;
  // Antes de haver noite não há nada para parar nem para andar: a pausa ficava
  // guardada e a primeira noite abria parada, e as setas rebentavam.
  const haNoite = Boolean(estado.janela) && estado.linhas.length > 0;
  if (acao.noite && !haNoite && !doClipe) return;
  // Num seletor a letra também escolhe a opção que começa por ela: o A saltava
  // para "a noite toda" ao mesmo tempo que recuava. A letra que é atalho fica
  // só para o atalho.
  e.preventDefault();
  // Segurar uma tecla repete o `keydown`: só o que anda no tempo ou no zoom se repete. Segurar o F
  // entrava e saía da tela cheia sem parar, e segurar o espaço pausava e continuava.
  if (e.repeat && !acao.repete) return;
  if (doClipe) FAZER_CLIPE[id](largo);
  else if (FAZER[id]) FAZER[id](largo);
  else if (acao.botao) botaoVivo(acao.botao)?.click();
  // A corrida do A e do D pára quando se larga a tecla que a começou (o keyup, mais abaixo).
  if (acao.segurar && arrasto) arrasto.tecla = tecla;
});

// ── segurar o A ou o D ──────────────────────────────────────────────────────
//
// A repetição é NOSSA e não a do sistema. A do sistema começa quando o
// sistema quiser, repete ao ritmo que estiver configurado nesse computador, e
// o mesmo gesto andava distâncias diferentes em máquinas diferentes. Com um
// relógio próprio, segurar dois segundos anda sempre o mesmo.
let arrasto = null;
function comecarArrasto(sentido) {
  // O `keydown` repete-se sozinho enquanto a tecla está em baixo: o segundo
  // não pode começar uma segunda corrida por cima da primeira.
  if (arrasto) return;
  largarPrevia();
  irPara(estado.agoraMs + sentido * passoDoArrasto(0));
  const desde = Date.now();
  arrasto = { sentido, tempo: null };
  arrasto.tempo = setTimeout(() => {
    arrasto.tempo = setInterval(() => {
      irPara(estado.agoraMs + sentido * passoDoArrasto(Date.now() - desde));
    }, ARRASTO_INTERVALO_MS);
  }, ARRASTO_ESPERA_MS);
}
function pararArrasto() {
  if (!arrasto) return;
  clearTimeout(arrasto.tempo);
  clearInterval(arrasto.tempo);
  arrasto = null;
}
// Larga-se a tecla que começou a corrida, seja ela qual for no mapa de atalhos.
document.addEventListener('keyup', (e) => {
  if (!arrasto) return;
  const solta = partes(comboDoEvento(e) || '').tecla;
  if (!arrasto.tecla || solta === arrasto.tecla || (e.key || '').toUpperCase() === arrasto.tecla) pararArrasto();
});
// A janela que perde o foco nunca entrega o `keyup`, e a corrida ficava a
// andar sozinha por trás de outra janela até alguém voltar.
window.addEventListener('blur', pararArrasto);

/**
 * A página velha na cache do browser, resolvida por ela própria.
 *
 * "Cadê as mudanças anteriores que eu pedi, de ícone, layout e espaçamento?"
 * Estavam publicadas — ele é que estava a ver a página de antes. O GitHub
 * Pages responde `cache-control: max-age=600` e não há como mudar isso: durante
 * dez minutos o browser serve o `index.html` guardado sem sequer perguntar ao
 * servidor. O carimbo `?v=` nos endereços do código não resolve este caso,
 * porque é o HTML que traz os endereços — HTML velho, código velho.
 *
 * Então a página pergunta. O `versao.txt` é lido com `no-store`, por isso vem
 * mesmo do servidor; se o que lá está não for o que esta página tem escrito no
 * rodapé, esta página é velha e recarrega-se — e um `reload` revalida sempre o
 * documento principal, ao contrário de o abrir outra vez.
 *
 * Uma vez por versão, e guardado na sessão: se por alguma razão o número
 * continuar diferente depois de recarregar, ela não fica num ciclo — fica com
 * a versão que tem e diz-lho no rodapé.
 */
async function verSeEstaVelha() {
  const escrita = $('versao').textContent.trim();
  // Em desenvolvimento não há ficheiro nenhum, e não há nada a comparar.
  if (!escrita || escrita === 'dev') return false;
  try {
    const r = await fetch(`versao.txt?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const servidor = (await r.text()).trim();
    if (!servidor || servidor === escrita) return false;
    const jaTentei = sessionStorage.getItem('replay.recarga');
    if (jaTentei === servidor) {
      $('versao').textContent = `${escrita} → ${servidor}`;
      $('versao').classList.add('mau');
      return false;
    }
    sessionStorage.setItem('replay.recarga', servidor);
    location.reload();
    return true;
  } catch { return false; /* sem rede: fica com o que tem, que é melhor do que nada */ }
}
// O restauro lá em baixo espera por esta resposta: a versão velha recarregava a
// página a meio dos pedidos à Kick, e com quinhentos canais cada deploy fazia
// toda a gente pedir tudo duas vezes.
const versaoVista = verSeEstaVelha();

// ── idioma ──────────────────────────────────────────────────────────────────

/**
 * O idioma. Do que estiver guardado, senão do browser, senão português.
 *
 * Trocar de idioma repinta tudo o que já está no ecrã — não obriga a recarregar
 * nem perde a noite que estava aberta.
 */
function trocarIdioma(codigo) {
  definirIdioma(codigo);
  try { localStorage.setItem('replay.idioma', idiomaActual()); } catch { /* janela privada */ }
  $('idioma').value = idiomaActual();
  aplicarIdioma();
  pintarDicas(atalhos, t);
  painelAtalhos.pintar();
  // A lista de canais é repintada a partir do que já foi lido, e não de uma
  // nova ida à Kick: trocar de idioma não pode custar pedidos a ninguém.
  if (ultimosCanais.length) pintarCanais(ultimosCanais);
  if (estado.linhas.length) {
    // Os quadros traduzem-se no sítio, e não se reconstroem. O `montarGrade`
    // destruía todos os leitores e voltava a pedir cada playlist e cada pedaço
    // à Kick: com quinhentos canais, trocar de língua a meio de um evento
    // deixava a grelha preta. O `aplicarIdioma` de cima já tratou os quadros
    // que estão nesta página; o da janela à parte vive noutro documento.
    if (estado.aparte?.tile) aplicarIdioma(estado.aparte.tile);
    aplicarFoco();
    pintarFaixas();
    irPara(estado.agoraMs);
    pintarMarca();
    pintarMomentos();
  }
  pintarZoom();
  pintarFiltros();
  chatDoEvento?.pintarComoPico?.();
  simples?.traduzir();
}

$('idioma').innerHTML = Object.entries(IDIOMAS)
  .map(([c, nome]) => `<option value="${c}">${nome}</option>`).join('');
$('idioma').onchange = () => trocarIdioma($('idioma').value);

// O dono (13/10): só a bandeira; ao tocar abre a lista com a bandeira e o nome de cada idioma. Desenhadas em
// SVG porque o Windows não mostra emoji de bandeira. O <select> fica escondido e continua a guardar o valor.
const BANDEIRAS = {
  pt: '<svg viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" fill="#009c3b"/><path d="M14 2.5 25.5 10 14 17.5 2.5 10z" fill="#ffdf00"/><circle cx="14" cy="10" r="4.6" fill="#002776"/></svg>',
  en: '<svg viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" fill="#fff"/><path d="M0 0h28v1.54H0zm0 3.08h28v1.54H0zm0 3.08h28v1.54H0zm0 3.08h28v1.54H0zm0 3.08h28v1.54H0zm0 3.08h28v1.54H0zm0 3.08h28V20H0z" fill="#b22234"/><rect width="12" height="10.77" fill="#3c3b6e"/></svg>',
  es: '<svg viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" fill="#c60b1e"/><rect y="5" width="28" height="10" fill="#ffc400"/></svg>',
};
{
  const sel = $('idioma');
  sel.hidden = true;
  const caixa = document.createElement('div');
  caixa.className = 'idiomaBandeira';
  caixa.innerHTML = `<button type="button" class="discreto idiomaBotao" aria-haspopup="listbox" aria-expanded="false"></button>
    <ul class="idiomaLista" role="listbox" hidden>${Object.entries(IDIOMAS).map(([c, nome]) =>
    `<li role="option" data-c="${c}" tabindex="-1">${BANDEIRAS[c] || ''}<span>${nome}</span></li>`).join('')}</ul>`;
  sel.after(caixa);
  const botao = caixa.querySelector('button');
  const listaIdiomas = caixa.querySelector('ul');
  const pintar = () => {
    botao.innerHTML = BANDEIRAS[sel.value] || sel.value;
    botao.setAttribute('aria-label', `${t('idioma.rotulo')}: ${IDIOMAS[sel.value] || sel.value}`);
    for (const li of listaIdiomas.children) li.setAttribute('aria-selected', String(li.dataset.c === sel.value));
  };
  const abrir = (sim) => { listaIdiomas.hidden = !sim; botao.setAttribute('aria-expanded', String(sim)); if (sim) listaIdiomas.querySelector('[aria-selected="true"]')?.focus(); };
  botao.onclick = () => abrir(listaIdiomas.hidden);
  listaIdiomas.onclick = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    sel.value = li.dataset.c;
    sel.dispatchEvent(new Event('change'));
    abrir(false);
    pintar();
    botao.focus();
  };
  listaIdiomas.onkeydown = (e) => {
    const itens = [...listaIdiomas.children];
    const i = itens.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length].focus(); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement.click(); }
    if (e.key === 'Escape') { abrir(false); botao.focus(); }
  };
  document.addEventListener('pointerdown', (e) => { if (!caixa.contains(e.target)) abrir(false); });
  new MutationObserver(pintar).observe(sel, { attributes: true, childList: true });
  sel.addEventListener('change', pintar);
  queueMicrotask(pintar);
}

let guardadoIdioma = null;
try { guardadoIdioma = localStorage.getItem('replay.idioma'); } catch { /* janela privada */ }

// O filtro fica fora do link da sessao de proposito. O link e para partilhar, e
// mandar a alguem uma montagem com metade escondida seria mandar-lhe um engano.
try { estado.filtro = localStorage.getItem('replay.filtro') || 'todos'; } catch { /* janela privada */ }
try {
  const g = localStorage.getItem('replay.ordem');
  if (g === 'az' || g === 'adicionado') estado.ordemGrelha = g;
} catch { /* janela privada */ }
$('filtroMomentos').value = estado.filtro;
definirIdioma(guardadoIdioma || idiomaDoBrowser());
$('idioma').value = idiomaActual();
aplicarIdioma();
pintarDicas(atalhos, t);
painelAtalhos.pintar();

// ── arranque ────────────────────────────────────────────────────────────────
//
// A sessao sobrevive a um F5, a um travanco e a um link partilhado. E volta a
// carregar sozinha: devolver a caixa de texto preenchida mas vazia de video
// obrigava a repetir a espera toda.
// Um link de evento abre o evento, e não a última noite guardada: as duas ao mesmo tempo punham a
// grelha da noite antiga por cima do mapa que o link pediu.
// O link curto de um evento salvo no site (?e=<nome>) também é um link de evento.
const vemDeEvento = /[#&]evento=/.test(location.hash) || new URLSearchParams(location.search).has('e');
// O link partilhado vem no # (ver `linkDaNoite`); os de antes vinham no ?s=.
const sDoHash = new URLSearchParams(location.hash.slice(1)).get('s');
const doEnderecoCru = doLink(new URLSearchParams(location.search).get('s') || sDoHash || '');
const doEndereco = doEnderecoCru && { ...doEnderecoCru, momentos: momentosDoLink(doEnderecoCru.momentos) };
let local = null;
// Com os dados do site bloqueados o localStorage atira um SecurityError, e aqui
// isso parava o arranque inteiro, com o guardar e o beforeunload por registar.
try { local = vemDeEvento ? null : doLink(localStorage.getItem('replay') || ''); } catch { /* sem armazenamento */ }

/**
 * Um link partilhado JUNTA-SE ao que ele ja tinha, e nao o apaga.
 *
 * O link traz os canais, a noite e os acertos de quem o fez, e nunca as kills.
 * Abri-lo substituia a sessao inteira: as kills que ele tinha marcado sumiam do
 * ecra e, no guardar seguinte, do localStorage. Os acertos dele para canais que
 * o link nao acerta tambem ficam.
 */
function juntarComLocal(link, meu) {
  if (!meu) return link;
  return {
    ...link,
    nudges: { ...meu.nudges, ...link.nudges },
    margens: { ...meu.margens, ...link.margens },
    mudo: { ...meu.mudo, ...link.mudo },
    volume: { ...meu.volume, ...link.volume },
    marca: link.marca || meu.marca,
    momentos: unirMomentos(link.momentos, meu.momentos),
  };
}
const guardado = doEndereco ? juntarComLocal(doEndereco, local) : local;
// E sai do endereco depois de lido. Ficava la, e cada F5 aplicava o link outra
// vez por cima do que ele tinha feito desde que o abriu.
if (doEndereco) {
  const q = new URLSearchParams(location.search);
  q.delete('s');
  let hash = location.hash;
  if (sDoHash) {
    const h = new URLSearchParams(location.hash.slice(1));
    h.delete('s');
    hash = h.toString() ? `#${h}` : '';
  }
  history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${hash}`);
}

reporVods();
try { rolarPendente = Number(localStorage.getItem('replay.rolar')) || null; } catch { /* nada */ }
if (guardado) {
  $('canais').value = guardado.canais.join('\n');
  estado.nudges = guardado.nudges;
  estado.margens = guardado.margens || {};
  estado.mudo = guardado.mudo || {};
  estado.volume = guardado.volume || {};
  estado.restaurar = guardado;
  // No modo simples a tela é a caixa: a noite guardada fica guardada, e não abre por baixo dela.
  if (guardado.canais.length && !modoSimples()) versaoVista.then((vaiRecarregar) => { if (!vaiRecarregar) carregar(); });
}

// ── o evento ────────────────────────────────────────────────────────────────
//
// O mapa do evento entrega à página de sempre os canais de um lance e o instante dele. Daqui para a
// frente é uma noite como outra qualquer: a grelha, o alinhamento, a montagem e o clipe.
async function abrirLanceDoEvento(canais, ms, foco, {
  exato = false, aoVivo = false, ajustes = {}, referencia = null, preparado = null,
} = {}) {
  // Os atrasos medidos pelo som do lance (ver `verLance` em evento-ui.js), relativos à referência.
  const ref = referencia && slugDoNome(referencia);
  for (const [c, desvioMs] of Object.entries(ajustes || {})) {
    if (!Number.isFinite(desvioMs)) continue;
    estado.nudges[slugDoNome(c)] = (estado.nudges[ref] || 0) + desvioMs;
  }
  // Com esses canais já na grelha e o instante dentro da noite aberta, é só andar no tempo. Recarregar
  // tudo para ir de um pico ao outro era o que mais travava o uso (o dono, a 07/10).
  // Com `exato` (o "Abrir só quem está ao vivo" e o "Abrir todos com vídeo"), a grelha tem de ficar
  // com esses e só esses: quem pediu só os ao vivo não quer os outros que já lá estavam.
  const abertos = new Set(estado.linhas.map((l) => l.slug));
  const j = estado.janela;
  // Ao vivo o pedido pode estar uns segundos depois do fim lido: prende-se à borda mais abaixo.
  if (j && ms >= j.inicio && (ms <= j.fim || (aoVivo && ms <= j.fim + 120_000)) && canais.length
    && canais.every((c) => abertos.has(slugDoNome(c)))
    && (!exato || abertos.size === new Set(canais.map(slugDoNome)).size)) {
    const f = foco && slugDoNome(foco);
    if (f && abertos.has(f) && !ehPrincipal(f)) {
      estado.focos = [f, ...estado.focos.filter((s) => s !== f)];
      aplicarFoco();
    }
    if (estado.parado) alternarPausa();
    if (Object.keys(ajustes || {}).length) { pintarFaixas(); pintarConfianca(); guardar(); }
    // Ao vivo, a playlist lida pode já ter crescido: o instante é a borda dela, e não o pedido.
    const vivo = aoVivo ? instanteAoVivo(estado.linhas, { pedidoMs: ms, nudges: estado.nudges }) : null;
    irPara(vivo ? Math.max(j.inicio, Math.min(vivo.ms, j.fim)) : ms);
    window.scrollTo({ top: 0 });
    return;
  }
  $('canais').value = canais.join('\n');
  // O lance manda: o instante e o foco são os dele, e as kills e a marca de uma noite anterior não
  // vêm atrás. Atrás no ecrã, mas não fora do disco: as kills da noite aberta passam para
  // `momentosFora`, e o `lerNoite` devolve à nova as que caírem dentro dela. Com `momentos: []`
  // e nada mais, o guardar seguinte apagava-as do localStorage.
  estado.momentosFora = unirMomentos(estado.momentos, estado.momentosFora);
  estado.momentos = [];
  estado.restaurar = { agora: ms, focos: foco ? [foco] : [], marca: null, momentos: [], aoVivo };
  guardar();
  if (preparado) {
    for (const r of preparado.catalogo) estado.vodsPorCanal.set(r.slug, r);
    for (const [chave, peca] of preparado.lidas) if (!peca.vod.aoVivo) estado.pecasLidas.set(chave, peca);
    guardarVods();
    pintarCanais(preparado.catalogo);
    pintarNoites(preparado.noites);
    $('noite').value = String(preparado.indice);
    await abrirNoite(preparado.noite, { preparadas: preparado.lidas });
  } else await carregar();
  window.scrollTo({ top: 0 });
}

async function abrirPovsParaSimples({ canais, ms, foco, ajustes = {}, sinal }) {
  // Entrada validada antes de tocar na grelha: nomes válidos, >= 2 canais únicos por slug, foco entre eles.
  if (sinal?.aborted || cargaEmCurso || !Array.isArray(canais) || !Number.isFinite(ms)) return false;
  if (canais.some((c) => typeof c !== 'string' || !slugDoNome(c))) return false;
  const unicos = [...new Set(canais.map(slugDoNome))];
  const f = typeof foco === 'string' ? slugDoNome(foco) : '';
  if (unicos.length < 2 || !f || !unicos.includes(f)) return false;
  if (evento.povsLiberados(ms).liberado === false) return false;
  // Mesma conta de `abrirLanceDoEvento`: cada ajuste é relativo à referência (o foco).
  const efetivos = { ...estado.nudges };
  for (const [c, desvioMs] of Object.entries(ajustes || {})) {
    if (!Number.isFinite(desvioMs)) continue;
    efetivos[slugDoNome(c)] = (efetivos[f] || 0) + desvioMs;
  }
  // Sucesso só com vídeo de cada canal no instante (com o ajuste) e uma janela comum de 1 s que o contém.
  const cobre = (nudges) => {
    const linhas = unicos.map((s) => estado.linhas.find((l) => l.slug === s));
    if (linhas.some((l) => !l)) return false;
    const w = trechoComum(linhas, ms, { nudges });
    return Boolean(w) && w.inicio <= ms && ms < w.fim && w.fim - w.inicio >= 1000;
  };
  // Com esses canais já na grelha, o instante na janela da noite e um buraco em um deles: nem se mexe.
  const abertos = new Set(estado.linhas.map((l) => l.slug));
  const j = estado.janela;
  const exatoCarregado = abertos.size === unicos.length && unicos.every((s) => abertos.has(s));
  if (exatoCarregado && j && ms >= j.inicio && ms <= j.fim && !cobre(efetivos)) return false;
  let preparado = null;
  if (!exatoCarregado || !j || ms < j.inicio || ms > j.fim) {
    const noiteAntes = vezNoite;
    const linhasAntes = estado.linhas;
    preparado = await prepararPovs({ canais: unicos, ms, nudges: efetivos,
      vodsPorCanal: estado.vodsPorCanal, vodsDoEvento: estado.vodsDoEvento, pecasLidas: estado.pecasLidas,
      lerTexto, sinal });
    if (!preparado || sinal?.aborted || cargaEmCurso || vezNoite !== noiteAntes || estado.linhas !== linhasAntes) return false;
  }
  await abrirLanceDoEvento(unicos, ms, f, { exato: true, ajustes, referencia: f, preparado });
  return cobre(estado.nudges);
}
const evento = montarEvento({
  abrirLance: abrirLanceDoEvento,
  // Os melhores lances somam as kills e os achados da montagem, e o Marcar da lista põe um lance nela.
  momentos: () => unirMomentos(estado.momentos, estado.momentosFora),
  marcar: ({ ms, canal, vitimas = [], origem = 'lances' }) => {
    // Na noite aberta entra na lista; fora dela fica guardado e aparece quando a noite dele abrir.
    // Uma morte do servidor entra com quem morreu já marcado (origem 'servidor').
    const m = novoMomento(ms, slugDoNome(canal), {
      ...tamanhos(), origem: origem === 'servidor' ? 'servidor' : 'lances', vitimas: (vitimas || []).map(slugDoNome),
    });
    const j = estado.janela;
    if (j && ms >= j.inicio && ms <= j.fim) estado.momentos = acrescentar(estado.momentos, m);
    else estado.momentosFora = acrescentar(estado.momentosFora, m);
    pintarMomentos();
    guardar();
  },
  dialogo: { mostrar: mostrarDialogo, esconder: esconderDialogo },
  // O instante do vídeo aberto, para "a morte é agora" (as mortes do servidor).
  agoraDoVideo: () => (estado.linhas.length && Number.isFinite(estado.agoraMs) ? estado.agoraMs : null),
  aoMudarPicos: () => { pintarRegua(); pintarChatVideo(estado.agoraMs, true); },
  memorizarVods: (resultados) => {
    estado.vodsDoEvento.clear();
    for (const r of resultados) if (r?.estado === 'ok') estado.vodsDoEvento.set(r.slug, r);
  },
});
// Para os testes de página, como o `__estado` da noite.
window.__evento = evento.estado;
window.__mortes = evento.mortes;
picosDoEvento = () => evento.estado.marcas;
mensagensDoEvento = () => evento.estado.mensagens;
chatDoEvento = evento;
ligarChatTrecho();
ligarFiltros();
ligarAgulha();
// Com uma live só a grelha fica vazia, e o vídeo fica com o lugar dela (ver o CSS de .semGrelha).
// O CSS não o pode saber sozinho: um :has dentro de outro :has não vale.
// Com muitos ângulos (o dono, 10/10: "no máximo 2 vídeos grandes, os outros só nomes para clicar") a
// grelha vira uma lista de nomes: dezassete miniaturas de 130 px não se leem e apertavam a coluna.
const MUITOS_ANGULOS = 6;
new MutationObserver(() => {
  const n = $('grade').querySelectorAll('.tile').length;
  $('palco').classList.toggle('semGrelha', !n);
  $('palco').classList.toggle('muitosAngulos', n > MUITOS_ANGULOS);
}).observe($('grade'), { childList: true });
// Para os testes de página: o lance sem ter de montar o mapa inteiro.
window.__abrirLanceDoEvento = abrirLanceDoEvento;
// E o que fica de fora por ser de outro jogo (ver `foraDoJogo`).
window.__jogo = { foraDoJogo, pedidosDe: (quem, quanto) => pedidosDe(quem, quanto).map((x) => x.canal) };
// No modo simples o link de um lance não abre o palco: quem vê é a lista (simples.js).
const eventoDoLink = vemDeEvento ? evento.abrirDoLink(location.hash, { abrirLance: !modoSimples() }) : null;
// Sem link, o evento que estava aberto volta por baixo da noite restaurada, em barra (no avançado).
if (!vemDeEvento && !modoSimples()) evento.abrirGuardado();

// ── o modo simples (simples.js) ─────────────────────────────────────────────
//
// O que a página de sempre empresta ao modo simples: abrir um canal, gravar um clipe sem a janela à vista,
// abrir um evento. Ver ESTUDO-FACIL.md.

/** O vídeo mais recente de `slug` (ou o da hora `inicioMs`), aberto como uma noite de um canal só. */
async function abrirCanalSimples(slug, { inicioMs = null } = {}) {
  const s = slugDoNome(slug);
  if (estado.clipe) fecharClipe();
  $('canais').value = s;
  // As kills de antes ficam guardadas, como quando um lance do evento abre outra noite.
  estado.momentosFora = unirMomentos(estado.momentos, estado.momentosFora);
  estado.momentos = [];
  const vods = estado.vodsPorCanal.get(s)?.vods || [];
  const agora = inicioMs ?? vods.at(-1)?.inicioApi ?? null;
  estado.restaurar = agora != null ? { agora: agora + 1000, focos: [s], marca: null, momentos: [] } : null;
  await carregar();
  return estado.linhas.find((l) => l.slug === s) || null;
}

const dormirMs = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
async function esperarQue(pronto, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (pronto()) return true;
    // eslint-disable-next-line no-await-in-loop
    await dormirMs(150);
  }
  return Boolean(pronto());
}

/**
 * Um clipe da lista simples, baixado sem a janela "Ajustar clipe" à vista (ela fica aberta por baixo, sem
 * se ver: é ela que tem o vídeo e o gravador). Em pé: o rosto do streamer achado sozinho (rosto.js) em
 * dois enquadramentos; sem rosto, o meio do jogo. A legenda, quando pedida e quando dá. Nunca pergunta nada.
 * Devolve { blob, nome, curto } ou { erro } (`'semVideo'` quando o vídeo não abriu neste navegador).
 */
async function baixarParaSimples({ canal, deMs, ateMs }, {
  deitado = false, legenda = false, nome, aoFase = () => {}, aoProgresso = () => {},
} = {}) {
  const linha = estado.linhas.find((l) => l.slug === canal);
  if (!linha) return { erro: t('simples.semMotivo') };
  if (estado.clipe) fecharClipe();
  document.body.classList.add('simplesGravando');
  let pronto = null;
  const simples = { nome, aoProgresso, aoPronto: (r) => { pronto = r; } };
  try {
    abrirClipe(novoMomento(Math.round((deMs + ateMs) / 2), canal));
    const c = estado.clipe;
    if (!c) return { erro: t('simples.semMotivo') };
    const j = dentroDosLimites({ deMs, ateMs }, c.limites);
    c.deMs = j.deMs;
    c.ateMs = j.ateMs;
    pintarClipe();
    if (deitado) {
      await guardarClipe({ simples });
    } else {
      aoFase('abrir');
      preverClipe(c.deMs);
      const v = $('previaClipe');
      const temImagem = await esperarQue(() => estado.clipe !== c || (v.readyState >= 2 && fonteDoClipe() && c.rects.length), 25_000);
      if (estado.clipe !== c) return { erro: t('simples.semMotivo') };
      if (!temImagem) return { erro: 'semVideo' };
      aoFase('rosto');
      if (c.modo !== 'dois') trocarModo('dois');
      else if (c.origem === 'modelo') proporWebcam();
      await esperarQue(() => estado.clipe !== c || !c.rostoBusca, 25_000);
      c.rostoBusca?.abort();
      // Sem rosto achado (nem guardado de outra vez), o meio do jogo, sem perguntar.
      if (c.origem === 'modelo') trocarModo('um');
      if (legenda && podeLer()) {
        aoFase('legenda');
        c.legenda = limparLegenda({ ...c.legenda, ligado: true });
        const acabou = await Promise.race([gerarLegenda().then(() => true), dormirMs(180_000).then(() => false)]);
        if (!acabou) c.legendaGerar?.controlo.abort();
        if (estado.clipe !== c) return { erro: t('simples.semMotivo') };
        if (!legendaParaDesenhar(c)) c.legenda = limparLegenda({ ...c.legenda, ligado: false });
      }
      aoFase('gravar');
      await guardarRetrato({ simples });
    }
    return pronto || { erro: $('estadoClipe').textContent.trim() || t('simples.semMotivo') };
  } finally {
    document.body.classList.remove('simplesGravando');
    if (estado.clipe) fecharClipe();
    if (!estado.parado && estado.linhas.length) alternarPausa();
  }
}

/**
 * Um momento da lista simples aberto no editor "Ajustar clipe" do avançado, já no pedaço do cartão: é só o
 * que o baixar faz antes de gravar, mas com a janela à vista. Devolve false se o canal não está aberto.
 */
function editarParaSimples({ canal, deMs, ateMs, ms = Math.round((deMs + ateMs) / 2), canais = [] }) {
  if (!estado.linhas.some((l) => l.slug === canal)) return false;
  if (estado.clipe) fecharClipe();
  abrirClipe(novoMomento(ms, canal));
  const c = estado.clipe;
  if (!c) return false;
  const selecionados = [...new Set([canal, ...canais].map(slugDoNome))];
  if (selecionados.length > 1) {
    const linhas = selecionados.map((slug) => estado.linhas.find((l) => l.slug === slug));
    const comum = trechoComum(linhas, ms, { nudges: estado.nudges });
    if (!comum || comum.fim - comum.inicio < 1000) { fecharClipe(); return false; }
    c.limites = comum;
    c.canaisClipe = selecionados;
  }
  const j = dentroDosLimites({ deMs, ateMs }, c.limites);
  if (c.canaisClipe?.some((slug) => {
    const linha = estado.linhas.find((l) => l.slug === slug);
    return !linha || onde(linha, j.deMs, { nudgeMs: estado.nudges[slug] || 0 }).estado !== 'toca';
  })) { fecharClipe(); return false; }
  c.deMs = j.deMs;
  c.ateMs = j.ateMs;
  pintarClipe();
  preverClipe(c.deMs);
  if (c.canaisClipe?.length > 1) $('estadoClipe').textContent = t('angulos.selecionados', { n: c.canaisClipe.length });
  return true;
}

const simples = montarSimples({
  estado,
  chat: evento,
  abrirCanal: abrirCanalSimples,
  memorizarVods: (r) => { if (r?.estado === 'ok') { estado.vodsPorCanal.set(r.slug, r); guardarVods(); } },
  aoVivoDe,
  pausar: () => { if (!estado.parado && estado.linhas.length) alternarPausa(); },
  carregarClipe: carregarClipeDaKick,
  baixar: baixarParaSimples,
  prepararSom: prepararSomDaGravacao,
  transcrever: transcreverParaCartao,
  motivoDaFala: motivoDaLegenda,
  editar: editarParaSimples,
  abrirPovs: abrirPovsParaSimples,
  procurarPovs: evento.procurarPovsDoMomento,
  povsLiberados: evento.povsLiberados,
  fecharEditor: () => { if (estado.clipe) fecharClipe(); },
  abrirEvento: ({ nome, hash, sinal, aoProgresso }) => (hash ? evento.abrirDoLink(hash, { abrirLance: false, sinal, aoProgresso }) : evento.abrirDoLink('', { busca: `?e=${encodeURIComponent(nome)}`, sinal, aoProgresso })),
  lerChatDoEvento: () => evento.lerChatDeTodos({ semPerguntar: true }),
  lancesDoEvento: evento.lancesSimples,
  aoMudarEvento: evento.aoMelhores,
  pararChatDoEvento: () => { if (evento.lancesSimples().lendo) evento.lerChatDeTodos(); },
  eventoDoLink,
});
// Para os testes de página.
window.__simples = simples;

// Um link #s= colado num separador onde a pagina ja esta aberta muda so o #, e o
// browser nao recarrega: o link nao fazia nada. Recarregar e o mesmo caminho do
// arranque (juntar com a sessao, tirar o s= do endereco), e o beforeunload guarda
// antes o que ele tinha.
window.addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).get('s')) location.reload();
});

// O `beforeunload` fica como ultima rede: num telemovel muitas vezes nunca
// corre, e por isso e que a gravacao a serio acontece a cada mudanca.
window.addEventListener('beforeunload', () => {
  clearTimeout(timerGuardar);
  timerGuardar = null;
  if (semGuardar) return;
  guardarRolar();
  try {
    localStorage.setItem('replay', sessaoParaGuardar());
  } catch { /* nunca partir a pagina por causa disto */ }
});
