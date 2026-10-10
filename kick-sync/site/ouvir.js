// A conta da detecção mais rápida, sem rede e sem página: onde ouvir primeiro (em volta dos picos do
// chat), o que falta ouvir (o que já se ouviu não se baixa outra vez), quando avisar antes de começar
// e quanto tempo falta.
//
// O dono, 10/10: "Ouvindo kodd: 1/121, 0 MB". Eram 121 bocados de 5 min (10 h de live), uns 8 MB cada
// mesmo a 160p, baixados um por vez e sem dizer quanto faltava.

/** A partir daqui o modo esperto entra: menos do que isto ouve-se tudo direto. */
export const ESPERTO_A_PARTIR_MS = 30 * 60_000;
// Em volta de cada pico: o lance vem antes da reacção do chat, por isso mais antes do que depois.
export const ANTES_DO_PICO_MS = 3 * 60_000;
export const DEPOIS_DO_PICO_MS = 60_000;
// Quando é muito: avisar antes de começar, com as horas e os megas.
export const MUITO_MS = 2 * 3600_000;
export const MUITO_MB = 300;
// O degrau mais barato da Kick anda nos ~280 kbps reais (o mesmo número de `custoVarrerMB`).
const BYTES_POR_MS = 280_000 / 8 / 1000;

/** Juntar intervalos que se tocam ou se sobrepõem, por ordem. */
export function juntar(lista) {
  const ord = lista.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]);
  const saida = [];
  for (const [a, b] of ord) {
    const ultimo = saida.at(-1);
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else saida.push([a, b]);
  }
  return saida;
}

/** O que de `[deMs, ateMs]` ainda não está em `ouvidos`. */
export function faltaOuvir(deMs, ateMs, ouvidos = []) {
  const falta = [];
  let de = deMs;
  for (const [a, b] of juntar(ouvidos)) {
    if (b <= de) continue;
    if (a >= ateMs) break;
    if (a > de) falta.push([de, a]);
    de = Math.max(de, b);
    if (de >= ateMs) break;
  }
  if (de < ateMs) falta.push([de, ateMs]);
  return falta;
}

/** Quanto tempo de `intervalos` ainda não foi ouvido. */
export function msPorOuvir(intervalos, ouvidos = []) {
  let n = 0;
  for (const [a, b] of juntar(intervalos)) for (const [x, y] of faltaOuvir(a, b, ouvidos)) n += y - x;
  return n;
}

/** Soma do tempo de uma lista de intervalos (juntos primeiro, para nada contar duas vezes). */
export const somaMs = (lista) => juntar(lista).reduce((s, [a, b]) => s + (b - a), 0);

/**
 * Os minutos em volta de cada pico do chat, dentro de `[deMs, ateMs]`, juntos quando se tocam. Os
 * picos são os instantes em que o chat reagiu (o `ms` das marcas do chat).
 */
export function janelasDosPicos(picos, deMs, ateMs, { antesMs = ANTES_DO_PICO_MS, depoisMs = DEPOIS_DO_PICO_MS } = {}) {
  return juntar(picos
    .map((p) => (typeof p === 'number' ? p : p.ms))
    .filter((ms) => Number.isFinite(ms) && ms >= deMs - depoisMs && ms < ateMs + antesMs)
    .map((ms) => [Math.max(deMs, ms - antesMs), Math.min(ateMs, ms + depoisMs)]));
}

/** É muito para começar sem perguntar? */
export const eMuito = (ms, mb) => ms > MUITO_MS || mb > MUITO_MB;

/**
 * Quanto falta, pela velocidade medida desde o começo. `feitoMs` é o tempo de live ouvido nesta
 * corrida (sem o que veio da memória), e os bytes contam o que já chegou dos bocados a meio. Sem
 * medida que chegue (os primeiros segundos), não diz nada: um número inventado é pior que nenhum.
 */
export function estimarFalta({ feitoMs = 0, restoMs = 0, bytes = 0, decorridoMs = 0 } = {}) {
  if (restoMs <= 0) return 0;
  const andado = Math.max(feitoMs, bytes / BYTES_POR_MS);
  if (decorridoMs < 3000 || andado <= 0) return null;
  return Math.round(restoMs / (andado / decorridoMs));
}

/** "uns 12 min", "uns 2 h 10": arredondado como se diz, nunca menos de um minuto. */
export function tempoFalta(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${String(resto).padStart(2, '0')}` : `${h} h`;
}
