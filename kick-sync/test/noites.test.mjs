// O agrupamento de noites, sozinho.
//
// Este ficheiro existe por causa de um bug real: um canal 24/7 com um VOD de
// 38 horas colou cinco dias num só bloco, e o dia que se queria deixou de
// aparecer na lista. Estava lá dentro, e nao havia como escolhe-lo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorNoite, rotuloDaNoite } from '../site/noites.js';

const T = (iso) => Date.parse(iso);
const h = (n) => n * 3600_000;
const canal = (slug, vods) => ({ slug, vods: vods.map(([iso, horas]) => ({ inicioApi: T(iso), duracaoMs: h(horas) })) });

test('cada noite e um grupo, e a mais recente vem primeiro', () => {
  const n = agruparPorNoite([
    canal('a', [['2026-08-28T21:00:00Z', 3], ['2026-08-30T21:00:00Z', 4]]),
    canal('b', [['2026-08-30T21:30:00Z', 3]]),
  ]);
  assert.equal(n.length, 2);
  assert.equal(new Date(n[0].inicio).toISOString().slice(0, 10), '2026-08-30');
  assert.equal(n[0].canais, 2);
  assert.equal(n[1].canais, 1);
});

// O bug, exactamente como aconteceu.
test('um VOD de 38 horas nao cola os dias todos numa noite so', () => {
  const n = agruparPorNoite([
    // O canal 24/7: comeca a 29 de manha e so acaba a 31 de madrugada.
    canal('semprelive', [['2026-08-29T11:20:00Z', 38]]),
    canal('a', [['2026-08-29T21:00:00Z', 3], ['2026-08-30T21:00:00Z', 4]]),
    canal('b', [['2026-08-30T21:10:00Z', 3]]),
  ]);
  const dias = n.map((x) => new Date(x.inicio).toISOString().slice(0, 10));
  assert.ok(dias.includes('2026-08-30'), `o dia 30 tem de existir: ${dias}`);
  assert.ok(dias.includes('2026-08-29'), `e o 29 tambem: ${dias}`);

  const trinta = n.find((x) => new Date(x.inicio).toISOString().startsWith('2026-08-30'));
  // O VOD gigante atravessa a noite de 30 e por isso conta nela...
  assert.equal(trinta.canais, 3, 'os tres estao no ar na noite de 30');
  // ...mas nao a estica ate 31 de madrugada.
  assert.ok(trinta.fim - trinta.inicio < h(12), `a noite de 30 dura ${(trinta.fim - trinta.inicio) / h(1)}h`);
});

test('a noite diz quem la esteve, pelo nome', () => {
  const [n] = agruparPorNoite([
    canal('a', [['2026-08-30T21:00:00Z', 3]]),
    canal('b', [['2026-08-30T21:30:00Z', 2]]),
  ]);
  assert.deepEqual([...n.quem].sort(), ['a', 'b']);
});

test('quem so passou pela noite e contado, mas nao a comecou', () => {
  const n = agruparPorNoite([
    canal('semprelive', [['2026-08-29T11:00:00Z', 38]]),
    canal('a', [['2026-08-30T21:00:00Z', 3]]),
  ]);
  const trinta = n.find((x) => new Date(x.inicio).toISOString().startsWith('2026-08-30'));
  assert.equal(trinta.canais, 2);
  assert.equal(trinta.comecaramAqui, 1, 'so o "a" comecou a transmitir nesta noite');
});

test('dois que comecam com uma hora de diferenca sao a mesma noite', () => {
  const n = agruparPorNoite([
    canal('a', [['2026-08-30T20:00:00Z', 5]]),
    canal('b', [['2026-08-30T21:00:00Z', 5]]),
  ]);
  assert.equal(n.length, 1);
  assert.equal(n[0].canais, 2);
});

test('sem duracao conhecida o VOD conta como um instante, nao como eterno', () => {
  const n = agruparPorNoite([{ slug: 'a', vods: [{ inicioApi: T('2026-08-30T21:00:00Z') }] }]);
  assert.equal(n.length, 1);
  assert.equal(n[0].fim, n[0].inicio);
});

test('lixo dentro nao rebenta nem inventa noites', () => {
  assert.deepEqual(agruparPorNoite([]), []);
  assert.deepEqual(agruparPorNoite(null), []);
  assert.deepEqual(agruparPorNoite([{ slug: 'a', vods: [{ inicioApi: NaN }] }]), []);
});

// Uma noite que atravessa a meia-noite tem de dizer os dois dias, senao quem
// procura o dia 30 nao o encontra numa linha que so diz 29.
test('o rotulo diz o segundo dia quando a noite atravessa a meia-noite', () => {
  const [n] = agruparPorNoite([canal('a', [['2026-08-30T22:00:00Z', 5]])]);
  const r = rotuloDaNoite(n);
  assert.match(r, /2026-08-30/);
  assert.match(r, /2026-08-31 03:00/, `devia dizer onde acaba: ${r}`);
  assert.match(r, /1 canal\b/, 'um canal, nao "1 canais"');
});

test('dentro do mesmo dia o rotulo nao repete a data', () => {
  const [n] = agruparPorNoite([canal('a', [['2026-08-30T18:00:00Z', 3]])]);
  assert.equal(rotuloDaNoite(n), '2026-08-30 · 18:00–21:00 — 1 canal');
});
