// Abrir muitos ângulos (QA-REAL.md, 12/10): "Abrir todos" com 33 canais levava 40 s até ao primeiro
// vídeo, porque as 66 listas (master e playlist de cada um) se pediam uma a seguir à outra. Agora vão
// seis de cada vez, com o canal em foco à frente, e os leitores da grelha arrancam em lotes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

test('as listas de 12 canais pedem-se seis de cada vez, com o foco primeiro', semNavegador, async () => {
  const { p, erros } = await abrir();
  const canais = Array.from({ length: 12 }, (_, i) => `canal${i}`);
  await kickFalsa(p, { canais });
  let agora = 0;
  let maximo = 0;
  const ordem = [];
  // Cada lista demora 250 ms, como a Kick a sério por um proxy.
  await p.route('https://stream.kick.com/falsa/**/*.m3u8', async (rota) => {
    const u = rota.request().url();
    if (u.endsWith('master.m3u8')) ordem.push(u.match(/falsa\/([^/]+)\//)[1]);
    agora++;
    maximo = Math.max(maximo, agora);
    await new Promise((k) => setTimeout(k, 250));
    agora--;
    await rota.fallback();
  });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  // Um lance do evento com o foco no último da lista.
  const inicio = Date.now();
  await p.evaluate((c) => window.__abrirLanceDoEvento(c, Date.parse('2026-08-30T21:03:00Z'), 'canal11', { exato: true }), canais);
  await p.waitForFunction(() => window.__estado.linhas.length === 12, null, { timeout: 30000 });
  const ms = Date.now() - inicio;
  assert.ok(maximo > 1 && maximo <= 6, `${maximo} listas ao mesmo tempo`);
  assert.equal(ordem[0], 'canal11', 'o canal em foco é o primeiro a ser lido');
  // Um a um seriam 24 x 250 ms = 6 s só de espera.
  assert.ok(ms < 4000, `levou ${ms} ms`);
  assert.equal(await p.evaluate(() => window.__estado.focos[0]), 'canal11');
  assert.deepEqual(erros, []);
  await p.close();
});
