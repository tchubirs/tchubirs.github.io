// A geometria do retrato, sem browser.
//
// É a parte que erra em silêncio. Um rectângulo meio pixel fora da fonte dá
// uma barra preta na beira do vídeo exportado que ninguém vê no editor — e
// só se descobre depois de o clipe estar publicado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETRATO, enquadramentoInicial, limitar, destinos, desenhar, melhorFormato, extensaoDe, FORMATOS,
  formatoQueFunciona,
  reformar, proporcaoDoQuadro, limparDivisao, DIVISAO_MIN, DIVISAO_MAX, DIVISAO_OMISSAO,
  divisaoDoQuadro, encaixar, gravar, noSitio,
} from '../site/retrato.js';

const perto = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

test('um enquadramento abre com a fita 9:16 mais alta que cabe, ao meio', () => {
  const [r] = enquadramentoInicial(1920, 1080, 'um');
  assert.ok(perto(r.altura, 1080), 'usa a altura toda');
  assert.ok(perto(r.largura, 1080 * (9 / 16)), `largura ${r.largura}`);
  assert.ok(perto(r.x, (1920 - r.largura) / 2), 'ao meio');
  assert.equal(r.y, 0);
  assert.ok(perto(r.largura / r.altura, RETRATO.largura / RETRATO.altura), '9:16');
});

test('dois enquadramentos nascem prontos: a webcam no canto, o jogo ao meio', () => {
  const [cima, baixo] = enquadramentoInicial(1920, 1080, 'dois');
  // Cada um com a proporção da SUA faixa, que já não é meia a meia.
  for (const [i, r] of [cima, baixo].entries()) {
    assert.ok(perto(r.largura / r.altura, proporcaoDoQuadro('dois', i)),
      `o ${i} ficou com ${r.largura / r.altura} e devia ter ${proporcaoDoQuadro('dois', i)}`);
    assert.ok(r.largura <= 1920 && r.altura <= 1080, 'cabe na fonte');
  }
  // "Quando clico em dois enquadramentos devia ficar praticamente pronto."
  // A webcam está no canto de baixo à esquerda nos três canais que medi.
  assert.equal(cima.x, 0, 'a webcam encostada à esquerda');
  assert.ok(perto(cima.y + cima.altura, 1080), `a webcam em baixo, e ficou em ${cima.y}`);
  // E o jogo ao meio, que é onde a acção está.
  assert.ok(perto(baixo.x + baixo.largura / 2, 960), 'o jogo centrado na horizontal');
  assert.ok(perto(baixo.y + baixo.altura / 2, 540), 'o jogo centrado na vertical');
});

test('numa fonte 16:9 os dois enquadramentos não nascem no mesmo sítio', () => {
  // Dois rectângulos sobrepostos ao pixel são indistinguíveis de um, e a
  // primeira versão dava-lhes o mesmo sítio.
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [854, 480]]) {
    const [cima, baixo] = enquadramentoInicial(w, h, 'dois');
    assert.ok(cima.x !== baixo.x || cima.y !== baixo.y,
      `${w}x${h}: os dois no mesmo x=${cima.x} y=${cima.y}`);
    assert.ok(cima.altura <= h / 2 + 0.01, `${w}x${h}: cada um devia caber em metade`);
  }
});

test('uma fonte já vertical não gera um enquadramento mais largo do que ela', () => {
  const [r] = enquadramentoInicial(720, 1280, 'um');
  assert.ok(r.largura <= 720, `largura ${r.largura} maior do que a fonte`);
});

test('fonte sem tamanho não dá enquadramento nenhum', () => {
  assert.deepEqual(enquadramentoInicial(0, 0, 'um'), []);
  assert.deepEqual(enquadramentoInicial(1920, 0, 'dois'), []);
});

// ── limitar ─────────────────────────────────────────────────────────────────

test('deslizar é livre, sair não é', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const r = limitar({ x: -500, y: -300, largura: 600, altura: 1066 }, fonte);
  assert.equal(r.x, 0);
  assert.equal(r.y, 0);
});

