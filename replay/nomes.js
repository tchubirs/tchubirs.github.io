// Casar os nomes lidos na tela com os canais do evento.
//
// O que o leitor de texto devolve de um vídeo comprimido vem torto: "DAMONIAK" sai "UAMUNIAK" num
// quadro e "BAMONIAK" no outro, um "0" vira "O", e a bolinha antes do nome vira "®" ou "~". Por isso a
// comparação é feita num esqueleto do nome (minúsculas, sem acentos nem símbolos, com as trocas comuns
// do leitor desfeitas) e com distância de edição, e um nome conta mais quando aparece em vários quadros.
//
// E o nome na tela muitas vezes não é o canal: no jogo cada um usa o nome da Steam, e no Discord outro.
// A planilha do dono traz o do Discord ao lado do link ("[Discord: Newt]"); esse apelido e os que a
// pessoa escreve ficam só neste aparelho (localStorage), nunca no arquivo público do evento.
//
// Tudo aqui é puro (sem DOM), para os testes correrem no Node.

/** Minúsculas, sem acentos, só letras e números. */
export function base(s) {
  return String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// As trocas que o leitor faz com letra de jogo: aplicadas aos dois lados, deixam de contar como erro.
const TROCAS = [[/rn/g, 'm'], [/vv/g, 'w'], [/0/g, 'o'], [/[1i]/g, 'l'], [/5/g, 's'], [/8/g, 'b'], [/3/g, 'e'], [/4/g, 'a'], [/7/g, 't'], [/6/g, 'g'], [/2/g, 'z']];

/** O esqueleto de um nome: o que sobra depois de tirar o que o leitor costuma trocar. */
export function esqueleto(s) {
  let t = String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[$|!]/g, (c) => (c === '$' ? 's' : 'l'));
  t = t.replace(/[^a-z0-9]/g, '');
  for (const [de, para] of TROCAS) t = t.replace(de, para);
  return t;
}

/** Distância de edição (Levenshtein), com uma linha só de memória. */
export function distancia(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const agora = [i];
    for (let j = 1; j <= b.length; j++) {
      agora[j] = Math.min(antes[j] + 1, agora[j - 1] + 1, antes[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    antes = agora;
  }
  return antes[b.length];
}

/**
 * O quanto dois nomes se parecem, de 0 a 1, tolerante a maiúsculas, símbolos e às trocas do leitor.
 * Um nome dentro do outro ("newt" em "newtrc", "elchapo" em "elchapotv") conta, mas menos do que igual.
 */
export function semelhanca(a, b) {
  const x = esqueleto(a);
  const y = esqueleto(b);
  if (x.length < 3 || y.length < 3) return x && x === y ? 1 : 0;
  if (x === y) return 1;
  const s = 1 - distancia(x, y) / Math.max(x.length, y.length);
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  const dentro = curto.length >= 4 && longo.includes(curto) ? 0.5 + 0.4 * (curto.length / longo.length) : 0;
  return Math.max(s, dentro);
}

// Palavras da interface do jogo e do vídeo que o leitor apanha e que não são nomes.
const NAO_SAO_NOMES = new Set(['fps', 'ping', 'heap', 'ram', 'inventory', 'inventario', 'crafting', 'contacts', 'clan',
  'drop', 'damage', 'range', 'streamer', 'mode', 'streamermode', 'information', 'actions', 'loot', 'upkeep', 'time',
  'quick', 'craft', 'speaking', 'voice', 'connected', 'live', 'subs', 'stream', 'follow', 'discord']);

/**
 * Os nomes candidatos de uma linha lida: sem a bolinha, o visto ou o x do começo, partida nas colunas
 * (três ou mais espaços), e cada palavra também, porque no Discord o nome vem às vezes com mais texto.
 */
export function candidatosDaLinha(texto) {
  const saida = new Set();
  for (const pedaco of String(texto ?? '').split(/\s{3,}|\t|\|/)) {
    let p = pedaco.trim()
      // O que vem antes do nome: símbolos, e uma letra solta que era a bolinha, o visto ou o x.
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/^[\p{L}\p{N}](?=\s+\S{3,})\s+/u, '')
      // O x de quem morreu sai às vezes "xX" ou "Xx", e o visto "vV".
      .replace(/^(?:[xX]{2}|[vV]{2})\s+(?=\S{3,})/u, '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/[^\p{L}\p{N}_.'-]+$/u, '');
    // A linha dos números do jogo ("64 FPS", "76 PING", "2837 HEAP") não tem nome nenhum.
    if (/\b(?:fps|ping|heap|ram)\b/i.test(p)) continue;
    if (base(p).length >= 3 && !NAO_SAO_NOMES.has(base(p))) saida.add(p);
    const palavras = p.split(/\s+/).filter((w) => base(w).length >= 3 && !NAO_SAO_NOMES.has(base(w)));
    if (palavras.length > 1) for (const w of palavras) saida.add(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}_]+$/gu, ''));
  }
  return [...saida].filter((c) => base(c).length >= 3);
}

