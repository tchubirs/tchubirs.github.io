// O chat como sinal dos melhores momentos.
//
// Nenhum destes testes toca na rede: a `buscar` é sempre uma Kick falsa que
// serve páginas pelo cursor a partir de um chat sintético, com a forma de uma
// resposta real (06/10/2026): 25 mensagens no máximo, da mais nova para a
// mais velha, todas ANTES do cursor, `created_at` truncado ao segundo e um
// `cursor` com o microssegundo da mais velha. A página vazia vem sem `cursor`,
// como veio a sério.
//
// O fuso é posto no Brasil de propósito: uma data sem zona lida em hora local
// só se vê errada num fuso que não seja UTC.
process.env.TZ = 'America/Sao_Paulo';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idDoCanal, mensagensEntre, calor, picos, reacoes } from '../site/chat.js';

const ID = 541014;
const MIN = 60_000;
// 03/10/2026 01:00:00 UTC, uma noite qualquer do evento.
const T0 = Date.UTC(2026, 9, 3, 1, 0, 0);

const resposta = (status, corpo, { ilegivel = false } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => { if (ilegivel) throw new SyntaxError('Unexpected end of JSON input'); return corpo; },
});

/** Um gerador pseudo-aleatório com semente: o mesmo chat em todas as corridas. */
function aleatorio(semente = 7) {
  let s = semente >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

const segundoIso = (us) => new Date(Math.floor(us / 1e6) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Como a Kick escreve uma mensagem (aparado ao que interessa). */
const paraKick = (m) => ({
  id: m.id,
  chat_id: ID,
  user_id: 1,
  content: m.texto,
  type: 'message',
  metadata: null,
  created_at: segundoIso(m.us),
  sender: { id: 1, slug: m.autor ?? 'alguem', username: m.autor ?? 'Alguem' },
});

/**
 * Um chat sintético: `porMinuto[i]` mensagens no minuto i a partir de `inicio`,
 * espalhadas pelo minuto ao microssegundo. `texto(i, k)` escreve cada uma.
 */
function chatSintetico(porMinuto, { inicio = T0, texto = () => 'oi', semente = 7 } = {}) {
  const r = aleatorio(semente);
  const registo = [];
  porMinuto.forEach((quantas, i) => {
    const us = Array.from({ length: quantas }, () => Math.floor((inicio + i * MIN) * 1000 + r() * MIN * 1000))
      .sort((a, b) => a - b);
    us.forEach((u, k) => registo.push({ id: `m${i}-${k}`, us: u, texto: texto(i, k), autor: `u${(i * 7 + k) % 13}` }));
  });
  return registo;
}

/**
 * Uma Kick falsa para o chat, que conta o que lhe pedem.
 *
 * `tamanho(n)`: quantas mensagens traz o pedido n (25 por omissão).
 * `inclusivo`: serve também a mensagem que está EM CIMA do cursor — a forma
 *   mais natural de uma API repetir a fronteira entre páginas.
 * `semCursor`: a resposta deixa de trazer `cursor`.
 * `roteiro[n]`: uma resposta feita à mão para o pedido n.
 */
function kickDoChat(registo, { tamanho = () => 25, inclusivo = false, semCursor = false, roteiro = {} } = {}) {
  const ordem = [...registo].sort((a, b) => b.us - a.us);
  const k = { pedidos: [] };
  k.buscar = async (url, op = {}) => {
    const m = String(url).match(/^https:\/\/kick\.com\/api\/v2\/channels\/(\d+)\/messages\?cursor=(\d+)$/);
    assert.ok(m, `endereço inesperado: ${url}`);
    const cursor = Number(m[2]);
    const n = k.pedidos.push({ canal: Number(m[1]), cursor, op });
    if (roteiro[n]) return roteiro[n]({ cursor });
    const pagina = ordem.filter((x) => (inclusivo ? x.us <= cursor : x.us < cursor)).slice(0, tamanho(n));
    const data = { messages: pagina.map(paraKick), pinned_message: null };
    if (pagina.length && !semCursor) data.cursor = String(pagina.at(-1).us);
    return resposta(200, { status: { error: false, code: 200, message: 'SUCCESS' }, data });
  };
  return k;
}

/** O que devia sair: as mensagens cujo segundo cai em [de, ate), por ordem. */
const esperado = (registo, de, ate) => registo
  .map((m) => ({ ...m, ms: Math.floor(m.us / 1e6) * 1000 }))
  .filter((m) => m.ms >= de && m.ms < ate)
  .sort((a, b) => a.us - b.us)
  .map((m) => m.id);

// A hora medida: 281 mensagens num canal pequeno, mediana de 4 por minuto, e
// dois minutos de 22 cheios de KEKW em cima dos lances.
const HORA = [
  4, 4, 5, 4, 2, 4, 6, 3, 4, 5, 4, 3, 4, 22, 9, 4, 3, 5, 4, 4,
  4, 4, 5, 2, 4, 3, 4, 6, 4, 5, 3, 4, 4, 5, 4, 4, 2, 4, 5, 4,
  3, 22, 6, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 4, 2, 4, 5, 3, 4, 5,
];
const LANCES = new Set([13, 41]);
const textoDaHora = (i, k) => (LANCES.has(i) && k % 3 !== 2
  ? `[emote:37226:KEKW] ${k % 2 ? 'kkkkkk' : 'KKKKKKKKK'}`
  : ['oi', 'que mapa é esse', '!sens', 'bora time', '@tchubi manda o link'][k % 5]);

// ── idDoCanal ───────────────────────────────────────────────────────────────

test('idDoCanal: devolve o id do CANAL e não o da sala de chat', async () => {
  const pedidos = [];
  const buscar = async (url) => {
    pedidos.push(url);
    return resposta(200, { id: 541014, slug: 'tchubi', chatroom: { id: 540838, channel_id: 541014 } });
  };
  assert.equal(await idDoCanal('  @Tchubi ', { buscar }), 541014);
  assert.deepEqual(pedidos, ['https://kick.com/api/v2/channels/tchubi']);
});

test('idDoCanal: um id em texto vira número', async () => {
  const buscar = async () => resposta(200, { id: '541014' });
  assert.equal(await idDoCanal('tchubi', { buscar }), 541014);
});

test('idDoCanal: cada falha é null, e um nome impossível nem chega a pedir', async () => {
  let pedidos = 0;
  const conta = (f) => async (...a) => { pedidos++; return f(...a); };
  assert.equal(await idDoCanal('NOME COM ESPAÇO', { buscar: conta(async () => resposta(200, { id: 1 })) }), null);
  assert.equal(await idDoCanal('', { buscar: conta(async () => resposta(200, { id: 1 })) }), null);
  assert.equal(pedidos, 0, 'um nome que não pode ser endereço não vai à Kick');

  const casos = [
    ['não existe', async () => resposta(404, {})],
    ['rate-limit', async () => resposta(429, {})],
    ['rede em baixo', async () => { throw new TypeError('fetch failed'); }],
    ['resposta ilegível', async () => resposta(200, null, { ilegivel: true })],
    ['sem id', async () => resposta(200, { slug: 'x' })],
    ['id que não é número', async () => resposta(200, { id: 'abc' })],
    ['id zero', async () => resposta(200, { id: 0 })],
    ['corpo nulo', async () => resposta(200, null)],
  ];
  for (const [nome, buscar] of casos) {
    assert.equal(await idDoCanal('tchubi', { buscar }), null, nome);
  }
});

test('idDoCanal: um nome só de pontos não vira outro endereço da API', async () => {
  // `encodeURIComponent` não escapa pontos: ".." ia a kick.com/api/v2/ e "."
  // a kick.com/api/v2/channels/, e um `id` qualquer dessas respostas passava
  // por número de canal. É a regra de `elenco.js`: um nome tem pelo menos uma
  // letra ou um algarismo.
  let pedidos = 0;
  const buscar = async () => { pedidos++; return resposta(200, { id: 7 }); };
  for (const nome of ['.', '..', '...', '@..', '-', '_', '.-_']) {
    assert.equal(await idDoCanal(nome, { buscar }), null, nome);
  }
  assert.equal(pedidos, 0);
  // Pontos no meio de um nome a sério continuam a ir à Kick, que é quem sabe.
  assert.equal(await idDoCanal('a.b', { buscar }), 7);
});

test('idDoCanal: cancelar atira em vez de fingir que o canal não tem chat', async () => {
  const ctl = new AbortController();
  const buscar = async () => { ctl.abort(); throw new DOMException('aborted', 'AbortError'); };
  await assert.rejects(idDoCanal('tchubi', { buscar, sinal: ctl.signal }), { name: 'AbortError' });
});

test('idDoCanal: cancelar enquanto se lê a resposta também atira', async () => {
  // O `fetch` já respondeu e o corpo ainda vem a caminho: cancelar aqui é
  // o mesmo desistir, e não um "este canal não tem chat".
  const ctl = new AbortController();
  const buscar = async () => ({
    status: 200,
    ok: true,
    json: async () => { ctl.abort(); throw new DOMException('aborted', 'AbortError'); },
  });
  await assert.rejects(idDoCanal('tchubi', { buscar, sinal: ctl.signal }), { name: 'AbortError' });
});

// ── mensagensEntre ──────────────────────────────────────────────────────────

test('mensagensEntre: a hora medida sai inteira, por ordem, em 12 pedidos', async () => {
  // Meia hora de chat ANTES da janela, para o caminho ter de parar sozinho
  // em vez de bater no fim do histórico.
  const antes = chatSintetico(Array(30).fill(4), { inicio: T0 - 30 * MIN, semente: 3 })
    .map((m) => ({ ...m, id: `a${m.id}` }));
  const registo = [...antes, ...chatSintetico(HORA, { texto: textoDaHora })];
  const k = kickDoChat(registo);
  const de = T0;
  const ate = T0 + 60 * MIN;

  const lista = await mensagensEntre(ID, de, ate, { buscar: k.buscar });

  assert.equal(HORA.reduce((s, n) => s + n, 0), 281);
  assert.deepEqual(lista.map((m) => m.id), esperado(registo, de, ate));
  assert.equal(lista.length, 281);
  assert.equal(lista.incompleto, false);
  assert.equal(lista.motivo, null);
  // 281 dentro e a 282.ª já é de antes da janela: ceil(282 / 25) = 12, o
  // número medido a sério.
  assert.equal(lista.pedidos, 12);
  assert.equal(k.pedidos.length, 12);
  assert.equal(k.pedidos[0].cursor, ate * 1000, 'o primeiro cursor é o fim da janela, em µs');
  assert.ok(k.pedidos.every((p) => p.canal === ID));
  for (let i = 1; i < lista.length; i++) assert.ok(lista[i - 1].ms <= lista[i].ms, 'por ordem de relógio');
  for (let i = 1; i < k.pedidos.length; i++) assert.ok(k.pedidos[i].cursor < k.pedidos[i - 1].cursor, 'sempre para trás');

  const uma = lista.find((m) => m.texto.includes('KEKW'));
  assert.equal(typeof uma.ms, 'number');
  assert.equal(uma.ms % 1000, 0, 'o ms vem do created_at, ao segundo');
  assert.match(uma.autor, /^u\d+$/);
  assert.deepEqual(Object.keys(uma).sort(), ['autor', 'id', 'ms', 'texto']);
});

test('mensagensEntre: a fronteira repetida entre páginas conta uma vez só', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const k = kickDoChat(registo, { inclusivo: true });
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });

  const ids = lista.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'nenhum id repetido');
  assert.deepEqual(ids, esperado(registo, T0, T0 + 60 * MIN));
  assert.equal(lista.incompleto, false, 'a última página só com a repetida é o fim, não um cursor parado');
});

