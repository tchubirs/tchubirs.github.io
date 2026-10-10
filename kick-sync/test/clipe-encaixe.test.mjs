// O editor "Criar clipe" (o dono, 10/10): os modelos de onde fica a webcam no "2 enquadramentos", o
// encaixe de cada streamer guardado no aparelho entre clipes e sessões, e a agulha da barra do clipe
// para assistir pulando, com o mouse, o dedo e o teclado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import {
  enquadramentoInicial, proporcaoDoQuadro, paraFraccoes, deFraccoes, MODELOS_WEBCAM, MODELO_OMISSAO,
  limparModelo, DIVISAO_OMISSAO,
} from '../site/retrato.js';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const perto = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

// ── os modelos, sem navegador ───────────────────────────────────────────────

test('os quatro modelos põem a webcam no seu canto, num tamanho típico, e o jogo ao meio', () => {
  assert.deepEqual(MODELOS_WEBCAM, ['baixoEsq', 'cimaEsq', 'cimaDir', 'baixoDir']);
  assert.equal(MODELO_OMISSAO, 'baixoEsq', 'embaixo à esquerda é o padrão, o mais comum no Rust');
  for (const [W, H] of [[1920, 1080], [1280, 720], [2560, 1440]]) {
    for (const modelo of MODELOS_WEBCAM) {
      const [cam, jogo] = enquadramentoInicial(W, H, 'dois', DIVISAO_OMISSAO, modelo);
      const onde = `${W}x${H} ${modelo}`;
      // A proporção certa para a faixa de cima (a cara) e para a de baixo (o jogo): enchem sem esticar.
      assert.ok(perto(cam.largura / cam.altura, proporcaoDoQuadro('dois', 0, DIVISAO_OMISSAO), 0.001), onde);
      assert.ok(perto(jogo.largura / jogo.altura, proporcaoDoQuadro('dois', 1, DIVISAO_OMISSAO), 0.001), onde);
      // Um tamanho de webcam, e não meia tela: entre um quinto e um terço da largura.
      assert.ok(cam.largura >= W * 0.2 && cam.largura <= W / 3, `${onde}: webcam com ${cam.largura} de ${W}`);
      // No canto pedido, encostada às duas bordas.
      const direita = modelo.endsWith('Dir');
      const baixo = modelo.startsWith('baixo');
      assert.ok(perto(direita ? cam.x + cam.largura : cam.x, direita ? W : 0), `${onde}: x ${cam.x}`);
      assert.ok(perto(baixo ? cam.y + cam.altura : cam.y, baixo ? H : 0), `${onde}: y ${cam.y}`);
      // O jogo ao meio, com a altura toda.
      assert.ok(perto(jogo.x + jogo.largura / 2, W / 2), `${onde}: o jogo não está ao meio`);
      assert.ok(perto(jogo.altura, H), `${onde}: o jogo devia usar a altura toda`);
    }
  }
  // A cara em cima fica com 35 a 40% do 9:16.
  assert.ok(DIVISAO_OMISSAO >= 0.35 && DIVISAO_OMISSAO <= 0.4);
  // Um modelo desconhecido cai no padrão, e não rebenta.
  assert.equal(limparModelo('lado'), 'baixoEsq');
  assert.deepEqual(enquadramentoInicial(1920, 1080, 'dois', DIVISAO_OMISSAO, 'lado'),
    enquadramentoInicial(1920, 1080, 'dois'));
});

