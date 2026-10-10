// Sons feitos de propósito para os testes dos filtros de som (explosões e gritos): sem ficheiros, sem
// rede, e sempre iguais, porque o ruído vem de um gerador com semente.

export const TAXA = 24000;

/** Um gerador de ruído branco entre -1 e 1, sempre o mesmo para a mesma semente. */
export function ruido(semente = 7) {
  let s = semente >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
}

/** Silêncio com um chiado baixinho por baixo (o fundo de uma live), de `segundos`. */
export function fundo(segundos, nivel = 0.005, semente = 3) {
  const r = ruido(semente);
  const a = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < a.length; i++) a[i] = nivel * r();
  return a;
}

/** Somar `som` dentro de `base` a partir de `emS`. */
export function por(base, som, emS) {
  const o = Math.round(emS * TAXA);
  for (let i = 0; i < som.length && o + i < base.length; i++) base[o + i] += som[i];
  return base;
}

/** Um tiro: um estalo de ruído branco que cai a metade em poucos milissegundos. */
export function tiro(amp = 0.8, quedaMs = 25, semente = 11) {
  const r = ruido(semente);
  const n = Math.round(0.25 * TAXA);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.exp(-i / ((quedaMs / 1000) * TAXA)) * r();
  return a;
}

/** Um tiro com ronco: o mesmo estalo, mais um baque grave curto por baixo. */
export function tiroComRonco(amp = 0.8, semente = 13) {
  const a = tiro(amp, 25, semente);
  for (let i = 0; i < a.length; i++) a[i] += amp * 0.6 * Math.exp(-i / (0.03 * TAXA)) * Math.sin((2 * Math.PI * 70 * i) / TAXA);
  return a;
}

/** Uma rajada: `n` tiros a `cadenciaS` uns dos outros. */
export function rajada(n = 10, cadenciaS = 0.1, amp = 0.8) {
  const a = new Float32Array(Math.round((n * cadenciaS + 0.3) * TAXA));
  for (let k = 0; k < n; k++) por(a, tiro(amp, 25, 20 + k), k * cadenciaS);
  return a;
}

/**
 * Uma explosão: um ronco grave (40 a 90 Hz, mais ruído passado por um passa-baixo) que sobe num instante
 * e cai devagar, ao longo de `duracaoS`.
 */
export function explosao(amp = 0.8, duracaoS = 1.5, semente = 17) {
  const r = ruido(semente);
  const n = Math.round(duracaoS * TAXA);
  const a = new Float32Array(n);
  const k = Math.exp((-2 * Math.PI * 120) / TAXA);
  let lp = 0;
  const tau = duracaoS / 3;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    lp = k * lp + (1 - k) * r();
    const env = Math.min(1, t / 0.01) * Math.exp(-t / tau);
    const ronco = Math.sin(2 * Math.PI * 45 * t) + 0.6 * Math.sin(2 * Math.PI * 70 * t + 1) + 0.4 * Math.sin(2 * Math.PI * 90 * t + 2);
    a[i] = amp * env * (0.5 * ronco + 6 * lp);
  }
  return a;
}

/** Um tom agudo e comprido (um alarme, um apito): forte, mas nada grave. */
export function apito(amp = 0.5, segundos = 1.5, hz = 2500) {
  const a = new Float32Array(Math.round(segundos * TAXA));
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * hz * i) / TAXA);
  return a;
}

/**
 * Uma voz: uma fundamental e os harmónicos dela até aos 3 kHz, com as vogais a abrir e fechar.
 * `silabaS` ligado e `pausaS` desligado, a repetir ao longo de `segundos`.
 */
export function voz({ amp = 0.05, f0 = 180, segundos = 3, silabaS = 0.18, pausaS = 0.07, vibrato = 0 } = {}) {
  const n = Math.round(segundos * TAXA);
  const a = new Float32Array(n);
  const ciclo = silabaS + pausaS;
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const dentro = t % ciclo;
    const env = dentro < silabaS ? Math.sin((Math.PI * dentro) / silabaS) : 0;
    fase += (2 * Math.PI * f0 * (1 + vibrato * Math.sin(2 * Math.PI * 5 * t))) / TAXA;
    let x = 0;
    for (let h = 1; h * f0 <= 3000; h++) {
      // Os harmónicos da zona das vogais (500 a 2500 Hz) mais fortes, como numa voz aberta.
      const peso = (h * f0 >= 500 && h * f0 <= 2500 ? 1 : 0.35) / Math.sqrt(h);
      x += peso * Math.sin(h * fase);
    }
    a[i] = amp * env * x;
  }
  return a;
}

/** Um grito: a voz aguda e forte, sustentada (sem pausas), com um tremor. */
export function grito({ amp = 0.3, segundos = 1.2, f0 = 420 } = {}) {
  return voz({ amp, f0, segundos, silabaS: segundos, pausaS: 0.0001, vibrato: 0.03 });
}

/** Uma conversa normal de `segundos`, com frases e silêncios entre elas. */
export function conversa(segundos, amp = 0.05) {
  const a = new Float32Array(Math.round(segundos * TAXA));
  for (let t = 0; t + 3 <= segundos; t += 4) por(a, voz({ amp, segundos: 3, f0: 160 + (t % 3) * 20 }), t);
  return a;
}
