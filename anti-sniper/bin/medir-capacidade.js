#!/usr/bin/env node
'use strict';
/**
 * Quantos streamers cabem ao mesmo tempo numa máquina só?
 *
 * Node é uma linha de execução só. Se um canal come 6% de um núcleo, vinte
 * canais comem 120% — e aí não cabe. A pergunta é quanto custa UM canal por
 * minuto de relógio, e o resto é divisão.
 *
 * Rode: node bin/medir-capacidade.js [jogadores] [audiencia]
 */
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { criar } = require('../servico/servidor');

const JOGADORES = Number(process.argv[2] || 1500);
const AUDIENCIA = Number(process.argv[3] || 5000);
const MIN = 60000;
const T0 = Date.parse('2026-08-27T18:00:00Z');
const BANCO = path.join(os.tmpdir(), `cap-${process.pid}.db`);

// Nomes com a variedade que um servidor real tem: bases repetidas, sufixos,
// números, cirílico. Nomes todos iguais fariam o índice parecer melhor do
// que é; nomes todos únicos fariam parecer pior.
const BASES = ['Killer', 'Sniper', 'noob', 'Ivan', 'Pedro', 'Hans', 'zLucas', 'MEDUSA',
  'D1per', 'FINIK', 'Caraxes', 'xXdarkXx', 'Опасный', 'arin', 'merfy', 'Joao', 'Wolf',
  'ghost', 'Rex', 'Nikita', 'Bruno', 'kaio', 'Tiger', 'lobo', 'zeca'];
const nome = (i) => BASES[i % BASES.length] + (i % 3 === 0 ? '_' : '') + i;

const ms = (t) => Number(process.hrtime.bigint() - t) / 1e6;

(async () => {
  for (const f of [BANCO, BANCO + '-wal', BANCO + '-shm']) fs.rmSync(f, { force: true });
  let agora = T0;
  const s = criar({ caminhoBanco: BANCO, chavePem: 'x', agora: () => agora });
  s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em) VALUES (?,?,?,?)')
    .run('c1', 'kick', 'tchubi', T0);

  for (let i = 0; i < AUDIENCIA; i++) {
    s.ingerir('c1', 'chat.message', { sender: { username: nome(i * 7), user_id: i } }, T0 - 200 * MIN);
  }
  const jogadores = Array.from({ length: JOGADORES }, (_, i) => ({ nome: nome(i), minutosNoServidor: i % 300 }));

  console.log(`${JOGADORES} jogadores no servidor · audiência de ${AUDIENCIA}\n`);

  // ── Um ciclo de 90s: o que UM canal gasta ────────────────────────────
  const conta = { gravar: 0, cruzar: 0, agora: 0, chat: 0 };
  const CICLOS = 10;
  for (let c = 0; c < CICLOS; c++) {
    agora = T0 + c * 90000;
    let t = process.hrtime.bigint();
    s.guardarServidor('c1', { nome: 'Rustoria' }, jogadores, agora);
    conta.gravar += ms(t);

    t = process.hrtime.bigint();
    s.cruzarAgora('c1');
    conta.cruzar += ms(t);

    t = process.hrtime.bigint();
    s.nosDois('c1', agora);
    conta.agora += ms(t);

    // 90s de chat num canal movimentado: ~60 mensagens
    t = process.hrtime.bigint();
    for (let i = 0; i < 60; i++) {
      s.ingerir('c1', 'chat.message', { sender: { username: nome(i * 7), user_id: i } }, agora + i * 1000);
    }
    conta.chat += ms(t);

    // O painel pergunta a cada 15s — 6 vezes por ciclo, tudo cacheado
    t = process.hrtime.bigint();
    for (let i = 0; i < 6; i++) { s.cruzarAgora('c1'); s.nosDois('c1', agora); }
    conta.agora += ms(t);
  }

  console.log('POR CICLO DE 90s, UM CANAL:');
  const total = Object.values(conta).reduce((a, b) => a + b, 0) / CICLOS;
  for (const [k, v] of Object.entries(conta)) {
    console.log(`  ${k.padEnd(8)} ${(v / CICLOS).toFixed(0).padStart(6)} ms`);
  }
  console.log(`  ${'TOTAL'.padEnd(8)} ${total.toFixed(0).padStart(6)} ms  de CPU a cada 90 s`);

  const fracao = total / 90000;
  console.log(`\n  = ${(fracao * 100).toFixed(1)}% de um núcleo, por canal`);
  console.log(`  CABEM ~${Math.floor(1 / fracao)} canais por núcleo (com 50% de folga: ~${Math.floor(0.5 / fracao)})`);
  console.log(`  ${os.cpus().length} núcleos nesta máquina → ~${Math.floor(os.cpus().length * 0.5 / fracao)} canais`);

  const tam = fs.statSync(BANCO).size;
  // Disco NÃO cresce linear com o tempo: o banco aloca de uma vez e depois
  // só acrescenta estada nova quando entra gente nova. Medido em 12h de
  // live com rotatividade de 10% por leitura: 4,65 MB na 1ª hora e 5,71 MB
  // na 12ª — cerca de 0,1 MB por hora, não os 1,5 MB que a primeira conta
  // sugeria extrapolando a alocação inicial.
  console.log(`\n  disco: ${(tam / 1048576).toFixed(1)} MB (alocação inicial)`);
  console.log('  crescimento medido: ~0,1 MB por hora de live, por canal');
  console.log('  20 canais, 6 h/dia, 1 ano: ~4,4 GB');

  for (const f of [BANCO, BANCO + '-wal', BANCO + '-shm']) fs.rmSync(f, { force: true });
})();
