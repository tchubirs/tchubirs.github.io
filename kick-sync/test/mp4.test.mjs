// O corte em MP4 (QA-REAL.md, 12/10): um clipe de 30 s saía num .ts de 46 s. Agora sai MP4 com o H.264 e
// o AAC da Kick tal como vieram, cortado no instante pedido pela lista de edição.
//
// Sobre um pedaço verdadeiro da Kick (probes/fixtures/segmento-kodd.ts, 12,5 s, 160p30, AAC 48 kHz).
// Com o ffmpeg à mão (o do imageio, ou um no PATH), confere-se também que descodifica sem erros e dura
// o pedido; sem ele, as contas fazem-se lendo as caixas do MP4 aqui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lerTs, recortar, juntarMp4, tsParaMp4 } from '../site/mp4.js';
import { executarCorte } from '../site/baixar.js';

const SEG = new Uint8Array(fs.readFileSync(new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url)));
const T = Date.parse('2026-10-05T23:27:37Z');
const FFMPEG = [process.env.DETETIVE_FFMPEG,
  '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2',
  ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))]
  .find((f) => f && fs.existsSync(f));

/** As caixas de topo e algumas de dentro, para ler durações e listas de edição. */
function caixas(b, de = 0, ate = b.length) {
  const out = [];
  for (let o = de; o + 8 <= ate;) {
    const n = new DataView(b.buffer, b.byteOffset + o).getUint32(0);
    out.push({ tipo: String.fromCharCode(...b.subarray(o + 4, o + 8)), o, n });
    o += n;
  }
  return out;
}
function achar(b, caminho) {
  let de = 0;
  let ate = b.length;
  let achada = null;
  for (const tipo of caminho) {
    achada = caixas(b, de, ate).find((c) => c.tipo === tipo);
    if (!achada) return null;
    de = achada.o + 8;
    ate = achada.o + achada.n;
  }
  return achada;
}
const dv = (b, o) => new DataView(b.buffer, b.byteOffset + o);

test('lê o H.264 e o AAC de um pedaço da Kick', () => {
  const ts = lerTs(SEG);
  assert.equal(ts.video.largura, 284);
  assert.equal(ts.video.altura, 160);
  assert.ok(ts.video.amostras.length > 300, 'uns 12 s a 30 fps');
  assert.ok(ts.video.amostras[0].chave, 'o pedaço começa num quadro-chave');
  assert.equal(ts.audio.taxa, 48000);
  assert.equal(ts.audio.canais, 2);
});

test('o MP4 dura exatamente o pedido e começa no instante pedido', () => {
  const r = tsParaMp4(SEG, { inicioMs: T, deMs: T + 2300, ateMs: T + 9100 });
  assert.equal(r.duracaoS, 6.8);
  assert.equal(r.deMs, T + 2300);
  assert.equal(r.ateMs, T + 9100);
  const b = r.bytes;
  const tipos = caixas(b).map((c) => c.tipo);
  assert.deepEqual(tipos, ['ftyp', 'moov', 'mdat'], 'o moov à frente: começa a tocar antes de chegar ao fim');
  const mvhd = achar(b, ['moov', 'mvhd']);
  assert.equal(dv(b, mvhd.o + 20).getUint32(0), 1000);
  assert.equal(dv(b, mvhd.o + 24).getUint32(0), 6800);
  // A lista de edição do vídeo salta os quadros entre o quadro-chave e a marca.
  const elst = achar(b, ['moov', 'trak', 'edts', 'elst']);
  assert.equal(dv(b, elst.o + 12).getUint32(0), 1, 'uma entrada');
  assert.equal(dv(b, elst.o + 16).getUint32(0), 6800);
  assert.ok(dv(b, elst.o + 20).getInt32(0) > 0, 'começa depois do quadro-chave, e não nele');
  const stsd = achar(b, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd']);
  assert.equal(String.fromCharCode(...b.subarray(stsd.o + 20, stsd.o + 24)), 'avc1');
});

test('quando o vídeo não chega ao fim pedido, o MP4 acaba onde ele acaba e diz onde', () => {
  const r = tsParaMp4(SEG, { inicioMs: T, deMs: T + 8000, ateMs: T + 30_000 });
  assert.ok(r.ateMs < T + 13_000 && r.ateMs > T + 12_000, `acabou em ${r.ateMs - T}`);
  assert.ok(Math.abs(r.duracaoS - (r.ateMs - r.deMs) / 1000) < 0.002);
});

test('vários clipes num MP4 só, um a seguir ao outro (a montagem num vídeo)', () => {
  const ts = lerTs(SEG);
  const a = recortar(ts, { inicioMs: T, deMs: T + 1000, ateMs: T + 4000 });
  const b2 = recortar(ts, { inicioMs: T, deMs: T + 6500, ateMs: T + 11_000 });
  const { bytes, duracaoS } = juntarMp4([a, b2]);
  assert.equal(duracaoS, 7.5);
  const elst = achar(bytes, ['moov', 'trak', 'edts', 'elst']);
  assert.equal(dv(bytes, elst.o + 12).getUint32(0), 2, 'uma entrada por clipe');
  assert.equal(dv(bytes, elst.o + 16).getUint32(0), 3000);
  assert.equal(dv(bytes, elst.o + 28).getUint32(0), 4500);
});

test('executarCorte entrega .mp4 cortado na marca, e a nota diz exato', async () => {
  const plano = {
    estado: 'ok', segmentos: [{ url: 'a.ts', inicio: T, duracaoS: 12.5 }], inicioReal: T, fimReal: T + 12_500,
    sobraInicioS: 3, sobraFimS: 2.5, pedido: { deMs: T + 3000, ateMs: T + 10_000 }, nome: 'x__1.mp4',
  };
  const buscar = async () => new Response(SEG);
  const r = await executarCorte(plano, { buscar });
  assert.equal(r.estado, 'pronto');
  assert.equal(r.tipo, 'video/mp4');
  assert.match(r.nome, /\.mp4$/);
  assert.equal(r.duracaoS, 7);
  assert.equal(r.plano.exato, true);
  assert.equal(r.plano.sobraInicioS, 0);
  assert.equal(r.plano.sobraFimS, 0);
});

test('o ffmpeg abre o MP4 sem erros e com a duração pedida', { skip: !FFMPEG && !process.env.CI && 'sem ffmpeg aqui' }, () => {
  assert.ok(FFMPEG, 'a CI precisa instalar ffmpeg para validar o MP4');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp4-'));
  const f = path.join(dir, 'c.mp4');
  try {
    fs.writeFileSync(f, tsParaMp4(SEG, { inicioMs: T, deMs: T + 2300, ateMs: T + 9100 }).bytes);
    const correr = (...args) => {
      const r = spawnSync(FFMPEG, ['-hide_banner', ...args, '-i', f, '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
      assert.equal(r.status, 0, r.error?.message || r.stderr);
      return r.stderr;
    };
    assert.equal(correr('-v', 'error').trim(), '', 'nenhum erro de descodificação');
    const info = correr();
    assert.match(info, /Duration: 00:00:06\.80/);
    assert.match(info, /Video: h264/);
    assert.match(info, /Audio: aac/);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true });
  }
});
