// O chat do streamer por cima do clipe exportado, como a sobreposição de chat de uma live.
//
// O dono, 12/10: "no Criar clipe, opção de pôr no vídeo baixado o chat do streamer naquele trecho, por
// cima do vídeo, com posição, tamanho e quantas linhas". Vale para o 16:9 e para o 9:16.
//
// Tudo o que se vê no ficheiro sai daqui, e a pré-visualização da janela do clipe chama exactamente as
// mesmas funções com o mesmo instante: o que se vê na janela é o que sai no vídeo. O texto do chat é
// de desconhecidos e nunca vira HTML: é desenhado numa tela, letra a letra, por `fillText`.
//
// O relógio: as mensagens chegam com a hora da Kick (`created_at`), que é o relógio da noite. O vídeo
// de cada canal anda no relógio da noite mais o ajuste dele (o nudge), e por isso o instante a pedir
// aqui é o da noite (o início do clipe mais o que já se gravou), e não o do vídeo.

import { ZONA_TIKTOK } from './retrato.js?v=dd5b06eb4e';
import { limparCaixas } from './caixa-previa.js?v=dd5b06eb4e';

/**
 * Quanto tempo uma mensagem fica no ecrã (por omissão), e quanto desse tempo leva a sumir. A pessoa
 * escolhe entre `VIDAS_S`; `VIDA_MAX_MS` é a maior, para a leitura do chat cobrir qualquer uma.
 */
export const VIDA_MS = 10_000;
export const VIDAS_S = [5, 8, 10, 15, 20];
export const VIDA_MAX_MS = VIDAS_S.at(-1) * 1000;
export const SUMIR_MS = 800;
/** Uma mensagem comprida não toma o chat todo: no máximo três linhas, e o resto em "...". */
export const LINHAS_POR_MENSAGEM = 3;
export const LINHAS_MIN = 4;
export const LINHAS_MAX = 10;
/** Os caracteres de uma mensagem que contam. O resto é spam colado e não cabe em três linhas. */
const MAXIMO_LETRAS = 220;

export const POSICOES = ['auto', 'baixoEsq', 'baixoDir', 'cimaEsq', 'cimaDir', 'meioEsq', 'meioDir'];
export const TAMANHOS = ['p', 'm', 'g'];
export const FUNDOS = ['translucido', 'nenhum'];
/** As cores do chat: 'auto' é a de cada autor (como na Kick); as outras pintam nomes e texto. */
export const CORES_CHAT = Object.freeze({
  auto: null, turquesa: '#46C6D6', ambar: '#F2B254', branco: '#FFFFFF', verde: '#69DB7C', rosa: '#F783AC',
});
export const CHAT_OMISSAO = Object.freeze({
  ligado: false, posicao: 'auto', tamanho: 'm', linhas: 6, fundo: 'translucido',
  vida: VIDA_MS / 1000, cor: 'auto', caixas: Object.freeze({ '16:9': null, '9:16': null }),
});

/** Quanto uma mensagem fica no ecrã nesta escolha, em ms. */
export const vidaMs = (chat) => (VIDAS_S.includes(Number(chat?.vida)) ? Number(chat.vida) * 1000 : VIDA_MS);

/** As escolhas do chat com tudo dentro dos limites; o que vier estragado volta ao de omissão. */
export function limparChat(c) {
  const o = c && typeof c === 'object' ? c : {};
  const linhas = Math.round(Number(o.linhas));
  return {
    ligado: o.ligado === true,
    posicao: POSICOES.includes(o.posicao) ? o.posicao : CHAT_OMISSAO.posicao,
    tamanho: TAMANHOS.includes(o.tamanho) ? o.tamanho : CHAT_OMISSAO.tamanho,
    linhas: Number.isFinite(linhas) ? Math.min(LINHAS_MAX, Math.max(LINHAS_MIN, linhas)) : CHAT_OMISSAO.linhas,
    fundo: FUNDOS.includes(o.fundo) ? o.fundo : CHAT_OMISSAO.fundo,
    vida: VIDAS_S.includes(Number(o.vida)) ? Number(o.vida) : CHAT_OMISSAO.vida,
    cor: Object.hasOwn(CORES_CHAT, o.cor) ? o.cor : CHAT_OMISSAO.cor,
    // Onde a pessoa pôs a caixa arrastando, por formato (null = o lugar de `posicao`).
    caixas: limparCaixas(o.caixas, { min: 0.15 }),
  };
}

