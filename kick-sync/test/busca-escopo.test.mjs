import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segundosDoTrecho, relogioDoTrecho, transmissoesDaBusca, pedidoDaBusca, limitesDaBusca, mesmoPedido, guardarMedidaBusca, estimativaDaBusca } from '../site/busca-escopo.js';

const T = Date.UTC(2026, 9, 13, 23);
const vod = { id: 7, inicioApi: T, master: 'https://example.test/master.m3u8', duracaoMs: 4 * 3600_000, duracaoBuscaS: 4 * 3600 };
const pedido = (extras = {}) => pedidoDaBusca({ vod, de: '01:00:00', ate: '01:15:00', inteira: false, perfil: 'rapida', ...extras });
const loja = () => { const m = new Map(); return { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) }; };

test('horário é tempo na live, incluindo mais de 24 horas, sem aceitar relógio inválido', () => {
  assert.equal(segundosDoTrecho('26:01:02'), 26 * 3600 + 62);
  assert.equal(segundosDoTrecho('00:15'), 900);
  for (const x of ['', '15', '-01:00:00', '01:60:00', '00:00:99', '0:0', '1e2:00:00']) assert.equal(segundosDoTrecho(x), null, x);
  assert.equal(relogioDoTrecho(26 * 3600 + 62), '26:01:02');
});

test('lista usa transmissões reais, ordena pela data e não fabrica duração ausente', () => {
  const atual = { ...vod, id: 8, inicioApi: T + 86400_000, aoVivo: true, duracaoMs: 0 };
  const r = transmissoesDaBusca([vod, atual, { ...vod, inicioApi: null }, { ...vod, duracaoMs: null }, { ...vod, duracaoMs: Infinity }, { ...vod, master: null }], T + 86400_000 + 120_000);
  assert.deepEqual(r.map((v) => [v.id, v.duracaoBuscaS]), [[8, 120], [7, 14400]]);
});

test('trecho rejeita fim anterior, intervalo vazio, formato errado, excesso de duração e perfil inexistente', () => {
  for (const extras of [{ ate: '00:30:00' }, { ate: '01:00:00' }, { de: 'abc' }, { ate: '05:00:00' }, { perfil: 'magica' }]) assert.equal(pedido(extras), null);
  assert.deepEqual(pedido(), { vodId: '7', inicioApi: T, deS: 3600, ateS: 4500, inteira: false, perfil: 'rapida' });
  for (const duracaoBuscaS of [null, NaN, Infinity, 0]) assert.equal(pedido({ inteira: true, vod: { ...vod, duracaoBuscaS } }), null);
});

test('inteira é escolha explícita e ignora campos desativados', () => {
  assert.deepEqual(pedido({ inteira: true, de: '', ate: '' }), { vodId: '7', inicioApi: T, deS: 0, ateS: 14400, inteira: true, perfil: 'rapida' });
});

test('trecho usa início da playlist, respeita cobertura e não vira live inteira', () => {
  const linha = { inicio: T + 4000 };
  const disponivel = { deMs: T + 4000, ateMs: T + 3 * 3600_000 };
  assert.deepEqual(limitesDaBusca(pedido(), linha, disponivel), { deMs: T + 3604_000, ateMs: T + 4504_000 });
  assert.equal(limitesDaBusca(pedido({ de: '03:10:00', ate: '03:15:00' }), linha, disponivel), null);
  assert.deepEqual(limitesDaBusca(pedido({ inteira: true }), linha, disponivel), disponivel);
});

test('cache diferencia transmissão, trecho e perfil, incluindo inteiro explícito', () => {
  assert.equal(mesmoPedido(pedido(), pedido()), true);
  for (const extras of [{ perfil: 'chat' }, { perfil: 'completa' }, { ate: '01:20:00' }, { inteira: true }, { vod: { ...vod, id: 8 } }]) assert.equal(mesmoPedido(pedido(), pedido(extras)), false);
  assert.equal(mesmoPedido(null, pedido()), false, 'cache legado não passa como trecho selecionado');
});

test('estimativa só existe com medição recente do mesmo canal/perfil e duração comparável', () => {
  const armazem = loja();
  const alvo = { slug: 'ana', perfil: 'rapida', duracaoMs: 900_000, agora: T };
  assert.equal(estimativaDaBusca(armazem, alvo), null);
  guardarMedidaBusca(armazem, { ...alvo, decorridoMs: 60_000 });
  assert.deepEqual(estimativaDaBusca(armazem, alvo), { minimoMs: 30_000, maximoMs: 120_000, amostras: 1 });
  for (const extras of [{ slug: 'bia' }, { perfil: 'completa' }, { duracaoMs: 6 * 3600_000 }, { agora: T + 8 * 86400_000 }]) assert.equal(estimativaDaBusca(armazem, { ...alvo, ...extras }), null);
});

test('medição inválida e armazenamento indisponível não criam estimativas', () => {
  const armazem = loja();
  const alvo = { slug: 'ana', perfil: 'chat', duracaoMs: 900_000, agora: T };
  for (const decorridoMs of [0, 999, NaN, Infinity]) guardarMedidaBusca(armazem, { ...alvo, decorridoMs });
  assert.equal(estimativaDaBusca(armazem, alvo), null);
  const quebrado = { getItem() { throw new Error('privado'); }, setItem() { throw new Error('privado'); } };
  guardarMedidaBusca(quebrado, { ...alvo, decorridoMs: 2000 });
  assert.equal(estimativaDaBusca(quebrado, alvo), null);
  armazem.setItem('povix.buscaMedidas.v1', JSON.stringify([null, 'inválida', 7, {}]));
  assert.equal(estimativaDaBusca(armazem, alvo), null);
});
