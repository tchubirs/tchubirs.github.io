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

// DOIS perfis, e não é preferência: o Chromium cria um ProcessSingleton
// dentro da pasta do perfil e recusa a segunda abertura. Medido:
//   "Failed to create a ProcessSingleton for your profile directory."
// Com um perfil só, o agente sobe primeiro e a PRESENÇA nunca sobe —
// justamente a fonte ao segundo, morrendo calada e tentando de novo a cada
// 30s para sempre.
//
// Separar também é mais certo: são logins de sites diferentes. O agente
// entra no BattleMetrics, a presença entra na Kick.
const PERFIL = process.env.DETETIVE_PERFIL
  || path.join(os.homedir(), '.detetive-navegador');
const PERFIL_KICK = process.env.DETETIVE_PERFIL_KICK
  || path.join(os.homedir(), '.detetive-navegador-kick');

const MODELO = {
  canal: 'tchubi',
  fuso: 'Europe/Paris',
  porta: 8790,
  // Seu id de jogador no BattleMetrics. Abra seu perfil lá e copie o número
  // do endereço: battlemetrics.com/players/SEU_ID
  battlemetricsJogador: '',
  // O painel de fidelidade da BotRix. É a fonte que enxerga quem assiste
  // CALADO — sem ela, só aparece quem escreve no chat. Traz a lista
  // COMPLETA, da plataforma que estiver selecionada lá dentro.
  botrixFidelidade: 'https://botrix.live/panel/loyalty',
  // As mesmas listas pela rota pública: sem login, uma por plataforma, e
  // sem mexer na plataforma que você deixou selecionada no painel. Vem
  // capada em 20 pessoas — é piso, não teto.
  // Descubra quais das suas têm dado com: node bin/checar-fontes.js tchubi
  fontes: [{ plataforma: 'kick', usuario: 'tchubi' }],
  intervaloSegundos: 90,
  // Entrada e saída AO SEGUNDO, pelo canal de presença do chat da Kick.
  // É a única fonte que responde "ficou 5 minutos"; as outras vêm em
  // blocos de ~10 min. Precisa do seu login na Kick, feito uma vez.
  presencaAoSegundo: true,
};

function lerConfig() {
  if (!fs.existsSync(CONFIG)) {
    fs.writeFileSync(CONFIG, JSON.stringify(MODELO, null, 2) + '\n');
    console.log(`\nCriei ${path.basename(CONFIG)}. Falta UMA linha:\n`);
    console.log('  battlemetricsJogador  → o número em battlemetrics.com/players/NUMERO');
    console.log('\nO resto já vem preenchido. Depois: npm start');
    console.log('Para conferir quais plataformas suas têm dado:');
    console.log('  node bin/checar-fontes.js tchubi\n');
    process.exit(0);
  }
  return { ...MODELO, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) };
}