/** A primeira mensagem DEPOIS de `tMs`, por busca binária: uma noite de chat são milhares. */
function depoisDe(lista, tMs) {
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (lista[meio].ms <= tMs) lo = meio + 1; else hi = meio;
  }
  return lo;
}

/**
 * As mensagens no ecrã no instante `tMs`, da mais velha para a mais nova, cada uma com a opacidade.
 *
 * Uma mensagem entra no segundo em que foi escrita e fica `vida` (10 s por omissão); nos últimos
 * `SUMIR_MS` vai sumindo. Nunca mais do que `maximo` (as mais novas ganham, como num chat a sério).
 * `lista` vem por ordem de relógio, como a guarda o evento.
 */
export function mensagensVisiveis(lista, tMs, maximo = CHAT_OMISSAO.linhas, vida = VIDA_MS) {
  if (!Array.isArray(lista) || !lista.length || !Number.isFinite(tMs)) return [];
  const saida = [];
  const sumir = Math.min(SUMIR_MS, vida);
  for (let i = depoisDe(lista, tMs) - 1; i >= 0 && saida.length < maximo; i--) {
    const m = lista[i];
    if (!Number.isFinite(m?.ms)) continue;
    const idade = tMs - m.ms;
    if (idade >= vida) break;
    const alfa = idade > vida - sumir ? (vida - idade) / sumir : 1;
    saida.push({ m, alfa: Math.max(0, Math.min(1, alfa)) });
  }
  return saida.reverse();
}

/** As mensagens de que um clipe de `deMs` a `ateMs` pode precisar (as de antes ainda no ecrã contam). */
export function mensagensDoClipe(lista, deMs, ateMs, vida = VIDA_MAX_MS) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((m) => Number.isFinite(m?.ms) && m.ms > deMs - vida && m.ms <= ateMs);
}

// Cores claras que se leem em cima de preto e de um jogo: as doze do círculo, sem os cinzentos.
const PALETA = ['#ff6b6b', '#ffa94d', '#ffd43b', '#a9e34b', '#69db7c', '#38d9a9',
  '#3bc9db', '#4dabf7', '#91a7ff', '#b197fc', '#e599f7', '#faa2c1'];

/** A cor de quem escreveu: sempre a mesma para o mesmo nome, como num chat. */
export function corDoAutor(autor) {
  const s = String(autor ?? '').toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETA[(h >>> 0) % PALETA.length];
}

// O emote da Kick no texto: [emote:37226:KEKW]. O número é o da imagem; só algarismos, para nunca
// virar outra coisa no endereço.
const EMOTE = /\[emote:(\d{1,12}):([^\]\n]{1,40})\]/g;
// Controlo e marcas de direção do texto: num chat são lixo ou truques, e numa tela só baralham a linha.
const INVISIVEIS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** O texto de uma mensagem em pedaços: texto e emotes, pela ordem em que vêm. */
export function partesDaMensagem(texto) {
  const s = String(texto ?? '').replace(INVISIVEIS, ' ');
  const partes = [];
  let resto = MAXIMO_LETRAS;
  let ultimo = 0;
  const porTexto = (bocado) => {
    if (!bocado || resto <= 0) return;
    const letras = Array.from(bocado);
    const fica = letras.slice(0, resto).join('');
    resto -= Math.min(letras.length, resto);
    if (fica) partes.push({ tipo: 'texto', texto: fica });
  };
  for (const m of s.matchAll(EMOTE)) {
    porTexto(s.slice(ultimo, m.index));
    if (resto > 0) {
      partes.push({ tipo: 'emote', id: m[1], nome: m[2] });
      resto -= 2;
    }
    ultimo = m.index + m[0].length;
  }
  porTexto(s.slice(ultimo));
  return partes;
}

