// A detecção automática, o "quem morreu" e a referência, num browser a sério.
//
// A Kick é a de test/falsa.mjs. O que aqui se finge a mais são as duas pontas que
// este Chromium não consegue fazer de verdade: ouvir o som (não tem AAC) e ver o
// vídeo (não tem H.264). A varredura e o apanhador de frames são trocados por
// duplos que se portam como os verdadeiros nas costuras que interessam: um
// leitor por canal, em que uma busca nova passa por cima da que estava a caminho.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const comNavegador = { skip: !podeCorrer && 'sem navegador' };

/**
 * A varredura fingida: devolve candidatos a `s` segundos do início pedido, e
 * guarda com que argumentos foi chamada.
 */
async function varreduraFalsa(p, candidatosS = []) {
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      export function custoVarrerMB() { return 1; }
      export async function varrerNoite(o) {
        window.__varrer = { deMs: o.deMs, ateMs: o.ateMs, nudgeMs: o.nudgeMs, canal: o.linha.slug };
        return {
          ouvido: { altos: 0, chumbados: 0, passaram: 0, maiorGrupo: 0 },
          estouros: [], falhados: 0, bytes: 0,
          candidatos: ${JSON.stringify(candidatosS)}.map((s) => ({
            ms: o.deMs + s * 1000, combateDeMs: o.deMs + s * 1000 - 2000,
            combateAteMs: o.deMs + s * 1000 + 3000, tiros: 3,
          })),
        };
      }`,
  }));
}

/**
 * Os ecrãs fingidos. `window.__ecras[canal]` diz a partir de quando o ecrã de
 * cada canal fica cinzento e escuro (o ecrã de morte do Rust); o resto vê o jogo.
 * Um "leitor" por canal: a segunda busca ao mesmo canal, pedida antes de a
 * primeira chegar, leva as duas para o mesmo sítio, como num <video> só.
 */
async function ecrasFalsos(p) {
  await p.route('**/frames.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      const COR = { jogo: [150, 90, 40], morte: [45, 45, 48] };
      const IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      export function criarApanhador() {
        const posicao = new Map();
        return {
          async frame(slug, quandoMs) {
            window.__frames = (window.__frames || 0) + 1;
            posicao.set(slug, quandoMs);
            await new Promise((ok) => setTimeout(ok, 15));
            const t = posicao.get(slug);
            const morre = (window.__ecras || {})[slug];
            const cor = morre != null && t >= morre ? COR.morte : COR.jogo;
            const pixeis = new Uint8ClampedArray(400 * 4);
            for (let i = 0; i < 400; i++) pixeis.set([...cor, 255], i * 4);
            return { pixeis, imagem: IMG };
          },
          fechar() {},
        };
      }`,
  }));
}

async function abrirNoite(p, canais) {
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 });
}

const textoMontagem = (p) => p.locator('#estadoMontagem').innerText();
const momentos = (p) => p.evaluate(() => window.__estado.momentos);

/** Correr a detecção (a noite toda) e esperar que o botão volte. */
async function detectar(p, { janela = '0' } = {}) {
  await p.selectOption('#janelaAuto', janela);
  await p.click('#procurarKills');
  // A correr, o botão não se apaga (é o Parar dela): o fim é a `varredura` voltar a nada.
  await p.waitForFunction(() => window.__varrer && window.__estado.varredura === null
    && !/Ouvindo|Identificando/.test(document.getElementById('estadoMontagem').textContent),
  null, { timeout: 20000 });
}

// app-2#3, ui#3: com um canal não há "quem morreu" para ver, e o botão dessa
// parte nem é desenhado. A busca chamava-a na mesma e rebentava num null, e a
// mensagem falava de uma sincronia que ele nunca pediu.
test('detecção com um canal só acaba com as kills, e não com um erro de sincronia', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await varreduraFalsa(p, [60, 200]);
  await abrirNoite(p, ['tchubi']);
  p.on('dialog', (d) => d.accept());
  await detectar(p);
  const texto = await textoMontagem(p);
  assert.doesNotMatch(texto, /sincronia/i);
  assert.match(texto, /^2 tiroteios em tchubi/);
  assert.equal((await momentos(p)).length, 2);
  assert.deepEqual(erros, []);
  await p.close();
});

