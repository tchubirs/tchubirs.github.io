// As fotos dos cartões (queixa: "demoram, às vezes nem carregam"): uma falha de quadro não pode deixar cartões
// sem foto, nem de vez nem sem fim. Nada de rede: Hls, vídeo e quadros são de mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { chatEVideo } from './chat-falso.mjs';
import { abrirQuadrosEscondidos } from '../site/rosto.js';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

// ── cenário 2: sem navegador, com um DOM de mentira ─────────────────────────

function domFalso() {
  const guardado = { document: globalThis.document, window: globalThis.window };
  const hlsCriados = [];
  const videos = [];
  class Video extends EventTarget {
    constructor() {
      super();
      this.style = {}; this.readyState = 0; this.seeking = false; this.videoWidth = 640; this.videoHeight = 360;
      this.error = null; this._t = 0; this.morto = false; videos.push(this);
    }
    get currentTime() { return this._t; }
    set currentTime(v) {
      this._t = v; this.seeking = true;
      // Depois de um erro fatal o hls.js para de buscar segmentos: um salto para fora do que já está no buffer nunca termina.
      if (this.morto) return;
      setTimeout(() => { this.seeking = false; this.readyState = 4; this.dispatchEvent(new Event('seeked')); }, 5);
    }
    // O caminho nativo (Safari): pôr a `src` recomeça a carga e limpa o erro.
    set src(v) { this._src = v; this.error = null; this.morto = false; }
    get src() { return this._src; }
    setAttribute() {} removeAttribute() {} load() {} remove() {}
  }
  const tela = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) });
  globalThis.document = {
    createElement: (n) => (n === 'video' ? new Video() : tela()),
    body: { append() {} },
  };
  class Hls {
    static isSupported() { return true; }
    static Events = { ERROR: 'hlsError' };
    constructor() { this.h = {}; this.destruido = false; hlsCriados.push(this); }
    on(e, f) { this.h[e] = f; }
    loadSource() {} attachMedia() { videos.forEach((v) => { v.morto = false; }); }
    destroy() { this.destruido = true; }
  }
  globalThis.window = { Hls };
  return { hlsCriados, videos, erroFatal() { hlsCriados.at(-1).h.hlsError({}, { fatal: true }); videos.forEach((v) => { v.morto = true; }); }, restaurar() { globalThis.document = guardado.document; globalThis.window = guardado.window; } };
}

test('2: depois de um erro fatal do hls.js, o quadro seguinte na MESMA url recarrega e funciona', async () => {
  const d = domFalso();
  try {
    const q = abrirQuadrosEscondidos({ limiteMs: 2000 });
    const url = 'https://cdn/vod/480p.m3u8';
    assert.ok(await q.quadro({ url, tempoS: 10 }), 'o primeiro quadro tem de sair (controle do teste)');
    assert.equal(d.hlsCriados.length, 1);
    // Um erro fatal passageiro (rede, 5xx de um segmento).
    d.erroFatal();
    const t0 = Date.now();
    const r = await q.quadro({ url, tempoS: 40 });
    const ms = Date.now() - t0;
    assert.ok(r, `o 2o quadro na mesma url falhou (null) em ${ms} ms; hls criados: ${d.hlsCriados.length} (esperava 2: recarregar)`);
  } finally { d.restaurar(); }
});

test('2b: um erro fatal não pode derrubar os quadros seguintes da mesma url', async () => {
  const d = domFalso();
  try {
    const q = abrirQuadrosEscondidos({ limiteMs: 2000 });
    const url = 'https://cdn/vod/480p.m3u8';
    await q.quadro({ url, tempoS: 10 });
    d.erroFatal();
    let nulos = 0;
    for (const s of [40, 70, 100]) if (!(await q.quadro({ url, tempoS: s }))) nulos++;
    assert.equal(nulos, 0, `${nulos} de 3 quadros falharam depois de UM erro fatal; hls criados: ${d.hlsCriados.length}`);
  } finally { d.restaurar(); }
});

