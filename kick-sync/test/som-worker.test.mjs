// O AAC descodifica-se num Worker (teste real de 12/10): no fio da página, com 33 ângulos abertos, 10 s
// de som levavam 9 s a descodificar, e sincronizar 33 ângulos levava 30 min.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarPalco, podeCorrer } from './palco.mjs';

let porta = 0;
const palco = montarPalco((p) => { porta = p; });
const SEG = fs.readFileSync(new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url)).toString('base64');

test('a página descodifica o som num Worker, e o resultado (ou o erro) é o mesmo de antes', { skip: !podeCorrer && 'sem chromium' }, async () => {
  const { p, erros } = await palco.abrir({ caminho: null });
  await p.addInitScript(() => {
    const W = window.Worker;
    window.__workers = [];
    window.Worker = function (url, op) { window.__workers.push(String(url)); return new W(url, op); };
  });
  await p.goto(`http://127.0.0.1:${porta}/index.html`);
  const r = await p.evaluate(async (b64) => {
    const { descodificarAac } = await import('./alinhar.js');
    const { aacDeSegmentos } = await import('./audio-ts.js');
    const aac = aacDeSegmentos(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const tenta = async (op) => { try { const m = await descodificarAac(aac, op); return { n: m.length, soma: m.slice(0, 4000).reduce((a, x) => a + Math.abs(x), 0) }; } catch (e) { return { erro: e.name }; } };
    const noWorker = await tenta({});
    const aqui = await tenta({ noFio: true });
    return { noWorker, aqui, workers: window.__workers };
  }, SEG);
  assert.ok(r.workers.some((u) => u.endsWith('/som-worker.js')), `workers: ${r.workers}`);
  if (r.aqui.erro) assert.equal(r.noWorker.erro, r.aqui.erro, 'sem AAC neste browser: o mesmo erro, com o mesmo nome');
  else {
    assert.equal(r.noWorker.n, r.aqui.n);
    assert.ok(Math.abs(r.noWorker.soma - r.aqui.soma) < 1e-3);
  }
  assert.deepEqual(erros, []);
  await p.close();
});
