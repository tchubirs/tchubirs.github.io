'use strict';
//
// O juízo sobre um token, a partir de factos medidos.
//
// Função pura de propósito: recebe números, devolve veredicto. Toda a rede
// está do lado de fora, para isto poder ser testado sem inventar um servidor.
//
// O que NÃO está aqui, e porquê: a concentração de carteiras (quanto da oferta
// está nas 10 maiores). Medi os três RPC públicos da Solana e os três recusam
// `getTokenLargestAccounts` sem chave paga — 403, 400 e 429. Fica por medir e
// é dito na cara, em vez de se fingir que o token passou num exame que ninguém
// fez.
//

/** Os limites, à vista, para se poder discordar deles. */
const LIMITES = {
  liquidezMinima: 1000,      // abaixo disto não se sai da posição
  fdvSobreLiquidez: 50,      // preço sustentado por quase nada no fundo
  vendasSobreCompras: 3,     // toda a gente a sair ao mesmo tempo
  idadeMinimaMin: 5,         // novo demais para ter história nenhuma
  quedaLiquidez: 0.5,        // metade da liquidez saiu desde que foi visto
  // Quanto da oferta tem de estar DENTRO da piscina.
  //
  // Medido em 13 tokens novos, em 14/09/2026: mediana 11,4% dentro, p10 4,4%,
  // p75 31,7%. Um único ficou abaixo de 1% — o SPEPE, com 0,002%, três ordens
  // de grandeza abaixo de tudo o resto. Daí os dois degraus: abaixo de 1% é
  // fora de escala, entre 1% e 4% é a cauda de baixo.
  //
  // A amostra é de 13 tokens de uma noite. É pouco, e está escrito aqui para
  // quem mudar isto saber em cima de que é que está a mudar.
  fraccaoNaPiscinaGrave: 0.01,
  fraccaoNaPiscinaBaixa: 0.04,
};

const num = (x) => (Number.isFinite(x) ? x : null);

/**
 * FOGE, CUIDADO ou PASSA.
 *
 * `PASSA` nunca quer dizer "bom investimento" — quer dizer "não encontrei
 * nenhuma das armadilhas que sei procurar". É uma peneira, não um conselho, e
 * o texto do veredicto diz isso.
 */
function peneirar(f, { limites = LIMITES } = {}) {
  if (!f || !f.mint) return null;

  const fugir = [], avisar = [], notas = [];
  const liq = num(f.liquidezUsd);
  const fdv = num(f.fdv);

  // ── Armadilhas de contrato: estas são absolutas, não são questão de grau ──
  if (f.freezeAuthority) {
    fugir.push('a freeze authority está activa: podem congelar a tua carteira e ficas sem vender');
  }
  if (f.mintAuthority) {
    fugir.push('a mint authority está activa: podem imprimir mais e diluir-te a zero');
  }

  // ── Liquidez: é o que decide se consegues SAIR, não se consegues entrar ──
  if (liq == null) {
    fugir.push('não há dados de liquidez nenhuns — não dá para saber se se sai');
  } else if (liq < limites.liquidezMinima) {
    fugir.push(`só há $${liq.toFixed(0)} de liquidez: não consegues vender sem esmagar o preço`);
  }

  // A assinatura que vi no ATM/SOL: $26.901 de volume com $0 de liquidez. Isso
  // não é um token a negociar — é a liquidez já retirada, e o volume foi a saída.
  if (num(f.vol24h) > 0 && liq != null && liq < 1) {
    fugir.push(`teve $${f.vol24h.toFixed(0)} de volume e a liquidez está a zero: já foi retirada`);
  }

  if (fdv != null && liq != null && liq > 0) {
    const razao = fdv / liq;
    if (razao > limites.fdvSobreLiquidez) {
      fugir.push(`o preço avalia tudo em $${fdv.toFixed(0)} com $${liq.toFixed(0)} no fundo `
        + `(${razao.toFixed(0)}x): não há lá dinheiro para pagar essa avaliação`);
    }
    notas.push(`avaliação ${razao.toFixed(1)}x a liquidez`);
  }

  // ── Pressão de venda ──
  const c = num(f.compras5m), v = num(f.vendas5m);
  if (c != null && v != null && (c + v) >= 5 && v > Math.max(1, c) * limites.vendasSobreCompras) {
    avisar.push(`${v} vendas contra ${c} compras nos últimos 5 minutos: estão a sair`);
  }

  if (num(f.idadeMin) != null && f.idadeMin < limites.idadeMinimaMin) {
    avisar.push(`tem ${f.idadeMin.toFixed(0)} minutos de vida: não há história nenhuma para ler`);
  }

  if (num(f.quedaLiquidez) != null && f.quedaLiquidez >= limites.quedaLiquidez) {
    fugir.push(`perdeu ${(f.quedaLiquidez * 100).toFixed(0)}% da liquidez desde que foi visto`);
  }

  // ── Quanto da oferta está fora da piscina ──
  //
  // Isto NÃO é a concentração por carteira: 95% fora pode estar espalhado por
  // dez mil pessoas. Mas é o tamanho do martelo que existe do lado de fora —
  // quanto menos moeda houver dentro, menos é preciso vender para esmagar o
  // preço. É a melhor medida que se consegue sem RPC pago, e diz-se o que é.
  const fp = num(f.fraccaoNaPiscina);
  if (fp != null) {
    const dentro = (fp * 100).toFixed(fp < 0.01 ? 3 : 1);
    if (fp < limites.fraccaoNaPiscinaGrave) {
      fugir.push(`só ${dentro}% da oferta está dentro da piscina: quase tudo está `
        + 'em carteiras, e basta uma para esmagar o preço');
    } else if (fp < limites.fraccaoNaPiscinaBaixa) {
      avisar.push(`só ${dentro}% da oferta está dentro da piscina `
        + '(a mediana medida foi 11%)');
    }
    notas.push(`${dentro}% da oferta dentro da piscina`);
  }

  if (f.concentracao == null) {
    notas.push('por carteira, a concentração continua NÃO medida '
      + '(os RPC públicos recusam sem chave paga)');
  } else if (f.concentracao > 0.5) {
    fugir.push(`${(f.concentracao * 100).toFixed(0)}% da oferta está em 10 carteiras`);
  }

  const veredicto = fugir.length ? 'FOGE' : (avisar.length ? 'CUIDADO' : 'PASSA');
  return {
    veredicto,
    porque: [...fugir, ...avisar],
    notas,
    // Dito sempre, para ninguém confundir isto com um conselho de compra.
    aviso: veredicto === 'PASSA'
      ? 'PASSA quer dizer "não encontrei as armadilhas que sei procurar" — não quer dizer que preste'
      : null,
  };
}

module.exports = { peneirar, LIMITES };
