// O chat por cima do clipe exportado (site/chat-clipe.js): que mensagens estão no ecrã em cada
// instante, como somem, onde ficam em cada formato, como se partem em linhas, e que o texto de quem
// escreve só entra na tela como texto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  limparChat, mensagensVisiveis, mensagensDoClipe, corDoAutor, partesDaMensagem, geometria, quebrarLinhas,
  arrumarChat, desenharChat, VIDA_MS, SUMIR_MS, CHAT_OMISSAO, POSICOES, TAMANHOS, LINHAS_MIN, LINHAS_MAX,
} from '../site/chat-clipe.js';
import { gravar, DEITADO, RETRATO, desenharInteiro } from '../site/retrato.js';

const T0 = Date.parse('2026-08-30T21:00:00Z');
const msg = (s, texto = 'oi', autor = 'fulano') => ({ id: `m${s}-${texto}`, ms: T0 + s * 1000, texto, autor });

test('as escolhas estragadas voltam ao de omissão, e o chat nasce desligado', () => {
  assert.deepEqual(limparChat(null), { ...CHAT_OMISSAO });
  assert.equal(limparChat({}).ligado, false);
  assert.equal(limparChat({ ligado: 'sim' }).ligado, false, 'só true liga');
  const c = limparChat({ ligado: true, posicao: 'lua', tamanho: 'xl', linhas: 99, fundo: 'rosa' });
  assert.deepEqual(c, { ...CHAT_OMISSAO, ligado: true, linhas: LINHAS_MAX });
  assert.equal(limparChat({ linhas: '2' }).linhas, LINHAS_MIN);
  assert.equal(limparChat({ linhas: '7' }).linhas, 7);
});

test('uma mensagem entra no segundo em que foi escrita, e não antes', () => {
  const lista = [msg(10, 'a')];
  assert.equal(mensagensVisiveis(lista, T0 + 9999).length, 0);
  assert.equal(mensagensVisiveis(lista, T0 + 10_000).length, 1);
  assert.equal(mensagensVisiveis(lista, T0 + 10_000)[0].alfa, 1);
});

test('fica VIDA_MS no ecrã e some nos últimos SUMIR_MS', () => {
  const lista = [msg(0, 'a')];
  assert.equal(mensagensVisiveis(lista, T0 + VIDA_MS - SUMIR_MS)[0].alfa, 1);
  const meio = mensagensVisiveis(lista, T0 + VIDA_MS - SUMIR_MS / 2)[0].alfa;
  assert.ok(Math.abs(meio - 0.5) < 1e-9, `a meio do sumiço devia estar a meio, está ${meio}`);
  assert.equal(mensagensVisiveis(lista, T0 + VIDA_MS).length, 0, 'passada a vida, sai');
});

test('as mais novas ganham o lugar, e vêm da mais velha para a mais nova', () => {
  const lista = Array.from({ length: 9 }, (_, i) => msg(i, `n${i}`));
  const v = mensagensVisiveis(lista, T0 + 8500, 4);
  assert.deepEqual(v.map((x) => x.m.texto), ['n5', 'n6', 'n7', 'n8']);
  // Depois da última, ninguém novo entra: as mesmas quatro até começarem a sumir.
  assert.deepEqual(mensagensVisiveis(lista, T0 + 12_000, 4).map((x) => x.m.texto), ['n5', 'n6', 'n7', 'n8']);
  assert.deepEqual(mensagensVisiveis(lista, T0 + 15_500, 4).map((x) => x.m.texto), ['n6', 'n7', 'n8']);
});

test('o chat de um clipe leva as mensagens de antes que ainda estão no ecrã no início', () => {
  const lista = [msg(-20), msg(-9, 'antes'), msg(0, 'inicio'), msg(5, 'meio'), msg(30, 'depois')];
  const doClipe = mensagensDoClipe(lista, T0, T0 + 10_000);
  assert.deepEqual(doClipe.map((m) => m.texto), ['antes', 'inicio', 'meio']);
});

