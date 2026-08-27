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

document.getElementById('ir').onclick = async () => {
  const q = document.getElementById('nome').value.trim();
  const onde = document.getElementById('resultado');
  if (!q) { onde.innerHTML = ''; return; }
  onde.innerHTML = '<div class="vazio">procurando…</div>';
  try {
    const r = await fetch(`/api/procurar?canal=${encodeURIComponent(CANAL)}&q=${encodeURIComponent(q)}`);
    const d = await r.json();
    desenharBusca(d, onde);
  } catch { onde.innerHTML = '<div class="vazio">falhou ao consultar</div>'; }
};

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
  onde.innerHTML = topo + alvo.innerHTML;
}

document.getElementById('nome').addEventListener('keydown',
  (e) => { if (e.key === 'Enter') document.getElementById('ir').click(); });

atualizar();
setInterval(atualizar, 15000);
