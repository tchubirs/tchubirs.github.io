// "Um vídeo só" no 9:16 (correções de 12/10): os clipes gravados no browser juntam-se num ficheiro sem
// recodificar. A prova é com gravações a sério do MediaRecorder deste Chromium (WebM e, quando ele grava,
// MP4 fragmentado): duas gravações de durações diferentes, juntas, abrem num <video> com a soma das duas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPalco, podeCorrer } from './palco.mjs';

let porta = 0;
const palco = montarPalco((p) => { porta = p; });

test('dois 9:16 gravados viram um vídeo com a soma das durações', { skip: !podeCorrer && 'sem chromium' }, async () => {
  const { p, erros } = await palco.abrir({ caminho: null });
  await p.goto(`http://127.0.0.1:${porta}/index.html`);
  const r = await p.evaluate(async () => {
    const { juntarGravados } = await import('./juntar-gravados.js');
    const gravar = (tipo, ms, cor) => new Promise((ok) => {
      const tela = document.createElement('canvas');
      tela.width = 180; tela.height = 320;
      const ctx = tela.getContext('2d');
      const fluxo = tela.captureStream(30);
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      const osc = ac.createOscillator(); osc.connect(dest); osc.start();
      for (const f of dest.stream.getAudioTracks()) fluxo.addTrack(f);
      const rec = new MediaRecorder(fluxo, { mimeType: tipo });
      const bocados = [];
      rec.ondataavailable = (e) => { if (e.data.size) bocados.push(e.data); };
      let n = 0;
      const pincel = setInterval(() => { ctx.fillStyle = cor; ctx.fillRect(0, 0, 180, 320); ctx.fillStyle = '#fff'; ctx.fillText(String(n++), 20, 40); }, 33);
      rec.onstop = async () => { clearInterval(pincel); ac.close(); ok(new Uint8Array(await new Blob(bocados).arrayBuffer())); };
      rec.start(250);
      setTimeout(() => rec.stop(), ms);
    });
    const duracao = (blob) => new Promise((ok) => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(blob);
      v.onloadedmetadata = () => {
        if (Number.isFinite(v.duration)) { ok(v.duration); return; }
        // WebM de gravação não diz a duração: salta para o fim e lê.
        v.ontimeupdate = () => { v.ontimeupdate = null; ok(v.duration); };
        v.currentTime = 1e6;
      };
      v.onerror = () => ok(-1);
    });
    const saida = {};
    for (const tipo of ['video/webm;codecs=vp8,opus', 'video/mp4']) {
      if (!MediaRecorder.isTypeSupported(tipo)) continue;
      const a = await gravar(tipo, 1500, '#c00');
      const b = await gravar(tipo, 1000, '#00c');
      if (!a.length || !b.length) continue;
      const da = await duracao(new Blob([a], { type: tipo }));
      const db = await duracao(new Blob([b], { type: tipo }));
      const j = juntarGravados([a, b]);
      const dj = await duracao(new Blob(j.partes, { type: tipo }));
      saida[tipo] = { da, db, dj, conta: j.duracaoS };
    }
    return saida;
  });
  assert.ok(Object.keys(r).length, 'este Chromium grava pelo menos um formato');
  for (const [tipo, x] of Object.entries(r)) {
    assert.ok(x.da > 1 && x.db > 0.5, `${tipo}: as gravações têm duração (${x.da}, ${x.db})`);
    assert.ok(Math.abs(x.dj - (x.da + x.db)) < 0.25, `${tipo}: juntas duram ${x.dj}, e as duas somam ${x.da + x.db}`);
    assert.ok(Math.abs(x.conta - x.dj) < 0.25, `${tipo}: a conta diz ${x.conta}`);
  }
  assert.deepEqual(erros, []);
});
