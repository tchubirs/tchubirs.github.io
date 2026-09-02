// A versão em retrato: 9:16 a partir de um vídeo deitado.
//
// "Cadê a versão retrato? Quando abro o clip, como opção para baixar: versão
//  retrato e versão normal. E a versão em retrato com botão de editar para
//  ajeitar os tamanhos, igual à imagem."
//
// Duas coisas para dizer antes do código, porque mudam o que isto é.
//
// PRIMEIRA. O clipe normal desta ferramenta COPIA OS BYTES do VOD e não
// reconverte nada: é instantâneo e não perde qualidade. Cortar para 9:16 não
// pode fazer isso — os pixels mudam de sítio, e mudar pixels é reconverter.
// Portanto o retrato é outro animal: desenha-se cada frame numa tela com o
// enquadramento escolhido e grava-se o que sai. Custa o TEMPO DO CLIPE (sete
// segundos de clipe são sete segundos de espera, porque a tela só produz
// frames à medida que o vídeo os mostra) e sai em WebM. Isso não é um defeito
// que eu vá esconder atrás de uma barra de progresso bonita: é o preço, e o
// botão do clipe normal continua ao lado, instantâneo.
//
// SEGUNDA. Dois modos, e o segundo é o que os streamers usam mesmo:
//
//   'um'    Um enquadramento a encher o 9:16. Serve quando a acção está toda
//           no meio do ecrã.
//   'dois'  Dois enquadramentos empilhados. Em cima a cara, em baixo o jogo —
//           que é o formato de todos os clipes de Rust que dão views, e a
//           razão pela qual a Twitch tem esse segundo botão.
//
// A geometria vive aqui, longe do DOM e do MediaRecorder, porque é a parte que
// erra em silêncio: um rectângulo meio pixel fora da fonte dá uma barra preta
// na beira do vídeo exportado que ninguém vê no editor.

/** O alvo. 1080x1920 é o que a Kick, o YouTube e o Instagram querem. */
export const RETRATO = { largura: 1080, altura: 1920 };

/** Encolher um número para dentro de um intervalo. */
const preso = (x, min, max) => Math.max(min, Math.min(max, x));

/**
 * O enquadramento com que isto abre, para uma fonte deitada.
 *
 * 'um': a fita 9:16 mais alta que cabe, ao meio.
 * 'dois': duas fitas, cada uma com metade da altura do alvo — logo cada uma
 *         é 1080x960, ou seja 9:8. A de cima ao meio em cima, a de baixo ao
 *         meio em baixo, que é onde a cara e o jogo costumam estar.
 */
export function enquadramentoInicial(largura, altura, modo = 'um') {
  if (!(largura > 0 && altura > 0)) return [];
  if (modo === 'dois') {
    const proporcao = RETRATO.largura / (RETRATO.altura / 2);   // 9:8
    // METADE da altura da fonte, e não a altura toda.
    //
    // A primeira versão dava a cada um `altura * proporcao` de largura, o que
    // numa fonte 16:9 resulta em dois rectângulos com a altura INTEIRA — logo
    // os dois no mesmo sítio, um em cima do outro, e o editor abria com um
    // enquadramento só à vista. Foi o teste que o apanhou; a olho, dois
    // rectângulos sobrepostos ao pixel são indistinguíveis de um.
    //
    // Com metade da altura nascem separados, um em cima e outro em baixo, que
    // é onde a cara e o jogo costumam estar. Sobrepô-los depois é livre: numa
    // imagem 16:9 a webcam e o centro da acção partilham espaço.
    let h = altura / 2;
    let w = h * proporcao;
    if (w > largura) { w = largura; h = w / proporcao; }
    const x = (largura - w) / 2;
    return [
      { x, y: 0, largura: w, altura: h },
      { x, y: altura - h, largura: w, altura: h },
    ];
  }
  const proporcao = RETRATO.largura / RETRATO.altura;            // 9:16
  const h = altura;
  const w = Math.min(largura, h * proporcao);
  return [{ x: (largura - w) / 2, y: 0, largura: w, altura: h }];
}

/**
 * Prender um enquadramento dentro da fonte, SEM lhe mudar a proporção.
 *
 * Deslizar é livre; sair não é. Se o rectângulo for maior do que a fonte
 * encolhe primeiro, e só depois se desloca — pela ordem contrária ficava
 * encostado a um canto com metade de fora.
 */
