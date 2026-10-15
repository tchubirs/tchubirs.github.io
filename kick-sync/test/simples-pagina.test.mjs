// O modo simples numa página a sério (ESTUDO-FACIL.md): uma caixa, um botão, a lista com Baixar.
//
// A Kick é a de test/falsa.mjs (o primeiro canal tem um pico de chat) com o vídeo de test/chat-falso.mjs:
// o Chromium destes testes não toca H.264 nem AAC, e por isso o vídeo é um WebM gravado na própria
// página e o som não se consegue ouvir (a lista vem só do chat, e a página diz porquê).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { chatEVideo, gravarFonte } from './chat-falso.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const CANAIS = ['tchubi', 'outro'];

async function preparar(p, { video = true } = {}) {
  await kickFalsa(p, { canais: CANAIS });
  if (video) {
    await chatEVideo(p, { canais: CANAIS });
    // O chat de sempre (3 mensagens por minuto), com o pico no primeiro minuto: é onde o vídeo falso tem
    // imagem (os 6 s gravados na página).
    await p.route('**/api/v2/channels/*/messages**', async (rota) => {
      const u = new URL(rota.request().url());
      const i = Number(u.pathname.match(/channels\/(\d+)\/messages/)?.[1]) - 1000;
      const cursorMs = Number(u.searchParams.get('cursor')) / 1000;
      const lista = [];
      for (let k = 0; k < 30; k++) lista.push(T + k * 20_000);
      if (i === 0) for (let k = 0; k < 40; k++) lista.push(T + 2000 + k * 400);
      const antes = lista.sort((a, b) => a - b).map((ms, n) => ({
        id: `s${i}-${n}`, created_at: new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z'), content: 'kkk', sender: { slug: `fa${n % 7}` },
      })).filter((m) => Date.parse(m.created_at) < cursorMs);
      const pagina = antes.slice(-25).reverse();
      await rota.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { messages: pagina, cursor: pagina.length ? String(Date.parse(pagina.at(-1).created_at) * 1000) : null } }),
      });
    });
  }
  // A webcam: o quadro de mentira tem um rosto (um disco cor de pele) embaixo à esquerda, e o detector de
  // mentira acha-o pela cor, como em rosto.test.mjs. O modelo de verdade vem da rede, que aqui não há.
  await p.addInitScript(() => {
    window.__povixQuadrosRosto = () => ({
      async quadro() {
        const c = document.createElement('canvas');
        c.width = 1920; c.height = 1080;
        const g = c.getContext('2d');
        g.fillStyle = '#6f8fae'; g.fillRect(0, 0, 1920, 600);
        g.fillStyle = '#5d6b3c'; g.fillRect(0, 600, 1920, 480);
        g.fillStyle = '#3a2c25'; g.fillRect(0, 650, 300, 230);
        g.fillStyle = '#c99a7c'; g.beginPath(); g.arc(150, 760, 55, 0, Math.PI * 2); g.fill();
        return { tela: c };
      },
      fechar() {},
    });
    window.__povixRosto = () => ({
      async detectar(img) {
        const W = img.width; const H = img.height;
        const c = new OffscreenCanvas(W, H);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        img.close?.();
        const d = g.getImageData(0, 0, W, H).data;
        let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (Math.abs(d[i] - 0xc9) < 12 && Math.abs(d[i + 1] - 0x9a) < 12 && Math.abs(d[i + 2] - 0x7c) < 12) {
              x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
            }
          }
        }
        if (x1 < 0 || x0 <= 0 || y0 <= 0 || x1 >= W - 1 || y1 >= H - 1) return [];
        return [{ x: x0, y: y0, largura: x1 - x0 + 1, altura: y1 - y0 + 1, nota: 0.9 }];
      },
    });
  });
  // O leitor de voz da legenda vem da rede: aqui não há, e a legenda fica de fora sem travar nada.
  await p.context().route(/cdn\.jsdelivr\.net|huggingface\.co/, (r) => r.abort());
  // Um evento salvo pequeno, com os canais da Kick falsa.
  await p.route('**/eventos/teste.json', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ nome: 'Teste', jogo: null, times: [], canais: CANAIS }),
  }));
}