// Revisão 17/10: no caminho nativo (sem hls.js, como no Safari) o erro fica em `video.error`, não em `falhou`.
test('2c: sem hls.js, depois de um erro do vídeo o quadro seguinte na MESMA url recarrega e funciona', async () => {
  const d = domFalso();
  try {
    globalThis.window = {};
    const q = abrirQuadrosEscondidos({ limiteMs: 1000 });
    const url = 'https://cdn/vod/480p.m3u8';
    assert.ok(await q.quadro({ url, tempoS: 10 }), 'o primeiro quadro tem de sair (controle do teste)');
    d.videos[0].error = { code: 2 }; d.videos[0].morto = true;
    assert.ok(await q.quadro({ url, tempoS: 40 }), 'o 2o quadro na mesma url falhou depois de um erro do vídeo');
  } finally { d.restaurar(); }
});

// Revisão 17/10: um quadro pedido depois de fechar não recria o hls.js num vídeo já tirado da página.
test('2d: depois de fechar, quadro() devolve null sem criar outro hls.js', async () => {
  const d = domFalso();
  try {
    const q = abrirQuadrosEscondidos({ limiteMs: 2000 });
    const url = 'https://cdn/vod/480p.m3u8';
    await q.quadro({ url, tempoS: 10 });
    q.fechar();
    const t0 = Date.now();
    assert.equal(await q.quadro({ url, tempoS: 40 }), null);
    assert.ok(Date.now() - t0 < 200, `demorou ${Date.now() - t0} ms`);
    assert.equal(d.hlsCriados.length, 1, 'criou outro hls.js depois de fechar');
  } finally { d.restaurar(); }
});

// ── na página ───────────────────────────────────────────────────────────────

// Os parâmetros dizem como o decodificador de mentira se porta: as primeiras falhas, se a falha é permanente e a
// chamada que fica presa à espera de `window.__soltar()` (para mexer na página a meio do laço). `picos`: quantos
// cartões o chat dá.
async function listaDeTchubi({ falhasIniciais = 0, permanente = false, portaEm = 0, picos = 4, alternar = false } = {}) {
  const { p, erros } = await abrir({ ecra: { width: 1366, height: 768 }, caminho: null, modo: 'simples' });
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await chatEVideo(p, { canais: ['tchubi', 'outro'] });
  await p.addInitScript((plano) => {
    window.__fotoChamadas = 0; window.__abertas = 0; window.__fechadas = 0; window.__tardias = 0;
    window.__povixQuadrosSimples = () => {
      window.__abertas++;
      let aberto = true;
      return {
        async quadro({ canal } = {}) {
          const n = ++window.__fotoChamadas;
          if (!aberto) window.__tardias++;
          if (plano.portaEm === n) await new Promise((ok) => { window.__soltar = ok; window.__presa = true; });
          if (plano.permanente || n <= plano.falhasIniciais || (plano.alternar && n % 2)) return null;
          // A cor diz de que canal é o quadro: vermelho para tchubi, azul para os outros.
          const c = document.createElement('canvas'); c.width = 640; c.height = 360;
          const g = c.getContext('2d');
          g.fillStyle = canal === 'tchubi' ? '#ff0000' : '#0000ff';
          g.fillRect(0, 0, 640, 360);
          return { tela: c };
        },
        fechar() { aberto = false; window.__fechadas++; },
      };
    };
  }, { falhasIniciais, permanente, portaEm, alternar });
  await p.route('**/api/v2/channels/*/messages**', async (rota) => {
    const u = new URL(rota.request().url());
    const cursorMs = Number(u.searchParams.get('cursor')) / 1000;
    const lista = [];
    for (let k = 0; k < 30; k++) lista.push(T + k * 20_000);
    // Picos separados: um cartão cada.
    for (let b = 0; b < picos; b++) for (let k = 0; k < 40 + b * 15; k++) lista.push(T + 2000 + b * 118_000 + k * 400);
    const antes = lista.sort((a, b) => a - b).map((ms, n) => ({
      id: `s-${n}`, created_at: new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z'), content: 'kkk', sender: { slug: `fa${n % 7}` },
    })).filter((m) => Date.parse(m.created_at) < cursorMs);
    const pagina = antes.slice(-25).reverse();
    await rota.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { messages: pagina, cursor: pagina.length ? String(Date.parse(pagina.at(-1).created_at) * 1000) : null } }) });
  });
  await p.context().route(/cdn\.jsdelivr\.net|huggingface\.co/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#simplesCaixa', 'tchubi');
  await p.click('#simplesAchar');
  await p.waitForSelector('#simplesPreparar:not([hidden])');
  await p.check('#buscaInteira');
  await p.click('#buscaComecar');
  await p.waitForSelector('#simplesLista li', { timeout: 60_000 });
  await p.waitForFunction(() => document.getElementById('simplesParar').hidden, null, { timeout: 60_000 });
  return { p, erros };
}

