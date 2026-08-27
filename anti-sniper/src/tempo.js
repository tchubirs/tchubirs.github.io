'use strict';
/**
 * Interpretar "que horas foi".
 *
 * Nenhum streamer vai digitar um timestamp. Ele digita "22:47", ou "10 min
 * atrás", ou nada. E o fuso é onde isto silenciosamente dá errado: o serviço
 * roda em UTC, ele mora na França, e duas horas de diferença transformam
 * "estava na sua live" em "não estava" sem ninguém perceber.
 *
 * Por isso: o site manda o instante ABSOLUTO (o navegador sabe o fuso dele),
 * e o caminho por texto sempre devolve junto qual fuso foi usado, para um
 * fuso errado aparecer na cara em vez de mentir calado.
 */

/** Quanto o fuso está deslocado do UTC naquele instante (com horário de verão). */
function deslocamento(fuso, ms) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day,
    +p.hour % 24, +p.minute, +p.second);
  return comoUtc - (Math.floor(ms / 1000) * 1000);
}

/** O dia (ano, mês, dia) que é "hoje" naquele fuso. */
function hojeNoFuso(fuso, ms) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [a, m, d] = f.format(new Date(ms)).split('-').map(Number);
  return { a, m, d };
}

const RELATIVO = /^(?:h[áa]\s*)?(\d{1,4})\s*(?:m|min|minutos?)?(?:\s*atr[áa]s)?$/i;
const RELOGIO = /^(\d{1,2})\s*[:h.]\s*(\d{2})$/;

/**
 * @returns {number|null|undefined} instante em ms · null = não perguntou ·
 *          undefined = perguntou algo que não dá para entender
 */
function interpretarQuando(texto, agoraMs = Date.now(), fuso = 'UTC') {
  if (texto == null) return null;
  const t = String(texto).trim();
  if (!t) return null;
  if (/^(agora|now|j[áa])$/i.test(t)) return agoraMs;

  // Instante absoluto: é o que o site manda, e não tem como interpretar errado.
  if (/^\d{12,}$/.test(t)) return Number(t);

  const rel = t.match(RELATIVO);
  if (rel) {
    const min = Number(rel[1]);
    // "22" sem dois-pontos é ambíguo; 1440 min = um dia inteiro atrás já é
    // outra pergunta. Fora disso, número solto = minutos atrás.
    if (min > 1440) return undefined;
    return agoraMs - min * 60000;
  }

  const rl = t.match(RELOGIO);
  if (rl) {
    const [h, mi] = [Number(rl[1]), Number(rl[2])];
    if (h > 23 || mi > 59) return undefined;
    const { a, m, d } = hojeNoFuso(fuso, agoraMs);
    let alvo = Date.UTC(a, m - 1, d, h, mi);
    alvo -= deslocamento(fuso, alvo);
    // Live que virou a madrugada: "23:40" perguntado às 00:20 é ontem.
    if (alvo > agoraMs + 60000) alvo -= 24 * 3600 * 1000;
    return alvo;
  }

  // Só data de verdade. `Date.parse('99999')` devolve o ano 99999 sem
  // reclamar, e um horário inventado vira uma resposta confiante e errada.
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return undefined;
  const iso = Date.parse(t);
  return Number.isNaN(iso) ? undefined : iso;
}

/** Como mostrar um instante para quem perguntou, no fuso dele. */
function relogio(ms, fuso = 'UTC') {
  if (ms == null) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

module.exports = { interpretarQuando, relogio, deslocamento, hojeNoFuso };