/** A lista pronta: com momentos e com a busca acabada. */
async function listaPronta(p) {
  await p.waitForSelector('#simplesLista li', { timeout: 60_000 });
  await p.waitForFunction(() => document.getElementById('simplesParar').hidden, null, { timeout: 60_000 });
}

test('modo simples: o nome escrito abre a lista, e o Baixar para TikTok e o deitado dão um arquivo',
  { ...semNavegador, timeout: 300_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await gravarFonte(p, { ms: 10_000 });

    // A tela inicial: a pergunta, a caixa, o botão e a frase da primeira vez. Nada dos dois caminhos.
    assert.equal(await p.locator('#simplesPergunta').innerText(), 'Cole o nome do streamer, o link do vídeo ou o nome do evento');
    assert.equal(await p.locator('#simplesAchar').innerText(), 'Achar os melhores momentos');
    assert.equal(await p.locator('#simplesDica').isVisible(), true);
    for (const id of ['caminhoEvento', 'caminhoVod', 'exemploAoVivo', 'lema', 'passos', 'ajuda']) {
      assert.equal(await p.locator(`#${id}`).isVisible(), false, `${id} devia estar no avançado`);
    }

    await p.fill('#simplesCaixa', 'tchubi');
    await p.click('#simplesAchar');
    await listaPronta(p);
    // Sem linha do tempo nem palco no modo simples.
    assert.equal(await p.locator('#palco').isVisible(), false);
    assert.equal(await p.locator('#simplesDica').isVisible(), false);
    assert.match(await p.locator('#simplesQuem').innerText(), /^tchubi, live de \d\d\/\d\d às \d\d:\d\d$/);
    const primeiro = p.locator('#simplesLista li').first();
    assert.match(await primeiro.locator('.simplesMotivo').innerText(), /O chat explodiu/);
    assert.match(await primeiro.locator('.simplesQuando').innerText(), /^Aos \d+ min da live, às \d\d:\d\d\. Clipe de \d+ s\.$/);
    // Só ouve em volta do pico do chat (modo esperto): varrido fica "picos", nunca "tudo" nem "Pronto".
    assert.match(await p.locator('#simplesEstado').innerText(), /^Busca rápida: \d+ momentos?/);
    const vodCache = await p.evaluate(() => JSON.parse(localStorage.getItem('povix.simplesVods') || '[]')
      .find((v) => v.slug === 'tchubi'));
    assert.equal(vodCache?.varrido, 'picos', `varredura inesperada: ${JSON.stringify(vodCache)}`);
    assert.equal(vodCache?.pendente, false, 'o áudio ficou pendente: a fonte de teste não deu som de verdade');
    const suportaVideo = await p.evaluate(() => Boolean(
      document.createElement('video').canPlayType('application/vnd.apple.mpegurl')
      || (window.MediaSource || window.ManagedMediaSource)?.isTypeSupported?.('video/mp4; codecs="avc1.64001f,mp4a.40.2"'),
    ));
    if (!suportaVideo) assert.match(await p.locator('#simplesAviso').innerText(), /Chrome/);
    assert.equal(await p.locator('#simplesDicaLista').isVisible(), true);

    // Baixar para TikTok: em pé, sem janela à vista, com o nome que ela entende.
    const [tiktok] = await Promise.all([
      p.waitForEvent('download', { timeout: 150_000 }).catch(async (e) => {
        const visto = await p.evaluate(() => ({
          cartao: document.querySelector('#simplesLista li .simplesBaixando')?.textContent,
          clipe: document.getElementById('estadoClipe').textContent,
          webcam: document.getElementById('webcamAchada').textContent,
          legenda: document.getElementById('estadoLegenda')?.textContent,
          previa: document.getElementById('previaClipe').readyState,
        }));
        throw new Error(`o 9:16 não saiu: ${JSON.stringify(visto)}`, { cause: e });
      }),
      primeiro.locator('button[data-acao="tiktok"]').click(),
    ]);
    // titulo.js virou frase inteira ("O chat explodiu"), não a palavra curta de antes.
    assert.match(tiktok.suggestedFilename(), /^tchubi - \d\d-\d\d - O chat explodiu\.(mp4|webm)$/);
    await p.waitForFunction(() => /Pronto\. O clipe está na pasta Downloads\./.test(
      document.querySelector('#simplesLista li .simplesBaixando').textContent), null, { timeout: 15_000 });
    assert.equal(await p.locator('#modalClipe').isVisible(), false);
    // O rosto do streamer foi achado sozinho, e o clipe saiu em dois enquadramentos (rosto em cima).
    assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('replay.rostos') || '{}').tchubi), 'o rosto não foi achado');
    const tamanho = (await import('node:fs')).statSync(await tiktok.path()).size;
    assert.ok(tamanho > 1000, `o arquivo em pé saiu vazio (${tamanho} bytes)`);

    // Baixar deitado: a cópia do pedaço da Kick, sem converter.
    const [deitado] = await Promise.all([
      p.waitForEvent('download', { timeout: 60_000 }),
      primeiro.locator('button[data-acao="deitado"]').click(),
    ]);
    // 'simples.arquivo.deitado' virou "tela cheia", não "deitado".
    assert.match(deitado.suggestedFilename(), /^tchubi - \d\d-\d\d - O chat explodiu \(tela cheia\)\.(mp4|ts)$/);
    // Começar de novo volta à caixa.
    await p.click('#simplesDeNovo');
    assert.equal(await p.locator('#simplesCaixa').isVisible(), true);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('modo simples: o link da aba de vídeos e uma sugestão tocada começam sozinhos', { ...semNavegador, timeout: 120_000 }, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
  await preparar(p, { video: false });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#simplesCaixa', 'https://kick.com/tchubi/videos');
  await p.press('#simplesCaixa', 'Enter');
  await listaPronta(p);
  assert.match(await p.locator('#simplesQuem').innerText(), /^tchubi/);
  await p.click('#simplesDeNovo');
  // As sugestões: tocar numa abre direto, sem outro botão.
  await p.fill('#simplesCaixa', 'outr');
  await p.waitForSelector('#simplesSugestoes button[data-slug="outro"]');
  await p.click('#simplesSugestoes button[data-slug="outro"]');
  await p.waitForFunction(() => /^outro/.test(document.getElementById('simplesQuem').textContent), null, { timeout: 30_000 });
  assert.deepEqual(erros, []);
  await p.close();
});

