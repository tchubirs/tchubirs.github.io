'use strict';
/**
 * O coletor de presença — quem está assistindo, inclusive calado.
 *
 * O buraco que ele apontou: o webhook da Kick só entrega MENSAGEM. Quem
 * assiste duas horas sem escrever nada não existe para o serviço, e é
 * justamente esse o perfil de quem observa uma live para saber onde você
 * está. A API pública da Kick não tem lista de quem está conectado — só
 * `viewer_count`, um número (conferido na especificação deles em 27/08/2026).
 *
 * A saída é indireta e funciona: **qualquer contador que sobe por assistir
 * é um sinal de presença.** O StreamElements dá ponto de fidelidade por
 * tempo assistido, a quem está conectado — falando ou não. Quem ganhou
 * ponto entre duas leituras estava lá naquele intervalo.
 *
 * Não é preciso lista de espectadores. Basta ver o placar mudar.
 */

/**
 * @param {object} dep
 * @param {()=>Promise<Array<{nome:string,pontos:number}>>} dep.placar
 *        lê o placar de fidelidade agora
 * @param {(nome:string, tMs:number)=>void} dep.aoVer chamado para cada
 *        pessoa vista — no serviço é `ver(canal, 'live', nome, t)`
 * @param {()=>number} [dep.agora]
 */
function criarColetor({ placar, aoVer, agora = Date.now, aoErro = () => {} }) {
  let anterior = null;
  let rodando = false;
  let temporizador = null;

  /**
   * Uma passada: lê o placar e credita presença a quem subiu.
   *
   * A PRIMEIRA leitura não credita ninguém. Sem um "antes" não existe
   * diferença, e tratar a leitura inicial como presença marcaria a
   * audiência inteira de anos atrás como estando na live agora.
   */
  async function passada() {
    let lista;
    try { lista = await placar(); }
    catch (e) { aoErro(e); return { base: false, vistos: 0, erro: e }; }

    const t = agora();
    const atual = new Map();
    for (const u of lista || []) {
      if (u && u.nome != null) atual.set(u.nome, Number(u.pontos) || 0);
    }

    if (!anterior) {
      anterior = atual;
      return { base: true, vistos: 0 };
    }

    let vistos = 0;
    for (const [nome, pontos] of atual) {
      const antes = anterior.get(nome);
      // Conta só quem SUBIU. Quem apareceu agora no placar pode ser gente
      // nova que acabou de ganhar o primeiro ponto — mas pode ser alguém
      // que entrou na página seguinte da lista, e creditar isso inventaria
      // presença. Na dúvida, não credita.
      if (antes != null && pontos > antes) { aoVer(nome, t); vistos += 1; }
    }
    anterior = atual;
    return { base: false, vistos, total: atual.size };
  }

  /** Liga o ciclo. O intervalo vira a resolução da linha do tempo: ler de
   *  5 em 5 min significa saber a entrada e a saída com 5 min de folga. */
  function ligar(intervaloMs = 5 * 60 * 1000) {
    if (rodando) return;
    rodando = true;
    const passo = () => {
      passada().finally(() => {
        if (rodando) temporizador = setTimeout(passo, intervaloMs);
      });
    };
    passo();
  }

  function desligar() {
    rodando = false;
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
  }

  /** Esquece a base — usado quando a live recomeça e o placar reinicia. */
  function zerar() { anterior = null; }

  return { passada, ligar, desligar, zerar, get ligado() { return rodando; } };
}

module.exports = { criarColetor };