test('mensagensEntre: um id repetido dentro da mesma página também conta uma vez', async () => {
  const registo = chatSintetico([5]);
  const pagina = [...registo].sort((a, b) => b.us - a.us).map(paraKick);
  const roteiro = {
    1: () => resposta(200, { data: { messages: [pagina[0], ...pagina, pagina[2]], cursor: '1' } }),
  };
  const k = kickDoChat([], { roteiro });
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar });
  assert.equal(lista.length, 5);
});

test('mensagensEntre: a página vazia é o fim do histórico, e não uma falha', async () => {
  // O canal só abriu o chat 20 minutos depois do início da janela.
  const registo = chatSintetico(Array(40).fill(4), { inicio: T0 + 20 * MIN });
  const k = kickDoChat(registo);
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });

  assert.equal(lista.length, 160);
  assert.equal(lista.incompleto, false);
  assert.equal(lista.motivo, null);
  // 160 mensagens são 7 páginas (6 cheias e uma de 10); a de 10 não passou de
  // `deMs`, por isso ainda se pede mais uma, que vem vazia.
  assert.equal(k.pedidos.length, 8);
});

test('mensagensEntre: uma página vazia a meio pára o caminho', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const vazia = () => resposta(200, { data: { messages: [], pinned_message: null } });
  const k = kickDoChat(registo, { roteiro: { 3: vazia } });
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });

  assert.equal(k.pedidos.length, 3, 'não pede mais nada depois da vazia');
  assert.equal(lista.incompleto, false, 'vazia quer dizer que não há mais, e é isso que se diz');
  assert.equal(lista.length, 50, 'fica com as duas páginas que vieram');
  assert.deepEqual(lista.map((m) => m.id), esperado(registo, T0, T0 + 60 * MIN).slice(-50));
});

