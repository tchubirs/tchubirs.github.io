// Os atalhos editáveis (o dono, 10/10: "Deveria ter uma forma de alterar todos atalhos igual editor,
// atribuir atalho a botões que não tem atalhos [...] cada tem do seu jeito").
//
// Primeiro as regras em Node (o que é uma tecla, quem a tem, conflitos, o que se guarda), depois a
// janela a sério: gravar carregando nas teclas, o aviso de conflito, o Esc que cancela, o Backspace
// que apaga, o padrão, a busca, o ficheiro para levar, e a tecla nova a fazer a acção na página.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import {
  ACOES, GRUPOS, criarAtalhos, comboDoEvento, normalizar, pedacos, ariaDe, CHAVE,
} from '../site/atalhos.js';
import { _TEXTOS } from '../site/idiomas.js';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

function armazem(inicial = {}) {
  const mem = { ...inicial };
  return { mem, getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
}
const tecla = (key, extra = {}) => ({ key, code: '', ...extra });

// ── as regras ────────────────────────────────────────────────────────────────

test('cada acção tem nome nas três línguas, um grupo, e teclas de fábrica sem dono repetido', () => {
  const ids = new Set();
  const usadas = new Map();
  const html = fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  for (const a of ACOES) {
    assert.ok(!ids.has(a.id), `id repetido: ${a.id}`);
    ids.add(a.id);
    assert.ok(GRUPOS.includes(a.grupo), `${a.id} num grupo que não existe`);
    for (const l of ['pt', 'en', 'es']) assert.ok(_TEXTOS[l][a.rotulo], `${a.id}: ${a.rotulo} sem texto em ${l}`);
    for (const c of a.padrao) {
      assert.equal(normalizar(c), c, `${a.id}: ${c} não está escrita como o resto`);
      assert.ok(!usadas.has(c), `${c} é de fábrica em ${usadas.get(c)} e em ${a.id}`);
      usadas.set(c, a.id);
    }
    if (a.botao) assert.match(html, new RegExp(`id="${a.botao}"`), `${a.id}: o botão #${a.botao} não existe`);
  }
  for (const g of [...GRUPOS, 'fixos']) {
    for (const l of ['pt', 'en', 'es']) assert.ok(_TEXTOS[l][`atalhos.grupo.${g}`], `grupo ${g} sem nome em ${l}`);
  }
  // Os botões que nunca tiveram tecla estão lá, à espera de uma.
  for (const id of ['canais', 'lerChat', 'detetar', 'mapa', 'exportarClipe', 'lanceSeguinte', 'lanceAnterior']) {
    assert.deepEqual(ACOES.find((a) => a.id === id)?.padrao, [], `${id} devia existir sem tecla de fábrica`);
  }
});

test('as teclas lêem-se sempre da mesma maneira', () => {
  assert.equal(comboDoEvento(tecla('k', { code: 'KeyK' })), 'K');
  assert.equal(comboDoEvento(tecla('K', { code: 'KeyK', shiftKey: true })), 'Shift+K');
  assert.equal(comboDoEvento(tecla('k', { code: 'KeyK', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+K');
  assert.equal(comboDoEvento(tecla('k', { code: 'KeyK', metaKey: true })), 'Ctrl+K', 'o Cmd do Mac é o Ctrl');
  // Com Alt no Mac a letra chega como outro carácter: vale a posição da tecla.
  assert.equal(comboDoEvento(tecla('˚', { code: 'KeyK', altKey: true })), 'Alt+K');
  assert.equal(comboDoEvento(tecla(' ', { code: 'Space' })), 'Space');
  // Um símbolo já traz o Shift dentro.
  assert.equal(comboDoEvento(tecla('?', { code: 'Slash', shiftKey: true })), '?');
  assert.equal(comboDoEvento(tecla('+', { code: 'Equal', shiftKey: true })), '+');
  // A vírgula e o ponto vão pela tecla: Shift+vírgula continua a ser a vírgula, com Shift.
  assert.equal(comboDoEvento(tecla('<', { code: 'Comma', shiftKey: true })), 'Shift+,');
  assert.equal(comboDoEvento(tecla('ArrowLeft', { code: 'ArrowLeft' })), 'ArrowLeft');
  // Um modificador sozinho ainda não é atalho.
  for (const k of ['Shift', 'Control', 'Alt', 'Meta']) assert.equal(comboDoEvento(tecla(k)), null);
  assert.deepEqual(pedacos('Ctrl+Shift+K'), ['Ctrl', 'Shift', 'K']);
  assert.deepEqual(pedacos('Ctrl++'), ['Ctrl', '+']);
  assert.deepEqual(pedacos('Space', (k) => (k === 'ajuda.teclaEspaco' ? 'Espaço' : k)), ['Espaço']);
  assert.equal(ariaDe('Ctrl+Shift+K'), 'Control+Shift+K');
  assert.equal(normalizar('ctrl+k'), null, 'os modificadores escrevem-se com maiúscula');
  assert.equal(normalizar('Shift+alt+K'), null);
  assert.equal(normalizar('Alt+k'), 'Alt+K');
  assert.equal(normalizar('<script>'), null);
});

test('a acção de uma tecla: a exacta primeiro, e com Shift a mesma sem ele', () => {
  const a = criarAtalhos(armazem());
  assert.deepEqual(a.acaoDe(tecla('j', { code: 'KeyJ' })), { id: 'voltar', combo: 'J', largo: false });
  // Shift+J é o J com o passo de 10 s, como sempre foi.
  assert.deepEqual(a.acaoDe(tecla('J', { code: 'KeyJ', shiftKey: true })), { id: 'voltar', combo: 'J', largo: true });
  assert.equal(a.acaoDe(tecla('<', { code: 'Comma', shiftKey: true })).id, 'ajusteMenos');
  assert.equal(a.acaoDe(tecla('?', { code: 'Slash', shiftKey: true })).id, 'atalhos');
  assert.equal(a.acaoDe(tecla('=', { code: 'Equal' })).id, 'zoomMais');
  assert.equal(a.acaoDe(tecla('k', { code: 'KeyK', ctrlKey: true })), null, 'Ctrl+K não é de ninguém');
  // Shift+J gravado à parte ganha ao J.
  a.atribuir('mapa', 'Shift+J');
  assert.equal(a.acaoDe(tecla('J', { code: 'KeyJ', shiftKey: true })).id, 'mapa');
  assert.equal(a.acaoDe(tecla('j', { code: 'KeyJ' })).id, 'voltar');
});

test('gravar, conflito, trocar, limpar, padrão: e só a diferença fica guardada', () => {
  const arm = armazem();
  const a = criarAtalhos(arm);
  assert.deepEqual(a.teclas('pausa'), ['Space', 'K']);
  assert.equal(arm.mem[CHAVE], undefined, 'sem mexer, nada a guardar');

  // Uma tecla livre para um botão que não tinha nenhuma.
  assert.deepEqual(a.atribuir('canais', 'Ctrl+Shift+G'), { ok: true, combo: 'Ctrl+Shift+G' });
  assert.deepEqual(a.teclas('canais'), ['Ctrl+Shift+G']);
  assert.deepEqual(JSON.parse(arm.mem[CHAVE]), { canais: ['Ctrl+Shift+G'] });

  // Uma tecla com dono não se rouba: devolve o conflito e nada muda.
  assert.deepEqual(a.atribuir('clipar', 'K'), { conflito: 'pausa', combo: 'K' });
  assert.deepEqual(a.teclas('clipar'), ['C']);
  assert.deepEqual(a.teclas('pausa'), ['Space', 'K']);

  // Trocar: o clipe fica com o K, e a pausa com o C que o clipe largou.
  const r = a.trocar('clipar', 'K');
  assert.equal(r.ok, true);
  assert.deepEqual(a.teclas('clipar'), ['K']);
  assert.deepEqual(a.teclas('pausa'), ['Space', 'C']);
  assert.equal(a.dono('K'), 'clipar');

  // Juntar uma segunda tecla, sem largar a primeira.
  a.atribuir('clipar', 'X', { modo: 'juntar' });
  assert.deepEqual(a.teclas('clipar'), ['K', 'X']);

  // As reservadas não se dão.
  assert.deepEqual(a.atribuir('mapa', 'Escape'), { erro: 'reservada' });
  assert.deepEqual(a.atribuir('mapa', 'Tab'), { erro: 'reservada' });

  // Backspace na janela: a acção fica sem tecla.
  a.limpar('marcarKill');
  assert.deepEqual(a.teclas('marcarKill'), []);
  assert.equal(a.dono('M'), null);

  // Voltar ao padrão uma: o K continua no clipe, e a pausa diz que não o recuperou.
  const v = a.padrao('pausa');
  assert.deepEqual(v.presas, [{ combo: 'K', outro: 'clipar' }]);
  assert.deepEqual(a.teclas('pausa'), ['Space']);
  assert.equal(a.ehPadrao('pausa'), false);

  // Um mapa novo com o mesmo armazém lê o mesmo.
  const b = criarAtalhos(arm);
  assert.deepEqual(b.teclas('clipar'), ['K', 'X']);
  assert.deepEqual(b.teclas('canais'), ['Ctrl+Shift+G']);

  // Tudo ao padrão: nada guardado.
  a.padraoTudo();
  assert.equal(arm.mem[CHAVE], undefined);
  assert.equal(a.algumMudado(), false);
  for (const x of ACOES) assert.deepEqual(a.teclas(x.id), x.padrao);
});

test('o ficheiro para levar: exportar, importar, e um ficheiro que não é recusado', () => {
  const a = criarAtalhos(armazem());
  a.atribuir('mapa', 'Alt+M');
  a.trocar('clipar', 'K');
  const texto = a.exportar();
  const lido = JSON.parse(texto);
  assert.equal(lido.povix, 'atalhos');
  assert.deepEqual(lido.teclas.mapa, ['Alt+M']);

  const arm = armazem();
  const b = criarAtalhos(arm);
  assert.equal(b.importar(texto), true);
  assert.deepEqual(b.teclas('mapa'), ['Alt+M']);
  assert.deepEqual(b.teclas('clipar'), ['K']);
  assert.deepEqual(b.teclas('pausa'), ['Space', 'C']);
  assert.ok(arm.mem[CHAVE], 'o importado ficou guardado');

  for (const mau of ['', 'nada', '[]', '{"teclas":{}}', '{"povix":"outra","teclas":{}}', '{"povix":"atalhos","teclas":[]}']) {
    assert.equal(b.importar(mau), false, `aceitou ${mau}`);
  }
  assert.deepEqual(b.teclas('mapa'), ['Alt+M'], 'um ficheiro mau não apagou nada');

  // Mexido à mão: a mesma tecla em duas acções fica só na primeira, e lixo não entra.
  const c = criarAtalhos(armazem());
  c.importar(JSON.stringify({ povix: 'atalhos', teclas: { mapa: ['G', 'Escape', 42, 'ctrl+x'], canais: ['G'], naoExiste: ['H'] } }));
  assert.deepEqual(c.teclas('mapa'), ['G']);
  assert.deepEqual(c.teclas('canais'), []);
});

test('um localStorage que rebenta não parte nada', () => {
  const partido = { getItem() { throw new Error('privado'); }, setItem() { throw new Error('cheio'); }, removeItem() { throw new Error('x'); } };
  const a = criarAtalhos(partido);
  assert.deepEqual(a.teclas('pausa'), ['Space', 'K']);
  assert.equal(a.atribuir('mapa', 'G').ok, true);
  assert.deepEqual(a.teclas('mapa'), ['G']);
  const b = criarAtalhos(armazem({ [CHAVE]: '{isto não é json' }));
  assert.deepEqual(b.teclas('pausa'), ['Space', 'K']);
  const c = criarAtalhos(null);
  assert.deepEqual(c.teclas('clipar'), ['C']);
});

// ── a janela, a sério ────────────────────────────────────────────────────────

async function abrirNoite(extra = {}) {
  const { p, erros } = await abrir(extra);
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi\noutro');
  await p.click('#carregar');
  await p.waitForSelector('.tile.foco .pausa', { timeout: 15000 });
  await p.click('.tile.foco .pausa');
  await p.waitForFunction(() => document.querySelector('.tile.foco .pausa use')?.getAttribute('href') === '#i-tocar',
    null, { timeout: 5000 });
  await p.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
  return { p, erros };
}
const linha = (p, id) => p.locator(`#listaAtalhos li[data-id="${id}"]`);
const teclasDe = async (p, id) => (await linha(p, id).locator('.atalhoTeclas').innerText()).replace(/\s+/g, ' ').trim();

test('o ? abre a lista por áreas, com busca, e a tecla de cada botão aparece na dica', semNavegador, async () => {
  const { p, erros } = await abrirNoite({ ecra: { width: 1440, height: 900 } });
  await p.keyboard.press('?');
  await p.waitForSelector('#modalAjuda:not([hidden])');
  const grupos = await p.locator('#listaAtalhos h3').allInnerTexts();
  assert.deepEqual(grupos, ['Assistir e andar no tempo', 'Marcar e cortar', 'Vista', 'Painéis e ferramentas', 'Tela do evento']);
  assert.equal(await p.locator('#listaAtalhos li').count(), ACOES.length);
  assert.equal(await teclasDe(p, 'pausa'), 'Espaço ou K');
  assert.equal(await teclasDe(p, 'canais'), 'sem atalho');
  // Cada linha diz ao leitor de ecrã o que faz e que teclas tem.
  assert.equal(await linha(p, 'pausa').locator('.atalhoTeclas').getAttribute('aria-label'), 'Pausar e continuar: Espaço ou K. Alterar');
  // A busca acha pelo nome e pela tecla, e sem acentos.
  await p.fill('#procurarAtalho', 'paineis');
  assert.equal(await p.locator('#listaAtalhos li').count(), 0);
  await p.fill('#procurarAtalho', 'painel canais');
  assert.equal(await p.locator('#listaAtalhos li').count(), 1);
  await p.fill('#procurarAtalho', 'saida');
  assert.deepEqual(await p.locator('#listaAtalhos li').evaluateAll((l) => l.map((x) => x.dataset.id)), ['marcarOut']);
  await p.fill('#procurarAtalho', 'zzz');
  assert.equal(await p.locator('#semAtalho').isVisible(), true);
  await p.fill('#procurarAtalho', '');
  // As dicas dos botões trazem a tecla, e o aria-keyshortcuts também.
  assert.match(await p.locator('#marcarKill').getAttribute('title'), /\(M\)$/);
  assert.equal(await p.locator('#marcarKill').getAttribute('aria-keyshortcuts'), 'M');
  assert.match(await p.locator('#ajuda').getAttribute('title'), /\(\?\)$/);
  assert.equal(await p.locator('#editarCanais').getAttribute('aria-keyshortcuts'), null);
  // O ? fecha outra vez.
  await p.locator('#listaAtalhos').click({ position: { x: 1, y: 1 } }).catch(() => {});
  await p.locator('#fecharAjuda').focus();
  await p.keyboard.press('?');
  await p.waitForSelector('#modalAjuda', { state: 'hidden' });
  assert.deepEqual(erros, []);
  await p.close();
});

test('gravar uma tecla nova, com Ctrl e Shift, e ela passa a fazer a acção', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.click('#ajuda');
  await linha(p, 'marcarKill').locator('.atalhoTeclas').click();
  assert.equal(await linha(p, 'marcarKill').getAttribute('class'), 'atalho aGravar');
  assert.equal(await teclasDe(p, 'marcarKill'), 'Aperte as teclas');
  // O Ctrl sozinho ainda não grava nada; Ctrl+Shift+K sim.
  await p.keyboard.down('Control');
  assert.equal(await teclasDe(p, 'marcarKill'), 'Aperte as teclas');
  await p.keyboard.press('Shift+K');
  await p.keyboard.up('Control');
  assert.equal(await teclasDe(p, 'marcarKill'), 'Ctrl + Shift + K');
  assert.match(await p.locator('#estadoAtalhos').innerText(), /Marcar kill: Ctrl \+ Shift \+ K/);
  // A janela continua aberta, e o foco na linha.
  assert.equal(await p.locator('#modalAjuda').isVisible(), true);
  assert.equal(await p.evaluate(() => document.activeElement.closest('li')?.dataset.id), 'marcarKill');
  // Guardado neste aparelho.
  assert.deepEqual(JSON.parse(await p.evaluate(() => localStorage.getItem('replay.atalhos'))), { marcarKill: ['Ctrl+Shift+K'] });
  await p.keyboard.press('Escape');
  await p.waitForSelector('#modalAjuda', { state: 'hidden' });

  // A tecla nova marca a kill, e a velha já não.
  const antes = await p.evaluate(() => window.__estado.momentos.length);
  await p.locator('body').press('m');
  assert.equal(await p.evaluate(() => window.__estado.momentos.length), antes);
  await p.locator('body').press('Control+Shift+K');
  assert.equal(await p.evaluate(() => window.__estado.momentos.length), antes + 1);
  // O botão diz a tecla nova, na dica e na tecla desenhada nele.
  assert.match(await p.locator('#marcarKill').getAttribute('title'), /\(Ctrl \+ Shift \+ K\)$/);
  assert.equal(await p.locator('#marcarKill kbd').innerText(), 'Ctrl+Shift+K');

  // Depois de recarregar, continua.
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  assert.match(await p.locator('#marcarKill').getAttribute('title'), /Ctrl \+ Shift \+ K/);
  assert.deepEqual(erros, []);
  await p.close();
});

test('um botão sem atalho ganha um, e não dispara enquanto se escreve', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.click('#ajuda');
  await linha(p, 'canais').click({ position: { x: 20, y: 10 } });
  await p.keyboard.press('g');
  assert.equal(await teclasDe(p, 'canais'), 'G');
  await p.keyboard.press('Escape');
  await p.waitForSelector('#modalAjuda', { state: 'hidden' });
  assert.equal(await p.locator('#editarCanais').getAttribute('aria-keyshortcuts'), 'G');
  await p.locator('body').press('g');
  assert.equal(await p.evaluate(() => document.body.classList.contains('canaisAbertos')), true, 'o G não abriu os Canais');
  // O foco foi para a caixa de procurar: escrever "g" é letra, e o painel fica aberto.
  await p.click('#procurar');
  await p.keyboard.type('gg');
  assert.equal(await p.evaluate(() => document.body.classList.contains('canaisAbertos')), true, 'o G fechou o painel a meio da escrita');
  assert.equal(await p.inputValue('#procurar'), 'gg');
  assert.deepEqual(erros, []);
  await p.close();
});

test('conflito: diz de quem é a tecla e pergunta; Trocar troca, Cancelar não muda nada', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.click('#ajuda');
  await linha(p, 'clipar').locator('.atalhoTeclas').click();
  await p.keyboard.press('k');
  await p.waitForSelector('#conflitoAtalho:not([hidden])');
  assert.equal(await p.locator('#conflitoTexto').innerText(), 'K já é usada em Pausar e continuar.');
  assert.equal(await p.locator('#conflitoDepois').innerText(), 'Se trocar, Abrir o clipe fica com ela e Pausar e continuar passa a usar Espaço ou C.');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'trocarAtalho', 'o foco não foi para a decisão');
  // Cancelar: nada mudou.
  await p.click('#cancelarAtalho');
  assert.equal(await p.locator('#conflitoAtalho').isVisible(), false);
  assert.equal(await teclasDe(p, 'clipar'), 'C');
  assert.equal(await teclasDe(p, 'pausa'), 'Espaço ou K');
  // O Esc também cancela o conflito, sem fechar a janela.
  await linha(p, 'clipar').locator('.atalhoTeclas').click();
  await p.keyboard.press('k');
  await p.waitForSelector('#conflitoAtalho:not([hidden])');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#conflitoAtalho').isVisible(), false);
  assert.equal(await p.locator('#modalAjuda').isVisible(), true);
  // Trocar.
  await linha(p, 'clipar').locator('.atalhoTeclas').click();
  await p.keyboard.press('k');
  await p.click('#trocarAtalho');
  assert.equal(await teclasDe(p, 'clipar'), 'K');
  assert.equal(await teclasDe(p, 'pausa'), 'Espaço ou C');
  assert.match(await p.locator('#estadoAtalhos').innerText(), /K agora é de Abrir o clipe/);
  await p.keyboard.press('Escape');
  await p.waitForSelector('#modalAjuda', { state: 'hidden' });
  // O K abre o clipe, e o C pausa.
  await p.locator('body').press('c');
  assert.equal(await p.evaluate(() => window.__estado.parado), false, 'o C não continuou o vídeo');
  await p.locator('body').press('k');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 5000 });
  assert.deepEqual(erros, []);
  await p.close();
});

