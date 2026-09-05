// O teste que faltava.
//
// A versao anterior desta busca procurava ritmo, e o dono viu quinze clipes
// que ela deu: nenhum era uma kill. A conta estava a apanhar a VOZ dele — a
// cadencia das silabas de quem fala e 4 a 7 Hz, e a janela que eu procurava
// era 3,6 a 14 Hz. Nenhum teste apanhou isso porque nenhum teste tinha fala
// dentro. Estes tem.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  energia, medir, chao, impulsos, lutas, procurarTiros, TAXA_TIROS, FPS, BRILHO_MIN,
} from '../site/tiros.js';

const TAXA = TAXA_TIROS;

// Um gerador de ruido repetivel: os testes nao podem depender de Math.random.
const aleatorio = (semente) => {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
};

/** Fundo: um sopro baixinho, como uma sala com um computador a trabalhar. */
function fundo(segundos, { forca = 0.01, semente = 1 } = {}) {
  const r = aleatorio(semente);
  const x = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < x.length; i++) x[i] = r() * forca;
  return x;
}

/**
 * Fala: silabas a 5 Hz.
 *
 * Uma portadora de 200 Hz com harmonicas ate 2 kHz — que e onde a voz vive —
 * com o volume a abrir e fechar cinco vezes por segundo. E isto que a conta
 * antiga achava que era um tiroteio.
 */
function falar(x, deS, ateS, { forca = 0.25 } = {}) {
  for (let i = Math.round(deS * TAXA); i < Math.round(ateS * TAXA) && i < x.length; i++) {
    const t = i / TAXA;
    // O `0.12 +` nao e enfeite. A primeira versao deste gerador punha a voz a
    // cair a ZERO absoluto entre silabas, e assim cada silaba comecava com um
    // salto infinito — o detector disparava, e a culpa era do gerador. Uma voz
    // verdadeira assenta sempre no chao do microfone e do jogo, e nunca chega
    // ao silencio digital.
    const silaba = 0.12 + 0.88 * Math.max(0, Math.sin(2 * Math.PI * 5 * t)) ** 2;
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * 200 * h * t) / h;
    x[i] += forca * silaba * v;
  }
  return x;
}

/**
 * Um tiro: um estouro de banda larga que sobe num instante e morre em 80 ms.
 * Sem cadencia nenhuma — os instantes vao onde quem chama quiser.
 */
function tiro(x, quandoS, { forca = 1, semente = 7 } = {}) {
  const r = aleatorio(semente + Math.round(quandoS * 1000));
  const i0 = Math.round(quandoS * TAXA);
  const dur = Math.round(0.08 * TAXA);
  for (let k = 0; k < dur && i0 + k < x.length; k++) {
    // Ataque em 1 ms, queda exponencial: e o desenho de um estouro.
    const env = k < TAXA / 1000 ? k / (TAXA / 1000) : Math.exp(-k / (0.012 * TAXA));
    x[i0 + k] += forca * env * r() * 2;
  }
  return x;
}

test('o chão é o silêncio, e não a média de uma noite com tiroteios', () => {
  const x = fundo(20);
  for (let i = 0; i < 40; i++) tiro(x, 5 + i * 0.1, { forca: 3 });
  const b = energia(x);
  const piso = chao(b);
  let maior = 0;
  for (const v of b) maior = Math.max(maior, v);
  // Quarenta tiros num vinte avos da noite nao podem levantar o chao: se o
  // levantassem, "o pico mais alto" deixava de querer dizer alguma coisa.
  assert.ok(maior / piso > 20, `os tiros so estao ${(maior / piso).toFixed(1)}x acima do chao`);
});

// O teste que teria apanhado o erro. Um streamer fala a noite inteira.
test('falar dez minutos não é um tiroteio', () => {
  const x = fundo(60);
  falar(x, 0, 60);
  assert.deepEqual(procurarTiros(x), [], 'a voz dele não pode virar uma kill');
});

