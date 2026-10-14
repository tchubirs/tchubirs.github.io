// Achar as mortes no próprio vídeo, sem ninguém colar nada (o dono, 12/10: "Sem essa de bloco de
// notas, você tem que fazer tudo").
//
// A tela de morte do Rust, vista em quadros verdadeiros de 05/10 (ABISAL, crreg, ispdep, poionako,
// skylane7 e xguiry): uma faixa cinzenta lisa em cima, (32,32,32), com caixas ao meio. A verde diz
// quanto tempo ficou vivo ("VIVO DURANTE", "ALIVE FOR"), a vermelha diz quem matou ("MATADO POR",
// "KILLED BY": um ícone à esquerda e o nome), e às vezes há mais duas: a arma ("CON UN/A", "WITH A") e
// a distância. Por baixo, o mapa escondido (oliva liso) ou o mundo escurecido, e em baixo os sacos de
// dormir e o botão de renascer. A faixa e as caixas são as mesmas em espanhol e em inglês: é a forma e
// a cor que se procuram, nunca as palavras.
//
// Ela fica pouco tempo à vista: 1 a 5 s no xguiry e no crreg, que a tapam com uma imagem própria (o
// "MAPHIDE") ou carregam logo no renascer, e quase um minuto no ispdep. Por isso olha-se para duas
// imagens por segundo.
//
// O nome de quem matou: no servidor do ABISAL os streamers jogam com o modo streamer, e o jogo troca os
// nomes dos outros por nomes inventados ("bernard", "chasidy", "cyrus"). Esses nomes não casam com
// canal nenhum, e a morte fica de quem morreu com "quem matou: bernard". Quando o nome lido casa com um
// canal (ou com um apelido dele) a morte vai também para a faixa de quem matou.
//
// Nada aqui toca na página: os testes correm no Node, com quadros verdadeiros (test/telas-morte/).

import { base } from './nomes.js';

// ── a tela de morte num quadro pequeno ────────────────────────────────────

/**
 * As medidas da tela de morte num quadro (RGBA), de qualquer tamanho (a página usa 160x90).
 *  plano    — a fração da faixa de cima (12,5% da altura) que é cinzento liso e escuro;
 *  vermelho — a fração da zona das caixas (3,3% a 10% da altura, 30% a 75% da largura) em vermelho;
 *  verde    — a mesma fração em verde (a caixa do tempo vivo).
 * Medido nos 24 quadros de tela de morte de test/telas-morte/ (22 mortes; duas vistas no 160p e no 720p):
 * plano 0,36 a 0,89 (a webcam e os seguidores do skylane7 tapam parte da faixa), vermelho 0,063 a 0,275 e
 * verde 0,009 a 0,042. Nos 69 quadros que não são morte (jogo, inventário, ecrã de carregar, "ABATIDO", mapa, luzes vermelhas da base) há faixa
 * lisa com vermelho (até 0,39) ou com verde (o inventário, até 0,028), mas nunca os dois juntos.
 */
export function medirTela(pixeis, largura = 160, altura = Math.floor(pixeis.length / 4 / largura)) {
  if (!pixeis?.length || !largura || !altura) return { plano: 0, vermelho: 0, verde: 0, sim: false };
  const yFaixa = Math.max(1, Math.round(altura * 0.125));
  let planos = 0;
  for (let y = 0; y < yFaixa; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const r = pixeis[i]; const g = pixeis[i + 1]; const b = pixeis[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const media = (r + g + b) / 3;
      if (max - min <= 7 && media >= 20 && media <= 46) planos++;
    }
  }
  const y0 = Math.floor(altura * 0.034);
  const y1 = Math.max(y0 + 1, Math.floor(altura * 0.1));
  const x0 = Math.floor(largura * 0.3);
  const x1 = Math.floor(largura * 0.75);
  let vermelhos = 0;
  let verdes = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * largura + x) * 4;
      const r = pixeis[i]; const g = pixeis[i + 1]; const b = pixeis[i + 2];
      if (r > 110 && r - g > 45 && r - b > 45) vermelhos++;
      if (g > 80 && g - b > 30 && g >= r) verdes++;
    }
  }
  const zona = (y1 - y0) * (x1 - x0);
  const plano = planos / (yFaixa * largura);
  const vermelho = vermelhos / zona;
  const verde = verdes / zona;
  return { plano, vermelho, verde, sim: plano >= 0.3 && vermelho >= 0.025 && verde >= 0.005 };
}