test('Esc cancela a gravação, Backspace apaga, e o padrão volta por linha e para tudo', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.click('#ajuda');
  // Esc a meio de gravar: nada muda e a janela fica.
  await linha(p, 'ecraCheio').locator('.atalhoTeclas').click();
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#modalAjuda').isVisible(), true);
  assert.equal(await teclasDe(p, 'ecraCheio'), 'F');
  assert.equal(await p.locator('#estadoAtalhos').innerText(), 'Nada mudou.');
  // Backspace: sem atalho.
  await linha(p, 'ecraCheio').locator('.atalhoTeclas').click();
  await p.keyboard.press('Backspace');
  assert.equal(await teclasDe(p, 'ecraCheio'), 'sem atalho');
  assert.equal(await linha(p, 'ecraCheio').locator('[data-acao="padrao"]').isDisabled(), false);
  // Juntar uma segunda tecla à pausa.
  await linha(p, 'pausa').locator('[data-acao="juntar"]').click();
  await p.keyboard.press('p');
  assert.equal(await teclasDe(p, 'pausa'), 'Espaço ou K ou P');
  // O padrão de uma linha.
  await linha(p, 'ecraCheio').locator('[data-acao="padrao"]').click();
  assert.equal(await teclasDe(p, 'ecraCheio'), 'F');
  assert.equal(await linha(p, 'ecraCheio').locator('[data-acao="padrao"]').isDisabled(), true);
  // E de tudo.
  assert.equal(await p.locator('#padraoTodos').isDisabled(), false);
  await p.click('#padraoTodos');
  assert.equal(await teclasDe(p, 'pausa'), 'Espaço ou K');
  assert.equal(await p.locator('#padraoTodos').isDisabled(), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('replay.atalhos')), null);
  assert.deepEqual(erros, []);
  await p.close();
});

