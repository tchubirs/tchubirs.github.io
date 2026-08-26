/**
 * Troca federada de sinais de spam.
 *
 * O que trafega entre servidores: digests de 64 bits e contagens. Nunca texto,
 * nunca identificador de usuário, nunca URL. Um servidor consegue descobrir
 * "esta mesma campanha atingiu outros 4 servidores" sem que nenhum deles
 * revele o que seus usuários escreveram.
 *
 * Modelo de ameaça explícito — um servidor malicioso vai tentar:
 *   (a) reportar em massa conteúdo legítimo para silenciar alguém;
 *   (b) inflar a própria reputação reportando spam óbvio;
 *   (c) inundar o feed para estourar memória dos assinantes.
 * As defesas para cada um estão marcadas no código.
 */

import { fromHex, hamming } from "./simhash.js";

/** Defesa (c): teto de registros por servidor por janela. */
export const MAX_REPORTS_PER_SERVER_PER_HOUR = 500;

/** Defesa (a): um servidor sozinho nunca conta como confirmação. */
export const MIN_INDEPENDENT_SERVERS = 2;

export class SignalStore {
  /**
   * @param {object} [opts]
   * @param {number} [opts.nearDuplicateBits]  distância que ainda conta como a mesma campanha
   * @param {number} [opts.retentionMs]        por quanto tempo um relato vale
   */
  constructor(opts = {}) {
    this.nearDuplicateBits = opts.nearDuplicateBits ?? 3;
    this.retentionMs = opts.retentionMs ?? 7 * 24 * 3600_000;
    /** @type {Map<string, {digest: bigint, servers: Map<string, number>}>} */
    this.entries = new Map();
    /** @type {Map<string, number[]>} carimbos por servidor, para limite de taxa */
    this.rate = new Map();
  }

  /** Defesa (c): recusa servidor que passa do teto na janela de 1h. */
  _rateOk(server, now) {
    const janela = now - 3600_000;
    const carimbos = (this.rate.get(server) ?? []).filter((t) => t > janela);
    if (carimbos.length >= MAX_REPORTS_PER_SERVER_PER_HOUR) {
      this.rate.set(server, carimbos);
      return false;
    }
    carimbos.push(now);
    this.rate.set(server, carimbos);
    return true;
  }

  /**
   * Registra um relato vindo de outro servidor.
   * @returns {boolean} false se recusado por limite de taxa
   */
  report({ digest, server, at }) {
    const now = at ?? Date.now();
    if (!server) throw new Error("relato sem servidor de origem");
    if (!this._rateOk(server, now)) return false;

    const d = typeof digest === "bigint" ? digest : fromHex(String(digest));
    const chave = this._findBucket(d) ?? d.toString(16).padStart(16, "0");

    let entrada = this.entries.get(chave);
    if (!entrada) {
      entrada = { digest: d, servers: new Map() };
      this.entries.set(chave, entrada);
    }
    // Defesa (b): um servidor conta UMA vez por campanha, por mais que reporte.
    entrada.servers.set(server, now);
    return true;
  }

  /** Acha um bucket existente cujo digest seja quase-duplicado deste. */
  _findBucket(d) {
    for (const [chave, e] of this.entries) {
      if (hamming(e.digest, d) <= this.nearDuplicateBits) return chave;
    }
    return null;
  }

  /**
   * Quantos servidores INDEPENDENTES reportaram algo parecido com isto.
   * É este número que alimenta o sinal `federatedReports`.
   */
  reportingServers(digest, now = Date.now()) {
    const d = typeof digest === "bigint" ? digest : fromHex(String(digest));
    const chave = this._findBucket(d);
    if (!chave) return 0;
    const entrada = this.entries.get(chave);
    let n = 0;
    for (const [, at] of entrada.servers) {
      if (now - at <= this.retentionMs) n++;
    }
    // Defesa (a): abaixo do mínimo de servidores independentes, vale zero.
    return n >= MIN_INDEPENDENT_SERVERS ? n : 0;
  }

  /** Remove relatos vencidos. Chamar periodicamente. */
  prune(now = Date.now()) {
    let removidos = 0;
    for (const [chave, e] of this.entries) {
      for (const [srv, at] of e.servers) {
        if (now - at > this.retentionMs) { e.servers.delete(srv); removidos++; }
      }
      if (e.servers.size === 0) this.entries.delete(chave);
    }
    return removidos;
  }

  /**
   * Feed público deste servidor, para outros consumirem.
   * Só digest e contagem — nada mais sai daqui.
   */
  publish(now = Date.now()) {
    const items = [];
    for (const [chave, e] of this.entries) {
      const n = [...e.servers.values()].filter((at) => now - at <= this.retentionMs).length;
      if (n > 0) items.push({ digest: chave, servers: n });
    }
    return { version: 1, generated: new Date(now).toISOString(), items };
  }

  /** Consome o feed de outro servidor. */
  ingest(feed, sourceServer, now = Date.now()) {
    if (!feed || feed.version !== 1 || !Array.isArray(feed.items)) {
      throw new Error("formato de feed desconhecido");
    }
    let aceitos = 0;
    for (const item of feed.items) {
      if (this.report({ digest: item.digest, server: sourceServer, at: now })) aceitos++;
    }
    return aceitos;
  }
}
