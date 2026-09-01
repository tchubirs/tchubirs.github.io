// The page. Everything runs in the browser; there is no server in this product.
//
// Only the focus tile decodes at a real rendition and carries sound. The rest
// run at 160p @ 230 kbps, which measured on four unrelated channels is the
// bottom rung of Kick's ladder and is what makes thirty tiles a home-connection
// problem rather than a server problem.

import { vodsDoCanal, lerMaster, lerPlaylist, procurarCanais } from './kick.js?v=f2c76cccfe';
import {
  linhaDoCanal, janelaComum, onde, quantosNoAr, comNudge, paraLink, doLink, instanteSeguindo,
} from './relogio.js?v=f2c76cccfe';
import { cortarTodosOsAngulos } from './baixar.js?v=f2c76cccfe';
import { alinharPeloSom, custoEstimadoMB } from './alinhar.js?v=f2c76cccfe';
import { agruparPorNoite, rotuloDaNoite } from './noites.js?v=f2c76cccfe';
import {
  novoMomento, acrescentar, remover, removerVarios, planoDaMontagem, ordenar,
  alternarVitima, filtrar, temMorte,
} from './momentos.js?v=f2c76cccfe';
import { planearCorte, executarCorte, nomeDoFicheiro } from './baixar.js?v=f2c76cccfe';
import { criarZip, crc32 } from './zip.js?v=f2c76cccfe';
import { criarApanhador } from './frames.js?v=f2c76cccfe';
import { varrerNoite, custoVarrerMB } from './procurar-momentos.js?v=f2c76cccfe';
import { TAXA_TIROS } from './tiros.js?v=f2c76cccfe';
import { parecidos, juntarPerto } from './aprender.js?v=f2c76cccfe';
import { somDoCanal } from './alinhar.js?v=f2c76cccfe';
import { MAXIMO_S, mover, janelaInicial, nomeDoClipe } from './clipe.js?v=f2c76cccfe';
import { IDIOMAS, t, tn, definirIdioma, idiomaDoBrowser, idiomaActual, aplicarIdioma } from './idiomas.js?v=f2c76cccfe';
import { notaDeMorte, quemMorreu, medir, limiar, pareceMorto } from './morte.js?v=f2c76cccfe';

const $ = (id) => document.getElementById(id);
const estado = {
  linhas: [],
  janela: null,
  agoraMs: 0,
  marca: { de: null, ate: null },
  nudges: {},
  focos: [],
  margens: {},
  mudo: {},
  momentos: [],
  // A seleccao e o filtro sao a maneira de ele lidar com uma noite varrida:
  // dezenas de candidatos de que a maioria nao e kill. A seleccao vive so
  // enquanto a pagina estiver aberta — guardar caixas marcadas de ontem seria
  // uma surpresa desagradavel. O filtro guarda-se, que e uma preferencia.
  // Onde o relogio estava quando mandei tocar, para poder andar sozinho a
  // partir dai. E a previa: a kill que ele esta a ver em ciclo.
  ancora: null,
  previa: null,
  // A forma de cada estouro da ultima varredura, e o exemplo que ele
  // confirmou. Com um exemplo, a busca deixa de ser um palpite meu sobre o que
  // e um tiro e passa a procurar O MESMO SOM.
  estouros: [],
  exemplo: null,
  tique: 0,
  selecao: new Set(),
  filtro: 'todos',
  // O que se apagou da ultima vez, para o "anular". Setenta e oito linhas
  // apagadas por engano sao uma noite de trabalho perdida, e um `confirm()`
  // e uma caixa que ele carrega em OK sem ler.
  apagados: null,
  restaurar: null,
  volume: {},
  parado: false,
  clipe: null,
  players: new Map(),
  // Cada ficheiro gerado fica INTEIRO na memória enquanto o endereço existir.
  // Trinta e seis clipes de doze megas sao quase meio giga de RAM presa, e
  // ninguem os liberta sozinho — foi por aqui que a pagina comecou a travar.
  ficheiros: [],
  cancelar: null,
  geracao: 0,
  sugestoes: [],
  escolhido: -1,
  timerProcura: null,
  procuraEmCurso: null,
  timerSecundarios: null,
};

const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
const relogioCurto = (ms) => new Date(ms).toISOString().slice(11, 19);

// ── guardar a sessao ────────────────────────────────────────────────────────

/**
 * Guardar tudo o que custou a chegar aqui, a cada mudanca.
 *
 * A versao anterior so guardava no `beforeunload` — que num telemovel muitas
 * vezes nunca chega a correr, e nunca corre quando a pagina trava. Um F5 depois
 * de meia hora a procurar o momento devolvia uma caixa de texto vazia.
 */
let timerGuardar = null;
function guardar() {
  clearTimeout(timerGuardar);
  timerGuardar = setTimeout(() => {
    try {
      localStorage.setItem('replay', paraLink({
        canais: estado.linhas.length ? estado.linhas.map((l) => l.slug) : listaDeCanais(),
        janela: estado.janela,
        nudges: estado.nudges,
        marca: estado.marca,
        agoraMs: estado.agoraMs,
        focos: estado.focos,
        margens: estado.margens,
        mudo: estado.mudo,
        volume: estado.volume,
        momentos: estado.momentos,
      }));
    } catch { /* janela privada, quota, o que for — nunca partir a pagina por isto */ }
  }, 400);
}

// ── procurar canais ─────────────────────────────────────────────────────────

/**
 * O slug da Kick nem sempre é o nome que se vê no ecrã, e obrigar alguém a
 * descobri-lo antes de poder usar isto era um passo a mais por cada canal —
 * multiplicado por trinta.
 */
const listaDeCanais = () => $('canais').value.split('\n').map((s) => s.trim()).filter(Boolean);

function acrescentarCanal(slug) {
  if (listaDeCanais().includes(slug)) return;
  const v = $('canais').value.replace(/\s*$/, '');
  $('canais').value = v ? `${v}\n${slug}` : slug;
  $('procurar').value = '';
  fecharSugestoes();
  $('procurar').focus();
}

function fecharSugestoes() {
  $('sugestoes').hidden = true;
  $('sugestoes').innerHTML = '';
  estado.escolhido = -1;
}

function pintarSugestoes(canais) {
  const jaLa = listaDeCanais();
  $('sugestoes').innerHTML = canais.map((c, i) => {
    const ja = jaLa.includes(c.slug);
    return `<li data-slug="${c.slug}" data-i="${i}" class="${ja ? 'ja' : ''}" role="option">`
      + `<span>${c.slug}${c.aoVivo ? ` <b class="vivo">${t('procurar.aoVivo')}</b>` : ''}</span>`
      + `<span class="quantos">${ja ? t('procurar.jaEsta')
        : t('procurar.seguidores', { n: c.seguidores.toLocaleString(idiomaActual()) })}</span></li>`;
  }).join('');
  $('sugestoes').hidden = !canais.length;
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
  else if (e.key === 'Escape') fecharSugestoes();
  else if (e.key === 'Enter') {
    e.preventDefault();
    const escolha = estado.sugestoes?.[estado.escolhido] ?? estado.sugestoes?.[0];
    // Enter sem sugestões escreve o que lá está: quem já sabe o slug não tem
    // de esperar por uma lista para o confirmar.
    if (escolha) acrescentarCanal(escolha.slug);
    else if ($('procurar').value.trim()) acrescentarCanal($('procurar').value.trim().toLowerCase());
  }
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.procura')) fecharSugestoes();
});

// ── carregar ────────────────────────────────────────────────────────────────

