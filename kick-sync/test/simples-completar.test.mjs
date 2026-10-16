import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPalco, podeCorrer } from './palco.mjs';
import { kickFalsa, T } from './falsa.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const opcoes = { skip: !podeCorrer && 'sem navegador', timeout: 30_000 };

async function preparar({ picos = true, falharChat = false } = {}) {
  const { p, erros } = await abrir({ modo: 'simples', caminho: null });
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.addInitScript(() => { window.__povixQuadrosSimples = () => ({ quadro: async () => null, fechar() {} }); });
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    export async function varrerNoite(opcoes) {
      const c = window.__busca;
      c.pedidos.push(opcoes.intervalos);
      c.memoriaIgual.push(opcoes.memoria === c.memoria);
      return new Promise((resolver, rejeitar) => {
        c.resolver = (resultado) => resolver(resultado);
        opcoes.sinal.addEventListener('abort', () => rejeitar(new DOMException('cancelado', 'AbortError')), { once: true });
      });
    }
  ` }));
  await p.route('**/app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    import { montarSimples } from './simples.js';
    import { aplicarIdioma, definirIdioma } from './idiomas.js';
    aplicarIdioma();
    const config = ${JSON.stringify({ picos, falharChat })};
    const inicio = ${T};
    const memoria = new Map();
    const linha = { slug: 'tchubi', inicio, pecas: [] };
    const c = window.__busca = { pedidos: [], memoriaIgual: [], memoria, chatLido: 0, aberturaLenta: false, falharChat: config.falharChat };
    c.idioma = (idioma) => { definirIdioma(idioma); aplicarIdioma(); };
    c.simples = montarSimples({
      estado: { linhas: [linha], nudges: {}, somOuvido: memoria },
      chat: { estado: { marcas: new Map([['tchubi', config.picos ? [{ ms: inicio + 60_000, msgs: 50, vezes: 12 }] : []]]), mensagens: new Map() },
        async lerChatTrecho() {
          c.chatLido++;
          if (c.falharChat === 'limite') return { motivo: 'limite' };
          if (c.falharChat === 'semCanal') return { semCanal: true };
          if (c.falharChat) throw new Error('Kick indisponível');
        } },
      abrirCanal: () => c.aberturaLenta ? new Promise((resolver) => { c.abrir = () => resolver(linha); }) : Promise.resolve(linha),
      aoVivoDe: () => ({ deMs: inicio, ateMs: inicio + 300_000 }),
      memorizarVods() {}, pausar() {}, aoMudarEvento() {},
    });
  ` }));
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#simplesCaixa', 'tchubi');
  await p.click('#simplesAchar');
  await p.waitForSelector('#simplesPreparar:not([hidden])');
  await p.check('#buscaInteira');
  await p.click('#buscaComecar');
  if (picos) {
    await p.waitForFunction(() => window.__busca?.pedidos.length === 1, null, { timeout: 5000 });
    await p.evaluate(() => window.__busca.resolver({ cobertura: window.__busca.pedidos[0], falhados: 0, candidatos: [], gritos: [] }));
  } else {
    await p.waitForFunction(() => window.__busca?.chatLido === 1, null, { timeout: 5000 });
  }
  await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
  return { p, erros };
}

const cache = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('povix.simplesVods')).at(-1));

