'use strict';
/**
 * Ligar uma conta da Steam a alguém da audiência.
 *
 * Dois casos reais dele, medidos em 27/08/2026, e cada um quebra o caminho
 * do outro:
 *
 *   dilanzito   nome na Steam "DiLANZiTO" → bate direto com "dilanzito"
 *               na audiência. Mas a URL personalizada dele é
 *               "8888888899977" — lixo, não leva a lugar nenhum.
 *
 *   Tchubita    nome na Steam "Tchubita" NÃO bate com "hai_suzy" — não têm
 *               uma letra em comum. Mas a URL personalizada dela é
 *               "haisuzy", que é o apelido na Kick sem o "_".
 *
 * Então são dois caminhos, e o produto precisa dos dois:
 *
 *   1. NOME PARA DENTRO — nome de exibição e histórico da conta, cruzados
 *      contra a audiência. Uma requisição por consulta.
 *   2. URL PARA FORA — para cada espectador, tentar o apelido dele como URL
 *      personalizada da Steam e ver em que conta cai. Uma requisição por
 *      espectador, uma vez na vida: URL personalizada quase nunca muda.
 *
 * O caminho 2 é o caro, e é por isso que ele é um índice construído uma vez
 * e guardado — não uma busca feita na hora da pergunta.
 */

const { pelaVanity, historicoDeNomes, perfilPublico, ehSteamId64 } = require('./steam');

/**
 * Constrói o índice do caminho 2: SteamID → quem é na sua audiência.
 *
 * @param {Array<{nome:string}>} audiencia
 * @param {object} op
 * @param {(nome:string)=>Promise<object|null>} [op.resolver] injetável
 * @param {Map} [op.jaSabido] resultados anteriores, para não repetir rede
 * @param {number} [op.pausaMs] respiro entre requisições
 */
async function indexarAudiencia(audiencia, {
  resolver = pelaVanity, jaSabido = new Map(), pausaMs = 250, aoAndar = () => {},
} = {}) {
  const porSteamId = new Map();
  const porNome = new Map(jaSabido);

  for (const p of audiencia || []) {
    const nome = p?.nome;
    if (!nome) continue;

    if (!porNome.has(nome)) {
      let r = null;
      try { r = await resolver(nome); } catch { r = null; }
      // Guarda o "não achei" também: sem isso, cada varredura tenta de novo
      // todo mundo que não tem URL personalizada — que é a maioria.
      porNome.set(nome, r);
      aoAndar(nome, r);
      if (pausaMs) await new Promise((ok) => setTimeout(ok, pausaMs));
    }
    const r = porNome.get(nome);
    if (r?.steamId) porSteamId.set(r.steamId, { espectador: nome, ...r });
  }
  return { porSteamId, porNome };
}

/**
 * A pergunta: essa conta da Steam é alguém da minha audiência?
 *
 * Devolve TODAS as ligações encontradas, com o caminho de cada uma — quem
 * lê precisa saber se bateu por nome (que pode ser coincidência) ou por URL
 * personalizada (que é a mesma conta, sem dúvida).
 */
async function quemE(steamId, indice, {
  buscar,
  cruzar,          // (nome) => {entrada,confianca,motivo} | null
} = {}) {
  if (!ehSteamId64(steamId)) throw new Error(`SteamID64 inválido: ${steamId}`);
  const achados = [];

  // Caminho 2 primeiro: é prova de identidade, não semelhança de nome.
  const porUrl = indice?.porSteamId?.get(steamId);
  if (porUrl) {
    achados.push({
      espectador: porUrl.espectador,
      via: `URL personalizada da Steam "${porUrl.vanity}"`,
      confianca: 1,
      forte: true,
    });
  }

  // Caminho 1: nome de exibição e histórico.
  let perfil = null; let hist = { nomes: [] };
  try { perfil = await perfilPublico(steamId, buscar); } catch { perfil = null; }
  try { hist = await historicoDeNomes(steamId, buscar); } catch { hist = { nomes: [] }; }

  const nomes = [...new Set([perfil?.nome, ...(hist.nomes || [])].filter(Boolean))];
  for (const n of nomes) {
    const r = cruzar ? cruzar(n) : null;
    if (!r) continue;
    if (achados.some((a) => a.espectador === r.entrada.nome && a.forte)) continue;
    achados.push({
      espectador: r.entrada.nome,
      via: `nome da Steam "${n}"`,
      confianca: r.confianca,
      motivo: r.motivo,
      forte: false,
    });
  }

  return {
    steamId,
    nomeNaSteam: perfil?.nome ?? null,
    privado: perfil?.privado ?? null,
    nomesConferidos: nomes,
    achados: achados.sort((a, b) => (b.forte - a.forte) || (b.confianca - a.confianca)),
    // NUNCA "essa pessoa não assistiu". Só "não achei ligação", que é outra
    // coisa: ela pode assistir deslogada, ou com apelido que não leva a
    // conta nenhuma — como o "8888888899977" de um espectador real dele.
    conclusao: achados.length ? 'é alguém da sua audiência' : 'não achei ligação com sua audiência',
  };
}

module.exports = { indexarAudiencia, quemE };
