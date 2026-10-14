// Achar as mortes nos vídeos, num navegador a sério.
//
// 1. O leitor de texto (o Tesseract do vendor/) lê quem matou nos 13 quadros nítidos verdadeiros de
//    test/telas-morte/, pelo mesmo caminho da página (achar a caixa, ampliar, preto no branco, ler).
// 2. As imagens saem do TS verdadeiro da Kick pelo descodificador do navegador. O Chromium dos testes não
//    traz H.264, por isso o `VideoDecoder` é um duplo que devolve uma imagem por cada uma que recebe; o
//    que se testa é o resto: o codec pedido, as chaves, a hora de cada imagem e as 2 por segundo.
// 3. A página inteira: um evento de três canais, a detecção acha tiroteios e as mortes aparecem sozinhas
//    no mapa, sem colar nada. As imagens pequenas vêm das telas verdadeiras (window.__povixTelas) e os
//    quadros nítidos dos recortes verdadeiros (window.__povixQuadros): a conta, o leitor, as marcas, os
//    melhores lances e a montagem são os de sempre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { passo4Detetar } from './assistente.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const D = new URL('./telas-morte/', import.meta.url).pathname;
const nitidas = JSON.parse(fs.readFileSync(`${D}nitidas.json`, 'utf8')).casos
  .map((c) => ({ ...c, png: fs.readFileSync(D + c.arquivo).toString('base64') }));
const base = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Pôr na página uma função que monta o quadro inteiro de um recorte nítido (o resto a cinzento da tela). */
async function comQuadrosNitidos(p) {
  await p.evaluate((lista) => {
    window.__nitidas = lista;
    window.__quadroNitido = async (c) => {
      const img = new Image();
      img.src = `data:image/png;base64,${c.png}`;
      await img.decode();
      const tela = document.createElement('canvas');
      tela.width = c.largura;
      tela.height = c.altura;
      const g = tela.getContext('2d');
      g.fillStyle = 'rgb(32,32,32)';
      g.fillRect(0, 0, tela.width, tela.height);
      g.drawImage(img, c.x, c.y);
      return tela;
    };
  }, nitidas);
}

test('o leitor lê quem matou nos quadros nítidos verdadeiros', { ...semNavegador, timeout: 240_000 }, async () => {
  const { p, erros } = await abrir();
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await comQuadrosNitidos(p);
  const lidos = await p.evaluate(async () => {
    const { lerNomeNoQuadro } = await import('/achar-mortes-video.js');
    const { abrirLeitor } = await import('/ler-tela.js');
    const leitor = await abrirLeitor({ modo: '7' });
    const saida = [];
    for (const c of window.__nitidas) {
      const tela = await window.__quadroNitido(c);
      const r = await lerNomeNoQuadro(tela, c.largura, c.altura, leitor);
      saida.push({ arquivo: c.arquivo, nome: c.nome, lido: r?.nome ?? null });
    }
    await leitor.fechar();
    return saida;
  });
  const certos = lidos.filter((x) => base(x.lido) === base(x.nome));
  console.log(lidos.map((x) => `${x.arquivo}: ${x.nome} -> ${x.lido}`).join('\n'));
  // Medido em 12/10: 13 de 13 (ver FILA.md). Abaixo de 12 é regressão.
  assert.ok(certos.length >= 12, `${certos.length} de ${lidos.length}`);
  assert.deepEqual(erros, []);
  await p.close();
});

