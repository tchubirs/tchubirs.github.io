// O teclado, o foco e o que o leitor de ecrã ouve.
//
// Cada teste aqui nasceu de um defeito visto: atalhos que disparavam com o
// Ctrl carregado, um espaço que roubava o clique dos botões, uma busca que
// acrescentava o canal de uma lista antiga, um botão de som que se chamava
// "pausar". O palco é o mesmo dos outros testes de página.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { _TEXTOS } from '../site/idiomas.js';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function abrirNoite(canais = ['tchubi', 'outro'], extra = {}) {
  const { p, erros } = await abrir(extra);
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  return { p, erros };
}
async function carregar(p, canais = ['tchubi', 'outro']) {
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile.foco .pausa', { timeout: 15000 });
}
// O relógio do ecrã em segundos: é o que a pessoa vê andar.
const segundos = async (p) => {
  const [h, m, s] = (await p.locator('#agora').innerText()).replace('Z', '').split(':').map(Number);
  return h * 3600 + m * 60 + s;
};
async function pausar(p) {
  await p.click('.tile.foco .pausa');
  await p.waitForFunction(() => document.querySelector('.tile.foco .pausa use')?.getAttribute('href') === '#i-tocar',
    null, { timeout: 5000 });
}

test('o Enter da busca nunca acrescenta um canal de uma lista que já não se vê', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.fill('#canais', '');
  await p.click('#procurar');
  await p.keyboard.type('tchu');
  await p.waitForSelector('#sugestoes li', { timeout: 5000 });
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('ArrowDown');
  // A escolha tem de se ver, e o leitor de ecrã tem de saber qual é.
  const fundo = await p.locator('#sugestoes li[aria-selected="true"]')
    .evaluate((li) => getComputedStyle(li).backgroundColor);
  assert.notEqual(fundo, 'rgba(0, 0, 0, 0)', 'a linha escolhida com as setas não se distinguia das outras');
  assert.equal(await p.locator('#sugestoes').getAttribute('role'), 'listbox');
  const ativo = await p.locator('#procurar').getAttribute('aria-activedescendant');
  assert.ok(ativo, 'a caixa não diz qual sugestão está escolhida');
  assert.equal(await p.locator(`#${ativo}`).getAttribute('data-slug'), 'tchubizinho');
  await p.keyboard.press('Enter');
  assert.equal(await p.inputValue('#canais'), 'tchubizinho');

  // Caixa vazia: o Enter não pode ir buscar o primeiro da lista de antes.
  await p.keyboard.press('Enter');
  assert.equal(await p.inputValue('#canais'), 'tchubizinho', 'o Enter na caixa vazia acrescentou um canal');

  // Escrever e carregar no Enter antes de a busca nova chegar: vai o que se escreveu.
  await p.keyboard.type('outr');
  await p.keyboard.press('Enter');
  assert.equal(await p.inputValue('#canais'), 'tchubizinho\noutr');

  // O nome exato ganha ao mais seguido.
  await p.fill('#canais', '');
  await p.click('#procurar');
  await p.keyboard.type('tchubizinho');
  await p.waitForSelector('#sugestoes li[data-slug="tchubi"]', { timeout: 5000 });
  await p.keyboard.press('Enter');
  assert.equal(await p.inputValue('#canais'), 'tchubizinho');
  assert.deepEqual(erros, []);
  await p.close();
});

test('as teclas antes de haver noite não rebentam, e o espaço não deixa a noite parada', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await p.click('h1, header, body', { position: { x: 5, y: 5 } }).catch(() => {});
  for (const k of ['ArrowRight', 'ArrowLeft', 'l', 'j', 'd', 'a', ' ']) await p.keyboard.press(k);
  await p.waitForTimeout(200);
  assert.deepEqual(erros, [], 'uma tecla na página vazia rebentou');
  await carregar(p);
  await p.waitForTimeout(300);
  assert.equal(await p.locator('.tile.foco .pausa use').getAttribute('href'), '#i-pausa',
    'o espaço carregado antes de abrir deixou a noite parada');
  assert.deepEqual(erros, []);
  await p.close();
});