test('mensagensEntre: páginas mais curtas do que 25 não querem dizer fim', async () => {
  // Medido: uma página veio com 19 e havia mais para trás.
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const k = kickDoChat(registo, { tamanho: (n) => (n % 2 ? 19 : 25) });
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });
  assert.equal(lista.length, 281);
  assert.equal(lista.incompleto, false);
});

test('mensagensEntre: o travão de pedidos devolve o que tem, marcado como incompleto', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const k = kickDoChat(registo);
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar, maxPedidos: 4 });

  assert.equal(k.pedidos.length, 4);
  assert.equal(lista.pedidos, 4);
  assert.equal(lista.incompleto, true);
  assert.equal(lista.motivo, 'max-pedidos');
  assert.equal(lista.length, 100);
  // São as MAIS NOVAS: anda-se de trás para a frente a partir do fim.
  assert.deepEqual(lista.map((m) => m.id), esperado(registo, T0, T0 + 60 * MIN).slice(-100));
});

test('mensagensEntre: maxPedidos zero não pede nada e diz porquê', async () => {
  const k = kickDoChat(chatSintetico([4]));
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar, maxPedidos: 0 });
  assert.equal(k.pedidos.length, 0);
  assert.equal(lista.length, 0);
  assert.equal(lista.motivo, 'max-pedidos');
});

