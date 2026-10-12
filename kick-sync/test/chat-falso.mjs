// O chat de um clipe para os testes do "Chat no vídeo" (e para as fotos do mesmo): mensagens de várias
// pessoas a cada meio segundo no primeiro minuto da noite falsa, com um emote da Kick, e um vídeo que
// toca de verdade no lugar do duplo do hls.js. Vive à parte porque os testes e o guião das fotos usam
// exatamente os mesmos.

import zlib from 'node:zlib';
import { T } from './falsa.mjs';

/** Um PNG de `lado` x `lado`: um círculo amarelo com dois olhos, que é o que um emote costuma ser. */
export function pngDeEmote(lado = 56) {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, c]);
  };
  const linhas = [];
  const r = lado / 2;
  for (let y = 0; y < lado; y++) {
    const l = Buffer.alloc(1 + lado * 4);
    for (let x = 0; x < lado; x++) {
      const d = Math.hypot(x - r + 0.5, y - r + 0.5);
      const olho = Math.hypot(x - r * 0.65, y - r * 0.75) < r * 0.14 || Math.hypot(x - r * 1.35, y - r * 0.75) < r * 0.14;
      const boca = y > r * 1.25 && y < r * 1.45 && Math.abs(x - r) < r * 0.5;
      const cor = d > r - 1 ? [0, 0, 0, 0] : olho || boca ? [40, 30, 20, 255] : [255, 205, 40, 255];
      cor.forEach((v, k) => { l[1 + x * 4 + k] = v; });
    }
    linhas.push(l);
  }
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(lado, 0); cab.writeUInt32BE(lado, 4);
  cab[8] = 8; cab[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cab), bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), bloco('IEND', Buffer.alloc(0)),
  ]);
}

const FRASES = [
  'que tiro foi esse', 'KKKKKKKK', 'clipa isso', 'GG', 'ele tava de AK [emote:37226:KEKW]',
  'mirou na cabeça', '[emote:37226:KEKW] [emote:37226:KEKW]', 'boa demais', 'foi de longe isso',
  'raid no teto?', 'o cara nem viu', 'insano', 'manda o replay', '<b>nao</b> & "aspas"',
];
const AUTORES = ['lontrafeliz', 'gatomia', 'zebra99', 'newtrc', 'rockg', 'sapoiq', 'kiwi_chanvt', 'elfosxx'];

/** As mensagens do canal `i`: uma a cada 700 ms no primeiro minuto e meio da noite. */
export function chatRico(i = 0, { de = T, quantas = 130 } = {}) {
  const lista = [];
  for (let k = 0; k < quantas; k++) {
    const ms = de + k * 700;
    lista.push({
      id: `r${i}-${k}`,
      created_at: new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z'),
      content: FRASES[(k + i) % FRASES.length],
      sender: { slug: AUTORES[(k * 3 + i) % AUTORES.length] },
    });
  }
  return lista;
}

/**
 * Por cima da Kick falsa: o chat rico (no lugar dos "kkk"), a imagem do emote com licença para a
 * tela, e um hls.js de mentira que toca `window.__fonteFalsa`. `comEmote: false` deixa a imagem do
 * emote sem licença, como uma Kick que não a dá.
 */
export async function chatEVideo(p, { canais = ['tchubi'], comEmote = true } = {}) {
  await p.route('**/api/v2/channels/*/messages**', async (rota) => {
    const u = new URL(rota.request().url());
    const i = Number(u.pathname.match(/channels\/(\d+)\/messages/)?.[1]) - 1000;
    const cursorMs = Number(u.searchParams.get('cursor')) / 1000;
    const antes = (i >= 0 && i < canais.length ? chatRico(i) : []).filter((m) => Date.parse(m.created_at) < cursorMs);
    const pagina = antes.slice(-25).reverse();
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { messages: pagina, cursor: pagina.length ? String(Date.parse(pagina.at(-1).created_at) * 1000) : null } }),
    });
  });
  const png = pngDeEmote();
  await p.route('https://files.kick.com/emotes/**', (rota) => rota.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: comEmote ? { 'access-control-allow-origin': '*' } : {},
    body: png,
  }));
  await p.route('**/hls-*.js', (rota) => rota.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.__carregados=[];'
      + 'window.Hls=function(o){var m=null;var s=(o&&o.startPosition)||0;'
      + 'this.loadSource=function(u){window.__carregados.push(u);};'
      + 'this.attachMedia=function(v){m=v;var ir=function(){if(!window.__fonteFalsa){return setTimeout(ir,50);}'
      + 'm.src=window.__fonteFalsa;m.addEventListener("loadedmetadata",function(){try{if(s>0)m.currentTime=s;}catch(e){}},{once:true});};ir();};'
      + 'this.destroy=function(){};};'
      + 'window.Hls.isSupported=function(){return true;};',
  }));
}