test('o Shift dá dez segundos ao J e ao L, e o Ctrl não dispara atalho nenhum', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await pausar(p);
  const antes = await segundos(p);
  await p.keyboard.press('Shift+KeyL');
  assert.equal(await segundos(p) - antes, 10, 'Shift+L devia andar dez segundos');
  await p.keyboard.press('Shift+KeyJ');
  assert.equal(await segundos(p) - antes, 0, 'Shift+J devia voltar dez segundos');

  await p.keyboard.press('Control+KeyC');
  await p.keyboard.press('Control+KeyL');
  await p.keyboard.press('Control+KeyA');
  await p.keyboard.up('a');
  await p.waitForTimeout(200);
  assert.equal(await p.locator('#modalClipe').isHidden(), true, 'o Ctrl+C abriu o editor de clipe');
  assert.equal(await segundos(p), antes, 'o Ctrl+L ou o Ctrl+A andaram com o tempo');
  assert.deepEqual(erros, []);
  await p.close();
});

test('o espaço num botão a que se chegou pelo Tab carrega o botão, e não a pausa', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await pausar(p);
  // Chegar ao Marcar kill pelo teclado, de Tab em Tab.
  for (let i = 0; i < 200; i++) {
    if (await p.evaluate(() => document.activeElement.id) === 'marcarKill') break;
    await p.keyboard.press('Tab');
  }
  assert.equal(await p.evaluate(() => document.activeElement.id), 'marcarKill');
  await p.keyboard.press(' ');
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 1,
    null, { timeout: 5000 });
  assert.equal(await p.locator('.tile.foco .pausa use').getAttribute('href'), '#i-tocar',
    'o espaço no botão mudou a pausa');
  assert.deepEqual(erros, []);
  await p.close();
});

test('depois de mexer na barra do tempo os atalhos continuam a funcionar', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await p.click('#barra');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'barra');
  await p.keyboard.press('m');
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 1,
    null, { timeout: 5000 });
  assert.deepEqual(erros, []);
  await p.close();
});

test('com um seletor em foco os atalhos continuam a funcionar, e a letra não muda a escolha', semNavegador, async () => {
  // O zoom, o filtro das kills e a noite ficam com o foco depois de se
  // escolher com o rato. Contá-los como caixas de escrever matava o M, o J, o
  // L e o resto até se clicar noutro sítio, o mesmo defeito da barra do tempo.
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await pausar(p);
  await p.focus('#zoomTempo');
  await p.selectOption('#zoomTempo', '3600');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'zoomTempo');
  await p.keyboard.press('m');
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 1,
    null, { timeout: 5000 });
  // O A é atalho e também a primeira letra de "a noite toda": manda o atalho,
  // e o zoom fica onde estava.
  const antesA = await segundos(p);
  await p.keyboard.press('a');
  await p.waitForFunction((t) => {
    const [h, m, s] = document.querySelector('#agora').innerText.replace('Z', '').split(':').map(Number);
    return h * 3600 + m * 60 + s < t;
  }, antesA, { timeout: 5000 });
  assert.equal(await p.inputValue('#zoomTempo'), '3600');
  await p.focus('#filtroMomentos');
  const antes = await segundos(p);
  await p.keyboard.press('l');
  await p.waitForFunction((t) => {
    const [h, m, s] = document.querySelector('#agora').innerText.replace('Z', '').split(':').map(Number);
    return h * 3600 + m * 60 + s === t + 1;
  }, antes, { timeout: 5000 });
  assert.deepEqual(erros, []);
  await p.close();
});

test('o Esc fecha o editor de clipe mesmo a escrever o título', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await p.keyboard.press('c');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 5000 });
  await p.focus('#tituloClipe');
  await p.keyboard.press('Escape');
  await p.waitForSelector('#modalClipe', { state: 'hidden', timeout: 5000 });
  assert.deepEqual(erros, []);
  await p.close();
});

