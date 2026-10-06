// As cores do texto lêem-se em todas as superfícies onde aparecem.
//
// O contraste mede-se e não se escolhe a olho: o vermelho dos avisos já esteve
// abaixo dos 4,5:1 do WCAG AA no botão do ao vivo (4,2:1), e era justamente o
// texto que diz o que correu mal. Este teste lê os tokens tal como estão em
// tokens.css, para que uma cor mudada sem medir não passe calada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../site/tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\b/g)]
  .map((m) => [m[1], m[2].toLowerCase()]));

const canais = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function luminancia(h) {
  const [r, g, b] = canais(h).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Uma cor com alfa (#rrggbbaa) pintada sobre um fundo opaco. */
function sobre(cor, fundo) {
  const a = parseInt(cor.slice(7, 9), 16) / 255;
  const c = canais(cor);
  const f = canais(fundo);
  return `#${c.map((v, i) => Math.round(v * a + f[i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
}

const SUPERFICIES = ['sup-0', 'sup-1', 'sup-2', 'sup-3'];
const AA = 4.5;

test('os tokens que o teste usa existem', () => {
  for (const t of [...SUPERFICIES, 'tinta', 'tinta-2', 'tinta-3', 'perigo', 'perigo-eco', 'sobre-acento']) {
    assert.ok(tokens[t], `falta --${t}`);
  }
});

test('o texto de todos os níveis passa AA nas superfícies onde vive', () => {
  // --tinta-3 é o terceiro nível e vive na página e nos painéis, não em cima de um controlo.
  const onde = {
    tinta: SUPERFICIES, 'tinta-2': SUPERFICIES, 'tinta-3': ['sup-0', 'sup-1', 'sup-2'],
    acento: SUPERFICIES, marca: SUPERFICIES, ok: SUPERFICIES, aviso: SUPERFICIES, perigo: SUPERFICIES,
  };
  for (const [cor, sups] of Object.entries(onde)) {
    for (const s of sups) {
      const c = contraste(tokens[cor], tokens[s]);
      assert.ok(c >= AA, `--${cor} sobre --${s}: ${c.toFixed(2)}:1`);
    }
  }
});

test('o vermelho dos avisos lê-se também sobre o seu eco, e o selo ao vivo lê-se sobre ele', () => {
  for (const s of SUPERFICIES) {
    const fundo = sobre(tokens['perigo-eco'], tokens[s]);
    const c = contraste(tokens.perigo, fundo);
    assert.ok(c >= AA, `--perigo sobre --perigo-eco em --${s}: ${c.toFixed(2)}:1`);
  }
  const selo = contraste(tokens['sobre-acento'], tokens.perigo);
  assert.ok(selo >= AA, `selo ao vivo: ${selo.toFixed(2)}:1`);
});
