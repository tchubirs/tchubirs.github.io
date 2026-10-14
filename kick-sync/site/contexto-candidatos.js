// Analise em fundo de poucos candidatos (ate 20 por live, o dono 14/10): escolhe quais momentos ainda precisam
// de contexto (quadro+fala), monta o pedido com o que ja existe no projeto, chama /api/contexto-rust quando
// ele existe, e devolve o veredito ja validado para quem chama anexar a etiqueta. Nunca inventa: sem endpoint
// (GitHub Pages) ou sem chave, o candidato so fica "ainda nao verificado" - a lista continua inteira.
//
// Reaproveita o que ja existe: falas.js (cache de transcricao), contexto-rust.js (o contrato e o pedido). O
// quadro (obterQuadro) e a transcricao ao vivo (transcrever) sao injetados por quem chama (simples.js), que
// e quem conhece a ponte do app - este arquivo nao abre video nem fala com a Kick sozinho.

import { construirPedido, pedidoValido, validarContexto, VERSAO_CONTRATO, VERSAO_PROMPT } from './contexto-rust.js';
import { acharNaLista, linhasDaTranscricao } from './falas.js';

export const MAX_CANDIDATOS_POR_LIVE = 20;
export const CONCORRENCIA_PADRAO = 2;
export const ENDPOINT_PADRAO = '/api/contexto-rust';

/** O veredito guardado vale só se for deste CONTRATO e deste PROMPT: prompt novo invalida o veredito antigo. */
export function contextoVigente(ctx) {
  return Boolean(ctx && ctx.versaoContrato === VERSAO_CONTRATO && ctx.revisaoPrompt === VERSAO_PROMPT);
}

/** O veredito de um momento: o da etiqueta de tiros, ou o que ficou no próprio momento quando ela não existia. */
export function contextoDoMomento(m) {
  const tiros = ((m && m.etiquetas) || []).find((e) => e.tipo === 'tiros');
  return (tiros && tiros.contexto) || (m && m.contexto) || null;
}

export function precisaDeContexto(m) {
  const et = (m && m.etiquetas) || [];
  const tiros = et.find((e) => e.tipo === 'tiros');
  if (!tiros) return false;
  return !contextoVigente(contextoDoMomento(m));
}

export function escolherCandidatos(momentos, opcoes) {
  const max = (opcoes && opcoes.max) || MAX_CANDIDATOS_POR_LIVE;
  return (momentos || [])
    .filter(precisaDeContexto)
    .slice()
    .sort((a, b) => (b.pontos || 0) - (a.pontos || 0))
    .slice(0, max);
}

/** Recuo do fim: o último instante nunca é o fim exato do VOD (um seek ali cai fora do vídeo). */
const RECUO_FIM_MS = 500;

export function instantesDoCandidato(m, opcoes) {
  const limites = (opcoes && opcoes.limites) || null;
  const de = Math.max(m.deMs, limites ? limites.deMs : -Infinity);
  const ate = Math.min(m.ateMs, limites ? limites.ateMs : Infinity);
  if (!(ate > de)) return [];
  const span = ate - de;
  const fim = ate - Math.min(RECUO_FIM_MS, span / 4);
  if (!(fim > de)) return [];
  const pico = Number.isFinite(m.ms) ? Math.min(Math.max(m.ms, de), fim) : (de + fim) / 2;
  const brutos = [de, pico - 1000, pico, pico + 1000, fim].map((t) => Math.min(Math.max(t, de), fim)).sort((a, b) => a - b);
  // Em clipe curto a folga de 250 ms juntaria tudo: a folga encolhe com o trecho.
  const folga = Math.min(250, span / 8);
  const unicos = [];
  for (const t of brutos) if (!unicos.length || t - unicos[unicos.length - 1] > folga) unicos.push(Math.round(t));
  if (unicos.length < 3) return [Math.round(de), Math.round((de + fim) / 2), Math.round(fim)];
  return unicos.slice(0, 5);
}

