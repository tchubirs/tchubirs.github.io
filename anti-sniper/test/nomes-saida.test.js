'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Este ficheiro existe por causa de um erro que chegou à máquina dele:
//
//     erro: Cannot access 'completa' before initialization
//
// Eu tinha declarado uma variável ABAIXO do sítio onde a usava. Erro de
// estreante — e passou por 392 testes sem um arranhão, porque NENHUM deles
// chegava a correr a parte da saída. Toda a suite testava as peças; nada
// testava o programa.
//
// Isto corre a CLI a sério, contra uma página local, e olha para o que sai.
// É lento (abre um navegador) e vale a pena: a alternativa foi ele descobrir.

const CLI = path.resolve(__dirname, '..', 'bin', 'nomes.js');
const PORTA = 8788;

/** A página do steamid.uk logado, com MENOS nomes do que ela própria anuncia. */
function paginaIncompleta() {
  const badge = (n, d) => `<span class="namehistory-name-badge"><a href="#">${n}</a>`
    + `<br><small>${d ? `(seen) ${d}` : ''}</small></span>`;
  const ano = (a, q) => `<div class="row"><strong><span class="badge">${a}</span></strong>`
    + `<strong><span class="badge">${q}</span></strong></div>`;
  // Diz 60 no cabeçalho do ano e entrega 6: é assim que se força o caminho
  // "lista incompleta", que é justamente o que rebentou.
  return `<!doctype html><html><head><meta charset="utf-8"><title>SteamID.uk</title></head>
    <body><h2>Previous Persona Names</h2><div class="namehistory-names">
      ${ano(2026, 30)}
      ${badge('Capitao', 'Wed, 05 Aug 2026')}
      ${badge('C4pitaoTV', 'Mon, 14 Jul 2026')}
      ${badge('[YT] Capitao', 'Sat, 02 Jul 2026')}
      ${ano(2025, 30)}
      ${badge('Melancia', 'Sun, 06 Dec 2025')}
      ${badge('Owl', 'Fri, 22 May 2025')}
      ${badge('Milk', 'Thu, 29 Jan 2025')}
    </div></body></html>`;
}

// ASSÍNCRONO de propósito, e a razão merece ficar escrita: a primeira versão
// disto usava `spawnSync` com o servidor a viver neste mesmo processo. O
// `spawnSync` bloqueia o laço de eventos do Node — ou seja, o servidor nunca
// chegava a atender, o navegador esperava 60 segundos e o teste falhava a
// dizer que faltava um aviso na saída. O teste tinha-se a si próprio como
// defeito, e a mensagem apontava para o outro lado.
/** A página como ela é para visitante: anuncia o total e esconde a lista. */
function paginaEscondida() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>SteamID.uk</title></head>
    <body><h2>Previous Persona Names</h2><p>344 persona's. Results limited.</p>
    <div><span>Gat..</span><span>Pl..</span></div></body></html>`;
}

/** Há como abrir uma janela de verdade aqui? (no Windows dele, há sempre) */
const temEcra = (() => {
  if (process.platform === 'win32' || process.env.DISPLAY) return true;
  const r = spawnSync('which', ['xvfb-run'], { encoding: 'utf8' });
  return r.status === 0;
})();

async function correrContra(html, args, extraEnv = {}) {
  const servidor = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((ok) => servidor.listen(PORTA, '127.0.0.1', ok));
  const saida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nomes-saida-')), 'perfil');
  try {
    return await new Promise((ok) => {
      // `--ver` obriga a uma janela verdadeira. Fora do Windows isso quer
      // dizer xvfb — e é o único jeito de os testes passarem pelo caminho que
      // só existe atrás dessa bandeira.
      const comEcra = args.includes('--ver') && process.platform !== 'win32' && !process.env.DISPLAY;
      const cmd = comEcra ? 'xvfb-run' : process.execPath;
      const arg0 = comEcra ? ['-a', process.execPath, CLI, ...args] : [CLI, ...args];
      const f = spawn(cmd, arg0, {
        env: {
          ...process.env,
          DETETIVE_NOMES_URL: `http://127.0.0.1:${PORTA}/{id}`,
          DETETIVE_PERFIL_NOMES: saida,
          DETETIVE_SEM_ATUALIZAR: '1',
          DETETIVE_ESPERA_LOGIN: '4',
          ...extraEnv,
        },
      });
      let tudo = '';
      f.stdout.on('data', (d) => { tudo += d; });
      f.stderr.on('data', (d) => { tudo += d; });
      const corta = setTimeout(() => f.kill('SIGKILL'), 120000);
      f.on('close', (status) => { clearTimeout(corta); ok({ tudo, status }); });
    });
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

