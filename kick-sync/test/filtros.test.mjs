// Os filtros da detecção automática e o assistente da faixa, num browser a sério: os passos (Ler chat
// ou Detectar lances; um trecho ou tudo; as alças; o botão final), os filtros do último passo da
// detecção e as Mais opções, o que cada filtro marcado faz entrar no resultado, e as escolhas guardadas.
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
import { passo4Detetar } from './assistente.mjs';

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
        window.__varrer = { canal: o.linha.slug, filtros: o.filtros, opcoes: o.opcoes };
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

async function detectarTudo(p) {
  await p.click('#detetarTrecho');
  await p.waitForFunction(() => window.__estado.varredura === null
    && /momento|tiroteio|Nenhum|Marque|Escreva/.test(document.getElementById('estadoChatTrecho').textContent)
    && !/Ouvindo|Lendo|Identificando/.test(document.getElementById('estadoChatTrecho').textContent),
  null, { timeout: 20000 });
  return p.locator('#estadoChatTrecho').innerText();
}

const resumo = (p) => p.locator('#acoesResumo').innerText();

test('o assistente anda passo a passo, diz sempre o que vai acontecer, e Voltar e Esc recuam um passo',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await abrirNoite(p, ['tchubi', 'outro']);
    await p.click('#faixas button.nome[data-quem="tchubi"]');
    // Passo 1: duas escolhas grandes, cada uma com a frase do que faz.
    assert.match(await resumo(p), /^O que fazer com tchubi\?/);
    assert.equal(await p.locator('#acoesPassoN').innerText(), 'passo 1 de 4');
    assert.match(await p.locator('#escolherDetetar').innerText(), /Detectar lances\s+tiros, PvP, explosões, gritos, palavras/);
    assert.ok(await p.locator('#voltarAcoes').isHidden());
    await p.click('#escolherDetetar');
    // Passo 2.
    assert.match(await resumo(p), /^Detectar lances de tchubi: um trecho ou tudo\?/);
    assert.equal(await p.evaluate(() => document.activeElement.id), 'escolherTrecho');
    await p.click('#escolherTrecho');
    // Passo 3: as alças na faixa, as horas na barra, e o Pronto.
    assert.ok(await p.locator('#chatTrecho').isVisible());
    assert.match(await p.locator('#chatTrechoHoras').innerText(), /^de \d\d:\d\d:\d\d até \d\d:\d\d:\d\d/);
    assert.match(await resumo(p), /^Detectar em tchubi, de \d\d:\d\d a \d\d:\d\d\. Arraste as alças/);
    assert.ok(await p.locator('#detetarTrecho').isHidden(), 'o botão final só no último passo');
    // Mexer na alça muda o resumo.
    await p.locator('#alcaInicio').focus();
    await p.keyboard.press('Home');
    assert.match(await resumo(p), /^Detectar em tchubi, de 21:00 a /);
    await p.click('#usarTrecho');
    // Passo 4: os filtros e o Detectar, e o resumo com o que vai ser procurado.
    assert.match(await resumo(p), /^Detectar em tchubi, de 21:00 a \d\d:\d\d: tiros\.$/);
    assert.ok(await p.locator('#detetarTrecho').isVisible());
    assert.ok(await p.locator('#chatTrecho').isVisible(), 'as alças continuam à vista');
    await p.check('#filtroExplosoes');
    assert.match(await resumo(p), /: tiros, explosões\.$/);
    // Voltar: 4 para 3 (no trecho), 3 para 2; Esc: 2 para 1, e no 1 fecha.
    await p.click('#voltarAcoes');
    assert.ok(await p.locator('#usarTrecho').isVisible());
    await p.click('#voltarAcoes');
    assert.ok(await p.locator('#escolherTudo').isVisible());
    await p.keyboard.press('Escape');
    assert.ok(await p.locator('#escolherChat').isVisible());
    assert.equal(await p.evaluate(() => document.activeElement.id), 'escolherDetetar', 'o foco na última escolha');
    await p.keyboard.press('Escape');
    assert.ok(await p.locator('#acoesFaixa').isHidden());
    assert.deepEqual(erros, []);
    await p.close();
  });

