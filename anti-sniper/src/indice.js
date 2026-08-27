'use strict';
/**
 * Índice de audiência.
 *
 * Nasceu de uma medição: um servidor de Rust tem até 1.500 jogadores, e um
 * canal acumula milhares de espectadores. Comparar todos contra todos são
 * 7,5 milhões de comparações — e cada uma normalizava as DUAS strings de
 * novo. Rodou mais de dois minutos sem terminar.
 *
 * O conserto tem duas partes:
 *   1. normalizar cada nome UMA vez, não a cada comparação;
 *   2. procurar por tabela em vez de varrer, e só cair na comparação
 *      aproximada para um punhado de candidatos plausíveis.
 */

const { normalizar, distancia } = require('./nomes');

/** Chave de balde: nomes só podem ser "quase iguais" se tiverem tamanho
 *  parecido. Agrupar por tamanho corta o espaço de busca drasticamente
 *  sem descartar nenhum par que a distância de edição aceitaria. */
function baldes(norm, folga = 2) {
  const fora = [];
  for (let d = -folga; d <= folga; d++) {
    const t = norm.length + d;
    if (t >= 3) fora.push(t);
  }
  return fora;
}

class Indice {
  /** @param {Array<{nome:string}>} pessoas */
  constructor(pessoas) {
    this.exato = new Map();      // normalizado -> [entradas]
    this.leet = new Map();       // normalizado com leet -> [entradas]
    this.porTamanho = new Map(); // comprimento -> [entradas]
    this.n = 0;

    for (const p of pessoas || []) {
      const norm = normalizar(p.nome);
      if (!norm) continue;
      const entrada = { ...p, norm, normLeet: normalizar(p.nome, { agressivo: true }) };
      this.n += 1;
      for (const [mapa, chave] of [[this.exato, entrada.norm], [this.leet, entrada.normLeet]]) {
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(entrada);
      }
      const t = norm.length;
      if (!this.porTamanho.has(t)) this.porTamanho.set(t, []);
      this.porTamanho.get(t).push(entrada);
    }
  }

  /**
   * Procura o melhor casamento para um nome de jogador.
   * @returns {null|{entrada:object, confianca:number, motivo:string}}
   */
  procurar(nomeJogador, { minimo = 0.7 } = {}) {
    const a = normalizar(nomeJogador);
    if (!a) return null;

    const achado = this.exato.get(a);
    if (achado) return { entrada: achado[0], confianca: 1.0, motivo: 'idêntico após normalizar' };

    const aLeet = normalizar(nomeJogador, { agressivo: true });
    const porLeet = this.leet.get(aLeet);
    if (porLeet) return { entrada: porLeet[0], confianca: 0.90, motivo: 'idêntico tratando leet' };

    if (minimo > 0.9) return null;  // quem pede só casamento forte já terminou

    // Só agora a parte cara, e apenas contra candidatos de tamanho próximo.
    let melhor = null;
    for (const t of baldes(a)) {
      for (const e of this.porTamanho.get(t) ?? []) {
        const curto = Math.min(a.length, e.norm.length);
        const longo = Math.max(a.length, e.norm.length);
        if (curto >= 4 && curto / longo >= 0.6 && (a.includes(e.norm) || e.norm.includes(a))) {
          if (!melhor || melhor.confianca < 0.75) melhor = { entrada: e, confianca: 0.75, motivo: 'um contém o outro' };
          continue;
        }
        if (curto < 5) continue;
        const d = distancia(a, e.norm, 2);
        if (d === 1 && (!melhor || melhor.confianca < 0.70)) melhor = { entrada: e, confianca: 0.70, motivo: '1 caractere de diferença' };
        else if (d === 2 && curto >= 7 && (!melhor || melhor.confianca < 0.55)) melhor = { entrada: e, confianca: 0.55, motivo: '2 caracteres de diferença' };
      }
    }
    return melhor && melhor.confianca >= minimo ? melhor : null;
  }

  /** Cruza uma lista inteira de jogadores de uma vez. */
  cruzar(jogadores, op) {
    const fora = [];
    for (const j of jogadores || []) {
      const r = this.procurar(j.nome ?? j, op);
      if (r) fora.push({ jogador: j.nome ?? j, ...r });
    }
    return fora.sort((x, y) => y.confianca - x.confianca);
  }
}

module.exports = { Indice };