/** O nome do autor como se mostra: o slug sem nada que não seja nome. */
function nomeDe(autor) {
  return Array.from(String(autor ?? '').replace(INVISIVEIS, '').trim()).slice(0, 25).join('') || '?';
}

// ── as imagens dos emotes ───────────────────────────────────────────────────
//
// Pedidas com `crossOrigin`: uma imagem de outro domínio sem licença suja a tela, e uma tela suja não
// dá frame nenhum ao gravador. Se a Kick não der a licença, a imagem falha ao carregar, e o emote sai
// pelo nome, em texto. Nunca entra na tela uma imagem que a possa sujar.

const emotes = new Map();
let versaoEmotes = 0;
export const urlDoEmote = (id) => `https://files.kick.com/emotes/${id}/fullsize`;

/** O emote `id`, a carregar ou já carregado. */
export function emote(id, { criar = () => new Image() } = {}) {
  if (!/^\d{1,12}$/.test(String(id))) return null;
  let e = emotes.get(id);
  if (e) return e;
  const img = criar();
  e = { img, estado: 'aCarregar' };
  e.pronto = new Promise((ok) => {
    img.onload = () => { e.estado = img.naturalWidth > 0 ? 'ok' : 'falhou'; versaoEmotes++; ok(); };
    img.onerror = () => { e.estado = 'falhou'; versaoEmotes++; ok(); };
  });
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = urlDoEmote(id);
  emotes.set(id, e);
  return e;
}

/** A imagem de um emote, só se já está pronta a desenhar. */
export function imagemDoEmote(id) {
  const e = emotes.get(String(id));
  return e?.estado === 'ok' ? e.img : null;
}

/**
 * Pedir as imagens de todos os emotes destas mensagens, e esperar por elas (no máximo `esperaMs`).
 * O exportar espera, para o ficheiro sair igual do princípio ao fim; a pré-visualização não.
 */
export async function prepararEmotes(mensagens, { esperaMs = 4000, criar } = {}) {
  const pedidos = [];
  for (const m of mensagens || []) {
    for (const p of partesDaMensagem(m?.texto)) {
      if (p.tipo === 'emote') {
        const e = emote(p.id, criar ? { criar } : {});
        if (e && e.estado === 'aCarregar') pedidos.push(e.pronto);
      }
    }
  }
  if (!pedidos.length) return;
  let relogio;
  await Promise.race([
    Promise.all(pedidos),
    new Promise((ok) => { relogio = setTimeout(ok, esperaMs); }),
  ]);
  clearTimeout(relogio);
}

// ── a geometria ──────────────────────────────────────────────────────────────

// O corpo da letra num 16:9 de 1080 de altura. No 9:16 vê-se num telemóvel em pé, e a mesma letra
// leva mais um quarto para se ler igual.
const CORPO = { p: 26, m: 34, g: 44 };
export const LETRA = '"IBM Plex Sans", system-ui, sans-serif';

/**
 * Onde fica o chat numa tela de `alvo` (a do ficheiro), e com que letra.
 *
 * `formato` é '16:9' ou '9:16'. No 9:16 há duas zonas que a TikTok, os Reels e os Shorts tapam com
 * os botões e a legenda (o fundo e o topo) e a coluna de botões (a direita), e o chat fica fora delas
 * (os números estão em `ZONA_TIKTOK`, em retrato.js). Em automático: num 16:9 em
 * baixo à esquerda, onde as sobreposições de chat costumam estar; num 9:16 de dois quadros logo
 * abaixo da divisória, na faixa de cima do jogo, que é céu ou chão e não a mira; num 9:16 de um
 * quadro, em baixo à esquerda, por cima da zona da legenda.
 *
 * Devolve `{ x, y, largura, ancora, lado, fonte, alturaLinha, folga }`. `ancora` diz o que `y` é: o
 * fundo do bloco ('baixo'), o topo ('cima') ou o meio ('meio').
 */
