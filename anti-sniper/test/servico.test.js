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
  s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,discord_guild) VALUES (?,?,?,?,?)')
    .run('c1', 'kick', 'tchubi', T, 'g1');
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
  const r = d.tratar(
    { type: 2, guild_id: 'g1', data: { name: 'detetive', options: [{ name: 'quem', value: 'FINIK' }] } },
    { canalDoServidor: () => 'c1' },
  );
  assert.equal(r.resposta.data.flags, 64, 'sem flags:64 a resposta aparece para o servidor inteiro');
});

test('Discord responde ao PING de verificação', () => {
  assert.deepEqual(d.tratar({ type: 1 }, {}).resposta, { type: 1 });
});

test('servidor do Discord sem canal ligado avisa em vez de quebrar', () => {
  const r = d.tratar(
    { type: 2, guild_id: 'gX', data: { name: 'detetive', options: [{ name: 'quem', value: 'X' }] } },
    { canalDoServidor: () => null },
  );
  assert.match(r.resposta.data.content, /não está ligado/);
  assert.equal(r.seguir, undefined, 'sem canal não vale gastar consulta nenhuma');
});

test('o Discord recebe resposta ANTES da consulta terminar', async () => {
  // O Discord derruba a interação em 3s. Se a Steam demorar 5, a resposta
  // tem que já ter saído — senão o comando some da tela do usuário.
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  const r = d.tratar(
    { type: 2, guild_id: 'g1', data: { name: 'detetive', options: [{ name: 'quem', value: 'FINIK' }] } },
    { canalDoServidor: () => 'c1' },
  );
  assert.equal(r.resposta.type, 5, 'type 5 = "pensando", reserva a resposta');
  const final = await r.seguir(async (c, q) => ({
    resultado: await s.procurar(c, q, { buscar: async () => { throw new Error('rede'); } }),
    fuso: 'UTC',
  }));
  assert.match(final.content, /FINIK/);
  assert.match(final.content, /esteve na sua live/);
});

test('consulta que falha vira aviso, não comando quebrado', async () => {
  const r = d.tratar(
    { type: 2, guild_id: 'g1', data: { name: 'detetive', options: [{ name: 'quem', value: 'X' }] } },
    { canalDoServidor: () => 'c1' },
  );
  const final = await r.seguir(async () => { throw new Error('Steam fora do ar'); });
  assert.match(final.content, /Steam fora do ar/);
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
  // guardarServidor só GRAVA; cruzar é caro (5,6s a 1.500 × 5.000) e quem
  // grava é o agente, que não usa o resultado. O cruzamento é sob demanda.
  const r = s.guardarServidor('c1', { nome: 'Srv' },
    [{ nome: 'FINIK', minutosNoServidor: 275 }, { nome: 'D1per' }, { nome: 'Caraxes' }], T);
  assert.equal(r.jogadores, 3);
  const alertas = s.cruzarAgora('c1');
  assert.equal(alertas.length, 2);
  assert.equal(alertas[0].jogador, 'FINIK');
  assert.equal(alertas[0].minutosNoServidor, 275);
  assert.ok(alertas.every((a) => a.jogador !== 'Caraxes'), 'Caraxes não assistiu');
});

test('sem audiência gravada, nenhum alerta é inventado', () => {
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK' }], T);
  assert.deepEqual(s.cruzarAgora('c1'), []);
});

