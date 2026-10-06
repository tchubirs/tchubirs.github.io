// Um link partilhado é texto de um desconhecido.
//
// O `?s=` traz a lista de canais de quem fez o link, e um nome que a Kick
// recusa volta para a página tal como foi escrito. Estes testes abrem a página
// com um link armadilhado e verificam que o nome aparece como texto e não
// corre como código.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapar } from '../site/escapar.js';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });

const ARMADILHA = '<img src=x onerror="window.__xss=1">';
const link = (sessao) => Buffer.from(JSON.stringify({ v: 2, ...sessao }), 'utf8').toString('base64');

test('escapar troca os cinco caracteres que abrem HTML', () => {
  assert.equal(escapar(`<a href="x" title='y'>&</a>`),
    '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapar(null), '');
  assert.equal(escapar('tchubi_tv-2'), 'tchubi_tv-2');
});

test('um nome de canal armadilhado num link aparece como texto e não corre',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    const s = link({ canais: ['tchubi', ARMADILHA], momentos: [{ ms: 1, protagonista: ARMADILHA }] });
    await p.goto(`http://127.0.0.1:${PORTA}/?s=${encodeURIComponent(s)}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('#listaCanais li[data-estado="nome-invalido"]', { timeout: 15000 });
    // Dar tempo à imagem para falhar: é aí que o `onerror` correria.
    await p.waitForTimeout(500);
    assert.equal(await p.evaluate(() => window.__xss), undefined);
    assert.equal(await p.locator('#listaCanais img').count(), 0);
    const nome = await p.locator('#listaCanais li[data-estado="nome-invalido"] b').textContent();
    assert.equal(nome, ARMADILHA.toLowerCase());
  });