export function limitar(rect, fonte) {
  const proporcao = rect.largura / rect.altura;
  let w = Math.min(rect.largura, fonte.largura);
  let h = w / proporcao;
  if (h > fonte.altura) { h = fonte.altura; w = h * proporcao; }
  return {
    x: preso(rect.x, 0, fonte.largura - w),
    y: preso(rect.y, 0, fonte.altura - h),
    largura: w,
    altura: h,
  };
}

/**
 * Onde cada enquadramento aterra na tela de 1080x1920.
 *
 * Um modo, um destino que enche tudo. Dois modos, metade cada.
 */
export function destinos(modo = 'um') {
  const { largura, altura } = RETRATO;
  if (modo === 'dois') {
    return [
      { x: 0, y: 0, largura, altura: altura / 2 },
      { x: 0, y: altura / 2, largura, altura: altura / 2 },
    ];
  }
  return [{ x: 0, y: 0, largura, altura }];
}

/**
 * Pintar um frame.
 *
 * O fundo é pintado sempre, e de propósito: um enquadramento que não encha o
 * seu destino ao pixel deixaria a tira do frame anterior a espreitar na beira,
 * e isso lê-se como um artefacto de compressão em vez de um bug.
 */
export function desenhar(ctx, fonte, rects, modo = 'um') {
  const alvos = destinos(modo);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, RETRATO.largura, RETRATO.altura);
  for (let i = 0; i < alvos.length; i++) {
    const r = rects[i];
    const a = alvos[i];
    if (!r || !(r.largura > 0 && r.altura > 0)) continue;
    ctx.drawImage(fonte, r.x, r.y, r.largura, r.altura, a.x, a.y, a.largura, a.altura);
  }
  return alvos.length;
}

/**
 * Os formatos por ordem de preferência. MP4 primeiro porque é o que toda a
 * gente sabe abrir; WebM porque é o que o Chrome grava sempre. Com os codecs
 * escritos: pedir sem eles dava ficheiros que o Windows abria como som.
 */
export const FORMATOS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** O que o browser DIZ que sabe gravar. */
export function melhorFormato(MR = globalThis.MediaRecorder) {
  if (!MR?.isTypeSupported) return null;
  return FORMATOS.find((t) => MR.isTypeSupported(t)) || null;
}

/**
 * O que o browser sabe gravar A SÉRIO.
 *
 * `isTypeSupported` mente. Medido: este Chromium responde `true` a
 * `video/mp4;codecs=avc1...` e depois grava ZERO BYTES — é a mesma build sem
 * codecs proprietários que já nos tinha faltado com o AAC. Acreditar nele dava
 * um ficheiro vazio com extensão .mp4 e uma pessoa a perguntar-se porque é que
 * o clipe não abre.
 *
 * Por isso grava-se de verdade: meio segundo de uma tela pequena em cada
 * candidato, e fica o primeiro que produzir bytes. Custa uma vez por sessão.
 *
 * Duas coisas que já correram mal aqui e por isso estão escritas:
 *
 * - A tela de teste é 320x180 e não 2x2. Um H.264 não codifica dois pixels —
 *   o teste dava zero para um formato que grava perfeitamente a 1080x1920, e
 *   isso é o contrário do que um teste serve.
 * - O relógio é `setTimeout`, e não `requestAnimationFrame`. Num separador em
 *   segundo plano o rAF quase não corre, e o ciclo ficava PENDURADO — foi
 *   assim que esta função se estreou.
 */
export async function formatoQueFunciona({
  MR = globalThis.MediaRecorder,
  criarTela = () => document.createElement('canvas'),
  msPorTentativa = 500,
} = {}) {
  if (!MR?.isTypeSupported) return null;
  for (const tipo of FORMATOS) {
    if (!MR.isTypeSupported(tipo)) continue;
    let pincel = null;
    try {
      const tela = criarTela();
      tela.width = 320; tela.height = 180;
      const ctx = tela.getContext('2d');
      const fluxo = tela.captureStream(30);
      const g = new MR(fluxo, { mimeType: tipo });
      let bytes = 0;
      g.ondataavailable = (e) => { bytes += e.data?.size || 0; };
      const parou = new Promise((ok) => {
        g.onstop = ok;
        // Rede de segurança: um gravador que nunca pára não pode prender a
        // página inteira à espera dele.
        setTimeout(ok, msPorTentativa * 4);
      });
      // Uma tela que não muda pode não produzir frame nenhum: pintar mexe nela.
      let n = 0;
      pincel = setInterval(() => {
        ctx.fillStyle = (n++ % 2) ? '#000' : '#fff';
        ctx.fillRect(0, 0, 320, 180);
      }, 33);
      g.start();
      await new Promise((k) => setTimeout(k, msPorTentativa));
      if (g.state !== 'inactive') g.stop();
      await parou;
      for (const f of fluxo.getTracks()) f.stop();
      if (bytes > 0) return tipo;
    } catch {
      /* o próximo */
    } finally {
      if (pincel) clearInterval(pincel);
    }
  }
  return null;
}