test('modo simples: um nome que não existe diz o que fazer e sugere parecidos', { ...semNavegador, timeout: 60_000 }, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
  await preparar(p, { video: false });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#simplesCaixa', 'tchubii');
  await p.click('#simplesAchar');
  await p.waitForSelector('#simplesErro:not([hidden])');
  assert.match(await p.locator('#simplesErro').innerText(), /Não achei ninguém com esse nome na Kick/);
  await p.waitForSelector('#simplesParecidos button[data-slug="tchubi"]');
  await p.fill('#simplesCaixa', 'youtube.com/x');
  await p.click('#simplesAchar');
  assert.match(await p.locator('#simplesErro').innerText(), /Isso não parece um nome nem um link da Kick/);
  assert.deepEqual(erros, []);
  await p.close();
});

test('modo simples: o nome do evento vira a lista simples, sem o mapa, e o mapa fica no Modo avançado',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p, { video: false });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#simplesCaixa', 'Teste');
    await p.click('#simplesAchar');
    await p.waitForFunction(() => window.__evento?.elenco, null, { timeout: 30_000 });
    // A lista simples do evento: o título, o botão de parar enquanto lê, e o mapa fora da vista.
    await p.waitForFunction(() => /^Evento Teste$/.test(document.getElementById('simplesQuem').textContent), null, { timeout: 30_000 });
    assert.equal(await p.locator('#simplesTrabalho').isVisible(), true);
    assert.equal(await p.locator('#evento').isVisible(), false);
    assert.equal(await p.locator('#palco').isVisible(), false);
    await p.waitForFunction(() => /^(Pronto|Não achei momentos fortes)/.test(document.getElementById('simplesEstado').textContent),
      null, { timeout: 60_000 });
    // Cada cartão diz de que streamer é e tem os dois Baixar e o Excluir.
    for (const li of await p.locator('#simplesLista li').all()) {
      assert.match(await li.locator('.simplesStreamer').innerText(), /^Do streamer (tchubi|outro)$/);
      for (const a of ['tiktok', 'deitado', 'nao']) assert.equal(await li.locator(`button[data-acao="${a}"]`).count(), 1);
    }
    // Modo avançado: o mapa de sempre, com o evento aberto.
    await p.click('#modoAvancadoLista');
    assert.equal(await p.locator('#evento').isVisible(), true);

    // E o link curto do evento (?e=teste), aberto no modo simples, faz o mesmo.
    const { p: p2, erros: erros2 } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p2, { video: false });
    await p2.goto(`http://127.0.0.1:${PORTA}/?e=teste`, { waitUntil: 'networkidle' });
    await p2.waitForFunction(() => /^Evento Teste$/.test(document.getElementById('simplesQuem').textContent), null, { timeout: 30_000 });
    assert.equal(await p2.locator('#evento').isVisible(), false);
    assert.deepEqual(erros, []);
    assert.deepEqual(erros2, []);
    await p.close();
    await p2.close();
  });

