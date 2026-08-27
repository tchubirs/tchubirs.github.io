'use strict';
/**
 * Verificação de webhook da Kick.
 *
 * Sem isto, qualquer um que descubra a URL do endpoint pode inventar
 * seguidores e mensagens — e aí a medição, que é a razão de existir deste
 * projeto, vira ficção. A verificação não é enfeite de segurança: é o que
 * separa número real de número inventado.
 *
 * Regra oficial (docs.kick.com/events/webhook-security):
 *   assinatura = RSA-SHA256( "<message-id>.<timestamp>.<corpo bruto>" )
 * codificada em base64, conferida contra a chave pública RSA da Kick.
 */

const { createVerify, createPublicKey } = require('node:crypto');

/** Chave pública publicada pela Kick. Também servida em
 *  https://api.kick.com/public/v1/public-key — buscar de lá permite rotação
 *  sem novo deploy, mas embutir garante que o serviço sobe mesmo se a API
 *  estiver fora do ar. */
const CHAVE_KICK = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

const CABECALHOS = {
  id: 'kick-event-message-id',
  timestamp: 'kick-event-message-timestamp',
  assinatura: 'kick-event-signature',
  tipo: 'kick-event-type',
  versao: 'kick-event-version',
};

/** Toleranciapadrão de relógio. Evento muito velho é replay; muito novo é
 *  relógio torto de um dos lados. */
const JANELA_PADRAO_MS = 10 * 60 * 1000;

function pegar(cabecalhos, nome) {
  // Node normaliza cabeçalho para minúsculo, mas quem chama pode passar um
  // objeto cru de outro framework. Procurar sem diferenciar caixa evita um
  // bug que só aparece em produção.
  if (!cabecalhos) return undefined;
  const alvo = nome.toLowerCase();
  for (const k of Object.keys(cabecalhos)) {
    if (k.toLowerCase() === alvo) return cabecalhos[k];
  }
  return undefined;
}

/**
 * `corpoBruto` precisa ser o Buffer/string exatamente como chegou.
 * Se alguém fizer JSON.parse e depois JSON.stringify, a assinatura quebra —
 * espaçamento e ordem de chave mudam. É o erro mais comum com webhook.
 */
function verificarWebhook(cabecalhos, corpoBruto, opcoes = {}) {
  const falha = (motivo) => ({ valido: false, motivo });

  const id = pegar(cabecalhos, CABECALHOS.id);
  const timestamp = pegar(cabecalhos, CABECALHOS.timestamp);
  const assinatura = pegar(cabecalhos, CABECALHOS.assinatura);
  if (!id) return falha('cabeçalho ausente: Kick-Event-Message-Id');
  if (!timestamp) return falha('cabeçalho ausente: Kick-Event-Message-Timestamp');
  if (!assinatura) return falha('cabeçalho ausente: Kick-Event-Signature');

  if (typeof corpoBruto !== 'string' && !Buffer.isBuffer(corpoBruto)) {
    return falha('corpo bruto obrigatório — não passe objeto já parseado');
  }

  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return falha('timestamp malformado');
  const agora = opcoes.agoraMs ?? Date.now();
  const janela = opcoes.janelaMs ?? JANELA_PADRAO_MS;
  if (Math.abs(agora - t) > janela) return falha('evento fora da janela de tempo');

  const corpo = Buffer.isBuffer(corpoBruto) ? corpoBruto : Buffer.from(corpoBruto, 'utf8');
  const assinado = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, 'utf8'),
    corpo,
  ]);

  let chave;
  try {
    chave = createPublicKey(opcoes.chavePublica ?? CHAVE_KICK);
  } catch (e) {
    return falha(`chave pública inválida: ${e.message}`);
  }

  let ok = false;
  try {
    const v = createVerify('sha256');
    v.update(assinado);
    v.end();
    ok = v.verify(chave, Buffer.from(assinatura, 'base64'));
  } catch {
    return falha('assinatura malformada');
  }
  if (!ok) return falha('assinatura não confere');

  let dados;
  try {
    dados = JSON.parse(corpo.toString('utf8'));
  } catch {
    return falha('corpo não é JSON válido');
  }

  return {
    valido: true,
    id,
    tipo: pegar(cabecalhos, CABECALHOS.tipo),
    versao: pegar(cabecalhos, CABECALHOS.versao),
    recebidoEm: t,
    dados,
  };
}

module.exports = { CHAVE_KICK, CABECALHOS, JANELA_PADRAO_MS, verificarWebhook };
