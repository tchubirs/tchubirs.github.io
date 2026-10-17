// O pacote do lance para o editor (IDEIAS.md, item 6): os trechos de cada ângulo, o projeto multicâmera
// em FCPXML e o texto com nomes, horários e links.
//
// O FCPXML foi conferido à mão com o xmllint contra as DTDs 1.9 e 1.10 da Apple (cópia no repositório do
// CommandPost); a DTD não vem para cá. Aqui confere-se a estrutura que elas pedem e as contas dos tempos.
// Sem testar ainda no DaVinci e no Final Cut de verdade.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cadencia, tempoFcp, deslocamentos, fcpxmlMulticam, textoDoPacote, linkDoVod, horaUtc, duracaoLonga,
} from '../site/pacote.js';

/** Os elementos de um XML pela ordem, com os atributos. Chega para o que este gerador escreve. */
function elementos(x) {
  const lista = [];
  for (const m of x.matchAll(/<([a-z][\w-]*)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>/g)) {
    const atr = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) atr[a[1]] = a[2];
    lista.push({ nome: m[1], atr, vazio: m[3] === '/' });
  }
  return lista;
}

/** Os segundos de um tempo do FCPXML ("0s", "7s", "15000/6000s"). */
const segundos = (v) => {
  const m = String(v).match(/^(\d+)(?:\/(\d+))?s$/);
  assert.ok(m, `tempo mal escrito: ${v}`);
  return Number(m[1]) / Number(m[2] || 1);
};

const ANGULOS = [
  { canal: 'tchubi', ficheiro: '01_tchubi.mp4', inicioMs: 1_000_000, duracaoS: 7, largura: 1920, altura: 1080, fps: 60 },
  { canal: 'outro_2', ficheiro: '01_outro_2.mp4', inicioMs: 1_002_500, duracaoS: 4.5, largura: 1280, altura: 720, fps: 30 },
  { canal: 'zé', ficheiro: '01_zé.mp4', inicioMs: 999_000, duracaoS: 8, largura: 1920, altura: 1080, fps: 60 },
];

test('tempos do FCPXML: frações de 6000, arredondadas ao quadro', () => {
  assert.equal(cadencia(60), 60);
  assert.equal(cadencia(59.94), 60);
  assert.equal(cadencia(7), 30, 'o que não divide 6000 cai para 30');
  assert.equal(cadencia(undefined), 30);
  assert.equal(tempoFcp(0, 60), '0s');
  assert.equal(tempoFcp(7, 60), '7s');
  assert.equal(tempoFcp(1 / 60, 60), '100/6000s');
  assert.equal(tempoFcp(2.5, 30), '15000/6000s');
  assert.equal(tempoFcp(0.0101, 60), '100/6000s', 'arredonda ao quadro mais perto');
  assert.equal(tempoFcp(-3, 60), '0s');
});

test('o deslocamento de cada ângulo conta do que começa primeiro', () => {
  assert.deepEqual(deslocamentos(ANGULOS), [1, 3.5, 0]);
});

