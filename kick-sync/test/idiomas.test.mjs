// As tres linguas, e a garantia de que nenhuma fica para tras.
//
// Uma traducao que falta nao pode aparecer como um codigo a meio do ecra, e
// uma chave que so existe numa lingua e uma frase que alguem nunca vai ler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDIOMAS, t, tn, definirIdioma, idiomaActual, idiomaDoBrowser, _TEXTOS,
} from '../site/idiomas.js';

test('as tres linguas tem exactamente as mesmas chaves', () => {
  const pt = Object.keys(_TEXTOS.pt).sort();
  for (const l of ['en', 'es']) {
    assert.deepEqual(Object.keys(_TEXTOS[l]).sort(), pt, `${l} nao bate certo com pt`);
  }
  assert.ok(pt.length > 100, `so ${pt.length} chaves?`);
});

// Uma frase com {n} numa lingua e sem {n} noutra da uma traducao que perde o
// numero — e ninguem repara ate estar publicado.
test('as variaveis de cada frase sao as mesmas em todas as linguas', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const chave of Object.keys(_TEXTOS.pt)) {
    const esperado = vars(_TEXTOS.pt[chave]);
    for (const l of ['en', 'es']) {
      assert.deepEqual(vars(_TEXTOS[l][chave]), esperado, `${l} / ${chave}`);
    }
  }
});

// Deixar o portugues colado numa das outras linguas e o engano mais facil de
// fazer e o mais dificil de ver. Mas ha frases que sao MESMO iguais — o
// portugues e o espanhol partilham palavras inteiras — e por isso essas ficam
// declaradas uma a uma, com o motivo. Uma lista vaga escondia enganos a
// mistura com coincidencias.
const IGUAIS_DE_PROPOSITO = {
  // Nome do produto, simbolos de navegacao, e frases que sao so numeros e datas.
  en: new Set([
    'app.nome', 'canais.vods', 'marca.feita',
    'tempo.menos1m', 'tempo.menos10s', 'tempo.mais10s', 'tempo.mais1m',
    'montagem.umaKill', 'montagem.kills',
  ]),
  // O espanhol e o portugues escrevem estas exactamente da mesma maneira.
  es: new Set([
    'app.nome', 'canais.vods', 'marca.feita', 'clipe.tempo',
    'tempo.menos1m', 'tempo.menos10s', 'tempo.mais10s', 'tempo.mais1m',
    'montagem.umaKill', 'montagem.kills', 'montagem.marcar',
    'procurar.seguidores', 'noite.todosJuntos', 'noite.umCanal',
    'tile.atrasar', 'alinhar.cancelado', 'montagem.antes', 'montagem.ir',
    'corte.titulo', 'corte.antes', 'clipe.cancelar',
    'sel.mostrar', 'sel.todos',
    'montagem.ver', 'montagem.parar', 'procurar.ph',
  ]),
};

test('nenhuma frase ficou por traduzir', () => {
  for (const l of ['en', 'es']) {
    const sobras = [];
    for (const [chave, frase] of Object.entries(_TEXTOS[l])) {
      if (IGUAIS_DE_PROPOSITO[l].has(chave)) continue;
      if (frase === _TEXTOS.pt[chave]) sobras.push(chave);
    }
    assert.deepEqual(sobras, [], `${l} ficou em portugues em: ${sobras.join(', ')}`);
  }
});

// E o contrario: uma chave na lista de excepcoes que ENTRETANTO foi traduzida
// nao pode ficar la a tapar um engano futuro.
test('a lista de excepcoes nao tem nada a mais', () => {
  for (const l of ['en', 'es']) {
    for (const chave of IGUAIS_DE_PROPOSITO[l]) {
      assert.equal(_TEXTOS[l][chave], _TEXTOS.pt[chave],
        `${l} / ${chave} ja esta traduzida — tirar da lista de excepcoes`);
    }
  }
});

test('t() poe as variaveis no sitio, em qualquer lingua', () => {
  for (const l of Object.keys(IDIOMAS)) {
    definirIdioma(l);
    const s = t('tempo.angulos', { n: 4, total: 6 });
    assert.match(s, /4/);
    assert.match(s, /6/);
    assert.ok(!s.includes('{'), `${l} deixou uma chaveta: ${s}`);
  }
  definirIdioma('pt');
});

// Uma chave que nao exista tem de mostrar a frase certa noutra lingua, e nao
// um codigo a meio do ecra.
test('uma chave em falta cai para o portugues, e nunca mostra a chave', () => {
  definirIdioma('en');
  assert.equal(t('app.nome'), 'Replay');
  assert.equal(t('chave.que.nao.existe'), 'chave.que.nao.existe');
  definirIdioma('pt');
});

test('o plural escolhe a frase certa', () => {
  definirIdioma('pt');
  assert.match(tn(1, 'montagem.umaKill', 'montagem.kills'), /^1 kill$/);
  assert.match(tn(3, 'montagem.umaKill', 'montagem.kills'), /^3 kills$/);
});

test('um idioma desconhecido cai para portugues em vez de rebentar', () => {
  assert.equal(definirIdioma('xx'), 'pt');
  assert.equal(definirIdioma(null), 'pt');
  assert.equal(idiomaActual(), 'pt');
});

test('o idioma do browser e respeitado quando e um dos tres', () => {
  assert.equal(idiomaDoBrowser(['es-AR', 'en']), 'es');
  assert.equal(idiomaDoBrowser(['en-GB']), 'en');
  assert.equal(idiomaDoBrowser(['pt-BR']), 'pt');
  assert.equal(idiomaDoBrowser(['fr-FR', 'de']), 'pt', 'sem nenhum dos tres, portugues');
  assert.equal(idiomaDoBrowser([]), 'pt');
});
