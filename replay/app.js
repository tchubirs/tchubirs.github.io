// The page. Everything runs in the browser; there is no server in this product.
//
// Only the focus tile decodes at a real rendition and carries sound. The rest
// run at 160p @ 230 kbps, which measured on four unrelated channels is the
// bottom rung of Kick's ladder and is what makes thirty tiles a home-connection
// problem rather than a server problem.

import { vodsDoCanal, lerMaster, lerPlaylist, procurarCanais } from './kick.js?v=51836db792';
import { linhaDoCanal, janelaComum, onde, quantosNoAr, comNudge, paraLink, doLink } from './relogio.js?v=51836db792';
import { cortarTodosOsAngulos } from './baixar.js?v=51836db792';
import { alinharPeloSom, custoEstimadoMB } from './alinhar.js?v=51836db792';
import { agruparPorNoite, rotuloDaNoite } from './noites.js?v=51836db792';

const $ = (id) => document.getElementById(id);
const estado = {
  linhas: [],
  janela: null,
  agoraMs: 0,
  marca: { de: null, ate: null },
  nudges: {},
  focos: [],
  margens: {},
  players: new Map(),
  cancelar: null,
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
      + `<span>${c.slug}${c.aoVivo ? ' <b class="vivo">ao vivo</b>' : ''}</span>`
      + `<span class="quantos">${ja ? 'já está' : `${c.seguidores.toLocaleString('pt')} seguidores`}</span></li>`;
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
  aviso.textContent = 'O leitor de vídeo (hls.js) não carregou — um bloqueador ou a rede '
    + 'terão travado o CDN. Sem ele os quadrados ficam pretos.';
  aviso.hidden = false;
  return false;
}

