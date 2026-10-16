// A robustez dos pedidos de chat (lote B7, 16/10): os resíduos que o B4 deixou registados. Um pedido
// cujos cabeçalhos nunca chegavam prendia uma das 4 vagas para sempre, e dois leitores do mesmo endereço
// partilhavam um pedido que só obedecia ao sinal do primeiro. Aqui prova-se, um cenário por teste, que
// todo pedido acaba (sucesso, erro, cancelar ou prazo), que cada consumidor tem a sua espera, que a pausa
// de um 429 não ocupa vaga, e que a vaga se solta exatamente uma vez.
//
// A Kick daqui é o próprio `fetch` da página (como em chat-faixas.test.mjs, que tem a mesma ideia mais
// simples): as rotas do Playwright não sabem fazer cabeçalhos que nunca chegam nem corpos sem fim. Cada
// canal `lento<i>` (id 2000+i) tem um modo — ver `kickNoFetch`. Os prazos são curtos nos testes
// (`ev.limiteCabecalhosChatMs`, `ev.limiteCorpoChatMs`); 20 s e 30 s não cabem num teste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador', timeout: 120_000 };
const MIN = 60_000;
const CANAIS = ['tchubi', 'outro', 'terceiro'];
const REPOUSO = { noAr: 0, fila: 0, emCurso: 0 };

/**
 * A Kick dentro do `fetch` da página. O modo de cada canal vem de `window.__modos[i]` (um texto, ou uma
 * lista consumida pedido a pedido, ficando o último) ou, com prioridade, de `window.__regra(i, cursor, n)`.
 * Modos (o `:ms` é o atraso dos cabeçalhos): 'rapido', 'lento' (corpo 80 ms depois), 'sem-cabecalho'
 * (nunca responde, mas larga ao cancelar), 'surdo' (nunca responde e ignora o sinal), 'corpo-sem-fim'
 * (200 cujo corpo nunca acaba, larga ao cancelar), '429' (Retry-After de 1 s) e 'manual' (fica à espera
 * de `window.__responder(n, estado)`). `__k` conta tudo: pedidos (com o instante e as vagas ocupadas que
 * a página dizia nesse instante), transferências no ar e quantas foram largadas por cancelar.
 */