test('o encaixe guardado em fracções da fonte serve a qualquer tamanho de vídeo', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const rects = enquadramentoInicial(1920, 1080, 'dois', 0.4, 'cimaDir');
  const fr = paraFraccoes(rects, fonte);
  // Ida e volta na mesma fonte: o mesmo, ao pixel.
  const igual = deFraccoes(fr, fonte, 'dois', 0.4);
  for (const i of [0, 1]) for (const k of ['x', 'y', 'largura', 'altura']) assert.ok(perto(igual[i][k], rects[i][k], 0.01));
  // Num vídeo a 720p o mesmo encaixe, na escala dele.
  const menor = deFraccoes(fr, { largura: 1280, altura: 720 }, 'dois', 0.4);
  for (const i of [0, 1]) {
    assert.ok(perto(menor[i].x, (rects[i].x * 2) / 3, 1), `x do ${i}`);
    assert.ok(perto(menor[i].largura, (rects[i].largura * 2) / 3, 1), `largura do ${i}`);
    assert.ok(perto(menor[i].largura / menor[i].altura, proporcaoDoQuadro('dois', i, 0.4), 0.001));
  }
  // Coisa estragada no aparelho dá `null`, e o editor usa o modelo.
  assert.equal(deFraccoes(null, fonte, 'dois'), null);
  assert.equal(deFraccoes([{ x: 0, y: 0, largura: 0.2 }], fonte, 'dois'), null, 'dois modos pedem dois recortes');
  assert.equal(deFraccoes([{ x: 'a', y: 0, largura: 0.2 }], fonte, 'um'), null);
  assert.equal(paraFraccoes([], fonte), null);
});

// ── no navegador ────────────────────────────────────────────────────────────

async function carregar(p, canais) {
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
}

async function abrirClipe(p) {
  await p.click('#clipar');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
  await p.waitForFunction(() => window.__estado.clipe?.rects.length > 0, null, { timeout: 10000 });
  await p.waitForSelector('#modelosWebcam:not([hidden])', { timeout: 5000 });
}

const editor = (p) => p.evaluate(() => {
  const c = window.__estado.clipe;
  const v = document.getElementById('previaClipe');
  const fonte = v.videoWidth > 0 ? { largura: v.videoWidth, altura: v.videoHeight } : { largura: c.fonteW, altura: c.fonteH };
  return {
    canal: c.canal,
    modo: c.modo,
    modelo: c.modelo,
    rects: c.rects.map((r) => ({ ...r })),
    fonte,
    carregados: [...document.querySelectorAll('.modeloWebcam[aria-pressed="true"]')].map((b) => b.dataset.modelo),
  };
});

const iguais = (a, b, onde) => {
  assert.equal(a.length, b.length, onde);
  for (let i = 0; i < a.length; i++) {
    for (const k of ['x', 'y', 'largura', 'altura']) {
      assert.ok(perto(a[i][k], b[i][k], 1), `${onde}: recorte ${i + 1}, ${k} ${a[i][k]} e devia ser ${b[i][k]}`);
    }
  }
};

for (const [nome, ecra] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  test(`em ${nome}: cada modelo põe a webcam no seu canto, já em dois enquadramentos`, semNavegador, async () => {
    const { p, erros } = await abrir({ ecra });
    await carregar(p, ['tchubi']);
    await abrirClipe(p);
    // Abre em um enquadramento, sem modelo carregado; os botões estão lá e cabem na tela.
    let e = await editor(p);
    assert.equal(e.modo, 'um');
    assert.deepEqual(e.carregados, []);
    const larguraPagina = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(larguraPagina <= ecra.width, `a página anda de lado: ${larguraPagina}`);
    for (const modelo of ['cimaEsq', 'cimaDir', 'baixoDir', 'baixoEsq']) {
      await p.click(`.modeloWebcam[data-modelo="${modelo}"]`);
      e = await editor(p);
      assert.equal(e.modo, 'dois', `${modelo}: o modelo devia levar a dois enquadramentos`);
      assert.deepEqual(e.carregados, [modelo]);
      assert.equal(await p.getAttribute('#modoDois', 'aria-pressed'), 'true');
      iguais(e.rects, (await p.evaluate(async ([w, h, m]) => {
        const r = await import('./retrato.js');
        return r.enquadramentoInicial(w, h, 'dois', r.DIVISAO_OMISSAO, m);
      }, [e.fonte.largura, e.fonte.altura, modelo])), modelo);
      // E na tela: a caixa 1 no canto, a 2 ao meio.
      const caixas = await p.evaluate(() => {
        const z = document.getElementById('recortes').getBoundingClientRect();
        return [...document.querySelectorAll('.recorte')].map((el) => {
          const b = el.getBoundingClientRect();
          return { esq: (b.left - z.left) / z.width, dir: (b.right - z.left) / z.width,
            topo: (b.top - z.top) / z.height, baixo: (b.bottom - z.top) / z.height, meio: (b.left + b.width / 2 - z.left) / z.width };
        });
      });
      const [cam, jogo] = caixas;
      if (modelo.endsWith('Esq')) assert.ok(cam.esq < 0.02, `${modelo}: ${cam.esq}`);
      else assert.ok(cam.dir > 0.98, `${modelo}: ${cam.dir}`);
      if (modelo.startsWith('cima')) assert.ok(cam.topo < 0.02, `${modelo}: ${cam.topo}`);
      else assert.ok(cam.baixo > 0.98, `${modelo}: ${cam.baixo}`);
      assert.ok(Math.abs(jogo.meio - 0.5) < 0.02, `${modelo}: o jogo em ${jogo.meio}`);
    }
    assert.deepEqual(erros, []);
    await p.close();
  });
}

