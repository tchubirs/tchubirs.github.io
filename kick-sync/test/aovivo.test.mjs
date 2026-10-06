// Seguir um evento ao vivo, sem rede, sem browser e sem esperar de verdade.
//
// As playlists daqui têm a forma medida em 06/10/2026: PROGRAM-DATE-TIME em
// cada segmento, PLAYLIST-TYPE EVENT, e um EXT-X-ENDLIST no fim de CADA
// leitura (sim, mesmo ao vivo). Passam todas por `lerPlaylist`, o mesmo
// leitor que a página usa, para que um teste verde queira dizer alguma coisa
// sobre o que a página vai ver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerPlaylist } from '../site/kick.js';
import { linhaDoCanal } from '../site/relogio.js';
import {
  novosSegmentos, bordaAoVivo, agendar, dormir,
  LIMITE_FORA_DO_AR_MS, INTERVALO_MS, TETO_MS,
} from '../site/aovivo.js';

const F = new URL('../probes/fixtures/', import.meta.url);
const T = Date.parse('2026-10-06T09:30:00.000Z');
const BASE = 'https://stream.kick.com/x/ivs/v1/1/a/2026/10/6/9/30/b/media/hls/160p30/';

/**
 * O texto de uma leitura ao vivo: `quantos` segmentos de `durS` a começar em
 * `inicioMs`, numerados a partir de `primeiro`.
 */
function textoAoVivo({ inicioMs = T, quantos, durS = 10, primeiro = 0, sufixo = '' }) {
  const l = [
    '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:12',
    '#EXT-X-PLAYLIST-TYPE:EVENT', `#EXT-X-MEDIA-SEQUENCE:${primeiro}`,
  ];
  for (let i = 0; i < quantos; i++) {
    l.push(
      `#EXT-X-PROGRAM-DATE-TIME:${new Date(inicioMs + (primeiro + i) * durS * 1000).toISOString()}`,
      `#EXTINF:${durS.toFixed(3)},`,
      `${primeiro + i}.ts${sufixo}`,
    );
  }
  l.push('#EXT-X-ENDLIST');
  return l.join('\n');
}
const leitura = (o, base = BASE) => lerPlaylist(textoAoVivo(o), `${base}playlist.m3u8`);

/** Uma leitura cortada da gravação real do xqc: os primeiros `n` segmentos. */
const XQC = readFileSync(new URL('xqc-media.m3u8', F), 'utf8').split('\n');
function leituraReal(n) {
  const saida = [];
  let vistos = 0;
  for (const l of XQC) {
    if (vistos === n) break;
    saida.push(l);
    if (/\.ts$/.test(l.trim())) vistos++;
  }
  saida.push('#EXT-X-ENDLIST');
  return lerPlaylist(saida.join('\n'), `${BASE}playlist.m3u8`);
}

// ── novosSegmentos ─────────────────────────────────────────────────────────

test('a primeira leitura e toda nova, e nao e um recomeco', () => {
  const p = leitura({ quantos: 5 });
  for (const antiga of [null, undefined, { segmentos: [] }]) {
    const r = novosSegmentos(antiga, p);
    assert.equal(r.novos.length, 5);
    assert.equal(r.recomecou, false);
    assert.equal(r.recuou, false);
    assert.equal(r.playlist, p);
  }
});

// A mesma gravação, lida duas vezes com uns segmentos de diferença: é o que a
// Kick devolve a cada pedido durante uma transmissão.
test('em duas leituras reais, so os segmentos do fim sao novos', () => {
  const antiga = leituraReal(100);
  const nova = leituraReal(103);
  assert.equal(antiga.segmentos.length, 100);
  assert.equal(nova.segmentos.length, 103);
  const r = novosSegmentos(antiga, nova);
  assert.equal(r.recomecou, false);
  assert.equal(r.recuou, false);
  assert.deepEqual(r.novos.map((s) => s.url), ['100.ts', '101.ts', '102.ts'].map((u) => BASE + u));
  assert.equal(r.novos[0].inicio, Date.parse('2026-08-30T20:47:04.390Z') + 100 * 10_000);
  assert.equal(r.novos[0].mediaT, 1000, 'o tempo de media continua o da leitura anterior');
  assert.equal(r.playlist, nova);
});

test('nada de novo e uma lista vazia, nao um erro', () => {
  const a = leitura({ quantos: 8 });
  const b = leitura({ quantos: 8 });
  const r = novosSegmentos(a, b);
  assert.deepEqual(r.novos, []);
  assert.equal(r.recomecou, false);
  assert.equal(r.recuou, false);
  assert.equal(r.playlist, b);
});

test('outra transmissao no lugar da anterior e um recomeco, e vem toda como nova', () => {
  const a = leitura({ quantos: 30 });
  // O streamer caiu e voltou: endereço novo (o caminho leva a hora do início)
  // e relógio novo.
  const outraBase = BASE.replace('/9/30/', '/9/41/');
  const b = leitura({ inicioMs: T + 660_000, quantos: 3 }, outraBase);
  const r = novosSegmentos(a, b);
  assert.equal(r.recomecou, true);
  assert.equal(r.novos.length, 3);
  assert.equal(r.playlist, b);
});

// O endereço sozinho enganava: uma transmissão que recomeça no MESMO caminho
// volta a chamar `0.ts` ao primeiro pedaço. O instante é o que os distingue.
test('o mesmo nome de segmento com outro relogio e outra transmissao', () => {
  const a = leitura({ quantos: 30 });
  const b = leitura({ inicioMs: T + 3_600_000, quantos: 4 });
  assert.equal(a.segmentos[0].url, b.segmentos[0].url, 'o cenario: mesmos nomes');
  const r = novosSegmentos(a, b);
  assert.equal(r.recomecou, true);
  assert.equal(r.novos.length, 4);
});

