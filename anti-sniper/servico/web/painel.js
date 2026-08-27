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
  const nome = document.getElementById('nome').value.trim();
  const onde = document.getElementById('resultado');
  if (!nome) { onde.innerHTML = ''; return; }
  onde.innerHTML = '<div class="vazio">procurando…</div>';
  try {
    const r = await fetch(`/api/consultar?canal=${encodeURIComponent(CANAL)}&nome=${encodeURIComponent(nome)}`);
    const d = await r.json();
    desenharAlertas(d.evidencias.map((e) => ({ ...e, jogador: d.jogador })), onde);
  } catch { onde.innerHTML = '<div class="vazio">falhou ao consultar</div>'; }
};
document.getElementById('nome').addEventListener('keydown',
  (e) => { if (e.key === 'Enter') document.getElementById('ir').click(); });

atualizar();
setInterval(atualizar, 15000);
