// "Tem coisas sobrepondo outras" (o dono, 11/10, num ecrã de 2000x1025 com o Abisal aberto e 18
// ângulos). Na foto dele o visor tinha virado duas miniaturas de 165x95, o transporte e o Clipar
// estavam por baixo da linha do tempo e a lista dos ângulos escorria por cima dos botões. A página
// tinha a altura do ecrã e não rolava, e o palco cedia a altura toda quando as barras de cima cresciam.
//
// Aqui a tela do evento é medida com 18 canais, depois do "Abrir todos com vídeo nesse horário" e do
// "Ver só", com o mapa aberto e fechado, em 2000x1025 e 1366x768: nenhuma peça por cima de outra,
// nenhum botão cortado ou tapado, e o visor nunca abaixo de 356x200. Quando falta altura, a página rola.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { medirSobreposicao } from './sobreposicao.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const CANAIS = ['platanit0o', 'sapoiq', 'degolas', 'ogmeik', 'roko808', 'sr-rua', 'sweetcianux', 'yokohoshigami',
  'hiurmitaa', 'kiwi_chanvt', 'neevybv', 'karinios0', 'nikots', 'elfosxx', 'newtrc', 'zorou-kick', 'rockg', 'm2cg'];

async function clicarNoMapa(p, canal, ms) {
  const alvo = await p.evaluate(({ c, m }) => {
    const ev = window.__evento;
    const rolo = document.getElementById('mapaRolo');
    rolo.scrollIntoView({ block: 'nearest' });
    const l = ev.mapa.linhas.find((x) => x.canal === c);
    const caixa = rolo.getBoundingClientRect();
    return {
      x: caixa.left + ((m - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth,
      y: caixa.top + l.y - ev.topo + l.altura / 2,
    };
  }, { c: canal, m: ms });
  await p.mouse.click(alvo.x, alvo.y);
  await p.waitForSelector('#lance:not([hidden])');
}

function semNadaPorCima(m, onde) {
  const linhas = (k) => m[k].map((x) => JSON.stringify(x)).join('\n  ');
  assert.deepEqual(m.sobrepostos, [], `${onde}: peças umas por cima das outras:\n  ${linhas('sobrepostos')}`);
  assert.deepEqual(m.cortados, [], `${onde}: peças cortadas por um painel:\n  ${linhas('cortados')}`);
  assert.deepEqual(m.cobertos, [], `${onde}: botões tapados:\n  ${linhas('cobertos')}`);
  assert.equal(m.rolaLado, false, `${onde}: a página rola para o lado`);
  assert.ok(m.video && m.video[0] >= 356 && m.video[1] >= 200, `${onde}: o visor ficou com ${m.video}`);
}

for (const ecra of [{ width: 2000, height: 1025 }, { width: 1366, height: 768 }]) {
  test(`evento com 18 ângulos em ${ecra.width}x${ecra.height}: nada por cima de nada, com o mapa aberto e fechado`, semNavegador, async () => {
    const { p, erros } = await abrir({ ecra, caminho: 'evento' });
    await kickFalsa(p, { canais: CANAIS });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', CANAIS.join('\n'));
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
    await p.evaluate(({ a, b }) => {
      window.__evento.vista = { deMs: a, ateMs: b };
      document.getElementById('procurarEvento').dispatchEvent(new Event('input'));
    }, { a: T - 5 * 60_000, b: T + 15 * 60_000 });

    // Abrir todos com vídeo nesse horário (são muitos: o primeiro clique avisa, o segundo abre).
    await clicarNoMapa(p, 'nikots', T + 3 * 60_000);
    await p.click('#abrirTodosVod');
    if (/mesmo assim/.test(await p.locator('#abrirTodosVodTexto').innerText())) await p.click('#abrirTodosVod');
    await p.waitForFunction((n) => document.querySelectorAll('#grade .tile').length >= n, CANAIS.length - 1, { timeout: 30000 });
    await p.waitForTimeout(600);
    const tela = `${ecra.width}x${ecra.height}`;
    semNadaPorCima(await medirSobreposicao(p), `${tela}, todos, mapa fechado`);

    await p.click('#mostrarMapa');
    await p.waitForTimeout(300);
    semNadaPorCima(await medirSobreposicao(p), `${tela}, todos, mapa aberto`);

    // Ver só um canal, escolhido no mapa aberto por cima dos vídeos.
    await clicarNoMapa(p, 'elfosxx', T + 4 * 60_000);
    assert.match(await p.locator('#verLanceTexto').innerText(), /^Ver só /);
    await p.locator('#verLance').scrollIntoViewIfNeeded();
    await p.click('#verLance');
    await p.waitForTimeout(800);
    if (!(await p.evaluate(() => document.getElementById('evento').classList.contains('comMapa')))) {
      semNadaPorCima(await medirSobreposicao(p), `${tela}, ver só, mapa fechado`);
      await p.click('#mostrarMapa');
      await p.waitForTimeout(300);
    }
    semNadaPorCima(await medirSobreposicao(p), `${tela}, ver só, mapa aberto`);

    // Com o mapa fechado e as barras de cima a crescer (um aviso longo do leitor de vídeo), o palco não
    // cede: a página passa a rolar e o visor fica com o tamanho mínimo.
    await p.click('#mostrarMapa');
    await p.evaluate(() => {
      const a = document.getElementById('avisoPlayer');
      a.hidden = false;
      a.textContent = 'O leitor de vídeo deste navegador falhou ao abrir dois canais. Recarregue a página. '.repeat(70);
    });
    await p.waitForTimeout(200);
    const apertado = await medirSobreposicao(p);
    semNadaPorCima(apertado, `${tela}, barras de cima altas`);
    assert.equal(apertado.rolaPagina, true, `${tela}: com as barras de cima altas a página devia rolar`);
    assert.deepEqual(erros, []);
    await p.close();
  });
}
