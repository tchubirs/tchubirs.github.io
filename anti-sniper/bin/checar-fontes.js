#!/usr/bin/env node
'use strict';
/**
 * Quais das suas plataformas realmente entregam audiência?
 *
 * A BotRix tem fidelidade em Twitch, Kick, YouTube e Trovo, e a rota pública
 * responde por plataforma. Mas "tem suporte" e "tem dado" são coisas
 * diferentes: um canal pode existir lá e vir vazio porque a fidelidade nunca
 * foi ligada, ou porque o seu nome naquela plataforma é outro.
 *
 * Isso precisa aparecer antes de você depender da ferramenta — descobrir
 * numa noite de raid que uma das fontes estava muda o tempo todo é o pior
 * jeito de descobrir.
 *
 * Uso:  node bin/checar-fontes.js tchubi [outro-nome ...]
 */
const { placarPublico, TETO_PUBLICO } = require('../src/stream/botrix-api');

const PLATAFORMAS = ['kick', 'twitch', 'youtube', 'trovo'];

async function checar(usuario, plataforma) {
  try {
    const l = await placarPublico(usuario, plataforma);
    if (!l.length) return { estado: 'vazio', n: 0 };
    const comTempo = l.filter((x) => x.minutosAssistidos > 0).length;
    return { estado: 'ok', n: l.length, comTempo, topo: l[0] };
  } catch (e) {
    // "error:true" da BotRix quer dizer que esse par não existe lá — não é
    // falha da rede, e mostrar como erro assustaria à toa.
    return { estado: e.naoExiste || e.status === 404 ? 'não existe' : 'erro', motivo: e.message };
  }
}

(async () => {
  const usuarios = process.argv.slice(2);
  if (!usuarios.length) {
    console.error('uso: node bin/checar-fontes.js <seu-nome> [outro-nome ...]');
    process.exit(2);
  }

  const bons = [];
  for (const u of usuarios) {
    console.log(`\n  ${u}`);
    for (const p of PLATAFORMAS) {
      const r = await checar(u, p);
      if (r.estado === 'ok') {
        bons.push({ plataforma: p, usuario: u });
        console.log(`    ${p.padEnd(9)} ✓ ${r.n} pessoas, ${r.comTempo} com tempo assistido`
          + `  (topo: ${r.topo.nome}, ${r.topo.minutosAssistidos} min)`);
      } else if (r.estado === 'vazio') {
        console.log(`    ${p.padEnd(9)} — existe, mas veio VAZIO (fidelidade desligada, ou nome diferente aqui)`);
      } else if (r.estado === 'não existe') {
        console.log(`    ${p.padEnd(9)} · sem canal com esse nome`);
      } else {
        console.log(`    ${p.padEnd(9)} ! ${r.motivo}`);
      }
    }
  }

  console.log(`\n  A rota pública entrega no máximo ${TETO_PUBLICO} pessoas por fonte.`);
  console.log('  Para a lista completa, o agente logado usa /api/loyalty/get.\n');
  if (bons.length) {
    console.log('  Para o detetive.config.json:\n');
    console.log('  "fontes": ' + JSON.stringify(bons) + '\n');
  } else {
    console.log('  Nenhuma fonte com dado. Ligue a fidelidade na BotRix e rode de novo.\n');
  }
})();
