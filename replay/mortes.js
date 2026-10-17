// As mortes do servidor de Rust como marcas no mapa (IDEIAS.md, item 1).
//
// O servidor já sabe quem matou quem e quando. Os plugins mais usados escrevem isso em texto:
//  - DeathNotes (umod, Terceran/Mr. Blue, 6.5.8): no chat do jogo, com "[DeathNotes]" à frente, e no
//    console do servidor (Puts), com "[Death Notes]". As frases de omissão entre dois jogadores são
//    "{killer} shot {victim} using their {weapon} over a distance of {distance}." e outras parecidas;
//    a distância sai "45.3 meters" (ou "feet", "yards"). O log do Oxide põe a hora à frente.
//  - Discord Death (umod, MJSU, 2.2.1): manda a frase do DeathNotes para um canal do Discord, entre
//    ":crossed_swords:", com campos por baixo ("Victim", "Attacker", "Weapon", "Distance").
//  - Rustcord (umod, 3.4.3): ":skull_crossbones: {killer} killed {victim}." no modo simples, a frase do
//    DeathNotes no modo DeathNotes, e um quadro "PLAYER DEATH" com os campos "Victim" e "Killer".
// Copiado do Discord, cada mensagem traz a hora como o Discord a mostra a quem copiou: "Today at
// 21:14", "Hoje às 21:14", "— 12/10/2026 21:14", e "[21:15]" nas mensagens seguidas do mesmo autor.
// Só minutos: o segundo da morte acerta-se com uma morte vista num POV (o deslocamento de todas).
//
// E uma forma simples para quem escreve à mão ou converte outro log: "21:14:07 fulano killed ciclano
// (AK, 45 m)".
//
// Nada aqui toca na página: os testes correm no Node.

import { base } from './nomes.js?v=416b31dcde';

const DIA_MS = 86400e3;
const HORA_MS = 3600e3;

// ── ler o texto ─────────────────────────────────────────────────────────

