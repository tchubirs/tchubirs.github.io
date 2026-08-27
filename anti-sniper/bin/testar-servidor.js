#!/usr/bin/env node
'use strict';
/**
 *   node bin/testar-servidor.js IP:PORTA
 *
 * Descobre se dá para ver a lista de jogadores de um servidor sem ser dono
 * dele. É o teste que decide o formato do produto inteiro.
 */
const { consultarEsperto } = require('../src/jogo/rust-a2s');

(async () => {
  const alvo = process.argv[2];
  if (!alvo || !alvo.includes(':')) {
    console.error('uso: node bin/testar-servidor.js IP:PORTA');
    console.error('exemplo: node bin/testar-servidor.js 104.143.2.17 28215');
    process.exit(2);
  }
  const [host, porta] = alvo.split(':');
  console.log(`\nconsultando ${host}:${porta} …`);
  const r = await consultarEsperto(host, Number(porta));

  if (!r) {
    console.log('\n❌ servidor não respondeu em nenhuma porta testada.');
    console.log('   confira o IP, ou o servidor pode estar offline.\n');
    process.exit(1);
  }

  console.log(`\n✅ respondeu na porta ${r.portaUsada}`);
  console.log(`   ${r.info.nome}`);
  console.log(`   ${r.info.jogo} · mapa ${r.info.mapa} · ${r.info.jogadores}/${r.info.max} jogadores\n`);

  if (r.jogadores === null) {
    console.log(`❌ SEM lista de jogadores — ${r.motivo}`);
    console.log('   o Detetive vai precisar de RCON para este servidor.\n');
    return;
  }
  if (r.jogadores.length === 0) {
    console.log('⚠️  lista VAZIA.');
    console.log(`   o servidor diz ter ${r.info.jogadores} jogadores, então provavelmente`);
    console.log('   o dono ligou server.censorplayerlist para esconder os nomes.\n');
    return;
  }

  console.log(`🎯 LISTA DE JOGADORES: ${r.jogadores.length} nomes\n`);
  for (const j of r.jogadores.slice(0, 25)) {
    console.log(`   ${String(j.minutosNoServidor).padStart(5)} min   ${j.nome}`);
  }
  console.log('\n   Se apareceram nomes aqui, o Detetive funciona em qualquer');
  console.log('   servidor, sem precisar do dono. É o cenário bom.\n');
})();
