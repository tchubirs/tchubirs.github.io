// Seguir um evento enquanto ele acontece.
//
// Medido em 06/10/2026 em três canais de Rust ao vivo: a transmissão em curso
// já aparece na lista de VODs do canal (`is_live` verdadeiro, duração 0), e a
// playlist dela é a MESMA que `lerPlaylist` já lê — PROGRAM-DATE-TIME em cada
// segmento, PLAYLIST-TYPE EVENT, e um EXT-X-ENDLIST no fim de cada leitura.
// Cada pedido devolve a lista inteira outra vez, uns segmentos mais comprida,
// e o último segmento pronto acabou entre 2,2 e 11,8 s antes do relógio.
//
// Ou seja: o ao vivo não precisa de um leitor novo. Precisa de três coisas
// pequenas, e são as deste ficheiro: saber o que chegou de novo desde a última
// leitura, saber até onde TODOS os ângulos já chegaram, e voltar a pedir a
// um ritmo que não castigue a Kick nem o computador de quem está a ver.

/** Mais do que isto sem segmento novo é alguém que saiu do ar. */
export const LIMITE_FORA_DO_AR_MS = 120_000;
/** O ritmo normal: medido, o atraso do ao vivo anda entre 2 e 12 s. */
export const INTERVALO_MS = 10_000;
/** O máximo a que um erro atrás de outro faz esperar. */
export const TETO_MS = 60_000;

// ── O que chegou de novo ───────────────────────────────────────────────────

/**
 * O endereço de um segmento sem `?…` nem `#…`.
 *
 * Os segmentos da Kick são `0.ts`, `1.ts`, sem nada à frente. Mas um CDN que
 * passe a assinar os endereços muda o `?token=` a cada pedido, e aí o mesmo
 * segmento parecia novo em todas as leituras — cada pedaço era tratado duas,
 * três, dez vezes. Tirar a query custa uma linha e fecha essa porta.
 */
