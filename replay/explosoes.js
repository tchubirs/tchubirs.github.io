/**
 * Explosões: foguete, C4, satchel. Um filtro da detecção automática, ao lado dos tiros.
 *
 * O dono pediu "estouros de rocket". Um tiro e uma explosão são os dois sons fortes, mas com duas
 * diferenças que se medem sem saber nada de Rust:
 *
 *   1. GRAVE. Um tiro é um estalo de banda larga, com o agudo todo (ver `tiros.js`). Uma explosão é
 *      sobretudo ronco: a energia dela vive abaixo dos 150 Hz.
 *   2. DURAÇÃO. Um tiro sobe e cai em dezenas de milissegundos. Uma explosão ronca meio segundo,
 *      um segundo, às vezes dois.
 *
 * E as duas juntas com a terceira, que é a mesma dos tiros: ALTURA contra o chão da noite inteira da
 * pessoa, e não do pedaço.
 *
 * O que isto NÃO sabe, e por isso a tela diz que é aproximado: uma batida de música com muito grave, o
 * microfone a levar uma pancada, uma voz grave aos berros colada ao microfone, ou um barulho grave do
 * jogo (uma porta de metal, um helicóptero a passar perto) podem passar. Uma explosão longe, que no som
 * da live mal se ouve, fica de fora. Mais de seis segundos seguidos de grave forte não contam: isso é
 * música ou motor, e não um estouro.
 */

export const BLOCO_MS = 10;
export const FPS = 1000 / BLOCO_MS;

const CORTE_GRAVE = 150;
const POLOS = 3;

/**
 * A força de cada bloco de 10 ms, e a parte dela que é grave.
 *
 * O grave é o som passado por três passa-baixos de um pólo em cadeia (a mesma peça barata de
 * `tiros.js`, sem FFT): abaixo de 150 Hz passa, e o resto cai 18 dB por oitava.
 */
export function medirGraves(amostras, taxa) {
  const bl = Math.max(1, Math.round((taxa * BLOCO_MS) / 1000));
  const n = Math.floor(amostras.length / bl);
  const forca = new Float32Array(n);
  const grave = new Float32Array(n);
  const a = Math.exp((-2 * Math.PI * CORTE_GRAVE) / taxa);
  const m = new Float64Array(POLOS);
  for (let b = 0; b < n; b++) {
    let somaT = 0;
    let somaG = 0;
    for (let i = b * bl; i < (b + 1) * bl; i++) {
      const x = amostras[i];
      let v = x;
      for (let p = 0; p < POLOS; p++) {
        m[p] = a * m[p] + (1 - a) * v;
        v = m[p];
      }
      somaT += x * x;
      somaG += v * v;
    }
    forca[b] = Math.sqrt(somaT / bl);
    grave[b] = Math.sqrt(somaG / bl);
  }
  return { forca, grave };
}

/**
 * As explosões, a partir das medidas de `medirGraves` e do chão da força (a mediana da noite, como o
 * `chao` de `tiros.js`).
 *
 * Um bloco conta quando é forte (`alturaMin` vezes o chão) E a maior parte dele é grave (`graveMin`, a
 * razão entre o grave e a força). Blocos seguidos (com buracos de até `buracoMs`) fazem um estouro, e o
 * estouro só fica se durar pelo menos `minS`: é aqui que o tiro sai, porque mesmo um tiro com ronco
 * acaba antes. Estouros a menos de `juntarS` uns dos outros são o mesmo (o eco, ou dois C4 seguidos).
 *
 * Devolve `[{ inicioS, fimS, picoS, pico, duracaoS }]` pela ordem do relógio, com `pico` em vezes o chão.
 */
export function explosoes({ forca, grave }, piso, {
  alturaMin = 8, graveMin = 0.5, minS = 0.3, maxS = 6, buracoMs = 60, juntarS = 2,
} = {}) {
  const saida = [];
  if (!piso || !forca?.length) return saida;
  const buraco = Math.round(buracoMs / BLOCO_MS);
  const quente = (b) => forca[b] / piso >= alturaMin && grave[b] / (forca[b] + 1e-12) >= graveMin;
  let ini = -1;
  let ult = -1;
  const fechar = () => {
    const dur = (ult - ini + 1) / FPS;
    if (dur >= minS && dur <= maxS) {
      let pico = 0;
      let picoB = ini;
      for (let b = ini; b <= ult; b++) if (forca[b] > pico) { pico = forca[b]; picoB = b; }
      const novo = { inicioS: ini / FPS, fimS: (ult + 1) / FPS, picoS: picoB / FPS, pico: pico / piso };
      const antes = saida[saida.length - 1];
      if (antes && novo.inicioS - antes.fimS <= juntarS) {
        antes.fimS = novo.fimS;
        if (novo.pico > antes.pico) { antes.pico = novo.pico; antes.picoS = novo.picoS; }
      } else saida.push(novo);
    }
    ini = -1;
  };
  for (let b = 0; b < forca.length; b++) {
    if (quente(b)) {
      if (ini >= 0 && b - ult > buraco + 1) fechar();
      if (ini < 0) ini = b;
      ult = b;
    }
  }
  if (ini >= 0) fechar();
  for (const e of saida) e.duracaoS = e.fimS - e.inicioS;
  return saida;
}