/**
 * hls.js comes from a CDN, and a CDN is a thing that can be down, blocked by a
 * network, or eaten by an ad blocker. Without it the tiles stay black and the
 * page looks broken for a reason nobody can guess — so it says so, once, and
 * names the cause.
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

async function carregar() {
  const nomes = [...new Set(listaDeCanais())];
  if (!nomes.length) return;
  temPlayer();
  $('carregar').disabled = true;
  $('estadoCarga').textContent = t('canais.aPerguntar');

  const canais = [];
  // Sequential, and that is deliberate: thirty parallel calls from five hundred
  // people is what gets a free tool rate-limited for everyone on day one.
  for (const [i, nome] of nomes.entries()) {
    $('estadoCarga').textContent = `${i + 1}/${nomes.length} — ${nome}`;
    canais.push(await vodsDoCanal(nome));
  }
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
  const alvo = estado.restaurar?.agora ?? (estado.linhas.length ? estado.agoraMs : null);
  const i = alvo != null ? noites.findIndex((n) => alvo >= n.inicio && alvo <= n.fim) : -1;
  $('noite').value = String(i >= 0 ? i : 0);
  await abrirNoite(noites[i >= 0 ? i : 0]);
}

function pintarNoites(noites) {
  $('noites').hidden = false;
  $('noite').innerHTML = noites
    .map((n, i) => `<option value="${i}">${rotuloDaNoite(n, { t })}</option>`).join('');
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
    return `<li class="${mau ? 'mau' : ''}" data-slug="${c.slug}" data-estado="${c.estado}"><b>${c.slug}</b>`
      + `<span class="nota">${mau ? (rotulo[c.estado] || c.estado)
        : t('canais.vods', { n: c.vods.length })}</span>`
      + '<span class="parecidos"></span>'
      // Tirar um canal daqui. Um nome mal escrito ficava na lista para sempre,
      // e a unica saida era ir a caixa de texto apaga-lo a mao.
      + `<button class="tirar" title="${t('canais.tirar')}">✕</button></li>`;
  }).join('');
  for (const li of $('listaCanais').querySelectorAll('li[data-slug]')) {
    li.querySelector('.tirar').onclick = () => {
      $('canais').value = listaDeCanais().filter((n) => n !== li.dataset.slug).join('\n');
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
      + achados.map((x) => `<button data-slug="${x.slug}">${x.slug}</button>`).join('');
    for (const b of li.querySelectorAll('button')) {
      b.onclick = () => {
        // Trocar o nome na caixa, e não acrescentar: quem escreveu mal quer o
        // certo no lugar do errado, senão fica a carregar os dois.
        $('canais').value = listaDeCanais()
          .map((n) => (n === c.slug ? b.dataset.slug : n))
          .filter((n, i, a) => a.indexOf(n) === i)
          .join('\n');
        carregar();
      };
    }
  }
}

/** Read the ladders and the clocks for one night, then build the timeline. */
async function abrirNoite(noite) {
  $('estadoCarga').textContent = t('canais.aLerRelogios');
  const porCanal = new Map();
  for (const { slug, v } of noite.itens) {
    if (!v.master) continue;
    try {
      const master = lerMaster(await (await fetch(v.master)).text(), v.master);
      if (!master.length) continue;
      const barato = master.at(-1);
      const playlist = lerPlaylist(await (await fetch(barato.url)).text(), barato.url);
      if (!porCanal.has(slug)) porCanal.set(slug, []);
      porCanal.get(slug).push({ vod: v, playlist, escada: master, barato });
    } catch { /* a channel that cannot be read is shown as such below */ }
  }
  $('estadoCarga').textContent = '';

  estado.linhas = [...porCanal].map(([slug, pecas]) => ({
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
    $('estadoCarga').textContent = t('noite.semRelogio');
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
    if (g.agora >= estado.janela.inicio && g.agora <= estado.janela.fim) estado.agoraMs = g.agora;
    const focos = (g.focos || []).filter(existe);
    if (focos.length) estado.focos = focos;
    if (g.marca && g.marca.de >= estado.janela.inicio && g.marca.ate <= estado.janela.fim) {
      estado.marca = g.marca;
    }
    estado.momentos = (g.momentos || [])
      .filter((m) => m.ms >= estado.janela.inicio && m.ms <= estado.janela.fim);
    estado.restaurar = null;
  }
  $('palco').hidden = false;
  // Quem esta nesta noite, pelo nome. "Nunca estiveram todos no ar ao mesmo
  // tempo" era um aviso a fingir de problema: nao ter todos nao impede nada,
  // corta-se na mesma com os que la estavam. O que faz falta e saber QUEM.
  $('resumoNoite').textContent = estado.linhas.map((l) => l.slug).join(', ')
    + (estado.janela.haSobreposicao && !soUmCanal()
      ? ` · ${t('noite.todosJuntos', {
        de: relogioCurto(estado.janela.sobreposicaoInicio),
        ate: relogioCurto(estado.janela.sobreposicaoFim),
      })}`
      : '');
  // Alinhar pelo som e uma operacao entre canais. Com um so, o botao existia
  // para nao fazer nada.
  $('alinhar').hidden = soUmCanal();
  // Os segundos de quem morreu so fazem sentido se houver quem morrer.
  $('margensVitima').hidden = soUmCanal();
  montarGrade();
  seguirVideo();
  pintarFaixas();
  irPara(estado.agoraMs);
  pintarMarca();
  pintarMomentos();
  guardar();
}

/** Deitar fora tudo o que estava no ecrã, sem deixar leitores a tocar sozinhos. */
function limparPalco() {
  estado.players.forEach((p) => p.destroy?.());
  estado.players.clear();
  for (const v of document.querySelectorAll('#palcoFoco video, #grade video')) v.pause?.();
  $('palcoFoco').innerHTML = '';
  $('grade').innerHTML = '';
  $('faixas').querySelectorAll('.faixa').forEach((f) => f.remove());
  $('regua').innerHTML = '';
  $('listaMomentos').innerHTML = '';
  estado.linhas = [];
  estado.janela = null;
  $('angulos').textContent = '';
}

/**
 * Uma barra por canal, com o tempo em que esteve mesmo no ar.
 *
 * Sem isto, procurar o momento era arrastar a barra às cegas: os buracos e as
 * sobreposições só se descobriam batendo com o nariz neles. Aqui vê-se de
 * relance onde há dois ângulos e onde há um só, e clica-se lá directamente.
 */
function pintarFaixas() {
  const { inicio, fim } = estado.janela || {};
  const alvo = $('faixas');
  [...alvo.querySelectorAll('.faixa')].forEach((f) => f.remove());
  if (inicio == null || !(fim > inicio)) return;
  const pct = (ms) => ((ms - inicio) / (fim - inicio)) * 100;

  for (const linha of estado.linhas) {
    const nudge = estado.nudges[linha.slug] || 0;
    const f = document.createElement('div');
    f.className = 'faixa';
    f.dataset.slug = linha.slug;
    f.innerHTML = `<span class="nome" title="${linha.slug}">${linha.slug}</span>`
      + `<div class="trilho">${linha.pecas.map((p) => {
        const de = Math.max(0, pct(p.playlist.inicio - nudge));
        const ate = Math.min(100, pct(p.playlist.fim - nudge));
        return `<i style="left:${de}%;width:${Math.max(0.4, ate - de)}%"></i>`;
      }).join('')}</div>`;
    // Clicar na faixa vai directo ao instante.
    f.querySelector('.trilho').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      irPara(Math.round(inicio + ((fim - inicio) * (e.clientX - r.left)) / r.width));
    };
    alvo.append(f);
  }
  marcarFaixas();
  pintarRegua();
}

/**
 * A régua: as horas por baixo das barras, e as kills marcadas nela.
 *
 * Sem isto sabe-se que se está "algures no meio" e mais nada. Com ela, olha-se
 * uma vez e sabe-se que horas são naquele ponto — e onde já se marcou.
 */
function pintarRegua() {
  const { inicio, fim } = estado.janela || {};
  const alvo = $('regua');
  if (!alvo) return;
  if (inicio == null || !(fim > inicio)) { alvo.innerHTML = ''; return; }
  const total = fim - inicio;
  const pct = (ms) => ((ms - inicio) / total) * 100;

  // Um passo redondo: cinco minutos numa noite curta, meia hora numa longa.
  // Escolher pelo número de marcas em vez de um valor fixo é o que faz a régua
  // continuar legível quer a noite tenha vinte minutos quer tenha dez horas.
  const PASSOS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360].map((m) => m * 60_000);
  // Oito intervalos e nao dez: num telemovel as etiquetas de dez ja se tocam
  // umas nas outras, e uma regua ilegivel e pior do que regua nenhuma.
  const passo = PASSOS.find((p) => total / p <= 8) || PASSOS.at(-1);

  const partes = [];
  const primeiro = Math.ceil(inicio / passo) * passo;
  for (let t = primeiro; t <= fim; t += passo) {
    const x = pct(t);
    partes.push(`<i class="risco" style="left:${x}%"></i>`);
    partes.push(`<b class="hora" style="left:${x}%">${relogioCurto(t).slice(0, 5)}</b>`);
  }
  for (const [i, m] of ordenar(estado.momentos).entries()) {
    if (m.ms < inicio || m.ms > fim) continue;
    partes.push(`<button class="kill" data-ms="${m.ms}" style="left:${pct(m.ms)}%" `
      + `title="kill ${i + 1} — ${relogioCurto(m.ms)}Z"><span>${i + 1}</span></button>`);
  }
  alvo.innerHTML = partes.join('');
  for (const b of alvo.querySelectorAll('.kill')) {
    b.onclick = () => irPara(Number(b.dataset.ms));
  }
}

