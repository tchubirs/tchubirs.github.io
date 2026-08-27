'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { argumentos, ocultarChave, custoDeBanda, PLATAFORMAS } = require('../src/canal');
const { Supervisor, BACKOFF_INICIAL_MS, BACKOFF_MAXIMO_MS } = require('../src/supervisor');

/** Relógio e agendador falsos: o teste controla o tempo, então 48 horas
 *  passam num milissegundo e nada depende de rede nem de ffmpeg. */
function bancada() {
  let t = 0;
  const fila = [];
  const lancados = [];
  const registros = [];
  const sup = new Supervisor({
    lancar: (cmd, args) => {
      const p = new EventEmitter();
      p.morto = false;
      p.kill = () => { if (!p.morto) { p.morto = true; p.emit('exit', 0); } };
      lancados.push({ cmd, args, t });
      return p;
    },
    agora: () => t,
    agendar: (ms, fn) => fila.push({ em: t + ms, fn }),
    log: (m) => registros.push(m),
  });
  const avancar = (ms) => {
    const alvo = t + ms;
    for (;;) {
      const i = fila.findIndex((x) => x.em <= alvo);
      if (i < 0) break;
      const [tarefa] = fila.splice(i, 1);
      t = Math.max(t, tarefa.em);
      tarefa.fn();
    }
    t = alvo;
  };
  return { sup, avancar, lancados, registros, agora: () => t };
}

test('-re está presente: sem ele o ffmpeg despeja o arquivo e a live morre', () => {
  const a = argumentos({ fonte: '/v.mp4', plataforma: 'twitch', chave: 'k' });
  assert.ok(a.includes('-re'), '-re é obrigatório para ritmo de tempo real');
  assert.equal(a[a.indexOf('-c') + 1], 'copy');
  assert.ok(a[a.length - 1].startsWith(PLATAFORMAS.twitch.rtmp));
});

test('plataforma ou chave inválida falha cedo, não em produção', () => {
  assert.throws(() => argumentos({ fonte: '/v.mp4', plataforma: 'orkut', chave: 'k' }), /desconhecida/);
  assert.throws(() => argumentos({ fonte: '/v.mp4', plataforma: 'twitch' }), /chave/);
  assert.throws(() => argumentos({ plataforma: 'twitch', chave: 'k' }), /fonte/);
});

test('a chave de transmissão nunca aparece em log', () => {
  const { sup, registros } = bancada();
  sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: 'twitch', chave: 'live_SEGREDO_123' });
  sup.iniciarTodos();
  assert.ok(registros.length > 0);
  for (const r of registros) assert.doesNotMatch(r, /live_SEGREDO_123/);
  assert.equal(ocultarChave('rtmp://x/live_SEGREDO_123', 'live_SEGREDO_123'), 'rtmp://x/***');
});

test('id duplicado é recusado', () => {
  const { sup } = bancada();
  sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: 'kick', chave: 'k' });
  assert.throws(() => sup.adicionar({ id: 'c1', fonte: '/w.mp4', plataforma: 'kick', chave: 'k' }), /duplicado/);
});

test('canal que cai volta sozinho', () => {
  const { sup, avancar, lancados } = bancada();
  sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: 'kick', chave: 'k' });
  sup.iniciarTodos();
  assert.equal(lancados.length, 1);
  sup.canais.get('c1').processo.emit('exit', 1);
  avancar(BACKOFF_INICIAL_MS + 1);
  assert.equal(lancados.length, 2, 'tem que ter subido de novo');
});

test('queda repetida aumenta a espera, mas não passa do teto', () => {
  const { sup, avancar, lancados } = bancada();
  sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: 'kick', chave: 'k' });
  sup.iniciarTodos();
  // Falhas têm que ser RÁPIDAS para contar como falha. Se o canal fica de pé
  // mais de um minuto, ele rodou bem e o contador zera — é o comportamento
  // correto, e a primeira versão deste teste avançava o relógio depois do
  // reinício e por isso media o contrário do que queria.
  for (let i = 0; i < 12; i++) {
    sup.canais.get('c1').processo.emit('exit', 1);
    const esperado = Math.min(BACKOFF_INICIAL_MS * 2 ** i, BACKOFF_MAXIMO_MS);
    avancar(esperado);            // sobe exatamente no instante agendado
  }
  assert.equal(sup.canais.get('c1').falhasSeguidas, 12);
  const anterior = lancados.length;
  sup.canais.get('c1').processo.emit('exit', 1);
  avancar(BACKOFF_MAXIMO_MS);
  assert.equal(lancados.length, anterior + 1, 'mesmo no teto, continua tentando');
});

