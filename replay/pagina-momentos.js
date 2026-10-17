// Os momentos de um evento, prontos: momentos.html?e=<nome> lê eventos/<nome>-momentos.json e mostra cada
// momento com o resumo e a reação, e um toque na imagem toca ali mesmo. Não carrega o evento nem os
// canais: um momento é um pedido à Kick (o clipe ou o VOD) e o vídeo.
//
// O dono, 17/10: abrir um clipe pela lista do evento demorava e carregava muita coisa além do clipe, e na
// Kick vinham outros clipes misturados. Duas abas: "Melhores" (por potencial; feed no celular, ranking
// compacto em tela larga, só CSS) e "Por streamer" (uma fileira por streamer, o melhor primeiro).

import { clipeDaKick, fonteDoVod, idDaPaginaDoVod } from './kick.js?v=25ebf0fa92';
import { escapar } from './escapar.js?v=25ebf0fa92';
import { paraLink } from './relogio.js?v=25ebf0fa92';
import { cortarMomento, gravarVertical } from './momento-baixar.js?v=25ebf0fa92';
import { prepararSomDaGravacao } from './retrato.js?v=25ebf0fa92';

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
    editar: 'Editar no Povix', kick: 'Kick',
    baixarTiktok: 'Baixar para TikTok', baixar: 'Baixar', baixando: 'Baixando o vídeo… {feito} de {total}',
    procurandoRosto: 'Procurando a webcam…', gravando: 'Montando o vertical… {feito} de {total} s',
    baixou: 'Pronto: o arquivo foi para os seus downloads.', baixouSemRosto: 'Pronto (sem webcam achada: o meio do jogo).',
    naoBaixou: 'Não deu para baixar: {motivo}.', baixarDeNovo: 'Baixar de novo',
    grupoUm: '1 momento · melhor ▲ {p}', grupoN: '{n} momentos · melhor ▲ {p}',
    visaoDe: 'Visão do inimigo: {canal}', visaoCaiu: 'Visão de quem caiu: {canal}',
    linhaViral: 'Virais: reação forte', linhaHighlight: 'Highlights: jogadas de PvP',
    busca: 'Procurar streamer', subCanal: '{n} momentos de {canal} (inclui a visão dele como inimigo).', maisN: 'Mostrar mais ({n})', nadaCanal: 'Nenhum momento de “{canal}” neste evento.',
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
    editar: 'Edit in Povix', kick: 'Kick',
    baixarTiktok: 'Download for TikTok', baixar: 'Download', baixando: 'Downloading the video… {feito} of {total}',
    procurandoRosto: 'Looking for the webcam…', gravando: 'Building the vertical… {feito} of {total} s',
    baixou: 'Done: the file is in your downloads.', baixouSemRosto: 'Done (no webcam found: center of the game).',
    naoBaixou: 'Could not download: {motivo}.', baixarDeNovo: 'Download again',
    grupoUm: '1 moment · best ▲ {p}', grupoN: '{n} moments · best ▲ {p}',
    visaoDe: 'Enemy view: {canal}', visaoCaiu: 'View of who went down: {canal}',
    linhaViral: 'Viral: big reactions', linhaHighlight: 'Highlights: PvP plays',
    busca: 'Find a streamer', subCanal: '{n} moments from {canal} (includes their view as the enemy).', maisN: 'Show more ({n})', nadaCanal: 'No moments from “{canal}” in this event.',
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
    editar: 'Editar en Povix', kick: 'Kick',
    baixarTiktok: 'Descargar para TikTok', baixar: 'Descargar', baixando: 'Descargando el video… {feito} de {total}',
    procurandoRosto: 'Buscando la webcam…', gravando: 'Armando el vertical… {feito} de {total} s',
    baixou: 'Listo: el archivo está en tus descargas.', baixouSemRosto: 'Listo (sin webcam encontrada: el centro del juego).',
    naoBaixou: 'No se pudo descargar: {motivo}.', baixarDeNovo: 'Descargar de nuevo',
    grupoUm: '1 momento · mejor ▲ {p}', grupoN: '{n} momentos · mejor ▲ {p}',
    visaoDe: 'Visión del enemigo: {canal}', visaoCaiu: 'Visión de quien cayó: {canal}',
    linhaViral: 'Virales: reacción fuerte', linhaHighlight: 'Highlights: jugadas de PvP',
    busca: 'Buscar streamer', subCanal: '{n} momentos de {canal} (incluye su visión como enemigo).', maisN: 'Mostrar más ({n})', nadaCanal: 'Ningún momento de “{canal}” en este evento.',
  },
};
const NOMES_IDIOMA = { pt: 'Português', en: 'English', es: 'Español' };