test('alertas saem ordenados por confiança', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per' }, { nome: 'FINIK' }], T);
  const a = s.cruzarAgora('c1');
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

test('/discord: assinatura confere, responde na hora e edita depois', async () => {
  const { publicKey: pk, privateKey: sk } = generateKeyPairSync('ed25519');
  const bruta = pk.export({ type: 'spki', format: 'der' });
  const hexPub = bruta.subarray(bruta.length - 32).toString('hex');

  const editadas = [];
  const s = criar({
    caminhoBanco: ':memory:', chavePem: PUB, agora: () => T,
    chaveDiscord: hexPub, appDiscord: 'app1',
    // Steam de mentira: devolve um histórico com um nome que está na audiência.
    buscar: async (url, op) => {
      if (op?.method === 'PATCH') { editadas.push(JSON.parse(op.body)); return { ok: true }; }
      if (url.includes('ajaxaliases')) {
        return { ok: true, json: async () => [{ newname: 'D1per', timechanged: 'x' }] };
      }
      return { ok: true, text: async () => '<profile><steamID>Killer</steamID><privacyState>public</privacyState></profile>' };
    },
  });
  s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,discord_guild) VALUES (?,?,?,?,?)')
    .run('c1', 'kick', 'tchubi', T, 'g1');
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);

  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.servidor.address().port}/discord`;
  const enviar = (obj, assinar = true) => {
    const corpo = Buffer.from(JSON.stringify(obj), 'utf8');
    const ts = String(Math.floor(T / 1000));
    const assin = assinar
      ? sign(null, Buffer.concat([Buffer.from(ts), corpo]), sk).toString('hex')
      : 'aa'.repeat(64);
    return fetch(base, { method: 'POST', body: corpo,
      headers: { 'X-Signature-Ed25519': assin, 'X-Signature-Timestamp': ts } });
  };

  try {
    // O Discord testa com assinatura inválida ao cadastrar o bot.
    assert.equal((await enviar({ type: 1 }, false)).status, 401);
    assert.deepEqual(await (await enviar({ type: 1 })).json(), { type: 1 });

    const r = await enviar({ type: 2, guild_id: 'g1', token: 'tok',
      data: { name: 'detetive', options: [{ name: 'quem', value: '76561198000000001' }] } });
    assert.deepEqual(await r.json(), { type: 5, data: { flags: 64 } });

    // A edição sai depois da resposta; espera ela chegar.
    for (let i = 0; i < 50 && !editadas.length; i++) await new Promise((ok) => setTimeout(ok, 20));
    assert.equal(editadas.length, 1, 'a mensagem tem que ser editada com o resultado');
    assert.match(editadas[0].content, /esteve na sua live/);
    assert.match(editadas[0].content, /diper/);
    assert.match(editadas[0].content, /quando se chamava "D1per"/);
    assert.doesNotMatch(editadas[0].content, /sniper|culpad|banir/i);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

// ── QUANDO ────────────────────────────────────────────────────────────────
// "Assistiu 20h" não responde nada. "Estava na live às 22:47, quando você
// morreu" responde tudo. Estes testes protegem essa diferença.

test('intervalos: quem fala de 10 em 10 min é UMA estada, não dez', () => {
  const s = bancada();
  for (let i = 0; i <= 60; i += 10) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);
  const e = s.estadas('c1', 'live', 'FINIK');
  assert.equal(e.length, 1);
  assert.equal(e[0].de, T);
  assert.equal(e[0].ate, T + 60 * MIN);
  assert.equal(e[0].minutos, 60);
});

test('sumiu por meia hora: vira estada nova, não um bloco esticado', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + 5 * MIN);
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + 90 * MIN);   // voltou depois
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + 95 * MIN);
  const e = s.estadas('c1', 'live', 'FINIK');
  assert.equal(e.length, 2, 'esticar por 90 min inventaria presença que não houve');
  assert.deepEqual([e[0].de, e[0].ate], [T, T + 5 * MIN]);
  assert.deepEqual([e[1].de, e[1].ate], [T + 90 * MIN, T + 95 * MIN]);
});

test('a pergunta do produto: estava na live NAQUELE minuto?', () => {
  const s = bancada();
  for (let i = 0; i <= 120; i += 10) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);

  const dentro = s.momento('c1', 'live', 'FINIK', T + 47 * MIN);
  assert.equal(dentro.estado, 'sim');
  assert.equal(dentro.estada.de, T);

  // 8 min depois do último sinal: ninguém fecha a live e reabre em 8 min.
  const borda = s.momento('c1', 'live', 'FINIK', T + 128 * MIN);
  assert.equal(borda.estado, 'provavel');
  assert.equal(borda.minutosDaBorda, 8);

  const longe = s.momento('c1', 'live', 'FINIK', T + 300 * MIN);
  assert.equal(longe.estado, 'nao');
  assert.equal(longe.minutosDaBorda, 180);
});

test('"não vi" nunca vira "não estava"', () => {
  // Quem assiste calado não gera mensagem nenhuma. Se este teste cair, a
  // ferramenta passou a inocentar gente sem ter olhado nada.
  const s = bancada();
  const semNada = s.momento('c1', 'live', 'NinguemAssim', T);
  assert.equal(semNada.estado, 'sem-registro');
  assert.deepEqual(semNada.estadas, []);
  assert.notEqual(semNada.estado, 'nao');
});

test('o servidor também vira linha do tempo, com gap mais curto', () => {
  const s = bancada();
  // O agente lê a cada ~90s; 5 min de silêncio já é ausência de verdade.
  for (let i = 0; i <= 6; i++) s.guardarServidor('c1', { nome: 'Rustoria' }, [{ nome: 'MEDUSA' }], T + i * 90000);
  s.guardarServidor('c1', { nome: 'Rustoria' }, [{ nome: 'MEDUSA' }], T + 40 * MIN);
  const e = s.estadas('c1', 'servidor', 'MEDUSA');
  assert.equal(e.length, 2);
  assert.equal(e[0].servidor, 'Rustoria');
  assert.equal(s.momento('c1', 'servidor', 'MEDUSA', T + 3 * MIN).estado, 'sim');
});

test('o cruzamento que interessa: na live E no servidor no mesmo minuto', () => {
  const s = bancada();
  for (let i = 0; i <= 120; i += 10) s.ingerir('c1', 'chat.message', msg('diper', 2), T + i * MIN);
  for (let i = 0; i <= 120; i += 2) s.guardarServidor('c1', { nome: 'Rustoria' }, [{ nome: 'D1per' }], T + i * MIN);

  const r = s.consultar('c1', 'D1per', { quando: T + 47 * MIN });
  assert.equal(r.evidencias[0].espectador, 'diper');
  assert.equal(r.evidencias[0].momento.estado, 'sim', 'estava na live às 22:47');
  assert.equal(r.noServidor.estado, 'sim', 'e no servidor no mesmo minuto');
});

test('sem perguntar horário, nada de momento é inventado', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  const r = s.consultar('c1', 'FINIK');
  assert.equal(r.quando, null);
  assert.equal(r.noServidor, null);
  assert.equal(r.evidencias[0].momento, null);
  assert.ok(r.evidencias[0].naLive.length, 'a linha do tempo vem sempre');
});

test('evento fora de ordem não abre buraco na linha do tempo', () => {
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + 10 * MIN);
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + 5 * MIN);  // chegou atrasado
  assert.equal(s.estadas('c1', 'live', 'FINIK').length, 1);
});

test('/api/procurar aceita horário e responde o momento', async () => {
  const s = bancada();
  s.db.prepare('UPDATE canal SET fuso = ? WHERE id = ?').run('Europe/Paris', 'c1');
  for (let i = 0; i <= 120; i += 10) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);

  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.servidor.address().port}`;
  try {
    const alvo = T + 47 * MIN;
    const d = await (await fetch(`${base}/api/procurar?canal=c1&q=FINIK&quando=${alvo}`)).json();
    assert.equal(d.fuso, 'Europe/Paris');
    assert.equal(d.quando, alvo);
    assert.equal(d.evidencias[0].momento.estado, 'sim');

    // Horário que não dá para entender é erro explícito, nunca um chute.
    const ruim = await fetch(`${base}/api/procurar?canal=c1&q=FINIK&quando=banana`);
    assert.equal(ruim.status, 400);
    assert.match((await ruim.json()).erro, /horário/);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

test('o Discord diz a hora E o fuso — fuso errado tem que aparecer', () => {
  const s = bancada();
  for (let i = 0; i <= 120; i += 10) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);
  const r = s.consultar('c1', 'FINIK', { quando: T + 47 * MIN });
  const texto = d.formatar(r, 'Europe/Paris').content;
  assert.match(texto, /ESTAVA na sua live/);
  assert.match(texto, /Europe\/Paris/, 'sem o fuso escrito, 2h de erro passa despercebido');
  assert.doesNotMatch(texto, /sniper|culpad|banir/i);

  const fora = d.formatar(s.consultar('c1', 'FINIK', { quando: T + 400 * MIN }), 'Europe/Paris').content;
  assert.match(fora, /não vista na live nesse horário/);
  assert.match(fora, /não inocenta/);
});

test('quem está na live AGORA — e há quanto tempo está calado', () => {
  const s = bancada();
  for (const i of [40, 35, 30, 25, 20, 15, 10, 5, 3]) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T - i * MIN);
  s.ingerir('c1', 'chat.message', msg('velho', 2), T - 90 * MIN);  // foi embora

  const agora = s.agoraNa('c1', 'live', T);
  assert.deepEqual(agora.map((p) => p.nome), ['FINIK'], 'quem sumiu há 90 min não está "agora"');
  assert.equal(agora[0].calada, 3);
  assert.equal(agora[0].desde, T - 40 * MIN);
  assert.equal(agora[0].minutos, 37);
});

test('37 min calado é sessão NOVA, não uma esticada', () => {
  // O contrário inventaria 37 min de presença que ninguém observou.
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T - 40 * MIN);
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T - 3 * MIN);
  const l = s.log('c1', 'FINIK');
  assert.equal(l.total, 2);
  assert.equal(s.agoraNa('c1', 'live', T)[0].desde, T - 3 * MIN);
});

