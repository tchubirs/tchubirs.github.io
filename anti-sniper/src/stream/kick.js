'use strict';
/**
 * App próprio na Kick.
 *
 * Pergunta dele que originou este arquivo: "por que a gente precisa do
 * BotRix? não é só a gente pedir essas permissões?" — está certo. Aquela
 * tela de consentimento é o OAuth padrão da Kick, e o BotRix é só um app
 * que se registrou. Qualquer um registra em kick.com/settings/developer.
 *
 * PEDIMOS MENOS DE PROPÓSITO. O BotRix pede 9 permissões, incluindo ler
 * dados do usuário com endereço de e-mail e executar moderação. Para gravar
 * quem assistiu bastam duas. Isso não é só higiene: uma tela de
 * consentimento curta é mais fácil de aceitar, e cada permissão a mais é
 * uma responsabilidade a mais sobre dado que não precisamos ter.
 */

const AUTORIZAR = 'https://id.kick.com/oauth/authorize';
const TOKEN = 'https://id.kick.com/oauth/token';
const API = 'https://api.kick.com/public/v1';

/** O mínimo indispensável. Não aumente esta lista sem um motivo escrito. */
const ESCOPOS = [
  'events:subscribe',  // receber chat, seguir e inscrever em tempo real
  'channel:read',      // saber quando o canal está ao vivo
];

const { createHash, randomBytes } = require('node:crypto');

/** PKCE: prova que quem troca o código é quem pediu, sem expor o segredo. */
function gerarPkce() {
  const verificador = randomBytes(48).toString('base64url');
  const desafio = createHash('sha256').update(verificador).digest('base64url');
  return { verificador, desafio };
}

function urlDeAutorizacao({ clientId, redirectUri, desafio, estado }) {
  if (!clientId || !redirectUri || !desafio) {
    throw new Error('clientId, redirectUri e desafio são obrigatórios');
  }
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPOS.join(' '),
    code_challenge: desafio,
    code_challenge_method: 'S256',
    state: estado ?? randomBytes(16).toString('hex'),
  });
  return `${AUTORIZAR}?${p}`;
}

async function trocarCodigoPorToken({ clientId, clientSecret, redirectUri, codigo, verificador }, buscar = globalThis.fetch) {
  const corpo = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: codigo,
    code_verifier: verificador,
  });
  const r = await buscar(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  if (!r.ok) throw new Error(`troca de token falhou: ${r.status}`);
  return r.json();
}

async function assinarEventos({ token, urlDoWebhook, eventos }, buscar = globalThis.fetch) {
  const r = await buscar(`${API}/events/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'webhook',
      webhook_url: urlDoWebhook,
      events: (eventos ?? ['chat.message', 'livestream.status.updated']).map(
        (name) => ({ name, version: 1 }),
      ),
    }),
  });
  if (!r.ok) throw new Error(`assinatura de eventos falhou: ${r.status}`);
  return r.json();
}

/** Token de APLICAÇÃO — não representa nenhum usuário e não precisa que
 *  ninguém autorize nada. Vale 60 dias. Descoberto testando: ele já alcança
 *  estado do canal e lista de lives, que é tudo que o sinal de âncora precisa. */
async function tokenDeAplicacao({ clientId, clientSecret }, buscar = globalThis.fetch) {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
  });
  const r = await buscar(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  if (!r.ok) throw new Error(`token de aplicação falhou: ${r.status}`);
  return r.json();
}

/**
 * Estado do canal: está ao vivo, e desde quando.
 *
 * `inicioMs` é a peça central do sinal "entrou no servidor logo depois de
 * você ficar ao vivo". Sem ela o sinal não existe — e ela sai daqui de
 * graça, sem webhook e sem autorização de usuário.
 */
async function estadoDoCanal(slug, { token, buscar = globalThis.fetch } = {}) {
  const r = await buscar(
    `${API}/channels?slug=${encodeURIComponent(slug)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`consulta de canal falhou: ${r.status}`);
  const c = (await r.json())?.data?.[0];
  if (!c) throw new Error(`canal não encontrado: ${slug}`);

  const inicio = c.stream?.start_time;
  // A Kick devolve o ano 0001 quando nunca transmitiu / não está ao vivo.
  // Tratar isso como data real produziria "ao vivo há 2 milhões de horas".
  const inicioMs = inicio && !inicio.startsWith('0001') ? Date.parse(inicio) : null;

  return {
    slug: c.slug,
    canalId: c.broadcaster_user_id,
    aoVivo: c.stream?.is_live === true,
    inicioMs,
    espectadores: c.stream?.viewer_count ?? 0,
    categoria: c.category?.name || null,
    inscritosAtivos: c.active_subscribers_count ?? null,
  };
}

/**
 * Grava presença a partir dos eventos de chat.
 *
 * É o mesmo que o BotRix faz para dar ponto: quem aparece no chat está
 * assistindo. A diferença é que aqui o dado é nosso e chega ao vivo, em vez
 * de sair colado de um painel.
 *
 * Devolve a MESMA forma que `botrix.lerTabela`, para `consulta.js` nunca
 * precisar saber de onde a audiência veio.
 */
class Gravador {
  constructor({ intervaloMs = 10 * 60 * 1000 } = {}) {
    // Mesma lógica de crédito do BotRix: X minutos de presença = um bloco.
    // Contar mensagem seria injusto com quem assiste calado — e quem assiste
    // calado é justamente quem interessa aqui.
    this.intervaloMs = intervaloMs;
    this.pessoas = new Map(); // nome -> {id, primeiraEm, ultimaEm, blocos}
  }

  viu(nome, id, tMs) {
    if (!nome) return;
    const chave = nome.toLowerCase();
    const p = this.pessoas.get(chave);
    if (!p) {
      this.pessoas.set(chave, {
        nome, id, primeiraEm: tMs, ultimaEm: tMs, ultimoCredito: tMs, blocos: 1,
      });
      return;
    }
    // Credita contra o ÚLTIMO CRÉDITO, não contra a última mensagem.
    // Comparar com a última mensagem tem um bug silencioso: quem escreve a
    // cada minuto nunca deixa o intervalo fechar, e alguém presente por 49
    // minutos era creditado com 10. O erro punia exatamente o espectador
    // mais participativo.
    const decorrido = tMs - p.ultimoCredito;
    if (decorrido >= this.intervaloMs) {
      p.blocos += Math.floor(decorrido / this.intervaloMs);
      p.ultimoCredito = tMs;
    }
    p.ultimaEm = tMs;
  }

  /** Ingere um evento de webhook já VERIFICADO pela assinatura da Kick. */
  ingerir(tipo, dados, tMs) {
    if (tipo !== 'chat.message') return;
    this.viu(dados?.sender?.username, dados?.sender?.user_id, tMs);
  }

  audiencia() {
    return [...this.pessoas.values()]
      .map((p) => ({
        nome: p.nome,
        id: p.id,
        minutosAssistidos: Math.round((p.blocos * this.intervaloMs) / 60000),
        primeiraEm: p.primeiraEm,
        ultimaEm: p.ultimaEm,
      }))
      .sort((a, b) => b.minutosAssistidos - a.minutosAssistidos);
  }
}

module.exports = {
  ESCOPOS, gerarPkce, urlDeAutorizacao, trocarCodigoPorToken,
  tokenDeAplicacao, estadoDoCanal, assinarEventos, Gravador,
};
