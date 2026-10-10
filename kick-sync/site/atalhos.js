// Os atalhos de teclado, todos num sítio só, e cada um à escolha de quem usa.
//
// O dono, 10/10: "Deveria ter uma forma de alterar todos atalhos igual editor, atribuir atalho a
// botões que não tem atalhos [...] pra cada perfil de pessoa que usa, cada tem do seu jeito".
//
// Antes as teclas viviam escritas à mão num `keydown` do app.js (J, K, L, F, + e −...), e a lista
// da janela de ajuda era outra cópia delas no HTML. Agora há uma tabela: cada acção tem um id, as
// teclas de fábrica e a chave do nome em idiomas.js. O que a pessoa muda fica guardado neste
// aparelho (localStorage, `replay.atalhos`), só a diferença para a fábrica, e pode sair num
// ficheiro pequeno para levar para outro computador.
//
// Este ficheiro não toca no DOM: o que cada acção FAZ é do app.js, e a janela é do atalhos-painel.js.
// Assim as regras (o que é uma tecla, quem a tem, o que acontece num conflito) testam-se em Node.

/** As áreas da lista, pela ordem em que aparecem. */
export const GRUPOS = ['tocar', 'marcar', 'vista', 'paineis', 'evento'];

/**
 * Todas as acções que um atalho pode disparar.
 *
 * `padrao`: as teclas de fábrica (vazio quando o botão nunca teve atalho).
 * `botao`: o id do botão que a acção carrega, e onde a dica (`title`) mostra a tecla.
 * `noite`: só com vídeos abertos. `clipe`: só com a janela do clipe aberta.
 * `repete`: segurar a tecla repete a acção (andar, zoom). As outras disparam uma vez.
 * `segurar`: a acção dura enquanto a tecla está em baixo (o A e o D).
 */