/** Tirar a marcação do Rust (<color=...>), os emojis das pontas e os escapes do Discord. */
function limparLinha(s) {
  return String(s ?? '')
    .replace(/<\/?(?:color|size|b|i)(?:=[^>]*)?>/gi, '')
    .replace(/\\([_*~`|\\])/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/^(?:\s|:[a-z_]+:|[\p{Extended_Pictographic}️‍])+/u, '')
    .replace(/(?:\s|:[a-z_]+:|[\p{Extended_Pictographic}️‍])+$/u, '')
    .trim();
}

/** "9", "14", "PM" -> 21:14. Devolve null numa hora que não existe. */
function hora24(h, m, s, ampm) {
  let hh = Number(h);
  const mm = Number(m);
  const ss = s == null || s === '' ? null : Number(s);
  if (ampm) {
    const pm = /^p/i.test(ampm.replace(/[\s.]/g, ''));
    if (hh < 1 || hh > 12) return null;
    hh = (hh % 12) + (pm ? 12 : 0);
  }
  if (hh > 23 || mm > 59 || (ss != null && ss > 59)) return null;
  return { h: hh, m: mm, s: ss };
}

const AMPM = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';
// A hora no começo da linha: ISO, data e hora entre [] (DiscordChatExporter), só a hora entre [] (as
// mensagens seguidas no Discord), ou só a hora solta (o log do Oxide e a forma simples).
const RE_ISO = /^\[?(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(Z|[+-]\d{2}:?\d{2})?\]?\s*(?:[:|-]\s+)?/i;
const RE_DATA_HORA = new RegExp(`^\\[(\\d{1,2})[/.](\\d{1,2})[/.](\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*${AMPM}?\\]\\s*`, 'i');
const RE_HORA_COLCHETE = new RegExp(`^\\[(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*${AMPM}?\\]\\s*`, 'i');
const RE_HORA = new RegExp(`^(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*${AMPM}?(?:\\s*[-|]\\s*|\\s+)`, 'i');
// O cabeçalho de uma mensagem do Discord: "Rustcord — Today at 21:14", " — 12/10/2026 9:14 PM".
const RE_CAB_REL = new RegExp(`(?:^|[\\s—–-])(today at|yesterday at|hoje [àa]s|ontem [àa]s|hoy a las|ayer a las)\\s+(\\d{1,2}):(\\d{2})\\s*${AMPM}?\\s*$`, 'i');
const RE_CAB_DATA = new RegExp(`(?:^|\\s)[—–-]\\s*(\\d{1,2})[/.](\\d{1,2})[/.](\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})\\s*${AMPM}?\\s*$`, 'i');
// O rodapé de um quadro do Rustcord: "Rustcord 3.4.3 • Today at 21:14".
const RE_RODAPE = /•\s*(.+)$/;

// Os campos dos quadros do Discord Death e do Rustcord: o nome numa linha, o valor na seguinte.
const CAMPOS = new Map([
  ['victim', 'vitima'], ['attacker', 'matador'], ['killer', 'matador'], ['weapon', 'arma'], ['distance', 'distancia'],
  ['victim type', null], ['attacker type', null], ['body part', null], ['attacker health', null], ['entity owner', null],
]);
const SO_DISCORD = /^(?:app|bot|bot verificado|verified bot|aplicativo|aplicación|player death|new|novo|nuevo)$/i;

/** Uma data d/m/a ou m/d/a, com o ano de dois algarismos tornado inteiro. */
function dataDe(a, b, ano, ordem) {
  const [d, m] = ordem === 'md' ? [Number(b), Number(a)] : [Number(a), Number(b)];
  let y = Number(ano);
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A distância em metros, de "45.3 meters", "45,3m", "148 feet", "50 yards". */
export function metros(texto) {
  const r = /([\d]+(?:[.,]\d+)?)\s*(m\b|meters?|metros?|feet|foot|ft|yards?|yd)?/i.exec(String(texto ?? ''));
  if (!r) return null;
  const n = Number(r[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const u = (r[2] || 'm').toLowerCase();
  if (/^(feet|foot|ft)$/.test(u)) return Math.round(n * 0.3048 * 10) / 10;
  if (/^(yards?|yd)$/.test(u)) return Math.round(n * 0.9144 * 10) / 10;
  return n;
}

// As frases. A ordem importa: as com "using their" antes da "killed" solta.
const DIST = '([\\d.,]+\\s*(?:meters?|meter|feet|foot|yards?|yard|m))';
const FRASES = [
  // DeathNotes, jogador contra jogador (as frases de omissão do plugin).
  { re: new RegExp(`^(.+?) shot (.+?) using their (.+?) over a distance of ${DIST}\\.?$`, 'i'), k: 1, v: 2, a: 3, d: 4 },
  { re: new RegExp(`^(.+?) was shot by (.+?) with their (.+?) over a distance of ${DIST}\\.?$`, 'i'), k: 2, v: 1, a: 3, d: 4 },
  { re: /^(.+?) inflamed (.+?) with their (.+?)\.?$/i, k: 1, v: 2, a: 3 },
  { re: /^(.+?) slashed (.+?) into pieces with their (.+?)\.?$/i, k: 1, v: 2, a: 3 },
  { re: /^(.+?) died due to damage deflection while attempting to murder (.+?)\.?$/i, k: 2, v: 1 },
  { re: new RegExp(`^(.+?) killed (.+?) (?:using|with) (?:their |a |an )?(.+?)(?: over a distance of ${DIST})?\\.?$`, 'i'), k: 1, v: 2, a: 3, d: 4 },
  // Rustcord simples e a forma simples: "fulano killed ciclano." e "fulano killed ciclano (AK, 45 m)".
  { re: /^(.+?) killed (.+?)(?:\s*\(([^()]*)\))?\.?$/i, k: 1, v: 2, p: 3 },
  // A mesma forma simples em português e espanhol.
  { re: /^(.+?) matou (.+?)(?:\s*\(([^()]*)\))?\.?$/i, k: 1, v: 2, p: 3 },
  { re: /^(.+?) mat[óo] a (.+?)(?:\s*\(([^()]*)\))?\.?$/i, k: 1, v: 2, p: 3 },
];

// Quem não é jogador: o DeathNotes escreve "a Boar", "the Bradley APC", "a Scientist".
const NPC = /^(?:a|an|the)\s/i;

/** Um nome lido: sem o SteamID que o Discord Death põe a seguir, "Zeca(7656119...)". */
export function limparNome(s) {
  return String(s ?? '').replace(/\s*\(\d{15,20}\)\s*$/, '').replace(/^["'“”]+|["'“”]+$/g, '').trim();
}

/** A frase de uma morte, ou null. Devolve { matador, vitima, arma, distancia } ou { npc: true }. */
export function lerFrase(texto) {
  const corpo = limparLinha(texto)
    // O que vem antes da frase no chat e no console: "[DeathNotes]", "[Death Notes]", "[Info]", "[CHAT] SERVER".
    .replace(/^(?:\[(?:info|warning|chat)\]\s*)+/i, '')
    .replace(/^(?:SERVER\s*:?\s*)?\[?death\s?notes\]?\s*:?\s*/i, '')
    .trim();
  for (const f of FRASES) {
    const r = f.re.exec(corpo);
    if (!r) continue;
    const matador = limparNome(r[f.k]);
    const vitima = limparNome(r[f.v]);
    if (!matador || !vitima || matador.length > 64 || vitima.length > 64) continue;
    if (NPC.test(matador) || NPC.test(vitima)) return { npc: true };
    let arma = f.a ? (r[f.a] || '').trim() || null : null;
    let distancia = f.d && r[f.d] ? metros(r[f.d]) : null;
    if (f.p && r[f.p]) {
      const partes = r[f.p].split(',').map((x) => x.trim()).filter(Boolean);
      for (const p of partes) {
        if (/^\d/.test(p) && metros(p) != null && distancia == null) distancia = metros(p);
        else if (!arma) arma = p;
      }
    }
    return { matador, vitima, arma, distancia };
  }
  return null;
}

/** O começo de linha com hora: { hora, resto } ou null. */
function horaNoComeco(linha, ordem) {
  let r = RE_ISO.exec(linha);
  if (r) {
    const h = hora24(r[4], r[5], r[6]);
    if (!h) return null;
    const data = `${r[1]}-${r[2]}-${r[3]}`;
    let absMs = null;
    if (r[7]) {
      const z = r[7].toUpperCase() === 'Z' ? 0 : (r[7][0] === '-' ? -1 : 1) * (Number(r[7].slice(1, 3)) * 60 + Number(r[7].slice(-2)));
      absMs = Date.UTC(Number(r[1]), Number(r[2]) - 1, Number(r[3]), h.h, h.m, h.s ?? 0) - z * 60_000;
    }
    return { hora: { data, ...h, absMs }, resto: linha.slice(r[0].length) };
  }
  r = RE_DATA_HORA.exec(linha);
  if (r) {
    const h = hora24(r[4], r[5], r[6], r[7]);
    const data = dataDe(r[1], r[2], r[3], ordem);
    if (!h || !data) return null;
    return { hora: { data, ...h }, resto: linha.slice(r[0].length) };
  }
  r = RE_HORA_COLCHETE.exec(linha) || RE_HORA.exec(linha);
  if (r) {
    const h = hora24(r[1], r[2], r[3], r[4]);
    if (!h) return null;
    return { hora: { data: null, ...h }, resto: linha.slice(r[0].length) };
  }
  return null;
}

/** Um cabeçalho de mensagem do Discord: a hora dele, ou null. */
function cabecalho(linha, ordem) {
  let r = RE_CAB_REL.exec(linha);
  if (r) {
    const h = hora24(r[2], r[3], null, r[4]);
    if (!h) return null;
    return { data: null, rel: /^(yesterday|ontem|ayer)/i.test(r[1]) ? 'ontem' : 'hoje', ...h };
  }
  r = RE_CAB_DATA.exec(linha);
  if (r) {
    const h = hora24(r[4], r[5], null, r[6]);
    const data = dataDe(r[1], r[2], r[3], ordem);
    if (!h || !data) return null;
    return { data, ...h };
  }
  return null;
}

/**
 * Se as datas do texto são dia/mês ou mês/dia. Um número acima de 12 decide; sem nenhum, o idioma de
 * quem copiou (o Discord em inglês dos EUA escreve mês/dia).
 */
export function ordemDasDatas(texto, idioma = 'pt') {
  for (const r of String(texto ?? '').matchAll(/(?:^|[\s[—–-])(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    if (Number(r[1]) > 12) return 'dm';
    if (Number(r[2]) > 12) return 'md';
  }
  return /^en/i.test(idioma) ? 'md' : 'dm';
}

/**
 * Ler o texto colado (ou o arquivo). Devolve:
 *  - mortes: [{ matador, vitima, arma, distancia, hora: { data, rel, h, m, s, absMs }, linha, texto }]
 *  - naoLidas: [{ linha, texto, motivo }], cada linha que não virou morte, com o motivo: 'npc' (morte
 *    de bicho ou NPC), 'semHora' (a frase sem hora nenhuma antes) ou 'desconhecida'.
 * As linhas em branco e o que é só do Discord (o nome do bot, "APP", os títulos dos campos) não entram
 * em nenhuma das listas; tudo o resto entra numa delas.
 */
export function lerMortes(texto, { idioma = 'pt' } = {}) {
  const ordem = ordemDasDatas(texto, idioma);
  const linhas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const mortes = [];
  const naoLidas = [];
  // A mensagem do Discord em curso: a hora do cabeçalho e os campos do quadro.
  let msg = { hora: null, herda: false, campos: {}, mortes: [], linhas: [] };
  const fecharMsg = () => {
    const c = msg.campos;
    if (!msg.mortes.length && c.matador && c.vitima) {
      if (msg.hora) {
        mortes.push({
          matador: limparNome(c.matador), vitima: limparNome(c.vitima), arma: c.arma || null,
          distancia: c.distancia != null ? metros(c.distancia) : null, hora: msg.hora, linha: msg.linhas[0], texto: `${c.matador} -> ${c.vitima}`,
        });
      } else naoLidas.push({ linha: msg.linhas[0], texto: `${c.matador} -> ${c.vitima}`, motivo: 'semHora' });
    } else {
      for (const m of msg.mortes) {
        if (!m.arma && c.arma) m.arma = c.arma.replace(/\s*\([^)]*\)\s*$/, '') || null;
        if (m.distancia == null && c.distancia) m.distancia = metros(c.distancia);
      }
    }
    msg = { hora: null, herda: false, campos: {}, mortes: [], linhas: [] };
  };
  for (let i = 0; i < linhas.length; i++) {
    const n = i + 1;
    const cru = linhas[i];
    const linha = limparLinha(cru);
    if (!linha) continue;
    // O nome do bot e o selo "APP" que o Discord copia por cima de cada mensagem.
    if (SO_DISCORD.test(linha)) continue;
    const proxima = limparLinha(linhas[i + 1] ?? '');
    const cab = cabecalho(linha, ordem);
    if (cab && !lerFrase(linha)) {
      // O rodapé do Rustcord dá a hora à mensagem que ainda não a tem; um cabeçalho abre outra.
      if (RE_RODAPE.test(linha) && !msg.hora && (msg.mortes.length || Object.keys(msg.campos).length)) {
        msg.hora = cab;
        for (const m of msg.mortes) if (!m.temHora) m.hora = cab;
        continue;
      }
      fecharMsg();
      msg.hora = cab;
      msg.herda = true;
      continue;
    }
    // O autor por cima do cabeçalho ("Rustcord", e a seguir " — Today at 21:14" ou "APP").
    if (linha.length <= 40 && (SO_DISCORD.test(proxima) || cabecalho(proxima, ordem))
      && !lerFrase(linha) && !horaNoComeco(linha, ordem) && !CAMPOS.has(linha.toLowerCase())) continue;
    // Um campo do quadro: o título nesta linha, o valor na seguinte.
    const campo = CAMPOS.get(linha.toLowerCase());
    if (campo !== undefined && proxima) {
      if (campo) msg.campos[campo] = proxima;
      msg.linhas.push(n);
      i++;
      continue;
    }
    const comHora = horaNoComeco(linha, ordem);
    let hora = msg.hora;
    let resto = linha;
    if (comHora) {
      // "[21:15] ..." é outra mensagem do mesmo autor; com data, uma linha de log.
      fecharMsg();
      hora = comHora.hora.data == null && msg.hora?.data ? { ...comHora.hora, data: msg.hora.data } : comHora.hora;
      msg.hora = hora;
      resto = comHora.resto;
      // Só a hora na linha ("[21:15]" do Discord) vale para as linhas de baixo; a hora de uma linha de
      // log é só dela, e a linha seguinte sem hora fica sem hora.
      msg.herda = !limparLinha(resto);
    } else if (!msg.herda) hora = null;
    msg.linhas.push(n);
    const f = lerFrase(resto);
    if (!f) {
      // Uma linha só com a hora e o resto vazio era o cabeçalho de outra forma de copiar.
      if (comHora && !limparLinha(resto)) continue;
      naoLidas.push({ linha: n, texto: cru.trim(), motivo: 'desconhecida' });
      continue;
    }
    if (f.npc) { naoLidas.push({ linha: n, texto: cru.trim(), motivo: 'npc' }); continue; }
    if (!hora) {
      // A hora pode vir depois, no rodapé do quadro.
      const m = { ...f, hora: null, linha: n, texto: cru.trim() };
      msg.mortes.push(m);
      mortes.push(m);
      continue;
    }
    const m = { ...f, hora, temHora: true, linha: n, texto: cru.trim() };
    msg.mortes.push(m);
    mortes.push(m);
  }
  fecharMsg();
  const comHora = [];
  for (const m of mortes) {
    delete m.temHora;
    if (m.hora) comHora.push(m);
    else naoLidas.push({ linha: m.linha, texto: m.texto, motivo: 'semHora' });
  }
  naoLidas.sort((a, b) => a.linha - b.linha);
  // Tudo o que sai daqui foi lido do registro do servidor (DeathNotes, Discord Death, Rustcord, ou a linha simples
  // colada): a proveniência é 'servidor' por construção do leitor, não por suposição de quem chama.
  return { mortes: comHora.map((m) => ({ ...m, fonte: 'servidor' })), naoLidas };
}

// ── a hora do servidor na hora dos vídeos ───────────────────────────────

/** O deslocamento de um fuso (minutos a leste do UTC) num instante, a partir do do aparelho. */
export const fusoDoAparelho = (ms = Date.now()) => -new Date(ms).getTimezoneOffset();

/**
 * O instante de cada morte, no relógio dos vídeos.
 *
 * `fusoMin`: o fuso em que o texto escreve as horas (minutos a leste do UTC). O Discord mostra a hora de
 * quem copiou, por isso o do aparelho costuma acertar; o log do servidor está na hora do servidor.
 * `refMs`: o começo do evento. Uma hora sem data cai no dia dele, e passa ao dia seguinte quando a hora
 * volta para trás mais de 6 h (a noite passou da meia-noite); "Yesterday at" e "Today at" são do dia de
 * quem copiou, que ninguém sabe, e por isso valem como uma hora sem data.
 * `ajusteMs`: o que "alinhar com uma morte vista" mediu, somado a todas.
 */
export function horasDasMortes(mortes, { fusoMin = 0, refMs = Date.now(), ajusteMs = 0 } = {}) {
  const fusoMs = fusoMin * 60_000;
  let dia = Math.floor((refMs + fusoMs) / DIA_MS) * DIA_MS;
  let antes = null;
  return (mortes || []).map((m) => {
    const h = m.hora || {};
    const relogio = ((h.h || 0) * 60 + (h.m || 0)) * 60_000 + (h.s || 0) * 1000;
    let ms;
    if (Number.isFinite(h.absMs)) ms = h.absMs;
    else if (h.data) {
      const [y, mo, d] = h.data.split('-').map(Number);
      ms = Date.UTC(y, mo - 1, d) + relogio - fusoMs;
    } else {
      ms = dia + relogio - fusoMs;
      if (antes == null && ms < refMs - HORA_MS) { dia += DIA_MS; ms += DIA_MS; }
      if (antes != null && ms < antes - 6 * HORA_MS) { dia += DIA_MS; ms += DIA_MS; }
    }
    antes = ms;
    // As achadas no vídeo (achar-mortes.js) já estão no relógio dos vídeos: nem fuso nem alinhamento.
    if (m.origem === 'video') return { ...m, ms, soMinuto: false };
    return { ...m, ms: ms + (Number.isFinite(ajusteMs) ? ajusteMs : 0), soMinuto: h.s == null };
  });
}

// ── os nomes do jogo nos canais ─────────────────────────────────────────

/** As formas de um nome a comparar: inteiro, e sem a tag do clã ("[ABS] Newt" -> "Newt"). */
function formas(nome) {
  const s = String(nome ?? '');
  const sem = s.replace(/[[({<][^\])}>]*[\])}>]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...new Set([base(s), base(sem)])].filter((x) => x.length >= 2);
}

/**
 * O canal de um nome do jogo: igual (sem maiúsculas, acentos nem símbolos) ao canal ou a um apelido
 * dele, guardado neste aparelho. Dois canais com o mesmo nome não decidem nada: fica sem canal.
 * `apelidos` é um Map canal -> [apelido], o mesmo do "Achar o time pelos nomes na tela".
 */
export function canalDoNome(nome, canais, apelidos = new Map()) {
  const quer = formas(nome);
  if (!quer.length) return null;
  const achados = new Set();
  for (const c of canais || []) {
    const alvos = [c, ...(apelidos.get(c) || [])].flatMap(formas);
    if (alvos.some((a) => quer.includes(a))) achados.add(c);
  }
  return achados.size === 1 ? [...achados][0] : null;
}

/** As mortes com o canal de quem matou e de quem morreu (null quando o nome não casa). */
export function casarMortes(mortes, canais, apelidos = new Map()) {
  const cache = new Map();
  const de = (n) => {
    if (!cache.has(n)) cache.set(n, canalDoNome(n, canais, apelidos));
    return cache.get(n);
  };
  return (mortes || []).map((m) => {
    const canalVitima = de(m.vitima);
    let canalMatador = de(m.matador);
    // Na tela de morte, o próprio nome é quem se matou (o F1 kill, uma queda): não é uma kill.
    if (m.origem === 'video' && canalMatador === canalVitima) canalMatador = null;
    return { ...m, canalMatador, canalVitima };
  });
}

/** Os nomes que não casaram com canal nenhum, com quantas vezes aparecem, os mais vistos primeiro. */
export function nomesSemCanal(casadas) {
  const conta = new Map();
  for (const m of casadas || []) {
    // Uma morte achada no vídeo sem o nome de quem matou não tem nome nenhum para casar.
    if (!m.canalMatador && m.matador) conta.set(m.matador, (conta.get(m.matador) || 0) + 1);
    if (!m.canalVitima && m.vitima) conta.set(m.vitima, (conta.get(m.vitima) || 0) + 1);
  }
  return [...conta].map(([nome, vezes]) => ({ nome, vezes })).sort((a, b) => b.vezes - a.vezes || a.nome.localeCompare(b.nome));
}

/**
 * As marcas do mapa: Map canal -> [{ tipo: 'morte', ms, id, papel }], uma na faixa de quem matou e
 * outra na de quem morreu. `fora(canal, ms)` diz que o canal estava noutro jogo nesse instante: aí a
 * marca não entra (o filtro do jogo do evento). A de quem matou vai para `msMatador` quando o tiro dele
 * o disse (achar-mortes.js, `confirmarPeloTiro`).
 */
export function marcasDasMortes(casadas, { fora = () => false } = {}) {
  const marcas = new Map();
  const por = (canal, m, papel) => {
    const ms = papel === 'matou' && Number.isFinite(m.msMatador) ? m.msMatador : m.ms;
    if (!canal || fora(canal, ms)) return;
    if (!marcas.has(canal)) marcas.set(canal, []);
    marcas.get(canal).push({ tipo: 'morte', ms, id: m.id, papel });
  };
  for (const m of casadas || []) {
    if (!Number.isFinite(m.ms)) continue;
    por(m.canalMatador, m, 'matou');
    if (m.canalVitima !== m.canalMatador) por(m.canalVitima, m, 'morreu');
  }
  for (const l of marcas.values()) l.sort((a, b) => a.ms - b.ms);
  return marcas;
}

/** Juntar mortes novas às guardadas sem repetir (o mesmo par na mesma hora), com um id novo cada uma. */
export function juntarMortes(guardadas, novas) {
  const chave = (m) => `${base(m.matador)}|${base(m.vitima)}|${m.hora?.data || ''}|${m.hora?.h}:${m.hora?.m}:${m.hora?.s ?? ''}|${m.hora?.absMs ?? ''}`;
  const ja = new Set((guardadas || []).map(chave));
  let proximo = Math.max(0, ...(guardadas || []).map((m) => (Number.isFinite(m.id) ? m.id + 1 : 0)));
  const saida = [...(guardadas || [])];
  let novasN = 0;
  for (const m of novas || []) {
    const k = chave(m);
    if (ja.has(k)) continue;
    ja.add(k);
    saida.push({ ...m, id: proximo++ });
    novasN++;
  }
  return { mortes: saida, novas: novasN, repetidas: (novas || []).length - novasN };
}

/** As proveniências que se guardam (ver lerMortes: 'servidor'; achar-mortes.js: 'video'). */
const FONTES_GUARDADAS = ['servidor', 'video'];
/** O que se guarda de cada morte: sem o texto da linha, que não serve depois de lido. */
export function mortesParaGuardar(mortes) {
  return (mortes || []).map(({ id, matador, vitima, arma, distancia, hora, origem, fonte }) => ({
    id, matador, vitima, ...(arma ? { arma } : {}), ...(distancia != null ? { distancia } : {}), hora,
    ...(origem === 'video' ? { origem } : {}),
    ...(FONTES_GUARDADAS.includes(fonte) ? { fonte } : {}),
  }));
}

/** O inverso: só as mortes que têm o que é preciso, vindas do aparelho. */
export function mortesGuardadas(lista) {
  return (Array.isArray(lista) ? lista : []).filter((m) => m && Number.isFinite(m.id)
    && typeof m.matador === 'string' && typeof m.vitima === 'string' && m.hora && Number.isFinite(m.hora.h) && Number.isFinite(m.hora.m))
    .map((m) => ({
      id: m.id, matador: m.matador.slice(0, 64), vitima: m.vitima.slice(0, 64),
      ...(m.origem === 'video' ? { origem: 'video' } : {}),
      // A proveniência guardada. Sem marca (guardado antes desta versão), a morte fica SEM fonte; só a de origem
      // 'video' (explícita) ganha 'video'. Nunca se presume 'servidor' para o que não trouxe a marca.
      ...(FONTES_GUARDADAS.includes(m.fonte) ? { fonte: m.fonte } : m.origem === 'video' ? { fonte: 'video' } : {}),
      arma: typeof m.arma === 'string' ? m.arma.slice(0, 64) : null,
      distancia: Number.isFinite(m.distancia) ? m.distancia : null,
      hora: {
        data: typeof m.hora.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.hora.data) ? m.hora.data : null,
        rel: m.hora.rel === 'ontem' || m.hora.rel === 'hoje' ? m.hora.rel : undefined,
        h: m.hora.h, m: m.hora.m, s: Number.isFinite(m.hora.s) ? m.hora.s : null,
        absMs: Number.isFinite(m.hora.absMs) ? m.hora.absMs : null,
      },
    }));
}