// detection#0, ui#2: a mensagem manda escolher outro trecho, e o botão para o
// fazer ficava cinzento até recarregar a página.
test('uma detecção que não acha nada deixa o botão pronto para outro trecho', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await varreduraFalsa(p, []);
  await abrirNoite(p, ['tchubi']);
  p.on('dialog', (d) => d.accept());
  await detectar(p);
  assert.match(await textoMontagem(p), /Nenhum tiroteio de tchubi/);
  assert.equal(await p.locator('#procurarKills').isDisabled(), false);
  // O `estado.cancelar` único deu lugar a um por trabalho (a busca é `varredura`), e o botão
  // não fica cinzento a correr: passa a ser o Parar dela e volta ao rótulo no fim.
  assert.equal(await p.evaluate(() => window.__estado.varredura), null);
  assert.equal(await p.locator('#procurarKills span').innerText(), 'Detecção automática');
  assert.deepEqual(erros, []);
  await p.close();
});

// app-2#15, detection#19: "a noite toda" começava no cursor, e com o cursor
// depois do fim do canal o clique não fazia nada nem dizia nada.
test('a noite toda é a noite toda, e com o cursor depois do fim diz porquê', comNavegador, async () => {
  const { p, erros } = await abrir();
  // O relógio do outro (o PROGRAM-DATE-TIME) começa 300 s depois: vai dos 300 aos 900.
  await kickFalsa(p, { canais: ['tchubi', 'outro'], desviosS: { outro: 300 } });
  await varreduraFalsa(p, []);
  await abrirNoite(p, ['tchubi', 'outro']);
  p.on('dialog', (d) => d.accept());
  assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'tchubi');

  await p.evaluate((t) => { window.__estado.agoraMs = t + 400_000; }, T);
  await detectar(p, { janela: '0' });
  const v = await p.evaluate(() => window.__varrer);
  assert.equal(v.deMs, T, 'a noite toda começa no princípio do canal, e não no cursor');
  assert.equal(v.ateMs, T + 600_000);

  // Uma kill aos 100 s, quando o outro ainda não estava no ar: a ficha dele
  // fica apagada, e a razão vai no nome dela (o `title` nem o toque nem um
  // leitor de ecrã mostram).
  await p.evaluate((t) => { window.__estado.agoraMs = t + 100_000; }, T);
  await p.click('#marcarKill');
  await p.waitForSelector('#listaMomentos .vit[data-canal="outro"]', { timeout: 5000 });
  const ficha = p.locator('#listaMomentos .vit[data-canal="outro"]');
  assert.equal(await ficha.isDisabled(), true);
  assert.match(await ficha.getAttribute('aria-label'), /^outro: não estava gravando$/);

  // O tchubi acaba aos 600 s; o outro continua até aos 900.
  await p.evaluate((t) => { window.__varrer = null; window.__estado.agoraMs = t + 700_000; }, T);
  await p.selectOption('#janelaAuto', '1800');
  await p.click('#procurarKills');
  await p.waitForFunction(() => /saiu do ar/.test(document.getElementById('estadoMontagem').textContent),
    null, { timeout: 5000 });
  const texto = await textoMontagem(p);
  assert.match(texto, /saiu do ar/);
  assert.match(texto, /noite toda/, 'e diz o que fazer a seguir');
  assert.equal(await p.evaluate(() => window.__varrer), null, 'sem ouvir nada');
  assert.deepEqual(erros, []);
  await p.close();
});

// app-1#13: o Rever toca o pedaço que vai para o ficheiro, que é a POV de quem
// matou. Tocava o ângulo que estivesse em foco: o da vítima, ou um quadrado
// "fora do ar".
test('o Rever de uma kill mostra a POV de quem matou, e não a que está em foco', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await abrirNoite(p, ['tchubi', 'outro']);
  await p.click('#mais1m');
  await p.click('#marcarKill');
  await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
  assert.equal((await momentos(p))[0].protagonista, 'tchubi');

  await p.click('.tile[data-slug="outro"]');
  assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'outro');
  await p.locator('#listaMomentos .ver').click();
  assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'tchubi');
  assert.deepEqual(erros, []);
  await p.close();
});

