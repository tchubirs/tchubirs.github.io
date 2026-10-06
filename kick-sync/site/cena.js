// Os outros ângulos de um momento: quem mais ouviu o mesmo som no mesmo
// instante.
//
// Num evento de ~500 streamers de Rust em equipas de 4, "quem mais estava
// aqui?" é a pergunta que decide se um lance tem um ângulo ou cinco. Ninguém
// diz ao site quem estava com quem, e o jogo não dá posições. O som dá: dois
// canais no mesmo sítio ouvem os mesmos ataques (tiros, portas, explosões) no
// mesmo instante do relógio, só desviados pelo atraso fixo da subida de cada
// um para a Kick — o mesmo atraso que o alinhamento já corrige.
//
// Medido em VODs reais da Kick (MESMA-CENA.md, 06/10/2026) com as funções do
// próprio site (`envolvente` e `desvio` de sinal.js), janelas de 20 s que
// começam no mesmo instante do relógio, atraso procurado em ±8 s:
//   - juntos:    87 janelas, força >= 6 em 55, todas com o mesmo desvio (-0,42 s);
//   - separados: 87 janelas, força máxima 5,6.
// Daí os três números deste ficheiro (6, 5 e 0,25 s). Não são palpites: se
// mudarem, é porque se mediu outra vez (`probes/calibrar-cena.mjs`).
//
// O que NÃO está medido: atacante e defensor de times diferentes, sem conversa
// de voz em comum. Os dois canais medidos jogavam juntos e podem ter partilhado
// a voz. É por isso que os do mesmo time vão à frente na fila
// (`ordenarCandidatos`): é onde já se sabe que a resposta é boa.

import { envolvente, desvio, TAXA } from './sinal.js';

/**
 * A partir desta força o som em comum basta para dizer "estava lá".
 *
 * Nos dados medidos separa sem erro: 0 de 87 janelas separadas chegaram aqui.
 * O preço é que só 55 de 87 janelas juntas chegam — e é para não perder as
 * outras que existe o "talvez".
 */
export const FORCA_ESTAVA = 6;

/**
 * Abaixo disto é "não". Entre isto e FORCA_ESTAVA quem decide é uma segunda
 * janela, porque uma janela só, nessa faixa, ainda pode ser coincidência (a
 * maior força medida entre canais separados foi 5,6).
 */
export const FORCA_TALVEZ = 5;

/**
 * Quanto o desvio da segunda janela pode fugir do da primeira.
 *
 * Folga larga para quem estava junto — o desvio medido variou 0,02 s entre
 * janelas (de 0,41 a 0,43 s), porque é o atraso da subida de cada um e esse
 * não muda de um minuto para o outro. Apertada para uma coincidência, que cai
 * em qualquer ponto dos 16 s procurados: acertar por sorte a ±0,25 s do
 * primeiro desvio é ~3% de hipótese, e ainda tem de passar de 5 outra vez.
 */
export const TOLERANCIA_S = 0.25;

/**
 * O comprimento de janela em que 6 e 5 foram medidos, e o mínimo que se aceita.
 *
 * Com menos som, a mesma procura de 8 s para cada lado compara menos pontos
 * e o pico do acaso sobe. Medido aqui com o gerador de cliques dos testes, 150
 * comboios sem nada em comum com a referência, os dois lados do mesmo
 * comprimento: força >= 6 em 2 com 20 s, em 5 com 15 s, em 28 com 10 s. Mais
 * comprido só desce (0 em 150 com 30 e 40 s). Abaixo de 20 s os limites
 * deixavam de dizer o que dizem, e ninguém dava por isso.
 */
export const JANELA_S = 20;

/**
 * Quanto uma janela pode vir mais curta e ainda contar como inteira.
 *
 * O som descodificado pode acabar umas dezenas de ms antes do que a playlist
 * diz (frames de AAC, arredondamentos), e isso não é um VOD a acabar. Meio
 * segundo não mexe no acaso: 200 comboios sem nada em comum cortados a 19,5 s
 * deram força >= 6 em 3, contra 2 com 20 s inteiros (16 com 12 s, 63 com 8 s).
 */
const FOLGA_S = 0.5;

/** O mesmo erro que o resto da página usa para "o utilizador desistiu". */
function cancelado() {
  return new DOMException('cancelado', 'AbortError');
}