test('canal que rodou bem tem o contador de falhas zerado', () => {
  const { sup, avancar } = bancada();
  sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: 'kick', chave: 'k' });
  sup.iniciarTodos();
  sup.canais.get('c1').processo.emit('exit', 1);   // falha rápida
  avancar(BACKOFF_INICIAL_MS + 1);
  assert.equal(sup.canais.get('c1').falhasSeguidas, 1);
  avancar(3 * 60 * 60 * 1000);                     // 3h no ar
  sup.canais.get('c1').processo.emit('exit', 0);
  assert.equal(sup.canais.get('c1').falhasSeguidas, 0, 'rodou 3h: não é canal quebrado');
});

test('playlist avança em vez de repetir o mesmo vídeo para sempre', () => {
  const { sup, avancar, lancados } = bancada();
  sup.adicionar({ id: 'c1', fonte: ['/a.mp4', '/b.mp4', '/c.mp4'], plataforma: 'kick', chave: 'k' });
  sup.iniciarTodos();
  const vistos = [];
  for (let i = 0; i < 4; i++) {
    vistos.push(lancados.at(-1).args[lancados.at(-1).args.indexOf('-i') + 1]);
    avancar(2 * 60 * 1000);
    sup.canais.get('c1').processo.emit('exit', 0);
    avancar(BACKOFF_INICIAL_MS + 1);
  }
  assert.deepEqual(vistos, ['/a.mp4', '/b.mp4', '/c.mp4', '/a.mp4']);
});

test('Twitch: reinicia sozinho antes do limite de 48h', () => {
  const { sup, avancar, lancados, registros } = bancada();
  sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: 'twitch', chave: 'k' });
  sup.iniciarTodos();
  avancar(40 * 60 * 60 * 1000);
  assert.equal(lancados.length, 1, 'em 40h ainda não roda');
  avancar(8 * 60 * 60 * 1000);
  assert.ok(lancados.length >= 2, 'passou de 47h: tinha que ter rotacionado');
  assert.ok(registros.some((r) => /rotação preventiva/.test(r)));
});

test('Kick e YouTube não têm rotação por tempo', () => {
  for (const p of ['kick', 'youtube']) {
    const { sup, avancar, lancados } = bancada();
    sup.adicionar({ id: 'c1', fonte: '/v.mp4', plataforma: p, chave: 'k' });
    sup.iniciarTodos();
    avancar(100 * 60 * 60 * 1000);
    assert.equal(lancados.length, 1, `${p} não deveria rotacionar`);
  }
});

test('YouTube está marcado como exigindo conteúdo próprio', () => {
  // Passar obra de terceiro cai em "reused content" e desmonetiza o canal
  // inteiro. A marca existe para o código nunca deixar isso implícito.
  assert.equal(PLATAFORMAS.youtube.exigeConteudoProprio, true);
  assert.equal(PLATAFORMAS.twitch.exigeEtiquetaRerun, true);
});

test('pararTodos derruba tudo e não ressuscita', () => {
  const { sup, avancar, lancados } = bancada();
  for (const id of ['a', 'b', 'c']) sup.adicionar({ id, fonte: '/v.mp4', plataforma: 'kick', chave: 'k' });
  sup.iniciarTodos();
  assert.equal(lancados.length, 3);
  sup.pararTodos();
  avancar(60 * 60 * 1000);
  assert.equal(lancados.length, 3, 'nada pode subir depois do stop');
  assert.ok(sup.estado().every((c) => c.estado === 'parado'));

  sup.retomar();
  assert.equal(lancados.length, 6, 'retomar volta os três ao ar');
});

test('50 canais sobem', () => {
  const { sup, lancados } = bancada();
  for (let i = 0; i < 50; i++) {
    sup.adicionar({ id: `c${i}`, fonte: `/v${i}.mp4`, plataforma: 'twitch', chave: `k${i}` });
  }
  sup.iniciarTodos();
  assert.equal(lancados.length, 50);
  assert.equal(sup.estado().filter((c) => c.estado === 'no ar').length, 50);
});

test('conta de banda bate com a medição', () => {
  const b = custoDeBanda(50, 4500);
  assert.equal(b.canais, 50);
  assert.ok(b.mbpsSustentado > 200 && b.mbpsSustentado < 250, `veio ${b.mbpsSustentado}`);
  assert.ok(b.tbPorMes > 70 && b.tbPorMes < 80, `veio ${b.tbPorMes}`);
  assert.ok(custoDeBanda(50, 2500).tbPorMes < b.tbPorMes, '720p tem que custar menos');
});
