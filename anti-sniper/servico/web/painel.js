'use strict';
/** Painel do site. Lê do serviço e se atualiza sozinho. */
const CANAL = new URLSearchParams(location.search).get('canal') || 'c1';
document.getElementById('canal').textContent = CANAL;

const esc = (s) => String(s).replace(/[<>&"]/g,
  (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const hora = (ms) => ms == null ? '—'
  : new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const hhmm = (m) => m == null ? 'tempo desconhecido'
  : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

function cartao(id, valor, velho) {
  const el = document.getElementById(id);
  el.className = 'cartao' + (velho ? ' velho' : '');
  el.querySelector('b').textContent = valor;
}

function desenharAlertas(lista, onde) {
  if (!lista.length) {
    onde.innerHTML = '<div class="vazio">Ninguém no servidor bate com quem assistiu.<br><br>' +
      '<b>Isso não inocenta</b> — a pessoa pode usar nome diferente nos dois lados.</div>';
    return;
  }
  onde.innerHTML = lista.map((a) => `<div class="alerta">
      <div class="par">${esc(a.jogador)} <span style="color:#6f7a84">↔</span> ${esc(a.espectador)}</div>
      <div class="det"><span class="pc">${Math.round(a.confianca * 100)}%</span>
        · ${esc(a.motivo)} · assistiu <b>${hhmm(a.minutosAssistidos)}</b>${
          a.minutosNoServidor != null ? ` · ${a.minutosNoServidor} min no servidor` : ''}</div>
    </div>`).join('');
}

/**
 * Nos dois AO MESMO TEMPO. É a linha que merece destaque.
 *
 * Cruza só os nomes de AGORA, sem histórico — histórico é uma ida à rede
 * por pessoa, e com 1.500 jogadores seriam ~18 min por leitura. Por isso a
 * lista aqui é uma pista, e o log completo vem ao clicar.
 */
function desenharDois(lista, onde) {
  document.getElementById('qtd-dois').textContent = lista.length ? `· ${lista.length}` : '';
  if (!lista.length) {
    onde.innerHTML = '<div class="vazio">Ninguém no servidor bate, <b>pelo nome de agora</b>, '
      + 'com quem está na live.<br><br>Isso <b>não inocenta</b>: aqui eu comparo só o nome atual. '
      + 'Para conferir todos os nomes antigos de alguém, procure a pessoa acima.</div>';
    return;
  }
  onde.innerHTML = lista.map((a) => `<div class="dois" data-nome="${esc(a.espectador)}">
      <div class="par">${esc(a.jogador)} <span style="color:#6f7a84">↔</span> ${esc(a.espectador)}
        <span class="pc">${Math.round(a.confianca * 100)}%</span></div>
      <div class="det">na live desde <b>${hora(a.naLiveDesde)}</b> (${a.naLiveMinutos} min,
        <span class="${a.caladaHa <= 2 ? 'agora' : ''}">${a.caladaHa <= 2 ? 'falando agora' : `calado há ${a.caladaHa} min`}</span>)
        · no servidor desde <b>${hora(a.noServidorDesde)}</b> (${a.noServidorMinutos} min)</div>
    </div>`).join('');
  for (const b of onde.querySelectorAll('.dois')) b.onclick = () => abrirLog(b.dataset.nome);
}

/** Quem está na live agora — a resposta que a página dá sem ninguém perguntar. */
function desenharAgora(lista, onde) {
  document.getElementById('qtd-agora').textContent = lista.length ? `· ${lista.length}` : '';
  if (!lista.length) {
    onde.innerHTML = '<div class="vazio">Ninguém escreveu no chat nos últimos 15 min.</div>';
    return;
  }
  onde.innerHTML = `<div class="pessoas">${lista.map((p) => `
    <button class="pessoa" data-nome="${esc(p.nome)}">
      <b>${esc(p.nome)}${p.fonte === 'tempo' ? '<span class="selo tempo">calado</span>'
        : p.fonte === 'ambos' ? '<span class="selo">msg + tempo</span>'
        : '<span class="selo">falou</span>'}</b>
      <span>desde ${hora(p.desde)} · ${p.minutos} min</span><br>
      <span class="${p.calada <= 2 ? 'viva' : ''}">${
        p.calada <= 2 ? 'falando agora' : `calado há ${p.calada} min`}</span>
    </button>`).join('')}</div>`;
  for (const b of onde.querySelectorAll('.pessoa')) b.onclick = () => abrirLog(b.dataset.nome);
}

/** O log completo: abriu, fechou, abriu de novo, fechou. */
async function abrirLog(nome) {
  const onde = document.getElementById('resultado');
  onde.innerHTML = '<div class="vazio">carregando log…</div>';
  onde.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const d = await (await fetch(`/api/log?canal=${encodeURIComponent(CANAL)}&nome=${encodeURIComponent(nome)}`)).json();
    onde.innerHTML = desenharLog(d);
    onde.querySelector('.fechar').onclick = () => { onde.innerHTML = ''; };
  } catch { onde.innerHTML = '<div class="vazio">falhou ao carregar o log</div>'; }
}

/** O que sustenta aquele intervalo. Ver "8 msg" ou "6× tempo assistido"
 *  muda o quanto se confia na linha — e a segunda pega quem nunca fala. */
function rotuloFonte(l) {
  if (l.onde === 'servidor') return `${l.amostras} leituras`;
  if (l.fonte === 'tempo') return `${l.amostras}× tempo assistido`;
  if (l.fonte === 'ambos') return `${l.amostras} sinais (msg + tempo)`;
  return `${l.amostras} msg`;
}

function desenharLog(d) {
  if (!d.total) {
    return `<div class="log"><button class="fechar">×</button><h3>${esc(d.nome)}</h3>
      <div class="resumo">Nenhum registro. Isso <b>não inocenta</b> — quem assiste calado não aparece.</div></div>`;
  }
  const linhas = d.linhas.map((l) => `<tr>
      <td class="onde ${l.onde}">${l.onde === 'live' ? '● live' : '● servidor'}</td>
      <td>${hora(l.de)} <span class="seta">→</span> ${hora(l.ate)}</td>
      <td class="dur">${l.minutos} min</td>
      <td class="dur">${rotuloFonte(l)}</td>
    </tr>`).join('');
  return `<div class="log"><button class="fechar">×</button>
    <h3>${esc(d.nome)}</h3>
    <div class="resumo">${d.total} entradas · <b>${hhmm(d.minutosNaLive)}</b> na live ·
      <b>${hhmm(d.minutosNoServidor)}</b> no servidor · horários em ${esc(d.fuso)}</div>
    <table>${linhas}</table></div>`;
}

async function atualizar() {
  try {
    const [r, ra] = await Promise.all([
      fetch(`/api/alertas?canal=${encodeURIComponent(CANAL)}`),
      fetch(`/api/agora?canal=${encodeURIComponent(CANAL)}`),
    ]);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const da = await ra.json();
    desenharAgora(da.naLive || [], document.getElementById('agora'));
    desenharDois(da.nosDois || [], document.getElementById('nosdois'));
    const cob = document.getElementById('cobertura');
    // A frase dele, que muda o produto inteiro: "nenhum stream sniper fala
    // no chat". Deixar isso implícito seria vender cegueira como cobertura.
    if (da.coleta?.ligada) {
      cob.className = 'cobertura';
      cob.innerHTML = 'Contando <b>quem assiste calado</b> pelo tempo assistido do StreamElements'
        + ` (<code>${esc(da.coleta.fonte)}</code>). Quem só aparece por mensagem vem marcado.`
        + '<br>Ainda invisível: quem assiste <b>deslogado</b>. Isso nenhuma fonte vê.';
    } else {
      cob.className = 'cobertura cego';
      cob.innerHTML = '<b>Atenção:</b> aqui só aparece quem <b>escreveu</b> no chat — '
        + 'e sniper normalmente não escreve.<br>Para enxergar quem assiste calado, '
        + 'ligue a Fidelidade no StreamElements e conecte o canal.';
    }
    document.getElementById('ponto').className = 'ponto vivo';
    document.getElementById('estado').textContent = 'ao vivo';
    cartao('c-servidor', d.noServidor ?? '—', d.servidorVelho);
    cartao('c-audiencia', d.audiencia ?? '—');
    cartao('c-alertas', d.alertas.length);
    desenharAlertas(d.alertas, document.getElementById('alertas'));
  } catch {
    document.getElementById('ponto').className = 'ponto';
    document.getElementById('estado').textContent = 'sem conexão com o serviço';
  }
}

document.getElementById('ir').onclick = async () => {
  const q = document.getElementById('nome').value.trim();
  const onde = document.getElementById('resultado');
  if (!q) { onde.innerHTML = ''; return; }
  onde.innerHTML = '<div class="vazio">procurando…</div>';
  // Manda o instante ABSOLUTO, não "22:47": o navegador sabe o fuso de quem
  // está olhando, e o serviço não precisa adivinhar. Fuso errado aqui vira
  // duas horas de diferença e uma resposta trocada.
  let quando = '';
  const t = document.getElementById('quando').value.trim();
  if (t) {
    const rl = t.match(/^(\d{1,2})\s*[:h.]?\s*(\d{2})$/);
    if (rl) {
      const d = new Date();
      d.setHours(Number(rl[1]), Number(rl[2]), 0, 0);
      if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);  // live que virou a noite
      quando = String(d.getTime());
    } else { quando = t; }
  }
  try {
    const r = await fetch(`/api/procurar?canal=${encodeURIComponent(CANAL)}`
      + `&q=${encodeURIComponent(q)}${quando ? `&quando=${encodeURIComponent(quando)}` : ''}`);
    const d = await r.json();
    if (d.erro) { onde.innerHTML = `<div class="vazio">${esc(d.erro)}</div>`; return; }
    desenharBusca(d, onde);
  } catch { onde.innerHTML = '<div class="vazio">falhou ao consultar</div>'; }
};

for (const b of document.querySelectorAll('.atalhos button')) {
  b.onclick = () => {
    const d = new Date(Date.now() - Number(b.dataset.min) * 60000);
    document.getElementById('quando').value =
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    document.getElementById('ir').click();
  };
}

/** O veredito do instante: estava, ou não estava, naquele minuto. */
function desenharMomento(d) {
  if (d.quando == null) return '';
  const m = (d.evidencias || []).map((e) => e.momento).find(Boolean);
  const h = hora(d.quando);
  const srv = d.noServidor;
  const noServidor = srv?.estado === 'sim'
    ? `<div class="obs">E estava <b>no servidor</b> das ${hora(srv.estada.de)} às ${hora(srv.estada.ate)}.</div>` : '';

  let classe = ''; let texto;
  if (!m || m.estado === 'sem-registro') {
    texto = `<b>Às ${h}: sem registro dela na live.</b>`;
  } else if (m.estado === 'sim') {
    classe = ' sim';
    texto = `<b>Às ${h}: ESTAVA na sua live</b> — visto das ${hora(m.estada.de)} às ${hora(m.estada.ate)}.`;
  } else if (m.estado === 'provavel') {
    classe = ' provavel';
    const b = m.antes && m.antes.ate < d.quando ? m.antes : m.depois;
    texto = `<b>Às ${h}: provável</b> — visto ${m.minutosDaBorda} min ${m.antes === b ? 'antes' : 'depois'}`
      + ` (${hora(b.de)}–${hora(b.ate)}).`;
  } else {
    texto = `<b>Às ${h}: não visto na live nesse horário.</b>`
      + (m.minutosDaBorda != null ? ` A vez mais próxima foi ${m.minutosDaBorda} min de distância.` : '');
  }
  const naLive = (d.evidencias || []).flatMap((e) => e.naLive || []);
  return `<div class="veredito${classe}">${texto}${noServidor}
    <div class="obs">Quem assiste calado não gera mensagem — <b>ausência aqui não é prova de ausência</b>.</div>
    ${fita(naLive, srv?.estadas || [], d.quando)}</div>`;
}

/** Duas trilhas na mesma escala: na live, e no servidor. */
function fita(naLive, noServidor, quandoMs) {
  const todos = [...naLive, ...noServidor];
  if (!todos.length) return '';
  let de = Math.min(...todos.map((e) => e.de), quandoMs);
  let ate = Math.max(...todos.map((e) => e.ate), quandoMs);
  const folga = Math.max((ate - de) * 0.06, 5 * 60000);
  de -= folga; ate += folga;
  const pos = (t) => ((t - de) / (ate - de)) * 100;
  const trilha = (lista, cls) => lista.length ? `<div class="trilho ${cls}">${
    lista.map((e) => `<i style="left:${pos(e.de)}%;width:${Math.max(pos(e.ate) - pos(e.de), 0.8)}%"></i>`).join('')
  }<div class="marca" style="left:${pos(quandoMs)}%"></div></div>` : '';
  return `<div class="fita">
    ${naLive.length ? `<div class="rot">na sua live</div>${trilha(naLive, '')}` : ''}
    ${noServidor.length ? `<div class="rot">no servidor</div>${trilha(noServidor, 'srv')}` : ''}
    <div class="reguas"><span>${hora(de)}</span><span>↑ ${hora(quandoMs)}</span><span>${hora(ate)}</span></div>
  </div>`;
}

function desenharBusca(d, onde) {
  let topo = '';
  if (d.tipo === 'steamid') {
    // Mostrar QUAIS nomes foram conferidos é o que separa "não achei" de
    // "não olhei". Sem essa lista, as duas coisas ficam com a mesma cara.
    const bateram = new Set((d.evidencias || []).map((e) => e.nomeSteamQueBateu));
    const fichas = (d.historico || []).map((n) =>
      `<i class="${bateram.has(n) ? 'bateu' : ''}">${esc(n)}</i>`).join('');
    topo = `<div class="cabeca">
      <div class="quem">${esc(d.jogador)}</div>
      <div class="sub">SteamID ${esc(d.steamId)} · ${(d.historico || []).length} nomes conferidos</div>
      ${fichas ? `<div class="nomes">${fichas}</div>` : ''}
    </div>`;
    if (d.conclusao === 'inconclusivo') {
      onde.innerHTML = topo + `<div class="vazio">⚪ ${esc(d.motivo)}</div>`;
      return;
    }
  }
  const lista = (d.evidencias || []).map((e) => ({
    ...e,
    jogador: e.nomeSteamQueBateu ? `${d.jogador} (como "${e.nomeSteamQueBateu}")` : d.jogador,
  }));
  const alvo = document.createElement('div');
  desenharAlertas(lista, alvo);
  onde.innerHTML = topo + desenharMomento(d) + alvo.innerHTML;
}

for (const id of ['nome', 'quando']) {
  document.getElementById(id).addEventListener('keydown',
    (e) => { if (e.key === 'Enter') document.getElementById('ir').click(); });
}

atualizar();
setInterval(atualizar, 15000);
