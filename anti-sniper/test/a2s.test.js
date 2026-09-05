'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { consultar } = require('../src/jogo/rust-a2s');

/** Servidor A2S de mentira, para testar o parser sem depender de rede real. */
function servidorFalso({ censurado = false, exigirDesafio = true, jogadores = null } = {}) {
  const CAB = Buffer.from([0xff, 0xff, 0xff, 0xff]);
  const txt = (s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
  const lista = jogadores ?? [
    { nome: 'xX_Ma7ador_Xx', pontos: 12, seg: 3600 },
    { nome: 'Pedrinho', pontos: 3, seg: 90 },
  ];

  const info = Buffer.concat([
    CAB, Buffer.from([0x49, 17]),
    txt('Rust BR 2x | Teste'), txt('Procedural Map'), txt('rust'), txt('Rust'),
    Buffer.from([0xfa, 0x00]), Buffer.from([lista.length, 100]),
  ]);
  const desafio = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
  const respDesafio = Buffer.concat([CAB, Buffer.from([0x41]), desafio]);

  const partes = [CAB, Buffer.from([0x44, censurado ? 0 : lista.length])];
  if (!censurado) {
    for (const j of lista) {
      const b = Buffer.alloc(8);
      b.writeInt32LE(j.pontos, 0); b.writeFloatLE(j.seg, 4);
      partes.push(Buffer.from([0]), txt(j.nome), b);
    }
  }
  const respJog = Buffer.concat(partes);

  const s = dgram.createSocket('udp4');
  s.on('message', (m, rinfo) => {
    const tipo = m[4];
    if (tipo === 0x54) return void s.send(info, rinfo.port, rinfo.address);
    if (tipo === 0x55) {
      const temDesafio = !m.subarray(5, 9).equals(Buffer.from([0xff, 0xff, 0xff, 0xff]));
      if (exigirDesafio && !temDesafio) return void s.send(respDesafio, rinfo.port, rinfo.address);
      return void s.send(respJog, rinfo.port, rinfo.address);
    }
  });
  return new Promise((r) => s.bind(0, '127.0.0.1', () => r({ porta: s.address().port, fechar: () => s.close() })));
}

test('lê nome, mapa e contagem do servidor', async () => {
  const sv = await servidorFalso();
  const r = await consultar('127.0.0.1', sv.porta, { tempoLimiteMs: 2000 });
  sv.fechar();
  assert.equal(r.info.nome, 'Rust BR 2x | Teste');
  assert.equal(r.info.mapa, 'Procedural Map');
  assert.equal(r.info.jogo, 'Rust');
  assert.equal(r.info.max, 100);
});

test('lê a lista de jogadores com nome e tempo no servidor', async () => {
  const sv = await servidorFalso();
  const r = await consultar('127.0.0.1', sv.porta, { tempoLimiteMs: 2000 });
  sv.fechar();
  assert.equal(r.jogadores.length, 2);
  assert.equal(r.jogadores[0].nome, 'xX_Ma7ador_Xx');
  assert.equal(r.jogadores[0].minutosNoServidor, 60);
  assert.equal(r.jogadores[1].minutosNoServidor, 2, '90 s arredonda para 2 min');
});

test('responde ao pedido de desafio e reenvia', async () => {
  const sv = await servidorFalso({ exigirDesafio: true });
  const r = await consultar('127.0.0.1', sv.porta, { tempoLimiteMs: 2000 });
  sv.fechar();
  assert.ok(Array.isArray(r.jogadores), 'sem tratar o desafio, isto vem null');
});

test('servidor SEM desafio também funciona', async () => {
  const sv = await servidorFalso({ exigirDesafio: false });
  const r = await consultar('127.0.0.1', sv.porta, { tempoLimiteMs: 2000 });
  sv.fechar();
  assert.equal(r.jogadores.length, 2);
});

test('lista censurada devolve vazio, e o servidor ainda diz ter gente', async () => {
  const sv = await servidorFalso({ censurado: true });
  const r = await consultar('127.0.0.1', sv.porta, { tempoLimiteMs: 2000 });
  sv.fechar();
  // Isto NÃO pode ser lido como "servidor vazio": a contagem diz 2.
  assert.deepEqual(r.jogadores, []);
  assert.equal(r.info.jogadores, 2);
});

test('servidor mudo devolve null em vez de travar', async () => {
  const s = dgram.createSocket('udp4');
  await new Promise((r) => s.bind(0, '127.0.0.1', r));
  const porta = s.address().port;
  const r = await consultar('127.0.0.1', porta, { tempoLimiteMs: 400 });
  s.close();
  assert.equal(r, null);
});

test('nome com acento e emoji sobrevive à leitura', async () => {
  const sv = await servidorFalso({ jogadores: [{ nome: 'João 🔥 Ção', pontos: 1, seg: 60 }] });
  const r = await consultar('127.0.0.1', sv.porta, { tempoLimiteMs: 2000 });
  sv.fechar();
  assert.equal(r.jogadores[0].nome, 'João 🔥 Ção');
});
