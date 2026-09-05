'use strict';
/**
 * Entrada e saída AO SEGUNDO, com nome, direto do websocket da Kick.
 *
 * Ele olhou o log com blocos de 10 minutos e disse: "tem que ser mais
 * preciso, exatamente até os segundos se possível, sei que ele ficou 5
 * minutos no máximo". Com o tempo assistido da BotRix isso é impossível —
 * o crédito vem em blocos de ~10 min, então uma visita de 5 minutos vira 0
 * ou vira 10. Não é imprecisão do meu código: é a resolução da fonte.
 *
 * A fonte que tem segundos, medida em 28/08/2026:
 *
 *   O chat da Kick roda em Pusher. Tentei assinar `presence-chatroom.<id>`
 *   sem credencial e a resposta foi **"Auth info required to subscribe"** —
 *   não "canal inexistente". O canal de presença EXISTE. E
 *   `kick.com/broadcasting/auth` responde 401 Unauthenticated, ou seja,
 *   autoriza quando a sessão é válida.
 *
 * Canal de presença do Pusher entrega, por definição:
 *   - a lista completa de quem está dentro, ao assinar;
 *   - `pusher_internal:member_added` quando alguém entra;
 *   - `pusher_internal:member_removed` quando alguém sai.
 *
 * Cada um com o instante exato em que chegou. É a resolução que ele pediu.
 *
 * ⚠️ O que ainda NÃO foi verificado, e eu não vou afirmar: se o canal de
 * presença lista TODOS os espectadores ou só um subconjunto (moderadores,
 * inscritos). Isso só dá para saber com a sessão dele, porque a autorização
 * é dela. Este arquivo deixa a peça pronta e mede a resposta em vez de
 * supor.
 */

const PUSHER = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679'
  + '?protocol=7&client=js&version=8.4.0&flash=false';
const AUTH = 'https://kick.com/broadcasting/auth';

/**
 * Assina o canal de presença e avisa cada entrada e saída.
 *
 * @param {object} dep
 * @param {number|string} dep.chatroomId  id da sala (kick.com/api/v2/channels/<slug>)
 * @param {(socketId:string, canal:string)=>Promise<object>} dep.autorizar
 *        troca socket_id por credencial. Na prática é a sessão logada dele
 *        chamando /broadcasting/auth — por isso vem injetado, e não embutido.
 * @param {(evento:object)=>void} dep.aoEvento
 * @param {Function} [dep.WebSocket]
 * @param {()=>number} [dep.agora]
 */
function assinarPresenca({
  chatroomId, autorizar, aoEvento, WebSocket: WS = globalThis.WebSocket,
  agora = Date.now, aoErro = () => {},
}) {
  const canal = `presence-chatroom.${chatroomId}`;
  let ws = null;
  let socketId = null;
  let vivo = false;
  const dentro = new Map();

  function emitir(tipo, id, info, extra = {}) {
    aoEvento({ tipo, em: agora(), id: String(id), nome: info?.username ?? info?.name ?? null, ...extra });
  }

  async function abrir() {
    vivo = true;
    ws = new WS(PUSHER);

    ws.onerror = (e) => aoErro(new Error(e?.message || 'websocket'));
    ws.onclose = () => { if (vivo) aoErro(new Error('websocket fechou')); };
    ws.onmessage = async (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      const dados = typeof m.data === 'string' ? (() => { try { return JSON.parse(m.data); } catch { return m.data; } })() : m.data;

      if (m.event === 'pusher:connection_established') {
        socketId = dados.socket_id;
        let cred;
        try { cred = await autorizar(socketId, canal); }
        catch (e) { aoErro(new Error(`autorização recusada: ${e.message}`)); return; }
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: canal, auth: cred.auth, channel_data: cred.channel_data },
        }));
        return;
      }

      if (m.event === 'pusher_internal:subscription_succeeded') {
        // A lista de quem JÁ estava dentro. Não é entrada: essa gente pode
        // estar ali há horas, e marcar como "entrou agora" seria inventar
        // um horário — o erro que ele já me pegou fazendo.
        const membros = dados?.presence?.hash || {};
        for (const [id, info] of Object.entries(membros)) {
          dentro.set(String(id), info);
          emitir('ja-estava', id, info);
        }
        aoEvento({ tipo: 'pronto', em: agora(), quantos: dentro.size });
        return;
      }

      if (m.event === 'pusher_internal:member_added') {
        dentro.set(String(dados.user_id), dados.user_info);
        emitir('entrou', dados.user_id, dados.user_info);
        return;
      }

      if (m.event === 'pusher_internal:member_removed') {
        const info = dentro.get(String(dados.user_id));
        dentro.delete(String(dados.user_id));
        emitir('saiu', dados.user_id, info);
        return;
      }

      if (m.event === 'pusher:error' || /subscription_error/.test(m.event || '')) {
        aoErro(new Error(dados?.message || 'assinatura recusada'));
      }
    };
  }

  return {
    abrir,
    fechar() { vivo = false; try { ws?.close(); } catch { /* já fechado */ } },
    get dentro() { return new Map(dentro); },
    get canal() { return canal; },
  };
}

/**
 * Autorização usando os cookies da sessão dele.
 *
 * Não guarda cookie nem senha: recebe de fora quem já está logado — na
 * prática o navegador do agente, que faz a chamada de dentro da página e
 * leva sessão e CSRF junto sem ninguém copiar nada.
 */
function autorizarPor(buscar) {
  return async (socketId, canal) => {
    const r = await buscar(AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ socket_id: socketId, channel_name: canal }),
    });
    if (!r.ok) {
      const e = new Error(r.status === 401
        ? 'não está logado na Kick (401)'
        : `Kick respondeu ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  };
}

/**
 * De eventos ao segundo para "entrou HH:MM:SS, saiu HH:MM:SS".
 *
 * Sem arredondar nada: aqui a fonte tem o instante exato, e arredondar
 * jogaria fora justamente a precisão que ele pediu.
 */
function visitasDosEventos(eventos) {
  const abertas = new Map();
  const fechadas = [];
  for (const e of eventos) {
    if (e.tipo === 'entrou' || e.tipo === 'ja-estava') {
      abertas.set(e.id, { id: e.id, nome: e.nome, de: e.em, jaEstava: e.tipo === 'ja-estava' });
    } else if (e.tipo === 'saiu') {
      const a = abertas.get(e.id);
      if (!a) continue;
      abertas.delete(e.id);
      fechadas.push({ ...a, ate: e.em, segundos: Math.round((e.em - a.de) / 1000) });
    }
  }
  return {
    fechadas: fechadas.sort((a, b) => a.de - b.de),
    // Ainda dentro quando a gravação parou: sem hora de saída, e dizer uma
    // seria inventar.
    abertas: [...abertas.values()],
  };
}

module.exports = { assinarPresenca, autorizarPor, visitasDosEventos, PUSHER, AUTH };