test('as janelas levam o foco, prendem o Tab e devolvem-no ao fechar', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await p.focus('#ajuda');
  await p.keyboard.press('Enter');
  await p.waitForSelector('#modalAjuda:not([hidden])');
  assert.equal(await p.evaluate(() => document.getElementById('modalAjuda').contains(document.activeElement)), true,
    'a janela de atalhos abriu e o foco ficou na página de trás');
  for (let i = 0; i < 6; i++) await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.getElementById('modalAjuda').contains(document.activeElement)), true,
    'o Tab saiu da janela de atalhos');
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'ajuda', 'o foco não voltou ao botão que a abriu');

  await p.keyboard.press('c');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 5000 });
  assert.equal(await p.evaluate(() => document.getElementById('modalClipe').contains(document.activeElement)), true);
  for (let i = 0; i < 40; i++) await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.getElementById('modalClipe').contains(document.activeElement)), true,
    'o Tab saiu do editor de clipe para a página de trás');
  assert.deepEqual(erros, []);
  await p.close();
});

test('o botão do som chama-se som, e o volume diz-se na língua da página', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  const nome = await p.locator('.tile.foco .somBtn').getAttribute('aria-label');
  assert.notEqual(nome, _TEXTOS.pt['tile.pausa']);
  assert.ok([_TEXTOS.pt['tile.calar'], _TEXTOS.pt['tile.ligarSom']].includes(nome), nome);
  assert.equal(await p.locator('.tile.foco .somBtn').getAttribute('title'), nome);
  await p.locator('.tile.foco .somBtn').click();
  assert.equal(await p.locator('.tile.foco .somBtn').getAttribute('aria-label'),
    await p.locator('.tile.foco .somBtn').getAttribute('title'));
  assert.equal(await p.locator('.tile.foco .vol').getAttribute('aria-label'), _TEXTOS.pt['tile.volume']);
  await p.selectOption('#idioma', 'en');
  await p.waitForFunction(() => document.documentElement.lang.startsWith('en'), null, { timeout: 5000 }).catch(() => {});
  assert.equal(await p.locator('#idioma').getAttribute('aria-label'), _TEXTOS.en['idioma.rotulo']);
  const nomeEn = await p.locator('.tile.foco .somBtn').getAttribute('aria-label');
  assert.ok([_TEXTOS.en['tile.calar'], _TEXTOS.en['tile.ligarSom']].includes(nomeEn), nomeEn);
  assert.deepEqual(erros, []);
  await p.close();
});

test('um ecrã cheio recusado não parte os saltos no tempo', semNavegador, async () => {
  const { p, erros } = await abrir();
  await p.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('recusado'));
  });
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await carregar(p);
  await pausar(p);
  await p.locator('.tile.foco .ecraCheio').click();
  await p.waitForSelector('.tile.foco .recado', { timeout: 5000 });
  assert.equal(await p.locator('.tile.foco .recado').innerText(), _TEXTOS.pt['tile.semEcraCheio'],
    'na janela principal o recado culpava a janela à parte');
  const antes = await segundos(p);
  await p.click('#mais3s');
  assert.equal(await segundos(p) - antes, 3);
  assert.equal(await p.locator('.tile.foco .posicao').count(), 1, 'o rótulo perdeu a posição');
  assert.deepEqual(erros, [], 'o salto rebentou com o recado no ecrã');
  await p.close();
});

test('a confiança do alinhamento tem cor', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  await carregar(p);
  await p.waitForSelector('#confianca:not(:empty)');
  const [cor, ok] = await p.evaluate(() => {
    const prova = document.createElement('span');
    prova.style.color = 'var(--ok)';
    document.body.append(prova);
    return [getComputedStyle(document.getElementById('confianca')).color, getComputedStyle(prova).color];
  });
  assert.equal(cor, ok, 'o caso bom saía no mesmo cinzento do caso mau');
  assert.deepEqual(erros, []);
  await p.close();
});

test('os botões de partilhar e de sincronizar guardam o ícone', semNavegador, async () => {
  const { p, erros } = await abrirNoite();
  for (const id of ['partilhar', 'alinhar']) {
    assert.equal(await p.locator(`#${id} svg`).count(), 1, `#${id} perdeu o ícone`);
    const texto = (await p.locator(`#${id}`).evaluate((b) => b.textContent)).trim();
    assert.equal(texto, _TEXTOS.pt[`${id === 'partilhar' ? 'partilha' : 'alinhar'}.botao`], `#${id} diz o nome duas vezes`);
  }
  assert.deepEqual(erros, []);
  await p.close();
});

