// O contexto automático (quadro + fala) ligado de verdade no modo simples: servidor real
// (server/contexto-servidor.mjs) com a Anthropic mockada, Chromium real a decodificar um quadro de verdade
// do vídeo falso, e a lista/título/filtro a refletir o veredito validado — sem nenhum gancho de teste a
// fingir a saúde: o `GET /health` real decide.
//
// Dois servidores reais, duas respostas honestas: sem ANTHROPIC_API_KEY (como o dono roda sem a chave, ou o
// GitHub Pages sem backend algum) a lista nunca finge analisado; com a chave e a Anthropic mockada, o
// veredito aparece no título e entra no filtro "Luta".

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kickFalsa, T } from './falsa.mjs';
import { chatEVideo, gravarFonte } from './chat-falso.mjs';
import { criarServidor } from '../server/contexto-servidor.mjs';

const temPlaywright = await import('playwright').then(() => true, () => false);
const CHROME = process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const podeCorrer = temPlaywright && fs.existsSync(CHROME);
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

const CANAIS = ['tchubi'];
// Um momento de 'tiros' já achado (como o som teria dado), logo no início do VOD: `onde()` devolve o
// tempo dentro do VOD INTEIRO (tempoDeMidia, relogio.js), não dentro de um segmento de 10 s — e o vídeo
// gravado na própria página (gravarFonte) só tem uns segundos de verdade. Perto do início os dois batem.
const MOMENTO_TIROS = {
  ms: T + 5_000, deMs: T + 2_000, ateMs: T + 9_000, pontos: 6, canal: 'tchubi', nota: 'bom',
  etiquetas: [{ tipo: 'tiros', conf: 0.6, fonte: 'rotulos', n: 22 }],
};

const CONTEXTO_COMBATE = {
  tipo: 'combate', participacao: 'confirmada', origem: 'ia-remota',
  resumo: 'o jogador atira contra um alvo visível e a vida dele cai durante o disparo',
  evidencias: { visuais: ['jogador disparando contra outro jogador visível', 'barra de vida caiu durante o disparo'] },
};

function respostaAnthropic(json) {
  return async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }) });
}

let navegador = null;
before(async () => {
  if (!podeCorrer) return;
  const { chromium } = await import('playwright');
  navegador = await chromium.launch({ executablePath: CHROME });
});
after(async () => { await navegador?.close(); });

/** Um servidor real (server/contexto-servidor.mjs) nesta porta, com a Anthropic sempre mockada. */
async function comServidor(opcoes, usar) {
  const s = criarServidor(opcoes);
  const porta = await s.listen(0);
  try { return await usar(porta); } finally { await s.close(); }
}

/**
 * A página já com o vídeo guardado semeado (mostrarGuardado: sem refazer chat/som) ANTES do primeiro
 * carregamento, tudo por `addInitScript` — um `reload()` depois apagaria `window.__fonteFalsa` (o vídeo
 * gravado na própria página) antes do hls.js de mentira o conseguir usar.
 */
async function abrirPagina(momento = MOMENTO_TIROS, { falaMock = null } = {}) {
  const p = await navegador.newPage({ viewport: { width: 1366, height: 768 }, locale: 'pt-PT' });
  await p.addInitScript(({ inicio, momento, falaTexto }) => {
    try {
      localStorage.setItem('replay.caminho', 'vod');
      localStorage.setItem('povix.modo', 'simples');
      localStorage.setItem('replay.idioma', 'pt');
      localStorage.setItem('povix.simplesVods', JSON.stringify([{
        slug: 'tchubi', inicio, em: Date.now(), aoVivo: false, completo: true, indiceV: 2, lista: [momento],
      }]));
      localStorage.setItem('povix.simplesUltimo', JSON.stringify({ slug: 'tchubi', inicio }));
    } catch { /* nada */ }
    // Mock EXPLÍCITO da fala do contexto (ver site/simples.js, `transcreverParaContexto`): o Whisper real
    // (vozDaLegenda) precisa do modelo via CDN, que este teste bloqueia de propósito (tasks-vision/mediapipe/
    // huggingface) — sem isto, a transcrição nunca chega de verdade neste ambiente, e um teste que afirmasse
    // "recebeu fala" sem ela ter sido mesmo mockada estaria a inventar uma evidência que o código não tem.
    if (falaTexto) {
      window.__povixTranscreverContexto = async () => ({ linhas: [{ palavras: [{ t: falaTexto, de: 0, ate: 1000 }] }] });
    }
  }, { inicio: T, momento, falaTexto: falaMock });
  await p.context().route(/tasks-vision@|mediapipe-models|cdn\.jsdelivr\.net|huggingface\.co/, (r) => r.abort());
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e.message)));
  await kickFalsa(p, { canais: CANAIS });
  await chatEVideo(p, { canais: CANAIS });
  await p.route('**/api/v2/channels/*/messages**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: { messages: [], cursor: null } }),
  }));
  return { p, erros };
}