/** Só o sim ou não. */
export const pareceTelaDeMorte = (pixeis, largura, altura) => medirTela(pixeis, largura, altura).sim;

/**
 * Os quadros que pareceram tela de morte, juntos em mortes: os que estão a menos de `folgaMs` uns dos
 * outros são a mesma tela (o crreg tapa-a e destapa-a). Morrer de novo leva mais do que isso: renascer
 * passa pelo ecrã de carregar, e a vida mais curta vista foi de 18 s.
 * `acertos`: [{ ms }] (por qualquer ordem). Devolve [{ deMs, ateMs, quadros, ms: [..] }].
 */
export function juntarTelas(acertos, { folgaMs = 8000 } = {}) {
  const lista = [...(acertos || [])].filter((a) => Number.isFinite(a?.ms)).sort((a, b) => a.ms - b.ms);
  const saida = [];
  for (const a of lista) {
    const ultima = saida.at(-1);
    if (ultima && a.ms - ultima.ateMs <= folgaMs) {
      ultima.ateMs = a.ms;
      ultima.quadros++;
      ultima.ms.push(a.ms);
    } else saida.push({ deMs: a.ms, ateMs: a.ms, quadros: 1, ms: [a.ms] });
  }
  return saida;
}

/**
 * Quanto antes da tela aparecer foi a morte. Visto a 1 imagem por segundo em 5 mortes de 1080p: o ecrã
 * escurece e a faixa lisa aparece 1 a 2 s antes da caixa vermelha, e o último quadro de jogo está um
 * pouco antes disso.
 */
export const ATRASO_DA_TELA_MS = 2000;

// ── a caixa de quem matou, num quadro nítido ──────────────────────────────

const ehVermelho = (r, g, b) => r > 110 && r - g > 45 && r - b > 45;

/**
 * A caixa vermelha de quem matou, num quadro nítido (RGBA, 720p ou 1080p). Devolve { x0, x1, y0, y1 }
 * em pixéis, ou null. A primeira caixa vermelha da faixa de cima, da esquerda para a direita: a da arma
 * vem a seguir, separada por uma coluna sem vermelho (e às vezes com o desenho da arma por cima).
 */
export function caixaDoMatador(pixeis, largura, altura) {
  if (!pixeis?.length || !largura || !altura) return null;
  const yMax = Math.floor(altura * 0.14);
  const xa = Math.floor(largura * 0.2);
  const xb = Math.floor(largura * 0.85);
  // As linhas com vermelho: a caixa é a maior sequência delas.
  let melhor = null;
  let corrida = null;
  for (let y = 0; y < yMax; y++) {
    let n = 0;
    for (let x = xa; x < xb; x++) {
      const i = (y * largura + x) * 4;
      if (ehVermelho(pixeis[i], pixeis[i + 1], pixeis[i + 2])) n++;
    }
    if (n / (xb - xa) > 0.04) {
      if (!corrida) corrida = { y0: y, y1: y + 1 };
      else corrida.y1 = y + 1;
      if (!melhor || corrida.y1 - corrida.y0 > melhor.y1 - melhor.y0) melhor = { ...corrida };
    } else corrida = null;
  }
  if (!melhor || melhor.y1 - melhor.y0 < 4) return null;
  const { y0, y1 } = melhor;
  // As colunas com vermelho em mais de 30% da altura da caixa; a primeira sequência larga é a caixa.
  const minimo = largura * 0.02;
  let x0 = null;
  for (let x = xa; x <= xb; x++) {
    let n = 0;
    if (x < xb) {
      for (let y = y0; y < y1; y++) {
        const i = (y * largura + x) * 4;
        if (ehVermelho(pixeis[i], pixeis[i + 1], pixeis[i + 2])) n++;
      }
    }
    const tem = x < xb && n / (y1 - y0) > 0.3;
    if (tem && x0 == null) x0 = x;
    if (!tem && x0 != null) {
      if (x - x0 > minimo) return { x0, x1: x, y0, y1 };
      x0 = null;
    }
  }
  return null;
}

