'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const se = require('../src/stream/streamelements');

const ID = '5ee94965989257bffd416b5a';
function falso(rotas) {
  return async (url) => {
    const caminho = url.replace('https://api.streamelements.com/kappa/v2', '');
    const achou = Object.keys(rotas).find((k) => caminho.startsWith(k));
    if (!achou) return { ok: false, status: 404, json: async () => ({}) };
    const v = rotas[achou];
    return { ok: true, status: 200, json: async () => (typeof v === 'function' ? v(caminho) : v) };
  };
}

test('id já em formato de id passa direto, sem chamar a API', async () => {
  let bateu = false;
  const espiao = async () => { bateu = true; return { ok: true, json: async () => ({}) }; };
  assert.equal(await se.idDoCanal(ID, espiao), ID);
  assert.equal(bateu, false);
});

test('nome de canal é resolvido para id', async () => {
  const b = falso({ '/channels/tchubi': { _id: ID } });
  assert.equal(await se.idDoCanal('tchubi', b), ID);
});

test('canal inexistente falha com nome no erro', async () => {
  const b = falso({ '/channels/': {} });
  await assert.rejects(() => se.idDoCanal('naoexiste', b), /naoexiste/);
});

test('pontos DESLIGADO é reportado como não-gravando, com motivo', async () => {
  const b = falso({ '/channels/': { _id: ID }, '/loyalty/': { loyalty: { enabled: false, name: 'points' } } });
  const r = await se.estaGravando('tchubi', b);
  assert.equal(r.gravando, false);
  assert.match(r.motivo, /DESLIGADO/);
});

test('pontos LIGADO é reportado como gravando, sem motivo', async () => {
  const b = falso({ '/channels/': { _id: ID }, '/loyalty/': { loyalty: { enabled: true, name: 'moedas' } } });
  const r = await se.estaGravando('tchubi', b);
  assert.equal(r.gravando, true);
  assert.equal(r.nomeDosPontos, 'moedas');
  assert.equal(r.motivo, undefined);
});

test('lista de audiência é paginada até acabar', async () => {
  const pagina = (c) => {
    const off = Number(new URL('http://x' + c).searchParams.get('offset'));
    const n = off < 200 ? 100 : 37;
    return { users: Array.from({ length: n }, (_, i) => ({
      username: `u${off + i}`, _id: `id${off + i}`, points: 10, watchtime: 60 })) };
  };
  const b = falso({ '/channels/': { _id: ID }, '/points/': pagina });
  const a = await se.audiencia(ID, { buscar: b, limite: 1000 });
  assert.equal(a.length, 237, `veio ${a.length}`);
  assert.equal(a[0].nome, 'u0');
  assert.equal(a[0].minutosAssistidos, 60);
});

test('audiência vazia não explode', async () => {
  const b = falso({ '/channels/': { _id: ID }, '/points/': { _total: 0, users: [] } });
  assert.deepEqual(await se.audiencia(ID, { buscar: b }), []);
});

test('erro da API vira erro com status, não silêncio', async () => {
  const b = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => se.estaGravando(ID, b), /503/);
});

test('watchtime ausente vira null, não zero', async () => {
  const b = falso({ '/channels/': { _id: ID },
    '/points/': { users: [{ username: 'x', _id: '1', points: 5 }] } });
  const a = await se.audiencia(ID, { buscar: b });
  // zero diria "assistiu nada"; null diz "não sei" — são coisas diferentes
  assert.equal(a[0].minutosAssistidos, null);
});
