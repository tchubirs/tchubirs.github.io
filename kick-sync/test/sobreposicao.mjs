// O que está por cima do quê na tela do vídeo. O dono, 11/10: "tem coisas sobrepondo outras".
//
// Mede no browser, e não na folha de estilo: lê a caixa de cada peça que se vê e de cada botão, e
// devolve três listas.
//   - `sobrepostos`: duas peças que não são uma dentro da outra e se tocam por mais de 2 px. Uma folha
//     presa e posta à frente (`position: sticky` ou `fixed` com `z-index`, como o painel do lance no
//     telemóvel) passa por cima do resto de propósito, e só é comparada com o que está dentro dela.
//   - `cortados`: uma peça que um pai com `overflow: hidden` corta (um pai que rola não conta, porque
//     o que ele esconde aparece quando se rola).
//   - `cobertos`: um botão cujo meio, na tela, é de outro elemento. É o caso do Clipar atrás da linha
//     do tempo: as caixas não se tocam no papel, mas quem clica acerta noutra coisa.
// Vive à parte dos testes para o guião das fotos (no scratchpad) usar a mesma conta.

/** As peças grandes da tela, com o nome que aparece no relatório. */
export const PECAS = {
  video: '#palcoFoco .tile',
  transporte: '.transporte',
  clipar: '#clipar',
  angulos: '#grade .tile',
  barraAngulos: '#barraGrelha',
  montagem: '#montagem',
  chat: '#chatVideo',
  kills: '#listaMomentos',
  ferramentas: '.palcoFundo',
  cabecaTempo: '.cabecaTempo',
  regua: '.reguaLinha',
  faixa: '.faixas .faixa .nome',
  mapa: '#mapaRolo',
  lance: '#lance',
  barraEvento: '.barraEvento',
};

/**
 * Medir a página como está agora. Corre DENTRO do browser (passa-se ao `page.evaluate`).
 * @param {{ pecas: Record<string, string>, raizes: string[] }} o
 */
export function medirNaPagina({ pecas, raizes }) {
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  };
  const nome = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const classe = !id && typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const texto = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${classe}${texto ? ` "${texto}"` : ''}`;
  };
  // A caixa no documento, para comparar peças em alturas de rolo diferentes.
  const caixa = (r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  const cruzar = (a, b) => {
    const x = Math.max(a.x, b.x); const y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x; const h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  };

  const itens = new Map();
  for (const [rotulo, sel] of Object.entries(pecas)) {
    for (const el of document.querySelectorAll(sel)) if (visivel(el)) itens.set(el, rotulo);
  }
  for (const raiz of raizes) {
    for (const el of document.querySelectorAll(`${raiz} :is(button, input, select, textarea, summary, a[href])`)) {
      if (!itens.has(el) && visivel(el)) itens.set(el, 'controle');
    }
  }

  const cortados = [];
  const medidos = [];
  for (const [el, rotulo] of itens) {
    const r = caixa(el.getBoundingClientRect());
    let vista = r;
    for (let pai = el.parentElement; pai && pai !== document.body; pai = pai.parentElement) {
      const cs = getComputedStyle(pai);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const rp = pai.getBoundingClientRect();
      const dentro = caixa({ left: rp.left + pai.clientLeft, top: rp.top + pai.clientTop, width: pai.clientWidth, height: pai.clientHeight });
      const resto = cruzar(vista, dentro);
      const rola = /auto|scroll/.test(cs.overflowY) || /auto|scroll/.test(cs.overflowX);
      // Cortado por um pai que NÃO rola: o pedaço que falta não volta. Dois pixels de folga para
      // contornos e arredondamentos.
      if (!rola) {
        const falta = resto ? (vista.w * vista.h - resto.w * resto.h) / (vista.w * vista.h) : 1;
        const pixeis = resto ? Math.max(vista.h - resto.h, vista.w - resto.w) : Math.max(vista.h, vista.w);
        if (pixeis > 2 && falta > 0.02) cortados.push({ peca: rotulo, el: nome(el), por: nome(pai), falta: Math.round(falta * 100) });
      }
      if (!resto) { vista = null; break; }
      vista = resto;
    }
    if (!vista || vista.w <= 2 || vista.h <= 2) continue;
    let folha = null;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/sticky|fixed/.test(cs.position) && cs.zIndex !== 'auto') folha = a;
    }
    medidos.push({ el, rotulo, vista, folha });
  }

  const sobrepostos = [];
  for (let i = 0; i < medidos.length; i++) {
    for (let j = i + 1; j < medidos.length; j++) {
      const a = medidos[i]; const b = medidos[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.folha !== b.folha) continue;
      const c = cruzar(a.vista, b.vista);
      if (c && c.w > 2 && c.h > 2) {
        sobrepostos.push({ a: `${a.rotulo} ${nome(a.el)}`, b: `${b.rotulo} ${nome(b.el)}`, area: [Math.round(c.w), Math.round(c.h)] });
      }
    }
  }

  // Quem recebe o clique no meio de cada botão que está dentro do ecrã agora.
  const cobertos = [];
  for (const { el, rotulo, vista } of medidos) {
    if (!el.matches('button, input, select, textarea, summary, a[href]')) continue;
    const cx = vista.x + vista.w / 2 - scrollX; const cy = vista.y + vista.h / 2 - scrollY;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
    const quem = document.elementFromPoint(cx, cy);
    if (!quem || el === quem || el.contains(quem) || quem.contains(el)) continue;
    cobertos.push({ peca: rotulo, el: nome(el), por: nome(quem) });
  }

  const tam = (sel) => {
    const el = [...document.querySelectorAll(sel)].find(visivel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  };
  return {
    sobrepostos, cortados, cobertos,
    video: tam('#palcoFoco .tile'), rolaPagina: document.scrollingElement.scrollHeight > innerHeight + 1,
    rolaLado: document.scrollingElement.scrollWidth > innerWidth + 1,
  };
}

/**
 * Medir a página no topo e no fundo do rolo (os `cobertos` só se medem no que está no ecrã), e juntar.
 * @param {import('playwright').Page} p
 */
export async function medirSobreposicao(p, { raizes = ['#evento', '#palco', '.topoTrabalho'], pecas = PECAS } = {}) {
  const alturas = await p.evaluate(() => {
    const max = document.scrollingElement.scrollHeight - innerHeight;
    const passos = [];
    for (let y = 0; y < max; y += Math.max(200, innerHeight - 100)) passos.push(y);
    if (max > 0) passos.push(max);
    return passos.length ? passos : [0];
  });
  let fim = null;
  const chave = (o) => JSON.stringify(o);
  for (const y of alturas) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(30);
    const m = await p.evaluate(medirNaPagina, { pecas, raizes });
    if (!fim) { fim = m; continue; }
    for (const k of ['sobrepostos', 'cortados', 'cobertos']) {
      const vistos = new Set(fim[k].map(chave));
      for (const x of m[k]) if (!vistos.has(chave(x))) fim[k].push(x);
    }
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  return fim;
}
