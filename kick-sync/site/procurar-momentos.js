import {
  medir, chao, impulsos, regioes, FPS, TAXA_TIROS, BLOCO_MS, REFRACTARIO_MS,
} from './tiros.js';
import { recortar } from './aprender.js';
import { juntar as juntarIntervalos } from './ouvir.js';
import { medirGraves, explosoes as acharExplosoes, FPS as FPS_EXPLOSOES } from './explosoes.js';
import { medirVoz, gritos as acharGritos, normalDaVoz, FPS as FPS_GRITOS } from './gritos.js';

// Achar as kills sozinho — pela forca do som.
//
// A PRIMEIRA versao disto procurava ritmo, e vivia neste ficheiro: oito
// ataques em cadencia, com um intervalo entre 0,07 e 0,28 s. Ele viu os quinze
// clipes que ela deu e nenhum era uma kill. A razao e aritmetica — esse
// intervalo e uma cadencia de 3,6 a 14 Hz, e a cadencia das silabas de quem
// fala e 4 a 7 Hz. Estava a construir um detector de fala. Fui ver o ecra dele
// num dos candidatos: estava parado no inventario a saquear um barril.
//
// A conta esta agora em `tiros.js`, e mede o que ele descreveu: forca e uma
// subida instantanea. O que ficou aqui e so a varredura — baixar a noite aos
// bocados sem a por toda em memoria.

/** Quantos MB custa varrer um bocado de noite, antes de o começar. */
export function custoVarrerMB(duracaoMs) {
  // O degrau mais barato da Kick anda nos ~280 kbps reais, medido.
  return Math.round(((duracaoMs / 1000) * 280_000) / 8 / 1048576);
}

// Quantos pedidos de segmento podem ir ao mesmo tempo, somando todos os bocados que estão a ser
// ouvidos. O dono, 10/10: "baixa um por vez". Um segmento de 2 s a 160p são uns 70 KB, e o que demora
// é a ida e volta de cada pedido, não os bytes: quatro ao mesmo tempo enchem a ligação sem a
// entupir, e é o mesmo número que um navegador abre por servidor quando ninguém lhe pede nada.
export const PEDIDOS_AO_MESMO_TEMPO = 4;
// Dois bocados a ser ouvidos ao mesmo tempo: enquanto um se descodifica e mede, o outro está a
// chegar. Mais do que dois não acelera (o limite é o dos pedidos) e prende mais som em memória.
const BOCADOS_AO_MESMO_TEMPO = 2;
// O que fica guardado do que já se ouviu, na sessão: as medidas de cada bocado, não o som. Uma hora
// de tiros são uns 14 MB de curva; o tecto deixa umas vinte horas de live guardadas, e passado ele
// sai o que foi ouvido há mais tempo.
const MEMORIA_MAX_BYTES = 320 * 1048576;
// Os recortes guardados por bocado (60 ms cada um): os mais fortes, e um tecto para a memória.
const RECORTES_POR_BOCADO = 1000;
// Menos do que isto não se pede: o `somDoCanal` não devolve som de um pedaço tão curto.
const MIN_PEDACO_MS = 5000;

/**
 * Um `buscar` que deixa no máximo `n` pedidos no ar ao mesmo tempo. O resto espera na fila, e sai
 * dela sem pedir nada quando o sinal do Parar chega.
 */
export function limitarPedidos(buscar, n = PEDIDOS_AO_MESMO_TEMPO) {
  let noAr = 0;
  const fila = [];
  const soltar = () => {
    noAr--;
    while (fila.length && noAr < n) {
      const proximo = fila.shift();
      if (!proximo.desistiu) { noAr++; proximo.vai(); }
    }
  };
  return async (url, init = {}) => {
    const sinal = init.signal;
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    if (noAr >= n) {
      await new Promise((vai, mal) => {
        const lugar = { vai, desistiu: false };
        fila.push(lugar);
        sinal?.addEventListener('abort', () => {
          lugar.desistiu = true;
          mal(new DOMException('cancelado', 'AbortError'));
        }, { once: true });
      });
    } else noAr++;
    try {
      return await buscar(url, init);
    } finally {
      soltar();
    }
  };
}