/** Onde está o nome dentro da caixa: sem o ícone da esquerda (um quadrado da altura da caixa). */
export function zonaDoNome({ x0, x1, y0, y1 }) {
  const h = y1 - y0;
  const x = x0 + Math.round(h * 1.05);
  const y = y0 + Math.round(h * 0.1);
  return { x, y, l: Math.max(1, x1 - Math.round(h * 0.1) - x), a: Math.max(1, y1 - Math.round(h * 0.1) - y) };
}

/** Quanto ampliar o nome para o leitor: as letras com uns 50 px. */
export const ampliacaoDoNome = (alturaDaCaixa) => Math.max(2, Math.min(8, Math.round(120 / Math.max(1, alturaDaCaixa))));

/**
 * Deixar o nome a preto no branco. As letras são claras sobre o vermelho, e o que as separa é o verde
 * (o vermelho tem g perto de 68, as letras perto de 180). O limite fica entre a mediana e o topo do
 * verde da zona (a `fracao` do caminho), para servir com o vídeo mais escuro ou mais claro. A meio
 * (0,5) as letras do 720p colavam umas às outras e o leitor não lia "leona"; com 0,6 e 0,7 os 13
 * quadros nítidos de test/telas-morte/ leem-se todos. Muda `dados` (RGBA) no sítio e devolve quantos
 * pixéis ficaram letra.
 */
export function nomeAPretoEBranco(dados, { fracao = 0.65 } = {}) {
  const n = dados.length / 4;
  if (!n) return 0;
  const gs = new Uint8Array(n);
  for (let i = 0; i < n; i++) gs[i] = dados[i * 4 + 1];
  const ordem = Uint8Array.from(gs).sort();
  const mediana = ordem[Math.floor(n / 2)];
  const topo = ordem[Math.min(n - 1, Math.floor(n * 0.99))];
  const limite = mediana + (topo - mediana) * fracao;
  let letras = 0;
  for (let i = 0; i < n; i++) {
    const sim = topo - mediana > 25 && gs[i] > limite;
    if (sim) letras++;
    const v = sim ? 0 : 255;
    dados[i * 4] = v; dados[i * 4 + 1] = v; dados[i * 4 + 2] = v; dados[i * 4 + 3] = 255;
  }
  return letras;
}

/** O nome lido, limpo: sem pontuação nas pontas, sem espaços a mais, e nada quando sobra pouco. */
export function limparNomeLido(texto) {
  const s = String(texto ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^[^\p{L}\p{N}[(]+/u, '').replace(/[^\p{L}\p{N}\])]+$/u, '');
  return base(s).length >= 2 ? s.slice(0, 40) : '';
}

/** De várias leituras do mesmo nome (quadros diferentes da mesma tela), a que mais se repete. */
export function escolherNome(leituras) {
  const conta = new Map();
  for (const l of leituras || []) {
    const s = limparNomeLido(l);
    if (!s) continue;
    const k = base(s);
    const c = conta.get(k) || { nome: s, n: 0 };
    c.n++;
    conta.set(k, c);
  }
  const ordem = [...conta.values()].sort((a, b) => b.n - a.n || b.nome.length - a.nome.length);
  return ordem[0]?.nome || '';
}

// ── a morte, como as do servidor ──────────────────────────────────────────

/**
 * Uma morte achada no vídeo, do mesmo feitio das do servidor (mortes.js): quem morreu é o canal, quem
 * matou é o nome lido ('' quando não se leu), e a hora é o instante exato no relógio dos vídeos
 * (absMs), sem fuso nem alinhamento.
 */
