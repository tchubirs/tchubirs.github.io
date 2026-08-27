'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dobrar } = require('../src/unicode');
const n = require('../src/nomes');
const { ehSteamId64, historicoDeNomes } = require('../src/steam');
const { consultar, emTexto } = require('../src/consulta');

/** Resposta real da Steam, copiada de um perfil de verdade. */
const RESPOSTA_ARIN = [
  { newname: 'arin', timechanged: 'Mar 8 @ 7:28am' },
  { newname: '🇦 🇷 🇮 🇳', timechanged: 'Mar 6 @ 5:53am' },
  { newname: 'ᴀʀɪɴ', timechanged: 'Mar 6 @ 5:52am' },
  { newname: '𝚊𝚛𝚒𝚗', timechanged: 'Mar 6 @ 5:52am' },
];
const falso = (dados, ok = true, status = 200) => async () => ({
  ok, status, json: async () => dados,
});

test('dobra letra disfarçada de volta ao alfabeto', () => {
  for (const d of ['𝚊𝚛𝚒𝚗', 'ᴀʀɪɴ', '𝕒𝕣𝕚𝕟', 'ⓐⓡⓘⓝ', 'ａｒｉｎ']) {
    assert.equal(dobrar(d).toLowerCase(), 'arin', `falhou em ${d}`);
  }
  assert.equal(dobrar('🇦🇷🇮🇳').toLowerCase(), 'arin');
  assert.equal(dobrar('ѕniрer'), 'sniper', 'cirílico disfarçado de latino');
});

test('nome disfarçado normaliza igual ao normal', () => {
  const alvo = n.normalizar('arin');
  for (const d of ['𝚊𝚛𝚒𝚗', 'ᴀʀɪɴ', '🇦 🇷 🇮 🇳']) {
    assert.equal(n.normalizar(d), alvo, `falhou em ${d}`);
  }
});

test('sufixo de divulgação não impede o casamento', () => {
  for (const v of ['arin_tv', 'arinTTV', 'arin_live', 'ttvarin']) {
    assert.ok(n.comparar('arin', v).confianca >= 0.9, `falhou em ${v}`);
  }
});

test('a regra de conter é por proporção, não por tamanho fixo', () => {
  // "arin" dentro de "arinzinho" é 4/9 = 44%: nome diferente, não a mesma pessoa
  assert.equal(n.comparar('arin', 'arinzinho').confianca, 0);
  assert.equal(n.comparar('ana', 'banana').confianca, 0, 'ana em banana é 50%: coincidência');
  // "arin" dentro de "arintv" é 4/6 = 67%: mesma pessoa com sufixo
  assert.ok(n.comparar('arin', 'arintv').confianca >= 0.7);
  assert.equal(n.comparar('bob', 'bobsburgers').confianca, 0);
  assert.ok(n.comparar('slimeface', 'SLIMEface v.2').confianca >= 0.7);
});

test('basta UM nome do histórico bater', () => {
  const hist = ['CaraAleatorio', 'OutroNome', 'matador', 'SeiLaOque'];
  const r = n.compararHistorico(hist, 'matador');
  assert.equal(r.confianca, 1);
  assert.equal(r.nomeUsado, 'matador', 'tem que dizer QUAL nome bateu');
});

test('histórico sem nenhum nome parecido não casa', () => {
  const r = n.compararHistorico(['Alfa', 'Beta', 'Gama'], 'Zulu');
  assert.equal(r.confianca, 0);
  assert.equal(r.nomeUsado, null);
});

test('SteamID64 é validado antes de qualquer requisição', () => {
  assert.ok(ehSteamId64('76561198027456808'));
  for (const ruim of ['123', 'abc', '', null, '7656119802745680']) {
    assert.equal(ehSteamId64(ruim), false, `aceitou ${ruim}`);
  }
});

test('SteamID inválido falha antes de sair da máquina', async () => {
  let bateu = false;
  const espiao = async () => { bateu = true; return { ok: true, json: async () => [] }; };
  await assert.rejects(() => historicoDeNomes('lixo', espiao), /inválido/);
  assert.equal(bateu, false, 'não pode chamar a Steam com id inválido');
});

test('lê o histórico real e devolve os nomes únicos', async () => {
  const h = await historicoDeNomes('76561198395102990', falso(RESPOSTA_ARIN));
  assert.equal(h.nomes.length, 4);
  assert.ok(h.nomes.includes('arin'));
  assert.equal(h.trocas[0].em, 'Mar 8 @ 7:28am');
});

test('Steam fora do ar vira erro claro, não resposta vazia', async () => {
  await assert.rejects(
    () => historicoDeNomes('76561198395102990', falso(null, false, 503)),
    /503/,
  );
});

test('acha o espectador mesmo pelo nome disfarçado do histórico', async () => {
  const r = await consultar('76561198395102990',
    [{ nome: 'outro', id: 'a' }, { nome: 'arin_tv', id: 'b', minutosAssistidos: 187 }],
    { buscar: falso(RESPOSTA_ARIN) });
  assert.equal(r.conclusao, 'esteve na sua live');
  assert.equal(r.evidencias.length, 1);
  assert.equal(r.evidencias[0].espectador, 'arin_tv');
  assert.match(emTexto(r), /187 min/);
});

test('ninguém batendo não vira acusação', async () => {
  const r = await consultar('76561198395102990',
    [{ nome: 'zezinho', id: 'a' }], { buscar: falso(RESPOSTA_ARIN) });
  assert.equal(r.conclusao, 'não encontrado na sua audiência');
  assert.deepEqual(r.evidencias, []);
  assert.match(emTexto(r), /⚪/);
});

test('perfil privado é inconclusivo, não inocente nem culpado', async () => {
  const r = await consultar('76561198395102990', [{ nome: 'arin' }], { buscar: falso([]) });
  assert.equal(r.conclusao, 'inconclusivo');
  assert.match(r.motivo, /privado/);
});

test('a conclusão nunca diz que a pessoa é sniper', async () => {
  const r = await consultar('76561198395102990',
    [{ nome: 'arin', id: 'b' }], { buscar: falso(RESPOSTA_ARIN) });
  // Assistir não é crime. A ferramenta mostra presença; o julgamento é humano.
  assert.doesNotMatch(JSON.stringify(r), /sniper|culpad|banir/i);
});

test('evidência mais forte vem primeiro', async () => {
  const r = await consultar('76561198395102990',
    [{ nome: 'arinzin', id: 'a' }, { nome: 'arin', id: 'b' }],
    { buscar: falso(RESPOSTA_ARIN), minimo: 0.5 });
  assert.ok(r.evidencias[0].confianca >= r.evidencias.at(-1).confianca);
});
