import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPalco, podeCorrer } from './palco.mjs';
import { kickFalsa, T } from './falsa.mjs';

let PORTA;
const { abrir } = montarPalco((p) => { PORTA = p; });
const opcoes = { skip: !podeCorrer && 'sem navegador', timeout: 25_000 };
const DIA = 86400_000;

async function preparar({ picos = true, ecra = { width: 1366, height: 768 } } = {}) {
  const { p, erros } = await abrir({ modo: 'simples', caminho: null, ecra });
  const rede = await kickFalsa(p, { canais: ['tchubi'], noites: 2, segmentos: 240 });
  await p.addInitScript(() => { window.__povixQuadrosSimples = () => ({ quadro: async () => null, fechar() {} }); });
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    export async function varrerNoite(o) {
      window.__escopo.audio.push({ intervalos: o.intervalos, deMs: o.deMs, ateMs: o.ateMs });
      return { cobertura: o.intervalos, falhados: 0, candidatos: [], gritos: [] };
    }
  ` }));
  await p.route('**/app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    import { montarSimples } from './simples.js';
    import { aplicarIdioma, definirIdioma } from './idiomas.js';
    aplicarIdioma();
    const c = window.__escopo = { chat: [], audio: [], aberturas: [], saudeContexto: 0, aberturaLenta: false, falharChat: false };
    window.__povixSaudeContexto = async () => { c.saudeContexto++; return { ok: false }; };
    let linha = { slug: 'tchubi', inicio: ${T}, pecas: [] };
    const marcas = ${JSON.stringify(picos ? [T + 150_000, T + DIA + 150_000, T + DIA + 1800_000] : [])}.map(ms => ({ ms, msgs: 50, vezes: 12 }));
    c.idioma = (l) => { definirIdioma(l); aplicarIdioma(); c.simples.traduzir(); };
    c.simples = montarSimples({
      estado: { linhas: [], nudges: {}, somOuvido: new Map() },
      chat: { estado: { marcas: new Map([['tchubi', marcas]]), mensagens: new Map() },
        async lerChatTrecho(slug, deMs, ateMs) {
          c.chat.push({ slug, deMs, ateMs });
          return c.falharChat ? { motivo: 'limite' } : {};
        } },
      abrirCanal: (slug, o) => {
        c.aberturas.push(o.inicioMs);
        linha = { slug, inicio: o.inicioMs, pecas: [] };
        return c.aberturaLenta ? new Promise(resolve => { c.abrir = () => resolve(linha); }) : Promise.resolve(linha);
      },
      aoVivoDe: () => ({ deMs: linha.inicio, ateMs: linha.inicio + 2400_000 }),
      memorizarVods() {}, pausar() {}, aoMudarEvento() {},
    });
  ` }));
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#simplesCaixa', 'tchubi');
  await p.click('#simplesAchar');
  await p.waitForSelector('#simplesPreparar:not([hidden])');
  return { p, erros, rede };
}

async function confirmar(p, { perfil = 'rapida', inteira = false, inicio = '00:02:00', fim = '00:03:00' } = {}) {
  await p.fill('#buscaInicio', inicio);
  await p.fill('#buscaFim', fim);
  await p.selectOption('#buscaPerfil', perfil);
  await p.locator('#buscaInteira').setChecked(inteira);
  await p.click('#buscaComecar');
  await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
}

const cache = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('povix.simplesVods') || '[]').at(-1));

