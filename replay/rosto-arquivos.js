// Os arquivos do detector de rosto do 9:16, com o tamanho e a impressão digital de cada um.
//
// Como os da legenda (legenda-arquivos.js): nada disto está no repositório. O código minificado do
// MediaPipe é do tipo que a proteção de segredos do GitHub já recusou num push, e o motor tem 11 MB.
// Tudo vem de fora, numa versão fixa, e só quando alguém pede a webcam achada sozinha:
//
//  - o código do @mediapipe/tasks-vision 1.0.1 (Apache-2.0) do jsDelivr, igual byte a byte ao pacote
//    do npm (o jsDelivr publica o SHA-256 de cada arquivo, e bate com o daqui);
//  - o carregador e o motor (WebAssembly) do mesmo pacote, na variante de módulo, que é a que se pode
//    importar dentro de um Worker de módulo;
//  - o modelo BlazeFace de curto alcance do Google, no caminho com a versão (`float16/1`), e não no
//    `latest`, que pode mudar.
//
// Cada arquivo só é aceito se o tamanho e o SHA-256 baterem com os daqui. Os números foram tirados em
// 12/10/2026 dos próprios arquivos. O navegador guarda tudo (Cache Storage): da segunda vez não se
// baixa nada.

export const VERSAO = '1.0.1';
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSAO}/`;

/** O código (o `vision_bundle.mjs` do pacote). */
export const CODIGO = Object.freeze({
  url: `${BASE}vision_bundle.mjs`,
  sha256: 'd885630c297c0b20b1fe86096cb06291c4c8080876f27852e724f24ac603713f',
  bytes: 155439,
});

/** O carregador do motor, em módulo: põe o `ModuleFactory` no global quando é importado. */
export const CARREGADOR = Object.freeze({
  url: `${BASE}wasm/vision_wasm_module_internal.js`,
  sha256: 'da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d',
  bytes: 323415,
});

/** O motor, com SIMD (todos os navegadores de hoje o têm). */
export const MOTOR = Object.freeze({
  url: `${BASE}wasm/vision_wasm_module_internal.wasm`,
  sha256: '2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b',
  bytes: 11756972,
});

/** O modelo: o BlazeFace de curto alcance, o do detector de rosto do MediaPipe. */
export const MODELO = Object.freeze({
  url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  sha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
  bytes: 229746,
});

export const TODOS = Object.freeze([CODIGO, CARREGADOR, MOTOR, MODELO]);

/** Quanto se baixa da primeira vez (uns 12 MB). */
export const BYTES_TOTAL = TODOS.reduce((s, a) => s + a.bytes, 0);

/** Onde o navegador guarda os quatro. */
export const CACHE_ROSTO = 'povix-rosto';

/** O SHA-256 de uns bytes, em hexadecimal. */
export async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}
