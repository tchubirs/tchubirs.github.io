// Os momentos de um evento, prontos: momentos.html?e=<nome> lê eventos/<nome>-momentos.json e mostra cada
// momento com o resumo e a reação, e um toque na imagem toca ali mesmo. Não carrega o evento nem os
// canais: um momento é um pedido à Kick (o clipe ou o VOD) e o vídeo.
//
// O dono, 17/10: abrir um clipe pela lista do evento demorava e carregava muita coisa além do clipe, e na
// Kick vinham outros clipes misturados. Duas abas: "Melhores" (por potencial; feed no celular, ranking
// compacto em tela larga, só CSS) e "Por streamer" (uma fileira por streamer, o melhor primeiro).

import { clipeDaKick, fonteDoVod, idDaPaginaDoVod } from './kick.js';
import { escapar } from './escapar.js';

const TEXTOS = {
  pt: {
    titulo: 'Povix: momentos do evento',
    melhores: 'Melhores', streamers: 'Por streamer',
    sub: '{n} momentos de {c} streamers. Toque na imagem para ver ali mesmo.',
    carregando: 'Carregando os momentos…',
    semEvento: 'Falta o evento no endereço (momentos.html?e=abisal).',
    naoExiste: 'Ainda não há momentos para “{nome}”.',
    falhou: 'Não deu para abrir este vídeo agora. Tente na Kick.',
    semPlayer: 'Este navegador não toca o vídeo da Kick. Tente na Kick.',
    tocar: 'Ver o momento de {canal}, {hora}',
    publico: 'Clipe do público', povix: 'Achado pelo Povix', views: '{n} views',
    potencial: 'potencial de viralizar',
    editar: 'Editar / baixar no Povix', kick: 'Kick',
    grupoUm: '1 momento · melhor ▲ {p}', grupoN: '{n} momentos · melhor ▲ {p}',
  },
  en: {
    titulo: 'Povix: event moments',
    melhores: 'Best', streamers: 'By streamer',
    sub: '{n} moments from {c} streamers. Tap the picture to watch it right here.',
    carregando: 'Loading the moments…',
    semEvento: 'The event is missing from the address (momentos.html?e=abisal).',
    naoExiste: 'No moments for “{nome}” yet.',
    falhou: 'Could not open this video right now. Try it on Kick.',
    semPlayer: 'This browser cannot play Kick video. Try it on Kick.',
    tocar: 'Watch {canal}’s moment, {hora}',
    publico: 'Viewer clip', povix: 'Found by Povix', views: '{n} views',
    potencial: 'viral potential',
    editar: 'Edit / download in Povix', kick: 'Kick',
    grupoUm: '1 moment · best ▲ {p}', grupoN: '{n} moments · best ▲ {p}',
  },
  es: {
    titulo: 'Povix: momentos del evento',
    melhores: 'Mejores', streamers: 'Por streamer',
    sub: '{n} momentos de {c} streamers. Toca la imagen para verlo aquí mismo.',
    carregando: 'Cargando los momentos…',
    semEvento: 'Falta el evento en la dirección (momentos.html?e=abisal).',
    naoExiste: 'Todavía no hay momentos para “{nome}”.',
    falhou: 'No se pudo abrir este video ahora. Pruébalo en Kick.',
    semPlayer: 'Este navegador no reproduce el video de Kick. Pruébalo en Kick.',
    tocar: 'Ver el momento de {canal}, {hora}',
    publico: 'Clip del público', povix: 'Encontrado por Povix', views: '{n} vistas',
    potencial: 'potencial viral',
    editar: 'Editar / descargar en Povix', kick: 'Kick',
    grupoUm: '1 momento · mejor ▲ {p}', grupoN: '{n} momentos · mejor ▲ {p}',
  },
};
const NOMES_IDIOMA = { pt: 'Português', en: 'English', es: 'Español' };

// O vídeo começa uns segundos antes do momento: quem toca precisa de um instante para entrar na cena.
const ANTES_S = 3;

const $ = (id) => document.getElementById(id);
const estado = { idioma: 'pt', nome: '', dados: null, aba: 'melhores', tocando: null, aviso: null };
const porId = new Map();

function idiomaInicial() {
  let guardado = null;
  try { guardado = localStorage.getItem('replay.idioma'); } catch { /* janela privada */ }
  if (guardado in TEXTOS) return guardado;
  for (const l of navigator.languages || [navigator.language || 'pt']) {
    const curto = String(l).slice(0, 2).toLowerCase();
    if (curto in TEXTOS) return curto;
  }
  return 'pt';
}

