'use strict';
/**
 * Bot do Discord, por endpoint de interação.
 *
 * Sem conexão de gateway aberta: o Discord CHAMA o serviço quando alguém usa
 * o comando. Isso significa nada rodando ocioso, nada para reconectar quando
 * cai, e o mesmo processo que recebe o webhook da Kick responde o comando.
 *
 * O uso vira: alguém te mata, você digita `/detetive FINIK` no Discord, e a
 * resposta vem na hora. Nenhuma página aberta, nenhuma tabela copiada.
 */

const { verify } = require('node:crypto');

const PING = 1;
const COMANDO = 2;
const RESPONDER = 4;

/**
 * O Discord exige Ed25519 sobre `timestamp + corpo`, e REJEITA o bot na
 * hora do cadastro se a verificação não funcionar — inclusive testa com
 * assinatura inválida de propósito para ver se você recusa.
 */
function verificarDiscord(cabecalhos, corpoBruto, chavePublicaHex) {
  const pega = (n) => cabecalhos[n] ?? cabecalhos[n.toLowerCase()];
  const assin = pega('X-Signature-Ed25519');
  const ts = pega('X-Signature-Timestamp');
  if (!assin || !ts || !chavePublicaHex) return false;

  try {
    const chave = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'), // cabeçalho SPKI Ed25519
      Buffer.from(chavePublicaHex, 'hex'),
    ]);
    return verify(
      null,
      Buffer.concat([Buffer.from(ts, 'utf8'), corpoBruto]),
      { key: chave, format: 'der', type: 'spki' },
      Buffer.from(assin, 'hex'),
    );
  } catch { return false; }
}

function horas(min) {
  if (min == null) return 'tempo desconhecido';
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/** Monta a resposta que aparece no Discord. */
function formatar(r) {
  if (!r.evidencias.length) {
    return {
      content: `⚪ **${r.jogador}** — não encontrado na sua audiência.\n` +
        '_Isso não inocenta: a pessoa pode usar nome diferente nos dois lados._',
    };
  }
  const linhas = r.evidencias.slice(0, 5).map((e) =>
    `• **${e.espectador}** — ${Math.round(e.confianca * 100)}% · ${e.motivo}\n` +
    `  assistiu **${horas(e.minutosAssistidos)}**`);
  return {
    content: `🔴 **${r.jogador}** esteve na sua live:\n\n${linhas.join('\n')}\n\n` +
      '_Assistir não é crime. Quem julga o contexto é você, que jogou a partida._',
  };
}

/**
 * @param {(canalId:string,nome:string)=>object} consultar
 * @param {(guildId:string)=>string|null} canalDoServidor mapeia servidor do
 *        Discord para o canal de stream conectado
 */
function tratar(corpo, { consultar, canalDoServidor }) {
  if (corpo.type === PING) return { type: 1 };

  if (corpo.type === COMANDO && corpo.data?.name === 'detetive') {
    const nome = corpo.data.options?.find((o) => o.name === 'nome')?.value;
    if (!nome) {
      return { type: RESPONDER, data: { content: 'Uso: `/detetive nome-do-jogador`', flags: 64 } };
    }
    const canalId = canalDoServidor(corpo.guild_id);
    if (!canalId) {
      return {
        type: RESPONDER,
        data: { content: 'Este servidor do Discord ainda não está ligado a um canal. Conecte pelo site.', flags: 64 },
      };
    }
    // flags 64 = só quem pediu vê. Acusação em público, ainda por cima
    // automática, é como um inocente vira alvo de linchamento no chat.
    return { type: RESPONDER, data: { ...formatar(consultar(canalId, nome)), flags: 64 } };
  }
  return { type: RESPONDER, data: { content: 'Comando desconhecido.', flags: 64 } };
}

/** Definição do comando, para registrar na API do Discord. */
const COMANDO_DETETIVE = {
  name: 'detetive',
  description: 'Verifica se um jogador esteve assistindo sua live',
  options: [{ type: 3, name: 'nome', description: 'Nome do jogador no jogo', required: true }],
};

module.exports = { verificarDiscord, tratar, formatar, COMANDO_DETETIVE };
