'use strict';
/**
 * Acrescenta ao PeekRust a pergunta que ele ainda não responde:
 * **essa pessoa está assistindo sua live?**
 *
 * O `/peek` já diz quem o jogador é — horas de Rust, aim train, bans, nível.
 * Falta o elo com a stream, e é justamente o elo que transforma "esse cara é
 * bom" em "esse cara sabe onde você está".
 *
 * Encaixa em `player-lookup.js` como mais uma promessa no Promise.all, e em
 * `chat-formatter.js` como mais um pedaço da linha.
 *
 * O PeekRust é ESM e este arquivo é CommonJS, porque é aqui que os testes
 * rodam. O que se copia para lá é `peekrust/anti-sniper.mjs`, gerado por
 * `peekrust/construir.js` a partir DESTE arquivo — nunca há duas versões
 * escritas à mão.
 */

const IndicePadrao = require('../src/indice').Indice;

/**
 * @param {object} deps
 * @param {(id:string)=>Promise<Array<string|{name:string}>>} deps.nomesDoJogador
 *        todos os nomes já usados. No PeekRust é getPlayerNameHistory, que
 *        devolve o histórico COMPLETO das sessões do BattleMetrics — não o
 *        teto de 5 nomes que a Steam entrega.
 *        ATENÇÃO: essa função recebe o **id do BattleMetrics**, não a
 *        SteamID. O que você passar em verificar() é o que chega aqui.
 * @param {()=>Promise<Array<{nome:string,minutosAssistidos:number}>>} deps.audiencia
 * @param {Function} [deps.Indice] construtor de índice (o padrão já serve)
 */
function criarVerificador({ nomesDoJogador, audiencia, Indice = IndicePadrao, ttlMs = 5 * 60 * 1000, agora = Date.now }) {
  let cache = null;

  /** O índice da audiência é caro de montar e muda devagar. Remontar a cada
   *  /peek desperdiçaria centenas de milissegundos numa resposta que precisa
   *  caber no chat do jogo sem o jogador achar que travou. */
  async function indiceAtual() {
    if (cache && agora() - cache.em < ttlMs) return cache.idx;
    const lista = await audiencia();
    cache = { idx: new Indice(lista), em: agora() };
    return cache.idx;
  }

  return async function verificar(idDoJogador, nomeNoJogo) {
    let idx;
    // Se o serviço estiver fora do ar, o /peek continua respondendo o resto.
    // Perder a linha da live é ruim; derrubar o comando inteiro é pior.
    try { idx = await indiceAtual(); } catch { return { estado: 'indisponivel' }; }
    if (idx.n === 0) return { estado: 'sem-audiencia' };

    // O nome que aparece no jogo AGORA é o mais provável de casar, então
    // vai primeiro e evita ida à rede quando já resolve.
    if (nomeNoJogo) {
      const r = idx.procurar(nomeNoJogo);
      if (r) {
        return {
          estado: 'assistindo',
          espectador: r.entrada.nome,
          confianca: r.confianca,
          minutosAssistidos: r.entrada.minutosAssistidos ?? null,
          via: 'nome no jogo',
        };
      }
    }

    // Só então o histórico completo. Uma pessoa que trocou de nome 200 vezes
    // tem 200 chances de bater, e basta uma.
    let historico = [];
    try { historico = await nomesDoJogador(idDoJogador); } catch { historico = []; }
    for (const antigo of historico || []) {
      const nome = typeof antigo === 'string' ? antigo : antigo?.name;
      if (!nome) continue;
      const r = idx.procurar(nome);
      if (r) {
        return {
          estado: 'assistindo',
          espectador: r.entrada.nome,
          confianca: r.confianca,
          minutosAssistidos: r.entrada.minutosAssistidos ?? null,
          via: `nome antigo "${nome}"`,
        };
      }
    }

    // NUNCA "limpo". Não achar não é inocentar: quem usa nome diferente nos
    // dois lados passa batido, e dizer "limpo" viraria falsa segurança.
    const conferidos = (historico || []).length + (nomeNoJogo ? 1 : 0);
    return { estado: 'nao-encontrado', nomesConferidos: conferidos };
  };
}

/**
 * Busca a audiência no serviço do anti-sniper.
 *
 * É a função que se passa como `audiencia` — deixa o PeekRust sem nenhuma
 * dependência de banco: só uma URL.
 */
function audienciaDoServico(urlBase, canal, { buscar = globalThis.fetch, tempoLimiteMs = 4000 } = {}) {
  return async function () {
    const alvo = `${String(urlBase).replace(/\/+$/, '')}/api/audiencia?canal=${encodeURIComponent(canal)}`;
    // Sem prazo, um serviço lento vira um /peek travado no meio de um raid.
    const corte = AbortSignal.timeout ? AbortSignal.timeout(tempoLimiteMs) : undefined;
    const res = await buscar(alvo, { signal: corte });
    if (!res.ok) throw new Error(`serviço respondeu ${res.status}`);
    const dados = await res.json();
    return dados.audiencia || [];
  };
}

/**
 * Pedaço para a linha do chat do jogo.
 *
 * O `chat-formatter.js` corta em 120 caracteres, e o chat de equipe do Rust
 * é estreito — então isto precisa ser curtíssimo e legível de relance, no
 * meio de um tiroteio.
 */
function pedacoParaChat(r) {
  if (!r || r.estado === 'sem-audiencia' || r.estado === 'indisponivel') return null;
  if (r.estado === 'nao-encontrado') return 'LIVE ?';
  const h = r.minutosAssistidos != null ? `${Math.floor(r.minutosAssistidos / 60)}h` : '?';
  // "!" grita sem acusar. Quem lê entende "olha esse", não "é culpado".
  return `LIVE ${h}!`;
}

/** Versão longa, para Discord, onde há espaço para o porquê. */
function textoLongo(r) {
  if (!r || r.estado === 'sem-audiencia') return null;
  if (r.estado === 'indisponivel') {
    return '⚠️ Não consegui falar com o serviço da live agora — o resto da consulta vale, essa linha não.';
  }
  if (r.estado === 'nao-encontrado') {
    return `⚪ Nenhum dos ${r.nomesConferidos} nomes dessa conta apareceu na sua live. ` +
           'Isso **não inocenta** — pode usar nome diferente nos dois lados.';
  }
  const h = r.minutosAssistidos != null
    ? `${Math.floor(r.minutosAssistidos / 60)}h${String(r.minutosAssistidos % 60).padStart(2, '0')}`
    : 'tempo desconhecido';
  return `🔴 Esteve na sua live como **${r.espectador}** — ${h} assistidos ` +
         `(${Math.round(r.confianca * 100)}%, por ${r.via}).`;
}

module.exports = { criarVerificador, audienciaDoServico, pedacoParaChat, textoLongo };