test('só com o teclado: Tab até à linha, Enter grava, e o foco nunca sai da janela', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.focus('#ajuda');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#modalAjuda:not([hidden])');
  let achou = false;
  for (let i = 0; i < 12 && !achou; i++) {
    await p.keyboard.press('Tab');
    achou = await p.evaluate(() => document.activeElement.classList.contains('atalhoTeclas'));
  }
  assert.ok(achou, 'o Tab não chegou às linhas');
  const id = await p.evaluate(() => document.activeElement.closest('li').dataset.id);
  // O anel de foco vê-se.
  const anel = await p.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
  assert.notEqual(anel, 'none', 'a linha em foco não mostra o anel');
  await p.keyboard.press('Enter');
  assert.equal(await linha(p, id).getAttribute('class'), 'atalho aGravar');
  await p.keyboard.press('Alt+9');
  assert.equal(await teclasDe(p, id), 'Alt + 9');
  for (let i = 0; i < ACOES.length * 3 + 10; i++) await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.getElementById('modalAjuda').contains(document.activeElement)), true);
  assert.deepEqual(erros, []);
  await p.close();
});

test('exportar e importar o perfil num ficheiro', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.click('#ajuda');
  await linha(p, 'mapa').locator('.atalhoTeclas').click();
  await p.keyboard.press('Shift+M');
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('#exportarAtalhos')]);
  assert.equal(descarga.suggestedFilename(), 'povix-atalhos.json');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atalhos-'));
  const ficheiro = path.join(dir, 'povix-atalhos.json');
  await descarga.saveAs(ficheiro);
  assert.deepEqual(JSON.parse(fs.readFileSync(ficheiro, 'utf8')).teclas.mapa, ['Shift+M']);
  // Tudo ao padrão, e depois o ficheiro devolve o perfil.
  await p.click('#padraoTodos');
  assert.equal(await teclasDe(p, 'mapa'), 'sem atalho');
  await p.setInputFiles('#ficheiroAtalhos', ficheiro);
  await p.waitForFunction(() => /importados/.test(document.getElementById('estadoAtalhos').textContent));
  assert.equal(await teclasDe(p, 'mapa'), 'Shift + M');
  // Um ficheiro que não é de atalhos diz o que fazer, e não muda nada.
  const mau = path.join(dir, 'mau.json');
  fs.writeFileSync(mau, '{"ola":1}');
  await p.setInputFiles('#ficheiroAtalhos', mau);
  await p.waitForFunction(() => /não é de atalhos/.test(document.getElementById('estadoAtalhos').textContent));
  assert.equal(await teclasDe(p, 'mapa'), 'Shift + M');
  assert.deepEqual(erros, []);
  await p.close();
});