test('os botões escondidos de uma miniatura não se deixam tocar', semNavegador, async () => {
  const { p, erros } = await abrirNoite(['tchubi', 'outro'], { ecra: { width: 412, height: 915 } });
  // Um telemóvel: sem hover. É aí que o toque cai num botão que não se vê.
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  assert.equal(await p.evaluate(() => matchMedia('(hover: none)').matches), true);
  await carregar(p);
  await p.mouse.move(0, 0);
  const acerta = await p.evaluate(() => {
    const b = document.querySelector('#grade .tile:not(.foco) .ajuste button[data-passo="1"]');
    if (!b) return 'sem botão';
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el === b || b.contains(el);
  });
  assert.equal(acerta, false, 'o + invisível da miniatura recebia o toque');
  assert.deepEqual(erros, []);
  await p.close();
});

test('as mensagens de estado são anunciadas, e o link partilhado leva imagem', () => {
  const html = fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  for (const id of ['estadoCarga', 'estadoAlinhar', 'estadoMontagem', 'estadoClipe', 'estadoSelecao']) {
    const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] || '';
    assert.match(tag, /aria-live="polite"|<output/, `#${id} não é anunciado`);
  }
  const imagem = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert.match(imagem, /^https:\/\//, 'o og:image relativo não chega ao Discord nem ao WhatsApp');
  assert.match(html, /name="twitter:image"/);
});

test('o recado sem gravador aponta para um botão que existe', () => {
  for (const l of ['pt', 'en', 'es']) {
    assert.ok(_TEXTOS[l]['retrato.semGravador'].includes(_TEXTOS[l]['clipe.guardar']),
      `${l}: "${_TEXTOS[l]['retrato.semGravador']}" não diz "${_TEXTOS[l]['clipe.guardar']}"`);
  }
  assert.match(_TEXTOS.es['link.naoPercebi'], /entendí/);
  assert.match(_TEXTOS.es['link.naoPercebi'], /dirección/);
});

test('o Esc fecha o painel Canais e devolve o foco ao botão que o abriu', semNavegador, async () => {
  for (const ecra of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const { p, erros } = await abrirNoite(['tchubi', 'outro'], { ecra });
    await carregar(p);
    await p.click('#editarCanais');
    assert.equal(await p.locator('#canais').isVisible(), true, `${ecra.width}: o painel não abriu`);
    // O foco está numa caixa de escrever do painel: o Esc tem de fechar mesmo assim.
    assert.equal(await p.evaluate(() => document.activeElement?.closest('#entrada') != null), true);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#canais').isVisible(), false, `${ecra.width}: o Esc não fechou o painel`);
    assert.equal(await p.locator('#editarCanais').getAttribute('aria-expanded'), 'false');
    assert.equal(await p.evaluate(() => document.activeElement?.id), 'editarCanais', 'o foco não voltou ao botão');

    // Com as sugestões da busca abertas, o primeiro Esc fecha só as sugestões.
    await p.click('#editarCanais');
    await p.click('#procurar');
    await p.keyboard.type('tchu');
    await p.waitForSelector('#sugestoes li', { timeout: 5000 });
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#sugestoes').isVisible(), false);
    assert.equal(await p.locator('#canais').isVisible(), true, 'o Esc das sugestões fechou o painel junto');
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#canais').isVisible(), false);

    // Com a janela de atalhos aberta por cima, o Esc é dela.
    await p.click('#editarCanais');
    await p.click('#ajuda');
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#modalAjuda').isVisible(), false);
    assert.equal(await p.locator('#canais').isVisible(), true, 'o Esc da janela fechou também o painel');
    assert.deepEqual(erros, []);
    await p.close();
  }
});