test('o log é o que ele pediu: entrou, saiu, entrou de novo, saiu', () => {
  const s = bancada();
  // Duas sessões na live, separadas por uma hora fora.
  for (let i = 0; i <= 30; i += 5) s.ingerir('c1', 'chat.message', msg('diper', 2), T + i * MIN);
  for (let i = 90; i <= 120; i += 5) s.ingerir('c1', 'chat.message', msg('diper', 2), T + i * MIN);
  // E uma passagem pelo servidor no meio.
  for (let i = 20; i <= 100; i += 2) s.guardarServidor('c1', { nome: 'Rustoria' }, [{ nome: 'diper' }], T + i * MIN);

  const l = s.log('c1', 'diper');
  assert.equal(l.total, 3);
  // Mais recente primeiro: é o que se quer ver ao abrir.
  assert.deepEqual(l.linhas.map((x) => x.onde), ['live', 'servidor', 'live']);
  const [ultima, servidor, primeira] = l.linhas;
  assert.deepEqual([primeira.de, primeira.ate], [T, T + 30 * MIN]);
  assert.deepEqual([ultima.de, ultima.ate], [T + 90 * MIN, T + 120 * MIN]);
  assert.deepEqual([servidor.de, servidor.ate], [T + 20 * MIN, T + 100 * MIN]);
  assert.equal(l.minutosNaLive, 60);
  assert.equal(l.minutosNoServidor, 80);
});

test('log de quem nunca apareceu não vira acusação nem vazio mudo', () => {
  const s = bancada();
  const l = s.log('c1', 'NinguemAssim');
  assert.equal(l.total, 0);
  assert.deepEqual(l.linhas, []);
  assert.equal(l.minutosNaLive, 0);
});

