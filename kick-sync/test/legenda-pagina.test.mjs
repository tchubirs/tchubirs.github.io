// A "Legenda da fala" num browser a sério: ligar na janela do clipe, o aviso do download, gerar com o
// som deste clipe, corrigir o texto, ver nas prévias, e os ficheiros exportados (9:16, 16:9 e a
// montagem) com a legenda nos píxeis do sítio certo. Desligada, nada.
//
// O que se finge, e porquê:
//  - o leitor de voz (legenda-worker.js) é trocado por um Worker que devolve um texto conhecido. O
//    modelo verdadeiro são 107 MB da internet; corre à parte (ver o relatório da legenda) e não aqui;
//  - o descodificador de AAC (som-worker.js): o Chromium dos testes não traz AAC. O resto do caminho
//    do som é o verdadeiro: o plano da exportação, os pedaços MPEG-TS de probes/fixtures/som, o AAC
//    tirado deles e o corte no instante. O Worker de mentira recusa um áudio com outra duração.
//
// O vídeo de origem são cores lisas e escuras (nenhum píxel quase branco): contar os píxeis claros
// numa região do quadro diz se a legenda está lá.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T, TEM_SOM } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { chatEVideo, gravarFonte, quadroDoFicheiro } from './chat-falso.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const pular = { skip: (!podeCorrer && 'sem navegador') || (!TEM_SOM && 'sem fixture de som') };

// O leitor de voz de mentira: fala com a página como o verdadeiro, e o texto é uma frase a cada 2,2 s.
const LEITOR_FALSO = `
const FRASES = [['que', 'tiro', 'foi', 'esse', 'mano'], ['clipa', 'isso', 'agora']];
self.onmessage = async ({ data }) => {
  if (data.tipo !== 'transcrever') return;
  const s = data.audio.length / 16000;
  self.postMessage({ tipo: 'baixar', url: 'm', feito: 40e6, total: 77e6 });
  self.postMessage({ tipo: 'abrir' });
  if (Math.abs(s - (self.ESPERADO || s)) > 0.1) { self.postMessage({ tipo: 'erro', id: data.id, nome: 'X', mensagem: 'duracao ' + s }); return; }
  await new Promise((k) => setTimeout(k, 150));
  self.postMessage({ tipo: 'ouvir', fracao: 0.5 });
  const palavras = [];
  for (let ini = 0.2, f = 0; ini + 1 < s; ini += 2.2, f++) {
    FRASES[f % 2].forEach((t, i) => palavras.push({ t, de: ini + i * 0.3, ate: ini + i * 0.3 + 0.28 }));
  }
  self.postMessage({ tipo: 'pronto', id: data.id, palavras, segundos: 0.2, idioma: data.idioma, amostras: data.audio.length });
};`;

// O AAC sem codec: conta os frames ADTS e devolve o som com a duração certa (1024 amostras por frame).
const DESCODIFICADOR_FALSO = `
onmessage = ({ data: { id, aac, taxaAlvo } }) => {
  let frames = 0;
  for (let o = 0; o + 7 <= aac.length;) {
    const tam = ((aac[o + 3] & 3) << 11) | (aac[o + 4] << 3) | ((aac[o + 5] & 0xe0) >> 5);
    if (tam < 7) break;
    frames++; o += tam;
  }
  const taxas = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  const taxa = taxas[(aac[2] & 0x3c) >> 2] || 48000;
  const n = Math.round(frames * 1024 * taxaAlvo / taxa);
  const mono = new Float32Array(n).map((_, i) => 0.2 * Math.sin(i / 7));
  postMessage({ id, mono }, [mono.buffer]);
};`;

async function carregar(p, { esperadoS }) {
  await kickFalsa(p, { canais: ['tchubi'], comSom: true });
  await chatEVideo(p);
  await p.route('**/legenda-worker.js', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript', body: `self.ESPERADO = ${esperadoS};\n${LEITOR_FALSO}`,
  }));
  await p.route('**/som-worker.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: DESCODIFICADOR_FALSO }));
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await gravarFonte(p, { ms: 7000 });
  await p.fill('#canais', 'tchubi');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
}