function garantirFontes(db, cfg) {
  const guardar = db.prepare(
    'INSERT OR IGNORE INTO fonte (canal_id, servico, plataforma, usuario, criado_em) VALUES (?,?,?,?,?)');
  let n = 0;
  for (const f of cfg.fontes || []) {
    if (!f?.plataforma || !f?.usuario) continue;
    guardar.run(cfg.canal, 'botrix', f.plataforma, f.usuario, Date.now());
    n += 1;
  }
  return n;
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
  const srv = criar({
    caminhoBanco: path.join(RAIZ, 'detetive.db'),
    agora: Date.now,
  });
  const { servidor, db } = srv;

  const estado = garantirCanal(db, cfg);
  const nFontes = garantirFontes(db, cfg);
  const url = `http://127.0.0.1:${cfg.porta}/?canal=${encodeURIComponent(cfg.canal)}`;

  servidor.listen(cfg.porta, '127.0.0.1', () => {
    console.log(`\n  Detetive no ar — canal "${cfg.canal}" (${estado})`);
    console.log(`  PAINEL:  ${url}\n`);

    // A coleta pública não depende de navegador nem de login: começa a
    // gravar no primeiro segundo, mesmo que o agente nunca suba.
    if (nFontes) {
      const cols = srv.ligarBotrixPublico({ intervaloMs: 5 * 60 * 1000 });
      console.log(`  Coletando tempo assistido de ${nFontes} fonte(s) pública(s) da BotRix,`);
      console.log(`  a cada 5 min — ${cols.size} coletor(es) ligado(s). Sem login.\n`);
    } else {
      console.log('  ⚠ Nenhuma fonte pública no config: quem assiste CALADO não será visto.');
      console.log('    Descubra as suas com: node bin/checar-fontes.js <seu-nome>\n');
    }

    // Sem nada para o agente fazer, não adianta subir e ficar reiniciando:
    // um laço de erro na tela esconde o que importa e não conserta nada.
    if (!cfg.battlemetricsJogador && !cfg.botrixFidelidade) {
      console.log('  · agente não sobe: falta battlemetricsJogador ou botrixFidelidade.');
      console.log('    A coleta pública acima continua gravando.\n');
      return;
    }
    if (!cfg.battlemetricsJogador) {
      console.log('  · sem battlemetricsJogador: o agente só lê a fidelidade,');
      console.log('    então não dá para saber quem está NO SERVIDOR agora.\n');
    }

    // O agente vai num processo separado de propósito: se o navegador
    // travar ou o Playwright morrer, o painel continua de pé com tudo que
    // já foi gravado. Perder a gravação de agora é ruim; perder o histórico
    // inteiro por causa de um navegador é pior.
    let ag = null;
    let pres = null;
    let parando = false;
    let espera = 5000;

    // A presença vai num processo à parte do agente: são navegadores
    // diferentes olhando sites diferentes, e um travado não pode calar o
    // outro. Perder as horas exatas porque o BattleMetrics caiu seria o
    // pior jeito de perder justamente o dado mais preciso.
    function subirPresenca() {
      if (!cfg.presencaAoSegundo) return;
      pres = spawn(process.execPath, [path.join(RAIZ, 'bin', 'presenca.js')], {
        stdio: 'inherit',
        env: {
          ...process.env,
          DETETIVE_SERVICO: `http://127.0.0.1:${cfg.porta}`,
          PRESENCA_CANAL: cfg.canal,
          DETETIVE_PERFIL: PERFIL_KICK,
          DETETIVE_VISIVEL: process.env.DETETIVE_VISIVEL ?? (fs.existsSync(PERFIL_KICK) ? '' : '1'),
        },
      });
      pres.on('exit', (c) => {
        if (parando) return;
        if (c === 3) { console.log('  · presença parada até instalar o navegador.'); return; }
        console.log(`  · presença caiu (código ${c}) — voltando em 30s`);
        setTimeout(subirPresenca, 30000);
      });
    }

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
    subirPresenca();
    if (cfg.presencaAoSegundo) {
      console.log('  Gravando presença AO SEGUNDO pelo chat da Kick.');
      // Duas janelas na primeira vez, e cada uma quer um site diferente.
      // Sem dizer qual é qual, a chance de logar na errada é metade.
      const faltam = [
        !fs.existsSync(PERFIL) && 'BattleMetrics',
        !fs.existsSync(PERFIL_KICK) && 'Kick',
      ].filter(Boolean);
      if (faltam.length) {
        console.log(`  Na primeira vez abre ${faltam.length === 2 ? 'uma janela para cada' : 'uma janela'}:`);
        for (const q of faltam) console.log(`    · entre na sua conta da ${q}`);
        console.log('');
      }
    }

    for (const sinal of ['SIGINT', 'SIGTERM']) {
      process.on(sinal, () => {
        parando = true;
        if (ag) ag.kill();
        if (pres) pres.kill();
        servidor.close(() => process.exit(0));
      });
    }
  });
}

if (require.main === module) main();
module.exports = { lerConfig, garantirCanal, garantirFontes, MODELO };
