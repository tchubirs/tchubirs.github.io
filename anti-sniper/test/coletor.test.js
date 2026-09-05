'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarColetor } = require('../src/stream/coletor');

function bancada(leituras) {
  let i = 0;
  const vistos = [];
  const erros = [];
  const c = criarColetor({
    placar: async () => {
      const l = leituras[Math.min(i++, leituras.length - 1)];
      if (l instanceof Error) throw l;
      return l;
    },
    aoVer: (nome, t) => vistos.push({ nome, t }),
    agora: () => 1000 + i * 60000,
    aoErro: (e) => erros.push(e),
  });
  return { c, vistos, erros };
}

test('a PRIMEIRA leitura não credita ninguém', async () => {
  // Sem um "antes", a audiência inteira de anos atrás viraria "está na live
  // agora" — o erro mais caro possível aqui.
  const { c, vistos } = bancada([[{ nome: 'finik', pontos: 900 }, { nome: 'diper', pontos: 40 }]]);
  const r = await c.passada();
  assert.equal(r.base, true);
  assert.equal(vistos.length, 0);
});

test('quem GANHOU ponto estava assistindo — mesmo calado', async () => {
  // É esta a razão do módulo existir: presença sem mensagem nenhuma.
  const { c, vistos } = bancada([
    [{ nome: 'finik', pontos: 900 }, { nome: 'diper', pontos: 40 }, { nome: 'sumido', pontos: 12 }],
    [{ nome: 'finik', pontos: 910 }, { nome: 'diper', pontos: 50 }, { nome: 'sumido', pontos: 12 }],
  ]);
  await c.passada();
  const r = await c.passada();
  assert.equal(r.vistos, 2);
  assert.deepEqual(vistos.map((v) => v.nome), ['finik', 'diper']);
  assert.ok(!vistos.some((v) => v.nome === 'sumido'), 'quem não subiu não estava lá');
});

test('quem só aparece agora no placar NÃO é creditado', async () => {
  // Pode ser gente nova de verdade, mas pode ser a página seguinte da lista.
  // Creditar inventaria presença; na dúvida, não credita.
  const { c, vistos } = bancada([
    [{ nome: 'finik', pontos: 900 }],
    [{ nome: 'finik', pontos: 900 }, { nome: 'novato', pontos: 5 }],
  ]);
  await c.passada();
  const r = await c.passada();
  assert.equal(r.vistos, 0);
  assert.equal(vistos.length, 0);
});

test('ponto que desce ou fica igual não é presença', async () => {
  // Gastar ponto na loja faz o número CAIR; isso não é ausência nem presença.
  const { c, vistos } = bancada([
    [{ nome: 'finik', pontos: 900 }, { nome: 'gastou', pontos: 500 }],
    [{ nome: 'finik', pontos: 900 }, { nome: 'gastou', pontos: 100 }],
  ]);
  await c.passada();
  assert.equal((await c.passada()).vistos, 0);
  assert.equal(vistos.length, 0);
});

test('leitura que falha não apaga a base nem quebra o ciclo', async () => {
  const { c, vistos, erros } = bancada([
    [{ nome: 'finik', pontos: 900 }],
    new Error('StreamElements respondeu 502'),
    [{ nome: 'finik', pontos: 930 }],
  ]);
  await c.passada();
  const ruim = await c.passada();
  assert.equal(ruim.erro.message, 'StreamElements respondeu 502');
  assert.equal(erros.length, 1);
  // A base de antes da falha continua valendo: a comparação seguinte
  // funciona, em vez de perder um ciclo inteiro de presença.
  assert.equal((await c.passada()).vistos, 1);
  assert.equal(vistos[0].nome, 'finik');
});

test('zerar() esquece a base — para quando a live recomeça', async () => {
  const { c, vistos } = bancada([
    [{ nome: 'finik', pontos: 900 }],
    [{ nome: 'finik', pontos: 950 }],
  ]);
  await c.passada();
  c.zerar();
  const r = await c.passada();
  assert.equal(r.base, true, 'depois de zerar, a próxima leitura é base de novo');
  assert.equal(vistos.length, 0);
});

test('placar vazio ou torto não derruba nada', async () => {
  const { c, vistos } = bancada([
    [{ nome: 'finik', pontos: 900 }],
    [null, { pontos: 5 }, { nome: 'finik', pontos: 901 }, undefined],
  ]);
  await c.passada();
  assert.equal((await c.passada()).vistos, 1);
  assert.equal(vistos.length, 1);
});