/**
 * Espera por `promessa`, mas larga-a logo que `sinal` dispare.
 *
 * "Cancelar" que espera pelo fim de um download de 700 KB não é cancelar: a
 * pessoa clica noutro momento e fica com duas procuras a correr. A promessa
 * largada continua a ser ouvida até ao fim, para que a rejeição dela não saia
 * como "não tratada" (no Node isso mata o processo).
 */
function contraOSinal(promessa, sinal) {
  if (!sinal) return promessa;
  return new Promise((ok, nao) => {
    const largar = () => nao(cancelado());
    sinal.addEventListener('abort', largar, { once: true });
    if (sinal.aborted) largar();
    // `Promise.resolve` porque um `somDe` síncrono (um teste, uma cache) pode
    // devolver o som directamente, sem promessa nenhuma à volta.
    Promise.resolve(promessa).then(
      (v) => { sinal.removeEventListener('abort', largar); ok(v); },
      (e) => { sinal.removeEventListener('abort', largar); nao(e); },
    );
  });
}

/**
 * O que identifica um canal, venha ele como nome ou como linha da página.
 *
 * A página passa linhas (`{ slug, ... }`), outros módulos passam nomes. Por
 * identidade, duas linhas do mesmo canal (uma delas recarregada) eram dois
 * canais e o mesmo som era descarregado duas vezes; pelo texto à letra,
 * "@Tchubi" e "tchubi" também. A regra é a de `vodsDoCanal` em kick.js.
 */
function chaveDoCanal(canal) {
  const nome = typeof canal === 'string' ? canal : canal?.slug;
  return typeof nome === 'string' ? nome.trim().replace(/^@/, '').toLowerCase() : canal;
}

/** Um bocado do som, seja ele Float32Array ou uma lista vulgar. */
function fatia(som, de, ate) {
  return typeof som.subarray === 'function' ? som.subarray(de, ate) : som.slice(de, ate);
}

/**
 * Há som aqui, ou só silêncio digital?
 *
 * Um canal com o microfone e o jogo em mudo dá uma envolvente sem ataques
 * nenhuns, e o `desvio` devolve força 0 — que sem este teste seria lida como
 * "não estava lá". Seria mentira: pode estar ao lado e simplesmente não se
 * ouvir. O limite (rms 1e-5, -100 dBFS) fica abaixo do degrau mais pequeno de
 * um áudio de 16 bits (3e-5), por isso nenhum microfone real fica abaixo dele.
 */
function temSom(som) {
  let energia = 0;
  for (let i = 0; i < som.length; i++) energia += som[i] * som[i];
  return Math.sqrt(energia / (som.length || 1)) >= 1e-5;
}

const medida = (m) => m != null && Number.isFinite(m.forca) && Number.isFinite(m.desvioS);

/** Quantos segundos de som vieram, para os avisos. */
const segundos = (som) => (som.length / TAXA).toFixed(1);

/**
 * A decisão, sozinha: de uma ou duas medições (`{ forca, desvioS }` de
 * `desvio`) para 'estava', 'talvez', 'nao' ou 'sem-som'.
 *
 * Separada da procura para os limites poderem ser testados exactamente na
 * fronteira, sem fabricar som que caia em 5,999.
 *
 * `segunda` em falta (ou sem medição) deixa um "talvez" como "talvez". É o
 * caso ao vivo: a gravação anda 2 a 12 s atrás do relógio (medido, ver
 * MESMA-CENA.md), e a janela seguinte a um lance de há 15 s ainda não existe.
 * Dizer "não" aí seria inventar uma resposta que nenhuma medição deu.
 */
export function classificar(primeira, segunda) {
  if (!medida(primeira)) return 'sem-som';
  if (primeira.forca >= FORCA_ESTAVA) return 'estava';
  if (primeira.forca < FORCA_TALVEZ) return 'nao';
  if (!medida(segunda)) return 'talvez';
  // A folga de 1e-9 é para a aritmética e não para o som: os desvios são
  // múltiplos de 0,01 s, e 0,66 - 0,41 dá 0,25000000000000006 em vírgula
  // flutuante — um "dentro de 0,25 s" que falhasse por isso seria um erro de
  // arredondamento a decidir quem estava num lance.
  const concorda = Math.abs(segunda.desvioS - primeira.desvioS) <= TOLERANCIA_S + 1e-9;
  return segunda.forca >= FORCA_TALVEZ && concorda ? 'estava' : 'nao';
}

