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

/**
 * Os segmentos de `nova` que `antiga` ainda não tinha.
 *
 * `antiga` e `nova` são o que `lerPlaylist` devolve, em duas leituras da
 * mesma playlist ao vivo. Devolve:
 *
 *   novos       os segmentos de `nova` que não estavam em `antiga`, pela
 *               ordem da playlist
 *   recomecou   `nova` não continua `antiga`: o primeiro segmento dela não
 *               existe na leitura anterior, logo é outra transmissão
 *   recuou      `nova` é uma leitura mais VELHA do que `antiga` (menos
 *               segmentos, nada novo) — um CDN com uma cópia atrasada
 *   playlist    a leitura a guardar para a próxima comparação
 *
 * `playlist` vem já decidida, e não deixada ao chamador, pela mesma razão
 * por que `resolver` (em sinal.js) devolve o ajuste e não o desvio: é aqui
 * que o erro fácil mora. Quem guardasse sempre `nova` deitava fora, numa
 * leitura atrasada, os segmentos que já tinha — e na leitura seguinte eles
 * voltavam como "novos", e eram processados duas vezes.
 *
 * "Continua" quer dizer que o primeiro segmento de `nova` existe em `antiga`,
 * e não que é o PRIMEIRO de `antiga`. Numa playlist EVENT é o mesmo; mas se a
 * Kick alguma vez cortar o princípio de uma transmissão de doze horas (uma
 * janela que desliza), a regra estreita dizia "recomeçou" em todas as
 * leituras, e cada leitura parecia uma transmissão nova.
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

  const idx = indice(velhos);
  if (!conhecido(idx, agora[0])) {
    return { novos: [...agora], recomecou: true, recuou: false, playlist: nova };
  }

  // Filtrar em vez de cortar a partir do último conhecido: se um segmento
  // aparecer no meio (um que faltava na leitura anterior), também é novo.
  const novos = agora.filter((s) => !conhecido(idx, s));
  const recuou = !novos.length && agora.length < velhos.length;
  return { novos, recomecou: false, recuou, playlist: recuou ? antiga : nova };
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
  const comFim = (linhas || []).filter((l) => l && Number.isFinite(l.fim));
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

  // Iterar `vivos` e não procurar o mínimo de outra maneira: dois canais com
  // o mesmo slug (um erro de quem montou a lista) ficariam com o último fim no
  // Map, e a conta tem de ser a mesma que o Map mostra.
  const comumMs = vivos.length ? Math.min(...vivos.map((s) => porCanal.get(s))) : null;
  return {
    comumMs,
    porCanal,
    atrasoMs: comumMs == null ? null : agora - comumMs,
    vivos,
    foraDoAr,
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
 * voltas correram e quantas falharam. Um erro em `atualizar` nunca a rejeita
 * — é contado, passado a `aoErro`, e a volta seguinte espera mais.
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
  // Um intervalo pedido maior do que o teto não pode ENCOLHER depois de um
  // erro — isso era insistir mais depressa por ter falhado.
  const teto = Math.max(Number(tetoMs) || 0, intervaloMs);

  let passo = intervaloMs;
  let proxima = agora();
  let voltas = 0;
  let erros = 0;
  let seguidos = 0;

  while (!sinal?.aborted) {
    const falta = proxima - agora();
    if (falta > 0) { await esperar(falta, { sinal }); continue; }
    if (!visivel()) { await esperar(intervaloMs, { sinal }); continue; }

    const inicio = agora();
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
      proxima = agora() + passo;
      // O aviso é para o ecrã; um erro no ecrã não pode parar o relógio.
      try { aoErro(e, { esperaMs: passo, seguidos }); } catch { /* ver acima */ }
    }
  }
  return { voltas, erros };
}
