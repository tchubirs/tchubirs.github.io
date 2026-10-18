// Alinhar todos os ângulos pelo som, dentro da página, sem servidor nenhum.
//
// O PROGRAM-DATE-TIME é o instante em que o pedaço CHEGOU à Kick. Entre a
// placa de captura de cada um e esse instante há o buffer do OBS, o encoder e
// a subida — e isso é diferente em cada casa. Esse resto não se lê em lado
// nenhum: só se mede ouvindo.
//
// Medido a sério num evento real (30/08/2026, cinco canais, quatro janelas de
// 7 min): quatro dos cinco alinharam a 0,14 s uns dos outros só com o
// carimbo; o quinto estava 5,7 s à frente e as quatro janelas concordaram.
// Ou seja: o carimbo quase sempre chega, e quando não chega isto apanha.

import { aacDeSegmentos } from './audio-ts.js?v=6425609683';
import { envolvente, desvio, consolidar, resolver, TAXA } from './sinal.js?v=6425609683';
import { segmentosNaJanela } from './kick.js?v=6425609683';
import { onde } from './relogio.js?v=6425609683';
import { pegarSegmento } from './baixar.js?v=6425609683';

/**
 * Quantos MB isto vai custar, antes de começar.
 *
 * Medido: o degrau mais barato da Kick anda nos ~280 kbps reais (é o mais
 * barato que existe, mas traz vídeo junto — o áudio não se pode pedir
 * sozinho). Trinta ângulos não é o mesmo que cinco, e quem está com dados
 * móveis tem o direito de saber ANTES e não a meio.
 */
export function custoEstimadoMB(quantosCanais, { janelas = 3, duracaoS = 120 } = {}) {
  const MARGEM_S = 12;                       // os segmentos das pontas vêm inteiros
  return Math.round((quantosCanais * janelas * (duracaoS + MARGEM_S) * 280_000) / 8 / 1048576);
}

/**
 * Onde ir buscar som: instantes com o maior número de ângulos no ar.
 *
 * Antes isto partia a sobreposição de todos em quartos e, sem sobreposição,
 * a noite inteira. Com quinhentos streamers quase nunca há um instante em que
 * todos estão no ar, e os quartos da noite caíam onde só um ou dois estavam:
 * descarregava-se tudo e nenhum par chegava às duas janelas que `consolidar`
 * pede. Agora conta-se, minuto a minuto, quem está no ar do princípio ao fim
 * da janela, e escolhe-se entre os minutos com perto do máximo.
 *
 * Os minutos são os do relógio (múltiplos de 60 s), não fracções da noite:
 * assim um canal novo que muda a sobreposição não muda os instantes possíveis,
 * e com `memoria` prefere-se os instantes já ouvidos. Sem isso, acrescentar um
 * streamer que entrou uma hora depois mandava ouvir os trinta outra vez.
 */
export function instantesParaOuvir(linhas, janela, { quantos = 3, duracaoS = 120, memoria } = {}) {
  const de = janela.inicio;
  const ate = janela.fim - duracaoS * 1000;
  if (!(ate > de)) return [Math.max(janela.inicio, de)];

  const MINUTO = 60_000;
  const noAr = (l, t) => (l.pecas || []).some((p) => t >= p.playlist.inicio && t < p.playlist.fim);
  const candidatos = [];
  for (let t = Math.ceil(de / MINUTO) * MINUTO; t <= ate; t += MINUTO) {
    const vivos = linhas.filter((l) => noAr(l, t) && noAr(l, t + duracaoS * 1000 - 1));
    const ouvidos = memoria ? vivos.filter((l) => memoria.has(`${t}|${l.slug}`)).length : 0;
    candidatos.push({ t, n: vivos.length, ouvidos: vivos.length ? ouvidos / vivos.length : 0 });
  }
  if (!candidatos.length) return [Math.round(de)];

  const maximo = Math.max(...candidatos.map((c) => c.n));
  const limiar = Math.ceil(0.9 * maximo);
  let bons = candidatos.filter((c) => c.n >= limiar);
  if (bons.length < quantos) bons = candidatos;
  // Espalhados pela noite de propósito. Três janelas seguidas medem três vezes
  // o mesmo minuto, e se esse minuto for de música em loop as três concordam
  // no sítio errado, que é precisamente o erro que a repetição devia apanhar.
  const inicioBom = Math.min(...bons.map((c) => c.t));
  const fimBom = Math.max(...bons.map((c) => c.t));
  const extensao = Math.max(1, fimBom - inicioBom);
  const escolhidos = [];
  while (escolhidos.length < quantos) {
    let melhor = null;
    let melhorNota = -Infinity;
    for (const c of bons) {
      if (escolhidos.some((e) => Math.abs(e.t - c.t) < duracaoS * 1000)) continue;
      const longe = Math.min(
        (c.t - inicioBom + extensao / (quantos + 1)) / extensao,
        (fimBom - c.t + extensao / (quantos + 1)) / extensao,
        ...escolhidos.map((e) => Math.abs(e.t - c.t) / extensao),
      );
      // Por ordem: quantos estão no ar, o que já se ouviu, e só depois o
      // espalhar. Os dois primeiros valem mais do que qualquer distância.
      const nota = (c.n >= limiar ? 4 : c.n / Math.max(1, maximo)) + 2 * c.ouvidos + longe;
      if (nota > melhorNota) { melhorNota = nota; melhor = c; }
    }
    if (!melhor) break;
    escolhidos.push(melhor);
  }
  return escolhidos.map((c) => c.t).sort((x, y) => x - y);
}

