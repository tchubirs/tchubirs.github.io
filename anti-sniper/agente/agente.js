#!/usr/bin/env node
'use strict';
/**
 * Agente local.
 *
 * Faz exatamente o que ele descreveu: olha o perfil dele no BattleMetrics,
 * vê em que servidor está AGORA, abre a página daquele servidor, lê a lista
 * de jogadores e manda para o serviço.
 *
 * Roda na máquina dele, com a sessão dele. Ele instala uma vez, faz login uma
 * vez, e nunca mais toca — da perspectiva dele é automático, e ninguém está
 * redistribuindo dado de terceiro: é a sessão dele lendo a tela dele.
 *
 * O perfil do navegador é PERSISTENTE de propósito. Sem isso, cada execução
 * abriria um navegador limpo, cairia no login, e o "instala e esquece"
 * viraria "faz login toda vez" — que é o manual que ele recusou.
 */

const path = require('node:path');
const os = require('node:os');
const { lerJogadores, lerServidorAtual } = require('./ler-pagina');
const { normalizarPlacar } = require('../src/stream/botrix-api');

const PERFIL = process.env.DETETIVE_PERFIL
  || path.join(os.homedir(), '.detetive-navegador');
const SERVICO = process.env.DETETIVE_SERVICO || 'http://127.0.0.1:8790';
const JOGADOR = process.env.DETETIVE_JOGADOR;   // id do seu perfil no BattleMetrics
const CANAL = process.env.DETETIVE_CANAL;       // id do canal no serviço
const INTERVALO_MS = Number(process.env.DETETIVE_INTERVALO || 90) * 1000;
// Painel de fidelidade da BotRix — a fonte de quem assiste CALADO na Kick.
// O webhook da Kick só entrega mensagem, e sniper não escreve no chat.
const FIDELIDADE = process.env.DETETIVE_FIDELIDADE;   // https://botrix.live/panel/loyalty

async function abrirNavegador() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch {
    // Erro de dependência tem que virar instrução, não pilha de chamadas.
    console.error('\n  Falta instalar o navegador. Rode uma vez:\n');
    console.error('    npm install\n    npx playwright install chromium\n');
    process.exit(3);
  }
  const op = {
    headless: process.env.DETETIVE_VISIVEL !== '1',
    viewport: { width: 1280, height: 900 },
  };
  // Se a máquina já tem um Chromium do Playwright, usa. Poupa 150 MB de
  // download para quem só quer ver a coisa funcionando.
  if (process.env.DETETIVE_CHROME) op.executablePath = process.env.DETETIVE_CHROME;
  return chromium.launchPersistentContext(PERFIL, op);
}

/** Roda o parser DENTRO da página e devolve o resultado já pronto. */
async function extrair(pagina, funcao) {
  return pagina.evaluate(new Function('doc', `
    const acharTabela = ${funcaoParaTexto('acharTabela')};
    const paraMinutos  = ${funcaoParaTexto('paraMinutos')};
    return (${funcao.toString()})(doc);
  `), null).catch(() => null);
}
function funcaoParaTexto(nome) {
  return require('./ler-pagina')[nome].toString();
}

/**
 * Lê a fidelidade e manda para o serviço.
 *
 * Manda a lista inteira; quem decide o que virou presença é o serviço, que
 * compara com a leitura anterior. O agente não guarda estado de propósito:
 * se ele reiniciar no meio da live, nada se perde.
 */
