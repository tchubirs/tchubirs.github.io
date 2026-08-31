import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeDoFicheiro, planearCorte, executarCorte, cortarTodosOsAngulos } from '../site/baixar.js';
import { linhaDoCanal } from '../site/relogio.js';

const T = Date.parse('2026-08-30T21:00:00.000Z');

const MASTER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,FRAME-RATE=30.000',
  '160p30/playlist.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=9091454,RESOLUTION=1920x1080,FRAME-RATE=60.000',
  '1080p60/playlist.m3u8',
].join('\n');

/** A playlist of 10-second segments starting at `inicio`. */
const playlistTexto = (inicio, quantos) => {
  const l = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:12'];
  for (let i = 0; i < quantos; i++) {
    l.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(inicio + i * 10000).toISOString()}`);
    l.push('#EXTINF:10.000,', `${i}.ts`);
  }
  return l.join('\n');
};

/** A fake CDN that counts what was asked of it. */
function cdnFalso({ inicio = T, segmentos = 60, falhar = new Set(), bytesPorSeg = 1000 } = {}) {
  const pedidos = [];
  const buscar = async (url) => {
    pedidos.push(url);
    if (falhar.has(url)) return { ok: false, status: 503 };
    if (url.endsWith('master.m3u8')) return { ok: true, status: 200, text: async () => MASTER };
    if (url.endsWith('playlist.m3u8')) {
      return { ok: true, status: 200, text: async () => playlistTexto(inicio, segmentos) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(bytesPorSeg) };
  };
  return { buscar, pedidos };
}

const linhaFalsa = (slug, inicio = T, segundos = 600) => linhaDoCanal(slug, [{
  vod: { id: 1, master: 'https://cdn/x/master.m3u8' },
  playlist: {
    segmentos: Array.from({ length: segundos / 10 }, (_, i) => ({
      url: `${i}.ts`, inicio: inicio + i * 10000, duracaoS: 10, mediaT: i * 10,
    })),
    fonteDoRelogio: 'program-date-time',
    inicio,
    fim: inicio + segundos * 1000,
    duracaoS: segundos,
  },
}]);

test('the filename says the channel and the instant, without opening it', () => {
  const n = nomeDoFicheiro({ canal: 'tchubi', quandoMs: Date.parse('2026-08-30T21:04:05Z') });
  assert.equal(n, 'tchubi__20260830-210405Z.ts');
  // A channel name is user input and lands in a filesystem path.
  assert.equal(
    nomeDoFicheiro({ canal: '../../etc/passwd', quandoMs: T }).split('__')[0],
    '.._.._etc_passwd',
  );
});

// The export must never be the 160p that was on screen.
test('the export goes to the top of the ladder, not to what was playing', async () => {
  const { buscar } = cdnFalso();
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T + 25_000, ateMs: T + 35_000, buscar });
  assert.equal(p.estado, 'ok');
  assert.equal(p.qualidade.altura, 1080);
  assert.equal(p.qualidade.fps, 60);
  assert.ok(p.segmentos.every((s) => s.url.includes('1080p60')), 'segments must come from the top rung');
});

// A 20-second clip out of a ten-hour VOD fetches three segments, not the VOD.
test('a clip fetches only the segments that overlap', async () => {
  const { buscar, pedidos } = cdnFalso({ segmentos: 3600 });
  const p = await planearCorte({ linha: linhaFalsa('tchubi', T, 36000), deMs: T + 25_000, ateMs: T + 35_000, buscar });
  assert.equal(p.segmentos.length, 2, '25s-35s straddles one boundary');
  const r = await executarCorte(p, { buscar });
  assert.equal(r.estado, 'pronto');
  const segsPedidos = pedidos.filter((u) => u.endsWith('.ts'));
  assert.equal(segsPedidos.length, 2, `fetched ${segsPedidos.length} of 3600 segments`);
});

// The cut lands on a segment boundary. The user is told, in the number they
// need to trim by — never handed a clip that silently starts elsewhere.
test('says exactly where the cut really lands', async () => {
  const { buscar } = cdnFalso();
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T + 25_000, ateMs: T + 32_000, buscar });
  assert.equal(p.inicioReal, T + 20_000, 'the file starts at the segment, not at the mark');
  assert.equal(p.sobraInicioS, 5, 'and that is 5 s to trim in the editor');
  assert.equal(p.sobraFimS, 8);
  assert.ok(p.sobraInicioS >= 0 && p.sobraInicioS < 10, 'never more than one segment of slack');
});

test('a mark exactly on a boundary has no slack at all', async () => {
  const { buscar } = cdnFalso();
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T + 20_000, ateMs: T + 30_000, buscar });
  assert.equal(p.sobraInicioS, 0);
  assert.equal(p.sobraFimS, 0);
  assert.equal(p.segmentos.length, 1);
});

test('the joined file is the pieces, in order, byte for byte', async () => {
  const { buscar } = cdnFalso({ bytesPorSeg: 700 });
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T + 5_000, ateMs: T + 25_000, buscar });
  const r = await executarCorte(p, { buscar });
  assert.equal(r.estado, 'pronto');
  assert.equal(r.bytes.length, 700 * p.segmentos.length);
  assert.equal(r.tipo, 'video/mp2t', 'not mp4 — calling it mp4 would be a lie Premiere believes');
});

// A hole in the middle is a clip that jumps, and the editor only finds out on
// the timeline. Refuse it, and name the piece that is missing.
test('a missing segment refuses the file instead of shipping a jump', async () => {
  const cdn = cdnFalso();
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T, ateMs: T + 30_000, buscar: cdn.buscar });
  const morto = p.segmentos[1].url;
  const cdn2 = cdnFalso({ falhar: new Set([morto]) });
  const r = await executarCorte(p, { buscar: cdn2.buscar });
  assert.equal(r.estado, 'incompleto');
  assert.equal(r.falhas.length, 1);
  assert.match(r.falhas[0].url, /1\.ts$/);
  assert.equal(r.obtidos, 2);
  assert.equal(r.total, 3);
  assert.ok(!r.bytes, 'and no half-file that looks fine');
});

test('a dropped connection re-fetches only what is missing', async () => {
  const cdn = cdnFalso();
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T, ateMs: T + 30_000, buscar: cdn.buscar });
  const jaTemos = new Map();
  await executarCorte(p, { buscar: cdnFalso().buscar, jaTemos });
  assert.equal(jaTemos.size, 3);

  const segunda = cdnFalso();
  const r = await executarCorte(p, { buscar: segunda.buscar, jaTemos });
  assert.equal(r.estado, 'pronto');
  assert.equal(segunda.pedidos.filter((u) => u.endsWith('.ts')).length, 0, 'nothing re-downloaded');
});

test('a retry gives up loudly rather than returning an empty clip', async () => {
  let chamadas = 0;
  const buscar = async (url) => {
    if (url.endsWith('master.m3u8')) return { ok: true, status: 200, text: async () => MASTER };
    if (url.endsWith('playlist.m3u8')) return { ok: true, status: 200, text: async () => playlistTexto(T, 60) };
    chamadas++;
    return { ok: false, status: 500 };
  };
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T, ateMs: T + 10_000, buscar });
  const r = await executarCorte(p, { buscar });
  assert.equal(r.estado, 'incompleto');
  assert.equal(chamadas, 3, 'tried three times, then said so');
});

// Off air is a real answer, not an error and not an empty file.
test('a channel that was off air during the mark says so', async () => {
  const linha = linhaDoCanal('tchubi', [
    { vod: { id: 1, master: 'https://cdn/a/master.m3u8' }, playlist: { segmentos: [], fonteDoRelogio: 'program-date-time', inicio: T, fim: T + 600_000, duracaoS: 600 } },
    { vod: { id: 2, master: 'https://cdn/b/master.m3u8' }, playlist: { segmentos: [], fonteDoRelogio: 'program-date-time', inicio: T + 900_000, fim: T + 1_500_000, duracaoS: 600 } },
  ]);
  const p = await planearCorte({ linha, deMs: T + 700_000, ateMs: T + 710_000, buscar: cdnFalso().buscar });
  assert.equal(p.estado, 'buraco');
  assert.equal(p.buraco.segundos, 300);
});

test('a window outside the night is not a hole, and says which', async () => {
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T - 100_000, ateMs: T - 90_000, buscar: cdnFalso().buscar });
  assert.equal(p.estado, 'fora-da-noite');
});

test('an inverted or empty window is refused before any network call', async () => {
  const cdn = cdnFalso();
  for (const [de, ate] of [[T + 10, T], [T, T]]) {
    const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: de, ateMs: ate, buscar: cdn.buscar });
    assert.equal(p.estado, 'janela-invalida');
  }
  assert.equal(cdn.pedidos.length, 0, 'and it did not touch the network to find out');
});

// The feature the tool exists for: one mark, N angles, same instant.
test('every angle is cut for the same instant, each with its own nudge', async () => {
  const { buscar } = cdnFalso();
  const linhas = [linhaFalsa('a'), linhaFalsa('b'), linhaFalsa('c')];
  const r = await cortarTodosOsAngulos({
    linhas, deMs: T + 25_000, ateMs: T + 35_000, buscar, nudges: { b: 10_000 },
  });
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => x.estado === 'pronto'));
  // 'b' is nudged a full segment forward, so it must land one segment later.
  assert.equal(r[0].plano.inicioReal, T + 20_000);
  assert.equal(r[1].plano.inicioReal, T + 30_000);
  assert.equal(r[2].plano.inicioReal, T + 20_000);
});

test('one angle failing does not lose the others', async () => {
  const linhas = [linhaFalsa('bom'), linhaDoCanal('vazio', []), linhaFalsa('outro')];
  const r = await cortarTodosOsAngulos({
    linhas, deMs: T + 25_000, ateMs: T + 35_000, buscar: cdnFalso().buscar,
  });
  assert.equal(r[0].estado, 'pronto');
  assert.equal(r[1].estado, 'fora-da-noite');
  assert.equal(r[2].estado, 'pronto');
});

test('the master playlist is fetched once for all angles, not once per angle', async () => {
  const cdn = cdnFalso();
  await cortarTodosOsAngulos({
    linhas: [linhaFalsa('a'), linhaFalsa('b'), linhaFalsa('c')],
    deMs: T + 25_000,
    ateMs: T + 35_000,
    buscar: cdn.buscar,
  });
  assert.equal(cdn.pedidos.filter((u) => u.endsWith('master.m3u8')).length, 1,
    'the three fakes share one master URL — asking three times is wasted rate limit');
});
