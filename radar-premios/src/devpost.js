'use strict';
//
// Lê os concursos abertos do Devpost.
//
// Medido em 15/09/2026: são 13.890 no total, 9 por página, e a API responde 200
// ao endpoint simples. Com parâmetros de consulta responde 403 — por isso
// pagina-se à mão em vez de pedir ordenação ao servidor.
//
const AGENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * O prémio vem embrulhado em HTML: `$<span data-currency-value>40,000</span>`.
 * Tirar as etiquetas antes de procurar o número, senão os dígitos que às vezes
 * aparecem dentro dos atributos entram na conta.
 */
function valorEmDinheiro(bruto) {
  const texto = String(bruto ?? '').replace(/<[^>]+>/g, '').replace(/,/g, '');
  const m = texto.match(/[0-9]+(?:\.[0-9]+)?/);
  return m ? Number(m[0]) : 0;
}

/**
 * Quantos dias faltam, a partir do texto que o Devpost mostra.
 *
 * Vem em formas como "15 days left", "about 1 month left", "2 days left",
 * "a day left". Devolve `null` quando não se percebe — e `null` é tratado como
 * desconhecido, nunca como zero: um concurso com prazo ilegível não pode
 * parecer que fecha hoje.
 */
function diasQueFaltam(texto) {
  const t = String(texto ?? '').toLowerCase();
  if (!t) return null;
  const n = t.match(/(\d+)/);
  const quantos = n ? Number(n[1]) : (/\ba\b|\ban\b/.test(t) ? 1 : null);
  if (quantos == null) return null;
  if (/month/.test(t)) return quantos * 30;
  if (/day/.test(t)) return quantos;
  if (/hour/.test(t)) return 0;
  if (/minute/.test(t)) return 0;
  return null;
}

/** Um concurso, com os campos que decidem, e nada mais. */
function normalizar(h) {
  if (!h || !h.title) return null;
  const premios = h.prizes_counts || {};
  return {
    id: h.id ?? null,
    titulo: h.title,
    url: h.url ? (h.url.startsWith('http') ? h.url : `https:${h.url}`) : null,
    organizacao: h.organization_name || null,
    aberto: h.open_state === 'open',
    local: (h.displayed_location || {}).location || null,
    online: ((h.displayed_location || {}).location || '') === 'Online',
    soPorConvite: h.invite_only === true,
    premioTotal: valorEmDinheiro(h.prize_amount),
    premiosEmDinheiro: Number(premios.cash) || 0,
    outrosPremios: Number(premios.other) || 0,
    inscritos: Number(h.registrations_count) || 0,
    prazoTexto: h.time_left_to_submission || null,
    diasQueFaltam: diasQueFaltam(h.time_left_to_submission),
    datas: h.submission_period_dates || null,
    temas: (h.themes || []).map((t) => t && t.name).filter(Boolean),
  };
}

async function buscarPagina(pagina) {
  const r = await fetch(`https://devpost.com/api/hackathons?page=${pagina}`, {
    headers: { 'User-Agent': AGENTE, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Todos os concursos de N páginas, já normalizados. */
async function buscar({ paginas = 8, pausaMs = 1200 } = {}) {
  const todos = [];
  for (let p = 1; p <= paginas; p++) {
    let d;
    try {
      d = await buscarPagina(p);
    } catch {
      break;                        // uma página que falha não deita fora as anteriores
    }
    const lista = (d.hackathons || []).map(normalizar).filter(Boolean);
    if (!lista.length) break;
    todos.push(...lista);
    if (p < paginas) await dorme(pausaMs);
  }
  return todos;
}

module.exports = { valorEmDinheiro, diasQueFaltam, normalizar, buscar, dorme };