test('encostado à direita fica com a beira certa e não meio de fora', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const r = limitar({ x: 5000, y: 0, largura: 600, altura: 1066 }, fonte);
  assert.ok(perto(r.x + r.largura, 1920), `acaba em ${r.x + r.largura}`);
});

test('um enquadramento maior do que a fonte encolhe ANTES de se deslocar', () => {
  // Pela ordem contrária ficava encostado a um canto com metade de fora.
  const fonte = { largura: 1920, altura: 1080 };
  const r = limitar({ x: 0, y: 0, largura: 4000, altura: 7111 }, fonte);
  assert.ok(r.largura <= fonte.largura && r.altura <= fonte.altura,
    `${r.largura}x${r.altura} não cabe em ${fonte.largura}x${fonte.altura}`);
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.largura <= fonte.largura + 0.01
    && r.y + r.altura <= fonte.altura + 0.01, 'ficou dentro');
});

test('limitar nunca muda a proporção', () => {
  const fonte = { largura: 1920, altura: 1080 };
  for (const bruto of [
    { x: -900, y: -900, largura: 600, altura: 1066.67 },
    { x: 3000, y: 3000, largura: 5000, altura: 8888 },
    { x: 10, y: 10, largura: 300, altura: 533.33 },
  ]) {
    const antes = bruto.largura / bruto.altura;
    const r = limitar(bruto, fonte);
    assert.ok(perto(r.largura / r.altura, antes, 0.001),
      `${antes} virou ${r.largura / r.altura}`);
  }
});

// ── destinos ────────────────────────────────────────────────────────────────

test('um destino enche o retrato inteiro; dois partem-no ao meio', () => {
  const [u] = destinos('um');
  assert.deepEqual(u, { x: 0, y: 0, largura: 1080, altura: 1920 });
  const [a, b] = destinos('dois');
  assert.equal(a.altura + b.altura, 1920, 'juntos enchem a altura');
  assert.equal(b.y, a.altura, 'o de baixo começa onde o de cima acaba');
  assert.equal(a.largura, 1080);
});

// ── desenhar ────────────────────────────────────────────────────────────────

/** Um contexto 2D do tamanho exacto do que este código toca. */
function ctxFalso() {
  const feito = [];
  return {
    feito,
    fillStyle: '',
    fillRect: (...a) => feito.push(['fill', ...a]),
    drawImage: (...a) => feito.push(['img', ...a.slice(1)]),
  };
}

test('pinta o fundo antes de tudo', () => {
  // Sem isto, um enquadramento que não encha o destino ao pixel deixa a tira
  // do frame anterior a espreitar na beira.
  const ctx = ctxFalso();
  desenhar(ctx, {}, enquadramentoInicial(1920, 1080, 'um'), 'um');
  assert.equal(ctx.feito[0][0], 'fill');
  assert.deepEqual(ctx.feito[0].slice(1), [0, 0, 1080, 1920]);
});

test('dois enquadramentos dão dois desenhos, nos dois destinos', () => {
  const ctx = ctxFalso();
  const n = desenhar(ctx, {}, enquadramentoInicial(1920, 1080, 'dois'), 'dois');
  assert.equal(n, 2);
  const imagens = ctx.feito.filter((f) => f[0] === 'img');
  assert.equal(imagens.length, 2);
  assert.equal(imagens[0][6], 0, 'o primeiro aterra no topo');
  // A divisão de omissão já não é meia a meia: a webcam leva menos.
  assert.equal(imagens[1][6], Math.round(RETRATO.altura * DIVISAO_OMISSAO),
    'o segundo aterra onde a primeira faixa acaba');
});

test('um enquadramento em falta é saltado, e não desenhado a zero', () => {
  const ctx = ctxFalso();
  desenhar(ctx, {}, [{ x: 0, y: 0, largura: 0, altura: 0 }, null], 'dois');
  assert.equal(ctx.feito.filter((f) => f[0] === 'img').length, 0);
});

// ── formato ─────────────────────────────────────────────────────────────────