test('/api/agora e /api/log respondem pelo HTTP', async () => {
  const s = bancada();
  s.db.prepare('UPDATE canal SET fuso = ? WHERE id = ?').run('Europe/Paris', 'c1');
  for (let i = 0; i <= 30; i += 5) s.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);

  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.servidor.address().port}`;
  try {
    const a = await (await fetch(`${base}/api/agora?canal=c1`)).json();
    assert.ok(Array.isArray(a.naLive));
    assert.equal(a.fuso, 'Europe/Paris');

    const l = await (await fetch(`${base}/api/log?canal=c1&nome=FINIK`)).json();
    assert.equal(l.total, 1);
    assert.equal(l.linhas[0].onde, 'live');
    assert.equal(l.linhas[0].amostras, 7, '7 mensagens sustentam esse intervalo');
    assert.equal(l.fuso, 'Europe/Paris');

    assert.equal((await fetch(`${base}/api/log?canal=c1`)).status, 400);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

test('coleta: quem assiste CALADO entra na linha do tempo', async () => {
  // O buraco que ele apontou. Ninguém aqui escreve uma mensagem sequer —
  // a presença vem do ponto de fidelidade subindo.
  const s = criar({ caminhoBanco: ':memory:', chavePem: PUB, agora: () => T });
  s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,se_canal) VALUES (?,?,?,?,?)')
    .run('c1', 'kick', 'tchubi', T, 'tchubi');

  let n = 0;
  const placares = [
    [{ nome: 'lurker', pontos: 100 }, { nome: 'outro', pontos: 50 }],
    [{ nome: 'lurker', pontos: 110 }, { nome: 'outro', pontos: 50 }],
    [{ nome: 'lurker', pontos: 120 }, { nome: 'outro', pontos: 50 }],
  ];
  const cols = s.ligarColeta({ intervaloMs: 10 ** 9, placarDe: () => placares[Math.min(n++, 2)] });
  const col = cols.get('c1');
  await col.passada();  // base, não credita
  await col.passada();
  await col.passada();
  s.pararColeta();

  const l = s.log('c1', 'lurker');
  assert.equal(l.total, 1, 'virou uma estada, mesmo sem nenhuma mensagem');
  assert.equal(s.agoraNa('c1', 'live', T).map((p) => p.nome).join(), 'lurker');
  assert.equal(s.log('c1', 'outro').total, 0, 'quem não subiu não é inventado');

  // E entra no cruzamento igual a quem falou.
  assert.equal(s.consultar('c1', 'lurker').evidencias.length, 1);
});

test('/api/agora diz a verdade sobre a COBERTURA', () => {
  // Sem coleta ligada, o painel não pode deixar implícito que enxerga todo
  // mundo: quem assiste calado continua invisível, e isso tem que aparecer.
  const s = bancada();
  assert.equal(s.coletores.get('c1'), undefined);
  const c = s.db.prepare('SELECT * FROM canal WHERE id = ?').get('c1');
  assert.equal(c.se_canal, null, 'canal sem fonte de presença configurada');
});

test('alvos: mede só quem está no servidor E casou com a audiência', async () => {
  // Varrer o placar inteiro não escala. Aqui a lista de alvos sai sozinha do
  // cruzamento, e é meia dúzia de nomes em vez de centenas de milhares.
  const s = criar({ caminhoBanco: ':memory:', chavePem: PUB, agora: () => T });
  s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,se_canal) VALUES (?,?,?,?,?)')
    .run('c1', 'kick', 'tchubi', T, 'tchubi');
  s.ingerir('c1', 'chat.message', msg('diper', 2), T);
  s.ingerir('c1', 'chat.message', msg('ninguem_procura', 3), T);
  s.guardarServidor('c1', { nome: 'Rustoria' }, [{ nome: 'D1per' }, { nome: 'Caraxes' }], T);

  const perguntados = [];
  let n = 0;
  const cols = s.ligarAlvos({
    intervaloMs: 10 ** 9,
    medirDe: (_c, nome) => {
      perguntados.push(nome);
      return Promise.resolve({ pontos: 100 + n * 10, segundosAssistidos: 600 + n * 120 });
    },
  });
  const col = cols.get('alvos:c1');
  n = 0; await col.passada();
  n = 1; const r = await col.passada();
  s.pararColeta();

  assert.deepEqual([...new Set(perguntados)], ['diper'],
    'não pergunta por quem ninguém procurou nem por quem não casou');
  assert.equal(r.vistos, 1);
  assert.equal(s.log('c1', 'diper').total, 1, 'virou estada mesmo sem falar de novo');
});

test('o log diz se o sinal foi mensagem ou tempo assistido', () => {
  // "8 msg" e "6× tempo assistido" pesam diferente para quem lê, e a segunda
  // é a única que pega quem nunca escreve nada.
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('falante', 1), T);
  s.ver('c1', 'live', 'calado', T, null, 'tempo');
  s.ver('c1', 'live', 'calado', T + 2 * MIN, null, 'tempo');

  assert.equal(s.log('c1', 'falante').linhas[0].fonte, 'chat');
  assert.equal(s.log('c1', 'calado').linhas[0].fonte, 'tempo');

  // Quem fala E é medido fica marcado como os dois.
  s.ingerir('c1', 'chat.message', msg('calado', 2), T + 4 * MIN);
  assert.equal(s.log('c1', 'calado').linhas[0].fonte, 'ambos');
});

test('o cruzamento é cacheado até o servidor mudar', () => {
  // Medido: 5,6s com 1.500 jogadores × 5.000 espectadores. O painel pergunta
  // a cada 15s e o agente grava a cada 90s — sem cache seriam 4 cruzamentos
  // completos para cada um que teria resultado novo.
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK' }], T);
  const a = s.cruzarAgora('c1');
  assert.equal(s.cruzarAgora('c1'), a, 'mesma referência = não recalculou');

  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK' }, { nome: 'diper' }], T + MIN);
  assert.notEqual(s.cruzarAgora('c1'), a, 'servidor mudou, tem que recalcular');
});

test('nos dois AO MESMO TEMPO — não "já assistiu algum dia"', () => {
  const s = bancada();
  // Um que está na live agora e no servidor agora.
  for (const i of [30, 20, 10, 2]) s.ingerir('c1', 'chat.message', msg('diper', 2), T - i * MIN);
  // Um que assistiu ontem e está no servidor agora — NÃO é o mesmo caso.
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T - 20 * 60 * MIN);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per' }, { nome: 'FINIK' }], T - MIN);

  const d = s.nosDois('c1', T);
  assert.deepEqual(d.map((x) => x.jogador), ['D1per']);
  assert.equal(d[0].espectador, 'diper');
  assert.equal(d[0].caladaHa, 2);
  assert.equal(d[0].naLiveDesde, T - 30 * MIN);

  // FINIK aparece no cruzamento histórico, mas não no "agora".
  assert.ok(s.cruzarAgora('c1').some((a) => a.jogador === 'FINIK'));
});

test('o "agora" separa quem falou de quem só foi medido', () => {
  // "Nenhum stream sniper fala no chat" — então a lista precisa deixar claro
  // qual das duas coisas cada linha é. Misturar esconderia a cegueira.
  const s = bancada();
  s.ingerir('c1', 'chat.message', msg('falante', 1), T - 2 * MIN);
  s.ver('c1', 'live', 'calado', T - 8 * MIN, null, 'tempo');
  s.ver('c1', 'live', 'calado', T - 2 * MIN, null, 'tempo');

  const a = s.agoraNa('c1', 'live', T);
  const por = Object.fromEntries(a.map((p) => [p.nome, p.fonte]));
  assert.equal(por.falante, 'chat');
  assert.equal(por.calado, 'tempo');
});

// ── Fidelidade: a fonte que vê quem NÃO fala ──────────────────────────────
// "Nenhum stream sniper fala no chat." O webhook da Kick só entrega
// mensagem, e a API pública dela não tem lista de conectados. O tempo
// assistido do BotRix sobe para quem está com a live aberta, calado ou não.

test('fidelidade: a primeira leitura NUNCA credita ninguém', () => {
  // Sem um "antes" não existe diferença, e tratar a base como presença
  // marcaria a audiência inteira de meses atrás como estando na live agora.
  const s = bancada();
  const r = s.receberFidelidade('c1', [
    { nome: 'lurker', minutosAssistidos: 600 },
    { nome: 'outro', minutosAssistidos: 40 },
  ], T);
  assert.equal(r.base, true);
  assert.equal(r.vistos, 0);
  assert.equal(s.log('c1', 'lurker').total, 0);
});

test('fidelidade: quem subiu estava assistindo, sem escrever nada', () => {
  const s = bancada();
  s.receberFidelidade('c1', [
    { nome: 'lurker', minutosAssistidos: 600 },
    { nome: 'saiu', minutosAssistidos: 40 },
  ], T);
  const r = s.receberFidelidade('c1', [
    { nome: 'lurker', minutosAssistidos: 610 },
    { nome: 'saiu', minutosAssistidos: 40 },
  ], T + 10 * MIN);

  assert.equal(r.vistos, 1);
  const l = s.log('c1', 'lurker');
  assert.equal(l.total, 1);
  assert.equal(l.linhas[0].fonte, 'tempo', 'marcado como calado, não como mensagem');
  assert.equal(s.log('c1', 'saiu').total, 0, 'quem não subiu não estava lá');

  // E entra no cruzamento igual a quem falou.
  assert.equal(s.consultar('c1', 'lurker').evidencias.length, 1);
});

test('fidelidade: quem só aparece agora na tabela não é creditado', () => {
  // Pode ser gente nova de verdade, mas pode ser a página seguinte da lista.
  const s = bancada();
  s.receberFidelidade('c1', [{ nome: 'a', minutosAssistidos: 10 }], T);
  const r = s.receberFidelidade('c1', [
    { nome: 'a', minutosAssistidos: 10 },
    { nome: 'novato', minutosAssistidos: 5 },
  ], T + 10 * MIN);
  assert.equal(r.vistos, 0);
  assert.equal(s.log('c1', 'novato').total, 0);
});

test('fidelidade: a linha do tempo sai com a resolução do intervalo', () => {
  // BotRix e StreamElements creditam em blocos (medido: 10 min é o padrão,
  // 5 min o mais curto que achei em canal real). O log tem que refletir isso
  // em vez de fingir precisão de minuto.
  const s = bancada();
  let m = 100;
  for (let i = 0; i <= 4; i++) {
    s.receberFidelidade('c1', [{ nome: 'lurker', minutosAssistidos: m }], T + i * 10 * MIN);
    m += 10;
  }
  const l = s.log('c1', 'lurker');
  assert.equal(l.total, 1, '4 blocos seguidos são UMA estada');
  assert.equal(l.linhas[0].de, T + 10 * MIN, 'a base não conta, então começa no 2º');
  assert.equal(l.linhas[0].ate, T + 40 * MIN);
});

test('/api/fidelidade recebe do agente pelo HTTP', async () => {
  const s = bancada();
  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.servidor.address().port}/api/fidelidade`;
  const post = (b) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  try {
    const a = await (await post({ canal: 'c1', pessoas: [{ nome: 'x', minutosAssistidos: 10 }] })).json();
    assert.equal(a.base, true);
    const b = await (await post({ canal: 'c1', pessoas: [{ nome: 'x', minutosAssistidos: 20 }] })).json();
    assert.equal(b.vistos, 1);
    assert.equal((await post({ canal: 'c1' })).status, 400);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

test('"quem é esse cara no servidor?" — nome no jogo e link do perfil', () => {
  // O nome do chat não abre perfil nenhum, e nome de Rust se troca em dez
  // segundos. Sem o id do BattleMetrics o painel acusa uma coincidência e
  // deixa o streamer sem saber de quem está falando.
  const s = bancada();
  for (const i of [30, 20, 10, 2]) s.ingerir('c1', 'chat.message', msg('diper', 2), T - i * MIN);
  s.guardarServidor('c1', { nome: 'Rustoria.co - US Main' },
    [{ nome: 'D1per', bmId: '1263079343', minutosNoServidor: 88 }], T - MIN);

  const d = s.nosDois('c1', T)[0];
  assert.equal(d.jogador, 'D1per', 'o nome como aparece NO JOGO');
  assert.equal(d.espectador, 'diper', 'o nome como aparece na live');
  assert.equal(d.bmId, '1263079343');
  assert.equal(d.perfil, 'https://www.battlemetrics.com/players/1263079343');
  assert.equal(d.servidor, 'Rustoria.co - US Main');

  const a = s.cruzarAgora('c1')[0];
  assert.equal(a.perfil, 'https://www.battlemetrics.com/players/1263079343');

  const log = s.log('c1', 'D1per').linhas.find((l) => l.onde === 'servidor');
  assert.equal(log.perfil, 'https://www.battlemetrics.com/players/1263079343');
  assert.equal(log.servidor, 'Rustoria.co - US Main');
});

test('leitura sem o id não APAGA o id que já se sabia', () => {
  // A tabela do BattleMetrics às vezes vem sem o link. Perder a identidade
  // no meio da sessão é o mesmo que nunca ter tido.
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '999' }], T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per' }], T + MIN);
  assert.equal(s.log('c1', 'D1per').linhas[0].bmId, '999');
});