async function umaRodadaFidelidade(ctx, aviso) {
  if (!FIDELIDADE) return null;
  // ESCUTA o que a própria página pede, em vez de montar a requisição.
  //
  // O painel da BotRix guarda a plataforma escolhida na SESSÃO — não vai em
  // parâmetro nem em cabeçalho — e o interceptor deles ainda carimba
  // X-CSRF-TOKEN e X-SUBUSER-WORKSPACE. Montar a chamada à mão significaria
  // reproduzir tudo isso e quebrar quando qualquer peça mudar. Escutando, o
  // que chega é exatamente o que o painel dele mostra, da plataforma que
  // ele deixou selecionada.
  const p = await ctx.newPage();
  const capturado = [];
  p.on('response', async (r) => {
    if (!/\/api\/loyalty\/get/.test(r.url())) return;
    try { capturado.push(await r.json()); } catch { /* não era JSON */ }
  });

  try {
    await p.goto(FIDELIDADE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // A lista chega por requisição assíncrona depois que a tela monta.
    for (let i = 0; i < 20 && !capturado.length; i++) await p.waitForTimeout(500);

    let lista = capturado.length ? normalizarPlacar(capturado[capturado.length - 1]) : null;

    // Se a página não pediu (cache dela, ou tela diferente), pergunta direto
    // de dentro dela — assim os cookies e o CSRF do próprio site vão junto.
    if (!lista?.length) {
      const bruto = await p.evaluate(async () => {
        const r = await fetch('/api/loyalty/get', { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!r.ok) return { erro: `HTTP ${r.status}` };
        try { return { dados: await r.json() }; }
        catch { return { erro: 'resposta não era JSON — provavelmente a tela de login' }; }
      }).catch((e) => ({ erro: e.message }));
      if (bruto?.erro) { aviso(`fidelidade: ${bruto.erro} (rode com DETETIVE_VISIVEL=1 e faça login)`); return null; }
      lista = normalizarPlacar(bruto?.dados);
    }

    if (!lista?.length) {
      aviso('fidelidade veio vazia — na BotRix, deixe selecionada a plataforma que tem dado');
      return null;
    }

    const r = await fetch(`${SERVICO}/api/fidelidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canal: CANAL, pessoas: lista }),
    });
    if (!r.ok) throw new Error(`serviço respondeu ${r.status}`);
    return await r.json();
  } finally {
    await p.close().catch(() => {});
  }
}

async function umaRodada(ctx, aviso) {
  if (!JOGADOR) return null;
  const p = await ctx.newPage();
  try {
    await p.goto(`https://www.battlemetrics.com/players/${JOGADOR}`,
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);

    const atual = await extrair(p, lerServidorAtual);
    if (!atual) { aviso('você não está em nenhum servidor agora'); return null; }

    await p.goto(`https://www.battlemetrics.com/servers/${atual.jogo}/${atual.servidorId}`,
      { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);

    const jogadores = await extrair(p, lerJogadores);
    if (!jogadores?.length) { aviso(`sem lista em ${atual.nome} (pode estar censurada)`); return null; }

    const r = await fetch(`${SERVICO}/api/servidor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canal: CANAL, servidor: atual, jogadores }),
    });
    if (!r.ok) throw new Error(`serviço respondeu ${r.status}`);
    return { servidor: atual.nome, n: jogadores.length };
  } finally {
    await p.close().catch(() => {});
  }
}

async function main() {
  if (!CANAL) { console.error('falta a variável DETETIVE_CANAL'); process.exit(2); }
  // As duas leituras são independentes: dá para ter só a fidelidade (quem
  // assiste calado) sem o BattleMetrics, ou o contrário. Exigir as duas
  // travaria quem só quer começar por uma.
  if (!JOGADOR && !FIDELIDADE) {
    console.error('nada a fazer: defina DETETIVE_JOGADOR e/ou DETETIVE_FIDELIDADE');
    process.exit(2);
  }
  const ctx = await abrirNavegador();
  const aviso = (m) => console.log(`  · ${m}`);
  console.log(`agente rodando · perfil em ${PERFIL} · a cada ${INTERVALO_MS / 1000}s\n`);
  console.log('Se pedir login, rode uma vez com DETETIVE_VISIVEL=1 e entre na sua conta.');
  console.log('A sessão fica salva e não pede de novo.\n');

  for (;;) {
    try {
      const r = await umaRodada(ctx, aviso);
      if (r) console.log(`  ✓ ${r.n} jogadores em "${r.servidor}"`);
      const f = await umaRodadaFidelidade(ctx, aviso);
      if (f) {
        console.log(f.base
          ? `  ✓ fidelidade: ${f.total} pessoas (primeira leitura, base)`
          : `  ✓ fidelidade: ${f.vistos} assistindo agora, de ${f.total}`);
      }
    } catch (e) {
      // Nunca derruba o agente: rede cai, Cloudflare implica, o site muda.
      // Parar por um erro significa o streamer descobrir de madrugada que
      // não estava protegido desde a tarde.
      aviso(`erro: ${e.message.slice(0, 90)}`);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { umaRodada, umaRodadaFidelidade };
