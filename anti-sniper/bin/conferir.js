#!/usr/bin/env node
'use strict';
/**
 * "Como faço teste pra ver se tá bom?"
 *
 *   npm run conferir
 *
 * Roda o caminho inteiro contra os dados REAIS do canal dele e diz, em
 * português, o que funciona e o que está cego. Não é `npm test` — aquilo
 * prova que o código faz o que eu escrevi. Isto prova que o produto
 * responde a pergunta dele, hoje, com a internet e as contas de verdade.
 *
 * Cada linha é uma pergunta que, respondida errada, quebra o produto.
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { placarPublico } = require('../src/stream/botrix-api');
const { historicoDeNomes, resolverEntrada } = require('../src/steam');
const { Indice } = require('../src/indice');
const { criar } = require('../servico/servidor');

const CONFIG = path.join(__dirname, '..', 'detetive.config.json');
const cfg = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {};
const CANAL = process.argv[2] || cfg.canal || 'tchubi';
const PLATAFORMA = process.argv[3] || cfg.fontes?.[0]?.plataforma || 'kick';

const linhas = [];
const ok = (t, d) => { linhas.push({ s: 'ok', t, d }); console.log(`  ✓ ${t}${d ? `\n      ${d}` : ''}`); };
const cego = (t, d) => { linhas.push({ s: 'cego', t, d }); console.log(`  ○ ${t}${d ? `\n      ${d}` : ''}`); };
const mau = (t, d) => { linhas.push({ s: 'mau', t, d }); console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); };

async function main() {
  console.log(`\n  Conferindo o canal "${CANAL}" em ${PLATAFORMA}\n`);

  // ── 1. A fonte que enxerga quem NÃO fala ────────────────────────────
  let audiencia = [];
  try {
    audiencia = await placarPublico(CANAL, PLATAFORMA);
    if (audiencia.length) {
      const comTempo = audiencia.filter((x) => x.minutosAssistidos > 0);
      ok(`BotRix responde: ${audiencia.length} pessoas, ${comTempo.length} com tempo assistido`,
        `mais assistiu: ${comTempo[0]?.nome} (${comTempo[0]?.minutosAssistidos} min)`);
    } else {
      cego('BotRix responde, mas a lista veio VAZIA',
        'a fidelidade dessa plataforma não tem dado. Quem assiste calado fica invisível.');
    }
  } catch (e) {
    if (e.naoExiste) cego(`BotRix não tem "${CANAL}" em ${PLATAFORMA}`, 'confira o nome, ou troque a plataforma');
    else mau('BotRix não respondeu', e.message);
  }

  // ── 2. Histórico de nomes da Steam ──────────────────────────────────
  try {
    // Conta pública e antiga, para provar o caminho sem depender da dele.
    const h = await historicoDeNomes('76561197960435530');
    if (h.nomes.length > 1) ok(`Steam entrega histórico de nomes: ${h.nomes.length} nomes numa conta de teste`,
      h.nomes.slice(0, 4).join(' · '));
    else cego('Steam respondeu, mas sem histórico nessa conta', 'o caminho existe; essa conta é que não trocou de nome');
  } catch (e) { mau('Steam não respondeu', e.message); }

  try {
    const id = await resolverEntrada('https://steamcommunity.com/id/gabelogannewell');
    if (id) ok('Link de perfil vira SteamID', `resolveu para ${id}`);
    else mau('Não consegui resolver um link de perfil da Steam');
  } catch (e) { mau('Erro resolvendo link da Steam', e.message); }

  // ── 3. O cruzamento, com os nomes REAIS da audiência dele ───────────
  if (audiencia.length) {
    const idx = new Indice(audiencia);
    const alvo = audiencia.find((x) => x.minutosAssistidos > 0) || audiencia[0];
    // Disfarça o nome como um sniper faria: leet, maiúsculas e tag de clã.
    const disfarcado = `[BR] ${alvo.nome.toUpperCase().replace(/I/g, '1').replace(/O/g, '0')}`;
    const achou = idx.procurar(disfarcado);
    if (achou && achou.entrada.nome === alvo.nome) {
      ok('O cruzamento acha alguém disfarçado',
        `"${disfarcado}" → ${achou.entrada.nome} (${Math.round(achou.confianca * 100)}%, ${achou.motivo})`);
    } else {
      mau('O cruzamento NÃO achou um disfarce simples', `tentei "${disfarcado}"`);
    }
    const inventou = idx.procurar('zzqqxx_nao_existe_9911');
    if (inventou) mau('O cruzamento INVENTOU um casamento', `achou ${inventou.entrada.nome} para um nome falso`);
    else ok('Não inventa casamento para quem não está na audiência');
  }

  // ── 4. Gravar e responder ───────────────────────────────────────────
  const banco = path.join(os.tmpdir(), `conferir-${process.pid}.db`);
  try {
    const t = Date.now();
    const s = criar({ caminhoBanco: banco, chavePem: 'x', agora: () => t });
    s.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em,fuso) VALUES (?,?,?,?,?)')
      .run(CANAL, PLATAFORMA, CANAL, t, cfg.fuso || 'UTC');

    // Duas leituras da fidelidade: a segunda com 10 min a mais para dois.
    const antes = audiencia.length ? audiencia : [{ nome: 'teste_um', minutosAssistidos: 100 }, { nome: 'teste_dois', minutosAssistidos: 50 }];
    s.receberFidelidade(CANAL, antes, t - 10 * 60000);
    const r = s.receberFidelidade(CANAL, antes.map((x, i) => (i < 2
      ? { ...x, minutosAssistidos: (x.minutosAssistidos || 0) + 10 } : x)), t);

    if (r.vistos === 2) ok('Grava presença de quem SUBIU o tempo assistido', `${r.vistos} de ${r.total}, sem ninguém falar nada`);
    else mau('A gravação de presença não creditou o esperado', JSON.stringify(r));

    const primeiro = antes[0].nome;
    const log = s.log(CANAL, primeiro);
    if (log.total === 1 && log.linhas[0].fonte === 'tempo') {
      ok('O log mostra entrada e saída, marcado como "calado"',
        `${primeiro}: 1 intervalo, fonte "${log.linhas[0].fonte}"`);
    } else mau('O log não saiu como esperado', JSON.stringify(log.linhas[0] || {}));

    const m = s.momento(CANAL, 'live', primeiro, t);
    if (m.estado === 'sim') ok('Responde "estava na live NAQUELE minuto?"', `${primeiro} às ${new Date(t).toLocaleTimeString('pt-BR')}: SIM`);
    else mau('Não respondeu o momento', JSON.stringify(m));

    const limpo = s.momento(CANAL, 'live', 'ninguem_assim_9911', t);
    if (limpo.estado === 'sem-registro') ok('Quem não tem registro fica "sem-registro", nunca "não estava"');
    else mau('Estado errado para quem não tem registro', limpo.estado);

    // A resposta nunca pode acusar.
    const d = require('../servico/discord');
    const texto = d.formatar(s.consultar(CANAL, primeiro, { quando: t }), cfg.fuso || 'UTC').content;
    if (!/sniper|culpad|banir|hacker/i.test(texto)) ok('A resposta mostra presença, nunca acusa');
    else mau('A resposta contém acusação', texto.slice(0, 80));

    s.db.close?.();
  } catch (e) {
    mau('Falhou gravando/consultando', e.message);
  } finally {
    for (const f of [banco, banco + '-wal', banco + '-shm']) fs.rmSync(f, { force: true });
  }

  // ── 5. A fonte AO SEGUNDO ───────────────────────────────────────────
  //
  // A mais importante e a que faltava aqui. Não dá para assinar o canal sem
  // o login dele, mas dá para medir as duas coisas que decidem se o caminho
  // existe — e medir é melhor que supor.
  try {
    const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(CANAL)}`,
      { headers: { Accept: 'application/json' } });
    const j = r.ok ? await r.json() : null;
    const sala = j?.chatroom?.id;
    if (!sala) {
      mau('Não achei a sala de chat da Kick', `kick.com/api/v2/channels/${CANAL} respondeu ${r.status}`);
    } else {
      // 401 aqui é a resposta CERTA: quer dizer que a rota autoriza com
      // sessão válida. 404 ou 200 sem credencial seriam a notícia ruim.
      const a = await fetch('https://kick.com/broadcasting/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ socket_id: '0.0', channel_name: `presence-chatroom.${sala}` }),
      });
      if (a.status === 401 || a.status === 403) {
        ok(`Canal de presença existe (sala ${sala})`,
          `a Kick pede login (${a.status}) — é a resposta certa. Rode \`npm run presenca\` logado.`);
      } else {
        cego(`Autorização da presença respondeu ${a.status}`,
          'esperado 401 sem login. Se mudou, o caminho ao segundo precisa ser remedido.');
      }
    }
  } catch (e) {
    mau('Não deu para checar a presença da Kick', e.message);
  }

  // O caminho de dentro: evento → intervalo → log. Sintético de propósito,
  // porque o que se prova aqui é que o SEGUNDO sobrevive até a resposta.
  {
    const banco2 = path.join(os.tmpdir(), `conferir-p-${process.pid}.db`);
    try {
      const T = Date.now();
      const s2 = criar({ caminhoBanco: banco2, agora: () => T });
      s2.db.prepare('INSERT INTO canal (id,plataforma,slug,criado_em) VALUES (?,?,?,?)')
        .run('x', PLATAFORMA, CANAL, T);
      s2.receberPresenca('x', [
        { tipo: 'entrou', em: T - 9 * 60000, id: '1', nome: 'TESTE-PRESENCA' },
        { tipo: 'saiu', em: T - 4 * 60000 - 38000, id: '1', nome: 'TESTE-PRESENCA' },
      ]);
      const l = s2.log('x', 'TESTE-PRESENCA');
      if (l.segundosNaLive === 262 && l.exatoNaLive) {
        ok('O segundo sobrevive do evento até o log',
          `visita de 4min22s registrada como ${l.segundosNaLive}s — não arredondada para o bloco de 10 min`);
      } else {
        mau('O segundo se perdeu no caminho',
          `esperado 262s exatos, veio ${l.segundosNaLive}s (exato=${l.exatoNaLive})`);
      }
      s2.db.close();
    } catch (e) {
      mau('O caminho da presença quebrou', e.message);
    } finally {
      for (const f of [banco2, banco2 + '-wal', banco2 + '-shm']) fs.rmSync(f, { force: true });
    }
  }

  // ── 6. O que continua cego ──────────────────────────────────────────
  if (!cfg.battlemetricsJogador) {
    cego('Sem battlemetricsJogador no config',
      'não dá para saber quem está NO SERVIDOR agora — só quem está na live');
  } else {
    ok(`BattleMetrics configurado (jogador ${cfg.battlemetricsJogador})`,
      'o agente lê pela sua sessão; rode `npm start` para valer');
  }
  cego('Quem assiste DESLOGADO', 'nenhuma fonte vê essa pessoa. Não existe jeito.');

  // ── Veredito ────────────────────────────────────────────────────────
  const maus = linhas.filter((x) => x.s === 'mau').length;
  const cegos = linhas.filter((x) => x.s === 'cego').length;
  console.log('\n  ' + '─'.repeat(60));
  if (maus === 0) {
    console.log(`  ESTÁ BOM. ${linhas.length - maus - cegos} checagens passaram, ${cegos} pontos cegos conhecidos.`);
    console.log('  Os pontos cegos estão marcados com ○ acima e escritos no painel.');
  } else {
    console.log(`  ${maus} coisa(s) QUEBRADA(S) — marcadas com ✗ acima.`);
  }
  console.log('  ' + '─'.repeat(60) + '\n');
  process.exit(maus ? 1 : 0);
}

main().catch((e) => { console.error('\n  erro inesperado:', e.message, '\n'); process.exit(2); });