test('modo simples: "Excluir" tira o momento e ele não volta; "Mostrar mais" só aparece com mais de dez',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p, { video: false });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#simplesCaixa', 'tchubi');
    await p.click('#simplesAchar');
    await listaPronta(p);
    const antes = await p.locator('#simplesLista li').count();
    assert.equal(await p.locator('#simplesMais').isVisible(), false);
    await p.locator('#simplesLista li').first().locator('button[data-acao="nao"]').click();
    assert.equal(await p.locator('#simplesLista li').count(), antes - 1);
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('povix.simplesNao')).length), 1);
    // Outra busca do mesmo streamer: o que ela não quis continua fora.
    await p.click('#simplesDeNovo');
    await p.fill('#simplesCaixa', 'tchubi');
    await p.click('#simplesAchar');
    // Cache já completo (varrido "picos"): o estado é "Busca rápida", não "Pronto"/"Parado" de antes.
    await p.waitForFunction(() => {
      const v = JSON.parse(localStorage.getItem('povix.simplesVods') || '[]').find((x) => x.slug === 'tchubi');
      return /^Busca rápida: \d+ momentos?/.test(document.getElementById('simplesEstado').textContent)
        && v?.varrido === 'picos' && v?.pendente === false;
    }, null, { timeout: 60_000 });
    assert.equal(await p.locator('#simplesLista li').count(), antes - 1);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('modo simples: o espaço não toca vídeo escondido, e tocar a imagem toca no cartão e pausa com o espaço',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#simplesCaixa', 'tchubi');
    await p.click('#simplesAchar');
    await listaPronta(p);
    const tocandoFora = () => p.evaluate(() => [...document.querySelectorAll('video')]
      .filter((v) => !v.closest('.simplesPrevia') && !v.paused).length);
    // Sem prévia aberta o espaço não faz nada: antes tocava o vídeo do avançado, que ninguém vê.
    await p.locator('body').click({ position: { x: 5, y: 5 } });
    await p.keyboard.press('Space');
    assert.equal(await tocandoFora(), 0);

    const cartao = p.locator('#simplesLista li').first();
    await cartao.locator('button.simplesFoto').click();
    await p.waitForSelector('#simplesLista li .simplesPrevia video', { timeout: 30_000 });
    assert.equal(await cartao.locator('.simplesFoto').isVisible(), false);
    assert.equal(await cartao.locator('.simplesPrevia video').evaluate((v) => v.muted), false);
    // O espaço (fora de um botão) pausa a prévia e continua: e nunca toca os escondidos.
    await p.evaluate(() => document.activeElement?.blur());
    const antes = await cartao.locator('.simplesPrevia video').evaluate((v) => v.paused);
    await p.keyboard.press('Space');
    assert.equal(await cartao.locator('.simplesPrevia video').evaluate((v) => v.paused), !antes);
    assert.equal(await tocandoFora(), 0);
    // Os controles de um player comum: tocar/pausar e a barra do pedaço do lance.
    assert.equal(await cartao.locator('.simplesToca').count(), 1);
    assert.equal(await cartao.locator('input.simplesLinha').count(), 1);
    // Dar play em outro cartão devolve este à imagem: uma prévia só por vez.
    if (await p.locator('#simplesLista li').count() > 1) {
      await p.locator('#simplesLista li').nth(1).locator('button.simplesFoto').click();
      await p.waitForSelector('#simplesLista li:nth-child(2) .simplesPrevia video', { timeout: 30_000 });
      assert.equal(await cartao.locator('.simplesPrevia video').count(), 0);
      assert.equal(await cartao.locator('.simplesFoto').isVisible(), true);
    }
    assert.deepEqual(erros, []);
    await p.close();
  });

