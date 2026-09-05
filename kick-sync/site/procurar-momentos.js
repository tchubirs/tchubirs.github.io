import { medir, chao, impulsos, lutas, FPS, TAXA_TIROS } from './tiros.js';
import { recortar } from './aprender.js';

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
  opcoes = {}, taxaSom = TAXA_TIROS,
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
    // A energia em blocos de 2 ms, e nao a envolvente normalizada.
    //
    // A `envolvente` divide o som pelo seu proprio RMS a cada pedaco. Isso e
    // certo para ALINHAR dois canais — tira o volume da conta e compara so a
    // forma — e e o contrario do que aqui e preciso: "quando acontece um som
    // de disparo, e o pico praticamente mais alto do grafico". A forca ERA o
    // sinal, e eu dividia-a fora antes de olhar.
    const vazio = Math.round(duracaoS * FPS);
    const m = som ? medir(som, taxaSom)
      : { energia: new Float32Array(vazio), brilho: new Float32Array(vazio) };
    partes.push({ t, env: m.energia, brilho: m.brilho, som });
    ouvidoMs += duracaoS * 1000;
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
  const piso = chao(tudo);
  // Guardar a FORMA de cada estouro, para depois se poder aprender com uma
  // kill que ele confirme. Sao 60 ms cada um: uma noite inteira cabe em
  // dezenas de megas, e sem isto aprender obrigava a baixar a noite outra vez.
  const estouros = [];
  for (const parte of partes) {
    const { t, env, som } = parte;
    if (!som) continue;
    const piso2 = piso;
    for (const im of impulsos(env, piso2, { brilhos: parte.brilho, ...opcoes })) {
      const recorte = recortar(som, taxaSom, im.bloco / FPS);
      if (recorte) estouros.push({ ms: Math.round(t + (im.bloco / FPS) * 1000), altura: im.altura, recorte });
    }
  }
  // Um tecto: numa noite muito barulhenta isto podia crescer sem fim, e o que
  // interessa sao os mais altos.
  estouros.sort((a, b) => b.altura - a.altura);
  estouros.length = Math.min(estouros.length, 4000);
  // Ordenadas pelo tiro mais alto, e cortadas por cima. Numa noite de seis
  // horas cortar as mais baixas e cortar as que ele nao quer ver: o headshot e
  // o som mais alto do jogo. Quinze por hora e o que ele consegue rever.
  const { porHora = 15 } = opcoes;
  const limite = Math.max(1, Math.round((porHora * (ateMs - deMs)) / 3_600_000));
  const achadas = lutas(impulsos(tudo, piso, { brilhos, ...opcoes }), opcoes).slice(0, limite);
  return {
    candidatos: achadas.map((g) => ({
      // O instante e o do TIRO MAIS ALTO, e nao o do primeiro do tiroteio.
      // E ai que a coisa acontece — "quando ocorre um acerto na cabeca, o som
      // e muito alto" — e e esse frame que interessa ver.
      ms: Math.round(deMs + g.picoS * 1000),
      // O clipe e a RAJADA ate a morte, e nao o combate inteiro.
      //
      // "Os clipes sao de setenta segundos. Se eu configurei zero antes e zero
      //  depois, era pra ser exatamente: eu disparo, a pessoa morre, e acaba."
      //
      // Era: o clipe levava do primeiro ao ultimo disparo da luta — ate noventa
      // segundos — e as margens dele somavam-se por fora disso. Agora comeca na
      // rajada que leva ao tiro mais alto e acaba NESSE tiro, que e a morte.
      // Com as margens a zero da exactamente o que ele descreveu.
      combateDeMs: Math.round(deMs + g.rajadaDeS * 1000),
      // Um segundo de chao: se o tiro mais alto for o primeiro da rajada — um
      // headshot a primeira bala — as duas pontas seriam o mesmo instante, e um
      // clipe de duracao zero sai vazio do cortador sem dizer porque.
      combateAteMs: Math.round(deMs + Math.max(g.picoS, g.rajadaDeS + 1) * 1000),
      tiros: g.tiros,
      pico: g.pico,
      duracaoS: g.duracaoS,
    })),
    estouros,
    bytes,
    curva: tudo,
  };
}
