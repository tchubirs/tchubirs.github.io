// As caixas do chat e da legenda por cima das prévias do "Ajustar clipe": arrastar para mover e puxar
// um canto para redimensionar, como a caixa da webcam.
//
// O dono, 13/10: "o chat no vídeo se move e se redimensiona arrastando direto na prévia, como a caixa da
// webcam". Uma caixa é `{ x, y, w }` em fração do quadro (x e w da largura, y da altura) e a altura vem do
// conteúdo (`h`, só para desenhar a caixa). Assim a mesma escolha serve para qualquer tamanho de prévia e
// para o ficheiro exportado, que lê a fração e põe-na nos pixels dele.
//
// As contas (mover, redimensionar, a zona do TikTok) são puras e testam-se em Node; o `ligarCaixa` é o
// único que toca no DOM.

export const CAIXA_MIN_W = 0.12;
/** Quanto uma caixa pode passar da zona segura antes de a largarmos: abaixo disto ela "cola" na borda. */
export const RESISTENCIA = 0.04;

const arredonda = (n) => Math.round(n * 10_000) / 10_000;
const preso = (n, a, b) => Math.min(b, Math.max(a, n));

/** Uma caixa guardada com tudo dentro do quadro, ou null (= o lugar automático). */
export function limparCaixa(c, { min = CAIXA_MIN_W } = {}) {
  if (!c || typeof c !== 'object') return null;
  const x = Number(c.x);
  const y = Number(c.y);
  const w = Number(c.w);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w)) return null;
  const largura = preso(w, min, 1);
  return { x: arredonda(preso(x, 0, 1 - largura)), y: arredonda(preso(y, 0, 0.98)), w: arredonda(largura) };
}

/** As duas caixas de um item (uma por formato), cada uma a ser a de omissão (null) se vier estragada. */
export function limparCaixas(o, opcoes) {
  const c = o && typeof o === 'object' ? o : {};
  return { '16:9': limparCaixa(c['16:9'], opcoes), '9:16': limparCaixa(c['9:16'], opcoes) };
}

/**
 * Manter a caixa dentro de uma zona (a livre do TikTok), mas só até um ponto: dentro de `resistencia`
 * da borda ela volta para dentro, e mais além a pessoa levou-a para fora de propósito e fica onde está.
 * `zona` é `{ x0, y0, x1, y1 }` em fração; sem zona só se prende ao quadro.
 */
export function dentroDaZona(r, zona, resistencia = RESISTENCIA) {
  let { x, y } = r;
  if (zona) {
    if (r.w <= zona.x1 - zona.x0) {
      if (x < zona.x0 && zona.x0 - x <= resistencia) x = zona.x0;
      if (x + r.w > zona.x1 && x + r.w - zona.x1 <= resistencia) x = zona.x1 - r.w;
    }
    if (r.h <= zona.y1 - zona.y0) {
      if (y < zona.y0 && zona.y0 - y <= resistencia) y = zona.y0;
      if (y + r.h > zona.y1 && y + r.h - zona.y1 <= resistencia) y = zona.y1 - r.h;
    }
  }
  return { ...r, x: preso(x, 0, Math.max(0, 1 - r.w)), y: preso(y, 0, Math.max(0, 1 - r.h)) };
}

/** Mover a caixa `r0` de `dx` e `dy` (frações do quadro). */
export function moverCaixa(r0, dx, dy, zona) {
  return dentroDaZona({ ...r0, x: r0.x + dx, y: r0.y + dy }, zona);
}

/**
 * Puxar um canto (`no`, `ne`, `so`, `se`) de `dx` (fração da largura do quadro). A forma fica (a altura
 * acompanha a largura) e o canto oposto fica onde está. Nunca mais larga do que o quadro permite nem
 * mais estreita do que `min`.
 */
export function redimensionarCaixa(r0, canto, dx, { min = CAIXA_MIN_W } = {}) {
  const prop = r0.h / r0.w;
  const oeste = canto === 'no' || canto === 'so';
  const norte = canto === 'no' || canto === 'ne';
  const fixoX = oeste ? r0.x + r0.w : r0.x;
  const fixoY = norte ? r0.y + r0.h : r0.y;
  // O que cabe a partir do canto fixo, na horizontal e na vertical.
  const maxW = Math.min(oeste ? fixoX : 1 - fixoX, (norte ? fixoY : 1 - fixoY) / prop);
  const w = preso(r0.w + (oeste ? -dx : dx), Math.min(min, maxW), maxW);
  const h = w * prop;
  return { x: oeste ? fixoX - w : r0.x, y: norte ? fixoY - h : r0.y, w, h };
}

/** A caixa `{ x, y, w, h }` em estilo CSS (percentagens do quadro). */
export const estiloDaCaixa = (r) => {
  const p = (n) => +(n * 100).toFixed(3);
  return `left:${p(r.x)}%;top:${p(r.y)}%;width:${p(r.w)}%;height:${p(r.h)}%`;
};

/**
 * Pôr uma caixa a ser arrastada. `el` é a caixa (com quatro `.puxar` dentro); `quadro()` dá o elemento
 * do quadro onde ela está; `ler()` dá a caixa agora (`{x,y,w,h}`); `pode()` diz se mexer é permitido
 * (nunca a gravar); `zona()` é a zona segura, ou null; `aoMexer({x,y,w})` recebe o que a pessoa fez.
 */
export function ligarCaixa(el, { quadro, ler, pode = () => true, zona = () => null, aoMexer, aoSoltar = () => {} }) {
  const comecar = (e, canto) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!pode()) return;
    const r0 = ler();
    if (!r0) return;
    const q = quadro().getBoundingClientRect();
    if (!q.width || !q.height) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const mexer = (m) => {
      if (!pode()) return;
      const dx = (m.clientX - x0) / q.width;
      const dy = (m.clientY - y0) / q.height;
      const r = canto ? redimensionarCaixa(r0, canto, dx) : moverCaixa(r0, dx, dy, zona());
      aoMexer({ x: r.x, y: r.y, w: r.w });
    };
    const largar = () => {
      window.removeEventListener('pointermove', mexer);
      window.removeEventListener('pointerup', largar);
      window.removeEventListener('pointercancel', largar);
      aoSoltar();
    };
    window.addEventListener('pointermove', mexer);
    window.addEventListener('pointerup', largar);
    window.addEventListener('pointercancel', largar);
  };
  el.addEventListener('pointerdown', (e) => comecar(e, null));
  for (const p of el.querySelectorAll('.puxar')) p.addEventListener('pointerdown', (e) => comecar(e, p.dataset.canto));
  // Pelo teclado, como as caixas da webcam: as setas movem (com Shift, mais longe), o + e o - mudam o tamanho.
  el.addEventListener('keydown', (e) => {
    const r = ler();
    if (!r || !pode()) return;
    const passo = e.shiftKey ? 0.05 : 0.01;
    const mexer = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    const zoom = { '+': passo, '=': passo, '-': -passo }[e.key];
    if (!mexer && zoom == null) return;
    e.preventDefault();
    e.stopPropagation();
    const n = mexer ? moverCaixa(r, mexer[0], mexer[1], zona()) : redimensionarCaixa(r, 'se', zoom);
    aoMexer({ x: n.x, y: n.y, w: n.w });
    aoSoltar();
  });
}