function marcarFaixas() {
  for (const f of $('faixas').querySelectorAll('.faixa')) {
    f.classList.toggle('principal', ehPrincipal(f.dataset.slug));
  }
}

// ── grelha ──────────────────────────────────────────────────────────────────

const tileDe = (slug) => document.querySelector(`.tile[data-slug="${CSS.escape(slug)}"]`);
const ehFoco = (slug) => estado.focos.includes(slug);
const ehPrincipal = (slug) => estado.focos[0] === slug;

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
  for (const tile of document.querySelectorAll('#palcoFoco .tile, #grade .tile')) {
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
  for (const b of document.querySelectorAll('.tile .pausa')) b.textContent = estado.parado ? '▶' : '⏸';
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
    const ms = instanteSeguindo(estado.ancora, v);
    if (ms == null) return;
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
  // A janela é a MESMA que vai para o ficheiro. Uma prévia com outros limites
  // mostrava-lhe uma coisa e entregava-lhe outra.
  estado.previa = {
    ms,
    de: ms - (m.protagonistaAntesS ?? 5) * 1000,
    ate: ms + (m.protagonistaDepoisS ?? 2) * 1000,
  };
  if (estado.parado) alternarPausa();
  irPara(estado.previa.de);
  pintarMomentos();
}

function temSom(slug) {
  if (slug in estado.mudo) return !estado.mudo[slug];
  return ehPrincipal(slug);
}

function alternarSom(slug) {
  estado.mudo[slug] = temSom(slug);
  aplicarFoco();
  const v = tileDe(slug)?.querySelector('video');
  // Este `play()` sai de um clique, e e por isso que existe: o browser so
  // deixa tocar com som depois de alguem carregar em alguma coisa.
  if (v && temSom(slug)) v.play?.().catch(() => {});
  guardar();
}

function tornarPrincipal(slug) {
  if (!ehFoco(slug)) return;
  estado.focos = [slug, ...estado.focos.filter((s) => s !== slug)];
  aplicarFoco();
  irPara(estado.agoraMs);
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
    if (!jaCerto) {
      const antes = foco ? destino.children[posicao] : null;
      destino.insertBefore(tile, antes || null);
    }
    tile.classList.toggle('foco', foco);
    tile.classList.toggle('principal', ehPrincipal(slug));
    tile.querySelector('.par').textContent = foco ? '✓' : '⧉';
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

    const som = tile.querySelector('.som');
    som.hidden = !foco;
    const botao = som.querySelector('.somBtn');
    botao.textContent = cala || nivel === 0 ? '🔇' : nivel < 0.5 ? '🔉' : '🔊';
    botao.title = cala ? t('tile.ligarSom') : t('tile.calar');
    som.querySelector('.vol').value = String(Math.round(nivel * 100));
    som.querySelector('.pausa').textContent = estado.parado ? '▶' : '⏸';
  }
  $('palcoFoco').classList.toggle('dois', estado.focos.length > 1);
  marcarFaixas();
}

function montarGrade() {
  $('grade').innerHTML = '';
  $('palcoFoco').innerHTML = '';
  estado.players.forEach((p) => p.destroy?.());
  estado.players.clear();

  for (const linha of estado.linhas) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.slug = linha.slug;
    tile.innerHTML = '<video muted playsinline preload="none"></video>'
      + `<span class="rotulo">${linha.slug}`
      + `${linha.relogio !== 'exato' ? ` <b class="aviso" title="${t('tile.relogioIncerto')}">≈</b>` : ''}`
      + ' <b class="posicao"></b></span>'
      + '<span class="estadoTile"></span>'
      // O relógio da Kick põe cada ângulo dentro de um segmento da verdade, o
      // que já está dentro do que o dono pediu. Isto é para o resto: um stream
      // com mais buffer, ou um olho que diz "este está meio segundo à frente".
      + '<span class="ajuste">'
      + `<button data-passo="-1" title="${t('tile.atrasar')}">−</button>`
      + '<b class="nudge">0.0s</b>'
      + `<button data-passo="1" title="${t('tile.adiantar')}">+</button>`
      + '</span>'
      // O som no canto de baixo à esquerda, com o cursor de volume ao lado —
      // o mesmo sítio da Twitch, da Kick e do YouTube. Um controlo que toda a
      // gente já sabe usar não se põe noutro sítio só porque dá jeito.
      + '<span class="som" hidden>'
      + `<button class="pausa" title="${t('tile.pausa')}">⏸</button>`
      + '<button class="somBtn">🔇</button>'
      + '<input class="vol" type="range" min="0" max="100" value="100" aria-label="volume">'
      + '</span>'
      + `<button class="par" title="${t('tile.par')}">⧉</button>`;

    tile.onclick = () => {
      // Num quadrado que já está em foco, o clique promove-o a principal em vez
      // de desfazer o par: com dois no ecrã, é isso que se quer dizer.
      if (ehFoco(linha.slug)) tornarPrincipal(linha.slug);
      else { estado.focos = [linha.slug]; aplicarFoco(); irPara(estado.agoraMs); }
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
    tile.querySelector('.pausa').onclick = (e) => { e.stopPropagation(); alternarPausa(); };
    tile.querySelector('.somBtn').onclick = (e) => { e.stopPropagation(); alternarSom(linha.slug); };
    const vol = tile.querySelector('.vol');
    vol.onclick = (e) => e.stopPropagation();
    vol.oninput = (e) => {
      e.stopPropagation();
      estado.volume[linha.slug] = Number(vol.value) / 100;
      // Mexer no volume LIGA o som: ninguém arrasta o cursor de um canal
      // calado à espera de continuar a não ouvir nada.
      if (Number(vol.value) > 0) estado.mudo[linha.slug] = false;
      aplicarFoco();
      guardar();
    };
    $('grade').append(tile);
  }
  aplicarFoco();
}