/**
 * Por que ordem perguntar: o time da referência primeiro, depois todos os
 * outros que estavam no ar naquele instante. Quem não estava no ar fica de
 * fora — não pode ter ouvido nada que se possa mostrar.
 *
 * A ordem é o que a pessoa vê primeiro. Cada candidato custa ~700 KB (dois
 * segmentos de 160p, MESMA-CENA.md) e ~0,1 s de contas (medido aqui: ~95 ms
 * por `envolvente` de 20 s em node 22). Os 500 de um evento são ~350 MB e
 * quase um minuto de contas; os 3 colegas de time aparecem nos primeiros
 * segundos, e são os que mais provavelmente estavam lá — e o único caso já
 * medido (ver o topo do ficheiro).
 *
 * - `timeDe(canal)`: nome do time, ou null quando não se sabe. Comparado sem
 *   maiúsculas nem espaços nas pontas, porque o mesmo time escrito à mão em
 *   duas listas ("Time A", "time a ") é o mesmo time.
 * - `noAr(canal)`: se o canal estava a transmitir naquele instante. É
 *   obrigatório de propósito: sem ele a fila eram os 500 inteiros, e isso são
 *   350 MB gastos por esquecimento de quem chamou.
 *
 * Dentro de cada grupo mantém-se a ordem de entrada, e cada canal aparece uma
 * vez só.
 */
export function ordenarCandidatos({ referencia, canais, timeDe = () => null, noAr } = {}) {
  if (typeof noAr !== 'function') {
    throw new TypeError('ordenarCandidatos precisa de noAr(canal) para saber quem estava a transmitir');
  }
  if (typeof canais === 'string' || canais == null || typeof canais[Symbol.iterator] !== 'function') {
    throw new TypeError('ordenarCandidatos quer uma lista de canais');
  }
  const nomeDoTime = (c) => {
    const t = timeDe(c);
    const limpo = t == null ? '' : String(t).trim().toLowerCase();
    return limpo || null;
  };
  const timeDaRef = referencia == null ? null : nomeDoTime(referencia);
  const vistos = new Set([chaveDoCanal(referencia)]);
  const doTime = [];
  const resto = [];
  for (const c of canais) {
    if (c == null) continue;
    const k = chaveDoCanal(c);
    if (vistos.has(k) || !noAr(c)) continue;
    vistos.add(k);
    (timeDaRef != null && nomeDoTime(c) === timeDaRef ? doTime : resto).push(c);
  }
  return [...doTime, ...resto];
}

/**
 * Procura, entre `candidatos`, quem ouviu o mesmo som que `referencia` à volta
 * de `quandoMs`.
 *
 * Devolve cada candidato LOGO QUE fica decidido, e não pela ordem de entrada:
 * com 500 canais, quem esperasse pelo mais lento via a lista vazia durante um
 * minuto. Cada resultado é `{ canal, estado, forca, desvioS }`, e mais `erro`
 * quando o som desse canal falhou, e `aviso` quando veio só parte de uma
 * janela (o VOD começa ou acaba lá dentro) e por isso não se mediu:
 *   - 'estava'  — o mesmo som, com força. `desvioS` positivo => o candidato
 *                 chegou à Kick com MAIS atraso do que a referência; para ver
 *                 nele o mesmo instante, avança-se `desvioS` (é exactamente o
 *                 ajuste relativo que `resolver` de sinal.js daria).
 *   - 'talvez'  — força entre 5 e 6 e a segunda janela não pôde ser ouvida.
 *                 Também quando ela veio cortada (com `aviso`).
 *   - 'nao'     — sem som em comum. `desvioS` fica null: o pico de uma
 *                 coincidência não é um atraso, e não pode ir parar a um ajuste.
 *   - 'sem-som' — não havia som para comparar (fora do VOD, mudo, ou falhou).
 *                 Também quando só veio parte da janela (com `aviso`).
 *
 * - `somDe(canal, deMs, duracaoS, { sinal })`: o som de um canal, mono a
 *   8 kHz, a começar EXACTAMENTE em `deMs`, ou null. Na página é
 *   `somDoCanal` de alinhar.js; o `sinal` que recebe é largado quando a
 *   procura acaba ou é cancelada, para um download a meio parar de facto.
 * - A primeira janela começa em `quandoMs - janelaS / 2`: o momento fica no
 *   meio, com som antes e depois dele. `janelaS` não desce de JANELA_S (20 s),
 *   que é onde os limites foram medidos; uma janela que vem mais curta do que
 *   `janelaS` (tirando FOLGA_S) não é medida.
 * - `limiteS`: o maior atraso procurado. 8 s é o que foi medido; a gravação ao
 *   vivo anda 2 a 12 s atrás, mas isso é atraso de TODOS e não entre dois.
 * - `paralelos`: chamadas a `somDe` no ar, no máximo, contando as segundas
 *   janelas. 6 e não 50: as contas de cada janela (~95 ms) são feitas uma de
 *   cada vez na mesma thread que desenha a página, e um browser em HTTP/1.1
 *   não abre mais de 6 ligações ao mesmo servidor. Que mais pedidos no ar não
 *   acabem mais cedo não está medido; que põem mais som em memória à espera
 *   da vez, está garantido.
 * - `sinal`: ao disparar, não sai mais nenhum pedido, os que estão no ar são
 *   largados, e a procura rejeita logo com um AbortError. Sair do `for await`
 *   a meio (break) larga tudo da mesma maneira.
 *
 * Atira `REFERENCIA-SEM-SOM` quando a própria referência não tem som naquele
 * instante, ou só tem parte da janela: sem ela não há com que comparar, e 500
 * "sem-som" escondiam que o problema é um canal só. `SEM-DESCODIFICADOR` vindo
 * da referência passa também: é o primeiro som descodificado, e se o browser
 * não sabe AAC não vai saber para canal nenhum. Vindo de um candidato, já
 * depois de a referência se ter descodificado, é um problema só desse canal.
 */
