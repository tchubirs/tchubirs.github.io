import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPalco, podeCorrer } from './palco.mjs';

let porta = 0;
const { abrir } = montarPalco((p) => { porta = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function abrirDicas(opcoes = {}) {
  const { p, erros } = await abrir(opcoes);
  await p.route('**/dicas-fixture.html', (r) => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pt-BR"><head><style>
      button { margin: 30px; padding: 12px; }
      .dica { position: fixed; pointer-events: none; }
    </style></head><body>
      <button id="comAjuda" title="Dica curta" aria-describedby="ajuda aviso">Procurar</button>
      <button id="semAjuda" title="Outra dica">Exportar</button>
      <p id="ajuda">A análise baixa o áudio do trecho escolhido.</p>
      <p id="aviso">A detecção é aproximada.</p><p id="novaAjuda">Descrição atualizada.</p>
      <script type="module" src="/dicas.js"></script>
    </body></html>`,
  }));
  await p.goto(`http://127.0.0.1:${porta}/dicas-fixture.html`, { waitUntil: 'networkidle' });
  return { p, erros };
}

test('cancelar uma dica antes de abrir preserva as descrições do botão', semNavegador, async () => {
  const { p, erros } = await abrirDicas();
  await p.locator('#comAjuda').hover();
  await p.mouse.down();
  await p.mouse.up();
  assert.equal(await p.locator('#comAjuda').getAttribute('aria-describedby'), 'ajuda aviso');
  assert.equal(await p.locator('[role="tooltip"]').isVisible(), false);
  assert.deepEqual(erros, []);
  await p.close();
});

test('a dica acrescenta só sua descrição e preserva alterações feitas enquanto está aberta', semNavegador, async () => {
  const { p, erros } = await abrirDicas();
  await p.locator('#comAjuda').hover();
  await p.waitForSelector('[role="tooltip"]:not([hidden])');
  assert.equal(await p.locator('#comAjuda').getAttribute('aria-describedby'), 'ajuda aviso dicaAtual');
  await p.locator('#comAjuda').evaluate((b) => b.setAttribute('aria-describedby', `${b.getAttribute('aria-describedby')} novaAjuda`));
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#comAjuda').getAttribute('aria-describedby'), 'ajuda aviso novaAjuda');
  assert.equal(await p.locator('[role="tooltip"]').isVisible(), false);
  assert.deepEqual(erros, []);
  await p.close();
});

test('trocar de botão remove só a dica anterior e não deixa referências penduradas', semNavegador, async () => {
  const { p, erros } = await abrirDicas();
  await p.locator('#comAjuda').hover();
  await p.waitForSelector('[role="tooltip"]:not([hidden])');
  await p.locator('#semAjuda').hover();
  await p.waitForFunction(() => document.querySelector('[role="tooltip"]:not([hidden])')?.textContent === 'Outra dica');
  assert.equal(await p.locator('#comAjuda').getAttribute('aria-describedby'), 'ajuda aviso');
  assert.equal(await p.locator('#semAjuda').getAttribute('aria-describedby'), 'dicaAtual');
  await p.mouse.move(0, 0);
  assert.equal(await p.locator('#semAjuda').getAttribute('aria-describedby'), null);
  assert.equal(await p.locator('[role="tooltip"]').isVisible(), false);
  assert.deepEqual(erros, []);
  await p.close();
});

test('toque não abre a dica nem altera as descrições existentes', semNavegador, async () => {
  const { p, erros } = await abrirDicas({ toque: true });
  await p.locator('#comAjuda').tap();
  assert.equal(await p.locator('#comAjuda').getAttribute('aria-describedby'), 'ajuda aviso');
  assert.equal(await p.locator('#comAjuda').getAttribute('title'), 'Dica curta');
  assert.equal(await p.locator('[role="tooltip"]').isVisible(), false);
  assert.deepEqual(erros, []);
  await p.close();
});
