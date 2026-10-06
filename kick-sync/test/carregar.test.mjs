// Carregar os ~500 canais de um evento sem a Kick nos fechar a porta, e achar
// quem está ao vivo.
//
// Nenhum destes testes toca na rede: a `buscar` é sempre uma Kick falsa, e as
// esperas de 1, 2 e 4 s são registadas em vez de dormidas. A forma das
// respostas ao vivo foi copiada de uma resposta real (06/10/2026), aparada ao
// que interessa — incluindo o `slug` da emissão, que é a armadilha.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarCanais, procurarAoVivo } from '../site/carregar.js';

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const resposta = (status, corpo, { ilegivel = false } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => { if (ilegivel) throw new SyntaxError('Unexpected end of JSON input'); return corpo; },
});
const UM_VOD = [{ id: 1, source: 'https://x/master.m3u8', start_time: '2026-10-06 07:29:00', video: {} }];

/**
 * Uma Kick falsa para a lista de VODs, que CONTA o que lhe fazem.
 *
 * `roteiro[slug]` diz o que responder a cada chamada a esse canal, por ordem
 * (200 por defeito). `cortes` guarda quantas chamadas já tinham saído quando
 * cada 429 foi devolvido — é o que permite olhar só para os pedidos que
 * saíram DEPOIS de um aviso.
 */
function kickFalsa({ roteiro = {}, demora = () => 2 } = {}) {
  const k = { emVoo: 0, maxEmVoo: 0, chamadas: [], porCanal: new Map(), cortes: [] };
  k.buscar = async (url, op = {}) => {
    const m = String(url).match(/^https:\/\/kick\.com\/api\/v2\/channels\/([^/]+)\/videos$/);
    assert.ok(m, `endereço inesperado: ${url}`);
    const slug = decodeURIComponent(m[1]);
    const n = (k.porCanal.get(slug) || 0) + 1;
    k.porCanal.set(slug, n);
    k.emVoo++;
    k.maxEmVoo = Math.max(k.maxEmVoo, k.emVoo);
    k.chamadas.push({ slug, n, emVoo: k.emVoo, op });
    try {
      await dormir(demora(slug, n));
      const passo = (roteiro[slug] || [])[n - 1] ?? 200;
      if (passo === 'rede') throw new TypeError('Failed to fetch');
      if (passo === 'vazio') return resposta(200, []);
      if (passo === 'ilegivel') return resposta(200, null, { ilegivel: true });
      if (passo === 429) k.cortes.push(k.chamadas.length);
      return resposta(passo, passo === 200 ? UM_VOD : { message: 'x' });
    } finally {
      k.emVoo--;
    }
  };
  /** O máximo de pedidos no ar entre os que saíram depois da chamada `i`. */
  k.maxDepois = (i) => Math.max(0, ...k.chamadas.slice(i).map((c) => c.emVoo));
  return k;
}

const nomes = (n, p = 'c') => Array.from({ length: n }, (_, i) => `${p}${String(i).padStart(2, '0')}`);
const semEspera = () => { const e = []; const f = async (ms) => { e.push(ms); }; f.esperas = e; return f; };

// ── carregarCanais: ordem, paralelo, repetidos ─────────────────────────────

test('devolve na mesma ordem em que pediu, mesmo quando as respostas chegam por outra', async () => {
  const lista = nomes(12);
  // O primeiro demora mais e o último menos: acabam ao contrário.
  const k = kickFalsa({ demora: (slug) => 30 - Number(slug.slice(1)) * 2 });
  const r = await carregarCanais(lista, { buscar: k.buscar, paralelos: 12, esperar: semEspera() });
  assert.deepEqual(r.map((x) => x.slug), lista);
  assert.ok(r.every((x) => x.estado === 'ok'));
  // É exactamente o objecto de vodsDoCanal, com o start_time lido como UTC.
  assert.equal(r[0].vods[0].inicioApi, Date.UTC(2026, 9, 6, 7, 29, 0));
});

test('nunca tem mais do que `paralelos` pedidos no ar, e chega mesmo a usá-los', async () => {
  for (const paralelos of [1, 3, 8]) {
    const k = kickFalsa({ demora: (slug) => 1 + (Number(slug.slice(1)) % 4) });
    await carregarCanais(nomes(40), { buscar: k.buscar, paralelos, esperar: semEspera() });
    assert.equal(k.maxEmVoo, paralelos, `com ${paralelos}: chegou a ${k.maxEmVoo}`);
    assert.equal(k.chamadas.length, 40);
  }
});

test('por defeito são 8 de cada vez (o que foi medido sem bloqueio)', async () => {
  const k = kickFalsa();
  await carregarCanais(nomes(30), { buscar: k.buscar, esperar: semEspera() });
  assert.equal(k.maxEmVoo, 8);
});

test('um canal repetido carrega uma vez e todas as posições recebem o mesmo resultado', async () => {
  const k = kickFalsa();
  const progresso = [];
  const r = await carregarCanais(['Tchubi', '@tchubi', 'kodd', '  TCHUBI '], {
    buscar: k.buscar, esperar: semEspera(), aoProgredir: (p) => progresso.push(p),
  });
  assert.equal(k.chamadas.length, 2);
  assert.deepEqual([...k.porCanal.keys()].sort(), ['kodd', 'tchubi']);
  assert.equal(r.length, 4);
  assert.equal(r[0], r[1]);
  assert.equal(r[0], r[3]);
  assert.equal(r[2].slug, 'kodd');
  // A barra conta canais distintos, senão nunca chegava ao fim.
  assert.deepEqual(progresso.map((p) => [p.feitos, p.total]), [[1, 2], [2, 2]]);
});

test('uma lista vazia devolve vazio sem pedir nada', async () => {
  const k = kickFalsa();
  assert.deepEqual(await carregarCanais([], { buscar: k.buscar }), []);
  assert.deepEqual(await carregarCanais(new Set(), { buscar: k.buscar }), []);
  assert.equal(k.chamadas.length, 0);
});

test('aceita qualquer iterável, e um nome inválido não chega à rede', async () => {
  const k = kickFalsa();
  const r = await carregarCanais(new Set(['tchubi', 'NOME COM ESPAÇO']), { buscar: k.buscar, esperar: semEspera() });
  assert.deepEqual(r.map((x) => x.estado), ['ok', 'nome-invalido']);
  assert.equal(k.chamadas.length, 1);
});

