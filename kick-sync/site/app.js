// The page. Everything runs in the browser; there is no server in this product.
//
// Only the focus tile decodes at a real rendition and carries sound. The rest
// run at 160p @ 230 kbps, which measured on four unrelated channels is the
// bottom rung of Kick's ladder and is what makes thirty tiles a home-connection
// problem rather than a server problem.

import { vodsDoCanal, lerMaster, lerPlaylist } from './kick.js';
import { linhaDoCanal, janelaComum, onde, paraLink, doLink } from './relogio.js';
import { cortarTodosOsAngulos } from './baixar.js';

const $ = (id) => document.getElementById(id);
const estado = {
  linhas: [],
  janela: null,
  agoraMs: 0,
  marca: { de: null, ate: null },
  nudges: {},
  foco: null,
  players: new Map(),
  cancelar: null,
};

const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
const relogioCurto = (ms) => new Date(ms).toISOString().slice(11, 19);

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
  aviso.textContent = 'O leitor de vídeo (hls.js) não carregou — um bloqueador ou a rede '
    + 'terão travado o CDN. Sem ele os quadrados ficam pretos.';
  aviso.hidden = false;
  return false;
}

async function carregar() {
  const nomes = [...new Set($('canais').value.split('\n').map((s) => s.trim()).filter(Boolean))];
  if (!nomes.length) return;
  temPlayer();
  $('carregar').disabled = true;
  $('estadoCarga').textContent = 'a perguntar à Kick…';

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
  if (!noites.length) { $('estadoCarga').textContent = 'nenhum canal tem VOD utilizável.'; return; }
  pintarNoites(noites);
  await abrirNoite(noites[0]);
}

/**
 * Which night is which.
 *
 * A "night" is a cluster of VODs whose starts sit near each other. Anything
 * else — asking the user for a date, guessing from the newest VOD — breaks the
 * moment two channels started an hour apart, which is the normal case.
 */
function agruparPorNoite(canais) {
  const pontos = [];
  for (const c of canais) {
    for (const v of c.vods) if (Number.isFinite(v.inicioApi)) pontos.push({ slug: c.slug, v });
  }
  pontos.sort((a, b) => a.v.inicioApi - b.v.inicioApi);
  const noites = [];
  const SEIS_HORAS = 6 * 3600_000;
  for (const p of pontos) {
    const ultima = noites.at(-1);
    if (ultima && p.v.inicioApi - ultima.fim < SEIS_HORAS) {
      ultima.fim = Math.max(ultima.fim, p.v.inicioApi + (p.v.duracaoMs || 0));
      ultima.itens.push(p);
    } else {
      noites.push({ inicio: p.v.inicioApi, fim: p.v.inicioApi + (p.v.duracaoMs || 0), itens: [p] });
    }
  }
  return noites
    .map((n) => ({ ...n, canais: new Set(n.itens.map((i) => i.slug)).size }))
    .filter((n) => n.canais >= 1)
    .sort((a, b) => b.inicio - a.inicio);
}

function pintarNoites(noites) {
  $('noites').hidden = false;
  $('noite').innerHTML = noites.map((n, i) => {
    const d = new Date(n.inicio);
    return `<option value="${i}">${d.toISOString().slice(0, 10)} · ${relogioCurto(n.inicio)} — ${n.canais} canais</option>`;
  }).join('');
  $('noite').onchange = () => abrirNoite(noites[Number($('noite').value)]);
}

function pintarCanais(canais) {
  $('canaisEstado').hidden = false;
  const rotulo = {
    ok: '', 'canal-nao-existe': 'não existe', 'sem-vods': 'sem VODs',
    'vods-indisponiveis': 'VODs privados ou apagados', 'rate-limit': 'a Kick pediu para abrandar',
    'sem-rede': 'sem rede', 'nome-invalido': 'nome inválido',
  };
  $('listaCanais').innerHTML = canais.map((c) => {
    const mau = c.estado !== 'ok';
    return `<li class="${mau ? 'mau' : ''}"><b>${c.slug}</b>`
      + `<span class="nota">${mau ? (rotulo[c.estado] || c.estado) : `${c.vods.length} VOD(s)`}</span></li>`;
  }).join('');
}

