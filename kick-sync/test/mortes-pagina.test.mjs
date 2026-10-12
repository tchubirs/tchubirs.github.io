// As mortes do servidor numa página a sério, com a Kick de test/falsa.mjs: três canais numa noite de 10
// minutos (21:00 a 21:10 UTC). Cola-se um registro com uma morte entre dois canais, uma de alguém que
// não é canal e uma linha que não é morte. Tem de: listar a linha não lida, pôr a marca nas duas faixas,
// abrir os dois POVs 10 s antes ao clicar na marca, pôr a morte nos melhores lances com o motivo,
// alinhar todas as mortes com "a morte é agora", casar o nome sem canal à mão, ir para a montagem e
// voltar igual depois de recarregar a página.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const CANAIS = ['newt', 'zeca', 'outro'];
const ELENCO = 'Alfa: newt\nBeta: zeca\noutro';
const MORTE = T + 3 * 60_000 + 20_000; // 21:03:20 UTC
const REGISTRO = [
  '21:03:20 Newt killed Zeca (Assault Rifle, 40 m)',
  '21:06:00 Damoniak killed Zeca',
  'banana',
].join('\n');

/** O ponto do ecrã de um instante na faixa de um canal, e a cor do pixel da bandeirinha da marca. */
async function pontoNoMapa(p, canal, ms) {
  return p.evaluate(({ c, m }) => {
    const ev = window.__evento;
    const rolo = document.getElementById('mapaRolo');
    rolo.scrollIntoView({ block: 'nearest' });
    const l = ev.mapa.linhas.find((x) => x.canal === c);
    const caixa = rolo.getBoundingClientRect();
    const x = ((m - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth;
    const ry = l.y - ev.topo;
    const tela = document.getElementById('mapa');
    const dpr = tela.width / rolo.clientWidth;
    const px = tela.getContext('2d').getImageData(Math.round(Math.round(x) * dpr), Math.round((ry + 4) * dpr), 1, 1).data;
    return { x: caixa.left + x, y: caixa.top + ry + l.altura / 2, cor: [...px].slice(0, 3) };
  }, { c: canal, m: ms });
}

const vermelho = ([r, g, b]) => r > 200 && g < 150 && b < 140;

test('mortes do servidor: importar, marcas nas duas faixas, abrir os dois POVs, melhores lances, alinhar, nomes e montagem',
  semNavegador, async () => {
    const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: CANAIS });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', ELENCO);
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
    assert.equal(await p.locator('#mortes').isVisible(), false);

    // Colar o registro: duas mortes lidas, a linha "banana" listada, Damoniak sem canal.
    await p.click('#importarMortes');
    await p.fill('#mortesTexto', REGISTRO);
    await p.click('#mortesLer');
    assert.match(await p.locator('#mortesEstadoJanela').innerText(), /2 mortes lidas\. 1 linha não lida.*1 nome do jogo sem canal: escolha/);
    assert.match(await p.locator('#mortesNaoLidasJanela').innerText(), /banana \(linha 3, não é uma morte conhecida\)/);
    await p.click('#fecharMortes');
    // As horas do registro em UTC (a do aparelho do teste pode ser outra).
    await p.selectOption('#mortesFuso', '0');
    assert.equal(await p.locator('#mortesConta').innerText(), '2');
    assert.match(await p.locator('#mortesNomesTitulo').innerText(), /Nomes do jogo sem canal \(1\)/);
    assert.match(await p.locator('#mortesNaoLidasTitulo').innerText(), /Linhas não lidas \(1\)/);
    assert.equal(await p.locator('#legendaMorte').isVisible(), true);

    // As marcas: na faixa de quem matou e na de quem morreu, no segundo da morte, e pintadas no mapa.
    const marcas = await p.evaluate(() => Object.fromEntries([...window.__mortes.marcas()].map(([c, l]) => [c, l.map((m) => [m.ms, m.papel])])));
    assert.deepEqual(marcas.newt, [[MORTE, 'matou']]);
    assert.deepEqual(marcas.zeca[0], [MORTE, 'morreu']);
    assert.equal(marcas.outro, undefined);
    const ponto = await pontoNoMapa(p, 'newt', MORTE);
    assert.ok(vermelho(ponto.cor), `a bandeirinha da morte é vermelha: ${ponto.cor}`);

    // Os melhores lances: a morte é um lance de dois canais, com o motivo escrito.
    await p.waitForFunction(() => /morte no servidor: Newt matou Zeca/.test(document.getElementById('melhoresLista').textContent), null, { timeout: 5000 });
    const lance = p.locator('#melhoresLista > li').filter({ hasText: 'morte no servidor: Newt matou Zeca' });
    assert.equal(await lance.locator('.melhorCanais').innerText(), 'newt, zeca');

    // Clicar na marca abre quem matou e quem morreu, 10 s antes.
    await p.mouse.click(ponto.x, ponto.y);
    await p.waitForFunction(() => window.__estado.linhas.length === 2, null, { timeout: 20000 });
    const noite = await p.evaluate(() => ({
      canais: window.__estado.linhas.map((x) => x.slug).sort(), agora: window.__estado.agoraMs, focos: window.__estado.focos,
    }));
    assert.deepEqual(noite.canais, ['newt', 'zeca']);
    assert.ok(Math.abs(noite.agora - (MORTE - 10_000)) < 2000, `abriu em ${new Date(noite.agora).toISOString()}`);
    assert.equal(noite.focos[0], 'newt');
    // Com o vídeo à frente, a barra diz qual morte está aberta.
    await p.waitForSelector('#morteAberta:not([hidden])');
    assert.match(await p.locator('#morteAbertaTexto').innerText(), /Newt matou Zeca/);

    // "A morte é agora": o vídeo mostra a morte 4 s depois da hora do registro; todas andam 4 s.
    const ajuste = await p.evaluate((ms) => {
      window.__estado.agoraMs = ms;
      document.getElementById('morteAgora').click();
      return window.__mortes.estado.ajusteMs;
    }, MORTE + 4000);
    assert.equal(ajuste, 4000);
    const depois = await p.evaluate(() => [...window.__mortes.casadas()].map((m) => m.ms));
    assert.deepEqual(depois, [MORTE + 4000, T + 6 * 60_000 + 4000]);
    assert.equal(await p.evaluate(() => window.__mortes.marcas().get('zeca')[0].ms), MORTE + 4000);

    // De volta ao mapa: o nome sem canal casa-se à mão e a marca aparece na faixa dele.
    await p.click('#mostrarMapa');
    await p.locator('#mortesNomes summary').click();
    await p.locator('#mortesNomesLista li[data-nome="Damoniak"] select').selectOption('outro');
    await p.locator('#mortesNomesLista li[data-nome="Damoniak"] button').click();
    assert.match(await p.locator('#mortesEstado').innerText(), /Damoniak agora é outro/);
    assert.equal(await p.locator('#mortesNomes').isVisible(), false);
    assert.deepEqual(await p.evaluate(() => window.__mortes.marcas().get('outro').map((m) => m.papel)), ['matou']);

    // A montagem: quem matou com quem morreu já marcado.
    await p.locator('#mortesLista li').first().locator('button[data-acao="montagem"]').click();
    const kill = await p.evaluate(() => [...window.__estado.momentos, ...window.__estado.momentosFora].filter((m) => m.origem === 'servidor'));
    assert.equal(kill.length, 1);
    assert.equal(kill[0].protagonista, 'newt');
    assert.deepEqual(kill[0].vitimas, ['zeca']);
    assert.equal(kill[0].ms, MORTE + 4000);

    // Outra visita: as mortes, o fuso e o alinhamento continuam neste aparelho.
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__evento?.mapa && window.__mortes?.casadas().length === 2, null, { timeout: 15000 });
    assert.deepEqual(await p.evaluate(() => window.__mortes.casadas().map((m) => [m.ms, m.canalMatador, m.canalVitima])),
      [[MORTE + 4000, 'newt', 'zeca'], [T + 6 * 60_000 + 4000, 'outro', 'zeca']]);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('mortes do servidor no telemóvel: a seção cabe em 390 px, sem rolar para o lado', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 390, height: 844 } });
  await kickFalsa(p, { canais: CANAIS });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', ELENCO);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  await p.evaluate((texto) => window.__mortes.importar(texto), REGISTRO);
  await p.locator('#mortes').scrollIntoViewIfNeeded();
  const medida = await p.evaluate(() => {
    const fora = [];
    for (const el of document.querySelectorAll('#mortes *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) fora.push(el.id || el.className || el.tagName);
    }
    return { fora, rola: document.documentElement.scrollWidth > window.innerWidth };
  });
  assert.deepEqual(medida.fora, []);
  assert.equal(medida.rola, false);
  assert.deepEqual(erros, []);
  await p.close();
});