test('mensagensEntre: cada falha a meio tem nome, e o que já veio fica', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const casos = [
    ['rate-limit', () => resposta(429, {})],
    ['http-500', () => resposta(500, {})],
    ['canal-nao-existe', () => resposta(404, {})],
    ['sem-rede', () => { throw new TypeError('fetch failed'); }],
    ['resposta-ilegivel', () => resposta(200, null, { ilegivel: true })],
    ['formato-inesperado', () => resposta(200, { data: { mensagens: [] } })],
    ['formato-inesperado', () => resposta(200, null)],
    ['sem-rede', () => undefined],
  ];
  for (const [motivo, falha] of casos) {
    const k = kickDoChat(registo, { roteiro: { 2: falha } });
    const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });
    assert.equal(lista.motivo, motivo, motivo);
    assert.equal(lista.incompleto, true, motivo);
    assert.equal(lista.length, 25, `${motivo}: a primeira página fica`);
    assert.equal(k.pedidos.length, 2, `${motivo}: não insiste`);
  }
});

test('mensagensEntre: um canal que falha logo à primeira devolve vazio e incompleto', async () => {
  const k = kickDoChat([], { roteiro: { 1: () => resposta(404, {}) } });
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar });
  assert.equal(lista.length, 0);
  assert.equal(lista.incompleto, true);
  assert.equal(lista.motivo, 'canal-nao-existe');
});

test('mensagensEntre: um cursor que não anda pára em vez de dar a volta para sempre', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const ordem = [...registo].sort((a, b) => b.us - a.us).map(paraKick);
  const roteiro = {
    1: ({ cursor }) => resposta(200, { data: { messages: ordem.slice(0, 25), cursor: String(cursor) } }),
  };
  const k = kickDoChat(registo, { roteiro });
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });
  assert.equal(k.pedidos.length, 1);
  assert.equal(lista.motivo, 'cursor-parado');
  assert.equal(lista.incompleto, true);
  assert.equal(lista.length, 25);
});

test('mensagensEntre: um cursor que salta para a frente também conta como parado', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const ordem = [...registo].sort((a, b) => b.us - a.us).map(paraKick);
  const roteiro = {
    1: ({ cursor }) => resposta(200, { data: { messages: ordem.slice(0, 25), cursor: String(cursor + 5e6) } }),
  };
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: kickDoChat(registo, { roteiro }).buscar });
  assert.equal(lista.motivo, 'cursor-parado');
});

test('mensagensEntre: sem cursor na resposta, anda pelo segundo da mais velha', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const k = kickDoChat(registo, { semCursor: true });
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });
  assert.deepEqual(lista.map((m) => m.id), esperado(registo, T0, T0 + 60 * MIN));
  assert.equal(lista.incompleto, false);
});

test('mensagensEntre: sem cursor, um segundo com mais de uma página não passa por completo', async () => {
  // 30 mensagens no mesmo segundo e 10 mais velhas. Sem o cursor da Kick só
  // se anda ao segundo: o pedido seguinte devolve as mesmas 25, e dizer
  // "acabou" deixava 15 de fora com a lista a jurar que estava inteira.
  const cheio = T0 + 30 * MIN;
  const registo = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, us: cheio * 1000 + i * 1000, texto: 'KEKW' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, us: (T0 + 10 * MIN + i * 1000) * 1000, texto: 'oi' })),
  ];
  const k = kickDoChat(registo, { semCursor: true });
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });
  assert.equal(lista.length, 25);
  assert.equal(lista.incompleto, true);
  assert.equal(lista.motivo, 'cursor-parado');
  assert.equal(k.pedidos.length, 2);
});

test('mensagensEntre: uma Kick que ignora o cursor e repete a página não passa por fim', async () => {
  // A mesma página outra vez, com um cursor que até anda para trás: o cursor
  // não serviu de nada, e o resto da noite ficou por ler.
  // Também com uma página curta (veio uma de 19, medido): não ser cheia não
  // a torna a fronteira, porque traz mensagens mais novas do que onde se ia.
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  for (const tamanho of [25, 19]) {
    const primeira = [...registo].sort((a, b) => b.us - a.us).slice(0, tamanho).map(paraKick);
    const mesma = ({ cursor }) => resposta(200, { data: { messages: primeira, cursor: String(cursor - 1000) } });
    const k = kickDoChat(registo, { roteiro: { 1: mesma, 2: mesma, 3: mesma } });
    const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k.buscar });
    assert.equal(lista.length, tamanho);
    assert.equal(lista.incompleto, true, `página de ${tamanho}`);
    assert.equal(lista.motivo, 'cursor-parado', `página de ${tamanho}`);
    assert.equal(k.pedidos.length, 2, 'não insiste numa Kick que não anda');
  }
});

