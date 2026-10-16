// O chat de um trecho longo lido em duas faixas ao mesmo tempo (lote B4, 16/10): o ensaio com a Kick a
// sério leu 15 min de Kodd em 20 s em vez de 38 s, com os mesmos 42 pedidos. Aqui prova-se que dividir
// não muda NADA do que sai — as mesmas mensagens, as mesmas janelas de detecção e os mesmos picos,
// com a mesma intensidade — e que o teto de páginas, a cobertura parcial, o cancelar, o 429 e o
// progresso continuam certos. Cada caso lê o mesmo trecho numa faixa só (`faixasDoChat = 1`, a
// leitura de antes) e em duas, cada um na sua página, e compara.
//
// A Kick de mentira daqui é mais fiel do que a de falsa.mjs num ponto que importa: o cursor é o instante
// da mensagem mais velha da página em MICROSSEGUNDOS, e a data que vem na mensagem é ao segundo. Assim
// um segundo com mais mensagens do que cabem numa página atravessa-se como na Kick, sem perder nenhuma.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador', timeout: 120_000 };
const MIN = 60_000;
const CANAIS = ['tchubi', 'outro', 'terceiro'];
const dormir = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

/**
 * As mensagens de um canal, da mais velha para a mais nova: `porSegundo` a cada segundo de [de, ate),
 * mais `extras` ({ deMs, ateMs, n }: n espalhadas nesse pedaço) e `cheios` ({ deMs, ateMs, n }: n em
 * CADA segundo desse pedaço, para segundos que não cabem numa página). Cada uma tem o seu instante em
 * microssegundos, como a Kick guarda; `created_at` vem truncado ao segundo, como a Kick manda.
 */
function chatDe(canal, { de = T, ate = T + 20 * MIN, porSegundo = 1, extras = [], cheios = [] } = {}) {
  const us = [];
  const passo = 1000 / porSegundo;
  if (porSegundo > 0) for (let ms = de; ms < ate; ms += passo) us.push(Math.round(ms * 1000) + 137);
  for (const { deMs, ateMs, n } of extras) {
    for (let k = 0; k < n; k++) us.push(Math.round((deMs + ((ateMs - deMs) * k) / n) * 1000) + 311);
  }
  for (const { deMs, ateMs, n } of cheios) {
    for (let s = deMs; s < ateMs; s += 1000) for (let k = 0; k < n; k++) us.push(s * 1000 + 1 + k * 997);
  }
  us.sort((a, b) => a - b);
  return us.map((u, k) => ({
    id: `${canal}-${k}`,
    us: u,
    created_at: new Date(Math.floor(u / 1e6) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'),
    content: 'kkk',
    sender: { slug: `fa${k % 7}` },
  }));
}

/**
 * Por cima de kickFalsa (que dá os números dos canais): o chat de cada canal com cursores em µs.
 * `atrasoMs` segura cada resposta, para as faixas se verem no ar ao mesmo tempo. `tamanho(n)` é o
 * tamanho da n-ésima página (por omissão 25, o máximo medido). `repetir` devolve também a mensagem do
 * próprio cursor (a da fronteira vem duas vezes). `antes(pedido)` pode responder outra coisa.
 */
async function kickDoChat(p, chats, { atrasoMs = 0, tamanho = () => 25, repetir = false, antes = null } = {}) {
  const estat = { noAr: 0, maxNoAr: 0, pedidos: [] };
  await p.route('**/api/v2/channels/*/messages**', async (rota) => {
    const u = new URL(rota.request().url());
    const canal = CANAIS[Number(u.pathname.match(/channels\/(\d+)\/messages/)?.[1]) - 1000];
    const cursor = Number(u.searchParams.get('cursor'));
    const pedido = { canal, cursor, t: Date.now(), n: estat.pedidos.length };
    estat.pedidos.push(pedido);
    estat.noAr++;
    estat.maxNoAr = Math.max(estat.maxNoAr, estat.noAr);
    try {
      if (atrasoMs) await dormir(atrasoMs);
      // `antes` pode também segurar o pedido (uma promessa); se a página entretanto o largou, responder
      // já não vale e não é erro do teste.
      const outra = await antes?.(pedido);
      if (outra) return await rota.fulfill(outra).catch(() => {});
      const lista = chats[canal] || [];
      const velhas = lista.filter((m) => (repetir ? m.us <= cursor : m.us < cursor));
      const pagina = velhas.slice(-tamanho(pedido.n)).reverse();
      return await rota.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          data: {
            messages: pagina.map(({ us, ...m }) => m),
            cursor: pagina.length ? String(pagina.at(-1).us) : null,
          },
        }),
      });
    } finally {
      estat.noAr--;
    }
  });
  return estat;
}

/** Uma página nova com a Kick de mentira, e `faixas` como teto de faixas por trecho. */
async function pagina(chats, opcoes = {}, faixas = 2) {
  const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
  await kickFalsa(p, { canais: CANAIS });
  const estat = await kickDoChat(p, chats, opcoes);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.evaluate((n) => { window.__evento.faixasDoChat = n; }, faixas);
  return { p, erros, estat };
}

/** Ler o chat de `canal` em [de, ate) pela mesma porta da página, e o que voltou mais o progresso. */
const ler = (p, canal, de, ate) => p.evaluate(async ({ c, a, b }) => {
  const fracoes = [];
  try {
    const r = await window.__evento.lerChatTrecho(c, a, b, { aoProgredir: ({ fracao }) => fracoes.push(fracao) });
    return { ...r, fracoes };
  } catch (e) {
    return { erro: e?.name || String(e), fracoes };
  }
}, { c: canal, a: de, b: ate });

/** Tudo o que a leitura deixou: mensagens (por ordem), janelas de detecção, picos e o que se baixou. */
const estadoDo = (p, canal) => p.evaluate((c) => {
  const ev = window.__evento;
  return {
    ids: (ev.mensagens.get(c) || []).map((m) => m.id),
    janelas: ev.janelasDoChat(c),
    marcas: ev.marcas.get(c) || [],
    coberto: ev.cobertoDoChat ? ev.cobertoDoChat(c) : null,
  };
}, canal);

// As que a leitura de [de, ate) tem de trazer: a data ao segundo dentro do trecho, como em `mensagensEntre`.
const idsEm = (lista, de, ate) => lista.filter((m) => {
  const ms = Math.floor(m.us / 1e6) * 1000;
  return ms >= de && ms < ate;
}).map((m) => m.id);
const subiu = (fr) => fr.every((f, k) => f >= 0 && f <= 1 && (k === 0 || f >= fr[k - 1]));