test('o F põe o vídeo em foco em tela cheia, e só com a tecla sozinha', semNavegador, async () => {
  const { p, erros } = await abrir();
  await p.addInitScript(() => {
    window.__telaCheia = [];
    Element.prototype.requestFullscreen = function () {
      window.__telaCheia.push(this.dataset.slug || this.id || this.tagName);
      return Promise.resolve();
    };
  });
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  // Antes de haver noite o F não faz nada nem rebenta.
  await p.locator('body').press('f');
  await carregar(p);
  await pausar(p);
  const foco = await p.locator('#palcoFoco .tile').first().getAttribute('data-slug');
  await p.locator('body').press('f');
  assert.deepEqual(await p.evaluate(() => window.__telaCheia), [foco], 'o F não pediu tela cheia do vídeo em foco');
  // Com o Shift (ou o Caps Lock) chega um F maiúsculo: é a mesma tecla.
  await p.locator('body').press('Shift+F');
  assert.equal(await p.evaluate(() => window.__telaCheia.length), 2);
  // Ctrl+F é procurar na página, e numa caixa de escrever o F é letra.
  await p.locator('body').press('Control+f');
  await p.click('#editarCanais');
  await p.click('#procurar');
  await p.keyboard.type('f');
  assert.equal(await p.evaluate(() => window.__telaCheia.length), 2, 'o F disparou com Ctrl ou numa caixa de texto');
  // Os outros atalhos continuam onde estavam: o M ainda marca a kill.
  await p.keyboard.press('Escape');
  const antes = await p.evaluate(() => window.__estado.momentos.length);
  await p.locator('body').press('m');
  assert.equal(await p.evaluate(() => window.__estado.momentos.length), antes + 1);
  // E está na lista de atalhos, nas três línguas.
  assert.equal(await p.locator('#modalAjuda [data-t="ajuda.ecraCheio"]').count(), 1);
  for (const l of ['pt', 'en', 'es']) assert.ok(_TEXTOS[l]['ajuda.ecraCheio'], `${l} sem ajuda.ecraCheio`);
  assert.deepEqual(erros, []);
  await p.close();
});

test('o vídeo grande diz que o ajuste é a sincronia, e mostra-o sem o rato em cima', semNavegador, async () => {
  const { p, erros } = await abrirNoite(['tchubi', 'outro'], { ecra: { width: 1440, height: 900 } });
  await carregar(p);
  await p.mouse.move(0, 0);
  const rotulo = p.locator('#palcoFoco .tile .rotuloAjuste').first();
  assert.equal(await rotulo.isVisible(), true);
  assert.equal(await rotulo.innerText(), _TEXTOS.pt['tile.sincronia']);
  const opacidade = await p.locator('#palcoFoco .tile .ajuste').first().evaluate((el) => getComputedStyle(el).opacity);
  assert.equal(opacidade, '1', 'o ajuste do vídeo grande só aparecia com o rato em cima');
  // O Marcar kill deixou de ser um segundo botão cheio ao lado do Clipar.
  assert.equal(await p.locator('#marcarKill.principal').count(), 0);
  assert.equal(await p.locator('#clipar.principal').count(), 1);
  assert.deepEqual(erros, []);
  await p.close();
});

test('o aviso de leitor quebrado aparece com o painel Canais fechado', () => {
  const html = fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const entrada = html.slice(html.indexOf('<section id="entrada"'), html.indexOf('</section>', html.indexOf('<section id="entrada"')));
  assert.equal(entrada.includes('id="avisoPlayer"'), false, 'o aviso ainda vive dentro da porta de entrada');
});

test('no celular, com o vídeo aberto, a trilha 1 2 3 sai da frente', semNavegador, async () => {
  const { p, erros } = await abrirNoite(['tchubi', 'outro'], { ecra: { width: 390, height: 844 } });
  assert.equal(await p.locator('#passos').isVisible(), true, 'antes do vídeo os passos guiam');
  await carregar(p);
  assert.equal(await p.locator('#passos').isVisible(), false);
  assert.equal(await p.evaluate(() => document.body.classList.contains('videoAberto')), true,
    'sem a classe, um navegador sem :has() perde a arrumação da tela do vídeo');
  assert.deepEqual(erros, []);
  await p.close();
});
