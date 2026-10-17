import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { kickFalsa } from './falsa.mjs';

let porta;
const { abrir } = montarPalco((p) => { porta = p; });
const opcoes = { skip: !podeCorrer && 'sem navegador', timeout: 45_000 };
const abisal = JSON.parse(readFileSync(new URL('../site/eventos/abisal.json', import.meta.url), 'utf8'));
const trava = () => {
  let liberar;
  const espera = new Promise((ok) => { liberar = ok; });
  return { espera, liberar };
};

test('Abisal mostra consulta e contagem no modo simples antes de todos os canais responderem; Parar cancela', opcoes, async () => {
  const { p, erros } = await abrir({ modo: 'simples', caminho: null, ecra: { width: 390, height: 844 }, toque: true });
  const arquivo = trava();
  const primeiro = trava();
  const restantes = trava();
  let pedidos = 0;
  try {
    await kickFalsa(p, { canais: abisal.canais });
    await p.route('**/eventos/abisal.json', async (r) => {
      await arquivo.espera;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(abisal) });
    });
    await p.route('**/api/v2/channels/*/videos', async (r) => {
      pedidos++;
      await (r.request().url().includes(`/channels/${abisal.canais[0]}/`) ? primeiro.espera : restantes.espera);
      await r.fallback();
    });
    await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
    await p.fill('#simplesCaixa', 'Abisal');
    await p.click('#simplesAchar');
    assert.equal(await p.locator('#simplesTrabalho').isVisible(), true);
    assert.match(await p.locator('#simplesEstado').innerText(), /Procurando o evento ou streamer/);
    arquivo.liberar();
    await p.waitForFunction((n) => new RegExp(`0 de ${n}`).test(document.getElementById('simplesEstado').textContent), abisal.canais.length);
    assert.equal(await p.locator('#evento').isVisible(), false);
    assert.equal(await p.locator('#simplesParar').isVisible(), true);
    primeiro.liberar();
    await p.waitForFunction((n) => new RegExp(`1 de ${n}`).test(document.getElementById('simplesEstado').textContent), abisal.canais.length);
    const antes = pedidos;
    await p.click('#simplesParar');
    await p.waitForFunction(() => /Parado/.test(document.getElementById('simplesEstado').textContent));
    assert.equal(await p.evaluate(() => window.__evento.cancelar.signal.aborted), true);
    restantes.liberar();
    await p.waitForLoadState('networkidle');
    assert.equal(pedidos, antes);
    assert.match(await p.locator('#simplesEstado').innerText(), /Parado/);
    assert.notEqual(await p.locator('#simplesQuem').innerText(), 'Evento ABISAL');
    assert.deepEqual(erros, []);
  } finally {
    arquivo.liberar(); primeiro.liberar(); restantes.liberar();
    await p.close();
  }
});

test('evento digitado chega à lista e Começar de novo impede abertura tardia', opcoes, async () => {
  const { p, erros } = await abrir({ modo: 'simples', caminho: null });
  const resposta = trava();
  try {
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.route('**/eventos/teste.json', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ nome: 'Teste', times: [], canais: ['tchubi', 'outro'] }),
    }));
    await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
    await p.fill('#simplesCaixa', 'Teste');
    await p.click('#simplesAchar');
    await p.waitForFunction(() => document.getElementById('simplesQuem').textContent === 'Evento Teste');
    assert.equal(await p.locator('#simplesTrabalho').isVisible(), true);
    await p.click('#simplesDeNovo');
    await p.route('**/eventos/abisal.json', async (r) => {
      await resposta.espera;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(abisal) });
    });
    await p.fill('#simplesCaixa', 'Abisal');
    await p.click('#simplesAchar');
    await p.click('#simplesDeNovo');
    resposta.liberar();
    await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('#simplesForm').isVisible(), true);
    assert.equal(await p.locator('#simplesTrabalho').isVisible(), false);
    assert.equal(await p.evaluate(() => window.__evento.elenco.nome), 'Teste');
    assert.deepEqual(erros, []);
  } finally { resposta.liberar(); await p.close(); }
});