// app-2#5, app-2#7, app-2#17, app-2#23/detection#20 e detection#18.
//
// Seis canais. O tchubi matou o v1 e o v2 e foi logo saquear: o ecrã dele também
// escurece. Os outros três continuam a jogar.
test('quem morreu: aponta as vítimas e não quem matou, acerta o instante, e os cartões ficam',
  comNavegador, async () => {
    const canais = ['tchubi', 'v1', 'v2', 'a', 'b', 'c'];
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais });
    await ecrasFalsos(p);
    await abrirNoite(p, canais);
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
    const ms = (await momentos(p))[0].ms;
    await p.evaluate((m) => { window.__ecras = { tchubi: m + 1000, v1: m + 500, v2: m + 500 }; }, ms);

    await p.click('#listaMomentos .verMortes');
    await p.waitForFunction(() => document.querySelectorAll('#listaMomentos .olhar .cartao').length === 6
      && !document.querySelector('#listaMomentos .verMortes').disabled, null, { timeout: 20000 });

    const [m] = await momentos(p);
    assert.deepEqual([...m.vitimas].sort(), ['v1', 'v2'], 'as duas vítimas, e o protagonista nunca');
    assert.ok(Math.abs(m.ms - (ms + 500)) <= 300,
      `o instante ficou a ${m.ms - ms} ms da marca, e o ecrã virou aos 500`);
    const nota = await p.locator('#listaMomentos .olhar .nota').first().innerText();
    assert.match(nota, /parece que morreu: v1, v2/);
    assert.match(nota, /acertei o instante/);
    assert.equal(await p.locator('#listaMomentos .cartao[data-canal="tchubi"].morreu').count(), 0);

    // O estado de cada ficha e de cada cartão diz-se também a quem não vê a cor.
    assert.equal(await p.locator('#listaMomentos .cartao[data-canal="v1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('#listaMomentos .vit[data-canal="v1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('#listaMomentos .vit[data-canal="a"]').getAttribute('aria-pressed'), 'false');

    // Corrigir num clique, e os cartões continuam lá para o segundo.
    await p.locator('#listaMomentos .cartao[data-canal="a"]').click();
    await p.waitForSelector('#listaMomentos .vit[data-canal="a"].sim', { timeout: 5000 });
    assert.equal(await p.locator('#listaMomentos .olhar .cartao').count(), 6, 'os cartões sumiram ao primeiro clique');
    assert.equal(await p.locator('#listaMomentos .olhar').isVisible(), true);
    assert.equal(await p.locator('#listaMomentos .cartao[data-canal="a"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(erros, []);
    await p.close();
  });

// detection#14, app-2#4, app-2#6/detection#8 e app-2#17 (os cartões da busca).
test('a detecção vê quem morreu mesmo com o filtro a esconder as novas, e o resultado fica escrito',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'v1'] });
    await varreduraFalsa(p, [60]);
    await ecrasFalsos(p);
    await abrirNoite(p, ['tchubi', 'v1']);
    p.on('dialog', (d) => d.accept());
    // O filtro guarda-se de uma noite para a outra, e as kills novas ainda não
    // têm vítima: ficam escondidas por ele.
    // Sem kills a barra do filtro fica escondida (só aparece o que serve): o filtro guardado
    // muda-se como o arranque o mudaria.
    await p.evaluate(() => {
      const f = document.getElementById('filtroMomentos');
      f.value = 'comMorte';
      f.dispatchEvent(new Event('change'));
    });
    // O tchubi foi alinhado pelo som: o VOD dele vai 5,7 s à frente da noite.
    const NUDGE = 5700;
    await p.evaluate((n) => { window.__estado.nudges.tchubi = n; }, NUDGE);
    const candidato = T - NUDGE + 60_000;
    await p.evaluate((c) => { window.__ecras = { v1: c + 500 }; }, candidato);

    await detectar(p);
    const v = await p.evaluate(() => window.__varrer);
    assert.equal(v.nudgeMs, NUDGE, 'o ajuste do canal tem de chegar à varredura');
    assert.equal(v.deMs, T - NUDGE, 'e a noite dele começa no relógio da noite');

    const [m] = await momentos(p);
    assert.deepEqual(m.vitimas, ['v1'], 'o filtro escondia a kill e a vítima ficava por ver');
    const texto = await textoMontagem(p);
    assert.match(texto, /^1 tiroteios em tchubi, 1 com vítima identificada/,
      `o resultado foi tapado: "${texto}"`);

    // Os cartões da busca ficaram guardados, fechados. Abrem sem voltar a olhar.
    await p.selectOption('#filtroMomentos', 'todos');
    const antes = await p.evaluate(() => window.__frames);
    await p.click('#listaMomentos .verMortes');
    await p.waitForSelector('#listaMomentos .olhar .cartao', { timeout: 5000 });
    assert.equal(await p.evaluate(() => window.__frames), antes, 'abrir não pode voltar a ver tudo');
    assert.deepEqual(erros, []);
    await p.close();
  });

