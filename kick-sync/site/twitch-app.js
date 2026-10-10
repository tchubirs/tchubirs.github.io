/**
 * O Replay para a Twitch: os POVs lado a lado, sincronizados.
 *
 * Metade do que o Replay da Kick faz nao e possivel aqui, e isso esta medido
 * em `probes/twitch.mjs`: o CDN da Twitch so devolve o header de CORS para
 * `https://www.twitch.tv`, e sem ler os bytes nao ha sincronia pelo som, nem
 * saber quem morreu, nem clipe. O que ha e o player oficial em iframe, que
 * toca sem nos deixar ler nada, e um relogio vindo do `publishedAt` de cada
 * VOD — dois segundos de erro, medidos em dois canais reais.
 *
 * Tudo o que e relogio, noites, buracos e janela comum vem dos mesmos modulos
 * da Kick, sem uma linha nova: um VOD da Twitch entra la como uma peca de um
 * segmento so.
 */
import { t, aplicarIdioma, definirIdioma, idiomaActual, idiomaDoBrowser, IDIOMAS } from './idiomas.js';
import { procurarCanais, vodsDoCanal, pecaDoVod, loginDoCanal, tempoDoPlayer } from './twitch.js';
import { linhaDoCanal, onde, janelaComum, quantosNoAr } from './relogio.js';
import { agruparPorNoite, rotuloDaNoite } from './noites.js';
import { escapar } from './escapar.js';

const $ = (id) => document.getElementById(id);
// Quantos players cabem de uma vez. Cada um e um iframe com video a correr, e
// a partir daqui o browser de um portatil comum ja nao aguenta.
const MAX_CANAIS = 8;
// De quanto em quanto tempo o relogio partilhado anda, e a partir de quantos
// segundos de diferenca um player e puxado de volta para o grupo.
const TIQUE_MS = 500;
const DERIVA_S = 3;

const estado = {
  canais: [],        // {slug, vods:[...]}
  noites: [],
  noite: null,
  linhas: [],
  janela: null,
  agoraMs: 0,
  players: new Map(),
  // O que cada player mostra agora: {estado, video}. E o que deixa o relogio
  // agir so quando um canal muda (entra no ar, sai, troca de VOD).
  vistos: new Map(),
  aTocar: false,
  tique: null,
  ultimoTique: 0,
};