test('prefere MP4 e cai no WebM', () => {
  const so = (...bons) => ({ isTypeSupported: (t) => bons.some((b) => t.startsWith(b)) });
  assert.ok(melhorFormato(so('video/mp4')).startsWith('video/mp4'));
  assert.ok(melhorFormato(so('video/webm')).startsWith('video/webm'));
  assert.equal(melhorFormato(so('video/ogg')), null);
  assert.equal(melhorFormato(undefined), null);
});

test('a extensão combina com o tipo', () => {
  assert.equal(extensaoDe('video/mp4;codecs=avc1.42E01E'), 'mp4');
  assert.equal(extensaoDe('video/webm;codecs=vp9,opus'), 'webm');
});

// ── o divisor ───────────────────────────────────────────────────────────────
//
// "Um controlo para deixar maior a parte de cima, ou arrasta para o outro lado
//  e fica maior a parte de baixo. Mexer na direita afeta directamente os
//  tamanhos na esquerda."
//
// Afecta, e é essa a parte que tem de estar certa: se o quadro de cima passa a
// valer 70% da altura, o RECORTE de cima tem de mudar de forma no mesmo
// instante. Senão o que se vê no editor deixa de ser o que sai no ficheiro.

test('o divisor reparte a altura, e a segunda faixa leva o resto', () => {
  for (const d of [0.2, 1 / 3, 0.5, 0.7, 0.8]) {
    const [cima, baixo] = destinos('dois', d);
    assert.equal(cima.altura + baixo.altura, RETRATO.altura,
      `divisão ${d}: ${cima.altura} + ${baixo.altura} deixa uma risca preta`);
    assert.equal(baixo.y, cima.altura, 'o de baixo começa onde o de cima acaba');
    assert.ok(Math.abs(cima.altura - RETRATO.altura * d) <= 1, `divisão ${d} mal repartida`);
  }
});

test('o divisor não passa dos limites', () => {
  assert.equal(limparDivisao(0), DIVISAO_MIN);
  assert.equal(limparDivisao(1), DIVISAO_MAX);
  assert.equal(limparDivisao(-5), DIVISAO_MIN);
  assert.equal(limparDivisao(NaN), DIVISAO_OMISSAO);
  assert.equal(limparDivisao(undefined), DIVISAO_OMISSAO);
  assert.equal(limparDivisao(0.3), 0.3);
});

test('mexer no divisor muda a FORMA dos dois recortes', () => {
  const fonte = { largura: 1920, altura: 1080 };
  const meio = enquadramentoInicial(1920, 1080, 'dois', 0.5);
  const desigual = reformar(meio, { modo: 'dois', divisao: 0.75, fonte });
  for (const i of [0, 1]) {
    const esperada = proporcaoDoQuadro('dois', i, 0.75);
    assert.ok(Math.abs(desigual[i].largura / desigual[i].altura - esperada) < 0.01,
      `quadro ${i}: ${desigual[i].largura / desigual[i].altura} em vez de ${esperada}`);
  }
  // Com o de cima a valer três quartos, o recorte de cima fica mais ALTO em
  // relação à sua largura do que o de baixo. É o contrário do meio a meio.
  assert.ok(desigual[0].altura / desigual[0].largura > desigual[1].altura / desigual[1].largura);
});

test('reformar mantém o enquadramento onde estava', () => {
  // Sem isto, arrastar o divisor um pixel atirava o enquadramento escolhido
  // para o canto, e havia que o voltar a colocar a cada ajuste.
  const fonte = { largura: 1920, altura: 1080 };
  const original = [{ x: 1200, y: 400, largura: 400, altura: 355.5 },
                    { x: 100, y: 100, largura: 400, altura: 355.5 }];
  const novo = reformar(original, { modo: 'dois', divisao: 0.6, fonte });
  for (const i of [0, 1]) {
    const cxA = original[i].x + original[i].largura / 2;
    const cxB = novo[i].x + novo[i].largura / 2;
    assert.ok(Math.abs(cxA - cxB) < 60, `quadro ${i} saltou de x=${cxA} para ${cxB}`);
  }
});