/**
 * AAC (frames ADTS) -> PCM mono a 8 kHz, com o que o browser tiver.
 *
 * Dois caminhos, porque nenhum serve sozinho:
 *  - `AudioDecoder` (WebCodecs) aceita ADTS directamente e e o caminho bom.
 *  - `decodeAudioData` e o antigo, e MEDIDO aqui: recusa ADTS puro no Chrome.
 *    Fica como rede de seguranca para browsers sem WebCodecs, nao como plano A.
 *
 * Se nenhum der, isto atira `SEM-DESCODIFICADOR` em vez de devolver silencio.
 * Um navegador sem AAC (o Chromium open-source, por exemplo) nao consegue
 * sequer TOCAR os VODs da Kick — dize-lo e mais util do que um zero calado.
 */
export async function descodificarAac(aac, { taxaAlvo = TAXA, noFio = false } = {}) {
  // Na página, num Worker (ver som-worker.js); sem Worker (node, um browser antigo) ou se ele falhar,
  // aqui mesmo.
  if (!noFio) {
    const r = await noWorker(aac, taxaAlvo);
    if (r) return r;
  }
  const bytes = aac.buffer.slice(aac.byteOffset, aac.byteOffset + aac.byteLength);

  if (typeof AudioDecoder !== 'undefined') {
    const frames = [];
    for (let o = 0; o + 7 <= aac.length;) {
      const tam = ((aac[o + 3] & 0x03) << 11) | (aac[o + 4] << 3) | ((aac[o + 5] & 0xe0) >> 5);
      if (tam < 7 || o + tam > aac.length) break;
      frames.push(aac.subarray(o, o + tam));
      o += tam;
    }
    const TAXAS = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
    const taxa = TAXAS[(aac[2] & 0x3c) >> 2] || 48000;
    const canais = (((aac[2] & 1) << 2) | ((aac[3] & 0xc0) >> 6)) || 1;
    const config = { codec: 'mp4a.40.2', sampleRate: taxa, numberOfChannels: canais };
    const ok = await AudioDecoder.isConfigSupported(config).then((r) => r.supported, () => false);
    if (ok && frames.length) {
      const pedacos = [];
      let erro = null;
      const dec = new AudioDecoder({
        output: (d) => {
          const n = d.numberOfFrames;
          const soma = new Float32Array(n);
          const plano = new Float32Array(n);
          for (let c = 0; c < d.numberOfChannels; c++) {
            d.copyTo(plano, { planeIndex: c, format: 'f32-planar' });
            for (let i = 0; i < n; i++) soma[i] += plano[i] / d.numberOfChannels;
          }
          pedacos.push(soma);
          d.close();
        },
        error: (e) => { erro = e; },
      });
      dec.configure(config);
      frames.forEach((f, i) => dec.decode(new EncodedAudioChunk({
        type: 'key', timestamp: Math.round((i * 1024 * 1e6) / taxa), data: f,
      })));
      await dec.flush();
      dec.close();
      if (!erro && pedacos.length) return reamostrar(pedacos, taxa, taxaAlvo);
    }
  }

  if (typeof OfflineAudioContext !== 'undefined') {
    try {
      const ctx = new OfflineAudioContext(1, taxaAlvo, taxaAlvo);
      const buf = await ctx.decodeAudioData(bytes);
      const canais = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
      const mono = new Float32Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        let v = 0;
        for (const c of canais) v += c[i];
        mono[i] = v / canais.length;
      }
      return mono;
    } catch { /* medido: o Chrome recusa ADTS puro aqui */ }
  }

  const e = new Error('este navegador nao sabe descodificar o audio AAC da Kick');
  e.name = 'SEM-DESCODIFICADOR';
  throw e;
}