/** Read the ladders and the clocks for one night, then build the timeline. */
async function abrirNoite(noite) {
  $('estadoCarga').textContent = 'a ler os relógios…';
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
  if (!estado.janela) { $('estadoCarga').textContent = 'nenhum canal com relógio utilizável.'; return; }

  estado.agoraMs = estado.janela.sobreposicaoInicio;
  estado.foco = estado.linhas[0]?.slug ?? null;
  $('palco').hidden = false;
  $('resumoNoite').textContent = `${estado.linhas.length} canais · ${hhmmss(estado.janela.fim - estado.janela.inicio)} de noite`;
  montarGrade();
  irPara(estado.agoraMs);
}

// ── grelha ──────────────────────────────────────────────────────────────────

function montarGrade() {
  $('grade').innerHTML = '';
  estado.players.forEach((p) => p.destroy?.());
  estado.players.clear();

  for (const linha of estado.linhas) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.slug = linha.slug;
    tile.innerHTML = `<video muted playsinline preload="none"></video>`
      + `<span class="rotulo">${linha.slug}`
      + `${linha.relogio !== 'exato' ? ' <b class="aviso" title="relógio incerto">≈</b>' : ''}</span>`
      + `<span class="estadoTile"></span>`;
    tile.onclick = () => { estado.foco = linha.slug; montarGrade(); irPara(estado.agoraMs); };
    $('grade').append(tile);
  }
  $('grade').classList.toggle('temFoco', Boolean(estado.foco));
  const alvo = $('grade').querySelector(`[data-slug="${CSS.escape(estado.foco || '')}"]`);
  alvo?.classList.add('foco');
  alvo?.querySelector('video')?.removeAttribute('muted');
}

/** Move every angle to the same instant. */
function irPara(quandoMs) {
  estado.agoraMs = quandoMs;
  $('agora').textContent = `${relogioCurto(quandoMs)}Z`;
  const { inicio, fim } = estado.janela;
  $('barra').value = String(Math.round(((quandoMs - inicio) / (fim - inicio)) * 1000));

  for (const linha of estado.linhas) {
    const tile = $('grade').querySelector(`[data-slug="${CSS.escape(linha.slug)}"]`);
    if (!tile) continue;
    const video = tile.querySelector('video');
    const nota = tile.querySelector('.estadoTile');
    const r = onde(linha, quandoMs, { nudgeMs: estado.nudges[linha.slug] || 0 });

    if (r.estado !== 'toca') {
      // Never seek to zero for a moment this angle did not film: that shows a
      // confident, wrong frame, which is worse than showing nothing.
      nota.textContent = r.estado === 'buraco' ? `fora do ar (${Math.round(r.buraco.segundos)}s)`
        : r.estado === 'antes' ? 'ainda não tinha começado'
          : r.estado === 'depois' ? 'já tinha acabado' : 'sem vídeo';
      tile.classList.add('vazio');
      pararTile(linha.slug, video);
      continue;
    }
    nota.textContent = '';
    tile.classList.remove('vazio');
    tocar(linha, r, video);
  }
}

function pararTile(slug, video) {
  const p = estado.players.get(slug);
  if (p) { p.destroy(); estado.players.delete(slug); }
  video.removeAttribute('src');
}

function tocar(linha, r, video) {
  const foco = linha.slug === estado.foco;
  const peca = linha.pecasCompletas.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  // Focus gets the best rung the ladder has; everything else stays at 160p.
  const alvo = foco ? peca.escada[0] : peca.barato;
  const anterior = estado.players.get(linha.slug);

  if (anterior && anterior.url === alvo.url) {
    if (Math.abs(video.currentTime - r.tempoS) > 0.35) video.currentTime = r.tempoS;
    return;
  }
  anterior?.destroy();

  if (window.Hls?.isSupported()) {
    const hls = new window.Hls({ startPosition: r.tempoS, maxBufferLength: foco ? 30 : 6 });
    hls.loadSource(alvo.url);
    hls.attachMedia(video);
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => hls.destroy() });
  } else {
    // Safari plays HLS natively and hls.js refuses to load there.
    video.src = alvo.url;
    video.currentTime = r.tempoS;
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => { video.removeAttribute('src'); } });
  }
  video.muted = !foco;
}

// ── marcar e baixar ─────────────────────────────────────────────────────────