test('arrastar o divisor de um lado ao outro não faz o recorte crescer sem parar', () => {
  // Conservar a LARGURA em vez da área fazia cada passo tornar o rectângulo
  // mais alto, e mais alto, até encher a fonte toda ao fim de meia dúzia.
  const fonte = { largura: 1920, altura: 1080 };
  let rects = enquadramentoInicial(1920, 1080, 'dois', 0.5);
  const areaInicial = rects[0].largura * rects[0].altura;
  for (const d of [0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.5]) {
    rects = reformar(rects, { modo: 'dois', divisao: d, fonte });
  }
  const areaFinal = rects[0].largura * rects[0].altura;
  assert.ok(areaFinal <= areaInicial * 1.15,
    `a área cresceu de ${Math.round(areaInicial)} para ${Math.round(areaFinal)}`);
  assert.ok(rects[0].x >= 0 && rects[0].y >= 0, 'continua dentro da fonte');
});

test('desenhar reparte a tela pelo divisor', () => {
  const ctx = ctxFalso();
  desenhar(ctx, {}, enquadramentoInicial(1920, 1080, 'dois', 0.7), 'dois', 0.7);
  const imagens = ctx.feito.filter((f) => f[0] === 'img');
  assert.equal(imagens.length, 2);
  assert.equal(imagens[0][6], 0, 'o de cima no topo');
  assert.equal(imagens[0][8], 1344, 'o de cima leva 70% de 1920');
  assert.equal(imagens[1][6], 1344, 'o de baixo começa onde o outro acaba');
  assert.equal(imagens[1][8], 576);
});

// ── mexer num quadro mexe no outro ──────────────────────────────────────────
//
// "Quando mexo no tamanho da webcam devia mexer no outro automaticamente para
//  encaixar. Tenho que mexer em dois lugares para arrumar um."

test('a forma de um quadro diz qual é a divisão', () => {
  // Ida e volta: o quadro que nasce com uma divisão devolve essa divisão.
  for (const d of [0.2, 0.35, 0.5, 0.7, 0.8]) {
    const [cima, baixo] = enquadramentoInicial(1920, 1080, 'dois', d);
    assert.ok(perto(divisaoDoQuadro(cima, 0), d, 0.001), `de cima deu ${divisaoDoQuadro(cima, 0)} e era ${d}`);
    assert.ok(perto(divisaoDoQuadro(baixo, 1), d, 0.001), `de baixo deu ${divisaoDoQuadro(baixo, 1)} e era ${d}`);
  }
});

test('esticar a webcam para baixo dá-lhe mais faixa', () => {
  const [cima] = enquadramentoInicial(1920, 1080, 'dois', 0.35);
  // Mais alto pela mesma largura = mais altura no 9:16.
  const maisAlto = { ...cima, altura: cima.altura * 1.5 };
  assert.ok(divisaoDoQuadro(maisAlto, 0) > 0.35,
    `deu ${divisaoDoQuadro(maisAlto, 0)} e devia crescer`);
});

test('a divisão que sai de um quadro nunca passa dos limites', () => {
  assert.equal(divisaoDoQuadro({ largura: 1, altura: 1000 }, 0), DIVISAO_MAX);
  assert.equal(divisaoDoQuadro({ largura: 1000, altura: 1 }, 0), DIVISAO_MIN);
  assert.equal(divisaoDoQuadro(null), null);
  assert.equal(divisaoDoQuadro({ largura: 0, altura: 0 }), null);
});

// ── os encaixes ─────────────────────────────────────────────────────────────
//
// "Podia colocar as ajudas para deixar centralizado, de baixo para cima, do
//  lado para o outro."

const FONTE = { largura: 1920, altura: 1080 };
const caixa = (x, y) => ({ x, y, largura: 400, altura: 300 });

test('quase ao meio agarra ao meio, e diz que agarrou', () => {
  const r = encaixar(caixa(760, 388), FONTE);
  assert.equal(r.rect.x, (1920 - 400) / 2);
  assert.equal(r.rect.y, (1080 - 300) / 2);
  assert.deepEqual(r.linhas, ['centroX', 'centroY']);
});