test('erros de quem chama dizem-se logo, em vez de pendurar ou partir o texto em letras', async () => {
  const k = kickFalsa();
  await assert.rejects(carregarCanais('tchubi\nkodd', { buscar: k.buscar }), TypeError);
  await assert.rejects(carregarCanais(undefined, { buscar: k.buscar }), TypeError);
  await assert.rejects(carregarCanais(42, { buscar: k.buscar }), TypeError);
  for (const paralelos of [0, -1, 2.5, NaN, Infinity, '8']) {
    await assert.rejects(carregarCanais(['a'], { buscar: k.buscar, paralelos }), RangeError, `paralelos ${paralelos}`);
  }
  for (const tentativas of [-1, 1.5, '3']) {
    await assert.rejects(carregarCanais(['a'], { buscar: k.buscar, tentativas }), RangeError, `tentativas ${tentativas}`);
  }
  assert.equal(k.chamadas.length, 0);
});

// ── carregarCanais: voltar a tentar ─────────────────────────────────────────

test('volta a pedir o que é transitório, à espera de 1 s e depois 2 s', async () => {
  for (const [roteiro, chamadas, esperas] of [
    [[429, 'rede', 200], 3, [1000, 2000]],
    [[503, 200], 2, [1000]],
    [['rede', 200], 2, [1000]],
  ]) {
    const k = kickFalsa({ roteiro: { a: roteiro } });
    const esperar = semEspera();
    const r = await carregarCanais(['a'], { buscar: k.buscar, esperar });
    assert.equal(r[0].estado, 'ok', JSON.stringify(roteiro));
    assert.equal(k.porCanal.get('a'), chamadas);
    assert.deepEqual(esperar.esperas, esperas);
  }
});

test('e desiste ao fim de `tentativas`, devolvendo o último estado tal como veio', async () => {
  for (const [roteiro, estado] of [
    [[500, 500, 500, 500, 200], 'http-500'],
    [Array(9).fill('rede'), 'sem-rede'],
    [Array(9).fill(429), 'rate-limit'],
  ]) {
    const k = kickFalsa({ roteiro: { a: roteiro } });
    const esperar = semEspera();
    const r = await carregarCanais(['a'], { buscar: k.buscar, esperar });
    assert.equal(r[0].estado, estado);
    // 1 + 3 tentativas, e nem mais uma: no primeiro caso a 5.ª dava 200 e
    // não foi pedida.
    assert.equal(k.porCanal.get('a'), 4, estado);
    assert.deepEqual(esperar.esperas, [1000, 2000, 4000]);
    if (estado === 'sem-rede') assert.match(r[0].erro, /Failed to fetch/);
  }
});

test('um canal à espera depois de um erro do servidor não segura o lugar dos outros', async () => {
  // Um 503 é desse canal; um 429 é a Kick a pedir calma a todos, e esse
  // segura (ver o teste da pausa, mais abaixo).
  const k = kickFalsa({ roteiro: { a: [503, 200] }, demora: () => 1 });
  const r = await carregarCanais(['a', 'b', 'c'], { buscar: k.buscar, paralelos: 1, esperar: () => dormir(25) });
  assert.deepEqual(r.map((x) => x.estado), ['ok', 'ok', 'ok']);
  // b e c passam enquanto a espera; a volta depois, sem ter bloqueado ninguém.
  assert.deepEqual(k.chamadas.map((c) => `${c.slug}${c.n}`), ['a1', 'b1', 'c1', 'a2']);
});

test('quem volta a tentar passa à frente da fila', async () => {
  const k = kickFalsa({ roteiro: { c00: [503, 200] }, demora: () => 3 });
  await carregarCanais(nomes(10), { buscar: k.buscar, paralelos: 1, esperar: async () => {} });
  // A espera acabou enquanto c01 estava no ar; o lugar seguinte é dele, não do c02.
  assert.deepEqual(k.chamadas.slice(0, 4).map((c) => `${c.slug}#${c.n}`), ['c00#1', 'c01#1', 'c00#2', 'c02#1']);
});

test('`tentativas` diz quantas vezes se VOLTA a pedir: 0 é nenhuma, 1 é uma', async () => {
  for (const [tentativas, chamadas] of [[0, 1], [1, 2]]) {
    const k = kickFalsa({ roteiro: { a: Array(9).fill(502) } });
    const r = await carregarCanais(['a'], { buscar: k.buscar, tentativas, esperar: semEspera() });
    assert.equal(r[0].estado, 'http-502');
    assert.equal(k.porCanal.get('a'), chamadas);
  }
});

test('o que não é transitório não se volta a pedir', async () => {
  const k = kickFalsa({ roteiro: { naoexiste: [404], vazio: ['vazio'], proibido: [403], torto: ['ilegivel'] } });
  const esperar = semEspera();
  const r = await carregarCanais(['naoexiste', 'vazio', 'proibido', 'torto'], { buscar: k.buscar, esperar });
  assert.deepEqual(r.map((x) => x.estado), ['canal-nao-existe', 'sem-vods', 'http-403', 'resposta-ilegivel']);
  assert.deepEqual([...k.porCanal.values()], [1, 1, 1, 1]);
  assert.deepEqual(esperar.esperas, []);
});

// ── carregarCanais: abrandar quando a Kick pede calma ───────────────────────

test('depois de um 429 o limite passa a metade até ao fim da carga', async () => {
  const k = kickFalsa({ roteiro: { c02: [429] } });
  const progresso = [];
  await carregarCanais(nomes(40), {
    buscar: k.buscar, paralelos: 8, esperar: semEspera(), aoProgredir: (p) => progresso.push(p),
  });
  assert.equal(k.maxDepois(0), 8, 'antes do aviso usava os 8');
  assert.equal(k.cortes.length, 1);
  assert.equal(k.maxDepois(k.cortes[0]), 4, 'depois do aviso, nunca mais de 4 — e chega aos 4');
  assert.equal(progresso.at(-1).paralelos, 4);
  assert.equal(k.chamadas.length, 41, 'o canal do 429 foi pedido outra vez');
});

