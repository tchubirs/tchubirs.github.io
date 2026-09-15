'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ordenar } = require('./julgar.js');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dinheiro = (n) => (!n ? '$0'
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${n.toFixed(0)}`);

const pct = (f) => (f == null ? '—' : `${(f * 100).toFixed(1)}%`);

const ICONE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
  + '<rect width="32" height="32" rx="7" fill="#14161a"/>'
  + '<circle cx="16" cy="14" r="7" fill="none" stroke="#4ade80" stroke-width="2.4"/>'
  + '<path d="M11 22l-2 7 7-3 7 3-2-7" fill="none" stroke="#fbbf24" stroke-width="2.4" '
  + 'stroke-linejoin="round"/></svg>');

function cartao({ c, j }) {
  return `
  <article class="t ${j.veredicto.toLowerCase()}">
    <header>
      <span class="v">${esc(j.veredicto)}</span>
      <h2>${esc(c.titulo)}</h2>
    </header>
    <p class="org">${esc(c.organizacao || '')}${c.prazoTexto ? ` · ${esc(c.prazoTexto)}` : ''}</p>
    <dl>
      <div><dt>Hipótese</dt><dd>${pct(j.hipotese)}</dd></div>
      <div><dt>Prémio</dt><dd>${dinheiro(c.premioTotal)}</dd></div>
      <div><dt>Prémios em dinheiro</dt><dd>${c.premiosEmDinheiro || '—'}</dd></div>
      <div><dt>Inscritos</dt><dd>${c.inscritos ? c.inscritos.toLocaleString('pt-PT') : '—'}</dd></div>
      <div><dt>Por inscrito</dt><dd>${j.porInscrito == null ? '—' : dinheiro(j.porInscrito)}</dd></div>
    </dl>
    ${j.porque.length ? `<ul>${j.porque.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${j.aviso ? `<p class="nota">${esc(j.aviso)}</p>` : ''}
    ${c.url ? `<a href="${esc(c.url)}" rel="noopener" target="_blank">abrir no Devpost →</a>` : ''}
  </article>`;
}