function pintarMarca() {
  const { de, ate } = estado.marca;
  $('marca').textContent = de == null ? ''
    : ate == null ? `início ${relogioCurto(de)}Z — falta o fim`
      : `${relogioCurto(de)}Z → ${relogioCurto(ate)}Z (${hhmmss(ate - de)})`;
  $('baixar').disabled = !(de != null && ate != null && ate > de);
}

async function baixarTudo() {
  const { de, ate } = estado.marca;
  const controlo = new AbortController();
  estado.cancelar = () => controlo.abort();
  $('baixar').disabled = true;
  $('fila').innerHTML = '';

  const linha = (slug) => {
    let li = $('fila').querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (!li) {
      li = document.createElement('li');
      li.dataset.slug = slug;
      $('fila').append(li);
    }
    return li;
  };

  const r = await cortarTodosOsAngulos({
    linhas: estado.linhas,
    deMs: de,
    ateMs: ate,
    sinal: controlo.signal,
    nudges: estado.nudges,
    aoProgresso: (p) => {
      linha(p.canal).textContent = p.fase === 'planear'
        ? `${p.canal}: a preparar…`
        : `${p.canal}: ${p.prontos}/${p.total} pedaços`;
    },
  });

  for (const x of r) {
    const li = linha(x.canal);
    if (x.estado === 'pronto') {
      const url = URL.createObjectURL(new Blob([x.bytes], { type: x.tipo }));
      const mb = (x.bytes.length / 1048576).toFixed(1);
      // The slack is not an apology — it is the number to trim by in the editor.
      li.innerHTML = `<a href="${url}" download="${x.nome}">${x.nome}</a> `
        + `<span class="nota">${mb} MB · ${x.plano.qualidade.altura}p${x.plano.qualidade.fps} · `
        + `começa ${x.plano.sobraInicioS.toFixed(1)}s antes da tua marca</span>`;
    } else if (x.estado === 'incompleto') {
      li.innerHTML = `<b>${x.canal}</b> <span class="nota mau">${x.obtidos}/${x.total} pedaços — `
        + `não gero o ficheiro com um buraco no meio</span>`;
    } else {
      const porque = { buraco: 'estava fora do ar', 'fora-da-noite': 'não estava a filmar', 'sem-segmentos': 'sem vídeo nessa janela' };
      li.innerHTML = `<b>${x.canal}</b> <span class="nota">${porque[x.estado] || x.estado}</span>`;
    }
  }
  $('baixar').disabled = false;
  estado.cancelar = null;
}

// ── ligações ────────────────────────────────────────────────────────────────

$('carregar').onclick = carregar;
$('barra').oninput = () => {
  const { inicio, fim } = estado.janela || {};
  if (inicio == null) return;
  irPara(Math.round(inicio + ((fim - inicio) * Number($('barra').value)) / 1000));
};
$('marcarIn').onclick = () => { estado.marca = { de: estado.agoraMs, ate: null }; pintarMarca(); };
$('marcarOut').onclick = () => { estado.marca.ate = estado.agoraMs; pintarMarca(); };
$('baixar').onclick = baixarTudo;

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const passo = e.shiftKey ? 10_000 : 1000;
  if (e.key === 'i' || e.key === 'I') $('marcarIn').click();
  if (e.key === 'o' || e.key === 'O') $('marcarOut').click();
  if (e.key === 'j' || e.key === 'ArrowLeft') irPara(estado.agoraMs - passo);
  if (e.key === 'l' || e.key === 'ArrowRight') irPara(estado.agoraMs + passo);
});

// A session survives a refresh and travels in a link.
const daUrl = doLink(new URLSearchParams(location.search).get('s') || '');
if (daUrl) {
  $('canais').value = daUrl.canais.join('\n');
  estado.nudges = daUrl.nudges;
  if (daUrl.marca) estado.marca = daUrl.marca;
}
window.addEventListener('beforeunload', () => {
  try {
    localStorage.setItem('replay', paraLink({
      canais: estado.linhas.map((l) => l.slug), janela: estado.janela,
      nudges: estado.nudges, marca: estado.marca,
    }));
  } catch { /* private window, quota, whatever — never break the page for this */ }
});
if (!daUrl) {
  const guardado = doLink(localStorage.getItem('replay') || '');
  if (guardado) $('canais').value = guardado.canais.join('\n');
}
