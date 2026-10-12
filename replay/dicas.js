/**
 * A explicação de cada botão ao parar o mouse em cima (o dono, 13/10), no lugar do balão do navegador, que
 * demora, sai pequeno e diferente em cada sistema. Lê o `title` (ou `data-dica`) na hora do hover, por isso
 * os títulos que o resto da página troca e traduz continuam a valer. Qualquer clique, tecla ou rolagem a faz
 * sumir; no toque não aparece.
 */
const ESPERA_MS = 450;

const caixa = document.createElement('div');
caixa.className = 'dica';
caixa.setAttribute('role', 'tooltip');
caixa.hidden = true;
document.body.append(caixa);

let alvo = null;
let relogio = 0;

function esconder() {
  clearTimeout(relogio);
  caixa.hidden = true;
  alvo?.removeAttribute('aria-describedby');
  alvo = null;
}

function mostrar(el) {
  const texto = el.dataset.dica;
  if (!texto || !el.isConnected) return;
  caixa.textContent = texto;
  caixa.hidden = false;
  const r = el.getBoundingClientRect();
  const c = caixa.getBoundingClientRect();
  const x = Math.min(Math.max(8, r.left + r.width / 2 - c.width / 2), innerWidth - c.width - 8);
  const embaixo = r.bottom + 8 + c.height < innerHeight;
  caixa.style.left = `${x}px`;
  caixa.style.top = `${embaixo ? r.bottom + 8 : r.top - c.height - 8}px`;
  caixa.id = 'dicaAtual';
  el.setAttribute('aria-describedby', 'dicaAtual');
}

document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest?.('[title], [data-dica]');
  if (el === alvo) return;
  esconder();
  if (!el) return;
  // O título sai do elemento para o navegador não mostrar o balão dele por cima deste.
  if (el.title) { el.dataset.dica = el.title; el.removeAttribute('title'); }
  alvo = el;
  relogio = setTimeout(() => mostrar(el), ESPERA_MS);
});
document.addEventListener('pointerout', (e) => {
  if (alvo && !alvo.contains(e.relatedTarget)) esconder();
});
for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, esconder, true);
addEventListener('scroll', esconder, true);
addEventListener('blur', esconder);
