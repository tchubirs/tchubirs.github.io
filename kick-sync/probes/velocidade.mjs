// O benchmark do site: quanto pesa, quanto tempo tapa o ecrã, e quanto abana.
//
// "Vi na net um vídeo para usar isso no site para deixar ele melhor, mais
//  bonito, um benchmark de site."
//
// As três ferramentas do vídeo — react-doctor, react-scan e o Playwright com
// MCP — são duas para React e uma que já cá está. Este site não tem React:
// não tem JSX, não tem build, não tem uma linha de `react` em lado nenhum, e
// as duas primeiras não teriam o que ler. O Playwright é o que corre os 308
// testes desde o princípio.
//
// O que o vídeo VALE, isso sim: medir em vez de achar. É o que isto faz, com
// os mesmos números que uma auditoria dessas dá, e sem instalar nada.
//
//   node probes/velocidade.mjs            o site local
//   node probes/velocidade.mjs --ao-vivo  o que está publicado
//
// Os números:
//   FCP   quando aparece a primeira coisa
//   LCP   quando aparece a coisa GRANDE (é este que conta para o Google)
//   CLS   quanto é que a página salta depois de aparecer. 0 é perfeito.
//   TBT   quanto tempo a página fica surda a um toque
//   bytes o que foi preciso descarregar para chegar ali
//
// O telemóvel dele é a medida que interessa, e por isso o processador vai a um
// quarto da velocidade: um iPhone em poupança de energia não é um PC.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(AQUI, '..', 'site');
const CHROME = process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const AO_VIVO = process.argv.includes('--ao-vivo');
const PUBLICO = 'https://tchubirs.github.io/replay/';

/** O mesmo servidor de ficheiros dos testes: sem cache, sem compressão. */
function servir() {
  const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const s = http.createServer((req, res) => {
    const caminho = req.url.split('?')[0];
    const f = path.join(SITE, caminho === '/' ? 'index.html' : caminho);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'text/plain' });
    return res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok({ s, porta: s.address().port })));
}

// Os três relógios que o Google usa, lidos de dentro da página. `buffered:true`
// é o que faz isto funcionar: sem ele, um observador criado depois do primeiro
// pinte perde o acontecimento e devolve zero para sempre.
const ESPIA = `
window.__m = { lcp: 0, cls: 0, tarefas: [], fcp: 0 };
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) window.__m.lcp = Math.max(window.__m.lcp, e.startTime);
}).observe({ type: 'largest-contentful-paint', buffered: true });
window.__m.saltos = [];
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    if (e.hadRecentInput) continue;
    window.__m.cls += e.value;
    // QUEM saltou, e nao so quanto: um numero sozinho diz que a pagina abana e
    // nao diz onde por as maos.
    for (const f of e.sources || []) {
      const el = f.node;
      if (!el?.tagName) continue;
      window.__m.saltos.push({
        quem: el.id ? '#' + el.id
          : el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0],
        quanto: e.value,
        quando: Math.round(e.startTime),
      });
    }
  }
}).observe({ type: 'layout-shift', buffered: true });
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) window.__m.tarefas.push(e.duration);
}).observe({ type: 'longtask', buffered: true });
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime;
}).observe({ type: 'paint', buffered: true });
`;