test('a última escolha de cada passo fica guardada e destacada, sem saltar passos', comNavegador, async () => {
  const { p, erros } = await abrir();
  await abrirNoite(p);
  await p.click('#faixas button.nome[data-quem="tchubi"]');
  assert.equal(await p.locator('#escolherDetetar.ultima').count(), 0, 'na primeira vez não há última escolha');
  await p.click('#escolherDetetar');
  await p.click('#escolherTudo');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  await p.click('#faixas button.nome[data-quem="tchubi"]');
  // Abre no passo 1 na mesma, com a última escolha destacada, dita, e com o foco.
  assert.ok(await p.locator('#passo1').isVisible());
  assert.equal(await p.locator('#escolherDetetar.ultima').count(), 1);
  assert.ok(await p.locator('#escolherDetetar .ultimaVez').isVisible());
  assert.ok(await p.locator('#escolherChat .ultimaVez').isHidden());
  await p.locator('#acoesFaixa').press('Tab').catch(() => {});
  await p.click('#escolherDetetar');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'escolherTudo');
  assert.ok(await p.locator('#escolherTudo .ultimaVez').isVisible());
  assert.deepEqual(erros, []);
  await p.close();
});

test('o último passo de Detectar tem os filtros, os tiros já marcados, e a fala desligada com o porquê',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await abrirNoite(p);
    await passo4Detetar(p, { quem: 'tchubi' });
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
    // Mais opções fechado, e cada opção com a frase do que faz.
    assert.equal(await p.locator('#maisOpcoes').evaluate((d) => d.open), false);
    await p.click('#maisOpcoes > summary');
    for (const id of ['sensDetecaoAjuda', 'margensAjuda', 'juntarAjuda']) assert.ok((await p.locator(`#${id}`).innerText()).length > 20, id);
    assert.equal(await p.getByRole('combobox', { name: /Sensibilidade/ }).count(), 1);
    // O Esc dentro de Mais opções fecha-o primeiro, e o assistente fica no mesmo passo.
    await p.locator('#maisOpcoes > summary').focus();
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#maisOpcoes').evaluate((d) => d.open), false);
    assert.ok(await p.locator('#detetarTrecho').isVisible());
    // No Ler chat não há filtros: há a sensibilidade dos picos e o Ler.
    await p.click('#voltarAcoes');
    await p.click('#voltarAcoes');
    await p.click('#escolherChat');
    await p.click('#escolherTudo');
    assert.ok(await p.locator('#filtroTiros').isHidden());
    assert.ok(await p.locator('#sensibilidadeFaixa').isVisible());
    assert.ok(await p.locator('#lerChatTrecho').isVisible());
    assert.deepEqual(erros, []);
    await p.close();
  });

// A sensibilidade saiu do painel do lance do mapa (o dono, 10/10): mora só no assistente da faixa, e é
// a mesma escolha guardada que o mapa do evento usa para os picos (ver evento.test.mjs).
test('a sensibilidade do chat é uma só: a da faixa, guardada no aparelho, e não está no painel do lance', comNavegador, async () => {
  const { p, erros } = await abrir();
  await abrirNoite(p);
  await p.click('#faixas button.nome[data-quem="tchubi"]');
  await p.click('#escolherChat');
  await p.click('#escolherTudo');
  assert.match(await p.locator('#comoPicoFaixa').innerText(), /3 vezes .* pelo menos 8/);
  assert.equal(await p.locator('#sensibilidade').count(), 0, 'o painel do lance já não tem a sua');
  await p.selectOption('#sensibilidadeFaixa', 'maxima');
  assert.equal(await p.evaluate(() => localStorage.getItem('povix.sensibilidade')), 'maxima');
  assert.match(await p.locator('#comoPicoFaixa').innerText(), /1,5 vezes .* pelo menos 3/);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  assert.equal(await p.inputValue('#sensibilidadeFaixa'), 'maxima', 'guardada no aparelho');
  assert.deepEqual(erros, []);
  await p.close();
});

