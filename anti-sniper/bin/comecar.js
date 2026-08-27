#!/usr/bin/env node
'use strict';
/**
 * Um comando só, na máquina dele:  npm start
 *
 * Sobe o serviço, abre o navegador com a sessão dele e começa a gravar. Sem
 * VPS, sem webhook, sem endereço público — tudo isso é para depois.
 *
 * Por que dá para começar sem a Kick: o webhook dela entrega MENSAGEM, e
 * ele já disse a frase que decide o desenho — "nenhum stream sniper fala no
 * chat". O que enxerga sniper é tempo assistido, e isso vem do BotRix pela
 * sessão dele. Ou seja: a parte que importa roda 100% local.
 *
 * O que ele faz UMA vez:
 *   1. npm start
 *   2. faz login no BattleMetrics e no BotRix na janela que abrir
 *   3. fecha a janela quando quiser; a sessão fica salva
 *
 * Da segunda vez em diante é só `npm start`.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const CONFIG = path.join(RAIZ, 'detetive.config.json');

const PERFIL = process.env.DETETIVE_PERFIL
  || path.join(os.homedir(), '.detetive-navegador');

const MODELO = {
  canal: 'tchubi',
  fuso: 'Europe/Paris',
  porta: 8790,
  // Seu id de jogador no BattleMetrics. Abra seu perfil lá e copie o número
  // do endereço: battlemetrics.com/players/SEU_ID
  battlemetricsJogador: '',
  // O painel de fidelidade da BotRix. É a fonte que enxerga quem assiste
  // CALADO — sem ela, só aparece quem escreve no chat.
  botrixFidelidade: 'https://botrix.live/panel/loyalty',
  intervaloSegundos: 90,
};

function lerConfig() {
  if (!fs.existsSync(CONFIG)) {
    fs.writeFileSync(CONFIG, JSON.stringify(MODELO, null, 2) + '\n');
    console.log(`\nCriei ${path.basename(CONFIG)}. Preencha duas linhas e rode de novo:\n`);
    console.log('  battlemetricsJogador  → o número em battlemetrics.com/players/NUMERO');
    console.log('  botrixFidelidade      → o endereço da sua página de fidelidade no BotRix\n');
    console.log('O resto já vem preenchido. Depois: npm start\n');
    process.exit(0);
  }
  return { ...MODELO, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) };
}

function garantirCanal(db, cfg) {
  const existe = db.prepare('SELECT * FROM canal WHERE id = ?').get(cfg.canal);
  if (!existe) {
    db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,fuso) VALUES (?,?,?,?,?)')
      .run(cfg.canal, 'kick', cfg.canal, Date.now(), cfg.fuso);
    return 'criado';
  }
  if (existe.fuso !== cfg.fuso) {
    db.prepare('UPDATE canal SET fuso = ? WHERE id = ?').run(cfg.fuso, cfg.canal);
  }
  return 'já existia';
}

function main() {
  const cfg = lerConfig();
  const { criar } = require('../servico/servidor');
  const { servidor, db } = criar({
    caminhoBanco: path.join(RAIZ, 'detetive.db'),
    agora: Date.now,
  });

  const estado = garantirCanal(db, cfg);
  const url = `http://127.0.0.1:${cfg.porta}/?canal=${encodeURIComponent(cfg.canal)}`;

  servidor.listen(cfg.porta, '127.0.0.1', () => {
    console.log(`\n  Detetive no ar — canal "${cfg.canal}" (${estado})`);
    console.log(`  PAINEL:  ${url}\n`);

    if (!cfg.battlemetricsJogador && !cfg.botrixFidelidade) {
      console.log('  ⚠ Sem battlemetricsJogador nem botrixFidelidade no config:');
      console.log('    o painel abre, mas nada é gravado. Preencha e rode de novo.\n');
      return;
    }

    // O agente vai num processo separado de propósito: se o navegador
    // travar ou o Playwright morrer, o painel continua de pé com tudo que
    // já foi gravado. Perder a gravação de agora é ruim; perder o histórico
    // inteiro por causa de um navegador é pior.
    let ag = null;
    let parando = false;
    let espera = 5000;

    function subirAgente() {
      ag = spawn(process.execPath, [path.join(RAIZ, 'agente', 'agente.js')], {
        stdio: 'inherit',
        env: {
          ...process.env,
          DETETIVE_SERVICO: `http://127.0.0.1:${cfg.porta}`,
          DETETIVE_CANAL: cfg.canal,
          DETETIVE_JOGADOR: cfg.battlemetricsJogador,
          DETETIVE_FIDELIDADE: cfg.botrixFidelidade,
          DETETIVE_INTERVALO: String(cfg.intervaloSegundos),
          DETETIVE_PERFIL: PERFIL,
          // Na primeira vez a janela precisa aparecer para ele fazer login.
          // Tem que olhar o MESMO caminho que o agente vai usar — checar um
          // e usar outro faria a janela nunca abrir, e o login nunca sair.
          DETETIVE_VISIVEL: process.env.DETETIVE_VISIVEL ?? (fs.existsSync(PERFIL) ? '' : '1'),
        },
      });
      ag.on('exit', (c) => {
        if (parando) return;
        // Código 3 é dependência faltando: reiniciar não conserta, só enche
        // a tela. Qualquer outro é navegador travado ou rede — esses voltam.
        if (c === 3) {
          console.log('  · agente parado até você instalar o navegador. O painel segue no ar.');
          return;
        }
        console.log(`  · agente caiu (código ${c}) — voltando em ${espera / 1000}s`);
        setTimeout(subirAgente, espera);
        espera = Math.min(espera * 2, 5 * 60000);
      });
      // Sobreviveu meio minuto: considera que se recuperou de verdade.
      setTimeout(() => { if (ag && ag.exitCode === null) espera = 5000; }, 30000).unref?.();
    }
    subirAgente();

    for (const sinal of ['SIGINT', 'SIGTERM']) {
      process.on(sinal, () => {
        parando = true;
        if (ag) ag.kill();
        servidor.close(() => process.exit(0));
      });
    }
  });
}

if (require.main === module) main();
module.exports = { lerConfig, garantirCanal, MODELO };