test('sem ANTHROPIC_API_KEY (o /health real diz temChave:false): nunca baixa quadro nem fala, nunca finge analisado',
  { ...semNavegador, timeout: 60_000 }, async () => {
    let chamadas = 0;
    await comServidor({ apiKey: '', fetchImpl: async (...a) => { chamadas++; return respostaAnthropic(CONTEXTO_COMBATE)(...a); } }, async (porta) => {
      const { p, erros } = await abrirPagina();
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
      await gravarFonte(p, { ms: 10_000 });
      await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
      await p.waitForTimeout(3000);
      const motivo = await p.locator('#simplesLista li').first().locator('.simplesMotivo').innerText();
      assert.match(motivo, /Som alto|Tiros ouvidos/, 'sem confirmação, é só indício de som — nunca "luta"');
      assert.equal(chamadas, 0, 'sem a chave, o servidor de contexto nunca chama a Anthropic');
      assert.deepEqual(erros, []);
      await p.close();
    });
  });

test('com a chave e a Anthropic mockada (saúde real confirmada): o veredito vira o título e entra no filtro "Luta"',
  { ...semNavegador, timeout: 60_000 }, async () => {
    let chamadas = 0;
    await comServidor({ apiKey: 'teste-fake-key', fetchImpl: async (...a) => { chamadas++; return respostaAnthropic(CONTEXTO_COMBATE)(...a); } }, async (porta) => {
      const { p, erros } = await abrirPagina();
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
      await gravarFonte(p, { ms: 10_000 });
      await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
      await p.waitForFunction(() => /luta confirmada/i.test(document.querySelector('#simplesLista li')?.innerText || ''), null, { timeout: 25_000 });
      assert.ok(chamadas >= 1, 'o POST /api/contexto-rust foi chamado de verdade (Anthropic mockada)');
      const cartao = p.locator('#simplesLista li').first();
      // O título do cartão é o RESUMO FACTUAL do veredito validado (textoDoContexto), não o rótulo de som nem
      // a palavra "Luta". Este teste NÃO mocka a fala (Whisper real precisa do modelo via CDN, que a página
      // bloqueia de propósito — ver `abrirPagina`/rota de `tasks-vision|mediapipe|cdn.jsdelivr|huggingface`):
      // a transcrição de verdade nunca chega aqui, então o status HONESTO é "Análise por imagem" (sem fala) —
      // ver `recebeuFala` em `site/contexto-rust.js`, que vem do que o PEDIDO realmente levou, nunca do que o
      // modelo afirma de si mesmo. Afirmar "e fala" aqui seria o teste a fingir uma evidência que não existe.
      assert.match(await cartao.locator('.simplesMotivo').innerText(), /Combate do jogador confirmado/);
      assert.match(await cartao.innerText(), /Análise por imagem\b/);
      assert.doesNotMatch(await cartao.innerText(), /Análise por imagem e fala/, 'sem fala mockada/recebida de verdade, o status não pode afirmar "e fala"');
      assert.doesNotMatch(await cartao.innerText(), /Som alto|Tiros ouvidos/, 'com veredito confirmado, o indício de som não aparece como título');
      assert.doesNotMatch(await cartao.innerText(), /99%|Luta \d+%/, 'nunca mostra o score bruto do áudio como confiança de combate');
      // O filtro "Luta" (combate confirmado) casa este cartão.
      await p.click('#simplesFiltrar');
      await p.check('#simplesFiltro input[name="filtroTipo"][value="tiros"]');
      await p.click('#simplesFiltro button[type="submit"]');
      assert.equal(await p.locator('#simplesLista li').count(), 1);
      assert.deepEqual(erros, []);
      await p.close();
    });
  });