function semQuery(url) {
  return String(url ?? '').replace(/[?#].*$/, '');
}

/**
 * Um índice dos segmentos de uma leitura: endereço -> instantes de início.
 *
 * Endereço E instante, porque nenhum dos dois chega sozinho: uma transmissão
 * que recomeça pode voltar a chamar `0.ts` ao primeiro pedaço (o endereço
 * repete-se, o instante não), e um segmento sem PROGRAM-DATE-TIME só se
 * reconhece pelo endereço.
 */
function indice(segmentos) {
  const m = new Map();
  for (const s of segmentos) {
    const k = semQuery(s.url);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s.inicio);
  }
  return m;
}

function conhecido(idx, s) {
  const inicios = idx.get(semQuery(s.url));
  if (!inicios) return false;
  // Sem relógio de um dos lados não há instante para comparar, e o endereço
  // é tudo o que resta. Exigir os dois deitava fora segmentos verdadeiros.
  if (!Number.isFinite(s.inicio)) return true;
  return inicios.some((t) => !Number.isFinite(t) || t === s.inicio);
}

/** O primeiro instante com relógio de uma lista de segmentos, ou null. */
function primeiroInstante(segmentos) {
  let min = Infinity;
  for (const s of segmentos) if (Number.isFinite(s.inicio) && s.inicio < min) min = s.inicio;
  return min === Infinity ? null : min;
}

/**
 * Uma leitura feita de `nova` mais os segmentos de `antiga` que ela não tem,
 * com a forma de `lerPlaylist` (quem a guardar pode dá-la a `linhaDoCanal`,
 * que lê `inicio`, `fim` e `fonteDoRelogio`).
 *
 * A base é `nova` e não `antiga`: se o CDN assinar os endereços, os dela são
 * os que ainda valem. Os `mediaT` ficam como vieram, porque o leitor carrega
 * a playlist da Kick e não esta; o que esta junta é para a próxima
 * comparação saber tudo o que já se viu.
 */
function juntar(nova, faltam) {
  const segmentos = [...nova.segmentos, ...faltam];
  // Pela ordem do relógio quando todos o têm. Sem ele não há ordem a
  // recuperar, e para comparar a ordem não conta: os que faltavam vão no fim.
  if (segmentos.every((s) => Number.isFinite(s.inicio))) segmentos.sort((a, b) => a.inicio - b.inicio);
  const comRelogio = segmentos.filter((s) => Number.isFinite(s.inicio));
  let fim = null;
  for (const s of comRelogio) fim = Math.max(fim ?? -Infinity, s.inicio + (s.duracaoS || 0) * 1000);
  return {
    ...nova,
    segmentos,
    fonteDoRelogio: comRelogio.length === segmentos.length ? 'program-date-time'
      : comRelogio.length ? 'program-date-time-parcial' : 'sem-relogio',
    inicio: primeiroInstante(comRelogio),
    fim,
    duracaoS: segmentos.reduce((t, s) => t + (s.duracaoS || 0), 0),
  };
}

/**
 * Os segmentos de `nova` que `antiga` ainda não tinha.
 *
 * `antiga` e `nova` são o que `lerPlaylist` devolve, em duas leituras da
 * mesma playlist ao vivo. Devolve:
 *
 *   novos       os segmentos de `nova` que não estavam em `antiga`, pela
 *               ordem da playlist
 *   recomecou   `nova` é outra transmissão: não tem nenhum segmento de
 *               `antiga` e não é mais velha do que ela
 *   recuou      `nova` não trouxe nada e falta-lhe o que `antiga` tinha, ou
 *               é uma cópia de uma transmissão mais VELHA do que a guardada:
 *               um CDN com uma cópia atrasada
 *   playlist    a leitura a guardar para a próxima comparação
 *
 * `playlist` vem já decidida, e não deixada ao chamador, pela mesma razão
 * por que `resolver` (em sinal.js) devolve o ajuste e não o desvio: é aqui
 * que o erro fácil mora. Quem guardasse sempre `nova` deitava fora, numa
 * leitura atrasada, os segmentos que já tinha — e na leitura seguinte eles
 * voltavam como "novos", e eram processados duas vezes. Pela mesma razão,
 * uma leitura que traz alguma coisa nova mas a que falta o que `antiga` tinha
 * (uma atrasada que preenche um buraco, uma janela que desliza) guarda-se
 * JUNTA com a anterior, e não no lugar dela.
 *
 * "Continua" quer dizer que `nova` tem pelo menos um segmento de `antiga`, e
 * não que começa no PRIMEIRO de `antiga`. Numa playlist EVENT é o mesmo; mas
 * se a Kick alguma vez cortar o princípio de uma transmissão de doze horas
 * (uma janela que desliza), a regra estreita dizia "recomeçou" em todas as
 * leituras, e cada leitura parecia uma transmissão nova. Nem chega olhar para
 * o primeiro segmento de `nova`: numa cópia atrasada da janela ele já saiu da
 * guardada, e a leitura inteira voltava como nova.
 */
export function novosSegmentos(antiga, nova) {
  const velhos = antiga?.segmentos ?? [];
  const agora = nova?.segmentos ?? [];

  // Uma leitura vazia não é uma transmissão nova: é uma resposta sem nada,
  // e o que já se tinha continua a valer.
  if (!agora.length) {
    return { novos: [], recomecou: false, recuou: velhos.length > 0, playlist: antiga ?? nova ?? null };
  }
  // A primeira leitura: tudo é novo, e não há nada de que recomeçar.
  if (!velhos.length) return { novos: [...agora], recomecou: false, recuou: false, playlist: nova };

  // Filtrar em vez de cortar a partir do último conhecido: se um segmento
  // aparecer no meio (um que faltava na leitura anterior), também é novo.
  const idx = indice(velhos);
  const novos = agora.filter((s) => !conhecido(idx, s));

  if (novos.length === agora.length) {
    // Nada em comum. Uma transmissão nova começa DEPOIS da anterior; se esta
    // começa antes, é uma cópia velha que um CDN ainda serve (a de antes de
    // um recomeço no mesmo caminho, que volta a chamar `0.ts`). Tomá-la por
    // recomeço trocava a guardada por ela, a seguinte parecia outro recomeço,
    // e o ao vivo andava para trás e para a frente com tudo a repetir-se.
    const inicioNova = primeiroInstante(agora);
    const inicioAntiga = primeiroInstante(velhos);
    if (inicioNova != null && inicioAntiga != null && inicioNova < inicioAntiga) {
      return { novos: [], recomecou: false, recuou: true, playlist: antiga };
    }
    return { novos, recomecou: true, recuou: false, playlist: nova };
  }

  const idxNova = indice(agora);
  const faltam = velhos.filter((s) => !conhecido(idxNova, s));
  const recuou = !novos.length && faltam.length > 0;
  const playlist = recuou ? antiga : faltam.length ? juntar(nova, faltam) : nova;
  return { novos, recomecou: false, recuou, playlist };
}

// ── Até onde todos já chegaram ─────────────────────────────────────────────

/**
 * A borda do ao vivo: o instante mais recente que TODOS os ângulos no ar já
 * têm.
 *
 * `linhas` são as de `linhaDoCanal` (relogio.js); daqui só se lê `slug` e
 * `fim` — o fim do último segmento com relógio do canal. Devolve:
 *
 *   comumMs    o mínimo dos fins de quem está no ar, no relógio partilhado;
 *              é até aqui que um "ao vivo" em todos os ângulos pode ir sem
 *              que um deles fique preto à espera
 *   porCanal   Map slug -> fim, no relógio partilhado, de TODOS os canais
 *              com um fim conhecido (a página desenha a barra de cada um)
 *   atrasoMs   quanto a borda comum está atrás de agora
 *   vivos      quem entrou na conta
 *   foraDoAr   quem ficou de fora por não ter nada novo há mais de
 *              `limiteMs` — dito pelo nome, como em sinal.js, e não posto a
 *              zero em silêncio
 *   repetidos  slugs que vieram mais de uma vez (ver abaixo), para a página
 *              avisar quem montou a lista
 *   agoraMs    o "agora" que se usou (ver a correcção abaixo)
 *
 * Porquê deixar de fora quem saiu do ar: com 500 streamers há SEMPRE alguém
 * que caiu, que acabou mais cedo, ou cuja internet foi abaixo. O mínimo de
 * todos ficava preso no último segmento dele e o "ao vivo" do evento inteiro
 * parava ali. 120 s são doze segmentos de 10 s sem nada: não é atraso, é
 * ausência.
 *
 * `nudges` são os ajustes de cada canal (os de `alinharPeloSom`, os mesmos
 * que `onde` recebe). Um canal com +3 s mostra no instante Q o que ele próprio
 * carimbou em Q + 3 s, por isso no relógio partilhado o vídeo dele acaba 3 s
 * mais cedo. Sem isto, a borda prometia 3 s que esse ângulo não tem.
 */
export function bordaAoVivo(linhas, { agoraMs = Date.now(), limiteMs = LIMITE_FORA_DO_AR_MS, nudges = {} } = {}) {
  // O mesmo slug duas vezes (o mesmo streamer colado em dois times, ou em
  // duas linhas do elenco) é um canal só. Antes, um deles podia ir para
  // `vivos` e o outro para `foraDoAr`, e a borda de todos ficava presa no fim
  // do que estava fora do ar, conforme a ordem da lista. Conta o fim mais
  // recente, como em quem caiu e voltou, e o slug fica em `repetidos`.
  const fimDe = new Map();
  const repetidos = new Set();
  for (const l of linhas || []) {
    if (!l || !Number.isFinite(l.fim)) continue;
    if (fimDe.has(l.slug)) repetidos.add(l.slug);
    fimDe.set(l.slug, Math.max(fimDe.get(l.slug) ?? -Infinity, l.fim));
  }
  const comFim = [...fimDe].map(([slug, fim]) => ({ slug, fim }));
  // Os ajustes viajam no link partilhado, que é texto de fora: um valor que
  // não seja um número conta como zero, em vez de pôr NaN na borda de todos.
  // Nem um "3000" entre aspas passa: em `onde` isso somava texto ao instante.
  const ajuste = (slug) => {
    const n = nudges?.[slug];
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };
  const porCanal = new Map(comFim.map((l) => [l.slug, l.fim - ajuste(l.slug)]));

  // O relógio do computador pode estar errado, e a playlist diz quando está
  // ATRASADO: nenhum segmento acaba no futuro, logo se algum acaba depois do
  // "agora" deste computador, o agora verdadeiro é pelo menos esse. Sem isto,
  // um PC 60 s atrasado via como "no ar" quem tinha saído há 150 s.
  //
  // Adiantado não se apanha daqui: a mais de dois minutos de avanço todos
  // parecem fora do ar ao mesmo tempo. Fica dito para quem vier depois — o
  // sinal certo nesse caso é a playlist continuar a crescer (`novosSegmentos`).
  const maisRecente = comFim.length ? Math.max(...comFim.map((l) => l.fim)) : -Infinity;
  // Um "agora" que não é número (NaN tornava falsa toda a comparação, e toda
  // a gente passava por estar no ar) vale o relógio do computador.
  const agora = Math.max(Number.isFinite(agoraMs) ? agoraMs : Date.now(), maisRecente);

  const vivos = [];
  const foraDoAr = [];
  for (const l of comFim) (agora - l.fim > limiteMs ? foraDoAr : vivos).push(l.slug);

  // A borda não passa do agora. Um ajuste negativo (medido: -5,71 s) põe o
  // fim desse canal DEPOIS do agora no relógio partilhado: com ele 2,2 s
  // atrás do ar, a borda ficava 3,5 s no futuro e o atraso dava negativo.
  // Puxar o `agora` para lá não serve: os ajustes vêm do link, que é texto de
  // fora, e um de -10 min mexido à mão mandava toda a gente para fora do ar.
  // No agora, todos os que estão no ar ainda têm vídeo (o mínimo deles é
  // maior), e `porCanal` continua a mostrar até onde cada um chega.
  const minimo = vivos.length ? Math.min(...vivos.map((s) => porCanal.get(s))) : null;
  const comumMs = minimo == null ? null : Math.min(minimo, agora);
  return {
    comumMs,
    porCanal,
    atrasoMs: comumMs == null ? null : agora - comumMs,
    vivos,
    foraDoAr,
    repetidos: [...repetidos],
    agoraMs: agora,
  };
}

// ── Voltar a pedir ─────────────────────────────────────────────────────────

/**
 * Esperar `ms`, mas acordar mais cedo se o pedido for cancelado ou se o
 * separador mudar de visível para escondido (ou ao contrário).
 *
 * Acordar na mudança de visibilidade é o que faz o regresso ao separador
 * parecer instantâneo: quem volta de outra janela quer ver o ao vivo de
 * agora, não o de há um minuto mais os segundos que faltavam ao temporizador.
 * E os browsers abrandam os temporizadores de um separador escondido para um
 * por minuto, por isso sem isto o regresso podia esperar um minuto inteiro.
 */
export function dormir(ms, { sinal, doc = globalThis.document } = {}) {
  return new Promise((resolve) => {
    if (sinal?.aborted) { resolve(); return; }
    let relogio = null;
    const acordar = () => {
      clearTimeout(relogio);
      sinal?.removeEventListener('abort', acordar);
      doc?.removeEventListener?.('visibilitychange', acordar);
      resolve();
    };
    relogio = setTimeout(acordar, Math.max(0, Number(ms) || 0));
    sinal?.addEventListener('abort', acordar, { once: true });
    doc?.addEventListener?.('visibilitychange', acordar);
  });
}

/** Sem `document` (testes, um worker) não há separador escondido. */
function visivelPorOmissao() {
  return globalThis.document ? globalThis.document.visibilityState === 'visible' : true;
}

/**
 * Chamar `atualizar()` de `intervaloMs` em `intervaloMs`, enquanto a página
 * está à vista, até `sinal` ser cancelado.
 *
 * As regras, e porquê cada uma:
 *
 *  - Nunca duas ao mesmo tempo. Com 500 canais, uma volta pode demorar mais
 *    do que o intervalo (ler 500 listas mediu-se em 20 a 40 s); começar outra
 *    por cima duplicava a carga exactamente quando a Kick já está lenta.
 *  - O intervalo conta do INÍCIO da volta anterior. Contado do fim, uma volta
 *    de 4 s fazia do "a cada 10 s" um "a cada 14 s", e o ao vivo ia ficando
 *    para trás sem ninguém perceber porquê. Uma volta mais longa do que o
 *    intervalo encadeia na seguinte sem pausa — mas sem sobrepor.
 *  - Escondida, a página não pede nada. Ninguém está a ver, e 500 playlists
 *    a cada 10 s num separador esquecido é rede e bateria de outra pessoa
 *    gastas por nada. Ao voltar a ficar visível, pede logo, se já for hora.
 *  - Depois de um erro, a espera dobra (20, 40, 60 s) e fica nos 60; um
 *    sucesso volta ao normal. Um 429 da Kick quer dizer "abranda", e insistir
 *    ao mesmo ritmo só prolonga o castigo. A espera do erro conta a partir do
 *    FIM da volta falhada: é folga para o outro lado, e uma volta que falhou
 *    por demorar 30 s não pode encadear logo noutra.
 *  - Voltar ao separador não salta a espera de um erro. Era uma porta
 *    escondida para martelar a Kick com alt-tabs.
 *
 * O relógio (`agora`) e o temporizador (`esperar`) vêm de fora para os testes
 * correrem num instante. Por omissão, `performance.now()` e não `Date.now()`:
 * é monótono, e um relógio de sistema acertado a meio do evento (NTP, fuso)
 * não pode transformar uma espera de 10 s em zero ou numa hora.
 *
 * Devolve uma promessa que acaba quando `sinal` é cancelado, com quantas
 * voltas correram e quantas falharam. Um erro em `atualizar` nunca a rejeita:
 * é contado, passado a `aoErro`, e a volta seguinte espera mais. Um erro em
 * `visivel` também não: a página conta como visível (o ritmo continua a ser
 * o do intervalo) e o erro vai para `aoErro` com `de: 'visivel'`. Só a
 * rejeitam as peças do próprio relógio: um `agora` que não dá números ou um
 * `esperar` que rebenta. Sem elas não há maneira de continuar que não seja
 * pedir sem pausa, por isso param alto, como uma configuração errada.
 */
export async function agendar({
  atualizar,
  intervaloMs = INTERVALO_MS,
  visivel = visivelPorOmissao,
  esperar = (ms, opcoes) => dormir(ms, opcoes),
  agora = () => performance.now(),
  sinal,
  tetoMs = TETO_MS,
  aoErro = () => {},
} = {}) {
  if (typeof atualizar !== 'function') throw new TypeError('agendar: falta a função atualizar');
  // Um intervalo zero, negativo ou NaN fazia disto um ciclo sem pausa contra
  // a Kick. Melhor partir aqui, alto, do que descobri-lo por um 429.
  if (!(Number.isFinite(intervaloMs) && intervaloMs > 0)) {
    throw new RangeError(`agendar: intervalo inválido (${intervaloMs})`);
  }
  // O teto pela mesma regra. Antes, um NaN (ou 0) aqui passava a ser o
  // intervalo sem dizer nada, e a espera depois de um erro deixava de crescer:
  // cada 429 era seguido de outro pedido ao ritmo normal.
  if (!(Number.isFinite(tetoMs) && tetoMs > 0)) {
    throw new RangeError(`agendar: teto inválido (${tetoMs})`);
  }
  // Um intervalo pedido maior do que o teto não pode ENCOLHER depois de um
  // erro — isso era insistir mais depressa por ter falhado.
  const teto = Math.max(tetoMs, intervaloMs);

  // Um relógio que dê NaN torna falsa a comparação `falta > 0`, e as voltas
  // saíam umas atrás das outras sem esperar: o ciclo sem pausa contra a Kick
  // que o intervalo inválido já recusa. Lê-se sempre por aqui.
  const relogio = () => {
    const t = agora();
    if (!Number.isFinite(t)) throw new RangeError(`agendar: o relógio deu ${t}`);
    return t;
  };
  // O aviso é para o ecrã; um erro no ecrã não pode parar o relógio. Nem um
  // `aoErro` assíncrono que rejeite: no node uma rejeição solta derruba o
  // processo, e no browser suja a consola a cada volta.
  const avisar = (e, info) => {
    try { Promise.resolve(aoErro(e, info)).catch(() => {}); } catch { /* ver acima */ }
  };

  let passo = intervaloMs;
  let proxima = relogio();
  let voltas = 0;
  let erros = 0;
  let seguidos = 0;

  while (!sinal?.aborted) {
    const falta = proxima - relogio();
    if (falta > 0) { await esperar(falta, { sinal }); continue; }
    let aVista = true;
    try { aVista = visivel(); } catch (e) { avisar(e, { esperaMs: 0, seguidos, de: 'visivel' }); }
    if (!aVista) { await esperar(intervaloMs, { sinal }); continue; }

    const inicio = relogio();
    try {
      await atualizar({ sinal });
      voltas++;
      seguidos = 0;
      passo = intervaloMs;
      proxima = inicio + intervaloMs;
    } catch (e) {
      // Cancelado por quem pediu não é um erro: é o fim combinado. Um
      // AbortError que NÃO vem do nosso sinal (um pedido interno com o seu
      // próprio limite de tempo) é uma falha como outra qualquer.
      if (sinal?.aborted) break;
      voltas++;
      erros++;
      seguidos++;
      passo = Math.min(passo * 2, teto);
      proxima = relogio() + passo;
      avisar(e, { esperaMs: passo, seguidos });
    }
  }
  return { voltas, erros };
}
