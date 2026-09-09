// As tres linguas, e a garantia de que nenhuma fica para tras.
//
// Uma traducao que falta nao pode aparecer como um codigo a meio do ecra, e
// uma chave que so existe numa lingua e uma frase que alguem nunca vai ler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IDIOMAS, t, tn, definirIdioma, idiomaActual, idiomaDoBrowser, _TEXTOS,
} from '../site/idiomas.js';

// "Tudo que tem em português tem traduzido pros outros idiomas quando trocam
//  de idioma."
//
// Uma chave que ninguém escreveu não rebenta: o `t()` devolve a própria chave,
// e o que aparece no ecrã é `procurar.nada` em vez de uma frase. Foi assim
// que essa esteve escrita na página da Twitch sem ninguém dar por ela. Este
// teste lê os ficheiros à procura de TODAS as chaves usadas — nos `data-t` do
// HTML e nas chamadas a `t()` e `tn()` no código — e exige que existam nas
// três línguas.
test('nenhuma chave usada na página fica por escrever', () => {
  const ler = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const usadas = new Set();
  for (const f of ['../site/index.html', '../site/twitch.html']) {
    for (const m of ler(f).matchAll(/data-t(?:-html|-aria|-ph|-titulo)?="([a-zA-Z0-9_.]+)"/g)) {
      usadas.add(m[1]);
    }
  }
  for (const f of ['../site/app.js', '../site/twitch-app.js']) {
    const codigo = ler(f);
    for (const m of codigo.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) usadas.add(m[1]);
    for (const m of codigo.matchAll(/\btn\([^,]+,\s*'([a-zA-Z0-9_.]+)',\s*'([a-zA-Z0-9_.]+)'/g)) {
      usadas.add(m[1]); usadas.add(m[2]);
    }
  }
  assert.ok(usadas.size > 100, `so encontrei ${usadas.size} chaves — a leitura partiu-se`);
  for (const lingua of ['pt', 'en', 'es']) {
    const faltam = [...usadas].filter((k) => !(k in _TEXTOS[lingua])).sort();
    assert.deepEqual(faltam, [], `sem tradução em ${lingua}: ${faltam.join(', ')}`);
  }
});

// E o contrário: texto escrito à mão no HTML, que troca de idioma nenhuma
// muda. O `dev` do rodapé é o carimbo da versão e não é uma frase.
test('nenhuma frase do HTML ficou escrita à mão', () => {
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, '');
  const soltas = [];
  for (const m of html.matchAll(/<(\w+)([^>]*)>([^<>]{2,})<\/\1>/g)) {
    const [, tag, atributos, corpo] = m;
    if (tag === 'option' || tag === 'title') continue;
    if (atributos.includes('data-t')) continue;
    if (corpo.trim() === 'dev') continue;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(corpo)) continue;
    soltas.push(`<${tag}> ${corpo.trim().slice(0, 40)}`);
  }
  assert.deepEqual(soltas, [], `texto sem tradução: ${soltas.join(' · ')}`);
});

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
    'tempo.menos5m', 'tempo.menos3s', 'tempo.mais3s', 'tempo.mais5m',
    'montagem.umaKill', 'montagem.kills',
    // "A–Z" escreve-se assim em toda a parte, e o "Esc" e a legenda que esta
    // impressa na propria tecla.
    'grelha.az', 'ajuda.teclaEsc',
  ]),
  // O espanhol e o portugues escrevem estas exactamente da mesma maneira.
  es: new Set([
    'app.nome', 'canais.vods', 'marca.feita', 'clipe.tempo',
    // "Abrir", "Editar", "Guardar ajustes" e "ajustado" escrevem-se igual.
    'link.abrir', 'fila.editar', 'clipe.guardarAjustes', 'montagem.ajustado',
    'montagem.ajustadoRetrato', 'fila.retratoDe',
    'tempo.menos5m', 'tempo.menos3s', 'tempo.mais3s', 'tempo.mais5m',
    'tempo.menos1m', 'tempo.menos10s', 'tempo.mais10s', 'tempo.mais1m',
    'tempo.menos5m', 'tempo.menos3s', 'tempo.mais3s', 'tempo.mais5m',
    'montagem.umaKill', 'montagem.kills', 'montagem.marcar',
    // "Exportar retrato" e "A–Z" escrevem-se exactamente assim nas duas.
    'retrato.exportar', 'grelha.az', 'ajuda.teclaEsc',
    'procurar.seguidores', 'noite.todosJuntos', 'noite.umCanal',
    'tile.atrasar', 'alinhar.cancelado', 'montagem.antes', 'montagem.ir',
    'corte.titulo', 'corte.antes', 'clipe.cancelar',
    'sel.todos',
    'montagem.parar', 'ajuda.kill',
    // Palavras que o portugues e o espanhol escrevem exactamente igual.
    'marca.inicio', 'tw.parar', 'montagem.baixarUma', 'montagem.pronto', 'corte.baixar',
    'clipe.parar',
    // "Exportar 16:9" e "Exportar 9:16" sao o mesmo nas duas linguas — e o
    // numero e a metade que interessa. Ele abriu a janela e nao encontrou a
    // versao horizontal; agora os dois botoes dizem qual e qual.
    'clipe.guardar', 'retrato.exportar',
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
