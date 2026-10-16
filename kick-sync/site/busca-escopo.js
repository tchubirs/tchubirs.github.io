export const PERFIS_BUSCA = ['chat', 'rapida', 'completa'];
const CHAVE_MEDIDAS = 'povix.buscaMedidas.v1';

export function segundosDoTrecho(texto) {
  const partes = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(String(texto).trim());
  return partes ? Number(partes[1]) * 3600 + Number(partes[2]) * 60 + Number(partes[3] || 0) : null;
}

export function relogioDoTrecho(segundos) {
  const n = Math.max(0, Math.floor(segundos));
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

export function transmissoesDaBusca(vods, agora = Date.now()) {
  return vods.filter((v) => Number.isFinite(v.inicioApi) && v.inicioApi < agora && v.master)
    .map((v) => ({ ...v, duracaoBuscaS: Math.floor((v.aoVivo ? agora - v.inicioApi : v.duracaoMs) / 1000) }))
    .filter((v) => Number.isFinite(v.duracaoBuscaS) && v.duracaoBuscaS > 0).sort((a, b) => b.inicioApi - a.inicioApi);
}

export function pedidoDaBusca({ vod, de, ate, inteira, perfil }) {
  if (!vod || !Number.isFinite(vod.inicioApi) || !Number.isFinite(vod.duracaoBuscaS)
    || !(vod.duracaoBuscaS > 0) || !PERFIS_BUSCA.includes(perfil)) return null;
  const deS = inteira ? 0 : segundosDoTrecho(de);
  const ateS = inteira ? vod.duracaoBuscaS : segundosDoTrecho(ate);
  if (deS == null || ateS == null || ateS <= deS || deS < 0 || ateS > vod.duracaoBuscaS) return null;
  return { vodId: String(vod.id), inicioApi: vod.inicioApi, deS, ateS, inteira: Boolean(inteira), perfil };
}

export function limitesDaBusca(pedido, linha, disponivel) {
  if (!pedido || !disponivel || !Number.isFinite(linha?.inicio)) return null;
  const deMs = pedido.inteira ? disponivel.deMs : Math.max(disponivel.deMs, linha.inicio + pedido.deS * 1000);
  const ateMs = pedido.inteira ? disponivel.ateMs : Math.min(disponivel.ateMs, linha.inicio + pedido.ateS * 1000);
  if (!(ateMs > deMs)) return null;
  return { deMs, ateMs };
}

export function mesmoPedido(a, b) {
  return Boolean(a && b && ['vodId', 'inicioApi', 'deS', 'ateS', 'inteira', 'perfil'].every((k) => a[k] === b[k]));
}

function medidasSalvas(armazem) {
  try {
    const lista = JSON.parse(armazem.getItem(CHAVE_MEDIDAS) || '[]');
    return Array.isArray(lista) ? lista.filter((m) => m && typeof m === 'object') : [];
  } catch { return []; }
}

export function guardarMedidaBusca(armazem, { slug, perfil, duracaoMs, decorridoMs, agora = Date.now() }) {
  if (!PERFIS_BUSCA.includes(perfil) || !Number.isFinite(duracaoMs) || !(duracaoMs > 0)
    || !Number.isFinite(decorridoMs) || !(decorridoMs >= 1000)) return;
  const medidas = medidasSalvas(armazem).slice(-19);
  medidas.push({ slug, perfil, duracaoMs, decorridoMs, em: agora });
  try { armazem.setItem(CHAVE_MEDIDAS, JSON.stringify(medidas)); } catch { /* a busca funciona sem histórico */ }
}

export function estimativaDaBusca(armazem, { slug, perfil, duracaoMs, agora = Date.now() }) {
  const medidas = medidasSalvas(armazem).filter((m) => m.slug === slug && m.perfil === perfil
    && agora - m.em >= 0 && agora - m.em < 7 * 86400_000
    && Number.isFinite(m.duracaoMs) && m.duracaoMs > 0 && Number.isFinite(m.decorridoMs) && m.decorridoMs >= 1000);
  if (!medidas.length || !(duracaoMs > 0)) return null;
  // Só compara trechos de tamanho semelhante no mesmo canal/aparelho; densidade de chat ainda varia.
  const parecidas = medidas.filter((m) => duracaoMs >= m.duracaoMs / 4 && duracaoMs <= m.duracaoMs * 4);
  if (!parecidas.length) return null;
  const tempos = parecidas.map((m) => m.decorridoMs * duracaoMs / m.duracaoMs).sort((a, b) => a - b);
  return { minimoMs: tempos[0] * 0.5, maximoMs: tempos.at(-1) * 2, amostras: tempos.length };
}