async function kickNoFetch(p) {
  await p.addInitScript(({ t0 }) => {
    const k = { pedidos: [], agora: 0, max: 0, abortados: 0 };
    window.__k = k;
    window.__modos = {};
    window.__regra = null;
    const pend = new Map();
    window.__responder = (n, estado = 200) => pend.get(n)?.(estado);
    window.__dormir = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
    // Um pedido de chat do canal i; `c` desloca o cursor para os endereços serem todos diferentes.
    window.__url = (i, c = 1) => `https://kick.com/api/v2/channels/${2000 + i}/messages?cursor=${(t0 + 5 * 60_000) * 1000 + c}`;
    // O que um consumidor viu e quando (desde que pediu): o estado, ou o nome do erro; e, a pedido, quantas mensagens lê.
    window.__ver = (pr, comMsgs = false) => {
      const desde = performance.now();
      return pr.then(async (r) => {
        const res = { status: r.status, ms: Math.round(performance.now() - desde) };
        if (comMsgs) res.msgs = (await r.json()).data.messages.length;
        return res;
      }, (e) => ({ erro: e?.name, ms: Math.round(performance.now() - desde) }));
    };
    window.__ate = (pr, ms) => Promise.race([pr, window.__dormir(ms).then(() => ({ erro: 'preso' }))]);

    const original = window.fetch.bind(window);
    const chats = [0, 1, 2, 3, 4].map((i) => {
      const l = [];
      for (let n = 0; n < 10 * 60; n++) {
        const us = (t0 + n * 1000) * 1000 + 137;
        l.push({ id: `lento${i}-${n}`, us, created_at: new Date(Math.floor(us / 1e6) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), content: 'kkk', sender: { slug: 'fa' } });
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
      const cursor = Number(u.searchParams.get('cursor'));
      const n = k.pedidos.length;
      let modo = window.__regra?.(i, cursor, n) ?? null;
      if (!modo) {
        const m = window.__modos[i];
        modo = Array.isArray(m) ? (m.length > 1 ? m.shift() : m[0]) : m;
      }
      const [nome, arg] = (modo || 'rapido').split(':');
      const sinal = opcoes.signal;
      k.pedidos.push({ n, i, cursor, modo: nome, t: Date.now(), noAr: window.__evento?.vagasChat?.().noAr ?? null });
      if (nome === 'surdo') return new Promise(() => {});
      k.agora++;
      k.max = Math.max(k.max, k.agora);
      let acabou = false;
      const acabar = () => { if (!acabou) { acabou = true; k.agora--; } };
      const pagina = chats[i].filter((m) => m.us < cursor).slice(-25).reverse();
      const corpo = new TextEncoder().encode(JSON.stringify({
        data: { messages: pagina.map(({ us, ...m }) => m), cursor: pagina.length ? String(pagina.at(-1).us) : null },
      }));
      const resposta = (estado, corpoMs = 0, semFim = false) => {
        if (estado !== 200) {
          acabar();
          return new Response(null, { status: estado, headers: estado === 429 ? { 'retry-after': '1' } : {} });
        }
        let enviado = false;
        let ctrl;
        const fluxo = new ReadableStream({
          start(c) { ctrl = c; },
          async pull(c) {
            if (semFim) return new Promise(() => {});
            if (enviado) { c.close(); acabar(); return undefined; }
            if (corpoMs) await new Promise((ok) => { setTimeout(ok, corpoMs); });
            if (acabou) return undefined;
            enviado = true;
            c.enqueue(corpo);
            return undefined;
          },
          cancel() { acabar(); },
        });
        // Um fetch a sério larga o corpo quando o sinal cai.
        sinal?.addEventListener('abort', () => {
          if (acabou) return;
          try { ctrl.error(parado()); } catch { /* já fechado */ }
          acabar();
        }, { once: true });
        return new Response(fluxo, { status: 200, headers: { 'content-type': 'application/json' } });
      };
      return new Promise((ok, mal) => {
        const desistir = () => { k.abortados++; acabar(); mal(parado()); };
        if (sinal?.aborted) { desistir(); return; }
        sinal?.addEventListener('abort', desistir, { once: true });
        const entregar = (r) => { sinal?.removeEventListener('abort', desistir); ok(r); };
        if (nome === 'sem-cabecalho') return;
        if (nome === 'manual') { pend.set(n, (estado) => { pend.delete(n); entregar(resposta(estado)); }); return; }
        setTimeout(() => {
          if (sinal?.aborted) return;
          entregar(nome === '429' ? resposta(429) : nome === 'corpo-sem-fim' ? resposta(200, 0, true)
            : resposta(200, nome === 'lento' ? 80 : 0));
        }, Number(arg || 0));
      });
    };
  }, { t0: T });
}

/** Uma página nova com a Kick de mentira dentro do `fetch`. */
async function preparar() {
  const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
  await kickFalsa(p, { canais: CANAIS });
  await kickNoFetch(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  return { p, erros };
}
const vagas = (p) => p.evaluate(() => window.__evento.vagasChat());
const pedidos = (p) => p.evaluate(() => window.__k.pedidos);

test('1. cabeçalhos que nunca chegam: o prazo aborta cada pedido, as vagas voltam e a fila anda',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        ev.limiteCabecalhosChatMs = 400;
        // Três que não respondem (um deles surdo ao sinal) e a quarta vaga também presa; o quinto espera.
        window.__modos = { 0: 'sem-cabecalho', 1: 'sem-cabecalho', 2: 'surdo', 3: 'sem-cabecalho', 4: 'rapido' };
        return Promise.all([0, 1, 2, 3, 4].map((i) => window.__ate(window.__ver(ev.buscarChat(window.__url(i), {})), 6000)));
      });
      assert.deepEqual(r.slice(0, 4).map((x) => x.erro), ['TimeoutError', 'TimeoutError', 'TimeoutError', 'TimeoutError'], JSON.stringify(r));
      assert.ok(r.slice(0, 4).every((x) => x.ms >= 350 && x.ms < 3000), JSON.stringify(r));
      // O quinto só entrou quando uma vaga voltou, e não ficou preso atrás dos outros.
      assert.equal(r[4].status, 200, JSON.stringify(r));
      assert.ok(r[4].ms >= 350 && r[4].ms < 3000, JSON.stringify(r));
      const ped = await pedidos(p);
      assert.equal(ped.length, 5);
      assert.ok(ped[4].t - ped[0].t >= 350, `o quinto pediu ${ped[4].t - ped[0].t} ms depois: não esperou a vaga`);
      assert.ok(ped.every((x) => x.noAr <= 4), JSON.stringify(ped.map((x) => x.noAr)));
      // Os pedidos que o prazo largou foram abortados (o surdo não ouve, e tudo bem: a vaga já voltou).
      assert.equal(await p.evaluate(() => window.__k.abortados), 3);
      assert.deepEqual(await vagas(p), REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('1b. juntar-se a um pedido em curso não renova o prazo dos cabeçalhos',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        ev.limiteCabecalhosChatMs = 600;
        window.__modos = { 0: 'sem-cabecalho' };
        const url = window.__url(0);
        const a = window.__ate(window.__ver(ev.buscarChat(url, {})), 4000);
        await window.__dormir(400);
        const b = window.__ate(window.__ver(ev.buscarChat(url, {})), 4000);
        return Promise.all([a, b]);
      });
      assert.deepEqual(r.map((x) => x.erro), ['TimeoutError', 'TimeoutError'], JSON.stringify(r));
      // O segundo chegou aos 400 ms: o prazo continua a ser o do primeiro (600 ms), e por isso só lhe
      // restam uns 200 ms (e não os 600 de um prazo novo).
      assert.ok(r[0].ms >= 550 && r[0].ms < 900, JSON.stringify(r));
      assert.ok(r[1].ms >= 100 && r[1].ms < 450, JSON.stringify(r));
      assert.equal((await pedidos(p)).length, 1, 'foram dois pedidos à Kick');
      assert.deepEqual(await vagas(p), REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('2. cabeçalhos chegam e o corpo trava: vale o prazo do corpo, contado depois dos cabeçalhos',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        // Cabeçalhos aos 400 ms e prazo de cabeçalhos de 700: se esse relógio não parasse ao chegarem, o
        // pedido caía aos 700 e não aos ~1000 (400 + 600 de corpo).
        ev.limiteCabecalhosChatMs = 700;
        ev.limiteCorpoChatMs = 600;
        window.__modos = { 0: 'corpo-sem-fim:400' };
        const t0 = performance.now();
        const preso = window.__dormir(8000).then(() => ({ erro: 'preso' }));
        return Promise.race([preso, ev.buscarChat(window.__url(0), {}).then(
          // A leitura das páginas diz resposta-ilegivel quando o json() rejeita assim.
          async (x) => ({ status: x.status, corpo: await x.json().then(() => null, (e) => ({ nome: e?.name, texto: e?.message })), ms: Math.round(performance.now() - t0) }),
          (e) => ({ erro: e?.name }),
        )]);
      });
      assert.equal(r.status, 200, JSON.stringify(r));
      assert.ok(r.ms >= 900 && r.ms < 3500, JSON.stringify(r));
      assert.equal(r.corpo?.nome, 'TimeoutError', JSON.stringify(r));
      assert.match(r.corpo.texto, /corpo/, 'o prazo que falou foi o dos cabeçalhos, e não o do corpo');
      assert.deepEqual(await vagas(p), REPOUSO);
      assert.equal(await p.evaluate(() => window.__k.agora), 0, 'ficou corpo por largar');
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('3. dois consumidores partilham um pedido: um cancela e o outro recebe a resposta normalmente',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        window.__modos = { 0: 'manual' };
        const url = window.__url(0);
        const [A, B, C] = [new AbortController(), new AbortController(), new AbortController()];
        const pa = window.__ver(ev.buscarChat(url, { signal: A.signal }));
        const pb = window.__ver(ev.buscarChat(url, { signal: B.signal }), true);
        const pc = window.__ver(ev.buscarChat(url, { signal: C.signal }));
        await window.__dormir(100);
        const antes = { pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        A.abort();
        const ra = await window.__ate(pa, 500);
        C.abort();
        const rc = await window.__ate(pc, 500);
        // O pedido partilhado continua: o primeiro e o terceiro saíram, o segundo ainda espera.
        const meio = { abortados: window.__k.abortados, pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        window.__responder(0);
        const rb = await window.__ate(pb, 3000);
        return { antes, ra, rc, meio, rb, depois: ev.vagasChat() };
      });
      assert.deepEqual(r.antes, { pedidos: 1, noAr: 1, fila: 0, emCurso: 1 }, JSON.stringify(r));
      assert.equal(r.ra.erro, 'AbortError', JSON.stringify(r));
      assert.equal(r.rc.erro, 'AbortError', JSON.stringify(r));
      assert.deepEqual(r.meio, { abortados: 0, pedidos: 1, noAr: 1, fila: 0, emCurso: 1 }, JSON.stringify(r));
      assert.equal(r.rb.status, 200, JSON.stringify(r));
      assert.equal(r.rb.msgs, 25, JSON.stringify(r));
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('4a. o último consumidor cancela em execução: o pedido é largado, sem vaga nem endereço presos',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        window.__modos = { 0: 'manual' };
        const url = window.__url(0);
        const [A, B] = [new AbortController(), new AbortController()];
        const pa = window.__ver(ev.buscarChat(url, { signal: A.signal }));
        const pb = window.__ver(ev.buscarChat(url, { signal: B.signal }));
        await window.__dormir(50);
        B.abort();
        const rb = await window.__ate(pb, 500);
        const meio = { abortados: window.__k.abortados, ...ev.vagasChat() };
        A.abort();
        const ra = await window.__ate(pa, 500);
        await window.__dormir(50);
        const fim = { abortados: window.__k.abortados, pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        // O endereço ficou livre: pedir outra vez faz um pedido novo e não apanha o que morreu.
        window.__modos = { 0: 'rapido' };
        const nova = await window.__ate(window.__ver(ev.buscarChat(url, {})), 2000);
        return { ra, rb, meio, fim, nova, depois: ev.vagasChat(), total: window.__k.pedidos.length };
      });
      assert.equal(r.rb.erro, 'AbortError', `o segundo consumidor não saiu ao cancelar: ${JSON.stringify(r)}`);
      assert.deepEqual(r.meio, { abortados: 0, noAr: 1, fila: 0, emCurso: 1 }, JSON.stringify(r));
      assert.equal(r.ra.erro, 'AbortError', JSON.stringify(r));
      assert.deepEqual(r.fim, { abortados: 1, pedidos: 1, ...REPOUSO }, JSON.stringify(r));
      assert.equal(r.nova.status, 200, JSON.stringify(r));
      assert.equal(r.total, 2);
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('4b. o último consumidor cancela na fila: sai da fila, o pedido nem chega à Kick e nenhuma vaga se perde',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        window.__modos = { 0: 'manual', 1: 'manual', 2: 'manual', 3: 'manual', 4: 'rapido' };
        const quatro = [0, 1, 2, 3].map((i) => window.__ver(ev.buscarChat(window.__url(i), {})));
        const url = window.__url(4);
        const [A, B] = [new AbortController(), new AbortController()];
        const pa = window.__ver(ev.buscarChat(url, { signal: A.signal }));
        const pb = window.__ver(ev.buscarChat(url, { signal: B.signal }));
        await window.__dormir(100);
        const cheio = { pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        B.abort();
        const rb = await window.__ate(pb, 500);
        const umSo = ev.vagasChat();
        A.abort();
        const ra = await window.__ate(pa, 500);
        const vazio = { pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        for (let i = 0; i < 4; i++) window.__responder(i);
        const rs = await Promise.all(quatro.map((x) => window.__ate(x, 3000)));
        const nova = await window.__ate(window.__ver(ev.buscarChat(url, {})), 2000);
        return { cheio, rb, umSo, ra, vazio, rs, nova, depois: ev.vagasChat() };
      });
      assert.deepEqual(r.cheio, { pedidos: 4, noAr: 4, fila: 1, emCurso: 5 }, JSON.stringify(r));
      assert.equal(r.rb.erro, 'AbortError', JSON.stringify(r));
      assert.equal(r.umSo.fila, 1, 'cancelar um de dois tirou o pedido partilhado da fila');
      assert.equal(r.ra.erro, 'AbortError', JSON.stringify(r));
      assert.deepEqual(r.vazio, { pedidos: 4, noAr: 4, fila: 0, emCurso: 4 }, JSON.stringify(r));
      assert.ok(r.rs.every((x) => x.status === 200), JSON.stringify(r));
      assert.equal(r.nova.status, 200, JSON.stringify(r));
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('5. cancelar, o prazo e a resposta disputam a conclusão: a vaga solta-se uma vez só, nunca duas',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        ev.limiteCabecalhosChatMs = 40;
        // Números ao acaso, mas sempre os mesmos: o cancelar e a resposta caem à volta do prazo de 40 ms.
        let semente = 12345;
        const acaso = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
        const fins = [];
        for (let k = 0; k < 40; k++) {
          window.__modos = { 0: 'manual' };
          const n = window.__k.pedidos.length;
          const ctl = new AbortController();
          const pr = ev.buscarChat(window.__url(0, k + 1), { signal: ctl.signal }).then((x) => x.status, (e) => e?.name);
          setTimeout(() => ctl.abort(), 25 + acaso() * 40);
          setTimeout(() => window.__responder(n), 25 + acaso() * 40);
          fins.push(await pr);
          await window.__dormir(70);
        }
        const repouso = ev.vagasChat();
        // Se alguma vaga tivesse sido solta a mais, o contador estaria abaixo de zero e a rajada passava de 4.
        ev.limiteCabecalhosChatMs = 5000;
        window.__modos = { 0: 'lento', 1: 'lento', 2: 'lento', 3: 'lento', 4: 'lento' };
        const rajada = await Promise.all([0, 1, 2, 3, 4, 0, 1, 2].map((i, k) => window.__ate(window.__ver(ev.buscarChat(window.__url(i, 100 + k), {})), 5000)));
        return { fins, repouso, rajada, depois: ev.vagasChat(), amostras: window.__k.pedidos.map((x) => x.noAr), max: window.__k.max };
      });
      assert.ok(r.fins.every((x) => [200, 'AbortError', 'TimeoutError'].includes(x)), JSON.stringify(r.fins));
      assert.deepEqual(r.repouso, REPOUSO, JSON.stringify(r.fins));
      assert.ok(r.rajada.every((x) => x.status === 200), JSON.stringify(r.rajada));
      assert.ok(r.amostras.every((x) => x >= 1 && x <= 4), `vagas ocupadas: ${JSON.stringify(r.amostras)}`);
      assert.ok(r.max <= 4, `${r.max} transferências ao mesmo tempo`);
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('5b. uma resposta tardia a uma leitura cancelada não toca nas mensagens nem no que ficou coberto',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async ({ a, b }) => {
        const ev = window.__evento;
        window.__modos = { 0: 'manual' };
        const ctl = new AbortController();
        const leitura = ev.lerChatTrecho('lento0', a, b, { sinal: ctl.signal }).then(() => 'acabou', (e) => e?.name);
        for (let k = 0; k < 100 && !window.__k.pedidos.length; k++) await window.__dormir(10);
        const noAr = window.__k.pedidos.length;
        ctl.abort();
        const fim = await window.__ate(leitura.then((x) => ({ erro: x })), 1000);
        window.__responder(0);
        await window.__dormir(400);
        return {
          fim, noAr, pedidos: window.__k.pedidos.length,
          msgs: (ev.mensagens.get('lento0') || []).length, coberto: ev.cobertoDoChat('lento0'), janelas: ev.janelasDoChat('lento0'),
          vagas: ev.vagasChat(),
        };
      }, { a: T, b: T + 10 * MIN });
      assert.equal(r.noAr, 1, JSON.stringify(r));
      assert.equal(r.fim.erro, 'AbortError', JSON.stringify(r));
      assert.equal(r.pedidos, 1, 'pediu outra vez depois de cancelar');
      assert.equal(r.msgs, 0, 'a resposta tardia mexeu nas mensagens');
      assert.deepEqual(r.coberto, []);
      assert.deepEqual(r.janelas, []);
      assert.deepEqual(r.vagas, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('6. um 429 e o cancelar do primeiro chamador: a espera partilhada vale para os outros, sem ocupar vaga',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        window.__modos = { 0: ['429', 'rapido'], 1: 'rapido' };
        const primeiro = await window.__ver(ev.buscarChat(window.__url(0), {}));
        // Durante a pausa, dois leitores do mesmo endereço; o primeiro cancela, o segundo continua.
        const url = window.__url(1);
        const [A, B] = [new AbortController(), new AbortController()];
        const pa = window.__ver(ev.buscarChat(url, { signal: A.signal }));
        const pb = window.__ver(ev.buscarChat(url, { signal: B.signal }), true);
        await window.__dormir(150);
        // Quem espera a pausa não ocupa vaga, e ainda nada foi à Kick.
        const emPausa = { pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        A.abort();
        const ra = await window.__ate(pa, 500);
        const rb = await window.__ate(pb, 5000);
        return { primeiro, emPausa, ra, rb, depois: ev.vagasChat(), ped: window.__k.pedidos.map((x) => ({ n: x.n, i: x.i, t: x.t })) };
      });
      assert.equal(r.primeiro.status, 429, JSON.stringify(r));
      assert.deepEqual(r.emPausa, { pedidos: 1, noAr: 0, fila: 0, emCurso: 1 }, JSON.stringify(r));
      assert.equal(r.ra.erro, 'AbortError', JSON.stringify(r));
      assert.equal(r.rb.status, 200, JSON.stringify(r));
      assert.equal(r.rb.msgs, 25, JSON.stringify(r));
      // Um pedido só para o endereço partilhado, e só depois do Retry-After de 1 s.
      assert.equal(r.ped.length, 2, JSON.stringify(r.ped));
      assert.ok(r.ped[1].t - r.ped[0].t >= 900, `foi à Kick ${r.ped[1].t - r.ped[0].t} ms depois do 429`);
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('6b. quem ganha a vaga durante uma pausa de 429 reconfere a pausa e espera sem a vaga',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        window.__modos = { 0: 'manual', 1: 'manual', 2: 'manual', 3: 'manual', 4: 'rapido' };
        const quatro = [0, 1, 2, 3].map((i) => window.__ver(ev.buscarChat(window.__url(i), {})));
        // O quinto está na fila, e quando a primeira vaga voltar já há pausa.
        const quinto = window.__ate(window.__ver(ev.buscarChat(window.__url(4), {})), 6000);
        await window.__dormir(50);
        const fila = ev.vagasChat();
        window.__responder(0, 429);
        for (let i = 1; i < 4; i++) window.__responder(i);
        const rs = await Promise.all(quatro);
        await window.__dormir(300);
        const emPausa = { pedidos: window.__k.pedidos.length, ...ev.vagasChat() };
        const rq = await quinto;
        return { fila, rs, emPausa, rq, depois: ev.vagasChat(), ped: window.__k.pedidos.map((x) => ({ i: x.i, t: x.t })) };
      });
      assert.deepEqual(r.fila, { noAr: 4, fila: 1, emCurso: 5 }, JSON.stringify(r));
      assert.deepEqual(r.rs.map((x) => x.status), [429, 200, 200, 200], JSON.stringify(r));
      assert.deepEqual(r.emPausa, { pedidos: 4, noAr: 0, fila: 0, emCurso: 1 }, JSON.stringify(r));
      assert.equal(r.rq.status, 200, JSON.stringify(r));
      const t429 = r.ped[0].t;
      assert.equal(r.ped.length, 5);
      assert.ok(r.ped[4].t >= t429 + 900, `o quinto foi à Kick ${r.ped[4].t - t429} ms depois do 429 pedido`);
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('7. rajada com 429, retries e cancelamentos: nunca mais de 4 ativos, e a fila acaba toda',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const r = await p.evaluate(async () => {
        const ev = window.__evento;
        // O canal 4 responde 429 uma vez e depois lento; quem recebe o 429 repete, como `mensagensEntre`.
        window.__modos = { 0: 'lento', 1: 'rapido:30', 2: 'lento', 3: 'rapido', 4: ['429', 'lento'] };
        const t0 = performance.now();
        const tarefas = [];
        for (let j = 0; j < 14; j++) {
          const ctl = new AbortController();
          const cancela = j % 4 === 3;
          if (cancela) setTimeout(() => ctl.abort(), 20 + ((j * 7) % 40));
          tarefas.push((async () => {
            let x = await window.__ver(ev.buscarChat(window.__url(j % 5, j + 1), { signal: ctl.signal }));
            if (x.status === 429) x = await window.__ver(ev.buscarChat(window.__url(j % 5, j + 1), { signal: ctl.signal }));
            return { ...x, cancela };
          })());
        }
        const rs = await Promise.all(tarefas.map((x) => window.__ate(x, 15_000)));
        return {
          rs, total: Math.round(performance.now() - t0), depois: ev.vagasChat(),
          amostras: window.__k.pedidos.map((x) => x.noAr), max: window.__k.max, agora: window.__k.agora,
        };
      });
      assert.ok(r.rs.filter((x) => !x.cancela).every((x) => x.status === 200), JSON.stringify(r.rs));
      assert.ok(r.rs.filter((x) => x.cancela).every((x) => x.status === 200 || x.erro === 'AbortError'), JSON.stringify(r.rs));
      assert.ok(r.amostras.every((x) => x >= 1 && x <= 4), `vagas ocupadas: ${JSON.stringify(r.amostras)}`);
      assert.ok(r.max <= 4, `${r.max} transferências ao mesmo tempo`);
      assert.ok(r.total < 12_000, `a rajada demorou ${r.total} ms`);
      assert.equal(r.agora, 0, 'ficou transferência por largar');
      assert.deepEqual(r.depois, REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });

test('8. cabeçalhos que não chegam a meio do trecho: sem-rede, cobertura parcial, e retomar acaba sem perda nem duplicata',
  semNavegador, async () => {
    const { p, erros } = await preparar();
    try {
      const lido = (a, b) => p.evaluate(async ({ de, ate }) => {
        try {
          const x = await window.__evento.lerChatTrecho('lento0', de, ate);
          return { motivo: x.motivo, noTrecho: x.noTrecho };
        } catch (e) { return { erro: e?.name }; }
      }, { de: a, ate: b });
      const estado = () => p.evaluate(() => {
        const ev = window.__evento;
        return { ids: (ev.mensagens.get('lento0') || []).map((m) => m.id), coberto: ev.cobertoDoChat('lento0'), janelas: ev.janelasDoChat('lento0') };
      });
      // Abaixo das 21:04 os cabeçalhos nunca chegam; acima corre tudo.
      await p.evaluate(({ corte }) => {
        window.__evento.limiteCabecalhosChatMs = 300;
        window.__regra = (i, cursor) => (i === 0 && cursor < corte * 1000 ? 'sem-cabecalho' : null);
      }, { corte: T + 4 * MIN });
      const r1 = await lido(T, T + 10 * MIN);
      assert.equal(r1.motivo, 'sem-rede', JSON.stringify(r1));
      let e = await estado();
      assert.ok(e.ids.length > 0 && e.ids.length < 600, `${e.ids.length} mensagens`);
      assert.equal(new Set(e.ids).size, e.ids.length, 'mensagens a dobrar');
      // O buraco de baixo não ficou dado por coberto, nem virou janela de detecção.
      assert.ok(e.coberto.every(([a]) => a >= T + 3 * MIN), `cobriu o que não leu: ${JSON.stringify(e.coberto)}`);
      assert.ok(!e.janelas.some(([a, b]) => a === T && b === T + 10 * MIN), JSON.stringify(e.janelas));
      const antes = (await pedidos(p)).length;
      await p.evaluate(() => { window.__regra = null; });
      const r2 = await lido(T, T + 10 * MIN);
      assert.equal(r2.motivo, null, JSON.stringify(r2));
      assert.equal(r2.noTrecho, 600);
      e = await estado();
      assert.deepEqual(e.ids, Array.from({ length: 600 }, (_, k) => `lento0-${k}`));
      assert.deepEqual(e.coberto, [[T, T + 10 * MIN]]);
      assert.ok(e.janelas.some(([a, b]) => a === T && b === T + 10 * MIN));
      // A retomada só pediu o que faltava (o buraco de baixo e a fronteira), sem reler o que já veio.
      const topo = Math.max(...(await pedidos(p)).slice(antes).map((x) => x.cursor));
      assert.ok(topo <= (T + 4 * MIN) * 1000 + 60_000_000, `releu desde ${new Date(topo / 1000).toISOString()}`);
      assert.deepEqual(await vagas(p), REPOUSO);
      assert.deepEqual(erros, []);
    } finally {
      await p.close();
    }
  });
