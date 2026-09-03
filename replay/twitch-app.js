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
import { t, aplicarIdioma, definirIdioma, idiomaActual, idiomaDoBrowser, IDIOMAS } from './idiomas.js?v=a8dc186119';
import { procurarCanais, vodsDoCanal, pecaDoVod, enderecoDoPlayer } from './twitch.js?v=a8dc186119';
import { linhaDoCanal, onde, janelaComum, quantosNoAr } from './relogio.js?v=a8dc186119';
import { agruparPorNoite, rotuloDaNoite } from './noites.js?v=a8dc186119';

const $ = (id) => document.getElementById(id);
const estado = {
  canais: [],        // {slug, vods:[...]}
  noites: [],
  noite: null,
  linhas: [],
  janela: null,
  agoraMs: 0,
  players: new Map(),
  aTocar: false,
};

const doisDigitos = (n) => String(n).padStart(2, '0');
const relogioCurto = (ms) => {
  const d = new Date(ms);
  return `${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}:${doisDigitos(d.getUTCSeconds())}`;
};

const listaDeCanais = () => $('canais').value.split('\n').map((s) => s.trim().toLowerCase())
  .filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).slice(0, 8);

// ── procurar ────────────────────────────────────────────────────────────────

async function procurar() {
  const termo = $('procurar').value.trim();
  if (termo.length < 2) return;
  $('sugestoes').innerHTML = `<span class="nota">${t('tw.aCarregar')}</span>`;
  try {
    const achados = await procurarCanais(termo);
    $('sugestoes').innerHTML = achados.length
      ? achados.map((c) => `<button class="sug" data-slug="${c.slug}">`
        + `${c.imagem ? `<img src="${c.imagem}" alt="" width="24" height="24">` : ''}`
        + `<span>${c.nome}</span> <span class="nota">${c.slug}</span></button>`).join('')
      : `<span class="nota">${t('procurar.nada')}</span>`;
    for (const b of $('sugestoes').querySelectorAll('.sug')) {
      b.onclick = () => {
        const ja = listaDeCanais();
        if (!ja.includes(b.dataset.slug)) $('canais').value = [...ja, b.dataset.slug].join('\n');
        $('sugestoes').innerHTML = '';
        $('procurar').value = '';
      };
    }
  } catch (e) {
    $('sugestoes').innerHTML = `<span class="nota mau">${t('tw.erro', { erro: e.message })}</span>`;
  }
}

// ── carregar os VODs ────────────────────────────────────────────────────────

async function carregar() {
  const slugs = listaDeCanais();
  if (!slugs.length) { $('estado').textContent = t('tw.nada'); return; }
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

    const paraNoites = canais.map((c) => ({
      slug: c.slug,
      vods: c.vods.map((v) => ({ ...v, inicioApi: v.inicio, duracaoMs: v.duracaoS * 1000 })),
    }));
    estado.noites = agruparPorNoite(paraNoites);
    if (!estado.noites.length) {
      const maus = canais.filter((c) => c.erro);
      $('estado').classList.add('mau');
      $('estado').textContent = maus.length
        ? t('tw.erro', { erro: maus.map((c) => `${c.slug}: ${c.erro}`).join(' · ') })
        : t('tw.semVods');
      return;
    }

    $('painelNoite').hidden = false;
    $('noites').innerHTML = estado.noites.map((n, i) => `<option value="${i}">`
      + `${rotuloDaNoite(n)}</option>`).join('');
    $('estado').textContent = '';
    abrirNoite(0);
  } catch (e) {
    $('estado').classList.add('mau');
    $('estado').textContent = t('tw.erro', { erro: e.message });
  }
  $('carregar').disabled = false;
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

  $('palco').hidden = false;
  estado.agoraMs = estado.janela.sobreposicaoInicio ?? estado.janela.inicio;
  montarGrade();
  irPara(estado.agoraMs);
}

function fecharPlayers() {
  for (const p of estado.players.values()) {
    try { p.pause(); } catch { /* o iframe ja pode ter ido */ }
  }
  estado.players.clear();
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
  $('grade').innerHTML = estado.linhas.map((l) => `<div class="tile tw" data-slug="${l.slug}">`
    + `<div class="cabeca"><b>${l.slug}</b>`
    + `<label class="pequeno"><input type="checkbox" class="ligarSom"> ${t('tw.mudo')}</label>`
    + '</div>'
    + `<div class="quadro" id="pl-${l.slug}"></div>`
    + '<span class="nota estadoTile"></span></div>').join('');

  for (const l of estado.linhas) {
    const r = onde(l, estado.agoraMs);
    const player = new window.Twitch.Player(`pl-${l.slug}`, {
      video: `v${r.peca?.vod?.id ?? l.pecas[0].vod.id}`,
      parent: [location.hostname],
      width: '100%',
      height: '100%',
      autoplay: false,
      muted: true,
      time: r.estado === 'toca' ? `${Math.floor(r.tempoS)}s` : '0s',
    });
    estado.players.set(l.slug, player);

    const tile = $('grade').querySelector(`.tile[data-slug="${l.slug}"]`);
    tile.querySelector('.ligarSom').onchange = (e) => {
      try { player.setMuted(!e.target.checked); } catch { /* ainda nao esta pronto */ }
    };
  }
}

// ── o relogio partilhado ────────────────────────────────────────────────────

/**
 * Levar toda a gente ao mesmo instante.
 *
 * Cada canal salta para o SEU segundo, que nao e o mesmo numero para todos: um
 * comecou a transmitir vinte minutos depois do outro. E quem nao estava no ar
 * naquele instante diz isso, em vez de mostrar o primeiro frame do VOD como se
 * fosse o momento certo.
 */
function irPara(ms) {
  if (!estado.janela) return;
  estado.agoraMs = Math.min(Math.max(ms, estado.janela.inicio), estado.janela.fim);

  for (const l of estado.linhas) {
    const r = onde(l, estado.agoraMs);
    const tile = $('grade').querySelector(`.tile[data-slug="${l.slug}"]`);
    if (!tile) continue;
    const nota = tile.querySelector('.estadoTile');
    const player = estado.players.get(l.slug);
    if (r.estado === 'toca') {
      nota.textContent = '';
      tile.classList.remove('fora');
      try { player?.seek(r.tempoS); } catch { /* o iframe ainda nao respondeu */ }
    } else {
      tile.classList.add('fora');
      nota.textContent = t('tw.foraDoAr');
      try { player?.pause(); } catch { /* idem */ }
    }
  }

  $('relogio').textContent = `${relogioCurto(estado.agoraMs)}Z`;
  const total = estado.linhas.length;
  $('noAr').textContent = t('tempo.angulos', { n: quantosNoAr(estado.linhas, estado.agoraMs), total });
  const largura = estado.janela.fim - estado.janela.inicio;
  $('barra').value = largura ? Math.round(((estado.agoraMs - estado.janela.inicio) / largura) * 1000) : 0;
}

function alternarTocar() {
  estado.aTocar = !estado.aTocar;
  $('tocar').textContent = t(estado.aTocar ? 'tw.parar' : 'tw.tocar');
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
$('noites').onchange = () => abrirNoite(Number($('noites').value));
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
  if (estado.linhas.length) { montarGrade(); irPara(estado.agoraMs); }
};

let guardadoIdioma = null;
try { guardadoIdioma = localStorage.getItem('replay.idioma'); } catch { /* janela privada */ }
definirIdioma(guardadoIdioma || idiomaDoBrowser());
$('idioma').value = idiomaActual();
aplicarIdioma();