test('mensagensEntre: as pontas da janela — [de, ate), ao segundo', async () => {
  const s = (ms, extraUs = 0) => ms * 1000 + extraUs;
  const registo = [
    { id: 'antes', us: s(T0 - 1000, 999_999), texto: 'a' },   // 00:59:59.999999 -> fora
    { id: 'no-de', us: s(T0, 400_000), texto: 'b' },           // 01:00:00.4 -> created_at = de
    { id: 'meio', us: s(T0 + 30_000), texto: 'c' },
    { id: 'ultimo', us: s(T0 + MIN - 1000, 999_000), texto: 'd' }, // 01:00:59.999
    { id: 'no-ate', us: s(T0 + MIN, 1), texto: 'e' },          // depois do cursor: a Kick não manda
  ];
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: kickDoChat(registo).buscar });
  assert.deepEqual(lista.map((m) => m.id), ['no-de', 'meio', 'ultimo']);
  assert.equal(lista[0].ms, T0);
});

test('mensagensEntre: uma mensagem do segundo de `de` na página seguinte não se perde', async () => {
  // 26 mensagens todas no MESMO segundo de `de`: a primeira página traz 25,
  // todas com created_at == de, e ainda falta uma.
  const registo = Array.from({ length: 26 }, (_, i) => ({ id: `s${i}`, us: T0 * 1000 + i * 1000, texto: 'gg' }));
  const k = kickDoChat(registo);
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar });
  assert.equal(lista.length, 26);
  assert.equal(lista.incompleto, false);
});

test('mensagensEntre: uma data sem zona é UTC, seja qual for o fuso de quem abre', async () => {
  assert.notEqual(new Date(T0).getTimezoneOffset(), 0, 'o teste só prova alguma coisa fora de UTC');
  const roteiro = {
    1: () => resposta(200, {
      data: {
        messages: [
          { id: 'z', content: 'com Z', created_at: '2026-10-03T01:00:30Z' },
          { id: 'sem', content: 'sem zona', created_at: '2026-10-03 01:00:20' },
          { id: 'off', content: 'com +00:00', created_at: '2026-10-03T01:00:10+00:00' },
          { id: 'lixo', content: 'sem data', created_at: 'ontem' },
          { id: 'nada', content: 'sem data nenhuma' },
        ],
        cursor: String((T0 + 10_000) * 1000),
      },
    }),
    2: () => resposta(200, { data: { messages: [] } }),
  };
  const k = kickDoChat([], { roteiro });
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar });
  assert.deepEqual(lista.map((m) => [m.id, m.ms]), [
    ['off', T0 + 10_000], ['sem', T0 + 20_000], ['z', T0 + 30_000],
  ]);
});

test('mensagensEntre: uma página sem nenhuma data legível é forma nova, não silêncio', async () => {
  // Se a Kick mudar o nome de `created_at`, todas as mensagens ficam sem data.
  // Dizer "completo, zero mensagens" era jurar que o canal esteve calado.
  const roteiro = {
    1: () => resposta(200, { data: { messages: [{ id: 'x', content: 'gg', sent_at: '2026-10-03T01:00:30Z' }], cursor: '5' } }),
  };
  const k = kickDoChat([], { roteiro });
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar });
  assert.equal(lista.length, 0);
  assert.equal(lista.incompleto, true);
  assert.equal(lista.motivo, 'formato-inesperado');
  assert.equal(k.pedidos.length, 1);
});

test('mensagensEntre: um travão que não é número pára logo, e diz porquê', async () => {
  const k = kickDoChat(chatSintetico([4]));
  const lista = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar, maxPedidos: 'muitos' });
  assert.equal(k.pedidos.length, 0);
  assert.equal(lista.motivo, 'max-pedidos');
  const semFim = await mensagensEntre(ID, T0, T0 + MIN, { buscar: k.buscar, maxPedidos: Infinity });
  assert.equal(semFim.length, 4);
  assert.equal(semFim.incompleto, false);
});