/** Uma kill marcada, e os estouros que uma varredura do `canal` teria guardado. */
async function noiteComEstouros(p, instantes, canal = 'tchubi') {
  await p.click('#mais1m');
  await p.click('#marcarKill');
  await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
  const ms = (await momentos(p))[0].ms;
  await p.evaluate(({ m, emS, c }) => {
    const n = 1440;
    let s = 11;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
    const acerto = new Float32Array(n);
    let e = 0;
    for (let k = 0; k < n; k++) { acerto[k] = Math.exp(-k / 240) * r(); e += acerto[k] * acerto[k]; }
    for (let k = 0; k < n; k++) acerto[k] /= Math.sqrt(e);
    window.__estado.estouros = emS.map((x, i) => ({ ms: m + x * 1000, altura: 40 - i * 0.1, recorte: acerto, canal: c }));
  }, { m: ms, emS: instantes, c: canal });
  return ms;
}

// app-2#14, detection#10, detection#12.
test('usar como referência não apaga o que ele já confirmou, e põe os achados em quem foi ouvido',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirNoite(p, ['tchubi', 'outro']);
    const ms = await noiteComEstouros(p, [0, 30, 90, 150]);
    // Três kills da busca automática: uma com a vítima confirmada, uma com o
    // corte e o 9:16 guardados, e uma por rever.
    await p.evaluate((m) => {
      const base = window.__estado.momentos[0];
      window.__estado.momentos = [
        base,
        { ...base, ms: m + 300_000, auto: true, vitimas: ['outro'] },
        { ...base, ms: m + 400_000, auto: true, ajuste: { deMs: m + 398_000, ateMs: m + 405_000, formato: 'um', rects: [] } },
        { ...base, ms: m + 500_000, auto: true },
      ];
    }, ms);
    // Ele foi espreitar o outro ângulo antes de carregar.
    await p.click('.tile[data-slug="outro"]');
    await p.selectOption('#filtroMomentos', 'semMorte');
    await p.selectOption('#filtroMomentos', 'todos');
    await p.locator(`#listaMomentos li[data-ms="${ms}"] .foiKill`).click();
    await p.waitForFunction(() => /Referência salva/.test(document.getElementById('estadoMontagem').textContent),
      null, { timeout: 10000 });

    const lista = await momentos(p);
    const em = (x) => lista.find((m) => m.ms === ms + x);
    assert.ok(em(300_000), 'a kill com a vítima confirmada foi apagada');
    assert.ok(em(400_000), 'a kill com o corte guardado foi apagada');
    assert.equal(em(500_000), undefined, 'a que estava por rever sai: era o palpite');
    for (const x of [30_000, 90_000, 150_000]) {
      assert.equal(em(x)?.protagonista, 'tchubi', `a ${x / 1000} s: os sons eram do tchubi`);
    }
    // E o que saiu volta com o Anular.
    assert.equal(await p.locator('#anularApagar').isVisible(), true);
    await p.click('#anularApagar');
    assert.ok((await momentos(p)).some((m) => m.ms === ms + 500_000));
    assert.deepEqual(erros, []);
    await p.close();
  });

