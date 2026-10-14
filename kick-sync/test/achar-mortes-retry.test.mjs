import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { procurarMortes, quadrosDoTs } from '../site/achar-mortes-video.js';

const jogo = new Uint8ClampedArray(160 * 90 * 4);

test('uma falha de rede deixa só o pedaço falhado para outra tentativa', async () => {
  const pedidos = [];
  const progresso = [];
  const r = await procurarMortes({
    alvos: [{ canal: 'tchubi', intervalos: [[0, 360_000]] }],
    aoMesmoTempo: 1,
    telasDe: async (canal, de, ate) => {
      pedidos.push([canal, de, ate]);
      if (de === 120_000) throw new Error('CDN indisponível');
      return [{ ms: de, pixeis: jogo }];
    },
    aoProgresso: (p) => progresso.push(p),
  });
  assert.deepEqual(r.mortes, []);
  assert.deepEqual(r.concluidos, [
    { canal: 'tchubi', deMs: 0, ateMs: 120_000 },
    { canal: 'tchubi', deMs: 240_000, ateMs: 360_000 },
  ]);
  assert.equal(progresso.at(-1).falhados, 1);
  assert.equal(pedidos.length, 3);
  const segunda = await procurarMortes({
    alvos: [{ canal: 'tchubi', intervalos: [[120_000, 240_000]] }],
    telasDe: async (canal, de, ate) => {
      pedidos.push([canal, de, ate]);
      return [{ ms: de, pixeis: jogo }];
    },
  });
  assert.deepEqual(segunda.concluidos, [{ canal: 'tchubi', deMs: 120_000, ateMs: 240_000 }]);
  assert.deepEqual(pedidos.at(-1), ['tchubi', 120_000, 240_000]);
});

test('sem bytes ou sem quadros válidos, o vídeo não fica marcado como olhado', async () => {
  const progresso = [];
  const r = await procurarMortes({
    alvos: ['sem-video', 'vazio', 'invalido'].map((canal) => ({ canal, intervalos: [[0, 1000]] })),
    tsDe: async (canal) => canal === 'sem-video' ? null : {
      ts: new Uint8Array(canal === 'vazio' ? 0 : 188), segs: [{ inicio: 0 }],
    },
    aoProgresso: (p) => progresso.push(p),
  });
  assert.deepEqual(r.concluidos, []);
  assert.equal(progresso.at(-1).falhados, 3);
});

test('cancelar não devolve um pedaço incompleto como concluído', async () => {
  const controle = new AbortController();
  const pedidos = [];
  await assert.rejects(procurarMortes({
    alvos: [{ canal: 'tchubi', intervalos: [[0, 360_000]] }],
    aoMesmoTempo: 1,
    sinal: controle.signal,
    telasDe: async (canal, de) => {
      pedidos.push(de);
      if (de === 120_000) controle.abort();
      return [{ ms: de, pixeis: jogo }];
    },
  }), { name: 'AbortError' });
  assert.deepEqual(pedidos, [0, 120_000]);
});

test('erro de descodificação depois do primeiro quadro não valida o resto do trecho', async (t) => {
  const anteriores = Object.fromEntries(['VideoDecoder', 'EncodedVideoChunk', 'OffscreenCanvas'].map((k) => [k, globalThis[k]]));
  t.after(() => {
    for (const [k, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete globalThis[k]; else globalThis[k] = valor;
    }
  });
  globalThis.OffscreenCanvas = class {
    getContext() { return { drawImage() {}, getImageData: () => ({ data: jogo }) }; }
  };
  globalThis.EncodedVideoChunk = class { constructor(opcoes) { Object.assign(this, opcoes); } };
  const falha = new Error('H.264 interrompido');
  globalThis.VideoDecoder = class {
    constructor({ output, error }) { this.output = output; this.error = error; this.decodeQueueSize = 0; this.n = 0; }
    configure() {}
    decode(chunk) {
      if (this.n++ === 0) this.output({ timestamp: chunk.timestamp, close() {} });
      else this.error(falha);
    }
    async flush() {}
    close() {}
  };
  const ts = new Uint8Array(fs.readFileSync(new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url)));
  await assert.rejects(quadrosDoTs(ts, [{ inicio: 0 }]), /H\.264 interrompido/);
  const r = await procurarMortes({
    alvos: [{ canal: 'tchubi', intervalos: [[0, 10_000]] }],
    tsDe: async () => ({ ts, segs: [{ inicio: 0 }] }),
  });
  assert.deepEqual(r.concluidos, []);
});