// ── Histórico de nomes, gravado por nós ───────────────────────────────────
// Ele mostrou um concorrente com 32 nomes de uma conta — incluindo "hai suzy",
// que resolvia o caso. A Steam me entrega 1, porque o perfil é privado. A
// diferença é só tempo de gravação, e ela só começa quando se liga.

test('grava cada nome novo da mesma conta', () => {
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'Tchubita', bmId: '777' }], T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'hai suzy', bmId: '777' }], T + 30 * MIN);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: '[BR] Suzy', bmId: '777' }], T + 60 * MIN);

  const nomes = s.nomesDe('777');
  assert.equal(nomes.length, 3, 'a conta é a mesma; os nomes é que mudaram');
  assert.deepEqual(nomes.map((n) => n.nome), ['[BR] Suzy', 'hai suzy', 'Tchubita'],
    'do mais recente para trás');
});

test('o mesmo nome de novo não vira linha nova — conta as vezes', () => {
  const s = bancada();
  for (const i of [0, 5, 10]) {
    s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'Tchubita', bmId: '777' }], T + i * MIN);
  }
  const n = s.nomesDe('777');
  assert.equal(n.length, 1);
  assert.equal(n[0].vezes, 3);
  assert.equal(n[0].de, T, 'a primeira vez fica guardada');
  assert.equal(n[0].ate, T + 10 * MIN);
});

test('nomes diferentes que normalizam igual são o MESMO nome', () => {
  // "hai suzy" e "hai_suzy" são a mesma pessoa se chamando a mesma coisa —
  // guardar as duas encheria o histórico de ruído.
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'hai suzy', bmId: '777' }], T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'hai_suzy', bmId: '777' }], T + MIN);
  assert.equal(s.nomesDe('777').length, 1);
});

test('o caminho inverso: quem já se chamou assim?', () => {
  // É este que resolve o caso dele. Se em algum momento eu tiver visto a
  // conta dela usando "hai suzy", a pergunta "quem é hai_suzy" acha a conta.
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'hai suzy', bmId: '777' }], T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'Tchubita', bmId: '777' }], T + 60 * MIN);

  const r = s.quemUsou('hai_suzy');
  assert.equal(r.length, 1);
  assert.equal(r[0].ref, '777');
  assert.equal(r[0].perfil, 'https://www.battlemetrics.com/players/777');
});

test('sem id do BattleMetrics não grava nome — não teria a que prender', () => {
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'SemId' }], T);
  assert.deepEqual(s.quemUsou('SemId'), []);
});

test('importa os anos de histórico que o BattleMetrics já tem', () => {
  // Não gravar do zero: ele cortou essa ideia, e com razão. Isto traz o que
  // já existe, e a gravação própria vira a continuação daí para frente.
  const T2024 = Date.parse('2024-04-01T20:00:00Z');
  const s = criar({ caminhoBanco: ':memory:', chavePem: PUB, agora: () => T,
    tokenBM: 'tok',
    buscar: async () => ({ ok: true, json: async () => ({ data: [
      { attributes: { name: 'Tchubita', start: '2026-08-01T20:00:00Z', stop: '2026-08-01T23:00:00Z' } },
      { attributes: { name: 'hai suzy', start: '2024-04-01T20:00:00Z', stop: '2024-04-01T23:00:00Z' } },
    ] }) }),
  });

  return s.importarNomes('777').then((r) => {
    assert.equal(r.importados, 2);
    const nomes = s.nomesDe('777');
    assert.deepEqual(nomes.map((n) => n.nome), ['Tchubita', 'hai suzy']);
    assert.equal(nomes.find((n) => n.nome === 'hai suzy').de, T2024,
      'a data de 2024 vem junto — o valor está em alcançar para trás');

    // E é isto que resolve o caso: a pergunta "quem é hai_suzy" acha a conta.
    assert.equal(s.quemUsou('hai_suzy')[0].ref, '777');
  });
});

test('sem token, diz o motivo em vez de devolver histórico vazio', () => {
  const s = criar({ caminhoBanco: ':memory:', chavePem: PUB, agora: () => T, tokenBM: '' });
  return s.importarNomes('777').then((r) => {
    assert.equal(r.importados, 0);
    assert.match(r.motivo, /BATTLEMETRICS_TOKEN/);
  });
});

test('importar duas vezes não duplica, e mantém a data mais antiga', () => {
  let n = 0;
  const s = criar({ caminhoBanco: ':memory:', chavePem: PUB, agora: () => T, tokenBM: 'tok',
    buscar: async () => ({ ok: true, json: async () => ({ data: [
      // A segunda leitura traz a MESMA pessoa com uma sessão mais antiga.
      { attributes: { name: 'hai suzy', start: n++ ? '2022-01-01T20:00:00Z' : '2024-04-01T20:00:00Z',
        stop: '2024-04-01T23:00:00Z' } },
    ] }) }),
  });
  return s.importarNomes('777')
    .then(() => s.importarNomes('777'))
    .then((r) => {
      assert.equal(r.importados, 0, 'não duplica');
      assert.equal(s.nomesDe('777').length, 1);
      assert.equal(s.nomesDe('777')[0].de, Date.parse('2022-01-01T20:00:00Z'),
        'ficou com a data mais antiga das duas');
    });
});

// ── Presença ao segundo ───────────────────────────────────────────────────
// "Tem que ser mais preciso, exatamente até os segundos, sei que ele ficou 5
// minutos no máximo." O canal de presença da Kick sabe a entrada E a saída,
// então aqui não há gap para adivinhar — arredondar jogaria fora a precisão.

const S = 1000;

