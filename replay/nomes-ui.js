// "Achar o time pelos nomes na tela", no painel do lance (experimental).
//
// O dono, 10/10: pelo som o time não aparecia. Isto lê os nomes que o vídeo do streamer escolhido
// mostra em vários quadros em volta do momento, casa com os canais do evento e com os apelidos do
// Discord guardados neste aparelho, e mostra tudo: o recorte, o que se leu, quem parece ser e o quanto
// se parece. Ninguém entra no lance sem a pessoa dizer que sim, nome a nome.

import { t, tn } from './idiomas.js?v=f2ceb77d96';
import { escapar } from './escapar.js?v=f2ceb77d96';
import { casar, lerApelidos, guardarApelidos, juntarApelidos, semApelido, limparApelido } from './nomes.js?v=f2ceb77d96';
import { REGIOES, recortar, miniatura, abrirLeitor, abrirQuadros, podeLer, podeVerVideo, instantesEmVolta } from './ler-tela.js?v=f2ceb77d96';

// Medido na escada da Kick em 10/10: 1080p60 a 9,1 Mb/s e 720p60 a 3,5 Mb/s, em pedaços de 10 s.
const MBITS = { 1080: 9.1, 720: 3.5 };
const PEDACO_S = 10;
const PASSO_MS = 5_000;
// Abaixo disto o recorte não tem letra nenhuma (só fundo): não vale a pena mandar ao leitor.
const MINIMO_DE_LETRA = 0.0005;
const MAXIMO_RECORTES = 24;

/** Quantos MB um trecho baixa, contando o pedaço a mais nas pontas. */
export function megasDoTrecho(segundos, qualidade) {
  const s = Math.ceil(segundos / PEDACO_S) * PEDACO_S + PEDACO_S;
  return Math.round(((MBITS[qualidade] || MBITS[1080]) * s) / 8);
}

const horaLocal = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * @param {object} d
 * @param {() => ({canal, ms}|null)} d.escolha - o lance escolhido
 * @param {(slug, ms) => object|null} d.vodEm - o VOD (com `master`) que cobre esse instante
 * @param {(e) => string[]} d.candidatos - os canais que podem estar no lance (no ar nesse instante)
 * @param {(e) => string[]} d.jaNoLance - quem o lance já abre (o escolhido e o time dele)
 * @param {() => void} d.aoMudar - repintar o lance quando alguém entra ou sai
 */
