'use strict';
/**
 * Extrai o que interessa das páginas do BattleMetrics.
 *
 * Separado do navegador de propósito: assim dá para TESTAR o parser com
 * HTML gravado, sem depender de rede, de login nem de Cloudflare. O agente
 * só entrega o HTML; quem entende do formato é este arquivo.
 */

/** Procura tabela pelos CABEÇALHOS, nunca por classe de CSS — classe muda a
 *  cada deploy e o parser quebraria em silêncio. */
function acharTabela(doc, termos) {
  const querido = termos.map((t) => t.toLowerCase());
  for (const tabela of doc.querySelectorAll('table')) {
    const cab = [...tabela.querySelectorAll('th')]
      .map((th) => (th.textContent || '').trim().toLowerCase());
    if (!cab.length) continue;
    if (querido.every((q) => cab.some((c) => c.includes(q)))) {
      const idx = {};
      querido.forEach((q, i) => { idx[termos[i]] = cab.findIndex((c) => c.includes(q)); });
      return { tabela, idx };
    }
  }
  return null;
}

function paraMinutos(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim().toLowerCase();
  const relogio = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (relogio) return Number(relogio[1]) * 60 + Number(relogio[2]);
  let total = 0; let achou = false;
  for (const [re, m] of [[/(\d+)\s*d\b/, 1440], [/(\d+)\s*h\b/, 60], [/(\d+)\s*min\b/, 1]]) {
    const x = t.match(re);
    if (x) { total += Number(x[1]) * m; achou = true; }
  }
  return achou ? total : null;
}

/** Lista de jogadores ativos, da página de um servidor. */
function lerJogadores(doc) {
  const a = acharTabela(doc, ['name', 'play time']) || acharTabela(doc, ['nome', 'tempo']);
  if (!a) return null;
  const fora = [];
  for (const tr of a.tabela.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')];
    if (!tds.length) continue;
    const celaNome = tds[a.idx.name ?? a.idx.nome];
    const nome = (celaNome?.textContent || '').trim();
    if (!nome) continue;
    // O ID do jogador no BattleMetrics, do link da própria linha.
    //
    // Sem isto o painel diz "fulano está no servidor" e não dá para saber
    // QUEM é: o nome do chat não abre perfil nenhum, e um nome de Rust se
    // troca em dez segundos. Com o id, é um clique até o perfil, o
    // histórico de nomes e a SteamID.
    const link = celaNome?.querySelector('a[href*="/players/"]')
      || tr.querySelector('a[href*="/players/"]');
    const m = (link?.getAttribute('href') || '').match(/\/players\/(\d+)/);
    fora.push({
      nome,
      bmId: m ? m[1] : null,
      minutosNoServidor: paraMinutos((tds[a.idx['play time'] ?? a.idx.tempo]?.textContent || '').trim()),
    });
  }
  return fora.length ? fora : null;
}

/**
 * Em que servidor o jogador está AGORA, da página de perfil dele.
 *
 * É o passo que ele descreveu: "vê o server atual dele". Sem isto, o agente
 * não sabe qual página de servidor abrir, e alguém teria que dizer na mão —
 * que é justamente o manual que ele recusou.
 */
function lerServidorAtual(doc) {
  // O link do servidor sempre aponta para /servers/<jogo>/<id>. Procurar
  // pelo formato do link aguenta mudança de layout.
  for (const a of doc.querySelectorAll('a[href*="/servers/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/servers\/([a-z0-9]+)\/(\d+)/i);
    if (!m) continue;
    const linha = (a.closest('tr, li, div')?.textContent || '').toLowerCase();
    // "Online"/"Ativo" perto do link é o que distingue o servidor atual do
    // histórico de servidores, que aparece na mesma página.
    if (/online|ativo|playing|jogando/.test(linha) || a.closest('[class*="online" i]')) {
      return { jogo: m[1], servidorId: m[2], nome: (a.textContent || '').trim() };
    }
  }
  return null;
}

/**
 * Fidelidade do BotRix: quem assistiu e por quanto tempo.
 *
 * Essa é a fonte que enxerga QUEM NÃO FALA. O webhook da Kick só entrega
 * mensagem, e a API pública dela não tem lista de conectados — e sniper não
 * escreve no chat. O BotRix conta tempo assistido de quem está com a live
 * aberta, falando ou não, e a Kick não tem StreamElements.
 *
 * Não tem API pública (conferido: botrix.live/docs não publica nenhuma), por
 * isso vem daqui — a sessão dele lendo a tela dele.
 *
 * Lê por CABEÇALHO, nunca por classe de CSS: classe muda a cada deploy e o
 * parser quebraria em silêncio.
 */
function lerFidelidade(doc) {
  const a = acharTabela(doc, ['user', 'watch'])
    || acharTabela(doc, ['name', 'watch'])
    || acharTabela(doc, ['usuário', 'tempo'])
    || acharTabela(doc, ['user', 'time']);
  if (!a) return null;

  const col = Object.values(a.idx);
  const iNome = col[0];
  const iTempo = col[1];
  const fora = [];
  for (const tr of a.tabela.querySelectorAll('tbody tr')) {
    const c = tr.querySelectorAll('td');
    const nome = (c[iNome]?.textContent || '').trim();
    if (!nome) continue;
    const minutos = paraMinutos((c[iTempo]?.textContent || '').trim());
    // Sem tempo legível a linha não serve: o que interessa é o número subir
    // entre duas leituras, e um null não sobe nunca.
    if (minutos == null) continue;
    fora.push({ nome, minutosAssistidos: minutos });
  }
  return fora.length ? fora : null;
}

module.exports = { acharTabela, paraMinutos, lerJogadores, lerServidorAtual, lerFidelidade };