test('uma vaga de 429 conta como um aviso só, não como oito', async () => {
  // Os oito primeiros pedidos voltam TODOS com 429: é o mesmo momento de
  // aperto, e cortar oito vezes atirava o limite para o piso logo ali.
  const roteiro = Object.fromEntries(nomes(8).map((s) => [s, [429]]));
  const k = kickFalsa({ roteiro });
  const progresso = [];
  const r = await carregarCanais(nomes(30), {
    buscar: k.buscar, paralelos: 8, esperar: semEspera(), aoProgredir: (p) => progresso.push(p),
  });
  assert.ok(r.every((x) => x.estado === 'ok'));
  assert.equal(progresso.at(-1).paralelos, 4);
  assert.equal(k.maxDepois(k.cortes[0]), 4);
});

test('um 429 que já saiu com o limite novo corta outra vez, mas nunca abaixo de 2', async () => {
  // c02 cai na primeira vaga; c20, c40 e c50 só saem muito depois, já com o
  // limite cortado — esses dizem que a metade ainda não chegou.
  const k = kickFalsa({ roteiro: { c02: [429], c20: [429], c40: [429], c50: [429] } });
  const progresso = [];
  await carregarCanais(nomes(60), {
    buscar: k.buscar, paralelos: 8, esperar: semEspera(), aoProgredir: (p) => progresso.push(p),
  });
  assert.equal(k.cortes.length, 4);
  assert.equal(k.maxDepois(k.cortes[0]), 4);
  assert.equal(k.maxDepois(k.cortes[1]), 2);
  assert.equal(k.maxDepois(k.cortes[3]), 2, 'o piso é 2');
  assert.equal(progresso.at(-1).paralelos, 2);
  // O valor visto pela página desce por degraus e nunca sobe.
  const vistos = progresso.map((p) => p.paralelos);
  assert.deepEqual([...new Set(vistos)], [8, 4, 2]);
  assert.ok(vistos.every((v, i) => i === 0 || v <= vistos[i - 1]));
});

test('depois de um 429 não sai nenhum pedido enquanto o canal espera: a pausa é de todos', async () => {
  // Antes, o lugar do canal castigado ia logo para outro: depois de um 429 o
  // ritmo só caía para metade e nunca parava, justamente quando a Kick pedia
  // menos.
  const k = kickFalsa({ roteiro: { c03: [429, 200] }, demora: () => 1 });
  const durante = [];
  let inicioDaPausa;
  const esperar = async () => {
    const antes = k.chamadas.length;
    inicioDaPausa = antes;
    await dormir(30);
    durante.push(k.chamadas.length - antes);
  };
  const r = await carregarCanais(nomes(20), { buscar: k.buscar, paralelos: 4, esperar });
  assert.ok(r.every((x) => x.estado === 'ok'));
  assert.deepEqual(durante, [0], 'nos 30 ms de espera não saiu nenhum');
  // E quem volta é o castigado, à frente dos que ainda não foram. Conta-se a
  // partir do começo da pausa e não do momento em que a Kick falsa deu o 429:
  // entre os dois, a resposta 200 de outro canal ainda pode estar a ser lida
  // e libertar o lugar dela, e isso não é a pausa a falhar.
  const depois = k.chamadas.findIndex((c) => c.slug === 'c03' && c.n === 2);
  assert.equal(depois, inicioDaPausa);
});

test('com a Kick a recusar tudo, desiste sem gastar as tentativas de todos', async () => {
  // A sonda do revisor: 100 canais, todos 429. Antes eram 400 pedidos a ritmo
  // constante. Quando um canal sobe a escada toda (1, 2 e 4 s) e nesse tempo
  // ninguém teve outra resposta, só ele pergunta mais, depois de 15, 30 e
  // 60 s. Só se ainda for 429 o resto fica 'rate-limit' sem se pedir.
  //
  // (Este teste dizia antes que ninguém esperava mais de 4 s: desistir ao fim
  // da escada era a regressão que o teste seguinte apanha. Agora diz que a
  // sonda espera, e que mesmo assim os pedidos ficam poucos.)
  const roteiro = Object.fromEntries(nomes(100).map((s) => [s, Array(9).fill(429)]));
  const k = kickFalsa({ roteiro });
  const progresso = [];
  const esperar = semEspera();
  const r = await carregarCanais(nomes(100), { buscar: k.buscar, esperar, aoProgredir: (p) => progresso.push(p) });
  assert.ok(r.every((x) => x.estado === 'rate-limit'));
  assert.deepEqual(r.map((x) => x.slug), nomes(100));
  assert.ok(k.chamadas.length <= 24, `saíram ${k.chamadas.length}`);
  assert.equal(progresso.at(-1).feitos, 100, 'a barra chega ao fim');
  assert.deepEqual(esperar.esperas.filter((ms) => ms > 4000), [15000, 30000, 60000], 'uma sonda só');
});

test('uma janela de 429 de 12 s ou de 30 s passa, e a carga de 500 acaba toda', async () => {
  // A sonda do revisor: desistir ao fim da escada de um canal (7 s) deixava
  // os 500 em 'rate-limit' com 17 pedidos, e antes a mesma carga recompunha-se
  // quando a janela acabava. O relógio é falso: cada espera avança-o.
  for (const fechadaAte of [12000, 30000]) {
    let agora = 0;
    let pedidos = 0;
    const buscar = async () => {
      pedidos++;
      await dormir(0);
      return agora < fechadaAte ? resposta(429, { message: 'x' }) : resposta(200, UM_VOD);
    };
    const esperar = async (ms) => { agora += ms; await dormir(0); };
    const r = await carregarCanais(nomes(500), { buscar, esperar });
    const ok = r.filter((x) => x.estado === 'ok').length;
    assert.equal(ok, 500, `fechada até ${fechadaAte} ms: ${ok} ok`);
    assert.ok(pedidos <= 540, `fechada até ${fechadaAte} ms: ${pedidos} pedidos`);
  }
});

