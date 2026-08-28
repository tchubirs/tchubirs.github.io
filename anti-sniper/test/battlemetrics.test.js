'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nomesPorSessao } = require('../src/battlemetrics');

// "Como assim você tá gravando nome se é pra você acessar algum lugar que
// grava nome no meio de tantos" — ele está certo. O BattleMetrics guarda uma
// sessão por vez que a pessoa entrou num servidor, cada uma com o nome usado
// naquele momento. Anos de histórico que já existem.

const sessao = (nome, dia) => ({
  attributes: { name: nome, start: `2024-0${dia}-01T20:00:00Z`, stop: `2024-0${dia}-01T23:00:00Z` },
});

test('junta as sessões por nome, com a primeira e a última vez', async () => {
  const buscar = async () => ({ ok: true, json: async () => ({
    data: [sessao('Tchubita', 8), sessao('hai suzy', 4), sessao('hai suzy', 5)],
  }) });
  const r = await nomesPorSessao('777', 'tok', { buscar });
  assert.equal(r.sessoes, 3);
  assert.deepEqual(r.nomes.map((n) => n.nome), ['Tchubita', 'hai suzy'], 'mais recente primeiro');
  const suzy = r.nomes.find((n) => n.nome === 'hai suzy');
  assert.equal(suzy.sessoes, 2);
  assert.equal(new Date(suzy.de).toISOString(), '2024-04-01T20:00:00.000Z', 'a primeira vez');
  assert.equal(new Date(suzy.ate).toISOString(), '2024-05-01T23:00:00.000Z', 'a última');
});

test('SEGUE a paginação — é o que separa 1 nome de 200', async () => {
  // Ele reclamou disso olhando o BattleMetrics: "só aparece 1 nome, cadê os
  // outros 200 dos outros anos". Sem seguir `links.next` vem só o pedaço
  // mais recente.
  const paginas = [
    { data: [sessao('Tchubita', 8)], links: { next: 'p2' } },
    { data: [sessao('hai suzy', 4)], links: { next: 'p3' } },
    { data: [sessao('Suzyzinha', 2)], links: {} },
  ];
  let i = 0;
  const urls = [];
  const buscar = async (u) => { urls.push(u); return { ok: true, json: async () => paginas[i++] }; };
  const r = await nomesPorSessao('777', 'tok', { buscar });
  assert.equal(r.nomes.length, 3);
  assert.equal(urls.length, 3);
  assert.match(urls[0], /players\/777\/relationships\/sessions/);
  assert.equal(urls[1], 'p2');
});

test('o teto de páginas existe para não varrer sem fim', async () => {
  let n = 0;
  const buscar = async () => { n += 1; return { ok: true, json: async () => ({ data: [sessao('x', 1)], links: { next: 'proxima' } }) }; };
  await nomesPorSessao('777', 'tok', { buscar, paginas: 3 });
  assert.equal(n, 3);
});

test('falhar no meio guarda o que já veio — meio histórico serve', async () => {
  let n = 0;
  const buscar = async () => {
    n += 1;
    if (n === 1) return { ok: true, json: async () => ({ data: [sessao('Tchubita', 8)], links: { next: 'p2' } }) };
    return { ok: false, status: 429 };
  };
  const r = await nomesPorSessao('777', 'tok', { buscar });
  assert.deepEqual(r.nomes.map((x) => x.nome), ['Tchubita']);
});

test('falhar na PRIMEIRA página é erro, não histórico vazio', async () => {
  // Devolver lista vazia aqui diria "essa conta nunca trocou de nome",
  // que é outra coisa.
  const buscar = async () => ({ ok: false, status: 401 });
  await assert.rejects(nomesPorSessao('777', 'tok', { buscar }), /recusou o token/);
});

test('sessão sem nome é descartada sem quebrar o resto', async () => {
  const buscar = async () => ({ ok: true, json: async () => ({
    data: [{ attributes: {} }, null, sessao('Tchubita', 8)],
  }) });
  const r = await nomesPorSessao('777', 'tok', { buscar });
  assert.equal(r.nomes.length, 1);
});

test('sem token ou sem id, falha antes de sair da máquina', async () => {
  let chamou = false;
  const buscar = async () => { chamou = true; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(nomesPorSessao('', 'tok', { buscar }), /sem id/);
  await assert.rejects(nomesPorSessao('777', '', { buscar }), /sem BATTLEMETRICS_TOKEN/);
  assert.equal(chamou, false);
});

test('o nome que resolve o caso dele estaria aqui', async () => {
  // A Steam entrega 1 nome de perfil privado. O BattleMetrics guarda um por
  // sessão, e no Rust o nome no jogo É o nome de exibição da Steam.
  const buscar = async () => ({ ok: true, json: async () => ({
    data: [sessao('Tchubita', 8), sessao('hai suzy', 4)],
  }) });
  const { nomes } = await nomesPorSessao('777', 'tok', { buscar });
  const { Indice } = require('../src/indice');
  const audiencia = new Indice([{ nome: 'hai_suzy' }]);
  const bate = nomes.map((n) => audiencia.procurar(n.nome)).find(Boolean);
  assert.equal(bate.entrada.nome, 'hai_suzy');
  assert.equal(bate.confianca, 1);
});
