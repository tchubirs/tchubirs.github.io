// O som do clipe e o leitor de voz: a parte da legenda que precisa do navegador.
//
// O som: só o pedaço do clipe, só do streamer do clipe, tirado dos pedaços HLS da Kick como a
// exportação faz (o mesmo VOD, o mesmo relógio, o mesmo `planearCorte`). Não do degrau de 1080p:
// medido em 12/10 num VOD real da Kick, o 1080p60, o 720p60 e o 480p30 levam o MESMO áudio, byte a
// byte (AAC de 160 kb/s, 48 kHz, estéreo), e o 480p pesa 1,8 MB por 10 s contra 10,6 MB. O 360p e o
// 160p têm outro áudio, mais pobre (60 a 80 kb/s), e ficam de fora. Sem 480p na escada, vai o degrau
// da exportação.
//
// O leitor: o Whisper base no legenda-worker.js, que se abre uma vez e fica aberto enquanto a página
// estiver aberta. Parar a meio fecha-o (é a única maneira de parar o WebAssembly a meio de uma conta).

import { pegarSegmento } from './baixar.js?v=25ebf0fa92';
import { aacDeSegmentos } from './audio-ts.js?v=25ebf0fa92';
import { descodificarAac } from './alinhar.js?v=25ebf0fa92';
import { oQueFalta } from './legenda-arquivos.js?v=25ebf0fa92';
import { SEGUNDOS_POR_SEGUNDO, ABRIR_S } from './legenda.js?v=25ebf0fa92';

export const TAXA_VOZ = 16000;
const TAXA_ORIGEM = 48000;

/** O degrau de onde sai o som: o 480p, que tem o áudio do 1080p; sem ele, o da exportação. */
export function degrauDoSom(escada) {
  return escada.find((d) => d.altura === 480) || escada[0];
}

/** Mono a `taxa` para mono a 16 kHz, com o reamostrador do navegador (que filtra antes de descer). */
export async function para16k(mono, taxa) {
  if (taxa === TAXA_VOZ) return mono;
  const n = Math.max(1, Math.round((mono.length * TAXA_VOZ) / taxa));
  if (typeof OfflineAudioContext !== 'undefined') {
    const ctx = new OfflineAudioContext(1, n, TAXA_VOZ);
    const buf = ctx.createBuffer(1, mono.length, taxa);
    buf.copyToChannel(mono, 0);
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.connect(ctx.destination);
    fonte.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  // Sem Web Audio: a média de cada grupo de amostras, que já é um filtro (grosseiro).
  const saida = new Float32Array(n);
  const passo = taxa / TAXA_VOZ;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * passo);
    const b = Math.min(mono.length, Math.max(a + 1, Math.floor((i + 1) * passo)));
    let s = 0;
    for (let j = a; j < b; j++) s += mono[j];
    saida[i] = s / (b - a);
  }
  return saida;
}

/**
 * O som de `deMs` a `ateMs` (relógio do vídeo) a partir dos pedaços de um plano (`segmentos` de
 * `planearCorte`): baixa-os, tira o AAC, descodifica e corta no instante pedido. Mono a 16 kHz.
 * `aoBaixar({ prontos, total, bytes })` a cada pedaço.
 */
export async function somDosPedacos(segs, deMs, ateMs, {
  buscar = fetch, sinal, aoBaixar, prazoMs, descodificar = descodificarAac, reamostrar = para16k, paralelo = 3,
} = {}) {
  if (!segs?.length) throw Object.assign(new Error('sem pedaços'), { name: 'SEM-SOM' });
  const partes = new Array(segs.length);
  let proximo = 0;
  let prontos = 0;
  let bytes = 0;
  const umPedido = async () => {
    while (proximo < segs.length) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const i = proximo++;
      try {
        // eslint-disable-next-line no-await-in-loop
        partes[i] = await pegarSegmento(segs[i].url, { buscar, sinal, prazoMs });
      } catch (e) {
        throw sinal?.aborted ? new DOMException('cancelado', 'AbortError') : e;
      }
      prontos++;
      bytes += partes[i].length;
      aoBaixar?.({ prontos, total: segs.length, bytes });
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, segs.length) }, umPedido));
  const ts = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { ts.set(p, o); o += p.length; }
  const aac = aacDeSegmentos(ts);
  if (!aac) throw Object.assign(new Error('os pedaços não têm som AAC'), { name: 'SEM-SOM' });
  const mono = await descodificar(aac, { taxaAlvo: TAXA_ORIGEM });
  if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
  const de = Math.max(0, Math.round(((deMs - segs[0].inicio) / 1000) * TAXA_ORIGEM));
  const ate = Math.min(mono.length, de + Math.round(((ateMs - deMs) / 1000) * TAXA_ORIGEM));
  if (ate - de < TAXA_ORIGEM * 0.5) throw Object.assign(new Error('pedaço de som curto demais'), { name: 'SEM-SOM' });
  return reamostrar(mono.subarray(de, ate), TAXA_ORIGEM);
}