// Um CDN com uma cópia atrasada devolve uma leitura MAIS CURTA. Guardá-la por
// cima da anterior fazia os segmentos perdidos voltarem como "novos" depois.
test('uma leitura atrasada nao apaga o que ja se tinha', () => {
  const a = leitura({ quantos: 12 });
  const b = leitura({ quantos: 9 });
  const r = novosSegmentos(a, b);
  assert.deepEqual(r.novos, []);
  assert.equal(r.recomecou, false);
  assert.equal(r.recuou, true);
  assert.equal(r.playlist, a, 'fica a leitura mais completa');
});

test('se o principio da lista deslizar, nao parece uma transmissao nova', () => {
  const a = leitura({ quantos: 20 });                     // 0..19
  const b = leitura({ quantos: 20, primeiro: 5 });        // 5..24
  const r = novosSegmentos(a, b);
  assert.equal(r.recomecou, false);
  assert.deepEqual(r.novos.map((s) => s.url.split('/').at(-1)), ['20.ts', '21.ts', '22.ts', '23.ts', '24.ts']);
  assert.equal(r.recuou, false, 'mais curta no inicio mas com coisas novas nao e atrasada');
});

test('um token que muda a cada pedido nao faz o mesmo segmento parecer novo', () => {
  const a = leitura({ quantos: 6, sufixo: '?token=aaa' });
  const b = leitura({ quantos: 7, sufixo: '?token=bbb' });
  const r = novosSegmentos(a, b);
  assert.equal(r.recomecou, false);
  assert.equal(r.novos.length, 1);
  assert.match(r.novos[0].url, /\/6\.ts\?token=bbb$/, 'devolve o segmento como veio, com o token novo');
});

test('sem PROGRAM-DATE-TIME compara-se pelo endereco', () => {
  const sem = (n) => lerPlaylist(['#EXTM3U', ...Array.from({ length: n }, (_, i) => [`#EXTINF:10.000,`, `${i}.ts`]).flat(), '#EXT-X-ENDLIST'].join('\n'), `${BASE}playlist.m3u8`);
  const a = sem(4);
  const b = sem(6);
  assert.equal(b.fonteDoRelogio, 'sem-relogio');
  const r = novosSegmentos(a, b);
  assert.equal(r.recomecou, false);
  assert.equal(r.novos.length, 2);
  // E o mesmo com relógio de um lado só (uma leitura antiga sem PDT).
  const r2 = novosSegmentos(a, leitura({ quantos: 6 }));
  assert.equal(r2.recomecou, false);
  assert.equal(r2.novos.length, 2);
});

test('um segmento que faltava no meio tambem e novo', () => {
  const b = leitura({ quantos: 6 });
  const a = { ...b, segmentos: b.segmentos.filter((_, i) => i !== 2 && i < 5) };
  const r = novosSegmentos(a, b);
  assert.deepEqual(r.novos.map((s) => s.url.split('/').at(-1)), ['2.ts', '5.ts']);
});

test('uma resposta vazia nao e um recomeco e guarda-se a anterior', () => {
  const a = leitura({ quantos: 5 });
  for (const nova of [null, undefined, { segmentos: [] }, lerPlaylist('#EXTM3U\n#EXT-X-ENDLIST', BASE)]) {
    const r = novosSegmentos(a, nova);
    assert.deepEqual(r.novos, []);
    assert.equal(r.recomecou, false);
    assert.equal(r.recuou, true);
    assert.equal(r.playlist, a);
  }
  const vazio = novosSegmentos(null, null);
  assert.deepEqual(vazio, { novos: [], recomecou: false, recuou: false, playlist: null });
});

// A propriedade que importa: ao longo de uma transmissão inteira, guardando
// sempre `playlist`, cada segmento aparece como novo UMA vez — nem duas, nem
// nenhuma — mesmo com leituras atrasadas e vazias pelo meio.
test('ao longo de muitas leituras cada segmento e novo exactamente uma vez', () => {
  const tamanhos = [1, 3, 3, 7, 5, 0, 8, 12, 11, 12, 20, 2, 25];
  let guardada = null;
  const vistos = [];
  for (const n of tamanhos) {
    const r = novosSegmentos(guardada, n ? leitura({ quantos: n }) : { segmentos: [] });
    assert.equal(r.recomecou, false);
    vistos.push(...r.novos.map((s) => s.url.split('/').at(-1)));
    guardada = r.playlist;
  }
  assert.deepEqual(vistos, Array.from({ length: 25 }, (_, i) => `${i}.ts`));
});

// O que a versão anterior só provava com leituras atrasadas que eram o
// princípio da mesma lista. Aqui entram as três que a partiam: uma atrasada
// que preenche um buraco, uma cópia velha da transmissão de antes de um
// recomeço, e uma atrasada de uma janela que desliza.
const nome = (s) => `${s.url.split('/').at(-1)}@${s.inicio}`;
const nomes = (r) => r.novos.map((s) => s.url.split('/').at(-1));

test('uma leitura atrasada que preenche um buraco junta as duas, e nada se repete depois', () => {
  const b = leitura({ quantos: 12 });
  const a = { ...b, segmentos: b.segmentos.filter((_, i) => i !== 2) };     // 0..11 sem o 2
  const r = novosSegmentos(a, leitura({ quantos: 9 }));                      // atrasada: 0..8, com o 2
  assert.deepEqual(nomes(r), ['2.ts']);
  assert.equal(r.recomecou, false);
  assert.equal(r.recuou, false, 'trouxe uma coisa nova');
  assert.deepEqual(r.playlist.segmentos.map((s) => s.url.split('/').at(-1)),
    Array.from({ length: 12 }, (_, i) => `${i}.ts`), 'fica tudo, pela ordem');
  assert.equal(r.playlist.fim, b.fim, 'o fim e o da leitura mais comprida');
  assert.equal(r.playlist.inicio, b.inicio);
  assert.equal(r.playlist.fonteDoRelogio, 'program-date-time');
  const r2 = novosSegmentos(r.playlist, leitura({ quantos: 14 }));
  assert.deepEqual(nomes(r2), ['12.ts', '13.ts'], 'o 9, o 10 e o 11 ja tinham sido vistos');
});