async function falaDoCandidato(m, opcoes) {
  const canal = opcoes.canal;
  const armazemFalas = opcoes.armazemFalas;
  const transcrever = opcoes.transcrever;
  const sinal = opcoes.sinal;
  const lista = (armazemFalas && armazemFalas.lerFalas) ? armazemFalas.lerFalas() : [];
  const existente = acharNaLista(lista, canal, m.deMs, m.ateMs);
  if (existente) return existente.linhas;
  if (!transcrever) return [];
  const tr = await transcrever({ canal: canal, deMs: m.deMs, ateMs: m.ateMs, sinal: sinal });
  if ((sinal && sinal.aborted) || !tr) return [];
  const linhas = linhasDaTranscricao(tr);
  if (armazemFalas && armazemFalas.guardarFala) armazemFalas.guardarFala({ canal: canal, deMs: m.deMs, ateMs: m.ateMs, linhas: linhas });
  return linhas;
}

async function quadrosDoCandidato(instantes, opcoes) {
  const obterQuadro = opcoes.obterQuadro;
  const sinal = opcoes.sinal;
  const saida = [];
  for (const ms of instantes) {
    if (sinal && sinal.aborted) break;
    // eslint-disable-next-line no-await-in-loop
    const q = await obterQuadro(ms).catch(() => null);
    if (q && q.jpegBase64) {
      const legenda = q.legenda || ('~' + Math.round((ms - instantes[0]) / 1000) + 's');
      saida.push({ jpegBase64: q.jpegBase64, legendaInstante: legenda });
    }
  }
  return saida;
}

function limitador(n) {
  let emVoo = 0;
  const fila = [];
  const soltar = () => { emVoo--; const prox = fila.shift(); if (prox) { emVoo++; prox(); } };
  return (tarefa) => new Promise((resolve, reject) => {
    const rodar = () => { tarefa().then(resolve, reject).finally(soltar); };
    if (emVoo < n) { emVoo++; rodar(); } else fila.push(rodar);
  });
}