// O vídeo começa uns segundos antes do momento: quem toca precisa de um instante para entrar na cena.
const ANTES_S = 3;

const $ = (id) => document.getElementById(id);
const estado = { idioma: 'pt', nome: '', dados: null, aba: 'melhores', tocando: null, aviso: null, canal: '', limite: {}, baixando: null };
// Quantos cartões cada linha mostra antes do "Mostrar mais": a lista do evento tem muitos momentos.
const POR_VEZ = 15;
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
/**
 * O Povix já no momento, como um projeto partilhado (#s=): só os canais do momento (o streamer e as visões do
 * inimigo), a noite deles, o instante e o corte marcados, no modo avançado (dá para baixar, trocar a visão e o
 * modo de ver). O dono, 17/10: o link do evento (?e=) abria o evento inteiro, "uns 40 segundos", para um clipe só.
 */
function linkDoPovix(m) {
  const meio = Math.round((m.inicioMs + m.fimMs) / 2);
  const canais = [m.canal, ...povsDe(m).map((p) => p.canal)].filter((c, i, a) => a.indexOf(c) === i);
  const sessao = paraLink({
    canais,
    agoraMs: m.inicioMs,
    focos: canais.slice(0, 2),
    marca: { de: m.inicioMs, ate: m.fimMs },
    momentos: [{ ms: meio, protagonista: m.canal }],
  });
  return `index.html#s=${encodeURIComponent(sessao)}`;
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
      <div class="momAcoes"><button type="button" class="momBotao principal" data-baixar="tiktok">${escapar(t('baixarTiktok'))}</button>`
      + `<button type="button" class="momBotao" data-baixar="deitado">${escapar(t('baixar'))}</button>`
      + `<a class="momBotao momKick" href="${escapar(linkDaKick(m))}" target="_blank" rel="noopener">${escapar(t('kick'))}</a></div>
      <p class="momBaixando" role="status" hidden></p><progress class="momBarra" max="1" hidden></progress>
      <a class="momEditar" href="${escapar(linkDoPovix(m))}">${escapar(t('editar'))}</a>
    </div>
  </article>`;
}

const porPotencial = (a, b) => (b.potencial ?? 0) - (a.potencial ?? 0) || a.inicioMs - b.inicioMs;

function pintar() {
  parar();
  pararDownload();
  // Um streamer pode procurar só o que é dele (o dono, 17/10): os momentos dele e aqueles em que ele aparece como
  // a visão do inimigo.
  // Sem busca, a lista do evento mostra só top e bom; o nível "resto" aparece na busca do streamer, que vê tudo o que
  // é dele mesmo sem viral.
  const doCanal = (m) => (!estado.canal ? m.nivel !== 'resto'
    : m.canal === estado.canal || povsDe(m).some((pv) => pv.canal === estado.canal));
  const lista = [...porId.values()].filter(doCanal).sort(porPotencial);
  const caixa = $('listaMomentos');
  const pagina = (chave, ms) => {
    const n = estado.limite[chave] || POR_VEZ;
    const resto = ms.length - n;
    return ms.slice(0, n).map(cartao).join('')
      + (resto > 0 ? `<button type="button" class="momMais" data-linha="${chave}">${escapar(t('maisN', { n: resto }))}</button>` : '');
  };
  if (estado.aba === 'melhores') {
    // Duas linhas quando o arquivo traz highlights (o dono, 17/10): virais primeiro, depois as jogadas de PvP.
    const hl = lista.filter((m) => m.linha === 'highlight');
    if (!hl.length) {
      caixa.className = 'momMelhores';
      caixa.innerHTML = pagina('tudo', lista);
    } else {
      caixa.className = 'momLinhas';
      caixa.innerHTML = [['linhaViral', lista.filter((m) => m.linha !== 'highlight')], ['linhaHighlight', hl]]
        .filter(([, ms]) => ms.length)
        .map(([chave, ms]) => `<section class="momLinha"><h2>${escapar(t(chave))}</h2><div class="momMelhores">${pagina(chave, ms)}</div></section>`).join('');
    }
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
  $('momBusca').placeholder = t('busca');
  $('momBusca').setAttribute('aria-label', t('busca'));
  if (estado.dados) {
    $('nomeEvento').textContent = String(estado.dados.evento || estado.nome);
    const deles = estado.canal ? [...porId.values()].filter((m) => m.canal === estado.canal || povsDe(m).some((pv) => pv.canal === estado.canal)).length : 0;
    const doEvento = [...porId.values()].filter((m) => m.nivel !== 'resto');
    $('momSub').textContent = !estado.canal ? t('sub', { n: doEvento.length, c: new Set(doEvento.map((m) => m.canal)).size })
      : deles ? t('subCanal', { n: deles, canal: estado.canal }) : t('nadaCanal', { canal: estado.canal });
    // Trocar o idioma não corta o vídeo que está a tocar; os cartões mudam na próxima pintura.
    if (!estado.tocando) pintar();
  }
  if (estado.aviso) $('momEstado').textContent = t(...estado.aviso);
  for (const pv of estado.tocando?.povs || []) pv.caixa.querySelector('.momPovTopo').innerHTML = rotuloPov(pv.pov);
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
  limparPov(vez);
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
    // Com o VOD à mão, toca-se dele: dá para abrir uns segundos antes e fechar depois do corte do clipe
    // (o dono, 17/10: o clipe tem de começar no contexto e acabar no desfecho). Sem VOD, o clipe da Kick.
    if (temClipe(m) && !(UUID.test(m.uuid || '') && Number.isFinite(m.aosS))) {
      url = (await clipeDaKick(m.clipe, { sinal: vez.controlo.signal })).m3u8;
    } else {
      // As visões do outro lado pedem-se já, em paralelo com a do principal.
      vez.fontesPov = povsDe(m).map((pv) => {
        const f = fonteDoVod(pv.uuid, { sinal: vez.controlo.signal });
        f.catch(() => {});
        return [pv, f];
      });
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
    vez.hls = ligarPlayer(video, url, de, falhou);
    // O principal nunca espera (o dono, 17/10: quem olha não pode ficar parado à espera): as visões do inimigo
    // entram quando ficam prontas, já no instante certo do principal.
    if (ate != null && vez.fontesPov?.length) tocarPovs(m, vez);
    // Depois do pedido à Kick o navegador pode já não contar o toque e recusar o som: os controlos estão à
    // vista, e o próximo toque toca.
    video.play().catch(() => {});
  } catch (e) {
    if (estado.tocando !== vez || e?.name === 'AbortError') return;
    parar();
    caixa.insertAdjacentHTML('beforeend', `<p class="momErro" role="alert">${escapar(t(e?.name === 'SEM-PLAYER' ? 'semPlayer' : 'falhou'))}</p>`);
  }
}

const povValida = (p) => p && CANAL.test(p.canal || '') && UUID.test(p.uuid || '') && Number.isFinite(p.aosS);
// As visões do outro lado de um momento: `povs` (lista) ou o antigo `pov`; no máximo MAX_POVS, as válidas.
const MAX_POVS = 2;
const povsDe = (m) => (Array.isArray(m.povs) ? m.povs : m.pov ? [m.pov] : []).filter(povValida).slice(0, MAX_POVS);

/**
 * Liga um m3u8 a um <video>: hls.js onde houver, senão o HLS nativo (Safari). `aoFalhar` corre num erro fatal.
 * Devolve a instância do hls.js (null no nativo); sem nenhum dos dois, lança SEM-PLAYER.
 */
function ligarPlayer(video, url, de, aoFalhar) {
  if (window.Hls?.isSupported()) {
    const hls = new window.Hls({ startPosition: de });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.ERROR, (_, d) => { if (d?.fatal) aoFalhar(); });
    return hls;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.addEventListener('error', aoFalhar, { once: true });
    video.src = url;
    if (de) video.addEventListener('loadedmetadata', () => { video.currentTime = de; }, { once: true });
    return null;
  }
  throw Object.assign(new Error('sem player'), { name: 'SEM-PLAYER' });
}

/** Larga uma visão do outro lado: para o vídeo, solta o hls e os ouvintes que ela punha no principal. */
function limparUmaPov(vez, p) {
  if (!vez.povs?.includes(p)) return;
  vez.povs = vez.povs.filter((x) => x !== p);
  p.controlo.abort();
  p.hls?.destroy();
  p.video.pause();
  p.video.removeAttribute('src');
  p.video.load();
  p.caixa.remove();
  p.pronta();
  if (!vez.povs.length) vez.caixaPovs?.remove();
}

function limparPov(vez) {
  for (const p of [...(vez.povs || [])]) limparUmaPov(vez, p);
  vez.caixaPovs?.remove();
}

function linkDaKickPov(pov) {
  const canal = encodeURIComponent(pov.canal);
  return UUID7.test(pov.vodId || '') ? `https://kick.com/${canal}/videos/${pov.vodId}?t=${Math.max(0, Math.round(pov.aosS))}` : `https://kick.com/${canal}`;
}