test('as imagens saem do TS verdadeiro da Kick: o codec, as chaves, a hora de cada uma e 2 por segundo', semNavegador, async () => {
  const { p, erros } = await abrir();
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  const ts = fs.readFileSync(new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url)).toString('base64');
  const r = await p.evaluate(async (b64) => {
    // O duplo do descodificador: uma imagem (uma tela de 284x160) por cada imagem comprimida, com a hora dela.
    const pedidos = { config: null, chunks: [], fechado: false };
    window.VideoDecoder = class {
      constructor({ output }) { this.output = output; this.decodeQueueSize = 0; }
      configure(c) { pedidos.config = c; }
      decode(chunk) {
        pedidos.chunks.push({ tipo: chunk.type, ts: chunk.timestamp });
        const f = document.createElement('canvas');
        f.width = 284; f.height = 160;
        f.timestamp = chunk.timestamp;
        f.close = () => {};
        this.output(f);
      }
      async flush() {}
      close() { pedidos.fechado = true; }
    };
    window.EncodedVideoChunk = class { constructor(o) { Object.assign(this, o); } };
    const { quadrosDoTs, podeDescodificar } = await import('/achar-mortes-video.js');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const vistos = [];
    const n = await quadrosDoTs(bytes, [{ inicio: 1_000_000 }], { cadaMs: 500, aoQuadro: (q) => vistos.push([q.ms, q.pixeis.length]) });
    return { n, vistos, pedidos, pode: podeDescodificar() };
  }, ts);
  assert.equal(r.pode, true);
  assert.equal(r.pedidos.config.codec, 'avc1.4D400C');
  assert.equal(r.pedidos.chunks.length, 375);
  assert.equal(r.pedidos.chunks[0].tipo, 'key');
  assert.equal(r.pedidos.chunks.filter((c) => c.tipo === 'key').length, 3);
  assert.equal(r.pedidos.fechado, true);
  // 375 imagens a 30 por segundo são 12,5 s: 25 imagens de 160x90, uma a cada meio segundo, a começar no
  // início do segmento.
  assert.equal(r.n, 25);
  assert.equal(r.vistos[0][0], 1_000_000);
  assert.ok(r.vistos.every(([, l]) => l === 160 * 90 * 4));
  const passos = r.vistos.slice(1).map(([ms], i) => ms - r.vistos[i][0]);
  assert.ok(passos.every((d) => d >= 500 && d < 540), passos.join(','));
  assert.deepEqual(erros, []);
  await p.close();
});

// ── a página inteira ───────────────────────────────────────────────────────

const CANAIS = ['xguiry', 'cyrus', 'crreg'];
const ELENCO = 'Alfa: xguiry\nBeta: cyrus\ncrreg';
// Os tiroteios que a detecção (fingida) acha, em segundos desde o começo da noite, por canal.
const TIROS = { xguiry: [200], cyrus: [196], crreg: [400] };
// Onde a tela de morte aparece nas imagens pequenas: as telas verdadeiras de test/telas-morte/ (as do
// xguiry e do crreg), por 3 s; o resto do tempo, quadros verdadeiros de jogo dos mesmos canais (uma luz
// vermelha da base, o "ABATIDO", o inventário), que não são morte.
const TELA = { xguiry: { s: 205, caso: 22, jogo: [49, 52, 92] }, crreg: { s: 410, caso: 0, jogo: [24, 26, 55] }, cyrus: { s: null, jogo: [90, 91] } };
// O quadro nítido de cada canal: o recorte verdadeiro onde se lê "cyrus" (o xguiry, 05/10 às 15841 s do
// VOD) e "yer" (o crreg a matar-se com o F1).
const NITIDA = { xguiry: 'nitida-10-xguiry.png', crreg: 'nitida-01-crreg.png' };