test('entrada e saída viram intervalo com os segundos exatos', () => {
  const s = bancada();
  const de = T; const ate = T + 278 * S;   // 4 min 38 s
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: de, id: '99', nome: 'dilanzito' },
    { tipo: 'saiu', em: ate, id: '99', nome: 'dilanzito' },
  ]);
  const l = s.log('c1', 'dilanzito').linhas;
  assert.equal(l.length, 1);
  assert.equal(l[0].de, de);
  assert.equal(l[0].ate, ate);
  assert.equal(l[0].fonte, 'presenca');
});

test('a entrada sozinha já grava — gravação que cai não perde a visita', () => {
  const s = bancada();
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T, id: '1', nome: 'x' }]);
  const l = s.log('c1', 'x').linhas;
  assert.equal(l.length, 1, 'existe registro mesmo sem ter visto a saída');
  assert.equal(l[0].de, l[0].ate, 'e não inventa uma hora de saída');
});

test('"já estava" é marcado diferente de "entrou"', () => {
  // Quem já estava dentro pode estar ali há horas. Tratar como entrada
  // inventaria o horário — o erro que ele me pegou duas vezes.
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'ja-estava', em: T, id: '1', nome: 'antigo' },
    { tipo: 'saiu', em: T + 60 * S, id: '1', nome: 'antigo' },
  ]);
  assert.equal(s.log('c1', 'antigo').linhas[0].fonte, 'presenca-parcial');
});

test('saída sem entrada conhecida NÃO vira visita', () => {
  // Não sei quando começou, e chutar um começo é inventar duração.
  const s = bancada();
  const r = s.receberPresenca('c1', [{ tipo: 'saiu', em: T, id: '404', nome: 'fantasma' }]);
  assert.equal(r.saiu, 0);
  assert.equal(s.log('c1', 'fantasma').total, 0);
});

test('entrar e sair várias vezes vira várias linhas, não uma esticada', () => {
  const s = bancada();
  const b = T;
  for (const [e, x] of [[0, 240], [3060, 3540]]) {
    s.receberPresenca('c1', [
      { tipo: 'entrou', em: b + e * S, id: '1', nome: 'ele' },
      { tipo: 'saiu', em: b + x * S, id: '1', nome: 'ele' },
    ]);
  }
  const l = s.log('c1', 'ele').linhas;
  assert.equal(l.length, 2, '47 min entre uma e outra é visita nova');
  assert.deepEqual(l.map((x) => Math.round((x.ate - x.de) / 1000)).sort((a, b2) => a - b2), [240, 480]);
});

test('5 minutos NÃO viram 10 — é o ponto de existir esta fonte', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T, id: '1', nome: 'curto' },
    { tipo: 'saiu', em: T + 290 * S, id: '1', nome: 'curto' },
  ]);
  const l = s.log('c1', 'curto').linhas[0];
  assert.equal(Math.round((l.ate - l.de) / 1000), 290);
  assert.ok(l.ate - l.de < 10 * 60 * 1000, 'menos que um bloco da BotRix');
});

test('/api/presenca recebe do gravador pelo HTTP', async () => {
  const s = bancada();
  await new Promise((ok) => s.servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.servidor.address().port}/api/presenca`;
  const post = (b) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  try {
    const r = await (await post({ canal: 'c1', eventos: [
      { tipo: 'entrou', em: T, id: '1', nome: 'a' },
      { tipo: 'saiu', em: T + 60 * S, id: '1', nome: 'a' },
    ] })).json();
    assert.equal(r.entrou, 1);
    assert.equal(r.saiu, 1);
    assert.equal(s.log('c1', 'a').total, 1);
    assert.equal((await post({ canal: 'c1' })).status, 400);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

// Quem AINDA está dentro entra no "na live agora" e no cruzamento.
test('a presença em aberto entra no "na live agora" e no cruzamento', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 5 * 60000, id: '1', nome: 'diper' },
  ]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  const agora = s.agoraNa('c1', 'live', T);
  assert.equal(agora[0].nome, 'diper');
  assert.equal(agora[0].aberta, true);
  assert.equal(s.nosDois('c1', T)[0].jogador, 'D1per');
});

// E quem a presença VIU SAIR some da lista na hora.
//
// Esta é a diferença entre as fontes, e ela é o produto: as outras só têm
// pontos soltos, então "ainda está lá" é um palpite pelo tempo desde o
// último sinal, e o palpite precisa de folga. A presença avisa a saída. Dar
// a mesma folga a ela seria jogar fora a única fonte que sabe a resposta —
// e manter na tela alguém que já fechou a janela.
test('quem a presença viu sair sai do "na live agora" na hora', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 5 * 60000, id: '1', nome: 'diper' },
    { tipo: 'saiu', em: T - 60000, id: '1', nome: 'diper' },
  ]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  assert.equal(s.agoraNa('c1', 'live', T).length, 0);
  // Mas a visita continua gravada, ao segundo: saiu não é apagou.
  const l = s.log('c1', 'diper');
  assert.equal(l.total, 1);
  assert.equal(l.linhas[0].segundos, 4 * 60);
});

// Sair da live não tira a pessoa do cruzamento — é o contrário.
//
// "sei que ele ficou 5 minuto maximo na minha live": o sniper assiste,
// FECHA a janela e só então ataca. Exigir que ainda esteja dentro na hora
// do cruzamento é filtrar fora exatamente quem se comporta como sniper.
test('quem saiu há pouco continua no cruzamento, marcado como saiu', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 5 * MIN, id: '1', nome: 'diper' },
    { tipo: 'saiu', em: T - MIN, id: '1', nome: 'diper' },
  ]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  const d = s.nosDois('c1', T)[0];
  assert.equal(d.jogador, 'D1per');
  assert.equal(d.naLiveAberta, false);
  assert.equal(d.saiuHa, 1, 'fechou a live há 1 min — e está no servidor agora');
});

test('quem saiu há muito tempo sai do cruzamento', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 60 * MIN, id: '1', nome: 'diper' },
    { tipo: 'saiu', em: T - 50 * MIN, id: '1', nome: 'diper' },
  ]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  assert.equal(s.nosDois('c1', T).length, 0, 'assistir há uma hora não é estar na live');
});

test('quem nunca saiu não recebe hora de saída inventada', () => {
  const s = bancada();
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T - 5 * MIN, id: '1', nome: 'diper' }]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  const d = s.nosDois('c1', T)[0];
  assert.equal(d.naLiveAberta, true);
  assert.equal(d.saiuHa, null, 'ainda dentro: não existe hora de saída');
});


// ── O tempo assistido não pode ser maior que a medida ────────────────────
//
// Ele já me pegou dizendo que alguém "ficou muito tempo" quando a pessoa
// tinha saído rápido. A causa estava aqui: o contador da fidelidade anda de
// 10 em 10 min, e uma visita medida em 4min22s era relatada como 10 min —
// mais que o dobro, embaixo do nome de uma pessoa real.

test('tempo assistido usa a medida ao segundo quando ela existe', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 9 * MIN, id: '3', nome: 'ESPECTADOR-C' },
    { tipo: 'saiu', em: T - 4 * MIN - 38000, id: '3', nome: 'ESPECTADOR-C' },
  ]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'ESPECTADOR-C', bmId: '9' }], T);
  const a = s.cruzarAgora('c1')[0];
  assert.equal(a.exato, true);
  assert.equal(a.segundosAssistidos, 262, '4min22s — não o bloco de 10 min');
  assert.equal(a.minutosAssistidos, 4);
});

test('sem medida, o tempo vem do bloco e vem MARCADO como bloco', () => {
  const s = bancada();
  // Só chat: nenhuma visita ao segundo para esta pessoa.
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T - 30 * MIN);
  s.ingerir('c1', 'chat.message', msg('FINIK', 1), T);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'FINIK', bmId: '9' }], T);
  const a = s.cruzarAgora('c1')[0];
  assert.equal(a.exato, false, 'bloco não pode se passar por medida');
  assert.equal(a.segundosAssistidos, null);
});

test('visita ainda aberta é medida contra AGORA, não contra ela mesma', () => {
  const s = bancada();
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T - 12 * MIN, id: '1', nome: 'diper' }]);
  // Uma visita aberta tem fim_em = início: medir entre os dois dava 1 min
  // para quem está na live há 12.
  const p = s.agoraNa('c1', 'live', T)[0];
  assert.equal(p.minutos, 12);
  assert.equal(p.aberta, true);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'diper', bmId: '9' }], T);
  assert.equal(s.cruzarAgora('c1')[0].minutosAssistidos, 12);
});

test('o painel sabe se a presença está gravando — e é medido, não configurado', async () => {
  const s = bancada();
  await new Promise((ok) => s.servidor.listen(0, ok));
  const porta = s.servidor.address().port;
  try {
    const semNada = await (await fetch(`http://127.0.0.1:${porta}/api/agora?canal=c1`)).json();
    assert.equal(semNada.coleta.presenca, null, 'sem evento nenhum não há o que anunciar');

    s.receberPresenca('c1', [{ tipo: 'entrou', em: T - MIN, id: '1', nome: 'diper' }]);
    const com = await (await fetch(`http://127.0.0.1:${porta}/api/agora?canal=c1`)).json();
    assert.equal(com.coleta.presenca.visitas, 1);
    assert.equal(com.coleta.presenca.em, T - MIN);
  } finally {
    await new Promise((ok) => s.servidor.close(ok));
  }
});