export const ACOES = [
  { id: 'pausa', grupo: 'tocar', rotulo: 'atalhos.pausa', padrao: ['Space', 'K'], botao: 'tocarPausar', noite: true },
  { id: 'voltar', grupo: 'tocar', rotulo: 'atalhos.voltar', padrao: ['J', 'ArrowLeft'], noite: true, repete: true },
  { id: 'avancar', grupo: 'tocar', rotulo: 'atalhos.avancar', padrao: ['L', 'ArrowRight'], noite: true, repete: true },
  { id: 'correrTras', grupo: 'tocar', rotulo: 'atalhos.correrTras', padrao: ['A'], botao: 'menos3s', noite: true, segurar: true },
  { id: 'correrFrente', grupo: 'tocar', rotulo: 'atalhos.correrFrente', padrao: ['D'], botao: 'mais3s', noite: true, segurar: true },
  { id: 'menos1m', grupo: 'tocar', rotulo: 'atalhos.menos1m', padrao: [], botao: 'menos1m', noite: true, repete: true },
  { id: 'mais1m', grupo: 'tocar', rotulo: 'atalhos.mais1m', padrao: [], botao: 'mais1m', noite: true, repete: true },
  { id: 'menos5m', grupo: 'tocar', rotulo: 'atalhos.menos5m', padrao: [], botao: 'menos5m', noite: true, repete: true },
  { id: 'mais5m', grupo: 'tocar', rotulo: 'atalhos.mais5m', padrao: [], botao: 'mais5m', noite: true, repete: true },
  { id: 'lanceAnterior', grupo: 'tocar', rotulo: 'atalhos.lanceAnterior', padrao: [], noite: true, repete: true },
  { id: 'lanceSeguinte', grupo: 'tocar', rotulo: 'atalhos.lanceSeguinte', padrao: [], noite: true, repete: true },

  { id: 'marcarIn', grupo: 'marcar', rotulo: 'atalhos.marcarIn', padrao: ['I'], botao: 'marcarIn', noite: true },
  { id: 'marcarOut', grupo: 'marcar', rotulo: 'atalhos.marcarOut', padrao: ['O'], botao: 'marcarOut', noite: true },
  { id: 'marcarKill', grupo: 'marcar', rotulo: 'atalhos.marcarKill', padrao: ['M'], botao: 'marcarKill', noite: true },
  { id: 'clipar', grupo: 'marcar', rotulo: 'atalhos.clipar', padrao: ['C'], botao: 'clipar', noite: true },
  { id: 'exportarClipe', grupo: 'marcar', rotulo: 'atalhos.exportarClipe', padrao: [], botao: 'guardarClipe', clipe: true },
  { id: 'exportarRetrato', grupo: 'marcar', rotulo: 'atalhos.exportarRetrato', padrao: [], botao: 'guardarRetrato', clipe: true },

  { id: 'zoomMais', grupo: 'vista', rotulo: 'atalhos.zoomMais', padrao: ['+', '='], botao: 'zoomMais', repete: true },
  { id: 'zoomMenos', grupo: 'vista', rotulo: 'atalhos.zoomMenos', padrao: ['-', '_'], botao: 'zoomMenos', repete: true },
  { id: 'ecraCheio', grupo: 'vista', rotulo: 'ajuda.ecraCheio', padrao: ['F'], noite: true },
  { id: 'ajusteMenos', grupo: 'vista', rotulo: 'atalhos.ajusteMenos', padrao: [','], noite: true, repete: true },
  { id: 'ajusteMais', grupo: 'vista', rotulo: 'atalhos.ajusteMais', padrao: ['.'], noite: true, repete: true },

  { id: 'canais', grupo: 'paineis', rotulo: 'atalhos.canais', padrao: [], botao: 'editarCanais' },
  { id: 'lerChat', grupo: 'paineis', rotulo: 'faixa.lerChat', padrao: [], noite: true },
  { id: 'detetar', grupo: 'paineis', rotulo: 'faixa.detetarLances', padrao: [], noite: true },
  { id: 'sincronizar', grupo: 'paineis', rotulo: 'alinhar.botao', padrao: [], botao: 'alinhar', noite: true },
  { id: 'partilhar', grupo: 'paineis', rotulo: 'partilha.botao', padrao: [], botao: 'partilhar', noite: true },
  { id: 'inicio', grupo: 'paineis', rotulo: 'atalhos.inicio', padrao: [], botao: 'inicio' },
  { id: 'atalhos', grupo: 'paineis', rotulo: 'atalhos.abrir', padrao: ['?'], botao: 'ajuda' },

  { id: 'mapa', grupo: 'evento', rotulo: 'atalhos.mapa', padrao: [], botao: 'mostrarMapa' },
  { id: 'eventoInteiro', grupo: 'evento', rotulo: 'evento.verTudo', padrao: [], botao: 'verTudo' },
  { id: 'adicionarStreamer', grupo: 'evento', rotulo: 'adicionar.streamer', padrao: [], botao: 'adicionarStreamer' },
  { id: 'partilharEvento', grupo: 'evento', rotulo: 'evento.partilharEvento', padrao: [], botao: 'partilharEvento' },
];

export const ACAO = Object.fromEntries(ACOES.map((a) => [a.id, a]));

/** Esc fecha e cancela, Tab anda pelo foco: essas não se dão a nenhuma acção. */
export const RESERVADAS = new Set(['Escape', 'Tab']);

/** A chave do localStorage. O prefixo `replay.` é o do resto do sítio. */
export const CHAVE = 'replay.atalhos';

