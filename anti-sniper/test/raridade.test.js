'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pesoPorContagem, contarContas, criarMedidor, LIMITE_DIARIO } = require('../src/raridade');

// Os cortes vêm da medição real na base do steamid.uk, não de gosto.
test('os pesos separam identidade de coincidência', () => {
  assert.equal(pesoPorContagem(2).classe, 'unico');        // Tchubita
  assert.equal(pesoPorContagem(8).classe, 'raro');         // sh4d0wg0d
  assert.equal(pesoPorContagem(211).classe, 'comum');      // 0Suicide
  // 739 contas é fraco de verdade: a expectativa "comum" era minha, e
  // estava errada. Para achar UMA pessoa, 739 candidatos não é pista.
  assert.equal(pesoPorContagem(739).classe, 'muito-comum'); // Rmotta
  assert.equal(pesoPorContagem(315566).classe, 'lixo');    // Joao
  assert.equal(pesoPorContagem(6862574).classe, 'lixo');   // 123
  assert.ok(pesoPorContagem(2).peso > pesoPorContagem(315566).peso);
});

// Zero e null são coisas diferentes, e confundi-las inverteria o sinal.
test('zero não é "único" — é "não existe na Steam"', () => {
  const z = pesoPorContagem(0);
  assert.equal(z.classe, 'fora-da-steam');
  assert.equal(z.peso, 1, 'nem sobe nem desce: a contagem não opina');
  assert.match(z.nota, /nunca foi nome de Steam/);
});

test('não consultado não vira zero', () => {
  const n = pesoPorContagem(null);
  assert.equal(n.classe, 'desconhecida');
  assert.equal(n.peso, 1);
});

test('erro da busca devolve null, não derruba o cruzamento', async () => {
  const buscar = async () => ({ ok: true, json: async () => ({ error: { errorid: '17' } }) });
  assert.equal(await contarContas('nome', { chave: 'k', meuId: '1', buscar }), null);
});

test('o medidor guarda em cache — a cota diária é 150', async () => {
  let idas = 0;
  const buscar = async () => { idas += 1; return { ok: true, json: async () => ({ result: { count: '2' } }) }; };
  const m = criarMedidor({ chave: 'k', meuId: '1', buscar });
  await m.pesar('Tchubita');
  await m.pesar('tchubita');   // mesma coisa depois de normalizar
  await m.pesar('TCHUBITA');
  assert.equal(idas, 1, 'três perguntas iguais não podem gastar três da cota');
  assert.equal(m.gastos, 1);
  assert.equal(m.restam, LIMITE_DIARIO - 1);
});

test('esgotada a cota, para de perguntar em vez de falhar', async () => {
  let idas = 0;
  const buscar = async () => { idas += 1; return { ok: true, json: async () => ({ result: { count: '5' } }) }; };
  const m = criarMedidor({ chave: 'k', meuId: '1', buscar });
  for (let i = 0; i < LIMITE_DIARIO + 10; i++) await m.pesar(`nome${i}`);
  assert.equal(idas, LIMITE_DIARIO);
  assert.equal((await m.pesar('outro')).classe, 'desconhecida');
});

// A rota responde HTTP 500 com o corpo CERTO. Medido em 28/08/2026:
//   status: 500 · {"auth":{...},"result":{"count":"2"}}
// Olhar o status descartava a resposta boa e todo nome virava "desconhecida".
test('status 500 com corpo bom é resposta, não falha', async () => {
  const buscar = async () => ({
    ok: false, status: 500,
    json: async () => ({ auth: { patreon: '1' }, result: { count: '2' } }),
  });
  assert.equal(await contarContas('Tchubita', { chave: 'k', meuId: '1', buscar }), 2);
});