/** A extensão que combina com o tipo. */
export const extensaoDe = (tipo) => (String(tipo).startsWith('video/mp4') ? 'mp4' : 'webm');

/**
 * Gravar o retrato, do princípio ao fim do clipe.
 *
 * Em tempo real e sem alternativa: uma `<canvas>` só produz frames quando o
 * `<video>` os mostra, e um `<video>` só os mostra à velocidade a que toca.
 * Acelerar isto exigia descodificar à mão com WebCodecs e voltar a empacotar
 * o MP4 em JavaScript — muito código para poupar sete segundos.
 *
 * @param {HTMLVideoElement} video - já posicionado no início do clipe
 * @param {object} opcoes
 * @param {Array} opcoes.rects - enquadramentos, em pixels da fonte
 * @param {'um'|'dois'} opcoes.modo
 * @param {number} opcoes.duracaoS
 * @param {(p: {feito: number, total: number}) => void} [opcoes.aoProgresso]
 * @param {AbortSignal} [opcoes.sinal]
 */
export async function gravar(video, {
  rects, modo = 'um', duracaoS, aoProgresso = () => {}, sinal, formato,
  criarTela = () => document.createElement('canvas'),
  MR = globalThis.MediaRecorder,
} = {}) {
  const tipo = formato || await formatoQueFunciona({ MR, criarTela });
  if (!tipo) throw Object.assign(new Error('sem gravador'), { name: 'SEM-GRAVADOR' });

  const tela = criarTela();
  tela.width = RETRATO.largura;
  tela.height = RETRATO.altura;
  const ctx = tela.getContext('2d');

  const fluxo = tela.captureStream(30);
  // O som vem do vídeo, quando o browser o deixa sair. Sem isto o retrato sai
  // mudo, e um clipe de Rust mudo não vale nada — o tiro É o clipe.
  try {
    const somDoVideo = video.captureStream?.() || video.mozCaptureStream?.();
    for (const faixa of somDoVideo?.getAudioTracks?.() || []) fluxo.addTrack(faixa);
  } catch { /* sem som: o vídeo continua a valer, o silêncio não o impede */ }

  const gravador = new MR(fluxo, { mimeType: tipo });
  const pedacos = [];
  gravador.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };

  const inicio = video.currentTime;
  let parar = false;
  let pincel = null;
  // Um relógio próprio, e não o ritmo a que o vídeo entrega frames.
  //
  // A primeira versão pintava dentro do `requestVideoFrameCallback`, que é a
  // maneira elegante: um frame pintado por cada frame descodificado. Medido,
  // dava 18 frames em dois segundos, e o ficheiro saía com meio segundo de
  // duração em vez de dois — porque uma tela que ninguém pinta não produz
  // frame nenhum, e o gravador não tem nada para gravar nesses buracos.
  //
  // Com um intervalo fixo a tela é pintada trinta vezes por segundo aconteça o
  // que acontecer, e a duração do ficheiro passa a ser a duração do clipe.
  const pintar = () => {
    if (parar) return;
    desenhar(ctx, video, rects, modo);
    const feito = Math.max(0, video.currentTime - inicio);
    aoProgresso({ feito, total: duracaoS });
    if (feito >= duracaoS) {
      parar = true;
      clearInterval(pincel);
      if (gravador.state !== 'inactive') gravador.stop();
    }
  };

  const acabou = new Promise((ok, falha) => {
    gravador.onstop = () => ok(new Blob(pedacos, { type: tipo }));
    gravador.onerror = (e) => falha(e.error || new Error('gravação falhou'));
  });
  sinal?.addEventListener('abort', () => {
    parar = true;
    clearInterval(pincel);
    if (gravador.state !== 'inactive') gravador.stop();
  }, { once: true });

  gravador.start();
  await video.play().catch(() => {});
  pintar();
  pincel = setInterval(pintar, 1000 / 30);
  const blob = await acabou;
  clearInterval(pincel);
  video.pause();
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  // Zero bytes é falha, não é ficheiro. Deixar passar dava um .mp4 vazio na
  // pasta de transferências e nenhuma explicação.
  if (!blob.size) throw Object.assign(new Error('não saiu nada'), { name: 'GRAVACAO-VAZIA' });
  return { blob, tipo, extensao: extensaoDe(tipo) };
}
