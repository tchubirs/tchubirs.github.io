'use strict';
/** Painel do site. Lê do serviço e se atualiza sozinho. */
const CANAL = new URLSearchParams(location.search).get('canal') || 'c1';
document.getElementById('canal').textContent = CANAL;

const esc = (s) => String(s).replace(/[<>&"]/g,
  (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
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

async function atualizar() {
  try {
    const r = await fetch(`/api/alertas?canal=${encodeURIComponent(CANAL)}`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
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

const hora = (ms) => ms == null ? '—'
  : new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
