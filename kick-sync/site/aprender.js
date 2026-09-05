/**
 * Aprender o som de uma kill com UMA kill.
 *
 * Ele descreveu quatro sons: o disparo, o acerto do disparo, o impacto de
 * levar um tiro, e o headshot. Os tres ultimos sao amostras do jogo — o mesmo
 * ficheiro tocado outra vez, sempre igual. Um disparo muda com a arma, a
 * distancia e o eco; um "acerto" nao muda nada.
 *
 * E por isso nao e preciso eu saber como eles soam, nem adivinhar limiares.
 * Ele aponta uma kill que sabe que foi kill, a pagina guarda a FORMA do som
 * que la esta, e depois procura essa forma na noite inteira. Uma etiqueta
 * dele, e a conta passa a ser exacta em vez de um palpite meu.
 *
 * A conta e a mesma do alinhamento — correlacao — mas sobre a forma de onda e
 * nao sobre a envolvente: aqui procura-se O MESMO SOM, e nao dois sons
 * parecidos vistos de longe.
 */

/** Quanto som se guarda a volta de cada estouro. */
export const JANELA_S = 0.06;
// Uma pontinha antes do pico: o ataque e a parte que distingue um som do
// outro, e comecar exactamente no pico deitava-a fora.
const ANTES = 0.15;

/**
 * O recorte a volta de um instante, alinhado pelo pico e normalizado.
 *
 * Normalizado de proposito: a mesma amostra do jogo toca alto quando e perto e
 * baixo quando e longe, e o que se quer comparar e a FORMA. O volume ja foi
 * usado para achar o estouro; aqui so atrapalha.
 */
export function recortar(amostras, taxa, centroS, { janelaS = JANELA_S, procuraS = 0.01 } = {}) {
  const n = Math.round(janelaS * taxa);
  const centro = Math.round(centroS * taxa);
  const busca = Math.round(procuraS * taxa);
  let pico = 0;
  let iPico = centro;
  for (let i = Math.max(0, centro - busca); i < Math.min(amostras.length, centro + busca); i++) {
    const v = Math.abs(amostras[i]);
    if (v > pico) { pico = v; iPico = i; }
  }
  const i0 = iPico - Math.round(n * ANTES);
  if (i0 < 0 || i0 + n > amostras.length || pico === 0) return null;

  const v = new Float32Array(n);
  let energia = 0;
  for (let k = 0; k < n; k++) { v[k] = amostras[i0 + k]; energia += v[k] * v[k]; }
  const norma = Math.sqrt(energia);
  if (!(norma > 0)) return null;
  for (let k = 0; k < n; k++) v[k] /= norma;
  return v;
}

/**
 * Quanto dois recortes sao o mesmo som: de 0 a 1.
 *
 * Ambos ja vem normalizados, por isso o produto interno E a semelhanca. O
 * desvio existe porque o pico pode cair de um lado ou do outro da amostra —
 * um erro de meio milissegundo bastava para dois sons iguais parecerem
 * diferentes.
 */
export function semelhanca(a, b, { desvioS = 0.002, taxa = 24000 } = {}) {
  if (!a || !b) return 0;
  const d = Math.round(desvioS * taxa);
  const n = Math.min(a.length, b.length);
  let melhor = 0;
  // Amostra a amostra, e um atraso de cada vez. A primeira versao saltava de
  // duas em duas para ser mais rapida, e isso borrava a conta: dois sons
  // DIFERENTES passavam a parecer-se 70%, porque nunca se encontrava o
  // alinhamento em que eles se separam. Uma amostra do jogo repetida e
  // identica; se a conta nao a distingue de outra, nao serve para nada.
  for (let atraso = -d; atraso <= d; atraso++) {
    let s = 0;
    const de = Math.max(0, -atraso);
    const ate = n - Math.max(0, atraso);
    for (let k = de; k < ate; k++) s += a[k] * b[k + atraso];
    if (s > melhor) melhor = s;
  }
  return Math.min(1, melhor);
}

/**
 * Os instantes cujo som e o mesmo do exemplo.
 *
 * @param {Float32Array} exemplo o recorte da kill que ele confirmou
 * @param {{ms:number, recorte:Float32Array}[]} estouros tudo o que a noite deu
 * @param {number} limiar 0,55 e o valor a partir do qual dois recortes do
 *   MESMO ficheiro do jogo se reconhecem mesmo com o tiroteio por cima.
 */
export function parecidos(exemplo, estouros, { limiar = 0.55, ...opcoes } = {}) {
  if (!exemplo) return [];
  return estouros
    .map((e) => ({ ...e, nota: semelhanca(exemplo, e.recorte, opcoes) }))
    .filter((e) => e.nota >= limiar)
    .sort((a, b) => b.nota - a.nota);
}

/**
 * Juntar os que ficam perto uns dos outros: uma kill faz varios destes sons
 * seguidos, e sao um momento e nao cinco.
 */
export function juntarPerto(achados, { juntarMs = 6000 } = {}) {
  const ordem = [...achados].sort((a, b) => a.ms - b.ms);
  const saida = [];
  for (const a of ordem) {
    const ultimo = saida.at(-1);
    if (ultimo && a.ms - ultimo.ms <= juntarMs) {
      // Fica o instante do que se PARECE MAIS: e o que tem mais hipoteses de
      // ser mesmo o momento da kill.
      if (a.nota > ultimo.nota) { ultimo.ms = a.ms; ultimo.nota = a.nota; }
      ultimo.quantos++;
    } else {
      saida.push({ ms: a.ms, nota: a.nota, quantos: 1 });
    }
  }
  return saida.sort((a, b) => b.nota - a.nota);
}