// Os cenários parciais com referência independente: a mesma leitura feita pelo código de ANTES do B4
// (HEAD 38291478, gravado numa worktree à parte) deixou as janelas de detecção de REFERENCIA_HEAD. A
// falha cai numa banda de cursores (21:14–21:15) acima do corte das duas faixas, na faixa de cima, que
// segue os mesmos cursores da leitura de uma faixa: as janelas têm de sair iguais nos dois modos.
const BANDA = [T + 14 * MIN, T + 15 * MIN];
const naBanda = (cursor) => cursor >= BANDA[0] * 1000 && cursor < BANDA[1] * 1000;
const PARCIAIS = {
  403: () => ({ chat: DENSO_PARCIAL, ate: T + 20 * MIN, antes: ({ cursor }) => (naBanda(cursor) ? { status: 403, headers: { 'access-control-allow-origin': '*' }, body: '' } : null) }),
  429: () => ({ chat: DENSO_PARCIAL, ate: T + 20 * MIN, antes: ({ cursor }) => (naBanda(cursor) ? { status: 429, headers: { 'access-control-allow-origin': '*' }, body: '' } : null) }),
  // Um pedaço só com mais de 400 páginas: pára no travão.
  travao: () => ({ chat: { de: T, ate: T + 40 * MIN, porSegundo: 5 }, ate: T + 40 * MIN, antes: null }),
  // Parar quando a leitura chega à banda: o pedido fica preso e a leitura é cancelada.
  cancelar: (p, soltar) => ({
    chat: DENSO_PARCIAL,
    ate: T + 20 * MIN,
    antes: async ({ cursor }) => {
      if (!naBanda(cursor)) return null;
      await p.evaluate(() => window.__parar.abort()).catch(() => {});
      await soltar;
      return null;
    },
  }),
};
const DENSO_PARCIAL = {
  porSegundo: 1,
  extras: [{ deMs: T + 3 * MIN, ateMs: T + 4 * MIN, n: 200 }, { deMs: T + 17 * MIN, ateMs: T + 18 * MIN, n: 250 }],
};
/** Uma leitura parcial do cenário `nome`, numa página nova, e as janelas de detecção que deixou. */
async function lerParcial(nome, faixas) {
  let largar;
  const soltar = new Promise((ok) => { largar = ok; });
  const { p, erros, estat } = await abrir({ ecra: { width: 1280, height: 800 } }).then(async ({ p: pg, erros: er }) => {
    const cen = PARCIAIS[nome](pg, soltar);
    await kickFalsa(pg, { canais: CANAIS });
    const est = await kickDoChat(pg, { tchubi: chatDe('tchubi', cen.chat) }, { antes: cen.antes });
    await pg.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await pg.evaluate((n) => { window.__evento.faixasDoChat = n; }, faixas);
    return { p: pg, erros: er, estat: est, cen };
  });
  try {
    const ate = PARCIAIS[nome](p, soltar).ate;
    const r = await p.evaluate(async ({ a, b }) => {
      window.__parar = new AbortController();
      try {
        const x = await window.__evento.lerChatTrecho('tchubi', a, b, { sinal: window.__parar.signal });
        return { motivo: x.motivo };
      } catch (e) {
        return { erro: e?.name || String(e) };
      }
    }, { a: T, b: ate });
    const e = await p.evaluate(() => ({
      janelas: window.__evento.janelasDoChat('tchubi'),
      coberto: window.__evento.cobertoDoChat ? window.__evento.cobertoDoChat('tchubi') : null,
      mensagens: (window.__evento.mensagens.get('tchubi') || []).length,
    }));
    return { ...r, ...e, pedidos: estat.pedidos.length, maxNoAr: estat.maxNoAr, erros };
  } finally {
    largar();
    await p.close();
  }
}

// Base de 1 mensagem por segundo durante 20 min, três picos (um em cada metade e um no meio, onde a
// leitura se divide) e, nesse meio, segundos com 30 mensagens cada, mais do que cabem numa página.
const DENSO = {
  porSegundo: 1,
  extras: [{ deMs: T + 3 * MIN, ateMs: T + 4 * MIN, n: 200 }, { deMs: T + 15 * MIN, ateMs: T + 16 * MIN, n: 250 }],
  cheios: [{ deMs: T + 9 * MIN + 10_000, ateMs: T + 9 * MIN + 36_000, n: 30 }],
};

test('um trecho denso lê em duas faixas e acaba igual a uma faixa só: mensagens, janelas e picos',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    const so = await pagina(chats, { atrasoMs: 10 }, 1);
    const duas = await pagina(chats, { atrasoMs: 10 }, 2);
    try {
      const r1 = await ler(so.p, 'tchubi', T, T + 20 * MIN);
      const r2 = await ler(duas.p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r1.motivo, null, JSON.stringify(r1));
      assert.equal(r2.motivo, null, JSON.stringify(r2));
      const e1 = await estadoDo(so.p, 'tchubi');
      const e2 = await estadoDo(duas.p, 'tchubi');
      // Todas, nenhuma a dobrar, pela mesma ordem.
      assert.deepEqual(e1.ids, idsEm(chats.tchubi, T, T + 20 * MIN));
      assert.deepEqual(e2.ids, e1.ids);
      // As mesmas referências de detecção, pela mesma ordem, e os mesmos picos com a mesma intensidade.
      assert.deepEqual(e2.janelas, e1.janelas);
      assert.ok(e1.marcas.length >= 3, `picos: ${JSON.stringify(e1.marcas)}`);
      assert.deepEqual(e2.marcas, e1.marcas);
      assert.deepEqual(e2.coberto, [[T, T + 20 * MIN]]);
      // Dividiu de facto (duas faixas no ar), e custou no máximo um pedido a mais, o da fronteira.
      assert.equal(so.estat.maxNoAr, 1);
      assert.ok(duas.estat.maxNoAr >= 2, `nunca houve duas faixas no ar: ${duas.estat.maxNoAr}`);
      assert.ok(duas.estat.pedidos.length <= so.estat.pedidos.length + 1,
        `${duas.estat.pedidos.length} pedidos contra ${so.estat.pedidos.length}`);
      assert.equal(r2.pedidos, duas.estat.pedidos.length);
      assert.equal(r2.tentativas, duas.estat.pedidos.length);
      assert.ok(subiu(r2.fracoes) && r2.fracoes.at(-1) === 1, JSON.stringify(r2.fracoes));
      assert.ok(subiu(r1.fracoes) && r1.fracoes.at(-1) === 1, JSON.stringify(r1.fracoes));
      assert.deepEqual(so.erros, []);
      assert.deepEqual(duas.erros, []);
    } finally {
      await so.p.close();
      await duas.p.close();
    }
  });