test('uma copia velha da transmissao de antes de um recomeco nao a traz de volta', () => {
  const s1 = leitura({ quantos: 30 });
  const s2 = (n) => leitura({ inicioMs: T + 3_600_000, quantos: n });       // o mesmo caminho, uma hora depois
  const r1 = novosSegmentos(null, s1);
  const r2 = novosSegmentos(r1.playlist, s2(3));
  assert.equal(r2.recomecou, true);
  const r3 = novosSegmentos(r2.playlist, s1);                                 // o CDN ainda serve a de antes
  assert.equal(r3.recomecou, false, 'mais velha do que a guardada nao e uma transmissao nova');
  assert.equal(r3.recuou, true);
  assert.deepEqual(r3.novos, []);
  assert.equal(r3.playlist, r2.playlist, 'continua a guardar a transmissao de agora');
  const r4 = novosSegmentos(r3.playlist, s2(5));
  assert.equal(r4.recomecou, false);
  assert.deepEqual(nomes(r4), ['3.ts', '4.ts']);
  const total = [r1, r2, r3, r4].reduce((n, r) => n + r.novos.length, 0);
  assert.equal(total, 35, '30 da primeira e 5 da segunda, cada um uma vez');
});

test('uma leitura atrasada de uma janela que desliza nao e um recomeco', () => {
  // A primeira leitura que se viu já tinha deslizado: 2, 3 e 4 nunca vieram.
  const a = leitura({ quantos: 20, primeiro: 5 });                            // 5..24
  const r = novosSegmentos(a, leitura({ quantos: 20, primeiro: 2 }));         // atrasada: 2..21
  assert.equal(r.recomecou, false);
  assert.deepEqual(nomes(r), ['2.ts', '3.ts', '4.ts'], 'so os que nunca tinham vindo');
  assert.equal(r.playlist.segmentos.length, 23, 'de 2 a 24: nao perde o 22, o 23 e o 24');
  assert.deepEqual(nomes(novosSegmentos(r.playlist, leitura({ quantos: 20, primeiro: 6 }))), ['25.ts']);
  // E com a janela vista a deslizar desde o princípio, a atrasada não traz nada.
  const vista = novosSegmentos(leitura({ quantos: 20 }), a).playlist;          // 0..19 e depois 5..24
  const atrasada = novosSegmentos(vista, leitura({ quantos: 20, primeiro: 2 }));
  assert.deepEqual(atrasada.novos, []);
  assert.equal(atrasada.recomecou, false);
  assert.equal(atrasada.recuou, true);
});

test('faltar o primeiro segmento na leitura anterior nao faz da seguinte um recomeco', () => {
  const b = leitura({ quantos: 10 });
  const a = { ...b, segmentos: b.segmentos.slice(1, 9) };                     // 1..8
  const r = novosSegmentos(a, b);
  assert.equal(r.recomecou, false);
  assert.deepEqual(nomes(r), ['0.ts', '9.ts']);
});

test('com leituras atrasadas, buracos, um recomeco e uma janela que desliza, cada segmento e novo uma vez', () => {
  const S2 = T + 3_600_000;
  const b7 = leitura({ quantos: 7 });
  const guiao = [
    [leitura({ quantos: 3 }), false],
    [{ ...b7, segmentos: b7.segmentos.filter((_, i) => i !== 4) }, false],   // 0..6 sem o 4
    [leitura({ quantos: 5 }), false],                                       // atrasada, traz o 4
    [leitura({ quantos: 10 }), false],
    [{ segmentos: [] }, false],
    [leitura({ inicioMs: S2, quantos: 2 }), true],                          // recomeçou no mesmo caminho
    [leitura({ quantos: 10 }), false],                                      // cópia velha da de antes
    [leitura({ inicioMs: S2, quantos: 1 }), false],                         // atrasada da nova
    [leitura({ inicioMs: S2, quantos: 5 }), false],
    [leitura({ inicioMs: S2, quantos: 6, primeiro: 3 }), false],            // a janela desliza: 3..8
    [leitura({ inicioMs: S2, quantos: 6, primeiro: 1 }), false],            // atrasada da janela: 1..6
    [leitura({ inicioMs: S2, quantos: 6, primeiro: 6 }), false],            // 6..11
  ];
  let guardada = null;
  const vistos = [];
  for (const [i, [nova, recomeco]] of guiao.entries()) {
    const r = novosSegmentos(guardada, nova);
    assert.equal(r.recomecou, recomeco, `leitura ${i}`);
    vistos.push(...r.novos.map(nome));
    guardada = r.playlist;
  }
  const esperados = [
    ...Array.from({ length: 10 }, (_, i) => `${i}.ts@${T + i * 10_000}`),
    ...Array.from({ length: 12 }, (_, i) => `${i}.ts@${S2 + i * 10_000}`),
  ];
  assert.deepEqual([...vistos].sort(), [...esperados].sort());
  assert.equal(new Set(vistos).size, vistos.length, 'nenhum duas vezes');
});

// ── bordaAoVivo ────────────────────────────────────────────────────────────

