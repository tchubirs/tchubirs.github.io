// Onde o chat explodiu: um sinal barato dos melhores momentos, sem baixar vídeo.
//
// O som diz onde houve tiros; o chat diz onde as PESSOAS reagiram. Num evento
// de 500 canais as duas coisas não custam o mesmo: ouvir uma noite inteira de
// um canal são centenas de MB (ver `procurar-momentos.js`), e o chat da mesma
// noite são umas dezenas de pedidos de texto. Por isso o chat é o primeiro
// crivo — diz em que minutos vale a pena gastar som e olhos — e não o último.
//
// Medido em 06/10/2026:
//   - GET kick.com/api/v2/channels/<id>/messages?cursor=<µs desde 1970>
//     devolve as mensagens ANTES desse instante, da mais nova para a mais
//     velha, e um `cursor` que é o instante da mais velha, ao microssegundo.
//     Andar para trás no tempo é passar esse cursor ao pedido seguinte.
//   - Uma hora de um canal pequeno (281 mensagens) custou 12 pedidos. Os
//     minutos mais cheios (22 msg/min contra uma mediana de 4) estavam cheios
//     de KEKW e caíam em cima dos lances.
//   - Uma página não traz sempre 25: veio uma com 19 e havia mais para trás.
//     Por isso só uma página VAZIA quer dizer "acabou o histórico".
//   - O `id` é o do CANAL e não o da sala de chat (`chatroom.id`, que é outro
//     número). Pedido com o da sala, a resposta é 200 e vazia: parece um canal
//     calado e não um erro, e é por isso que `idDoCanal` existe e não se deixa
//     a página adivinhar qual dos dois usar.
//   - `created_at` vem ao segundo ("2026-10-03T01:59:18Z"). Chega e sobra:
//     o calor conta-se ao minuto.

const API = 'https://kick.com/api/v2';

// O máximo que uma página de chat trouxe, medido. Não diz que uma página mais
// curta é o fim (veio uma de 19 com mais para trás); só serve para reconhecer
// uma página CHEIA de mensagens já vistas, que é um cursor que não andou.
const PAGINA = 25;

/** O mesmo erro que o resto da página usa para "o utilizador desistiu". */
function cancelado() {
  return new DOMException('cancelado', 'AbortError');
}

/**
 * Texto de data da Kick -> ms, sempre em UTC.
 *
 * O chat chega com "Z", mas a lista de VODs da mesma API chega sem zona
 * nenhuma, e `Date.parse` lê uma data sem zona na hora LOCAL de quem abre a
 * página: num PC no Brasil o calor inteiro escorregava três horas e os picos
 * caíam em cima de outros lances, sem erro nenhum. É a mesma regra de
 * `instanteUtc` em `carregar.js`, repetida aqui para este ficheiro não
 * depender do carregador por causa de cinco linhas.
 */