test('falar alto também não', () => {
  const x = fundo(60);
  falar(x, 0, 60, { forca: 0.9 });
  assert.deepEqual(procurarTiros(x), [], 'gritar não é disparar');
});

// Musica: grave, forte e com cadencia certinha. E o outro falso positivo
// obvio de uma conta que olha para ritmo.
test('música com batida certa não é um tiroteio', () => {
  const x = fundo(60);
  for (let i = 0; i < 120; i++) {
    // Um bombo: 60 Hz, meio segundo, sem agudo nenhum.
    const i0 = Math.round(i * 0.5 * TAXA);
    for (let k = 0; k < TAXA * 0.2 && i0 + k < x.length; k++) {
      x[i0 + k] += 0.6 * Math.exp(-k / (0.05 * TAXA)) * Math.sin((2 * Math.PI * 60 * k) / TAXA);
    }
  }
  assert.deepEqual(procurarTiros(x), [], 'uma batida grave não é um estouro');
});

test('um tiroteio é achado, mesmo com ele a falar por cima', () => {
  const x = fundo(60);
  falar(x, 0, 60);
  // Seis tiros em quatro segundos, com intervalos IRREGULARES — que e como se
  // dispara a serio, e o que a conta antiga nao aceitava.
  for (const s of [30.0, 30.4, 31.1, 31.3, 32.6, 33.4]) tiro(x, s);
  const r = procurarTiros(x);
  assert.equal(r.length, 1, `esperava uma luta, deu ${r.length}`);
  assert.ok(Math.abs(r[0].inicioS - 30) < 1, `achou aos ${r[0].inicioS.toFixed(1)}s`);
  assert.ok(r[0].tiros >= 4, `só contou ${r[0].tiros} tiros`);
});

test('dois tiros perdidos não são uma luta', () => {
  const x = fundo(60);
  tiro(x, 12);
  tiro(x, 40);
  assert.deepEqual(procurarTiros(x), [], 'um tiro ao longe não é uma kill dele');
});

// "Quando ocorre um acerto na cabeca, o som e muito alto." Por isso a lista
// nao sai por ordem do relogio: sai com o pico maior a frente.
test('a luta com o som mais alto vem primeiro', () => {
  const x = fundo(120);
  for (const s of [10, 10.5, 11, 11.6, 12.2]) tiro(x, s, { forca: 0.8 });
  for (const s of [70, 70.4, 71, 71.5, 72.1]) tiro(x, s, { forca: 4 });   // o headshot
  const r = procurarTiros(x);
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r[0].inicioS - 70) < 1, 'a mais alta tem de vir a frente');
  assert.ok(r[0].pico > r[1].pico);
});

// Um tiroteio longo e uma sequencia de trocas, e nao um bloco de dez minutos:
// um clipe de dez minutos nao serve para montagem nenhuma.
test('uma troca de tiros longa é cortada, e não vira um bloco sem fim', () => {
  const x = fundo(300);
  for (let i = 0; i < 200; i++) tiro(x, 20 + i * 1.2);
  const r = procurarTiros(x);
  assert.ok(r.length > 1, 'quatro minutos a disparar não podem ser um candidato só');
  for (const g of r) assert.ok(g.duracaoS <= 91, `uma luta de ${g.duracaoS.toFixed(0)}s`);
});

test('som mudo não inventa nada', () => {
  assert.deepEqual(procurarTiros(new Float32Array(TAXA * 10)), []);
  assert.deepEqual(procurarTiros(new Float32Array(0)), []);
  assert.equal(chao([]), 0);
  assert.deepEqual(impulsos(new Float32Array(100), 0), [], 'sem chão não há altura');
});

test('as lutas saem com os segundos certos', () => {
  const imps = [0, 100, 200, 300, 400].map((b) => ({ bloco: b, altura: 10 }));
  const [g] = lutas(imps);
  assert.equal(g.inicioS, 0);
  assert.equal(g.fimS, 400 / FPS);
  assert.equal(g.tiros, 5);
});