const rotuloPov = (pov) => `<span class="momPovNome">${escapar(t(pov.tipo === 'caiu' ? 'visaoCaiu' : 'visaoDe', { canal: pov.canal }))}</span>`
  + `<a class="momPovKick" href="${escapar(linkDaKickPov(pov))}" target="_blank" rel="noopener">${escapar(t('kick'))}</a>`;

// Passando desta diferença (s) do principal, a outra visão volta ao compasso.
const LIMIAR_POV_S = 0.8;

/**
 * As visões do outro lado (o dono, 17/10: o Povix é a POV do atacante e do defensor): até MAX_POVS vídeos menores
 * e mudos, lado a lado embaixo do principal, do VOD de quem estava na mesma cena, a seguir o principal. A que não
 * abrir some sem estragar o resto. Devolve, por visão, uma promessa que resolve quando ela pode tocar (ou some).
 */
function tocarPovs(m, vez) {
  const caixaPovs = document.createElement('div');
  caixaPovs.className = 'momPovs';
  vez.caixaPovs = caixaPovs;
  vez.povs = [];
  vez.caixa.after(caixaPovs);
  return vez.fontesPov.map(([pv, fonte]) => tocarPov(m, vez, pv, fonte, caixaPovs));
}

function tocarPov(m, vez, pv, fonte, caixaPovs) {
  const desvio = pv.aosS - m.aosS;
  const caixa = document.createElement('div');
  caixa.className = 'momPov';
  caixa.innerHTML = `<div class="momPovTopo">${rotuloPov(pv)}</div>`;
  const pov = document.createElement('video');
  pov.muted = true;
  pov.playsInline = true;
  caixa.append(pov);
  let pronta;
  const promessa = new Promise((ok) => { pronta = ok; });
  const p = { caixa, video: pov, hls: null, pov: pv, controlo: new AbortController(), pronta };
  vez.povs.push(p);
  caixaPovs.append(caixa);
  const some = () => limparUmaPov(vez, p);
  (async () => {
    try {
      const { m3u8 } = await fonte;
      if (estado.tocando !== vez || !vez.povs.includes(p)) return;
      const v = vez.video;
      // O instante desta visão que corresponde ao do principal; fora do VOD dela (começou depois ou acabou
      // antes) não há o que mostrar: fica escondida em vez de saltar a cada passo.
      const alvo = () => {
        const a = v.currentTime + desvio;
        return a < 0 || (Number.isFinite(pov.duration) && a > pov.duration) ? null : a;
      };
      // O principal já pode ter andado enquanto a v1 respondia: entra no mesmo instante da cena.
      const de = Math.max(0, (v.currentTime > 0 ? v.currentTime : Math.max(0, m.aosS - ANTES_S)) + desvio);
      p.hls = ligarPlayer(pov, m3u8, de, some);
      const acertar = (sempre) => {
        const a = alvo();
        caixa.hidden = a == null;
        if (a == null || pov.readyState < 2 || pov.seeking) return;
        if (sempre || Math.abs(pov.currentTime - a) > LIMIAR_POV_S) pov.currentTime = a;
      };
      const sinal = { signal: p.controlo.signal };
      v.addEventListener('play', () => pov.play().catch(() => {}), sinal);
      v.addEventListener('playing', () => pov.play().catch(() => {}), sinal);
      v.addEventListener('pause', () => pov.pause(), sinal);
      // O principal parado a carregar não deixa esta visão fugir à frente.
      v.addEventListener('waiting', () => pov.pause(), sinal);
      v.addEventListener('ratechange', () => { pov.playbackRate = v.playbackRate; }, sinal);
      v.addEventListener('seeked', () => acertar(true), sinal);
      v.addEventListener('timeupdate', () => acertar(false), sinal);
      // Chegou atrasada (depois de o principal arrancar): entra no instante certo assim que puder tocar.
      pov.addEventListener('canplay', () => { pronta(); acertar(true); }, { once: true, signal: p.controlo.signal });
      pov.addEventListener('playing', () => acertar(true), { once: true, signal: p.controlo.signal });
      pov.playbackRate = v.playbackRate;
      if (!v.paused) pov.play().catch(() => {});
    } catch (e) {
      if (e?.name !== 'AbortError') some();
      else pronta();
    }
  })();
  return promessa;
}

