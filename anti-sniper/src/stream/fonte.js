'use strict';
/**
 * Contrato de "quem está assistindo agora".
 *
 * A porta por onde entram OUTRAS PLATAFORMAS. Twitch, Kick e YouTube têm
 * APIs que não se parecem em nada — uma é polling de lista, outra é webhook,
 * outra é chat ao vivo. Acima daqui, tudo vira a mesma coisa.
 *
 * Ponto que custou caro descobrir e que define este arquivo: na Twitch o
 * endpoint `Get Chatters` devolve quem está **conectado** ao chat, não quem
 * falou. Ou seja, inclui quem assiste calado. É por isso que bot de
 * fidelidade consegue dar ponto por tempo assistido, e é isso que torna o
 * cruzamento possível.
 */

class FonteDeStream {
  /** @returns {Promise<Array<{nome:string,id?:string}>>} quem está no chat AGORA */
  async espectadores() { throw new Error('não implementado'); }

  /** @returns {Promise<{aoVivo:boolean, desde?:number}>} */
  async estadoDaLive() { throw new Error('não implementado'); }

  /**
   * Avisa quando a live começa. Onde a plataforma tem evento (EventSub na
   * Twitch, webhook na Kick), usa o evento; onde não tem, cai para polling.
   * O instante do "ficou ao vivo" é a âncora do sinal "entrou depois de
   * você" — se ele vier atrasado, o sinal inteiro atrasa junto.
   */
  aoFicarAoVivo(_callback) {}

  async fechar() {}
  get descricao() { return this.constructor.name; }
}

module.exports = { FonteDeStream };
