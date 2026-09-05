'use strict';
/**
 * Prova de continuidade.
 *
 * Uma prova é uma declaração assinada: "a conta NOVA é a continuação da
 * conta ANTIGA". Quem assina é o dono da chave cujo compromisso foi
 * publicado no perfil antigo enquanto ele ainda estava no ar.
 *
 * O verificador não precisa falar com o servidor antigo. Ele já tem uma
 * cópia em cache do perfil antigo — é assim que o ActivityPub funciona,
 * todo servidor que segue uma conta guarda o perfil dela. O compromisso
 * está nessa cópia.
 */

const { sign, verify } = require('node:crypto');
const { chaveDoCompromisso, extrairCompromisso } = require('./identity');

/** Separação de domínio: impede que uma assinatura feita para outro fim
 *  seja reaproveitada aqui, e vice-versa. */
const CONTEXTO = 'fedi-continuity-v1/move';

/** Prova vence em 30 dias. Sem prazo, uma chave vazada redireciona os
 *  seguidores para sempre; com prazo, a janela do estrago é limitada e o
 *  dono legítimo pode publicar um compromisso novo. */
const VALIDADE_PADRAO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Serialização canônica.
 *
 * A assinatura cobre uma STRING, então a string tem que ser sempre a mesma
 * para os mesmos dados. `JSON.stringify` preserva a ordem de inserção das
 * chaves, o que significa que dois objetos iguais podem virar strings
 * diferentes e a verificação falha sem motivo aparente. Ordenar as chaves
 * elimina isso.
 */
function canonico(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonico).join(',') + ']';
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonico(obj[k]))
      .join(',') +
    '}'
  );
}

function corpo({ contaAntiga, contaNova, emitidoEm, expiraEm }) {
  return canonico({ contexto: CONTEXTO, contaAntiga, contaNova, emitidoEm, expiraEm });
}

/**
 * Emite a prova. `agoraMs` é injetado para o teste poder controlar o tempo —
 * teste que depende do relógio real é teste que falha sozinho de madrugada.
 */
function emitirProva({ chavePrivada, contaAntiga, contaNova, agoraMs, validadeMs }) {
  if (!contaAntiga || !contaNova) throw new Error('contaAntiga e contaNova são obrigatórias');
  if (contaAntiga === contaNova) throw new Error('conta nova não pode ser igual à antiga');

  const emitidoEm = new Date(agoraMs).toISOString();
  const expiraEm = new Date(agoraMs + (validadeMs ?? VALIDADE_PADRAO_MS)).toISOString();
  const dados = { contaAntiga, contaNova, emitidoEm, expiraEm };
  const assinatura = sign(null, Buffer.from(corpo(dados), 'utf8'), chavePrivada);

  return { versao: 1, ...dados, assinatura: assinatura.toString('base64url') };
}

/**
 * Verifica a prova contra a CÓPIA EM CACHE do perfil antigo.
 *
 * Devolve sempre um objeto com `valida` e, quando falha, um `motivo` legível.
 * Lançar exceção aqui seria pior: quem chama é um servidor processando fila
 * de atividades, e uma prova ruim é rotina, não caso excepcional.
 */
function verificarProva(prova, perfilAntigoEmCache, agoraMs) {
  const falha = (motivo) => ({ valida: false, motivo });

  if (!prova || prova.versao !== 1) return falha('versão de prova desconhecida');
  for (const campo of ['contaAntiga', 'contaNova', 'emitidoEm', 'expiraEm', 'assinatura']) {
    if (typeof prova[campo] !== 'string' || !prova[campo]) return falha(`campo ausente: ${campo}`);
  }

  const compromisso = extrairCompromisso(perfilAntigoEmCache);
  if (!compromisso) return falha('perfil antigo não publicou compromisso de continuidade');

  const emitido = Date.parse(prova.emitidoEm);
  const expira = Date.parse(prova.expiraEm);
  if (Number.isNaN(emitido) || Number.isNaN(expira)) return falha('data malformada');
  if (expira <= emitido) return falha('prova expira antes de ser emitida');
  if (agoraMs >= expira) return falha('prova expirada');
  // tolerância de 5 min para relógio adiantado do emissor
  if (agoraMs + 5 * 60 * 1000 < emitido) return falha('prova emitida no futuro');

  let chave;
  try {
    chave = chaveDoCompromisso(compromisso);
  } catch (e) {
    return falha(`compromisso ilegível: ${e.message}`);
  }

  const dados = {
    contaAntiga: prova.contaAntiga,
    contaNova: prova.contaNova,
    emitidoEm: prova.emitidoEm,
    expiraEm: prova.expiraEm,
  };
  const ok = verify(
    null,
    Buffer.from(corpo(dados), 'utf8'),
    chave,
    Buffer.from(prova.assinatura, 'base64url'),
  );
  if (!ok) return falha('assinatura não confere com o compromisso publicado');

  return { valida: true, contaAntiga: prova.contaAntiga, contaNova: prova.contaNova };
}

module.exports = { CONTEXTO, VALIDADE_PADRAO_MS, canonico, emitirProva, verificarProva };