/** O que de `[a, b]` não está coberto por `cobertos` (juntos e por ordem). */
function oQueFalta(a, b, cobertos) {
  const falta = [];
  let de = a;
  for (const [x, y] of cobertos) {
    if (y <= de) continue;
    if (x >= b) break;
    if (x > de) falta.push([de, x]);
    de = Math.max(de, y);
    if (de >= b) break;
  }
  if (de < b) falta.push([de, b]);
  return falta;
}

/** Uma medida (os arrays dela) cortada do bloco `i0` ao `i1`, sem copiar. */
function cortarMedida(m, i0, i1) {
  if (!m) return m;
  const saida = {};
  for (const [k, v] of Object.entries(m)) saida[k] = ArrayBuffer.isView(v) ? v.subarray(i0, Math.min(v.length, i1)) : v;
  return saida;
}

/** Quantos bytes ocupa uma entrada da memória: as curvas e os recortes. */
function tamanhoDe(entrada) {
  let n = 0;
  const somar = (m) => { for (const v of Object.values(m || {})) if (ArrayBuffer.isView(v)) n += v.byteLength; };
  somar({ env: entrada.env, brilho: entrada.brilho });
  somar(entrada.graves);
  somar(entrada.voz);
  for (const c of entrada.recortes || []) n += c.recorte.byteLength + 24;
  return n;
}

/** Guardar uma entrada, e tirar as mais antigas (de qualquer canal) quando passa do tecto. */
function guardarNaMemoria(memoria, slug, entrada) {
  entrada.tamanho = tamanhoDe(entrada);
  if (!memoria.has(slug)) memoria.set(slug, []);
  memoria.get(slug).push(entrada);
  let total = 0;
  for (const lista of memoria.values()) for (const e of lista) total += e.tamanho;
  while (total > MEMORIA_MAX_BYTES) {
    let maisVelha = null;
    for (const lista of memoria.values()) for (const e of lista) if (!maisVelha || e.quando < maisVelha.quando) maisVelha = e;
    if (!maisVelha || maisVelha === entrada) break;
    for (const [k, lista] of memoria) {
      const i = lista.indexOf(maisVelha);
      if (i >= 0) { lista.splice(i, 1); if (!lista.length) memoria.delete(k); }
    }
    total -= maisVelha.tamanho;
  }
}

let relogioDaMemoria = 0;

/**
 * Ouvir um canal nos intervalos pedidos (por omissão, de `deMs` a `ateMs`) e devolver os candidatos.
 *
 * Aos bocados, e não de uma vez: uma hora de áudio a 8 kHz são 115 MB de
 * memória em números soltos, e o que interessa (a envolvente de ataques)
 * é muito menos. Guarda-se a envolvente e deita-se fora o som.
 *
 * `lerSom` é a mesma costura de `alinhar.js`: assim isto testa-se sem rede,
 * sem browser e sem codec. Recebe um `buscar` que deixa no máximo quatro pedidos no ar, somados os
 * bocados todos, e dois bocados são ouvidos ao mesmo tempo.
 *
 * `intervalos` (no relógio da noite) é o modo esperto: só uns minutos em volta dos picos do chat. O
 * chão continua a ser o de tudo o que se ouviu, e o que fica fora fica a zero na curva.
 *
 * `memoria` (um Map por canal, da sessão) guarda as medidas de cada bocado ouvido: o que já foi
 * ouvido de uma pessoa não se baixa outra vez, nem num trecho que o cruze, nem com o Parar a meio.
 */
