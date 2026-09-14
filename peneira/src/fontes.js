'use strict';
//
// Onde se vão buscar os factos. Tudo público, tudo sem chave.
//
// Medido em 13/09/2026, deste contentor:
//   · api.dexscreener.com          200, generoso
//   · api.mainnet-beta.solana.com  200 em getAccountInfo; 429 em
//                                  getTokenLargestAccounts
//   · solana-rpc.publicnode.com    403 "Indexed requests require a personal token"
//   · solana.drpc.org              400 "chain is not available on free plan"
//   · api.geckoterminal.com        200, mas limita depressa (429)
//
const AGENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const RPC = 'https://api.mainnet-beta.solana.com';

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/** Busca com recuo: 429 é o estado normal destas APIs, não uma excepção rara. */
async function buscar(url, opcoes = {}, tentativas = 4) {
  let espera = 800;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, {
        ...opcoes,
        headers: { 'User-Agent': AGENTE, Accept: 'application/json', ...(opcoes.headers || {}) },
      });
      if (r.status === 429) { await dorme(espera); espera *= 2; continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await dorme(espera); espera *= 2;
    }
  }
  return null;
}

async function rpc(metodo, params) {
  const d = await buscar(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }),
  });
  return d && !d.error ? d.result : null;
}

/** mintAuthority e freezeAuthority, direto da blockchain. */
async function autoridades(mint) {
  const r = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const i = r?.value?.data?.parsed?.info;
  if (!i) return { mintAuthority: undefined, freezeAuthority: undefined };
  return {
    mintAuthority: i.mintAuthority ?? null,
    freezeAuthority: i.freezeAuthority ?? null,
    oferta: Number(i.supply) / 10 ** Number(i.decimals || 0),
  };
}

/** O par mais líquido de um token, pelo DexScreener. */
async function mercado(mint) {
  const d = await buscar(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  const pares = (d?.pairs || []).filter((p) => p.chainId === 'solana');
  if (!pares.length) return null;
  pares.sort((a, b) => ((b.liquidity?.usd) || 0) - ((a.liquidity?.usd) || 0));
  const p = pares[0];
  return {
    nome: p.baseToken?.name || null,
    simbolo: p.baseToken?.symbol || null,
    par: p.pairAddress,
    precoUsd: Number(p.priceUsd) || null,
    fdv: Number(p.fdv) || null,
    // `liquidity` em falta e liquidez zero são coisas diferentes: a primeira é
    // "não sei", a segunda é "não há". O juízo trata-as de forma diferente.
    liquidezUsd: p.liquidity && p.liquidity.usd != null ? Number(p.liquidity.usd) : null,
    vol5m: Number(p.volume?.m5) || 0,
    vol1h: Number(p.volume?.h1) || 0,
    vol24h: Number(p.volume?.h24) || 0,
    compras5m: p.txns?.m5?.buys ?? null,
    vendas5m: p.txns?.m5?.sells ?? null,
    idadeMin: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 60000 : null,
    // Quantas moedas estão DENTRO da piscina. Com a oferta total dá a fracção
    // — e essa é a única medida de concentração que se consegue de graça.
    naPiscina: p.liquidity && p.liquidity.base != null ? Number(p.liquidity.base) : null,
    url: p.url || null,
  };
}

/** Todos os factos de um token, prontos para `peneirar`. */
async function factos(mint) {
  const [m, a] = await Promise.all([mercado(mint), autoridades(mint)]);
  if (!m) return null;
  const fraccaoNaPiscina = (m.naPiscina != null && a.oferta > 0)
    ? m.naPiscina / a.oferta : null;
  return { mint, ...m, ...a, fraccaoNaPiscina, concentracao: null };
}

/** Os tokens acabados de nascer, pelo DexScreener. */
async function novos(limite = 30) {
  const d = await buscar('https://api.dexscreener.com/token-profiles/latest/v1');
  const lista = Array.isArray(d) ? d : (d?.data || []);
  return lista.filter((t) => t.chainId === 'solana')
    .map((t) => t.tokenAddress).filter(Boolean).slice(0, limite);
}

module.exports = { buscar, rpc, autoridades, mercado, factos, novos, dorme, RPC };