/** Ajuste manual de um ângulo — o resto da grelha não se mexe. */
function empurrar(slug, ms) {
  const { nudges } = comNudge({ nudges: estado.nudges }, slug, (estado.nudges[slug] || 0) + ms);
  estado.nudges = nudges;
  irPara(estado.agoraMs);
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
  $('agora').textContent = `${relogioCurto(quandoMs)}Z`;
  const vivos = quantosNoAr(estado.linhas, quandoMs, { nudges: estado.nudges });
  for (const li of $('listaMomentos').querySelectorAll('li[data-ms]')) {
    li.classList.toggle('aqui', Math.abs(Number(li.dataset.ms) - quandoMs) < 1500);
  }
  // Com um canal so isto dizia "1 de 1 angulos" a vermelho, como se faltasse
  // alguem. Nao falta: e o que ele pediu.
  $('angulos').textContent = soUmCanal() ? '' : t('tempo.angulos', { n: vivos, total: estado.linhas.length });
  $('angulos').classList.toggle('mau', !soUmCanal() && vivos < 2);
  const { inicio, fim } = estado.janela;
  const fraccao = Math.min(1, Math.max(0, (quandoMs - inicio) / (fim - inicio)));
  $('barra').value = String(Math.round(fraccao * 1000));
  // O cursor vive por cima das faixas e não dentro de uma delas: é um instante
  // só, partilhado por todos os canais — que é a ideia toda desta página.
  $('cursor').style.left = `calc(var(--coluna) + (100% - var(--coluna)) * ${fraccao})`;
}

function irPara(quandoMs) {
  estado.agoraMs = quandoMs;
  guardar();
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
    tile.querySelector('.posicao').textContent = mmss(r.tempoS);

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
    for (const [l, r, v] of secundarios) tocar(l, r, v, { alta: false, correr: false });
  }, 220);
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

function pararTile(slug, video) {
  const p = estado.players.get(slug);
  if (p) { p.destroy(); estado.players.delete(slug); }
  video.removeAttribute('src');
}

