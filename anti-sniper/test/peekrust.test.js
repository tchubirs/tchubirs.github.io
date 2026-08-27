'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { criarVerificador, audienciaDoServico, pedacoParaChat, textoLongo } = require('../peekrust/stream-check');

const RAIZ = path.join(__dirname, '..');

const AUDIENCIA = [
  { nome: 'finik', minutosAssistidos: 1205 },
  { nome: 'diper', minutosAssistidos: 312 },
  { nome: 'Tchubi_fan', minutosAssistidos: 45 },
];

/** Verificador com relógio e rede controlados — nada sai daqui. */
function montar({ audiencia = AUDIENCIA, historico = {}, relogio = { t: 0 }, ttlMs } = {}) {
  const chamadas = { audiencia: 0, historico: 0 };
  const v = criarVerificador({
    audiencia: async () => { chamadas.audiencia += 1; return audiencia; },
    nomesDoJogador: async (id) => { chamadas.historico += 1; return historico[id] || []; },
    ttlMs,
    agora: () => relogio.t,
  });
  return { verificar: v, chamadas, relogio };
}

test('acha pelo nome que está no jogo AGORA, sem ir buscar histórico', async () => {
  const { verificar, chamadas } = montar();
  const r = await verificar('7656119', 'FINIK');
  assert.equal(r.estado, 'assistindo');
  assert.equal(r.espectador, 'finik');
  assert.equal(r.minutosAssistidos, 1205);
  assert.equal(r.via, 'nome no jogo');
  // O ponto: casou sem gastar uma ida à rede.
  assert.equal(chamadas.historico, 0, 'não devia consultar histórico se o nome atual já bate');
});

test('acha por nome ANTIGO quando o nome de hoje não bate', async () => {
  // Este é o caso que justifica o produto inteiro: ninguém usa o mesmo nome
  // nos dois lados, mas basta um dos nomes antigos bater.
  const { verificar } = montar({ historico: { '7656119': ['xX_Killer_Xx', 'D1per', 'nub'] } });
  const r = await verificar('7656119', 'xX_Killer_Xx');
  assert.equal(r.estado, 'assistindo');
  assert.equal(r.espectador, 'diper');
  assert.equal(r.via, 'nome antigo "D1per"');
  assert.equal(r.confianca, 0.9);
});

test('aceita o histórico no formato do BattleMetrics ({name, lastSeen})', async () => {
  // getPlayerNameHistory() do PeekRust devolve objetos, não strings.
  const historico = { '1': [{ name: 'xX_Killer_Xx', lastSeen: 'z' }, { name: 'D1per', lastSeen: 'y' }] };
  const r = await montar({ historico }).verificar('1', null);
  assert.equal(r.espectador, 'diper');
});

test('NUNCA diz que a pessoa está limpa', async () => {
  const { verificar } = montar({ historico: { '9': ['a', 'b'] } });
  const r = await verificar('9', 'Caraxes');
  assert.equal(r.estado, 'nao-encontrado');
  assert.equal(r.nomesConferidos, 3, '2 do histórico + o nome no jogo');
  assert.match(textoLongo(r), /não inocenta/);
});

test('histórico que explode não derruba a consulta', async () => {
  const verificar = criarVerificador({
    audiencia: async () => AUDIENCIA,
    nomesDoJogador: async () => { throw new Error('BM 429'); },
  });
  const r = await verificar('1', 'Caraxes');
  assert.equal(r.estado, 'nao-encontrado');
  assert.equal(r.nomesConferidos, 1);
});

test('serviço fora do ar vira "indisponivel", não exceção', async () => {
  // O /peek precisa continuar respondendo horas, bans e nível mesmo assim.
  const verificar = criarVerificador({
    audiencia: async () => { throw new Error('ECONNREFUSED'); },
    nomesDoJogador: async () => [],
  });
  const r = await verificar('1', 'FINIK');
  assert.equal(r.estado, 'indisponivel');
  assert.equal(pedacoParaChat(r), null, 'não polui a linha do chat com erro de infra');
  assert.match(textoLongo(r), /serviço/);
});

test('audiência vazia é "sem-audiencia", não "não encontrado"', async () => {
  // Dizer "não encontrado" com o banco vazio seria mentir com cara de dado.
  const { verificar, chamadas } = montar({ audiencia: [] });
  const r = await verificar('1', 'FINIK');
  assert.equal(r.estado, 'sem-audiencia');
  assert.equal(chamadas.historico, 0);
  assert.equal(pedacoParaChat(r), null);
  assert.equal(textoLongo(r), null);
});