test('longe do meio não agarra nada', () => {
  const r = encaixar(caixa(200, 100), FONTE);
  assert.equal(r.rect.x, 200);
  assert.equal(r.rect.y, 100);
  assert.deepEqual(r.linhas, []);
});

test('as quatro bordas agarram', () => {
  assert.deepEqual(encaixar(caixa(10, 500), FONTE).linhas, ['esquerda']);
  assert.deepEqual(encaixar(caixa(1510, 500), FONTE).linhas, ['direita']);
  assert.deepEqual(encaixar(caixa(200, 12), FONTE).linhas, ['cima']);
  assert.deepEqual(encaixar(caixa(200, 770), FONTE).linhas, ['baixo']);
});

test('o meio ganha à borda quando os dois estão ao alcance', () => {
  // Uma caixa quase tão larga como a fonte tem o meio e a borda no mesmo sítio.
  const larga = { x: 5, y: 500, largura: 1900, altura: 300 };
  assert.deepEqual(encaixar(larga, FONTE).linhas, ['centroX']);
});

test('sem fonte não inventa encaixe nenhum', () => {
  assert.deepEqual(encaixar(caixa(10, 10), null).linhas, []);
  assert.equal(encaixar(null, FONTE).rect, null);
});

// "Esses ponto verde maior para alterar escala tem que estar nos quatro cantos
//  dos 2." Com um canto só, encolher pela esquerda obrigava a encolher pela
// direita e depois arrastar a caixa de volta — dois gestos para um.
//
// A regra de um rectângulo: o canto que se puxa manda, e o OPOSTO fica onde
// está. Isto é a conta que o `ligarArrasto` faz, escrita aqui para não se
// perder num ficheiro de mil linhas de interface.
const puxar = (r0, canto, dx, prop) => {
  const oeste = canto === 'no' || canto === 'so';
  const norte = canto === 'no' || canto === 'ne';
  const largura = r0.largura + (oeste ? -dx : dx);
  const altura = largura / prop;
  return {
    largura,
    altura,
    x: oeste ? r0.x + (r0.largura - largura) : r0.x,
    y: norte ? r0.y + (r0.altura - altura) : r0.y,
  };
};

test('puxar um canto deixa o canto oposto onde estava', () => {
  const r0 = { x: 100, y: 200, largura: 400, altura: 400 };
  const dir = (r) => ({ x: r.x + r.largura, y: r.y + r.altura });

  // Sudeste: o noroeste não se mexe.
  const se = puxar(r0, 'se', 80, 1);
  assert.equal(se.x, 100); assert.equal(se.y, 200);
  assert.equal(se.largura, 480);

  // Noroeste: o sudeste não se mexe.
  const no = puxar(r0, 'no', 80, 1);
  assert.deepEqual(dir(no), dir(r0), 'o canto oposto tinha de ficar quieto');
  assert.equal(no.largura, 320, 'puxar o noroeste para dentro encolhe');

  // Nordeste: o sudoeste não se mexe.
  const ne = puxar(r0, 'ne', 60, 1);
  assert.equal(ne.x, 100, 'a esquerda fica');
  assert.equal(ne.y + ne.altura, r0.y + r0.altura, 'o fundo fica');

  // Sudoeste: o nordeste não se mexe.
  const so = puxar(r0, 'so', -60, 1);
  assert.equal(so.x + so.largura, r0.x + r0.largura, 'a direita fica');
  assert.equal(so.y, 200, 'o topo fica');
});

test('a forma continua presa a proporcao da faixa, venha o canto que vier', () => {
  const r0 = { x: 0, y: 0, largura: 300, altura: 100 };
  for (const canto of ['no', 'ne', 'so', 'se']) {
    const r = puxar(r0, canto, 60, 3);
    assert.equal(Number((r.largura / r.altura).toFixed(6)), 3,
      `o canto ${canto} deformou a caixa`);
  }
});