function instante(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return NaN;
  const t = texto.trim().replace(' ', 'T');
  return Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t}Z`);
}

/**
 * O número do canal, que é o que o chat pede em vez do nome.
 *
 * Devolve `null` para tudo o que não for um número de canal — nome inválido,
 * canal que não existe, rede em baixo, resposta estranha — porque para quem
 * chama todos querem dizer o mesmo: deste canal não há chat para ler. O
 * porquê de cada um já é dito pela carga dos VODs, que vem antes. A única
 * coisa que atira é cancelar: quem desistiu não quer um "sem chat" a fingir
 * de resposta.
 */
export async function idDoCanal(slug, { buscar = fetch, sinal } = {}) {
  // A mesma regra de nome de `vodsDoCanal`: só se recusa o que não pode ser
  // um bocado de endereço. O resto vai à Kick, que é quem sabe. E, como em
  // `elenco.js`, pelo menos uma letra ou um algarismo: `encodeURIComponent`
  // não escapa pontos, e "." ou ".." iam a kick.com/api/v2/channels/ ou a
  // kick.com/api/v2/, onde um `id` qualquer passava por número de canal.
  const nome = String(slug || '').trim().replace(/^@/, '').toLowerCase();
  if (!nome || !/^[a-z0-9_.-]{1,60}$/.test(nome) || !/[a-z0-9]/.test(nome)) return null;
  let r;
  try {
    r = await buscar(`${API}/channels/${encodeURIComponent(nome)}`, { signal: sinal });
  } catch (e) {
    if (e?.name === 'AbortError' || sinal?.aborted) throw cancelado();
    return null;
  }
  if (!r?.ok) return null;
  let j;
  try { j = await r.json(); } catch (e) {
    // Cancelar a meio do corpo também é desistir, como em `mensagensEntre`.
    if (e?.name === 'AbortError' || sinal?.aborted) throw cancelado();
    return null;
  }
  // O `id` de cima, e nunca `chatroom.id`: ver o topo do ficheiro.
  const id = Number(j?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Todas as mensagens de um canal entre dois instantes, por ordem de relógio.
 *
 * Anda para trás a partir de `ateMs`, página a página, até ver uma mensagem
 * mais velha do que `deMs`. Devolve `[{ id, ms, texto, autor }]` — `autor` é
 * o slug de quem escreveu, para quem quiser contar PESSOAS e não mensagens —
 * e a lista leva pendurados:
 *
 *   - `incompleto`: true se parou antes de chegar a `deMs`;
 *   - `motivo`: porquê ('max-pedidos', 'rate-limit', 'sem-rede',
 *     'canal-nao-existe', 'http-<n>', 'resposta-ilegivel',
 *     'formato-inesperado', 'cursor-parado', 'sem-canal',
 *     'janela-invalida'), ou null;
 *   - `pedidos`: quantos pedidos custou.
 *
 * Parar a meio não atira: devolve o que já tem e diz que é só isso. Para um
 * mapa de calor, a última hora de chat de um canal continua a valer, e deitar
 * fora 399 páginas boas por causa da 400.ª era o pior dos dois mundos. Mas
 * nunca calado — uma lista parcial sem aviso seria mentir que aquele canal
 * esteve calado no princípio da noite.
 *
 * `maxPedidos` é o travão do evento: 500 canais × uma noite de um canal
 * grande são dezenas de milhares de pedidos, e um só canal com 20 mil
 * mensagens não pode comer a vez dos outros 499.
 */
export async function mensagensEntre(id, deMs, ateMs, {
  buscar = fetch, maxPedidos = 400, sinal, aoProgredir = () => {},
} = {}) {
  const recolhidas = [];
  // TODAS as que já passaram, dentro e fora da janela. As páginas da Kick
  // podem repetir a mensagem da fronteira, e a mesma mensagem contada duas
  // vezes faz um pico de um minuto que não existiu.
  const vistas = new Set();
  let pedidos = 0;
  let motivo = null;

  const entregar = () => {
    // A ordem em que chegaram é da mais nova para a mais velha; ao contrário
    // fica por ordem de relógio, com os empates do mesmo segundo na ordem
    // certa — e o `sort`, que é estável, só arruma o que a Kick tiver trocado.
    const lista = recolhidas.reverse().sort((a, b) => a.ms - b.ms);
    return Object.assign(lista, { incompleto: motivo !== null, motivo, pedidos });
  };

  if (id === null || id === undefined || id === '') {
    motivo = 'sem-canal';
    return entregar();
  }
  // Uma ponta que não é número (uma data que não se leu, ou Infinity por
  // "até agora") não é uma janela calada: nada foi perguntado à Kick, e uma
  // lista vazia "completa" jurava que o canal não disse nada.
  if (!Number.isFinite(deMs) || !Number.isFinite(ateMs)) {
    motivo = 'janela-invalida';
    return entregar();
  }
  // Uma janela vazia ou invertida não tem mensagens, e isso não é uma falha.
  if (ateMs <= deMs) return entregar();

  // Microssegundos inteiros: é a unidade do cursor da própria Kick. Cabe num
  // número normal sem perder nada (2^53 µs são uns 285 anos).
  let cursor = Math.floor(ateMs) * 1000;
  let chegouMs = ateMs;
  // Um travão que não é número não pode virar "sem travão": NaN parava logo,
  // e diz-se porquê, em vez de deixar um canal enorme andar sem fim.
  const travao = Math.max(0, Math.floor(Number(maxPedidos)) || 0);

  for (;;) {
    if (sinal?.aborted) throw cancelado();
    if (pedidos >= travao) { motivo = 'max-pedidos'; break; }
    pedidos++;

    let r;
    try {
      r = await buscar(`${API}/channels/${encodeURIComponent(id)}/messages?cursor=${cursor}`, { signal: sinal });
    } catch (e) {
      if (e?.name === 'AbortError' || sinal?.aborted) throw cancelado();
      motivo = 'sem-rede';
      break;
    }
    if (!r || typeof r !== 'object') { motivo = 'sem-rede'; break; }
    if (r.status === 429) { motivo = 'rate-limit'; break; }
    if (r.status === 404) { motivo = 'canal-nao-existe'; break; }
    if (!r.ok) { motivo = `http-${r.status}`; break; }
    let j;
    try { j = await r.json(); } catch {
      if (sinal?.aborted) throw cancelado();
      motivo = 'resposta-ilegivel';
      break;
    }
    const pagina = j?.data?.messages;
    if (!Array.isArray(pagina)) { motivo = 'formato-inesperado'; break; }
    // Página vazia: não há nada mais velho. É o fim do histórico, e o que se
    // tem é tudo o que existe — não é uma lista incompleta.
    if (!pagina.length) break;

    let maisVelha = Infinity;
    let maisNova = -Infinity;
    let novas = 0;
    for (const m of pagina) {
      const ms = instante(m?.created_at);
      if (!Number.isFinite(ms)) continue;
      if (ms < maisVelha) maisVelha = ms;
      if (ms > maisNova) maisNova = ms;
      // A Kick manda sempre `id`. Se um dia não mandar, a chave composta ainda
      // apanha a mensagem repetida na fronteira das páginas, que é o caso que
      // importa; perde-se no máximo um "kkk" repetido pela mesma pessoa no
      // mesmo segundo.
      const chave = m.id ?? `${ms}|${m.sender?.id ?? ''}|${m.content ?? ''}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      novas++;
      if (ms < deMs || ms >= ateMs) continue;
      recolhidas.push({
        id: chave,
        ms,
        texto: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
        autor: m.sender?.slug ?? m.sender?.username ?? null,
      });
    }
    // Mensagens que vieram e nenhuma com data que se leia: a Kick mudou a
    // forma. Seguir em frente dava uma lista vazia "completa" — um canal
    // calado a noite toda — e é exactamente o erro que não se vê.
    if (!Number.isFinite(maisVelha)) { motivo = 'formato-inesperado'; break; }
    if (maisVelha < chegouMs) chegouMs = maisVelha;
    aoProgredir({
      pedidos,
      mensagens: recolhidas.length,
      chegouMs,
      // Quanto da janela já se andou, de 0 a 1. Sabe-se o tempo e não o
      // número de mensagens, por isso a barra anda pelo relógio.
      fracao: Math.min(1, Math.max(0, (ateMs - chegouMs) / (ateMs - deMs))),
    });

    // Passou do princípio da janela: está tudo. Estritamente mais velha, e não
    // "igual": as datas vêm ao segundo, e pode haver mais mensagens do mesmo
    // segundo de `deMs` na página seguinte.
    if (chegouMs < deMs) break;
    // Uma página só com mensagens já vistas. Se é a fronteira repetida (tudo
    // do segundo mais velho a que já se chegou, numa página que não vem
    // cheia), é uma página vazia disfarçada: o fim, e completo. Sem isto, um
    // cursor que repete a fronteira prendia o ciclo até ao travão e marcava
    // como incompleto um canal que já tinha dado tudo.
    // Mas a mesma página outra vez (mensagens mais novas do que onde se ia),
    // ou uma página cheia de um segundo só que o cursor de recurso não passa,
    // é um cursor que não serviu, e o resto da noite ficou por ler. Dizer
    // "acabou" aí era a lista parcial calada que o topo desta função proíbe.
    if (!novas) {
      if (maisNova > chegouMs || pagina.length >= PAGINA) motivo = 'cursor-parado';
      break;
    }

    // O cursor da Kick e, se um dia faltar, o segundo da mensagem mais velha
    // (mais um, porque as datas vêm truncadas ao segundo e a mais velha ainda
    // pode ter irmãs desse segundo; as repetidas caem fora pelo `id`). Andando
    // ao segundo, um segundo com uma página cheia de mensagens não se
    // atravessa: aí pára como 'cursor-parado', e não como fim.
    const doServidor = Number(j.data.cursor);
    const proximo = j.data.cursor != null && Number.isSafeInteger(doServidor) && doServidor > 0
      ? doServidor
      : (maisVelha + 1000) * 1000;
    // Tem de andar para trás. Um cursor que fica onde está (ou avança) é um
    // ciclo infinito à espera de acontecer.
    if (!(proximo < cursor)) { motivo = 'cursor-parado'; break; }
    cursor = proximo;
  }
  return entregar();
}