export const LIMIAR = 0.75;

/**
 * Casar o que se leu com os canais. `lidos` são as linhas lidas: [{ texto, ms, regiao }]. `canais` são
 * os slugs que podem estar no lance; `apelidos` um Map slug -> [apelido]; `excluir` os que já estão
 * (o streamer escolhido e os colegas de time já no lance). Devolve:
 *  - propostas: [{ canal, lido, alvo, por: 'canal'|'apelido', semelhanca, vezes, nivel }]
 *  - soltos: [{ nome, vezes }], os nomes lidos que não casaram com ninguém.
 */
export function casar({ lidos, canais, apelidos = new Map(), excluir = [], limiar = LIMIAR }) {
  const fora = new Set(excluir);
  // Os alvos de cada canal: o próprio nome e os apelidos.
  const alvos = [];
  for (const c of canais) {
    alvos.push({ canal: c, alvo: c, por: 'canal' });
    for (const a of apelidos.get(c) || []) alvos.push({ canal: c, alvo: a, por: 'apelido' });
  }
  // Cada nome lido distinto, com os quadros em que apareceu e se veio da lista do time.
  const vistos = new Map();
  for (const l of lidos) {
    for (const c of candidatosDaLinha(l.texto)) {
      const k = esqueleto(c);
      if (!vistos.has(k)) vistos.set(k, { nome: c, quadros: new Set(), doTime: false, grafias: new Map() });
      const v = vistos.get(k);
      v.quadros.add(l.ms ?? 0);
      v.grafias.set(c, (v.grafias.get(c) || 0) + 1);
      if (l.regiao === 'time') v.doTime = true;
    }
  }
  // Juntar as leituras tortas do mesmo nome ("DAMONIAK", "DAMUNIAK", "BAMONIAK"): cada uma entra no
  // primeiro grupo, do mais visto para o menos, cujo nome se pareça o bastante.
  const grupos = [];
  const porFrequencia = [...vistos.values()].sort((a, b) => b.quadros.size - a.quadros.size || a.nome.localeCompare(b.nome));
  for (const v of porFrequencia) {
    const g = grupos.find((x) => x.membros.some((m) => semelhanca(m.nome, v.nome) >= 0.8));
    if (g) {
      g.membros.push(v);
      for (const q of v.quadros) g.quadros.add(q);
      g.doTime ||= v.doTime;
    } else grupos.push({ nome: v.nome, membros: [v], quadros: new Set(v.quadros), doTime: v.doTime });
  }
  // A ordem de chegada pode deixar separados dois grupos que se tocam por um membro: junta-os.
  for (let i = 0; i < grupos.length; i++) {
    for (let j = grupos.length - 1; j > i; j--) {
      if (!grupos[i].membros.some((a) => grupos[j].membros.some((b) => semelhanca(a.nome, b.nome) >= 0.8))) continue;
      grupos[i].membros.push(...grupos[j].membros);
      for (const q of grupos[j].quadros) grupos[i].quadros.add(q);
      grupos[i].doTime ||= grupos[j].doTime;
      grupos.splice(j, 1);
    }
  }
  const porCanal = new Map();
  const soltos = [];
  for (const g of grupos) {
    let melhor = 0;
    let ganhadores = [];
    let lido = g.nome;
    for (const a of alvos) {
      for (const m of g.membros) {
        const s = semelhanca(m.nome, a.alvo);
        if (s > melhor + 1e-9) { melhor = s; ganhadores = [a]; lido = m.nome; } else if (s > 0 && Math.abs(s - melhor) <= 1e-9 && !ganhadores.includes(a)) ganhadores.push(a);
      }
    }
    if (melhor < limiar) { soltos.push({ nome: g.nome, vezes: g.quadros.size, doTime: g.doTime }); continue; }
    for (const a of ganhadores) {
      if (fora.has(a.canal)) continue;
      const atual = porCanal.get(a.canal);
      if (!atual) {
        porCanal.set(a.canal, { canal: a.canal, lido, alvo: a.alvo, por: a.por, semelhanca: melhor, quadros: new Set(g.quadros) });
      } else {
        for (const q of g.quadros) atual.quadros.add(q);
        if (melhor > atual.semelhanca) Object.assign(atual, { lido, alvo: a.alvo, por: a.por, semelhanca: melhor });
      }
    }
  }
  const propostas = [...porCanal.values()].map(({ quadros, ...p }) => {
    const vezes = quadros.size;
    const nivel = (p.semelhanca >= 0.9 && vezes >= 2) || (p.semelhanca === 1 && base(p.alvo).length >= 5) ? 'alta'
      : (p.semelhanca >= 0.85 || vezes >= 3) ? 'media' : 'baixa';
    return { ...p, vezes, nivel };
  });
  const ordemNivel = { alta: 0, media: 1, baixa: 2 };
  propostas.sort((a, b) => ordemNivel[a.nivel] - ordemNivel[b.nivel] || b.vezes - a.vezes || b.semelhanca - a.semelhanca);
  // Os nomes sem canal que valem a pena mostrar: os que se repetem. Um nome de verdade aparece em
  // quase todos os quadros; uma leitura torta, ou o texto da interface do jogo, aparece uma vez e some.
  // E uma palavra que já está dentro de um nome maior ("URE" de "DESTROY U'RE") não aparece sozinha.
  const uteis = soltos.filter((s) => s.vezes >= (s.doTime ? 2 : 3)
    && !soltos.some((o) => o !== s && esqueleto(o.nome).length > esqueleto(s.nome).length && esqueleto(o.nome).includes(esqueleto(s.nome))));
  uteis.sort((a, b) => Number(b.doTime) - Number(a.doTime) || b.vezes - a.vezes || a.nome.localeCompare(b.nome));
  return { propostas, soltos: uteis };
}