/** Um canal ao vivo cujo último segmento acabou `atrasS` antes de `agora`. */
function canalAoVivo(slug, agora, atrasS, { durS = 10, quantos = 30 } = {}) {
  const fim = agora - Math.round(atrasS * 1000);
  const inicioMs = fim - quantos * durS * 1000;
  const playlist = leitura({ inicioMs, quantos, durS }, BASE.replace('/b/', `/${slug}/`));
  return linhaDoCanal(slug, [{ vod: { id: slug, duracaoMs: 0 }, playlist }]);
}

const AGORA = Date.parse('2026-10-06T21:00:00.000Z');

test('a borda e o fim do mais atrasado de quem esta no ar', () => {
  // Os extremos medidos em 06/10: 2,2 e 11,8 s atrás do relógio.
  const linhas = [
    canalAoVivo('danikongi', AGORA, 2.2),
    canalAoVivo('ciscoo', AGORA, 11.8),
    canalAoVivo('posty', AGORA, 6),
  ];
  const b = bordaAoVivo(linhas, { agoraMs: AGORA });
  assert.equal(b.comumMs, AGORA - 11_800);
  assert.equal(b.atrasoMs, 11_800);
  assert.equal(b.porCanal.get('danikongi'), AGORA - 2200);
  assert.equal(b.porCanal.get('ciscoo'), AGORA - 11_800);
  assert.equal(b.porCanal.size, 3);
  assert.deepEqual(b.vivos.sort(), ['ciscoo', 'danikongi', 'posty']);
  assert.deepEqual(b.foraDoAr, []);
  assert.equal(b.agoraMs, AGORA);
});

// Com 500 streamers há sempre alguém que caiu. Se esse prendesse a borda, o
// "ao vivo" do evento inteiro parava no último segmento dele.
test('quem saiu do ar ha mais de dois minutos nao prende a borda de todos', () => {
  const linhas = [
    canalAoVivo('a', AGORA, 3),
    canalAoVivo('b', AGORA, 8),
    canalAoVivo('caiu', AGORA, 600),
  ];
  const b = bordaAoVivo(linhas, { agoraMs: AGORA });
  assert.equal(b.comumMs, AGORA - 8000);
  assert.deepEqual(b.foraDoAr, ['caiu']);
  assert.equal(b.porCanal.get('caiu'), AGORA - 600_000, 'continua no mapa: a pagina desenha a barra dele');
});

test('o limite e "mais de" 120 s: 120 s em ponto ainda conta', () => {
  assert.equal(LIMITE_FORA_DO_AR_MS, 120_000);
  const no = bordaAoVivo([canalAoVivo('x', AGORA, 120)], { agoraMs: AGORA });
  assert.deepEqual(no.vivos, ['x']);
  assert.equal(no.atrasoMs, 120_000);
  const fora = bordaAoVivo([canalAoVivo('x', AGORA, 120.001)], { agoraMs: AGORA });
  assert.deepEqual(fora.foraDoAr, ['x']);
  assert.equal(fora.comumMs, null);
  // E o limite é configurável, para quem quiser ser mais rápido a largar.
  const curto = bordaAoVivo([canalAoVivo('x', AGORA, 30)], { agoraMs: AGORA, limiteMs: 20_000 });
  assert.deepEqual(curto.foraDoAr, ['x']);
});

test('ninguem no ar e "sem borda", nao um numero inventado', () => {
  for (const linhas of [[], null, undefined, [canalAoVivo('a', AGORA, 900)]]) {
    const b = bordaAoVivo(linhas, { agoraMs: AGORA });
    assert.equal(b.comumMs, null);
    assert.equal(b.atrasoMs, null);
    assert.deepEqual(b.vivos, []);
  }
});

test('um canal sem video nao entra em conta nenhuma', () => {
  const vazio = linhaDoCanal('semnada', []);
  assert.equal(vazio.fim, null);
  const b = bordaAoVivo([vazio, canalAoVivo('a', AGORA, 4)], { agoraMs: AGORA });
  assert.equal(b.comumMs, AGORA - 4000);
  assert.equal(b.porCanal.has('semnada'), false);
  assert.deepEqual(b.foraDoAr, []);
});

// Quem caiu e voltou tem duas peças na mesma noite. Conta a mais recente: a
// antiga acabou há dez minutos, mas o canal está no ar.
test('um canal que caiu e voltou conta pela transmissao nova', () => {
  const velha = leitura({ inicioMs: AGORA - 1_200_000, quantos: 60 });   // acabou há 10 min
  const nova = leitura({ inicioMs: AGORA - 125_000, quantos: 12 }, BASE.replace('/b/', '/c/')); // acabou há 5 s
  const linha = linhaDoCanal('voltou', [{ vod: { id: 1 }, playlist: velha }, { vod: { id: 2 }, playlist: nova }]);
  assert.equal(linha.buracos.length, 1);
  const b = bordaAoVivo([linha], { agoraMs: AGORA });
  assert.deepEqual(b.vivos, ['voltou']);
  assert.equal(b.comumMs, AGORA - 5000);
});

// O mesmo ajuste que `onde` aplica: +3 s quer dizer que no instante Q este
// canal mostra o que ele carimbou em Q + 3 s, por isso o vídeo dele acaba 3 s
// mais cedo no relógio de todos.
test('os ajustes de cada canal mexem na borda no sentido de onde()', () => {
  const linhas = [canalAoVivo('a', AGORA, 2), canalAoVivo('b', AGORA, 4)];
  const b = bordaAoVivo(linhas, { agoraMs: AGORA, nudges: { a: 3000 } });
  assert.equal(b.porCanal.get('a'), AGORA - 5000);
  assert.equal(b.comumMs, AGORA - 5000);
  assert.equal(b.atrasoMs, 5000);
  // Um ajuste negativo adianta a borda desse canal.
  const c = bordaAoVivo(linhas, { agoraMs: AGORA, nudges: { b: -1500 } });
  assert.equal(c.porCanal.get('b'), AGORA - 2500);
  assert.equal(c.comumMs, AGORA - 2500);
});