export async function varrerNoite({
  linha, deMs, ateMs, intervalos = null, bocadoS = 300, lerSom, sinal, aoProgresso = () => {},
  opcoes = {}, taxaSom = TAXA_TIROS, nudgeMs = 0, filtros = { tiros: true },
  memoria = null, buscar = globalThis.fetch, pedidosAoMesmoTempo = PEDIDOS_AO_MESMO_TEMPO,
  bocadosAoMesmoTempo = BOCADOS_AO_MESMO_TEMPO,
}) {
  // O que se procura no som: os tiros (o de sempre), as explosões e os gritos. Cada medida custa uma
  // passagem pelo som, e só corre a que foi pedida.
  const querTiros = filtros?.tiros !== false;
  const querExplosoes = Boolean(filtros?.explosoes);
  const querGritos = Boolean(filtros?.gritos);
  const partes = [];
  // Os bocados cortados pelas pecas do canal, e nao so pelo relogio.
  //
  // O `somDoCanal` so le a peca onde o pedido comeca, e devolve nada quando o
  // pedido cai num buraco. Um bocado de cinco minutos que comecava num buraco,
  // ou que passava o fim de um VOD para o seguinte, perdia ate cinco minutos
  // do regresso do streamer, e e logo a seguir a cair que ele volta a lutar.
  //
  // `deMs`/`ateMs` e tudo o que sai daqui estao no relogio da noite, o mesmo
  // dos momentos. O ajuste do canal (`nudgeMs`) so entra no pedido de som,
  // que e no relogio do proprio VOD, como o `onde` da grelha faz. A memoria
  // guarda no relogio do VOD, que nao muda quando o ajuste muda.
  const pedidos = juntarIntervalos((intervalos || [[deMs, ateMs]])
    .map(([a, b]) => [Math.max(deMs, a), Math.min(ateMs, b)]));
  const pecas = linha?.pecas?.length
    ? linha.pecas.map((p) => [p.playlist.inicio - nudgeMs, p.playlist.fim - nudgeMs])
    : [[deMs, ateMs]];
  const alvo = [];
  for (const [inicio, fim] of pecas) {
    for (const [a, b] of pedidos) {
      const de = Math.max(a, inicio);
      const ate = Math.min(b, fim);
      if (ate > de) alvo.push([de, ate]);
    }
  }
  const alvos = juntarIntervalos(alvo);
  const totalMs = alvos.reduce((s, [a, b]) => s + (b - a), 0);

  // O que a memoria ja tem deste canal, com as medidas que agora se pedem.
  const slug = linha?.slug ?? '';
  const serve = (e) => (!querTiros || e.env) && (!querExplosoes || e.graves) && (!querGritos || e.voz);
  const guardadas = (memoria?.get(slug) || []).filter(serve);
  const cobertos = juntarIntervalos(guardadas.map((e) => [e.de - nudgeMs, e.ate - nudgeMs]));

  // Os estouros candidatos, ja recortados. O som de cada bocado nao pode ficar
  // ate ao fim: uma hora a 24 kHz sao 345 MB, e a noite toda deitava o
  // separador abaixo. Por isso os recortes tiram-se JA, com o som na mao, e o
  // som vai-se embora com o bocado.
  const poco = [];
  const meterNoPoco = (parte, recortes) => {
    for (const c of recortes) poco.push({ parte, bloco: c.bloco, energia: c.energia, recorte: c.recorte });
    if (poco.length > TECTO_ESTOUROS * 3) {
      poco.sort((a, b) => b.energia - a.energia);
      poco.length = TECTO_ESTOUROS * 2;
    }
  };

  // Uma entrada (nova ou da memoria) vista so entre `a` e `b` do relogio da noite.
  const usar = (e, a, b) => {
    const t0 = e.de - nudgeMs;
    const de = Math.max(a, t0);
    const parte = { t: de };
    const iT = Math.max(0, Math.round(((de - t0) / 1000) * FPS));
    const fT = Math.round(((Math.min(b, e.ate - nudgeMs) - t0) / 1000) * FPS);
    if (querTiros && e.env) {
      parte.env = e.env.subarray(iT, Math.min(e.env.length, fT));
      parte.brilho = e.brilho.subarray(iT, Math.min(e.brilho.length, fT));
    }
    const i10 = Math.max(0, Math.round(((de - t0) / 1000) * FPS_EXPLOSOES));
    const f10 = Math.round(((Math.min(b, e.ate - nudgeMs) - t0) / 1000) * FPS_EXPLOSOES);
    if (querExplosoes) parte.graves = cortarMedida(e.graves, i10, f10);
    if (querGritos) parte.voz = cortarMedida(e.voz, Math.round(i10 * FPS_GRITOS / FPS_EXPLOSOES), Math.round(f10 * FPS_GRITOS / FPS_EXPLOSOES));
    partes.push(parte);
    if (querTiros && e.env) {
      meterNoPoco(parte, (e.recortes || [])
        .filter((c) => c.bloco >= iT && c.bloco < fT)
        .map((c) => ({ ...c, bloco: c.bloco - iT })));
    }
  };

  // O que ja estava ouvido entra logo; o que falta vira bocados.
  let ouvidoMs = 0;
  const trechos = [];
  // O que ficou ouvido de facto (da memoria ou agora), para a faixa o mostrar mais escuro.
  const prontos = [];
  for (const [a, b] of alvos) {
    for (const e of guardadas) {
      const de = Math.max(a, e.de - nudgeMs);
      const ate = Math.min(b, e.ate - nudgeMs);
      if (ate > de) {
        usar(e, de, ate);
        ouvidoMs += ate - de;
        prontos.push([de, ate]);
        aoProgresso({ pronto: [de, ate], ouvidoMs, totalMs });
      }
    }
    for (const [x, y] of oQueFalta(a, b, cobertos)) {
      if (y - x < MIN_PEDACO_MS && cobertos.length) { ouvidoMs += y - x; continue; }
      for (let t = x; t < y; t += bocadoS * 1000) trechos.push([t, Math.min(y, t + bocadoS * 1000)]);
    }
  }

  const reaproveitadoMs = ouvidoMs;
  const total = Math.max(1, trechos.length);
  let feitos = 0;
  let bytes = 0;
  let falhados = 0;
  let ultimoErro = null;
  const buscarLimitado = buscar ? limitarPedidos(buscar, pedidosAoMesmoTempo) : undefined;
  const contar = () => aoProgresso({ feito: Math.min(feitos, total), total, bytes, ouvidoS: ouvidoMs / 1000, ouvidoMs, totalMs });
  contar();

  let proximo = 0;
  let parou = null;
  const umOuvinte = async () => {
    while (proximo < trechos.length && !parou) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const [t, fimT] = trechos[proximo++];
      const duracaoS = (fimT - t) / 1000;
      feitos++;
      let som = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        som = await lerSom(linha, t + nudgeMs, duracaoS, {
          contador: (n) => { bytes += n; contar(); },
          sinal,
          buscar: buscarLimitado,
          paralelo: pedidosAoMesmoTempo,
        });
      } catch (e) {
        // Um 503 na hora cinco nao pode deitar fora as cinco anteriores: o
        // bocado fica por ouvir, como um que caiu num buraco, e conta-se.
        // Cancelar e um navegador sem descodificador nao sao falhas de um
        // bocado: sao a resposta para a noite inteira.
        if (e.name === 'AbortError' || e.name === 'SEM-DESCODIFICADOR') { parou = e; throw e; }
        falhados++;
        ultimoErro = e;
      }
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      // Um bocado que não se consegue ouvir não pode deslocar o resto no tempo:
      // cada bocado vai para o seu sítio do relógio, e o que fica no meio fica a
      // zero na curva, mas fora da conta do chão (ver abaixo).
      // A energia em blocos de 2 ms, e nao a envolvente normalizada: a forca
      // ERA o sinal ("quando acontece um som de disparo, e o pico praticamente
      // mais alto do grafico"), e a envolvente dividia-a fora.
      if (som) {
        const e = { de: t + nudgeMs, ate: fimT + nudgeMs, quando: ++relogioDaMemoria };
        if (querTiros) {
          const m = medir(som, taxaSom);
          e.env = m.energia;
          e.brilho = m.brilho;
          e.recortes = recortesDe(e.env, som, taxaSom, opcoes);
        }
        if (querExplosoes) e.graves = medirGraves(som, taxaSom);
        if (querGritos) e.voz = medirVoz(som, taxaSom);
        som = null;
        usar(e, t, fimT);
        if (memoria) guardarNaMemoria(memoria, slug, e);
        prontos.push([t, fimT]);
        aoProgresso({ pronto: [t, fimT], ouvidoMs: ouvidoMs + (fimT - t), totalMs });
      }
      ouvidoMs += fimT - t;
      contar();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(bocadosAoMesmoTempo, trechos.length)) }, umOuvinte));
  // Os bocados chegam fora de ordem quando dois andam ao mesmo tempo; a curva cola-se pelo relogio.
  partes.sort((a, b) => a.t - b.t);
  // Nada se ouviu e houve erros: o erro e a unica resposta que ha. Dizer
  // "nao ouvi som nenhum" escondia um problema de rede atras de um de canal.
  if (falhados && !partes.length) throw ultimoErro;

  const { porHora = 15 } = opcoes;
  const limite = Math.max(1, Math.round((porHora * (totalMs || (ateMs - deMs))) / 3_600_000));
  // As explosões e os gritos, cada um contra o normal da noite inteira desta pessoa, como os tiros.
  const explosoes = !querExplosoes ? [] : paraOMomento(acharExplosoes(
    colar(partes, 'graves', ['forca', 'grave'], deMs, ateMs, FPS_EXPLOSOES),
    chao(ouvidosDe(partes, 'graves', 'forca')),
    opcoes.explosoes,
  ), deMs, limite);
  const gritos = !querGritos ? [] : paraOMomento(acharGritos(
    colar(partes, 'voz', ['forca', 'voz'], deMs, ateMs, FPS_GRITOS),
    normalDaVoz(ouvidosDe(partes, 'voz', 'voz')),
    opcoes.gritos,
  ), deMs, limite);
  if (!querTiros) {
    return {
      ouvido: null, candidatos: [], estouros: [], explosoes, gritos, bytes, falhados, curva: new Float32Array(0),
      cobertura: juntarIntervalos(prontos), reaproveitadoMs,
    };
  }

  // Colar tudo numa só, com cada bocado no seu sítio do relógio.
  const fps = FPS;
  const comprimento = Math.round(((ateMs - deMs) / 1000) * fps);
  const tudo = new Float32Array(Math.max(0, comprimento));
  // O brilho anda ao lado da energia e nao dentro dela: e uma razao entre duas
  // bandas do mesmo instante, e por isso nao se soma nem se cola — copia-se
  // para o mesmo sitio do relogio, bloco a bloco.
  const brilhos = new Float32Array(Math.max(0, comprimento));
  for (const { t, env, brilho } of partes) {
    if (!env) continue;
    const o = Math.round(((t - deMs) / 1000) * fps);
    for (let i = Math.max(0, -o); i < env.length && o + i < tudo.length; i++) {
      tudo[o + i] = env[i];
      brilhos[o + i] = brilho[i];
    }
  }

  // O chao e da NOITE INTEIRA e nao de cada bocado: senao um bocado calado
  // passa a ter os seus proprios "picos mais altos", e a lista enche-se de
  // silencio com estalidos.
  //
  // Mas so do que SE OUVIU. Os bocados que faltaram estao a zero na curva, e
  // com mais de metade da janela fora do ar a mediana dava zero, e com o
  // chao a zero nao ha nada "acima do chao": o tiroteio verdadeiro sumia e a
  // mensagem dizia que nao se tinha ouvido som nenhum.
  const comEnv = partes.filter((p) => p.env);
  const ouvidos = new Float32Array(comEnv.reduce((s, p) => s + p.env.length, 0));
  let k = 0;
  for (const p of comEnv) { ouvidos.set(p.env, k); k += p.env.length; }
  const piso = chao(ouvidos);
  // Guardar a FORMA de cada estouro, para depois se poder aprender com uma
  // kill que ele confirme. Sao 60 ms cada um: uma noite inteira cabe em
  // dezenas de megas, e sem isto aprender obrigava a baixar a noite outra vez.
  const estouros = estourosAcimaDo(poco, piso, opcoes, linha?.slug);
  // Ordenadas pelo tiro mais alto, e cortadas por cima. Numa noite de seis
  // horas cortar as mais baixas e cortar as que ele nao quer ver: o headshot e
  // o som mais alto do jogo. Quinze por hora e o que ele consegue rever.
  // Os bocados que estiveram altos e ASSIM FICARAM, ordenados pelo tempo
  // quente. Ver `regioes` em `tiros.js` para a medicao que matou a procura
  // por impulsos soltos: o tiroteio verdadeiro dele dava ZERO com ela.
  const achadas = regioes(tudo, piso, opcoes).slice(0, limite);

  // O que se ouviu, para quando nao se achou nada.
  //
  // "Da isso, porem eu sei que ta tendo tiroteio." A mensagem so sabia dizer
  // "nenhum tiroteio nesse intervalo", que e a mesma coisa que nao dizer nada.
  const dos = impulsos(tudo, piso, { brilhos, ...opcoes });
  const semBrilho = impulsos(tudo, piso, { ...opcoes, brilhos: null });
  const ouvido = {
    altos: semBrilho.length,
    chumbados: semBrilho.length - dos.length,
    passaram: dos.length,
    maiorGrupo: achadas.length,
  };
  return {
    ouvido,
    candidatos: achadas.map((g) => ({
      // O instante e o do som MAIS ALTO da regiao. E ai que a coisa acontece —
      // "quando ocorre um acerto na cabeca, o som e muito alto" — e e esse o
      // frame que o "quem morreu" tem de ver.
      ms: Math.round(deMs + g.picoS * 1000),
      // E o clipe e a regiao inteira: do momento em que aquilo comecou a ser
      // alto ate ao momento em que arrefeceu. No tiroteio verdadeiro dele isso
      // da 219,4 s a 226,0 s — comeca antes do primeiro tiro que se ouve e
      // acaba depois de ele morrer, aos 222.
      combateDeMs: Math.round(deMs + g.inicioS * 1000),
      combateAteMs: Math.round(deMs + Math.max(g.fimS, g.inicioS + 2) * 1000),
      tiros: Math.round(g.quenteS * 10) / 10,
      pico: g.pico,
      duracaoS: g.fimS - g.inicioS,
    })),
    estouros,
    explosoes,
    gritos,
    bytes,
    falhados,
    curva: tudo,
    cobertura: juntarIntervalos(prontos),
    reaproveitadoMs,
  };
}

