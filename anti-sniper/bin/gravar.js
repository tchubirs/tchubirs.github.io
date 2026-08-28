#!/usr/bin/env node
'use strict';
/**
 * Gravar a live AGORA, sem VPS e sem a máquina dele ligada.
 *
 * Ele pediu três vezes a mesma coisa: não o total acumulado, mas as horas
 * de HOJE — cada vez que a pessoa entrou e saiu. Eu vinha respondendo que
 * isso só existe gravando, e não tinha ligado a gravação. Este arquivo liga.
 *
 * Como funciona, e por que é simples de propósito:
 *   - lê a rota PÚBLICA da BotRix (sem login, sem navegador);
 *   - grava cada leitura numa linha de `dados/leituras.jsonl`;
 *   - deriva os intervalos de entrada e saída a partir das leituras.
 *
 * Guardar a leitura CRUA, e não o intervalo já calculado, é a decisão que
 * importa: se eu errar a regra de "quando é a mesma sessão", dá para
 * recalcular tudo do zero. Se eu guardar só a conclusão, o erro é
 * permanente.
 *
 * Uso:
 *   node bin/gravar.js          uma leitura
 *   node bin/gravar.js --ver    mostra entrou/saiu do que já foi gravado
 *   node bin/gravar.js --loop   fica lendo (VER_INTERVALO, padrão 300s)
 */
const fs = require('node:fs');
const path = require('node:path');
const { placarPublico } = require('../src/stream/botrix-api');

const RAIZ = path.join(__dirname, '..');
const CONFIG = path.join(RAIZ, 'detetive.config.json');
const cfg = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {};
const CANAL = process.env.GRAVAR_CANAL || cfg.fontes?.[0]?.usuario || 'tchubi';
const PLATAFORMA = process.env.GRAVAR_PLATAFORMA || cfg.fontes?.[0]?.plataforma || 'kick';
const FUSO = process.env.GRAVAR_FUSO || cfg.fuso || 'Europe/Paris';
const ARQUIVO = path.join(RAIZ, 'dados', 'leituras.jsonl');

/** Quanto silêncio ainda é a mesma visita. O crédito da BotRix vem em
 *  blocos de ~10 min, então 25 min cobre um bloco perdido sem emendar
 *  duas visitas separadas. */
const GAP_MS = 25 * 60000;

const relogio = (ms) => new Intl.DateTimeFormat('pt-BR',
  { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const dia = (ms) => new Intl.DateTimeFormat('pt-BR',
  { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(new Date(ms));

function lerTudo() {
  if (!fs.existsSync(ARQUIVO)) return [];
  return fs.readFileSync(ARQUIVO, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Uma leitura: guarda só quem MUDOU desde a anterior.
 *
 * Guardar os 20 a cada 5 min encheria o arquivo de repetição sem
 * informação: o que interessa é o instante em que o número sobe, porque é
 * ele que diz "estava assistindo agora".
 */
async function umaLeitura() {
  const t = Date.now();
  const lista = await placarPublico(CANAL, PLATAFORMA);
  const antes = new Map();
  for (const l of lerTudo()) antes.set(l.nome, l.min);

  const novas = [];
  for (const p of lista) {
    const m = p.minutosAssistidos;
    if (m == null) continue;
    const a = antes.get(p.nome);
    // Primeira vez que vejo essa pessoa: guardo o marco, sem afirmar que
    // ela estava assistindo — não sei desde quando esse total existe.
    if (a == null) { novas.push({ t, nome: p.nome, min: m, marco: true }); continue; }
    if (m > a) novas.push({ t, nome: p.nome, min: m, ganhou: m - a });
  }

  if (novas.length) {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.appendFileSync(ARQUIVO, novas.map((n) => JSON.stringify(n)).join('\n') + '\n');
  }
  return { t, lidos: lista.length, novas: novas.filter((n) => !n.marco), marcos: novas.filter((n) => n.marco) };
}

/** Das leituras cruas para "entrou HH:MM, saiu HH:MM". */
function visitas(nome = null) {
  const por = new Map();
  for (const l of lerTudo()) {
    if (l.marco) continue;                 // marco não é presença observada
    if (nome && l.nome.toLowerCase() !== nome.toLowerCase()) continue;
    if (!por.has(l.nome)) por.set(l.nome, []);
    const v = por.get(l.nome);
    const ultima = v[v.length - 1];
    // O ganho conta para TRÁS: o contador subiu porque a pessoa esteve
    // durante o intervalo, não porque chegou no instante da leitura.
    const comecou = l.t - (l.ganhou || 0) * 60000;
    if (ultima && l.t - ultima.ate <= GAP_MS) {
      ultima.ate = l.t;
      ultima.minutos += l.ganhou || 0;
      ultima.leituras += 1;
    } else {
      v.push({ de: comecou, ate: l.t, minutos: l.ganhou || 0, leituras: 1 });
    }
  }
  return por;
}

function mostrar(nome) {
  const por = visitas(nome);
  if (!por.size) {
    console.log('\n  Nada gravado ainda.');
    console.log('  Rode `node bin/gravar.js --loop` durante uma live e volte aqui.\n');
    return;
  }
  for (const [n, v] of [...por].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${n}`);
    for (const x of v) {
      console.log(`    ${dia(x.de)}  entrou ${relogio(x.de)}   saiu ${relogio(x.ate)}   ${x.minutos} min`);
    }
  }
  console.log('\n  Blocos de ~10 min: "entrou 22:40" quer dizer "entre 22:30 e 22:40".\n');
}

(async () => {
  // A partir do índice 2: process.argv[0] é o caminho do próprio Node, e
  // ele passava no filtro — o programa procurava por alguém chamado
  // "/usr/bin/node" e não achava nada, nunca.
  const alvo = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (process.argv.includes('--ver')) return mostrar(alvo);

  const passo = async () => {
    try {
      const r = await umaLeitura();
      const quando = relogio(r.t);
      if (r.marcos.length) console.log(`  ${quando}  · marco inicial de ${r.marcos.length} pessoas`);
      for (const n of r.novas) console.log(`  ${quando}  ● ${n.nome} ESTAVA ASSISTINDO (+${n.ganhou} min)`);
      if (!r.novas.length && !r.marcos.length) console.log(`  ${quando}  · ninguém dos ${r.lidos} subiu`);
    } catch (e) { console.log(`  · falhou: ${e.message}`); }
  };

  await passo();
  if (!process.argv.includes('--loop')) return;

  const ms = Number(process.env.VER_INTERVALO || 300) * 1000;
  console.log(`\n  gravando ${CANAL} (${PLATAFORMA}) a cada ${ms / 1000}s — Ctrl+C para parar\n`);
  setInterval(passo, ms);
})();
