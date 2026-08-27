const AGORA = Date.now();
const M = 60000;
const EX = exemplo(AGORA);

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

/* A ORDEM é a coisa: primeiro quem ele perguntou, depois o resto.
   Ele foi explícito — "pode ter red flag de outros caras, porém o foco tem
   que ser os que eu estou pesquisando primeiro". Uma lista geral no topo
   enterra a pergunta que ele veio fazer. */
function procurar() {
  const q = document.getElementById('q').value.trim();
  const onde = document.getElementById('alvo');
  if (!q) { onde.innerHTML = ''; return; }
  const achou = Object.keys(EX.naLive).find((n) => n.toLowerCase() === q.toLowerCase());
  if (!achou) {
    onde.innerHTML = `<div class="vazio">Sem registro de <b>${esc(q)}</b> na sua live.<br>
      Isso <b>não inocenta</b>: pode ter assistido deslogado, ou com outro nome.</div>`;
    return;
  }
  onde.innerHTML = cartao(achou, true);
  ligarFechar('alvo');
}

/* Red flags: os que ele NÃO perguntou, e que estão nos dois. */
function desenharLista() {
  const nomes = Object.keys(EX.naLive).filter((n) => (EX.noServidor[n] || []).length);
  document.getElementById('q-flags').textContent = nomes.length ? `· ${nomes.length}` : '';
  document.getElementById('flags').innerHTML = nomes.map((n) => {
    const f = EX.naLive[n];
    const srv = EX.noServidor[n] || [];
    const total = Math.round(f.reduce((a, x) => a + (x.ate - x.de) / M, 0));
    return `<button class="linha" type="button" data-n="${esc(n)}">
      <span class="nome">${esc(n)}</span>
      <span class="resumo mono">${f.length} ${f.length > 1 ? 'vezes' : 'vez'} · ${total} min</span>
      <span class="tag">${srv.length ? 'também no servidor' : 'só na live'}</span>
    </button>`;
  }).join('');
  for (const b of document.querySelectorAll('.linha')) b.onclick = () => abrir(b.dataset.n);
}

function abrir(n) {
  document.getElementById('detalhe').innerHTML = cartao(n, false);
  ligarFechar('detalhe');
  document.getElementById('detalhe').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ligarFechar(id) {
  const el = document.getElementById(id).querySelector('.fechar');
  if (el) el.onclick = () => { document.getElementById(id).innerHTML = ''; };
}

function cartao(n, alvo) {
  const f = [...EX.naLive[n]].sort((a, b) => a.de - b.de);
  const srv = [...(EX.noServidor[n] || [])].sort((a, b) => a.de - b.de);
  const morte = EX.morte;

  const linha = (x, cls) => {
    const dentro = morte >= x.de && morte <= x.ate;
    return `<tr class="${cls}${dentro ? ' marcada' : ''}">
      <td class="mono e">entrou ${hora(x.de)}</td>
      <td class="mono s">saiu ${hora(x.ate)}</td>
      <td class="mono d">${Math.round((x.ate - x.de) / M)} min</td>
      <td class="obs">${dentro ? '← você morreu aqui' : ''}</td>
    </tr>`;
  };

  const naHora = f.some((x) => morte >= x.de && morte <= x.ate);
  const srvNaHora = srv.some((x) => morte >= x.de && morte <= x.ate);

  return `
    <div class="cartao${alvo ? ' alvo' : ''}">
      <button class="fechar" type="button">&times;</button>
      <h3>${esc(n)}</h3>

      <div class="bloco">
        <div class="rot">na sua live</div>
        <table><tbody>${f.map((x) => linha(x, 'live')).join('')}</tbody></table>
      </div>

      ${srv.length ? `<div class="bloco">
        <div class="rot">no servidor de Rust</div>
        <table><tbody>${srv.map((x) => linha(x, 'srv')).join('')}</tbody></table>
      </div>` : ''}

      <div class="veredito ${naHora && srvNaHora ? 'sim' : naHora ? 'meio' : ''}">
        ${naHora && srvNaHora
          ? `<b>Às ${hora(morte)} estava nos dois ao mesmo tempo.</b>`
          : naHora
            ? `<b>Às ${hora(morte)} estava na sua live</b>, mas não apareceu no servidor.`
            : `<b>Às ${hora(morte)} não estava na sua live.</b>`}
        <div class="obs2">Quem assiste calado não gera mensagem — não aparecer aqui
          <b>não é prova de que não estava</b>.</div>
      </div>
    </div>`;
}

const raiz = document.documentElement;
document.getElementById('tema').onclick = () => {
  const escuro = raiz.dataset.theme
    ? raiz.dataset.theme === 'dark'
    : !window.matchMedia('(prefers-color-scheme: light)').matches;
  raiz.dataset.theme = escuro ? 'light' : 'dark';
};

document.getElementById('atalhos').innerHTML = Object.keys(EX.naLive)
  .map((n) => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('');
for (const b of document.querySelectorAll('.atalhos button')) {
  b.onclick = () => { document.getElementById('q').value = b.dataset.n; procurar(); };
}
document.getElementById('ir').onclick = procurar;
document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') procurar(); });

desenharLista();