test('ligar e desligar de verdade', async () => {
  const { c } = bancada([[{ nome: 'a', pontos: 1 }]]);
  assert.equal(c.ligado, false);
  c.ligar(60000);
  assert.equal(c.ligado, true);
  c.desligar();
  assert.equal(c.ligado, false);
});

// ── Coletor por ALVOS ─────────────────────────────────────────────────────
// Varrer o placar inteiro não escala: medido contra canal real deu zero em
// 300, porque a lista vem ordenada por pontos de todos os tempos e quem
// assiste agora está espalhado em centenas de milhares de nomes. Aqui só se
// pergunta pelos poucos que casaram com alguém do servidor.
const { criarColetorDeAlvos } = require('../src/stream/coletor');

function bancadaAlvos(leituras, alvos) {
  let i = -1;
  const vistos = []; const erros = [];
  const c = criarColetorDeAlvos({
    alvos: () => alvos,
    medir: async (nome) => {
      const l = leituras[Math.min(i, leituras.length - 1)][nome];
      if (l instanceof Error) throw l;
      return l ?? null;
    },
    aoVer: (nome, t) => vistos.push({ nome, t }),
    agora: () => 1000 + i * 60000,
    aoErro: (e) => erros.push(e),
  });
  return { c, vistos, erros, passar: () => { i += 1; return c.passada(); } };
}

test('alvos: watchtime que sobe é presença, mesmo sem falar nada', async () => {
  const { c, vistos, passar } = bancadaAlvos([
    { finik: { pontos: 100, segundosAssistidos: 3600 }, diper: { pontos: 50, segundosAssistidos: 900 } },
    { finik: { pontos: 110, segundosAssistidos: 3900 }, diper: { pontos: 50, segundosAssistidos: 900 } },
  ], ['finik', 'diper']);
  const b = await passar();
  assert.equal(b.base, 2);
  assert.equal(b.vistos, 0, 'a primeira leitura nunca credita');
  const r = await passar();
  assert.equal(r.vistos, 1);
  assert.deepEqual(vistos.map((v) => v.nome), ['finik']);
});

test('alvos: só o ponto subir já basta quando não há watchtime', async () => {
  const { vistos, passar } = bancadaAlvos([
    { finik: { pontos: 100, segundosAssistidos: null } },
    { finik: { pontos: 108, segundosAssistidos: null } },
  ], ['finik']);
  await passar();
  const r = await passar();
  assert.equal(r.vistos, 1);
  assert.equal(vistos.length, 1);
});

test('alvos: quem nunca pontuou no canal não vira ausência', async () => {
  // 404 do StreamElements quer dizer "não dá para medir por aqui",
  // não "não estava assistindo".
  const { vistos, passar } = bancadaAlvos([
    { fantasma: null }, { fantasma: null },
  ], ['fantasma']);
  await passar();
  const r = await passar();
  assert.equal(r.vistos, 0);
  assert.equal(r.base, 0);
  assert.equal(vistos.length, 0);
});

test('alvos: erro num alvo não impede os outros', async () => {
  const { c, vistos, erros, passar } = bancadaAlvos([
    { a: { pontos: 1, segundosAssistidos: 10 }, b: { pontos: 1, segundosAssistidos: 10 } },
    { a: new Error('502'), b: { pontos: 2, segundosAssistidos: 70 } },
  ], ['a', 'b']);
  await passar();
  const r = await passar();
  assert.equal(erros.length, 1);
  assert.equal(r.vistos, 1);
  assert.equal(vistos[0].nome, 'b');
});

test('alvos: a lista muda sozinha conforme entra e sai gente', async () => {
  const alvos = ['a'];
  let i = -1;
  const vistos = [];
  const c = criarColetorDeAlvos({
    alvos: () => alvos,
    medir: async (n) => ({ pontos: 100 + i * 10, segundosAssistidos: 600 + i * 60, nome: n }),
    aoVer: (n) => vistos.push(n),
    agora: () => 1000,
  });
  i = 0; await c.passada();
  alvos.push('b');                       // entrou alguém no servidor
  i = 1; const r = await c.passada();
  assert.equal(r.perguntados, 2);
  assert.equal(r.base, 1, 'o novo entra como base, não como visto');
  assert.deepEqual(vistos, ['a']);
});

test('alvos: esquecer() derruba a base de quem saiu', async () => {
  const { c, vistos, passar } = bancadaAlvos([
    { a: { pontos: 1, segundosAssistidos: 10 } },
    { a: { pontos: 9, segundosAssistidos: 90 } },
  ], ['a']);
  await passar();
  c.esquecer('a');
  const r = await passar();
  assert.equal(r.base, 1);
  assert.equal(vistos.length, 0);
});
