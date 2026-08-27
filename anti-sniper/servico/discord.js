'use strict';
/**
 * Bot do Discord, por endpoint de interação.
 *
 * Sem conexão de gateway aberta: o Discord CHAMA o serviço quando alguém usa
 * o comando. Isso significa nada rodando ocioso, nada para reconectar quando
 * cai, e o mesmo processo que recebe o webhook da Kick responde o comando.
 *
 * O uso vira: alguém te mata, você digita `/detetive FINIK` no Discord — ou
 * cola a SteamID, ou o link do perfil — e a resposta vem na hora. Nenhuma
 * página aberta, nenhuma tabela copiada.
 */

const { verify } = require('node:crypto');

const PING = 1;
const COMANDO = 2;
const RESPONDER = 4;
// O Discord derruba a interação se nada chegar em 3s, e consultar a Steam
// pode passar disso. PENSANDO reserva a resposta; o texto é editado depois.
const PENSANDO = 5;

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
  // Perfil privado não é perfil limpo: não se olhou nada.
  if (r.conclusao === 'inconclusivo') {
    return { content: `⚪ **${r.jogador}** — ${r.motivo}.` };
  }
  // Quando a busca foi por SteamID, dizer QUANTOS nomes foram conferidos é o
  // que separa "procurei e não achei" de "não consegui procurar".
  const conferidos = r.tipo === 'steamid'
    ? ` _(${(r.historico || []).length} nomes dessa conta conferidos)_` : '';

  if (!r.evidencias.length) {
    return {
      content: `⚪ **${r.jogador}** — não encontrado na sua audiência.${conferidos}\n` +
        '_Isso não inocenta: a pessoa pode usar nome diferente nos dois lados._',
    };
  }
  const linhas = r.evidencias.slice(0, 5).map((e) => {
    const como = e.nomeSteamQueBateu ? ` _(quando se chamava "${e.nomeSteamQueBateu}")_` : '';
    return `• **${e.espectador}** — ${Math.round(e.confianca * 100)}% · ${e.motivo}${como}\n` +
           `  assistiu **${horas(e.minutosAssistidos)}**`;
  });
  return {
    content: `🔴 **${r.jogador}** esteve na sua live:${conferidos}\n\n${linhas.join('\n')}\n\n` +
      '_Assistir não é crime. Quem julga o contexto é você, que jogou a partida._',
  };
}

/**
 * @param {object} corpo interação crua do Discord
 * @param {object} deps
 * @param {(guildId:string)=>string|null} deps.canalDoServidor mapeia servidor
 *        do Discord para o canal de stream conectado
 * @returns {{resposta:object, seguir?:(procurar:Function)=>Promise<object>}}
 *          `resposta` sai na hora; se houver `seguir`, o texto final é
 *          editado por cima depois — é assim que se atende o prazo de 3s
 *          sem abrir mão de consultar a Steam.
 */
function tratar(corpo, { canalDoServidor } = {}) {
  if (corpo.type === PING) return { resposta: { type: 1 } };

  if (corpo.type === COMANDO && corpo.data?.name === 'detetive') {
    const alvo = corpo.data.options?.find((o) => o.name === 'quem' || o.name === 'nome')?.value;
    if (!alvo) {
      return { resposta: { type: RESPONDER, data: { content: 'Uso: `/detetive nome, SteamID ou link do perfil`', flags: 64 } } };
    }
    const canalId = canalDoServidor(corpo.guild_id);
    if (!canalId) {
      return {
        resposta: { type: RESPONDER,
          data: { content: 'Este servidor do Discord ainda não está ligado a um canal. Conecte pelo site.', flags: 64 } },
      };
    }
    // flags 64 = só quem pediu vê. Acusação em público, ainda por cima
    // automática, é como um inocente vira alvo de linchamento no chat.
    return {
      resposta: { type: PENSANDO, data: { flags: 64 } },
      seguir: async (procurar) => {
        try { return formatar(await procurar(canalId, alvo)); }
        catch (e) { return { content: `⚠️ Não consegui consultar agora (${e.message}). Tente de novo.` }; }
      },
    };
  }
  return { resposta: { type: RESPONDER, data: { content: 'Comando desconhecido.', flags: 64 } } };
}

/** Definição do comando, para registrar na API do Discord. */
const COMANDO_DETETIVE = {
  name: 'detetive',
  description: 'Verifica se um jogador esteve assistindo sua live',
  options: [{ type: 3, name: 'quem',
    description: 'Nome no jogo, SteamID, ou link do perfil da Steam', required: true }],
};

module.exports = { verificarDiscord, tratar, formatar, COMANDO_DETETIVE };
