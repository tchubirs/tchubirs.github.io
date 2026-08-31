import { envolvente, TAXA } from './sinal.js';

// Achar as kills sozinho — a conta.
//
// "Não faço ideia de qual é o timing, marco a kill sem saber." E antes disso:
// nem sequer sabe onde estão as kills numa noite de cinco horas.
//
// O sinal é o tiroteio. Um tiro é um ataque curto e forte; uma luta é uma
// RAJADA deles, muitos em poucos segundos. Música alta, uma explosão, um grito
// — tudo isso faz um pico sozinho. O que separa uma luta é a densidade: muitos
// ataques fortes juntos, e não um só.
//
// Por isso não se procura o pico mais alto. Procura-se onde a envolvente de
// ataques ferve durante alguns segundos seguidos.

/** Os instantes dos ataques: onde a envolvente sobe acima do limiar. */
export function ataques(envelope, { limiar = 3 } = {}) {
  const saida = [];
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > limiar && (i === 0 || envelope[i - 1] <= limiar)) saida.push(i);
  }
  return saida;
}

/**
 * Rajadas: ataques em CADÊNCIA, mesmo com barulho pelo meio.
 *
 * Duas medições levaram aqui.
 *
 * A primeira: "cinco ataques fortes em três segundos" dava quarenta candidatos
 * em meia hora de som verdadeiro — porque é isso que é FALAR. Cada sílaba é um
 * ataque, e um streamer fala a noite inteira.
 *
 * A segunda: exigir que os ataques SEGUIDOS tivessem o intervalo todo igual
 * também não serve. Durante um tiroteio grita-se, e um grito no meio parte a
 * corrente — os tiros continuam lá, em cadência, mas deixam de ser
 * consecutivos.
 *
 * Então procura-se PERIODICIDADE: dado um período, quantos ataques caem numa
 * grelha desse período. Um grito a mais não estraga a grelha; simplesmente não
 * cai nela. É a mesma ideia de um pente sobre os instantes.
 */
export function rajadas(indices, {
  fps = 100, minTiros = 8, intervaloMinS = 0.07, intervaloMaxS = 0.28,
  janelaS = 4, folgaS = 0.01, pureza = 0.75,
} = {}) {
  if (indices.length < minTiros) return [];
  const janela = janelaS * fps;
  const folga = Math.max(1, Math.round(folgaS * fps));
  const pMin = Math.max(2, Math.round(intervaloMinS * fps));
  const pMax = Math.round(intervaloMaxS * fps);

  const achadas = [];
  for (let a = 0; a < indices.length; a++) {
    let b = a;
    while (b + 1 < indices.length && indices[b + 1] - indices[a] <= janela) b++;
    if (b - a + 1 < minTiros) continue;
    const dentro = indices.slice(a, b + 1);

    // O período sai dos intervalos que EXISTEM, e não de uma varredura cega:
    // cada par de ataques dentro do alcance de uma arma vota no seu intervalo.
    const votos = new Map();
    for (let x = 0; x < dentro.length; x++) {
      for (let y = x + 1; y < dentro.length; y++) {
        const d = dentro[y] - dentro[x];
        if (d < pMin || d > pMax) continue;
        votos.set(d, (votos.get(d) || 0) + 1);
      }
    }
    if (!votos.size) continue;

    // E a fase é testada a partir de CADA ataque. Ancorar só no primeiro era o
    // erro anterior: se a janela começa numa sílaba antes da rajada, a grelha
    // fica desalinhada e a rajada inteira passa despercebida.
    let melhor = null;
    for (const p of votos.keys()) {
      for (const base of dentro) {
        const caem = dentro.filter((x) => {
          const resto = ((x - base) % p + p) % p;
          return Math.min(resto, p - resto) <= folga;
        });
        // Além de serem muitos, os tiros têm de ser a MAIORIA do que se ouve
        // ali. É esta a regra que separa mesmo: numa rajada quase tudo o que
        // se ouve são os tiros; numa conversa a grelha apanha uma minoria das
        // sílabas e o resto fica de fora. Sem isto, escolher o melhor de
        // trezentas combinações de período e fase encontrava ritmo em
        // qualquer coisa.
        if (caem.length >= minTiros
          && caem.length >= dentro.length * pureza
          && (!melhor || caem.length > melhor.caem.length)) {
          melhor = { caem, p };
        }
      }
    }
    if (!melhor) continue;

    achadas.push({
      inicio: melhor.caem[0],
      fim: melhor.caem.at(-1),
      tiros: melhor.caem.length,
      cadenciaS: melhor.p / fps,
    });
    // Saltar para o fim desta rajada: senão a mesma seria encontrada outra vez
    // a partir de cada um dos seus tiros.
    while (a < indices.length && indices[a] <= melhor.caem.at(-1)) a++;
    a--;
  }
  return achadas;
}

