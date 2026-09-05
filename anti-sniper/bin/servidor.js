#!/usr/bin/env node
'use strict';
/**
 * Quem entra no servidor logo a seguir a ti.
 *
 *   npm run servidor -- --ip 1.2.3.4:28015 --alvo Lauta
 *   npm run servidor -- --ver --alvo Lauta --equipa "cTapp,Tia Paola"
 *
 * "Com a API do BattleMetrics não dá para ver servidor dos outros, tem que
 *  acessar de forma normal igual player."
 *
 * Tem razão, e há uma maneira melhor do que a página: o próprio protocolo do
 * jogo. O `A2S_PLAYER` é o que o navegador de servidores do Rust usa, devolve
 * a lista de nomes de quem está lá dentro, e não pede token, nem subscrição,
 * nem cooperação de ninguém. É "de forma normal igual player" à letra.
 *
 * Duas coisas que é preciso saber antes de contar com isto:
 *
 *   - A Facepunch tem `server.censorplayerlist`. Por omissão vem desligada e
 *     os nomes chegam, mas cada dono pode ligá-la. Quando a lista vem vazia
 *     isto diz "censurada ou vazia" — nunca "não está lá ninguém".
 *   - É UDP. Uma rede que só deixa passar HTTPS não serve, e é por isso que
 *     isto corre na máquina dele e não numa nuvem.
 *
 * O IP e a porta saem da página do servidor no BattleMetrics, ou do F1 do
 * jogo (`client.connect` mostra onde estás ligado). Com `--bm <id>` nem isso:
 * a página abre-se aqui como um browser normal e o endereço sai de lá.
 */

const fs = require('node:fs');
const path = require('node:path');
const { consultarEsperto } = require('../src/jogo/rust-a2s');
const { seguidores } = require('../src/seguidores');
const { enderecoDaPagina } = require('../src/endereco');

const PASTA = path.join(__dirname, '..', 'dados');

const arg = (nome, omissao = null) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : omissao;
};
const tem = (nome) => process.argv.includes(`--${nome}`);

const alvo = arg('alvo');
const equipa = (arg('equipa') || '').split(',').map((s) => s.trim()).filter(Boolean);
const janelaMin = Number(arg('janela', '10'));

function ficheiro(host, porta) {
  return path.join(PASTA, `servidor-${host.replace(/[^\d.]/g, '_')}-${porta}.json`);
}

function ler(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; }
}

const relogio = (ms) => new Date(ms).toISOString().slice(11, 19);

function mostrar(fotos) {
  if (!fotos.length) return console.log('ainda não há fotografias nenhumas.');
  const de = new Date(fotos[0].ms).toISOString().slice(0, 16).replace('T', ' ');
  const ate = new Date(fotos.at(-1).ms).toISOString().slice(0, 16).replace('T', ' ');
  const horas = ((fotos.at(-1).ms - fotos[0].ms) / 3600000).toFixed(1);
  console.log(`${fotos.length} fotografias, de ${de} a ${ate} (${horas} h)\n`);

  if (!alvo) {
    const todos = new Set();
    for (const f of fotos) for (const n of f.nomes) todos.add(n);
    console.log(`${todos.size} nomes diferentes vistos. Diz --alvo <nome> para comparar.`);
    return;
  }

  const r = seguidores(fotos, alvo, { janelaMin, ignorar: equipa });
  if (!r.length) {
    console.log(`Ninguém entrou nos ${janelaMin} min a seguir a "${alvo}".`);
    console.log('Se o nome estiver mal escrito não há nada a comparar — confere com --ver sem --alvo.');
    return;
  }
  console.log(`Quem entrou até ${janelaMin} min depois de "${alvo}":\n`);
  console.log('  vezes  de/em   atraso   nome');
  for (const s of r.slice(0, 25)) {
    console.log(`  ${String(s.vezes).padStart(5)}  ${String(s.vezes)}/${String(s.entradas).padEnd(4)}`
      + `  ${String(s.atrasoMedianoS).padStart(5)}s   ${s.nome}`);
  }
  console.log('\n  "de/em" é quantas das entradas DELE foram a seguir às tuas.');
  console.log('  Cinco de cinco é uma coisa; cinco de cinquenta é outra, e o número é o mesmo.');
  console.log('  Isto conta vezes. Não diz que alguém é sniper — quem decide és tu.');
}

