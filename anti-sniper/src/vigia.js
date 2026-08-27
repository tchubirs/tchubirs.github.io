'use strict';
/**
 * Vigia ao vivo.
 *
 * Regra que define este arquivo, e que reescreveu o projeto inteiro:
 * **stream sniper se pega no ato, não horas depois.** O alerta tem que sair
 * enquanto o streamer ainda pode fazer alguma coisa — sair do lugar, trocar
 * de rota, parar de mostrar o mapa. Relatório de terça passada não salva base
 * nenhuma.
 *
 * Por isso aqui não tem estatística acumulada, não tem correção de
 * multiplicidade, não tem modelo. Tem três checagens que dão para fazer
 * instantaneamente, e um alerta que sai na hora.
 */

const { cruzar } = require('./nomes');

/** Entrar no servidor logo depois de você ficar ao vivo é o sinal mais
 *  simples que existe. Janela curta: quem entra 10 minutos depois pode ser
 *  coincidência; quem entra em 90 segundos, muito menos. */
const JANELA_ENTRADA_MS = 90 * 1000;

/** Não repetir o mesmo alerta a cada varredura. No meio de uma raid, alerta
 *  repetido é ruído e o streamer para de olhar. */
const SILENCIO_MS = 5 * 60 * 1000;

class Vigia {
  /**
   * @param {(alerta:object)=>void} aoAlertar chamado NA HORA
   * @param {()=>number} [agora]
   */
  constructor({ aoAlertar, agora = Date.now, janelaEntradaMs = JANELA_ENTRADA_MS,
                silencioMs = SILENCIO_MS, confiancaMinima = 0.7 } = {}) {
    if (typeof aoAlertar !== 'function') throw new Error('aoAlertar é obrigatório');
    this.aoAlertar = aoAlertar;
    this.agora = agora;
    this.janelaEntradaMs = janelaEntradaMs;
    this.silencioMs = silencioMs;
    this.confiancaMinima = confiancaMinima;

    this.aoVivoDesde = null;
    /** A primeira varredura depois de ficar ao vivo é LINHA DE BASE: quem
     *  está nela já estava no servidor antes e não entrou atrás de ninguém.
     *  Sem isto, o vigia dispara um alerta para cada jogador que já estava
     *  lá no segundo zero — e o streamer para de olhar os alertas. */
    this.temLinhaDeBase = false;
    this.noServidor = new Map();   // steamid -> {nome, entrouEm, entrouDepois}
    this.noChat = [];
    this.ultimoAlerta = new Map(); // chave -> t
  }

  ficouAoVivo(t = this.agora()) {
    this.aoVivoDesde = t;
    // Quem já estava no servidor antes não é suspeito de ter entrado atrás.
    for (const p of this.noServidor.values()) p.entrouDepois = false;
    this.temLinhaDeBase = this.noServidor.size > 0;
  }

  saiuDoAr() { this.aoVivoDesde = null; this.temLinhaDeBase = false; }

  /** Lista de jogadores do servidor, como o RCON devolve. */
  servidor(jogadores, t = this.agora()) {
    const vistos = new Set();
    for (const j of jogadores || []) {
      const id = j.steamid ?? j.nome;
      if (id == null) continue;
      vistos.add(id);
      if (!this.noServidor.has(id)) {
        const entrouDepois =
          this.temLinhaDeBase &&
          this.aoVivoDesde != null &&
          t >= this.aoVivoDesde &&
          t - this.aoVivoDesde <= this.janelaEntradaMs;
        this.noServidor.set(id, { nome: j.nome, steamid: j.steamid, entrouEm: t, entrouDepois });
        if (entrouDepois) {
          this._alertar({
            tipo: 'entrou-logo-depois',
            urgencia: 'media',
            jogo: j.nome, steamid: j.steamid,
            segundosDepoisDoAoVivo: Math.round((t - this.aoVivoDesde) / 1000),
            texto: `${j.nome} entrou no servidor ${Math.round((t - this.aoVivoDesde) / 1000)}s depois de você ficar ao vivo`,
          }, t);
        }
      }
    }
    for (const id of [...this.noServidor.keys()]) if (!vistos.has(id)) this.noServidor.delete(id);
    // A partir daqui já existe retrato de quem estava no servidor.
    this.temLinhaDeBase = true;
    this._cruzar(t);
  }

  /** Quem está conectado ao chat agora (Get Chatters devolve conectados,
   *  não só quem falou — inclui quem está calado assistindo). */
  chat(espectadores, t = this.agora()) {
    this.noChat = espectadores || [];
    this._cruzar(t);
  }

  _cruzar(t) {
    if (!this.aoVivoDesde) return;
    const jogadores = [...this.noServidor.values()];
    for (const m of cruzar(jogadores, this.noChat, this.confiancaMinima)) {
      const p = jogadores.find((j) => j.nome === m.jogo);
      const tambemEntrouDepois = !!p?.entrouDepois;
      this._alertar({
        tipo: tambemEntrouDepois ? 'nome-bate-e-entrou-depois' : 'nome-bate',
        // Os dois sinais juntos é o que ele descreveu ter visto funcionando.
        urgencia: tambemEntrouDepois ? 'alta' : 'media',
        jogo: m.jogo, steamid: m.steamid, chat: m.chat, chatId: m.chatId,
        confianca: m.confianca, motivo: m.motivo,
        texto: tambemEntrouDepois
          ? `${m.jogo} está na sua live como "${m.chat}" E entrou logo depois de você`
          : `${m.jogo} está no servidor e na sua live como "${m.chat}"`,
      }, t);
    }
  }

  _alertar(a, t) {
    const chave = `${a.tipo}:${a.steamid ?? a.jogo}`;
    const ultimo = this.ultimoAlerta.get(chave);
    if (ultimo != null && t - ultimo < this.silencioMs) return;
    this.ultimoAlerta.set(chave, t);
    this.aoAlertar({ ...a, em: t });
  }

  /** Estado para desenhar num overlay durante a live. */
  estado() {
    return {
      aoVivo: this.aoVivoDesde != null,
      noServidor: this.noServidor.size,
      noChat: this.noChat.length,
      suspeitos: cruzar([...this.noServidor.values()], this.noChat, this.confiancaMinima),
    };
  }
}

module.exports = { Vigia, JANELA_ENTRADA_MS, SILENCIO_MS };