test('um canal que leva 429 sozinho não dá a Kick por fechada', async () => {
  // Com 1 de cada vez, a pausa do c00 não deixa mais ninguém perguntar: só um
  // canal recusado não prova nada sobre os outros.
  const k = kickFalsa({ roteiro: { c00: Array(9).fill(429) } });
  const r = await carregarCanais(nomes(6), { buscar: k.buscar, paralelos: 1, esperar: semEspera() });
  assert.deepEqual(r.map((x) => x.estado), ['rate-limit', 'ok', 'ok', 'ok', 'ok', 'ok']);
  assert.equal(k.porCanal.get('c00'), 4);
  assert.equal(k.chamadas.length, 9);
});

test('um 429 atrasado de um pedido que saiu antes do corte não corta outra vez, mas pára os outros', async () => {
  // O c00 sai com o limite de 8 e só volta depois de o c01 ter cortado para 4
  // e de muitos pedidos com o limite novo terem passado. Esse 429 é notícia
  // velha sobre os 8 (o que veio depois diz que os 4 aguentam): não corta. Mas
  // a pausa vale para ele como para qualquer outro.
  const k = kickFalsa({ roteiro: { c00: [429, 200], c01: [429, 200] }, demora: (slug, n) => (slug === 'c00' && n === 1 ? 40 : 1) });
  const progresso = [];
  const durante = [];
  const esperar = async () => {
    const antes = k.chamadas.length;
    await dormir(10);
    durante.push(k.chamadas.length - antes);
  };
  const r = await carregarCanais(nomes(60), {
    buscar: k.buscar, paralelos: 8, esperar, aoProgredir: (p) => progresso.push(p),
  });
  assert.ok(r.every((x) => x.estado === 'ok'));
  assert.equal(k.cortes.length, 2);
  assert.ok(k.cortes[1] - k.cortes[0] > 8, 'entre os dois 429 passaram pedidos com o limite novo');
  assert.equal(progresso.at(-1).paralelos, 4);
  assert.deepEqual(durante, [0, 0]);
});

test('quem pediu 3 desce para 2, e quem pediu 1 fica em 1 (o piso nunca sobe o limite)', async () => {
  for (const [paralelos, fica] of [[3, 2], [1, 1], [2, 2]]) {
    const k = kickFalsa({ roteiro: { c01: [429], c05: [429] } });
    const progresso = [];
    await carregarCanais(nomes(12), {
      buscar: k.buscar, paralelos, esperar: semEspera(), aoProgredir: (p) => progresso.push(p),
    });
    assert.equal(progresso.at(-1).paralelos, fica, `pediu ${paralelos}`);
    assert.ok(k.maxEmVoo <= paralelos);
    assert.equal(k.maxDepois(k.cortes[0]), fica);
  }
});

// ── carregarCanais: progresso ───────────────────────────────────────────────

test('aoProgredir: uma vez por canal, quando o canal fica decidido', async () => {
  const k = kickFalsa({ roteiro: { b: [429, 429, 200], d: [404] } });
  const progresso = [];
  await carregarCanais(['a', 'b', 'c', 'd', 'e'], {
    buscar: k.buscar, esperar: semEspera(), aoProgredir: (p) => progresso.push(p),
  });
  assert.equal(progresso.length, 5);
  assert.deepEqual(progresso.map((p) => p.feitos), [1, 2, 3, 4, 5]);
  assert.ok(progresso.every((p) => p.total === 5));
  const porSlug = Object.fromEntries(progresso.map((p) => [p.slug, p.estado]));
  // O b aparece UMA vez, já com o estado final e não com os 429 do caminho.
  assert.deepEqual(porSlug, { a: 'ok', b: 'ok', c: 'ok', d: 'canal-nao-existe', e: 'ok' });
});

test('depois de a carga rejeitar, o aoProgredir não é chamado outra vez', async () => {
  // A sonda do revisor: 4 em paralelo e o aoProgredir rebenta na primeira.
  // Os outros três acabavam depois e chamavam-no na mesma: a página mostrava
  // progresso depois de mostrar o erro.
  const k = kickFalsa({ demora: (slug) => 1 + Number(slug.slice(1)) * 3 });
  let chamadas = 0;
  await assert.rejects(carregarCanais(nomes(4), {
    buscar: k.buscar, paralelos: 4, esperar: semEspera(), aoProgredir: () => { chamadas++; throw new Error('x'); },
  }));
  await dormir(40);
  assert.equal(k.chamadas.length, 4);
  assert.equal(chamadas, 1);
});

test('um erro no aoProgredir da página pára a carga: não sai mais nenhum pedido', async () => {
  const k = kickFalsa();
  const rebentou = new Error('a página rebentou');
  await assert.rejects(
    carregarCanais(nomes(20), { buscar: k.buscar, paralelos: 2, esperar: semEspera(), aoProgredir: () => { throw rebentou; } }),
    (e) => e === rebentou,
  );
  const ate = k.chamadas.length;
  await dormir(30);
  assert.equal(k.chamadas.length, ate);
  assert.ok(ate <= 3, `saíram ${ate}`);
});

// ── carregarCanais: cancelar ────────────────────────────────────────────────

const ehCancelado = (e) => e?.name === 'AbortError';

test('cancelar rejeita logo, mesmo que a `buscar` nunca largue o pedido', async () => {
  const c = new AbortController();
  const ops = [];
  // Uma rede que pendura para sempre e ignora o sinal: o pior caso.
  const buscar = (url, op) => { ops.push(op); return new Promise(() => {}); };
  const carga = carregarCanais(nomes(20), { buscar, paralelos: 4, sinal: c.signal });
  await dormir(5);
  assert.equal(ops.length, 4);
  c.abort();
  await assert.rejects(carga, ehCancelado);
  await dormir(10);
  assert.equal(ops.length, 4, 'depois de cancelar não sai mais nenhum');
  assert.ok(ops.every((op) => op?.signal === c.signal), 'o sinal segue até ao fetch');
});

test('cancelar a meio de uma espera de 4 s não espera os 4 s', async () => {
  const c = new AbortController();
  const k = kickFalsa({ roteiro: { a: [429, 200] } });
  let esperou = 0;
  const esperar = () => { esperou++; queueMicrotask(() => c.abort()); return new Promise(() => {}); };
  await assert.rejects(carregarCanais(['a'], { buscar: k.buscar, esperar, sinal: c.signal }), ehCancelado);
  assert.equal(esperou, 1);
  assert.equal(k.porCanal.get('a'), 1, 'não voltou a pedir');
});