// Medido: -5,71 s (SINCRONIA.md, lautaarg00), e canais 2,2 s atrás do ar. No
// relógio partilhado o vídeo desse canal vai até 3,5 s DEPOIS do agora.
test('um ajuste negativo nao poe a borda no futuro nem o atraso abaixo de zero', () => {
  const so = bordaAoVivo([canalAoVivo('lautaarg00', AGORA, 2.2)], { agoraMs: AGORA, nudges: { lautaarg00: -5710 } });
  assert.equal(so.porCanal.get('lautaarg00'), AGORA + 3510, 'a barra do canal mostra o que ele tem');
  assert.equal(so.comumMs, AGORA, 'a borda nao passa do agora');
  assert.equal(so.atrasoMs, 0);
  assert.equal(so.agoraMs, AGORA);
  // Com outro canal mais atrás, a borda é a dele, e o teto não mexe em nada.
  const dois = bordaAoVivo([canalAoVivo('lautaarg00', AGORA, 2.2), canalAoVivo('b', AGORA, 11.8)],
    { agoraMs: AGORA, nudges: { lautaarg00: -5710 } });
  assert.equal(dois.comumMs, AGORA - 11_800);
  assert.equal(dois.atrasoMs, 11_800);
  // Um ajuste de -10 min mexido à mão no link não manda ninguém para fora do ar.
  const mexido = bordaAoVivo([canalAoVivo('a', AGORA, 3), canalAoVivo('b', AGORA, 5)],
    { agoraMs: AGORA, nudges: { a: -600_000 } });
  assert.deepEqual(mexido.vivos.sort(), ['a', 'b']);
  assert.equal(mexido.comumMs, AGORA - 5000);
  assert.ok(mexido.atrasoMs >= 0);
});

// Organizadores colam listas à mão: o mesmo streamer duas vezes acontece.
test('um slug repetido conta uma vez, pelo fim mais recente, seja qual for a ordem', () => {
  const x = canalAoVivo('x', AGORA, 3);
  const y = canalAoVivo('y', AGORA, 4);
  const xVelho = canalAoVivo('x', AGORA, 600);
  for (const linhas of [[x, y, xVelho], [xVelho, y, x], [y, xVelho, x]]) {
    const b = bordaAoVivo(linhas, { agoraMs: AGORA });
    assert.deepEqual([...b.vivos].sort(), ['x', 'y']);
    assert.deepEqual(b.foraDoAr, [], 'x esta no ar: nao pode estar nas duas listas');
    assert.equal(b.comumMs, AGORA - 4000);
    assert.equal(b.atrasoMs, 4000);
    assert.equal(b.porCanal.get('x'), AGORA - 3000);
    assert.equal(b.porCanal.size, 2);
    assert.deepEqual(b.repetidos, ['x'], 'dito pelo nome, para a pagina avisar');
  }
  assert.deepEqual(bordaAoVivo([x, y], { agoraMs: AGORA }).repetidos, []);
});

test('um ajuste que nao e numero (link mexido a mao) conta como zero', () => {
  const linhas = [canalAoVivo('a', AGORA, 2)];
  // '3000' entre aspas também: em `onde`, `quandoMs + '3000'` é texto colado.
  for (const mau of ['abc', '3000', null, {}, [5], true, NaN, Infinity]) {
    const b = bordaAoVivo(linhas, { agoraMs: AGORA, nudges: { a: mau } });
    assert.equal(b.comumMs, AGORA - 2000, `ajuste ${String(mau)}`);
  }
  assert.equal(bordaAoVivo(linhas, { agoraMs: AGORA, nudges: null }).comumMs, AGORA - 2000);
});

// Nenhum segmento acaba no futuro. Se um acaba depois do "agora" deste PC, o
// relógio do PC está atrasado — e o agora verdadeiro é pelo menos esse fim.
test('um computador com o relogio atrasado nao ve no ar quem ja saiu', () => {
  const verdade = AGORA;
  const linhas = [canalAoVivo('a', verdade, 3), canalAoVivo('saiu', verdade, 150)];
  const pcAtrasado = verdade - 60_000;
  const b = bordaAoVivo(linhas, { agoraMs: pcAtrasado });
  assert.deepEqual(b.foraDoAr, ['saiu'], 'sem a correccao, 90 s parecia dentro do limite');
  assert.equal(b.agoraMs, verdade - 3000, 'o agora usado e o fim mais recente');
  assert.equal(b.atrasoMs, 0);
  assert.ok(b.atrasoMs >= 0, 'nunca um atraso negativo');
});

test('a borda usa Date.now() quando nao lhe dao o agora', () => {
  const agora = Date.now();
  const b = bordaAoVivo([canalAoVivo('a', agora, 5)]);
  assert.deepEqual(b.vivos, ['a']);
  assert.ok(b.atrasoMs >= 5000 && b.atrasoMs < 65_000);
  // Um agora estragado não faz toda a gente parecer no ar.
  const velho = canalAoVivo('velho', agora, 900);
  for (const mau of [NaN, null, undefined, 'agora']) {
    const c = bordaAoVivo([velho], { agoraMs: mau });
    assert.deepEqual(c.foraDoAr, ['velho'], `agora ${String(mau)}`);
    assert.ok(Number.isFinite(c.agoraMs));
  }
});

// ── agendar ────────────────────────────────────────────────────────────────

/**
 * Um relógio que só anda quando alguém espera, e um travão: um ciclo que
 * nunca para fazia o teste ficar pendurado em vez de falhar.
 */
