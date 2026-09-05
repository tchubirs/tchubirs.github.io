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
 * tempo assistido, a quem está conectado — falando ou não. Quem subiu entre
 * duas leituras estava lá naquele intervalo.
 *
 * Não é preciso lista de espectadores. Basta ver o contador mudar.
 *
 * Duas formas, e a segunda é a que escala:
 *
 *   - PLACAR: lê a lista inteira e credita quem subiu. Simples, mas o
 *     placar vem ordenado por pontos de TODOS OS TEMPOS — quem está
 *     assistindo agora pode estar em qualquer posição de uma lista com
 *     centenas de milhares de nomes. Medido em 27/08/2026 contra um canal
 *     real: **zero em 300**. Serve só para canal pequeno.
 *
 *   - ALVOS: pergunta pelos poucos que interessam — os que casaram com
 *     alguém que está no servidor agora. Uma consulta por pessoa, e o
 *     endpoint por pessoa ainda devolve `watchtime`, que o placar não
 *     devolve.
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
      if (!u || u.nome == null) continue;
      // Tempo assistido é o sinal preferido: sobe só por estar com a live
      // aberta. Ponto também sobe por seguir, dar sub ou resgatar prêmio —
      // serve de reserva quando a fonte não expõe tempo.
      const v = u.minutosAssistidos != null ? Number(u.minutosAssistidos) : Number(u.pontos);
      atual.set(u.nome, Number.isFinite(v) ? v : 0);
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

/**
 * Coletor por ALVOS: pergunta só por quem interessa.
 *
 * Quem interessa são os poucos nomes que casaram com alguém do servidor.
 * Perguntar por 8 pessoas a cada 2 min é barato; varrer o placar inteiro
 * atrás delas não é.
 *
 * @param {(nome:string)=>Promise<null|{pontos:number,segundosAssistidos:number|null}>} dep.medir
 * @param {()=>Iterable<string>} dep.alvos quem vigiar agora — muda sozinho
 *        conforme entra e sai gente do servidor
 */
function criarColetorDeAlvos({ medir, alvos, aoVer, agora = Date.now, aoErro = () => {} }) {
  const anterior = new Map();
  let rodando = false;
  let temporizador = null;

  async function passada() {
    const t = agora();
    let vistos = 0; let base = 0; let perguntados = 0;
    for (const nome of alvos() || []) {
      perguntados += 1;
      let m;
      try { m = await medir(nome); }
      catch (e) { aoErro(e); continue; }
      // null = essa pessoa nunca pontuou no canal. Não dá para medir
      // presença dela por aqui, e isso não é ausência.
      if (!m) { anterior.delete(nome); continue; }

      const antes = anterior.get(nome);
      anterior.set(nome, m);
      if (!antes) { base += 1; continue; }
      const subiu = (m.segundosAssistidos != null && antes.segundosAssistidos != null
        ? m.segundosAssistidos > antes.segundosAssistidos
        : false) || m.pontos > antes.pontos;
      if (subiu) { aoVer(nome, t); vistos += 1; }
    }
    return { perguntados, base, vistos };
  }

  function ligar(intervaloMs = 2 * 60 * 1000) {
    if (rodando) return;
    rodando = true;
    const passo = () => passada().finally(() => {
      if (rodando) temporizador = setTimeout(passo, intervaloMs);
    });
    passo();
  }
  function desligar() {
    rodando = false;
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
  }
  function esquecer(nome) { if (nome == null) anterior.clear(); else anterior.delete(nome); }

  return { passada, ligar, desligar, esquecer, get ligado() { return rodando; } };
}

module.exports = { criarColetor, criarColetorDeAlvos };
