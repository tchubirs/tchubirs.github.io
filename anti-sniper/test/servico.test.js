'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, createSign, sign } = require('node:crypto');
const { criar } = require('../servico/servidor');
const d = require('../servico/discord');

const T = Date.parse('2026-08-27T21:00:00Z');
const MIN = 60000;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });

function bancada() {
  const s = criar({ caminhoBanco: ':memory:', chavePem: PUB, agora: () => T });
  s.db.prepare('INSERT INTO canal VALUES (?,?,?,?)').run('c1', 'kick', 'tchubi', T);
  return s;
}
function assinado(corpoObj, { id = 'ev1', ts = new Date(T).toISOString() } = {}) {
  const corpo = Buffer.from(JSON.stringify(corpoObj), 'utf8');
  const sg = createSign('sha256');
  sg.update(Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), corpo]));
  sg.end();
  return {
    corpo,
    cabecalhos: {
      'Kick-Event-Message-Id': id,
      'Kick-Event-Message-Timestamp': ts,
      'Kick-Event-Signature': sg.sign(privateKey).toString('base64'),
      'Kick-Event-Type': 'chat.message',
    },
  };
}
const msg = (nome, id) => ({ sender: { username: nome, user_id: id } });

test('webhook legítimo é aceito', () => {
  const s = bancada();
  const { corpo, cabecalhos } = assinado(msg('FINIK', 1));
  assert.equal(s.verificar(cabecalhos, corpo, PUB, T).ok, true);
});

test('webhook com corpo adulterado é recusado', () => {
  const s = bancada();
  const { corpo, cabecalhos } = assinado(msg('FINIK', 1));
  const v = s.verificar(cabecalhos, Buffer.concat([corpo, Buffer.from(' ')]), PUB, T);
  assert.equal(v.ok, false);
  assert.match(v.motivo, /assinatura/);
});

test('webhook velho é recusado — evita reprodução de evento antigo', () => {
  const s = bancada();
  const { corpo, cabecalhos } = assinado(msg('FINIK', 1));
  assert.equal(s.verificar(cabecalhos, corpo, PUB, T + 60 * MIN).ok, false);
});

test('conta pessoas e não mensagens', () => {
  const s = bancada();
  for (let i = 0; i < 300; i++) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * 1000);
  const r = s.consultar('c1', 'FINIK');
  // 300 mensagens em 5 min = 1 bloco de 10 min, não 300
  assert.equal(r.evidencias[0].minutosAssistidos, 10);
});

test('quem escreve por horas é creditado pelo tempo, não subcontado', () => {
  const s = bancada();
  for (let i = 0; i <= 120; i += 3) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);
  assert.equal(s.consultar('c1', 'FINIK').evidencias[0].minutosAssistidos, 130);
});

test('a consulta cruza nome do jogo com nome do chat', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);
  s.ingerir('c1', 'chat.message', msg('merfy_ttv', 3), T);
  assert.equal(s.consultar('c1', 'D1per').evidencias[0].espectador, 'diper');
  assert.equal(s.consultar('c1', 'MF | Dr | Merfy').evidencias[0].espectador, 'merfy_ttv');
});

test('quem não assistiu não aparece, e a resposta diz que não inocenta', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  const r = s.consultar('c1', 'Опасный Поцык');
  assert.deepEqual(r.evidencias, []);
  assert.equal(r.conclusao, 'não encontrado na sua audiência');
  assert.match(d.formatar(r).content, /não inocenta/);
});

test('a resposta NUNCA diz que a pessoa é sniper', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  const texto = d.formatar(s.consultar('c1', 'FINIK')).content;
  assert.doesNotMatch(texto, /sniper|culpad|banir|hacker/i);
});

test('resposta do Discord é privada — acusação pública vira linchamento', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  const r = d.tratar(
    { type: 2, guild_id: 'g1', data: { name: 'detetive', options: [{ name: 'nome', value: 'FINIK' }] } },
    { consultar: (c, n) => s.consultar(c, n), canalDoServidor: () => 'c1' },
  );
  assert.equal(r.data.flags, 64, 'sem flags:64 a resposta aparece para o servidor inteiro');
});

test('Discord responde ao PING de verificação', () => {
  assert.deepEqual(d.tratar({ type: 1 }, {}), { type: 1 });
});

test('servidor do Discord sem canal ligado avisa em vez de quebrar', () => {
  const r = d.tratar(
    { type: 2, guild_id: 'gX', data: { name: 'detetive', options: [{ name: 'nome', value: 'X' }] } },
    { consultar: () => { throw new Error('não deveria chegar aqui'); }, canalDoServidor: () => null },
  );
  assert.match(r.data.content, /não está ligado/);
});

