// A Kick de mentira, num sitio so.
//
// Vivia dentro de `pagina.test.mjs`. Saiu para aqui porque as fotografias do
// antes e do depois precisam exactamente da mesma Kick que os testes usam — e
// duas copias da mesma mentira acabam sempre a divergir uma da outra.

import fs from 'node:fs';
import path from 'node:path';

export const T = Date.parse('2026-08-30T21:00:00.000Z');
const SOM = new URL('../probes/fixtures/som/', import.meta.url).pathname;
export const TEM_SOM = fs.existsSync(SOM);
const SEGS_SOM = TEM_SOM ? fs.readdirSync(SOM).filter((f) => f.endsWith('.ts')).sort() : [];

/**
 * A Kick that answers from memory: two channels, one night, ten-second pieces.
 *
 * `desviosS` desloca o PROGRAM-DATE-TIME de um canal sem mexer no conteúdo —
 * exactamente o que acontece a quem tem mais buffer no OBS, e o que o
 * alinhamento pelo som tem de medir e desfazer.
 */
export async function kickFalsa(pagina, {
  canais = ['tchubi', 'outro'], segmentos = 60, comSom = false, desviosS = {}, comecosS = {},
  // Quantas noites, e quanto tempo cada uma demora a responder.
  //
  // Uma só é o caso normal e continua a ser o que sai por omissão. Duas são
  // precisas para provar que mudar de noite duas vezes seguidas não acaba na
  // noite errada — e para isso a primeira tem de ser LENTA, senão as duas
  // acabam pela ordem em que foram pedidas e a corrida nunca acontece.
  noites = 1, atrasoMsPorNoite = {},
  // Que canais existem em cada noite. Serve para as noites ficarem
  // DISTINGUÍVEIS no ecrã: sem isso, duas noites com os mesmos canais dão o
  // mesmo palco e um teste de corrida não consegue dizer qual delas ganhou.
  canaisPorNoite = null,
} = {}) {
  const quantos = comSom ? SEGS_SOM.length : segmentos;
  // Cada noite começa 24 h depois da anterior.
  const DIA = 24 * 3600 * 1000;
  const playlist = (slug, noite = 0) => {
    const l = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:12', '#EXT-X-PLAYLIST-TYPE:EVENT'];
    const desvio = (desviosS[slug] || 0) * 1000;
    for (let i = 0; i < quantos; i++) {
      l.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(T + noite * DIA + i * 10000 + desvio).toISOString()}`);
      l.push('#EXTINF:10.000,', `${i}.ts`);
    }
    return l.join('\n');
  };
  const master = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,FRAME-RATE=30.000',
    '160p30/playlist.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=9091454,RESOLUTION=1920x1080,FRAME-RATE=60.000',
    '1080p60/playlist.m3u8',
  ].join('\n');

  const pedidos = { api: 0, master: 0, playlist: 0, segmentos: 0, caro: 0, barato: 0, busca: 0 };

  await pagina.route('**/api/search?**', async (rota) => {
    pedidos.busca++;
    const t = new URL(rota.request().url()).searchParams.get('searched_word') || '';
    const todos = [...canais, 'tchubizinho', 'outrolado'];
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        // Como a busca a serio: encontra por pedaco do nome, e nao so por
        // igualdade — e por isso um nome mal escrito ainda acha o certo.
        channels: todos.filter((c) => c.includes(t.toLowerCase().slice(0, 4)))
          .map((slug, i) => ({ slug, followersCount: 1000 - i * 10, is_live: i === 0 })),
      }),
    });
  });
  await pagina.route('**/api/v2/channels/*/videos', async (rota) => {
    pedidos.api++;
    const slug = rota.request().url().match(/channels\/([^/]+)\/videos/)[1];
    if (!canais.includes(slug)) return rota.fulfill({ status: 404, body: '' });
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Array.from({ length: noites }, (_, i) => i)
        .filter((i) => !canaisPorNoite || (canaisPorNoite[i] || canais).includes(slug))
        .map((i) => ({
        // A hora de inicio de cada canal, para o teste poder pedir uma ordem
        // de chegada diferente da ordem em que ele os escreveu — que e
        // exactamente o caso que estava errado.
        id: i + 1,
        session_title: `noite ${i}`,
        start_time: new Date(T + i * DIA + (comecosS[slug] || 0) * 1000)
          .toISOString().replace('T', ' ').slice(0, 19),
        duration: quantos * 10000,
        source: `https://cdn.fake/${slug}/n${i}/master.m3u8`,
        video: {},
        }))),
    });
  });
  await pagina.route('https://cdn.fake/**', async (rota) => {
    const u = rota.request().url();
    const slug = u.match(/cdn\.fake\/([^/]+)\//)?.[1] || '';
    const noite = Number(u.match(/\/n(\d+)\//)?.[1] ?? 0);
    const atraso = atrasoMsPorNoite[noite] || 0;
    if (atraso) await new Promise((k) => setTimeout(k, atraso));
    if (u.endsWith('master.m3u8')) { pedidos.master++; return rota.fulfill({ status: 200, body: master }); }
    if (u.endsWith('playlist.m3u8')) {
      pedidos.playlist++;
      if (u.includes('1080p60')) pedidos.caro++; else pedidos.barato++;
      return rota.fulfill({ status: 200, body: playlist(slug, noite) });
    }
    pedidos.segmentos++;
    const n = Number(u.match(/(\d+)\.ts$/)?.[1] ?? 0);
    const corpo = comSom && SEGS_SOM[n]
      ? fs.readFileSync(path.join(SOM, SEGS_SOM[n]))
      : Buffer.alloc(4096, 7);
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: corpo });
  });
  // hls.js comes from a CDN this container cannot reach. Stub it: playback is
  // not what this test is about, and a missing global would hide real errors.
  await pagina.route('**/hls.min.js', (rota) => rota.fulfill({
    status: 200,
    contentType: 'text/javascript',
    // O stub regista o que lhe mandam carregar. Sem isto não há como ver
    // QUAL degrau da escada cada quadrado pediu — que é a decisão inteira.
    // O stub regista o que lhe mandam carregar e, ao fim de um instante, diz
    // que ja tem imagem — como um leitor a serio. Sem esse `loadeddata` a
    // pagina esperaria pelo limite de desistencia a cada movimento.
    body: 'window.__carregados=[];'
      + 'window.Hls=function(){var m=null;'
      + 'this.loadSource=function(u){window.__carregados.push(u);};'
      + 'this.attachMedia=function(v){m=v;setTimeout(function(){'
      + 'try{m.dispatchEvent(new Event("loadeddata"));}catch(e){}},30);};'
      + 'this.destroy=function(){};};'
      + 'window.Hls.isSupported=function(){return true;};',
  }));
  // As fontes vêm de um CDN, e nos testes essa rede não existe: sem isto o
  // `networkidle` fica à espera de um pedido que nunca resolve. Bloqueá-las
  // também testa o caso real de quem tem um bloqueador — a página tem de
  // funcionar na mesma, com a letra do sistema.
  await pagina.route('https://fonts.googleapis.com/**', (rota) => rota.abort());
  await pagina.route('https://fonts.gstatic.com/**', (rota) => rota.abort());

  return pedidos;
}