const comImagem = (p) => p.waitForFunction(() => window.__estado.clipe?.rects.length > 0
  && document.getElementById('previaClipe').readyState >= 2, null, { timeout: 15000 });

async function ficheiro(p, n) {
  try {
    await p.waitForFunction((k) => document.querySelectorAll('#fila li a[download]').length >= k, n, { timeout: 90_000 });
  } catch (e) {
    const visto = await p.evaluate(() => ({
      clipe: document.getElementById('estadoClipe').textContent,
      montagem: document.getElementById('estadoMontagem').textContent,
      fila: document.getElementById('fila').textContent,
    }));
    throw new Error(`o ficheiro ${n} não saiu: ${JSON.stringify(visto)}`, { cause: e });
  }
  return p.evaluate(() => {
    const a = document.querySelector('#fila li a[download]');
    return { url: a.href, nome: a.getAttribute('download'), nota: a.closest('li').querySelector('.nota')?.textContent || '' };
  });
}

async function gerar(p) {
  await p.click('#gerarLegenda');
  await p.waitForFunction(() => /falas? em/.test(document.getElementById('estadoLegenda').textContent)
    || /Não deu|não tem som/.test(document.getElementById('estadoLegenda').textContent), null, { timeout: 30000 });
  const nota = await p.locator('#estadoLegenda').innerText();
  assert.match(nota, /falas? em \d+ s/, `a legenda não saiu: ${nota}`);
}

// Regiões em fracções do quadro.
const LEGENDA_9x16 = [0.05, 0.6, 0.9, 0.16];
const LONGE_9x16 = [0, 0, 1, 0.45];
const LEGENDA_16x9 = [0.15, 0.78, 0.7, 0.2];
const LONGE_16x9 = [0, 0, 1, 0.6];