let trabalhador = null;
let pedidosAoWorker = 0;
const aEspera = new Map();
/** O AAC descodificado no som-worker.js, ou null quando não há Worker (e então descodifica-se aqui). */
function noWorker(aac, taxaAlvo) {
  if (typeof Worker === 'undefined' || typeof window === 'undefined' || trabalhador === false) return Promise.resolve(null);
  if (!trabalhador) {
    try {
      trabalhador = new Worker(new URL('./som-worker.js', import.meta.url), { type: 'module' });
      trabalhador.onmessage = ({ data }) => {
        const p = aEspera.get(data.id);
        if (!p) return;
        aEspera.delete(data.id);
        if (data.mono) p.ok(data.mono);
        else p.nao(Object.assign(new Error(data.erro), { name: data.nome }));
      };
      // Um Worker que nem arranca (o ficheiro não carregou, uma política que o proíbe): os que estavam
      // à espera e os seguintes descodificam-se na página, como antes.
      trabalhador.onerror = () => {
        trabalhador = false;
        for (const p of aEspera.values()) p.ok(null);
        aEspera.clear();
      };
    } catch {
      trabalhador = false;
      return Promise.resolve(null);
    }
  }
  const id = ++pedidosAoWorker;
  const copia = aac.slice();
  return new Promise((ok, nao) => {
    aEspera.set(id, { ok, nao });
    trabalhador.postMessage({ id, aac: copia, taxaAlvo }, [copia.buffer]);
  });
}

/** Baixa linear para a taxa de trabalho. Nada disto precisa de fidelidade: o
 *  que se procura sao ataques, e um ataque continua um ataque a 8 kHz. */
function reamostrar(pedacos, de, para) {
  let total = 0;
  for (const p of pedacos) total += p.length;
  const junto = new Float32Array(total);
  let o = 0;
  for (const p of pedacos) { junto.set(p, o); o += p.length; }
  if (de === para) return junto;
  const n = Math.floor((total * para) / de);
  const saida = new Float32Array(n);
  const passo = de / para;
  for (let i = 0; i < n; i++) {
    const x = i * passo;
    const k = Math.floor(x);
    const f = x - k;
    saida[i] = junto[k] * (1 - f) + (junto[k + 1] ?? junto[k]) * f;
  }
  return saida;
}

/** Quanto um pedaço de som (160p, ~300 KB) pode ficar sem mandar nada antes de se tentar outra vez. */
export const PRAZO_SOM_MS = 20_000;

/**
 * Os bytes TS de um canal entre `quandoMs` e `quandoMs + duracaoS`, no degrau mais barato (160p), e os
 * segmentos que vieram (com o `inicio` de cada um no relógio do VOD). O som (`somDoCanal`) e as telas de
 * morte (achar-mortes-video.js) saem daqui. Null quando o canal não filmava.
 */
export async function tsDoCanal(linha, quandoMs, duracaoS, {
  buscar = fetch, sinal, contador, paralelo = 4, prazoMs,
} = {}) {
  const r = onde(linha, quandoMs);
  if (r.estado !== 'toca') return null;
  // A playlist da peca e sempre a do degrau mais barato (160p): `peca.playlist` e lida de
  // `peca.barato` quando a noite abre. O audio nao se pode pedir sozinho na Kick, e o degrau de baixo
  // e o que traz menos video junto.
  const peca = linha.pecasCompletas?.find((p) => p.vod.id === r.peca.vod.id) || r.peca;
  const segs = segmentosNaJanela(peca.playlist, quandoMs, quandoMs + duracaoS * 1000);
  if (!segs.length) return null;

  // Ate `paralelo` segmentos no ar ao mesmo tempo, e cada um no seu lugar. Antes ia um de cada vez, e
  // um bocado de cinco minutos sao dezenas de idas e voltas: o tempo ia na espera, nao nos bytes.
  const partes = new Array(segs.length);
  let total = 0;
  let proximo = 0;
  let falhou = null;
  const umPedido = async () => {
    while (proximo < segs.length && !falhou) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const i = proximo++;
      try {
        // Com prazo e novas tentativas, como a exportação. O teste real de 12/10: uma detecção ficou
        // quase 4 min parada em "0 s de 10 min" à espera de um pedido que nunca acabou.
        // eslint-disable-next-line no-await-in-loop
        const b = await pegarSegmento(segs[i].url, { buscar, sinal, prazoMs: prazoMs ?? PRAZO_SOM_MS });
        partes[i] = b;
        total += b.length;
        contador?.(b.length);
      } catch (e) {
        const erro = sinal?.aborted ? new DOMException('cancelado', 'AbortError') : e;
        falhou = falhou || erro;
        throw erro;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(paralelo, segs.length)) }, umPedido));
  const ts = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { ts.set(p, o); o += p.length; }

  return { ts, segs };
}

