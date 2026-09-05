// A Twitch, sem lhe tocar.
//
// A rede aqui e falsa de proposito: um teste que depende do servico de outra
// pessoa falha por razoes que nao sao deste codigo, e falha de madrugada.
// O que e verdade sobre a Twitch a serio esta medido em `probes/twitch.mjs`,
// que corre a mao e contra canais reais.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  procurarCanais, vodsDoCanal, pecaDoVod, enderecoDoPlayer, CLIENTE,
} from '../site/twitch.js';
import { linhaDoCanal, onde, janelaComum } from '../site/relogio.js';
import { agruparPorNoite } from '../site/noites.js';

const T = Date.parse('2026-08-30T21:00:00.000Z');

// Uma Twitch falsa que guarda o que lhe perguntaram.
const falsa = (resposta, { ok = true, estado = 200 } = {}) => {
  const feitas = [];
  const buscar = async (url, opcoes) => {
    feitas.push({ url, ...opcoes, corpo: JSON.parse(opcoes.body) });
    return { ok, status: estado, json: async () => resposta };
  };
  return { buscar, feitas };
};

test('a procura de canais leva o Client-ID e devolve o que interessa', async () => {
  const { buscar, feitas } = falsa({
    data: { searchUsers: { edges: [
      { node: { login: 'tchubi', displayName: 'Tchubi', profileImageURL: 'x.png' } },
      { node: { login: null } },                 // lixo: nao pode virar um cartao vazio
      { node: { login: 'outro', displayName: null } },
    ] } },
  });
  const r = await procurarCanais('tchu', { buscar });
  assert.deepEqual(r, [
    { slug: 'tchubi', nome: 'Tchubi', imagem: 'x.png' },
    { slug: 'outro', nome: 'outro', imagem: null },
  ]);
  assert.equal(feitas[0].headers['Client-ID'], CLIENTE);
});

test('procurar por uma letra nao pergunta nada', async () => {
  const { buscar, feitas } = falsa({ data: {} });
  assert.deepEqual(await procurarCanais('t', { buscar }), []);
  assert.deepEqual(await procurarCanais('', { buscar }), []);
  assert.equal(feitas.length, 0, 'uma letra devolve meio mundo e nao ajuda ninguem');
});

// O login vai dentro de uma string de GraphQL. Um nome com aspas fechava a
// string e o resto passava a ser query.
test('um nome com aspas nao sai da string da query', async () => {
  const { buscar, feitas } = falsa({ data: { user: null } });
  await vodsDoCanal('tchu"} evil {', { buscar });
  assert.match(feitas[0].corpo.query, /user\(login: "tchuevil"\)/);
  assert.ok(!feitas[0].corpo.query.includes('"} evil'));
});

test('um erro do GQL nao passa por resposta boa', async () => {
  const { buscar } = falsa({ errors: [{ message: 'service error' }], data: { user: { videos: null } } });
  // A Twitch devolve http 200 com o erro la dentro. Deixar passar dava um
  // "esse canal nao existe" para um canal que existe.
  await assert.rejects(() => vodsDoCanal('tchubi', { buscar }), /TWITCH-GQL: service error/);
});

test('um http mau tambem nao', async () => {
  const { buscar } = falsa({}, { ok: false, estado: 503 });
  await assert.rejects(() => vodsDoCanal('tchubi', { buscar }), /TWITCH-503/);
});

test('os VODs saem com o inicio em milissegundos, e o lixo fica de fora', async () => {
  const { buscar } = falsa({
    data: { user: { videos: { edges: [
      { node: { id: '1', title: 'noite', publishedAt: '2026-08-30T21:00:00Z', lengthSeconds: 3600 } },
      { node: { id: '2', title: 'sem hora', publishedAt: 'nao e uma data', lengthSeconds: 60 } },
      { node: { id: '3', title: 'vazio', publishedAt: '2026-08-30T21:00:00Z', lengthSeconds: 0 } },
    ] } } },
  });
  const r = await vodsDoCanal('tchubi', { buscar });
  assert.equal(r.length, 1, 'um VOD sem hora ou sem duracao nao sincroniza nada');
  assert.equal(r[0].inicio, T);
  assert.equal(r[0].duracaoS, 3600);
});

