// Os filtros da detecção automática, num browser a sério: o painel Filtros na barra da faixa, o que
// cada filtro marcado faz entrar no resultado, e as escolhas guardadas no aparelho.
//
// O dono, 10/10: "a pessoa coloca informações específicas, ex: palavras no chat, ou palavras do
// streamer, ou estouros de rocket, ou de disparo, ou gritos do streamer".
//
// A Kick é a de test/falsa.mjs (o chat do tchubi tem um surto de "kkk" no minuto 5). O som é fingido
// como em fix-deteccao.test.mjs: este Chromium não descodifica AAC.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const comNavegador = { skip: !podeCorrer && 'sem navegador' };

/** A varredura fingida: tiros, explosões e gritos a `s` segundos do início, e os filtros que lhe pediram. */
async function varreduraFalsa(p, { tiros = [], explosoes = [], gritos = [] } = {}) {
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      export function custoVarrerMB() { return 1; }
      export async function varrerNoite(o) {
        window.__varrer = { canal: o.linha.slug, filtros: o.filtros };
        const em = (s) => ({ ms: o.deMs + s * 1000, combateDeMs: o.deMs + s * 1000 - 1000, combateAteMs: o.deMs + s * 1000 + 2000 });
        const f = o.filtros || { tiros: true };
        return {
          ouvido: { altos: 0, chumbados: 0, passaram: 0, maiorGrupo: 0 },
          estouros: [], falhados: 0, bytes: 0,
          candidatos: f.tiros === false ? [] : ${JSON.stringify(tiros)}.map((s) => ({ ...em(s), tiros: 3 })),
          explosoes: f.explosoes ? ${JSON.stringify(explosoes)}.map(em) : [],
          gritos: f.gritos ? ${JSON.stringify(gritos)}.map(em) : [],
        };
      }`,
  }));
}

async function abrirNoite(p, canais = ['tchubi']) {
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 });
}

/** Abrir a barra da faixa de `quem` e o painel Filtros. */
async function abrirFiltros(p, quem = 'tchubi') {
  await p.click(`#faixas button.nome[data-quem="${quem}"]`);
  await p.waitForSelector('#acoesFaixa:not([hidden])');
  if (!await p.locator('#filtrosDetecao').evaluate((d) => d.open)) await p.click('#filtrosDetecao > summary');
  await p.waitForSelector('#filtroTiros', { state: 'visible' });
}

async function detectarTudo(p) {
  await p.click('#detetarTudo');
  await p.waitForFunction(() => window.__estado.varredura === null
    && /momento|tiroteio|Nenhum|Marque|Escreva/.test(document.getElementById('estadoChatTrecho').textContent)
    && !/Ouvindo|Lendo|Identificando/.test(document.getElementById('estadoChatTrecho').textContent),
  null, { timeout: 20000 });
  return p.locator('#estadoChatTrecho').innerText();
}