async function medir(navegador, { nome, url, ecra, travao }) {
  const p = await navegador.newPage({ viewport: ecra, locale: 'pt-PT' });
  const cliente = await p.context().newCDPSession(p);
  await cliente.send('Emulation.setCPUThrottlingRate', { rate: travao });

  const recursos = [];
  p.on('response', async (r) => {
    const t = (r.headers()['content-type'] || '').split(';')[0];
    let n = 0;
    try { n = (await r.body()).length; } catch { n = 0; }
    recursos.push({ url: r.url(), tipo: t, bytes: n });
  });

  await p.addInitScript(ESPIA);
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await p.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  const carga = Date.now() - t0;
  // Deixar o CLS acumular: um salto que acontece meio segundo depois de a
  // página parecer pronta conta na mesma para quem está a olhar.
  await p.waitForTimeout(1500);

  const m = await p.evaluate(() => window.__m);
  const dom = await p.evaluate(() => ({
    nos: document.getElementsByTagName('*').length,
    // Um `<video>` por ângulo é o que faz um telemóvel engasgar-se.
    videos: document.querySelectorAll('video').length,
  }));
  // Só o que é NOSSO: um CDN de fontes não é código que eu possa encolher.
  const meus = recursos.filter((r) => !/fonts\.(googleapis|gstatic)/.test(r.url));
  const soma = (f) => meus.filter(f).reduce((a, r) => a + r.bytes, 0);
  const total = meus.reduce((a, r) => a + r.bytes, 0);
  // O TBT é o que passa dos 50 ms em cada tarefa longa, e não a tarefa toda:
  // os primeiros 50 ms ninguém sente.
  const tbt = m.tarefas.reduce((a, d) => a + Math.max(0, d - 50), 0);

  console.log(`\n── ${nome} ${'─'.repeat(Math.max(0, 56 - nome.length))}`);
  console.log(`  FCP    ${m.fcp.toFixed(0).padStart(6)} ms   a primeira coisa a aparecer`);
  console.log(`  LCP    ${m.lcp.toFixed(0).padStart(6)} ms   ${m.lcp < 2500 ? 'bom' : m.lcp < 4000 ? 'assim-assim' : 'MAU'} (bom < 2500)`);
  console.log(`  CLS    ${m.cls.toFixed(3).padStart(6)}      ${m.cls < 0.1 ? 'bom' : m.cls < 0.25 ? 'assim-assim' : 'MAU'} (bom < 0,100)`);
  console.log(`  TBT    ${tbt.toFixed(0).padStart(6)} ms   ${tbt < 200 ? 'bom' : tbt < 600 ? 'assim-assim' : 'MAU'} (bom < 200) · ${m.tarefas.length} tarefas longas`);
  console.log(`  carga  ${String(carga).padStart(6)} ms   até a rede se calar`);
  console.log(`  bytes  ${(total / 1024).toFixed(1).padStart(6)} kB   `
    + `js ${(soma((r) => /javascript/.test(r.tipo)) / 1024).toFixed(1)} · `
    + `css ${(soma((r) => /css/.test(r.tipo)) / 1024).toFixed(1)} · `
    + `html ${(soma((r) => /html/.test(r.tipo)) / 1024).toFixed(1)}`);
  console.log(`  DOM    ${String(dom.nos).padStart(6)} nós, ${dom.videos} vídeos`);

  if (m.saltos?.length) {
    const porQuem = new Map();
    for (const x of m.saltos) porQuem.set(x.quem, (porQuem.get(x.quem) || 0) + x.quanto);
    const lista = [...porQuem].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('  o que salta:');
    for (const [quem, quanto] of lista) console.log(`    ${quanto.toFixed(3).padStart(7)}  ${quem}`);
  }

  const maiores = [...meus].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  console.log('  os cinco maiores:');
  for (const r of maiores) {
    console.log(`    ${(r.bytes / 1024).toFixed(1).padStart(7)} kB  ${r.url.split('/').pop().slice(0, 46)}`);
  }
  await p.close();
  return { nome, fcp: m.fcp, lcp: m.lcp, cls: m.cls, tbt, bytes: total, nos: dom.nos };
}

const { chromium } = await import('playwright');
if (!fs.existsSync(CHROME)) { console.error('sem Chromium em', CHROME); process.exit(2); }

let servidor = null;
let base = PUBLICO;
if (!AO_VIVO) { const r = await servir(); servidor = r.s; base = `http://127.0.0.1:${r.porta}/`; }
const navegador = await chromium.launch({
  executablePath: CHROME,
  ...(AO_VIVO && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
});

console.log(`a medir ${base}`);
const saida = [];
saida.push(await medir(navegador, {
  nome: 'telemóvel · 390x844 · processador a 1/4',
  url: base, ecra: { width: 390, height: 844 }, travao: 4,
}));
saida.push(await medir(navegador, {
  nome: 'computador · 1920x1080 · sem travão',
  url: base, ecra: { width: 1920, height: 1080 }, travao: 1,
}));

console.log('\n── o que isto quer dizer ──────────────────────────────────');
const mau = saida.filter((r) => r.lcp >= 2500 || r.cls >= 0.1 || r.tbt >= 200);
if (!mau.length) console.log('  Tudo dentro do que o Google chama bom, nas duas medidas.');
for (const r of mau) {
  const porque = [];
  if (r.lcp >= 2500) porque.push(`LCP ${r.lcp.toFixed(0)} ms`);
  if (r.cls >= 0.1) porque.push(`CLS ${r.cls.toFixed(3)}`);
  if (r.tbt >= 200) porque.push(`TBT ${r.tbt.toFixed(0)} ms`);
  console.log(`  ${r.nome}: ${porque.join(', ')}`);
}

await navegador.close();
servidor?.close();