test('com fala mockada explicitamente (window.__povixTranscreverContexto): o status diz "imagem e fala" de verdade',
  { ...semNavegador, timeout: 60_000 }, async () => {
    await comServidor({ apiKey: 'teste-fake-key', fetchImpl: respostaAnthropic(CONTEXTO_COMBATE) }, async (porta) => {
      const { p, erros } = await abrirPagina(MOMENTO_TIROS, { falaMock: 'toma essa, acertei em cheio' });
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
      await gravarFonte(p, { ms: 10_000 });
      await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
      await p.waitForFunction(() => /luta confirmada/i.test(document.querySelector('#simplesLista li')?.innerText || ''), null, { timeout: 25_000 });
      const cartao = p.locator('#simplesLista li').first();
      // A fala foi mockada de verdade (não uma corrida esperada sem assert): o PEDIDO real levou transcrição
      // não-vazia (`recebeuFala`, em `construirPedido`/`contexto-rust.js`), o servidor repassa isso em `meta`
      // (nunca o que o modelo "diz" de si mesmo — ver `contexto-servidor.mjs`), e só então o status honesto
      // vira "imagem e fala".
      assert.match(await cartao.locator('.simplesMotivo').innerText(), /Combate do jogador confirmado/);
      assert.match(await cartao.innerText(), /Análise por imagem e fala/);
      assert.deepEqual(erros, []);
      await p.close();
    });
  });

// Regressão (Root, Kodd13/10): miniaturas já prontas e filtro "Luta" vazio NÃO podem impedir a análise de um
// candidato que ainda precisa de veredito. Primeira visita: a Anthropic falha, as miniaturas ficam guardadas
// sem veredito. Segunda visita (mesma origem, cache cheio): o canal abre sozinho e o veredito aparece.
test('regressão: miniaturas prontas + filtro Luta inicialmente vazio ainda analisam um candidato confirmado',
  { ...semNavegador, timeout: 90_000 }, async () => {
    let chamadas = 0;
    let respondeAgora = false;
    await comServidor({ apiKey: 'teste-fake-key', fetchImpl: async (...a) => {
      chamadas++;
      if (!respondeAgora) return { ok: false, status: 500, json: async () => ({}) };
      return respostaAnthropic(CONTEXTO_COMBATE)(...a);
    } }, async (porta) => {
      const { p, erros } = await abrirPagina();
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
      await gravarFonte(p, { ms: 10_000 });
      await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
      await p.waitForTimeout(3000);
      assert.ok(chamadas >= 1, 'a primeira visita tentou analisar e falhou');
      respondeAgora = true;
      const antes = chamadas;
      // Segunda visita: o filtro "Luta" não é tocado; só a lista guardada e as miniaturas em cache.
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
      await gravarFonte(p, { ms: 10_000 });
      await p.waitForFunction(() => /luta confirmada/i.test(document.querySelector('#simplesLista li')?.innerText || ''), null, { timeout: 25_000 });
      assert.ok(chamadas > antes, 'a segunda visita chamou o servidor de contexto (health + análise), mesmo com tudo em cache');
      await p.click('#simplesFiltrar');
      await p.check('#simplesFiltro input[name="filtroTipo"][value="tiros"]');
      await p.click('#simplesFiltro button[type="submit"]');
      assert.equal(await p.locator('#simplesLista li').count(), 1);
      assert.deepEqual(erros, []);
      await p.close();
    });
  });

// Regressão: um veredito de prompt/contrato ANTIGO, numa lista com indiceV atual, não pode aparecer como vigente.
test('regressão: veredito de prompt antigo não é apresentado como "Análise por imagem e fala"',
  { ...semNavegador, timeout: 60_000 }, async () => {
    const velho = { ...CONTEXTO_COMBATE, versaoContrato: 1, revisaoPrompt: 'v1' };
    const momento = {
      ...MOMENTO_TIROS,
      etiquetas: [{ tipo: 'tiros', conf: 0.6, fonte: 'rotulos', n: 22, contexto: velho }],
    };
    let chamadas = 0;
    await comServidor({ apiKey: '', fetchImpl: async (...a) => { chamadas++; return respostaAnthropic(CONTEXTO_COMBATE)(...a); } }, async (porta) => {
      const { p, erros } = await abrirPagina(momento);
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'networkidle' });
      await gravarFonte(p, { ms: 10_000 });
      await p.waitForSelector('#simplesLista li', { timeout: 10_000 });
      await p.waitForTimeout(2000);
      const cartao = p.locator('#simplesLista li').first();
      assert.doesNotMatch(await cartao.innerText(), /Análise por imagem/, 'o veredito v1 não é mostrado como análise vigente');
      assert.doesNotMatch(await cartao.innerText(), /Combate do jogador confirmado/);
      assert.match(await cartao.locator('.simplesMotivo').innerText(), /Som alto|Tiros ouvidos/);
      assert.equal(chamadas, 0, 'sem a chave, não reanalisa nem chama a Anthropic');
      assert.deepEqual(erros, []);
      await p.close();
    });
  });
