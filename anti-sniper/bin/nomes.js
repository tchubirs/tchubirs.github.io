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
const { lerNomesDaPagina, lerAgrupadoPorAno } = require('../src/nomes-pagina');

const RAIZ = path.join(__dirname, '..');
const PERFIL = process.env.DETETIVE_PERFIL_NOMES
  || path.join(os.homedir(), '.detetive-navegador-nomes');
const SAIDA = path.join(RAIZ, 'dados');

const args = process.argv.slice(2);
const VISIVEL = args.includes('--ver') || process.env.DETETIVE_VISIVEL === '1';
// `--tudo` consulta as duas fontes e junta. Sem ele, para na primeira
// que responder — que é o que serve no dia a dia.
const TUDO = args.includes('--tudo');
const alvo = args.find((a) => !a.startsWith('-'));

if (!alvo) {
  console.error('\n  uso: npm run nomes -- <SteamID64 | link do perfil>\n');
  process.exit(2);
}

/** As páginas que mostram histórico de nomes, na ordem em que vale tentar. */
const FONTES = process.env.DETETIVE_NOMES_URL
  // Endereço fixo para eu poder provar o caminho do navegador contra uma
  // página local, sem depender de alcançar o site de fora.
  ? [{ nome: 'teste', urls: (id) => [process.env.DETETIVE_NOMES_URL.replace('{id}', id)] }]
  // DUAS fontes, e não é redundância: são bancos diferentes, e cada um vê
  // o que o outro não vê. Medido nas contas dele:
  //
  //     76561198155380495   steamid.uk 343 · steamhistory 133
  //     76561198145264799   steamid.uk   0 (optout!) · steamhistory 196
  //     76561198178303493   steamid.uk   0 (optout!) · steamhistory  61
  //
  // `optout=1` quer dizer que a pessoa pediu remoção da base do steamid.uk,
  // e pagar não desfaz isso — o plano Silver dele está ativo e continua a
  // devolver zero nessas três. Sem a segunda fonte, a busca ficava cega em
  // três de cinco casos reais.
  //
  // steamid.uk primeiro: é onde ele paga, e tem mais nomes quando vê.
  : [
    { nome: 'steamid.uk', urls: (id) => [`https://steamid.uk/profile/${id}`] },
    // Não sei o formato exato do endereço deles — o Cloudflare me barra e
    // nunca cheguei a ver. Tento os prováveis e digo qual respondeu, em vez
    // de fingir que sei.
    { nome: 'steamhistory.net',
      urls: (id) => [
        `https://steamhistory.net/id/${id}`,
        `https://steamhistory.net/profile/${id}`,
        `https://steamhistory.net/steamid/${id}`,
        `https://steamhistory.net/user/${id}`,
      ] },
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

  /** Uma tentativa numa URL. Devolve o que a página deu, sem julgar. */
  async function tentar(url) {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // O Cloudflare pode segurar alguns segundos antes de soltar a página.
    // Espero o título mudar em vez de dormir um tempo fixo.
    for (let i = 0; i < 20; i++) {
      const t = await p.title().catch(() => '');
      if (!/just a moment|attention required|checking your browser/i.test(t)) break;
      await p.waitForTimeout(1000);
    }
    await p.waitForTimeout(2500);

    // Se a página pagina a lista, peço tudo antes de ler.
    for (const texto of ['View All', 'Ver tudo', 'Show all']) {
      const b = p.locator(`text="${texto}"`).first();
      if (await b.count().catch(() => 0)) {
        await b.click({ timeout: 5000 }).catch(() => {});
        await p.waitForTimeout(2500);
        break;
      }
    }

    // As DUAS funções vão para dentro da página: `lerNomesDaPagina` chama
    // `lerAgrupadoPorAno`, e `toString()` não leva dependências junto.
    // E `evaluate` com texto quer uma EXPRESSÃO, daí o embrulho.
    return p.evaluate(`(() => {
      ${lerAgrupadoPorAno.toString()}
      ${lerNomesDaPagina.toString()}
      return lerNomesDaPagina(document);
    })()`);
  }

  const achados = [];
  let ultimoRetrato = null;

  for (const fonte of FONTES) {
    process.stdout.write(`  ${fonte.nome.padEnd(18)} `);
    let ok = null;
    for (const url of fonte.urls(id)) {
      let r = null;
      try { r = await tentar(url); }
      catch (e) { continue; }                    // endereço errado: próximo
      if (r?.nomes?.length) { ok = { fonte: fonte.nome, url, ...r }; break; }
      if (r?.limitado) { ultimoRetrato = { fonte: fonte.nome, url, ...r }; break; }
      if (r?.retrato) ultimoRetrato = ultimoRetrato || { fonte: fonte.nome, url, ...r };
    }
    if (ok) {
      console.log(`✓ ${ok.nomes.length} nomes${ok.total ? ` (a página diz ${ok.total})` : ''}`);
      achados.push(ok);
      // Sem --tudo, a primeira que responder basta. Com --tudo, sigo para
      // juntar: são bancos diferentes, e a união é maior que qualquer um.
      if (!TUDO) break;
    } else if (ultimoRetrato?.fonte === fonte.nome && ultimoRetrato.limitado) {
      console.log(`⚠ ${ultimoRetrato.erro}${ultimoRetrato.totalDito ? ` — admite ${ultimoRetrato.totalDito} nomes` : ''}`);
    } else {
      console.log('— nada');
    }
  }

  // Junta as fontes. Mesmo nome no mesmo ano é a mesma coisa; o resto soma.
  let resultado = null;
  if (achados.length === 1) resultado = achados[0];
  else if (achados.length > 1) {
    const vistos = new Map();
    for (const a of achados) {
      for (const n of a.nomes) {
        const k = `${String(n.nome).toLowerCase()}|${n.em}`;
        if (!vistos.has(k)) vistos.set(k, { ...n, fonte: a.fonte });
      }
    }
    resultado = {
      fonte: achados.map((a) => a.fonte).join(' + '),
      url: achados.map((a) => a.url).join(' , '),
      nomes: [...vistos.values()],
      total: achados.reduce((t, a) => Math.max(t, a.total || 0), 0) || null,
      precisao: achados.every((a) => a.precisao === 'ano') ? 'ano' : undefined,
      porFonte: achados.map((a) => `${a.fonte}: ${a.nomes.length}`),
    };
    console.log(`\n  juntando as fontes → ${resultado.nomes.length} nomes distintos (${resultado.porFonte.join(' · ')})`);
  } else {
    resultado = ultimoRetrato;
  }

  await ctx.close().catch(() => {});

  if (resultado?.nomes?.length) {
    console.log(`\n  ${resultado.nomes.length} nomes de ${id} — via ${resultado.fonte}`);
    // A página do steamid.uk agrupa por ANO e não dá o dia. Imprimir um dia
    // que ela não deu seria inventar precisão, então a coluna diz o que é.
    if (resultado.precisao === 'ano') console.log('  (a página dá o ano, não o dia)');
    console.log('');
    for (const n of resultado.nomes.slice(0, 60)) {
      console.log(`    ${String(n.em).padEnd(22)} ${n.nome}`);
    }
    if (resultado.nomes.length > 60) console.log(`    … e mais ${resultado.nomes.length - 60}`);
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

  if (resultado?.limitado) {
    console.log(`\n  A página tem os nomes mas não os mostra${
      resultado.totalDito ? ` (admite ${resultado.totalDito})` : ''}.`);
    console.log(`  ${resultado.dica}\n`);
    console.log(`    npm run nomes -- ${id} --ver`);
    console.log('\n  A janela abre; faz login no site e deixa a janela aberta.');
    console.log('  O login fica guardado — nas próximas vezes já roda sozinho.\n');
    process.exit(1);
  }
  console.log('\n  Não consegui ler a lista. O retrato da página, para eu acertar o extrator:\n');
  console.log(JSON.stringify(resultado?.retrato ?? { nada: 'nenhuma fonte respondeu' }, null, 2));
  console.log('\n  Cola isto aqui e eu corrijo.\n');
  process.exit(1);
})().catch((e) => { console.error('\n  erro:', e.message, '\n'); process.exit(1); });
