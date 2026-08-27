#!/usr/bin/env node
'use strict';
/**
 * Autoriza o app na Kick.
 *
 *   node bin/autorizar.js
 *
 * O Client Secret NUNCA é passado por linha de comando nem por mensagem:
 * argumento de terminal fica no histórico do shell e aparece para qualquer
 * processo que liste os processos da máquina. Ele é lido de um arquivo com
 * permissão restrita, e só existe na máquina do dono.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { gerarPkce, urlDeAutorizacao, trocarCodigoPorToken, ESCOPOS } = require('../src/stream/kick');

const ARQ_SEGREDO = path.join(process.cwd(), '.kick-secret');
const ARQ_TOKEN = path.join(process.cwd(), '.kick-token.json');
const CLIENT_ID = process.env.KICK_CLIENT_ID || '01M11R27VR9QWKFC3JPQ36W5TX';
const REDIRECT = 'https://tchubirs.github.io/detetive/callback';

function lerSegredo() {
  if (!fs.existsSync(ARQ_SEGREDO)) {
    console.error(`\nFalta o arquivo com o Client Secret.\n`);
    console.error(`  1. Regenere o Secret em https://kick.com/settings/developer`);
    console.error(`  2. Salve APENAS o Secret em:  ${ARQ_SEGREDO}`);
    console.error(`  3. Proteja o arquivo:  chmod 600 ${ARQ_SEGREDO}\n`);
    console.error(`Nunca cole o Secret numa conversa, num commit ou num comando.\n`);
    process.exit(2);
  }
  const st = fs.statSync(ARQ_SEGREDO);
  // 0o077 = qualquer permissão para grupo ou outros
  if (st.mode & 0o077) {
    console.error(`\n⚠️  ${ARQ_SEGREDO} está legível por outros usuários da máquina.`);
    console.error(`   Rode:  chmod 600 ${ARQ_SEGREDO}\n`);
    process.exit(2);
  }
  const s = fs.readFileSync(ARQ_SEGREDO, 'utf8').trim();
  if (!s) { console.error('arquivo do Secret está vazio'); process.exit(2); }
  return s;
}

async function main() {
  const segredo = lerSegredo();
  const { verificador, desafio } = gerarPkce();
  const estado = require('node:crypto').randomBytes(16).toString('hex');

  console.log('\nEscopos pedidos:', ESCOPOS.join(', '));
  console.log('\n1) Abra este endereço no navegador e autorize:\n');
  console.log(urlDeAutorizacao({ clientId: CLIENT_ID, redirectUri: REDIRECT, desafio, estado }));
  console.log('\n2) A página vai mostrar um código. Cole aqui.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const codigo = (await rl.question('código: ')).trim();
  const estadoVolta = (await rl.question(`estado (deve ser ${estado}): `)).trim();
  rl.close();

  // Conferir o estado é o que impede alguém de te empurrar um código de
  // outra autorização. Sem esta checagem o PKCE protege menos do que parece.
  if (estadoVolta && estadoVolta !== estado) {
    console.error('\n❌ estado não confere — descarte este código e comece de novo.\n');
    process.exit(1);
  }
  if (!codigo) { console.error('sem código'); process.exit(1); }

  const t = await trocarCodigoPorToken({
    clientId: CLIENT_ID, clientSecret: segredo, redirectUri: REDIRECT, codigo, verificador,
  });

  fs.writeFileSync(ARQ_TOKEN, JSON.stringify({
    obtido_em: new Date().toISOString(),
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expira_em_s: t.expires_in,
    escopos: t.scope,
  }, null, 2), { mode: 0o600 });

  console.log(`\n✅ autorizado. token salvo em ${ARQ_TOKEN} (só você consegue ler)\n`);
}

main().catch((e) => { console.error('erro:', e.message); process.exit(1); });
