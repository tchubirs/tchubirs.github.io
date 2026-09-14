'use strict';
//
// A página estática. Gerada por um trabalho do GitHub Actions e servida pelo
// GitHub Pages — não há servidor para manter nem conta para pagar.
//
// Porquê estática e não uma página que consulta as APIs sozinha: um site no
// GitHub Pages a chamar o DexScreener do browser bate em CORS e em limites por
// visitante. Gerar de fora e servir o resultado é mais rápido para quem abre e
// não parte quando duas pessoas abrem ao mesmo tempo.
//

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dinheiro = (n) => (n == null ? '—'
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${n.toFixed(n < 10 ? 2 : 0)}`);

/**
 * A frase da base do mercado, a partir do resultado do estudo.
 *
 * O estudo é o contexto que falta a qualquer peneira: saber que ESTE token tem
 * armadilhas não diz nada sobre o que acontece ao token típico. Sem isto, um
 * `PASSA` lê-se como "então compra" — que é exactamente o que não é.
 *
 * Devolve `null` se ainda não houver estudo. A página nunca pode partir por
 * causa de um ficheiro que ainda não existe.
 */
function baseDoMercado(r) {
  if (!r || !Number.isFinite(r.medidos) || r.medidos < 1) return null;
  const pct = (n) => `${Math.round((n / r.medidos) * 100)}%`;
  const partes = [
    `${r.medidos} tokens seguidos desde o primeiro minuto`,
    `${pct(r.abaixoDaEntrada)} ficaram abaixo do preço de entrada`,
    `${pct(r.perdeu90ouMais)} perderam 90% ou mais`,
  ];
  if (Number.isFinite(r.dobrou)) partes.push(`${pct(r.dobrou)} dobraram`);
  if (Number.isFinite(r.retornoMedio)) {
    const m = r.retornoMedio;
    partes.push(`quem comprasse todos em partes iguais ficaria com ${m.toFixed(2)}x `
      + `(${m >= 1 ? '+' : ''}${((m - 1) * 100).toFixed(0)}%)`);
  }
  return partes.join(', ') + '.';
}

function cartao({ f, j }) {
  return `
  <article class="t ${j.veredicto.toLowerCase()}">
    <header>
      <span class="v">${esc(j.veredicto)}</span>
      <h2>${esc(f.simbolo || '?')}<small>${esc(f.nome || '')}</small></h2>
    </header>
    <dl>
      <div><dt>Liquidez</dt><dd>${dinheiro(f.liquidezUsd)}</dd></div>
      <div><dt>Volume 1h</dt><dd>${dinheiro(f.vol1h)}</dd></div>
      <div><dt>Idade</dt><dd>${f.idadeMin == null ? '—' : Math.round(f.idadeMin) + ' min'}</dd></div>
      <div><dt>Mint auth.</dt><dd>${f.mintAuthority ? 'ACTIVA' : 'queimada'}</dd></div>
      <div><dt>Freeze auth.</dt><dd>${f.freezeAuthority ? 'ACTIVA' : 'queimada'}</dd></div>
    </dl>
    ${j.porque.length ? `<ul>${j.porque.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${j.aviso ? `<p class="nota">${esc(j.aviso)}</p>` : ''}
    ${f.url ? `<a href="${esc(f.url)}" rel="noopener">ver no DexScreener →</a>` : ''}
  </article>`;
}

function pagina(linhas, { quando = new Date(), base = null } = {}) {
  const ordem = { FOGE: 0, CUIDADO: 1, PASSA: 2 };
  const ord = [...linhas].sort((a, b) => ordem[a.j.veredicto] - ordem[b.j.veredicto]);
  const conta = (v) => ord.filter((x) => x.j.veredicto === v).length;

  return `<!doctype html>
<html lang="pt"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Peneira — tokens novos da Solana</title>
<style>
:root{
  --tinta:#14161a; --fundo:#f6f5f2; --caixa:#fff; --fio:#e2e0da; --fraco:#6b6862;
  --bom:#1f7a4d; --meio:#a86a12; --mau:#b3261e;
}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){
  --tinta:#e9e7e2; --fundo:#131417; --caixa:#1b1d21; --fio:#2c2f35; --fraco:#9a968e;
  --bom:#4ade80; --meio:#fbbf24; --mau:#f87171;
}}
*{box-sizing:border-box}
body{margin:0;padding-block:28px;padding-inline:16px;background:var(--fundo);color:var(--tinta);
 font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto}
h1{font-size:1.6rem;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--fraco);margin:0 0 20px;font-size:.92rem}
.resumo{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 22px}
.resumo b{padding:6px 12px;border-radius:999px;border:1px solid var(--fio);background:var(--caixa);
 font-weight:600;font-size:.85rem}
.t{background:var(--caixa);border:1px solid var(--fio);border-radius:12px;padding:16px;margin-bottom:12px}
.t header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.t h2{font-size:1.05rem;margin:0;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.t h2 small{font-weight:400;color:var(--fraco);font-size:.85rem}
.v{font-size:.72rem;font-weight:700;letter-spacing:.08em;padding:3px 9px;border-radius:5px;color:#fff}
.foge .v{background:var(--mau)} .cuidado .v{background:var(--meio)} .passa .v{background:var(--bom)}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;margin:14px 0 0}
dl div{min-width:0} dt{font-size:.7rem;color:var(--fraco);text-transform:uppercase;letter-spacing:.05em}
dd{margin:2px 0 0;font-variant-numeric:tabular-nums;font-weight:600;font-size:.95rem}
ul{margin:12px 0 0;padding-left:18px;font-size:.9rem} li{margin:3px 0}
.nota{font-size:.82rem;color:var(--fraco);margin:10px 0 0;font-style:italic}
.t a{display:inline-block;margin-top:10px;font-size:.85rem;color:inherit}
footer{margin-top:28px;padding-top:16px;border-top:1px solid var(--fio);color:var(--fraco);font-size:.82rem}
footer p{margin:0 0 8px}
</style></head><body><main>
<h1>Peneira</h1>
<p class="sub">Tokens acabados de nascer na Solana, passados pelas armadilhas que dá para medir.
Actualizado <time datetime="${quando.toISOString()}">${quando.toISOString().replace('T', ' ').slice(0, 16)} UTC</time>.</p>
<div class="resumo">
  <b>${ord.length} vistos</b>
  <b style="color:var(--mau)">${conta('FOGE')} foge</b>
  <b style="color:var(--meio)">${conta('CUIDADO')} cuidado</b>
  <b style="color:var(--bom)">${conta('PASSA')} passa</b>
</div>
${ord.map(cartao).join('')}
${base ? `<footer><p><strong>A base do mercado, medida:</strong> ${esc(base)}</p></footer>` : ''}
<footer>
<p><strong>PASSA não quer dizer bom.</strong> Quer dizer que não encontrei nenhuma das
armadilhas que sei procurar. Não é conselho de compra, e eu não recebo nada se comprares.</p>
<p>A concentração de carteiras <strong>não</strong> é medida: os três RPC públicos da Solana
recusam <code>getTokenLargestAccounts</code> sem chave paga (403, 400 e 429). Um token pode
passar aqui e ter 90% da oferta numa carteira só.</p>
</footer>
</main></body></html>`;
}

module.exports = { pagina, cartao, dinheiro, esc, baseDoMercado };