test('um canal calado não divide: os mesmos pedidos, pela mesma ordem, de uma faixa só',
  semNavegador, async () => {
    const chats = { outro: chatDe('outro', { porSegundo: 0, extras: [{ deMs: T, ateMs: T + 20 * MIN, n: 60 }] }) };
    const so = await pagina(chats, {}, 1);
    const duas = await pagina(chats, {}, 2);
    try {
      const r1 = await ler(so.p, 'outro', T, T + 20 * MIN);
      const r2 = await ler(duas.p, 'outro', T, T + 20 * MIN);
      assert.equal(r1.motivo, null);
      assert.equal(r2.motivo, null);
      assert.deepEqual(duas.estat.pedidos.map((x) => x.cursor), so.estat.pedidos.map((x) => x.cursor));
      assert.equal(duas.estat.maxNoAr, 1);
      const e1 = await estadoDo(so.p, 'outro');
      const e2 = await estadoDo(duas.p, 'outro');
      assert.equal(e1.ids.length, 60);
      assert.deepEqual(e2, e1);
    } finally {
      await so.p.close();
      await duas.p.close();
    }
  });

test('várias lacunas no mesmo trecho partilham um teto só de 400 páginas',
  semNavegador, async () => {
    // 5 mensagens por segundo em 40 min: umas 480 páginas. Duas janelas curtas lidas antes partem o
    // trecho em três lacunas de ~13 min (~160 páginas cada): cada uma cabe nas 400, as três não.
    const chats = { tchubi: chatDe('tchubi', { de: T, ate: T + 40 * MIN, porSegundo: 5 }) };
    for (const faixas of [1, 2]) {
      const { p, erros, estat } = await pagina(chats, {}, faixas);
      try {
        assert.equal((await ler(p, 'tchubi', T + 13 * MIN, T + 13 * MIN + 10_000)).motivo, null);
        assert.equal((await ler(p, 'tchubi', T + 26 * MIN, T + 26 * MIN + 10_000)).motivo, null);
        const antes = estat.pedidos.length;
        const r = await ler(p, 'tchubi', T, T + 40 * MIN);
        const gastos = estat.pedidos.length - antes;
        assert.ok(gastos <= 400, `${faixas} faixa(s): ${gastos} páginas num trecho com teto de 400`);
        assert.equal(r.motivo, 'max-pedidos', `${faixas} faixa(s): ${JSON.stringify({ ...r, fracoes: r.fracoes.length })}`);
        assert.ok(r.fracoes.at(-1) < 1, `parou e o progresso disse ${r.fracoes.at(-1)}`);
        const e = await estadoDo(p, 'tchubi');
        // O trecho inteiro não virou janela de detecção: ficou um buraco por ler.
        assert.ok(!e.janelas.some(([a, b]) => a === T && b === T + 40 * MIN), JSON.stringify(e.janelas));
        assert.deepEqual(erros, []);
      } finally {
        await p.close();
      }
    }
  });

test('mensagens repetidas na fronteira das páginas, páginas curtas e segundos cheios não se perdem nem dobram',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    const opcoes = { repetir: true, tamanho: (n) => (n % 3 === 2 ? 9 : 25) };
    const so = await pagina(chats, opcoes, 1);
    const duas = await pagina(chats, opcoes, 2);
    try {
      const r1 = await ler(so.p, 'tchubi', T, T + 20 * MIN);
      const r2 = await ler(duas.p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r1.motivo, null, JSON.stringify(r1));
      assert.equal(r2.motivo, null, JSON.stringify(r2));
      const e1 = await estadoDo(so.p, 'tchubi');
      const e2 = await estadoDo(duas.p, 'tchubi');
      assert.deepEqual(e1.ids, idsEm(chats.tchubi, T, T + 20 * MIN));
      assert.deepEqual(e2.ids, e1.ids);
      assert.deepEqual(e2.janelas, e1.janelas);
      assert.deepEqual(e2.marcas, e1.marcas);
      assert.ok(duas.estat.maxNoAr >= 2);
    } finally {
      await so.p.close();
      await duas.p.close();
    }
  });

test('um cursor parado numa faixa não vira trecho lido, e retomar fecha o buraco',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    let parado = true;
    // Abaixo das 21:05 a Kick devolve sempre a mesma página e o mesmo cursor.
    const preso = T + 5 * MIN;
    const { p, erros, estat } = await pagina(chats, {
      antes: ({ cursor }) => {
        if (!parado || cursor >= preso * 1000) return null;
        const pag = chats.tchubi.filter((m) => m.us < preso * 1000).slice(-25).reverse();
        return {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { messages: pag.map(({ us, ...m }) => m), cursor: String(cursor) } }),
        };
      },
    }, 2);
    try {
      const r = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r.motivo, 'cursor-parado', JSON.stringify(r));
      let e = await estadoDo(p, 'tchubi');
      assert.ok(!e.janelas.some(([a, b]) => a === T && b === T + 20 * MIN), JSON.stringify(e.janelas));
      assert.ok(e.coberto.every(([a]) => a > T), `cobriu o que não leu: ${JSON.stringify(e.coberto)}`);
      parado = false;
      const antes = estat.pedidos.length;
      const r2 = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r2.motivo, null, JSON.stringify(r2));
      e = await estadoDo(p, 'tchubi');
      assert.deepEqual(e.ids, idsEm(chats.tchubi, T, T + 20 * MIN));
      assert.deepEqual(e.coberto, [[T, T + 20 * MIN]]);
      assert.ok(e.janelas.some(([a, b]) => a === T && b === T + 20 * MIN));
      // A retomada não releu o que já tinha: nenhum pedido acima do fim do que ficou coberto e lido.
      const topo = Math.max(...estat.pedidos.slice(antes).map((x) => x.cursor));
      assert.ok(topo <= preso * 1000 + 60_000_000, `releu desde ${new Date(topo / 1000).toISOString()}`);
      assert.deepEqual(erros.filter((x) => !/429|403|Failed to load/.test(x)), []);
    } finally {
      await p.close();
    }
  });