/**
 * Quantas mensagens caíram em cada bocado de `passoMs`, de `deMs` a `ateMs`.
 *
 * Um minuto por omissão porque foi ao minuto que o pico se viu (22 contra 4):
 * em baldes de 10 s um canal pequeno é quase todo zeros e uns, e um pico é um
 * acaso; numa hora o lance dilui-se no resto. O último balde pode ser mais
 * curto do que os outros e conta-se como vem — esticá-lo inventava mensagens.
 */
export function calor(mensagens, deMs, ateMs, passoMs = 60000) {
  // Um passo de zero ou negativo pedia um vector infinito. Isto é um erro de
  // quem chama, não um estado da Kick, e por isso grita em vez de devolver.
  if (!Number.isFinite(passoMs) || passoMs <= 0) throw new RangeError(`passoMs inválido: ${passoMs}`);
  if (!Number.isFinite(deMs) || !Number.isFinite(ateMs) || ateMs <= deMs) return new Float64Array(0);
  const n = Math.ceil((ateMs - deMs) / passoMs);
  const baldes = new Float64Array(n);
  for (const m of mensagens || []) {
    const ms = m?.ms;
    if (!Number.isFinite(ms) || ms < deMs || ms >= ateMs) continue;
    baldes[Math.min(n - 1, Math.floor((ms - deMs) / passoMs))] += 1;
  }
  return baldes;
}