// O ponto todo do modulo: um VOD da Twitch entra no relogio que ja existe, e
// tudo o que a Kick tem — noites, buracos, janela comum, nudges — vem de
// graca, sem uma linha nova.
test('um VOD da Twitch entra no relogio da Kick sem lhe mexer', () => {
  const l = linhaDoCanal('tchubi', [pecaDoVod({ id: 'v1', inicio: T, duracaoS: 3600 })]);
  assert.equal(l.inicio, T);
  assert.equal(l.fim, T + 3_600_000);
  assert.equal(l.buracos.length, 0, 'um VOD nao tem buracos por dentro');

  const r = onde(l, T + 42_000);
  assert.equal(r.estado, 'toca');
  assert.equal(r.tempoS, 42, 'e este o segundo a que o player salta');

  assert.equal(onde(l, T - 1000).estado, 'antes');
  assert.equal(onde(l, T + 3_601_000).estado, 'depois');
});

// Dois segundos de erro, medidos. Chamar a isto 'exato' era mentir ao
// utilizador sobre a unica coisa que aqui interessa.
test('a linha diz que o relogio e parcial, e nao exacto', () => {
  const l = linhaDoCanal('tchubi', [pecaDoVod({ id: 'v1', inicio: T, duracaoS: 60 })]);
  assert.equal(l.relogio, 'parcial');
});

test('dois canais da Twitch dao uma janela comum como os da Kick', () => {
  const j = janelaComum([
    linhaDoCanal('a', [pecaDoVod({ id: '1', inicio: T, duracaoS: 3600 })]),
    linhaDoCanal('b', [pecaDoVod({ id: '2', inicio: T + 600_000, duracaoS: 3600 })]),
  ]);
  assert.equal(j.haSobreposicao, true);
  assert.equal(j.sobreposicaoInicio, T + 600_000);
  assert.equal(j.sobreposicaoFim, T + 3_600_000);
});

// O agrupamento por noite ja existe para a Kick e nao sabe o que e a Twitch.
// Basta que os VODs cheguem na mesma forma — hora de inicio e duracao — e as
// noites, os buracos e os canais em falta saem de graca.
test('duas noites separadas continuam a ser duas noites', () => {
  const comoVod = (v) => ({ inicioApi: v.inicio, duracaoMs: v.duracaoS * 1000, id: v.id });
  const noites = agruparPorNoite([{
    slug: 'tchubi',
    vods: [
      comoVod({ id: '1', inicio: T, duracaoS: 3600 }),
      comoVod({ id: '2', inicio: T + 86_400_000, duracaoS: 3600 }),
    ],
  }]);
  assert.equal(noites.length, 2, 'um dia de intervalo nao e a mesma noite');
  // Da mais recente para tras, que e a ordem por que ele procura no menu.
  assert.equal(noites[0].inicio, T + 86_400_000);
  assert.equal(noites[1].inicio, T);
});

// Duas pessoas na mesma noite tem de cair no mesmo grupo, senao ele nunca as
// consegue por lado a lado — que e o ponto todo disto.
test('dois canais na mesma noite caem no mesmo grupo', () => {
  const noites = agruparPorNoite([
    { slug: 'tchubi', vods: [{ id: '1', inicioApi: T, duracaoMs: 3_600_000 }] },
    { slug: 'amigo', vods: [{ id: '2', inicioApi: T + 900_000, duracaoMs: 3_600_000 }] },
  ]);
  assert.equal(noites.length, 1);
  assert.deepEqual([...new Set(noites[0].itens.map((i) => i.slug))].sort(), ['amigo', 'tchubi']);
});

test('o endereco do player leva o instante no formato que ele le', () => {
  const u = new URL(enderecoDoPlayer('123', 3725, { pai: 'tchubirs.github.io' }));
  assert.equal(u.origin + u.pathname, 'https://player.twitch.tv/');
  assert.equal(u.searchParams.get('video'), 'v123');
  assert.equal(u.searchParams.get('time'), '1h2m5s', 'um numero solto e ignorado pelo player');
  // Sem `parent` a Twitch recusa-se a ser posta num iframe.
  assert.equal(u.searchParams.get('parent'), 'tchubirs.github.io');
  assert.equal(u.searchParams.get('muted'), 'true', 'seis players a falar ao mesmo tempo e inutilizavel');
});

test('um instante negativo ou invalido nao vai parar ao endereco', () => {
  assert.equal(new URL(enderecoDoPlayer('1', -50, { pai: 'x' })).searchParams.get('time'), '0h0m0s');
  assert.equal(new URL(enderecoDoPlayer('1', NaN, { pai: 'x' })).searchParams.get('time'), '0h0m0s');
});