/**
 * Uma medida de cada bocado, colada no seu sítio do relógio da noite (o que não se ouviu fica a zero).
 * `campo` é a medida dentro da parte (`graves`, `voz`) e `chaves` as curvas dela.
 */
function colar(partes, campo, chaves, deMs, ateMs, fps) {
  const n = Math.max(0, Math.round(((ateMs - deMs) / 1000) * fps));
  const saida = Object.fromEntries(chaves.map((k) => [k, new Float32Array(n)]));
  for (const p of partes) {
    const m = p[campo];
    if (!m) continue;
    const o = Math.round(((p.t - deMs) / 1000) * fps);
    for (const k of chaves) {
      const de = m[k];
      for (let i = 0; i < de.length && o + i < n; i++) if (o + i >= 0) saida[k][o + i] = de[i];
    }
  }
  return saida;
}

/** Só o que se ouviu, junto, para o chão: os bocados que faltaram não podem puxar o normal para zero. */
function ouvidosDe(partes, campo, chave) {
  const listas = partes.map((p) => p[campo]?.[chave]).filter(Boolean);
  const saida = new Float32Array(listas.reduce((s, l) => s + l.length, 0));
  let k = 0;
  for (const l of listas) { saida.set(l, k); k += l.length; }
  return saida;
}