/** A mediana a sério (a média das duas do meio quando são pares). */
function mediana(valores) {
  const v = Array.from(valores).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return 0;
  const meio = v.length >> 1;
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Os baldes onde o chat explodiu.
 *
 * Um balde é pico se tiver pelo menos `fator` vezes a mediana do canal E pelo
 * menos `minimo` mensagens. As duas condições, porque cada uma sozinha falha:
 *
 *   - Só o fator: num canal quase calado (mediana 1) três "oi" no mesmo
 *     minuto são 3x e não são lance nenhum.
 *   - Só o mínimo: num canal grande, oito mensagens num minuto é um minuto
 *     qualquer.
 *
 * A mediana conta só os baldes com mensagens. Os minutos a zero são quase
 * sempre o canal desligado, e numa noite do evento cada um entra no ar à sua
 * hora: com eles, um canal no ar menos de metade da janela tinha mediana 0,
 * o limite caía no mínimo, a noite inteira ficava acima dele e saía UM pico
 * só, com os outros lances perdidos. Num canal no ar quase não há minutos a
 * zero, e num quase calado é o mínimo que decide, por isso tirá-los não
 * muda nada onde a mediana já estava certa. O que isto não resolve: se a
 * conversa com o canal desligado for a maior parte dos minutos com
 * mensagens, ainda puxa a mediana para baixo.
 *
 * A mediana e não a média, pela mesma razão do `chao` em `tiros.js`: a média
 * de uma noite com lances é puxada pelos próprios lances. A medição que fixa
 * o 3: os minutos de KEKW tinham 22 contra uma mediana de 4, ou seja 5,5x —
 * três deixa folga para um lance menos ruidoso sem apanhar o vaivém normal.
 * O 8 não foi medido como limite; é o chão que separa uma reacção de três
 * pessoas a conversar.
 *
 * Baldes seguidos acima do limite são o MESMO lance — o chat de uma kill
 * escorre para o minuto seguinte — e viram um pico só, no balde mais forte.
 * Num empate fica o primeiro: o chat reage DEPOIS do lance (o atraso da
 * transmissão mais o tempo de ler), por isso o mais cedo é o mais perto do
 * que aconteceu. Saem por ordem de relógio, que é a ordem da linha do tempo.
 */
export function picos(calor, { fator = 3, minimo = 8 } = {}) {
  const n = calor?.length || 0;
  if (!n) return [];
  const limite = Math.max(fator * mediana(Array.from(calor).filter((v) => v > 0)), minimo);
  const saida = [];
  let melhor = -1;
  for (let i = 0; i <= n; i++) {
    const v = i < n ? calor[i] : NaN;
    if (Number.isFinite(v) && v >= limite) {
      if (melhor < 0 || v > calor[melhor]) melhor = i;
      continue;
    }
    if (melhor >= 0) saida.push(melhor);
    melhor = -1;
  }
  return saida;
}

/**
 * O segundo em que o chat de um minuto explodiu: o começo dos `janelaMs` com mais mensagens, dentro de
 * [deMs, ateMs). O pico é um minuto, e abrir no começo dele obrigava a esperar até 30 s pelo lance (o
 * dono, a 07/10). Num empate fica o mais cedo, pela razão de `picos`. Sem mensagens, devolve `deMs`.
 */
export function segundoDoPico(mensagens, deMs, ateMs, janelaMs = 10_000) {
  const ms = (mensagens || []).map((m) => m?.ms).filter(Number.isFinite).sort((a, b) => a - b);
  let melhor = deMs;
  let maximo = 0;
  let fim = 0;
  let comeco = 0;
  for (let s = deMs; s < ateMs; s += 1000) {
    while (comeco < ms.length && ms[comeco] < s) comeco++;
    if (fim < comeco) fim = comeco;
    while (fim < ms.length && ms[fim] < s + janelaMs) fim++;
    if (fim - comeco > maximo) { maximo = fim - comeco; melhor = s; }
  }
  // Começar no segundo da primeira mensagem do surto, e não num segundo vazio antes dela.
  const primeira = ms.find((x) => x >= melhor);
  return maximo && primeira != null ? Math.floor(primeira / 1000) * 1000 : melhor;
}

const EMOTE = /\[emote:\d+:([^\]]+)\]/g;