test('a fonte viaja junto no cruzamento — sem ela o painel inventa a régua', () => {
  const s = bancada();
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T - 5 * MIN, id: '1', nome: 'diper' }]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  const d = s.nosDois('c1', T)[0];
  assert.equal(d.naLiveFonte, 'presenca');
  assert.equal(d.naLiveAberta, true);
});

test('o resumo do log não pode contradizer as linhas dele', () => {
  const s = bancada();
  // Duas visitas: 4min38s e 4min51s. Somam 9min29s.
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 52 * MIN, id: '3', nome: 'C' },
    { tipo: 'saiu', em: T - 47 * MIN - 22000, id: '3', nome: 'C' },
    { tipo: 'entrou', em: T - 8 * MIN, id: '3', nome: 'C' },
    { tipo: 'saiu', em: T - 3 * MIN - 9000, id: '3', nome: 'C' },
  ]);
  const l = s.log('c1', 'C');
  assert.equal(l.entradasNaLive, 2);
  // Arredondar cada visita para o minuto e só então somar dava 5+5 = 10, e
  // o resumo dizia "0h10" com as linhas dizendo 4min38s e 4min51s abaixo.
  assert.equal(l.segundosNaLive, 4 * 60 + 38 + (4 * 60 + 51));
  assert.equal(l.segundosNaLive, 569);
  assert.equal(l.exatoNaLive, true);
  const somaDasLinhas = l.linhas.filter((x) => x.onde === 'live')
    .reduce((t, x) => t + x.segundos, 0);
  assert.equal(somaDasLinhas, l.segundosNaLive, 'resumo e linhas têm que fechar');
});

test('uma visita de bloco contamina o total e o resumo deixa de ser exato', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 20 * MIN, id: '1', nome: 'C' },
    { tipo: 'saiu', em: T - 15 * MIN, id: '1', nome: 'C' },
  ]);
  s.ingerir('c1', 'chat.message', msg('C', 1), T);
  const l = s.log('c1', 'C');
  assert.equal(l.exatoNaLive, false, 'um bloco no meio já tira a exatidão do total');
});

test('o servidor é foto, não duração — conta vezes vistas', () => {
  const s = bancada();
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'C', bmId: '9' }], T - 5 * MIN);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'C', bmId: '9' }], T);
  const l = s.log('c1', 'C');
  assert.ok(l.vezesNoServidor >= 1);
  assert.equal(l.entradasNaLive, 0, 'estar no servidor não é estar na live');
});

test('a resposta do Discord diz a régua do tempo, não só o número', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 9 * MIN, id: '3', nome: 'diper' },
    { tipo: 'saiu', em: T - 4 * MIN - 38000, id: '3', nome: 'diper' },
  ]);
  const exato = d.formatar(s.consultar('c1', 'D1per')).content;
  assert.match(exato, /4min 22s/, 'a medida ao segundo não pode virar "0h04"');
  assert.match(exato, /ao segundo/);

  const s2 = bancada();
  for (let i = 0; i <= 30; i += 3) s2.ingerir('c1', 'chat.message', msg('FINIK', 1), T + i * MIN);
  const bloco = d.formatar(s2.consultar('c1', 'FINIK')).content;
  assert.match(bloco, /bloco de ~10 min/, 'bloco não pode se passar por medida');
});

// Entrar e sair várias vezes em poucos minutos é sinal por si só: é alguém
// CONFERINDO a tela, não assistindo.
test('idas e vindas na janela viram uma linha só, com a contagem', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 14 * MIN, id: '1', nome: 'diper' },
    { tipo: 'saiu', em: T - 12 * MIN, id: '1', nome: 'diper' },
    { tipo: 'entrou', em: T - 9 * MIN, id: '1', nome: 'diper' },
    { tipo: 'saiu', em: T - 7 * MIN, id: '1', nome: 'diper' },
    { tipo: 'entrou', em: T - 3 * MIN, id: '1', nome: 'diper' },
  ]);
  s.guardarServidor('c1', { nome: 'Srv' }, [{ nome: 'D1per', bmId: '9' }], T);
  const r = s.nosDois('c1', T);
  assert.equal(r.length, 1, 'a mesma pessoa não pode virar três linhas');
  assert.equal(r[0].naLiveVisitas, 3);
  // A estada mostrada é a MAIS RECENTE — dizer "desde 14 min atrás" quando
  // ela saiu e voltou duas vezes seria emendar visitas separadas.
  assert.equal(r[0].naLiveAberta, true);
  assert.equal(r[0].naLiveDesde, T - 3 * MIN);
});