export function geometria(alvo, chat, { formato = '16:9', modo = 'um', divisao = 0.35 } = {}) {
  const c = limparChat(chat);
  const W = alvo.largura;
  const H = alvo.altura;
  const vertical = formato === '9:16';
  const escala = vertical ? W / 1080 : H / 1080;
  const fonte = Math.round(CORPO[c.tamanho] * escala * (vertical ? 1.25 : 1));
  const margem = Math.round((vertical ? 40 : 32) * escala);
  // A beira direita até onde o chat pode ir: no 9:16, a de dentro da coluna de botões da TikTok.
  const limiteDir = vertical ? W - Math.round(W * ZONA_TIKTOK.direita) : W - margem;
  const largura = Math.min(Math.round(fonte * (vertical ? 16 : 17)), limiteDir - margem);
  const base = montarBase(largura, fonte, c.linhas);
  const caixa = c.caixas[formato];
  if (caixa) {
    // Arrastada pela pessoa: a largura da caixa manda na letra (a mesma razão de antes), e o resto
    // fica ancorado no fundo da caixa, que é onde o chat de uma live cresce para cima.
    const l = Math.round(caixa.w * W);
    const f = Math.max(8, Math.round(l / (vertical ? 16 : 17)));
    const b = montarBase(l, f, c.linhas);
    return { ...b, x: Math.round(caixa.x * W), y: Math.round(caixa.y * H) + b.alto, ancora: 'baixo', lado: 'esq' };
  }
  let pos = c.posicao;
  if (pos === 'auto' && vertical && modo === 'dois') {
    const d = Number.isFinite(divisao) ? Math.min(0.85, Math.max(0.15, divisao)) : 0.35;
    return { ...base, x: margem, y: Math.round(H * d) + margem, ancora: 'cima', lado: 'esq' };
  }
  if (pos === 'auto') pos = 'baixoEsq';
  const lado = pos.endsWith('Dir') ? 'dir' : 'esq';
  const x = lado === 'dir' ? limiteDir - largura : margem;
  const topo = vertical ? Math.round(H * ZONA_TIKTOK.cima) : margem;
  const fundo = vertical ? Math.round(H * (1 - ZONA_TIKTOK.baixo)) : H - margem;
  if (pos.startsWith('baixo')) return { ...base, x, y: fundo, ancora: 'baixo', lado };
  if (pos.startsWith('cima')) return { ...base, x, y: topo, ancora: 'cima', lado };
  return { ...base, x, y: Math.round(H / 2), ancora: 'meio', lado };
}

function montarBase(largura, fonte, linhas) {
  const alturaLinha = Math.round(fonte * 1.3);
  const folga = Math.round(fonte * 0.3);
  const entre = Math.round(fonte * 0.22);
  // A caixa mais alta que o chat chega a ocupar: todas as linhas cheias.
  return { largura, fonte, alturaLinha, folga, alto: linhas * (alturaLinha + folga) + entre * (linhas - 1) };
}

/**
 * A caixa do chat na prévia, em fração do quadro: `{ x, y, w, h }`. É a que a pessoa arrastou, ou a
 * do lugar automático; a mesma conta da geometria, e por isso a caixa cobre o que se vê no ficheiro.
 */
export function retanguloDoChat(alvo, chat, opcoes) {
  const g = geometria(alvo, chat, opcoes);
  const topo = g.ancora === 'baixo' ? g.y - g.alto : g.ancora === 'meio' ? g.y - g.alto / 2 : g.y;
  return { x: g.x / alvo.largura, y: topo / alvo.altura, w: g.largura / alvo.largura, h: g.alto / alvo.altura };
}

// ── as linhas ────────────────────────────────────────────────────────────────