// app-2#14 (a conta) e detection#11 (a mensagem).
test('a referência conta o que entrou, e sem estouro perto diz porquê', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await abrirNoite(p, ['tchubi']);
  // Setenta sons iguais, a sete segundos uns dos outros: só entram sessenta.
  const ms = await noiteComEstouros(p, Array.from({ length: 70 }, (_, i) => i * 7));
  await p.selectOption('#filtroMomentos', 'semMorte');
  await p.selectOption('#filtroMomentos', 'todos');
  await p.locator(`#listaMomentos li[data-ms="${ms}"] .foiKill`).click();
  await p.waitForFunction(() => /Referência salva/.test(document.getElementById('estadoMontagem').textContent),
    null, { timeout: 10000 });
  const n = Number((await textoMontagem(p)).match(/(\d+) momentos/)?.[1]);
  assert.equal(n, (await momentos(p)).length, 'o número dito tem de ser o que está na lista');

  // Uma kill sem estouro nenhum a menos de quatro segundos: a varredura correu,
  // por isso mandar corrê-la outra vez não é o próximo passo.
  await p.evaluate(() => { window.__estado.estouros = window.__estado.estouros.map((e) => ({ ...e, ms: e.ms + 3_000_000 })); });
  await p.selectOption('#filtroMomentos', 'semMorte');
  await p.selectOption('#filtroMomentos', 'todos');
  await p.locator(`#listaMomentos li[data-ms="${ms}"] .foiKill`).click();
  const texto = await textoMontagem(p);
  assert.doesNotMatch(texto, /primeiro/, 'a detecção já correu');
  assert.match(texto, /Escolha/);
  assert.deepEqual(erros, []);
  await p.close();
});

/**
 * Um hls.js fingido para os leitores escondidos do `frames.js`: o vídeo chega
 * ao instante pedido ao fim de `chegaEmMs` (ou nunca), e diz que tem imagem
 * desde `largura`. Os quadrados da grelha ficam com o duplo de sempre.
 */
async function leitorLento(p) {
  await p.route('**/hls-*.js', (rota) => rota.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `window.Hls = function () {
      this.loadSource = function () {};
      this.attachMedia = function (v) {
        if (v.style.left !== '-9999px') return;
        const c = window.__leitor || {};
        let largura = c.largura || 0;
        Object.defineProperty(v, 'videoWidth', { get: () => largura });
        if (c.chegaEmMs != null) setTimeout(() => { largura = 160; v.dispatchEvent(new Event('seeked')); }, c.chegaEmMs);
      };
      this.destroy = function () {};
    };
    window.Hls.isSupported = function () { return true; };`,
  }));
}

// detection#2 e detection#15.
test('o apanhador espera um arranque frio, e não devolve a imagem de outro instante', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await leitorLento(p);
  await abrirNoite(p, ['tchubi']);
  const ver = (leitor, limiteMs) => p.evaluate(async ({ c, limite, t }) => {
    // Este Chromium não traz H.264; aqui finge-se que traz, que é o caso do Chrome.
    MediaSource.isTypeSupported = () => true;
    window.__leitor = c;
    const { criarApanhador } = await import('/frames.js');
    const a = criarApanhador({ linhas: window.__estado.linhas, limiteMs: limite });
    try { return Boolean(await a.frame('tchubi', t + 60_000)); } finally { a.fechar(); }
  }, { c: leitor, limite: limiteMs, t: T });

  // A playlist e o primeiro bocado demoram mais de 900 ms a chegar: é o normal.
  assert.equal(await ver({ chegaEmMs: 1500 }, 6000), true, 'desistiu de um arranque frio normal');
  // O leitor tem imagem, mas de onde estava: o salto nunca acabou.
  assert.equal(await ver({ largura: 160 }, 1200), false, 'devolveu a imagem do instante anterior');
  assert.deepEqual(erros, []);
  await p.close();
});

