#!/usr/bin/env node
'use strict';
/**
 * Entrada e saída AO SEGUNDO.
 *
 *   npm run presenca         grava
 *   npm run presenca -- --ver   mostra entrou/saiu
 *
 * Ele olhou o log de blocos de 10 minutos e disse: "tem que ser mais
 * preciso, exatamente até os segundos se possível, sei que ele ficou 5
 * minutos no máximo". Com o tempo assistido da BotRix isso é impossível: o
 * crédito vem em blocos, e 5 minutos vira 0 ou vira 10.
 *
 * Este comando usa outra fonte — o canal de PRESENÇA do chat da Kick, que
 * avisa cada entrada e cada saída no instante em que acontecem.
 *
 * Precisa da sessão dele porque a Kick exige autorização para esse canal.
 * Ela vem do navegador do agente, que já fica logado: a chamada de
 * autorização sai de DENTRO da página, então sessão e CSRF vão junto sem
 * ninguém copiar cookie nenhum para lugar nenhum.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { assinarPresenca, visitasDosEventos } = require('../src/stream/kick-presenca');

const RAIZ = path.join(__dirname, '..');
const CONFIG = path.join(RAIZ, 'detetive.config.json');
const cfg = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {};
const CANAL = process.env.PRESENCA_CANAL || cfg.canal || 'tchubi';
// Manda para o serviço além de gravar em arquivo: sem isso a precisão ao
// segundo fica num .jsonl que o painel não lê, e o produto continua
// mostrando blocos de 10 min.
const SERVICO = process.env.DETETIVE_SERVICO
  || (cfg.porta ? `http://127.0.0.1:${cfg.porta}` : 'http://127.0.0.1:8790');
const FUSO = cfg.fuso || 'Europe/Paris';
// Perfil PRÓPRIO, separado do agente. O Chromium recusa duas aberturas da
// mesma pasta de perfil ("Failed to create a ProcessSingleton"), então
// compartilhar com o agente fazia esta gravação nunca começar quando os
// dois rodam juntos. E o login aqui é da Kick; o do agente é do
// BattleMetrics.
const PERFIL = process.env.DETETIVE_PERFIL
  || path.join(os.homedir(), '.detetive-navegador-kick');
const ARQUIVO = path.join(RAIZ, 'dados', 'presenca.jsonl');

const hms = (ms) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date(ms));
const dia = (ms) => new Intl.DateTimeFormat('pt-BR',
  { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(new Date(ms));
const dur = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`);

function lerEventos() {
  if (!fs.existsSync(ARQUIVO)) return [];
  return fs.readFileSync(ARQUIVO, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function mostrar(alvo) {
  const v = visitasDosEventos(lerEventos());
  const filtra = (x) => !alvo || (x.nome || '').toLowerCase().includes(alvo.toLowerCase());
  const fechadas = v.fechadas.filter(filtra);
  const abertas = v.abertas.filter(filtra);

  if (!fechadas.length && !abertas.length) {
    console.log('\n  Nada gravado ainda. Rode `npm run presenca` durante uma live.\n');
    return;
  }
  const por = new Map();
  for (const x of fechadas) {
    if (!por.has(x.nome)) por.set(x.nome, []);
    por.get(x.nome).push(x);
  }
  for (const [nome, lista] of [...por].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${nome || '(sem nome)'}`);
    for (const x of lista) {
      const marca = x.jaEstava ? '  (já estava dentro quando comecei a olhar)' : '';
      console.log(`    ${dia(x.de)}  entrou ${hms(x.de)}   saiu ${hms(x.ate)}   ${dur(x.segundos)}${marca}`);
    }
  }
  for (const a of abertas) {
    console.log(`\n  ${a.nome || '(sem nome)'}`);
    console.log(`    ${dia(a.de)}  entrou ${hms(a.de)}   AINDA DENTRO`);
  }
  console.log('');
}

async function gravar() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch {
    console.error('\n  Falta o navegador. Rode:\n    npm install\n    npx playwright install chromium\n');
    process.exit(3);
  }

  // Id da sala de chat: público, sem login.
  const canalInfo = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(CANAL)}`,
    { headers: { Accept: 'application/json' } }).then((r) => r.json()).catch(() => null);
  const chatroomId = canalInfo?.chatroom?.id;
  if (!chatroomId) { console.error(`\n  não achei a sala de chat de "${CANAL}".\n`); process.exit(2); }

  const ctx = await chromium.launchPersistentContext(PERFIL, {
    headless: process.env.DETETIVE_VISIVEL !== '1',
    viewport: { width: 1100, height: 800 },
  });
  const pagina = await ctx.newPage();
  await pagina.goto(`https://kick.com/${encodeURIComponent(CANAL)}`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pagina.waitForTimeout(3000);

  // A autorização sai de DENTRO da página: cookie e CSRF vão junto sozinhos.
  const autorizar = async (socketId, canal) => {
    const r = await pagina.evaluate(async ([s, c]) => {
      const resp = await fetch('/broadcasting/auth', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ socket_id: s, channel_name: c }),
      });
      if (!resp.ok) return { erro: resp.status };
      try { return { dados: await resp.json() }; } catch { return { erro: 'resposta não era JSON' }; }
    }, [socketId, canal]);
    if (r?.erro === 401) throw new Error('não está logado na Kick — rode com DETETIVE_VISIVEL=1 e entre na sua conta');
    if (r?.erro) throw new Error(`Kick respondeu ${r.erro}`);
    return r.dados;
  };

  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  let dentro = 0;
  const s = assinarPresenca({
    chatroomId,
    autorizar,
    aoEvento: (e) => {
      if (e.tipo === 'pronto') {
        dentro = e.quantos;
        console.log(`  ${hms(e.em)}  conectado — ${e.quantos} pessoa(s) já dentro\n`);
        return;
      }
      fs.appendFileSync(ARQUIVO, JSON.stringify(e) + '\n');
      // O arquivo é a verdade de reserva; o serviço é quem alimenta o
      // painel. Se ele estiver fora do ar, a gravação continua e nada se
      // perde — dá para reenviar depois com --enviar.
      fetch(`${SERVICO}/api/presenca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: CANAL, eventos: [e] }),
      }).catch(() => {});
      if (e.tipo === 'entrou') { dentro += 1; console.log(`  ${hms(e.em)}  ENTROU  ${e.nome || e.id}   (${dentro} dentro)`); }
      else if (e.tipo === 'saiu') { dentro = Math.max(0, dentro - 1); console.log(`  ${hms(e.em)}  saiu    ${e.nome || e.id}   (${dentro} dentro)`); }
    },
    aoErro: (e) => console.error(`  ! ${e.message}`),
  });

  console.log(`\n  Gravando a presença de ${CANAL} (sala ${chatroomId}) ao segundo.`);
  console.log('  Ctrl+C para parar. Depois: npm run presenca -- --ver\n');
  await s.abrir();

  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.on(sinal, async () => {
      s.fechar();
      await ctx.close().catch(() => {});
      mostrar();
      process.exit(0);
    });
  }
}

/** Reenvia o arquivo inteiro ao serviço — para quando ele estava fora do ar. */
async function enviarTudo() {
  const eventos = lerEventos();
  if (!eventos.length) { console.log('\n  nada gravado para enviar.\n'); return; }
  const r = await fetch(`${SERVICO}/api/presenca`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canal: CANAL, eventos }),
  }).catch((e) => ({ ok: false, erro: e.message }));
  if (!r.ok) { console.log(`\n  serviço não recebeu: ${r.erro || r.status}\n`); return; }
  const d = await r.json();
  console.log(`\n  enviados ${eventos.length} eventos — ${d.entrou} entradas, ${d.saiu} saídas.\n`);
}

const args = process.argv.slice(2);
if (args.includes('--enviar')) enviarTudo();
else if (args.includes('--ver')) mostrar(args.find((a) => !a.startsWith('-')));
else gravar().catch((e) => { console.error('\n  erro:', e.message, '\n'); process.exit(1); });
