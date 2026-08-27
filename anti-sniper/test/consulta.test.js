'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dobrar, desdisfarcar } = require('../src/unicode');
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
  // `dobrar` faz só as conversões SEGURAS. O cirílico ficou de fora de
  // propósito: aplicá-lo sempre destruía nome russo legítimo. Quem cuida
  // do disfarce é `desdisfarcar`, e só quando o cirílico é minoria —
  // a decisão está em `normalizar`.
  assert.equal(dobrar('ѕniрer'), 'ѕniрer', 'dobrar não mexe em cirílico');
  assert.equal(desdisfarcar('ѕniрer'), 'sniper', 'desdisfarcar mexe');
  assert.equal(n.normalizar('ѕniрer'), 'sniper', 'normalizar decide e aplica');
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

test('sem nada para cruzar é inconclusivo, não inocente nem culpado', async () => {
  // Duas situações diferentes, e agora separadas: perfil marcado como
  // PRIVADO, e perfil público mas sem nome, URL nem histórico. As duas
  // são inconclusivas; nenhuma pode sair como "não encontrado".
  const semNada = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' });
  const r = await consultar('76561198395102990', [{ nome: 'arin' }], { buscar: semNada });
  assert.equal(r.conclusao, 'inconclusivo');
  assert.match(r.motivo, /sem nome|PRIVADO/);
  assert.deepEqual(r.evidencias, []);
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

const { perfilPublico, chavesDeIdentidade } = require('../src/steam');

const XML = (over = {}) => {
  const c = { steamID: 'SLIMEface v.2', customURL: 'SLIMEface', privacyState: 'public',
              summary: '', vacBanned: '0', memberSince: 'June 29, 2012', ...over };
  return `<?xml version="1.0"?><profile>${Object.entries(c)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`).join('')}</profile>`;
};
const buscarMisto = (xml, aliases) => async (url) => ({
  ok: true, status: 200,
  json: async () => aliases,
  text: async () => xml,
});

test('a URL personalizada é lida sem chave de API', async () => {
  const p = await perfilPublico('76561198027456808', buscarMisto(XML(), []));
  assert.equal(p.vanity, 'SLIMEface');
  assert.equal(p.privado, false);
  assert.equal(p.nome, 'SLIMEface v.2');
});

test('perfil privado é marcado como privado', async () => {
  const p = await perfilPublico('76561198027456808',
    buscarMisto(XML({ privacyState: 'private' }), []));
  assert.equal(p.privado, true);
});

test('redes publicadas na própria bio são coletadas', async () => {
  // Dado AUTOPUBLICADO: se a pessoa escreveu na bio, quis que fosse visto.
  const p = await perfilPublico('76561198027456808',
    buscarMisto(XML({ summary: 'live em https://twitch.tv/fulano e https://kick.com/fulano' }), []));
  assert.deepEqual(p.redes, ['https://twitch.tv/fulano', 'https://kick.com/fulano']);
});

test('as chaves juntam histórico, URL personalizada e redes', async () => {
  const r = await chavesDeIdentidade('76561198046896466', buscarMisto(
    XML({ steamID: '🔥MDemon', customURL: 'MDemon', summary: 'https://twitch.tv/mdemontv' }),
    [{ newname: '🔥MDemon (<3 Valvo)', timechanged: 'x' }],
  ));
  assert.ok(r.chaves.includes('MDemon'), 'a URL personalizada tem que virar chave');
  assert.ok(r.chaves.includes('mdemontv'), 'o apelido da rede publicada também');
  assert.ok(r.chaves.includes('🔥MDemon (<3 Valvo)'));
});

test('a URL personalizada acha quem o histórico sozinho perderia', async () => {
  // O histórico do MDemon é todo com emoji; a URL personalizada é limpa.
  const { compararHistorico } = require('../src/nomes');
  const soHistorico = ['🔥MDemon - please pick me🔥', '🔥MDemon (<3 Valvo)'];
  const comVanity = [...soHistorico, 'MDemon'];
  assert.ok(compararHistorico(comVanity, 'mdemon').confianca >= 0.9);
});

test('Steam fora do ar em uma das duas fontes não derruba a outra', async () => {
  const meioQuebrado = async (url) => (String(url).includes('ajaxaliases')
    ? { ok: false, status: 503, json: async () => ({}), text: async () => '' }
    : { ok: true, status: 200, json: async () => [], text: async () => XML() });
  const r = await chavesDeIdentidade('76561198027456808', meioQuebrado);
  assert.ok(r.chaves.includes('SLIMEface'), 'a URL personalizada tem que sobreviver');
});

test('perfil PRIVADO é inconclusivo, nunca "não encontrado"', async () => {
  // Dizer "não encontrado" para um perfil privado é mentir por omissão:
  // soa como inocência quando na verdade não se olhou nada.
  const b = buscarMisto(XML({ privacyState: 'private' }), []);
  const r = await consultar('76561198066116229', [{ nome: 'tchubi' }], { buscar: b });
  assert.equal(r.conclusao, 'inconclusivo');
  assert.match(r.motivo, /PRIVADO/);
  assert.match(r.motivo, /nem a favor nem contra/);
});

test('URL personalizada aleatória é descartada, não usada para casar', async () => {
  // A dele é "23333213254r256t1". Casar isso produziria falso positivo.
  const b = buscarMisto(XML({ steamID: 'Tchubi', customURL: '23333213254r256t1' }), []);
  const r = await consultar('76561198066116229',
    [{ nome: '23333213254r256t1' }], { buscar: b });
  assert.equal(r.evidencias.length, 0, 'não pode casar por identificador aleatório');
});

test('mas a URL personalizada de verdade continua valendo', async () => {
  const b = buscarMisto(XML({ steamID: 'Tchubi', customURL: 'TchubiRS' }), []);
  const r = await consultar('76561198066116229', [{ nome: 'tchubirs' }], { buscar: b });
  assert.equal(r.evidencias.length, 1);
});
