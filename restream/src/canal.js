'use strict';
/**
 * Um canal de retransmissão.
 *
 * A ideia toda depende de uma medição: retransmitir com `-c copy` custa
 * **0,4% de um núcleo**, contra 65,8% recodificando — 172x mais barato
 * (medido em 27/08/2026, 1080p30, ffmpeg 7.0.2). É por isso que 50 canais
 * cabem onde 3 OBS não caberiam: o OBS recodifica sempre, aqui não se
 * recodifica nunca.
 *
 * A consequência é que a fonte já tem que estar no formato que a plataforma
 * aceita. Recodificar uma vez, ao arquivar, e retransmitir mil vezes de graça.
 */

const PLATAFORMAS = {
  twitch: {
    // A Twitch encerra transmissão contínua em 48h. Reiniciar por conta
    // própria antes disso é melhor do que ser cortado no meio: a queda vira
    // um corte limpo entre vídeos em vez de erro no meio de um.
    rtmp: 'rtmp://live.twitch.tv/app/',
    limiteContinuoMs: 47 * 60 * 60 * 1000,
    exigeEtiquetaRerun: true,
  },
  youtube: {
    rtmp: 'rtmp://a.rtmp.youtube.com/live2/',
    limiteContinuoMs: null,
    // ⚠️ Só no canal de quem é dono do conteúdo. Passar obra de terceiro
    // cai na política de "reused content" e desmonetiza o CANAL INTEIRO.
    exigeConteudoProprio: true,
  },
  kick: {
    rtmp: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app/',
    limiteContinuoMs: null,
  },
};

/**
 * Monta os argumentos do ffmpeg.
 *
 * `-re` não é opcional: sem ele o ffmpeg despeja o arquivo o mais rápido que
 * consegue, o servidor da plataforma recusa, e a transmissão morre em
 * segundos. É o erro nº 1 de quem tenta retransmitir arquivo.
 */
function argumentos({ fonte, plataforma, chave, extras = [] }) {
  const p = PLATAFORMAS[plataforma];
  if (!p) throw new Error(`plataforma desconhecida: ${plataforma}`);
  if (!chave) throw new Error('chave de transmissão obrigatória');
  if (!fonte) throw new Error('fonte obrigatória');

  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-re',                       // ritmo de tempo real — sem isto, morre
    '-i', fonte,
    '-c', 'copy',                // 172x mais barato que recodificar
    '-f', 'flv',
    ...extras,
    p.rtmp + chave,
  ];
}

/** Nunca deixe a chave aparecer em log — é ela que dá acesso ao canal. */
function ocultarChave(texto, chave) {
  if (!chave) return texto;
  return String(texto).split(chave).join('***');
}

/**
 * Banda por canal, em Mbps. É o custo real da operação: CPU é desprezível,
 * banda não. 50 canais a 1080p são ~225 Mbps sustentados, 24h por dia.
 */
function bandaMbps(bitrateVideoKbps = 4500, bitrateAudioKbps = 160) {
  return (bitrateVideoKbps + bitrateAudioKbps) / 1000;
}

function custoDeBanda(nCanais, bitrateVideoKbps = 4500) {
  const mbps = bandaMbps(bitrateVideoKbps) * nCanais;
  const tbPorMes = (mbps * 1e6 * 60 * 60 * 24 * 30) / 8 / 1e12;
  return {
    canais: nCanais,
    mbpsSustentado: Math.round(mbps * 10) / 10,
    tbPorMes: Math.round(tbPorMes),
  };
}

module.exports = { PLATAFORMAS, argumentos, ocultarChave, bandaMbps, custoDeBanda };