test('o índice é reaproveitado dentro do TTL e refeito depois', async () => {
  const relogio = { t: 1_000_000 };
  const { verificar, chamadas } = montar({ relogio, ttlMs: 60_000 });
  await verificar('1', 'FINIK');
  await verificar('2', 'FINIK');
  assert.equal(chamadas.audiencia, 1, 'duas consultas seguidas montam o índice uma vez só');
  relogio.t += 60_001;
  await verificar('3', 'FINIK');
  assert.equal(chamadas.audiencia, 2, 'passado o TTL, a audiência é buscada de novo');
});

test('o pedaço do chat cabe no limite de 120 do chat-formatter', async () => {
  const r = await montar().verificar('1', 'FINIK');
  assert.equal(pedacoParaChat(r), 'LIVE 20h!');
  assert.ok(pedacoParaChat(r).length <= 12, 'a linha inteira tem 5 campos, esse tem que ser mínimo');
  const n = await montar().verificar('1', 'Caraxes');
  assert.equal(pedacoParaChat(n), 'LIVE ?');
});

test('minutos desconhecidos não viram "0h"', async () => {
  // A audiência pode vir sem tempo; "0h" leria como "entrou e saiu".
  const r = await montar({ audiencia: [{ nome: 'finik' }] }).verificar('1', 'FINIK');
  assert.equal(r.minutosAssistidos, null);
  assert.equal(pedacoParaChat(r), 'LIVE ?!');
  assert.match(textoLongo(r), /tempo desconhecido/);
});

test('texto longo mostra o porquê, não só o veredito', async () => {
  const r = await montar({ historico: { '1': ['D1per'] } }).verificar('1', 'xX_Killer_Xx');
  const t = textoLongo(r);
  assert.match(t, /\*\*diper\*\*/);
  assert.match(t, /5h12/, '312 minutos = 5h12');
  assert.match(t, /90%/);
  assert.match(t, /nome antigo "D1per"/);
});

test('audienciaDoServico monta a URL certa e devolve a lista', async () => {
  let pedido = null;
  const buscar = async (u) => {
    pedido = u;
    return { ok: true, json: async () => ({ audiencia: AUDIENCIA }) };
  };
  const f = audienciaDoServico('https://x.dev/', 'canal 1', { buscar });
  assert.deepEqual(await f(), AUDIENCIA);
  assert.equal(pedido, 'https://x.dev/api/audiencia?canal=canal%201');
});

test('audienciaDoServico não engole erro do serviço', async () => {
  const buscar = async () => ({ ok: false, status: 502 });
  const f = audienciaDoServico('https://x.dev', 'c', { buscar });
  await assert.rejects(f(), /502/);
});

test('o pacote ESM do PeekRust está atualizado com src/', () => {
  // Se falhar, rode: node peekrust/construir.js
  const alvo = path.join(RAIZ, 'peekrust', 'anti-sniper.mjs');
  const antes = fs.readFileSync(alvo, 'utf8');
  execFileSync(process.execPath, [path.join(RAIZ, 'peekrust', 'construir.js')], { cwd: RAIZ });
  assert.equal(antes, fs.readFileSync(alvo, 'utf8'),
    'peekrust/anti-sniper.mjs está velho — rode node peekrust/construir.js');
});

test('o pacote ESM não tem require nem dependência externa', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'peekrust', 'anti-sniper.mjs'), 'utf8');
  assert.ok(!/\brequire\s*\(/.test(s), 'sobrou require — não roda dentro de um projeto ESM');
  assert.ok(!/^\s*import .* from ['"][^.]/m.test(s), 'sobrou import de pacote externo');
  assert.match(s, /GERADO/);
  assert.match(s, /NÃO EDITE/);
});

test('o pacote ESM responde IGUAL ao CommonJS que os testes verificam', async () => {
  const m = await import(path.join(RAIZ, 'peekrust', 'anti-sniper.mjs'));
  const dep = {
    audiencia: async () => AUDIENCIA,
    nomesDoJogador: async () => ['xX_Killer_Xx', 'D1per'],
  };
  const casos = [['1', 'FINIK'], ['2', 'xX_Killer_Xx'], ['3', 'Caraxes'], ['4', 'MF | Dr | Merfy']];
  for (const [id, nome] of casos) {
    const a = await criarVerificador(dep)(id, nome);
    const b = await m.criarVerificador(dep)(id, nome);
    assert.deepEqual(b, a, `divergiu em ${nome}`);
    assert.equal(m.pedacoParaChat(b), pedacoParaChat(a));
    assert.equal(m.textoLongo(b), textoLongo(a));
  }
});
