// "Achar o time pelos nomes na tela", num browser a sério e com o leitor de texto a sério.
//
// O Chromium dos testes não decodifica o vídeo da Kick (H.264), por isso os quadros são pintados aqui,
// do tamanho de um 1080p: a lista do time em verde no canto de baixo à esquerda (com a bolinha, um
// morto a vermelho e a webcam a tapar parte do canto), a sobreposição do Discord na lateral direita e
// os nomes em cima de dois jogadores. A troca é só da fonte dos quadros (window.__povixQuadros): o
// recorte, o filtro do verde, o Tesseract (vendor/), o casamento com os canais e os apelidos são os
// mesmos que correm com a Kick.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { pintarQuadros, abrirEventoComLance } from './quadros-pintados.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

test('lê os nomes de quadros pintados, casa pelo canal, pelo apelido do Discord e pelo apelido escrito, e só junta com um sim', { ...semNavegador, timeout: 240_000 }, async () => {
  const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
  await abrirEventoComLance(p, PORTA);
  // O apelido da planilha ficou só no aparelho, e não no evento lembrado nem no link.
  const guardado = await p.evaluate(() => ({ apelidos: localStorage.getItem('povix.apelidos'), evento: localStorage.getItem('povix.evento') || '' }));
  assert.deepEqual(JSON.parse(guardado.apelidos), { newtrc: ['Newt'] });
  assert.ok(!guardado.evento.includes('Newt'));

  await pintarQuadros(p);
  const antes = await p.locator('#verLanceTexto').innerText();
  await p.click('#nomesTela > summary');
  assert.match(await p.locator('#nomesGasto').innerText(), /13 quadros.*80 MB/);
  await p.selectOption('#nomesTrecho', '60');
  // O leitor só é pedido quando se carrega em Ler: até aqui, nenhum ficheiro do vendor/.
  const doLeitor = [];
  p.on('request', (r) => { if (r.url().includes('/vendor/tesseract/')) doLeitor.push(r.url().split('/').pop()); });
  assert.deepEqual(doLeitor, []);
  await p.click('#nomesLer');
  await p.waitForFunction(() => !document.getElementById('nomesLerTexto').textContent.includes('Parar'), null, { timeout: 200_000 });
  const estado = await p.locator('#nomesEstado').innerText();
  assert.match(estado, /13 quadros lidos, \d+ canais parecidos/);
  assert.ok(doLeitor.includes('tesseract-core-simd-lstm.wasm') && doLeitor.includes('eng.traineddata.gz'), doLeitor.join(','));
  // Os quadros pedidos foram os de tchubi, em volta do lance, no 1080p.
  const pedidos = await p.evaluate(() => window.__quadrosPedidos);
  assert.equal(pedidos.length, 13);
  assert.ok(pedidos.every((q) => q.qualidade === 1080 && q.master.includes('/tchubi/')));
  assert.equal(pedidos[0].ms, T + 5 * 60_000 - 30_000);

  const propostas = await p.$$eval('#nomesPropostas li', (l) => l.map((li) => ({
    canal: li.querySelector('b').textContent, texto: li.innerText, nivel: li.className,
  })));
  const canais = propostas.map((x) => x.canal);
  assert.ok(canais.includes('newtrc'), JSON.stringify(propostas));
  assert.ok(canais.includes('gatomia'), JSON.stringify(propostas));
  assert.ok(canais.includes('lontrafeliz'), JSON.stringify(propostas));
  assert.ok(!canais.includes('tchubi'), 'quem escolheu o lance não é proposto');
  assert.ok(!canais.includes('zebra99') && !canais.includes('outrocara'));
  assert.match(propostas.find((x) => x.canal === 'newtrc').texto, /apelido Newt/);
  // O que se leu está à vista: os recortes com o texto.
  assert.match(await p.locator('#nomesRecortesResumo').innerText(), /O que o leitor viu \(\d+ recortes\)/);
  const lido = (await p.$$eval('#nomesRecortes .lido', (l) => l.map((x) => x.textContent))).join('\n');
  assert.match(lido, /HOOLIGAN/);
  assert.match(lido, /GatoMia/);
  // HOOLIGAN não é canal nem apelido: fica nos nomes sem canal.
  const soltos = await p.$$eval('#nomesSoltos li b', (l) => l.map((x) => x.textContent));
  assert.ok(soltos.includes('HOOLIGAN'), soltos.join(','));

  // Nada entrou no lance sozinho.
  assert.equal(await p.locator('#verLanceTexto').innerText(), antes);
  await p.click('#nomesPropostas button[data-sim="newtrc"]');
  await p.click('#nomesPropostas button[data-nao="gatomia"]');
  assert.equal(await p.locator('#verLanceTexto').innerText(), 'Ver este lance com 2 ângulos');
  assert.match(await p.locator('#nomesPropostas li.sim').innerText(), /newtrc[\s\S]*Entra no lance/);
  assert.match(await p.locator('#nomesPropostas li.nao').innerText(), /gatomia[\s\S]*Recusado/);
  // Desfazer o não volta a deixar escolher.
  await p.click('#nomesPropostas button[data-desfazer="gatomia"]');
  assert.equal(await p.locator('#nomesPropostas button[data-sim="gatomia"]').count(), 1);

  // Dizer de quem é HOOLIGAN: vira apelido de zebra99 neste aparelho, e a proposta aparece sem ler de novo.
  const i = soltos.indexOf('HOOLIGAN');
  await p.fill(`#nomesSolto${i}`, 'zebra99');
  await p.click(`#nomesSoltos button[data-campo="nomesSolto${i}"]`);
  assert.match(await p.locator('#nomesEstado').innerText(), /HOOLIGAN agora é apelido de zebra99/);
  assert.ok(await p.locator('#nomesPropostas button[data-sim="zebra99"]').count() === 1);
  assert.deepEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('povix.apelidos'))), { newtrc: ['Newt'], zebra99: ['HOOLIGAN'] });
  assert.match(await p.locator('#nomesApelidosResumo').innerText(), /Apelidos neste aparelho \(2\)/);

  // Abrir o lance leva quem se confirmou.
  await p.click('#verLance');
  await p.waitForSelector('.tile', { timeout: 15000 });
  const abertos = await p.evaluate(() => window.__estado.linhas.map((l) => l.slug));
  assert.deepEqual(abertos.sort(), ['newtrc', 'tchubi']);
  assert.deepEqual(erros, []);
});

test('no celular: um apelido escrito à mão para um canal fora do lance é recusado, e um apelido sai com Tirar', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 390, height: 844 } });
  await abrirEventoComLance(p, PORTA);
  await p.click('#nomesTela > summary');
  await p.click('#nomesApelidosResumo');
  await p.fill('#nomesNovoCanal', 'naoexiste');
  await p.fill('#nomesNovoApelido', 'Fulano');
  await p.click('#nomesNovoGuardar');
  assert.match(await p.locator('#nomesEstado').innerText(), /Escreva um canal que estava no ar/);
  await p.fill('#nomesNovoCanal', 'gatomia');
  await p.fill('#nomesNovoApelido', 'Mia');
  await p.click('#nomesNovoGuardar');
  assert.match(await p.locator('#nomesApelidos').innerText(), /gatomia: Mia/);
  await p.click('#nomesApelidos button[data-slug="gatomia"]');
  assert.equal(await p.locator('#nomesApelidos li').count(), 1, 'sobra o Newt da planilha');
  // Sem horizontal a mais no celular.
  const largura = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 390, `a página tem ${largura} px de largura`);
  assert.deepEqual(erros, []);
});