async function varreduraFalsa(p) {
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      export function custoVarrerMB() { return 1; }
      export async function varrerNoite(o) {
        const tiros = ${JSON.stringify(TIROS)}[o.linha.slug] || [];
        return {
          ouvido: { altos: 0, chumbados: 0, passaram: 0, maiorGrupo: 0 }, estouros: [], falhados: 0, bytes: 0,
          candidatos: tiros.map((s) => ({ ms: ${T} + s * 1000, combateDeMs: ${T} + s * 1000 - 2000, combateAteMs: ${T} + s * 1000 + 3000, tiros: 3 })),
        };
      }`,
  }));
  // O "quem morreu" da detecção de sempre vê os ecrãs pelo <video>: aqui todos a jogar.
  await p.route('**/frames.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `export function criarApanhador() { return { async frame() { const pixeis = new Uint8ClampedArray(1600); for (let i = 0; i < 400; i++) pixeis.set([150, 90, 40, 255], i * 4); return { pixeis, imagem: 'data:,' }; }, fechar() {} }; }`,
  }));
}

/** As imagens pequenas (window.__povixTelas) e os quadros nítidos (window.__povixQuadros), verdadeiros. */
async function telasVerdadeiras(p) {
  const tira = fs.readFileSync(`${D}telas-160x90-topo.png`).toString('base64');
  await p.evaluate(async ({ tira, TELA, NITIDA, T0, lista }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${tira}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const caso = (k) => {
      const px = new Uint8ClampedArray(160 * 90 * 4);
      px.set(g.getImageData(0, k * 12, 160, 12).data);
      return px;
    };
    window.__telasPedidas = [];
    window.__povixTelas = async (canal, deMs, ateMs, cadaMs) => {
      window.__telasPedidas.push({ canal, deMs, ateMs });
      const t = TELA[canal];
      const saida = [];
      let i = 0;
      for (let ms = deMs; ms < ateMs; ms += cadaMs, i++) {
        const s = (ms - T0) / 1000;
        const morto = t.s != null && s >= t.s && s < t.s + 3;
        saida.push({ ms, pixeis: caso(morto ? t.caso : t.jogo[i % t.jogo.length]) });
      }
      return saida;
    };
    const porArquivo = new Map(lista.map((x) => [x.arquivo, x]));
    window.__nitidasPedidas = [];
    window.__povixQuadros = async (vod) => {
      const canal = Object.keys(NITIDA).find((x) => vod.master.includes(`/${x}/`));
      return {
        degrau: { altura: 1080 },
        async quadro(ms) {
          window.__nitidasPedidas.push({ canal, ms });
          const n = porArquivo.get(NITIDA[canal]);
          return n ? { tela: await window.__quadroNitido(n), largura: n.largura, altura: n.altura } : null;
        },
        fechar() {},
      };
    };
  }, { tira, TELA, NITIDA, T0: T, lista: nitidas });
  await comQuadrosNitidos(p);
}

test('as mortes aparecem sozinhas no mapa depois da detecção, sem colar nada', { ...semNavegador, timeout: 240_000 }, async () => {
  const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
  await kickFalsa(p, { canais: CANAIS });
  await varreduraFalsa(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', ELENCO);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  await telasVerdadeiras(p);
  // A secção das mortes está à vista, vazia, e o registro do servidor fechado: não há nada a colar.
  assert.equal(await p.locator('#mortes').isVisible(), true);
  assert.equal(await p.locator('#mortesTexto').isVisible(), false);
  assert.equal(await p.evaluate(() => window.__mortes.casadas().length), 0);

  // A noite dos três, e a detecção de sempre ("Detectar lances" de todos).
  await p.evaluate((canais) => {
    document.getElementById('canais').value = canais.join('\n');
    document.getElementById('carregar').click();
  }, CANAIS);
  await p.waitForSelector('.tile', { timeout: 15000 });
  p.on('dialog', (d) => d.accept());
  await passo4Detetar(p, { quem: '*' });
  await p.click('#detetarTrecho');

  // Sem mais nenhum clique: as telas de morte perto dos tiros são vistas, quem matou é lido, e as mortes
  // entram na lista e no mapa.
  await p.waitForFunction(() => window.__mortes.casadas().length === 2 && !window.__mortes.estado.busca, null, { timeout: 60_000 });
  const mortes = await p.evaluate(() => window.__mortes.casadas().map((m) => ({
    ms: m.ms, vitima: m.vitima, matador: m.matador, canalMatador: m.canalMatador, confirmado: Boolean(m.confirmado), msMatador: m.msMatador ?? null, origem: m.origem,
  })));
  assert.deepEqual(mortes, [
    // A tela do xguiry entra aos 205 s; a morte fica 2 s antes. "cyrus" é canal do evento, e o tiro dele
    // aos 196 s confirma: a marca dele fica no tiro.
    { ms: T + 203_000, vitima: 'xguiry', matador: 'cyrus', canalMatador: 'cyrus', confirmado: true, msMatador: T + 196_000, origem: 'video' },
    // "yer" não é canal nenhum: a morte é só do crreg.
    { ms: T + 408_000, vitima: 'crreg', matador: 'yer', canalMatador: null, confirmado: false, msMatador: null, origem: 'video' },
  ]);
  // Só se olhou perto dos tiros (de 5 s antes do combate a 45 s depois), e o quadro nítido só nas telas.
  const pedidas = await p.evaluate(() => window.__telasPedidas);
  assert.ok(pedidas.every((x) => x.deMs >= T - 10_000 && x.ateMs - x.deMs <= 120_000));
  const olhadoS = pedidas.reduce((s, x) => s + (x.ateMs - x.deMs), 0) / 1000;
  assert.ok(olhadoS <= 3 * 55, `${olhadoS} s olhados`);
  const nitidasPedidas = await p.evaluate(() => window.__nitidasPedidas);
  assert.ok(nitidasPedidas.length >= 2 && nitidasPedidas.length <= 6, JSON.stringify(nitidasPedidas));
  assert.deepEqual([...new Set(nitidasPedidas.map((x) => x.canal))].sort(), ['crreg', 'xguiry']);

  // As marcas: na faixa de quem morreu e na de quem matou (no tiro dele).
  const marcas = await p.evaluate(() => Object.fromEntries([...window.__mortes.marcas()].map(([c, l]) => [c, l.map((m) => [m.ms, m.papel])])));
  assert.deepEqual(marcas, {
    xguiry: [[T + 203_000, 'morreu']], cyrus: [[T + 196_000, 'matou']], crreg: [[T + 408_000, 'morreu']],
  });
  await p.click('#mostrarMapa');
  assert.match(await p.locator('#mortesEstado').innerText(), /2 mortes achadas nos vídeos/);
  const linhas = await p.$$eval('#mortesLista li .morteQuem', (l) => l.map((x) => x.textContent));
  assert.match(linhas[0], /cyrus matou xguiry \(o tiro de cyrus confirma\)/);
  assert.match(linhas[1], /crreg morreu \(quem matou: yer\)/);
  assert.equal(await p.locator('#legendaMorte').isVisible(), true);
  // Nos melhores lances, a morte é um lance dos dois canais.
  await p.waitForFunction(() => /morte no vídeo: cyrus matou xguiry/.test(document.getElementById('melhoresLista').textContent), null, { timeout: 5000 });
  // O registro do servidor ficou fechado e vazio o tempo todo.
  assert.equal(await p.locator('#mortesServidor').evaluate((d) => d.open), false);
  assert.equal(await p.locator('#mortesTexto').inputValue(), '');

  // Outra visita: as mortes ficam, e o que já se olhou não se olha outra vez.
  await p.evaluate(() => { window.__povixTelas = null; });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__evento?.mapa && window.__mortes?.casadas().length === 2, null, { timeout: 15000 });
  await telasVerdadeiras(p);
  await p.evaluate(() => window.__mortes.acharMortes({ modo: 'tiros' }));
  assert.match(await p.locator('#mortesEstado').innerText(), /já foram olhados/);
  assert.deepEqual(await p.evaluate(() => window.__telasPedidas), []);
  assert.deepEqual(erros, []);
  await p.close();
});

test('o botão olha o vídeo todo, com andamento, e o Parar pára', { ...semNavegador, timeout: 120_000 }, async () => {
  const { p, erros } = await abrir({ caminho: 'evento', ecra: { width: 1440, height: 900 } });
  await kickFalsa(p, { canais: CANAIS });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', ELENCO);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  await telasVerdadeiras(p);
  // Sem tiroteios achados, perto deles não há onde olhar, e diz-se o que fazer.
  await p.click('#mortesAchar');
  assert.match(await p.locator('#mortesEstado').innerText(), /Ainda não há tiroteios achados/);
  // O Parar: cada pedaço demora, e o botão vira Parar enquanto corre.
  await p.evaluate(() => {
    const original = window.__povixTelas;
    window.__povixTelas = async (...a) => { await new Promise((ok) => setTimeout(ok, 300)); return original(...a); };
  });
  await p.selectOption('#mortesModo', 'tudo');
  await p.click('#mortesAchar');
  await p.waitForFunction(() => /Olhando os vídeos: .* de 30 min/.test(document.getElementById('mortesEstado').textContent), null, { timeout: 10000 });
  assert.equal(await p.locator('#mortesAcharTexto').innerText(), 'Parar a procura');
  assert.equal(await p.locator('#mortesBarra').isVisible(), true);
  await p.click('#mortesAchar');
  await p.waitForFunction(() => !window.__mortes.estado.busca, null, { timeout: 10000 });
  assert.match(await p.locator('#mortesEstado').innerText(), /Procura parada/);
  // De novo, até ao fim: as duas mortes, nos 30 min de vídeo dos três (10 min cada).
  await p.click('#mortesAchar');
  await p.waitForFunction(() => !window.__mortes.estado.busca && /achadas nos vídeos/.test(document.getElementById('mortesEstado').textContent), null, { timeout: 60_000 });
  assert.deepEqual(await p.evaluate(() => window.__mortes.casadas().map((m) => [m.vitima, m.matador])), [['xguiry', 'cyrus'], ['crreg', 'yer']]);
  // Sem tiros de cyrus, a morte não fica confirmada, mas fica nas duas faixas.
  assert.deepEqual(await p.evaluate(() => [...window.__mortes.marcas().keys()].sort()), ['crreg', 'cyrus', 'xguiry']);
  assert.equal(await p.locator('#mortesAcharTexto').innerText(), 'Achar mortes nos vídeos');
  assert.deepEqual(erros, []);
  await p.close();
});

test('a nova tentativa olha só os pedaços que falharam e mantém as mortes achadas', { ...semNavegador, timeout: 120_000 }, async () => {
  const { p, erros } = await abrir({ caminho: 'evento' });
  await kickFalsa(p, { canais: CANAIS });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', ELENCO);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  await telasVerdadeiras(p);
  await p.evaluate((inicio) => {
    const original = window.__povixTelas;
    window.__povixTelas = async (canal, de, ate, cadaMs) => {
      if (canal === 'crreg' && de === inicio + 360_000) throw new Error('CDN temporariamente indisponível');
      return original(canal, de, ate, cadaMs);
    };
  }, T);
  await p.evaluate(() => window.__mortes.acharMortes({ modo: 'tudo' }));
  assert.deepEqual(await p.evaluate(() => window.__mortes.casadas().map((m) => m.vitima)), ['xguiry']);
  assert.match(await p.locator('#mortesEstado').innerText(), /1 pedaço/);
  const varridos = await p.evaluate(() => window.__mortes.estado.varrido.get('crreg'));
  assert.deepEqual(varridos, [[T, T + 360_000], [T + 480_000, T + 600_000]]);

  await telasVerdadeiras(p);
  await p.evaluate(() => window.__mortes.acharMortes({ modo: 'tudo' }));
  assert.deepEqual(await p.evaluate(() => window.__telasPedidas), [
    { canal: 'crreg', deMs: T + 360_000, ateMs: T + 480_000 },
  ]);
  assert.deepEqual(await p.evaluate(() => window.__mortes.casadas().map((m) => m.vitima)), ['xguiry', 'crreg']);
  assert.deepEqual(erros, []);
  await p.close();
});