test('preparação mostra datas reais e últimos15min, sem abrir mídia nem analisar antes da confirmação', opcoes, async () => {
  const { p, erros, rede } = await preparar();
  try {
    assert.equal(await p.locator('#buscaTransmissao option').count(), 2);
    assert.match(await p.locator('#buscaTransmissao option').first().innerText(), /31\/08\/2026/);
    assert.equal(await p.locator('#buscaInicio').inputValue(), '00:25:00');
    assert.equal(await p.locator('#buscaFim').inputValue(), '00:40:00');
    assert.equal(await p.locator('#buscaInteira').isChecked(), false);
    assert.match(await p.locator('#buscaComecar').innerText(), /15 minutos/);
    assert.match(await p.locator('#buscaEstimativa').innerText(), /indisponível/);
    assert.deepEqual(await p.evaluate(() => [window.__escopo.chat.length, window.__escopo.audio.length, window.__escopo.aberturas.length]), [0, 0, 0]);
    assert.equal(rede.master + rede.playlist + rede.segmentos, 0);
    assert.equal(await p.locator('#buscaTransmissao').evaluate(e => e === document.activeElement), true);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('só chat usa a transmissão e o trecho escolhidos, sem áudio; ampliar mantém o trecho e sobrevive aF5', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.selectOption('#buscaTransmissao', '1');
    await confirmar(p, { perfil: 'chat' });
    assert.deepEqual(await p.evaluate(() => window.__escopo.chat), [{ slug: 'tchubi', deMs: T + 120_000, ateMs: T + 180_000 }]);
    assert.equal(await p.evaluate(() => window.__escopo.audio.length), 0);
    assert.equal(await p.evaluate(() => window.__escopo.saudeContexto), 0, 'só chat não inicia a análise remota de imagem/fala');
    assert.equal((await cache(p)).varrido, 'chat');
    assert.match(await p.locator('#simplesRefazer').innerText(), /deste trecho/);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => /Leitura do chat concluída/.test(document.getElementById('simplesEstado').textContent));
    await p.click('#simplesRefazer');
    await p.waitForFunction(() => window.__escopo.audio.length === 1 && document.getElementById('simplesParar').hidden);
    assert.deepEqual(await p.evaluate(() => window.__escopo.audio[0].intervalos), [[T + 120_000, T + 180_000]]);
    assert.equal(await p.evaluate(() => window.__escopo.chat.length), 0);
    assert.equal((await cache(p)).varrido, 'trecho');
    assert.equal((await cache(p)).pedidoBusca.perfil, 'completa');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

for (const perfil of ['rapida', 'completa']) test(`${perfil}: chat e áudio respeitam o trecho e cache não declara a live toda analisada`, opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await confirmar(p, { perfil });
    const inicio = T + DIA;
    assert.deepEqual(await p.evaluate(() => window.__escopo.chat), [{ slug: 'tchubi', deMs: inicio + 120_000, ateMs: inicio + 180_000 }]);
    const pedidos = await p.evaluate(() => window.__escopo.audio);
    assert.equal(pedidos.length, 1);
    assert.ok(pedidos[0].intervalos.every(([a, b]) => a >= inicio + 120_000 && b <= inicio + 180_000));
    assert.equal((await cache(p)).varrido, perfil === 'completa' ? 'trecho' : 'picos');
    assert.equal((await cache(p)).picos.length, 1);
    assert.equal((await cache(p)).pedidoBusca.inteira, false);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('inteira precisa de escolha explícita e completa usa toda a duração disponível', opcoes, async () => {
  const { p, erros } = await preparar({ picos: false });
  try {
    await confirmar(p, { perfil: 'completa', inteira: true });
    assert.deepEqual(await p.evaluate(() => window.__escopo.audio[0].intervalos), [[T + DIA, T + DIA + 2400_000]]);
    assert.equal((await cache(p)).varrido, 'tudo');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('sem picos não expande o trecho automaticamente; erro de intervalo impede começar', opcoes, async () => {
  const { p, erros } = await preparar({ picos: false });
  try {
    await p.fill('#buscaInicio', '00:35:00');
    await p.fill('#buscaFim', '00:34:00');
    assert.equal(await p.locator('#buscaComecar').isDisabled(), true);
    assert.equal(await p.locator('#buscaErro').isVisible(), true);
    await confirmar(p);
    assert.equal(await p.evaluate(() => window.__escopo.audio.length), 0);
    assert.match(await p.locator('#simplesEstado').innerText(), /desse trecho/);
    assert.equal((await cache(p)).varrido, 'picos');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('cancelamento da abertura rejeita resposta tardia e permite começar de novo', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.evaluate(() => { window.__escopo.aberturaLenta = true; });
    await p.click('#buscaComecar');
    await p.waitForFunction(() => Boolean(window.__escopo.abrir));
    await p.click('#simplesParar');
    await p.evaluate(() => window.__escopo.abrir());
    assert.equal(await p.evaluate(() => window.__escopo.chat.length), 0);
    await p.click('#simplesDeNovo');
    await p.evaluate(() => { window.__escopo.aberturaLenta = false; });
    await p.fill('#simplesCaixa', 'tchubi');
    await p.click('#simplesAchar');
    await p.waitForSelector('#simplesPreparar:not([hidden])');
    await confirmar(p, { perfil: 'chat' });
    assert.equal(await p.evaluate(() => window.__escopo.chat.length), 1);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('trocar idioma durante a preparação mantém escolha e traduz o trecho, explicação e estimativa', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.fill('#buscaInicio', '00:02:00');
    await p.fill('#buscaFim', '00:03:00');
    await p.selectOption('#buscaPerfil', 'chat');
    await p.evaluate(() => window.__escopo.idioma('en'));
    assert.match(await p.locator('#buscaComecar').innerText(), /1 minute/);
    assert.match(await p.locator('#buscaExplica').innerText(), /Reads only chat/);
    assert.match(await p.locator('#buscaEstimativa').innerText(), /estimate/i);
    assert.equal(await p.locator('#buscaInicio').inputValue(), '00:02:00');
    assert.equal(await p.locator('#buscaPerfil').inputValue(), 'chat');
    assert.deepEqual(await p.evaluate(() => [window.__escopo.chat.length, window.__escopo.audio.length]), [0, 0]);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

for (const width of [390, 1366]) test(`preparação cabe em${width}px e campos/botão têm área de toque e erro associado`, opcoes, async () => {
  const { p, erros } = await preparar({ ecra: { width, height: 844 } });
  try {
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const id of ['buscaTransmissao', 'buscaInicio', 'buscaFim', 'buscaPerfil', 'buscaComecar']) {
      const rect = await p.locator(`#${id}`).boundingBox();
      assert.ok(rect.height >= 44 && rect.width >= 44, `${id}: ${JSON.stringify(rect)}`);
    }
    assert.match(await p.locator('#buscaInicio').getAttribute('aria-describedby'), /buscaErro/);
    const campos = await Promise.all(['buscaInicio', 'buscaFim'].map(id => p.locator(`#${id}`).boundingBox()));
    assert.ok(Math.abs(campos[0].y - campos[1].y) <= 1, 'início e fim continuam alinhados quando um rótulo quebra linha');
    if (process.env.CAPTURAS_BUSCA) await p.screenshot({ path: `${process.env.CAPTURAS_BUSCA}/busca-preparacao-${width}.png`, fullPage: true });
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});