test('uma faixa que falha deixa a outra acabar, e retomar lê só o buraco',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    let falha = true;
    const limite = T + 6 * MIN;
    const { p, erros, estat } = await pagina(chats, {
      atrasoMs: 5,
      antes: ({ cursor }) => (falha && cursor < limite * 1000 && cursor > T * 1000
        ? { status: 403, headers: { 'access-control-allow-origin': '*' }, body: '' } : null),
    }, 2);
    try {
      const r = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r.motivo, 'http-403', JSON.stringify(r));
      assert.ok(r.fracoes.at(-1) < 1, `falhou e o progresso disse ${r.fracoes.at(-1)}`);
      assert.ok(subiu(r.fracoes));
      let e = await estadoDo(p, 'tchubi');
      // A outra faixa acabou: há mensagens dos últimos minutos e do pico das 21:15.
      assert.ok(e.ids.length > 0 && e.marcas.some((m) => m.ms >= T + 15 * MIN && m.ms < T + 16 * MIN), JSON.stringify(e.marcas));
      assert.ok(e.coberto.every(([a]) => a >= limite - 60_000), `cobriu o buraco: ${JSON.stringify(e.coberto)}`);
      assert.ok(!e.janelas.some(([a, b]) => a === T && b === T + 20 * MIN));
      falha = false;
      const antes = estat.pedidos.length;
      const r2 = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r2.motivo, null);
      e = await estadoDo(p, 'tchubi');
      assert.deepEqual(e.ids, idsEm(chats.tchubi, T, T + 20 * MIN));
      assert.deepEqual(e.coberto, [[T, T + 20 * MIN]]);
      const topo = Math.max(...estat.pedidos.slice(antes).map((x) => x.cursor));
      assert.ok(topo <= limite * 1000 + 60_000_000, `releu desde ${new Date(topo / 1000).toISOString()}`);
      assert.deepEqual(erros.filter((x) => !/403|Failed to load/.test(x)), []);
    } finally {
      await p.close();
    }
  });

test('cancelar com as duas faixas no ar guarda o que veio, e retomar acaba igual a uma leitura só',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    const so = await pagina(chats, {}, 1);
    const { p, erros, estat } = await pagina(chats, { atrasoMs: 40 }, 2);
    try {
      await ler(so.p, 'tchubi', T, T + 20 * MIN);
      const inteiro = await estadoDo(so.p, 'tchubi');
      await p.evaluate(({ a, b }) => {
        window.__parar = new AbortController();
        window.__leitura = window.__evento.lerChatTrecho('tchubi', a, b, { sinal: window.__parar.signal })
          .then((r) => ({ r }), (e) => ({ erro: e?.name }));
      }, { a: T, b: T + 20 * MIN });
      for (let k = 0; k < 200 && estat.maxNoAr < 2; k++) await dormir(20);
      assert.ok(estat.maxNoAr >= 2, 'as duas faixas nunca estiveram no ar');
      await dormir(150);
      const quando = estat.pedidos.length;
      await p.evaluate(() => window.__parar.abort());
      const fim = await p.evaluate(() => window.__leitura);
      assert.equal(fim.erro, 'AbortError', JSON.stringify(fim));
      await dormir(200);
      assert.ok(estat.pedidos.length <= quando + 2, `continuou a pedir depois de parar: ${estat.pedidos.length - quando}`);
      let e = await estadoDo(p, 'tchubi');
      assert.ok(e.ids.length > 0 && e.ids.length < inteiro.ids.length, `${e.ids.length} de ${inteiro.ids.length}`);
      // O que ficou coberto foi de facto baixado: cada mensagem do coberto está lá.
      for (const [a, b] of e.coberto) {
        const esperado = idsEm(chats.tchubi, a, b);
        const tem = new Set(e.ids);
        assert.ok(esperado.every((id) => tem.has(id)), `buraco dentro do coberto [${a}, ${b})`);
      }
      const r2 = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r2.motivo, null);
      e = await estadoDo(p, 'tchubi');
      // As mesmas, pela mesma ordem, também dentro do segundo onde se parou e se retomou.
      assert.deepEqual(e.ids, inteiro.ids);
      assert.deepEqual(e.coberto, [[T, T + 20 * MIN]]);
      assert.ok(e.janelas.some(([a, b]) => a === T && b === T + 20 * MIN));
      assert.deepEqual(erros, []);
    } finally {
      await so.p.close();
      await p.close();
    }
  });

test('cancelar durante a espera de um 429 pára logo, sem mais pedidos', semNavegador, async () => {
  const chats = { tchubi: chatDe('tchubi', DENSO) };
  let primeiro = true;
  const { p, estat } = await pagina(chats, {
    antes: () => {
      if (!primeiro) return null;
      primeiro = false;
      return { status: 429, headers: { 'access-control-allow-origin': '*' }, body: '' };
    },
  }, 2);
  try {
    await p.evaluate(({ a, b }) => {
      window.__parar = new AbortController();
      window.__leitura = window.__evento.lerChatTrecho('tchubi', a, b, { sinal: window.__parar.signal })
        .then((r) => ({ r }), (e) => ({ erro: e?.name }));
    }, { a: T, b: T + 20 * MIN });
    for (let k = 0; k < 100 && !estat.pedidos.length; k++) await dormir(10);
    await dormir(300);
    const t0 = Date.now();
    await p.evaluate(() => window.__parar.abort());
    const fim = await p.evaluate(() => window.__leitura);
    assert.equal(fim.erro, 'AbortError');
    assert.ok(Date.now() - t0 < 1000, `demorou ${Date.now() - t0} ms a parar`);
    await dormir(2500);
    assert.equal(estat.pedidos.length, 1, 'pediu outra vez depois de parar');
  } finally {
    await p.close();
  }
});