function t(chave, vars = {}) {
  return String(TEXTOS[estado.idioma][chave] ?? TEXTOS.pt[chave]).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const noIdioma = (o) => (o && typeof o === 'object' ? o[estado.idioma] || o.pt || '' : '');

function hora(ms) {
  return new Date(ms).toLocaleString(estado.idioma === 'pt' ? 'pt-BR' : estado.idioma,
    { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function duracao(m) {
  const s = Math.max(1, Math.round((m.fimMs - m.inicioMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CANAL = /^[a-z0-9_-]{1,40}$/i;
const CLIPE = /^clip_[A-Za-z0-9]{10,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o que dá para tocar: um clipe da Kick, ou um VOD com o segundo do momento. O resto fica de fora. */
function valido(m) {
  if (!m || typeof m.id !== 'string' || !CANAL.test(m.canal || '')) return false;
  if (!Number.isFinite(m.inicioMs) || !Number.isFinite(m.fimMs) || m.fimMs <= m.inicioMs) return false;
  return CLIPE.test(m.clipe || '') || (UUID.test(m.uuid || '') && Number.isFinite(m.aosS));
}

/** A foto do momento: um arquivo desta pasta de eventos ou uma imagem da Kick; outra origem não entra. */
function miniatura(m) {
  const f = m.miniatura;
  if (typeof f !== 'string') return null;
  if (/^eventos\/[a-z0-9-]+\/[A-Za-z0-9_.-]+\.(jpe?g|png|webp)$/.test(f)) return f;
  try {
    const u = new URL(f);
    return u.protocol === 'https:' && (u.hostname === 'kick.com' || u.hostname.endsWith('.kick.com')) ? u.href : null;
  } catch { return null; }
}

const temClipe = (m) => CLIPE.test(m.clipe || '');

function linkDaKick(m) {
  const canal = encodeURIComponent(m.canal);
  if (temClipe(m)) return `https://kick.com/${canal}/clips/${encodeURIComponent(m.clipe)}`;
  if (UUID7.test(m.vodId || '')) return `https://kick.com/${canal}/videos/${m.vodId}?t=${Math.max(0, Math.round(m.aosS))}`;
  return `https://kick.com/${canal}`;
}

/** O Povix inteiro no meio do momento, com o streamer nomeado: é o cartão do topo do modo simples. */
function linkDoPovix(m) {
  const meio = Math.round((m.inicioMs + m.fimMs) / 2);
  return `index.html?e=${encodeURIComponent(estado.nome)}#t=${meio}&c=${encodeURIComponent(m.canal)}`;
}

function capa(m) {
  const foto = miniatura(m);
  const q = hora(m.inicioMs);
  return `<button type="button" class="momCapa" aria-label="${escapar(t('tocar', { canal: m.canal, hora: q }))}">`
    + (foto ? `<img src="${escapar(foto)}" alt="" loading="lazy">` : '')
    + `<span class="momSemFoto"${foto ? ' hidden' : ''}>${escapar(m.canal)} · ${escapar(q)}</span>`
    + '<span class="momPlay" aria-hidden="true"><svg class="ic"><use href="#i-tocar"/></svg></span>'
    + `<span class="momDur">${duracao(m)}</span></button>`;
}

function cartao(m, i) {
  const origem = m.origem === 'publico'
    ? [t('publico'), Number.isFinite(m.views) ? t('views', { n: m.views }) : '', m.titulo ? `“${m.titulo}”` : '']
    : [t('povix')];
  const reacao = noIdioma(m.reacao);
  return `<article class="mom" data-id="${escapar(m.id)}">
    <span class="momRank" aria-hidden="true">${i + 1}</span>
    <div class="momVideo">${capa(m)}</div>
    <div class="momInfo">
      <div class="momTopo"><span class="momCanal">${escapar(m.canal)}</span>`
      + (Number.isFinite(m.potencial) ? `<span class="momPot" title="${escapar(t('potencial'))}">▲ ${Math.round(m.potencial)}</span>` : '')
      + `<span class="momHora">${escapar(hora(m.inicioMs))}</span></div>
      <p class="momResumo">${escapar(noIdioma(m.resumo))}</p>
      ${reacao ? `<p class="momReacao">${escapar(reacao)}</p>` : ''}
      <p class="momOrigem">${origem.filter(Boolean).map(escapar).join(' · ')}</p>
      <div class="momAcoes"><a class="momBotao principal" href="${escapar(linkDoPovix(m))}">${escapar(t('editar'))}</a>`
      + `<a class="momBotao momKick" href="${escapar(linkDaKick(m))}" target="_blank" rel="noopener">${escapar(t('kick'))}</a></div>
    </div>
  </article>`;
}

const porPotencial = (a, b) => (b.potencial ?? 0) - (a.potencial ?? 0) || a.inicioMs - b.inicioMs;

function pintar() {
  parar();
  const lista = [...porId.values()].sort(porPotencial);
  const caixa = $('listaMomentos');
  if (estado.aba === 'melhores') {
    caixa.className = 'momMelhores';
    caixa.innerHTML = lista.map(cartao).join('');
  } else {
    const grupos = new Map();
    for (const m of lista) grupos.set(m.canal, [...(grupos.get(m.canal) || []), m]);
    caixa.className = 'momGrupos';
    caixa.innerHTML = [...grupos].map(([canal, ms]) => `<section class="momGrupo">
      <h2>${escapar(canal)}<span>${escapar(t(ms.length === 1 ? 'grupoUm' : 'grupoN', { n: ms.length, p: Math.round(ms[0].potencial ?? 0) }))}</span></h2>
      <div class="momCarrossel">${ms.map(cartao).join('')}</div>
    </section>`).join('');
  }
  for (const b of document.querySelectorAll('.momAbas [data-aba]')) b.setAttribute('aria-selected', String(b.dataset.aba === estado.aba));
}

function textos() {
  document.documentElement.lang = estado.idioma === 'pt' ? 'pt-BR' : estado.idioma;
  document.title = t('titulo');
  $('abaMelhores').textContent = t('melhores');
  $('abaStreamers').textContent = t('streamers');
  if (estado.dados) {
    $('nomeEvento').textContent = String(estado.dados.evento || estado.nome);
    $('momSub').textContent = t('sub', { n: porId.size, c: new Set([...porId.values()].map((m) => m.canal)).size });
    // Trocar o idioma não corta o vídeo que está a tocar; os cartões mudam na próxima pintura.
    if (!estado.tocando) pintar();
  }
  if (estado.aviso) $('momEstado').textContent = t(...estado.aviso);
}

function avisar(chave, vars) {
  estado.aviso = chave ? [chave, vars] : null;
  $('momEstado').textContent = chave ? t(chave, vars) : '';
}

/** Larga o vídeo que estiver a tocar e devolve a foto ao cartão dele. */
function parar() {
  const vez = estado.tocando;
  if (!vez) return;
  estado.tocando = null;
  vez.controlo.abort();
  vez.hls?.destroy();
  vez.video.pause();
  vez.video.removeAttribute('src');
  vez.video.load();
  vez.cartao.classList.remove('tocando');
  if (vez.caixa.isConnected) vez.caixa.innerHTML = vez.capa;
}

async function tocar(cartaoEl) {
  const m = porId.get(cartaoEl.dataset.id);
  if (!m) return;
  parar();
  const caixa = cartaoEl.querySelector('.momVideo');
  caixa.querySelector('.momErro')?.remove();
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  const vez = { cartao: cartaoEl, caixa, capa: caixa.innerHTML, video, hls: null, controlo: new AbortController() };
  estado.tocando = vez;
  // Manifesto ou pedaço que não chega (VOD expirado, clipe apagado): volta a foto e diz para tentar na Kick.
  const falhou = () => {
    if (estado.tocando !== vez) return;
    parar();
    caixa.insertAdjacentHTML('beforeend', `<p class="momErro" role="alert">${escapar(t('falhou'))}</p>`);
  };
  cartaoEl.classList.add('tocando');
  caixa.replaceChildren(video);
  try {
    let url;
    let de = 0;
    let ate = null;
    if (temClipe(m)) {
      url = (await clipeDaKick(m.clipe, { sinal: vez.controlo.signal })).m3u8;
    } else {
      const fonte = await fonteDoVod(m.uuid, { sinal: vez.controlo.signal });
      url = fonte.m3u8;
      if (fonte.vodId && !UUID7.test(m.vodId || '')) {
        m.vodId = fonte.vodId;
        const kick = cartaoEl.querySelector('.momKick');
        if (kick) kick.href = linkDaKick(m);
      }
      de = Math.max(0, m.aosS - ANTES_S);
      ate = m.aosS + (m.fimMs - m.inicioMs) / 1000;
    }
    if (estado.tocando !== vez) return;
    if (ate != null) {
      // Para uma vez no fim do momento; depois disso quem está a ver manda.
      const noFim = () => { if (video.currentTime >= ate) { video.pause(); video.removeEventListener('timeupdate', noFim); } };
      video.addEventListener('timeupdate', noFim);
    }
    if (window.Hls?.isSupported()) {
      vez.hls = new window.Hls({ startPosition: de });
      vez.hls.loadSource(url);
      vez.hls.attachMedia(video);
      vez.hls.on(window.Hls.Events.ERROR, (_, d) => { if (d?.fatal) falhou(); });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.addEventListener('error', falhou, { once: true });
      video.src = url;
      if (de) video.addEventListener('loadedmetadata', () => { video.currentTime = de; }, { once: true });
    } else {
      throw Object.assign(new Error('sem player'), { name: 'SEM-PLAYER' });
    }
    // Depois do pedido à Kick o navegador pode já não contar o toque e recusar o som: os controlos estão à
    // vista, e o próximo toque toca.
    video.play().catch(() => {});
  } catch (e) {
    if (estado.tocando !== vez || e?.name === 'AbortError') return;
    parar();
    caixa.insertAdjacentHTML('beforeend', `<p class="momErro" role="alert">${escapar(t(e?.name === 'SEM-PLAYER' ? 'semPlayer' : 'falhou'))}</p>`);
  }
}

/** Um VOD sem o id da página: o link da Kick só se sabe depois de perguntar, e pergunta-se no toque. */
async function abrirNaKick(ev, a) {
  const m = porId.get(a.closest('.mom')?.dataset.id);
  if (!m || temClipe(m) || UUID7.test(m.vodId || '')) return;
  ev.preventDefault();
  const janela = window.open('', '_blank');
  if (janela) janela.opener = null;
  const id = await idDaPaginaDoVod(m.uuid).catch(() => null);
  if (id) { m.vodId = id; a.href = linkDaKick(m); }
  if (janela) janela.location.href = linkDaKick(m);
  else location.href = linkDaKick(m);
}

async function iniciar() {
  estado.idioma = idiomaInicial();
  const seletor = $('idioma');
  seletor.innerHTML = Object.entries(NOMES_IDIOMA).map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  seletor.value = estado.idioma;
  seletor.addEventListener('change', () => {
    estado.idioma = seletor.value in TEXTOS ? seletor.value : 'pt';
    try { localStorage.setItem('replay.idioma', estado.idioma); } catch { /* janela privada */ }
    textos();
  });
  document.querySelector('.momAbas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-aba]');
    if (!b || b.dataset.aba === estado.aba) return;
    estado.aba = b.dataset.aba;
    pintar();
  });
  const lista = $('listaMomentos');
  lista.addEventListener('click', (ev) => {
    const capaEl = ev.target.closest('.momCapa');
    if (capaEl) { tocar(capaEl.closest('.mom')); return; }
    const kick = ev.target.closest('.momKick');
    if (kick) abrirNaKick(ev, kick);
  });
  // Foto que não chega: fica o nome e a hora no lugar dela.
  lista.addEventListener('error', (ev) => {
    if (ev.target.tagName !== 'IMG') return;
    ev.target.nextElementSibling?.removeAttribute('hidden');
    ev.target.remove();
  }, true);
  textos();

  let pedido = '';
  try { pedido = new URLSearchParams(location.search).get('e') || ''; } catch { pedido = ''; }
  estado.nome = pedido.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(estado.nome)) { avisar('semEvento'); return; }
  avisar('carregando');
  let dados = null;
  try {
    const r = await fetch(`eventos/${estado.nome}-momentos.json`, { cache: 'no-cache' });
    if (r.ok) dados = JSON.parse(await r.text());
  } catch { dados = null; }
  const momentos = Array.isArray(dados?.momentos) ? dados.momentos.filter(valido) : [];
  if (!momentos.length) { avisar('naoExiste', { nome: estado.nome }); return; }
  for (const m of momentos) porId.set(m.id, { ...m });
  estado.dados = dados;
  avisar(null);
  textos();
}

iniciar();