test('o FCPXML tem a estrutura da 1.9: format, asset com media-rep, multicam com um mc-angle por canal, mc-clip', () => {
  const x = fcpxmlMulticam({ titulo: 'Lance 01 & "a"', angulos: ANGULOS });
  assert.match(x, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1\.9">/);
  assert.match(x, /Lance 01 &amp; &quot;a&quot;/, 'o título escapado');
  const els = elementos(x);
  const de = (nome) => els.filter((e) => e.nome === nome);
  // Os ids são únicos e todas as referências existem.
  const ids = els.filter((e) => e.atr.id).map((e) => e.atr.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of els) for (const k of ['ref', 'format']) if (e.atr[k]) assert.ok(ids.includes(e.atr[k]), `${e.nome} ${k}=${e.atr[k]}`);
  // Dois formatos (1080p60 e 720p30), três assets, cada um com o seu ficheiro.
  assert.deepEqual(de('format').map((f) => [f.atr.width, f.atr.height, f.atr.frameDuration]),
    [['1920', '1080', '100/6000s'], ['1280', '720', '200/6000s']]);
  assert.deepEqual(de('asset').map((a) => a.atr.name), ['tchubi', 'outro_2', 'zé']);
  assert.deepEqual(de('media-rep').map((m) => m.atr.src), ['./01_tchubi.mp4', './01_outro_2.mp4', './01_z%C3%A9.mp4']);
  assert.ok(de('media-rep').every((m) => m.atr.kind === 'original-media'));
  // A ordem dos blocos: resources antes de library, e o multicam dentro de media.
  const ordem = els.map((e) => e.nome);
  assert.ok(ordem.indexOf('resources') < ordem.indexOf('media') && ordem.indexOf('media') < ordem.indexOf('multicam'));
  assert.ok(ordem.indexOf('multicam') < ordem.indexOf('library'));
  assert.deepEqual(['library', 'event', 'project', 'sequence', 'spine', 'mc-clip', 'mc-source'].map((n) => ordem.indexOf(n)),
    [...['library', 'event', 'project', 'sequence', 'spine', 'mc-clip', 'mc-source'].map((n) => ordem.indexOf(n))].sort((a, b) => a - b));
  // Os ângulos: nome e angleID são o slug, tal e qual.
  assert.deepEqual(de('mc-angle').map((a) => [a.atr.name, a.atr.angleID]),
    [['tchubi', 'tchubi'], ['outro_2', 'outro_2'], ['zé', 'zé']]);
  // E o mc-clip aponta para o media e liga o primeiro ângulo.
  assert.equal(de('mc-clip')[0].atr.ref, de('media')[0].atr.id);
  assert.equal(de('mc-source')[0].atr.angleID, 'tchubi');
  assert.equal(de('mc-source')[0].atr.srcEnable, 'all');
});

test('cada ângulo entra no multicâmera no segundo em que o ficheiro dele começa', () => {
  const x = fcpxmlMulticam({ titulo: 'Lance', angulos: ANGULOS });
  // Cada mc-angle por si: o gap (se houver) e o asset-clip.
  const blocos = [...x.matchAll(/<mc-angle name="([^"]+)"[^>]*>([\s\S]*?)<\/mc-angle>/g)];
  assert.equal(blocos.length, 3);
  const esperado = { tchubi: 1, outro_2: 3.5, 'zé': 0 };
  for (const [, canal, corpo] of blocos) {
    const els = elementos(corpo);
    const clip = els.find((e) => e.nome === 'asset-clip');
    assert.equal(segundos(clip.atr.offset), esperado[canal], canal);
    assert.equal(clip.atr.start, '0s');
    const gap = els.find((e) => e.nome === 'gap');
    if (esperado[canal]) {
      assert.equal(segundos(gap.atr.offset), 0);
      assert.equal(segundos(gap.atr.duration), esperado[canal], `o gap enche até o ${canal} começar`);
    } else assert.equal(gap, undefined);
  }
  // A duração de cada asset é a do ficheiro, e a da sequência vai até o último ângulo acabar (3,5 + 4,5 = 8).
  const assets = elementos(x).filter((e) => e.nome === 'asset');
  assert.deepEqual(assets.map((a) => segundos(a.atr.duration)), [7, 4.5, 8]);
  assert.equal(segundos(elementos(x).find((e) => e.nome === 'sequence').atr.duration), 8);
  assert.equal(segundos(elementos(x).find((e) => e.nome === 'mc-clip').atr.duration), 8);
});

test('sem ângulos não há projeto', () => {
  assert.throws(() => fcpxmlMulticam({ titulo: 'x', angulos: [] }));
});

test('o texto do pacote diz o ficheiro, o início, a duração, o atraso e o VOD de cada ângulo', () => {
  const t = (k, v = {}) => `${k}${Object.keys(v).length ? ` ${JSON.stringify(v)}` : ''}`;
  const texto = textoDoPacote({
    titulo: 'Lance 01',
    instanteMs: Date.parse('2026-10-05T21:14:07Z'),
    t,
    angulos: [
      { ...ANGULOS[0], atrasoMs: 2300, link: 'https://kick.com/tchubi/videos/abc-123', noVodS: 3725 },
      { ...ANGULOS[1], atrasoMs: 0, link: null, noVodS: null },
    ],
  });
  const linhas = texto.split('\r\n');
  assert.equal(linhas[0], 'Lance 01');
  assert.match(linhas[1], /"data":"2026-10-05","hora":"21:14:07"/);
  assert.ok(linhas.includes('1. tchubi'));
  assert.ok(linhas.includes('   pacote.txtFicheiro: 01_tchubi.mp4'));
  assert.ok(linhas.some((l) => l.includes('pacote.txtComeca') && l.includes('"s":"0.00"')), 'o primeiro a começar está no zero');
  assert.ok(linhas.some((l) => l.includes('pacote.txtComeca') && l.includes('"s":"2.50"')));
  assert.ok(linhas.some((l) => l.includes('pacote.txtAtraso') && l.includes('"s":"2.30"')));
  assert.ok(linhas.includes('   pacote.txtVod: https://kick.com/tchubi/videos/abc-123 (pacote.txtNoVod {"tempo":"1:02:05"})'));
  assert.ok(linhas.includes('   pacote.txtSemLink'));
});

// 17/10: kick.com/<canal>/videos/<uuid da lista> dá "página não encontrada"; a página só abre pelo vod_id.
test('o link do VOD só sai com o vod_id (UUID v7) da Kick', () => {
  assert.equal(linkDoVod('tchubi', { vodId: '01a144e3-1840-72bf-9278-612affd77585' }),
    'https://kick.com/tchubi/videos/01a144e3-1840-72bf-9278-612affd77585');
  assert.equal(linkDoVod('tchubi', { uuid: 'd6768682-411f-4390-839f-3c63b5940cf2' }), null);
  assert.equal(linkDoVod('tchubi', { vodId: 'd6768682-411f-4390-839f-3c63b5940cf2' }), null);
  assert.equal(linkDoVod('tchubi', { vodId: null }), null);
  assert.equal(linkDoVod('tchubi', { vodId: '../x' }), null);
  assert.equal(linkDoVod('', { vodId: '01a144e3-1840-72bf-9278-612affd77585' }), null);
  assert.equal(horaUtc(Date.parse('2026-10-05T01:02:03Z')), '01:02:03');
  assert.equal(duracaoLonga(59.6), '0:01:00');
});
