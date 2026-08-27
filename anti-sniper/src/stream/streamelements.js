'use strict';
/**
 * Audiência via StreamElements.
 *
 * O StreamElements grava tempo assistido por pessoa para dar ponto de
 * fidelidade — e é a única fonte que já existe com HISTÓRICO. As APIs das
 * plataformas só dizem quem está no chat AGORA; ninguém guarda o passado.
 *
 * ⚠️ Descoberto medindo o canal real dele em 27/08/2026: o sistema de
 * pontos vem DESLIGADO por padrão (`loyalty.enabled: false`). Com ele
 * desligado não existe histórico nenhum, por mais anos que o canal tenha.
 * Por isso `estaGravando()` existe e é a primeira coisa a checar — dizer
 * "nenhum espectador encontrado" quando na verdade a gravação está desligada
 * seria o pior erro possível: parece inocência e é cegueira.
 */

const BASE = 'https://api.streamelements.com/kappa/v2';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function pegar(caminho, buscar = globalThis.fetch) {
  const r = await buscar(`${BASE}${caminho}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) {
    const e = new Error(`StreamElements respondeu ${r.status} em ${caminho}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/** Resolve nome de canal para o id interno. Os endpoints de ponto só
 *  aceitam o id; passar o nome devolve lista vazia sem avisar. */
async function idDoCanal(nomeOuId, buscar) {
  if (/^[0-9a-f]{24}$/.test(nomeOuId)) return nomeOuId;
  const c = await pegar(`/channels/${encodeURIComponent(nomeOuId)}`, buscar);
  if (!c?._id) throw new Error(`canal não encontrado: ${nomeOuId}`);
  return c._id;
}

/**
 * A checagem que vem antes de tudo.
 * @returns {Promise<{gravando:boolean, nomeDosPontos:string, motivo?:string}>}
 */
async function estaGravando(nomeOuId, buscar) {
  const id = await idDoCanal(nomeOuId, buscar);
  const l = await pegar(`/loyalty/${id}`, buscar);
  const cfg = l?.loyalty ?? {};
  const ligado = cfg.enabled === true;

  // Detecta CONTA MORTA. Custou um diagnóstico errado: eu li um registro de
  // 2020 com enabled=false e disse a ele que a gravação estava desligada.
  // Estava ligada — em OUTRA conta. Aquele registro nunca tinha sido tocado
  // desde a criação, e todos os valores eram o padrão de fábrica.
  //
  // Um `updatedAt` igual ao `createdAt` significa que ninguém nunca abriu
  // essas configurações. Isso quase sempre é conta abandonada, não conta
  // desligada — e a diferença muda completamente o que dizer ao usuário.
  const nuncaMexida = !!(l?.createdAt && l?.updatedAt && l.createdAt === l.updatedAt);
  const padraoDeFabrica =
    cfg.name === 'points' &&
    Object.values(cfg.bonuses ?? {}).every((v) => !v);

  return {
    canalId: id,
    gravando: ligado,
    nomeDosPontos: cfg.name ?? 'points',
    configuradaEm: l?.updatedAt ?? null,
    provavelContaAbandonada: nuncaMexida && padraoDeFabrica,
    motivo: ligado
      ? undefined
      : nuncaMexida && padraoDeFabrica
        ? `esta conta nunca foi configurada (criada em ${String(l.createdAt).slice(0, 10)} ` +
          'e nunca mais tocada, tudo no padrão). Provavelmente é uma conta antiga ' +
          'abandonada — confira se o id do canal é o certo antes de concluir qualquer coisa'
        : 'sistema de pontos DESLIGADO — nada está sendo gravado, e não existe histórico para consultar',
  };
}

/**
 * Quem já assistiu, com quanto acumulou.
 * @returns {Promise<Array<{nome:string,id:string,pontos:number,minutosAssistidos:number}>>}
 */
async function audiencia(nomeOuId, { buscar, limite = 1000, porPagina = 100 } = {}) {
  const id = await idDoCanal(nomeOuId, buscar);
  const fora = [];
  for (let offset = 0; offset < limite; offset += porPagina) {
    const p = await pegar(
      `/points/${id}/alltime?limit=${porPagina}&offset=${offset}`, buscar);
    const users = p?.users ?? [];
    for (const u of users) {
      fora.push({
        nome: u.username,
        id: u._id ?? u.userId,
        pontos: u.points ?? 0,
        // O StreamElements guarda tempo assistido em minutos neste campo.
        minutosAssistidos: u.watchtime ?? null,
      });
    }
    if (users.length < porPagina) break;
  }
  return fora;
}

/**
 * Os números de UMA pessoa. É este o caminho que escala.
 *
 * O placar completo vem ordenado por pontos de todos os tempos, então quem
 * está assistindo AGORA pode estar em qualquer posição de uma lista com
 * centenas de milhares de nomes — varrer tudo a cada 5 min é inviável, e
 * medindo deu zero em 300 pessoas. Aqui pergunta-se só por quem interessa:
 * os poucos que casaram com alguém que está no servidor.
 *
 * E este endpoint devolve `watchtime`, que o placar NÃO devolve (vem null
 * lá). É segundo assistido, sobe sozinho enquanto a pessoa está com a live
 * aberta — falando ou não.
 */
async function pessoa(nomeOuId, usuario, buscar) {
  const id = await idDoCanal(nomeOuId, buscar);
  try {
    const u = await pegar(`/points/${id}/${encodeURIComponent(usuario)}`, buscar);
    return {
      nome: u.username ?? usuario,
      pontos: u.points ?? 0,
      // Vem em segundos.
      segundosAssistidos: u.watchtime ?? null,
      posicao: u.rank ?? null,
    };
  } catch (e) {
    // 404 = essa pessoa nunca pontuou neste canal. Não é erro, é resposta.
    if (e.status === 404) return null;
    throw e;
  }
}

module.exports = { idDoCanal, estaGravando, audiencia, pessoa };
