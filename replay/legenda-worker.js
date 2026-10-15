// O leitor de voz da legenda, num Worker que é um arquivo nosso (como o do ler-tela.js).
//
// Arquivo e não blob: um Worker de blob herda a política de segurança da página, que não deixa compilar
// WebAssembly; um Worker de arquivo tem a política da resposta dele. Aqui dentro corre o Whisper base
// (transformers.js 4.3.0) com um fio só, que é o que o GitHub Pages deixa ter.
//
// O transformers.js, o motor e o modelo vêm do jsDelivr e do Hugging Face numa versão fixa, e cada
// arquivo é conferido pelo SHA-256 antes de ser usado (ver legenda-arquivos.js).
//
// A conversa com a página:
//   recebe { tipo: 'transcrever', id, audio: Float32Array mono a 16 kHz, idioma, traduzir }
//   manda  { tipo: 'baixar', url, feito, total }    a cada pedaço baixado (só da primeira vez)
//          { tipo: 'abrir' }                          o modelo está a ser aberto
//          { tipo: 'ouvir', fracao }                  quanto do áudio já foi lido
//          { tipo: 'pronto', id, palavras, segundos } palavras: [{ t, de, ate }] em segundos do áudio
//          { tipo: 'erro', id, nome, mensagem }
//
// Nenhum pedido sai para fora da lista de legenda-arquivos.js, e nenhum arquivo é aceito sem o SHA-256
// certo. O texto que sai daqui é só texto: a página desenha-o com fillText e mostra-o com textContent.

import { MODELO, REVISAO, CODIGO, MOTOR, POR_URL, CACHE_MOTOR, CACHE_MODELO, sha256 } from './legenda-arquivos.js?v=257617901c';
import { palavrasDe, janelasDoAudio, juntarJanelas } from './legenda.js?v=257617901c';

const TAXA = 16000;
const JANELA_S = 30;
const SOBRA_S = 5;

/** Baixar um arquivo da lista, dizendo o progresso, e recusá-lo se a impressão digital não bater. */
async function buscarConferido(url, init = {}) {
  const alvo = POR_URL.get(String(url));
  // O transformers.js pergunta por arquivos opcionais (um processor_config.json que este modelo não
  // tem, por exemplo). Fora da lista, a resposta é "não existe", sem sair da máquina.
  if (!alvo) return new Response(null, { status: 404, statusText: 'fora da lista' });
  // "Que tamanho tem?" (um pedido do primeiro byte): a resposta já está na lista, sem ir à rede.
  if (new Headers(init.headers).has('range')) {
    return new Response(new Uint8Array(1), {
      status: 206, headers: { 'content-range': `bytes 0-0/${alvo.bytes}`, 'content-length': '1' },
    });
  }
  const r = await fetch(alvo.url, { signal: init.signal, credentials: 'omit' });
  if (!r.ok) return r;
  const leitor = r.body.getReader();
  const bytes = new Uint8Array(alvo.bytes);
  let feito = 0;
  let avisado = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (feito + value.length > bytes.length) throw Object.assign(new Error(`${alvo.caminho || 'motor'}: maior do que devia`), { name: 'INTEGRIDADE' });
    bytes.set(value, feito);
    feito += value.length;
    if (feito - avisado > 512 * 1024 || feito === bytes.length) {
      avisado = feito;
      postMessage({ tipo: 'baixar', url: alvo.url, feito, total: alvo.bytes });
    }
  }
  if (feito !== alvo.bytes || (await sha256(bytes)) !== alvo.sha256) {
    throw Object.assign(new Error(`${alvo.caminho || 'motor'}: o arquivo baixado não é o esperado`), { name: 'INTEGRIDADE' });
  }
  return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
}

/** Um arquivo nosso (o código ou o motor): do cache, ou baixado e conferido. */
async function guardado(alvo) {
  let cache = null;
  try { cache = await caches.open(CACHE_MOTOR); } catch { /* sem Cache Storage: baixa-se sempre */ }
  let r = await cache?.match(alvo.url);
  if (!r) {
    r = await buscarConferido(alvo.url);
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { name: 'TypeError' });
    try { await cache?.put(alvo.url, r.clone()); } catch { /* sem espaço: fica só para esta vez */ }
  }
  return r.arrayBuffer();
}