/**
 * Do que uma medida achou (em segundos desde `deMs`) para o que a lista de momentos usa: o instante do
 * pico, e o clipe do começo ao fim do som, com pelo menos dois segundos. Os mais fortes ficam quando
 * passam do limite da hora, e saem pela ordem do relógio.
 */
function paraOMomento(achados, deMs, limite) {
  return [...achados].sort((a, b) => b.pico - a.pico).slice(0, limite)
    .sort((a, b) => a.inicioS - b.inicioS)
    .map((g) => ({
      ms: Math.round(deMs + g.picoS * 1000),
      combateDeMs: Math.round(deMs + g.inicioS * 1000),
      combateAteMs: Math.round(deMs + Math.max(g.fimS, g.inicioS + 2) * 1000),
      pico: g.pico,
      duracaoS: g.duracaoS,
    }));
}

// Um tecto: numa noite muito barulhenta isto podia crescer sem fim, e o que
// interessa sao os mais altos.
const TECTO_ESTOUROS = 4000;

/**
 * Os blocos de um bocado que podem vir a ser estouros, ja com o recorte.
 *
 * O que decide um estouro e a altura contra o chao da NOITE, e o chao so se
 * conhece no fim. O resto nao depende dele: o salto contra os 2 ms anteriores
 * e uma razao do proprio bocado. Por isso guardam-se aqui os que saltam, com a
 * energia, e a altura decide-se depois em `estourosAcimaDo`.
 *
 * Sem o filtro de brilho, de proposito: o tiroteio verdadeiro dele mede 0,005
 * a 0,118 de brilho (ver `regioes` em `tiros.js`), e com o filtro os recortes
 * deixavam de fora os tiros que ele aponta como referencia. Quem separa um
 * tiro de uma silaba aqui e a forma de onda, em `parecidos`.
 */