test('um 429 com Retry-After curto pára as duas faixas até lá, e a leitura acaba completa',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    let quando429 = null;
    const { p, erros, estat } = await pagina(chats, {
      atrasoMs: 10,
      // O primeiro pedido da faixa de baixo (o cursor do corte, abaixo do que a sonda leu) leva 429.
      antes: ({ cursor, t }) => {
        if (quando429 || cursor > (T + 12 * MIN) * 1000) return null;
        quando429 = t;
        return {
          status: 429,
          headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After', 'retry-after': '2' },
          body: '',
        };
      },
    }, 2);
    try {
      const r = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r.motivo, null, JSON.stringify(r));
      assert.ok(quando429, 'nunca houve 429');
      // Depois do 429, nenhum pedido NOVO (das duas faixas) antes dos 2 s.
      const depois = estat.pedidos.filter((x) => x.t > quando429 + 30);
      assert.ok(depois.length > 0);
      assert.ok(depois.every((x) => x.t >= quando429 + 1900), `pedido ${Math.min(...depois.map((x) => x.t - quando429))} ms depois do 429`);
      assert.equal(r.tentativas, estat.pedidos.length);
      assert.equal(r.tentativas, r.pedidos + 1, 'a tentativa do 429 não ficou contada à parte');
      const e = await estadoDo(p, 'tchubi');
      assert.deepEqual(e.ids, idsEm(chats.tchubi, T, T + 20 * MIN));
      assert.deepEqual(erros.filter((x) => !/429|Failed to load/.test(x)), []);
    } finally {
      await p.close();
    }
  });

test('um 429 com Retry-After acima de 60 s acaba em rate-limit sem voltar a pedir à Kick',
  semNavegador, async () => {
    const chats = { tchubi: chatDe('tchubi', DENSO) };
    let quando429 = null;
    const { p, estat } = await pagina(chats, {
      antes: ({ n, t }) => {
        if (n !== 2) return null;
        quando429 = t;
        return {
          status: 429,
          headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After', 'retry-after': '120' },
          body: '',
        };
      },
    }, 2);
    try {
      const r = await ler(p, 'tchubi', T, T + 20 * MIN);
      assert.equal(r.motivo, 'rate-limit', JSON.stringify({ ...r, fracoes: r.fracoes.length }));
      assert.ok(quando429);
      assert.equal(estat.pedidos.filter((x) => x.t > quando429 + 30).length, 0, 'voltou a pedir à Kick antes do Retry-After');
      assert.ok(r.fracoes.at(-1) < 1);
    } finally {
      await p.close();
    }
  });

test('três canais lidos ao mesmo tempo nunca passam de 4 pedidos de chat no ar', semNavegador, async () => {
  const chats = Object.fromEntries(CANAIS.map((c) => [c, chatDe(c, DENSO)]));
  const { p, erros, estat } = await pagina(chats, { atrasoMs: 25 }, 2);
  try {
    const rs = await p.evaluate(({ a, b, canais }) => Promise.all(canais.map((c) => window.__evento.lerChatTrecho(c, a, b))),
      { a: T, b: T + 20 * MIN, canais: CANAIS });
    assert.ok(rs.every((r) => r.motivo === null), JSON.stringify(rs));
    assert.ok(estat.maxNoAr <= 4, `${estat.maxNoAr} pedidos no ar`);
    assert.ok(estat.maxNoAr >= 3, `${estat.maxNoAr} pedidos no ar: os três não correram juntos`);
    for (const c of CANAIS) assert.deepEqual((await estadoDo(p, c)).ids, idsEm(chats[c], T, T + 20 * MIN));
    assert.deepEqual(erros, []);
  } finally {
    await p.close();
  }
});