// "Fiz meu primeiro download 9x16 e veio só a foto, não tem vídeo nem som."
//
// Vinha: um `pause()` adiado caía a meio da gravação, o relógio do vídeo não
// andava, e cada frame pintado era o mesmo. O ficheiro saía com uma imagem
// parada e com a faixa muda que um vídeo em pausa produz.
//
// A causa está corrigida na app; isto é o travão para a PRÓXIMA, seja ela
// qual for. Entregar uma fotografia a quem pediu um clipe é mentir.
test('um video que nao anda rebenta, em vez de dar uma foto', async () => {
  // Um vídeo que diz que toca e cujo relógio nunca anda — que é exactamente
  // o que um `pause()` a cair a meio produz.
  const v = {
    videoWidth: 1920, videoHeight: 1080, currentTime: 10,
    play: async () => {}, pause: () => {},
    captureStream: () => ({ getAudioTracks: () => [] }),
  };
  const tela = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {} }),
    captureStream: () => ({ addTrack() {} }),
  };
  class MRFalso {
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  await assert.rejects(
    () => gravar(v, {
      rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }],
      duracaoS: 5,
      formato: 'video/webm',
      criarTela: () => tela,
      MR: MRFalso,
    }),
    (e) => e.name === 'GRAVACAO-PARADA',
    'tinha de recusar em vez de devolver uma imagem parada',
  );
});

// "Acabei de fazer outro, deu várias falhas."
//
// Medido no 9:16 de 31/08 que ele mandou (1080x1920, 22,79 s): os primeiros
// 0,267 s do ficheiro são PRETOS, e os 0,167 s seguintes mostram o ecrã de
// morte do Rust — que no clipe só acontece aos 22,2 s. Meio segundo de lixo
// à cabeça, e a imagem errada.
//
// São duas causas diferentes e cada uma tem o seu teste aqui em baixo.

test('a gravação começa com a imagem pintada, e não com a tela preta', async () => {
  const ordem = [];
  const v = {
    videoWidth: 1920, videoHeight: 1080, currentTime: 10, seeking: false, readyState: 4,
    play: async () => { ordem.push('play'); }, pause: () => {},
    captureStream: () => ({ getAudioTracks: () => [] }),
  };
  const ctx = {
    drawImage() { ordem.push('pintar'); v.currentTime += 0.05; },
    fillRect() {}, clearRect() {}, save() {}, restore() {},
  };
  const tela = { width: 0, height: 0, getContext: () => ctx, captureStream: () => ({ addTrack() {} }) };
  class MRFalso {
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; ordem.push('gravar'); }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['x']) });
      this.onstop?.();
    }
  }
  const { blob } = await gravar(v, {
    rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }],
    duracaoS: 0.2, formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
  });
  assert.ok(blob.size > 0, 'tinha de sair ficheiro');
  assert.equal(ordem[0], 'pintar', `a primeira coisa tinha de ser uma pincelada, foi ${ordem[0]}`);
  assert.ok(
    ordem.indexOf('pintar') < ordem.indexOf('gravar'),
    'o gravador arrancou antes de a tela ter imagem: isso são frames pretos no ficheiro',
  );
});

