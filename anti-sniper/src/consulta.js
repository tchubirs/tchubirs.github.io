'use strict';
/**
 * A consulta.
 *
 * Forma do produto, corrigida por ele: **não é monitor preso a um servidor,
 * é ferramenta de pesquisa.** Você desconfia de alguém, pega a SteamID dessa
 * pessoa (do combat log, de quem te matou) e pergunta: essa pessoa está me
 * assistindo?
 *
 * Isso funciona em QUALQUER servidor, sem RCON, sem ser admin, sem o dono do
 * servidor cooperar. O desenho anterior exigia RCON e por isso só servia para
 * quem tem servidor próprio — o que matava o produto para 99% dos streamers.
 *
 * Devolve EVIDÊNCIA, nunca veredito. Quem decide é a pessoa.
 */

const { compararHistorico } = require('./nomes');
const { chavesDeIdentidade, ehSteamId64 } = require('./steam');

/**
 * @param {string} steamId64 de quem se desconfia
 * @param {Array<{nome:string,id?:string,minutosAssistidos?:number}>} audiencia
 *        quem esteve no seu chat — do Get Chatters agora, ou do histórico de
 *        tempo assistido que o StreamElements já guardou
 * @param {object} [op]
 */
async function consultar(steamId64, audiencia, op = {}) {
  const { buscar, minimo = 0.7 } = op;
  if (!ehSteamId64(steamId64)) throw new Error(`SteamID64 inválido: ${steamId64}`);

  const hist = await chavesDeIdentidade(steamId64, buscar);
  hist.nomes = hist.chaves;

  // Perfil privado NÃO é perfil limpo. Sem chaves não há o que cruzar, e
  // dizer "não encontrado" aqui seria mentir por omissão: soaria como
  // inocência quando na verdade não se olhou nada.
  if (hist.perfil?.privado || hist.nomes.length === 0) {
    return {
      steamId: steamId64,
      conclusao: 'inconclusivo',
      motivo: hist.perfil?.privado
        ? 'perfil PRIVADO — não dá para ver nome, histórico nem URL. Isso não é sinal de nada, nem a favor nem contra'
        : 'perfil sem nome, URL personalizada nem histórico público',
      historico: hist.nomes ?? [],
      urlPersonalizada: hist.perfil?.vanity ?? null,
      evidencias: [],
    };
  }

  // URL personalizada que é só dígitos ou lixo aleatório não é apelido de
  // ninguém — é ruído, e casá-la produziria falso positivo. Ele mesmo usa
  // "23333213254r256t1".
  const util = (c) => c && !/^[0-9]{6,}$/.test(c) && !/^[0-9a-z]{12,}$/i.test(c);
  hist.nomes = hist.nomes.filter(util);
  if (hist.nomes.length === 0) {
    return {
      steamId: steamId64,
      conclusao: 'inconclusivo',
      motivo: 'os identificadores dessa conta são aleatórios e não servem para cruzar',
      historico: [],
      urlPersonalizada: hist.perfil?.vanity ?? null,
      evidencias: [],
    };
  }

  const evidencias = [];
  for (const v of audiencia || []) {
    const r = compararHistorico(hist.nomes, v.nome);
    if (r.confianca >= minimo) {
      evidencias.push({
        espectador: v.nome,
        espectadorId: v.id,
        nomeSteamQueBateu: r.nomeUsado,
        confianca: r.confianca,
        motivo: r.motivo,
        minutosAssistidos: v.minutosAssistidos,
      });
    }
  }
  evidencias.sort((a, b) => b.confianca - a.confianca);

  return {
    steamId: steamId64,
    // Nunca "é sniper". A ferramenta mostra que a pessoa estava assistindo;
    // assistir não é crime, e quem julga o contexto é quem jogou a partida.
    conclusao: evidencias.length ? 'esteve na sua live' : 'não encontrado na sua audiência',
    historico: hist.nomes,
    urlPersonalizada: hist.perfil?.vanity ?? null,
    redesPublicadas: hist.perfil?.redes ?? [],
    evidencias,
  };
}

/** Texto pronto para mostrar na tela, no instante da suspeita. */
function emTexto(r) {
  if (r.conclusao === 'inconclusivo') return `⚪ ${r.motivo}`;
  if (!r.evidencias.length) {
    return `⚪ Nenhum dos ${r.historico.length} nomes dessa conta bate com quem assistiu.`;
  }
  const e = r.evidencias[0];
  const min = e.minutosAssistidos != null ? `, ${e.minutosAssistidos} min assistidos` : '';
  return `🔴 Essa conta já se chamou "${e.nomeSteamQueBateu}" — e "${e.espectador}" ` +
         `esteve na sua live${min}. (${Math.round(e.confianca * 100)}% de semelhança: ${e.motivo})`;
}

module.exports = { consultar, emTexto };