test('o painel Filtros abre e fecha, vem com os tiros marcados, e a fala aparece desligada com o porquê',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await abrirNoite(p);
    await p.click('#faixas button.nome[data-quem="tchubi"]');
    await p.waitForSelector('#acoesFaixa:not([hidden])');
    // Fechado por omissão: quem nunca o abriu detecta como sempre.
    assert.equal(await p.locator('#filtrosDetecao').evaluate((d) => d.open), false);
    assert.equal(await p.locator('#filtrosResumo').innerText(), 'tiros');
    await p.click('#filtrosDetecao > summary');
    assert.equal(await p.locator('#filtroTiros').isChecked(), true);
    for (const id of ['filtroExplosoes', 'filtroGritos', 'filtroChat']) {
      assert.equal(await p.locator(`#${id}`).isChecked(), false, id);
    }
    // A fala: visível, desligada, e a frase que diz porquê é o que a descreve.
    assert.equal(await p.locator('#filtroFala').isVisible(), true);
    assert.equal(await p.locator('#filtroFala').isDisabled(), true);
    assert.match(await p.locator('#filtroFalaAjuda').innerText(), /^Ainda não existe: .*voz em texto/);
    // O grito diz que é aproximado, e que a risada pode contar.
    assert.match(await p.locator('#filtroGritosAjuda').innerText(), /Aproximado: uma risada alta também pode contar/);
    // Os nomes acessíveis: cada caixa pelo rótulo, e o campo das palavras pelo seu.
    assert.equal(await p.getByRole('checkbox', { name: 'Explosões' }).count(), 1);
    assert.equal(await p.getByRole('textbox', { name: /Palavras ou expressões do chat/ }).count(), 1);
    // No modo de ler o chat de um trecho, os filtros (que são da detecção) não aparecem.
    await p.click('#chatTrechoAbrir');
    assert.equal(await p.locator('#filtrosDetecao').isHidden(), true);
    await p.click('#voltarAcoes');
    assert.equal(await p.locator('#filtrosDetecao').isVisible(), true);
    await p.click('#filtrosDetecao > summary');
    assert.equal(await p.locator('#filtrosDetecao').evaluate((d) => d.open), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('as escolhas ficam guardadas no aparelho, e escrever palavras marca o chat', comNavegador, async () => {
  const { p, erros } = await abrir();
  await abrirNoite(p);
  await abrirFiltros(p);
  await p.check('#filtroExplosoes');
  await p.uncheck('#filtroTiros');
  await p.fill('#filtroPalavras', 'kkk, clip');
  assert.equal(await p.locator('#filtroChat').isChecked(), true, 'escrever as palavras marca a caixa');
  assert.equal(await p.locator('#filtrosResumo').innerText(), 'explosões, palavras no chat');

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  await abrirFiltros(p);
  assert.equal(await p.locator('#filtroTiros').isChecked(), false);
  assert.equal(await p.locator('#filtroExplosoes').isChecked(), true);
  assert.equal(await p.locator('#filtroChat').isChecked(), true);
  assert.equal(await p.inputValue('#filtroPalavras'), 'kkk, clip');
  // Apagar as palavras desmarca o chat.
  await p.fill('#filtroPalavras', '');
  assert.equal(await p.locator('#filtroChat').isChecked(), false);
  assert.deepEqual(erros, []);
  await p.close();
});

test('cada filtro marcado entra no resultado, que diz qual achou o quê, e a lista escreve o tipo',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await varreduraFalsa(p, { tiros: [60], explosoes: [200], gritos: [400] });
    await abrirNoite(p);
    p.on('dialog', (d) => d.accept());
    await abrirFiltros(p);
    await p.check('#filtroExplosoes');
    await p.fill('#filtroPalavras', 'KKKK');
    const texto = await detectarTudo(p);
    assert.match(texto, /^3 momentos em tchubi: 1 tiroteio, 1 explosão, 1 no chat/, texto);
    assert.equal(await p.locator('#estadoMontagem').innerText(), texto);
    // Só o que estava marcado foi pedido ao som: o grito não.
    assert.deepEqual(await p.evaluate(() => window.__varrer.filtros), { tiros: true, explosoes: true, gritos: false });

    const lista = await p.evaluate(() => window.__estado.momentos.map((m) => ({ tipo: m.tipo, palavras: m.palavras, s: Math.round((m.ms - window.__estado.janela.inicio) / 1000) })));
    assert.deepEqual(lista.map((m) => m.tipo), ['tiros', 'explosao', 'chat']);
    assert.deepEqual(lista[2].palavras, ['KKKK']);
    // O surto do chat falso é no minuto 5.
    assert.ok(lista[2].s >= 300 && lista[2].s < 360, `o chat aos ${lista[2].s} s`);
    const tipos = await p.locator('#listaMomentos li[data-ms] .tipo').allInnerTexts();
    assert.deepEqual(tipos, ['tiroteio', 'explosão', 'chat: KKKK']);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('só o chat: não pergunta pelos megas do som, não ouve nada, e lê o chat como o Ler chat', comNavegador, async () => {
  const { p, erros } = await abrir();
  await varreduraFalsa(p, { tiros: [60] });
  await abrirNoite(p);
  let perguntas = 0;
  p.on('dialog', (d) => { perguntas++; d.accept(); });
  await abrirFiltros(p);
  await p.uncheck('#filtroTiros');
  await p.fill('#filtroPalavras', 'kkk');
  const texto = await detectarTudo(p);
  assert.match(texto, /^1 momento em tchubi: 1 no chat/, texto);
  assert.equal(perguntas, 0);
  assert.equal(await p.evaluate(() => window.__varrer ?? null), null, 'o som não foi ouvido');
  // O chat lido fica marcado na faixa, como o do Ler chat.
  assert.ok(await p.locator('#faixas .faixa[data-quem="tchubi"] .lido').count() > 0);
  assert.deepEqual(erros, []);
  await p.close();
});

test('sem filtro marcado, ou com o chat marcado sem palavras, diz o que falta e não ouve nada', comNavegador, async () => {
  const { p, erros } = await abrir();
  await varreduraFalsa(p, { tiros: [60] });
  await abrirNoite(p);
  p.on('dialog', (d) => d.accept());
  await abrirFiltros(p);
  await p.uncheck('#filtroTiros');
  await p.click('#filtrosDetecao > summary');
  await p.click('#detetarTudo');
  assert.match(await p.locator('#estadoChatTrecho').innerText(), /^Marque pelo menos um filtro/);
  assert.equal(await p.locator('#filtrosDetecao').evaluate((d) => d.open), true, 'o painel abre para mostrar');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'filtroTiros');

  await p.check('#filtroChat');
  await p.click('#detetarTudo');
  assert.match(await p.locator('#estadoChatTrecho').innerText(), /^Escreva as palavras do chat/);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'filtroPalavras');
  assert.equal(await p.evaluate(() => window.__varrer ?? null), null);
  assert.deepEqual(erros, []);
  await p.close();
});

test('com outros filtros e nada achado, diz que filtros correram', comNavegador, async () => {
  const { p, erros } = await abrir();
  await varreduraFalsa(p, {});
  await abrirNoite(p);
  p.on('dialog', (d) => d.accept());
  await abrirFiltros(p);
  await p.check('#filtroGritos');
  const texto = await detectarTudo(p);
  assert.match(texto, /^Nenhum momento de tchubi com estes filtros \(tiros, gritos\)/);
  assert.deepEqual(erros, []);
  await p.close();
});

test('com o vídeo aberto num ecrã largo, o painel abre por cima sem tapar os botões, e o Esc fecha-o primeiro',
  comNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await abrirNoite(p, ['tchubi', 'outro']);
    await abrirFiltros(p);
    const flutua = await p.locator('#filtrosDetecao').evaluate((d) => d.classList.contains('flutua'));
    const apertado = await p.evaluate(() => /auto|scroll/.test(getComputedStyle(document.getElementById('faixas')).overflowY));
    assert.equal(flutua, apertado, 'flutua quando as faixas são uma caixa que rola');
    // O painel inteiro à vista, e o Detectar: tudo ainda se carrega (nada por cima dele).
    const corpo = await p.locator('#filtrosDetecao .filtrosCorpo').boundingBox();
    assert.ok(corpo.y >= 0 && corpo.y + corpo.height <= 900, JSON.stringify(corpo));
    const livre = await p.evaluate(() => {
      const b = document.getElementById('detetarTudo').getBoundingClientRect();
      return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('#detetarTudo') != null;
    });
    assert.equal(livre, true, 'o painel tapa o Detectar: tudo');
    await p.locator('#filtroGritos').focus();
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#filtrosDetecao').evaluate((d) => d.open), false);
    assert.equal(await p.locator('#acoesFaixa').isVisible(), true, 'o Esc fecha o painel, e a barra fica');
    assert.deepEqual(erros, []);
    await p.close();
  });
