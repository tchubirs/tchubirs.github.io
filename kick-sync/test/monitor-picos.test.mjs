import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { acharPicos, ordenarPicos, unirCobertura, trechosFaltando, alvosDaRodada } from '../monitor/picos.mjs';

const T = Date.UTC(2026, 9, 15, 20);
function amostra(normal, pico, { umAutor = false, comando = false } = {}) {
  const mensagens = [];
  for (let i = 0; i < 20; i++) for (let n = 0; n < (i === 15 ? pico : normal); n++) mensagens.push({
    id: `${i}-${n}`, ms: T + i * 30_000 + 1000, autor: umAutor && i === 15 ? 'spam' : `pessoa-${n}`,
    texto: comando && i === 15 ? '!drops' : 'gg',
  });
  return { slug: 'ana', mensagens, cobertura: [[T, T + 600_000]], deMs: T, ateMs: T + 600_000 };
}

test('pico acima e muito acima são relativos ao padrão do próprio chat', () => {
  const pequeno = acharPicos(amostra(5, 18));
  assert.equal(pequeno.length, 1);
  assert.equal(pequeno[0].nivel, 'acima');
  assert.equal(pequeno[0].normal, 5);
  assert.equal(pequeno[0].vezes, 3.6);
  const forte = acharPicos(amostra(5, 40));
  assert.equal(forte[0].nivel, 'muito-acima');
  assert.equal(forte[0].revisado, false);
  assert.equal(acharPicos(amostra(30, 40)).length, 0, '40 num chat de30 não é explosão');
});

test('um autor repetindo mensagens e comandos não simulam público reagindo', () => {
  assert.equal(acharPicos(amostra(5, 200, { umAutor: true })).length, 0);
  assert.equal(acharPicos(amostra(5, 200, { comando: true })).length, 0);
});

test('mensagens repetidas entre páginas contam uma vez', () => {
  const a = amostra(5, 40);
  const esperado = acharPicos(a);
  assert.deepEqual(acharPicos({ ...a, mensagens: [...a.mensagens, ...a.mensagens] }), esperado);
});

test('falta de leitura não vira minuto calado nem pico com histórico insuficiente', () => {
  const a = amostra(5, 40);
  assert.deepEqual(acharPicos({ ...a, cobertura: [[T + 15 * 30_000, T + 16 * 30_000]] }), []);
  assert.deepEqual(acharPicos({ ...a, cobertura: [[T, T + 15 * 30_000]] }), [], 'pico fora da cobertura não entra');
});

test('cobertura parcial continua pendente e unir não altera os intervalos recebidos', () => {
  const c = [[20, 40], [0, 10], [8, 15]];
  const antes = structuredClone(c);
  assert.deepEqual(unirCobertura(c), [[0, 15], [20, 40]]);
  assert.deepEqual(c, antes);
  assert.deepEqual(trechosFaltando(0, 50, c), [[15, 20], [40, 50]]);
});

test('picos próximos em outros canais são pistas, sem atribuir adversário ou revisão', () => {
  const a = acharPicos(amostra(5, 40))[0];
  const b = { ...a, id: 'bia', canal: 'bia', ms: a.ms + 60_000 };
  const r = ordenarPicos([a, b]);
  assert.deepEqual(r.find((x) => x.canal === 'ana').canaisProximos, ['bia']);
  assert.equal(r[0].revisado, false);
  assert.equal('vitima' in r[0], false);
});

test('cada rodada lê mensagens novas antes de continuar o histórico pendente', () => {
  assert.deepEqual(alvosDaRodada(0, 100, [[30, 80]]), [[80, 100], [0, 30]]);
  assert.deepEqual(alvosDaRodada(0, 100, []), [[0, 100]]);
  assert.deepEqual(alvosDaRodada(0, 100, [[0, 100]]), []);
});

