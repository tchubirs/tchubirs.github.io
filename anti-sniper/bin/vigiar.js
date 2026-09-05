#!/usr/bin/env node
'use strict';
/**
 * Vigiar UMA pessoa, começando agora.
 *
 *   npm run vigiar dilanzito
 *
 * Ele perguntou como vê que o dilanzito abriu a live durante a noite. Não
 * via: a rota pública da BotRix entrega o tempo TOTAL acumulado, não a hora
 * de entrar e sair. Esse "quando" não existe em lugar nenhum — ele se
 * GRAVA, olhando o contador subir.
 *
 * Então este comando faz a coisa mais direta possível: lê o placar de dois
 * em dois minutos e imprime uma linha toda vez que o tempo daquela pessoa
 * sobe. Sem login, sem navegador, sem configurar nada. Roda hoje à noite e
 * amanhã existe o log.
 *
 * A resolução é o intervalo da fidelidade — medido em canais reais: 10 min
 * é o padrão, 5 min o mais curto que apareceu. Então "entrou 22h40" quer
 * dizer "entre 22h30 e 22h40", e a tela diz isso em vez de fingir precisão.
 */
const fs = require('node:fs');
const path = require('node:path');
const { placarPublico } = require('../src/stream/botrix-api');

const RAIZ = path.join(__dirname, '..');
const CONFIG = path.join(RAIZ, 'detetive.config.json');
const cfg = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {};

const ALVOS = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const CANAL = cfg.fontes?.[0]?.usuario || cfg.canal || 'tchubi';
const PLATAFORMA = cfg.fontes?.[0]?.plataforma || 'kick';
const INTERVALO = Number(process.env.VIGIAR_INTERVALO || 120) * 1000;
const SEM_BANCO = process.argv.includes('--sem-banco');

const relogio = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const hhmm = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

function abrirServico() {
  if (SEM_BANCO) return null;
  const { criar } = require('../servico/servidor');
  const s = criar({ caminhoBanco: path.join(RAIZ, 'detetive.db') });
  const canal = cfg.canal || 'tchubi';
  if (!s.db.prepare('SELECT 1 FROM canal WHERE id = ?').get(canal)) {
    s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,fuso) VALUES (?,?,?,?,?)')
      .run(canal, PLATAFORMA, canal, Date.now(), cfg.fuso || 'UTC');
  }
  return { s, canal };
}

(async () => {
  if (!ALVOS.length) {
    console.error('\n  uso: npm run vigiar <nome> [outro-nome ...]\n');
    console.error('  ex:  npm run vigiar dilanzito\n');
    process.exit(2);
  }

  const svc = abrirServico();
  console.log(`\n  Vigiando ${ALVOS.map((a) => `"${a}"`).join(', ')} em ${CANAL} (${PLATAFORMA})`);
  console.log(`  Lendo de ${INTERVALO / 1000}s em ${INTERVALO / 1000}s. Ctrl+C para parar.`);
  console.log('  O crédito da BotRix vem em blocos de ~10 min, então cada subida vale');
  console.log('  "esteve nos últimos 10 minutos", não "entrou neste minuto".\n');
  if (svc) console.log(`  Gravando em detetive.db — o painel mostra isso em "na sua live agora".\n`);

  const anterior = new Map();
  let base = false;
  let semNinguem = 0;

  async function passada() {
    const t = Date.now();
    let lista;
    try { lista = await placarPublico(CANAL, PLATAFORMA); }
    catch (e) { console.log(`  ${relogio(t)}  · não consegui ler: ${e.message}`); return; }

    const achados = ALVOS.map((alvo) => {
      const p = lista.find((x) => x.nome.toLowerCase() === alvo.toLowerCase());
      return { alvo, p };
    });

    for (const { alvo, p } of achados) {
      if (!p) {
        // A rota pública só entrega os 20 primeiros. Fora deles não dá para
        // medir por aqui — e isso não é ausência, é falta de alcance.
        if (!anterior.has(alvo)) {
          console.log(`  ${relogio(t)}  ? "${alvo}" não está nos 20 primeiros da fidelidade`);
          console.log(`             → só a lista completa (npm start, com login) alcança essa pessoa`);
          anterior.set(alvo, null);
        }
        continue;
      }
      const antes = anterior.get(alvo);
      anterior.set(alvo, p.minutosAssistidos);
      if (antes == null) {
        console.log(`  ${relogio(t)}  · ${alvo}: ${hhmm(p.minutosAssistidos)} acumulados (marco inicial)`);
        continue;
      }
      if (p.minutosAssistidos > antes) {
        const d = p.minutosAssistidos - antes;
        console.log(`  ${relogio(t)}  ● ${alvo} ESTAVA ASSISTINDO  (+${d} min · total ${hhmm(p.minutosAssistidos)})`);
        if (svc) svc.s.registrarPresenca(svc.canal, p.nome, null, t, 'tempo');
      } else {
        semNinguem += 1;
        if (semNinguem % 10 === 1) console.log(`  ${relogio(t)}  · ${alvo}: sem mudança`);
      }
    }
    base = true;
  }

  await passada();
  const timer = setInterval(passada, INTERVALO);

  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.on(sinal, () => {
      clearInterval(timer);
      console.log('\n  parado.');
      if (svc) {
        for (const alvo of ALVOS) {
          const l = svc.s.log(svc.canal, alvo);
          if (l.total) {
            console.log(`\n  ${alvo} — o que ficou gravado:`);
            for (const x of l.linhas) {
              console.log(`    ${relogio(x.de)} → ${relogio(x.ate)}  (${x.minutos} min, ${x.amostras} leituras)`);
            }
          } else {
            console.log(`\n  ${alvo}: nada gravado nesta sessão.`);
            console.log('    Isso NÃO quer dizer que não assistiu — quer dizer que o contador');
            console.log('    dela não subiu enquanto eu olhava.');
          }
        }
      }
      process.exit(0);
    });
  }
})();
