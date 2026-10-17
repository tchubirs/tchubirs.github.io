// O detector de rosto do 9:16, num Worker que é um arquivo nosso (como o da legenda).
//
// Arquivo e não blob: um Worker de blob herda a política de segurança da página, que não deixa
// compilar WebAssembly; um Worker de arquivo tem a política da resposta dele.
//
// O MediaPipe (tasks-vision 1.0.1), o motor e o modelo vêm de fora numa versão fixa, e cada arquivo é
// conferido pelo tamanho e pelo SHA-256 antes de ser usado (ver rosto-arquivos.js). O código só vira
// módulo depois de conferido, por um endereço `blob:` com exatamente esses bytes; o modelo entra em
// bytes, sem o MediaPipe ir buscá-lo a lado nenhum.
//
// A conversa com a página:
//   recebe { tipo: 'detectar', id, imagem: ImageBitmap }
//   manda  { tipo: 'baixar', feito, total }           a cada pedaço baixado (só da primeira vez)
//          { tipo: 'pronto', id, rostos }             rostos: [{ x, y, largura, altura, nota }] em pixels da imagem
//          { tipo: 'erro', id, nome, mensagem }

import { TODOS, BYTES_TOTAL, CACHE_ROSTO, sha256 } from './rosto-arquivos.js?v=72807425b4';

const feitoPor = new Map();
function avisar(alvo, feito) {
  feitoPor.set(alvo.url, feito);
  let soma = 0;
  for (const v of feitoPor.values()) soma += v;
  postMessage({ tipo: 'baixar', feito: soma, total: BYTES_TOTAL });
}

/** Baixar um arquivo da lista e recusá-lo se o tamanho ou a impressão digital não baterem. */
async function baixar(alvo) {
  const r = await fetch(alvo.url, { credentials: 'omit' });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { name: 'REDE' });
  const leitor = r.body.getReader();
  const bytes = new Uint8Array(alvo.bytes);
  let feito = 0;
  let avisado = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (feito + value.length > bytes.length) throw Object.assign(new Error('maior do que devia'), { name: 'INTEGRIDADE' });
    bytes.set(value, feito);
    feito += value.length;
    if (feito - avisado > 512 * 1024 || feito === bytes.length) { avisado = feito; avisar(alvo, feito); }
  }
  if (feito !== alvo.bytes || (await sha256(bytes)) !== alvo.sha256) {
    throw Object.assign(new Error('o arquivo baixado não é o esperado'), { name: 'INTEGRIDADE' });
  }
  return bytes;
}

/** Um arquivo da lista: do cache, ou baixado e conferido. Conferido outra vez ao sair do cache. */
async function guardado(alvo) {
  let cache = null;
  try { cache = await caches.open(CACHE_ROSTO); } catch { /* sem Cache Storage: baixa-se sempre */ }
  const r = await cache?.match(alvo.url);
  if (r) {
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length === alvo.bytes && (await sha256(bytes)) === alvo.sha256) { avisar(alvo, alvo.bytes); return bytes; }
    try { await cache.delete(alvo.url); } catch { /* fica, e baixa-se de novo */ }
  }
  const bytes = await baixar(alvo);
  try { await cache?.put(alvo.url, new Response(bytes)); } catch { /* sem espaço: fica só para esta vez */ }
  return bytes;
}

// O motor escreve na consola de erros coisas que não são erros ("INFO: Created TensorFlow Lite XNNPACK
// delegate", avisos do OpenGL). Calam-se essas; um erro a sério continua a aparecer.
const errorDaConsola = console.error.bind(console);
console.error = (...args) => {
  if (/^(INFO:|[IW]\d{4} )/.test(String(args[0] ?? ''))) return;
  errorDaConsola(...args);
};

const urlDe = (bytes, tipo) => URL.createObjectURL(new Blob([bytes], { type: tipo }));

let aberto = null;
function abrir() {
  if (aberto) return aberto;
  aberto = (async () => {
    // Os quatro ao mesmo tempo: o motor é o grande, e os outros chegam enquanto ele desce.
    const [codigo, carregador, motor, modelo] = await Promise.all(TODOS.map(guardado));
    const urlCodigo = urlDe(codigo, 'text/javascript');
    let visao;
    try { visao = await import(urlCodigo); } finally { URL.revokeObjectURL(urlCodigo); }
    // O carregador e o motor ficam vivos enquanto o MediaPipe os lê; depois saem.
    const urlCarregador = urlDe(carregador, 'text/javascript');
    const urlMotor = urlDe(motor, 'application/wasm');
    try {
      return await visao.FaceDetector.createFromOptions(
        { wasmLoaderPath: urlCarregador, wasmBinaryPath: urlMotor },
        {
          // O processador e não a placa: dentro de um Worker a placa nem sempre existe, e para uns
          // quadros parados o processador chega e sobra.
          baseOptions: { modelAssetBuffer: modelo, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
          minSuppressionThreshold: 0.3,
        },
      );
    } finally {
      URL.revokeObjectURL(urlCarregador);
      URL.revokeObjectURL(urlMotor);
    }
  })();
  // Uma falha (a rede caiu) não fica guardada: o próximo pedido tenta de novo.
  aberto.catch(() => { aberto = null; });
  return aberto;
}

// Um pedido de cada vez: o detector do MediaPipe não é para chamadas em paralelo.
let fila = Promise.resolve();

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.tipo !== 'detectar') return;
  fila = fila.then(async () => {
    try {
      const detector = await abrir();
      const { detections = [] } = detector.detect(m.imagem) || {};
      const rostos = detections.map((d) => ({
        x: d.boundingBox?.originX ?? 0,
        y: d.boundingBox?.originY ?? 0,
        largura: d.boundingBox?.width ?? 0,
        altura: d.boundingBox?.height ?? 0,
        nota: d.categories?.[0]?.score ?? 0,
      })).filter((r) => r.largura > 0 && r.altura > 0);
      postMessage({ tipo: 'pronto', id: m.id, rostos });
    } catch (e) {
      postMessage({ tipo: 'erro', id: m.id, nome: e?.name || 'Error', mensagem: String(e?.message || e) });
    } finally {
      m.imagem?.close?.();
    }
  });
};