async function carregar() {
  const nomes = [...new Set(listaDeCanais())];
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

function pintarNoites(noites) {
  $('noites').hidden = false;
  $('noite').innerHTML = noites
    .map((n, i) => `<option value="${i}">${rotuloDaNoite(n)}</option>`).join('');
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
function pintarCanais(canais) {
  $('canaisEstado').hidden = false;
  const rotulo = {
    ok: '',
    'canal-nao-existe': 'não existe na Kick',
    'sem-vods': 'existe, mas não tem VODs guardados',
    'vods-indisponiveis': 'os VODs estão privados ou apagados',
    'rate-limit': 'a Kick pediu para abrandar',
    'sem-rede': 'sem rede',
    'nome-invalido': 'nome inválido',
    'resposta-ilegivel': 'a Kick respondeu algo que não percebi',
    'formato-inesperado': 'a Kick mudou o formato da resposta',
  };
  $('listaCanais').innerHTML = canais.map((c) => {
    const mau = c.estado !== 'ok';
    return `<li class="${mau ? 'mau' : ''}" data-slug="${c.slug}" data-estado="${c.estado}"><b>${c.slug}</b>`
      + `<span class="nota">${mau ? (rotulo[c.estado] || c.estado) : `${c.vods.length} VOD(s)`}</span>`
      + `<span class="parecidos"></span></li>`;
  }).join('');
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
    li.innerHTML = '<span class="nota">quiseste dizer</span>'
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

  // Start where the most angles are. When everyone overlaps that is the common
  // window; when they do not — one ended at 20:10, another began at 23:30 —
  // there is no such instant, and `sobreposicaoInicio` is null on purpose.
  // Reading it blindly put the whole page at NaN and every tile went black.
  estado.agoraMs = estado.janela.haSobreposicao
    ? estado.janela.sobreposicaoInicio
    : estado.janela.inicio;
  estado.focos = estado.linhas[0] ? [estado.linhas[0].slug] : [];
  $('palco').hidden = false;
  $('resumoNoite').textContent = estado.janela.haSobreposicao
    ? `todos juntos ${relogioCurto(estado.janela.sobreposicaoInicio)}–${relogioCurto(estado.janela.sobreposicaoFim)}`
    : 'nunca estiveram todos no ar ao mesmo tempo';
  montarGrade();
  irPara(estado.agoraMs);
}

// ── grelha ──────────────────────────────────────────────────────────────────

const tileDe = (slug) => document.querySelector(`.tile[data-slug="${CSS.escape(slug)}"]`);
const ehFoco = (slug) => estado.focos.includes(slug);

/**
 * Pôr ou tirar um ângulo do par.
 *
 * Dois é o limite, e é de propósito: o objectivo é decidir se vale a pena
 * baixar, e para isso comparam-se dois. Três já é outra vez a grelha toda a
 * descodificar, que é exactamente o que se estava a evitar.
 */
function alternarPar(slug) {
  if (ehFoco(slug)) {
    if (estado.focos.length > 1) estado.focos = estado.focos.filter((s) => s !== slug);
  } else {
    estado.focos = [...estado.focos, slug].slice(-2);
  }
  montarGrade();
  irPara(estado.agoraMs);
}

function montarGrade() {
  $('grade').innerHTML = '';
  $('palcoFoco').innerHTML = '';
  estado.players.forEach((p) => p.destroy?.());
  estado.players.clear();

  for (const linha of estado.linhas) {
    const foco = ehFoco(linha.slug);
    const tile = document.createElement('div');
    tile.className = `tile${foco ? ' foco' : ''}`;
    tile.dataset.slug = linha.slug;
    tile.innerHTML = `<video muted playsinline preload="none"></video>`
      + `<span class="rotulo">${linha.slug}`
      + `${linha.relogio !== 'exato' ? ' <b class="aviso" title="relógio incerto">≈</b>' : ''}</span>`
      + `<span class="estadoTile"></span>`
      + `<span class="posicao"></span>`
      // O relógio da Kick põe cada ângulo dentro de um segmento da verdade, o
      // que já está dentro do que o dono pediu. Isto é para o resto: um stream
      // com mais buffer, ou um olho que diz "este está meio segundo à frente".
      + `<span class="ajuste">`
      + `<button data-passo="-1" title="atrasar 1s (Shift: 10s)">−</button>`
      + `<b class="nudge">0.0s</b>`
      + `<button data-passo="1" title="adiantar 1s (Shift: 10s)">+</button>`
      + `</span>`
      + `<button class="par" title="ver dois ao mesmo tempo">${foco ? '✓' : '⧉'}</button>`;

    tile.onclick = () => { estado.focos = [linha.slug]; montarGrade(); irPara(estado.agoraMs); };
    for (const b of tile.querySelectorAll('.ajuste button')) {
      b.onclick = (e) => {
        // Sem isto o clique também acerta no quadrado e muda o foco, ou seja
        // duas coisas ao mesmo tempo e uma delas não foi pedida.
        e.stopPropagation();
        empurrar(linha.slug, Number(b.dataset.passo) * (e.shiftKey ? 10_000 : 1000));
      };
    }
    tile.querySelector('.par').onclick = (e) => { e.stopPropagation(); alternarPar(linha.slug); };

    (foco ? $('palcoFoco') : $('grade')).append(tile);
  }
  $('palcoFoco').classList.toggle('dois', estado.focos.length > 1);
  // Só o primeiro tem som: dois áudios ao mesmo tempo não é comparar, é
  // barulho, e não se percebe nenhum dos dois.
  tileDe(estado.focos[0])?.querySelector('video')?.removeAttribute('muted');
}

/** Ajuste manual de um ângulo — o resto da grelha não se mexe. */
function empurrar(slug, ms) {
  const { nudges } = comNudge({ nudges: estado.nudges }, slug, (estado.nudges[slug] || 0) + ms);
  estado.nudges = nudges;
  irPara(estado.agoraMs);
  // O tamanho do corte é por canal, e mexer no relógio de um canal muda quem
  // aparece na janela marcada. Não repintar deixava a lista a mentir.
  pintarCorte();
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
function irPara(quandoMs) {
  estado.agoraMs = quandoMs;
  $('agora').textContent = `${relogioCurto(quandoMs)}Z`;
  // How many angles exist right here. With no common window this is the number
  // that matters: "4 de 6" is useful, "no overlap" is not.
  const vivos = quantosNoAr(estado.linhas, quandoMs, { nudges: estado.nudges });
  $('angulos').textContent = `${vivos} de ${estado.linhas.length} ângulos`;
  $('angulos').classList.toggle('mau', vivos < 2);
  const { inicio, fim } = estado.janela;
  $('barra').value = String(Math.round(((quandoMs - inicio) / (fim - inicio)) * 1000));

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
      nota.textContent = r.estado === 'buraco' ? `fora do ar (${Math.round(r.buraco.segundos)}s)`
        : r.estado === 'antes' ? 'ainda não tinha começado'
          : r.estado === 'depois' ? 'já tinha acabado' : 'sem vídeo';
      tile.classList.add('vazio');
      pararTile(linha.slug, video);
      continue;
    }
    nota.textContent = '';
    tile.classList.remove('vazio');
    // Onde cada um está DENTRO do vídeo dele. É o número que mostra o avanço e
    // o atraso, e aparece já — antes de qualquer imagem carregar.
    tile.querySelector('.posicao').textContent = mmss(r.tempoS);

    if (ehFoco(linha.slug)) tocar(linha, r, video, { correr: true, comSom: linha.slug === estado.focos[0] });
    else secundarios.push([linha, r, video]);
  }

  // Os parados só saltam quando a barra descansa. Arrastar o cursor pediria um
  // pedaço de vídeo por pixel, a trinta canais — um ataque ao CDN feito com o
  // rato, e a primeira coisa que poria isto bloqueado.
  clearTimeout(estado.timerSecundarios);
  estado.timerSecundarios = setTimeout(() => {
    for (const [linha, r, video] of secundarios) tocar(linha, r, video, { correr: false });
  }, 220);
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function pararTile(slug, video) {
  const p = estado.players.get(slug);
  if (p) { p.destroy(); estado.players.delete(slug); }
  video.removeAttribute('src');
}

function tocar(linha, r, video, { correr, comSom = false } = {}) {
  const peca = linha.pecasCompletas.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  // Focus gets the best rung the ladder has; everything else stays at 160p.
  const alvo = correr ? peca.escada[0] : peca.barato;
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
    const hls = new window.Hls({ startPosition: r.tempoS, maxBufferLength: correr ? 30 : 2 });
    hls.loadSource(alvo.url);
    hls.attachMedia(video);
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => hls.destroy() });
  } else {
    // Safari plays HLS natively and hls.js refuses to load there.
    video.src = alvo.url;
    video.currentTime = r.tempoS;
    estado.players.set(linha.slug, { url: alvo.url, destroy: () => { video.removeAttribute('src'); } });
  }
  video.muted = !comSom;
  // `play()` devolve uma promessa que rejeita se o browser recusar tocar sem
  // um clique. Ignorada de propósito: o utilizador carrega no quadrado e
  // resolve-se sozinho — rebentar aqui deixava a página sem grelha nenhuma.
  if (correr) video.play?.().catch(() => {});
  else video.pause?.();
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
  if (mb > 80 && !confirm(`Ouvir ${estado.linhas.length} ângulos vai baixar cerca de ${mb} MB.\n\n`
    + 'Em Wi-Fi é rápido; em dados móveis pesa. Continuar?')) return;
  botao.disabled = true;

  try {
    const r = await alinharPeloSom({
      linhas: estado.linhas,
      janela: estado.janela,
      sinal: controlo.signal,
      aoProgresso: (p) => {
        nota.textContent = p.fase === 'ouvir'
          ? `a ouvir ${p.canal} — ${p.feito}/${p.total} · ${(p.bytes / 1048576).toFixed(0)} MB`
          : 'a comparar…';
      },
    });

    // Substitui, não soma: correr duas vezes seguidas não pode empurrar o
    // dobro. E o que foi medido à mão para um canal sem ligação fica de pé.
    for (const [slug, ms] of Object.entries(r.ajustesMs)) estado.nudges[slug] = ms;

    const mexidos = Object.entries(r.ajustesMs).filter(([, ms]) => Math.abs(ms) >= 250);
    nota.textContent = `${Object.keys(r.ajustesMs).length} de ${estado.linhas.length} alinhados pelo som`
      + (mexidos.length ? ` · corrigi ${mexidos.map(([s, ms]) => `${s} ${(ms / 1000).toFixed(1)}s`).join(', ')}` : ' · já estavam certos')
      + (r.semLigacao.length ? ` · sem som em comum: ${r.semLigacao.join(', ')} (ajusta à mão)` : '')
      // Um canal que não se conseguiu baixar não é a mesma coisa que um canal
      // que não tem som em comum, e chamar-lhes o mesmo esconde uma falha de
      // rede atrás de uma explicação que soa razoável.
      + (r.problemas.length ? ` · não consegui ouvir ${[...new Set(r.problemas.map((x) => x.canal))].join(', ')}` : '');
    nota.classList.toggle('mau', !Object.keys(r.ajustesMs).length);
    montarGrade();
    irPara(estado.agoraMs);
  } catch (e) {
    nota.classList.add('mau');
    nota.textContent = e.name === 'AbortError' ? 'cancelado'
      : e.name === 'SEM-DESCODIFICADOR'
        ? 'este navegador não descodifica o áudio da Kick — usa o Chrome ou o Edge, '
          + 'ou alinha à mão com o − / + de cada quadrado'
        : `não deu: ${e.message}`;
  }
  botao.disabled = false;
}