/** Quantos segundos de noite estão nesta envolvente. */
const forcaTotalS = (fps, envelope) => (envelope?.length ? envelope.length / fps : 0);

/**
 * Da envolvente aos candidatos.
 *
 * Rajadas próximas juntam-se: um tiroteio é várias rajadas seguidas, e o que
 * se quer marcar é a LUTA, não cada carregador.
 */
export function candidatos(envelope, {
  fps = 100, inicioMs = 0, juntarS = 8, maxLutaS = 90, distanciaMinS = 25,
  porHora = 15, maximo = null, ...opcoes
} = {}) {
  const encontradas = rajadas(ataques(envelope, opcoes), { fps, ...opcoes });
  if (!encontradas.length) return [];

  const lutas = [];
  for (const r of encontradas) {
    const ultima = lutas.at(-1);
    // Juntar só até um limite. Sem ele, uma cadeia de rajadas espaçadas ia
    // colando a noite inteira num único "combate" de dez minutos — e o
    // instante marcado ficava no princípio da noite, longe de tudo.
    if (ultima && (r.inicio - ultima.fim) / fps < juntarS
      && (r.fim - ultima.inicio) / fps <= maxLutaS) {
      ultima.fim = r.fim;
      ultima.tiros += r.tiros;
      ultima.rajadas++;
    } else {
      lutas.push({ ...r, rajadas: 1 });
    }
  }

  // Quantos entregar. Medido em som verdadeiro: meia hora do Rust dá duas
  // dúzias de tiroteios, e rever duas dúzias é quase rever a noite. O que
  // interessa são os maiores — por isso o limite é por hora e as lutas grandes
  // ficam à frente das escaramuças.
  const tecto = maximo ?? Math.max(5, Math.round((porHora * (forcaTotalS(fps, envelope))) / 3600));
  lutas.sort((a, b) => b.tiros - a.tiros);
  const distancia = distanciaMinS * fps;
  const escolhidas = [];
  for (const l of lutas) {
    if (escolhidas.length >= tecto) break;
    if (escolhidas.some((e) => Math.abs(e.inicio - l.inicio) < distancia)) continue;
    escolhidas.push(l);
  }

  return escolhidas
    .map((l) => ({
      ms: Math.round(inicioMs + (l.inicio / fps) * 1000),
      duracaoS: (l.fim - l.inicio) / fps,
      tiros: l.tiros,
      rajadas: l.rajadas,
      cadenciaS: l.cadenciaS,
      // A nota é o tamanho da luta: mais tiros e mais carregadores é mais
      // provável que valha um clipe.
      nota: l.tiros + l.rajadas * 2,
    }))
    .sort((a, b) => a.ms - b.ms);
}

// ── varrer a noite ──────────────────────────────────────────────────────────

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
  linha, deMs, ateMs, bocadoS = 300, lerSom, sinal, aoProgresso = () => {}, opcoes = {},
}) {
  const partes = [];
  const total = Math.max(1, Math.ceil((ateMs - deMs) / (bocadoS * 1000)));
  let feitos = 0;
  let ouvidoMs = 0;
  let bytes = 0;

  for (let t = deMs; t < ateMs; t += bocadoS * 1000) {
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    const duracaoS = Math.min(bocadoS, (ateMs - t) / 1000);
    aoProgresso({ feito: ++feitos, total, bytes, ouvidoS: ouvidoMs / 1000 });
    const som = await lerSom(linha, t, duracaoS, {
      contador: (n) => { bytes += n; },
      sinal,
    });
    // Um bocado que não se consegue ouvir não pode deslocar o resto no tempo:
    // guarda-se o silêncio equivalente para a linha continuar a bater certo.
    const env = som ? envolvente(som) : new Float32Array(Math.round(duracaoS * 100));
    partes.push({ t, env });
    ouvidoMs += duracaoS * 1000;
  }

  // Colar as envolventes numa só, com cada bocado no seu sítio do relógio.
  const fps = TAXA / 80;
  const comprimento = Math.round(((ateMs - deMs) / 1000) * fps);
  const tudo = new Float32Array(Math.max(0, comprimento));
  for (const { t, env } of partes) {
    const o = Math.round(((t - deMs) / 1000) * fps);
    for (let i = 0; i < env.length && o + i < tudo.length; i++) tudo[o + i] = env[i];
  }

  return { candidatos: candidatos(tudo, { fps, inicioMs: deMs, ...opcoes }), bytes, curva: tudo };
}