export async function* procurarAngulos({
  quandoMs, referencia, candidatos, somDe,
  janelaS = JANELA_S, limiteS = 8, paralelos = 6, sinal,
} = {}) {
  if (!Number.isFinite(quandoMs)) {
    throw new TypeError(`quandoMs tem de ser um instante em ms (veio ${quandoMs})`);
  }
  if (typeof somDe !== 'function') {
    throw new TypeError('procurarAngulos precisa de somDe(canal, deMs, duracaoS)');
  }
  // Uma string é iterável, e 'tchubi' dava seis candidatos de uma letra.
  if (typeof candidatos === 'string' || candidatos == null
    || typeof candidatos[Symbol.iterator] !== 'function') {
    throw new TypeError('candidatos tem de ser uma lista de canais');
  }
  // Zero em paralelo nunca acaba; é um erro de quem chama e dizê-lo é melhor
  // do que pendurar a página.
  if (!Number.isInteger(paralelos) || paralelos < 1) {
    throw new RangeError(`paralelos tem de ser um inteiro >= 1 (veio ${paralelos})`);
  }
  if (!(limiteS > 0)) {
    throw new RangeError(`limiteS tem de ser positivo (veio ${limiteS})`);
  }
  // Uma janela curta demais é um erro de quem chama: dito aqui, e não depois
  // de descarregar a referência como se fosse ela a não ter som. E abaixo de
  // 20 s ainda há medida, mas os limites 6 e 5 já não querem dizer o mesmo.
  if (!(janelaS >= JANELA_S)) {
    throw new RangeError(`janelaS tem de ser >= ${JANELA_S} s, onde os limites foram medidos (veio ${janelaS})`);
  }
  if (sinal?.aborted) throw cancelado();

  // Cada canal uma vez, e nunca a própria referência: ela "estava lá" com
  // força infinita, e mostrá-la como outro ângulo dela própria é ruído.
  const vistos = new Set([chaveDoCanal(referencia)]);
  const fila = [];
  for (const c of candidatos) {
    if (c == null) continue;
    const k = chaveDoCanal(c);
    if (vistos.has(k)) continue;
    vistos.add(k);
    fila.push(c);
  }
  // Ninguém a quem perguntar: nem a referência se descarrega.
  if (!fila.length) return;

  const deMs = quandoMs - (janelaS * 1000) / 2;
  const n = Math.round(janelaS * TAXA);
  // Menos do que isto é uma janela cortada (o VOD começa ou acaba lá dentro,
  // ou ao vivo ainda não foi gravada), e os limites não valem para ela.
  const cheia = n - Math.round(FOLGA_S * TAXA);

  // Um sinal só nosso, que segue para cada `somDe`. Dispara quando o de fora
  // dispara e também quando quem lê sai do ciclo a meio — o de fora não sabe
  // desse segundo caso, e sem isto os downloads continuavam para ninguém.
  //
  // `parar` vai junto: é a única coisa que os trabalhadores olham, e um
  // `somDe` que ignore o sinal (uma cache, um caminho que devolve null antes
  // de ir à rede) acaba e deixa o trabalhador pedir o canal seguinte. Sem
  // isto, cancelar com a página ocupada (fora do `next`) não parava nada até
  // ela voltar a ler.
  let parar = false;
  const interno = new AbortController();
  const largar = () => { parar = true; interno.abort(); };
  sinal?.addEventListener('abort', largar, { once: true });

  try {
    // ── a referência ──────────────────────────────────────────────────────
    // Primeiro e sozinha: sem ela não há com que comparar, e um canal mudo
    // naquele instante deitaria fora seis downloads já a meio.
    //
    // Pedem-se as DUAS janelas de uma vez. A segunda só serve aos "talvez",
    // mas são 20 s a mais uma vez só (~700 KB), contra pedir de novo a meio
    // da procura, com 6 candidatos à espera dela.
    let somRef;
    try {
      somRef = await contraOSinal(somDe(referencia, deMs, 2 * janelaS, { sinal: interno.signal }), sinal);
    } catch (e) {
      if (e?.name === 'AbortError' || e?.name === 'SEM-DESCODIFICADOR') throw e;
      throw Object.assign(new Error(`a referência não se ouve naquele instante: ${e?.message ?? e}`), {
        name: 'REFERENCIA-SEM-SOM', cause: e,
      });
    }
    const ref1 = somRef?.length ? fatia(somRef, 0, n) : null;
    if (!ref1 || !temSom(ref1)) {
      throw Object.assign(new Error('a referência não tem som naquele instante'), { name: 'REFERENCIA-SEM-SOM' });
    }
    // Cortada, a janela da referência punha TODOS os candidatos contra uma
    // medida onde o acaso passa de 6: uma lista cheia de "estava" falsos, sem
    // nada que o mostrasse. Melhor dizê-lo, e a página pede outro instante.
    if (ref1.length < cheia) {
      throw Object.assign(new Error(
        `a referência só tem ${segundos(ref1)} s de som naquele instante (a medida pede ${janelaS} s)`,
      ), { name: 'REFERENCIA-SEM-SOM' });
    }
    const envRef = envolvente(ref1);
    // A segunda janela da referência só se calcula quando um "talvez" a pede:
    // são ~95 ms de contas que a maior parte das procuras nunca usa. Cortada
    // ou muda, não há com que comparar e o "talvez" fica "talvez".
    let envRef2;
    const segundaDaRef = () => {
      if (envRef2 !== undefined) return envRef2;
      const ref2 = fatia(somRef, n, 2 * n);
      envRef2 = ref2.length >= cheia && temSom(ref2) ? envolvente(ref2) : null;
      return envRef2;
    };

    // ── os candidatos ─────────────────────────────────────────────────────
    const prontos = [];
    let acordar = null;
    let falha = null;
    const avisar = () => { const f = acordar; acordar = null; f?.(); };

    // O único erro de um candidato que acaba com a procura toda é o
    // cancelamento. SEM-DESCODIFICADOR não: a referência já se descodificou
    // neste browser, por isso AAC há, e um canal que mesmo assim o atira tem
    // um problema só dele (um segmento que não começa num cabeçalho ADTS, uma
    // configuração de áudio que o browser recusa). Um streamer esquisito não
    // pode deixar os outros 499 sem resposta.
    const fatal = (e) => parar || e?.name === 'AbortError';

    // Devolve a medição, null quando não há som, ou `{ cortadaS }` quando veio
    // só parte da janela: os limites são de janelas inteiras, e numa cortada
    // o acaso chega a 6 (ver JANELA_S). Não se mede, e diz-se porquê.
    const ouvir = async (canal, de, envDaRef) => {
      const som = await somDe(canal, de, janelaS, { sinal: interno.signal });
      if (parar) throw cancelado();
      if (!som?.length) return null;
      const janela = fatia(som, 0, n);
      if (!temSom(janela)) return null;
      if (janela.length < cheia) return { cortadaS: segundos(janela) };
      // (candidato, referência) e não ao contrário: assim o desvio positivo
      // quer dizer "o candidato chegou mais tarde", que é o que a página
      // aplica nele. Fixado por um teste com um atraso conhecido.
      const m = desvio(envolvente(janela), envDaRef, { limiteS });
      return m.desvioS == null ? null : { forca: m.forca, desvioS: m.desvioS };
    };

    const umCandidato = async (canal) => {
      let erro;
      let aviso;
      let primeira = null;
      try {
        primeira = await ouvir(canal, deMs, envRef);
      } catch (e) {
        if (fatal(e)) throw e;
        // Um canal que não se consegue ouvir não pode matar a procura dos
        // outros: fica 'sem-som', com a razão dita.
        erro = e?.message ?? String(e);
      }
      if (primeira?.cortadaS != null) {
        aviso = `só ${primeira.cortadaS} s de som naquele instante (a medida pede ${janelaS} s): não se mediu`;
        primeira = null;
      }
      let estado = classificar(primeira);
      if (estado === 'talvez') {
        // Sem a segunda janela da referência não há com que comparar a do
        // candidato, e descarregá-la era gastar 700 KB para nada.
        const env2 = segundaDaRef();
        if (env2) {
          let segunda = null;
          try {
            segunda = await ouvir(canal, deMs + janelaS * 1000, env2);
          } catch (e) {
            if (fatal(e)) throw e;
            erro = e?.message ?? String(e);
          }
          if (segunda?.cortadaS != null) {
            aviso = `a segunda janela só tem ${segunda.cortadaS} s de som (a medida pede ${janelaS} s): fica "talvez"`;
            segunda = null;
          }
          estado = classificar(primeira, segunda);
        }
      }
      const r = {
        canal,
        estado,
        forca: primeira?.forca ?? 0,
        desvioS: estado === 'estava' || estado === 'talvez' ? primeira.desvioS : null,
      };
      if (erro !== undefined) r.erro = erro;
      if (aviso !== undefined) r.aviso = aviso;
      return r;
    };

    // Um lugar por chamada a `somDe` no ar: cada trabalhador faz uma de cada
    // vez, e por isso nunca há mais do que `paralelos`, segundas janelas
    // incluídas. A fila anda pela ordem de entrada — é a ordem de
    // `ordenarCandidatos` que põe o time à frente.
    let proximo = 0;
    const trabalhador = async () => {
      while (!parar && proximo < fila.length) {
        const r = await umCandidato(fila[proximo++]);
        if (parar) return;
        prontos.push(r);
        avisar();
      }
    };
    for (let i = 0; i < Math.min(paralelos, fila.length); i++) {
      trabalhador().catch((e) => {
        // Depois de parar, qualquer erro é eco do próprio cancelamento.
        if (parar) return;
        falha = e;
        parar = true;
        avisar();
      });
    }

    let entregues = 0;
    while (entregues < fila.length) {
      // Primeiro o cancelamento: quem leu devagar pode ter resultados à
      // espera, mas depois de "parar" não sai mais nenhum — a página já
      // passou a outro momento e um resultado tardio iria parar ao errado.
      if (sinal?.aborted) throw cancelado();
      if (falha) throw falha;
      if (prontos.length) {
        entregues++;
        yield prontos.shift();
        continue;
      }
      await contraOSinal(new Promise((ok) => { acordar = ok; }), sinal);
    }
  } finally {
    // Por aqui passa tudo: o fim normal, o cancelamento, um erro, e o `break`
    // de quem lê. Em todos, nenhum trabalhador pode pedir mais som.
    parar = true;
    sinal?.removeEventListener('abort', largar);
    interno.abort();
  }
}

/**
 * Os resultados de uma procura, arrumados para o ecrã.
 *
 * Os que estavam e os talvez vêm inteiros (com `desvioS`, que a página precisa
 * para pôr o ângulo no instante certo), do mais forte para o mais fraco; os
 * outros só contam. Ninguém quer ver 480 linhas a dizer "não".
 */
export function resumo(resultados) {
  const estava = [];
  const talvez = [];
  let nao = 0;
  let semSom = 0;
  for (const r of resultados ?? []) {
    if (r?.estado === 'estava') estava.push(r);
    else if (r?.estado === 'talvez') talvez.push(r);
    else if (r?.estado === 'nao') nao++;
    else if (r?.estado === 'sem-som') semSom++;
  }
  // `sort` é estável: com a mesma força fica quem chegou primeiro.
  const porForca = (a, b) => (b.forca ?? 0) - (a.forca ?? 0);
  return { estava: estava.sort(porForca), talvez: talvez.sort(porForca), nao, semSom };
}