function relogioFalso() {
  const r = {
    t: 0,
    esperas: [],
    agora: () => r.t,
    esperar: async (ms) => {
      if (r.esperas.length > 5000) throw new Error('o ciclo nao parou');
      assert.ok(ms > 0, `espera de ${ms} ms`);
      r.esperas.push(ms);
      r.t += ms;
    },
  };
  return r;
}

test('chama logo, e depois a cada intervalo', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  const fim = await agendar({
    atualizar: async () => { quando.push(r.t); if (quando.length === 4) ctl.abort(); },
    intervaloMs: 10_000, visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 10_000, 20_000, 30_000]);
  assert.deepEqual(fim, { voltas: 4, erros: 0 });
  assert.equal(INTERVALO_MS, 10_000);
});

test('o intervalo conta do inicio da volta, nao do fim', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  await agendar({
    atualizar: async () => { quando.push(r.t); r.t += 3000; if (quando.length === 3) ctl.abort(); },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 10_000, 20_000], 'e nao 0, 13 000, 26 000');
  assert.deepEqual(r.esperas, [7000, 7000]);
});

test('uma volta mais lenta do que o intervalo encadeia, sem nunca sobrepor', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  let aCorrer = 0;
  let maximo = 0;
  await agendar({
    atualizar: async () => {
      aCorrer++; maximo = Math.max(maximo, aCorrer);
      quando.push(r.t);
      await new Promise((ok) => setImmediate(ok));
      r.t += 35_000;                        // 500 listas: medido entre 20 e 40 s
      aCorrer--;
      if (quando.length === 3) ctl.abort();
    },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 35_000, 70_000]);
  assert.equal(maximo, 1);
  assert.deepEqual(r.esperas, []);
});

test('depois de um erro a espera dobra ate 60 s, e um sucesso volta ao normal', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  const avisos = [];
  // Falha 5 vezes, acerta uma, falha outra, acerta e pára.
  const guiao = [false, false, false, false, false, true, false, true];
  await agendar({
    atualizar: async () => {
      const i = quando.length;
      quando.push(r.t);
      if (i === guiao.length - 1) ctl.abort();
      if (!guiao[i]) throw new Error(`429 numero ${i}`);
    },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
    aoErro: (e, info) => avisos.push({ msg: e.message, ...info }),
  });
  const intervalos = quando.slice(1).map((t, i) => t - quando[i]);
  assert.deepEqual(intervalos, [20_000, 40_000, 60_000, 60_000, 60_000, 10_000, 20_000]);
  assert.equal(TETO_MS, 60_000);
  assert.deepEqual(avisos.map((a) => a.esperaMs), [20_000, 40_000, 60_000, 60_000, 60_000, 20_000]);
  assert.deepEqual(avisos.map((a) => a.seguidos), [1, 2, 3, 4, 5, 1]);
  assert.equal(avisos[0].msg, '429 numero 0');
});

test('a espera de um erro conta do fim da volta que falhou', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  await agendar({
    atualizar: async () => {
      quando.push(r.t);
      if (quando.length === 2) { ctl.abort(); return; }
      r.t += 30_000;                        // falhou por demorar
      throw new Error('tempo esgotado');
    },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 50_000], '30 s de volta mais 20 s de folga');
});

test('um intervalo maior do que o teto nao encolhe depois de um erro', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  await agendar({
    atualizar: async () => { quando.push(r.t); if (quando.length === 3) ctl.abort(); throw new Error('x'); },
    intervaloMs: 90_000, visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 90_000, 180_000]);
});

test('com o separador escondido nao pede nada, e ao voltar pede logo', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  // Visível até aos 25 s, escondido até aos 95 s, visível depois.
  const mudancas = [25_000, 95_000];
  const visivel = () => r.t < mudancas[0] || r.t >= mudancas[1];
  // Como `dormir`: acorda na mudança de visibilidade, e não só no fim do
  // tempo. Sem isto o teste aceitava uma volta 5 s depois do regresso.
  const esperar = async (ms) => {
    const acorda = mudancas.find((m) => m > r.t && m < r.t + ms);
    await r.esperar((acorda ?? r.t + ms) - r.t);
  };
  await agendar({
    atualizar: async () => { quando.push(r.t); if (quando.length === 5) ctl.abort(); },
    visivel, esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 10_000, 20_000, 95_000, 105_000], 'no instante em que volta, nao 5 s depois');
});

test('escondida desde o inicio nao chama nada ate ficar visivel', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  let chamadas = 0;
  let vezes = 0;
  const fim = await agendar({
    atualizar: async () => { chamadas++; },
    visivel: () => { if (++vezes === 6) ctl.abort(); return false; },
    esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.equal(chamadas, 0);
  assert.deepEqual(fim, { voltas: 0, erros: 0 });
});

// Voltar ao separador a meio da espera de um erro não pode ser uma maneira de
// a saltar — alt-tab não pode virar martelo contra a Kick.
test('voltar ao separador nao salta a espera de um erro', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  const esperar = async (ms) => {
    // O temporizador por omissão acorda na mudança de visibilidade: aqui
    // acorda sempre a meio, como se o separador mudasse a cada 5 s.
    const dormido = Math.min(ms, 5000);
    await r.esperar(dormido);
  };
  await agendar({
    atualizar: async () => { quando.push(r.t); if (quando.length === 2) ctl.abort(); else throw new Error('429'); },
    visivel: () => true, esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(quando, [0, 20_000]);
});

test('cancelar a meio de uma volta acaba o ciclo sem contar um erro', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const avisos = [];
  let chamadas = 0;
  const fim = await agendar({
    atualizar: async ({ sinal }) => {
      chamadas++;
      if (chamadas === 2) {
        ctl.abort();
        // O que um fetch faz quando o sinal que levou é cancelado.
        assert.equal(sinal, ctl.signal, 'atualizar recebe o sinal para o passar ao fetch');
        throw new DOMException('cancelado', 'AbortError');
      }
    },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
    aoErro: (e) => avisos.push(e),
  });
  assert.equal(chamadas, 2);
  assert.deepEqual(avisos, []);
  assert.deepEqual(fim, { voltas: 1, erros: 0 });
});

test('um AbortError que nao vem do nosso sinal e uma falha como outra', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const avisos = [];
  await agendar({
    atualizar: async () => {
      if (avisos.length) { ctl.abort(); return; }
      throw new DOMException('o pedido levou demasiado tempo', 'AbortError');
    },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
    aoErro: (e, info) => avisos.push(info.esperaMs),
  });
  assert.deepEqual(avisos, [20_000]);
});

