'use strict';
/**
 * Leitura de tabela por CABEÇALHO, nunca por classe de CSS.
 *
 * Sites mudam o nome das classes toda semana — um seletor tipo `.sc-hKgILt`
 * quebra sozinho no próximo deploy e o usuário só descobre quando a
 * ferramenta silenciosamente para de achar gente. Procurar pela COLUNA
 * ("Name", "Play time") aguenta redesign, porque o texto do cabeçalho é o
 * que o site precisa manter legível para o próprio usuário.
 */

globalThis.Detetive = globalThis.Detetive || {};

/** Acha a tabela cujos cabeçalhos contenham todos os termos pedidos. */
Detetive.acharTabela = function (termos) {
  const querido = termos.map((t) => t.toLowerCase());
  for (const tabela of document.querySelectorAll('table')) {
    const cabecalhos = [...tabela.querySelectorAll('th')]
      .map((th) => (th.textContent || '').trim().toLowerCase());
    if (cabecalhos.length === 0) continue;
    const casa = querido.every((q) => cabecalhos.some((c) => c.includes(q)));
    if (casa) {
      const indices = {};
      querido.forEach((q, i) => {
        indices[termos[i]] = cabecalhos.findIndex((c) => c.includes(q));
      });
      return { tabela, indices };
    }
  }
  return null;
};

/** Extrai as linhas já mapeadas para os nomes de coluna pedidos. */
Detetive.lerLinhas = function (achado) {
  if (!achado) return [];
  const { tabela, indices } = achado;
  const fora = [];
  for (const tr of tabela.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')];
    if (tds.length === 0) continue;
    const linha = {};
    let vazia = true;
    for (const [chave, i] of Object.entries(indices)) {
      const v = (tds[i]?.textContent || '').trim();
      linha[chave] = v;
      if (v) vazia = false;
    }
    if (!vazia) fora.push(linha);
  }
  return fora;
};

/** "04:35" -> 275 minutos. "2d 19h 10min" -> 3910. Aceita as duas formas,
 *  porque o BattleMetrics usa hh:mm e o BotRix usa "2d 19h 10min". */
Detetive.paraMinutos = function (texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim().toLowerCase();
  const relogio = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (relogio) return Number(relogio[1]) * 60 + Number(relogio[2]);
  let total = 0; let achou = false;
  for (const [re, mult] of [[/(\d+)\s*d\b/, 1440], [/(\d+)\s*h\b/, 60], [/(\d+)\s*min\b/, 1]]) {
    const m = t.match(re);
    if (m) { total += Number(m[1]) * mult; achou = true; }
  }
  return achou ? total : null;
};

/** Guarda no armazenamento da extensão, com carimbo de quando foi lido —
 *  dado velho precisa ser visível como velho, senão vira acusação com
 *  informação de ontem. */
Detetive.guardar = function (chave, valor) {
  const pacote = { lidoEm: Date.now(), origem: location.href, dados: valor };
  try { chrome.storage.local.set({ [chave]: pacote }); } catch {}
  return pacote;
};