test('mensagensEntre: janela vazia, janela que não é número ou canal sem id não pedem nada', async () => {
  const k = kickDoChat(chatSintetico([4]));
  for (const [de, ate] of [[T0, T0], [T0 + MIN, T0]]) {
    const lista = await mensagensEntre(ID, de, ate, { buscar: k.buscar });
    assert.equal(lista.length, 0);
    assert.equal(lista.incompleto, false);
  }
  // Uma data que não se leu (NaN) ou um "até agora" passado como Infinity não
  // é uma janela calada: é uma pergunta que não se fez, e diz-se.
  for (const [de, ate] of [[NaN, T0], [T0, Infinity], [-Infinity, T0], [undefined, T0], [T0, '2026-10-03']]) {
    const lista = await mensagensEntre(ID, de, ate, { buscar: k.buscar });
    assert.equal(lista.length, 0, `${de}..${ate}`);
    assert.equal(lista.incompleto, true, `${de}..${ate}`);
    assert.equal(lista.motivo, 'janela-invalida', `${de}..${ate}`);
  }
  for (const id of [null, undefined, '']) {
    const lista = await mensagensEntre(id, T0, T0 + MIN, { buscar: k.buscar });
    assert.equal(lista.length, 0);
    assert.equal(lista.incompleto, true);
    assert.equal(lista.motivo, 'sem-canal');
  }
  assert.equal(k.pedidos.length, 0);
});

test('mensagensEntre: o progresso anda pelo relógio, de 0 a 1', async () => {
  const antes = chatSintetico([4, 4], { inicio: T0 - 2 * MIN, semente: 5 }).map((m) => ({ ...m, id: `a${m.id}` }));
  const registo = [...antes, ...chatSintetico(HORA, { texto: textoDaHora })];
  const visto = [];
  const lista = await mensagensEntre(ID, T0, T0 + 60 * MIN, {
    buscar: kickDoChat(registo).buscar,
    aoProgredir: (p) => visto.push(p),
  });
  assert.equal(visto.length, lista.pedidos);
  visto.forEach((p, i) => assert.equal(p.pedidos, i + 1));
  for (let i = 1; i < visto.length; i++) {
    assert.ok(visto[i].fracao >= visto[i - 1].fracao, 'nunca anda para trás');
    assert.ok(visto[i].chegouMs <= visto[i - 1].chegouMs);
    assert.ok(visto[i].mensagens >= visto[i - 1].mensagens);
  }
  assert.ok(visto[0].fracao > 0 && visto[0].fracao < 1);
  assert.equal(visto.at(-1).fracao, 1);
  assert.equal(visto.at(-1).mensagens, 281);
});

test('mensagensEntre: cancelar antes, a meio, ou dentro do pedido', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });

  const antes = new AbortController();
  antes.abort();
  const k1 = kickDoChat(registo);
  await assert.rejects(mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar: k1.buscar, sinal: antes.signal }), { name: 'AbortError' });
  assert.equal(k1.pedidos.length, 0, 'cancelado antes não pede nada');

  const meio = new AbortController();
  const k2 = kickDoChat(registo);
  await assert.rejects(mensagensEntre(ID, T0, T0 + 60 * MIN, {
    buscar: k2.buscar, sinal: meio.signal, aoProgredir: (p) => { if (p.pedidos === 2) meio.abort(); },
  }), { name: 'AbortError' });
  assert.equal(k2.pedidos.length, 2, 'não sai mais nenhum pedido depois de cancelar');
  assert.equal(k2.pedidos[0].op.signal, meio.signal, 'o sinal chega à buscar');

  const dentro = new AbortController();
  const buscar = async () => { dentro.abort(); throw new DOMException('aborted', 'AbortError'); };
  await assert.rejects(mensagensEntre(ID, T0, T0 + 60 * MIN, { buscar, sinal: dentro.signal }), { name: 'AbortError' });
});

// ── calor ───────────────────────────────────────────────────────────────────

test('calor: conta por minuto, com as pontas no sítio certo', () => {
  const m = (ms) => ({ ms });
  const c = calor([
    m(T0), m(T0 + 59_999), m(T0 + 60_000), m(T0 + 150_000), m(T0 + 179_999),
    m(T0 + 180_000), // = ate: fora
    m(T0 - 1),       // antes: fora
    m(NaN), {}, null,
  ], T0, T0 + 180_000);
  assert.ok(c instanceof Float64Array);
  assert.deepEqual([...c], [2, 1, 2]);
});

test('calor: o último balde pode ser mais curto, e conta como vem', () => {
  const c = calor([{ ms: T0 + 61_000 }, { ms: T0 + 89_000 }], T0, T0 + 90_000);
  assert.equal(c.length, 2);
  assert.deepEqual([...c], [0, 2]);
});

test('calor: outro passo, janela vazia e passo impossível', () => {
  const msgs = [0, 5_000, 9_999, 10_000, 25_000].map((d) => ({ ms: T0 + d }));
  assert.deepEqual([...calor(msgs, T0, T0 + 30_000, 10_000)], [3, 1, 1]);
  assert.equal(calor(msgs, T0, T0).length, 0);
  assert.equal(calor(msgs, T0 + 1, T0).length, 0);
  assert.equal(calor(null, T0, T0 + MIN).length, 1);
  for (const passo of [0, -60_000, NaN, Infinity]) {
    assert.throws(() => calor(msgs, T0, T0 + MIN, passo), RangeError, String(passo));
  }
});