test('cancelar durante a espera: quando a espera acaba, o canal já não volta a pedir', async () => {
  const c = new AbortController();
  const k = kickFalsa({ roteiro: { a: [429, 200] }, demora: () => 1 });
  // Uma espera verdadeira (curta), que ACABA depois de se cancelar.
  const esperar = () => { setTimeout(() => c.abort(), 2); return dormir(10); };
  await assert.rejects(carregarCanais(['a'], { buscar: k.buscar, esperar, sinal: c.signal }), ehCancelado);
  await dormir(30);
  assert.equal(k.porCanal.get('a'), 1);
});

test('um pedido largado pelo sinal volta como "sem-rede", e mesmo assim não se tenta outra vez', async () => {
  const c = new AbortController();
  const chamadas = [];
  const esperar = semEspera();
  const buscar = (url, { signal } = {}) => new Promise((_, nao) => {
    chamadas.push(url);
    signal.addEventListener('abort', () => nao(new DOMException('This operation was aborted', 'AbortError')));
  });
  const carga = carregarCanais(nomes(6), { buscar, paralelos: 3, sinal: c.signal, esperar });
  await dormir(5);
  c.abort();
  await assert.rejects(carga, ehCancelado);
  await dormir(10);
  assert.equal(chamadas.length, 3);
  assert.deepEqual(esperar.esperas, [], 'nem sequer começou a esperar para voltar');
});

test('com o sinal já cancelado nem começa', async () => {
  const k = kickFalsa();
  await assert.rejects(carregarCanais(['a', 'b'], { buscar: k.buscar, sinal: AbortSignal.abort() }), ehCancelado);
  assert.equal(k.chamadas.length, 0);
});

test('sem sinal, a `buscar` recebe só o endereço (como vodsDoCanal sempre fez)', async () => {
  const args = [];
  const buscar = async (...a) => { args.push(a); return resposta(200, UM_VOD); };
  await carregarCanais(['a'], { buscar });
  assert.equal(args[0].length, 1);
});

test('cancelar depois de acabar não deixa rejeições soltas', async () => {
  const c = new AbortController();
  const k = kickFalsa();
  const soltas = [];
  const ouvir = (e) => soltas.push(e);
  process.on('unhandledRejection', ouvir);
  try {
    const r = await carregarCanais(['a'], { buscar: k.buscar, sinal: c.signal });
    assert.equal(r[0].estado, 'ok');
    c.abort();
    await dormir(10);
    assert.deepEqual(soltas, []);
  } finally {
    process.off('unhandledRejection', ouvir);
  }
});

// ── procurarAoVivo ──────────────────────────────────────────────────────────

/**
 * Um item da lista ao vivo, com a forma REAL (06/10/2026). O `slug` de cima é
 * o da emissão e não o do canal — está aqui de propósito, para que um código
 * que o use em vez de `channel.slug` falhe neste ficheiro e não no evento.
 */
function item({ canal, titulo = 'Rust', espectadores = 10, idioma = 'English', inicio = '2026-10-06 07:29:00', tags = [] }) {
  return {
    id: Math.floor(Math.random() * 1e9),
    slug: `481e6a45b3c2feb5-${canal}-emissao`,
    channel_id: 30986461,
    session_title: titulo,
    is_live: true,
    start_time: inicio,
    language: idioma,
    viewer_count: espectadores,
    viewers: espectadores,
    tags,
    channel: { id: 30986461, user_id: 32037417, slug: canal, is_banned: false },
    categories: [{ slug: 'rust' }],
  };
}

/**
 * Uma Kick falsa para a lista ao vivo. Serve `paginas[n-1]` na página n e,
 * como a verdadeira, devolve um `next_page_url` SEM o filtro.
 */
function aoVivoFalso(paginas, { proximaSempre = false } = {}) {
  const pedidos = [];
  const buscar = async (url, op) => {
    pedidos.push({ url: new URL(url), op });
    const n = Number(new URL(url).searchParams.get('page'));
    const pagina = paginas[n - 1];
    if (typeof pagina === 'function') return pagina();
    const ha = proximaSempre || n < paginas.length;
    return resposta(200, {
      current_page: n,
      data: pagina ?? [],
      next_page_url: ha ? `https://kick.com/stream/livestreams/en?page=${n + 1}` : null,
      per_page: 32,
    });
  };
  return { buscar, pedidos };
}

test('pede página a página com o filtro, até a Kick dizer que acabou', async () => {
  const f = aoVivoFalso([[item({ canal: 'a' })], [item({ canal: 'b' })], [item({ canal: 'c' })]]);
  const r = await procurarAoVivo({ buscar: f.buscar });
  assert.deepEqual(r.map((x) => x.slug), ['a', 'b', 'c']);
  assert.equal(f.pedidos.length, 3);
  f.pedidos.forEach(({ url }, i) => {
    assert.equal(`${url.origin}${url.pathname}`, 'https://kick.com/stream/livestreams/en');
    assert.equal(url.searchParams.get('page'), String(i + 1));
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(url.searchParams.get('sort'), 'desc');
    // O next_page_url falso vem sem o filtro, como o verdadeiro. Se fosse
    // seguido à letra, a página 2 já era a Kick inteira.
    assert.equal(url.searchParams.get('subcategory'), 'rust', `página ${i + 1} sem filtro`);
  });
});

test('outra subcategoria, ou nenhuma', async () => {
  const f = aoVivoFalso([[item({ canal: 'a' })]]);
  await procurarAoVivo({ buscar: f.buscar, subcategoria: 'just-chatting' });
  await procurarAoVivo({ buscar: f.buscar, subcategoria: null });
  await procurarAoVivo({ buscar: f.buscar, subcategoria: '' });
  assert.equal(f.pedidos[0].url.searchParams.get('subcategory'), 'just-chatting');
  assert.equal(f.pedidos[1].url.searchParams.has('subcategory'), false);
  assert.equal(f.pedidos[2].url.searchParams.has('subcategory'), false);
});