// ui#18: um erro a abrir um clipe era dito como "a sincronia falhou: Failed to
// fetch. Alinhe à mão": a função errada, a solução errada, e o erro cru em
// português nas outras línguas.
test('um link de clipe que falha diz o que falhou, e não fala de sincronia', comNavegador, async () => {
  const { p, erros } = await abrir({ idioma: 'en' });
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.route('https://kick.com/api/v2/clips/**', (r) => r.abort('failed'));
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#linkKick', 'clip_01ABC');
  await p.click('#abrirLink');
  await p.waitForSelector('#estadoLink.mau', { timeout: 10000 });
  const texto = await p.locator('#estadoLink').innerText();
  assert.doesNotMatch(texto, /sync|Failed to fetch/i);
  assert.match(texto, /clip/i);
  assert.deepEqual(erros.filter((e) => !/Failed to load resource/.test(e)), []);
  await p.close();
});

// ui#16: o painel das margens dizia "my POV 5 s antes 2 s depois Who died? 1 s
// antes" em inglês, e a etiqueta da vítima era uma pergunta.
test('as margens falam a língua da página', comNavegador, async () => {
  const { p, erros } = await abrir({ idioma: 'en' });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  const texto = (await p.locator('#margens').textContent()).replace(/\s+/g, ' ');
  assert.doesNotMatch(texto, /antes|depois/);
  assert.match(texto, /s before/);
  assert.doesNotMatch(texto, /\?/, 'a etiqueta de uma margem não é uma pergunta');
  // O estado da montagem e o do alinhamento são anunciados a quem não vê o ecrã.
  for (const id of ['estadoMontagem', 'estadoAlinhar']) {
    assert.equal(await p.locator(`#${id}`).getAttribute('role'), 'status', id);
  }
  assert.deepEqual(erros, []);
  await p.close();
});

// A segunda definição de uma chave apaga a primeira sem aviso: foi assim que a
// etiqueta das margens passou a ser "Quem morreu?".
test('nenhuma chave das traduções está escrita duas vezes na mesma língua', () => {
  const fonte = readFileSync(new URL('../site/idiomas.js', import.meta.url), 'utf8');
  const blocos = fonte.split(/\n {2}(?=pt: \{|en: \{|es: \{)/).slice(1);
  assert.equal(blocos.length, 3);
  for (const bloco of blocos) {
    const vistas = new Set();
    const repetidas = [];
    for (const m of bloco.matchAll(/^ {4}'([^']+)':/gm)) {
      if (vistas.has(m[1])) repetidas.push(m[1]);
      vistas.add(m[1]);
    }
    assert.deepEqual(repetidas, [], `${bloco.slice(0, 2)}: ${repetidas.join(', ')}`);
  }
});

// O dono (07/10): escolher de que hora a que hora a detecção ouve, e não só meia hora, uma hora ou a noite.
test('a detecção ouve o trecho marcado, ou de uma hora a outra', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await varreduraFalsa(p, []);
  await abrirNoite(p, ['tchubi']);
  p.on('dialog', (d) => d.accept());

  // Sem marca, diz o que fazer.
  await p.selectOption('#janelaAuto', 'marca');
  await p.click('#procurarKills');
  assert.match(await textoMontagem(p), /Marque a entrada e a saída/);

  // Com marca, ouve exatamente ela.
  await p.click('#mais1m');
  await p.click('#marcarIn');
  await p.click('#mais1m');
  await p.click('#marcarOut');
  const marca = await p.evaluate(() => ({ ...window.__estado.marca }));
  await detectar(p, { janela: 'marca' });
  let v = await p.evaluate(() => window.__varrer);
  assert.deepEqual([v.deMs, v.ateMs], [marca.de, marca.ate]);

  // De uma hora a outra: as caixas abrem com o instante do vídeo.
  await p.evaluate(() => { window.__varrer = null; });
  await p.selectOption('#janelaAuto', 'horas');
  assert.equal(await p.locator('#horasAuto').isVisible(), true);
  const [de, ate] = await p.evaluate((t0) => {
    const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    return [hm(t0 + 3 * 60_000), hm(t0 + 5 * 60_000)];
  }, T);
  await p.fill('#autoDe', de);
  await p.fill('#autoAte', ate);
  await detectar(p, { janela: 'horas' });
  v = await p.evaluate(() => window.__varrer);
  assert.equal(v.ateMs - v.deMs, 2 * 60_000);
  assert.equal(new Date(v.deMs).getMinutes(), new Date(T + 3 * 60_000).getMinutes());
  assert.deepEqual(erros, []);
  await p.close();
});