function pagina(linhas, { quando = new Date(), mostrarFora = false } = {}) {
  const todos = ordenar(linhas);
  const ord = mostrarFora ? todos : todos.filter((x) => x.j.veredicto !== 'FORA');
  const conta = (v) => todos.filter((x) => x.j.veredicto === v).length;

  return `<!doctype html>
<html lang="pt"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="${ICONE}">
<meta name="theme-color" content="#14161a">
<title>Radar de prémios</title>
<style>
:root{--tinta:#14161a;--fundo:#f6f5f2;--caixa:#fff;--fio:#e2e0da;--fraco:#6b6862;
 --bom:#1f7a4d;--meio:#a86a12;--mau:#b3261e}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){
 --tinta:#e9e7e2;--fundo:#131417;--caixa:#1b1d21;--fio:#2c2f35;--fraco:#9a968e;
 --bom:#4ade80;--meio:#fbbf24;--mau:#f87171}}
*{box-sizing:border-box}
body{margin:0;padding-block:28px;padding-inline:16px;background:var(--fundo);color:var(--tinta);
 font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:780px;margin:0 auto}
h1{font-size:1.6rem;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--fraco);margin:0 0 18px;font-size:.92rem}
.idade{margin:0 0 20px;font-size:.85rem;padding:8px 12px;border-radius:8px;
 border:1px solid var(--fio);background:var(--caixa)}
.idade.velha{border-color:var(--meio);color:var(--meio);font-weight:600}
.resumo{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 22px}
.resumo b{padding:6px 12px;border-radius:999px;border:1px solid var(--fio);background:var(--caixa);
 font-weight:600;font-size:.85rem}
.t{background:var(--caixa);border:1px solid var(--fio);border-radius:12px;padding:16px;margin-bottom:12px}
.t header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.t h2{font-size:1.05rem;margin:0;flex:1;min-width:0}
.org{color:var(--fraco);font-size:.85rem;margin:6px 0 0}
.v{font-size:.72rem;font-weight:700;letter-spacing:.08em;padding:3px 9px;border-radius:5px;color:#fff}
.vale .v{background:var(--bom)} .fraco .v{background:var(--meio)}
.tarde .v{background:var(--meio)} .fora .v{background:var(--mau)}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px;margin:14px 0 0}
dl div{min-width:0}
dt{font-size:.7rem;color:var(--fraco);text-transform:uppercase;letter-spacing:.05em}
dd{margin:2px 0 0;font-variant-numeric:tabular-nums;font-weight:600;font-size:.95rem}
ul{margin:12px 0 0;padding-left:18px;font-size:.9rem}li{margin:3px 0}
.nota{font-size:.82rem;color:var(--fraco);margin:10px 0 0;font-style:italic}
.t a{display:inline-block;margin-top:10px;font-size:.85rem;color:inherit}
footer{margin-top:28px;padding-top:16px;border-top:1px solid var(--fio);color:var(--fraco);font-size:.82rem}
footer p{margin:0 0 8px}
</style></head><body><main>
<h1>Radar de prémios</h1>
<p class="sub">Concursos abertos onde há dinheiro a sério, ordenados pela <strong>hipótese de
receber alguma coisa</strong> — não pelo tamanho do prémio.
Lido <time id="quando" datetime="${quando.toISOString()}">${quando.toISOString().replace('T', ' ').slice(0, 16)} UTC</time>.</p>
<p class="idade" id="idade" hidden></p>
<div class="resumo">
  <b>${todos.length} lidos</b>
  <b style="color:var(--bom)">${conta('VALE')} valem</b>
  <b style="color:var(--meio)">${conta('FRACO')} fracos</b>
  <b style="color:var(--meio)">${conta('TARDE')} tarde</b>
  <b style="color:var(--mau)">${conta('FORA')} fora</b>
</div>
<div id="cartoes">${ord.map(cartao).join('')}</div>
<footer>
<p><strong>A hipótese é prémios em dinheiro ÷ inscritos.</strong> É a pergunta certa para quem
precisa de UM pagamento: $50.000 com um só vencedor entre 3.000 pessoas é lotaria;
$400 repartidos por 3 prémios entre 234 pessoas não é.</p>
<p><strong>O que elimina, e porquê.</strong> Presencial (ele está em França), só por convite,
prémio de $0, ou prémio sem nada em dinheiro. Na amostra de 15/09/2026, <strong>21 de 49
concursos abertos não tinham dinheiro nenhum</strong> e 9 eram presenciais.</p>
<p><strong>O que NÃO é medido:</strong> as regras de elegibilidade de cada concurso. Muitos
limitam a um país, a estudantes, ou proíbem submissão gerada por IA — e isso só está na
página de cada um. <strong>Ler as regras antes de gastar tempo a construir.</strong></p>
<p>VALE não quer dizer que ganhas. Quer dizer que passa nos filtros e que a hipótese não é de rifa.</p>
</footer>
</main>
<script>
(function () {
  var t = document.getElementById('quando'), alvo = document.getElementById('idade');
  if (!t || !alvo) return;
  var ms = Date.now() - Date.parse(t.getAttribute('datetime'));
  if (!isFinite(ms)) return;
  var h = Math.max(0, Math.round(ms / 3600000));
  alvo.textContent = h < 1 ? 'Lido agora mesmo.'
    : h > 48 ? 'Esta leitura tem ' + Math.floor(h / 24) + ' dias. Prazos fecham — confirma no Devpost antes de contar com algum.'
    : 'Lido há ' + h + 'h.';
  if (h > 48) alvo.className = 'idade velha';
  alvo.hidden = false;
})();
</script>
</body></html>`;
}

module.exports = { pagina, cartao, dinheiro, pct, esc, ICONE };
