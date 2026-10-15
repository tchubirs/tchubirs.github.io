import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { kickFalsa, T } from './falsa.mjs';

let porta;
const { abrir } = montarPalco((p) => { porta = p; });
const opcoes = { skip: !podeCorrer && 'sem navegador', timeout: 30_000 };
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');

async function preparar() {
  const { p, erros } = await abrir();
  const pedidos = await kickFalsa(p, { canais: ['antigo', 'ana', 'bia'], desviosS: { bia: 3 } });
  await p.route('**/app.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `${app}\nwindow.__povQA = { abrir: abrirPovsParaSimples, guardar, sessao: () => doLink(localStorage.getItem('replay')) };` }));
  await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'antigo');
  await p.click('#carregar');
  await p.waitForFunction(() => window.__estado.linhas.length === 1);
  await p.evaluate((t) => {
    const e = window.__estado;
    if (!e.parado) document.getElementById('tocarPausar').click();
    e.nudges.antigo = 1234;
    e.nudges.ana = 1000;
    e.agoraMs = t + 20_000;
    e.momentos = [{ ms: t + 10_000, canal: 'antigo', vitimas: [], deMs: t + 5000, ateMs: t + 15000 }];
    window.__povQA.guardar();
  }, T);
  await p.waitForFunction(() => window.__povQA.sessao()?.nudges?.antigo === 1234);
  return { p, erros, pedidos };
}

const fotografia = (p) => p.evaluate(() => ({
  canais: document.getElementById('canais').value, linhas: window.__estado.linhas.map((l) => l.slug),
  agora: window.__estado.agoraMs, nudges: { ...window.__estado.nudges }, momentos: window.__estado.momentos,
  salvo: localStorage.getItem('replay'), vods: [...window.__estado.vodsPorCanal.keys()], pecas: [...window.__estado.pecasLidas.keys()],
}));

test('POV nova indisponível preserva sessão e armazenamento enquanto prepara e depois de falhar', opcoes, async () => {
  const { p, erros } = await preparar();
  let liberar, pronto;
  const espera = new Promise((ok) => { liberar = ok; });
  const pediu = new Promise((ok) => { pronto = ok; });
  try {
    await p.route('**/falsa/bia/**/master.m3u8', async (r) => { pronto(); await espera; await r.fulfill({ status: 403, body: '' }); });
    const antes = await fotografia(p);
    await p.evaluate((t) => { window.__resultadoPov = null; window.__povQA.abrir({ canais: ['ana', 'bia'], ms: t + 60_000, foco: 'ana', ajustes: { bia: 3000 } }).then((r) => { window.__resultadoPov = r; }); }, T);
    await pediu;
    assert.deepEqual(await fotografia(p), antes);
    liberar();
    await p.waitForFunction(() => window.__resultadoPov === false);
    assert.deepEqual(await fotografia(p), antes);
    assert.equal(erros.length, 1);
    assert.match(erros[0], /status of 403/, 'apenas o HTTP recusado que este teste provocou');
  } finally { liberar(); await p.close(); }
});

test('cancelamento chega ao fetch da playlist e resposta antiga não troca a sessão', opcoes, async () => {
  const { p, erros } = await preparar();
  let liberar, pronto;
  const espera = new Promise((ok) => { liberar = ok; });
  const pediu = new Promise((ok) => { pronto = ok; });
  try {
    await p.route('**/falsa/bia/**/master.m3u8', async (r) => { pronto(); await espera; await r.fallback(); });
    const antes = await fotografia(p);
    await p.evaluate((t) => {
      window.__controlePov = new AbortController(); window.__resultadoPov = null;
      window.__povQA.abrir({ canais: ['ana', 'bia'], ms: t + 60_000, foco: 'ana', ajustes: { bia: 3000 }, sinal: window.__controlePov.signal })
        .then((r) => { window.__resultadoPov = r; }, (e) => { window.__resultadoPov = e.name; });
    }, T);
    await pediu;
    await p.evaluate(() => window.__controlePov.abort());
    await p.waitForFunction(() => window.__resultadoPov === 'AbortError');
    assert.deepEqual(await fotografia(p), antes);
    liberar();
    await p.waitForLoadState('networkidle');
    assert.deepEqual(await fotografia(p), antes);
    assert.deepEqual(erros, []);
  } finally { liberar(); await p.close(); }
});

test('preparação válida troca canais no instante e aplica desvio relativo sem baixar playlists de novo', opcoes, async () => {
  const { p, erros, pedidos } = await preparar();
  try {
    const antes = { master: pedidos.master, playlist: pedidos.playlist };
    const r = await p.evaluate(async (t) => {
      const ok = await window.__povQA.abrir({ canais: ['ana', 'bia'], ms: t + 60_000, foco: 'ana', ajustes: { bia: 3000 } });
      return { ok, canais: window.__estado.linhas.map((l) => l.slug), agora: window.__estado.agoraMs, nudges: { ...window.__estado.nudges } };
    }, T);
    assert.equal(r.ok, true);
    assert.deepEqual(r.canais, ['ana', 'bia']);
    assert.equal(r.agora, T + 60_000);
    assert.equal(r.nudges.ana, 1000);
    assert.equal(r.nudges.bia, 4000);
    assert.equal(pedidos.master - antes.master, 2);
    assert.equal(pedidos.playlist - antes.playlist, 2);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});
