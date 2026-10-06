import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nomeDoFicheiro, planearCorte, executarCorte, cortarTodosOsAngulos, largarOQueNaoServe, oQueFalta,
} from '../site/baixar.js';
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

// ── exportar: prazos, cancelar e memória ────────────────────────────────────

// Um pedido que pára sem fechar prendia a montagem para sempre, com o botão
// apagado. O `fetch` falso aqui faz o pior: nunca responde e ignora o sinal.
test('a segment that never answers is given up after the deadline, not waited on forever', async () => {
  const cdn = cdnFalso();
  const p = await planearCorte({ linha: linhaFalsa('tchubi'), deMs: T, ateMs: T + 10_000, buscar: cdn.buscar });
  let tentativas = 0;
  const preso = () => { tentativas++; return new Promise(() => {}); };
  const r = await executarCorte(p, { buscar: preso, prazoMs: 20 });
  assert.equal(r.estado, 'incompleto', 'had to give up and say so');
  assert.equal(tentativas, 3, 'and still retried, because a stall is a failure like any other');
  assert.match(r.falhas[0].erro, /sem resposta/);
});

// O Parar tem de chegar também ao plano: a lista de qualidades e a playlist
// eram pedidas sem sinal nenhum.
test('planning stops on cancel and on a stalled playlist, instead of hanging', async () => {
  const preso = () => new Promise(() => {});
  const controlo = new AbortController();
  const plano = planearCorte({
    linha: linhaFalsa('tchubi'), deMs: T, ateMs: T + 10_000, buscar: preso, sinal: controlo.signal,
  });
  controlo.abort();
  await assert.rejects(plano, (e) => e.name === 'AbortError');

  await assert.rejects(
    planearCorte({ linha: linhaFalsa('tchubi'), deMs: T, ateMs: T + 10_000, buscar: preso, prazoMs: 20 }),
    (e) => e.name === 'PRAZO',
  );
});

// "One network error leaves that channel's Export button disabled forever":
// o `fetch` que rejeita passava direito pelo `cortarTodosOsAngulos`.
test('a fetch that rejects on one angle comes back as an error, and the others still arrive', async () => {
  const bom = cdnFalso();
  const buscar = async (url, opcoes) => {
    if (url.includes('/mau/')) throw new TypeError('Failed to fetch');
    return bom.buscar(url, opcoes);
  };
  const mau = linhaDoCanal('mau', [{
    vod: { id: 9, master: 'https://cdn/mau/master.m3u8' },
    playlist: linhaFalsa('x').pecas[0].playlist,
  }]);
  const r = await cortarTodosOsAngulos({
    linhas: [mau, linhaFalsa('bom')], deMs: T + 25_000, ateMs: T + 35_000, buscar,
  });
  assert.equal(r.length, 2);
  assert.equal(r[0].estado, 'erro');
  assert.match(r[0].erro, /Failed to fetch/);
  assert.equal(r[1].estado, 'pronto');
});

// A montagem guardava cada pedaço até ao fim: perto de 11 MB por pedaço, e
// numa noite de quarenta kills isso eram gigas e o separador morria.
test('the montage cache keeps only what a later clip of the same channel will ask for', () => {
  const jaTemos = new Map([
    ['a/1.ts', new Uint8Array(1)], ['a/2.ts', new Uint8Array(1)], ['b/1.ts', new Uint8Array(1)],
  ]);
  const sitios = new Map([
    ['a/1.ts', { canal: 'a', inicio: T, fim: T + 10_000 }],
    ['a/2.ts', { canal: 'a', inicio: T + 10_000, fim: T + 20_000 }],
    ['b/1.ts', { canal: 'b', inicio: T, fim: T + 10_000 }],
  ]);
  // Só o canal 'a' volta, e só a partir dos 15 s.
  largarOQueNaoServe(jaTemos, sitios, [{ canal: 'a', deMs: T + 15_000, ateMs: T + 30_000 }]);
  assert.deepEqual([...jaTemos.keys()], ['a/2.ts']);
  assert.deepEqual([...sitios.keys()], ['a/2.ts'], 'the bookkeeping goes with the bytes');

  largarOQueNaoServe(jaTemos, sitios, []);
  assert.equal(jaTemos.size, 0, 'at the end of the montage nothing stays held');
});

