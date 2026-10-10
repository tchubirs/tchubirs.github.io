import {
  medir, chao, impulsos, regioes, FPS, TAXA_TIROS, BLOCO_MS, REFRACTARIO_MS,
} from './tiros.js';
import { recortar } from './aprender.js';
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

/**
 * Ouvir um canal do princípio ao fim de uma janela e devolver os candidatos.
 *
 * Aos bocados, e não de uma vez: uma hora de áudio a 8 kHz são 115 MB de
 * memória em números soltos, e o que interessa — a envolvente de ataques a
 * 100 Hz — são 1,4 MB. Guarda-se a envolvente e deita-se fora o som.
 *
 * `lerSom` é a mesma costura de `alinhar.js`: assim isto testa-se sem rede,
 * sem browser e sem codec.
 */
export async function varrerNoite({
  linha, deMs, ateMs, bocadoS = 300, lerSom, sinal, aoProgresso = () => {},
  opcoes = {}, taxaSom = TAXA_TIROS, nudgeMs = 0, filtros = { tiros: true },
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
  // que e no relogio do proprio VOD, como o `onde` da grelha faz.
  const trechos = [];
  const pecas = linha?.pecas?.length
    ? linha.pecas.map((p) => [p.playlist.inicio - nudgeMs, p.playlist.fim - nudgeMs])
    : [[deMs, ateMs]];
  for (const [inicio, fim] of pecas) {
    const de = Math.max(deMs, inicio);
    const ate = Math.min(ateMs, fim);
    for (let t = de; t < ate; t += bocadoS * 1000) trechos.push([t, Math.min(ate, t + bocadoS * 1000)]);
  }
  const total = Math.max(1, trechos.length);
  let feitos = 0;
  let ouvidoMs = 0;
  let bytes = 0;
  let falhados = 0;
  let ultimoErro = null;
  // Os estouros candidatos, ja recortados. O som de cada bocado nao pode ficar
  // ate ao fim: uma hora a 24 kHz sao 345 MB, e a noite toda deitava o
  // separador abaixo. Por isso os recortes tiram-se JA, com o som na mao, e o
  // som vai-se embora com o bocado.
  const poco = [];

  for (const [t, fimT] of trechos) {
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    const duracaoS = (fimT - t) / 1000;
    aoProgresso({ feito: ++feitos, total, bytes, ouvidoS: ouvidoMs / 1000 });
    let som = null;
    try {
      som = await lerSom(linha, t + nudgeMs, duracaoS, {
        contador: (n) => { bytes += n; },
        sinal,
      });
    } catch (e) {
      // Um 503 na hora cinco nao pode deitar fora as cinco anteriores: o
      // bocado fica por ouvir, como um que caiu num buraco, e conta-se.
      // Cancelar e um navegador sem descodificador nao sao falhas de um
      // bocado: sao a resposta para a noite inteira.
      if (e.name === 'AbortError' || e.name === 'SEM-DESCODIFICADOR') throw e;
      falhados++;
      ultimoErro = e;
    }
    // Um bocado que não se consegue ouvir não pode deslocar o resto no tempo:
    // cada bocado vai para o seu sítio do relógio, e o que fica no meio fica a
    // zero na curva, mas fora da conta do chão (ver abaixo).
    // A energia em blocos de 2 ms, e nao a envolvente normalizada.
    //
    // A `envolvente` divide o som pelo seu proprio RMS a cada pedaco. Isso e
    // certo para ALINHAR dois canais — tira o volume da conta e compara so a
    // forma — e e o contrario do que aqui e preciso: "quando acontece um som
    // de disparo, e o pico praticamente mais alto do grafico". A forca ERA o
    // sinal, e eu dividia-a fora antes de olhar.
    if (som) {
      const parte = { t };
      if (querTiros) {
        const m = medir(som, taxaSom);
        parte.env = m.energia;
        parte.brilho = m.brilho;
        recolherEstouros(poco, parte, som, taxaSom, opcoes);
      }
      if (querExplosoes) parte.graves = medirGraves(som, taxaSom);
      if (querGritos) parte.voz = medirVoz(som, taxaSom);
      partes.push(parte);
    }
    ouvidoMs += duracaoS * 1000;
  }
  // Nada se ouviu e houve erros: o erro e a unica resposta que ha. Dizer
  // "nao ouvi som nenhum" escondia um problema de rede atras de um de canal.
  if (falhados && !partes.length) throw ultimoErro;

  const { porHora = 15 } = opcoes;
  const limite = Math.max(1, Math.round((porHora * (ateMs - deMs)) / 3_600_000));
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
    const o = Math.round(((t - deMs) / 1000) * fps);
    for (let i = 0; i < env.length && o + i < tudo.length; i++) {
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
  const ouvidos = new Float32Array(partes.reduce((s, p) => s + p.env.length, 0));
  let k = 0;
  for (const p of partes) { ouvidos.set(p.env, k); k += p.env.length; }
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
function recolherEstouros(poco, parte, som, taxa, { saltoMin = 6 } = {}) {
  const { env } = parte;
  const novos = [];
  for (let b = 1; b < env.length; b++) {
    if (!(env[b] > 0) || env[b] / (env[b - 1] + 1e-9) < saltoMin) continue;
    novos.push(b);
  }
  // Os mais fortes primeiro: se o bocado der mais do que o tecto, os que
  // sobram sao os que nunca iam passar a frente dos outros.
  novos.sort((a, b) => env[b] - env[a]);
  for (const b of novos.slice(0, TECTO_ESTOUROS * 2)) {
    const recorte = recortar(som, taxa, b / FPS);
    if (recorte) poco.push({ parte, bloco: b, energia: env[b], recorte });
  }
  // O poco tambem tem tecto, com folga para a regra dos 70 ms poder tirar
  // alguns sem a lista final ficar curta.
  if (poco.length > TECTO_ESTOUROS * 3) {
    poco.sort((a, b) => b.energia - a.energia);
    poco.length = TECTO_ESTOUROS * 2;
  }
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