// ── picos ───────────────────────────────────────────────────────────────────

test('picos: a hora medida dá os dois minutos de KEKW, e só esses', () => {
  const msgs = chatSintetico(HORA).map((m) => ({ ms: Math.floor(m.us / 1e6) * 1000 }));
  const c = calor(msgs, T0, T0 + 60 * MIN);
  assert.deepEqual([...c], HORA);
  // O 9 a seguir ao primeiro lance é o chat a escorrer: abaixo de 3x4 = 12,
  // por isso não faz um pico à parte.
  assert.deepEqual(picos(c), [13, 41]);
});

test('picos: baldes seguidos são um lance só, no mais forte', () => {
  assert.deepEqual(picos([4, 4, 20, 25, 18, 4, 4]), [3]);
  // Empate: fica o primeiro, que é o mais perto do lance.
  assert.deepEqual(picos([4, 4, 20, 20, 4, 4]), [2]);
  // Separados por um balde normal são dois.
  assert.deepEqual(picos([4, 30, 4, 4, 30, 4, 4]), [1, 4]);
});

test('picos: um pico no princípio ou no fim também conta', () => {
  assert.deepEqual(picos([30, 4, 4, 4, 4]), [0]);
  assert.deepEqual(picos([4, 4, 4, 4, 30]), [4]);
  assert.deepEqual(picos([4, 4, 4, 20, 30]), [4]);
});

test('picos: um canal quase calado não tem picos de três mensagens', () => {
  const calado = [0, 0, 1, 0, 3, 0, 0, 1, 0];
  assert.deepEqual(picos(calado), [], 'mediana 1: só o fator fazia do 3 um lance, e é o mínimo que não deixa');
  assert.deepEqual(picos(calado, { minimo: 2 }), [4]);
  // Desligado metade da janela: os zeros não contam para a mediana (5,5), e
  // o vaivém normal de 4 a 7 fica abaixo do limite.
  assert.deepEqual(picos([0, 0, 0, 0, 0, 0, 5, 6, 4, 7, 5, 20]), [11]);
});

test('picos: horas desligado na janela não puxam o limite para o chão', () => {
  // A noite do evento em que o canal só entrou no ar ao minuto 300 de 480, a
  // uns 40 por minuto, com dois lances. Com os 300 zeros na mediana ela era
  // 0, o limite caía no mínimo (8), a noite inteira ficava acima dele e saía
  // um pico só: o segundo lance perdia-se.
  const r = aleatorio(11);
  const c = new Float64Array(480);
  for (let i = 300; i < 480; i++) c[i] = 30 + Math.floor(r() * 21);
  c[350] = 200;
  c[420] = 180;
  assert.deepEqual(picos(c), [350, 420]);
});

test('picos: o fator conta sobre a mediana', () => {
  const c = [10, 10, 10, 25, 10];
  assert.deepEqual(picos(c), [], '25 < 3 x 10');
  assert.deepEqual(picos(c, { fator: 2 }), [3]);
});

test('picos: a mediana de um número par de baldes é a média das duas do meio', () => {
  // Por ordem são 1, 2, 4, 7: as do meio são 2 e 4, a mediana é 3 e o limite
  // 2 x 3 = 6, por isso só o 7 passa. Com a de baixo (2) o limite era 4 e o 4
  // também passava; com a de cima (4) era 8 e não passava nenhum.
  assert.deepEqual(picos([4, 1, 7, 2], { fator: 2, minimo: 1 }), [2]);
});

test('picos: vazio, lista simples e valores estragados', () => {
  assert.deepEqual(picos(new Float64Array(0)), []);
  assert.deepEqual(picos([]), []);
  assert.deepEqual(picos(null), []);
  assert.deepEqual(picos([4, NaN, 4, 30, 4, undefined, 4]), [3]);
});

// ── reacoes ─────────────────────────────────────────────────────────────────

const msg = (texto) => ({ texto });

test('reacoes: o minuto de KEKW diz KEKW e kk', () => {
  const lance = chatSintetico(HORA, { texto: textoDaHora })
    .filter((m) => Math.floor((m.us / 1000 - T0) / MIN) === 13)
    .map((m) => ({ texto: m.texto }));
  const r = reacoes(lance);
  assert.deepEqual(r.slice(0, 2), [
    { nome: 'KEKW', vezes: 15, tipo: 'emote' },
    { nome: 'kk', vezes: 15, tipo: 'palavra' },
  ]);
  assert.ok(!r.some((x) => x.nome === 'emote' || x.nome === 'sens' || x.nome === 'tchubi'));
});

