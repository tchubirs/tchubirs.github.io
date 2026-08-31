// Alinhar dois ângulos pelo som, com contas que cabem num browser.
//
// A onda não serve: microfones diferentes, som posicional, música diferente em
// cada um. O que sobrevive a tudo isso são os ATAQUES — o instante em que um
// som começa. Um tiro, uma porta, uma explosão: toda a gente que estava lá
// ouviu no mesmo momento, mesmo que soe completamente diferente em cada canal.
//
// Fluxo espectral: quanta energia SUBIU em cada banda, cem vezes por segundo.
// Depois é correlação cruzada e ver onde bate.
//
// Medido a sério: cinco canais de um evento real (30/08/2026), quatro janelas
// independentes de 7 minutos. Quatro dos cinco alinharam a 0,14 s uns dos
// outros; o quinto deu +5,7 s em três das quatro janelas.

const N = 512;                 // janela da FFT (64 ms a 8 kHz)
export const SALTO = 80;       // 10 ms a 8 kHz -> envolvente a 100 Hz
export const TAXA = 8000;

// ── FFT ─────────────────────────────────────────────────────────────────────
// Radix-2 in-place. Escrita à mão porque a página não carrega bibliotecas para
// isto e 40 linhas custam menos do que uma dependência que pode ficar em baixo.

const HANN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
const INVERSO = new Uint16Array(N);
for (let i = 0; i < N; i++) {
  let r = 0;
  for (let b = 0, n = Math.log2(N); b < n; b++) r |= ((i >> b) & 1) << (n - 1 - b);
  INVERSO[i] = r;
}

function fftMag(entrada, saida) {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[INVERSO[i]] = entrada[i];
  for (let tam = 2; tam <= N; tam <<= 1) {
    const ang = (-2 * Math.PI) / tam;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < N; i += tam) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < tam / 2; k++) {
        const a = i + k;
        const b = a + tam / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  for (let i = 0; i <= N / 2; i++) saida[i] = Math.hypot(re[i], im[i]);
}

/**
 * A envolvente de ataques de um sinal mono a 8 kHz.
 *
 * Normalizada (média zero, desvio um) para que um canal que grita e outro que
 * sussurra tenham o mesmo peso na comparação.
 */
export function envolvente(amostras) {
  const quantos = Math.max(0, 1 + Math.floor((amostras.length - N) / SALTO));
  if (quantos < 2) return new Float32Array(0);

  // Pôr o sinal numa escala fixa ANTES de qualquer logaritmo.
  //
  // Isto não é cosmética: `log1p(x)` só comprime quando x é grande. O browser
  // entrega amostras entre -1 e 1, e nessa escala log1p(x) ≈ x — ou seja, não
  // comprime nada e a envolvente passa a ser energia crua. Foi exactamente
  // esse o erro que fez a versão JS medir metade da força da versão de
  // referência sobre os MESMOS ficheiros. Normalizar por RMS resolve os dois
  // problemas de uma vez: fixa a escala e torna a medida indiferente ao
  // volume de cada canal.
  let energia = 0;
  for (let i = 0; i < amostras.length; i++) energia += amostras[i] * amostras[i];
  const rms = Math.sqrt(energia / (amostras.length || 1));
  const ganho = rms > 0 ? 1000 / rms : 0;

  const bins = N / 2 + 1;
  const mag = new Float64Array(bins);
  const anterior = new Float64Array(bins);
  const janela = new Float64Array(N);
  const fluxo = new Float32Array(quantos - 1);

  for (let q = 0; q < quantos; q++) {
    const o = q * SALTO;
    for (let i = 0; i < N; i++) janela[i] = amostras[o + i] * ganho * HANN[i];
    fftMag(janela, mag);
    if (q > 0) {
      let s = 0;
      // Só as SUBIDAS. Uma descida de energia é o fim de um som, e o fim é
      // muito menos preciso do que o início — para toda a gente e em qualquer
      // sala. Meter as descidas na conta só acrescenta ruído.
      for (let i = 0; i < bins; i++) {
        const d = Math.log1p(mag[i]) - Math.log1p(anterior[i]);
        if (d > 0) s += d;
      }
      fluxo[q - 1] = s;
    }
    anterior.set(mag);
  }

  let media = 0;
  for (const v of fluxo) media += v;
  media /= fluxo.length || 1;
  let variancia = 0;
  for (const v of fluxo) variancia += (v - media) ** 2;
  const dp = Math.sqrt(variancia / (fluxo.length || 1)) || 1;
  for (let i = 0; i < fluxo.length; i++) fluxo[i] = (fluxo[i] - media) / dp;
  return fluxo;
}

/**
 * O desvio entre duas envolventes, e o quanto se pode confiar nele.
 *
 * `desvioS` positivo => `a` chegou à Kick com MAIS atraso do que `b`.
 *
 * Esta frase esteve escrita ao contrário e os números estavam certos, o que é
 * o pior dos dois mundos: quem lesse o comentário empurrava o ângulo para o
 * lado errado. Está fixada por um teste com um atraso conhecido, nos dois
 * sentidos, e é por isso que `resolver` devolve o ajuste já feito em vez de
 * um sinal para o chamador interpretar.
 *
 * `forca` é o pico a dividir pelo desvio-padrão do resto da curva: um pico
 * alto num mar de picos altos não quer dizer nada, e é essa a diferença entre
 * uma medição e uma coincidência.
 */
