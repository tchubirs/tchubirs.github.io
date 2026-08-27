#!/usr/bin/env node
'use strict';
/**
 * Uso:
 *   node bin/anti-sniper.js <steamid64> <arquivo-com-a-tabela-colada>
 *
 * A tabela é a lista de fidelidade do BotRix, copiada do painel. Coloque
 * "Mostrar: 100" antes de copiar para pegar mais gente de uma vez.
 */

const fs = require('node:fs');
const { lerTabela } = require('../src/stream/botrix');
const { consultar } = require('../src/consulta');
const { ehSteamId64 } = require('../src/steam');

async function main() {
  const [steamId, arquivo] = process.argv.slice(2);
  if (!steamId || !arquivo) {
    console.error('uso: anti-sniper <steamid64> <arquivo-da-tabela>');
    process.exit(2);
  }
  if (!ehSteamId64(steamId)) {
    console.error(`SteamID64 inválido: ${steamId}`);
    console.error('deve ter 17 dígitos e começar com 7656119');
    process.exit(2);
  }

  const audiencia = lerTabela(fs.readFileSync(arquivo, 'utf8'));
  if (audiencia.length === 0) {
    console.error('não consegui ler nenhum espectador do arquivo.');
    console.error('confira se copiou a tabela inteira, com a coluna de tempo.');
    process.exit(1);
  }

  const r = await consultar(steamId, audiencia);

  console.log(`\nSteamID   ${steamId}`);
  console.log(`Audiência ${audiencia.length} espectadores`);
  console.log(`Histórico ${r.historico.length} nomes na conta Steam`);
  if (r.historico.length) console.log(`          ${r.historico.join(' · ')}`);
  console.log('');

  if (r.conclusao === 'inconclusivo') {
    console.log(`⚪ INCONCLUSIVO — ${r.motivo}`);
    return;
  }
  if (!r.evidencias.length) {
    console.log('⚪ Nenhum nome dessa conta bate com quem assistiu.');
    console.log('   Isso NÃO inocenta: a pessoa pode usar nome diferente nos dois lados.');
    return;
  }
  console.log(`🔴 ${r.evidencias.length} coincidência(s):\n`);
  for (const e of r.evidencias) {
    const t = e.minutosAssistidos != null
      ? `${Math.floor(e.minutosAssistidos / 60)}h${String(e.minutosAssistidos % 60).padStart(2, '0')}`
      : 'tempo desconhecido';
    console.log(`   "${e.nomeSteamQueBateu}" (Steam)  ↔  "${e.espectador}" (sua live)`);
    console.log(`   assistiu ${t} · ${Math.round(e.confianca * 100)}% · ${e.motivo}\n`);
  }
  console.log('   Assistir não é crime. Quem julga o contexto é você, que jogou a partida.');
}

main().catch((e) => { console.error('erro:', e.message); process.exit(1); });
