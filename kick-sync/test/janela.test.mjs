// A decisão de como tirar um ângulo do meio da grelha, sem browser.
//
// O que se prova aqui é a escolha e o regresso ao lugar. O resto — a janela
// abrir mesmo — é do browser, e não há Document PiP no Chromium sem cabeça
// (medido: `window.documentPictureInPicture` é `undefined` lá), por isso a
// alternativa a isto não seria um teste melhor, seria nenhum.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  comoAbrirJanela, comoIrAEcraCheio, capacidades, copiarEstilos, abrirJanela,
} from '../site/janela.js';

test('escolhe a janela de documento quando existe', () => {
  assert.equal(comoAbrirJanela({ documentoPiP: true, videoPiP: true }), 'documento');
});

test('sem janela de documento cai no PiP do vídeo', () => {
  assert.equal(comoAbrirJanela({ documentoPiP: false, videoPiP: true }), 'video');
});

test('sem nenhum dos dois não inventa nada', () => {
  assert.equal(comoAbrirJanela({ documentoPiP: false, videoPiP: false }), 'nada');
  assert.equal(comoAbrirJanela({}), 'nada');
});

test('o ecrã cheio tem o caminho do iPhone por baixo', () => {
  assert.equal(comoIrAEcraCheio({ fullscreen: true, webkitVideo: true }), 'ecraCheio');
  // O iPhone: `requestFullscreen` não existe num `<div>`, só o `<video>` sabe.
  assert.equal(comoIrAEcraCheio({ fullscreen: false, webkitVideo: true }), 'ecraCheioWebkit');
  assert.equal(comoIrAEcraCheio({ fullscreen: false, webkitVideo: false }), 'nada');
});

test('lê as capacidades sem rebentar num sítio sem browser nenhum', () => {
  assert.deepEqual(capacidades({}), {
    documentoPiP: false, videoPiP: false, fullscreen: false, webkitVideo: false,
  });
});

test('lê as capacidades de um browser a fingir', () => {
  const falso = {
    documentPictureInPicture: { requestWindow() {} },
    HTMLVideoElement: { prototype: { requestPictureInPicture() {}, webkitEnterFullscreen() {} } },
    Element: { prototype: { requestFullscreen() {} } },
  };
  assert.deepEqual(capacidades(falso), {
    documentoPiP: true, videoPiP: true, fullscreen: true, webkitVideo: true,
  });
});

// ── copiar os estilos ───────────────────────────────────────────────────────
// Uma janela nova nasce sem uma única regra. Sem isto o quadrado aparece lá
// dentro em HTML por pintar, e uma folha de outro domínio (o Google Fonts)
// atira ao ler `cssRules` — sem o `try`, isso rebentava a abertura inteira.

function documentoFalso() {
  const head = { filhos: [], appendChild(n) { this.filhos.push(n); } };
  return {
    head,
    createElement: (tag) => ({ tag, textContent: '', rel: '', href: '' }),
  };
}

test('copia as regras que consegue ler', () => {
  const de = { styleSheets: [{ cssRules: [{ cssText: 'a{color:red}' }, { cssText: 'b{color:blue}' }] }] };
  const para = documentoFalso();
  assert.equal(copiarEstilos(de, para), 1);
  assert.equal(para.head.filhos[0].tag, 'style');
  assert.equal(para.head.filhos[0].textContent, 'a{color:red}b{color:blue}');
});

test('uma folha de outro domínio entra por href em vez de rebentar', () => {
  const de = {
    styleSheets: [{
      href: 'https://fonts.googleapis.com/css2?family=Rajdhani',
      get cssRules() { throw new Error('SecurityError'); },
    }],
  };
  const para = documentoFalso();
  assert.equal(copiarEstilos(de, para), 1);
  assert.equal(para.head.filhos[0].tag, 'link');
  assert.equal(para.head.filhos[0].href, 'https://fonts.googleapis.com/css2?family=Rajdhani');
});

test('uma folha ilegível e sem href é saltada, não copiada vazia', () => {
  const de = { styleSheets: [{ get cssRules() { throw new Error('SecurityError'); } }] };
  const para = documentoFalso();
  assert.equal(copiarEstilos(de, para), 0);
  assert.equal(para.head.filhos.length, 0);
});

// ── voltar ao lugar ─────────────────────────────────────────────────────────
// "Os canais deveriam ficar na ordem que eu adiciono." Fechar a janela não pode
// desfazer isso: o quadrado tem de voltar ao sítio de onde saiu, e não para o
// fim da grelha.

/** Um DOM do tamanho exacto do que este código toca. */
function grelhaFalsa(nomes) {
  const filhos = [];
  const pai = {
    filhos,
    insertBefore(no, antes) {
      const i = filhos.indexOf(antes);
      filhos.splice(i < 0 ? filhos.length : i, 0, no);
      no.parentNode = pai;
    },
  };
  for (const nome of nomes) {
    filhos.push({
      nome, parentNode: pai,
      querySelector: () => ({}),
      remove() { const i = filhos.indexOf(this); if (i >= 0) filhos.splice(i, 1); this.parentNode = null; },
    });
  }
  return pai;
}

test('a janela de documento devolve o quadrado ao sítio de onde saiu', async () => {
  const grelha = grelhaFalsa(['a', 'tchubi', 'c', 'd']);
  const tile = grelha.filhos[1];
  const ouvintes = {};
  const corpo = {
    style: {}, classList: { add() {} },
    appendChild(no) { no.parentNode?.remove?.call?.(no); this.no = no; },
  };
  // O `appendChild` do browser TIRA o nó de onde estava. Aqui é preciso
  // reproduzi-lo à mão, senão o teste passa por uma razão errada.
  corpo.appendChild = function (no) {
    const i = grelha.filhos.indexOf(no);
    if (i >= 0) grelha.filhos.splice(i, 1);
    this.no = no;
  };
  const nova = {
    document: { body: corpo, head: { appendChild() {} }, createElement: (t) => ({ tag: t }) },
    addEventListener(nome, fn) { ouvintes[nome] = fn; },
    close() { ouvintes.pagehide?.(); },
  };
  let fechou = 0;
  const janela = {
    documentPictureInPicture: { requestWindow: async () => nova },
    HTMLVideoElement: { prototype: {} },
    Element: { prototype: {} },
    document: { styleSheets: [], createComment: () => ({ parentNode: null, remove() { this.parentNode = null; } }) },
  };
  // O comentário precisa de saber onde está, como o do browser.
  janela.document.createComment = () => {
    const c = { parentNode: null };
    c.remove = () => { const i = grelha.filhos.indexOf(c); if (i >= 0) grelha.filhos.splice(i, 1); };
    return c;
  };

  const r = await abrirJanela(tile, { janela, aoFechar: () => { fechou++; } });
  assert.equal(r.modo, 'documento');
  assert.deepEqual(grelha.filhos.filter((f) => f.nome).map((f) => f.nome), ['a', 'c', 'd'],
    'o quadrado saiu da grelha');

  r.fechar();
  assert.equal(fechou, 1);
  assert.deepEqual(grelha.filhos.map((f) => f.nome), ['a', 'tchubi', 'c', 'd'],
    'voltou para o meio, e não para o fim');
});

test('sem janela nenhuma disponível devolve null em vez de atirar', async () => {
  const janela = { HTMLVideoElement: { prototype: {} }, Element: { prototype: {} } };
  assert.equal(await abrirJanela({}, { janela }), null);
});