test('as escolhas dos filtros e das opções ficam guardadas, e escrever palavras marca o chat', comNavegador, async () => {
  const { p, erros } = await abrir();
  await abrirNoite(p);
  await passo4Detetar(p, { quem: 'tchubi' });
  await p.check('#filtroExplosoes');
  await p.uncheck('#filtroTiros');
  await p.fill('#filtroPalavras', 'kkk, clip');
  assert.equal(await p.locator('#filtroChat').isChecked(), true, 'escrever as palavras marca a caixa');
  assert.match(await resumo(p), /: explosões, palavras no chat\.$/);
  await p.click('#maisOpcoes > summary');
  await p.selectOption('#sensDetecao', 'mais');
  await p.selectOption('#juntarLances', '10');

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  await passo4Detetar(p, { quem: 'tchubi' });
  assert.equal(await p.locator('#filtroTiros').isChecked(), false);
  assert.equal(await p.locator('#filtroExplosoes').isChecked(), true);
  assert.equal(await p.locator('#filtroChat').isChecked(), true);
  assert.equal(await p.inputValue('#filtroPalavras'), 'kkk, clip');
  assert.equal(await p.inputValue('#sensDetecao'), 'mais');
  assert.equal(await p.inputValue('#juntarLances'), '10');
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
    await passo4Detetar(p, { quem: 'tchubi' });
    await p.check('#filtroExplosoes');
    await p.fill('#filtroPalavras', 'KKKK');
    const texto = await detectarTudo(p);
    assert.match(texto, /^3 momentos em tchubi: 1 tiroteio, 1 explosão, 1 no chat/, texto);
    assert.equal(await p.locator('#estadoMontagem').innerText(), texto);
    // Só o que estava marcado foi pedido ao som: o grito não.
    assert.deepEqual(await p.evaluate(() => window.__varrer.filtros), { tiros: true, explosoes: true, gritos: false });
    // O assistente fica no último passo, com o resultado no mesmo sítio do progresso.
    assert.ok(await p.locator('#detetarTrecho').isVisible());

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

test('Mais opções mudam o resultado: a sensibilidade chega à escuta, juntar une lances, e as margens são as da montagem',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    // Tiros aos 60 s e uma explosão aos 66 s, e outra luta aos 300 s.
    await varreduraFalsa(p, { tiros: [60, 300], explosoes: [66] });
    await abrirNoite(p);
    p.on('dialog', (d) => d.accept());
    await passo4Detetar(p, { quem: 'tchubi' });
    await p.check('#filtroExplosoes');
    await p.click('#maisOpcoes > summary');
    await p.selectOption('#sensDetecao', 'menos');
    await p.selectOption('#juntarLances', '10');
    await p.fill('#margemAntes', '9');
    await p.fill('#margemDepois', '4');
    assert.equal(await p.inputValue('#protAntes'), '9', 'a margem é a da montagem');
    assert.equal(await p.inputValue('#protDepois'), '4');
    const texto = await detectarTudo(p);
    // A luta dos 60 s e a explosão dos 66 s viram um lance só.
    assert.match(texto, /^2 momentos em tchubi: 2 tiroteios/, texto);
    const v = await p.evaluate(() => window.__varrer.opcoes);
    assert.ok(v.alturaMin > 8 && v.minQuenteS > 0.6, `menos lances pede mais força: ${JSON.stringify(v)}`);
    const ms = await p.evaluate(() => window.__estado.momentos.map((m) => ({
      tipos: m.tipos, antes: m.protagonistaAntesS, depois: m.protagonistaDepoisS, dur: m.combateAteMs - m.combateDeMs,
    })));
    assert.equal(ms.length, 2);
    assert.deepEqual(ms[0].tipos, ['tiros', 'explosao']);
    assert.ok(ms[0].dur >= 9000, `o lance junto vai do começo do primeiro ao fim do último: ${ms[0].dur}`);
    assert.deepEqual([ms[0].antes, ms[0].depois], [9, 4]);
    assert.deepEqual(await p.locator('#listaMomentos li[data-ms] .tipo').allInnerTexts(), ['tiroteio, explosão', 'tiroteio']);

    // Sem juntar e com mais sensibilidade, são três, e a escuta pede menos força.
    await p.evaluate(() => { window.__estado.momentos = []; });
    await p.selectOption('#sensDetecao', 'mais');
    await p.selectOption('#juntarLances', '0');
    const texto2 = await detectarTudo(p);
    assert.match(texto2, /^3 momentos em tchubi: 2 tiroteios, 1 explosão/, texto2);
    const v2 = await p.evaluate(() => window.__varrer.opcoes);
    assert.ok(v2.alturaMin < 8, JSON.stringify(v2));
    assert.deepEqual(erros, []);
    await p.close();
  });

test('só o chat: não pergunta pelos megas do som, não ouve nada, e lê o chat como o Ler chat', comNavegador, async () => {
  const { p, erros } = await abrir();
  await varreduraFalsa(p, { tiros: [60] });
  await abrirNoite(p);
  let perguntas = 0;
  p.on('dialog', (d) => { perguntas++; d.accept(); });
  await passo4Detetar(p, { quem: 'tchubi' });
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
  await passo4Detetar(p, { quem: 'tchubi' });
  await p.uncheck('#filtroTiros');
  assert.match(await resumo(p), /: marque pelo menos um\.$/);
  await p.click('#detetarTrecho');
  assert.match(await p.locator('#estadoChatTrecho').innerText(), /^Marque pelo menos um filtro/);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'filtroTiros');

  await p.check('#filtroChat');
  await p.click('#detetarTrecho');
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
  await passo4Detetar(p, { quem: 'tchubi' });
  await p.check('#filtroGritos');
  const texto = await detectarTudo(p);
  assert.match(texto, /^Nenhum momento de tchubi com estes filtros \(tiros, gritos\)/);
  assert.deepEqual(erros, []);
  await p.close();
});