/**
 * Palavras que estão em TODAS as conversas e por isso não dizem nada de
 * nenhuma. Sem isto, a palavra mais frequente de qualquer chat em português é
 * "de" ou "que", e a etiqueta de um pico de KEKW saía "que". Só palavras de
 * ligação das três línguas da página; "não", "gg", "ai" ficam de fora de
 * propósito, porque num chat aos gritos são precisamente a reacção.
 */
const PALAVRAS_VAZIAS = new Set([
  // pt
  'de', 'da', 'do', 'das', 'dos', 'que', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'os', 'as',
  'eu', 'tu', 'ele', 'ela', 'se', 'por', 'pra', 'pro', 'para', 'com', 'mas', 'me', 'te', 'meu',
  'minha', 'isso', 'esse', 'essa', 'ja', 'já', 'tem', 'foi', 'ta', 'tá', 'vc', 'voce', 'você',
  // es
  'el', 'la', 'los', 'las', 'en', 'un', 'una', 'es', 'con', 'lo', 'le', 'al', 'del', 'mi', 'yo',
  // en
  'the', 'an', 'to', 'of', 'in', 'on', 'is', 'it', 'and', 'or', 'for', 'you', 'he', 'she', 'we',
  'my', 'at', 'be', 'this', 'that', 'so', 'are', 'was', 'im',
]);

