#!/usr/bin/env node
'use strict';
/**
 * Quanto custa, de verdade, com 1.500 jogadores no servidor.
 *
 * Ele desconfiou — e estava certo. Existem DOIS custos aqui e eu vinha
 * falando dos dois como se fossem um só:
 *
 *   GRAVAR   quem está na live e no servidor, minuto a minuto. Roda sempre,
 *            é só texto e banco, não toca a rede por jogador.
 *   CRUZAR   histórico de nomes de uma pessoa. Uma ida à rede POR PESSOA.
 *            Com 1.500 jogadores a cada 90s isso seriam 1.000 requisições
 *            por minuto na Steam — bloqueio na primeira hora.
 *
 * Rode: node bin/medir-escala.js
 */
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { criar } = require('../servico/servidor');
const { Indice } = require('../src/indice');

const BANCO = path.join(os.tmpdir(), `escala-${process.pid}.db`);
const MIN = 60000;
const T0 = Date.parse('2026-08-27T18:00:00Z');

const CIDADE = ['ru', 'br', 'us', 'de', 'fr', 'pl'];
function nomeFalso(i) {
  const base = ['Killer', 'Sniper', 'noob', 'Ivan', 'Pedro', 'Hans', 'zLucas', 'MEDUSA',
    'D1per', 'FINIK', 'Caraxes', 'xX_dark_Xx', 'Опасный', 'arin', 'merfy'][i % 15];
  return `${base}${i % 7 === 0 ? '_' + CIDADE[i % 6] : ''}${i}`;
}

const seg = (ns) => (Number(ns) / 1e9);
const mb = (b) => (b / 1048576).toFixed(1);

(async () => {
  fs.rmSync(BANCO, { force: true });
  let agora = T0;
  const s = criar({ caminhoBanco: BANCO, chavePem: 'x', agora: () => agora });
  s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,fuso) VALUES (?,?,?,?,?)')
    .run('c1', 'kick', 'tchubi', T0, 'Europe/Paris');

  // ── Audiência: 5.000 pessoas que já passaram pelo chat ──────────────
  console.log('montando audiência de 5.000 pessoas…');
  let t = process.hrtime.bigint();
  for (let i = 0; i < 5000; i++) {
    s.ingerir('c1', 'chat.message', { sender: { username: nomeFalso(i * 3), user_id: i } }, T0 - 100 * MIN);
  }
  console.log(`  ${seg(process.hrtime.bigint() - t).toFixed(2)}s\n`);

  // ── GRAVAR: retrato do servidor com 1.500 jogadores, muitas vezes ────
  const jogadores = Array.from({ length: 1500 }, (_, i) => ({ nome: nomeFalso(i), minutosNoServidor: i % 300 }));
  const CICLOS = 40;   // 40 leituras de 90s = 1 hora de live
  console.log(`GRAVAR — ${CICLOS} leituras de 1.500 jogadores (1 hora de live a cada 90s)`);
  const tempos = [];
  for (let c = 0; c < CICLOS; c++) {
    agora = T0 + c * 90000;
    t = process.hrtime.bigint();
    s.guardarServidor('c1', { nome: 'Rustoria.co - US Main' }, jogadores, agora);
    tempos.push(seg(process.hrtime.bigint() - t));
  }
  tempos.sort((a, b) => a - b);
  const total = tempos.reduce((x, y) => x + y, 0);
  console.log(`  por leitura: mediana ${(tempos[20] * 1000).toFixed(0)}ms · pior ${(tempos[39] * 1000).toFixed(0)}ms`);
  console.log(`  1 hora de live inteira: ${total.toFixed(1)}s de CPU`);
  console.log(`  banco depois: ${mb(fs.statSync(BANCO).size)} MB`);
  const linhas = s.db.prepare('SELECT COUNT(*) n FROM estada').get().n;
  console.log(`  linhas de estada: ${linhas}  (não 1.500 × ${CICLOS} = ${1500 * CICLOS})\n`);

  // ── CRUZAR sem rede: nome de agora contra a audiência ────────────────
  console.log('CRUZAR (só nomes atuais, sem rede) — 1.500 × 5.000');
  const audiencia = s.db.prepare('SELECT nome FROM presenca WHERE canal_id = ?').all('c1');
  t = process.hrtime.bigint();
  const idx = new Indice(audiencia);
  const tIdx = seg(process.hrtime.bigint() - t);
  t = process.hrtime.bigint();
  const achados = idx.cruzar(jogadores);
  console.log(`  montar índice: ${(tIdx * 1000).toFixed(0)}ms · cruzar: ${(seg(process.hrtime.bigint() - t) * 1000).toFixed(0)}ms`);
  console.log(`  achou ${achados.length} coincidências\n`);

  // ── CRUZAR com histórico: o que NÃO dá para fazer com todo mundo ─────
  const POR_PESSOA_MS = 700;  // medido contra a Steam de verdade nesta sessão
  console.log('CRUZAR com histórico de nomes — o custo que muda tudo');
  console.log(`  1 pessoa:      2 requisições, ~${POR_PESSOA_MS}ms   ← a consulta que ele faz`);
  console.log(`  1.500 pessoas: 3.000 requisições, ~${(1500 * POR_PESSOA_MS / 1000 / 60).toFixed(0)} min por leitura`);
  console.log(`  a cada 90s:    ${(3000 / 1.5).toFixed(0)} requisições/minuto na Steam — bloqueio garantido`);
  console.log('  → histórico é SÓ sob demanda, nunca varrendo o servidor inteiro.\n');

  // ── Guardar para sempre: quanto pesa um ano ──────────────────────────
  const porHora = fs.statSync(BANCO).size;
  console.log('GUARDAR PARA SEMPRE');
  console.log(`  1 hora de live com 1.500 jogadores: ${mb(porHora)} MB`);
  console.log(`  6 h/dia, 365 dias: ${(porHora * 6 * 365 / 1073741824).toFixed(2)} GB/ano`);
  fs.rmSync(BANCO, { force: true });
  fs.rmSync(BANCO + '-wal', { force: true });
  fs.rmSync(BANCO + '-shm', { force: true });
})();