async function gravar(ip) {
  const [host, portaTexto] = ip.split(':');
  const porta = Number(portaTexto || 28015);
  if (!host) { console.error('o --ip tem de ser assim: 1.2.3.4:28015'); process.exit(2); }
  const intervalo = Number(arg('intervalo', '30')) * 1000;
  const minutos = Number(arg('minutos', '0'));
  const fim = minutos ? Date.now() + minutos * 60000 : Infinity;

  fs.mkdirSync(PASTA, { recursive: true });
  const f = ficheiro(host, porta);
  const fotos = ler(f);
  console.log(`a ouvir ${host}:${porta} de ${intervalo / 1000} em ${intervalo / 1000} s`);
  console.log(`${fotos.length} fotografias já gravadas em ${path.basename(f)}`);
  console.log('Ctrl+C para parar. O que estiver gravado fica.\n');

  let antes = new Set(fotos.at(-1)?.nomes || []);
  while (Date.now() < fim) {
    // eslint-disable-next-line no-await-in-loop
    const r = await consultarEsperto(host, porta);
    const agora = Date.now();
    if (!r) {
      console.log(`${relogio(agora)}  sem resposta`);
    } else if (!r.jogadores?.length) {
      // Lista vazia num servidor com gente lá dentro é censura, e dizê-lo é
      // mais útil do que gravar zero e fingir que o servidor está deserto.
      console.log(`${relogio(agora)}  lista vazia (${r.info?.jogadores ?? '?'} pessoas segundo o servidor)`
        + ' — censurada ou mesmo vazia');
    } else {
      const nomes = r.jogadores.map((j) => j.nome);
      fotos.push({ ms: agora, nomes });
      fs.writeFileSync(f, JSON.stringify(fotos));
      const set = new Set(nomes);
      const entraram = nomes.filter((n) => !antes.has(n));
      const sairam = [...antes].filter((n) => !set.has(n));
      antes = set;
      const linha = [
        entraram.length ? `+${entraram.join(' +')}` : '',
        sairam.length ? `-${sairam.join(' -')}` : '',
      ].filter(Boolean).join('  ');
      console.log(`${relogio(agora)}  ${String(nomes.length).padStart(3)} online  ${linha}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((k) => { setTimeout(k, intervalo); });
  }
  mostrar(fotos);
}

/**
 * O endereço, a partir do id do BattleMetrics.
 *
 * Um browser a sério e não um `fetch`: a página está atrás da Cloudflare, e a
 * Cloudflare distingue as duas coisas. Medido numa máquina de nuvem: o `fetch`
 * leva 403 com a página de desafio. Num computador de casa, com o browser, ela
 * abre — que é exactamente o "acessar de forma normal igual player".
 */
async function enderecoPeloBattleMetrics(id) {
  let playwright;
  try { playwright = require('playwright'); } catch {
    console.error('O --bm precisa do Playwright:  npx playwright install chromium');
    process.exit(2);
  }
  const url = `https://www.battlemetrics.com/servers/rust/${id}`;
  console.log(`a abrir ${url}`);
  const b = await playwright.chromium.launch({ headless: !tem('visivel') });
  try {
    const p = await b.newPage({ locale: 'en-US' });
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // A Cloudflare pode meter um ecrã de espera pelo meio. Cinco segundos
    // chegam para ele se resolver sozinho num computador normal.
    await p.waitForTimeout(5000);
    const texto = await p.evaluate(() => document.body.innerText);
    const e = enderecoDaPagina(texto);
    if (!e) {
      console.error('Não achei o endereço na página.');
      console.error('Se apareceu um ecrã da Cloudflare, corre outra vez com --visivel e resolve-o à mão.');
      process.exit(1);
    }
    console.log(`servidor em ${e.ip}:${e.porta}`);
    return `${e.ip}:${e.porta}`;
  } finally { await b.close(); }
}

const bm = arg('bm');
const ip = arg('ip');
if (!tem('ver') && !ip && bm) {
  enderecoPeloBattleMetrics(bm).then(gravar);
} else if (tem('ver') || !ip) {
  const f = ip
    ? ficheiro(ip.split(':')[0], Number(ip.split(':')[1] || 28015))
    : fs.readdirSync(PASTA).filter((n) => n.startsWith('servidor-')).map((n) => path.join(PASTA, n))[0];
  if (!f || !fs.existsSync(f)) {
    console.error('Nada gravado ainda. Começa com:');
    console.error('  npm run servidor -- --bm 29566604 --alvo <o teu nome no jogo>');
    console.error('ou, se já souberes o endereço:');
    console.error('  npm run servidor -- --ip 1.2.3.4:28015 --alvo <o teu nome no jogo>');
    process.exit(1);
  }
  mostrar(ler(f));
} else {
  gravar(ip);
}