function tocar(linha, r, video, { alta = false, correr = false, comSom = false } = {}) {
  const peca = linha.pecasCompletas.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  // Focus gets the best rung the ladder has; everything else stays at 160p.
  // A qualidade segue o PRINCIPAL, e não o facto de estar a correr: o segundo
  // do par corre, mas a 160p — dois degraus de cima ao mesmo tempo era o que
  // fazia o par demorar o dobro a aparecer.
  const alvo = alta ? peca.escada[0] : peca.barato;
  const anterior = estado.players.get(linha.slug);

  if (anterior && anterior.url === alvo.url) {
    if (Math.abs(video.currentTime - r.tempoS) > 0.35) video.currentTime = r.tempoS;
    if (!correr && !video.paused) video.pause();
    return;
  }
  anterior?.destroy();

  if (window.Hls?.isSupported()) {
    // Um ângulo parado precisa do pedaço onde está e de mais nada. Trinta
    // buffers de trinta segundos são trezentos MB de RAM a não servir para
    // coisa nenhuma.
    const hls = new window.Hls({ startPosition: r.tempoS, maxBufferLength: alta ? 30 : correr ? 8 : 2 });
    hls.loadSource(alvo.url);
    hls.attachMedia(video);
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => hls.destroy() });
  } else {
    // Safari plays HLS natively and hls.js refuses to load there.
    video.src = alvo.url;
    video.currentTime = r.tempoS;
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => { video.removeAttribute('src'); } });
  }
  // Propriedade E atributo. A propriedade e que manda no som, mas deixar o
  // atributo `muted` do HTML para tras faz o quadrado dizer uma coisa e fazer
  // outra — e foi assim que "nao sai som de nenhum dos dois" passou nos testes.
  video.muted = !comSom;
  video.toggleAttribute('muted', !comSom);
  // `play()` devolve uma promessa que rejeita se o browser recusar tocar sem
  // um clique. Ignorada de propósito: o utilizador carrega no quadrado e
  // resolve-se sozinho — rebentar aqui deixava a página sem grelha nenhuma.
  // Um `irPara` durante uma pausa não pode fazer o vídeo voltar a andar: o
  // botão diz parado e o quadrado andava, que é a pior das duas coisas.
  if (correr && !estado.parado) video.play?.().catch(() => {});
  else video.pause?.();
  // Um leitor criado durante a pausa nasce com a mesma guarda: sem isto,
  // trocar de ângulo com a página parada punha o novo a andar.
  if (estado.parado && !video.__guarda) {
    video.__guarda = () => { if (estado.parado) video.pause?.(); };
    video.addEventListener('play', video.__guarda);
    video.addEventListener('playing', video.__guarda);
  }
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
  const controlo = new AbortController();
  const botao = $('alinhar');
  const nota = $('estadoAlinhar');
  nota.classList.remove('mau');

  // Com trinta ângulos isto passa a ser umas centenas de MB. Perguntar é mais
  // barato do que gastar os dados de alguém e explicar depois.
  const mb = custoEstimadoMB(estado.linhas.length);
  if (mb > 80 && !confirm(t('alinhar.custo', { n: estado.linhas.length, mb }))) return;
  botao.disabled = true;

  try {
    const r = await alinharPeloSom({
      linhas: estado.linhas,
      janela: estado.janela,
      sinal: controlo.signal,
      aoProgresso: (p) => {
        nota.textContent = p.fase === 'ouvir'
          ? t('alinhar.aOuvir', {
            canal: p.canal, feito: p.feito, total: p.total, mb: (p.bytes / 1048576).toFixed(0),
          })
          : t('alinhar.aComparar');
      },
    });

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
    montarGrade();
    irPara(estado.agoraMs);
  } catch (e) {
    nota.classList.add('mau');
    nota.textContent = e.name === 'AbortError' ? t('alinhar.cancelado')
      : e.name === 'SEM-DESCODIFICADOR' ? t('alinhar.semCodec')
        : t('alinhar.erro', { erro: e.message });
  }
  botao.disabled = false;
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
async function procurarKills() {
  if (!estado.linhas.length || !estado.janela) return;
  const canal = estado.focos[0] || estado.linhas[0].slug;
  const linha = estado.linhas.find((l) => l.slug === canal);
  const botao = $('procurarKills');
  const nota = $('estadoMontagem');

  const pedido = Number($('janelaAuto').value) * 1000;
  const deMs = Math.max(linha.inicio, estado.agoraMs);
  const ateMs = pedido ? Math.min(linha.fim, deMs + pedido) : linha.fim;
  if (!(ateMs > deMs)) return;

  const mb = custoVarrerMB(ateMs - deMs);
  if (!confirm(t('auto.custo', { min: Math.round((ateMs - deMs) / 60000), mb }))) return;

  const controlo = new AbortController();
  estado.cancelar = () => controlo.abort();
  botao.disabled = true;
  nota.classList.remove('mau');

  try {
    const r = await varrerNoite({
      linha,
      deMs,
      ateMs,
      sinal: controlo.signal,
      // 24 kHz, e nao os 8 do alinhamento: o tiro vive no agudo.
      lerSom: (l, quandoMs, duracaoS, opcoes) => somDoCanal(l, quandoMs, duracaoS, { ...opcoes, taxa: TAXA_TIROS }),
      aoProgresso: (p) => {
        nota.textContent = t('auto.aOuvir', {
          feito: p.feito, total: p.total, mb: (p.bytes / 1048576).toFixed(0),
        });
      },
    });

    estado.estouros = r.estouros || [];
    if (!r.candidatos.length) { nota.textContent = t('auto.nenhum'); return; }

    for (const c of r.candidatos) {
      estado.momentos = acrescentar(
        estado.momentos,
        novoMomento(c.ms, canal, { ...tamanhos(), auto: true, tiros: c.tiros }),
      );
    }
    pintarMomentos();
    guardar();

    // E agora a outra metade: quem morreu em cada um.
    let comMorte = 0;
    for (const [i, c] of r.candidatos.entries()) {
      if (controlo.signal.aborted) break;
      nota.textContent = t('auto.aVer', { feito: i + 1, total: r.candidatos.length });
      const antes = estado.momentos.find((m) => Math.abs(m.ms - c.ms) < 2000);
      if (!antes) continue;
      // eslint-disable-next-line no-await-in-loop
      const houve = await verQuemMorreu(antes.ms, { silencioso: true });
      if (houve) comMorte++;
    }

    nota.textContent = t('auto.achei', { n: r.candidatos.length })
      + (comMorte ? t('auto.comMorte', { n: comMorte }) : '');
    pintarMomentos();
    guardar();
  } catch (e) {
    nota.classList.add('mau');
    nota.textContent = e.name === 'AbortError' ? t('alinhar.cancelado')
      : e.name === 'SEM-DESCODIFICADOR' ? t('auto.semCodec')
        : t('alinhar.erro', { erro: e.message });
  }
  botao.disabled = false;
  estado.cancelar = null;
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
  const li = $('listaMomentos').querySelector(`li[data-ms="${ms}"]`);
  if (!li) return false;
  const caixa = li.querySelector('.olhar');
  const botao = li.querySelector('.verMortes');
  botao.disabled = true;
  if (!silencioso) {
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
      if (!silencioso) {
        caixa.innerHTML = `<span class="nota">${t('montagem.aOlharQuantos',
          { feito: vistos, total: estado.linhas.length })}</span>`;
      }
    }));

    ({ sugeridos, ordenados } = quemMorreu(notas));
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

  // Redesenhar a lista PRIMEIRO, e só depois pôr os cartões.
  //
  // Ao contrário, os cartões apareciam e desapareciam no mesmo instante: o
  // `pintarMomentos` no fim reconstruía a linha inteira e levava-os com ela.
  pintarMomentos();
  const li2 = $('listaMomentos').querySelector(`li[data-ms="${msFinal}"]`);
  const caixa2 = li2?.querySelector('.olhar');
  if (!caixa2) return sugeridos.length > 0;
  // Em busca automática os cartões ficam guardados mas fechados: vinte
  // tiroteios abertos ao mesmo tempo eram uma página de dois metros.
  caixa2.hidden = silencioso;

  const cartoes = estado.linhas.map((l) => {
    const n = notas[l.slug];
    const eSugerido = sugeridos.includes(l.slug);
    const posicao = ordenados.findIndex((o) => o.canal === l.slug);
    return `<button class="cartao ${eSugerido ? 'morreu' : ''}" data-canal="${l.slug}">`
      + (imagens[l.slug] ? `<img src="${imagens[l.slug]}" alt="">`
        : `<span class="semImagem">${t('montagem.semImagem')}</span>`)
      + `<b>${l.slug}</b>`
      + `<span class="nota">${n ? `${eSugerido ? t('montagem.morreu') : ''}${posicao + 1}º`
        : t('montagem.naoFilmava')}</span>`
      + '</button>';
  }).join('');

  const semNada = !Object.values(notas).some(Boolean);
  const dito = afinado != null && afinado !== ms
    ? t('montagem.acerteiInstante', { hora: `${relogioCurto(afinado)}Z` })
    : '';
  caixa2.innerHTML = (semNada
    ? `<span class="nota mau">${t('montagem.naoVi')}</span>`
    : `<span class="nota">${sugeridos.length
      ? t('montagem.pareceMorreu', { lista: sugeridos.join(', ') })
      : t('montagem.ninguem')}${dito}</span>`) + cartoes;

  for (const b of caixa2.querySelectorAll('.cartao')) {
    b.onclick = () => {
      estado.momentos = estado.momentos.map((m) => (m.ms === msFinal ? alternarVitima(m, b.dataset.canal) : m));
      pintarMomentos();
      guardar();
    };
  }
  const botao2 = li2.querySelector('.verMortes');
  if (botao2) botao2.disabled = false;
  return sugeridos.length > 0;
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
  const [vivo, morto] = await Promise.all([apanhador.frame(slug, inicio), apanhador.frame(slug, fim)]);
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
  const canais = estado.linhas.map((l) => l.slug);
  const sozinho = soUmCanal();
  const lista = ordenar(estado.momentos);
  const visiveis = filtrar(lista, estado.filtro);
  // A seleccao nao pode guardar fantasmas: um momento apagado cujo ms ficasse
  // marcado voltava a contar no "3 seleccionados" para sempre.
  const vivos = new Set(lista.map((m) => m.ms));
  for (const ms of estado.selecao) if (!vivos.has(ms)) estado.selecao.delete(ms);

  $('listaMomentos').innerHTML = visiveis.map((m) => {
    // O numero e a posicao na montagem INTEIRA e nao na lista filtrada: e este
    // o numero que vai no nome do ficheiro, e duas contagens diferentes para a
    // mesma kill seriam um erro a espera de acontecer na mesa de montagem.
    const i = lista.indexOf(m);
    const n = planoDaMontagem([m], canais, { filmava }).length;
    // As fichas de quem morreu. Sem isto a página cortava todos os ângulos em
    // cada kill, e saíam quatro clipes de lixo por cada um bom.
    const fichas = sozinho ? '' : canais.filter((c) => c !== m.protagonista).map((c) => {
      const morreu = (m.vitimas || []).includes(c);
      const havia = filmava(c, m.ms - 3000, m.ms + 3000);
      return `<button class="vit ${morreu ? 'sim' : ''}" data-canal="${c}"`
        + `${havia ? '' : ` disabled title="${t('montagem.naoFilmava')}"`}>${c}</button>`;
    }).join('');
    return `<li data-ms="${m.ms}" class="${Math.abs(m.ms - estado.agoraMs) < 1500 ? 'aqui' : ''}`
      + `${temMorte(m) ? ' confirmada' : ''}">`
      + `<input type="checkbox" class="pega" ${estado.selecao.has(m.ms) ? 'checked' : ''}`
      + ` aria-label="${relogioCurto(m.ms)}">`
      + `<b class="n">${String(i + 1).padStart(2, '0')}</b>`
      + `<span>${relogioCurto(m.ms)}Z</span>`
      + `<span class="quem">${m.protagonista || '—'}</span>`
      + `<button class="ver ${estado.previa?.ms === m.ms ? 'aVer' : ''}">`
      + `${t(estado.previa?.ms === m.ms ? 'montagem.parar' : 'montagem.ver')}</button>`
      + `<button class="baixarUma" ${n ? '' : 'disabled'}>${t('montagem.baixarUma')}</button>`
      + (estado.estouros.length ? `<button class="foiKill">${t('auto.foiKill')}</button>` : '')
      + `<button class="fora">${t('montagem.apagar')}</button>`
      + (sozinho ? '' : `<button class="verMortes">${t('montagem.verMortes')}</button>`)
      + `<span class="quantos">${tn(n, 'montagem.umClipe', 'montagem.clipes')}</span>`
      + (sozinho ? '' : `<span class="vitimas"><span class="nota">${t('montagem.matou')}</span>${fichas}</span>`)
      + '<div class="olhar" hidden></div></li>';
  }).join('') || `<li class="nota">${t('montagem.vazia')}</li>`;

  for (const li of $('listaMomentos').querySelectorAll('li[data-ms]')) {
    const ms = Number(li.dataset.ms);
    li.querySelector('.ver').onclick = () => verMomento(ms);
    const fk = li.querySelector('.foiKill');
    if (fk) fk.onclick = () => aprenderCom(ms);
    li.querySelector('.baixarUma').onclick = () => {
      const m = estado.momentos.find((x) => x.ms === ms);
      if (m) baixarMontagem([m]);
    };
    const vm = li.querySelector('.verMortes');
    if (vm) vm.onclick = () => verQuemMorreu(ms);
    li.querySelector('.fora').onclick = () => {
      estado.momentos = remover(estado.momentos, ms);
      pintarMomentos();
      guardar();
    };
    li.querySelector('.pega').onchange = (e) => {
      if (e.target.checked) estado.selecao.add(ms); else estado.selecao.delete(ms);
      pintarSelecao();
    };
    for (const b of li.querySelectorAll('.vit')) {
      b.onclick = () => {
        estado.momentos = estado.momentos.map((m) => (m.ms === ms ? alternarVitima(m, b.dataset.canal) : m));
        pintarMomentos();
        guardar();
      };
    }
  }
  pintarRegua();
  pintarSelecao();
  const total = planoDaMontagem(lista, canais, { filmava }).length;
  $('baixarMontagem').disabled = !total;
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

