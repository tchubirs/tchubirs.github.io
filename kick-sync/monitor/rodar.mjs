import fs from 'node:fs/promises';
import path from 'node:path';
import { idDoCanal, mensagensEntre } from '../site/chat.js';
import { acharPicos, ordenarPicos, unirCobertura, trechosFaltando, alvosDaRodada } from './picos.mjs';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = args.indexOf(nome); return i < 0 ? padrao : args[i + 1]; };
const saida = path.resolve(opcao('--saida', './monitor-saida'));
const elenco = JSON.parse(await fs.readFile(new URL('../site/eventos/abisal.json', import.meta.url), 'utf8'));
const selecionar = opcao('--canais', '').split(',').filter(Boolean);
if (selecionar.some(c => !elenco.canais.includes(c))) throw new Error('Canal selecionado fora do elenco Abisal');
const canais = [...new Set(elenco.canais)].filter((c) => !selecionar.length || selecionar.includes(c));
const horas = Number(opcao('--historico-horas', '5'));
const cicloMs = Number(opcao('--intervalo-segundos', '300')) * 1000;
const maxHoras = Number(opcao('--max-horas', '8'));
const maxPaginas = Number(opcao('--paginas', '12'));
const intervaloPedido = Number(opcao('--pedido-ms', '500'));
if (![horas, cicloMs, maxHoras, maxPaginas, intervaloPedido].every((n) => Number.isFinite(n) && n > 0) || !canais.length) throw new Error('Opções inválidas');
await fs.mkdir(path.join(saida, 'canais'), { recursive: true });
const trava = path.join(saida, 'monitor.lock');
try {
  const lock = await fs.open(trava, 'wx');
  await lock.writeFile(String(process.pid));
  await lock.close();
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  const pid = Number(await fs.readFile(trava, 'utf8'));
  let vivo = true;
  try { process.kill(pid, 0); } catch (x) { if (x.code === 'ESRCH') vivo = false; }
  if (vivo) throw new Error(`Já existe monitor com PID ${pid}`);
  await fs.unlink(trava);
  await fs.writeFile(trava, String(process.pid), { flag: 'wx' });
}
const controle = new AbortController();
process.on('SIGINT', () => controle.abort());
process.on('SIGTERM', () => controle.abort());
const sinal = controle.signal;
const iniciado = Date.now();
const prazo = setTimeout(() => controle.abort(), maxHoras * 3600_000);
const inicioHistorico = iniciado - horas * 3600_000;
let proximoPedido = 0;
let pausaKick = 0;
let pedidos = 0;
let limites = 0;
const esperar = (ms) => new Promise((ok) => { if (sinal.aborted) return ok(); const timer = setTimeout(fim, Math.max(0, ms)); function fim() { clearTimeout(timer); sinal.removeEventListener('abort', fim); ok(); } sinal.addEventListener('abort', fim, { once: true }); });
async function buscar(url, init = {}) {
  const vez = Math.max(Date.now(), proximoPedido, pausaKick);
  proximoPedido = vez + intervaloPedido;
  await esperar(vez - Date.now());
  while (!sinal.aborted && Date.now() < pausaKick) await esperar(pausaKick - Date.now());
  if (sinal.aborted) throw new DOMException('cancelado', 'AbortError');
  pedidos++;
  const r = await fetch(url, { ...init, signal: AbortSignal.any([sinal, AbortSignal.timeout(20_000)]) });
  if (r.status === 429) {
    limites++;
    const retryAfter = r.headers.get('retry-after');
    const segundos = Number(retryAfter);
    const atraso = retryAfter && Number.isFinite(segundos) ? segundos * 1000 : Date.parse(retryAfter) - Date.now();
    pausaKick = Date.now() + Math.max(60_000, Number.isFinite(atraso) ? atraso : 0);
    console.log(JSON.stringify({ estado: 'limite-kick', retomar: new Date(pausaKick).toISOString() }));
  }
  return r;
}
async function lerJson(arquivo, padrao) { try { return JSON.parse(await fs.readFile(arquivo, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return padrao; throw e; } }
async function salvar(arquivo, valor) { const tmp = `${arquivo}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(valor)); await fs.rename(tmp, arquivo); }
const resumo = await lerJson(path.join(saida, 'estado.json'), { evento: elenco.nome, canais: {}, candidatos: [] });
const pedidosAnteriores = resumo.pedidos || 0;
resumo.primeiroInicio ||= resumo.iniciado || new Date(iniciado).toISOString();
resumo.iniciado = new Date(iniciado).toISOString();
resumo.deMs = Math.min(resumo.deMs ?? inicioHistorico, inicioHistorico);
resumo.pid = process.pid;
resumo.situacao = 'coletando';
resumo.intervaloSegundos = cicloMs / 1000;
resumo.totalCanais = canais.length;
resumo.chamadasClaude = 0;
const porCanal = new Map();
for (const c of resumo.candidatos || []) { const lista = porCanal.get(c.canal) || []; lista.push(c); porCanal.set(c.canal, lista); }
let rodada = resumo.rodadas || 0;
let guardarResumo = Promise.resolve();
function registrar() {
  resumo.atualizado = new Date().toISOString();
  resumo.pedidos = pedidosAnteriores + pedidos;
  resumo.limitesKick = limites;
  resumo.candidatos = ordenarPicos([...porCanal.values()].flat());
  const copia = structuredClone(resumo);
  guardarResumo = guardarResumo.then(() => salvar(path.join(saida, 'estado.json'), copia));
  return guardarResumo;
}
async function canal(slug, ateMs) {
  const arquivo = path.join(saida, 'canais', `${slug}.json`);
  const estado = await lerJson(arquivo, { slug, id: null, cobertura: [], mensagens: [] });
  if (!estado.id) estado.id = await idDoCanal(slug, { buscar, sinal });
  if (!estado.id) { resumo.canais[slug] = { estado: 'sem-acesso', mensagens: 0 }; await registrar(); return; }
  const alvos = alvosDaRodada(resumo.deMs, ateMs, estado.cobertura);
  if (!alvos.length) return;
  const mensagens = new Map(estado.mensagens.map((m) => [String(m.id), m]));
  let motivo = null;
  for (const alvo of alvos) {
    if (sinal.aborted) break;
    let chegouMs = alvo[1];
    const lista = await mensagensEntre(estado.id, alvo[0], alvo[1], {
      buscar, sinal, maxPedidos: maxPaginas, tentativas: 1, esperaMs: 2000, devolverAoCancelar: true,
      aoProgredir: (p) => { chegouMs = p.chegouMs; },
    });
    motivo ||= lista.motivo;
    for (const m of lista) mensagens.set(String(m.id), { ...m, texto: m.texto.slice(0, 160) });
    if (!lista.incompleto) estado.cobertura.push(alvo);
    else if (chegouMs + 1000 < alvo[1]) estado.cobertura.push([Math.max(alvo[0], chegouMs + 1000), alvo[1]]);
  }
  estado.mensagens = [...mensagens.values()].filter((m) => m.ms >= resumo.deMs).sort((a, b) => a.ms - b.ms);
  estado.cobertura = unirCobertura(estado.cobertura);
  estado.atualizado = Date.now();
  await salvar(arquivo, estado);
  const candidatos = acharPicos({ slug, mensagens: estado.mensagens, cobertura: estado.cobertura, deMs: resumo.deMs, ateMs });
  porCanal.set(slug, candidatos);
  const cobertoMs = estado.cobertura.reduce((s, [a, b]) => s + b - a, 0);
  resumo.canais[slug] = { estado: motivo ? 'parcial' : 'lido', motivo,
    mensagens: estado.mensagens.length, candidatos: candidatos.length, cobertoMinutos: Math.round(cobertoMs / 60_000),
    pendenteMinutos: Math.ceil(trechosFaltando(resumo.deMs, ateMs, estado.cobertura).reduce((s, [a, b]) => s + b - a, 0) / 60_000),
    atualizado: new Date().toISOString() };
  await registrar();
  console.log(JSON.stringify({ canal: slug, ...resumo.canais[slug] }));
}
try {
  await registrar();
  while (!sinal.aborted && Date.now() - iniciado < maxHoras * 3600_000) {
    rodada++;
    const comeco = Date.now();
    const ateMs = comeco - 10_000;
    const fila = [...canais].sort((a, b) => Number(Boolean(resumo.canais[a])) - Number(Boolean(resumo.canais[b])));
    let indice = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (!sinal.aborted && indice < canais.length) {
        const slug = fila[indice++];
        try { await canal(slug, ateMs); } catch (e) {
          if (sinal.aborted) break;
          resumo.canais[slug] = { ...resumo.canais[slug], estado: 'erro', motivo: e.name, atualizado: new Date().toISOString() };
          await registrar();
          console.log(JSON.stringify({ canal: slug, erro: e.name }));
        }
      }
    }));
    resumo.rodadas = rodada;
    resumo.situacao = sinal.aborted ? 'parado' : 'aguardando';
    await registrar();
    console.log(JSON.stringify({ rodada, canais: canais.length, candidatos: resumo.candidatos.length, pedidos, duracaoSegundos: Math.round((Date.now() - comeco) / 1000) }));
    if (args.includes('--uma-rodada')) break;
    await esperar(Math.max(1000, cicloMs - (Date.now() - comeco)));
    resumo.situacao = 'coletando';
  }
} finally {
  clearTimeout(prazo);
  resumo.situacao = sinal.aborted ? 'parado' : args.includes('--uma-rodada') ? 'rodada-concluida' : 'encerrado';
  await registrar();
  await fs.unlink(trava);
}
