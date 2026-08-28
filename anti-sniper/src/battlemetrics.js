'use strict';
/**
 * O histórico de nomes que JÁ EXISTE, em vez do que eu começaria a gravar.
 *
 * Ele cortou a ideia de gravar do zero: *"como assim você tá gravando nome
 * se é pra você acessar algum lugar que grava nome no meio de tantos"*.
 * Está certo — gravar do zero só valeria daqui a um ano, e quem grava há
 * anos já existe.
 *
 * O BattleMetrics guarda uma SESSÃO por vez que a pessoa entrou num
 * servidor, e cada sessão carrega o nome usado naquele momento. Como o Rust
 * usa o nome de exibição da Steam, isso é o histórico de nomes da Steam —
 * com data, ano a ano.
 *
 * Ele já tem token: o PeekRust dele chama essa mesma rota.
 *
 * Duas coisas que não são óbvias e mudam o resultado:
 *
 *   - A rota é paginada, e sem seguir as páginas vem só o pedaço mais
 *     recente. Foi por isso que ele viu "só aparece 1 nome, cadê os outros
 *     200 dos outros anos".
 *   - Nome sem data não serve para nada aqui: o valor está em saber QUANDO
 *     a pessoa se chamava assim.
 */

const BASE = 'https://api.battlemetrics.com';

/** Uma página de sessões. Separado para poder testar a paginação sozinha. */
async function paginaDeSessoes(url, token, buscar) {
  const r = await buscar(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!r.ok) {
    const e = new Error(r.status === 401 || r.status === 403
      ? 'BattleMetrics recusou o token (401/403)'
      : `BattleMetrics respondeu ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/**
 * Todos os nomes que uma conta já usou, com a primeira e a última vez.
 *
 * @param {string} bmId id do jogador no BattleMetrics
 * @param {string} token BATTLEMETRICS_TOKEN
 * @param {object} op
 * @param {number} [op.paginas] teto de páginas, para não varrer sem fim
 */
async function nomesPorSessao(bmId, token, {
  buscar = globalThis.fetch, paginas = 20, porPagina = 100,
} = {}) {
  if (!bmId) throw new Error('sem id do BattleMetrics');
  if (!token) throw new Error('sem BATTLEMETRICS_TOKEN');

  let url = `${BASE}/players/${encodeURIComponent(bmId)}/relationships/sessions`
    + `?page[size]=${porPagina}`;
  const porNome = new Map();
  let vistas = 0;

  for (let i = 0; i < paginas && url; i++) {
    let j;
    try { j = await paginaDeSessoes(url, token, buscar); }
    catch (e) {
      // Uma página que falha no meio não pode apagar o que já veio: meio
      // histórico é muito melhor que nenhum.
      if (i === 0) throw e;
      break;
    }
    for (const s of j.data || []) {
      const nome = s?.attributes?.name;
      if (!nome) continue;
      const inicio = Date.parse(s.attributes.start || '') || null;
      const fim = Date.parse(s.attributes.stop || s.attributes.start || '') || null;
      vistas += 1;
      const a = porNome.get(nome);
      if (!a) porNome.set(nome, { nome, de: inicio, ate: fim, sessoes: 1 });
      else {
        a.sessoes += 1;
        if (inicio && (!a.de || inicio < a.de)) a.de = inicio;
        if (fim && (!a.ate || fim > a.ate)) a.ate = fim;
      }
    }
    // Seguir a paginação é o que separa "1 nome" de "os 200 dos outros anos".
    url = j.links?.next || null;
  }

  return {
    bmId,
    sessoes: vistas,
    nomes: [...porNome.values()].sort((a, b) => (b.ate || 0) - (a.ate || 0)),
  };
}

module.exports = { nomesPorSessao, paginaDeSessoes, BASE };
