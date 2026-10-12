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

// O teste de cima falhou uma vez na suíte inteira com "faixas diferentes": medido depois, em 36 gravações
// feitas 6 ao mesmo tempo, o gravador do Chromium pôs o som antes da imagem em 33 e a imagem antes do som
// em 3. As faixas ligam-se pela forma de cada uma, e os blocos da segunda passam a usar os números da
// primeira. Aqui com dois WebM mínimos feitos à mão, um com cada ordem, para não depender da sorte.
test('duas gravações com as faixas em ordem trocada juntam-se, com os blocos na faixa certa', async () => {
  const { juntarGravados } = await import('../site/juntar-gravados.js');
  const el = (id, corpo) => [...id, 0x80 | corpo.length, ...corpo];
  const faixa = (numero, tipo, codec) => el([0xae], [
    ...el([0xd7], [numero]), ...el([0x73, 0xc5], [1, 2, 3, 4, 5, 6, 7, numero * 9]), ...el([0x83], [tipo]),
    ...el([0x86], [...codec].map((c) => c.charCodeAt(0))),
  ]);
  // Um SimpleBlock: o número da faixa, o tempo relativo (2 bytes), as flags e um byte de dados que diz de quem é.
  const bloco = (numero, rel, dado) => el([0xa3], [0x80 | numero, rel >> 8, rel & 255, 0x80, dado]);
  const webm = (ordem) => {
    const num = Object.fromEntries(ordem.map((t, i) => [t, i + 1]));
    const faixas = ordem.map((t) => (t === 'v' ? faixa(num.v, 1, 'V_VP8') : faixa(num.a, 2, 'A_OPUS')));
    return new Uint8Array([
      ...el([0x1a, 0x45, 0xdf, 0xa3], []),
      0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      ...el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40])),
      ...el([0x16, 0x54, 0xae, 0x6b], faixas.flat()),
      0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      ...el([0xe7], [0]), ...bloco(num.v, 0, 0x56), ...bloco(num.a, 10, 0x41), ...bloco(num.v, 33, 0x56),
    ]);
  };
  const primeira = webm(['v', 'a']);
  const segunda = webm(['a', 'v']);
  const { partes } = juntarGravados([primeira, segunda]);
  const tudo = new Uint8Array(await new Blob(partes).arrayBuffer());
  // Cada bloco da saída: o número da faixa e o byte de dados. Na primeira, a imagem é 1 e o som é 2.
  const blocos = [];
  for (let i = 0; i + 5 < tudo.length; i++) {
    if (tudo[i] === 0xa3 && tudo[i + 1] === 0x85) blocos.push([tudo[i + 2] & 0x7f, String.fromCharCode(tudo[i + 6])]);
  }
  assert.deepEqual(blocos, [[1, 'V'], [2, 'A'], [1, 'V'], [1, 'V'], [2, 'A'], [1, 'V']]);
  // E duas faixas que não casam (outro codec) continuam a ser recusadas.
  const outra = webm(['v', 'a']);
  outra[outra.indexOf(0x4f)] = 0x58; // "A_OPUS" vira "A_XPUS"
  assert.throws(() => juntarGravados([primeira, outra]), /faixas diferentes/);
});