const temNavegador = (() => {
  try { require('playwright'); return true; } catch { return false; }
})();

test('a saída inteira corre sem rebentar, com a lista incompleta', { skip: !temNavegador && 'sem playwright' }, async () => {
  const { tudo } = await correrContra(paginaIncompleta(), ['76561198155380495']);

  // O que este teste existe para apanhar, antes de tudo o resto:
  assert.doesNotMatch(tudo, /Cannot access|is not defined|is not a function/,
    `a CLI rebentou:\n${tudo.slice(-600)}`);
  assert.doesNotMatch(tudo, /^\s*erro:/m, `saiu com erro:\n${tudo.slice(-600)}`);

  // E o caminho que rebentou tem de ser mesmo o que correu:
  assert.match(tudo, /INCOMPLETA/, 'a página anuncia 60 e entrega 6 — tem de avisar');
  assert.match(tudo, /a raiz que se repete/);
  assert.match(tudo, /Capitao/);
  assert.match(tudo, /gravado em/, 'e tem de chegar ao fim, a gravar');
});

test('sem alvo, sai a explicar em vez de rebentar', () => {
  const r = spawnSync(process.execPath, [CLI], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, DETETIVE_SEM_ATUALIZAR: '1' },
  });
  assert.equal(r.status, 2);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /Cannot access|is not defined/);
});

// O `daApi is not defined` que rebentou na máquina dele estava atrás de um
// `VISIVEL &&`. Nenhum teste levantava essa bandeira, por isso o erro passou
// por 400 testes e foi ele que o encontrou. Um erro escondido atrás de uma
// bandeira que os testes não levantam é um erro que só o utilizador vê.
test('o caminho do --ver também corre inteiro', { skip: !temNavegador ? 'sem playwright' : !temEcra && 'sem ecrã nem xvfb' }, async () => {
  const { tudo } = await correrContra(paginaEscondida(), ['76561198155380495', '--ver']);
  assert.doesNotMatch(tudo, /is not defined|Cannot access|is not a function/,
    `a CLI rebentou no caminho do --ver:\n${tudo.slice(-700)}`);
  assert.doesNotMatch(tudo, /^\s*erro:/m, tudo.slice(-700));
  // E tem mesmo de ter passado pela pausa do login, senão não provou nada.
  assert.match(tudo, /escond|Cloudflare/i, 'não chegou ao caminho que interessa');
});

// `/history/0/` e `/history/100/` são PEDAÇOS da mesma lista, não vistas
// alternativas dela. Ficar com a maior — que era o que o comando fazia —
// deitava metade fora, e sem erro nenhum.
test('junta os pedaços de uma fonte, em vez de ficar com o maior', { skip: !temNavegador && 'sem playwright' }, async () => {
  const linhas = (nomes) => nomes.map((n, i) => `<tr><td>${n}</td><td>0${(i % 9) + 1}/05/2024, 01:00:00</td></tr>`).join('');
  const pagina = (nomes) => `<!doctype html><html><body><h2>Historic Persona for X (999) (40)</h2>`
    + `<table><tbody>${linhas(nomes)}</tbody></table></body></html>`;
  const A = Array.from({ length: 20 }, (_, i) => `primeiro${i}`);
  const B = Array.from({ length: 20 }, (_, i) => `segundo${i}`);

  const servidor = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pagina(req.url.includes('/b/') ? B : A));
  });
  await new Promise((ok) => servidor.listen(PORTA + 1, '127.0.0.1', ok));
  const perfil = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pedacos-')), 'p');
  try {
    const { tudo } = await new Promise((ok) => {
      const f = spawn(process.execPath, [CLI, '76561198155380495'], {
        env: {
          ...process.env,
          DETETIVE_NOMES_URL: `http://127.0.0.1:${PORTA + 1}/a/{id},http://127.0.0.1:${PORTA + 1}/b/{id}`,
          DETETIVE_PERFIL_NOMES: perfil,
          DETETIVE_SEM_ATUALIZAR: '1',
        },
      });
      let t = '';
      f.stdout.on('data', (d) => { t += d; });
      f.stderr.on('data', (d) => { t += d; });
      const corta = setTimeout(() => f.kill('SIGKILL'), 120000);
      f.on('close', () => { clearTimeout(corta); ok({ tudo: t }); });
    });
    assert.match(tudo, /✓ 40 nomes/, `esperava 20+20 juntos:\n${tudo.slice(-500)}`);
    assert.match(tudo, /primeiro0/);
    assert.match(tudo, /segundo0/, 'o segundo pedaço tem de estar lá');
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
});