// Uma reconexão: a Kick fecha um VOD e abre outro, que se tocam quase ao milissegundo. O corte
// de um VOD só saía cortado na queda e dizia-se pronto; o resto tem de se pedir ao seguinte.
test('o resto de um corte partido por uma reconexão pede-se ao VOD seguinte, e só a ele', async () => {
  const peca = (master, inicio) => ({
    vod: { id: master, master },
    playlist: {
      segmentos: Array.from({ length: 30 }, (_, i) => ({
        url: `${i}.ts`, inicio: inicio + i * 10000, duracaoS: 10, mediaT: i * 10,
      })),
      fonteDoRelogio: 'program-date-time',
      inicio,
      fim: inicio + 300_000,
      duracaoS: 300,
    },
  });
  const linha = linhaDoCanal('tchubi', [
    peca('https://cdn/a/master.m3u8', T),
    peca('https://cdn/b/master.m3u8', T + 300_000),
  ]);
  const buscar = async (url) => {
    if (url.endsWith('master.m3u8')) return { ok: true, status: 200, text: async () => MASTER };
    const inicio = url.includes('/b/') ? T + 300_000 : T;
    return { ok: true, status: 200, text: async () => playlistTexto(inicio, 30) };
  };
  const de = T + 290_000;
  const ate = T + 320_000;

  const primeira = await planearCorte({ linha, deMs: de, ateMs: ate, buscar });
  assert.equal(primeira.master, 'https://cdn/a/master.m3u8');
  assert.ok(primeira.sobraFimS < -19, 'a primeira parte acaba na queda');

  const resto = oQueFalta(linha, primeira, ate);
  assert.deepEqual(resto, { deMs: T + 300_000, ateMs: ate, saltar: ['https://cdn/a/master.m3u8'] });
  const segunda = await planearCorte({ linha, deMs: resto.deMs, ateMs: resto.ateMs, buscar, saltar: resto.saltar });
  assert.equal(segunda.estado, 'ok');
  assert.equal(segunda.master, 'https://cdn/b/master.m3u8');
  assert.equal(segunda.segmentos[0].inicio, T + 300_000);
  assert.ok(segunda.sobraFimS >= 0, 'a segunda parte cobre o resto');
  assert.equal(oQueFalta(linha, segunda, ate, resto.saltar), null, 'e não há terceira');

  // A live que acabou de vez: não há VOD a seguir, e o corte fica como está (e diz que falta).
  const soUm = linhaDoCanal('tchubi', [peca('https://cdn/a/master.m3u8', T)]);
  const ultima = await planearCorte({ linha: soUm, deMs: de, ateMs: ate, buscar });
  assert.equal(oQueFalta(soUm, ultima, ate), null);
  // E um corte inteiro dentro de um VOD não tem resto nenhum.
  const inteiro = await planearCorte({ linha, deMs: T + 10_000, ateMs: T + 30_000, buscar });
  assert.equal(oQueFalta(linha, inteiro, T + 30_000), null);
});

// Numa ligação lenta mas viva os quatro pedaços ao mesmo tempo dividem a
// ligação: cada um leva quatro vezes mais do que sozinho. Um prazo para o
// pedido inteiro dava-os todos por perdidos e o corte voltava 'incompleto';
// o prazo tem de contar só o silêncio.
test('a slow but live link finishes: the deadline counts silence, not the whole request', async () => {
  const PEDACO = 1100;
  const POR_MS = PEDACO / 300; // sozinho, um pedaço leva 300 ms
  const activos = new Set();
  const buscar = async (url, { signal } = {}) => {
    const d = { falta: PEDACO, fila: [], espera: null, fim: false, erro: null };
    activos.add(d);
    const tick = setInterval(() => {
      const n = Math.min(d.falta, Math.ceil((POR_MS * 10) / activos.size));
      d.falta -= n;
      d.fila.push(new Uint8Array(n));
      if (d.falta <= 0) { d.fim = true; clearInterval(tick); activos.delete(d); }
      d.espera?.(); d.espera = null;
    }, 10);
    signal?.addEventListener('abort', () => {
      clearInterval(tick); activos.delete(d); d.erro = new DOMException('a', 'AbortError'); d.espera?.();
    });
    const leitor = {
      async read() {
        for (;;) {
          if (d.erro) throw d.erro;
          if (d.fila.length) return { done: false, value: d.fila.shift() };
          if (d.fim) return { done: true };
          await new Promise((ok) => { d.espera = ok; });
        }
      },
    };
    return { ok: true, status: 200, body: { getReader: () => leitor } };
  };
  const segmentos = Array.from({ length: 8 }, (_, i) => ({ url: `s${i}.ts`, inicio: i * 10000, duracaoS: 10 }));
  // Sozinho cabe duas vezes no prazo; com quatro a dividir a ligação, não.
  const r = await executarCorte({ estado: 'ok', segmentos, nome: 'x.ts' }, { buscar, prazoMs: 600 });
  assert.equal(r.estado, 'pronto', r.falhas?.[0]?.erro);
  assert.equal(r.bytes.length, 8 * PEDACO);
});
