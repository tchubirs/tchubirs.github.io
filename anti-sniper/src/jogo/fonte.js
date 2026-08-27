'use strict';
/**
 * Contrato de "quem está no servidor agora".
 *
 * Existe uma razão só para este arquivo: ele é a porta por onde entram
 * OUTROS JOGOS. Rust hoje, qualquer coisa depois — e nada acima daqui
 * precisa saber qual é o jogo.
 *
 * Quem implementa devolve sempre a MESMA forma:
 *   [{ nome, id?, entrouHa?, posicao? }]
 *
 * `nome` é obrigatório porque é o que cruza com o chat.
 * `id` é o identificador estável (SteamID64 no Rust) quando existir — nome
 * muda, id não.
 * Os outros são opcionais: RCON dá, consulta pública não dá. Nada acima
 * pode DEPENDER deles, só aproveitar quando vierem.
 */

class FonteDeJogo {
  /** @returns {Promise<Array<{nome:string,id?:string,entrouHa?:number,posicao?:object}>>} */
  async jogadores() { throw new Error('não implementado'); }

  /** Fecha conexão, cancela timer. Chamado quando a live acaba. */
  async fechar() {}

  /** Nome legível da fonte, para log e para a tela de configuração. */
  get descricao() { return this.constructor.name; }
}

/**
 * O que cada fonte consegue entregar. O vigia usa isto para não prometer
 * sinal que a fonte não sustenta — em vez de falhar calado em produção.
 */
const CAPACIDADES = {
  NOMES: 'nomes',            // lista de nomes — o mínimo para cruzar com o chat
  IDENTIDADE: 'identidade',  // id estável, sobrevive a troca de nome
  ENTRADA: 'entrada',        // há quanto tempo entrou — habilita "entrou depois de você"
  POSICAO: 'posicao',        // onde está no mapa — só com admin
};

module.exports = { FonteDeJogo, CAPACIDADES };