test('pára numa página vazia, mesmo que a Kick diga que há mais', async () => {
  const f = aoVivoFalso([[item({ canal: 'a' })], [], [item({ canal: 'c' })]], { proximaSempre: true });
  const r = await procurarAoVivo({ buscar: f.buscar });
  assert.deepEqual(r.map((x) => x.slug), ['a']);
  assert.equal(f.pedidos.length, 2);
});

test('pára em maxPaginas, para um paginador que nunca acaba', async () => {
  const paginas = Array.from({ length: 50 }, (_, i) => [item({ canal: `c${i}` })]);
  const f = aoVivoFalso(paginas, { proximaSempre: true });
  const r = await procurarAoVivo({ buscar: f.buscar, maxPaginas: 3 });
  assert.equal(f.pedidos.length, 3);
  assert.equal(r.length, 3);
  const g = aoVivoFalso(paginas, { proximaSempre: true });
  await procurarAoVivo({ buscar: g.buscar });
  assert.equal(g.pedidos.length, 30, 'por defeito, 30');
  // Cortado em maxPaginas com a Kick a dizer que há mais: a lista diz que
  // está incompleta, em vez de passar pela lista inteira.
  assert.equal(r.incompleto, true);
  const acabou = await procurarAoVivo({ buscar: aoVivoFalso([[item({ canal: 'a' })]]).buscar, maxPaginas: 1 });
  assert.equal(acabou.incompleto, false, 'acabou na última página: está completa');
});

test('maxPaginas que não é um inteiro >= 1 é um erro de quem chama, e não sai pedido nenhum', async () => {
  // Antes um 0 virava 1 e pedia-se uma página que ninguém pediu.
  for (const maxPaginas of [0, -3, 1.5, NaN, 'x']) {
    const h = aoVivoFalso([[item({ canal: 'a' })]], { proximaSempre: true });
    await assert.rejects(procurarAoVivo({ buscar: h.buscar, maxPaginas }), RangeError, String(maxPaginas));
    assert.equal(h.pedidos.length, 0);
  }
});

test('usa o slug do CANAL, não o da emissão, e lê os campos', async () => {
  const f = aoVivoFalso([[
    item({ canal: 'danikongi', titulo: '| VOLVIMOS | Ñ on TOP | !blerp', espectadores: 452, idioma: 'Spanish', inicio: '2026-10-06 07:29:00' }),
    { session_title: 'nada', channel: { slug: 'Maiusculas' } },
  ]]);
  const r = await procurarAoVivo({ buscar: f.buscar });
  assert.deepEqual(r[0], {
    slug: 'danikongi',
    titulo: '| VOLVIMOS | Ñ on TOP | !blerp',
    espectadores: 452,
    idioma: 'Spanish',
    // Sem fuso na resposta: é UTC, a mesma regra medida em kick.js.
    inicioMs: Date.UTC(2026, 9, 6, 7, 29, 0),
  });
  // O que falta é desconhecido (null), nunca um zero inventado.
  assert.deepEqual(r[1], { slug: 'maiusculas', titulo: 'nada', espectadores: null, idioma: null, inicioMs: null });
});

test('o início respeita um fuso se vier, e um início ilegível é desconhecido', async () => {
  const f = aoVivoFalso([[
    item({ canal: 'a', inicio: '2026-10-06T07:29:00Z' }),
    item({ canal: 'b', inicio: '2026-10-06 09:29:00+02:00' }),
    item({ canal: 'c', inicio: 'ontem' }),
    item({ canal: 'd', inicio: '' }),
  ]]);
  const r = await procurarAoVivo({ buscar: f.buscar });
  assert.deepEqual(r.map((x) => x.inicioMs), [Date.UTC(2026, 9, 6, 7, 29), Date.UTC(2026, 9, 6, 7, 29), null, null]);
});

test('itens sem canal são ignorados, e não rebentam a lista', async () => {
  const f = aoVivoFalso([[null, {}, { channel: {} }, { channel: { slug: 42 } }, item({ canal: 'ok' })]]);
  const r = await procurarAoVivo({ buscar: f.buscar });
  assert.deepEqual(r.map((x) => x.slug), ['ok']);
});

test('TODAS as palavras têm de aparecer, sem ligar a maiúsculas nem acentos', async () => {
  const f = aoVivoFalso([[
    item({ canal: 'a', titulo: 'RUST KICK OFF 2 — Día 1 | !discord' }),
    item({ canal: 'b', titulo: 'rust kick off 2' }),
    item({ canal: 'c', titulo: 'Kick Off sem o resto' }),
    item({ canal: 'd', titulo: 'Rúst Kíck Öff 2, dia 1' }),
  ]]);
  const r = await procurarAoVivo({ buscar: f.buscar, palavras: 'kick off DIA' });
  assert.deepEqual(r.map((x) => x.slug), ['a', 'd']);
  const s = await procurarAoVivo({ buscar: f.buscar, palavras: 'Kíck  Óff' });
  assert.deepEqual(s.map((x) => x.slug), ['a', 'b', 'c', 'd']);
});

test('uma palavra pode estar no título e outra nas etiquetas', async () => {
  const f = aoVivoFalso([[
    item({ canal: 'a', titulo: 'KICK OFF dia 2', tags: ['rust', 'Português'] }),
    item({ canal: 'b', titulo: 'outra coisa', tags: ['kickoff', 'rust'] }),
    item({ canal: 'c', titulo: 'KICK OFF dia 2', tags: ['english'] }),
  ]]);
  const r = await procurarAoVivo({ buscar: f.buscar, palavras: 'kick off portugues' });
  assert.deepEqual(r.map((x) => x.slug), ['a']);
  const s = await procurarAoVivo({ buscar: f.buscar, palavras: 'kick off rust' });
  assert.deepEqual(s.map((x) => x.slug), ['a', 'b']);
});

