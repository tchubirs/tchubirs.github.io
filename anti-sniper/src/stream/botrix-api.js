'use strict';
/**
 * BotRix pela API, não raspando tela.
 *
 * Achado lendo o pacote JavaScript do painel deles (chunk 2346) em
 * 27/08/2026. Não há documentação: `botrix.live/docs` não publica nenhuma
 * API, e o sitemap só tem login e a home.
 *
 * Duas portas, e a diferença entre elas importa:
 *
 *   PÚBLICA   GET /api/public/leaderboard?platform=kick&user=<canal>
 *             Sem login, sem chave, funciona para qualquer canal. Devolve
 *             `watchtime` por pessoa — que é exatamente o sinal que enxerga
 *             quem assiste CALADO. Mas vem **capada em 20 pessoas**:
 *             testei limit, count, size, page, offset e top; todos devolvem
 *             20. É o topo da fidelidade, não a lista.
 *
 *   COMPLETA  GET /api/loyalty/get
 *             A lista inteira, com o cookie de sessão do dono do canal. É
 *             o que o painel dele chama. Vem pelo agente, que já tem o
 *             navegador logado.
 *
 * Ler a API em vez da tabela renderizada importa: um seletor de CSS quebra
 * no próximo deploy e o usuário só descobre quando a ferramenta para de
 * achar gente, em silêncio.
 */

const BASE = 'https://botrix.live';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Normaliza o que a BotRix devolve para a forma que o serviço usa.
 *
 * Aceita tanto o array cru quanto `{data:[...]}` — o painel logado e a rota
 * pública não têm por que continuar iguais para sempre, e um envelope novo
 * não pode derrubar a coleta.
 */
function normalizarPlacar(bruto) {
  const lista = Array.isArray(bruto) ? bruto
    : Array.isArray(bruto?.data) ? bruto.data
      : Array.isArray(bruto?.users) ? bruto.users
        : Array.isArray(bruto?.leaderboard) ? bruto.leaderboard : null;
  if (!lista) return null;

  const fora = [];
  for (const u of lista) {
    if (!u) continue;
    const nome = u.name ?? u.username ?? u.user ?? u.displayName;
    if (typeof nome !== 'string' || !nome.trim()) continue;
    const wt = u.watchtime ?? u.watch_time ?? u.watchTime ?? null;
    fora.push({
      nome: nome.trim(),
      // Sobe enquanto a pessoa está com a live aberta, falando ou não. É a
      // única medida que enxerga sniper — sniper não escreve no chat.
      // Number(null) é 0, e 0 diria "assistiu nada" onde a verdade é "não
      // sei". O coletor compara para ver se SOBE — confundir os dois faria
      // essa pessoa nunca subir.
      minutosAssistidos: wt == null || wt === '' || !Number.isFinite(Number(wt)) ? null : Number(wt),
      pontos: Number(u.points ?? u.xp ?? 0) || 0,
      nivel: u.level ?? null,
    });
  }
  return fora;
}

/**
 * O topo da fidelidade, sem login nenhum.
 *
 * Capado em 20 pessoas pela própria BotRix. Serve para começar hoje e para
 * qualquer canal de terceiro; não substitui a lista completa.
 */
async function placarPublico(canal, plataforma = 'kick', buscar = globalThis.fetch) {
  const url = `${BASE}/api/public/leaderboard?platform=${encodeURIComponent(plataforma)}`
    + `&user=${encodeURIComponent(canal)}`;
  const r = await buscar(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) {
    const e = new Error(`BotRix respondeu ${r.status}`);
    e.status = r.status;
    throw e;
  }
  const bruto = await r.json();
  // A BotRix responde 200 com {"error":true} quando o par
  // plataforma+usuário não existe lá. Tratar isso como formato quebrado
  // assustaria à toa; é só uma resposta.
  if (bruto && bruto.error) {
    const e = new Error(`BotRix não tem "${canal}" em ${plataforma}`);
    e.naoExiste = true;
    throw e;
  }
  const lista = normalizarPlacar(bruto);
  if (lista === null) throw new Error('BotRix devolveu um formato inesperado');
  return lista;
}

/** Quantas pessoas a rota pública entrega. Medido, não suposto. */
const TETO_PUBLICO = 20;

module.exports = { placarPublico, normalizarPlacar, TETO_PUBLICO, BASE };