test('o encaixe de cada streamer volta no próximo clipe dele, e depois de recarregar a página', semNavegador, async () => {
  const { p, erros } = await abrir();
  await carregar(p, ['tchubi', 'vitima1']);
  await abrirClipe(p);
  assert.equal((await editor(p)).canal, 'tchubi');
  // O tchubi tem a webcam em cima à direita, e um pequeno ajuste por cima do modelo.
  await p.click('.modeloWebcam[data-modelo="cimaDir"]');
  await p.focus('#recortes .recorte[data-i="0"]');
  for (let k = 0; k < 3; k++) await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('-');
  const tchubi = await editor(p);
  assert.equal(tchubi.modelo, 'cimaDir');

  // O vitima1, no mesmo editor, nunca foi acertado: abre no que estava, com o modelo padrão.
  await p.selectOption('#canalClipe', 'vitima1');
  await p.waitForFunction(() => window.__estado.clipe.canal === 'vitima1' && window.__estado.clipe.rects.length > 0,
    null, { timeout: 10000 });
  let e = await editor(p);
  assert.equal(e.modelo, 'baixoEsq', 'o vitima1 herdou o modelo do tchubi');
  // Fechar e abrir outro clipe: o tchubi volta com o encaixe dele, em dois enquadramentos e no modelo dele.
  await p.click('#cancelarClipe');
  await abrirClipe(p);
  e = await editor(p);
  assert.equal(e.canal, 'tchubi');
  assert.equal(e.modo, 'dois');
  assert.deepEqual(e.carregados, ['cimaDir']);
  iguais(e.rects, tchubi.rects, 'o próximo clipe do tchubi');
  // Abrir não é mexer: o 9:16 lembrado não marca o clipe como ajustado.
  assert.equal(await p.evaluate(() => window.__estado.clipe.retratoMexido), false);

  // Outra sessão: a página recarregada, o mesmo aparelho.
  await p.click('#cancelarClipe');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 20000 }).catch(async () => {
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
  });
  await abrirClipe(p);
  e = await editor(p);
  assert.equal(e.canal, 'tchubi');
  assert.deepEqual(e.carregados, ['cimaDir']);
  iguais(e.rects, tchubi.rects, 'depois de recarregar');

  // Voltar ao modelo desfaz o ajuste, e o modelo é o que fica guardado.
  await p.click('#voltarModelo');
  const modelo = await p.evaluate(async ([w, h]) => {
    const r = await import('./retrato.js');
    return r.enquadramentoInicial(w, h, 'dois', r.DIVISAO_OMISSAO, 'cimaDir');
  }, [e.fonte.largura, e.fonte.altura]);
  iguais((await editor(p)).rects, modelo, 'voltar ao modelo');
  await p.click('#cancelarClipe');
  await abrirClipe(p);
  iguais((await editor(p)).rects, modelo, 'o modelo, depois de voltar a ele');
  assert.deepEqual(erros, []);
  await p.close();
});

// ── a agulha ────────────────────────────────────────────────────────────────