// ── o brilho ────────────────────────────────────────────────────────────────
//
// Ele mandou um clipe de dez segundos onde nao disparou nada e onde o detector
// via um tiroteio inteiro. Fui ouvi-lo: eram ONZE SILABAS. Um a um, cada um
// desses "tiros" tinha entre 0,003 e 0,090 de energia acima de 4 kHz por cada
// unidade abaixo de 1,5 kHz — quase tudo grave, que e onde uma voz vive. Um
// estouro de banda larga da 0,23 a 1,03.
//
// A razao pela qual as duas condicoes antigas nao chegavam e a mesma pela qual
// subir o corte do passa-alto tambem nao chegava: as duas sao RAZOES — contra
// o chao e contra 2 ms antes — e uma razao nao muda quando se atenua os dois
// lados por igual. Precisava de uma medida que olhasse para DENTRO do
// instante, e nao para o que veio antes.
//
// Isto e o que ele descreveu e eu nao tinha: "eu nao dou 1 tiro".

/**
 * Uma plosiva: um "p" ou um "t" ao microfone, depois de uma pausa.
 *
 * Sobe num milissegundo — tao depressa como um estouro — mas nao tem nada
 * acima de 1,5 kHz. E este o som que passava as duas condicoes antigas.
 */
function plosiva(x, quandoS, { forca = 1 } = {}) {
  const i0 = Math.round(quandoS * TAXA);
  const dur = Math.round(0.06 * TAXA);
  for (let k = 0; k < dur && i0 + k < x.length; k++) {
    const t = k / TAXA;
    const env = k < TAXA / 1000 ? k / (TAXA / 1000) : Math.exp(-k / (0.010 * TAXA));
    // Tres graves e nada mais: 120, 260 e 500 Hz.
    const v = Math.sin(2 * Math.PI * 120 * t)
      + 0.7 * Math.sin(2 * Math.PI * 260 * t)
      + 0.4 * Math.sin(2 * Math.PI * 500 * t);
    x[i0 + k] += forca * env * v;
  }
  return x;
}

test('um estouro de banda larga é brilhante e uma plosiva não', () => {
  const x = fundo(4);
  tiro(x, 1.0, { forca: 3 });
  plosiva(x, 2.0, { forca: 3 });
  const { brilho } = medir(x);
  const naVolta = (s) => {
    let melhor = 0;
    const c = Math.round(s * FPS);
    for (let b = c; b < c + 10; b++) melhor = Math.max(melhor, brilho[b]);
    return melhor;
  };
  assert.ok(naVolta(1.0) > BRILHO_MIN,
    `o estouro devia passar o brilho e deu ${naVolta(1.0).toFixed(3)}`);
  assert.ok(naVolta(2.0) < BRILHO_MIN,
    `a plosiva devia chumbar no brilho e deu ${naVolta(2.0).toFixed(3)}`);
});

test('uma fila de plosivas não é um tiroteio — e sem o brilho seria', () => {
  const x = fundo(30);
  // Seis silabas em cadencia de fala, altas e bruscas. E o clipe dele.
  for (let i = 0; i < 6; i++) plosiva(x, 10 + i * 0.16, { forca: 2.5 });

  assert.deepEqual(procurarTiros(x), [], 'seis sílabas não são seis tiros');

  // A prova de que o teste mede o que diz medir: DESLIGANDO so o brilho, o
  // mesmo som volta a dar um tiroteio. Sem esta metade, o teste acima passava
  // por qualquer razao — incluindo por nao haver impulso nenhum.
  const { energia: blocos, brilho } = medir(x);
  const piso = chao(blocos);
  const semBrilho = impulsos(blocos, piso, { brilhos: brilho, brilhoMin: 0 });
  assert.ok(semBrilho.length >= 4,
    `sem o brilho tinham de sobrar impulsos e sobraram ${semBrilho.length}`);
  assert.ok(lutas(semBrilho).length >= 1, 'sem o brilho isto era uma luta');
});