test('gravar espera que a procura no vídeo aterre, em vez de gravar o frame velho', async () => {
  const ouvintes = new Map();
  const disparar = (nome) => { for (const f of ouvintes.get(nome) || []) f(); };
  let arrancou = false;
  // Onde ele estava a espreitar antes de carregar em gravar: o fim do clipe.
  const v = {
    videoWidth: 1920, videoHeight: 1080, currentTime: 55, seeking: true, readyState: 1,
    addEventListener: (n, f) => { ouvintes.set(n, [...(ouvintes.get(n) || []), f]); },
    removeEventListener: (n, f) => { ouvintes.set(n, (ouvintes.get(n) || []).filter((x) => x !== f)); },
    play: async () => {}, pause: () => {},
    captureStream: () => ({ getAudioTracks: () => [] }),
  };
  const ctx = {
    drawImage() { v.currentTime += 0.05; },
    fillRect() {}, clearRect() {}, save() {}, restore() {},
  };
  const tela = { width: 0, height: 0, getContext: () => ctx, captureStream: () => ({ addTrack() {} }) };
  class MRFalso {
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; arrancou = true; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['x']) });
      this.onstop?.();
    }
  }
  const feito = gravar(v, {
    rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }],
    duracaoS: 0.2, formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
  });
  await new Promise((k) => setTimeout(k, 40));
  assert.equal(arrancou, false, 'gravou por cima de uma procura a meio: o primeiro frame é o do sítio errado');

  // A procura aterra no início do clipe.
  v.currentTime = 10;
  v.seeking = false;
  v.readyState = 4;
  disparar('seeked');
  const { blob } = await feito;
  assert.ok(blob.size > 0);
  assert.ok(arrancou, 'depois de aterrar tinha de gravar');
  // Se o `inicio` tivesse sido lido antes da procura seria 55, e a conta da
  // duração dava negativa para sempre: o clipe nunca acabava.
  assert.ok(v.currentTime > 10 && v.currentTime < 11, `parou em ${v.currentTime}`);
});

test('um vídeo que nunca aterra não prende a gravação para sempre', async () => {
  const ouvintes = new Map();
  const v = {
    seeking: true, readyState: 0,
    addEventListener: (n, f) => { ouvintes.set(n, [...(ouvintes.get(n) || []), f]); },
    removeEventListener: (n, f) => { ouvintes.set(n, (ouvintes.get(n) || []).filter((x) => x !== f)); },
  };
  assert.equal(await noSitio(v, { esperaMs: 30 }), false, 'tinha de desistir e deixar seguir');
  for (const [nome, lista] of ouvintes) {
    assert.equal(lista.length, 0, `ficou um ouvinte de ${nome} pendurado`);
  }
});

test('um vídeo sem readyState conta como pronto, e não fica à espera', async () => {
  assert.equal(await noSitio({ play: async () => {} }), true);
  assert.equal(await noSitio(undefined), true);
});

// "Acabei de fazer uma mas não gostei muito da qualidade, parece que ficou bem
//  ruim." · "Deu várias falhas de falta de bitrate."
//
// Não era impressão dele, e a medida é curta: o `MediaRecorder` do Chrome, sem
// ninguém lhe dizer nada, grava a 2 500 000 bits por segundo — e os dois
// ficheiros que ele mandou têm 2,54 e 2,71 Mbit/s. A 1080x1920 e a 30 imagens
// por segundo isso é 0,04 bits por pixel, que para um jogo é onde o H.264
// começa a partir a imagem em quadrados.
//
// Este teste apanha as duas metades do arranjo: o gravador tem de receber um
// número, e o número tem de dar pelo menos 0,15 bits por pixel a 1080x1920.
test('o retrato é gravado com bitrate declarado, e não com o de omissão', async () => {
  const v = {
    videoWidth: 1920, videoHeight: 1080, currentTime: 10,
    play: async () => {}, pause: () => {},
    captureStream: () => ({ getAudioTracks: () => [] }),
  };
  const tela = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {}, fillRect() {} }),
    captureStream: () => ({ addTrack() {} }),
  };
  let opcoes = null;
  class MRFalso {
    constructor(_fluxo, o) { opcoes = o; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  // O vídeo não anda de propósito: interessa o que foi PEDIDO ao gravador, e
  // isso é decidido antes da primeira pincelada.
  await gravar(v, {
    rects: [{ x: 0, y: 0, largura: 1080, altura: 1080 }],
    duracaoS: 1, formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
  }).catch(() => {});

  assert.ok(opcoes && opcoes.videoBitsPerSecond > 0,
    `o gravador ficou com o bitrate de omissão: ${JSON.stringify(opcoes)}`);
  const porPixel = opcoes.videoBitsPerSecond / (RETRATO.largura * RETRATO.altura * 30);
  assert.ok(porPixel >= 0.15,
    `${(porPixel).toFixed(3)} bits por pixel — é a zona em que a imagem parte`);
  assert.ok(opcoes.audioBitsPerSecond > 0, 'e o som também leva um número');
});