/**
 * O som de um canal, num instante, ja em mono a 8 kHz e a comecar em `quandoMs`.
 *
 * E a costura injectavel do modulo: tudo acima disto (escolher instantes,
 * comparar pares, resolver o grafo) e testavel sem rede e sem codec, e o codec
 * e a unica parte que pertence ao browser e nao a este codigo.
 */
export async function somDoCanal(linha, quandoMs, duracaoS, {
  buscar = fetch, sinal, descodificar = descodificarAac, contador, taxa = TAXA, paralelo = 4, prazoMs,
} = {}) {
  const baixado = await tsDoCanal(linha, quandoMs, duracaoS, { buscar, sinal, contador, paralelo, prazoMs });
  if (!baixado) return null;
  const { ts, segs } = baixado;

  // O browser sabe AAC mas nao sabe MPEG-TS. `audio-ts.js` e a ponte, e o que
  // ela produz foi comparado com o ffmpeg amostra a amostra em 500 s: igual.
  const aac = aacDeSegmentos(ts);
  if (!aac) return null;
  // A taxa a pedido: alinhar precisa de 8 kHz (barato, e a forma chega), e
  // procurar tiros precisa de 24 — a 8 kHz o mundo acaba nos 4 kHz, e e para
  // cima disso que um estouro se distingue de uma voz.
  const mono = await descodificar(aac, { taxaAlvo: taxa });

  // Cortar ate ao instante pedido, para que TODOS os canais comecem no mesmo
  // ponto do relogio. Sem isto mede-se a diferenca dos cortes, nao a dos sons.
  const salto = Math.max(0, Math.round(((quandoMs - segs[0].inicio) / 1000) * taxa));
  const fim = Math.min(mono.length, salto + Math.round(duracaoS * taxa));
  return fim - salto > taxa * 5 ? mono.subarray(salto, fim) : null;
}

/**
 * Mede e devolve o ajuste de cada canal, em milissegundos.
 *
 * Não aplica nada: quem decide é a página. Um alinhamento automático que
 * mexesse sozinho e sem dizer o quê seria pior do que não ter nenhum, porque
 * quando falhasse ninguém saberia que tinha falhado.
 *
 * `memoria` guarda a FORMA do som de cada canal em cada instante, e é passada
 * de fora para sobreviver entre chamadas. Sem ela, acrescentar um canal a uma
 * noite já sincronizada mandava descarregar tudo outra vez: com trinta
 * ângulos são ~14 MB por canal, ou seja 420 MB para medir um só. E é
 * desperdício puro — a forma do som do canal A no minuto 40 não muda por ter
 * chegado o canal Z. A chave leva o instante, e os instantes mudam quando a
 * janela muda, por isso uma noite diferente falha a memória sozinha em vez de
 * devolver medições de outra noite.
 */
