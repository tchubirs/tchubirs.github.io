'use strict';
//
// O desenho de um cartão. Puro de propósito, sem nada do Node: este mesmo
// ficheiro é embutido na página e corre no browser para redesenhar os cartões
// com dados frescos.
//
// Uma segunda cópia deste código no `<script>` da página seria a maneira mais
// rápida de a página e a linha de comandos passarem a discordar uma da outra.
//
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dinheiro = (n) => (n == null ? '—'
  : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${n.toFixed(n < 10 ? 2 : 0)}`);

const fraccao = (f) => (f == null ? '—'
  : `${(f * 100).toFixed(f < 0.01 ? 3 : 1)}%`);

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
      <div><dt>Na piscina</dt><dd>${fraccao(f.fraccaoNaPiscina)}</dd></div>
      <div><dt>Mint auth.</dt><dd>${f.mintAuthority ? 'ACTIVA' : 'queimada'}</dd></div>
      <div><dt>Freeze auth.</dt><dd>${f.freezeAuthority ? 'ACTIVA' : 'queimada'}</dd></div>
    </dl>
    ${j.porque.length ? `<ul>${j.porque.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${j.aviso ? `<p class="nota">${esc(j.aviso)}</p>` : ''}
    ${f.url ? `<a href="${esc(f.url)}" rel="noopener" target="_blank">ver no DexScreener →</a>` : ''}
  </article>`;
}

/**
 * JSON seguro para pôr dentro de um <script>.
 *
 * JSON.stringify escapa aspas mas NAO escapa o sinal de menor. O nome de um
 * token e texto escolhido por quem lancou a moeda: basta chamar-lhe algo que
 * feche esta etiqueta de script e abra uma imagem com onerror, e corre o que
 * quiser na pagina de quem a abre. Os separadores U+2028/2029 tambem entram,
 * porque sao quebras de linha para o JavaScript e nao para o JSON.
 *
 * Este comentario esta sem acentos e sem o exemplo literal de proposito: a
 * primeira versao dele TRAZIA o ataque escrito por extenso, e como este
 * ficheiro e embutido na pagina, o comentario que explicava a fuga fazia-a.
 */
const jsonSeguro = (v) => JSON.stringify(v)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Os cartões pela ordem em que devem ser lidos: o perigoso primeiro. */
const ORDEM = { FOGE: 0, CUIDADO: 1, PASSA: 2 };
const ordenar = (linhas) => [...linhas].sort((a, b) =>
  (ORDEM[a.j.veredicto] ?? 9) - (ORDEM[b.j.veredicto] ?? 9));

if (typeof module !== 'undefined') module.exports = { esc, dinheiro, fraccao, cartao, ordenar, ORDEM, jsonSeguro };