/**
 * O que o chat disse, em poucas palavras: os emotes e as palavras mais
 * frequentes. É a etiqueta de um pico — "KEKW", "kk", "gg" — e o que deixa
 * alguém decidir sem abrir o vídeo se aquele minuto foi uma kill, uma morte
 * ou só uma piada.
 *
 * Devolve `[{ nome, vezes, tipo: 'emote' | 'palavra' }]`, do mais frequente
 * para o menos. Regras, cada uma por uma razão:
 *
 *   - Conta-se em quantas MENSAGENS aparece, não quantas vezes: o seletor de
 *     emotes da Kick torna "KEKW KEKW KEKW KEKW" um clique, e isso é uma
 *     pessoa a reagir, não quatro.
 *   - Emotes pelo nome, como a Kick os escreve ("[emote:37226:KEKW]" ->
 *     "KEKW"), e os números lá de dentro não contam como palavras.
 *   - Palavras em minúsculas, só letras, duas ou mais.
 *   - Letras esticadas encolhem para duas: "kkkk", "KKKKKKK" e "kkkkkkkkkkk"
 *     são a mesma gargalhada, e contadas à parte perdiam todas para "gg".
 *     Palavras a sério com três letras iguais seguidas quase não existem nas
 *     três línguas da página, por isso isto não estraga o resto.
 *   - Fora: endereços, @menções (um nome não é uma reacção) e !comandos de
 *     bot ("!sens", "!drops"), que no chat medido eram dos mais repetidos e
 *     não têm nada a ver com o que se passou no jogo.
 */
export function reacoes(mensagens, { quantas = 5, ignorar = PALAVRAS_VAZIAS } = {}) {
  const limite = Math.max(0, Math.floor(Number(quantas) || 0));
  if (!limite) return [];
  const contas = new Map();
  for (const m of mensagens || []) {
    const texto = typeof m?.texto === 'string' ? m.texto : '';
    if (!texto) continue;
    const nesta = new Map();
    for (const [, nome] of texto.matchAll(EMOTE)) nesta.set(`e|${nome}`, { nome, tipo: 'emote' });
    const limpo = texto
      .replace(EMOTE, ' ')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
      .replace(/(^|\s)[@!]\S+/g, '$1')
      .toLowerCase();
    for (const crua of limpo.match(/\p{L}{2,}/gu) || []) {
      const palavra = crua.replace(/(\p{L})\1{2,}/gu, '$1$1');
      if (ignorar?.has?.(palavra)) continue;
      nesta.set(`p|${palavra}`, { nome: palavra, tipo: 'palavra' });
    }
    for (const [chave, item] of nesta) {
      const c = contas.get(chave);
      if (c) c.vezes++;
      else contas.set(chave, { ...item, vezes: 1 });
    }
  }
  // Empates pelo nome, para a mesma noite dar sempre a mesma etiqueta.
  return [...contas.values()]
    .sort((a, b) => (b.vezes - a.vezes) || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))
    .slice(0, limite);
}

/**
 * Um texto de chat pronto a comparar: minúsculas, sem acentos, o emote pelo nome, e as letras repetidas
 * seguidas encolhidas para uma ("kkkkk" e "kkk" dão os dois "k", "KKKK" também, "rocketttt" dá
 * "rocket"). Aplica-se igual às palavras do filtro e às mensagens, por isso "carro" e "caro" passam a
 * ser a mesma coisa, o que num filtro de chat não faz mal nenhum.
 */