test('modo simples: Editar abre o clipe do cartão no avançado, e Voltar para a lista traz a lista de volta',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#simplesCaixa', 'tchubi');
    await p.click('#simplesAchar');
    await listaPronta(p);
    const n = await p.locator('#simplesLista li').count();
    const duracao = await p.locator('#simplesLista li').first().locator('.simplesQuando').innerText();
    const segundos = Number(/Clipe de (\d+) s/.exec(duracao)[1]);
    await p.locator('#simplesLista li').first().locator('button[data-acao="editar"]').click();
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 30_000 });
    assert.equal(await p.evaluate(() => document.documentElement.dataset.modo), 'avancado');
    // O pedaço do cartão já está marcado no editor.
    const noEditor = Number(/, ([\d.]+)s de/.exec(await p.locator('#tempoClipe').innerText())[1]);
    assert.ok(Math.abs(noEditor - segundos) <= 1, `o editor abriu com ${noEditor} s e o cartão dizia ${segundos} s`);
    assert.equal(await p.locator('#voltarListaClipe').isVisible(), true);
    await p.click('#voltarListaClipe');
    assert.equal(await p.evaluate(() => document.documentElement.dataset.modo), 'simples');
    assert.equal(await p.locator('#modalClipe').isVisible(), false);
    assert.equal(await p.locator('#simplesLista li').count(), n);
    assert.equal(await p.locator('#voltarLista').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('Modo avançado mostra a tela de antes, fica lembrado, e Modo simples volta', semNavegador, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.click('#modoAvancado');
  for (const id of ['caminhoEvento', 'caminhoVod', 'exemploAoVivo', 'lema', 'modoSimples']) {
    assert.equal(await p.locator(`#${id}`).isVisible(), true, `${id} devia aparecer no avançado`);
  }
  assert.equal(await p.locator('#simples').isVisible(), false);
  await p.reload({ waitUntil: 'networkidle' });
  assert.equal(await p.locator('#caminhoVod').isVisible(), true, 'o avançado ficou lembrado');
  await p.click('#modoSimples');
  assert.equal(await p.locator('#simplesCaixa').isVisible(), true);
  assert.equal(await p.locator('#caminhoVod').isVisible(), false);
  await p.reload({ waitUntil: 'networkidle' });
  assert.equal(await p.locator('#simplesCaixa').isVisible(), true, 'o simples ficou lembrado');
  assert.deepEqual(erros, []);
  await p.close();
});

test('quem chega sem nada guardado entra no simples; quem já usava entra no avançado', semNavegador, async () => {
  const { p } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: null });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  assert.equal(await p.evaluate(() => document.documentElement.dataset.modo), 'simples');
  await p.evaluate(() => localStorage.setItem('replay.caminho', 'vod'));
  await p.reload({ waitUntil: 'networkidle' });
  assert.equal(await p.evaluate(() => document.documentElement.dataset.modo), 'simples', 'recarregar mantém o modo inicial mesmo depois de salvar a porta');
  await p.close();
  const { p: p2 } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: 'vod', modo: null });
  await p2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p2.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  assert.equal(await p2.evaluate(() => document.documentElement.dataset.modo), 'avancado');
  await p2.close();
});

