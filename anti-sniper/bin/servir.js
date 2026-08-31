#!/usr/bin/env node
'use strict';
/**
 * O detetive de nomes, acessível de fora — para eu poder correr sem ele.
 *
 *     npm run servir
 *
 * Ele perguntou o que falta para eu usar os comandos sozinho. Medido hoje,
 * deste contentor: `curl` leva 403 do Cloudflare nos dois sites, e o navegador
 * nem chega a ligar (`ERR_CONNECTION_RESET`, oito túneis cortados a meio). O
 * que falta não é código — é a rede e o IP dele. E a sessão dele.
 *
 * Então o programa corre onde tem de correr: na máquina dele. Isto abre uma
 * porta, põe um túnel à frente, e imprime um endereço que eu consigo chamar
 * daqui. O trabalho acontece com o IP dele e o login dele; eu só peço.
 *
 * O que ele faz: um comando, uma vez. O resto é meu.
 *
 * ⚠️ O endereço fica PÚBLICO enquanto o túnel estiver aberto. Por isso leva um
 * segredo no caminho — sem ele, quem adivinhasse o endereço mandava a máquina
 * dele buscar o que quisesse. O segredo é gerado à primeira e guardado fora do
 * repositório.
 */
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.env.DETETIVE_PORTA_SERVIR) || 8791;
const SEGREDO_EM = path.join(RAIZ, '.servir-segredo');

/** Um segredo por máquina, guardado. Não anda no repositório. */
function segredo() {
  try {
    const s = fs.readFileSync(SEGREDO_EM, 'utf8').trim();
    if (s.length >= 16) return s;
  } catch { /* ainda não existe */ }
  const s = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(SEGREDO_EM, `${s}\n`, { mode: 0o600 });
  return s;
}

/** Corre o comando dos nomes e devolve o que ele escreveu. */
function lerNomes(id, comVer) {
  return new Promise((ok) => {
    const args = [path.join(__dirname, 'nomes.js'), id];
    if (comVer) args.push('--ver');
    const f = spawn(process.execPath, args, {
      cwd: RAIZ,
      // Sem isto, cada chamada minha ia à rede ver se há versão nova e podia
      // reiniciar-se a meio de um pedido HTTP.
      env: { ...process.env, DETETIVE_SEM_ATUALIZAR: '1', DETETIVE_JA_ATUALIZEI: '1' },
    });
    let saida = '';
    f.stdout.on('data', (d) => { saida += d; });
    f.stderr.on('data', (d) => { saida += d; });
    const corta = setTimeout(() => f.kill('SIGKILL'), 10 * 60 * 1000);
    f.on('close', (codigo) => { clearTimeout(corta); ok({ saida, codigo }); });
  });
}

const CHAVE = segredo();
const ID = /^\d{17}$/;

const servidor = http.createServer(async (req, res) => {
  const [, chave, rota, alvo] = (req.url || '').split('?')[0].split('/');
  const responder = (n, t) => {
    res.writeHead(n, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(t);
  };

  // Comparação de tempo constante: sem isto, medir quanto demora a resposta
  // deixa adivinhar o segredo letra a letra.
  const certo = Boolean(chave) && chave.length === CHAVE.length
    && crypto.timingSafeEqual(Buffer.from(chave), Buffer.from(CHAVE));
  if (!certo) return responder(404, 'não\n');

  if (rota === 'vivo') return responder(200, 'sim\n');
  if (rota !== 'nomes' || !ID.test(alvo || '')) {
    return responder(400, 'uso: /<chave>/nomes/<steamid64>\n');
  }

  console.log(`  → pedido: ${alvo}`);
  const { saida, codigo } = await lerNomes(alvo, (req.url || '').includes('ver=1'));
  console.log(`  ← respondi (${codigo === 0 ? 'ok' : `código ${codigo}`})`);
  return responder(200, saida);
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  serviço em http://127.0.0.1:${PORTA}/${CHAVE}/nomes/<steamid>`);
  abrirTunel();
});

/** O túnel. Sem conta, sem instalação: um ficheiro só. */
function abrirTunel() {
  const exe = process.platform === 'win32'
    ? path.join(RAIZ, 'cloudflared.exe')
    : 'cloudflared';
  const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/'
    + 'cloudflared-windows-amd64.exe';

  if (process.platform === 'win32' && !fs.existsSync(exe)) {
    console.log('  ⇣ a trazer o cloudflared (uma vez, ~50 MB)…');
    const r = spawnSync('curl.exe', ['-L', '--fail', '-o', exe, url], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.log('\n  ✗ não consegui trazer o cloudflared.');
      console.log(`    Descarrega à mão e põe em ${exe}:\n    ${url}\n`);
      return;
    }
  }

  const t = spawn(exe, ['tunnel', '--url', `http://127.0.0.1:${PORTA}`]);
  let mostrado = false;
  const olhar = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !mostrado) {
      mostrado = true;
      console.log(`\n${'═'.repeat(64)}`);
      console.log('  COLA ISTO NA CONVERSA (a linha inteira):\n');
      console.log(`  ${m[0]}/${CHAVE}\n`);
      console.log('═'.repeat(64));
      console.log('\n  Deixa esta janela aberta. Fecha-a quando quiseres desligar.\n');
    }
  };
  t.stdout.on('data', olhar);
  t.stderr.on('data', olhar);
  t.on('error', () => {
    console.log('\n  ✗ o cloudflared não arrancou. O serviço local continua de pé.\n');
  });
}