test('cancelar durante a espera acaba o ciclo', async () => {
  const ctl = new AbortController();
  let chamadas = 0;
  let t = 0;
  const fim = await agendar({
    atualizar: async () => { chamadas++; },
    visivel: () => true,
    agora: () => t,
    esperar: async (ms, { sinal }) => {
      assert.equal(sinal, ctl.signal, 'a espera recebe o sinal para acordar com ele');
      t += ms / 2;
      ctl.abort();
    },
    sinal: ctl.signal,
  });
  assert.equal(chamadas, 1);
  assert.deepEqual(fim, { voltas: 1, erros: 0 });
});

test('um sinal ja cancelado nao chama nada', async () => {
  const ctl = new AbortController();
  ctl.abort();
  let chamadas = 0;
  const fim = await agendar({
    atualizar: async () => { chamadas++; }, visivel: () => true,
    esperar: async () => { throw new Error('nao devia esperar'); }, sinal: ctl.signal,
  });
  assert.equal(chamadas, 0);
  assert.deepEqual(fim, { voltas: 0, erros: 0 });
});

test('um aviso de erro que rebenta nao para o relogio', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  let chamadas = 0;
  await agendar({
    atualizar: async () => { if (++chamadas === 3) ctl.abort(); throw new Error('x'); },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
    aoErro: () => { throw new Error('o ecra partiu'); },
  });
  assert.equal(chamadas, 3);
});

test('um aviso de erro assincrono que rejeita nao fica solto', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const soltas = [];
  const ouvir = (e) => soltas.push(e);
  process.on('unhandledRejection', ouvir);
  let chamadas = 0;
  try {
    const fim = await agendar({
      atualizar: async () => { if (++chamadas === 3) ctl.abort(); throw new Error('x'); },
      visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
      aoErro: async () => { throw new Error('o ecra partiu, depois'); },
    });
    assert.deepEqual(fim, { voltas: 2, erros: 2 });
    await new Promise((ok) => setTimeout(ok, 20));
  } finally {
    process.off('unhandledRejection', ouvir);
  }
  assert.deepEqual(soltas.map((e) => e.message), [], 'no node, uma rejeicao solta derruba o processo');
});

// O `visivel` vem de quem chama. Se rebentar, não se sabe se a página está à
// vista: pede-se como se estivesse (o ritmo continua a ser o do intervalo), e
// o erro vai para o ecrã em vez de parar o ao vivo de vez.
test('um visivel que rebenta nao para o ao vivo, e o erro e dito', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  const quando = [];
  const avisos = [];
  let vezes = 0;
  const fim = await agendar({
    atualizar: async () => { quando.push(r.t); if (quando.length === 3) ctl.abort(); },
    visivel: () => { if (++vezes === 2) throw new Error('documento foi-se'); return true; },
    esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
    aoErro: (e, info) => avisos.push({ msg: e.message, ...info }),
  });
  assert.deepEqual(quando, [0, 10_000, 20_000]);
  assert.deepEqual(fim, { voltas: 3, erros: 0 }, 'a volta correu: nao e um erro da Kick');
  assert.deepEqual(avisos, [{ msg: 'documento foi-se', esperaMs: 0, seguidos: 0, de: 'visivel' }]);
});

// O temporizador é a peça que impede o ciclo sem pausa. Partido, não há
// maneira segura de continuar: pára alto, como uma configuração errada.
test('um esperar que rebenta para o ciclo alto, sem pedir mais nada', async () => {
  const ctl = new AbortController();
  let chamadas = 0;
  let t = 0;
  await assert.rejects(agendar({
    atualizar: async () => { if (++chamadas === 5) ctl.abort(); },
    visivel: () => true, agora: () => t, sinal: ctl.signal,
    esperar: async () => { throw new Error('sem temporizador'); },
  }), /sem temporizador/);
  assert.equal(chamadas, 1);
});

test('um relogio que nao da numeros para tudo alto, em vez de pedir sem pausa', async () => {
  for (const mau of [NaN, undefined, null, 'agora', Infinity]) {
    // Com travão: se a validação faltasse, isto era o ciclo sem pausa, e o
    // teste tem de FALHAR, não ficar pendurado.
    const ctl = new AbortController();
    let chamadas = 0;
    await assert.rejects(agendar({
      atualizar: async () => { if (++chamadas === 3) ctl.abort(); },
      visivel: () => true, agora: () => mau, sinal: ctl.signal,
      esperar: async () => {},
    }), RangeError, `relogio ${String(mau)}`);
    assert.equal(chamadas, 0, 'nem chegou a pedir');
  }
  // E um que se estraga a meio: pára na volta seguinte, sem martelar.
  const ctl = new AbortController();
  let chamadas = 0;
  let leituras = 0;
  let t = 0;
  await assert.rejects(agendar({
    atualizar: async () => { if (++chamadas === 50) ctl.abort(); },
    visivel: () => true, sinal: ctl.signal,
    agora: () => (++leituras > 3 ? NaN : t),
    esperar: async (ms) => { t += ms; },
  }), RangeError);
  assert.ok(chamadas <= 2, `chamou ${chamadas} vezes`);
});

