// Abrir a página no teu computador, sem instalar nada e sem servidor na net.
//
// Não dá para abrir o index.html directamente (duplo clique no ficheiro): o
// browser trata um ficheiro solto como se não tivesse origem nenhuma, e nesse
// modo recusa carregar os módulos e recusa falar com a Kick. Um servidor local
// de vinte linhas resolve isso — e é só isto que este ficheiro é.
//
//   node servir.js        (ou dois cliques no replay.cmd, no Windows)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const servidor = http.createServer((req, res) => {
  const pedido = decodeURIComponent(req.url.split('?')[0]);
  const ficheiro = path.join(RAIZ, pedido === '/' ? 'index.html' : pedido);
  // Nunca servir nada de fora da pasta site/, mesmo que o pedido traga ".."
  if (!ficheiro.startsWith(RAIZ) || !fs.existsSync(ficheiro) || fs.statSync(ficheiro).isDirectory()) {
    res.writeHead(404);
    return res.end('não existe');
  }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(ficheiro)] || 'text/plain' });
  res.end(fs.readFileSync(ficheiro));
});

// Porta escolhida pelo sistema: uma porta fixa dá "endereço já em uso" se
// tiveres outra coisa aberta, e isso é um erro que não sabes o que quer dizer.
servidor.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${servidor.address().port}/`;
  console.log(`\n  Replay aberto em  ${url}\n`);
  console.log('  Cola os canais, um por linha, e carrega em "Carregar a noite".');
  console.log('  Para fechar: fecha esta janela preta.\n');
  const abrir = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  execFile(abrir[0], abrir[1], () => { /* se não abrir sozinho, o endereço está aí em cima */ });
});