test('cada pessoa tem sempre a mesma cor, e as cores variam entre pessoas', () => {
  assert.equal(corDoAutor('Gatomia'), corDoAutor('gatomia'));
  assert.match(corDoAutor('x'), /^#[0-9a-f]{6}$/);
  const cores = new Set(['a', 'b', 'c', 'lontrafeliz', 'zebra99', 'newtrc', 'rockg', 'sapoiq'].map(corDoAutor));
  assert.ok(cores.size >= 5, `só ${cores.size} cores para oito pessoas`);
  assert.equal(corDoAutor(null), corDoAutor(''));
});

test('o texto vira pedaços de texto e emotes, e HTML continua a ser texto', () => {
  assert.deepEqual(partesDaMensagem('gg [emote:37226:KEKW] boa'), [
    { tipo: 'texto', texto: 'gg ' }, { tipo: 'emote', id: '37226', nome: 'KEKW' }, { tipo: 'texto', texto: ' boa' },
  ]);
  assert.deepEqual(partesDaMensagem('<img src=x onerror=alert(1)>'),
    [{ tipo: 'texto', texto: '<img src=x onerror=alert(1)>' }]);
  // Um "emote" com coisas que não são número no lugar do número não é emote: não vai para nenhum endereço.
  assert.deepEqual(partesDaMensagem('[emote:../x:KEKW]'), [{ tipo: 'texto', texto: '[emote:../x:KEKW]' }]);
  // As marcas que viram o texto ao contrário saem.
  assert.equal(partesDaMensagem('a‮b\u0007c')[0].texto, 'a b c');
  // Spam colado não passa do tecto.
  const longo = partesDaMensagem('k'.repeat(5000));
  assert.ok(longo[0].texto.length <= 220);
});

test('16:9 em automático: em baixo à esquerda, dentro da tela', () => {
  const g = geometria(DEITADO, { posicao: 'auto' }, { formato: '16:9' });
  assert.equal(g.ancora, 'baixo');
  assert.equal(g.lado, 'esq');
  assert.ok(g.x > 0 && g.x < 100);
  assert.ok(g.y > DEITADO.altura - 100 && g.y < DEITADO.altura);
});

test('9:16 em automático: no espaço entre a webcam e o jogo, ou acima da zona da legenda', () => {
  const dois = geometria(RETRATO, { posicao: 'auto' }, { formato: '9:16', modo: 'dois', divisao: 0.35 });
  assert.equal(dois.ancora, 'cima');
  const linha = Math.round(RETRATO.altura * 0.35);
  assert.ok(dois.y > linha && dois.y < linha + 80, `devia começar logo abaixo da divisória (${linha}), começa em ${dois.y}`);
  const um = geometria(RETRATO, { posicao: 'auto' }, { formato: '9:16', modo: 'um' });
  assert.equal(um.ancora, 'baixo');
  assert.ok(um.y <= RETRATO.altura * 0.8, 'por cima dos botões e da legenda da TikTok e dos Shorts');
});

test('em todas as posições e tamanhos, nos dois formatos, a caixa fica dentro da tela', () => {
  for (const [alvo, formato] of [[DEITADO, '16:9'], [RETRATO, '9:16']]) {
    for (const posicao of POSICOES) {
      for (const tamanho of TAMANHOS) {
        const g = geometria(alvo, { posicao, tamanho }, { formato, modo: 'dois', divisao: 0.4 });
        assert.ok(g.x >= 0 && g.x + g.largura <= alvo.largura, `${formato} ${posicao} ${tamanho} sai para o lado`);
        assert.ok(g.y >= 0 && g.y <= alvo.altura, `${formato} ${posicao} ${tamanho} sai por cima ou por baixo`);
        if (posicao.endsWith('Dir')) assert.equal(g.lado, 'dir');
      }
    }
  }
  const [p, m, gr] = TAMANHOS.map((tamanho) => geometria(DEITADO, { tamanho }, { formato: '16:9' }).fonte);
  assert.ok(p < m && m < gr, 'pequeno, médio e grande têm de crescer');
  // A mesma letra num 9:16 é maior: vê-se num telemóvel em pé.
  assert.ok(geometria(RETRATO, {}, { formato: '9:16' }).fonte > m);
});

// Cada letra mede 10 px: as contas das linhas ficam à vista.
const medir10 = (p) => (p.tipo === 'emote' ? 30 : Array.from(p.texto).length * 10);

test('as linhas partem-se pela palavra, e uma palavra enorme parte-se pela letra', () => {
  const linhas = quebrarLinhas([{ tipo: 'texto', texto: 'aaa bbb ccc' }], 75, medir10);
  assert.deepEqual(linhas.map((l) => l.map((p) => p.texto).join('')), ['aaa bbb', 'ccc']);
  const larga = quebrarLinhas([{ tipo: 'texto', texto: 'k'.repeat(25) }], 100, medir10);
  assert.deepEqual(larga.map((l) => l.map((p) => p.texto).join('')), ['k'.repeat(10), 'k'.repeat(10), 'k'.repeat(5)]);
  for (const l of larga) assert.ok(l.at(-1).x + l.at(-1).w <= 100);
});

test('uma mensagem comprida fica em três linhas, a última acaba em "..." e não passa da largura', () => {
  const linhas = quebrarLinhas([{ tipo: 'texto', texto: 'palavra '.repeat(40) }], 100, medir10);
  assert.equal(linhas.length, 3);
  const ultima = linhas.at(-1);
  assert.equal(ultima.at(-1).texto, '...');
  assert.ok(ultima.at(-1).x + ultima.at(-1).w <= 100);
});

test('o limite de linhas conta as linhas partidas, e a mais nova fica sempre', () => {
  const geo = { largura: 120, folga: 10, fonte: 20, alturaLinha: 26 };
  const visiveis = [
    { m: msg(1, 'uma mensagem bem comprida que ocupa linhas', 'a'), alfa: 1 },
    { m: msg(2, 'curta', 'b'), alfa: 1 },
    { m: msg(3, 'outra', 'c'), alfa: 1 },
  ];
  const { blocos, linhas } = arrumarChat(visiveis, geo, { linhas: 4 }, medir10);
  assert.ok(linhas <= 4);
  assert.equal(blocos.at(-1).m.texto, 'outra', 'a mais nova fica em baixo');
  assert.ok(!blocos.some((b) => b.m.texto.startsWith('uma')), 'a velha e comprida sai primeiro');
});

/** Uma tela de mentira que regista o que se lhe pede. */
function telaFalsa() {
  const feito = [];
  const ctx = {
    feito,
    globalAlpha: 1,
    measureText: (s) => ({ width: Array.from(s).length * 10 }),
    fillText(s, x, y) { feito.push(['fillText', s, this.globalAlpha, this.fillStyle]); },
    strokeText(s) { feito.push(['strokeText', s]); },
    fill() { feito.push(['fill', this.globalAlpha]); },
    drawImage() { feito.push(['drawImage']); },
    beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, save() {}, restore() {},
  };
  return ctx;
}

test('o desenho só usa fillText: o texto do chat nunca é HTML', () => {
  const ctx = telaFalsa();
  const lista = [msg(0, '<b>nao</b> & "aspas"', 'esperto')];
  const geo = geometria(DEITADO, {}, { formato: '16:9' });
  const n = desenharChat(ctx, lista, T0 + 1000, { ligado: true }, geo);
  assert.equal(n, 1);
  const textos = ctx.feito.filter((f) => f[0] === 'fillText').map((f) => f[1]).join('');
  assert.ok(textos.includes('<b>nao</b>'), 'o texto vai tal e qual, como letras');
  assert.ok(textos.startsWith('esperto:'), 'o nome primeiro, na cor da pessoa');
  assert.equal(ctx.feito.find((f) => f[0] === 'fillText')[3], corDoAutor('esperto'));
  assert.ok(ctx.feito.some((f) => f[0] === 'fill'), 'com fundo translúcido há caixa');
});

test('sem fundo, o texto leva contorno para se ler em cima do jogo', () => {
  const ctx = telaFalsa();
  desenharChat(ctx, [msg(0)], T0 + 100, { fundo: 'nenhum' }, geometria(DEITADO, {}, { formato: '16:9' }));
  assert.ok(ctx.feito.some((f) => f[0] === 'strokeText'));
  assert.ok(!ctx.feito.some((f) => f[0] === 'fill'));
});

test('a sumir, a opacidade do desenho é a da mensagem; sem mensagens não pinta nada', () => {
  const ctx = telaFalsa();
  desenharChat(ctx, [msg(0)], T0 + VIDA_MS - SUMIR_MS / 4, {}, geometria(DEITADO, {}, { formato: '16:9' }));
  const alfa = ctx.feito.find((f) => f[0] === 'fillText')[2];
  assert.ok(alfa > 0.2 && alfa < 0.3, `a opacidade devia ser 0,25, é ${alfa}`);
  const vazio = telaFalsa();
  assert.equal(desenharChat(vazio, [msg(0)], T0 - 1, {}, geometria(DEITADO, {}, { formato: '16:9' })), 0);
  assert.equal(vazio.feito.length, 0);
});

test('um emote sem imagem sai pelo nome', () => {
  const ctx = telaFalsa();
  desenharChat(ctx, [msg(0, 'gg [emote:999999:Pog]')], T0 + 100, {}, geometria(DEITADO, {}, { formato: '16:9' }));
  assert.ok(ctx.feito.some((f) => f[0] === 'fillText' && f[1] === 'Pog'));
  assert.ok(!ctx.feito.some((f) => f[0] === 'drawImage'));
});

test('desenharInteiro enche o 16:9 e põe barras numa fonte com outra proporção', () => {
  const chamadas = [];
  const ctx = { fillRect() {}, drawImage: (...a) => chamadas.push(a.slice(1)) };
  desenharInteiro(ctx, { videoWidth: 1280, videoHeight: 720 }, DEITADO);
  assert.deepEqual(chamadas[0], [0, 0, 1920, 1080]);
  desenharInteiro(ctx, { videoWidth: 1080, videoHeight: 1080 }, DEITADO);
  assert.deepEqual(chamadas[1], [420, 0, 1080, 1080]);
});

test('gravar pinta o chat por cima de cada frame, com o tempo que já passou, na tela do tamanho pedido', async () => {
  const v = {
    videoWidth: 1920, videoHeight: 1080, currentTime: 10, seeking: false, readyState: 4,
    play: async () => {}, pause: () => {},
    captureStream: () => ({ getAudioTracks: () => [] }),
  };
  const ctx = { drawImage() { v.currentTime += 0.05; }, fillRect() {}, clearRect() {}, save() {}, restore() {} };
  const tela = { width: 0, height: 0, getContext: () => ctx, captureStream: () => ({ addTrack() {} }) };
  class MRFalso {
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x']) }); this.onstop?.(); }
  }
  const tempos = [];
  await gravar(v, {
    modo: 'inteiro', alvo: DEITADO, duracaoS: 0.3, formato: 'video/webm', criarTela: () => tela, MR: MRFalso,
    porCima: (c, feitoS) => { assert.equal(c, ctx); tempos.push(feitoS); },
  });
  assert.equal(tela.width, 1920);
  assert.equal(tela.height, 1080);
  assert.ok(tempos.length >= 3, `só ${tempos.length} pinceladas do chat`);
  assert.equal(tempos[0], 0, 'o primeiro frame é o instante zero do clipe');
  for (let i = 1; i < tempos.length; i++) assert.ok(tempos[i] >= tempos[i - 1], 'o tempo do chat nunca anda para trás');
});