/** O que a barra do clipe diz, e o que o vídeo foi mandado mostrar. */
const barra = (p) => p.evaluate(() => {
  const c = window.__estado.clipe;
  const b = document.getElementById('barraClipe').getBoundingClientRect();
  const cab = document.querySelector('#agulhaClipe .cabecaClipe').getBoundingClientRect();
  const linha = document.getElementById('agulhaClipe').getBoundingClientRect();
  const x = (ms) => b.left + 1 + ((ms - c.vista.inicio) / (c.vista.fim - c.vista.inicio)) * (b.width - 2);
  return {
    deMs: c.deMs, ateMs: c.ateMs, cabecaMs: c.cabecaMs, alvoS: c.alvoS,
    xDe: x(c.deMs), xAte: x(c.ateMs), xCabeca: x(c.cabecaMs),
    cabeca: { x: cab.left + cab.width / 2, y: cab.top + cab.height / 2 },
    linha: linha.left + linha.width / 2,
    topoBarra: b.top, meioBarra: b.top + b.height / 2,
    pedidos: window.__pedidosDeTempo.slice(),
    msPorPx: (c.vista.fim - c.vista.inicio) / (b.width - 2),
  };
});

/** Espiar o que se pede ao `currentTime` da prévia: é isso que leva a imagem ao quadro. */
const espiarVideo = (p) => p.evaluate(() => {
  const v = document.getElementById('previaClipe');
  const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  window.__pedidosDeTempo = [];
  Object.defineProperty(v, 'currentTime', {
    configurable: true,
    get() { return d.get.call(this); },
    set(s) { window.__pedidosDeTempo.push(s); d.set.call(this, s); },
  });
});

function conferirAgulha(m, onde) {
  // A cabeça e a linha são uma peça só, no instante, com a mesma conta das pegas.
  assert.ok(Math.abs(m.cabeca.x - m.linha) <= 1, `${onde}: cabeça ${m.cabeca.x} e linha ${m.linha}`);
  assert.ok(Math.abs(m.linha - m.xCabeca) <= 1.5, `${onde}: a linha em ${m.linha} e o instante em ${m.xCabeca}`);
  assert.ok(Math.abs(m.cabeca.y - m.topoBarra) <= 1.5, `${onde}: a cabeça não está no topo da barra`);
}