export function desvio(a, b, { limiteS = 20, fps = TAXA / SALTO } = {}) {
  const m = Math.min(a.length, b.length);
  const n = Math.min(Math.round(limiteS * fps), m - 1);
  if (m < fps * 5 || n < 1) return { desvioS: null, forca: 0, motivo: 'pouco-audio' };

  const c = new Float64Array(2 * n + 1);
  for (let d = -n; d <= n; d++) {
    let s = 0;
    const i0 = Math.max(0, -d);
    const i1 = Math.min(m, m - d);
    for (let i = i0; i < i1; i++) s += a[i] * b[i + d];
    c[d + n] = s / m;
  }

  let iPico = 0;
  for (let i = 1; i < c.length; i++) if (c[i] > c[iPico]) iPico = i;
  // Desvio-padrão do resto da curva, e não a raiz quadrática média: a
  // correlação tem quase sempre um patamar constante, e medi-lo como se fosse
  // ruído inflaciona o denominador e esconde picos verdadeiros.
  let soma = 0;
  let quantos = 0;
  for (let i = 0; i < c.length; i++) {
    if (Math.abs(i - iPico) <= 30) continue;
    soma += c[i];
    quantos++;
  }
  const media = quantos ? soma / quantos : 0;
  let varianca = 0;
  for (let i = 0; i < c.length; i++) {
    if (Math.abs(i - iPico) <= 30) continue;
    varianca += (c[i] - media) ** 2;
  }
  const ruido = quantos ? Math.sqrt(varianca / quantos) : 0;
  // `-d` e não `d`: verificado contra um caso sintético de atraso conhecido,
  // porque um erro de sinal aqui inverteria o conselho todo.
  return { desvioS: -(iPico - n) / fps, forca: ruido > 0 ? c[iPico] / ruido : 0 };
}

/**
 * De medições par a par para O AJUSTE A APLICAR em cada canal, em segundos.
 *
 * Devolve o ajuste, e não um "desvio" que o chamador teria de negar: essa
 * negação é exactamente o sítio onde um erro de sinal passaria despercebido,
 * porque o resultado continuaria a parecer uma medição.
 *
 * O ajuste entra directamente no relógio do canal (`onde(..., {nudgeMs})`):
 * quem chegou à Kick com mais atraso está a mostrar, num dado carimbo, um
 * momento mais antigo do que os outros, e por isso tem de avançar.
 *
 * Nem todos os pares dão: dois streamers em salas diferentes, com músicas
 * diferentes, podem não ter um único som em comum. Por isso constrói-se um
 * grafo e propaga-se a partir do canal mais bem ligado — e quem ficar de fora
 * é dito por nome, não silenciosamente posto a zero.
 */
export function resolver(pares, canais) {
  const vizinhos = new Map(canais.map((c) => [c, []]));
  for (const { a, b, desvioS } of pares) {
    // `desvioS` = atraso de `a` menos atraso de `b`. Para acumular ATRASOS (e
    // o atraso é o ajuste), anda-se ao contrário do desvio.
    vizinhos.get(a)?.push({ outro: b, d: -desvioS });
    vizinhos.get(b)?.push({ outro: a, d: desvioS });
  }
  const ancora = [...vizinhos.entries()].sort((x, y) => y[1].length - x[1].length)[0];
  if (!ancora || !ancora[1].length) return { ajustes: {}, semLigacao: [...canais] };

  const ajustes = { [ancora[0]]: 0 };
  const fila = [ancora[0]];
  while (fila.length) {
    const aqui = fila.shift();
    for (const { outro, d } of vizinhos.get(aqui) || []) {
      if (outro in ajustes) continue;
      ajustes[outro] = ajustes[aqui] + d;
      fila.push(outro);
    }
  }
  // Centrar na mediana: o ajuste médio fica perto de zero, e ninguém leva um
  // empurrão de dez segundos só porque a âncora calhou ser a mais adiantada.
  const vals = Object.values(ajustes).sort((x, y) => x - y);
  const meio = vals.length % 2 ? vals[(vals.length - 1) / 2]
    : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  for (const k of Object.keys(ajustes)) ajustes[k] -= meio;
  return { ajustes, semLigacao: canais.filter((c) => !(c in ajustes)) };
}

/**
 * Uma medição por janela não é uma medição: um pico pode ser sorte, ou música
 * que se repete. Fica o valor à volta da MEDIANA, e só se houver pelo menos
 * duas janelas a concordar. Exigir que TODAS concordem é o outro erro — deita
 * fora um par que acertou em três janelas e falhou numa.
 */
export function consolidar(medicoes, { forcaMin = 5, toleranciaS = 1, minJanelas = 2 } = {}) {
  const fortes = medicoes.filter((m) => m.forca >= forcaMin && m.desvioS != null).map((m) => m.desvioS);
  if (fortes.length < minJanelas) return { desvioS: null, janelas: fortes.length, descartadas: 0 };
  const ord = [...fortes].sort((a, b) => a - b);
  const med = ord.length % 2 ? ord[(ord.length - 1) / 2]
    : (ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2;
  const perto = fortes.filter((d) => Math.abs(d - med) < toleranciaS);
  if (perto.length < minJanelas || perto.length < 0.6 * fortes.length) {
    return { desvioS: null, janelas: perto.length, descartadas: fortes.length - perto.length };
  }
  return {
    desvioS: perto.reduce((s, d) => s + d, 0) / perto.length,
    janelas: perto.length,
    descartadas: fortes.length - perto.length,
  };
}