export function normalizarChat(texto) {
  return String(texto ?? '')
    .replace(EMOTE, ' $1 ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\p{L})\1+/gu, '$1');
}

const palavrasDe = (normalizado) => normalizado.match(/[\p{L}\p{N}]+/gu) || [];

/**
 * As palavras ou expressões de um filtro, separadas por vírgula ("kkk, clip, boa jogada"), já
 * normalizadas e sem repetidas. Cada uma guarda como foi escrita, para o resultado dizer o que achou.
 */
export function termosDoFiltro(texto) {
  const vistos = new Set();
  const saida = [];
  for (const cru of String(texto ?? '').split(/[,;\n]/)) {
    const escrito = cru.trim();
    const palavras = palavrasDe(normalizarChat(escrito));
    const chave = palavras.join(' ');
    if (!palavras.length || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ escrito, palavras });
  }
  return saida;
}

/**
 * Se as palavras de uma mensagem (normalizadas) têm o termo. Palavra inteira, e a última palavra do
 * termo pode ser o começo de uma maior quando tem três letras ou mais: "clip" acha "clipa" e "clipou",
 * mas "k" (de "kkk") não acha "kick".
 */
function temTermo(palavras, termo) {
  const t = termo.palavras;
  const ultima = t.length - 1;
  for (let i = 0; i + t.length <= palavras.length; i++) {
    let igual = true;
    for (let j = 0; j <= ultima && igual; j++) {
      const p = palavras[i + j];
      igual = p === t[j] || (j === ultima && t[j].length >= 3 && p.startsWith(t[j]));
    }
    if (igual) return true;
  }
  return false;
}

/**
 * Os momentos em que as palavras do filtro apareceram muito no chat, de `deMs` a `ateMs`.
 *
 * Conta-se em quantas MENSAGENS aparece alguma (como em `reacoes`: "kkk kkk kkk" é uma pessoa), em
 * baldes de `passoMs`, e um balde é momento quando tem `fator` vezes o normal dessas palavras nesse
 * chat e pelo menos `minimo` mensagens (baldes seguidos acima disso são um momento só, como em `picos`). O instante é o segundo em que o surto começa
 * (`segundoDoPico`); o chat reage depois do lance, por isso o clipe começa `antesMs` antes dele.
 *
 * Devolve `[{ ms, combateDeMs, combateAteMs, vezes, termos }]` pela ordem do relógio, com `termos` os
 * que apareceram nesse momento, como foram escritos.
 */
export function momentosDePalavras(mensagens, termos, deMs, ateMs, {
  passoMs = 30_000, fator = 3, minimo = 4, antesMs = 20_000, depoisMs = 3000,
} = {}) {
  if (!termos?.length || !(ateMs > deMs)) return [];
  const achadas = [];
  for (const m of mensagens || []) {
    if (!Number.isFinite(m?.ms) || m.ms < deMs || m.ms >= ateMs) continue;
    const palavras = palavrasDe(normalizarChat(m.texto));
    const quais = termos.filter((t) => temTermo(palavras, t));
    if (quais.length) achadas.push({ ms: m.ms, quais });
  }
  if (!achadas.length) return [];
  const baldes = calor(achadas, deMs, ateMs, passoMs);
  // O normal destas palavras conta também os baldes a zero, ao contrário de `picos`: uma palavra rara
  // ("rocket") só aparece no próprio surto, e a mediana dos baldes com ela era o surto a medir-se a si
  // mesmo. O trecho já vem cortado ao tempo em que a pessoa esteve ao vivo, por isso os zeros são chat
  // a falar de outra coisa, e não o canal desligado.
  const limite = Math.max(fator * mediana(baldes), minimo);
  return picos(baldes, { fator: 0, minimo: limite }).map((i) => {
    const de = deMs + i * passoMs;
    const ate = Math.min(ateMs, de + passoMs);
    const dentro = achadas.filter((a) => a.ms >= de && a.ms < ate);
    const ms = segundoDoPico(dentro, de, ate);
    const termosAqui = termos.filter((t) => dentro.some((a) => a.quais.includes(t))).map((t) => t.escrito);
    return {
      ms, combateDeMs: Math.max(deMs, ms - antesMs), combateAteMs: ms + depoisMs, vezes: baldes[i], termos: termosAqui,
    };
  });
}