test('sem picos não analisa áudio automaticamente, mantém cache parcial após F5 e só amplia por escolha', opcoes, async () => {
  const { p, erros } = await preparar({ picos: false });
  try {
    assert.equal(await p.evaluate(() => window.__busca.pedidos.length), 0);
    assert.match(await p.locator('#simplesEstado').innerText(), /Não encontrei picos no chat/);
    assert.match(await p.locator('#simplesEstado').innerText(), /ainda não foi analisado/);
    assert.equal((await cache(p)).varrido, 'picos');
    assert.equal((await cache(p)).completo, true);
    assert.deepEqual((await cache(p)).picos, []);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForFunction(() => /Não encontrei picos/.test(document.getElementById('simplesEstado').textContent));
    assert.match(await p.locator('#simplesEstado').innerText(), /Não encontrei picos no chat/);
    assert.equal(await p.evaluate(() => window.__busca.pedidos.length), 0);
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => window.__busca.pedidos.length === 1);
    assert.deepEqual(await p.evaluate(() => window.__busca.pedidos[0]), [[T, T + 300_000]]);
    assert.equal(await p.evaluate(() => window.__busca.chatLido), 0, 'chat concluído é reaproveitado após F5');
    await p.evaluate((t) => window.__busca.resolver({ cobertura: [[t, t + 299_000]], falhados: 0 }), T);
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    assert.equal((await cache(p)).varrido, 'picos', 'cobertura incompleta não vira live inteira');
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => window.__busca.pedidos.length === 2);
    await p.evaluate((t) => window.__busca.resolver({ cobertura: [[t, t + 300_000]], falhados: 0 }), T);
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    assert.equal((await cache(p)).varrido, 'tudo');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

for (const falha of [true, 'limite', 'semCanal']) test(`chat incompleto (${falha}) não vira cache concluído nem inicia áudio da live inteira`, opcoes, async () => {
  const { p, erros } = await preparar({ picos: false, falharChat: falha });
  try {
    assert.equal(await p.evaluate(() => window.__busca.pedidos.length), 0);
    assert.equal(await p.evaluate(() => localStorage.getItem('povix.simplesVods')), null);
    assert.match(await p.locator('#simplesEstado').innerText(), /leitura do chat ficou incompleta/);
    await p.evaluate(() => { window.__busca.falharChat = false; });
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => window.__busca.pedidos.length === 1, null, { timeout: 5000 });
    assert.equal(await p.evaluate(() => window.__busca.chatLido), 2, 'repete o chat que falhou');
    await p.evaluate((t) => window.__busca.resolver({ cobertura: [[t, t + 300_000]], falhados: 0 }), T);
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    assert.equal((await cache(p)).varrido, 'tudo');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('busca rápida fresca oferece completar, reutiliza memória e chat e guarda cobertura total', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    assert.equal((await cache(p)).varrido, 'picos');
    assert.match(await p.locator('#simplesEstado').innerText(), /^Busca rápida:/);
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => window.__busca.pedidos.length === 2);
    assert.deepEqual(await p.evaluate(() => window.__busca.pedidos[1]), [[T, T + 300_000]]);
    assert.equal(await p.evaluate(() => window.__busca.chatLido), 1);
    assert.deepEqual(await p.evaluate(() => window.__busca.memoriaIgual), [true, true]);
    await p.evaluate((t) => window.__busca.resolver({ cobertura: [[t, t + 300_000]], falhados: 0 }), T);
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    const salvo = await cache(p);
    assert.equal(salvo.varrido, 'tudo');
    assert.equal(salvo.picos.length, 1);
    assert.equal(salvo.lista.length, 1);
    assert.deepEqual(salvo.sons, []);
    assert.deepEqual(salvo.lutas, []);
    assert.equal(await p.locator('#simplesRefazer').getAttribute('data-t'), 'simples.refazer');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('buraco de áudio continua pendente mesmo sem erro de chunk e sobrevive ao recarregamento', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => window.__busca.pedidos.length === 2);
    await p.evaluate((t) => window.__busca.resolver({ cobertura: [[t, t + 299_000]], falhados: 1 }), T);
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    assert.equal((await cache(p)).varrido, 'picos');
    assert.equal((await cache(p)).pendente, true);
    assert.equal((await cache(p)).lista.length, 1);
    assert.match(await p.locator('#simplesEstado').innerText(), /pendente/);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('#simplesLista > li');
    assert.equal(await p.locator('#simplesLista > li').count(), 1);
    assert.equal(await p.locator('#simplesRefazer').innerText(), 'Buscar no restante da live');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('cancelar complemento conserva lista/cache e o botão troca de idioma', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    const antes = await cache(p);
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => window.__busca.pedidos.length === 2);
    assert.equal(await p.locator('#simplesLista > li').count(), 1);
    await p.locator('#simplesParar').click();
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    assert.deepEqual(await cache(p), antes);
    assert.equal(await p.locator('#simplesLista > li').count(), 1);
    assert.equal(await p.locator('#simplesRefazer').isVisible(), true);
    await p.evaluate(() => window.__busca.idioma('en'));
    assert.equal(await p.locator('#simplesRefazer').innerText(), 'Search the rest of the stream');
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('cancelar antes da abertura devolve botão e resposta tardia não modifica a lista', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.evaluate(() => { window.__busca.aberturaLenta = true; });
    await p.locator('#simplesRefazer').click();
    await p.waitForFunction(() => Boolean(window.__busca.abrir));
    await p.locator('#simplesParar').click();
    await p.evaluate(() => window.__busca.abrir());
    await p.waitForFunction(() => document.getElementById('simplesParar').hidden);
    assert.equal(await p.locator('#simplesRefazer').isVisible(), true);
    assert.equal(await p.locator('#simplesLista > li').count(), 1);
    assert.equal(await p.evaluate(() => window.__busca.pedidos.length), 1);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});