function recortesDe(env, som, taxa, { saltoMin = 6 } = {}) {
  const novos = [];
  for (let b = 1; b < env.length; b++) {
    if (!(env[b] > 0) || env[b] / (env[b - 1] + 1e-9) < saltoMin) continue;
    novos.push(b);
  }
  // Os mais fortes primeiro: se o bocado der mais do que o tecto, os que
  // sobram sao os que nunca iam passar a frente dos outros.
  novos.sort((a, b) => env[b] - env[a]);
  const saida = [];
  for (const b of novos) {
    if (saida.length >= RECORTES_POR_BOCADO) break;
    const recorte = recortar(som, taxa, b / FPS);
    if (recorte) saida.push({ bloco: b, energia: env[b], recorte });
  }
  return saida;
}

/**
 * Os estouros a serio, agora que o chao da noite e conhecido: as mesmas
 * regras de `impulsos` (altura contra o chao, e um estalo conta uma vez)
 * sobre os candidatos que o `recolherEstouros` guardou.
 */
function estourosAcimaDo(poco, piso, {
  alturaMin = 8, refractarioMs = REFRACTARIO_MS,
} = {}, canal = null) {
  if (!piso) return [];
  const refractario = Math.round(refractarioMs / BLOCO_MS);
  const ordem = poco
    .filter((c) => c.energia / piso >= alturaMin)
    .sort((a, b) => (a.parte.t - b.parte.t) || (a.bloco - b.bloco));
  const estouros = [];
  let ultimo = null;
  for (const c of ordem) {
    if (ultimo && ultimo.parte === c.parte && c.bloco - ultimo.bloco < refractario) continue;
    ultimo = c;
    estouros.push({
      ms: Math.round(c.parte.t + (c.bloco / FPS) * 1000),
      altura: c.energia / piso,
      recorte: c.recorte,
      // De que canal veio o som. O "Usar como referencia" punha os achados no
      // canal em foco na altura do clique, e os sons eram de quem foi ouvido.
      canal,
    });
  }
  estouros.sort((a, b) => b.altura - a.altura);
  estouros.length = Math.min(estouros.length, TECTO_ESTOUROS);
  return estouros;
}
