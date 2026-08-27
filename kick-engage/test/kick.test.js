'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, createSign } = require('node:crypto');
const { verificarWebhook } = require('../src/webhook');
const { Medidor } = require('../src/metrics');

const T = Date.parse('2026-08-01T20:00:00Z');
const H = 3600000;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });

function assinar(corpo, { id = '01J0', ts = new Date(T).toISOString() } = {}) {
  const s = createSign('sha256');
  s.update(Buffer.from(`${id}.${ts}.${corpo}`, 'utf8'));
  s.end();
  return {
    'Kick-Event-Message-Id': id,
    'Kick-Event-Message-Timestamp': ts,
    'Kick-Event-Signature': s.sign(privateKey).toString('base64'),
    'Kick-Event-Type': 'chat.message',
  };
}
const op = { chavePublica: PUB, agoraMs: T };

test('webhook legítimo é aceito e devolve os dados', () => {
  const corpo = JSON.stringify({ sender: { user_id: 7 }, content: 'oi' });
  const r = verificarWebhook(assinar(corpo), corpo, op);
  assert.equal(r.valido, true);
  assert.equal(r.dados.sender.user_id, 7);
});

test('corpo adulterado é recusado', () => {
  const corpo = JSON.stringify({ sender: { user_id: 7 } });
  const r = verificarWebhook(assinar(corpo), corpo + ' ', op);
  assert.match(r.motivo, /assinatura não confere/);
});

test('cabeçalho funciona em qualquer caixa', () => {
  const corpo = JSON.stringify({ a: 1 });
  const h = assinar(corpo);
  const minusculo = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  assert.equal(verificarWebhook(minusculo, corpo, op).valido, true);
});

test('corpo já parseado é recusado com aviso explícito', () => {
  const corpo = JSON.stringify({ a: 1 });
  const r = verificarWebhook(assinar(corpo), JSON.parse(corpo), op);
  assert.match(r.motivo, /não passe objeto já parseado/);
});

test('evento fora da janela é recusado nos dois sentidos', () => {
  const corpo = JSON.stringify({ a: 1 });
  const h = assinar(corpo);
  assert.match(verificarWebhook(h, corpo, { ...op, agoraMs: T + H }).motivo, /janela de tempo/);
  assert.match(verificarWebhook(h, corpo, { ...op, agoraMs: T - H }).motivo, /janela de tempo/);
});

test('cabeçalho faltando é recusado, não explode', () => {
  const corpo = JSON.stringify({ a: 1 });
  for (const c of ['Kick-Event-Message-Id', 'Kick-Event-Message-Timestamp', 'Kick-Event-Signature']) {
    const h = assinar(corpo); delete h[c];
    assert.match(verificarWebhook(h, corpo, op).motivo, /cabeçalho ausente/);
  }
  assert.equal(verificarWebhook(null, corpo, op).valido, false);
});

test('conta pessoas, não mensagens', () => {
  const m = new Medidor();
  for (let k = 0; k < 400; k++) m.ingerir('chat.message', { sender: { user_id: 1 } }, T + k);
  m.ingerir('chat.message', { sender: { user_id: 2 } }, T);
  const r = m.relatorio(T + H);
  assert.equal(r.chattersUnicos, 2);
  assert.equal(r.mensagens, 401);
});

test('marca quem falou pela primeira vez', () => {
  const m = new Medidor();
  assert.equal(m.ingerir('chat.message', { sender: { user_id: 9 } }, T).primeiraVez, true);
  assert.equal(m.ingerir('chat.message', { sender: { user_id: 9 } }, T + 1).primeiraVez, false);
});

test('janela de 30 dias descarta o que envelheceu', () => {
  const m = new Medidor();
  m.ingerir('chat.message', { sender: { user_id: 1 } }, T);
  m.ingerir('chat.message', { sender: { user_id: 2 } }, T + 29 * 24 * H);
  const r = m.relatorio(T + 31 * 24 * H);
  assert.equal(r.chattersUnicos, 1, 'o de 31 dias atrás tem que sair');
});

test('horas transmitidas somam por par de início e fim', () => {
  const m = new Medidor();
  m.ingerir('livestream.status.updated', { is_live: true }, T);
  m.ingerir('livestream.status.updated', { is_live: false }, T + 4 * H);
  m.ingerir('livestream.status.updated', { is_live: true }, T + 10 * H);
  m.ingerir('livestream.status.updated', { is_live: false }, T + 13 * H);
  assert.equal(m.relatorio(T + 20 * H).horas, 7);
});

test('transmissão em curso conta até agora', () => {
  const m = new Medidor();
  m.ingerir('livestream.status.updated', { is_live: true }, T);
  assert.equal(m.relatorio(T + 3 * H).horas, 3);
});

test('fim sem início não vira hora negativa nem infinita', () => {
  const m = new Medidor();
  m.ingerir('livestream.status.updated', { is_live: false }, T);
  assert.equal(m.relatorio(T + 5 * H).horas, 0);
});

test('progresso diz exatamente quanto falta', () => {
  const m = new Medidor({ chattersUnicos: 250 });
  for (let i = 0; i < 137; i++) m.ingerir('chat.message', { sender: { user_id: i } }, T);
  const p = m.relatorio(T + H).progresso.chattersUnicos;
  assert.deepEqual(p, { valor: 137, meta: 250, falta: 113, atingido: false });
});

test('sem limiar configurado, só conta e não julga', () => {
  const m = new Medidor();
  const r = m.relatorio(T);
  assert.deepEqual(r.progresso, {});
  assert.equal(r.tudoAtingido, false, 'sem meta não se declara vitória');
});

test('evento sem quem o emitiu é ignorado em vez de contar errado', () => {
  const m = new Medidor();
  assert.equal(m.ingerir('chat.message', {}, T), null);
  assert.equal(m.ingerir('channel.followed', { follower: {} }, T), null);
  assert.equal(m.ingerir('evento.desconhecido', { x: 1 }, T), null);
  assert.equal(m.relatorio(T).chattersUnicos, 0);
});

test('username serve quando não vem user_id', () => {
  const m = new Medidor();
  m.ingerir('chat.message', { sender: { username: 'fulano' } }, T);
  assert.equal(m.relatorio(T).chattersUnicos, 1);
});
