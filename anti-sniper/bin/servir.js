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
 * ASSÍNCRONO, e não por elegância: o túnel do Cloudflare corta o pedido aos
 * ~100 segundos (erro 524), e uma leitura com janela visível leva minutos. A
 * primeira versão respondia só no fim, e apanhei o 524 na cara. Agora o pedido
 * ARRANCA a tarefa e devolve um número; eu volto buscar o resultado quando
 * estiver pronto. Cada chamada dura um piscar de olhos.
 *
 * ⚠️ O endereço fica PÚBLICO enquanto o túnel estiver aberto. Por isso leva um
 * segredo no caminho — sem ele, quem adivinhasse o endereço mandava a máquina
 * dele buscar o que quisesse. Gerado à primeira, guardado fora do repositório,
 * e comparado em tempo constante.
 */
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.env.DETETIVE_PORTA_SERVIR) || 8791;
const SEGREDO_EM = path.join(RAIZ, '.servir-segredo');
const ID = /^\d{17}$/;

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

const CHAVE = segredo();
const tarefas = new Map();
let proximo = 1;

/** Arranca uma leitura e devolve o número da tarefa, sem esperar por ela. */
function arrancar(id, op) {
  const numero = String(proximo++);
  const args = [path.join(__dirname, 'nomes.js'), id];
  if (op.ver) args.push('--ver');

  const t = { numero, id, estado: 'a correr', saida: '', comecou: Date.now() };
  tarefas.set(numero, t);

  const f = spawn(process.execPath, args, {
    cwd: RAIZ,
    env: {
      ...process.env,
      // Sem isto, cada chamada minha ia à rede ver se há versão nova e podia
      // reiniciar-se a meio.
      DETETIVE_SEM_ATUALIZAR: '1',
      DETETIVE_JA_ATUALIZEI: '1',
      // Quando eu já sei que o login não vem, não faz sentido esperar por ele.
      ...(op.semEspera ? { DETETIVE_ESPERA_LOGIN: '0' } : {}),
    },
  });
  f.stdout.on('data', (d) => { t.saida += d; });
  f.stderr.on('data', (d) => { t.saida += d; });
  const corta = setTimeout(() => f.kill('SIGKILL'), 15 * 60 * 1000);
  f.on('close', (codigo) => {
    clearTimeout(corta);
    t.estado = 'pronto';
    t.codigo = codigo;
    t.segundos = Math.round((Date.now() - t.comecou) / 1000);
    console.log(`  ← tarefa ${numero} pronta em ${t.segundos}s (código ${codigo})`);
  });
  f.on('error', (e) => { t.estado = 'pronto'; t.saida += `\nerro: ${e.message}\n`; });

  console.log(`  → tarefa ${numero}: ${id}${op.ver ? ' --ver' : ''}${op.semEspera ? ' (sem esperar login)' : ''}`);
  return t;
}

const servidor = http.createServer((req, res) => {
  const caminho = (req.url || '').split('?')[0];
  const query = new URLSearchParams((req.url || '').split('?')[1] || '');
  const [, chave, rota, alvo] = caminho.split('/');
  const texto = (n, t) => {
    res.writeHead(n, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(t);
  };

  // Tempo constante: sem isto, medir a demora da resposta deixa adivinhar o
  // segredo letra a letra.
  const certo = Boolean(chave) && chave.length === CHAVE.length
    && crypto.timingSafeEqual(Buffer.from(chave), Buffer.from(CHAVE));
  if (!certo) return texto(404, 'não\n');

  if (rota === 'vivo') return texto(200, 'sim\n');

  if (rota === 'nomes') {
    if (!ID.test(alvo || '')) return texto(400, 'uso: /<chave>/nomes/<steamid64>\n');
    const t = arrancar(alvo, {
      ver: query.get('ver') === '1',
      semEspera: query.get('semespera') === '1',
    });
    return texto(202, `tarefa ${t.numero}\nvolta em /${'<chave>'}/tarefa/${t.numero}\n`);
  }

  if (rota === 'tarefa') {
    const t = tarefas.get(alvo);
    if (!t) return texto(404, 'tarefa não existe\n');
    if (t.estado !== 'pronto') {
      return texto(200, `ainda a correr (${Math.round((Date.now() - t.comecou) / 1000)}s)\n`);
    }
    return texto(200, t.saida || '(sem saída)\n');
  }

  return texto(400, 'rotas: /vivo · /nomes/<steamid> · /tarefa/<numero>\n');
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  serviço em http://127.0.0.1:${PORTA}/${CHAVE}/`);
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