// ── marcar e cortar ─────────────────────────────────────────────────────────

const mmssCurto = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function pintarMarca() {
  const { de, ate } = estado.marca;
  $('marca').textContent = de == null ? ''
    : ate == null ? `início ${relogioCurto(de)}Z — falta o fim`
      : `${relogioCurto(de)}Z → ${relogioCurto(ate)}Z (${hhmmss(ate - de)})`;
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
  $('corte').hidden = !valida;
  if (!valida) return;

  const presentes = estado.linhas.filter((l) => {
    const nudge = estado.nudges[l.slug] || 0;
    return onde(l, de, { nudgeMs: nudge }).estado === 'toca'
      || onde(l, ate, { nudgeMs: nudge }).estado === 'toca';
  });

  $('listaCorte').innerHTML = presentes.map((l) => {
    const m = estado.margens[l.slug] || {};
    return `<li data-slug="${l.slug}">`
      + `<b>${l.slug}</b>`
      + `<label>antes <input class="antes" type="number" value="${m.antesS || 0}" min="0" max="120" step="1">s</label>`
      + `<label>depois <input class="depois" type="number" value="${m.depoisS || 0}" min="0" max="120" step="1">s</label>`
      + `<span class="dur"></span>`
      + `<button class="baixarUm">Baixar</button>`
      + `<span class="estadoCorte nota"></span>`
      + `</li>`;
  }).join('')
    || '<li class="nota">nenhum ângulo estava a filmar nessa janela.</li>';

  for (const li of $('listaCorte').querySelectorAll('li[data-slug]')) {
    const slug = li.dataset.slug;
    const ler = () => {
      const antesS = Math.max(0, Number(li.querySelector('.antes').value) || 0);
      const depoisS = Math.max(0, Number(li.querySelector('.depois').value) || 0);
      estado.margens[slug] = { antesS, depoisS };
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
      nota.textContent = p.fase === 'planear' ? 'a preparar…' : `${p.prontos}/${p.total} pedaços`;
    },
  });

  botao.disabled = false;
  estado.cancelar = null;
  nota.textContent = '';
  const item = document.createElement('li');
  $('fila').prepend(item);

  if (r.estado === 'pronto') {
    const url = URL.createObjectURL(new Blob([r.bytes], { type: r.tipo }));
    const mb = (r.bytes.length / 1048576).toFixed(1);
    // A sobra não é um pedido de desculpas — é o número por onde aparar no editor.
    item.innerHTML = `<a href="${url}" download="${r.nome}">${r.nome}</a> `
      + `<span class="nota">${mb} MB · ${r.plano.qualidade.altura}p${r.plano.qualidade.fps} · `
      + `começa ${r.plano.sobraInicioS.toFixed(1)}s antes da tua marca</span>`;
  } else if (r.estado === 'incompleto') {
    nota.classList.add('mau');
    item.innerHTML = `<b>${slug}</b> <span class="nota mau">${r.obtidos}/${r.total} pedaços — `
      + `não gero o ficheiro com um buraco no meio</span>`;
  } else {
    const porque = {
      buraco: 'estava fora do ar', 'fora-da-noite': 'não estava a filmar',
      'sem-segmentos': 'sem vídeo nessa janela',
    };
    item.innerHTML = `<b>${slug}</b> <span class="nota">${porque[r.estado] || r.estado}</span>`;
  }
}