export async function alinharPeloSom({
  linhas, janela, janelas = 3, duracaoS = 120,
  sinal, aoProgresso = () => {}, buscar = fetch, descodificar, lerSom = somDoCanal,
  memoria = new Map(),
  // O teste real de 12/10: 33 ângulos levaram 30 min a ouvir, um canal de cada vez. Agora ouvem-se
  // `paralelos` canais ao mesmo tempo, cada um com 2 pedaços no ar (8 pedidos de uma vez, o dobro do
  // de antes e ainda pouco para a Kick), e os de `primeiro` (os do lance aberto) vão à frente.
  // `instantes` deixa quem chama medir um grupo e depois todos nos mesmos minutos, sem ouvir duas vezes.
  paralelos = 4, primeiro = [], instantes: fixos = null,
} = {}) {
  const instantes = fixos || instantesParaOuvir(linhas, janela, { quantos: janelas, duracaoS, memoria });
  const envelopes = memoria;
  const problemas = [];
  let bytes = 0;
  let passo = 0;
  // Só conta o que falta MESMO ouvir. Uma barra de progresso que conta o que
  // já está em memória diz "31 de 31" e demora dois segundos: parece avariada.
  const vemPrimeiro = (l) => (primeiro.includes(l.slug) ? 0 : 1);
  const porOuvir = [...linhas].sort((a, b) => vemPrimeiro(a) - vemPrimeiro(b))
    .flatMap((l) => instantes.filter((t) => !envelopes.has(`${t}|${l.slug}`)).map((t) => [t, l]));
  const passos = porOuvir.length;
  const reaproveitados = instantes.length * linhas.length - passos;

  let proximo = 0;
  let parar = null;
  const trabalhador = async (ate = Infinity) => {
    while (proximo < Math.min(ate, porOuvir.length) && !parar) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const [t, linha] = porOuvir[proximo++];
      aoProgresso({ fase: 'ouvir', canal: linha.slug, feito: passo, total: passos, bytes });
      try {
        // eslint-disable-next-line no-await-in-loop
        const som = await lerSom(linha, t, duracaoS, {
          buscar, sinal, descodificar, contador: (n) => { bytes += n; }, paralelo: 2,
        });
        if (som) envelopes.set(`${t}|${linha.slug}`, envolvente(som));
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        // Um navegador sem AAC nao vai passar a ter a meio da medicao, e
        // insistir canal a canal so faz o utilizador esperar por nada.
        if (e.name === 'SEM-DESCODIFICADOR') { parar = e; throw e; }
        // Um canal que não se consegue ouvir não pode matar a medição dos
        // outros: fica sem ajuste automático e é dito pelo nome no fim.
        problemas.push({ canal: linha.slug, erro: e.message });
      }
      passo++;
      aoProgresso({ fase: 'ouvir', canal: linha.slug, feito: passo, total: passos, bytes });
    }
  };
  // O primeiro sozinho: se o navegador não sabe AAC, falha uma vez e não quatro.
  await trabalhador(1);
  await Promise.all(Array.from({ length: Math.max(1, Math.min(paralelos, porOuvir.length - proximo)) }, () => trabalhador()));
  if (parar) throw parar;

  const nomes = linhas.map((l) => l.slug);
  const pares = [];
  const detalhe = [];
  // Comparar é um par de cada vez, e cada `desvio` são dezenas de milhões de
  // contas: trinta ângulos dão 435 pares, quinhentos dão 124 750. Num ciclo
  // só, a página ficava presa minutos (ou horas) com "a página não responde",
  // sem barra a andar e sem o Parar a funcionar. Por isso devolve-se a vez ao
  // browser a cada pouco, e é aí que se vê se ele mandou parar.
  const totalPares = (nomes.length * (nomes.length - 1)) / 2;
  let feitosPares = 0;
  let desdeVez = Date.now();
  const darAVez = async (jaAgora = false) => {
    if (!jaAgora && Date.now() - desdeVez < 50) return;
    await new Promise((pronto) => setTimeout(pronto, 0));
    desdeVez = Date.now();
    if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
    aoProgresso({ fase: 'comparar', feito: feitosPares, total: totalPares });
  };
  aoProgresso({ fase: 'comparar', feito: 0, total: totalPares });
  // Uma vez logo à entrada, para o "a comparar" chegar ao ecrã e o Parar ser
  // visto mesmo quando a comparação (pela FFT) acaba em menos de 50 ms.
  await darAVez(true);
  for (let i = 0; i < nomes.length; i++) {
    for (let k = i + 1; k < nomes.length; k++) {
      const medicoes = [];
      for (const t of instantes) {
        const a = envelopes.get(`${t}|${nomes[i]}`);
        const b = envelopes.get(`${t}|${nomes[k]}`);
        if (!a?.length || !b?.length) continue;
        // eslint-disable-next-line no-await-in-loop
        await darAVez();
        medicoes.push(desvio(a, b));
      }
      feitosPares++;
      if (!medicoes.length) continue;
      const c = consolidar(medicoes);
      detalhe.push({ a: nomes[i], b: nomes[k], ...c });
      if (c.desvioS != null) pares.push({ a: nomes[i], b: nomes[k], desvioS: c.desvioS, peso: c.peso });
    }
  }

  const { ajustes, semLigacao } = resolver(pares, nomes);
  return {
    ajustesMs: Object.fromEntries(Object.entries(ajustes).map(([k, v]) => [k, Math.round(v * 1000)])),
    semLigacao,
    pares: detalhe,
    instantes,
    problemas,
    bytes,
    reaproveitados,
  };
}
