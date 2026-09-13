'use strict';
//
// Lê os números de uma campanha de content rewards a partir da página pública.
//
// Não há API e não é preciso: a página traz o cartão da campanha embutido no
// HTML, em JSON escapado. Um navegador não ajudaria — e nem sequer funciona
// daqui (toda ligação do Chromium morre em ERR_CONNECTION_RESET).
//
// O que se lê aqui inclui duas coisas que o site só mostra a quem entra na
// campanha: as regras (`contentRequirements`) e os links dos materiais
// (`referenceMaterials`). Dá para decidir antes de aceitar seja o que for.
//

/** O JSON vem escapado dentro do HTML; isto devolve-o ao normal. */
function desescapar(html) {
  return String(html || '').replace(/\\"/g, '"');
}

/**
 * Tenta ler o recorte como JSON, com um degrau de desescape a mais se falhar.
 *
 * A descrição de uma das campanhas cita uma música — "What Is Love" — e esse
 * texto vem escapado DUAS vezes. Depois do primeiro desescape sobra `\\"`, que
 * não é JSON válido e rebentava a leitura da campanha inteira por causa de um
 * par de aspas dentro de uma frase.
 */
function analisar(bruto) {
  try { return JSON.parse(bruto); } catch { /* segundo degrau, abaixo */ }
  try { return JSON.parse(bruto.replace(/\\\\"/g, '\\"')); } catch { return null; }
}

/**
 * Recorta o objecto que começa em `"card":{`.
 *
 * Contar chavetas ingenuamente parte-se na primeira `}` dentro de uma string —
 * e a descrição de uma campanha tem chavetas com toda a naturalidade. Por isso
 * este leitor sabe quando está dentro de aspas.
 */
function extrairCartao(html) {
  const t = desescapar(html);
  const marca = t.indexOf('"card":{');
  if (marca < 0) return null;

  const i = marca + '"card":'.length;
  let profundidade = 0, emTexto = false, escapado = false;
  for (let fim = i; fim < t.length; fim++) {
    const c = t[fim];
    if (escapado) { escapado = false; continue; }
    if (c === '\\') { escapado = true; continue; }
    if (c === '"') { emTexto = !emTexto; continue; }
    if (emTexto) continue;
    if (c === '{') profundidade++;
    else if (c === '}' && --profundidade === 0) return analisar(t.slice(i, fim + 1));
  }
  return null;
}

const dolares = (centimos) => (Number.isFinite(centimos) ? centimos / 100 : null);

/**
 * Os números de uma campanha, em dólares e em português.
 *
 * Devolve `null` quando a página não é de campanha — página de erro, redirecção,
 * link velho. Inventar zeros aqui seria pior do que falhar: uma campanha com
 * "$0 gastos" parece a melhor de todas, e é assim que se entra na pior.
 */
function lerCampanha(html) {
  const c = extrairCartao(html);
  if (!c || !Number.isFinite(c.budgetCents)) return null;

  const m = c.metrics || {};
  const orcamento = dolares(c.budgetCents);
  const gasto = dolares(m.budgetSpentCents) ?? 0;

  return {
    id: c.id || null,
    nome: c.title || c.name || null,
    agencia: c.organizationName || null,
    agenciaVerificada: c.organizationVerified === true,
    estado: c.status || null,
    privada: c.private === true,
    exigeCandidatura: c.requiresApplication === true,

    cpmMin: dolares(c.cpmMinRateCents),
    cpmMax: dolares(c.cpmMaxRateCents),
    pagamentoMin: dolares((c.payouts || [])[0]?.minPayoutCents),
    pagamentoMax: dolares((c.payouts || [])[0]?.maxPayoutCents),

    orcamento,
    gasto,
    restante: Math.max(0, orcamento - gasto),
    progresso: Number.isFinite(m.budgetProgressBps) ? m.budgetProgressBps / 10000 : null,

    clippers: Number.isFinite(m.creatorCount) ? m.creatorCount : null,
    submissoes: Number.isFinite(m.approvedSubmissionCount) ? m.approvedSubmissionCount : null,
    viewsTotais: Number.isFinite(m.totalViews) ? m.totalViews : null,
    // Um ponto por dia, com as views desse dia. É o que permite medir a queima
    // em vez de a estimar pela idade da campanha.
    porDia: (m.chartPoints || [])
      .filter((p) => p && p.bucket)
      .map((p) => ({ dia: p.bucket, views: Number(p.totalViews) || 0 })),

    plataformas: Array.isArray(c.platforms) ? c.platforms.slice() : [],
    regras: (c.contentRequirements && c.contentRequirements.items) || [],
    materiais: (c.referenceMaterials || []).map((r) => r && r.url).filter(Boolean),

    listadaEm: c.listedAt || c.createdAt || null,
  };
}

module.exports = { desescapar, analisar, extrairCartao, lerCampanha };
