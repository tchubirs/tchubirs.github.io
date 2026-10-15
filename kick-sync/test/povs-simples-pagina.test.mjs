import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((porta) => { PORTA = porta; });
const opcoes = { skip: !podeCorrer && 'sem navegador', timeout: 30_000 };

async function preparar({ meuCanal = 'tchubi', kills = true, liberado = true, video = false } = {}) {
  const { p, erros } = await abrir({ modo: 'simples', caminho: null, ecra: { width: 390, height: 844 }, toque: true });
  await p.addInitScript((canal) => {
    if (canal) localStorage.setItem('povix.simplesMeuPov', canal);
    window.__povixQuadrosSimples = () => ({ quadro: async () => null, fechar() {} });
  }, meuCanal);
  await p.route('**/app.js', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript', body: `
      import { montarSimples } from '/simples.js';
      import { aplicarIdioma } from '/idiomas.js';
      aplicarIdioma();
      const config = ${JSON.stringify({ kills, liberado, video })};
      const ms = Date.now() - 2 * 60 * 60_000;
      const canais = ['outro', 'tchubi', 'inimigo', 'alpha', 'beta'];
      const lance = { ms, ateMs: ms + 3000, pontos: 16, kills: 1, noAr: canais,
        povsSugeridos: config.video ? [{ canal: 'tchubi', vitimas: ['inimigo'] }] : [],
        mortes: config.kills ? [{ matador: 'Tchubi', vitima: 'Inimigo', canalMatador: 'tchubi', canalVitima: 'inimigo' }] : [] };
      const controle = window.__povs = { abertos: [], editados: [], baixados: 0, liberado: config.liberado, feito: 0 };
      const ponte = {
        estado: { linhas: [], nudges: {}, somOuvido: new Map() },
        pausar() {},
        lancesDoEvento: () => ({ nome: 'Teste', canais, lances: [lance], mensagens: new Map(), lendo: false }),
        eventoDoLink: Promise.resolve(true),
        abrirEvento: () => Promise.resolve(true),
        lerChatDoEvento: () => Promise.resolve(),
        aoMudarEvento(f) { controle.atualizar = f; },
        pararChatDoEvento() {},
        povsLiberados: () => ({ liberado: controle.liberado, min: 15 }),
        procurarPovs({ aoProgresso, sinal, preferidos }) {
          controle.preferidos = preferidos;
          aoProgresso({ feito: 0, total: 2 });
          controle.emitir = (resultado) => aoProgresso({ feito: ++controle.feito, total: 2, resultado });
          return new Promise((resolver, rejeitar) => {
            controle.finalizarBusca = (talvez) => resolver({ estava: [], talvez });
            sinal.addEventListener('abort', () => rejeitar(new DOMException('cancelado', 'AbortError')), { once: true });
          });
        },
        abrirPovs(pedido) {
          controle.sinalAbertura = pedido.sinal;
          controle.abertos.push(pedido);
          return new Promise((resolver) => { controle.resolverAbertura = resolver; });
        },
        editar(pedido) { controle.editados.push(pedido); return true; },
        baixar() { controle.baixados++; return Promise.resolve({ erro: 'teste' }); },
      };
      controle.simples = montarSimples(ponte);
    `,
  }));
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#simplesLista > li');
  return { p, erros };
}

test('escolher seu canal usa seu POV e identifica o outro jogador da kill', opcoes, async () => {
  const { p, erros } = await preparar({ meuCanal: '' });
  try {
    assert.equal(await p.locator('#simplesLista .simplesStreamer').innerText(), 'Do streamer outro');
    await p.fill('#simplesCanalPov', '@Tchubi');
    await p.press('#simplesCanalPov', 'Enter');
    assert.equal(await p.locator('#simplesLista .simplesStreamer').innerText(), 'Sua câmera: tchubi');
    assert.equal(await p.evaluate(() => localStorage.getItem('povix.simplesMeuPov')), 'tchubi');
    await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).click();
    await p.waitForFunction(() => window.__povs.abertos.length === 1, null, { timeout: 4000 });
    assert.deepEqual(await p.evaluate(() => window.__povs.abertos[0].canais), ['tchubi', 'inimigo']);
    await p.evaluate(() => window.__povs.resolverAbertura(true));
    await p.waitForFunction(() => window.__povs.editados.length === 1);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('sugestão visual abre os dois POVs e não é apresentada como morte confirmada', opcoes, async () => {
  const { p, erros } = await preparar({ kills: false, video: true });
  try {
    assert.match(await p.locator('.simplesPovs').innerText(), /Possível adversário, pela tela dele/);
    assert.doesNotMatch(await p.locator('.simplesPovs').innerText(), /Vítima da kill|Kills registradas/);
    assert.doesNotMatch(await p.locator('.simplesMotivo').innerText(), /Luta confirmada|Troca de tiros/);
    await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).click();
    await p.waitForFunction(() => window.__povs.abertos.length === 1);
    assert.deepEqual(await p.evaluate(() => window.__povs.abertos[0].canais), ['tchubi', 'inimigo']);
    await p.evaluate(() => window.__povs.resolverAbertura(true));
    await p.waitForFunction(() => window.__povs.editados.length === 1);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('resultado de áudio focado abre o canal do rótulo após a busca reordenar opções', opcoes, async () => {
  const { p, erros } = await preparar({ kills: false });
  try {
    await p.locator('button[data-acao="procurarPovs"]').click();
    await p.waitForFunction(() => Boolean(window.__povs.emitir));
    await p.evaluate(() => window.__povs.emitir({ canal: 'alpha', estado: 'talvez', forca: 1, desvioS: 0.2 }));
    const alpha = p.getByRole('button', { name: 'Criar clipe com alpha', exact: true });
    await alpha.focus();
    await p.evaluate(() => {
      const alpha = { canal: 'alpha', estado: 'talvez', forca: 1, desvioS: 0.2 };
      const beta = { canal: 'beta', estado: 'talvez', forca: 9, desvioS: 0.8 };
      window.__povs.emitir(beta);
      window.__povs.finalizarBusca([beta, alpha]);
    });
    await p.waitForFunction(() => document.querySelector('button[data-acao="procurarPovs"]').textContent !== 'Parar busca');
    assert.equal(await alpha.evaluate((b) => b === document.activeElement), true);
    await alpha.press('Enter');
    await p.waitForFunction(() => window.__povs.abertos.length === 1);
    assert.deepEqual(await p.evaluate(() => window.__povs.abertos[0].canais), ['tchubi', 'alpha']);
    assert.equal(await p.evaluate(() => window.__povs.abertos[0].ajustes.alpha), 200);
    await p.evaluate(() => window.__povs.resolverAbertura(true));
    await p.waitForFunction(() => window.__povs.editados.length === 1);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

for (const origem of ['morte', 'video']) test(`busca leva a pista de ${origem} e mostra total enquanto aguarda o áudio`, opcoes, async () => {
  const { p, erros } = await preparar({ kills: origem === 'morte', video: origem === 'video' });
  try {
    await p.locator('button[data-acao="procurarPovs"]').click();
    await p.waitForFunction(() => Boolean(window.__povs.emitir));
    assert.deepEqual(await p.evaluate(() => window.__povs.preferidos), ['inimigo']);
    assert.match(await p.locator('.simplesPovEstado').innerText(), /0 de 2/);
    assert.equal(await p.locator('.simplesPovOpcao').count(), 1);
    assert.equal(await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).count(), 1);
    await p.evaluate(() => window.__povs.finalizarBusca([]));
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('abrir outro POV bloqueia downloads e resposta tardia não reabre o editor', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).click();
    await p.waitForFunction(() => window.__povs.abertos.length === 1);
    assert.equal(await p.locator('button[data-acao="tiktok"]').isDisabled(), true);
    assert.equal(await p.locator('button[data-acao="deitado"]').isDisabled(), true);
    assert.equal(await p.locator('#simplesCanalPov').isDisabled(), true);
    await p.locator('button[data-acao="tiktok"]').evaluate((b) => b.click());
    assert.equal(await p.evaluate(() => window.__povs.baixados), 0);
    await p.click('#simplesDeNovo');
    assert.equal(await p.evaluate(() => window.__povs.sinalAbertura.aborted), true);
    await p.evaluate(() => window.__povs.resolverAbertura(true));
    await p.waitForFunction(() => !document.getElementById('simplesCanalPov').disabled);
    assert.equal(await p.locator('#simplesCaixa').isVisible(), true);
    assert.equal(await p.evaluate(() => document.documentElement.dataset.modo), 'simples');
    assert.equal(await p.evaluate(() => window.__povs.editados.length), 0);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('resposta de abertura cancelada não libera os botões de uma nova abertura', opcoes, async () => {
  const { p, erros } = await preparar();
  try {
    await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).click();
    await p.waitForFunction(() => window.__povs.abertos.length === 1);
    await p.evaluate(() => { window.__povs.resolverAntiga = window.__povs.resolverAbertura; });
    await p.click('#simplesDeNovo');
    await p.evaluate(() => window.__povs.simples.comecar('?e=teste'));
    await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).click();
    await p.waitForFunction(() => window.__povs.abertos.length === 2);
    await p.evaluate(() => window.__povs.resolverAntiga(true));
    assert.equal(await p.locator('button[data-acao="tiktok"]').isDisabled(), true);
    assert.equal(await p.evaluate(() => window.__povs.sinalAbertura.aborted), false);
    assert.equal(await p.evaluate(() => window.__povs.editados.length), 0);
    await p.evaluate(() => window.__povs.resolverAbertura(true));
    await p.waitForFunction(() => window.__povs.editados.length === 1);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});

test('atraso do evento bloqueia os vários POVs e mantém o download individual disponível', opcoes, async () => {
  const { p, erros } = await preparar({ liberado: false });
  try {
    assert.equal(await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).isDisabled(), true);
    assert.equal(await p.locator('button[data-acao="procurarPovs"]').isDisabled(), true);
    assert.equal(await p.locator('button[data-acao="tiktok"]').isEnabled(), true);
    assert.match(await p.locator('.simplesPovEstado').innerText(), /15/);
    await p.evaluate(() => { window.__povs.liberado = true; window.__povs.atualizar(); });
    assert.equal(await p.getByRole('button', { name: 'Criar clipe com inimigo', exact: true }).isEnabled(), true);
    assert.equal(await p.locator('button[data-acao="procurarPovs"]').isEnabled(), true);
    assert.deepEqual(erros, []);
  } finally { await p.close(); }
});
