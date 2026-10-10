// A agulha do instante, como a de um editor de vídeo (o dono, 10/10: a bolinha da barra de posição não
// ficava em cima da linha branca das faixas). Uma peça só: a cabeça em cima da barra e a linha a descer
// até ao fim das faixas, no sítio do instante no eixo do tempo das faixas, em qualquer zoom e largura.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const comNavegador = { skip: !podeCorrer && 'sem navegador' };

async function abrirNoite(p) {
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 });
}

/** Onde estão a cabeça, a linha, e onde devia estar o instante no trilho das faixas. */
const medir = (p) => p.evaluate(() => {
  const c = document.getElementById('cabecaAgulha').getBoundingClientRect();
  const l = document.getElementById('cursor').getBoundingClientRect();
  const barra = document.getElementById('barra').getBoundingClientRect();
  const faixas = document.getElementById('faixas').getBoundingClientRect();
  const trilho = document.querySelector('#faixas .faixa .trilho').getBoundingClientRect();
  const v = window.__estado.vista || window.__estado.janela;
  const f = (window.__estado.agoraMs - v.inicio) / (v.fim - v.inicio);
  return {
    cabeca: c.left + c.width / 2,
    cabecaY: c.top + c.height / 2,
    linha: l.left + l.width / 2,
    devia: trilho.left + trilho.width * Math.min(1, Math.max(0, f)),
    barraY: barra.top + barra.height / 2,
    fundo: l.bottom,
    faixasFundo: faixas.bottom,
  };
});

function conferir(m, onde) {
  assert.ok(Math.abs(m.cabeca - m.linha) <= 1, `${onde}: cabeça ${m.cabeca} e linha ${m.linha}`);
  assert.ok(Math.abs(m.linha - m.devia) <= 1, `${onde}: a linha está em ${m.linha} e o instante em ${m.devia}`);
  assert.ok(Math.abs(m.cabecaY - m.barraY) <= 1, `${onde}: a cabeça não está na barra (${m.cabecaY} e ${m.barraY})`);
  assert.ok(Math.abs(m.fundo - m.faixasFundo) <= 1, `${onde}: a linha acaba em ${m.fundo} e as faixas em ${m.faixasFundo}`);
}

for (const [nome, ecra, toque] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
  test(`em ${nome}: a cabeça e a linha são uma agulha só, no instante, com zoom e sem`, comNavegador, async () => {
    const { p: base } = await abrir();
    const p = await base.context().browser().newPage({ viewport: ecra, hasTouch: toque, isMobile: toque, locale: 'pt-PT' });
    await base.close();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message)));
    await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ } });
    await abrirNoite(p);
    for (const s of [0, 137, 333, 599]) {
      await p.evaluate((ms) => { window.__estado.agoraMs = ms; }, T + s * 1000);
      await p.click('#mais3s').catch(() => {});
      await p.waitForTimeout(80);
      conferir(await medir(p), `${nome} sem zoom aos ${s}s`);
    }
    // Com zoom: o deslizante do zoom a meio.
    await p.evaluate(() => {
      const z = document.getElementById('zoomTempo');
      z.value = '600';
      z.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await p.waitForTimeout(150);
    conferir(await medir(p), `${nome} com zoom`);
    // Abrir o assistente de uma faixa muda a altura das faixas: a linha acompanha.
    await p.click('#faixas button.nome[data-quem="tchubi"]');
    await p.waitForTimeout(150);
    conferir(await medir(p), `${nome} com o assistente aberto`);
    assert.deepEqual(erros, []);
    await p.close();
  });
}

test('arrastar pela cabeça leva o vídeo, e o teclado na barra continua a andar', comNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await abrirNoite(p);
  const trilho = await p.locator('#faixas .faixa .trilho').first().boundingBox();
  const cabeca = await p.locator('#cabecaAgulha').boundingBox();
  await p.mouse.move(cabeca.x + cabeca.width / 2, cabeca.y + cabeca.height / 2);
  await p.mouse.down();
  await p.mouse.move(trilho.x + trilho.width / 2, cabeca.y + cabeca.height / 2, { steps: 5 });
  await p.mouse.up();
  const v = await p.evaluate(() => ({ agora: window.__estado.agoraMs, ...(window.__estado.vista || window.__estado.janela) }));
  const f = (v.agora - v.inicio) / (v.fim - v.inicio);
  assert.ok(Math.abs(f - 0.5) < 0.01, `a cabeça arrastada ao meio levou o vídeo a ${f}`);
  conferir(await medir(p), 'depois de arrastar');
  // Um clique na barra vai ao instante desse ponto, pela mesma conta.
  const barra = await p.locator('#barra').boundingBox();
  await p.mouse.click(trilho.x + trilho.width * 0.25, barra.y + barra.height / 2);
  const f2 = await p.evaluate(() => {
    const w = window.__estado.vista || window.__estado.janela;
    return (window.__estado.agoraMs - w.inicio) / (w.fim - w.inicio);
  });
  assert.ok(Math.abs(f2 - 0.25) < 0.01, `o clique foi a ${f2}`);
  // O teclado: a barra tem o foco, e a seta anda.
  assert.equal(await p.evaluate(() => document.activeElement.id), 'barra');
  const antes = await p.evaluate(() => window.__estado.agoraMs);
  await p.keyboard.press('ArrowRight');
  assert.ok(await p.evaluate(() => window.__estado.agoraMs) > antes);
  conferir(await medir(p), 'depois da seta');
  assert.deepEqual(erros, []);
  await p.close();
});