/**
 * Quanto tempo leva, em segundos, para ler `duracaoS` de áudio: abrir o modelo mais 0,9 s por
 * segundo de áudio (o medido no estudo, num fio). Sem contar o download.
 */
export const estimativaS = (duracaoS) => Math.round(ABRIR_S + duracaoS * SEGUNDOS_POR_SEGUNDO);

/** O que falta baixar, em bytes, e se o navegador guarda (Cache Storage). */
export async function faltaBaixar() {
  const falta = await oQueFalta();
  return { bytes: falta.reduce((s, a) => s + a.bytes, 0), guarda: typeof caches !== 'undefined' };
}

/**
 * O leitor de voz. `transcrever(audio, { idioma, traduzir, aoProgresso, sinal })` devolve
 * `{ palavras: [{ t, de, ate }] (segundos), segundos }`. `aoProgresso({ fase, fracao, feito, total })`:
 * 'baixar' (bytes), 'abrir', 'ouvir' (fração do áudio).
 * `criar` é a costura dos testes: devolve o Worker (ou algo que fale como ele).
 */
export function abrirVoz({ criar = () => new Worker(new URL('./legenda-worker.js', import.meta.url), { type: 'module' }) } = {}) {
  let w = null;
  let pedido = 0;
  const fechar = () => { w?.terminate(); w = null; };
  return {
    fechar,
    transcrever(audio, { idioma = 'auto', traduzir = false, aoProgresso, sinal, faltaBytes = 0 } = {}) {
      if (sinal?.aborted) return Promise.reject(new DOMException('cancelado', 'AbortError'));
      if (!w) w = criar();
      const meu = w;
      const id = ++pedido;
      const baixado = new Map();
      return new Promise((ok, mal) => {
        const acabar = (fn, v) => {
          meu.removeEventListener('message', aoMsg);
          meu.removeEventListener('error', aoErro);
          sinal?.removeEventListener('abort', aoParar);
          fn(v);
        };
        const aoMsg = ({ data: d }) => {
          if (d?.tipo === 'baixar') {
            baixado.set(d.url, d.feito);
            const feito = [...baixado.values()].reduce((s, x) => s + x, 0);
            const total = Math.max(faltaBytes, feito);
            aoProgresso?.({ fase: 'baixar', feito, total, fracao: total ? feito / total : 0 });
          } else if (d?.tipo === 'abrir') {
            aoProgresso?.({ fase: 'abrir', fracao: 0 });
          } else if (d?.tipo === 'ouvir') {
            aoProgresso?.({ fase: 'ouvir', fracao: d.fracao });
          } else if (d?.tipo === 'pronto' && d.id === id) {
            acabar(ok, { palavras: Array.isArray(d.palavras) ? d.palavras : [], segundos: d.segundos });
          } else if (d?.tipo === 'erro' && d.id === id) {
            acabar(mal, Object.assign(new Error(d.mensagem), { name: d.nome }));
          }
        };
        // O Worker nem arrancou (o arquivo não veio, o módulo rebentou ao carregar): fecha-se, e o
        // próximo pedido tenta um novo.
        const aoErro = (e) => {
          e?.preventDefault?.();
          if (w === meu) fechar();
          acabar(mal, Object.assign(new Error(e?.message || 'o leitor de voz não abriu'), { name: 'SEM-LEITOR' }));
        };
        const aoParar = () => {
          if (w === meu) fechar();
          acabar(mal, new DOMException('cancelado', 'AbortError'));
        };
        meu.addEventListener('message', aoMsg);
        meu.addEventListener('error', aoErro);
        sinal?.addEventListener('abort', aoParar, { once: true });
        meu.postMessage({ tipo: 'transcrever', id, audio, idioma, traduzir });
      });
    },
  };
}