test('Legenda: desligada por omissão; ligada, avisa do download, gera do som do clipe, corrige-se, e sai no 9:16 e no 16:9',
  { ...pular, timeout: 300_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await carregar(p, { esperadoS: 4 });
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])');
    await comImagem(p);
    assert.equal(await p.isChecked('#legendaLigada'), false, 'a legenda tem de nascer desligada');
    assert.equal(await p.isHidden('#legendaOpcoes'), true);
    // Um clipe de quatro segundos no início da noite (o primeiro pedaço do som de teste).
    const deMs = await p.evaluate(() => { const c = window.__estado.clipe; c.ateMs = c.deMs + 4000; return c.deMs; });
    assert.equal(deMs, T);

    // Ligada: o aviso do download antes de qualquer coisa, e o botão diz quanto baixa.
    await p.check('#legendaLigada');
    assert.equal(await p.isVisible('#legendaOpcoes'), true);
    await p.waitForFunction(() => /107 MB/.test(document.getElementById('gerarLegenda').textContent), null, { timeout: 5000 });
    assert.match(await p.locator('#legendaBaixar').innerText(), /Da primeira vez.*107 MB, uma vez só/);
    assert.match(await p.locator('#legendaClipe .legendaAviso').innerText(), /pode errar com barulho de tiro; confira antes de exportar/);
    assert.equal(await p.isHidden('#legendaTexto'), true, 'sem texto ainda, sem lista');
    // Ligada sem texto, exportar diz o que falta em vez de sair um clipe sem legenda.
    await p.click('#guardarRetrato');
    assert.match(await p.locator('#estadoClipe').innerText(), /Gere a legenda antes de exportar/);

    // Gerar: o som deste clipe (4 s, conferido pelo leitor de mentira), e o texto na lista.
    await gerar(p);
    const pedidos = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((u) => /falsa\/tchubi\/.*\.ts$/.test(u)));
    assert.ok(pedidos.length >= 1 && pedidos.length <= 2, `só os pedaços do clipe: ${pedidos.length}`);
    const falas = p.locator('#legendaFalas li');
    assert.equal(await falas.count(), 2);
    assert.equal(await falas.nth(0).locator('.falaTexto').inputValue(), 'que tiro foi esse mano');
    assert.equal(await falas.nth(0).locator('.falaTempo').innerText(), '0:00.2');
    assert.match(await p.locator('#gerarLegenda').innerText(), /Gerar de novo/);

    // Corrigir: uma palavra, e o tempo da segunda fala.
    await falas.nth(0).locator('.falaTexto').fill('que tiro foi esse irmão');
    await falas.nth(0).locator('.falaTexto').press('Enter');
    await falas.nth(1).locator('.depois').click();
    const tr = await p.evaluate(() => window.__estado.clipe.transcricao);
    assert.equal(tr.linhas[0].palavras.at(-1).t, 'irmão');
    assert.equal(tr.linhas[1].palavras[0].de - T, 2500, 'a segunda fala andou 0,1 s');
    assert.equal(await falas.nth(1).locator('.falaTempo').innerText(), '0:02.5');
    // O texto nunca vira HTML: uma correção com marcas fica texto na lista.
    await falas.nth(1).locator('.falaTexto').fill('<b>clipa</b> isso');
    await falas.nth(1).locator('.falaTexto').press('Enter');
    assert.equal(await p.locator('#legendaFalas b').count(), 0);

    // A prévia 16:9 mostra a legenda embaixo ao meio, com a agulha no meio da primeira fala.
    await p.evaluate((t) => { window.__estado.clipe.cabecaMs = t + 900; }, T);
    await p.waitForTimeout(300);
    const previa = await p.evaluate(([zona, longe]) => {
      const tela = document.getElementById('chatFonte');
      const conta = ([fx, fy, fw, fh]) => {
        const d = tela.getContext('2d').getImageData(fx * tela.width, fy * tela.height, fw * tela.width, fh * tela.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) n++;
        return n;
      };
      return { zona: conta(zona), longe: conta(longe), visivel: !tela.hidden };
    }, [LEGENDA_16x9, LONGE_16x9]);
    assert.equal(previa.visivel, true);
    assert.ok(previa.zona > 300, `a prévia 16:9 não mostra a legenda (${previa.zona})`);
    assert.equal(previa.longe, 0, 'a legenda saiu do fundo');
    assert.equal(await p.locator('#legendaFalas li.agora').count(), 1, 'a fala da prévia fica marcada na lista');

    // 9:16 exportado: a legenda no terço de baixo, e nada lá em cima.
    await p.click('#guardarRetrato');
    const retrato = await ficheiro(p, 1);
    assert.match(retrato.nota, /1080x1920, com legenda/);
    const q1 = await quadroDoFicheiro(p, retrato.url, { legenda: LEGENDA_9x16, longe: LONGE_9x16 }, { aosS: 1.0 });
    assert.ok(q1.contas.legenda > 400, `o 9:16 exportado não tem a legenda (${q1.contas.legenda} píxeis claros)`);
    assert.equal(q1.contas.longe, 0, 'a legenda do 9:16 apareceu fora do sítio');

    // 16:9 exportado: gravado (os píxeis mudam), com a legenda embaixo ao meio.
    await p.click('#guardarClipe');
    const deitado = await ficheiro(p, 2);
    assert.match(deitado.nome, /\.(mp4|webm)$/);
    assert.match(deitado.nota, /1920x1080, com legenda/);
    const q2 = await quadroDoFicheiro(p, deitado.url, { legenda: LEGENDA_16x9, longe: LONGE_16x9 }, { aosS: 1.0 });
    assert.ok(q2.contas.legenda > 400, `o 16:9 exportado não tem a legenda (${q2.contas.legenda})`);
    assert.equal(q2.contas.longe, 0);

    // Desligada: some da prévia, e o 16:9 volta a ser a cópia dos bytes da Kick.
    await p.uncheck('#legendaLigada');
    assert.equal(await p.isHidden('#chatFonte'), true);
    await p.click('#guardarClipe');
    const copia = await ficheiro(p, 3);
    assert.match(copia.nome, /\.ts$/, `sem legenda o 16:9 é a cópia dos bytes, saiu ${copia.nome}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('a montagem leva a legenda corrigida de cada kill que a guardou ligada',
  { ...pular, timeout: 300_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await carregar(p, { esperadoS: 4 });
    await p.click('#mais3s');
    await p.click('#mais3s');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]');
    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])');
    await comImagem(p);
    await p.evaluate((t) => { const c = window.__estado.clipe; c.deMs = t; c.ateMs = t + 4000; }, T);
    await p.check('#legendaLigada');
    await p.selectOption('#legendaEstilo', 'simples');
    await gerar(p);
    await p.locator('#legendaFalas li').nth(0).locator('.falaTexto').fill('que tiro foi esse irmão');
    await p.locator('#legendaFalas li').nth(0).locator('.falaTexto').press('Enter');
    await p.click('#guardarAjustes');
    await p.waitForFunction(() => document.getElementById('modalClipe').hidden, null, { timeout: 10000 });
    const aj = await p.evaluate(() => window.__estado.momentos[0].ajuste);
    assert.equal(aj.legenda?.ligado, true);
    assert.equal(aj.legenda.estilo, 'simples');
    assert.equal(aj.legenda.transcricao.linhas[0].palavras.at(-1).t, 'irmão');
    assert.match(await p.locator('#listaMomentos .ajustado').innerText(), /com legenda/);

    // Reaberta, a kill volta com a legenda ligada, o mesmo estilo e o texto corrigido.
    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])');
    assert.equal(await p.isChecked('#legendaLigada'), true);
    assert.equal(await p.inputValue('#legendaEstilo'), 'simples');
    assert.equal(await p.locator('#legendaFalas li').nth(0).locator('.falaTexto').inputValue(), 'que tiro foi esse irmão');
    await p.click('#cancelarClipe');

    // E depois de recarregar a página (a sessão fica no aparelho), continua lá.
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__estado?.momentos?.length === 1, null, { timeout: 20000 });
    const depois = await p.evaluate(() => window.__estado.momentos[0].ajuste?.legenda?.transcricao?.linhas?.[0]?.palavras?.at(-1)?.t);
    assert.equal(depois, 'irmão');
    await gravarFonte(p, { ms: 7000 });
    await p.waitForSelector('.tile', { timeout: 20000 });

    await p.click('#baixarMontagem');
    await p.waitForFunction(() => /exportados/.test(document.getElementById('estadoMontagem').textContent),
      null, { timeout: 120_000 });
    assert.match(await p.locator('#estadoMontagem').innerText(), /^1\/1 exportados/,
      `a montagem não saiu: ${await p.locator('#fila').innerText()}`);
    const f = await ficheiro(p, 1);
    assert.match(f.nota, /com legenda/);
    const q = await quadroDoFicheiro(p, f.url, { legenda: LEGENDA_16x9, longe: LONGE_16x9 }, { aosS: 1.0 });
    assert.ok(q.contas.legenda > 300, `a montagem saiu sem a legenda (${q.contas.legenda})`);
    assert.equal(q.contas.longe, 0);
    assert.deepEqual(erros, []);
    await p.close();
  });

// O leitor verdadeiro (legenda-worker.js) arranca neste Chromium com a política de segurança da página,
// pede o transformers.js ao endereço fixo do jsDelivr, e recusa-o quando os bytes não são os do pacote.
// Sem rede: o jsDelivr e o Hugging Face são fingidos.
test('o leitor de voz verdadeiro arranca e recusa um código adulterado', { skip: !podeCorrer && 'sem navegador', timeout: 120_000 }, async () => {
  const { p, erros } = await abrir();
  const pedidos = [];
  await p.context().route(/cdn\.jsdelivr\.net|huggingface\.co/, (r) => {
    pedidos.push(r.request().url());
    return r.fulfill({ status: 200, contentType: 'text/javascript', body: Buffer.from('self.__adulterado = 1;') });
  });
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(async () => {
    const { abrirVoz } = await import('/legenda-voz.js');
    const voz = abrirVoz();
    try {
      await voz.transcrever(new Float32Array(16000), { idioma: 'pt' });
      return { ok: true };
    } catch (e) {
      return { nome: e.name, msg: e.message };
    } finally { voz.fechar(); }
  });
  assert.equal(r.nome, 'INTEGRIDADE', JSON.stringify(r));
  assert.deepEqual(pedidos, ['https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js']);
  assert.deepEqual(erros, []);
  await p.close();
});