export function montarNomesNaTela({ escolha, vodEm, candidatos, jaNoLance, aoMudar = () => {}, buscar = fetch }) {
  const $ = (id) => document.getElementById(id);
  const st = {
    lidos: [],
    recortes: [],
    decisao: new Map(),   // canal -> 'sim' | 'nao'
    resultado: { propostas: [], soltos: [] },
    controlo: null,
    lance: null,          // o momento que a leitura em curso lê, "canal|ms"
    apelidos: null,       // os apelidos lidos uma vez por leitura, e não a cada quadro
  };

  // Durante uma leitura os apelidos não se relêem do localStorage a cada quadro: só quando este painel
  // os muda.
  const apelidos = () => (st.controlo ? (st.apelidos || (st.apelidos = lerApelidos())) : lerApelidos());
  function mudarApelidos(mapa) {
    guardarApelidos(mapa);
    st.apelidos = null;
  }

  /** Os canais que a pessoa confirmou: entram no lance. */
  const confirmados = () => [...st.decisao].filter(([, v]) => v === 'sim').map(([k]) => k);

  function limpar() {
    st.controlo?.abort();
    st.controlo = null;
    st.lidos = [];
    st.recortes = [];
    st.decisao = new Map();
    st.resultado = { propostas: [], soltos: [] };
    st.lance = null;
    st.apelidos = null;
    if (!$('nomesTela')) return;
    $('nomesEstado').textContent = '';
    pintar();
  }

  function pintarGasto() {
    const seg = Number($('nomesTrecho').value) || 60;
    const q = Number($('nomesQualidade').value) || 1080;
    $('nomesGasto').textContent = t('nomes.gasto', { mb: megasDoTrecho(seg, q), n: Math.floor((seg * 1000) / PASSO_MS) + 1 });
  }

  function recasar() {
    const e = escolha();
    if (!e || !st.lidos.length) { st.resultado = { propostas: [], soltos: [] }; return; }
    st.resultado = casar({
      lidos: st.lidos,
      canais: candidatos(e),
      apelidos: apelidos(),
      excluir: jaNoLance(e),
    });
  }

  function textoDaProposta(p) {
    const vezes = tn(p.vezes, 'nomes.umQuadro', 'nomes.nQuadros');
    if (p.por === 'apelido') return t('nomes.leuApelido', { lido: p.lido, apelido: p.alvo, vezes });
    return t('nomes.leuCanal', { lido: p.lido, vezes });
  }

  function pintarPropostas() {
    const lista = $('nomesPropostas');
    lista.innerHTML = st.resultado.propostas.map((p) => {
      const d = st.decisao.get(p.canal);
      const pct = Math.round(p.semelhanca * 100);
      const acoes = d
        ? `<span class="nota">${escapar(t(d === 'sim' ? 'nomes.juntado' : 'nomes.recusado'))}</span>`
          + `<button type="button" data-desfazer="${escapar(p.canal)}">${escapar(t('nomes.desfazer'))}</button>`
        : `<button type="button" class="principal" data-sim="${escapar(p.canal)}" aria-label="${escapar(t('nomes.juntarAria', { canal: p.canal }))}">${escapar(t('nomes.juntar'))}</button>`
          + `<button type="button" data-nao="${escapar(p.canal)}" aria-label="${escapar(t('nomes.recusarAria', { canal: p.canal }))}">${escapar(t('nomes.recusar'))}</button>`;
      return `<li class="nomeProposta nivel-${p.nivel}${d ? ` ${d}` : ''}">`
        + `<div class="nomeCabeca"><b>${escapar(p.canal)}</b><span class="nivel" title="${escapar(t('nomes.parecidoTitulo', { pct }))}">${escapar(t(`nomes.nivel.${p.nivel}`))}, ${pct}%</span></div>`
        + `<span class="nota">${escapar(textoDaProposta(p))}</span>`
        + `<div class="linha nomeAcoes">${acoes}</div></li>`;
    }).join('');
    for (const b of lista.querySelectorAll('button[data-sim]')) b.onclick = () => decidir(b.dataset.sim, 'sim');
    for (const b of lista.querySelectorAll('button[data-nao]')) b.onclick = () => decidir(b.dataset.nao, 'nao');
    for (const b of lista.querySelectorAll('button[data-desfazer]')) b.onclick = () => decidir(b.dataset.desfazer, null);
  }

  function decidir(canal, valor) {
    if (valor) st.decisao.set(canal, valor); else st.decisao.delete(canal);
    pintar();
    aoMudar();
    // O foco não se perde quando a linha é repintada: volta ao botão que ficou no lugar.
    const alvo = $('nomesPropostas').querySelector(`button[data-desfazer="${CSS.escape(canal)}"], button[data-sim="${CSS.escape(canal)}"]`);
    alvo?.focus();
  }

  function pintarSoltos() {
    const soltos = st.resultado.soltos.slice(0, 12);
    $('nomesSoltosCaixa').hidden = !soltos.length;
    $('nomesSoltos').innerHTML = soltos.map((s, i) => `<li>`
      + `<div class="nomeCabeca"><b>${escapar(s.nome)}</b><span class="nota">${escapar(tn(s.vezes, 'nomes.umQuadro', 'nomes.nQuadros'))}</span></div>`
      + `<div class="linha nomeAcoes"><label class="soLeitor" for="nomesSolto${i}">${escapar(t('nomes.deQuemAria', { nome: s.nome }))}</label>`
      + `<input id="nomesSolto${i}" list="nomesCanais" autocomplete="off" spellcheck="false" placeholder="${escapar(t('nomes.deQuemPh'))}">`
      + `<button type="button" data-apelido="${escapar(s.nome)}" data-campo="nomesSolto${i}">${escapar(t('nomes.guardarApelido'))}</button></div></li>`).join('');
    for (const b of $('nomesSoltos').querySelectorAll('button[data-apelido]')) {
      b.onclick = () => guardarUm($(b.dataset.campo).value, b.dataset.apelido, b.dataset.campo);
    }
  }

  function pintarCanais() {
    const e = escolha();
    const lista = e ? candidatos(e) : [];
    $('nomesCanais').innerHTML = lista.slice(0, 1000).map((c) => `<option value="${escapar(c)}"></option>`).join('');
  }

  function guardarUm(canalCru, apelidoCru, campoId) {
    const canal = String(canalCru || '').trim().toLowerCase().replace(/^@/, '');
    const apelido = limparApelido(apelidoCru);
    const e = escolha();
    const validos = new Set(e ? candidatos(e) : []);
    if (!canal || !apelido || (validos.size && !validos.has(canal))) {
      $('nomesEstado').textContent = t('nomes.apelidoInvalido');
      if (campoId) $(campoId)?.focus();
      return false;
    }
    mudarApelidos(juntarApelidos(lerApelidos(), new Map([[canal, [apelido]]])));
    $('nomesEstado').textContent = t('nomes.apelidoGuardado', { apelido, canal });
    recasar();
    pintar();
    return true;
  }

  function pintarApelidos() {
    const mapa = lerApelidos();
    const pares = [...mapa].flatMap(([slug, l]) => l.map((a) => [slug, a])).sort((a, b) => a[0].localeCompare(b[0]));
    $('nomesApelidosResumo').textContent = t('nomes.apelidos', { n: pares.length });
    $('nomesApelidos').innerHTML = pares.slice(0, 200).map(([slug, a]) => `<li><span><b>${escapar(slug)}</b>: ${escapar(a)}</span>`
      + `<button type="button" class="chip" data-slug="${escapar(slug)}" data-apelido="${escapar(a)}" aria-label="${escapar(t('nomes.tirarApelido', { apelido: a, canal: slug }))}">${escapar(t('nomes.tirar'))}</button></li>`).join('');
    for (const b of $('nomesApelidos').querySelectorAll('button[data-slug]')) {
      b.onclick = () => { mudarApelidos(semApelido(lerApelidos(), b.dataset.slug, b.dataset.apelido)); recasar(); pintar(); };
    }
  }

  const figuraDe = (r) => `<figure>`
    + `<img src="${r.miniatura}" alt="${escapar(t('nomes.recorteAlt', { regiao: t(`nomes.regiao.${r.regiao}`), hora: horaLocal(r.ms) }))}" loading="lazy">`
    + `<figcaption><span class="nota">${escapar(horaLocal(r.ms))}, ${escapar(t(`nomes.regiao.${r.regiao}`))}</span>`
    + `<span class="lido">${r.texto ? escapar(r.texto) : `<i>${escapar(t('nomes.semTexto'))}</i>`}</span></figcaption></figure>`;

  /** Com `soNovos`, durante a leitura, só se acrescentam as miniaturas que chegaram desde a última vez. */
  function pintarRecortes(soNovos = false) {
    $('nomesRecortesCaixa').hidden = !st.recortes.length;
    $('nomesRecortesResumo').textContent = t('nomes.recortes', { n: st.recortes.length });
    const lista = $('nomesRecortes');
    const ja = lista.children.length;
    if (soNovos && ja <= st.recortes.length) lista.insertAdjacentHTML('beforeend', st.recortes.slice(ja).map(figuraDe).join(''));
    else lista.innerHTML = st.recortes.map(figuraDe).join('');
  }

  function pintar() {
    if (!$('nomesTela')) return;
    const e = escolha();
    const lendo = !!st.controlo;
    $('nomesLerTexto').textContent = t(lendo ? 'nomes.parar' : 'nomes.ler');
    $('nomesLer').disabled = !e;
    $('nomesComo').textContent = t('nomes.como', { canal: e?.canal || '' });
    pintarGasto();
    pintarPropostas();
    pintarSoltos();
    pintarRecortes();
    pintarApelidos();
  }

  // A cada quadro lido só muda o que se leu: as propostas, os nomes soltos e as miniaturas novas.
  function pintarLendo() {
    if (!$('nomesTela')) return;
    pintarPropostas();
    pintarSoltos();
    pintarRecortes(true);
  }

  async function ler() {
    if (st.controlo) {
      st.controlo.abort();
      st.controlo = null;
      $('nomesEstado').textContent = t('nomes.parado', { n: st.recortes.length });
      pintar();
      return;
    }
    const e = escolha();
    if (!e) return;
    const quadros = window.__povixQuadros || abrirQuadros;
    if (!podeLer()) { $('nomesEstado').textContent = t('nomes.semLeitor'); return; }
    if (!window.__povixQuadros && !podeVerVideo()) { $('nomesEstado').textContent = t('nomes.semVideo'); return; }
    const vod = vodEm(e.canal, e.ms);
    if (!vod) { $('nomesEstado').textContent = t('nomes.semQuadro', { canal: e.canal }); return; }
    const controlo = new AbortController();
    st.controlo = controlo;
    st.lidos = [];
    st.recortes = [];
    st.lance = `${e.canal}|${e.ms}`;
    // Se o momento mudar a meio (outro lance, o ao vivo), o que se leu já não é dele: pára e esquece.
    const parou = () => {
      if (controlo.signal.aborted) return true;
      const agora = escolha();
      if (agora && `${agora.canal}|${agora.ms}` === st.lance) return false;
      limpar();
      aoMudar();
      return true;
    };
    pintar();
    const seg = Number($('nomesTrecho').value) || 60;
    const qualidade = Number($('nomesQualidade').value) || 1080;
    const instantes = instantesEmVolta(e.ms, { antesMs: (seg * 1000) / 2, depoisMs: (seg * 1000) / 2, passoMs: PASSO_MS });
    let leitor = null;
    let fonte = null;
    let comQuadro = 0;
    try {
      $('nomesEstado').textContent = t('nomes.aCarregar');
      try { leitor = await abrirLeitor(); } catch { $('nomesEstado').textContent = t('nomes.semLeitor'); return; }
      if (parou()) return;
      fonte = await quadros(vod, { buscar, qualidade });
      if (!fonte) throw new Error('sem-fonte');
      for (let i = 0; i < instantes.length; i++) {
        if (parou()) return;
        $('nomesEstado').textContent = t('nomes.aLer', { feitos: i + 1, total: instantes.length });
        const q = await fonte.quadro(instantes[i]);
        if (parou()) return;
        if (!q) continue;
        comQuadro++;
        for (const regiao of REGIOES) {
          const r = recortar(q.tela, regiao, q);
          if (r.fracao < MINIMO_DE_LETRA) continue;
          const lido = await leitor.ler(r.tela);
          if (parou()) return;
          const texto = lido.linhas.map((l) => l.texto).join('\n');
          for (const l of lido.linhas) st.lidos.push({ texto: l.texto, ms: instantes[i], regiao: regiao.id });
          // Só os recortes onde se leu alguma coisa vão para o painel, até ao limite: são esses que quem
          // confere precisa de ver ao lado do texto. A miniatura só se faz para esses.
          if (texto && st.recortes.length < MAXIMO_RECORTES) {
            st.recortes.push({ ms: instantes[i], regiao: regiao.id, miniatura: miniatura(q.tela, regiao, q), texto });
          }
        }
        recasar();
        pintarLendo();
      }
      if (!comQuadro) { $('nomesEstado').textContent = t('nomes.semQuadro', { canal: e.canal }); return; }
      recasar();
      const n = st.resultado.propostas.length;
      $('nomesEstado').textContent = n ? tn(n, 'nomes.fimUm', 'nomes.fimN', { quadros: comQuadro })
        : t('nomes.nada', { quadros: comQuadro });
    } catch (erro) {
      if (erro?.name === 'AbortError' || parou()) return;
      $('nomesEstado').textContent = comQuadro ? t('nomes.erro') : t('nomes.semQuadro', { canal: e.canal });
    } finally {
      fonte?.fechar();
      leitor?.fechar().catch?.(() => {});
      if (st.controlo === controlo) st.controlo = null;
      pintar();
    }
  }

  function ligar() {
    if (!$('nomesTela')) return;
    $('nomesLer').onclick = ler;
    $('nomesTrecho').onchange = pintarGasto;
    $('nomesQualidade').onchange = pintarGasto;
    $('nomesNovoGuardar').onclick = () => {
      // O apelido só sai da caixa quando ficou guardado: recusado, fica lá para corrigir o canal.
      if (guardarUm($('nomesNovoCanal').value, $('nomesNovoApelido').value, 'nomesNovoCanal')) $('nomesNovoApelido').value = '';
    };
    $('nomesTela').addEventListener('toggle', () => { if ($('nomesTela').open) { pintarCanais(); pintar(); } });
  }

  return {
    ligar,
    limpar,
    pintar: () => { pintarCanais(); pintar(); },
    confirmados,
    /** Guardar os apelidos de uma lista colada (só neste aparelho). Devolve quantos novos. */
    guardarDoElenco(mapa) {
      if (!mapa?.size) return 0;
      const antes = lerApelidos();
      const depois = juntarApelidos(antes, mapa);
      const contar = (m) => [...m.values()].reduce((n, l) => n + l.length, 0);
      mudarApelidos(depois);
      return contar(depois) - contar(antes);
    },
  };
}