test('reacoes: um emote repetido na mesma mensagem é uma pessoa, não quatro', () => {
  const r = reacoes([
    msg('[emote:37226:KEKW] [emote:37226:KEKW] [emote:37226:KEKW] [emote:37226:KEKW]'),
    msg('[emote:37226:KEKW]'),
    msg('[emote:4055796:ODAJAM][emote:4055796:ODAJAM]'),
  ]);
  assert.deepEqual(r, [
    { nome: 'KEKW', vezes: 2, tipo: 'emote' },
    { nome: 'ODAJAM', vezes: 1, tipo: 'emote' },
  ]);
});

test('reacoes: palavras em minúsculas, só letras, duas ou mais', () => {
  const r = reacoes([msg('GG WP'), msg('gg 1v4 w'), msg('Não ACREDITO'), msg('não')], { quantas: 10 });
  assert.deepEqual(r, [
    { nome: 'gg', vezes: 2, tipo: 'palavra' },
    { nome: 'não', vezes: 2, tipo: 'palavra' },
    { nome: 'acredito', vezes: 1, tipo: 'palavra' },
    { nome: 'wp', vezes: 1, tipo: 'palavra' },
  ]);
});

test('reacoes: gargalhadas esticadas são a mesma gargalhada', () => {
  const r = reacoes([msg('kkkk'), msg('KKKKKKK'), msg('kkkkkkkkkkk'), msg('kk'), msg('NOOOOO'), msg('carro')], { quantas: 10 });
  assert.deepEqual(r, [
    { nome: 'kk', vezes: 4, tipo: 'palavra' },
    { nome: 'carro', vezes: 1, tipo: 'palavra' },
    { nome: 'noo', vezes: 1, tipo: 'palavra' },
  ]);
});

test('reacoes: endereços, @menções e !comandos ficam de fora', () => {
  const r = reacoes([
    msg('https://linktr.ee/OTchubi Me siga nas outras plataformas'),
    msg('!sens'),
    msg('!drops agora'),
    msg('Obrigado por seguir @Chiruc0'),
    msg('www.kick.com/tchubi'),
  ], { quantas: 20 });
  const nomes = r.map((x) => x.nome);
  for (const fora of ['https', 'linktr', 'ee', 'otchubi', 'sens', 'drops', 'chiruc', 'www', 'kick', 'com']) {
    assert.ok(!nomes.includes(fora), `${fora} não é uma reacção`);
  }
  assert.ok(nomes.includes('obrigado'));
  assert.ok(nomes.includes('agora'));
  assert.ok(!nomes.includes('me') && !nomes.includes('por'), 'palavras de ligação não contam');
});

test('reacoes: as palavras de ligação saem, a não ser que se peça', () => {
  const textos = [msg('que jogada'), msg('que isso'), msg('de novo'), msg('the play')];
  assert.ok(!reacoes(textos, { quantas: 10 }).some((x) => ['que', 'de', 'the', 'isso'].includes(x.nome)));
  assert.deepEqual(reacoes(textos, { quantas: 1, ignorar: new Set() }), [{ nome: 'que', vezes: 2, tipo: 'palavra' }]);
});

test('reacoes: quantas, empates pelo nome, e nada de onde não há nada', () => {
  const textos = [msg('zz'), msg('aa'), msg('mm'), msg('aa')];
  assert.deepEqual(reacoes(textos, { quantas: 3 }).map((x) => x.nome), ['aa', 'mm', 'zz']);
  assert.deepEqual(reacoes(textos, { quantas: 1 }).map((x) => x.nome), ['aa']);
  assert.deepEqual(reacoes(textos), reacoes(textos, { quantas: 5 }));
  assert.deepEqual(reacoes(textos, { quantas: 0 }), []);
  assert.deepEqual(reacoes(textos, { quantas: -2 }), []);
  assert.deepEqual(reacoes([]), []);
  assert.deepEqual(reacoes(null), []);
  assert.deepEqual(reacoes([null, {}, { texto: 42 }, msg('')]), []);
});

// ── tudo junto ──────────────────────────────────────────────────────────────

test('do chat ao lance: mensagens -> calor -> picos -> o que se disse', async () => {
  const registo = chatSintetico(HORA, { texto: textoDaHora });
  const de = T0;
  const ate = T0 + 60 * MIN;
  const lista = await mensagensEntre(ID, de, ate, { buscar: kickDoChat(registo).buscar });
  const c = calor(lista, de, ate);
  const p = picos(c);
  assert.deepEqual(p, [13, 41]);
  for (const i of p) {
    const noMinuto = lista.filter((m) => m.ms >= de + i * MIN && m.ms < de + (i + 1) * MIN);
    assert.equal(reacoes(noMinuto, { quantas: 1 })[0].nome, 'KEKW', `minuto ${i}`);
  }
});