// De que canal é cada foto pintada (pela cor do quadro de mentira).
const coresDasFotos = (p) => p.evaluate(() => Promise.all([...document.querySelectorAll('#simplesLista li .simplesFoto img')].map(async (img) => {
  await img.decode();
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
  const [r, , b] = g.getImageData(4, 4, 1, 1).data;
  return r > b ? 'tchubi' : 'outro';
})));

const medir = (p) => p.evaluate(() => ({
  cartoes: document.querySelectorAll('#simplesLista li').length,
  comFoto: document.querySelectorAll('#simplesLista li .simplesFoto img').length,
  chamadas: window.__fotoChamadas, abertas: window.__abertas, fechadas: window.__fechadas, tardias: window.__tardias,
}));

// Cenário 1: quatro falhas seguidas no início — o rearme termina o trabalho sozinho, sem novo gatilho.
test('1: quatro falhas seguidas no início e depois sucesso: todos os cartões ganham foto',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ falhasIniciais: 4 });
    try {
      await p.waitForFunction(() => {
        const n = document.querySelectorAll('#simplesLista li').length;
        return n >= 3 && document.querySelectorAll('#simplesLista li .simplesFoto img').length === n;
      }, null, { timeout: 25_000 }).catch(() => {});
      const r = await medir(p);
      console.log('1 medido:', JSON.stringify(r));
      assert.ok(r.cartoes >= 3, `precisa de >=3 cartões para o teste valer (veio ${r.cartoes})`);
      assert.equal(r.comFoto, r.cartoes, `${r.cartoes - r.comFoto} de ${r.cartoes} cartões ficaram sem foto; chamadas ao decodificador: ${r.chamadas}`);
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// Cenário 3: com a Kick fora o trabalho pára: limite de falhas seguidas e de rearmes, sem laço sem fim.
test('3: falha permanente: pára depois do limite e dos rearmes, sem laço infinito nem erros na consola',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ permanente: true });
    try {
      await p.waitForTimeout(16_000); // dois rearmes de ~4 s e folga
      const a = await medir(p);
      await p.waitForTimeout(10_000);
      const b = await medir(p);
      console.log('3 medido:', JSON.stringify({ a, b }));
      assert.ok(a.cartoes >= 3);
      assert.equal(a.comFoto, 0);
      assert.equal(b.chamadas, a.chamadas, `continuou a tentar depois do limite: ${a.chamadas} -> ${b.chamadas} chamadas`);
      assert.ok(a.chamadas <= 40, `demasiadas tentativas: ${a.chamadas}`);
      assert.equal(b.abertas, b.fechadas, 'um decodificador ficou aberto');
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// Cenário 4: a lista muda de ordem a meio do laço (os cartões ainda sem foto passam para trás do ponto onde o
// laço vai): a chamada nova é descartada, e quem apanha os que ficaram é o rearme.
test('4: cartões que mudam de lugar durante o laço ganham foto na mesma',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ portaEm: 3 });
    try {
      await p.waitForFunction(() => window.__presa === true, null, { timeout: 30_000 });
      const antes = await p.evaluate(() => [...document.querySelectorAll('#simplesLista li')].map((l) => l.dataset.chave));
      await p.click('#simplesFiltrar');
      await p.selectOption('#filtroOrdem', 'melhores');
      await p.locator('#filtroOrdem').evaluate((el) => el.form.requestSubmit());
      await p.waitForFunction((a) => [...document.querySelectorAll('#simplesLista li')].map((l) => l.dataset.chave).join() !== a, antes.join(), { timeout: 10_000 });
      await p.evaluate(() => window.__soltar());
      await p.waitForFunction(() => {
        const n = document.querySelectorAll('#simplesLista li').length;
        return n >= 3 && document.querySelectorAll('#simplesLista li .simplesFoto img').length === n;
      }, null, { timeout: 40_000 }).catch(() => {});
      const r = await medir(p);
      console.log('4 medido:', JSON.stringify({ antes, ...r }));
      assert.equal(r.comFoto, r.cartoes, `${r.cartoes - r.comFoto} cartões ficaram sem foto depois de a lista mudar de ordem`);
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// Cenário 5: abrir outro canal a meio do laço: o decodificador do primeiro é solto, não pede nem pinta mais nada,
// e o canal novo ganha as fotos dele (o rearme cobre a chamada que o laço antigo descartou).
test('5: trocar de canal a meio do laço solta o decodificador e não mistura fotos',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ portaEm: 2 });
    try {
      await p.waitForFunction(() => window.__presa === true, null, { timeout: 30_000 });
      const chaves = await p.evaluate(() => [...document.querySelectorAll('#simplesLista li')].map((l) => l.dataset.chave));
      await p.evaluate(() => document.getElementById('simplesDeNovo').click());
      await p.fill('#simplesCaixa', 'outro');
      await p.click('#simplesAchar');
      await p.waitForSelector('#simplesPreparar:not([hidden])');
      await p.check('#buscaInteira');
      await p.click('#buscaComecar');
      await p.waitForFunction(() => document.getElementById('simplesParar').hidden && document.querySelectorAll('#simplesLista li').length > 0, null, { timeout: 60_000 });
      const chamadasAntes = await p.evaluate(() => window.__fotoChamadas);
      await p.evaluate(() => window.__soltar());
      await p.waitForFunction(() => {
        const n = document.querySelectorAll('#simplesLista li').length;
        return n >= 3 && document.querySelectorAll('#simplesLista li .simplesFoto img').length === n;
      }, null, { timeout: 40_000 });
      const r = await medir(p);
      console.log('5 medido:', JSON.stringify({ ...r, chamadasAntes, chaves }));
      assert.equal(r.fechadas, r.abertas, 'um decodificador ficou aberto');
      assert.equal(r.tardias, 0, 'o laço antigo pediu quadros depois de fechado');
      assert.equal(r.comFoto, r.cartoes);
      assert.deepEqual([...new Set(await coresDasFotos(p))], ['outro'], 'foto do canal antigo pintada na lista do canal novo');
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// Cenário 5b (fechamento literal): "Começar de novo" a meio do laço, sem abrir outra coisa. O quadro que estava a
// ser tirado não é pintado, o decodificador é solto, não há mais pedidos nem rearmes.
test('5b: "Começar de novo" a meio do laço encerra a volta: sem foto tardia, sem pedidos nem rearmes depois',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ portaEm: 2 });
    try {
      await p.waitForFunction(() => window.__presa === true, null, { timeout: 30_000 });
      await p.evaluate(() => document.getElementById('simplesDeNovo').click());
      const antes = await medir(p);
      await p.evaluate(() => window.__soltar());
      await p.waitForTimeout(12_000); // passa da pausa de rearme (4 s) com folga
      const depois = await medir(p);
      console.log('5b medido:', JSON.stringify({ antes, depois }));
      assert.equal(depois.comFoto, antes.comFoto, 'o quadro que estava a ser tirado foi pintado depois de fechar');
      assert.equal(depois.chamadas, antes.chamadas, `pediu quadros depois de fechar: ${antes.chamadas} -> ${depois.chamadas}`);
      assert.equal(depois.abertas, depois.fechadas, 'um decodificador ficou aberto');
      assert.equal(depois.tardias, 0);
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// Revisão 17/10: "Começar de novo" e reabrir o MESMO canal reusa o mesmo objeto da linha; a volta nova tem de
// começar na mesma (antes só começava se a linha fosse outra).
test('5d: "Começar de novo" a meio do laço e reabrir o mesmo canal: a lista nova ganha fotos',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ portaEm: 2 });
    try {
      await p.waitForFunction(() => window.__presa === true, null, { timeout: 30_000 });
      await p.evaluate(() => document.getElementById('simplesDeNovo').click());
      await p.fill('#simplesCaixa', 'tchubi');
      await p.click('#simplesAchar');
      await p.waitForSelector('#simplesPreparar:not([hidden])');
      await p.check('#buscaInteira');
      await p.click('#buscaComecar');
      await p.waitForFunction(() => document.getElementById('simplesParar').hidden && document.querySelectorAll('#simplesLista li').length > 0, null, { timeout: 60_000 });
      await p.evaluate(() => window.__soltar());
      await p.waitForFunction(() => {
        const n = document.querySelectorAll('#simplesLista li').length;
        return n >= 3 && document.querySelectorAll('#simplesLista li .simplesFoto img').length === n;
      }, null, { timeout: 20_000 }).catch(() => {});
      const r = await medir(p);
      console.log('5d medido:', JSON.stringify(r));
      assert.equal(r.comFoto, r.cartoes, `${r.comFoto} de ${r.cartoes} cartões com foto`);
      assert.equal(r.fechadas, r.abertas, 'um decodificador ficou aberto');
      assert.equal(r.tardias, 0);
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// A janela entre o fim da cadeia antiga e a volta imediata da lista nova: parar ali também cancela essa volta.
test('5c: parar logo depois de a cadeia antiga acabar cancela a volta imediata da lista nova',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ portaEm: 2 });
    try {
      await p.waitForFunction(() => window.__presa === true, null, { timeout: 30_000 });
      await p.evaluate(() => document.getElementById('simplesDeNovo').click());
      await p.fill('#simplesCaixa', 'outro');
      await p.click('#simplesAchar');
      await p.waitForSelector('#simplesPreparar:not([hidden])');
      await p.check('#buscaInteira');
      await p.click('#buscaComecar');
      await p.waitForFunction(() => document.getElementById('simplesParar').hidden && document.querySelectorAll('#simplesLista li').length > 0, null, { timeout: 60_000 });
      // Solta o quadro preso e, antes da próxima tarefa (onde corre a volta agendada), carrega em "Começar de novo".
      const antes = await p.evaluate(async () => {
        window.__soltar();
        for (let i = 0; i < 200; i++) await null; // eslint-disable-line no-await-in-loop
        document.getElementById('simplesDeNovo').click();
        return window.__fotoChamadas;
      });
      await p.waitForTimeout(6000);
      const r = await medir(p);
      console.log('5c medido:', JSON.stringify({ antes, ...r }));
      assert.equal(r.chamadas, antes, `uma volta começou depois de parar: ${antes} -> ${r.chamadas}`);
      assert.equal(r.abertas, r.fechadas, 'um decodificador ficou aberto');
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });

// O limite é de falhas SEGUIDAS: falha e sucesso alternados nunca chegam a quatro seguidas, e todos ganham foto.
test('6: falha e sucesso alternados: a conta zera a cada sucesso e todos os cartões ganham foto',
  { ...semNavegador, timeout: 120_000 }, async () => {
    const { p, erros } = await listaDeTchubi({ alternar: true });
    try {
      await p.waitForFunction(() => {
        const n = document.querySelectorAll('#simplesLista li').length;
        return n >= 3 && document.querySelectorAll('#simplesLista li .simplesFoto img').length === n;
      }, null, { timeout: 25_000 }).catch(() => {});
      const r = await medir(p);
      console.log('6 medido:', JSON.stringify(r));
      assert.ok(r.cartoes >= 3);
      assert.equal(r.comFoto, r.cartoes, `${r.cartoes - r.comFoto} cartões sem foto com falhas alternadas`);
      assert.deepEqual(erros, []);
    } finally { await p.close(); }
  });