test('nas três línguas, e no telemóvel sem nada a sair para o lado', semNavegador, async () => {
  for (const [idioma, titulo] of [['en', 'Watch and move in time'], ['es', 'Ver y moverse en el tiempo']]) {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 }, idioma });
    await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.click('#ajuda');
    assert.equal(await p.locator('#listaAtalhos h3').first().innerText(), titulo);
    const larga = await p.evaluate(() => {
      const caixa = document.querySelector('#modalAjuda .modalCaixa');
      const fora = [...caixa.querySelectorAll('*')].filter((el) => el.getClientRects().length
        && el.getBoundingClientRect().right > window.innerWidth + 0.5);
      return { rola: caixa.scrollWidth > caixa.clientWidth, fora: fora.map((el) => el.className || el.tagName).slice(0, 5) };
    });
    assert.equal(larga.rola, false, `${idioma}: a janela rola para o lado`);
    assert.deepEqual(larga.fora, [], `${idioma}: há coisas a sair do ecrã`);
    // Os botões das linhas dão para o dedo.
    const alto = await linha(p, 'pausa').locator('[data-acao="padrao"]').evaluate((b) => b.getBoundingClientRect().height);
    assert.ok(alto >= 40, `botão de ${alto}px`);
    assert.deepEqual(erros, []);
    await p.close();
  }
});