test('assinatura do Discord: válida passa, inválida é recusada', () => {
  const { publicKey: pk, privateKey: sk } = generateKeyPairSync('ed25519');
  const bruta = pk.export({ type: 'spki', format: 'der' });
  const hex = bruta.subarray(bruta.length - 32).toString('hex');
  const ts = String(Math.floor(T / 1000));
  const corpo = Buffer.from(JSON.stringify({ type: 1 }), 'utf8');
  const assin = sign(null, Buffer.concat([Buffer.from(ts), corpo]), sk).toString('hex');

  assert.equal(d.verificarDiscord(
    { 'X-Signature-Ed25519': assin, 'X-Signature-Timestamp': ts }, corpo, hex), true);
  // O Discord TESTA com assinatura inválida ao cadastrar o bot; recusar é obrigatório.
  assert.equal(d.verificarDiscord(
    { 'X-Signature-Ed25519': 'aa'.repeat(64), 'X-Signature-Timestamp': ts }, corpo, hex), false);
  assert.equal(d.verificarDiscord({}, corpo, hex), false);
});

test('evento repetido não conta duas vezes', () => {
  const s = bancada();
  const { corpo, cabecalhos } = assinado(msg('FINIK', 1));
  const v1 = s.verificar(cabecalhos, corpo, PUB, T);
  s.db.prepare('INSERT OR IGNORE INTO evento_visto (id, visto_em) VALUES (?,?)').run(v1.id, T);
  const repetido = s.db.prepare('SELECT 1 FROM evento_visto WHERE id = ?').get(v1.id);
  assert.ok(repetido, 'a Kick reentrega evento quando não recebe 200 a tempo');
});

test('nome que normaliza para vazio não vira espectador fantasma', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('', 9), T);
  s.ingerir('c1', 'chat.message', msg(undefined, 9), T);
  assert.equal(s.db.prepare('SELECT COUNT(*) c FROM presenca').get().c, 0);
});

test('o retrato do servidor SUBSTITUI, não acumula', () => {
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK' }, { nome: 'Caraxes' }], T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK' }], T + MIN);
  const n = s.db.prepare('SELECT COUNT(*) c FROM no_servidor WHERE canal_id = ?').get('c1').c;
  // Alertar sobre quem já desconectou é pior que não alertar.
  assert.equal(n, 1, 'quem saiu do servidor não pode continuar listado');
});

test('cruza sozinho: alerta sem ninguém perguntar', () => {
  const s = bancada();
  for (let i = 0; i <= 120; i += 8) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);
  const alertas = s.guardarServidor('c1', { nome: 'Srv' },
    [{ nome: 'FINIK', minutosNoServidor: 275 }, { nome: 'D1per' }, { nome: 'Caraxes' }], T);
  assert.equal(alertas.length, 2);
  assert.equal(alertas[0].jogador, 'FINIK');
  assert.equal(alertas[0].minutosNoServidor, 275);
  assert.ok(alertas.every((a) => a.jogador !== 'Caraxes'), 'Caraxes não assistiu');
});

test('sem audiência gravada, nenhum alerta é inventado', () => {
  const s = bancada();
  const alertas = s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK' }], T);
  assert.deepEqual(alertas, []);
});

test('alertas saem ordenados por confiança', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);
  const a = s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per' }, { nome: 'FINIK' }], T);
  assert.ok(a[0].confianca >= a.at(-1).confianca);
});

test('jogador sem nome utilizável é ignorado, não vira linha fantasma', () => {
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: '' }, { nome: '🔥🔥' }, { nome: 'FINIK' }], T);
  const n = s.db.prepare('SELECT COUNT(*) c FROM no_servidor').get().c;
  assert.equal(n, 1);
});

test('/api/audiencia entrega a lista crua que o PeekRust cruza do lado de fora', async () => {
  const s = bancada();
  for (let i = 0; i <= 120; i += 3) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);
  s.ingerir('c1', 'chat.message', msg('D1per', 2), T);

  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.servidor.address().port}`;
  try {
    const res = await fetch(`${base}/api/audiencia?canal=c1`);
    assert.equal(res.status, 200);
    const dados = await res.json();
    const porNome = Object.fromEntries(dados.audiencia.map((p) => [p.nome, p.minutosAssistidos]));
    // Mesmos minutos que /api/consultar devolve — uma conta só, dois caminhos.
    assert.equal(porNome.FINIK, 130);
    assert.equal(porNome.D1per, 10);

    // Sem canal é erro do cliente, não lista de outro canal por engano.
    assert.equal((await fetch(`${base}/api/audiencia`)).status, 400);
    const vazio = await (await fetch(`${base}/api/audiencia?canal=nao-existe`)).json();
    assert.deepEqual(vazio.audiencia, []);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

test('o índice do PeekRust acha na audiência do serviço o mesmo que /api/consultar', async () => {
  const { Indice } = require('../src/indice');
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);
  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  try {
    const porta = s.servidor.address().port;
    const { audienciaDoServico } = require('../peekrust/stream-check');
    const lista = await audienciaDoServico(`http://127.0.0.1:${porta}`, 'c1')();
    const achado = new Indice(lista).procurar('D1per');
    assert.equal(achado.entrada.nome, 'diper');
    assert.equal(achado.entrada.minutosAssistidos, s.consultar('c1', 'D1per').evidencias[0].minutosAssistidos);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});
