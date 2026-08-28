#!/usr/bin/env node
'use strict';
/**
 * Os nomes que uma conta já usou — lidos da PÁGINA, no teu navegador.
 *
 *   npm run nomes -- 76561198155380495
 *   npm run nomes -- https://steamcommunity.com/id/kjljkjkjk6753
 *   npm run nomes -- 76561198155380495 --ver     (abre a janela para tu veres)
 *
 * Por que pela página e não por API: nenhuma API entrega os nomes.
 * Medido em 28/08/2026 —
 *   steamid.uk v2      → devolve a CONTAGEM ("name_history_count": "343"),
 *                        nunca a lista
 *   steamhistory.net   → /api/names responde "Insufficient API Permissions"
 *   BattleMetrics      → assinatura paga, e só dentro do próprio servidor
 *   Steam (ajaxaliases)→ teto de 10 nomes; 0–1 quando o perfil é privado
 *
 * E a página tem. Ele viu 343, 196, 133 e 61 nomes na tela. A pergunta que
 * ele fez — *"se eu consigo usar, por que você não consegue?"* — está
 * certa: quem não alcança sou eu, do meu ambiente, sem rede no navegador e
 * com o IP bloqueado. Na máquina dele a página abre, e é lá que isto roda.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resolverEntrada } = require('../src/steam');
const { lerNomesDaPagina } = require('../src/nomes-pagina');

const RAIZ = path.join(__dirname, '..');
const PERFIL = process.env.DETETIVE_PERFIL_NOMES
  || path.join(os.homedir(), '.detetive-navegador-nomes');
const SAIDA = path.join(RAIZ, 'dados');

const args = process.argv.slice(2);
const VISIVEL = args.includes('--ver') || process.env.DETETIVE_VISIVEL === '1';
const alvo = args.find((a) => !a.startsWith('-'));

if (!alvo) {
  console.error('\n  uso: npm run nomes -- <SteamID64 | link do perfil>\n');
  process.exit(2);
}

/** As páginas que mostram histórico de nomes, na ordem em que vale tentar. */
const FONTES = process.env.DETETIVE_NOMES_URL
  // Endereço fixo para eu poder provar o caminho do navegador contra uma
  // página local, sem depender de alcançar o site de fora.
  ? [{ nome: 'teste', url: (id) => process.env.DETETIVE_NOMES_URL.replace('{id}', id) }]
  : [
    { nome: 'steamid.uk', url: (id) => `https://steamid.uk/profile/${id}` },
    { nome: 'steamhistory.net', url: (id) => `https://steamhistory.net/id/${id}` },
  ];

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch {
    console.error('\n  Falta o navegador. Rode:\n    npm install\n    npx playwright install chromium\n');
    process.exit(3);
  }

  const id = await resolverEntrada(alvo).catch(() => null);
  if (!id) { console.error(`\n  não consegui virar "${alvo}" em SteamID.\n`); process.exit(2); }
  console.log(`\n  SteamID: ${id}`);

  const op = { headless: !VISIVEL, viewport: { width: 1280, height: 1000 } };
  if (process.env.DETETIVE_CHROME) op.executablePath = process.env.DETETIVE_CHROME;
  // Perfil próprio: o Chromium recusa duas aberturas da mesma pasta, e
  // partilhar com o agente faria um dos dois nunca subir.
  const ctx = await chromium.launchPersistentContext(PERFIL, op);
  const p = await ctx.newPage();

  let resultado = null;
  for (const fonte of FONTES) {
    const url = fonte.url(id);
    process.stdout.write(`  ${fonte.nome.padEnd(18)} `);
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // O Cloudflare pode segurar alguns segundos antes de soltar a página.
      // Espero pelo título mudar em vez de dormir um tempo fixo.
      for (let i = 0; i < 20; i++) {
        const t = await p.title().catch(() => '');
        if (!/just a moment|attention required|checking your browser/i.test(t)) break;
        await p.waitForTimeout(1000);
      }
      await p.waitForTimeout(2500);

      // Se a página pagina a lista, tento pedir tudo de uma vez antes de ler.
      for (const texto of ['View All', 'Ver tudo', 'Show all']) {
        const b = p.locator(`text="${texto}"`).first();
        if (await b.count().catch(() => 0)) {
          await b.click({ timeout: 5000 }).catch(() => {});
          await p.waitForTimeout(2500);
          break;
        }
      }

      const r = await p.evaluate(`(${lerNomesDaPagina.toString()})(document)`);
      if (r?.nomes?.length) {
        console.log(`✓ ${r.nomes.length} nomes${r.total ? ` (a página diz ${r.total})` : ''}`);
        resultado = { fonte: fonte.nome, url, ...r };
        break;
      }
      console.log(`— ${r?.erro || 'nada'}`);
      if (r?.retrato) resultado = resultado || { fonte: fonte.nome, url, ...r };
    } catch (e) {
      console.log(`✗ ${String(e.message).split('\n')[0].slice(0, 70)}`);
    }
  }

  await ctx.close().catch(() => {});

  if (resultado?.nomes?.length) {
    console.log(`\n  ${resultado.nomes.length} nomes de ${id} — via ${resultado.fonte}\n`);
    for (const n of resultado.nomes.slice(0, 40)) {
      console.log(`    ${n.em.padEnd(22)} ${n.nome}`);
    }
    if (resultado.nomes.length > 40) console.log(`    … e mais ${resultado.nomes.length - 40}`);
    // Aviso quando peguei menos do que a própria página anuncia: metade da
    // lista entregue como se fosse inteira é pior que erro nenhum.
    if (resultado.total && resultado.nomes.length < resultado.total) {
      console.log(`\n  ⚠ a página diz ${resultado.total} e eu li ${resultado.nomes.length} — falta paginação`);
    }
    fs.mkdirSync(SAIDA, { recursive: true });
    const arq = path.join(SAIDA, `nomes-${id}.json`);
    fs.writeFileSync(arq, JSON.stringify(resultado, null, 2));
    console.log(`\n  gravado em ${arq}\n`);
    return;
  }

  console.log('\n  Não consegui ler a lista. O retrato da página, para eu acertar o extrator:\n');
  console.log(JSON.stringify(resultado?.retrato ?? { nada: 'nenhuma fonte respondeu' }, null, 2));
  console.log('\n  Cola isto aqui e eu corrijo.\n');
  process.exit(1);
})().catch((e) => { console.error('\n  erro:', e.message, '\n'); process.exit(1); });