const doisDigitos = (n) => String(n).padStart(2, '0');
const relogioCurto = (ms) => {
  const d = new Date(ms);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`;
};

// Todos os canais escritos, ja como logins, sem repetidos e sem limite: a
// caixa de texto e dele, e nada aqui a pode reescrever a partir de uma copia
// cortada.
const todosOsCanais = () => $('canais').value.split('\n').map(loginDoCanal)
  .filter(Boolean).filter((s, i, a) => a.indexOf(s) === i);
const tileDe = (slug) => $('grade').querySelector(`.tile[data-slug="${CSS.escape(slug)}"]`);

// ── procurar ────────────────────────────────────────────────────────────────

async function procurar() {
  const termo = $('procurar').value.trim();
  if (termo.length < 2) return;
  $('sugestoes').innerHTML = `<span class="nota">${t('tw.aCarregar')}</span>`;
  try {
    const achados = await procurarCanais(termo);
    $('sugestoes').innerHTML = achados.length
      ? achados.map((c) => `<button class="sug" data-slug="${escapar(c.slug)}">`
        + `${c.imagem ? `<img src="${escapar(c.imagem)}" alt="" width="24" height="24">` : ''}`
        + `<span>${escapar(c.nome)}</span> <span class="nota">${escapar(c.slug)}</span></button>`).join('')
      : `<span class="nota">${t('procurar.nada')}</span>`;
    for (const b of $('sugestoes').querySelectorAll('.sug')) {
      b.onclick = () => {
        // Acrescentar uma linha, e nao reescrever a caixa: reescrita a partir
        // da lista cortada aos oito, apagava os canais que ele ja tinha posto.
        const slug = b.dataset.slug;
        if (!todosOsCanais().includes(slug)) {
          const ja = $('canais').value.replace(/\s+$/, '');
          $('canais').value = ja ? `${ja}\n${slug}` : slug;
        }
        $('sugestoes').innerHTML = '';
        $('procurar').value = '';
      };
    }
  } catch (e) {
    $('sugestoes').innerHTML = `<span class="nota mau">${t('tw.erro', { erro: escapar(e.message) })}</span>`;
  }
}

// ── carregar os VODs ────────────────────────────────────────────────────────

async function carregar() {
  const todos = todosOsCanais();
  if (!todos.length) { $('estado').textContent = t('tw.nada'); return; }
  const slugs = todos.slice(0, MAX_CANAIS);
  const deFora = todos.slice(MAX_CANAIS);
  $('carregar').disabled = true;
  $('estado').classList.remove('mau');
  $('estado').textContent = t('tw.aCarregar');

  try {
    // Todos ao mesmo tempo: sao pedidos de texto, e um de cada vez era esperar
    // oito vezes por nada.
    const canais = await Promise.all(slugs.map(async (slug) => {
      try {
        return { slug, vods: await vodsDoCanal(slug) };
      } catch (e) {
        // Um canal que nao existe nao pode levar os outros sete atras.
        return { slug, vods: [], erro: e.message };
      }
    }));
    estado.canais = canais;

    // Quem ficou de fora diz-se sempre: uma equipa de quatro com um nome mal
    // escrito via tres POVs e nunca sabia porque.
    const maus = canais.filter((c) => c.erro);
    const vazios = canais.filter((c) => !c.erro && !c.vods.length);
    const avisos = [];
    if (maus.length) avisos.push(t('tw.erro', { erro: maus.map((c) => `${c.slug}: ${c.erro}`).join(' · ') }));
    if (vazios.length) avisos.push(t('tw.semVodsDe', { lista: vazios.map((c) => c.slug).join(', ') }));
    if (deFora.length) avisos.push(t('tw.deFora', { n: MAX_CANAIS, lista: deFora.join(', ') }));

    const paraNoites = canais.map((c) => ({
      slug: c.slug,
      vods: c.vods.map((v) => ({ ...v, inicioApi: v.inicio, duracaoMs: v.duracaoS * 1000 })),
    }));
    estado.noites = agruparPorNoite(paraNoites);
    if (!estado.noites.length) {
      $('estado').classList.add('mau');
      const porque = maus.length ? avisos[0] : t('tw.semVods');
      $('estado').textContent = deFora.length ? `${porque} · ${avisos.at(-1)}` : porque;
      return;
    }

    $('painelNoite').hidden = false;
    desenharNoites();
    $('estado').textContent = avisos.join(' · ');
    abrirNoite(0);
  } catch (e) {
    $('estado').classList.add('mau');
    $('estado').textContent = t('tw.erro', { erro: e.message });
  } finally {
    // Em todos os caminhos, tambem no "nenhum VOD": senao ele nao podia
    // corrigir o nome e tentar outra vez sem recarregar a pagina.
    $('carregar').disabled = false;
  }
}

// O rotulo de cada noite na lingua escolhida; volta a ser desenhado quando
// ela muda de lingua.
function desenharNoites() {
  const escolhida = $('noites').value;
  $('noites').innerHTML = estado.noites.map((n, i) => `<option value="${i}">`
    + `${escapar(rotuloDaNoite(n, { t }))}</option>`).join('');
  if (escolhida) $('noites').value = escolhida;
}

// ── a noite escolhida ───────────────────────────────────────────────────────

function abrirNoite(i) {
  const n = estado.noites[i];
  if (!n) return;
  estado.noite = n;
  // Fechar os players anteriores ANTES de mexer na grelha: um iframe que fica
  // orfao continua a descarregar video em segundo plano.
  fecharPlayers();

  estado.linhas = [...new Set(n.itens.map((it) => it.slug))].map((slug) => {
    const vods = n.itens.filter((it) => it.slug === slug).map((it) => pecaDoVod({
      id: it.v.id, titulo: it.v.titulo, capa: it.v.capa, inicio: it.v.inicioApi,
      duracaoS: it.v.duracaoMs / 1000,
    }));
    return linhaDoCanal(slug, vods);
  }).filter((l) => l.pecas.length);

  estado.janela = janelaComum(estado.linhas);
  $('quemNaNoite').textContent = estado.linhas.map((l) => l.slug).join(' · ');
  if (!estado.janela) { $('palco').hidden = true; return; }

  // Sem o script do player (um bloqueador de anuncios, uma rede de empresa)
  // nao ha nada para mostrar, e a culpa nao e dos nomes dos canais.
  if (!window.Twitch?.Player) {
    $('palco').hidden = true;
    $('estado').classList.add('mau');
    $('estado').textContent = t('tw.semPlayer');
    return;
  }

  $('palco').hidden = false;
  estado.agoraMs = estado.janela.sobreposicaoInicio ?? estado.janela.inicio;
  montarGrade();
  irPara(estado.agoraMs);
}

function fecharPlayers() {
  pararRelogio();
  for (const p of estado.players.values()) {
    try { p.pause(); } catch { /* o iframe ja pode ter ido */ }
  }
  estado.players.clear();
  estado.vistos.clear();
  $('grade').innerHTML = '';
}

/**
 * Um player por canal.
 *
 * O `parent` e obrigatorio e tem de ser o dominio desta pagina — sem ele a
 * Twitch recusa-se a ser posta num iframe. Todos comecam em mudo: seis
 * players a falar ao mesmo tempo e inutilizavel, e ele liga o som do que quer.
 */
function montarGrade() {
  $('grade').innerHTML = estado.linhas.map((l) => `<div class="tile tw" data-slug="${escapar(l.slug)}">`
    + `<div class="cabeca"><b>${escapar(l.slug)}</b>`
    + `<label class="pequeno"><input type="checkbox" class="ligarSom"> <span data-t="tw.mudo">${t('tw.mudo')}</span></label>`
    + '</div>'
    + `<div class="quadro" id="pl-${escapar(l.slug)}"></div>`
    + '<span class="nota estadoTile"></span></div>').join('');

  for (const l of estado.linhas) {
    const r = onde(l, estado.agoraMs);
    const video = r.peca?.vod?.id ?? l.pecas[0].vod.id;
    const player = new window.Twitch.Player(`pl-${l.slug}`, {
      video: `v${video}`,
      parent: [location.hostname],
      width: '100%',
      height: '100%',
      autoplay: false,
      muted: true,
      time: tempoDoPlayer(r.estado === 'toca' ? r.tempoS : 0),
    });
    estado.players.set(l.slug, player);
    estado.vistos.set(l.slug, { estado: r.estado, video });

    tileDe(l.slug).querySelector('.ligarSom').onchange = (e) => {
      try { player.setMuted(!e.target.checked); } catch { /* ainda nao esta pronto */ }
    };
  }
}

// ── o relogio partilhado ────────────────────────────────────────────────────

/**
 * Pôr cada player de acordo com `estado.agoraMs`.
 *
 * Cada canal vai para o SEU segundo, que nao e o mesmo numero para todos: um
 * comecou a transmitir vinte minutos depois do outro. Quem nao estava no ar
 * naquele instante diz isso, em vez de mostrar o primeiro frame do VOD como se
 * fosse o momento certo. E um canal com dois VODs na noite (caiu e voltou)
 * troca de video: saltar para o segundo do VOD seguinte dentro do primeiro
 * mostrava outro momento da noite com ar de sincronizado.
 *
 * Com `saltar`, todos vao ao instante (foi ele que mexeu no tempo). Sem ele,
 * so age em quem mudou: e o que o relogio faz a cada tique enquanto toca.
 */
function aplicarInstante(saltar) {
  for (const l of estado.linhas) {
    const r = onde(l, estado.agoraMs);
    const tile = tileDe(l.slug);
    if (!tile) continue;
    const nota = tile.querySelector('.estadoTile');
    const player = estado.players.get(l.slug);
    const antes = estado.vistos.get(l.slug) || {};
    const toca = r.estado === 'toca';
    const video = toca ? r.peca.vod.id : antes.video;
    if (toca) {
      nota.textContent = '';
      tile.classList.remove('fora');
      const trocou = video !== antes.video;
      try {
        if (trocou) player?.setVideo(`v${video}`, Math.floor(r.tempoS));
        else if (saltar) player?.seek(r.tempoS);
        if (estado.aTocar && (saltar || trocou || antes.estado !== 'toca')) player?.play();
      } catch { /* o iframe ainda nao respondeu */ }
    } else {
      tile.classList.add('fora');
      nota.textContent = t('tw.foraDoAr');
      if (saltar || antes.estado === 'toca') {
        try { player?.pause(); } catch { /* idem */ }
      }
    }
    estado.vistos.set(l.slug, { estado: r.estado, video });
  }
}

function desenharRelogio() {
  $('relogio').textContent = `${relogioCurto(estado.agoraMs)}`;
  const total = estado.linhas.length;
  $('noAr').textContent = t('tempo.angulos', { n: quantosNoAr(estado.linhas, estado.agoraMs), total });
  const largura = estado.janela.fim - estado.janela.inicio;
  $('barra').value = largura ? Math.round(((estado.agoraMs - estado.janela.inicio) / largura) * 1000) : 0;
}

/** Levar toda a gente ao mesmo instante. */
function irPara(ms) {
  if (!estado.janela) return;
  estado.agoraMs = Math.min(Math.max(ms, estado.janela.inicio), estado.janela.fim);
  aplicarInstante(true);
  desenharRelogio();
}

/**
 * Quem ficou para tras (a carregar, ou parado a mao dentro do iframe) volta
 * ao grupo. So quando o player sabe dizer onde esta.
 */
function corrigirDeriva() {
  for (const l of estado.linhas) {
    const r = onde(l, estado.agoraMs);
    const player = estado.players.get(l.slug);
    if (r.estado !== 'toca' || typeof player?.getCurrentTime !== 'function') continue;
    try {
      const vai = player.getCurrentTime();
      if (Number.isFinite(vai) && vai > 0 && Math.abs(vai - r.tempoS) > DERIVA_S) player.seek(r.tempoS);
      if (player.isPaused?.() === true) player.play();
    } catch { /* idem */ }
  }
}

// O relogio do grupo anda pelo tempo real enquanto toca. Antes so mudava nos
// botoes, e o "+10 s" depois de cinco minutos a ver era um recuo de quase cinco.
function tique() {
  const agora = performance.now();
  estado.agoraMs += agora - estado.ultimoTique;
  estado.ultimoTique = agora;
  if (estado.agoraMs >= estado.janela.fim) {
    estado.agoraMs = estado.janela.fim;
    alternarTocar();
  } else {
    aplicarInstante(false);
    corrigirDeriva();
  }
  desenharRelogio();
}

function pararRelogio() {
  clearInterval(estado.tique);
  estado.tique = null;
  if (estado.aTocar) { estado.aTocar = false; rotularTocar(); }
}

// O texto vai para o <span data-t> do botao, e nao para o botao: assim o
// simbolo fica, e a mudanca de lingua traduz o rotulo certo.
function rotularTocar() {
  const s = $('tocar').querySelector('[data-t]');
  s.dataset.t = estado.aTocar ? 'tw.parar' : 'tw.tocar';
  s.textContent = t(s.dataset.t);
}

function alternarTocar() {
  if (!estado.janela) return;
  estado.aTocar = !estado.aTocar;
  rotularTocar();
  clearInterval(estado.tique);
  estado.tique = null;
  if (estado.aTocar) {
    estado.ultimoTique = performance.now();
    estado.tique = setInterval(tique, TIQUE_MS);
  }
  for (const l of estado.linhas) {
    const player = estado.players.get(l.slug);
    // So quem esta mesmo no ar: mandar tocar um VOD que nao cobre este
    // instante punha-o a andar sozinho e a sair da sincronia.
    const noAr = onde(l, estado.agoraMs).estado === 'toca';
    try { if (estado.aTocar && noAr) player?.play(); else player?.pause(); } catch { /* idem */ }
  }
}

// ── ligacoes ────────────────────────────────────────────────────────────────

$('botaoProcurar').onclick = procurar;
$('procurar').onkeydown = (e) => { if (e.key === 'Enter') procurar(); };
$('carregar').onclick = carregar;
$('noites').onchange = () => {
  try {
    abrirNoite(Number($('noites').value));
  } catch (e) {
    $('estado').classList.add('mau');
    $('estado').textContent = t('tw.erro', { erro: e.message });
  }
};
$('tocar').onclick = alternarTocar;
for (const [id, d] of [['menos1m', -60_000], ['menos10s', -10_000], ['mais10s', 10_000], ['mais1m', 60_000]]) {
  $(id).onclick = () => irPara(estado.agoraMs + d);
}
$('barra').oninput = () => {
  if (!estado.janela) return;
  const largura = estado.janela.fim - estado.janela.inicio;
  irPara(estado.janela.inicio + (Number($('barra').value) / 1000) * largura);
};

$('idioma').innerHTML = Object.entries(IDIOMAS)
  .map(([c, nome]) => `<option value="${c}">${nome}</option>`).join('');
$('idioma').onchange = () => {
  definirIdioma($('idioma').value);
  try { localStorage.setItem('replay.idioma', idiomaActual()); } catch { /* janela privada */ }
  aplicarIdioma();
  // Sem recriar os players: isso recarregava todos os iframes e parava o que
  // estava a tocar. So os textos mudam.
  if (estado.noites.length) desenharNoites();
  if (estado.janela && estado.linhas.length) { aplicarInstante(false); desenharRelogio(); }
};

let guardadoIdioma = null;
try { guardadoIdioma = localStorage.getItem('replay.idioma'); } catch { /* janela privada */ }
definirIdioma(guardadoIdioma || idiomaDoBrowser());
$('idioma').value = idiomaActual();
aplicarIdioma();

// O vídeo aberto também como classe do `body`, ao lado do `:has()` do estilo.css (ver app.js).
const marcarVideoAberto = () => document.body.classList.toggle('videoAberto', !$('palco').hidden);
new MutationObserver(marcarVideoAberto).observe($('palco'), { attributes: true, attributeFilter: ['hidden'] });
marcarVideoAberto();