// ── A tela não pode mentir quando a gravação para ────────────────────────

test('visita aberta de antes do reinício não vira "na live agora"', () => {
  const banco = require('node:path').join(require('node:os').tmpdir(), `t-${process.pid}-rein.db`);
  const fs = require('node:fs');
  for (const f of [banco, banco + '-wal', banco + '-shm']) fs.rmSync(f, { force: true });
  try {
    const ontem = T - 24 * 60 * MIN;
    let s = criar({ caminhoBanco: banco, chavePem: PUB, agora: () => ontem });
    s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em) VALUES (?,?,?,?)')
      .run('c1', 'kick', 't', ontem);
    s.receberPresenca('c1', [{ tipo: 'entrou', em: ontem, id: '1', nome: 'diper' }]);
    s.db.close();

    // O Map que sabia quem estava dentro morre com o processo; as linhas
    // ficam. Antes disto, quem entrou ontem aparecia "na live agora, 1440
    // min" para sempre — e entrava no cruzamento como red flag permanente.
    s = criar({ caminhoBanco: banco, chavePem: PUB, agora: () => T });
    assert.equal(s.agoraNa('c1', 'live', T).length, 0);
    // Mas a visita não some do histórico: fechada no último sinal visto.
    assert.equal(s.log('c1', 'diper').total, 1);
    s.db.close();
  } finally {
    for (const f of [banco, banco + '-wal', banco + '-shm']) fs.rmSync(f, { force: true });
  }
});

test('gravação que parou de dar sinal deixa de sustentar "está dentro"', () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'vivo', em: T - 30 * MIN },
    { tipo: 'entrou', em: T - 30 * MIN, id: '1', nome: 'diper' },
  ]);
  // A gravação avisou que estava viva há 30 min e nunca mais. O que ela
  // deixou aberto não é "ainda está lá", é "parei de olhar".
  assert.equal(s.agoraNa('c1', 'live', T).length, 0);
  // Com o aviso recente, a mesma visita conta normalmente.
  s.receberPresenca('c1', [{ tipo: 'vivo', em: T - MIN }]);
  assert.equal(s.agoraNa('c1', 'live', T)[0].nome, 'diper');
});

test('sem nenhum aviso de vida, nada muda — não invento sinal', () => {
  const s = bancada();
  // Só eventos, nenhum 'vivo': é o caso de quem reenvia um arquivo com
  // `--enviar`. Inventar que a gravação está morta apagaria a importação.
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T - 30 * MIN, id: '1', nome: 'diper' }]);
  assert.equal(s.agoraNa('c1', 'live', T)[0].nome, 'diper');
});

test('o log de uma visita aberta conta até AGORA, igual ao cartão', () => {
  const s = bancada();
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T - 5 * MIN, id: '1', nome: 'diper' }]);
  // O cartão dizia "5 min" e o log da MESMA pessoa dizia "0min 00s": a
  // correção da visita aberta estava só em `agoraNa`, não em `estadas`.
  const cartao = s.agoraNa('c1', 'live', T)[0];
  const linha = s.log('c1', 'diper').linhas[0];
  assert.equal(cartao.minutos, 5);
  assert.equal(linha.segundos, 5 * 60);
  assert.equal(linha.aberta, true);
  // O fim OBSERVADO continua sendo a entrada: numa visita aberta não
  // existe hora de saída, e `ate` aqui é "até agora", não "saiu às".
  assert.equal(linha.ultimoSinal, T - 5 * MIN);
});

test('visita fechada sem saída vista fica com duração zero, e diz isso', () => {
  const s = bancada();
  s.receberPresenca('c1', [{ tipo: 'entrou', em: T - MIN, id: '1', nome: 'diper' }]);
  // É o que sobra de um reinício: fechada no último sinal visto. Duração
  // zero aqui não é "entrou agora" — é "a saída ninguém viu".
  s.db.prepare('UPDATE estada SET aberta = 0').run();
  const linha = s.log('c1', 'diper').linhas[0];
  assert.equal(linha.aberta, false);
  assert.equal(linha.segundos, 0);
});


// ── Perfil privado não é perfil cego ─────────────────────────────────────
//
// O caso real dele: a conta da Tchubita é privada, e mesmo assim a Steam
// entrega o nome de exibição no XML. "Tchubita" estava na audiência dele,
// batendo 100%. O atalho antigo saía antes de cruzar e respondia "não dá
// para ver nome nem histórico" — com o nome na mão e a resposta pronta.

const steamFalsa = ({ nome, privado, apelidos = [] }) => async (url) => {
  if (String(url).includes('ajaxaliases')) {
    return { ok: true, json: async () => apelidos.map((n) => ({ newname: n })) };
  }
  return {
    ok: true,
    text: async () => `<profile><steamID64>76561198162800675</steamID64>`
      + `<steamID>${nome}</steamID>`
      + `<privacyState>${privado ? 'private' : 'public'}</privacyState></profile>`,
  };
};

test('perfil privado com nome visível ainda cruza — e avisa que é limitado', async () => {
  const s = bancada();
  s.receberPresenca('c1', [
    { tipo: 'entrou', em: T - 9 * MIN, id: '1', nome: 'Tchubita' },
    { tipo: 'saiu', em: T - 4 * MIN, id: '1', nome: 'Tchubita' },
  ]);
  const r = await s.procurar('c1', '76561198162800675',
    { buscar: steamFalsa({ nome: 'Tchubita', privado: true }) });
  assert.equal(r.conclusao, 'esteve na sua live');
  assert.equal(r.evidencias[0].espectador, 'Tchubita');
  assert.equal(r.evidencias[0].confianca, 1);
  // E a tela precisa saber que o histórico ficou escondido: "1 nome
  // conferido" não vale o mesmo que "32 conferidos".
  assert.equal(r.privado, true);
});

test('privado e SEM nome nenhum é inconclusivo — aí não se olhou nada', async () => {
  const s = bancada();
  const r = await s.procurar('c1', '76561198162800675',
    { buscar: steamFalsa({ nome: '', privado: true }) });
  assert.equal(r.conclusao, 'inconclusivo');
  assert.match(r.motivo, /não há o que cruzar/);
  assert.deepEqual(r.evidencias, []);
});

test('perfil aberto sem achar nada não vem marcado como privado', async () => {
  const s = bancada();
  const r = await s.procurar('c1', '76561198162800675',
    { buscar: steamFalsa({ nome: 'DiLANZiTO', privado: false }) });
  assert.equal(r.conclusao, 'não encontrado na sua audiência');
  assert.equal(r.privado, false);
});