/** Os controles à vista no modo simples (a caixa, os botões, o idioma) menores do que `min` px. */
const pequenos = (p, min = 44) => p.evaluate((m) => [...document.querySelectorAll(
  '#simples :is(button, input, select, a), header :is(button, input, select, a)',
)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  .map((el) => ({ id: el.id || el.className || el.textContent.trim().slice(0, 30), ...el.getBoundingClientRect().toJSON() }))
  .filter((r) => r.height < m || r.width < m)
  .map((r) => `${r.id} ${Math.round(r.width)}x${Math.round(r.height)}`), min);

test('no celular (390x844): nenhum controle do modo simples abaixo de 44 px, e nada rola para o lado',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 }, caminho: null, modo: 'simples', toque: true });
    await preparar(p, { video: false });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    assert.deepEqual(await pequenos(p), []);
    // A primeira tela inteira cabe sem rolar: a pergunta, a caixa e o botão.
    const botao = await p.locator('#simplesAchar').boundingBox();
    assert.ok(botao.y + botao.height <= 844, 'o botão tem de caber na primeira tela');
    assert.ok(botao.width >= 340, 'o botão principal ocupa a largura toda');
    assert.ok(await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('simplesCaixa')).fontSize) >= 16),
      'letra da caixa com 16 px ou mais (abaixo disso o iPhone dá zoom)');
    // As sugestões também.
    await p.fill('#simplesCaixa', 'tchu');
    await p.waitForSelector('#simplesSugestoes button');
    assert.deepEqual(await pequenos(p), []);
    await p.tap('#simplesSugestoes button[data-slug="tchubi"]');
    await listaPronta(p);
    assert.deepEqual(await pequenos(p), []);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await p.locator('#palco').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('modo simples: o vídeo já procurado abre na hora ao recarregar, sem barra; Começar de novo esvazia a caixa',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
    await preparar(p, { video: false });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    // O que uma procura completa deixaria guardado (o Chromium destes testes não ouve o som, e sem ele não completa).
    await p.evaluate((inicio) => {
      const lista = [
        { ms: inicio + 600_000, deMs: inicio + 575_000, ateMs: inicio + 605_000, tipos: ['chat', 'tiros'], pontos: 6, falha: false, tiros: 5, nota: 'muitoBom', canal: 'tchubi' },
        { ms: inicio + 1_200_000, deMs: inicio + 1_175_000, ateMs: inicio + 1_205_000, tipos: ['chat'], pontos: 2, falha: false, tiros: 0, nota: 'talvez', canal: 'tchubi' },
      ];
      localStorage.setItem('povix.simplesVods', JSON.stringify([{ slug: 'tchubi', inicio, em: Date.now(), aoVivo: false, completo: true, lista }]));
      localStorage.setItem('povix.simplesUltimo', JSON.stringify({ slug: 'tchubi', inicio }));
    }, T);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
    assert.equal(await p.locator('#simplesLista li').count(), 2);
    assert.equal(await p.locator('#simplesBarra').isVisible(), false);
    assert.equal(await p.locator('#simplesForm').isVisible(), false);
    assert.match(await p.locator('#simplesQuem').innerText(), /^tchubi, live de \d\d\/\d\d às \d\d:\d\d$/);
    assert.match(await p.locator('#simplesLista li').first().locator('.simplesQuando').innerText(), /^Aos 10 min da live/);
    assert.equal(await p.locator('#simplesRefazer').isVisible(), true);
    // O que ela excluiu continua fora depois de recarregar.
    await p.locator('#simplesLista li').first().locator('button[data-acao="nao"]').click();
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
    assert.equal(await p.locator('#simplesLista li').count(), 1);
    // Começar de novo: a caixa vazia, e recarregar não traz a lista de volta.
    await p.click('#simplesDeNovo');
    await p.reload({ waitUntil: 'networkidle' });
    assert.equal(await p.locator('#simplesForm').isVisible(), true);
    assert.equal(await p.locator('#simplesLista li').count(), 0);
    assert.deepEqual(erros, []);
    await p.close();
  });
