/**
 * Motor de pontuação.
 *
 * Contrato central: toda pontuação vem acompanhada da lista de sinais que a
 * produziram, com o valor de cada um. Nunca devolvemos um número sozinho.
 * Moderação sem explicação é indefensável — o usuário não consegue apelar e
 * o administrador não consegue auditar.
 */

import { EXTRACTORS, WEIGHTS } from "./signals.js";
import { simhash, toHex } from "./simhash.js";

/** Limiares de ação. Deliberadamente conservadores. */
export const THRESHOLDS = Object.freeze({
  QUARANTINE: 0.55,  // segura para revisão humana
  LIMIT: 0.35,       // entrega, mas fora de timelines públicas
});

export const VERDICTS = Object.freeze({
  ALLOW: "allow",
  LIMIT: "limit",
  QUARANTINE: "quarantine",
});

/**
 * Deriva os campos de forma a partir do texto, para o chamador não precisar
 * calcular. Tudo local, nada sai da máquina.
 */
export function deriveContentFeatures(text) {
  const t = String(text ?? "");
  const urls = t.match(/https?:\/\/\S+/g) ?? [];
  const words = t.split(/\s+/).filter(Boolean);
  return {
    urlCount: urls.length,
    wordCount: words.length,
    digest: simhash(t),
  };
}

/**
 * Pontua uma atividade.
 *
 * @param {object} activity  campos de conta, comportamento e conteúdo
 * @param {object} [opts]
 * @param {object} [opts.weights]     substitui os pesos padrão
 * @param {object} [opts.thresholds]  substitui os limiares padrão
 * @returns {{score:number, verdict:string, digest:string, signals:Array}}
 */
export function scoreActivity(activity, opts = {}) {
  const weights = { ...WEIGHTS, ...(opts.weights ?? {}) };
  const thresholds = { ...THRESHOLDS, ...(opts.thresholds ?? {}) };

  const derived = activity.text != null
    ? deriveContentFeatures(activity.text)
    : { urlCount: activity.urlCount ?? 0, wordCount: activity.wordCount ?? 0, digest: 0n };

  const input = { now: Date.now(), ...derived, ...activity };

  const signals = [];
  let total = 0;
  let pesoUsado = 0;

  for (const [nome, extrair] of Object.entries(EXTRACTORS)) {
    const peso = weights[nome] ?? 0;
    if (peso === 0) continue;
    let valor;
    try {
      valor = extrair(input);
    } catch {
      continue;                       // sinal sem dados não derruba a análise
    }
    if (!Number.isFinite(valor)) continue;
    valor = Math.max(0, Math.min(1, valor));
    const contribuicao = valor * peso;
    total += contribuicao;
    pesoUsado += peso;
    signals.push({
      name: nome,
      value: Number(valor.toFixed(4)),
      weight: peso,
      contribution: Number(contribuicao.toFixed(4)),
      fired: valor >= 0.5,
    });
  }

  // Normaliza pelo peso efetivamente disponível: se faltaram dados para
  // metade dos sinais, não penalizamos a conta por isso.
  const score = pesoUsado > 0 ? total / pesoUsado : 0;

  let verdict = VERDICTS.ALLOW;
  if (score >= thresholds.QUARANTINE) verdict = VERDICTS.QUARANTINE;
  else if (score >= thresholds.LIMIT) verdict = VERDICTS.LIMIT;

  signals.sort((a, b) => b.contribution - a.contribution);

  return {
    score: Number(score.toFixed(4)),
    verdict,
    digest: toHex(derived.digest),
    signals,
    explanation: explain(signals, score, verdict),
  };
}

/** Texto legível por humano — vai no log de moderação e na apelação. */
export function explain(signals, score, verdict) {
  const disparados = signals.filter((s) => s.fired);
  if (disparados.length === 0) {
    return `Nenhum sinal disparou (pontuação ${score.toFixed(2)}). Veredito: ${verdict}.`;
  }
  const lista = disparados
    .map((s) => `${s.name}=${s.value.toFixed(2)}`)
    .join(", ");
  return `Pontuação ${score.toFixed(2)} (${verdict}). Sinais disparados: ${lista}.`;
}