/**
 * Partir os pedaços de uma mensagem em linhas que cabem em `largura`. `medir(peca)` dá a largura de
 * um pedaço. Palavra a palavra; uma palavra maior do que a linha parte-se letra a letra (o "kkkkk"
 * de duzentas letras), por busca binária para não medir duzentas vezes.
 * Devolve `[[{ ...peca, x, w }]]`, já sem espaços na ponta das linhas.
 */
export function quebrarLinhas(pecas, largura, medir, maxLinhas = LINHAS_POR_MENSAGEM) {
  const linhas = [[]];
  let x = 0;
  const por = (p, w) => { linhas.at(-1).push({ ...p, x, w }); x += w; };
  const aparar = (l) => { while (l.length && l.at(-1).tipo !== 'emote' && !l.at(-1).texto.trim()) l.pop(); };
  const nova = () => { aparar(linhas.at(-1)); linhas.push([]); x = 0; };
  for (const peca of pecas) {
    if (peca.tipo === 'emote') {
      const w = medir(peca);
      if (x > 0 && x + w > largura) nova();
      por(peca, w);
      continue;
    }
    for (const palavra of peca.texto.split(/(\s+)/)) {
      if (!palavra) continue;
      if (!palavra.trim()) {
        if (x > 0) por({ ...peca, texto: ' ' }, medir({ ...peca, texto: ' ' }));
        continue;
      }
      const w = medir({ ...peca, texto: palavra });
      if (x > 0 && x + w > largura) nova();
      if (w <= largura - x) { por({ ...peca, texto: palavra }, w); continue; }
      let letras = Array.from(palavra);
      while (letras.length) {
        let lo = 1;
        let hi = letras.length;
        while (lo < hi) {
          const n = (lo + hi + 1) >> 1;
          if (medir({ ...peca, texto: letras.slice(0, n).join('') }) <= largura - x) lo = n; else hi = n - 1;
        }
        const bocado = letras.slice(0, lo).join('');
        por({ ...peca, texto: bocado }, medir({ ...peca, texto: bocado }));
        letras = letras.slice(lo);
        if (letras.length) nova();
      }
    }
  }
  aparar(linhas.at(-1));
  const cheias = linhas.filter((l) => l.length);
  if (cheias.length <= maxLinhas) return cheias;
  // Cortada: as primeiras linhas, e a última acaba em "..." sem passar da largura.
  const fica = cheias.slice(0, maxLinhas);
  const ultima = fica.at(-1);
  const ref = ultima.find((p) => p.tipo === 'texto') || { tipo: 'texto', texto: '' };
  const pontos = { ...ref, tipo: 'texto', texto: '...' };
  const wp = medir(pontos);
  const fim = () => (ultima.length ? ultima.at(-1).x + ultima.at(-1).w : 0);
  while (ultima.length > 1 && fim() + wp > largura) ultima.pop();
  ultima.push({ ...pontos, x: fim(), w: wp });
  return fica;
}

// As linhas de cada mensagem já partidas, para não medir o mesmo texto trinta vezes por segundo.
const arrumadas = new Map();

function linhasDaMensagem(m, geo, medir) {
  const chave = `${m.id ?? `${m.ms}|${m.autor}|${m.texto}`}|${geo.fonte}|${geo.largura}|${versaoEmotes}`;
  let l = arrumadas.get(chave);
  if (l) return l;
  const pecas = [
    { tipo: 'nome', texto: `${nomeDe(m.autor)}: ` },
    ...partesDaMensagem(m.texto),
  ];
  l = quebrarLinhas(pecas, geo.largura - 2 * geo.folga, medir);
  if (arrumadas.size > 600) arrumadas.clear();
  arrumadas.set(chave, l);
  return l;
}

/**
 * Que mensagens cabem e com que linhas, da mais velha para a mais nova. As mais novas entram
 * primeiro; quando as linhas acabam, as de cima saem, como num chat que sobe. Se a mais nova sozinha
 * passa do limite, fica cortada.
 */
