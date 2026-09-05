'use strict';
/**
 * Medidor da janela móvel de 30 dias.
 *
 * Existe para responder uma pergunta que hoje não tem resposta: **quanto
 * falta**. Sem isto o streamer transmite no escuro, sem saber se está em 137
 * ou em 240 chatters únicos, e não consegue decidir nada.
 *
 * Os limiares NÃO estão fixos no código de propósito. Os números que
 * circulam vêm de blog, não da Kick — e a Kick não publica tabela. Quem
 * confirma é o painel do próprio streamer. Chutar número aqui seria repetir
 * o erro de tratar suposição como medida.
 */

const JANELA_MS = 30 * 24 * 60 * 60 * 1000;

class Medidor {
  /**
   * @param {object} limiares metas confirmadas no painel do próprio canal.
   *   Deixe vazio para só contar, sem julgar progresso.
   */
  constructor(limiares = {}) {
    this.limiares = limiares;
    this.mensagens = [];   // {t, usuarioId}
    this.seguidas = [];    // {t, usuarioId}
    this.assinaturas = []; // {t, usuarioId}
    this.transmissoes = []; // {inicio, fim|null}
    /** Quem já falou ALGUMA vez, para sempre. É o que distingue rosto novo
     *  de frequentador — e rosto novo é o que ele disse que falta. */
    this.jaFalaramAlgumaVez = new Set();
  }

  _podar(agoraMs) {
    const corte = agoraMs - JANELA_MS;
    const vivo = (e) => e.t >= corte;
    this.mensagens = this.mensagens.filter(vivo);
    this.seguidas = this.seguidas.filter(vivo);
    this.assinaturas = this.assinaturas.filter(vivo);
    this.transmissoes = this.transmissoes.filter((s) => (s.fim ?? s.inicio) >= corte);
  }

  /**
   * Ingere um evento já VERIFICADO. Nunca chame isto com evento cru: sem a
   * checagem de assinatura, qualquer um infla os números pela URL do webhook.
   * @returns {{primeiraVez:boolean}|null}
   */
  ingerir(tipo, dados, tMs) {
    switch (tipo) {
      case 'chat.message': {
        const id = dados?.sender?.user_id ?? dados?.sender?.username;
        if (id == null) return null;
        const primeiraVez = !this.jaFalaramAlgumaVez.has(id);
        this.jaFalaramAlgumaVez.add(id);
        this.mensagens.push({ t: tMs, usuarioId: id });
        return { primeiraVez };
      }
      case 'channel.followed': {
        const id = dados?.follower?.user_id ?? dados?.follower?.username;
        if (id == null) return null;
        this.seguidas.push({ t: tMs, usuarioId: id });
        return null;
      }
      case 'channel.subscription.created':
      case 'channel.subscription.renewal': {
        const id = dados?.subscriber?.user_id ?? dados?.subscriber?.username;
        if (id == null) return null;
        this.assinaturas.push({ t: tMs, usuarioId: id });
        return null;
      }
      case 'livestream.status.updated': {
        if (dados?.is_live) {
          this.transmissoes.push({ inicio: tMs, fim: null });
        } else {
          // fecha a última aberta. Evento de início perdido não pode virar
          // transmissão infinita — sem par, o tempo simplesmente não conta.
          const aberta = [...this.transmissoes].reverse().find((s) => s.fim === null);
          if (aberta) aberta.fim = tMs;
        }
        return null;
      }
      default:
        return null;
    }
  }

  /** Horas transmitidas na janela. Transmissão em curso conta até agora. */
  horas(agoraMs) {
    const corte = agoraMs - JANELA_MS;
    let ms = 0;
    for (const s of this.transmissoes) {
      const ini = Math.max(s.inicio, corte);
      const fim = s.fim ?? agoraMs;
      if (fim > ini) ms += fim - ini;
    }
    return ms / 3600000;
  }

  relatorio(agoraMs) {
    this._podar(agoraMs);

    // Dedupe por usuário: o programa conta PESSOAS, não mensagens. Um
    // frequentador que manda 400 mensagens continua sendo um chatter.
    const chattersUnicos = new Set(this.mensagens.map((m) => m.usuarioId)).size;
    const seguidoresNovos = new Set(this.seguidas.map((s) => s.usuarioId)).size;
    const assinantesAtivos = new Set(this.assinaturas.map((a) => a.usuarioId)).size;
    const horas = this.horas(agoraMs);

    const atual = { chattersUnicos, seguidoresNovos, assinantesAtivos, horas };
    const progresso = {};
    for (const [chave, meta] of Object.entries(this.limiares)) {
      const valor = atual[chave];
      if (valor == null || !meta) continue;
      progresso[chave] = {
        valor: Math.round(valor * 10) / 10,
        meta,
        falta: Math.max(0, Math.round((meta - valor) * 10) / 10),
        atingido: valor >= meta,
      };
    }
    return {
      janelaDias: 30,
      ...atual,
      horas: Math.round(horas * 10) / 10,
      mensagens: this.mensagens.length,
      progresso,
      tudoAtingido:
        Object.keys(progresso).length > 0 &&
        Object.values(progresso).every((p) => p.atingido),
    };
  }
}

module.exports = { JANELA_MS, Medidor };