test('com o vídeo aberto num ecrã largo, o assistente abre por cima das faixas sem tapar a faixa escolhida',
  comNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await abrirNoite(p, ['tchubi', 'outro']);
    await passo4Detetar(p, { quem: 'tchubi', quanto: 'trecho' });
    const flutua = await p.locator('#acoesFaixa').evaluate((d) => d.classList.contains('flutua'));
    const apertado = await p.evaluate(() => /auto|scroll/.test(getComputedStyle(document.getElementById('faixas')).overflowY)
      && document.getElementById('faixas').clientHeight < 320);
    assert.equal(flutua, apertado, 'flutua quando as faixas são uma caixa baixa que rola');
    // O assistente inteiro dentro do ecrã, e o trilho da faixa escolhida (com as alças) livre por baixo.
    const corpo = await p.locator('#acoesGrupo').boundingBox();
    assert.ok(corpo.y >= 0 && corpo.y + corpo.height <= 900, JSON.stringify(corpo));
    const livre = await p.evaluate(() => {
      const b = document.querySelector('#faixas .faixa[data-quem="tchubi"] .trilho').getBoundingClientRect();
      const el = document.elementFromPoint(b.left + b.width / 3, b.top + b.height / 2);
      return Boolean(el?.closest('.faixa[data-quem="tchubi"]'));
    });
    assert.equal(livre, true, 'o assistente tapa a faixa escolhida');
    assert.ok(await p.locator('#chatTrecho').isVisible());
    assert.deepEqual(erros, []);
    await p.close();
  });
