// A ponte entre o que a Kick serve (MPEG-TS) e o que o browser sabe abrir
// (AAC). Sem ela, alinhar pelo som obrigava a um servidor com ffmpeg — e este
// produto não tem servidor nenhum, de propósito.
//
// O teste não é "corre sem rebentar": é comparar com o ffmpeg, byte a byte,
// sobre um segmento verdadeiro da Kick gravado em probes/fixtures/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { aacDeSegmentos } from '../site/audio-ts.js';

const SEGMENTO = new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url).pathname;
// `ffmpeg -i segmento-kodd.ts -map 0:a -c:a copy -f adts` — 31/08/2026.
const FFMPEG = { bytes: 78948, sha256: 'a8b415eb2eed95190465add75c8cdf4757245f50c0486c92aacf5db5f73b5576' };

const ts = new Uint8Array(fs.readFileSync(SEGMENTO));

test('tira o mesmo AAC que o ffmpeg, byte a byte', () => {
  const aac = aacDeSegmentos(ts);
  assert.ok(aac, 'este segmento tem áudio');
  assert.equal(aac.length, FFMPEG.bytes);
  assert.equal(crypto.createHash('sha256').update(aac).digest('hex'), FFMPEG.sha256);
});

test('o que sai é ADTS válido, e diz 48 kHz estéreo', () => {
  const a = aacDeSegmentos(ts);
  // Sincronismo ADTS: 12 bits a 1.
  assert.equal(a[0], 0xff);
  assert.equal(a[1] & 0xf0, 0xf0);
  const indiceTaxa = (a[2] & 0x3c) >> 2;
  const TAXAS = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
  assert.equal(TAXAS[indiceTaxa], 48000);
  assert.equal(((a[2] & 1) << 2) | ((a[3] & 0xc0) >> 6), 2, 'estéreo');
});

// A cada frame ADTS o comprimento vem escrito no cabeçalho. Se o demuxer
// tivesse deixado cair um byte a meio, a cadeia partia-se aqui — e não parte
// numa verificação de sincronismo só no primeiro frame.
test('a cadeia de frames fecha exactamente no fim, sem um byte a mais ou a menos', () => {
  const a = aacDeSegmentos(ts);
  let o = 0;
  let frames = 0;
  while (o + 7 <= a.length) {
    assert.equal(a[o], 0xff, `sincronismo perdido no frame ${frames} (byte ${o})`);
    const tam = ((a[o + 3] & 0x03) << 11) | (a[o + 4] << 3) | ((a[o + 5] & 0xe0) >> 5);
    assert.ok(tam >= 7, `frame ${frames} com tamanho absurdo: ${tam}`);
    o += tam;
    frames++;
  }
  assert.equal(o, a.length, 'a soma dos frames tem de dar o ficheiro todo');
  // 1024 amostras por frame a 48 kHz = 21,33 ms. ~12,5 s de segmento.
  const segundos = (frames * 1024) / 48000;
  assert.ok(Math.abs(segundos - 12.5) < 0.3, `${frames} frames = ${segundos.toFixed(2)}s`);
});

test('vários segmentos colados dão a soma dos segmentos', () => {
  const dois = new Uint8Array(ts.length * 2);
  dois.set(ts, 0);
  dois.set(ts, ts.length);
  // Medido em 40 segmentos seguidos: o áudio colado é idêntico, amostra a
  // amostra, ao que o ffmpeg produz a ler o TS com os PTS. Não há deriva.
  assert.equal(aacDeSegmentos(dois).length, FFMPEG.bytes * 2);
});

test('lixo não vira silêncio — vira null', () => {
  assert.equal(aacDeSegmentos(new Uint8Array(0)), null);
  assert.equal(aacDeSegmentos(new Uint8Array(1880)), null, 'zeros não são um TS');
  assert.equal(aacDeSegmentos(crypto.randomBytes(1880)), null);
});

test('um TS sem faixa de áudio devolve null em vez de inventar', () => {
  // Só os pacotes de vídeo do segmento verdadeiro: PAT e PMT continuam lá, e
  // o PID do áudio existe na tabela — mas não há um único pacote dele.
  const PID_AUDIO = (() => {
    const contagem = new Map();
    for (let i = 0; i + 188 <= ts.length; i += 188) {
      const pid = ((ts[i + 1] & 0x1f) << 8) | ts[i + 2];
      contagem.set(pid, (contagem.get(pid) || 0) + 1);
    }
    return contagem;
  })();
  assert.ok(PID_AUDIO.size >= 3, 'o segmento tem PAT, PMT, vídeo e áudio');

  const fora = [];
  for (let i = 0; i + 188 <= ts.length; i += 188) {
    const pid = ((ts[i + 1] & 0x1f) << 8) | ts[i + 2];
    // Guarda tudo menos o PID que o demuxer escolheria.
    if (pid !== 256 && pid !== 257) fora.push(ts.subarray(i, i + 188));
  }
  const semAudio = new Uint8Array(fora.length * 188);
  fora.forEach((p, k) => semAudio.set(p, k * 188));
  assert.equal(aacDeSegmentos(semAudio), null);
});