/** Larga o download em curso (trocar de aba, ou baixar outro cartão). */
function pararDownload() {
  const d = estado.baixando;
  if (!d) return;
  estado.baixando = null;
  d.controlo.abort();
}

function nomeDoArquivo(m, vertical, extensao) {
  const d = new Date(m.inicioMs);
  const p = (n) => String(n).padStart(2, '0');
  const quando = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `${m.canal}-${quando}${vertical ? '-tiktok' : ''}.${extensao}`;
}

function entregar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Baixar o momento ali mesmo, sem abrir o evento: o 16:9 sai dos bytes da Kick em segundos; o vertical grava
 * por cima desse MP4 em tempo real (um momento de 30 s, uns 30 s depois do download).
 */
async function baixarMomento(cartaoEl, vertical) {
  const m = porId.get(cartaoEl.dataset.id);
  if (!m) return;
  // O som do vertical precisa de ser destravado ainda no toque (iPhone).
  if (vertical) prepararSomDaGravacao();
  pararDownload();
  const d = { cartao: cartaoEl, controlo: new AbortController() };
  estado.baixando = d;
  const nota = cartaoEl.querySelector('.momBaixando');
  const barra = cartaoEl.querySelector('.momBarra');
  const botoes = [...cartaoEl.querySelectorAll('[data-baixar]')];
  const dizer = (texto, fracao = null) => {
    if (!nota.isConnected) return;
    nota.hidden = false;
    nota.textContent = texto;
    barra.hidden = fracao === false;
    if (fracao == null || fracao === false) barra.removeAttribute('value'); else barra.value = Math.max(0, Math.min(1, fracao));
  };
  for (const b of botoes) b.disabled = true;
  try {
    dizer(t('baixando', { feito: 0, total: '…' }));
    const corte = await cortarMomento(m, {
      antesS: ANTES_S,
      sinal: d.controlo.signal,
      aoProgresso: ({ feito, total }) => dizer(t('baixando', { feito, total }), total ? feito / total : null),
    });
    if (estado.baixando !== d) return;
    if (!vertical) {
      // Um vídeo que o MP4 daqui não sabe embrulhar sai .ts (baixar.js): o nome diz o que é.
      entregar(corte.blob, nomeDoArquivo(m, false, corte.tipo === 'video/mp4' ? 'mp4' : 'ts'));
      dizer(t('baixou'), false);
      return;
    }
    const r = await gravarVertical({
      blob: corte.blob, duracaoS: corte.duracaoS, fps: corte.fps, canal: m.canal, sinal: d.controlo.signal,
      aoFase: (f) => dizer(f === 'rosto' ? t('procurandoRosto') : t('gravando', { feito: 0, total: Math.round(corte.duracaoS) })),
      aoProgresso: ({ feito, total }) => dizer(t('gravando', { feito: Math.round(feito), total: Math.round(total) }), total ? feito / total : null),
    });
    if (estado.baixando !== d) return;
    entregar(r.blob, nomeDoArquivo(m, true, r.extensao || 'mp4'));
    dizer(t(r.comRosto ? 'baixou' : 'baixouSemRosto'), false);
  } catch (e) {
    if (e?.name === 'AbortError' || estado.baixando !== d) { if (nota.isConnected) { nota.hidden = true; barra.hidden = true; } return; }
    dizer(t('naoBaixou', { motivo: String(e?.message || e).slice(0, 120) }), false);
  } finally {
    if (estado.baixando === d) estado.baixando = null;
    for (const b of botoes) { b.disabled = false; }
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
    const baixarBotao = ev.target.closest('[data-baixar]');
    if (baixarBotao) { baixarMomento(baixarBotao.closest('.mom'), baixarBotao.dataset.baixar === 'tiktok'); return; }
    const mais = ev.target.closest('.momMais');
    if (mais) { estado.limite[mais.dataset.linha] = (estado.limite[mais.dataset.linha] || POR_VEZ) + POR_VEZ; pintar(); return; }
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
  const canais = [...new Set(momentos.flatMap((m) => [m.canal, ...povsDe(m).map((pv) => pv.canal)]).filter((c) => CANAL.test(c || '')))].sort();
  $('momCanais').innerHTML = canais.map((c) => `<option value="${escapar(c)}"></option>`).join('');
  const busca = $('momBusca');
  const escolher = () => {
    const c = busca.value.trim().toLowerCase();
    estado.canal = CANAL.test(c) ? c : '';
    estado.limite = {};
    try {
      const u = new URL(location.href);
      if (estado.canal) u.searchParams.set('c', estado.canal); else u.searchParams.delete('c');
      history.replaceState(null, '', u);
    } catch { /* sem history */ }
    textos();
  };
  busca.addEventListener('change', escolher);
  busca.addEventListener('search', escolher);
  try { busca.value = (new URLSearchParams(location.search).get('c') || '').trim().toLowerCase(); } catch { busca.value = ''; }
  estado.canal = CANAL.test(busca.value) ? busca.value : '';
  avisar(null);
  textos();
}

iniciar();