// O formato preferido é o que já se PROVOU que grava som, e não o que parecia
// melhor no papel.
//
// Tentei pôr High/Main à frente do Baseline, com o argumento de que o nível
// 3.0 não chega para 1080x1920 (8 160 macroblocos contra 1 620) e de que
// Baseline não tem CABAC nem frames B. Publiquei, ele exportou, e o ficheiro
// dele disse o contrário do que eu tinha assumido:
//
//   profile=Constrained Baseline   level=40   bit_rate=9 413 851
//   pistas: 1 — só vídeo. SEM SOM.
//
// O Chrome ignora o perfil e o nível pedidos (escolhe o nível pela resolução),
// e com o codec novo a faixa de áudio desapareceu. Zero ganho, som perdido.
// Este teste prende a lista no que está medido.
test('o MP4 preferido é o que grava com som, e não o que parece melhor no papel', () => {
  assert.equal(FORMATOS[0], 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'o primeiro MP4 mudou — mede um ficheiro exportado e conta as pistas antes de o trocar');
  // Todos os MP4 com codecs escritos têm de declarar áudio: um `video/mp4`
  // com só o vídeo lá dentro é a receita do clipe mudo.
  for (const f of FORMATOS.filter((x) => x.includes('codecs='))) {
    assert.match(f, /mp4a|opus/, `${f} não declara codec de áudio nenhum`);
  }
  // E o WebM continua atrás, como rede.
  assert.ok(FORMATOS.indexOf('video/webm;codecs=vp9,opus') > FORMATOS.indexOf('video/mp4'),
    'o WebM passou à frente do MP4');
});

// A prova de formato tem de gravar COM SOM.
//
// Era só de vídeo, e por isso aprovava um formato que grava imagem e deita o
// áudio fora — que foi exactamente o que aconteceu.
test('a prova de formato leva uma faixa de som, como a gravação a sério', async () => {
  const pistas = [];
  const tela = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    captureStream: () => ({
      addTrack: (f) => pistas.push(f),
      getTracks: () => [{ stop() {} }],
    }),
  };
  class MRFalso {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; this.ondataavailable?.({ data: { size: 10 } }); }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  // Um `AudioContext` de mentira, para se poder ver se a prova o usa.
  let fechado = false;
  const antes = globalThis.AudioContext;
  globalThis.AudioContext = class {
    createMediaStreamDestination() {
      return { stream: { getAudioTracks: () => [{ nome: 'som-de-prova', stop() {} }] } };
    }

    createConstantSource() { return { connect() {} }; }

    close() { fechado = true; return Promise.resolve(); }
  };
  try {
    const tipo = await formatoQueFunciona({ MR: MRFalso, criarTela: () => tela, msPorTentativa: 5 });
    assert.equal(tipo, FORMATOS[0], 'devia ficar no primeiro que produziu bytes');
    assert.deepEqual(pistas.map((f) => f.nome), ['som-de-prova'],
      'a prova gravou só imagem — é assim que passa um formato que deita o som fora');
    assert.equal(fechado, true, 'o contexto de áudio ficou aberto depois da prova');
  } finally {
    if (antes) globalThis.AudioContext = antes; else delete globalThis.AudioContext;
  }
});

// E sem `AudioContext` a prova continua a valer: um ambiente que não o tem
// (um teste, um browser velho) não pode ficar sem formato nenhum.
test('sem AudioContext a prova de formato continua a dar resposta', async () => {
  const tela = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    captureStream: () => ({ addTrack() {}, getTracks: () => [{ stop() {} }] }),
  };
  class MRFalso {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; this.ondataavailable?.({ data: { size: 10 } }); }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  const antes = globalThis.AudioContext;
  delete globalThis.AudioContext;
  try {
    assert.equal(
      await formatoQueFunciona({ MR: MRFalso, criarTela: () => tela, msPorTentativa: 5 }),
      FORMATOS[0],
    );
  } finally {
    if (antes) globalThis.AudioContext = antes;
  }
});