// ── ligações ────────────────────────────────────────────────────────────────

$('carregar').onclick = carregar;
$('barra').oninput = () => {
  const { inicio, fim } = estado.janela || {};
  if (inicio == null) return;
  irPara(Math.round(inicio + ((fim - inicio) * Number($('barra').value)) / 1000));
};
// Os saltos que faltavam. A barra serve para procurar a noite; isto serve para
// caçar o momento, que é uma coisa diferente e a barra faz mal.
const saltar = (ms) => () => irPara(estado.agoraMs + ms);
$('menos1m').onclick = saltar(-60_000);
$('menos10s').onclick = saltar(-10_000);
$('mais10s').onclick = saltar(10_000);
$('mais1m').onclick = saltar(60_000);
$('marcarIn').onclick = () => { estado.marca = { de: estado.agoraMs, ate: null }; pintarMarca(); };
$('marcarOut').onclick = () => { estado.marca.ate = estado.agoraMs; pintarMarca(); };
$('alinhar').onclick = alinhar;

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const passo = e.shiftKey ? 10_000 : 1000;
  if (e.key === 'i' || e.key === 'I') $('marcarIn').click();
  if (e.key === 'o' || e.key === 'O') $('marcarOut').click();
  if (e.key === 'j' || e.key === 'ArrowLeft') irPara(estado.agoraMs - passo);
  if (e.key === 'l' || e.key === 'ArrowRight') irPara(estado.agoraMs + passo);
  // O ângulo em foco anda sozinho: alinhar à vista, sem tirar a mão do teclado.
  if (e.key === ',' && estado.focos[0]) empurrar(estado.focos[0], -passo);
  if (e.key === '.' && estado.focos[0]) empurrar(estado.focos[0], passo);
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
