// O palco dos testes de browser: o servidor, o Chromium e a página em branco.
//
// Vive à parte porque há dois ficheiros de testes de página, e não um.
// O `node --test` corre os ficheiros em PARALELO e conta um tempo limite a
// cada um; num só, os setenta e cinco testes levavam 148 segundos e a CI
// corta aos 120 — a suite ficava vermelha sem nada estar partido. Em dois,
// cada metade acaba muito antes do limite e o relógio de parede da CI baixa,
// porque as duas correm ao mesmo tempo.
//
// A Kick é fingida por intercepção de rotas e não pedida a sério. Duas razões:
// este contentor não lhe chega, e um teste que depende do serviço de outra
// pessoa falha por razões que não são deste código.

import { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SITE = new URL('../site/', import.meta.url).pathname;
const temPlaywright = await import('playwright').then(() => true, () => false);
const CHROME = process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const podeCorrer = temPlaywright && fs.existsSync(CHROME);

/**
 * Montar o palco deste ficheiro de testes.
 *
 * Os ganchos do `node:test` são por ficheiro, e por isso cada um tem de ter o
 * seu servidor e o seu Chromium — chamar isto uma vez no topo trata disso.
 *
 * @param {(porta: number) => void} aoAbrir - recebe a porta escolhida pelo
 *   sistema. Fixa não pode ser: com os ficheiros em paralelo, uma porta fixa
 *   transforma dois testes bons em falhas que não são deles.
 */
export function montarPalco(aoAbrir = () => {}) {
  let navegador = null;
  let servidor = null;

  before(async () => {
    if (!podeCorrer) return;
    const tipos = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
    };
    servidor = http.createServer((req, res) => {
      const caminho = req.url.split('?')[0];
      const f = path.join(SITE, caminho === '/' ? 'index.html' : caminho);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' });
      res.end(fs.readFileSync(f));
    });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    aoAbrir(servidor.address().port);
    const { chromium } = await import('playwright');
    navegador = await chromium.launch({ executablePath: CHROME });
  });

  after(async () => {
    await navegador?.close();
    servidor?.close();
  });

  async function abrir({ ecra, idioma = 'pt' } = {}) {
    // Idioma fixo, e nao o do sistema: os testes leem frases, e uma maquina de
    // CI noutra lingua fazia-os falhar por uma razao que nao e a deles.
    const p = await navegador.newPage({
      ...(ecra ? { viewport: ecra } : {}),
      locale: idioma === 'pt' ? 'pt-PT' : idioma,
    });
    await p.addInitScript((l) => {
      // So quando ainda nao ha escolha: este guiao corre em CADA navegacao, e a
      // escrever sempre apagava a lingua que o proprio teste tinha acabado de
      // escolher — e o F5 parecia estar a perde-la.
      try { if (!localStorage.getItem('replay.idioma')) localStorage.setItem('replay.idioma', l); } catch { /* nada */ }
    }, idioma);
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message)));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|404/.test(m.text())) erros.push(m.text()); });
    return { p, erros };
  }

  return { abrir };
}
