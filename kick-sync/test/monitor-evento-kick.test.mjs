import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transmissoesDoEvento, clipesDoEvento, consultarEventoKick } from '../monitor/evento-kick.mjs';

const ID = '01a132ac-44ce-73c3-885a-eca55f6bdaba';
const stream = { channel: { slug: 'kodd', id: 4937119 }, livestream: { title: 'ABISAL', view_count: 10 } };
const clip = { id: 'clip_01M50E22Q9745E037BAXSTK4VG', channel: { slug: 'poionako' }, started_at: '2026-10-15T18:43:38Z', title: 'gg base', duration: 22, views_count: 130 };

test('canais oficiais trazem IDs de canal, sem repetir nem aceitar nomes inválidos', () => {
  const r = transmissoesDoEvento({ data: { streams: [stream, stream, { channel: { id: -1, slug: '../fora' } }] } });
  assert.deepEqual(r, [{ slug: 'kodd', id: 4937119, titulo: 'ABISAL', espectadores: 10 }]);
  assert.throws(() => transmissoesDoEvento({ data: {} }), /invalida/);
});

test('clipes públicos mantêm origem, relógio e crédito, sem presumir revisão', () => {
  const r = clipesDoEvento({ data: { clips: [clip] } });
  assert.equal(r[0].ms, Date.parse(clip.started_at));
  assert.equal(r[0].canal, 'poionako');
  assert.equal(r[0].link, `https://kick.com/poionako/clips/${clip.id}`);
  assert.equal(r[0].origem, 'clipe-publico-kick');
  assert.equal(r[0].revisado, false);
  assert.equal('vitima' in r[0], false);
});

test('clipes inválidos não entram na fila', () => {
  const ruins = [{ ...clip, id: '../fora' }, { ...clip, duration: 999999 }, { ...clip, started_at: 'ontem' }, { ...clip, channel: { slug: 'https://outro' } }];
  assert.deepEqual(clipesDoEvento({ data: { clips: ruins } }), []);
  assert.throws(() => clipesDoEvento({}), /invalida/);
});

test('consulta pública busca os canais e as duas ordenações sem chamar participantes restritos', async () => {
  const urls = [];
  const r = await consultarEventoKick(ID, { buscar: async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(url.endsWith('/streams') ? { data: { streams: [stream] } } : { data: { clips: [clip] } }));
  } });
  assert.equal(r.transmissoes[0].slug, 'kodd');
  assert.equal(r.recentes.length, 1);
  assert.equal(r.populares.length, 1);
  assert.equal(urls.length, 3);
  assert.ok(urls.every(u => u.startsWith(`https://web.kick.com/api/v1/events/${ID}/`)));
  assert.ok(urls.some(u => u.includes('sort_by=clip_id')));
  assert.ok(urls.every(u => !u.includes('/participants')));
  assert.deepEqual(r.falhas, []);
});

test('falha em uma fonte não apaga as demais nem vira lista completa vazia', async () => {
  const r = await consultarEventoKick(ID, { buscar: async url => url.endsWith('/streams')
    ? new Response('', { status: 403 })
    : new Response(JSON.stringify({ data: { clips: [clip] } })) });
  assert.equal(r.transmissoes, undefined);
  assert.equal(r.recentes.length, 1);
  assert.deepEqual(r.falhas, [{ fonte: 'transmissoes', motivo: 'http-403' }]);
});

test('ID inválido é recusado antes da rede', async () => {
  let chamadas = 0;
  await assert.rejects(consultarEventoKick('../fora', { buscar: () => chamadas++ }), /invalido/);
  assert.equal(chamadas, 0);
});
