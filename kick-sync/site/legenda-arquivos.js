// Os arquivos do leitor de voz da legenda, com o tamanho e a impressão digital de cada um.
//
// O código (o transformers.js 4.3.0, 0,6 MB) está em vendor/whisper/. O resto é grande demais para o
// repositório: o modelo são 77 MB e o motor 27 MB, e cada versão nova somava isso ao histórico do Git
// para sempre. Por isso vêm de fora, numa versão fixa, e só quando a pessoa liga a legenda:
//
//  - o modelo do Hugging Face, num commit fixo (`REVISAO`), e não no `main`, que pode mudar;
//  - o motor (o WebAssembly do onnxruntime-web que o transformers.js 4.3.0 traz) do jsDelivr, na
//    versão exata que o transformers.js pede.
//
// Cada arquivo só é aceito se o SHA-256 bater com o daqui. Os números foram tirados em 12/10/2026 dos
// próprios arquivos: os do modelo batem com o `lfs.sha256` do Hugging Face, e o do motor com o que
// está dentro do pacote do npm (onnxruntime-web, sha512 do registro conferido). O navegador guarda
// tudo (Cache Storage): da segunda vez não se baixa nada.

export const MODELO = 'onnx-community/whisper-base_timestamped';
export const REVISAO = '608c49e61301901684bc36cac8f74b95ff6b5a8e';
const BASE_MODELO = `https://huggingface.co/${MODELO}/resolve/${REVISAO}/`;
export const VERSAO_ORT = '1.31.0-dev.20260914-8d85527a0';

/** O motor: o WebAssembly que o código de dentro do transformers.min.js espera, byte a byte. */
export const MOTOR = Object.freeze({
  url: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${VERSAO_ORT}/dist/ort-wasm-simd-threaded.asyncify.wasm`,
  sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
  bytes: 26861777,
});

/** Os arquivos do modelo base com tempo por palavra, na versão de 8 bits (q8). */
export const ARQUIVOS_MODELO = Object.freeze([
  ['config.json', 'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b', 2243],
  ['generation_config.json', '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0', 3832],
  ['preprocessor_config.json', 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d', 339],
  ['tokenizer.json', '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566', 2480466],
  ['tokenizer_config.json', '2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573', 282682],
  ['onnx/encoder_model_quantized.onnx', '2714484ebe1bae7c1646e8eadb768bb9d415cf11763466d21f23039a29c62e6f', 23159167],
  ['onnx/decoder_model_merged_quantized.onnx', 'cf9a8d5bcddc0917a0078135b484cedcaf44f28909cd91910abd29dced9171db', 53712708],
].map(([caminho, sha256, bytes]) => Object.freeze({ caminho, url: BASE_MODELO + caminho, sha256, bytes })));

/** Tudo o que se baixa, pelo endereço. Um pedido fora desta lista não sai do navegador. */
export const POR_URL = new Map([MOTOR, ...ARQUIVOS_MODELO].map((a) => [a.url, a]));

/** Quanto se baixa da primeira vez (uns 107 MB). */
export const BYTES_TOTAL = [MOTOR, ...ARQUIVOS_MODELO].reduce((s, a) => s + a.bytes, 0);

/** Onde o navegador guarda: o modelo no cache do próprio transformers.js, o motor num nosso. */
export const CACHE_MODELO = 'transformers-cache';
export const CACHE_MOTOR = 'povix-legenda-motor';

/** O SHA-256 de uns bytes, em hexadecimal. */
export async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Os arquivos que ainda faltam no cache deste navegador. Sem Cache Storage (janela privada de alguns
 * navegadores), todos: cada vez se baixa de novo, e a página diz isso.
 */
export async function oQueFalta({ cachesApi = globalThis.caches } = {}) {
  const todos = [MOTOR, ...ARQUIVOS_MODELO];
  if (!cachesApi?.open) return todos;
  try {
    const [modelo, motor] = await Promise.all([cachesApi.open(CACHE_MODELO), cachesApi.open(CACHE_MOTOR)]);
    const tem = await Promise.all(todos.map((a) => (a === MOTOR ? motor : modelo).match(a.url).then(Boolean, () => false)));
    return todos.filter((_, i) => !tem[i]);
  } catch {
    return todos;
  }
}
