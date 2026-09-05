'use strict';
/**
 * Consulta pública de servidor (protocolo A2S da Valve).
 *
 * É a fonte do lado do jogo, e a mais importante do projeto: **não exige ser
 * dono do servidor, nem RCON, nem senha, nem cooperação de ninguém.** É o
 * mesmo protocolo que o navegador de servidores do jogo usa.
 *
 * Se `A2S_PLAYER` devolver a lista de nomes, qualquer streamer usa o Detetive
 * sozinho, em qualquer servidor. Se não devolver, o produto só serve para
 * quem tem RCON — e aí o cliente muda de streamer para dono de servidor.
 *
 * ⚠️ A Facepunch tem a variável `server.censorplayerlist` (padrão `false`)
 * justamente para mascarar essa lista. Ou seja: por padrão os nomes vêm, mas
 * cada dono pode desligar. O código trata lista vazia como "censurada ou
 * vazia", nunca como "servidor sem ninguém".
 */

const dgram = require('node:dgram');

const CABECALHO = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_INFO = Buffer.concat([
  CABECALHO, Buffer.from([0x54]), Buffer.from('Source Engine Query\0', 'ascii'),
]);
const pedidoJogadores = (desafio) => Buffer.concat([CABECALHO, Buffer.from([0x55]), desafio]);
const SEM_DESAFIO = Buffer.from([0xff, 0xff, 0xff, 0xff]);

/** Uma ida e volta de UDP. UDP não avisa quando o pacote se perde, então
 *  o tempo limite é a única forma de desistir. */
function trocar(host, porta, pacote, ms) {
  return new Promise((resolver) => {
    const s = dgram.createSocket('udp4');
    const fim = (v) => { clearTimeout(t); try { s.close(); } catch {} resolver(v); };
    const t = setTimeout(() => fim(null), ms);
    s.on('message', fim);
    s.on('error', () => fim(null));
    s.send(pacote, porta, host, (e) => { if (e) fim(null); });
  });
}

function lerTexto(b, i) {
  let j = i;
  while (j < b.length && b[j] !== 0) j++;
  return [b.subarray(i, j).toString('utf8'), j + 1];
}

/**
 * @returns {Promise<null|{info:object, jogadores:Array|null, motivo?:string}>}
 */
async function consultar(host, porta, { tempoLimiteMs = 4000 } = {}) {
  let r = await trocar(host, porta, A2S_INFO, tempoLimiteMs);
  if (!r) return null;
  // 0x41 = pedido de desafio. Reenvia o mesmo pacote com ele no fim.
  if (r[4] === 0x41) r = await trocar(host, porta, Buffer.concat([A2S_INFO, r.subarray(5, 9)]), tempoLimiteMs);
  if (!r || r[4] !== 0x49) return null;

  let i = 6, nome, mapa, pasta, jogo;
  [nome, i] = lerTexto(r, i);
  [mapa, i] = lerTexto(r, i);
  [pasta, i] = lerTexto(r, i);
  [jogo, i] = lerTexto(r, i);
  i += 2; // app id
  const info = { nome, mapa, jogo, jogadores: r[i], max: r[i + 1] };

  let p = await trocar(host, porta, pedidoJogadores(SEM_DESAFIO), tempoLimiteMs);
  if (p && p[4] === 0x41) p = await trocar(host, porta, pedidoJogadores(p.subarray(5, 9)), tempoLimiteMs);
  if (!p || p[4] !== 0x44) {
    return { info, jogadores: null, motivo: p ? `resposta inesperada 0x${p[4]?.toString(16)}` : 'sem resposta ao pedido de jogadores' };
  }

  const n = p[5];
  let k = 6;
  const lista = [];
  for (let x = 0; x < n && k < p.length; x++) {
    k += 1; // índice, sempre 0 na prática
    let nm; [nm, k] = lerTexto(p, k);
    if (k + 8 > p.length) break;
    const pontos = p.readInt32LE(k); k += 4;
    const segundos = p.readFloatLE(k); k += 4;
    lista.push({ nome: nm, pontos, minutosNoServidor: Math.round(segundos / 60) });
  }
  return { info, jogadores: lista };
}

/**
 * Tenta a porta informada e a seguinte. No Rust a porta de consulta costuma
 * ser a do jogo + 1, mas os diretórios publicam ora uma ora outra — tentar
 * as duas evita um "servidor offline" que na verdade é porta errada.
 */
async function consultarEsperto(host, porta, op) {
  for (const p of [porta, porta + 1, porta - 1]) {
    if (p < 1 || p > 65535) continue;
    const r = await consultar(host, p, op);
    if (r) return { ...r, portaUsada: p };
  }
  return null;
}

module.exports = { consultar, consultarEsperto };