/**
 * O vídeo que o hls.js de mentira toca: `ms` de quadros gravados na página. `estilo: 'liso'` são
 * cores lisas e escuras (nenhum píxel quase branco, para o teste contar o texto do chat pelos píxeis
 * claros); 'jogo' é uma cena de Rust pintada, para as fotos.
 */
export async function gravarFonte(p, { ms = 6000, estilo = 'liso' } = {}) {
  await p.evaluate(async ({ duracao, jogo }) => {
    const cv = document.createElement('canvas');
    cv.width = 1280; cv.height = 720;
    const g = cv.getContext('2d');
    let n = 0;
    const pintar = () => {
      n++;
      if (!jogo) {
        g.fillStyle = `hsl(${(n * 9) % 360} 55% 30%)`;
        g.fillRect(0, 0, 1280, 720);
        return;
      }
      const ceu = g.createLinearGradient(0, 0, 0, 400);
      ceu.addColorStop(0, '#5f7f9e'); ceu.addColorStop(1, '#c9b892');
      g.fillStyle = ceu; g.fillRect(0, 0, 1280, 720);
      g.fillStyle = '#56643a'; g.fillRect(0, 400, 1280, 320);
      g.fillStyle = '#7b6a55';
      for (let k = 0; k < 6; k++) g.fillRect(140 + k * 190 - (n % 40), 300 - (k % 3) * 30, 120, 100 + (k % 3) * 30);
      g.fillStyle = '#44512c';
      for (let k = 0; k < 30; k++) g.fillRect((k * 83 + n * 3) % 1280, 430 + (k * 37) % 280, 50, 6);
      g.fillStyle = '#2b2b2b'; g.fillRect(610 + (n % 20), 330, 26, 80);
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 2;
      g.beginPath(); g.arc(640, 360, 10, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#3a2c25'; g.fillRect(0, 470, 330, 250);
      g.fillStyle = '#c99a7c'; g.beginPath(); g.arc(165, 590, 70, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b1b1b'; g.fillRect(1040, 640, 220, 60);
      g.fillStyle = '#e8e8e8'; g.font = '600 26px sans-serif'; g.fillText('AK47  30/30', 1060, 680);
    };
    pintar();
    const t = setInterval(pintar, 33);
    const gravador = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' });
    const pedacos = [];
    gravador.ondataavailable = (e) => pedacos.push(e.data);
    gravador.start();
    await new Promise((k) => setTimeout(k, duracao));
    await new Promise((k) => { gravador.onstop = k; gravador.stop(); });
    clearInterval(t);
    window.__fonteFalsa = URL.createObjectURL(new Blob(pedacos, { type: 'video/webm' }));
  }, { duracao: ms, jogo: estilo === 'jogo' });
}

/**
 * Um quadro de um ficheiro exportado (o link da fila), aos `aosS` segundos, numa tela do tamanho dele.
 * Devolve a contagem de píxeis quase brancos em cada região pedida, `{ nome: [x, y, w, h] }` em
 * fracções do quadro, e o PNG do quadro (para as fotos).
 */
export async function quadroDoFicheiro(p, url, regioes, { aosS = 1.6, png = false } = {}) {
  return p.evaluate(async ({ u, reg, s, comPng }) => {
    const blob = await (await fetch(u)).blob();
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(blob);
    await new Promise((ok, mal) => { v.onloadeddata = ok; v.onerror = () => mal(new Error('não abriu')); });
    await v.play();
    await new Promise((ok) => {
      const ver = () => (v.currentTime >= s || v.ended ? ok() : requestAnimationFrame(ver));
      ver();
    });
    v.pause();
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d');
    g.drawImage(v, 0, 0);
    const contas = {};
    for (const [nome, [fx, fy, fw, fh]] of Object.entries(reg)) {
      const x = Math.round(fx * c.width); const y = Math.round(fy * c.height);
      const w = Math.round(fw * c.width); const h = Math.round(fh * c.height);
      const d = g.getImageData(x, y, w, h).data;
      let claros = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 205 && d[i + 1] > 205 && d[i + 2] > 205) claros++;
      contas[nome] = claros;
    }
    return { largura: c.width, altura: c.height, contas, png: comPng ? c.toDataURL('image/png') : null };
  }, { u: url, reg: regioes, s: aosS, comPng: png });
}