test('a vaga de um pedido só se solta com o corpo lido: cinco leituras com corpos lentos nunca passam de 4 transferências',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
    await kickFalsa(p, { canais: CANAIS });
    // A Kick daqui é o próprio fetch da página: o cabeçalho vem logo e o corpo 80 ms depois, e conta-se
    // cada transferência do pedido até o corpo ser lido até ao fim (ou largado). As rotas do Playwright
    // entregam o corpo inteiro de uma vez e não mostravam isto.
    await p.addInitScript(({ t0, min }) => {
      const transf = { agora: 0, max: 0, pedidos: 0 };
      window.__transf = transf;
      const original = window.fetch.bind(window);
      const msgs = (i) => {
        const l = [];
        for (let k = 0; k < 10 * 60; k++) {
          const us = (t0 + k * 1000) * 1000 + 137;
          l.push({ id: `lento${i}-${k}`, us, created_at: new Date(Math.floor(us / 1e6) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), content: 'kkk', sender: { slug: 'fa' } });
        }
        return l;
      };
      const chats = [0, 1, 2, 3, 4].map(msgs);
      window.fetch = (url, opcoes) => {
        const u = new URL(String(url), location.href);
        const canal = u.pathname.match(/\/api\/v2\/channels\/lento(\d)$/);
        if (canal) return Promise.resolve(new Response(JSON.stringify({ id: 2000 + Number(canal[1]), slug: `lento${canal[1]}` }), { status: 200 }));
        const chat = u.pathname.match(/\/api\/v2\/channels\/(20\d\d)\/messages$/);
        if (!chat) return original(url, opcoes);
        transf.pedidos++;
        transf.agora++;
        transf.max = Math.max(transf.max, transf.agora);
        let acabou = false;
        const acabar = () => { if (!acabou) { acabou = true; transf.agora--; } };
        const cursor = Number(u.searchParams.get('cursor'));
        const pagina = chats[Number(chat[1]) - 2000].filter((m) => m.us < cursor).slice(-25).reverse();
        const corpo = new TextEncoder().encode(JSON.stringify({
          data: { messages: pagina.map(({ us, ...m }) => m), cursor: pagina.length ? String(pagina.at(-1).us) : null },
        }));
        let enviado = false;
        const fluxo = new ReadableStream({
          async pull(ctrl) {
            if (enviado) { ctrl.close(); acabar(); return; }
            await new Promise((ok) => { setTimeout(ok, 80); });
            enviado = true;
            ctrl.enqueue(corpo);
          },
          cancel() { acabar(); },
        });
        return Promise.resolve(new Response(fluxo, { status: 200, headers: { 'content-type': 'application/json' } }));
      };
    }, { t0: T, min: MIN });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    try {
      const rs = await p.evaluate(({ a, b }) => {
        window.__evento.faixasDoChat = 1;
        return Promise.all([0, 1, 2, 3, 4].map((i) => window.__evento.lerChatTrecho(`lento${i}`, a, b)));
      }, { a: T, b: T + 10 * MIN });
      assert.ok(rs.every((r) => r.motivo === null && r.noTrecho === 600), JSON.stringify(rs));
      const transf = await p.evaluate(() => window.__transf);
      assert.ok(transf.max <= 4, `${transf.max} transferências de chat ao mesmo tempo`);
      assert.ok(transf.max >= 4, `${transf.max}: as cinco leituras não chegaram a disputar as vagas`);
      assert.equal(transf.agora, 0, 'ficou corpo por ler');
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

// Gravadas com o código do HEAD 38291478 (antes do B4), numa faixa só: outputs/b4-referencia-head.json.
const REFERENCIA_HEAD = {
  403: { motivo: 'http-403', janelas: [[T + 876_000, T + 1_200_000]] },
  429: { motivo: 'rate-limit', janelas: [[T + 876_000, T + 1_200_000]] },
  travao: { motivo: 'max-pedidos', janelas: [[T + 401_000, T + 2_400_000]] },
  cancelar: { erro: 'AbortError', janelas: [[T + 876_000, T + 1_200_000]] },
};
for (const nome of Object.keys(REFERENCIA_HEAD)) {
  test(`parcial (${nome}): as janelas de detecção são as do código de antes do B4, numa faixa e em duas`,
    semNavegador, async () => {
      const ref = REFERENCIA_HEAD[nome];
      for (const faixas of [1, 2]) {
        const r = await lerParcial(nome, faixas);
        const quem = `${faixas} faixa(s)`;
        if (ref.erro) assert.equal(r.erro, ref.erro, quem);
        else assert.equal(r.motivo, ref.motivo, quem);
        assert.deepEqual(r.janelas, ref.janelas, `${quem}: ${JSON.stringify(r.janelas.map(([a, b]) => [a - T, b - T]))}`);
        // Em duas faixas dividiu de facto; no travão não divide (o que falta não cabe no teto).
        if (faixas === 2) assert.ok(nome === 'travao' ? r.maxNoAr === 1 : r.maxNoAr >= 2, `${quem}: ${r.maxNoAr} no ar`);
        // O que se baixou contém a janela e nunca a banda que falhou.
        assert.ok(r.coberto.some(([a, b]) => a <= ref.janelas[0][0] && b >= ref.janelas[0][1]), `${quem}: ${JSON.stringify(r.coberto)}`);
        if (nome !== 'travao') assert.ok(!r.coberto.some(([a, b]) => a < BANDA[1] - 60_000 && b > BANDA[1] - 60_000), `${quem}: cobriu a banda`);
        assert.deepEqual(r.erros.filter((x) => !/403|429|Failed to load|ERR_FAILED/.test(x)), [], quem);
      }
    });
}

/**
 * A Kick dentro do `fetch` da página, para corpos que as rotas do Playwright não sabem fazer: cada canal
 * `lento<i>` (id 2000+i) tem um `modo` — 'rapido', 'lento' (corpo 80 ms depois), 'segura' (corpo 5 s
 * depois, mas larga ao cancelar), 'ok-sem-fim' (200 cujo corpo nunca acaba, larga ao cancelar),
 * '403-sem-fim' e '429-sem-fim' (erro cujo corpo nunca acaba nem larga sozinho). `__transf` conta as
 * transferências do pedido até o corpo acabar, ser largado ou dar erro.
 */
async function kickNoFetch(p, modos) {
  await p.addInitScript(({ t0, modosDe }) => {
    const transf = { agora: 0, max: 0, pedidos: 0, largados: 0 };
    window.__transf = transf;
    const original = window.fetch.bind(window);
    const chats = [0, 1, 2, 3, 4].map((i) => {
      const l = [];
      for (let k = 0; k < 10 * 60; k++) {
        const us = (t0 + k * 1000) * 1000 + 137;
        l.push({ id: `lento${i}-${k}`, us, created_at: new Date(Math.floor(us / 1e6) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), content: 'kkk', sender: { slug: 'fa' } });
      }
      return l;
    });
    const parado = () => new DOMException('parado', 'AbortError');
    window.fetch = (url, opcoes = {}) => {
      const u = new URL(String(url), location.href);
      const canal = u.pathname.match(/\/api\/v2\/channels\/lento(\d)$/);
      if (canal) return Promise.resolve(new Response(JSON.stringify({ id: 2000 + Number(canal[1]), slug: `lento${canal[1]}` }), { status: 200 }));
      const chat = u.pathname.match(/\/api\/v2\/channels\/(20\d\d)\/messages$/);
      if (!chat) return original(url, opcoes);
      const i = Number(chat[1]) - 2000;
      const modo = modosDe[i] || 'rapido';
      const sinal = opcoes.signal;
      if (sinal?.aborted) return Promise.reject(parado());
      transf.pedidos++;
      transf.agora++;
      transf.max = Math.max(transf.max, transf.agora);
      let acabou = false;
      const acabar = () => { if (!acabou) { acabou = true; transf.agora--; } };
      const cursor = Number(u.searchParams.get('cursor'));
      const pagina = chats[i].filter((m) => m.us < cursor).slice(-25).reverse();
      const corpo = new TextEncoder().encode(JSON.stringify({
        data: { messages: pagina.map(({ us, ...m }) => m), cursor: pagina.length ? String(pagina.at(-1).us) : null },
      }));
      const espera = { rapido: 0, lento: 80, segura: 5000 }[modo];
      const largaAoCancelar = modo === 'segura' || modo === 'ok-sem-fim';
      let enviado = false;
      let ctrlDoFluxo;
      const fluxo = new ReadableStream({
        start(ctrl) { ctrlDoFluxo = ctrl; },
        async pull(ctrl) {
          if (espera === undefined) return new Promise(() => {});
          if (enviado) { ctrl.close(); acabar(); return undefined; }
          if (espera) await new Promise((ok) => { setTimeout(ok, espera); });
          if (acabou) return undefined;
          enviado = true;
          ctrl.enqueue(corpo);
          return undefined;
        },
        cancel() { transf.largados++; acabar(); },
      });
      if (largaAoCancelar) {
        sinal?.addEventListener('abort', () => {
          if (acabou) return;
          try { ctrlDoFluxo.error(parado()); } catch { /* já fechado */ }
          transf.largados++;
          acabar();
        }, { once: true });
      }
      const status = modo === '403-sem-fim' ? 403 : modo === '429-sem-fim' ? 429 : 200;
      return Promise.resolve(new Response(fluxo, { status, headers: { 'content-type': 'application/json' } }));
    };
  }, { t0: T, modosDe: modos });
}

/** Ler os lento<i> pedidos ao mesmo tempo, numa faixa só, com um limite para não ficar preso sem fim. */
const lerLentos = (p, quais, { limiteMs = 30_000, corpoMs = null } = {}) => p.evaluate(async ({ a, b, lista, limite, corpo }) => {
  window.__evento.faixasDoChat = 1;
  if (corpo) window.__evento.limiteCorpoChatMs = corpo;
  const t0 = performance.now();
  const preso = new Promise((ok) => { setTimeout(() => ok('preso'), limite); });
  return Promise.all(lista.map((i) => Promise.race([
    window.__evento.lerChatTrecho(`lento${i}`, a, b)
      .then((r) => ({ motivo: r.motivo, noTrecho: r.noTrecho, ms: Math.round(performance.now() - t0) }), (e) => ({ erro: e?.name })),
    preso.then(() => ({ erro: 'preso' })),
  ])));
}, { a: T, b: T + 10 * MIN, lista: quais, limite: limiteMs, corpo: corpoMs });

test('corpos de erro que nunca acabam não prendem as vagas: o erro chega e a quinta leitura avança',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
    await kickFalsa(p, { canais: CANAIS });
    await kickNoFetch(p, ['403-sem-fim', '403-sem-fim', '429-sem-fim', '429-sem-fim', 'rapido']);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    try {
      const rs = await lerLentos(p, [0, 1, 2, 3, 4]);
      assert.deepEqual(rs.map((r) => (r.erro ? r.erro : r.motivo)), ['http-403', 'http-403', 'rate-limit', 'rate-limit', null], JSON.stringify(rs));
      assert.equal(rs[4].noTrecho, 600);
      const transf = await p.evaluate(() => window.__transf);
      assert.equal(transf.agora, 0, `corpos de erro por largar: ${JSON.stringify(transf)}`);
      assert.ok(transf.max <= 4, JSON.stringify(transf));
      assert.deepEqual(erros.filter((x) => !/403|429|Failed to load/.test(x)), []);
    } finally {
      await p.close();
    }
  });

test('um corpo 200 que nunca acaba solta a vaga no limite e a leitura diz resposta-ilegivel',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
    await kickFalsa(p, { canais: CANAIS });
    await kickNoFetch(p, ['ok-sem-fim', 'lento', 'lento', 'lento', 'lento']);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    try {
      const rs = await lerLentos(p, [0, 1, 2, 3, 4], { corpoMs: 1500 });
      assert.equal(rs[0].motivo, 'resposta-ilegivel', JSON.stringify(rs));
      assert.ok(rs[0].ms >= 1400 && rs[0].ms < 10_000, `parou aos ${rs[0].ms} ms`);
      assert.ok(rs.slice(1).every((r) => r.motivo === null && r.noTrecho === 600), JSON.stringify(rs));
      const transf = await p.evaluate(() => window.__transf);
      assert.equal(transf.agora, 0, JSON.stringify(transf));
      assert.ok(transf.max <= 4, JSON.stringify(transf));
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('cancelar durante a leitura do corpo solta a vaga: quatro paradas e a quinta leitura passa',
  semNavegador, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
    await kickFalsa(p, { canais: CANAIS });
    await kickNoFetch(p, ['segura', 'segura', 'segura', 'segura', 'rapido']);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    try {
      await p.evaluate(({ a, b }) => {
        window.__evento.faixasDoChat = 1;
        window.__parar = new AbortController();
        window.__paradas = Promise.all([0, 1, 2, 3].map((i) => window.__evento.lerChatTrecho(`lento${i}`, a, b, { sinal: window.__parar.signal })
          .then((r) => r.motivo, (e) => e?.name)));
      }, { a: T, b: T + 10 * MIN });
      await p.waitForFunction(() => window.__transf.agora >= 4, null, { timeout: 10_000 });
      await p.evaluate(() => window.__parar.abort());
      const paradas = await p.evaluate(() => Promise.race([window.__paradas, new Promise((ok) => { setTimeout(() => ok('preso'), 3000); })]));
      assert.deepEqual(paradas, ['AbortError', 'AbortError', 'AbortError', 'AbortError']);
      const [quinta] = await lerLentos(p, [4], { limiteMs: 3000 });
      assert.equal(quinta.motivo, null, JSON.stringify(quinta));
      assert.equal(quinta.noTrecho, 600);
      const transf = await p.evaluate(() => window.__transf);
      assert.equal(transf.agora, 0, JSON.stringify(transf));
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

// Sonda esparsa por cima de chat muito denso (revisão 2 do Codex): a sonda (3 páginas de 1 mensagem a
// cada 10 s) prevê pouco trabalho, divide, e a região densa por baixo estoura as 400 páginas. A janela
// que fica tem de ser a do código de antes do B4 ou mais curta (nunca mais comprida, nunca por cima de
// buraco), e a retomada tem de acabar exatamente como o código de antes acaba com a mesma história.
const ESPARSA = {
  porSegundo: 0,
  extras: [
    { deMs: T, ateMs: T + 10 * MIN, n: 600 },
    { deMs: T + 10 * MIN, ateMs: T + 25 * MIN, n: 15 * 60 * 12 },
    { deMs: T + 25 * MIN, ateMs: T + 40 * MIN, n: 90 },
  ],
};
/** O cursor seguinte que a Kick de mentira dá depois da página de `cursor` (sem repetir a fronteira). */
const cursorSeguinte = (lista, cursor) => lista.filter((m) => m.us < cursor).slice(-25)[0].us;

/** Uma página com o trecho esparso; `falha.ate` (mutável): 403 para cursores ≤ esse valor. */
async function paginaEsparsa(faixas, falha = { ate: null }) {
  const lista = chatDe('tchubi', ESPARSA);
  const { p, erros, estat } = await pagina({ tchubi: lista }, {
    antes: ({ cursor }) => (falha.ate !== null && cursor <= falha.ate
      ? { status: 403, headers: { 'access-control-allow-origin': '*' }, body: '' } : null),
  }, faixas);
  return { p, erros, estat, lista };
}
const marcasRelativas = (marcas) => marcas.map((m) => ({ ...m, ms: m.ms - T }));

// Gravadas com o código do HEAD 38291478 (outputs/b4-referencia-head-esparsa.json): a leitura numa faixa
// e, com a MESMA história do caso de duas faixas (o HEAD parado por 403 no cursor onde a faixa de cima
// parou no travão), a retomada que acaba o trecho.
const ESPARSA_HEAD = {
  parcial: { motivo: 'max-pedidos', janelas: [[T + 675_000, T + 2_400_000]] },
  falhaAte: 1788124551250311,
  retomada: {
    janelas: [[952_000, 2_400_000], [0, 952_000], [0, 300_000], [300_000, 600_000], [600_000, 900_000], [900_000, 952_000], [0, 2_400_000]]
      .map(([a, b]) => [T + a, T + b]),
    marcas: [{ ms: 600_000, tipo: 'chat', msgs: 720, vezes: 12 }, { ms: 952_000, tipo: 'chat', msgs: 720, vezes: 12 }],
  },
};

test('sonda esparsa por cima de chat denso: a janela parcial nunca passa da do código de antes, e a retomada acaba igual a ele',
  semNavegador, async () => {
    const tudo = idsEm(chatDe('tchubi', ESPARSA), T, T + 40 * MIN);
    // Numa faixa: exatamente o código de antes.
    {
      const { p, estat } = await paginaEsparsa(1);
      try {
        const r = await ler(p, 'tchubi', T, T + 40 * MIN);
        assert.equal(r.motivo, ESPARSA_HEAD.parcial.motivo);
        assert.equal(estat.pedidos.length, 400);
        assert.deepEqual((await estadoDo(p, 'tchubi')).janelas, ESPARSA_HEAD.parcial.janelas);
      } finally {
        await p.close();
      }
    }
    // Em duas: dividiu, a região densa estourou o teto.
    const { p, erros, estat, lista } = await paginaEsparsa(2);
    try {
      const r = await ler(p, 'tchubi', T, T + 40 * MIN);
      assert.equal(r.motivo, 'max-pedidos');
      assert.ok(estat.maxNoAr >= 2, 'não dividiu');
      assert.ok(estat.pedidos.length <= 400, `${estat.pedidos.length} páginas`);
      const e = await estadoDo(p, 'tchubi');
      // Uma janela só, a cauda desde o fim, dentro da do código de antes (mais curta: menos referência
      // para os picos, nunca uma referência falsa).
      assert.equal(e.janelas.length, 1, JSON.stringify(e.janelas));
      const [[P, fim]] = e.janelas;
      const [[pHead, fimHead]] = ESPARSA_HEAD.parcial.janelas;
      assert.equal(fim, fimHead);
      assert.ok(P >= pHead, `janela ${P - T} começa antes da do HEAD ${pHead - T}`);
      // Nenhuma janela por cima de um buraco: cada uma cabe num só pedaço do que se baixou.
      assert.ok(e.janelas.every(([a, b]) => e.coberto.some(([u, v]) => u <= a && v >= b)), JSON.stringify(e.coberto));
      assert.ok(e.coberto.length === 2, `esperava a faixa de baixo à parte: ${JSON.stringify(e.coberto)}`);
      // Dentro da janela, todas as mensagens que a leitura de uma faixa tem lá (todas as do fixture).
      const tem = new Set(e.ids);
      assert.ok(idsEm(lista, P, fim).every((id) => tem.has(id)));
      // É a mesma história do HEAD gravado: a faixa de cima parou no mesmo cursor.
      const m = e.coberto[0][1];
      const cimas = estat.pedidos.filter((x) => x.cursor > m * 1000).map((x) => x.cursor);
      assert.equal(cursorSeguinte(lista, Math.min(...cimas)), ESPARSA_HEAD.falhaAte);

      // A retomada busca só o buraco entre as faixas, sem reler o que já veio, e acaba como o HEAD.
      const antes = estat.pedidos.length;
      const r2 = await ler(p, 'tchubi', T, T + 40 * MIN);
      assert.equal(r2.motivo, null, JSON.stringify(r2));
      const daRetomada = estat.pedidos.slice(antes).map((x) => x.cursor);
      assert.ok(daRetomada.length > 0 && daRetomada.every((c) => c >= m * 1000 && c <= P * 1000),
        `releu fora do buraco: ${JSON.stringify(daRetomada.map((c) => c / 1000 - T))}`);
      const e2 = await estadoDo(p, 'tchubi');
      assert.deepEqual(e2.janelas, ESPARSA_HEAD.retomada.janelas);
      assert.deepEqual(marcasRelativas(e2.marcas), ESPARSA_HEAD.retomada.marcas);
      assert.deepEqual(e2.coberto, [[T, T + 40 * MIN]]);
      assert.deepEqual(e2.ids, tudo);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('uma leitura que acaba a meio de um segundo já carregado não baralha esse segundo (revisão 3 do Codex)',
  semNavegador, async () => {
    // O segundo S tem A, B e C (aos 100, 200 e 800 ms). A primeira leitura traz A, B e C na última página
    // e falha no pedido seguinte: S fica carregado mas não coberto. A segunda acaba em S+500 ms e só
    // traz A e B. O fim de S (C) tem de continuar depois deles.
    const S = T + 5 * MIN;
    const msg = (id, us) => ({ id, us, created_at: new Date(Math.floor(us / 1e6) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), content: 'kkk', sender: { slug: 'fa' } });
    const lista = [];
    for (let k = 30; k >= 1; k--) lista.push(msg(`antes-${k}`, (S - k * 1000) * 1000 + 500_000));
    lista.push(msg('A', (S + 100) * 1000), msg('B', (S + 200) * 1000), msg('C', (S + 800) * 1000));
    for (let k = 1; k <= 22; k++) lista.push(msg(`depois-${k}`, (S + k * 1000) * 1000 + 500_000));
    const falha = { ate: (S + 100) * 1000 };
    const { p, erros } = await pagina({ tchubi: lista }, {
      antes: ({ cursor }) => (falha.ate !== null && cursor <= falha.ate
        ? { status: 403, headers: { 'access-control-allow-origin': '*' }, body: '' } : null),
    }, 2);
    try {
      const r1 = await ler(p, 'tchubi', S - MIN, S + MIN);
      assert.equal(r1.motivo, 'http-403', JSON.stringify(r1));
      let e = await estadoDo(p, 'tchubi');
      const deS = (ids) => ids.filter((id) => ['A', 'B', 'C'].includes(id));
      assert.deepEqual(deS(e.ids), ['A', 'B', 'C']);
      assert.ok(e.coberto.every(([a]) => a > S), `o segundo S ficou coberto: ${JSON.stringify(e.coberto)}`);
      falha.ate = null;
      const r2 = await ler(p, 'tchubi', S - 30_000, S + 500);
      assert.equal(r2.motivo, null, JSON.stringify(r2));
      e = await estadoDo(p, 'tchubi');
      assert.deepEqual(deS(e.ids), ['A', 'B', 'C']);
      // E o resto pela ordem da Kick, sem nenhuma a dobrar.
      assert.deepEqual(e.ids, lista.map((m) => m.id));
      assert.deepEqual(erros.filter((x) => !/403|Failed to load/.test(x)), []);
    } finally {
      await p.close();
    }
  });