test('letras que vieram de títulos reais: i sem ponto, İ turco, letras em expoente', async () => {
  // Todas medidas na lista ao vivo de 06/10/2026.
  const f = aoVivoFalso([[
    item({ canal: 'turco', titulo: 'SOLO', tags: ['Englısh', 'gaming', 'rust'] }),
    item({ canal: 'enerji', titulo: 'BU YAYIN FULL ENERJİ İÇERİR🚨🚨' }),
    item({ canal: 'expoente', titulo: '@ERAY BURADA  ᵒˡᵃᵇⁱˡⁱʳ ᵈᵉ' }),
    item({ canal: 'gang', titulo: 'JC | ³⁰⁰gang' }),
    item({ canal: 'polaco', titulo: 'Łódź Øresund Đoàn Straße' }),
  ]]);
  const q = async (palavras) => (await procurarAoVivo({ buscar: f.buscar, palavras })).map((x) => x.slug);
  assert.deepEqual(await q('english'), ['turco']);
  assert.deepEqual(await q('enerji icerir'), ['enerji']);
  assert.deepEqual(await q('olabilir'), ['expoente']);
  assert.deepEqual(await q('300gang'), ['gang']);
  assert.deepEqual(await q('lodz oresund doan strasse'), ['polaco']);
});

test('"kickoff" encontra "Kick-Off" e "kick off" encontra "#RustKickOff"', async () => {
  const f = aoVivoFalso([[
    item({ canal: 'hifen', titulo: 'RUST KICK-OFF 2' }),
    item({ canal: 'hashtag', titulo: '#RustKickOff2 dia 1' }),
    item({ canal: 'emoji', titulo: '✅KICK✅OFF✅' }),
    item({ canal: 'fora', titulo: 'Rust solo' }),
  ]]);
  const q = async (palavras) => (await procurarAoVivo({ buscar: f.buscar, palavras })).map((x) => x.slug);
  assert.deepEqual(await q('kickoff'), ['hifen', 'hashtag', 'emoji']);
  assert.deepEqual(await q('kick off'), ['hifen', 'hashtag', 'emoji']);
  assert.deepEqual(await q('kick-off'), ['hifen', 'hashtag', 'emoji']);
});

test('uma palavra dentro de outra palavra não conta, nem colada entre título e etiquetas', async () => {
  // As sondas do revisor: com o texto todo colado, "rust" achava "Trust",
  // "off" achava "Office", "dia" achava "India" e "2" achava "2026".
  const f = aoVivoFalso([[
    item({ canal: 'trust', titulo: 'Trust me bro' }),
    item({ canal: 'office', titulo: 'Office hours' }),
    item({ canal: 'india', titulo: 'India server' }),
    item({ canal: 'ano', titulo: 'Rust 2026 wipe' }),
    item({ canal: 'campos', titulo: 'Rust', tags: ['Kick'] }),
    item({ canal: 'big', titulo: 'big kick', tags: ['offline'] }),
  ]]);
  const q = async (palavras) => (await procurarAoVivo({ buscar: f.buscar, palavras })).map((x) => x.slug);
  assert.deepEqual(await q('trust'), ['trust']);
  assert.deepEqual(await q('rust'), ['ano', 'campos']);
  assert.deepEqual(await q('off'), []);
  assert.deepEqual(await q('dia'), []);
  assert.deepEqual(await q('2'), []);
  assert.deepEqual(await q('2026'), ['ano']);
  assert.deepEqual(await q('stk'), [], 'não cola o fim do título ao começo da etiqueta');
  assert.deepEqual(await q('kickoff'), [], 'nem "kick" do título com "off" da etiqueta');
  assert.deepEqual(await q('rust kick'), ['campos'], 'mas cada palavra pode estar num campo');
});

test('as partes de uma palavra colada contam: maiúsculas a meio e letras com números', async () => {
  const f = aoVivoFalso([[
    item({ canal: 'camelo', titulo: '#RustKickOff2' }),
    item({ canal: 'caps', titulo: 'KICKOFF' }),
    item({ canal: 'dia2', titulo: 'kick off dia2' }),
  ]]);
  const q = async (palavras) => (await procurarAoVivo({ buscar: f.buscar, palavras })).map((x) => x.slug);
  // "KICKOFF" em maiúsculas não diz onde acaba "kick": entra (ver o teste
  // seguinte, das palavras coladas sem maiúsculas).
  assert.deepEqual(await q('kick'), ['camelo', 'caps', 'dia2']);
  assert.deepEqual(await q('kick off'), ['camelo', 'caps', 'dia2']);
  assert.deepEqual(await q('dia 2'), ['dia2']);
  assert.deepEqual(await q('rustkickoff2'), ['camelo']);
});

test('dentro de uma palavra colada sem maiúsculas também conta: "#rustkickoff", "RUSTKICKOFF", japonês', async () => {
  // As sondas do revisor: as etiquetas da Kick vêm quase sempre em minúsculas
  // ("rustkickoff"), e partir só nas maiúsculas deixava estes de fora sem
  // ninguém saber.
  const f = aoVivoFalso([[
    item({ canal: 'hash', titulo: '#rustkickoff day 1' }),
    item({ canal: 'caps', titulo: 'RUSTKICKOFF' }),
    item({ canal: 'etiqueta', titulo: 'rust', tags: ['rustkickoff'] }),
    item({ canal: 'jp', titulo: 'ラストイベント' }),
    item({ canal: 'camelo', titulo: 'TwitchConRust' }),
    item({ canal: 'fora', titulo: 'Office hours', tags: ['offline'] }),
  ]]);
  const q = async (palavras) => (await procurarAoVivo({ buscar: f.buscar, palavras })).map((x) => x.slug);
  assert.deepEqual(await q('kick off'), ['hash', 'caps', 'etiqueta']);
  assert.deepEqual(await q('kickoff'), ['hash', 'caps', 'etiqueta']);
  assert.deepEqual(await q('イベント'), ['jp']);
  assert.deepEqual(await q('twitchcon'), ['camelo']);
  assert.deepEqual(await q('off'), [], 'três letras não entram dentro de "offline"');
});

test('sem palavras vêm todos', async () => {
  const f = aoVivoFalso([[item({ canal: 'a', titulo: 'x' }), item({ canal: 'b', titulo: '' })]]);
  for (const palavras of [undefined, null, '', '   ', [], ['  '], '!!! ---']) {
    const r = await procurarAoVivo({ buscar: f.buscar, palavras });
    assert.deepEqual(r.map((x) => x.slug), ['a', 'b'], `palavras: ${JSON.stringify(palavras)}`);
  }
});

