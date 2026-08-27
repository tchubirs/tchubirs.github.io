'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { indexarAudiencia, quemE } = require('../src/identidade');

// Dois espectadores REAIS dele, medidos em 27/08/2026, e cada um quebra o
// caminho do outro. É por isso que o produto precisa dos dois.
const DILANZITO = { id: '76561198856715171', steam: 'DiLANZiTO', vanity: null };
const TCHUBITA = { id: '76561198162800675', steam: 'Tchubita', vanity: 'haisuzy' };

const AUD = [{ nome: 'dilanzito' }, { nome: 'hai_suzy' }, { nome: 'joaoz1n23' }];

/** Resolve o apelido da audiência para uma conta, como a Steam faria. */
const resolver = async (nome) => (nome === 'hai_suzy'
  ? { vanity: 'haisuzy', steamId: TCHUBITA.id, nomeNaSteam: TCHUBITA.steam, privado: true }
  : null);

/** Cruzamento por nome, como o Indice faria. */
const cruzar = (n) => {
  const alvo = AUD.find((a) => a.nome.toLowerCase() === String(n).toLowerCase());
  return alvo ? { entrada: alvo, confianca: 1, motivo: 'idêntico após normalizar' } : null;
};

const buscarPara = (nome, privado = false) => async (url) => {
  if (url.includes('ajaxaliases')) return { ok: true, json: async () => [] };
  return { ok: true, text: async () =>
    `<profile><steamID><![CDATA[${nome}]]></steamID><privacyState>${privado ? 'private' : 'public'}</privacyState></profile>` };
};

test('dilanzito: acha pelo NOME da Steam, sem URL personalizada', async () => {
  // A URL dele é "8888888899977" — lixo, não leva a lugar nenhum. Se o
  // produto só tivesse o caminho da URL, esse espectador sumia.
  const ind = await indexarAudiencia(AUD, { resolver, pausaMs: 0 });
  const r = await quemE(DILANZITO.id, ind, { cruzar, buscar: buscarPara('DiLANZiTO') });
  assert.equal(r.conclusao, 'é alguém da sua audiência');
  assert.equal(r.achados[0].espectador, 'dilanzito');
  assert.match(r.achados[0].via, /nome da Steam/);
});

test('tchubita: acha pela URL personalizada, com o nome NÃO batendo', async () => {
  // "Tchubita" e "hai_suzy" não têm uma letra em comum. Se o produto só
  // tivesse o caminho do nome, essa espectadora sumia — e foi exatamente o
  // caso que ele apontou.
  const ind = await indexarAudiencia(AUD, { resolver, pausaMs: 0 });
  const r = await quemE(TCHUBITA.id, ind, { cruzar, buscar: buscarPara('Tchubita', true) });
  assert.equal(r.achados[0].espectador, 'hai_suzy');
  assert.match(r.achados[0].via, /URL personalizada/);
  assert.equal(r.achados[0].forte, true, 'mesma conta é prova, não semelhança');
  assert.equal(r.privado, true, 'e funciona com o perfil PRIVADO');
});

test('a prova de identidade vem antes da semelhança de nome', async () => {
  const ind = await indexarAudiencia([{ nome: 'hai_suzy' }, { nome: 'Tchubita' }],
    { resolver, pausaMs: 0 });
  const cruzarDois = (n) => (String(n).toLowerCase() === 'tchubita'
    ? { entrada: { nome: 'Tchubita' }, confianca: 1, motivo: 'idêntico' } : null);
  const r = await quemE(TCHUBITA.id, ind, { cruzar: cruzarDois, buscar: buscarPara('Tchubita') });
  assert.equal(r.achados[0].forte, true);
  assert.match(r.achados[0].via, /URL personalizada/);
});

test('não achar ligação NUNCA vira "não assistiu"', async () => {
  const ind = await indexarAudiencia(AUD, { resolver, pausaMs: 0 });
  const r = await quemE('76561198000000009', ind,
    { cruzar: () => null, buscar: buscarPara('Desconhecido') });
  assert.equal(r.conclusao, 'não achei ligação com sua audiência');
  assert.doesNotMatch(r.conclusao, /não assistiu|limpo|inocente/i);
});

test('o índice guarda o "não achei" para não repetir rede', async () => {
  let chamadas = 0;
  const contando = async (n) => { chamadas += 1; return resolver(n); };
  const a = await indexarAudiencia(AUD, { resolver: contando, pausaMs: 0 });
  assert.equal(chamadas, 3);
  await indexarAudiencia(AUD, { resolver: contando, pausaMs: 0, jaSabido: a.porNome });
  assert.equal(chamadas, 3, 'a segunda varredura não bate na Steam de novo');
});

test('resolvedor que explode não derruba a varredura', async () => {
  const ruim = async (n) => { if (n === 'dilanzito') throw new Error('429'); return resolver(n); };
  const ind = await indexarAudiencia(AUD, { resolver: ruim, pausaMs: 0 });
  assert.equal(ind.porSteamId.get(TCHUBITA.id).espectador, 'hai_suzy');
});

test('SteamID inválida é erro, não resposta vazia', async () => {
  const ind = await indexarAudiencia([], { resolver, pausaMs: 0 });
  await assert.rejects(quemE('123', ind, { cruzar }), /inválida|inválido/i);
});
