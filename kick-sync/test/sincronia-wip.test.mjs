// O que ficou do ramo da sincronia (06/10): o relógio que segue o vídeo mais de uma hora, o fim de um
// canal com uma reconexão curta, e a procura binária do tempo de um segmento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seguirAncora, linhaDoCanal } from '../site/relogio.js';
import { tempoDeMidia, DESCONHECIDO } from '../site/kick.js';

test('o relógio segue o vídeo mais de uma hora seguida, porque a âncora anda com ele', () => {
  let ancora = { slug: 'a', ms: 1_000_000, tempoS: 0 };
  const video = { paused: false, readyState: 4, currentTime: 0 };
  // Passos de 30 min: cada um dentro do limite de uma hora, e a soma bem acima dele.
  for (let i = 1; i <= 6; i++) {
    video.currentTime = i * 1800;
    const r = seguirAncora(ancora, video);
    assert.equal(r.ms, 1_000_000 + i * 1800_000, `parou no passo ${i}`);
    ancora = r.ancora;
  }
  // Um salto de mais de uma hora num passo só continua a ser um salto, e não conta.
  video.currentTime += 4000;
  assert.equal(seguirAncora(ancora, video).ms, null);
});

test('o fim de um canal é o do VOD que vai mais longe, e não o do último a começar', () => {
  const peca = (inicio, fim) => ({
    vod: { id: `${inicio}` },
    playlist: { inicio, fim, segmentos: [{ inicio, duracaoS: (fim - inicio) / 1000, mediaT: 0 }] },
  });
  const l = linhaDoCanal('a', [peca(0, 10_000_000), peca(2_000_000, 3_000_000)]);
  assert.equal(l.fim, 10_000_000);
});

test('o tempo de um segmento pela procura binária é o mesmo que pelo ciclo', () => {
  const segmentos = [];
  let t = 0;
  for (let i = 0; i < 500; i++) {
    const d = i % 7 === 0 ? 0 : 2 + (i % 3);
    segmentos.push({ inicio: 1_000 + i * 4000, duracaoS: d, mediaT: t });
    t += d;
  }
  const lento = (q) => {
    for (const s of segmentos) {
      const fim = s.inicio + s.duracaoS * 1000;
      if (q >= s.inicio && q < fim) return s.mediaT + (q - s.inicio) / 1000;
    }
    return DESCONHECIDO;
  };
  for (let q = 0; q < 2_010_000; q += 777) {
    assert.equal(tempoDeMidia({ segmentos }, q), lento(q), `diferente em ${q}`);
  }
});