test('o brilho não come os tiros verdadeiros', () => {
  const x = fundo(30);
  for (let i = 0; i < 6; i++) tiro(x, 10 + i * 0.16, { forca: 3 });
  const achadas = procurarTiros(x);
  assert.equal(achadas.length, 1, 'seis tiros seguidos são uma luta');
  assert.ok(achadas[0].tiros >= 4, `só contou ${achadas[0].tiros} disparos`);
});

test('falar por cima de um tiroteio não apaga o tiroteio', () => {
  const x = fundo(30);
  falar(x, 0, 30, { forca: 0.6 });
  for (let i = 0; i < 6; i++) tiro(x, 10 + i * 0.16, { forca: 3 });
  assert.equal(procurarTiros(x).length, 1, 'a voz por cima não pode esconder os tiros');
});

// ── a rajada, e o clipe que sai dela ────────────────────────────────────────
//
// "Os clipes são de setenta segundos. Se eu configurei zero segundos antes e
//  zero depois, era pra ser exatamente: eu disparo, a pessoa morre, e acaba."
//
// A forma destes números foi medida numa luta verdadeira dele, no VOD da Kick:
// cinco impulsos em 13,6 s, com um silêncio de 10,5 s no meio e o tiro mais
// alto no grupo do fim. O clipe levava os 13,6 s inteiros — dez deles de nada.

/** Impulsos aos segundos que se quiser, com a altura que se quiser. */
const nosSegundos = (pares) => pares.map(([s, altura]) => ({ bloco: Math.round(s * FPS), altura }));

test('o instante de uma luta é o do tiro mais alto, e não o do primeiro', () => {
  const [g] = lutas(nosSegundos([[10, 12], [10.5, 40], [11, 15], [11.5, 13]]));
  assert.equal(g.picoS, 10.5, `o pico ficou em ${g.picoS}`);
  assert.equal(g.inicioS, 10, 'a luta continua a começar no primeiro');
});

test('a rajada corta o silêncio que vem antes dela', () => {
  // A luta verdadeira dele, à escala: um tiro solto, dez segundos de nada, e
  // depois a rajada com o tiro mais alto lá dentro.
  const [g] = lutas(nosSegundos([[0, 10], [10.5, 14], [10.6, 17], [11.5, 30], [13.6, 24]]));
  assert.equal(g.duracaoS, 13.6, 'a luta inteira continua a ser a luta inteira');
  assert.equal(g.picoS, 11.5);
  assert.equal(g.rajadaDeS, 10.5, `a rajada começou em ${g.rajadaDeS} e devia ser 10,5`);
  assert.equal(g.rajadaAteS, 13.6, `a rajada acabou em ${g.rajadaAteS}`);
  // A prova ao contrário: sem a rajada, o clipe seria os 13,6 s todos.
  assert.ok(g.rajadaAteS - g.rajadaDeS < g.duracaoS / 4,
    'a rajada tinha de ser bem mais curta do que a luta');
});

test('uma rajada só, sem silêncios, é a luta inteira', () => {
  // A outra luta do mesmo VOD: cinco impulsos em três décimos de segundo.
  const [g] = lutas(nosSegundos([[5, 20], [5.08, 43], [5.14, 24], [5.2, 18], [5.3, 16]]));
  assert.equal(g.rajadaDeS, 5, 'aqui a rajada é tudo');
  assert.equal(g.rajadaAteS, 5.3);
});

test('o intervalo da rajada é mais curto do que o da luta', () => {
  // Dois grupos a quatro segundos um do outro: a luta junta-os (catorze), a
  // rajada não (três). Se os dois números fossem o mesmo, isto não separava.
  const [g] = lutas(nosSegundos([[0, 10], [0.2, 11], [4.2, 12], [4.4, 30], [4.6, 13]]));
  assert.equal(g.tiros, 5, 'a luta tem os cinco');
  assert.equal(g.rajadaDeS, 4.2, `a rajada começou em ${g.rajadaDeS}`);
});