for (const [nome, ecra, toque] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
  test(`em ${nome}: a agulha do clipe arrasta-se, leva o vídeo, e não mexe nas pegas`, semNavegador, async () => {
    const { p: base } = await abrir();
    const p = await base.context().browser().newPage({ viewport: ecra, hasTouch: toque, isMobile: toque, locale: 'pt-PT' });
    await base.close();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message)));
    await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ } });
    await carregar(p, ['tchubi']);
    await p.click('#mais1m');
    await abrirClipe(p);
    await espiarVideo(p);
    const m0 = await barra(p);
    conferirAgulha(m0, 'ao abrir');
    assert.ok(Math.abs(m0.cabecaMs - m0.deMs) < 1, 'abre no início do clipe');
    const dur = m0.ateMs - m0.deMs;
    const tempoDe = m0.alvoS;

    // Arrastar a cabeça (que nasce por cima da pega do início) até ao meio do pedaço.
    const arrastar = async (de, para) => {
      if (!toque) {
        await p.mouse.move(de.x, de.y);
        await p.mouse.down();
        for (let k = 1; k <= 6; k++) await p.mouse.move(de.x + ((para.x - de.x) * k) / 6, para.y);
        await p.mouse.up();
        return;
      }
      const s = await p.context().newCDPSession(p);
      const toc = (type, x, y) => s.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await toc('touchStart', de.x, de.y);
      for (let k = 1; k <= 6; k++) await toc('touchMove', de.x + ((para.x - de.x) * k) / 6, para.y);
      await toc('touchEnd');
      await s.detach();
    };
    const meio = { x: (m0.xDe + m0.xAte) / 2, y: m0.cabeca.y };
    await arrastar(m0.cabeca, meio);
    const m1 = await barra(p);
    assert.equal(m1.deMs, m0.deMs, 'arrastar a agulha mexeu no início do clipe');
    assert.equal(m1.ateMs, m0.ateMs, 'arrastar a agulha mexeu no fim do clipe');
    assert.ok(Math.abs(m1.cabecaMs - (m0.deMs + dur / 2)) <= m1.msPorPx * 2,
      `a agulha ficou em ${m1.cabecaMs - m0.deMs} ms e devia estar perto de ${dur / 2}`);
    conferirAgulha(m1, 'depois de arrastar');
    // O vídeo foi mandado ao quadro da agulha: o mesmo salto, em segundos, que a agulha deu.
    assert.ok(Math.abs((m1.alvoS - tempoDe) - (m1.cabecaMs - m0.deMs) / 1000) < 0.05,
      `o vídeo foi a ${m1.alvoS} e devia ir a ${tempoDe + (m1.cabecaMs - m0.deMs) / 1000}`);
    assert.ok(m1.pedidos.some((s) => Math.abs(s - m1.alvoS) < 0.01), `o vídeo não saltou: ${m1.pedidos}`);

    // Tocar na barra fora das pegas leva a agulha ali: entre a pega do início (que fica dentro do
    // pedaço, à direita do início) e o fim.
    const pegaDe = await p.locator('#barraClipe .pega.de').boundingBox();
    const livre = { x: (pegaDe.x + pegaDe.width + m0.xAte) / 2, y: m1.meioBarra };
    assert.ok(Math.abs(livre.x - m1.xCabeca) > 3, 'o ponto escolhido é onde a agulha já estava');
    if (toque) await p.touchscreen.tap(livre.x, livre.y);
    else await p.mouse.click(livre.x, livre.y);
    const m2 = await barra(p);
    const esperado = m0.deMs + (livre.x - m0.xDe) * m0.msPorPx;
    assert.ok(Math.abs(m2.cabecaMs - esperado) <= m2.msPorPx * 2, `o toque levou a ${m2.cabecaMs - esperado} ms do sítio`);
    assert.equal(m2.deMs, m0.deMs);
    assert.equal(m2.ateMs, m0.ateMs);
    conferirAgulha(m2, 'depois do toque');

    // Com foco, as setas andam 1 s, e com Shift 0,1 s, e o vídeo vai junto.
    await p.focus('#agulhaClipe');
    await p.keyboard.press('ArrowRight');
    const m3 = await barra(p);
    assert.ok(Math.abs(m3.cabecaMs - m2.cabecaMs - 1000) < 1, `a seta andou ${m3.cabecaMs - m2.cabecaMs}`);
    await p.keyboard.press('Shift+ArrowLeft');
    const m4 = await barra(p);
    assert.ok(Math.abs(m4.cabecaMs - m3.cabecaMs + 100) < 1, `Shift e seta andou ${m4.cabecaMs - m3.cabecaMs}`);
    assert.ok(Math.abs((m4.alvoS - m3.alvoS) + 0.1) < 0.02, `o vídeo andou ${m4.alvoS - m3.alvoS} s`);
    assert.ok(m4.pedidos.some((s) => Math.abs(s - m4.alvoS) < 0.01), 'a seta não levou o vídeo');
    assert.equal(m4.deMs, m0.deMs);
    assert.equal(m4.ateMs, m0.ateMs);
    // Quem usa leitor de tela ouve onde está.
    assert.equal(await p.getAttribute('#agulhaClipe', 'role'), 'slider');
    assert.match(await p.getAttribute('#agulhaClipe', 'aria-valuetext'), /segundos/);

    // E a pega continua a ser a pega: arrastá-la mexe no fim, e não na agulha a meio.
    const pega = await p.locator('#barraClipe .pega.ate').boundingBox();
    await arrastar({ x: pega.x + pega.width / 2, y: pega.y + pega.height * 0.75 },
      { x: pega.x + pega.width / 2 + 20, y: pega.y + pega.height * 0.75 });
    const m5 = await barra(p);
    assert.ok(m5.ateMs > m0.ateMs, 'a pega do fim não andou');
    assert.equal(m5.deMs, m0.deMs);
    assert.deepEqual(erros, []);
    await p.close();
  });
}
