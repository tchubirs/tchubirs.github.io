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

const PERFIL = process.env.DETETIVE_PERFIL
  || path.join(os.homedir(), '.detetive-navegador');
const SERVICO = process.env.DETETIVE_SERVICO || 'http://127.0.0.1:8790';
const JOGADOR = process.env.DETETIVE_JOGADOR;   // id do seu perfil no BattleMetrics
const CANAL = process.env.DETETIVE_CANAL;       // id do canal no serviço
const INTERVALO_MS = Number(process.env.DETETIVE_INTERVALO || 90) * 1000;

async function abrirNavegador() {
  const { chromium } = require('playwright');
  return chromium.launchPersistentContext(PERFIL, {
    headless: process.env.DETETIVE_VISIVEL !== '1',
    viewport: { width: 1280, height: 900 },
  });
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

async function umaRodada(ctx, aviso) {
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
  for (const [k, v] of Object.entries({ DETETIVE_JOGADOR: JOGADOR, DETETIVE_CANAL: CANAL })) {
    if (!v) { console.error(`falta a variável ${k}`); process.exit(2); }
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
module.exports = { umaRodada };
