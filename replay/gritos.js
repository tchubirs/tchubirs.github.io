/**
 * Gritos do streamer. Um filtro da detecção automática, ao lado dos tiros e das explosões.
 *
 * Um grito é a voz da pessoa muito acima do que ela costuma falar, e sustentada. Mede-se assim:
 *
 *   1. VOZ. A energia entre uns 300 e 3000 Hz, que é onde a voz de quem grita vive (a fundamental
 *      sobe, e os harmónicos que dão o "ai" e o "não" estão aí). Um ronco de explosão fica abaixo, e o
 *      estalo de um tiro espalha-se por tudo, por isso nenhum dos dois é quase todo voz.
 *   2. ACIMA DO NORMAL DELA. A régua é o nível de voz que essa pessoa tem a maior parte da noite (o
 *      percentil 75 da noite ouvida), e não um número fixo: cada um tem o microfone num volume.
 *   3. SUSTENTADO. Mais de meio segundo seguido. Uma sílaba forte, um "ah" curto ou uma rajada de
 *      tiros (que são estalos com silêncio no meio) não chegam.
 *
 * É aproximado, e a tela diz-o: uma risada alta e comprida conta como grito, porque para o som é a
 * mesma coisa. Música com voz alta também pode passar. Um grito abafado, ou de quem já fala sempre aos
 * berros, fica de fora.
 */

export const BLOCO_MS = 10;
export const FPS = 1000 / BLOCO_MS;

const VOZ_DE = 300;
const VOZ_ATE = 3000;
const POLOS = 2;

/**
 * A força de cada bloco de 10 ms, e a parte dela que está na faixa da voz.
 *
 * A faixa é um passa-alto e um passa-baixo de dois pólos cada, as peças de um pólo de `tiros.js`
 * postas em cadeia. Não é um filtro de estúdio: serve para separar o grave e o agudo do meio.
 */
export function medirVoz(amostras, taxa) {
  const bl = Math.max(1, Math.round((taxa * BLOCO_MS) / 1000));
  const n = Math.floor(amostras.length / bl);
  const forca = new Float32Array(n);
  const voz = new Float32Array(n);
  const aA = Math.exp((-2 * Math.PI * VOZ_DE) / taxa);
  const aB = Math.exp((-2 * Math.PI * VOZ_ATE) / taxa);
  const mA = new Float64Array(POLOS);
  const mB = new Float64Array(POLOS);
  for (let b = 0; b < n; b++) {
    let somaT = 0;
    let somaV = 0;
    for (let i = b * bl; i < (b + 1) * bl; i++) {
      const x = amostras[i];
      let v = x;
      for (let p = 0; p < POLOS; p++) {
        mA[p] = aA * mA[p] + (1 - aA) * v;
        v -= mA[p];
      }
      for (let p = 0; p < POLOS; p++) {
        mB[p] = aB * mB[p] + (1 - aB) * v;
        v = mB[p];
      }
      somaT += x * x;
      somaV += v * v;
    }
    forca[b] = Math.sqrt(somaT / bl);
    voz[b] = Math.sqrt(somaV / bl);
  }
  return { forca, voz };
}

/**
 * O normal da voz de uma pessoa: o percentil `p` dos blocos ouvidos. O 75 cai na fala de todos os dias
 * de quem fala a maior parte do tempo, e fica acima dos silêncios; a mediana caía nos silêncios de quem
 * fala pouco, e qualquer frase passava a "acima do normal".
 */
export function normalDaVoz(voz, p = 0.75) {
  if (!voz?.length) return 0;
  const v = Float32Array.from(voz).sort();
  const x = v[Math.min(v.length - 1, Math.floor(v.length * p))];
  return x > 0 ? x : 0;
}

/**
 * Os gritos, a partir das medidas de `medirVoz` e do normal da voz (`normalDaVoz`).
 *
 * Um bloco conta quando a voz está `fator` vezes acima do normal E a maior parte da força do bloco é
 * voz (`vozMin`). Blocos seguidos, com buracos de até `buracoMs` (o fôlego a meio de um "nããão"), fazem
 * um grito; fica se durar pelo menos `minS` e se pelo menos `cheioMin` dos blocos dele contarem, que é
 * o que tira a rajada de tiros. Mais de `maxS` seguidos é música ou um barulho do jogo, e sai.
 *
 * Devolve `[{ inicioS, fimS, picoS, pico, duracaoS }]` pela ordem do relógio, com `pico` em vezes o normal.
 */
export function gritos({ forca, voz }, normal, {
  fator = 3, vozMin = 0.6, minS = 0.5, maxS = 8, buracoMs = 80, cheioMin = 0.7, juntarS = 3,
} = {}) {
  const saida = [];
  if (!normal || !voz?.length) return saida;
  const buraco = Math.round(buracoMs / BLOCO_MS);
  const conta = (b) => voz[b] / normal >= fator && voz[b] / (forca[b] + 1e-12) >= vozMin;
  let ini = -1;
  let ult = -1;
  let contados = 0;
  const fechar = () => {
    const blocos = ult - ini + 1;
    const dur = blocos / FPS;
    if (dur >= minS && dur <= maxS && contados / blocos >= cheioMin) {
      let pico = 0;
      let picoB = ini;
      for (let b = ini; b <= ult; b++) if (voz[b] > pico) { pico = voz[b]; picoB = b; }
      const novo = { inicioS: ini / FPS, fimS: (ult + 1) / FPS, picoS: picoB / FPS, pico: pico / normal };
      const antes = saida[saida.length - 1];
      if (antes && novo.inicioS - antes.fimS <= juntarS) {
        antes.fimS = novo.fimS;
        if (novo.pico > antes.pico) { antes.pico = novo.pico; antes.picoS = novo.picoS; }
      } else saida.push(novo);
    }
    ini = -1;
    contados = 0;
  };
  for (let b = 0; b < voz.length; b++) {
    if (!conta(b)) continue;
    if (ini >= 0 && b - ult > buraco + 1) fechar();
    if (ini < 0) ini = b;
    ult = b;
    contados++;
  }
  if (ini >= 0) fechar();
  for (const g of saida) g.duracaoS = g.fimS - g.inicioS;
  return saida;
}