/** Os botoes da barra dizem sempre o que fazem sobre quantos. */
function pintarSelecao() {
  const n = estado.selecao.size;
  $('apagarSelecionados').disabled = !n;
  $('estadoSelecao').textContent = n ? t('sel.quantos', { n }) : '';
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
async function baixarMontagem(soEsta = null) {
  const canais = estado.linhas.map((l) => l.slug);
  const todas = ordenar(estado.momentos);
  // A numeração é sempre a da montagem inteira, mesmo a pedir uma só: é este
  // número que vai no nome do ficheiro, e tem de ser o mesmo nos dois caminhos.
  const plano = planoDaMontagem(todas, canais, { filmava })
    .filter((c) => !soEsta || soEsta.some((m) => m.ms === c.ms));
  const controlo = new AbortController();
  estado.cancelar = () => controlo.abort();
  $('baixarMontagem').disabled = true;
  if (!soEsta) limparFila();

  const cache = new Map();
  const jaTemos = new Map();
  // A soma de controlo calcula-se agora, com os bytes ja na mao. Guardar os
  // clipes para os reler no fim era pedir meio giga de memoria uma segunda vez.
  const paraZip = [];
  let feitos = 0;

  for (const clipe of plano) {
    if (controlo.signal.aborted) break;
    const linha = estado.linhas.find((l) => l.slug === clipe.canal);
    const nudge = estado.nudges[clipe.canal] || 0;
    $('estadoMontagem').textContent = `${++feitos}/${plano.length} — ${clipe.prefixo} ${clipe.canal}`;

    const item = document.createElement('li');
    $('fila').append(item);
    try {
      const p = await planearCorte({
        linha, deMs: clipe.deMs + nudge, ateMs: clipe.ateMs + nudge, cache,
      });
      if (p.estado !== 'ok') {
        item.innerHTML = `<b>${clipe.prefixo} ${clipe.canal}</b> <span class="nota">${p.estado}</span>`;
        continue;
      }
      const r = await executarCorte(p, { sinal: controlo.signal, jaTemos });
      if (r.estado !== 'pronto') {
        item.innerHTML = `<b>${clipe.prefixo} ${clipe.canal}</b> `
          + `<span class="nota mau">${t('corte.incompleto', { obtidos: r.obtidos ?? 0, total: r.total ?? 0 })}</span>`;
        continue;
      }
      const nome = `${clipe.prefixo}_${nomeDoFicheiro({ canal: clipe.canal, quandoMs: clipe.deMs })}`;
      const blob = new Blob([r.bytes], { type: r.tipo });
      paraZip.push({ nome, blob, crc: crc32(r.bytes), tamanho: r.bytes.length });
      linhaDeFicheiro(item, {
        nome,
        url: guardarFicheiro(blob),
        nota: `${(r.bytes.length / 1048576).toFixed(1)} MB · `
          + `${clipe.papel === 'protagonista' ? t('fila.tuaPov') : t('fila.quemMorreu')}`,
      });
    } catch (e) {
      if (e.name === 'AbortError') break;
      item.innerHTML = `<b>${clipe.prefixo} ${clipe.canal}</b> <span class="nota mau">${e.message}</span>`;
    }
  }

  $('estadoMontagem').textContent = t('montagem.pronto', { feitos, total: plano.length });
  // O ZIP é da montagem inteira. A pedir uma kill só, juntar num ZIP era pôr
  // ali um botão que só levava a última coisa que ele carregou.
  if (!soEsta) oferecerZip(paraZip);
  $('baixarMontagem').disabled = false;
  estado.cancelar = null;
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
  if (!perto) { $('estadoMontagem').textContent = t('auto.semSom'); return; }

  estado.exemplo = perto.recorte;
  const iguais = juntarPerto(parecidos(estado.exemplo, estado.estouros));
  if (!iguais.length) { $('estadoMontagem').textContent = t('auto.semSom'); return; }

  // A lista passa a ser esta. Os candidatos velhos eram o palpite; estes sao o
  // som que ele confirmou — deitar fora o palpite e o ponto todo.
  const canal = estado.focos[0] || estado.linhas[0]?.slug;
  const antigos = estado.momentos.filter((m) => !m.auto);
  estado.momentos = [...antigos];
  for (const g of iguais.slice(0, 60)) {
    estado.momentos = acrescentar(
      estado.momentos,
      novoMomento(g.ms, canal, { ...tamanhos(), auto: true, tiros: g.quantos }),
    );
  }
  pintarMomentos();
  guardar();
  $('estadoMontagem').textContent = t('auto.aprendi', { n: iguais.length });
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

const mmssCurto = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function pintarMarca() {
  const { de, ate } = estado.marca;
  $('marca').textContent = de == null ? ''
    : ate == null ? t('marca.faltaFim', { de: `${relogioCurto(de)}Z` })
      : t('marca.feita', { de: `${relogioCurto(de)}Z`, ate: `${relogioCurto(ate)}Z`, dur: hhmmss(ate - de) });
  pintarCorte();
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
  // A secção fica sempre à vista, e diz o que fazer quando ainda não há marca:
  // escondê-la fazia com que ninguém descobrisse que se podia baixar.
  $('comoCortar').innerHTML = t('corte.como', { i: '<kbd>I</kbd>', o: '<kbd>O</kbd>' });
  $('comoCortar').hidden = valida;
  $('listaCorte').hidden = !valida;
  if (!valida) { $('listaCorte').innerHTML = ''; return; }

  const presentes = estado.linhas.filter((l) => {
    const nudge = estado.nudges[l.slug] || 0;
    return onde(l, de, { nudgeMs: nudge }).estado === 'toca'
      || onde(l, ate, { nudgeMs: nudge }).estado === 'toca';
  });

  $('listaCorte').innerHTML = presentes.map((l) => {
    const m = estado.margens[l.slug] || {};
    return `<li data-slug="${l.slug}">`
      + `<b>${l.slug}</b>`
      + `<label>${t('corte.antes')} <input class="antes" type="number" value="${m.antesS || 0}" min="0" max="120" step="1">s</label>`
      + `<label>${t('corte.depois')} <input class="depois" type="number" value="${m.depoisS || 0}" min="0" max="120" step="1">s</label>`
      + '<span class="dur"></span>'
      + `<button class="baixarUm">${t('corte.baixar')}</button>`
      + `<span class="estadoCorte nota"></span>`
      + `</li>`;
  }).join('')
    || `<li class="nota">${t('corte.ninguem')}</li>`;

  for (const li of $('listaCorte').querySelectorAll('li[data-slug]')) {
    const slug = li.dataset.slug;
    const ler = () => {
      const antesS = Math.max(0, Number(li.querySelector('.antes').value) || 0);
      const depoisS = Math.max(0, Number(li.querySelector('.depois').value) || 0);
      estado.margens[slug] = { antesS, depoisS };
      guardar();
      li.querySelector('.dur').textContent = mmssCurto((ate - de) / 1000 + antesS + depoisS);
    };
    li.querySelector('.antes').oninput = ler;
    li.querySelector('.depois').oninput = ler;
    li.querySelector('.baixarUm').onclick = () => baixarUm(slug);
    ler();
  }
}

async function baixarUm(slug) {
  const linha = estado.linhas.find((l) => l.slug === slug);
  const li = $('listaCorte').querySelector(`li[data-slug="${CSS.escape(slug)}"]`);
  if (!linha || !li) return;
  const botao = li.querySelector('.baixarUm');
  const nota = li.querySelector('.estadoCorte');
  const controlo = new AbortController();
  estado.cancelar = () => controlo.abort();
  botao.disabled = true;
  nota.classList.remove('mau');

  const [r] = await cortarTodosOsAngulos({
    linhas: [linha],
    deMs: estado.marca.de,
    ateMs: estado.marca.ate,
    sinal: controlo.signal,
    nudges: estado.nudges,
    margens: estado.margens,
    aoProgresso: (p) => {
      nota.textContent = p.fase === 'planear' ? t('montagem.aPreparar')
        : t('montagem.pedacos', { prontos: p.prontos, total: p.total });
    },
  });

  botao.disabled = false;
  estado.cancelar = null;
  nota.textContent = '';
  const item = document.createElement('li');
  $('fila').prepend(item);

  if (r.estado === 'pronto') {
    // A sobra não é um pedido de desculpas — é o número por onde aparar no editor.
    linhaDeFicheiro(item, {
      nome: r.nome,
      url: guardarFicheiro(new Blob([r.bytes], { type: r.tipo })),
      nota: `${(r.bytes.length / 1048576).toFixed(1)} MB · `
        + `${r.plano.qualidade.altura}p${r.plano.qualidade.fps} · `
        + t('corte.comeca', { s: r.plano.sobraInicioS.toFixed(1) }),
    });
  } else if (r.estado === 'incompleto') {
    nota.classList.add('mau');
    item.innerHTML = `<b>${slug}</b> <span class="nota mau">`
      + `${t('corte.incompleto', { obtidos: r.obtidos, total: r.total })}</span>`;
  } else {
    const porque = {
      buraco: t('corte.buraco'),
      'fora-da-noite': t('corte.foraDaNoite'),
      'sem-segmentos': t('corte.semSegmentos'),
    };
    item.innerHTML = `<b>${slug}</b> <span class="nota">${porque[r.estado] || r.estado}</span>`;
  }
}

// ── criar clipe ─────────────────────────────────────────────────────────────
//
// "Não achei como se baixa um clipe só, um de cada vez." A montagem é para
// juntar uma noite inteira; isto é para quando se quer UM, agora.

const CONTEXTO_S = 150;   // o que a barra mostra de cada lado do instante

function abrirClipe() {
  if (!estado.linhas.length) return;
  const canal = estado.focos[0] || estado.linhas[0].slug;
  const linha = estado.linhas.find((l) => l.slug === canal) || estado.linhas[0];
  // Não deixar escolher um pedaço que este ângulo não filmou: os limites são
  // os do vídeo dele, e não os da noite.
  const limites = { inicio: linha.inicio, fim: linha.fim };
  const centro = Math.min(Math.max(estado.agoraMs, limites.inicio), limites.fim);

  estado.clipe = {
    canal: linha.slug,
    limites,
    vista: {
      inicio: Math.max(limites.inicio, centro - CONTEXTO_S * 1000),
      fim: Math.min(limites.fim, centro + CONTEXTO_S * 1000),
    },
    ...janelaInicial(centro, { limites }),
    hls: null,
  };

  $('canalClipe').innerHTML = estado.linhas
    .map((l) => `<option value="${l.slug}"${l.slug === linha.slug ? ' selected' : ''}>${l.slug}</option>`)
    .join('');
  $('tituloClipe').value = '';
  $('estadoClipe').textContent = '';
  $('guardarClipe').disabled = false;
  $('modalClipe').hidden = false;
  pintarClipe();
  preverClipe(estado.clipe.deMs);
}

function fecharClipe() {
  estado.clipe?.hls?.destroy();
  const v = $('previaClipe');
  v.pause?.();
  v.removeAttribute('src');
  estado.clipe = null;
  $('modalClipe').hidden = true;
}

const posClipe = (ms) => {
  const { inicio, fim } = estado.clipe.vista;
  return ((ms - inicio) / Math.max(1, fim - inicio)) * 100;
};

function pintarClipe() {
  const c = estado.clipe;
  if (!c) return;
  $('barraClipe').querySelector('.seleccao').style.cssText =
    `left:${posClipe(c.deMs)}%;width:${Math.max(0.5, posClipe(c.ateMs) - posClipe(c.deMs))}%`;
  $('barraClipe').querySelector('.pega.de').style.left = `${posClipe(c.deMs)}%`;
  $('barraClipe').querySelector('.pega.ate').style.left = `${posClipe(c.ateMs)}%`;
  const dur = (c.ateMs - c.deMs) / 1000;
  $('tempoClipe').textContent = t('clipe.tempo', {
    de: relogioCurto(c.deMs), ate: relogioCurto(c.ateMs), dur: dur.toFixed(1), max: MAXIMO_S,
  });
  $('tempoClipe').classList.toggle('mau', dur >= MAXIMO_S);
}

/** A prévia: o mesmo ângulo, no ponto onde o clipe começa. */
function preverClipe(quandoMs) {
  const c = estado.clipe;
  if (!c) return;
  const linha = estado.linhas.find((l) => l.slug === c.canal);
  const r = onde(linha, quandoMs, { nudgeMs: estado.nudges[c.canal] || 0 });
  const v = $('previaClipe');
  $('barraClipe').querySelector('.cabeca').style.left = `${posClipe(quandoMs)}%`;
  if (r.estado !== 'toca') { v.pause?.(); return; }
  const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  const alvo = peca.escada[0] || peca.barato;
  if (c.url !== alvo.url) {
    c.hls?.destroy();
    c.url = alvo.url;
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({ startPosition: r.tempoS, maxBufferLength: 20 });
      c.hls = hls;
      hls.loadSource(alvo.url);
      hls.attachMedia(v);
    } else { v.src = alvo.url; }
  }
  if (Math.abs(v.currentTime - r.tempoS) > 0.3) v.currentTime = r.tempoS;
}

function arrastar(qual) {
  return (ev) => {
    ev.preventDefault();
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

async function guardarClipe() {
  const c = estado.clipe;
  if (!c) return;
  const linha = estado.linhas.find((l) => l.slug === c.canal);
  const nudge = estado.nudges[c.canal] || 0;
  $('guardarClipe').disabled = true;
  $('estadoClipe').textContent = t('montagem.aPreparar');

  try {
    const plano = await planearCorte({ linha, deMs: c.deMs + nudge, ateMs: c.ateMs + nudge });
    if (plano.estado !== 'ok') {
      $('estadoClipe').textContent = t('clipe.naoDeu', { erro: plano.estado });
      $('guardarClipe').disabled = false;
      return;
    }
    const r = await executarCorte(plano, {
      aoProgresso: (p) => {
        $('estadoClipe').textContent = t('montagem.pedacos', { prontos: p.prontos, total: p.total });
      },
    });
    if (r.estado !== 'pronto') {
      $('estadoClipe').textContent = t('corte.incompleto', { obtidos: r.obtidos ?? 0, total: r.total ?? 0 });
      $('guardarClipe').disabled = false;
      return;
    }
    const nome = nomeDoClipe({ titulo: $('tituloClipe').value, canal: c.canal, quandoMs: c.deMs });
    const url = guardarFicheiro(new Blob([r.bytes], { type: r.tipo }));
    const item = document.createElement('li');
    $('fila').prepend(item);
    linhaDeFicheiro(item, {
      nome,
      url,
      nota: `${(r.bytes.length / 1048576).toFixed(1)} MB · ${plano.qualidade.altura}p${plano.qualidade.fps}`,
    });
    // Guardar já, sem obrigar a caçar o link na lista: quem carregou em
    // "Guardar clipe" quis o ficheiro, não uma linha para clicar depois.
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    fecharClipe();
  } catch (e) {
    $('estadoClipe').textContent = t('clipe.naoDeu', { erro: e.message });
    $('guardarClipe').disabled = false;
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
function linhaDeFicheiro(item, { nome, url, nota }) {
  item.innerHTML = `<a href="${url}" download="${nome}">${nome}</a> `
    + `<span class="nota">${nota}</span>`
    + `<button class="apagarUm" title="${t('fila.apagarUm')}">✕</button>`;
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
function recomecar() {
  const quantas = estado.momentos.length;
  const aviso = quantas ? t('recomecar.comKills', { n: quantas }) : t('recomecar.semKills');
  if (!confirm(aviso)) return;
  limparFila();
  try { localStorage.removeItem('replay'); } catch { /* janela privada */ }
  location.href = location.pathname;
}

// Uma janela para os testes olharem para dentro. Sem isto, verificar que a
// previa arranca no sitio certo obrigava a adivinhar pelo texto do ecra.
window.__estado = estado;

// ── ligações ────────────────────────────────────────────────────────────────

$('carregar').onclick = carregar;
// Qualquer navegacao a mao desliga a previa: se ele foi procurar outra coisa,
// nao pode ficar a ser puxado de volta para o clipe em ciclo.
const largarPrevia = () => { if (estado.previa) { estado.previa = null; pintarMomentos(); } };
$('barra').oninput = () => {
  const { inicio, fim } = estado.janela || {};
  if (inicio == null) return;
  largarPrevia();
  irPara(Math.round(inicio + ((fim - inicio) * Number($('barra').value)) / 1000));
};
// Os saltos que faltavam. A barra serve para procurar a noite; isto serve para
// caçar o momento, que é uma coisa diferente e a barra faz mal.
const saltar = (ms) => () => { largarPrevia(); irPara(estado.agoraMs + ms); };
$('menos1m').onclick = saltar(-60_000);
$('menos10s').onclick = saltar(-10_000);
$('mais10s').onclick = saltar(10_000);
$('mais1m').onclick = saltar(60_000);
$('marcarIn').onclick = () => { estado.marca = { de: estado.agoraMs, ate: null }; pintarMarca(); guardar(); };
$('marcarOut').onclick = () => { estado.marca.ate = estado.agoraMs; pintarMarca(); guardar(); };
$('alinhar').onclick = alinhar;
$('marcarKill').onclick = marcarKill;
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
// Seta, e nao a funcao directamente: o `onclick` passa o evento como primeiro
// argumento, e ele ia parar ao `soEsta` como se fosse uma lista de kills.
$('baixarMontagem').onclick = () => baixarMontagem();
$('limparFila').onclick = limparFila;
$('clipar').onclick = abrirClipe;
$('fecharClipe').onclick = fecharClipe;
$('cancelarClipe').onclick = fecharClipe;
$('guardarClipe').onclick = guardarClipe;
$('canalClipe').onchange = () => {
  const l = estado.linhas.find((x) => x.slug === $('canalClipe').value);
  if (!l || !estado.clipe) return;
  estado.clipe.hls?.destroy();
  Object.assign(estado.clipe, { canal: l.slug, hls: null, url: null, limites: { inicio: l.inicio, fim: l.fim } });
  Object.assign(estado.clipe, mover(estado.clipe, 'de', estado.clipe.deMs, { limites: estado.clipe.limites }));
  pintarClipe();
  preverClipe(estado.clipe.deMs);
};
$('barraClipe').querySelector('.pega.de').onpointerdown = arrastar('de');
$('barraClipe').querySelector('.pega.ate').onpointerdown = arrastar('ate');
for (const [id, delta] of [['menosClipe', -1000], ['maisClipe', 1000]]) {
  $(id).onclick = () => {
    if (!estado.clipe) return;
    Object.assign(estado.clipe, mover(estado.clipe, 'ate', estado.clipe.ateMs + delta,
      { limites: estado.clipe.limites }));
    pintarClipe();
  };
}
$('modalClipe').onclick = (e) => { if (e.target === $('modalClipe')) fecharClipe(); };
$('recomecar').onclick = recomecar;

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const passo = e.shiftKey ? 10_000 : 1000;
  // Com a janela do clipe aberta, o teclado é dela: Esc fecha, e o resto não
  // pode andar com o tempo por baixo do que se está a cortar.
  if (!$('modalClipe').hidden) {
    if (e.key === 'Escape') fecharClipe();
    return;
  }
  if (e.key === 'c' || e.key === 'C') $('clipar').click();
  if (e.key === ' ') { e.preventDefault(); alternarPausa(); }
  if (e.key === 'm' || e.key === 'M') $('marcarKill').click();
  if (e.key === 'i' || e.key === 'I') $('marcarIn').click();
  if (e.key === 'o' || e.key === 'O') $('marcarOut').click();
  if (e.key === 'j' || e.key === 'ArrowLeft') irPara(estado.agoraMs - passo);
  if (e.key === 'l' || e.key === 'ArrowRight') irPara(estado.agoraMs + passo);
  // O ângulo em foco anda sozinho: alinhar à vista, sem tirar a mão do teclado.
  if (e.key === ',' && estado.focos[0]) empurrar(estado.focos[0], -passo);
  if (e.key === '.' && estado.focos[0]) empurrar(estado.focos[0], passo);
});

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
  // A lista de canais é repintada a partir do que já foi lido, e não de uma
  // nova ida à Kick: trocar de idioma não pode custar pedidos a ninguém.
  if (ultimosCanais.length) pintarCanais(ultimosCanais);
  if (estado.linhas.length) {
    montarGrade();
    pintarFaixas();
    irPara(estado.agoraMs);
    pintarMarca();
    pintarMomentos();
  }
}

$('idioma').innerHTML = Object.entries(IDIOMAS)
  .map(([c, nome]) => `<option value="${c}">${nome}</option>`).join('');
$('idioma').onchange = () => trocarIdioma($('idioma').value);

let guardadoIdioma = null;
try { guardadoIdioma = localStorage.getItem('replay.idioma'); } catch { /* janela privada */ }

// O filtro fica fora do link da sessao de proposito. O link e para partilhar, e
// mandar a alguem uma montagem com metade escondida seria mandar-lhe um engano.
try { estado.filtro = localStorage.getItem('replay.filtro') || 'todos'; } catch { /* janela privada */ }
$('filtroMomentos').value = estado.filtro;
definirIdioma(guardadoIdioma || idiomaDoBrowser());
$('idioma').value = idiomaActual();
aplicarIdioma();

// ── arranque ────────────────────────────────────────────────────────────────
//
// A sessao sobrevive a um F5, a um travanco e a um link partilhado. E volta a
// carregar sozinha: devolver a caixa de texto preenchida mas vazia de video
// obrigava a repetir a espera toda.
const guardado = doLink(new URLSearchParams(location.search).get('s') || '')
  || doLink(localStorage.getItem('replay') || '');

if (guardado) {
  $('canais').value = guardado.canais.join('\n');
  estado.nudges = guardado.nudges;
  estado.margens = guardado.margens || {};
  estado.mudo = guardado.mudo || {};
  estado.volume = guardado.volume || {};
  estado.restaurar = guardado;
  if (guardado.canais.length) carregar();
}

// O `beforeunload` fica como ultima rede: num telemovel muitas vezes nunca
// corre, e por isso e que a gravacao a serio acontece a cada mudanca.
window.addEventListener('beforeunload', () => {
  clearTimeout(timerGuardar);
  timerGuardar = null;
  try {
    localStorage.setItem('replay', paraLink({
      canais: estado.linhas.length ? estado.linhas.map((l) => l.slug) : listaDeCanais(),
      janela: estado.janela,
      nudges: estado.nudges,
      marca: estado.marca,
      agoraMs: estado.agoraMs,
      focos: estado.focos,
      margens: estado.margens,
      mudo: estado.mudo,
      volume: estado.volume,
      momentos: estado.momentos,
    }));
  } catch { /* nunca partir a pagina por causa disto */ }
});