export async function analisarCandidatos(opcoes) {
  const o = opcoes || {};
  const momentos = o.momentos;
  const canal = o.canal;
  // A identidade da LIVE (não do candidato): o servidor usa isto para o teto de 20 por live e o cache — nunca
  // o relógio do mundo, só um identificador estável desta sessão de vídeo (ex.: canal+início do VOD).
  const liveId = o.liveId || null;
  const limites = o.limites || null;
  const obterQuadro = o.obterQuadro;
  const transcrever = o.transcrever || null;
  const armazemFalas = o.armazemFalas || null;
  const endpoint = o.endpoint || ENDPOINT_PADRAO;
  const fetchImpl = 'fetchImpl' in o ? o.fetchImpl : (typeof fetch !== 'undefined' ? fetch : null);
  const max = o.max || MAX_CANDIDATOS_POR_LIVE;
  const concorrencia = o.concorrencia || CONCORRENCIA_PADRAO;
  const sinal = o.sinal || null;
  const aindaValido = o.aindaValido || (() => true);
  const aoProgresso = o.aoProgresso || (() => {});
  // Chamado a cada candidato que termina (sucesso, invalido ou descartado), antes de aoProgresso: quem chama
  // pode pintar so este cartao sem esperar os outros 19 (a fila inteira pode levar muito tempo).
  const aoResultado = o.aoResultado || (() => {});

  const candidatos = escolherCandidatos(momentos, { max: max });
  const resultados = new Map();
  if (!candidatos.length) return { resultados: resultados, indisponivel: false };
  if (!obterQuadro || !fetchImpl) return { resultados: resultados, indisponivel: true };

  let indisponivel = false;
  let motivo = null; // 'sem_chave' | 'indisponivel' | 'cota_sessao' | 'teto_live' | 'ocupado' | null
  let falhas = 0;
  let feitos = 0;
  const limitar = limitador(Math.max(1, Math.min(2, concorrencia)));

  await Promise.all(candidatos.map((m) => limitar(async () => {
    if ((sinal && sinal.aborted) || indisponivel || !aindaValido()) return;
    const instantes = instantesDoCandidato(m, { limites: limites });
    const pares = await Promise.all([
      quadrosDoCandidato(instantes, { obterQuadro: obterQuadro, sinal: sinal }),
      falaDoCandidato(m, { canal: canal, armazemFalas: armazemFalas, transcrever: transcrever, sinal: sinal }),
    ]);
    const quadros = pares[0];
    const linhasFala = pares[1];
    if ((sinal && sinal.aborted) || !aindaValido()) return;
    const transcricao = linhasFala.map((l) => l.t).join(' ');
    // janelaS (o que o MODELO vê) é relativo ao clipe; deMs/ateMs (o que o SERVIDOR usa p/ identidade e teto)
    // são o intervalo ABSOLUTO real deste candidato — nunca viajam juntos para o mesmo campo.
    const pedido = construirPedido({
      quadros: quadros, transcricao: transcricao, janelaS: Math.round(((m.ms || m.deMs) - m.deMs) / 1000), canal: canal,
      liveId: liveId, deMs: m.deMs, ateMs: m.ateMs,
    });
    const id = m.id || m.ms;
    if (!pedidoValido(pedido)) {
      resultados.set(id, null); aoResultado(id, null, 'invalido'); feitos++; aoProgresso({ feitos: feitos, total: candidatos.length });
      return;
    }
    try {
      const resp = await fetchImpl(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pedido), signal: sinal,
      });
      if (resp.status === 503 || resp.status === 429) {
        // 503 = sem chave/indisponível; 429 = teto da SESSÃO (global) ou da LIVE (só esta live) ou fila cheia.
        const codigo = resp.status === 503 ? 'sem_chave' : await codigoDeErro(resp);
        motivo = resp.status === 503 ? 'sem_chave' : codigo === 'teto_candidatos' ? 'teto_live' : codigo === 'teto_sessao' ? 'cota_sessao' : codigo === 'fila_cheia' ? 'ocupado' : 'indisponivel';
        indisponivel = true;
        return;
      }
      if (!resp.ok) { falhas++; resultados.set(id, null); aoResultado(id, null, 'falha'); return; }
      const json = await resp.json();
      const r = validarContexto(json && json.contexto);
      if (!aindaValido()) return;
      const valor = r.ok ? Object.assign({}, r.contexto, { versaoContrato: VERSAO_CONTRATO }) : null;
      if (!valor) falhas++;
      resultados.set(id, valor);
      aoResultado(id, valor, valor ? 'ok' : 'invalido');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      falhas++;
      resultados.set(id, null);
      aoResultado(id, null, 'falha');
    } finally {
      feitos++;
      aoProgresso({ feitos: feitos, total: candidatos.length });
    }
  })));

  return { resultados: resultados, indisponivel: indisponivel, motivo: motivo, falhas: falhas };
}

/** O código curto de erro do servidor (`erro`), sem ecoar a mensagem nem o corpo: nunca vai para a tela. */
async function codigoDeErro(resp) {
  try { const j = await resp.json(); return typeof j?.erro === 'string' ? j.erro : null; } catch { return null; }
}

/** Anexa o veredito. Sem etiqueta de tiros (lista sem etiquetas, ou sem som de tiro) ele fica no próprio momento
 * (`m.contexto`): nunca se perde em silêncio. `null` não apaga o que já havia. */
export function comContexto(m, contexto) {
  if (!contexto) return m;
  const temTiros = (m.etiquetas || []).some((e) => e.tipo === 'tiros');
  const etiquetas = (m.etiquetas || []).map((e) => (e.tipo === 'tiros' ? Object.assign({}, e, { contexto: contexto }) : e));
  // Rebaixa só o que é claramente não-combate (ambiente, ou o jogador ausente): a barulheira sozinha não manda.
  // Reação e conversa mantêm a nota; o candidato continua na lista.
  const rebaixa = contexto.tipo === 'ambiente' || contexto.participacao === 'ausente';
  const nota = rebaixa && (m.nota === 'bom' || m.nota === 'muitoBom') ? 'talvez' : m.nota;
  const pontos = rebaixa && Number.isFinite(m.pontos) ? Math.min(m.pontos, 1) : m.pontos;
  return Object.assign({}, m, { etiquetas: etiquetas }, temTiros ? {} : { contexto: contexto }, { nota: nota, pontos: pontos });
}