test('coletor real retoma cobertura parcial, deduplica e continua sem rede ou IA no teste', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'monitor-abisal-test-'));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const agora = Date.now();
  const mensagens = Array.from({ length: 50 }, (_, i) => ({ id: i, created_at: new Date(agora - 60_000 - i * 30_000).toISOString(), content: 'gg', sender: { slug: `u${i}` } }));
  const preload = `const mensagens=${JSON.stringify(mensagens)};globalThis.fetch=async(url)=>{if(!String(url).includes('/messages?'))return new Response(JSON.stringify({id:7}));const cursor=Number(new URL(url).searchParams.get('cursor'));const pagina=mensagens.filter(m=>Date.parse(m.created_at)*1000<cursor).slice(0,25);return new Response(JSON.stringify({data:{messages:pagina,cursor:pagina.length?Date.parse(pagina.at(-1).created_at)*1000:null}}));};`;
  const script = fileURLToPath(new URL('../monitor/rodar.mjs', import.meta.url));
  const rodar = (paginas) => spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, script, '--saida', dir, '--canais', 'tanizen', '--uma-rodada', '--paginas', String(paginas), '--pedido-ms', '1'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  const primeiro = rodar(1);
  assert.equal(primeiro.status, 0, primeiro.stderr);
  const parcial = JSON.parse(await fs.readFile(path.join(dir, 'estado.json'), 'utf8'));
  assert.equal(parcial.canais.tanizen.estado, 'parcial');
  assert.equal(parcial.canais.tanizen.mensagens, 25);
  assert.ok(parcial.canais.tanizen.pendenteMinutos > 0);
  const segundo = rodar(12);
  assert.equal(segundo.status, 0, segundo.stderr);
  const completo = JSON.parse(await fs.readFile(path.join(dir, 'estado.json'), 'utf8'));
  const canal = JSON.parse(await fs.readFile(path.join(dir, 'canais/tanizen.json'), 'utf8'));
  assert.equal(completo.canais.tanizen.estado, 'lido');
  assert.equal(completo.canais.tanizen.pendenteMinutos, 0);
  assert.equal(canal.mensagens.length, 50);
  assert.equal(new Set(canal.mensagens.map(m => m.id)).size, 50);
  assert.equal(completo.chamadasClaude, 0);
  assert.ok(completo.pedidos > parcial.pedidos);
  await assert.rejects(fs.access(path.join(dir, 'monitor.lock')), { code: 'ENOENT' });
});

test('trava recusa outro coletor quando o processo dono ainda existe', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'monitor-abisal-test-'));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'monitor.lock'), String(process.pid));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../monitor/rodar.mjs', import.meta.url)), '--saida', dir, '--uma-rodada'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Já existe monitor com PID/);
  assert.equal(await fs.readFile(path.join(dir, 'monitor.lock'), 'utf8'), String(process.pid));
});

test('reinício mantém canais oficiais salvos mesmo quando a nova lista falha', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'monitor-abisal-test-'));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const id = '01a132ac-44ce-73c3-885a-eca55f6bdaba';
  await fs.writeFile(path.join(dir, 'estado.json'), JSON.stringify({ canais: {}, candidatos: [], fonteEvento: { id }, canaisOficiais: { kodd: 4937119 } }));
  const log = path.join(dir, 'pedidos.jsonl');
  const preload = `import fs from 'node:fs';globalThis.fetch=async(url)=>{fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(url)+'\\n');if(String(url).includes('/events/'))return String(url).endsWith('/streams')?new Response('',{status:403}):new Response(JSON.stringify({data:{clips:[]}}));return new Response(JSON.stringify({data:{messages:[]}}));};`;
  const r = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, fileURLToPath(new URL('../monitor/rodar.mjs', import.meta.url)), '--saida', dir, '--canais', 'kodd', '--evento-kick-id', id, '--uma-rodada', '--pedido-ms', '1'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  const resumo = JSON.parse(await fs.readFile(path.join(dir, 'estado.json'), 'utf8'));
  assert.equal(resumo.canais.kodd.estado, 'lido');
  assert.equal(resumo.totalCanais, 1);
  assert.equal(resumo.canaisOficiais.kodd, 4937119);
  assert.deepEqual(resumo.fonteEvento.falhas, [{ fonte: 'transmissoes', motivo: 'http-403' }]);
  const pedidos = await fs.readFile(log, 'utf8');
  assert.match(pedidos, /channels\/4937119\/messages/);
  assert.doesNotMatch(pedidos, /channels\/kodd/);
});
