#!/usr/bin/env node
'use strict';
/**
 * A busca rápida: dá-me a Steam de quem te matou, e eu digo se ele te via.
 *
 *   npm run quem -- 76561198066116229
 *   npm run quem -- https://steamcommunity.com/id/algum-apelido
 *   npm run quem -- 76561198066116229 --canal outro
 *   npm run quem -- 76561198066116229 tabela.txt     (tabela colada à mão)
 *
 * "Primeiro uma busca mais rápida: eu dou o SteamID do inimigo, você pesquisa
 *  os nomes e faz a comparação."
 *
 * A audiência vem sozinha da BotRix — antes era preciso copiar a tabela do
 * painel para um ficheiro, e um passo à mão no meio de uma pergunta urgente é
 * um passo que não se dá. O ficheiro continua a ser aceite para quando ele
 * tiver uma lista maior colada à mão do que a que a API devolve.
 *
 * Aceita link de perfil e apelido, não só os 17 dígitos: ninguém tem a
 * SteamID decorada, o que se tem é o link que se copiou do jogo.
 */

const fs = require('node:fs');
const { lerTabela } = require('../src/stream/botrix');
const { consultar } = require('../src/consulta');
const { resolverEntrada } = require('../src/steam');
const { placarPublico } = require('../src/stream/botrix-api');

/** A audiência de agora, sem ninguém ter de copiar nada. */
async function audienciaViva(canal) {
  const p = await placarPublico(canal, 'kick');
  return (p.pessoas || p || [])
    .map((x) => ({ nome: x.nome || x.name || x.username, minutosAssistidos: x.minutos ?? x.minutosAssistidos ?? null }))
    .filter((x) => x.nome);
}

async function main() {
  const argv = process.argv.slice(2);
  const iCanal = argv.indexOf('--canal');
  const canal = iCanal > 0 && argv[iCanal + 1] ? argv[iCanal + 1] : 'tchubi';
  const livres = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--canal');
  const [entrada, arquivo] = livres;
  if (!entrada) {
    console.error('uso: npm run quem -- <steamid64 | link do perfil> [ficheiro-da-tabela]');
    process.exit(2);
  }

  const steamId = await resolverEntrada(entrada);
  if (!steamId) {
    console.error(`não consegui chegar a uma SteamID a partir de "${entrada}".`);
    console.error('aceito os 17 dígitos, /profiles/<id> ou /id/<apelido>.');
    process.exit(2);
  }

  const audiencia = arquivo
    ? lerTabela(fs.readFileSync(arquivo, 'utf8'))
    : await audienciaViva(canal);
  if (audiencia.length === 0) {
    console.error(arquivo
      ? 'não consegui ler nenhum espectador do ficheiro.'
      : `a BotRix não devolveu ninguém para "${canal}".`);
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