// ── apelidos, só neste aparelho ───────────────────────────────────────────

export const GUARDADO_APELIDOS = 'povix.apelidos';
const MAX_APELIDOS = 8;

/** Um apelido limpo: sem marcação, sem o #1234 antigo do Discord, até 40 letras. */
export function limparApelido(s) {
  return String(s ?? '').replace(/[<>"`]/g, '').replace(/#\d{1,4}\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Juntar dois Map slug -> [apelido] sem repetidos (pelo esqueleto). */
export function juntarApelidos(a, b) {
  const saida = new Map([...a].map(([k, v]) => [k, [...v]]));
  for (const [slug, lista] of b) {
    const atual = saida.get(slug) || [];
    for (const ap of lista) {
      const limpo = limparApelido(ap);
      if (!limpo || atual.some((x) => base(x) === base(limpo))) continue;
      atual.push(limpo);
    }
    if (atual.length) saida.set(slug, atual.slice(-MAX_APELIDOS));
  }
  return saida;
}

export function lerApelidos(guarda = globalThis.localStorage) {
  try {
    const j = JSON.parse(guarda?.getItem(GUARDADO_APELIDOS) || '{}');
    const m = new Map();
    for (const [k, v] of Object.entries(j || {})) if (Array.isArray(v)) m.set(k, v.map(limparApelido).filter(Boolean));
    return m;
  } catch { return new Map(); }
}

export function guardarApelidos(mapa, guarda = globalThis.localStorage) {
  try { guarda?.setItem(GUARDADO_APELIDOS, JSON.stringify(Object.fromEntries(mapa))); return true; } catch { return false; }
}

/** Tirar um apelido de um canal. */
export function semApelido(mapa, slug, apelido) {
  const saida = new Map(mapa);
  const resto = (saida.get(slug) || []).filter((x) => x !== apelido);
  if (resto.length) saida.set(slug, resto); else saida.delete(slug);
  return saida;
}