export function morteDoVideo({ canal, ms, matador = '' }) {
  const d = new Date(ms);
  return {
    matador: matador || '',
    vitima: canal,
    origem: 'video',
    // Leitura de TELA (vídeo), nunca log do servidor: titulo.js não a conta como prova de morte.
    fonte: 'video',
    hora: {
      data: d.toISOString().slice(0, 10), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), absMs: Math.round(ms),
    },
  };
}

/**
 * Juntar as mortes achadas agora às que já havia: a mesma vítima a menos de `folgaMs` é a mesma morte
 * (um segundo varrimento acha a mesma tela). Uma que antes ficou sem nome ganha o nome lido agora.
 */
export function juntarDoVideo(guardadas, novas, { folgaMs = 15_000 } = {}) {
  const saida = (guardadas || []).map((m) => ({ ...m }));
  let proximo = Math.max(0, ...saida.map((m) => (Number.isFinite(m.id) ? m.id + 1 : 0)));
  let entraram = 0;
  for (const n of novas || []) {
    const igual = saida.find((m) => m.origem === 'video' && base(m.vitima) === base(n.vitima)
      && Math.abs((m.hora?.absMs ?? 0) - (n.hora?.absMs ?? 0)) < folgaMs);
    if (igual) {
      if (!igual.matador && n.matador) igual.matador = n.matador;
      continue;
    }
    saida.push({ ...n, id: proximo++ });
    entraram++;
  }
  return { mortes: saida, novas: entraram };
}

/**
 * Confirmar quem matou pelo som: se o canal de quem matou tem tiros nos `antesMs` antes da morte (até
 * `depoisMs` depois, a tela demora a entrar), a morte fica confirmada e a marca dele vai para o tiro
 * mais perto. `tiros`: [{ ms, combateDeMs?, combateAteMs? }] do canal de quem matou (os da detecção).
 * Devolve { confirmado, msMatador } ou { confirmado: false }.
 */
export function confirmarPeloTiro(ms, tiros, { antesMs = 15_000, depoisMs = 3000 } = {}) {
  let melhor = null;
  for (const t of tiros || []) {
    if (!Number.isFinite(t?.ms)) continue;
    const de = Number.isFinite(t.combateDeMs) ? t.combateDeMs : t.ms;
    const ate = Number.isFinite(t.combateAteMs) ? t.combateAteMs : t.ms;
    if (ate < ms - antesMs || de > ms + depoisMs) continue;
    // O instante do lado de quem matou: o do pico, ou a borda do combate mais perto da morte.
    const msMatador = Math.min(Math.max(t.ms, ms - antesMs), ms + depoisMs);
    if (!melhor || Math.abs(msMatador - ms) < Math.abs(melhor - ms)) melhor = msMatador;
  }
  return melhor == null ? { confirmado: false } : { confirmado: true, msMatador: Math.round(melhor) };
}

/**
 * Onde olhar quando há tiros achados: de um pouco antes do começo do combate até bem depois do fim
 * (quem morre cai, fica abatido e só então vai para a tela). Devolve intervalos [deMs, ateMs] juntos.
 */
export function janelasDosTiros(tiros, { antesMs = 5000, depoisMs = 45_000 } = {}) {
  const lista = (tiros || []).filter((t) => Number.isFinite(t?.ms))
    .map((t) => [(Number.isFinite(t.combateDeMs) ? t.combateDeMs : t.ms) - antesMs, (Number.isFinite(t.combateAteMs) ? t.combateAteMs : t.ms) + depoisMs])
    .sort((a, b) => a[0] - b[0]);
  const saida = [];
  for (const [a, b] of lista) {
    const u = saida.at(-1);
    if (u && a <= u[1]) u[1] = Math.max(u[1], b);
    else saida.push([a, b]);
  }
  return saida;
}

/** O instante de um quadro no relógio do VOD: o do segmento onde ele começa, mais o PTS que passou. */
export function msDoPts(pts, pts0, inicioMs) {
  let d = pts - pts0;
  // O PTS dá a volta aos 2^33 ticks (26,5 h).
  if (d < -(2 ** 32)) d += 2 ** 33;
  return inicioMs + d / 90;
}