const MODIFICADORES = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn', 'OS', 'Hyper', 'Super']);
const NOMEADAS = new Set([
  'Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

/**
 * A tecla de um `keydown`, escrita sempre da mesma maneira: "Ctrl+Shift+K", "Space", "+", "Alt+1".
 *
 * As letras vão em maiúscula e guardam o Shift (Shift+J é outra combinação, que por omissão cai no J).
 * Um símbolo já diz o Shift que levou ('?' é o Shift da barra, '+' o do igual), e por isso o Shift
 * não se escreve nele. A vírgula e o ponto são a excepção: vão pela posição da tecla, como antes, para
 * o Shift+vírgula (que no teclado chega como '<') continuar a ser a vírgula com o passo maior.
 * Devolve null para um modificador sozinho: carregar no Ctrl ainda não é atalho nenhum.
 */
export function comboDoEvento(e) {
  const k = e.key;
  if (!k || MODIFICADORES.has(k) || k === 'Unidentified' || k === 'Dead') return null;
  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  let tecla = null;
  let comShift = e.shiftKey;
  if (e.code === 'Comma' && !ctrl && !alt) tecla = ',';
  else if (e.code === 'Period' && !ctrl && !alt) tecla = '.';
  else if (k === ' ' || k === 'Spacebar') tecla = 'Space';
  else if (k === 'Esc') tecla = 'Escape';
  else if (NOMEADAS.has(k)) tecla = k;
  else if (/^Key[A-Z]$/.test(e.code || '') && (ctrl || alt || !/^[a-z]$/i.test(k))) {
    // Com Alt no Mac a letra chega como outro carácter, e num teclado russo chega em cirílico: a
    // posição da tecla diz qual é.
    tecla = e.code.slice(3);
  } else if (/^Digit[0-9]$/.test(e.code || '') && (ctrl || alt)) tecla = e.code.slice(5);
  else if ([...k].length === 1) {
    if (/^[a-z]$/i.test(k)) tecla = k.toUpperCase();
    else { tecla = k; comShift = false; }
  } else return null;
  return [ctrl && 'Ctrl', alt && 'Alt', comShift && 'Shift', tecla].filter(Boolean).join('+');
}

/** Separar "Ctrl+Shift++" em modificadores e tecla. A tecla pode ser o próprio "+". */
export function partes(combo) {
  const m = /^((?:Ctrl\+|Alt\+|Shift\+)*)(.+)$/.exec(String(combo));
  if (!m) return { ctrl: false, alt: false, shift: false, tecla: '' };
  return { ctrl: m[1].includes('Ctrl+'), alt: m[1].includes('Alt+'), shift: m[1].includes('Shift+'), tecla: m[2] };
}

/** A mesma combinação, com os modificadores na ordem certa. Uma coisa que não é tecla devolve null. */
export function normalizar(combo) {
  if (typeof combo !== 'string' || !combo || combo.length > 40) return null;
  const { ctrl, alt, shift, tecla } = partes(combo);
  if (!tecla) return null;
  const t = /^[a-z]$/.test(tecla) ? tecla.toUpperCase() : tecla;
  if (!(NOMEADAS.has(t) || [...t].length === 1)) return null;
  return [ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', t].filter(Boolean).join('+');
}

const SETAS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };

/**
 * Cada pedaço de uma combinação, como se lê numa tecla: ["Ctrl", "Shift", "K"].
 * `t` traduz os nomes que mudam de língua (o espaço).
 */
export function pedacos(combo, t = (k) => k) {
  const { ctrl, alt, shift, tecla } = partes(combo);
  const nome = tecla === 'Space' ? t('ajuda.teclaEspaco')
    : tecla === 'Escape' ? 'Esc'
      : SETAS[tecla] || (tecla === '-' ? '−' : tecla);
  return [ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', nome].filter(Boolean);
}

/** A combinação numa linha só, para dicas e para o leitor de ecrã: "Ctrl + K". */
export const textoDe = (combo, t) => pedacos(combo, t).join(' + ');

/**
 * O formato do `aria-keyshortcuts`, que é o do W3C: "Control+Shift+K", "Space", "Shift+?" não.
 */
export function ariaDe(combo) {
  const { ctrl, alt, shift, tecla } = partes(combo);
  const nome = tecla === '+' ? 'Plus' : tecla === ' ' ? 'Space' : tecla;
  return [ctrl && 'Control', alt && 'Alt', shift && 'Shift', nome].filter(Boolean).join('+');
}

/** Um armazém que nunca rebenta: numa janela privada o localStorage pode atirar ao primeiro toque. */
function armazemSeguro(armazem) {
  return {
    ler() {
      try { return armazem?.getItem(CHAVE) ?? null; } catch { return null; }
    },
    escrever(valor) {
      try {
        if (valor == null) armazem?.removeItem(CHAVE);
        else armazem?.setItem(CHAVE, valor);
      } catch { /* sem espaço ou janela privada: fica só nesta visita */ }
    },
  };
}

/**
 * O mapa de teclas desta pessoa.
 *
 * Guarda-se só o que difere da fábrica. Assim, quando uma versão nova do sítio der uma tecla a um
 * botão que não tinha, quem nunca mexeu nesse botão recebe-a, e quem mexeu fica com a sua.
 */
export function criarAtalhos(armazem = (() => { try { return globalThis.localStorage; } catch { return null; } })()) {
  const guardado = armazemSeguro(armazem);
  const ouvintes = new Set();
  let mudadas = lerMudadas(guardado.ler());

  function lerMudadas(texto) {
    const fora = {};
    if (!texto) return fora;
    let bruto;
    try { bruto = JSON.parse(texto); } catch { return fora; }
    const teclas = bruto?.teclas && typeof bruto.teclas === 'object' ? bruto.teclas : bruto;
    if (!teclas || typeof teclas !== 'object' || Array.isArray(teclas)) return fora;
    const vistas = new Set();
    for (const [id, lista] of Object.entries(teclas)) {
      if (!ACAO[id] || !Array.isArray(lista)) continue;
      const boas = [];
      for (const c of lista) {
        const n = normalizar(c);
        // Duas acções com a mesma tecla num ficheiro mexido à mão: fica a primeira.
        if (!n || RESERVADAS.has(n) || vistas.has(n) || boas.includes(n)) continue;
        boas.push(n);
        vistas.add(n);
      }
      fora[id] = boas;
    }
    return fora;
  }

  /** As teclas de cada acção agora. Uma tecla tem um dono só: a escolha da pessoa ganha à fábrica. */
  function mapa() {
    const tomadas = new Set();
    for (const id of Object.keys(mudadas)) for (const c of mudadas[id]) tomadas.add(c);
    const fora = {};
    for (const a of ACOES) {
      fora[a.id] = a.id in mudadas ? [...mudadas[a.id]] : a.padrao.filter((c) => !tomadas.has(c));
    }
    return fora;
  }

  let cache = mapa();
  function mudou() {
    const diff = {};
    for (const a of ACOES) {
      if (a.id in mudadas && !iguais(mudadas[a.id], a.padrao)) diff[a.id] = mudadas[a.id];
    }
    mudadas = diff;
    cache = mapa();
    guardado.escrever(Object.keys(diff).length ? JSON.stringify(diff) : null);
    for (const f of ouvintes) f();
  }

  const teclas = (id) => cache[id] ? [...cache[id]] : [];

  function dono(combo) {
    const n = normalizar(combo);
    if (!n) return null;
    for (const a of ACOES) if (cache[a.id].includes(n)) return a.id;
    return null;
  }

  /**
   * Dar `combo` a `id`. `modo` 'trocar' põe esta no lugar das teclas que a acção tinha; 'juntar'
   * acrescenta-a. Se outra acção já a usa, nada muda e devolve-se `{ conflito }`: quem chama decide.
   */
  function atribuir(id, combo, { modo = 'trocar' } = {}) {
    const n = normalizar(combo);
    if (!ACAO[id] || !n) return { erro: 'invalida' };
    if (RESERVADAS.has(n)) return { erro: 'reservada' };
    const outro = dono(n);
    if (outro && outro !== id) return { conflito: outro, combo: n };
    const antes = teclas(id);
    mudadas[id] = modo === 'juntar' ? [...antes.filter((c) => c !== n), n] : [n];
    fixarOutrasDeFabrica(id);
    mudou();
    return { ok: true, combo: n };
  }

  /**
   * Resolver um conflito trocando: `id` fica com `combo`, e o outro dono fica com as teclas que `id`
   * largou (no modo 'trocar'), ou só sem esta (no modo 'juntar', em que `id` não larga nada).
   */
  function trocar(id, combo, { modo = 'trocar' } = {}) {
    const n = normalizar(combo);
    const outro = dono(n);
    if (!ACAO[id] || !n || RESERVADAS.has(n)) return { erro: 'invalida' };
    if (!outro || outro === id) return atribuir(id, n, { modo });
    const meus = teclas(id);
    const largadas = modo === 'juntar' ? [] : meus.filter((c) => c !== n);
    const doOutro = teclas(outro).filter((c) => c !== n);
    mudadas[outro] = [...doOutro, ...largadas.filter((c) => !doOutro.includes(c))];
    mudadas[id] = modo === 'juntar' ? [...meus.filter((c) => c !== n), n] : [n];
    fixarOutrasDeFabrica(id, outro);
    mudou();
    return { ok: true, combo: n, outro, deu: largadas };
  }

  // Quando uma acção muda, as que continuam de fábrica ficam escritas como estão. Sem isto, tirar o
  // K da pausa e dá-lo ao clipe e depois voltar o clipe ao padrão devolvia o K à pausa sem ninguém
  // pedir, porque a fábrica dela ainda o tinha.
  function fixarOutrasDeFabrica(...excepto) {
    const agora = mapa();
    for (const a of ACOES) {
      if (excepto.includes(a.id) || a.id in mudadas) continue;
      if (!iguais(agora[a.id], a.padrao)) mudadas[a.id] = agora[a.id];
    }
  }

  function limpar(id) {
    if (!ACAO[id]) return;
    mudadas[id] = [];
    mudou();
  }

  /**
   * Voltar uma acção à fábrica. As teclas de fábrica dela que outra acção tenha entretanto tomado
   * ficam com essa outra, e o resultado diz quais foram, para a janela o poder dizer.
   */
  function padrao(id) {
    if (!ACAO[id]) return { presas: [] };
    delete mudadas[id];
    const presas = [];
    for (const c of ACAO[id].padrao) {
      for (const [outro, lista] of Object.entries(mudadas)) if (lista.includes(c)) presas.push({ combo: c, outro });
    }
    mudou();
    return { presas };
  }

  function padraoTudo() {
    mudadas = {};
    mudou();
  }

  const ehPadrao = (id) => iguais(teclas(id), ACAO[id]?.padrao ?? []);
  const algumMudado = () => ACOES.some((a) => !ehPadrao(a.id));

  /**
   * A acção de um `keydown`, ou null. Primeiro a combinação exacta; senão, com Shift, a mesma sem ele:
   * Shift+J é o J com o passo de 10 s, e Shift+F é o F, como sempre foram. `largo` diz se o Shift
   * veio por cima de uma tecla que não o pedia.
   */
  function acaoDe(e) {
    const combo = comboDoEvento(e);
    if (!combo) return null;
    let id = dono(combo);
    if (id) return { id, combo, largo: false };
    const p = partes(combo);
    if (p.shift) {
      const sem = [p.ctrl && 'Ctrl', p.alt && 'Alt', p.tecla].filter(Boolean).join('+');
      id = dono(sem);
      if (id) return { id, combo: sem, largo: true };
    }
    return null;
  }

  /** O ficheiro que se leva para outro aparelho. Vai o mapa inteiro, para se ler sem esta versão. */
  function exportar() {
    return JSON.stringify({ povix: 'atalhos', versao: 1, teclas: mapa() }, null, 2);
  }

  /** Ler um ficheiro de exportar. Devolve false se não for um, e então nada muda. */
  function importar(texto) {
    let bruto;
    try { bruto = JSON.parse(texto); } catch { return false; }
    const teclas = bruto?.teclas;
    if (bruto?.povix !== 'atalhos' || !teclas || typeof teclas !== 'object' || Array.isArray(teclas)) return false;
    const lidas = lerMudadas(JSON.stringify(teclas));
    // As acções que o ficheiro não traz (de uma versão mais velha) ficam de fábrica.
    mudadas = lidas;
    fixarOutrasDeFabrica(...Object.keys(lidas));
    mudou();
    return true;
  }

  return {
    teclas, dono, atribuir, trocar, limpar, padrao, padraoTudo, ehPadrao, algumMudado, acaoDe, exportar, importar,
    aoMudar(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    /** Reler o que está guardado (outro separador pode ter mudado). */
    recarregar() { mudadas = lerMudadas(guardado.ler()); cache = mapa(); for (const f of ouvintes) f(); },
  };
}

function iguais(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** O mapa partilhado pela página e pelo evento. Nos testes em Node cria-se outro, com um armazém falso. */
export const atalhos = criarAtalhos();