test('um erro sincrono em atualizar tambem e apanhado', async () => {
  const r = relogioFalso();
  const ctl = new AbortController();
  let chamadas = 0;
  const fim = await agendar({
    atualizar: () => { if (++chamadas === 2) ctl.abort(); else throw new Error('sincrono'); },
    visivel: () => true, esperar: r.esperar, agora: r.agora, sinal: ctl.signal,
  });
  assert.deepEqual(fim, { voltas: 2, erros: 1 });
});

test('configuracao errada parte alto, antes de pedir o que quer que seja', async () => {
  await assert.rejects(agendar({}), TypeError);
  await assert.rejects(agendar(), TypeError);
  for (const mau of [0, -1, NaN, Infinity, '10000']) {
    // Com travão: se a validação faltasse, isto era um ciclo sem pausa, e o
    // teste tem de FALHAR (resolve em vez de rejeitar), não ficar pendurado.
    const ctl = new AbortController();
    let chamadas = 0;
    await assert.rejects(agendar({
      atualizar: async () => { if (++chamadas === 3) ctl.abort(); },
      intervaloMs: mau, visivel: () => true, sinal: ctl.signal,
    }), RangeError, `intervalo ${mau}`);
    assert.equal(chamadas, 0, 'e nao chegou a pedir nada');
  }
  // O teto também: um NaN ali desligava a espera depois de um erro, e cada
  // 429 era seguido de outro pedido 10 s depois, para sempre.
  for (const mau of [NaN, 0, -1, Infinity, '60000', null]) {
    const ctl = new AbortController();
    let chamadas = 0;
    let t = 0;
    await assert.rejects(agendar({
      atualizar: async () => { if (++chamadas === 3) ctl.abort(); throw new Error('429'); },
      tetoMs: mau, visivel: () => true, sinal: ctl.signal,
      agora: () => t, esperar: async (ms) => { t += ms; },
    }), RangeError, `teto ${String(mau)}`);
    assert.equal(chamadas, 0);
  }
});

// ── os valores por omissão, com temporizadores de verdade (milissegundos) ──
//
// Esperas curtas e um travão em cada teste: se uma regra se partir, o teste
// tem de FALHAR em segundos, e não ficar pendurado num minuto de espera.

/** Cancela `ctl` ao fim de `ms`, e devolve como desligar o travão. */
function travao(ctl, ms = 1500) {
  const t = setTimeout(() => ctl.abort(), ms);
  return () => clearTimeout(t);
}

test('dormir acorda no fim do tempo', async () => {
  const t0 = performance.now();
  await dormir(15, { doc: null });
  assert.ok(performance.now() - t0 >= 10);
});

test('dormir acorda logo quando cancelado, e nem adormece se ja estava', async () => {
  const ctl = new AbortController();
  const t0 = performance.now();
  const p = dormir(3000, { sinal: ctl.signal, doc: null });
  setTimeout(() => ctl.abort(), 5);
  await p;
  assert.ok(performance.now() - t0 < 1000, 'acordou com o cancelamento, nao com o tempo');
  const t1 = performance.now();
  await dormir(3000, { sinal: ctl.signal, doc: null });
  assert.ok(performance.now() - t1 < 1000);
});

test('dormir acorda quando o separador muda de visibilidade, e larga os ouvintes', async () => {
  const doc = new EventTarget();
  let ouvintes = 0;
  const add = doc.addEventListener.bind(doc);
  const rem = doc.removeEventListener.bind(doc);
  doc.addEventListener = (...a) => { ouvintes++; add(...a); };
  doc.removeEventListener = (...a) => { ouvintes--; rem(...a); };
  const t0 = performance.now();
  const p = dormir(3000, { doc });
  setTimeout(() => doc.dispatchEvent(new Event('visibilitychange')), 5);
  await p;
  assert.ok(performance.now() - t0 < 1000, 'acordou com a mudanca, nao com o tempo');
  assert.equal(ouvintes, 0, 'nada fica pendurado no documento');
});

test('sem document (um worker, o node) a pagina conta como visivel', async () => {
  assert.equal(globalThis.document, undefined);
  const ctl = new AbortController();
  const largar = travao(ctl);
  let chamadas = 0;
  try {
    await agendar({
      atualizar: async () => { chamadas++; ctl.abort(); },
      intervaloMs: 5, sinal: ctl.signal,
    });
  } finally { largar(); }
  assert.equal(chamadas, 1);
});

test('com um document escondido o valor por omissao nao pede nada', async () => {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  globalThis.document = doc;
  const ctl = new AbortController();
  const largar = travao(ctl);
  try {
    let chamadas = 0;
    const p = agendar({ atualizar: async () => { chamadas++; ctl.abort(); }, intervaloMs: 60_000, sinal: ctl.signal });
    // Escondido: espera. Ao ficar visível, o temporizador por omissão acorda
    // na mudança de visibilidade e a volta acontece sem esperar o minuto.
    await new Promise((ok) => setTimeout(ok, 10));
    assert.equal(chamadas, 0);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await p;
    assert.equal(chamadas, 1);
  } finally {
    largar();
    delete globalThis.document;
  }
});

test('os valores por omissao seguem o relogio de verdade', async () => {
  const ctl = new AbortController();
  const largar = travao(ctl);
  const quando = [];
  try {
    await agendar({
      atualizar: async () => { quando.push(performance.now()); if (quando.length === 3) ctl.abort(); },
      intervaloMs: 15, visivel: () => true, sinal: ctl.signal,
    });
  } finally { largar(); }
  assert.equal(quando.length, 3);
  assert.ok(quando[2] - quando[0] >= 25, `duas esperas de 15 ms, mediu ${quando[2] - quando[0]}`);
});