/**
 * O transformers.js, importado só depois de conferido. Um `import` direto do jsDelivr não deixa
 * conferir nada (num Worker não há `integrity` para módulos); aqui os bytes passam pelo SHA-256 e só
 * então viram módulo, por um endereço `blob:` com exatamente esses bytes.
 */
async function transformers() {
  const bytes = await guardado(CODIGO);
  if ((await sha256(bytes)) !== CODIGO.sha256) {
    throw Object.assign(new Error('transformers.js: o arquivo guardado não é o esperado'), { name: 'INTEGRIDADE' });
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

let leitor = null;
let WhisperTextStreamer = null;
async function abrirLeitor() {
  if (leitor) return leitor;
  const tjs = await transformers();
  const { pipeline, env } = tjs;
  ({ WhisperTextStreamer } = tjs);
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = 'https://huggingface.co/';
  // O commit fixo no próprio caminho: o transformers.js 4.3.0 lê a lista de arquivos do modelo sem
  // passar a `revision`, e ia ao `main`.
  env.remotePathTemplate = `{model}/resolve/${REVISAO}/`;
  env.cacheKey = CACHE_MODELO;
  env.fetch = buscarConferido;
  // O motor entra já em bytes (conferidos): o onnxruntime usa o código que vem dentro do
  // transformers.min.js e não vai buscar outro a lado nenhum.
  env.useWasmCache = false;
  const onnx = env.backends.onnx;
  onnx.wasm.wasmBinary = await guardado(MOTOR);
  onnx.wasm.wasmPaths = {};
  onnx.wasm.numThreads = 1;
  postMessage({ tipo: 'abrir' });
  leitor = await pipeline('automatic-speech-recognition', MODELO, {
    revision: REVISAO, dtype: 'q8', device: 'wasm',
  });
  return leitor;
}

async function transcrever({ id, audio, idioma, traduzir }) {
  const asr = await abrirLeitor();
  const t0 = performance.now();
  const lista = janelasDoAudio(audio.length, TAXA, { janelaS: JANELA_S, sobraS: SOBRA_S });
  let k = 0;
  // Dentro de cada janela, o progresso vem dos tempos que o próprio modelo escreve (cada frase começa
  // num instante).
  const streamer = new WhisperTextStreamer(asr.tokenizer, {
    skip_prompt: true,
    callback_function: () => {},
    on_chunk_start: (s) => {
      const j = lista[k];
      const dentro = Math.min(1, s / Math.max(1, (j.fim - j.ini) / TAXA));
      postMessage({ tipo: 'ouvir', fracao: Math.min(0.99, (k + dentro) / lista.length) });
    },
  });
  // Uma janela de cada vez, e não o `chunk_length_s` do transformers.js: com o tempo por palavra, a
  // costura dele repetia as palavras da sobra ("é, é, né? né?"). Aqui cada janela só fica com as
  // palavras do miolo dela (ver `janelasDoAudio`).
  const resultados = [];
  for (; k < lista.length; k++) {
    const j = lista[k];
    // eslint-disable-next-line no-await-in-loop
    const saida = await asr(audio.subarray(j.ini, j.fim), {
      return_timestamps: 'word',
      ...(idioma && idioma !== 'auto' ? { language: idioma } : {}),
      task: traduzir ? 'translate' : 'transcribe',
      // Medido em 12/10 em VODs reais da Kick: sem isto, 30 s de Rust com tiros viraram 40 s de conta e
      // "o que é o que é o que é..." até ao fim; com 1,1 saiu a frase certa em 5 s, e 60 s de fala
      // corrida do Gaules saíram iguais ou melhores (36 s em vez de 46 s).
      repetition_penalty: 1.1,
      streamer,
    });
    resultados.push({ janela: j, palavras: palavrasDe(saida, (j.fim - j.ini) / TAXA) });
    postMessage({ tipo: 'ouvir', fracao: Math.min(0.99, (k + 1) / lista.length) });
  }
  postMessage({ tipo: 'pronto', id, palavras: juntarJanelas(resultados, TAXA), segundos: (performance.now() - t0) / 1000 });
}

self.onmessage = async ({ data }) => {
  if (data?.tipo !== 'transcrever') return;
  try {
    await transcrever(data);
  } catch (e) {
    postMessage({ tipo: 'erro', id: data.id, nome: e?.name || 'Error', mensagem: String(e?.message || e) });
  }
};