export function arrumarChat(visiveis, geo, chat, medir) {
  const c = limparChat(chat);
  const blocos = [];
  let usadas = 0;
  for (let i = visiveis.length - 1; i >= 0 && usadas < c.linhas; i--) {
    const { m, alfa } = visiveis[i];
    let linhas = linhasDaMensagem(m, geo, medir);
    if (usadas + linhas.length > c.linhas) {
      if (blocos.length) break;
      linhas = linhas.slice(0, c.linhas);
    }
    usadas += linhas.length;
    const largura = Math.max(...linhas.map((l) => (l.length ? l.at(-1).x + l.at(-1).w : 0)));
    blocos.unshift({ m, alfa, linhas, largura });
  }
  return { blocos, linhas: usadas };
}

// ── o desenho ────────────────────────────────────────────────────────────────

function caixaRedonda(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const fonteDe = (peca, px) => `${peca.tipo === 'nome' ? 600 : 500} ${px}px ${LETRA}`;

/**
 * Pintar o chat de `lista` no instante `tMs` (relógio da noite) por cima do que já está em `ctx`.
 * `geo` vem de `geometria`. Devolve quantas mensagens pintou.
 */
export function desenharChat(ctx, lista, tMs, chat, geo) {
  const c = limparChat(chat);
  const visiveis = mensagensVisiveis(lista, tMs, c.linhas, vidaMs(c));
  if (!visiveis.length) return 0;
  const acento = CORES_CHAT[c.cor];
  const px = geo.fonte;
  const emoteAlto = Math.round(px * 1.25);
  ctx.save();
  const medir = (p) => {
    if (p.tipo === 'emote') {
      const img = imagemDoEmote(p.id);
      if (img) return Math.round(emoteAlto * (img.naturalWidth / Math.max(1, img.naturalHeight)));
      ctx.font = fonteDe(p, px);
      return ctx.measureText(p.nome).width;
    }
    ctx.font = fonteDe(p, px);
    return ctx.measureText(p.texto).width;
  };
  const { blocos } = arrumarChat(visiveis, geo, c, medir);
  const { alturaLinha: lh, folga } = geo;
  const entre = Math.round(px * 0.22);
  const altos = blocos.map((b) => b.linhas.length * lh + folga);
  const total = altos.reduce((s, a) => s + a, 0) + entre * Math.max(0, blocos.length - 1);
  let y = geo.ancora === 'baixo' ? geo.y - total : geo.ancora === 'meio' ? geo.y - total / 2 : geo.y;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  for (const [i, b] of blocos.entries()) {
    const w = Math.ceil(b.largura + 2 * folga);
    const x0 = geo.lado === 'dir' ? geo.x + geo.largura - w : geo.x;
    ctx.globalAlpha = b.alfa;
    if (c.fundo === 'translucido') {
      ctx.fillStyle = 'rgba(10, 10, 14, 0.62)';
      caixaRedonda(ctx, x0, y, w, altos[i], Math.round(px * 0.3));
      ctx.fill();
    }
    const cor = acento || corDoAutor(b.m.autor);
    for (const [k, linha] of b.linhas.entries()) {
      const meio = y + folga / 2 + k * lh + lh / 2;
      for (const p of linha) {
        const x = x0 + folga + p.x;
        if (p.tipo === 'emote') {
          const img = imagemDoEmote(p.id);
          if (img) { ctx.drawImage(img, x, meio - emoteAlto / 2, p.w, emoteAlto); continue; }
        }
        const texto = p.tipo === 'emote' ? p.nome : p.texto;
        if (!texto.trim()) continue;
        ctx.font = fonteDe(p, px);
        if (c.fundo === 'nenhum') {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
          ctx.lineWidth = Math.max(2, px * 0.16);
          ctx.strokeText(texto, x, meio);
        }
        ctx.fillStyle = p.tipo === 'nome' ? cor : p.tipo === 'emote' ? '#d0d4dc' : acento || '#f4f5f7';
        ctx.fillText(texto, x, meio);
      }
    }
    y += altos[i] + entre;
  }
  ctx.restore();
  return blocos.length;
}