test('as palavras podem vir numa lista', async () => {
  const f = aoVivoFalso([[item({ canal: 'a', titulo: 'Rust Kick Off dia 2' }), item({ canal: 'b', titulo: 'Rust Kick Off dia 1' })]]);
  const r = await procurarAoVivo({ buscar: f.buscar, palavras: ['Kick Off', 'Dia 2'] });
  assert.deepEqual(r.map((x) => x.slug), ['a']);
});

test('um canal aparece uma vez só, mesmo que salte de página enquanto se pagina', async () => {
  const f = aoVivoFalso([
    [item({ canal: 'a', espectadores: 500 }), item({ canal: 'B', espectadores: 400 })],
    [item({ canal: 'b', espectadores: 390 }), item({ canal: 'c', espectadores: 10 })],
  ]);
  const r = await procurarAoVivo({ buscar: f.buscar });
  assert.deepEqual(r.map((x) => [x.slug, x.espectadores]), [['a', 500], ['b', 400], ['c', 10]]);
});

test('um canal que só bate na segunda aparição (mudou o título) entra na mesma', async () => {
  const f = aoVivoFalso([
    [item({ canal: 'a', titulo: 'a aquecer' })],
    [item({ canal: 'a', titulo: 'KICK OFF começou' })],
  ]);
  const r = await procurarAoVivo({ buscar: f.buscar, palavras: 'kick off' });
  assert.deepEqual(r.map((x) => x.titulo), ['KICK OFF começou']);
});

test('uma página que falha diz qual, porquê, e o que já se tinha achado', async () => {
  const paginaBoa = [item({ canal: 'a' }), item({ canal: 'b' })];
  const casos = [
    [[() => resposta(429, {})], 'rate-limit', 1, 0],
    [[() => resposta(500, {})], 'http-500', 1, 0],
    [[paginaBoa, () => { throw new TypeError('Failed to fetch'); }], 'sem-rede', 2, 2],
    [[paginaBoa, () => resposta(200, null, { ilegivel: true })], 'resposta-ilegivel', 2, 2],
    [[() => resposta(200, { data: null })], 'formato-inesperado', 1, 0],
    [[() => resposta(200, [])], 'formato-inesperado', 1, 0],
  ];
  for (const [paginas, estado, pagina, quantos] of casos) {
    const f = aoVivoFalso(paginas);
    await assert.rejects(procurarAoVivo({ buscar: f.buscar, esperar: semEspera() }), (e) => {
      assert.equal(e.name, 'SEM-LISTA-AO-VIVO');
      assert.equal(e.estado, estado);
      assert.equal(e.pagina, pagina);
      assert.equal(e.parcial.length, quantos);
      return true;
    }, estado);
  }
});

test('uma falha passageira numa página volta a ser pedida, à espera de 1 s, 2 s, 4 s', async () => {
  // Antes, um 429 na página 12 de 16 deitava a busca toda fora.
  const paginaBoa = [item({ canal: 'a' }), item({ canal: 'b' })];
  for (const falha of [() => resposta(429, {}), () => resposta(503, {}), () => { throw new TypeError('Failed to fetch'); }]) {
    let n = 0;
    const segunda = () => (++n <= 2 ? falha() : resposta(200, { data: [item({ canal: 'c' })], next_page_url: null }));
    const f = aoVivoFalso([paginaBoa, segunda]);
    const esperar = semEspera();
    const r = await procurarAoVivo({ buscar: f.buscar, esperar });
    assert.deepEqual(r.map((x) => x.slug), ['a', 'b', 'c']);
    assert.deepEqual(esperar.esperas, [1000, 2000]);
    assert.equal(f.pedidos.length, 4);
  }
  // O que não é passageiro não se repete.
  const g = aoVivoFalso([() => resposta(404, {})]);
  const esperar = semEspera();
  await assert.rejects(procurarAoVivo({ buscar: g.buscar, esperar }), (e) => e.estado === 'http-404');
  assert.equal(g.pedidos.length, 1);
  assert.deepEqual(esperar.esperas, []);
});

test('procurarAoVivo: cancelar rejeita logo, mesmo que a `buscar` nunca largue o pedido', async () => {
  const c = new AbortController();
  const buscar = () => new Promise(() => {});
  const p = procurarAoVivo({ buscar, sinal: c.signal });
  await dormir(2);
  c.abort();
  const depressa = await Promise.race([p.then(() => 'ok', (e) => e), dormir(50).then(() => 'pendurado')]);
  assert.ok(ehCancelado(depressa), String(depressa));
  // E a meio de uma espera de 4 s também não espera os 4 s.
  const d = new AbortController();
  const lenta = procurarAoVivo({ buscar: async () => resposta(503, {}), sinal: d.signal, esperar: () => new Promise(() => {}) });
  await dormir(2);
  d.abort();
  const r = await Promise.race([lenta.then(() => 'ok', (e) => e), dormir(50).then(() => 'pendurado')]);
  assert.ok(ehCancelado(r), String(r));
});

test('procurarAoVivo: cancelar antes de começar e a meio', async () => {
  const f = aoVivoFalso([[item({ canal: 'a' })]]);
  await assert.rejects(procurarAoVivo({ buscar: f.buscar, sinal: AbortSignal.abort() }), ehCancelado);
  assert.equal(f.pedidos.length, 0);

  const c = new AbortController();
  const ops = [];
  const buscar = (url, op) => new Promise((_, nao) => {
    ops.push(op);
    op.signal.addEventListener('abort', () => nao(new DOMException('aborted', 'AbortError')));
  });
  const p = procurarAoVivo({ buscar, sinal: c.signal });
  await dormir(2);
  c.abort();
  // AbortError e não SEM-LISTA-AO-VIVO: cancelar não é a Kick a falhar.
  await assert.rejects(p, ehCancelado);
  assert.equal(ops[0].signal, c.signal);

  // Entre páginas: a segunda não chega a sair.
  const d = new AbortController();
  const g = aoVivoFalso([() => { d.abort(); return resposta(200, { data: [item({ canal: 'a' })], next_page_url: 'x' }); }, [item({ canal: 'b' })]]);
  await assert.rejects(procurarAoVivo({ buscar: g.buscar, sinal: d.signal }), ehCancelado);
  assert.equal(g.pedidos.length, 1);
});
