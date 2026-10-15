// A analise em fundo dos candidatos (site/contexto-candidatos.js): escolhe ate 20, pede 3 a 5 quadros clipados
// ao VOD, reaproveita a fala em cache, chama o endpoint mockado (nunca a API de verdade), e respeita
// cancelamento e navegacao (um resultado tardio de outra live nunca e aplicado).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  precisaDeContexto, escolherCandidatos, instantesDoCandidato, analisarCandidatos, comContexto,
  MAX_CANDIDATOS_POR_LIVE,
} from '../site/contexto-candidatos.js';

function tiro(over) { return Object.assign({ tipo: 'tiros', conf: 0.6, fonte: 'rotulos', n: 22 }, over || {}); }
function momento(id, pontos, over) {
  return Object.assign({ id: id, ms: id * 1000, deMs: id * 1000 - 5000, ateMs: id * 1000 + 5000, pontos: pontos, etiquetas: [tiro()] }, over || {});
}

test('precisaDeContexto: so quando ha etiqueta de tiros sem veredito desta versao do contrato', () => {
  assert.equal(precisaDeContexto({ etiquetas: [] }), false);
  assert.equal(precisaDeContexto({ etiquetas: [tiro()] }), true);
  // Veredito deste contrato E deste prompt (v2) não precisa de nova análise; prompt antigo (v1) precisa.
  assert.equal(precisaDeContexto({ etiquetas: [tiro({ contexto: { versaoContrato: 1, revisaoPrompt: 'v2' } })] }), false);
  assert.equal(precisaDeContexto({ etiquetas: [tiro({ contexto: { versaoContrato: 1, revisaoPrompt: 'v1' } })] }), true);
  assert.equal(precisaDeContexto({ etiquetas: [tiro({ contexto: { versaoContrato: 999 } })] }), true);
});

test('escolherCandidatos: no maximo 20, os de maior pontuacao primeiro, sem remover os outros da lista', () => {
  const momentos = Array.from({ length: 30 }, (_, i) => momento(i + 1, i));
  const esc = escolherCandidatos(momentos);
  assert.equal(esc.length, MAX_CANDIDATOS_POR_LIVE);
  assert.deepEqual(esc.map((m) => m.pontos), [...esc.map((m) => m.pontos)].sort((a, b) => b - a));
  assert.equal(esc[0].pontos, 29);
  assert.equal(momentos.length, 30);
});

test('instantesDoCandidato: 3 a 5 instantes, clipados aos limites do VOD', () => {
  const m = momento(100);
  const is1 = instantesDoCandidato(m, {});
  assert.ok(is1.length >= 3 && is1.length <= 5);
  assert.ok(is1[0] >= m.deMs && is1[is1.length - 1] <= m.ateMs);
  const limites = { deMs: m.ms - 1500, ateMs: m.ms + 1500 };
  const is2 = instantesDoCandidato(m, { limites: limites });
  assert.ok(is2.every((t) => t >= limites.deMs && t <= limites.ateMs));
});

function fakeQuadro(ms) { return Promise.resolve({ jpegBase64: 'q' + ms }); }
function respostaOk(contexto) {
  return async () => ({ ok: true, status: 200, json: async () => ({ contexto: contexto }) });
}
const contextoValido = {
  tipo: 'combate', participacao: 'confirmada', origem: 'ia-remota', resumo: 'x',
  evidencias: { visuais: ['dano visivel'] }, recebeuFala: false,
};

test('analisarCandidatos: chama o endpoint, valida a resposta e devolve o contexto por id', async () => {
  const momentos = [momento(1, 5), momento(2, 3)];
  let chamadas = 0;
  const r = await analisarCandidatos({
    momentos: momentos, canal: 'kodd', obterQuadro: fakeQuadro,
    fetchImpl: async (...a) => { chamadas++; return respostaOk(contextoValido)(...a); },
  });
  assert.equal(r.indisponivel, false);
  assert.equal(r.resultados.size, 2);
  assert.equal(r.resultados.get(1).tipo, 'combate');
  assert.equal(chamadas, 2);
});

test('sem fetch ou sem obterQuadro: fica indisponivel, nunca inventa um veredito', async () => {
  const momentos = [momento(1, 5)];
  const r1 = await analisarCandidatos({ momentos: momentos, canal: 'x', obterQuadro: null, fetchImpl: respostaOk(contextoValido) });
  assert.equal(r1.indisponivel, true);
  assert.equal(r1.resultados.size, 0);
  const r2 = await analisarCandidatos({ momentos: momentos, canal: 'x', obterQuadro: fakeQuadro, fetchImpl: null });
  assert.equal(r2.indisponivel, true);
});

test('503 do servidor (sem chave): marca indisponivel e para de pedir aos outros candidatos', async () => {
  const momentos = [momento(1, 5), momento(2, 4), momento(3, 3)];
  let chamadas = 0;
  const r = await analisarCandidatos({
    momentos: momentos, canal: 'x', obterQuadro: fakeQuadro, concorrencia: 1,
    fetchImpl: async () => { chamadas++; return { ok: false, status: 503, json: async () => ({ erro: 'sem_chave' }) }; },
  });
  assert.equal(r.indisponivel, true);
  assert.ok(chamadas <= 3);
});

test('cancelamento: um sinal abortado para antes de terminar, sem lancar', async () => {
  const momentos = Array.from({ length: 5 }, (_, i) => momento(i + 1, i));
  const controlo = new AbortController();
  let chamadas = 0;
  const p = analisarCandidatos({
    momentos: momentos, canal: 'x', obterQuadro: fakeQuadro, sinal: controlo.signal,
    fetchImpl: async () => { chamadas++; controlo.abort(); return respostaOk(contextoValido)(); },
  });
  await assert.doesNotReject(p);
  const r = await p;
  assert.ok(chamadas <= 5);
  assert.ok(r.resultados.size <= 5);
});

test('navegacao: aindaValido falso descarta o resultado (nunca pinta outra live)', async () => {
  const momentos = [momento(1, 5)];
  let valido = true;
  const r = await analisarCandidatos({
    momentos: momentos, canal: 'x', obterQuadro: fakeQuadro,
    fetchImpl: async () => { valido = false; return respostaOk(contextoValido)(); },
    aindaValido: () => valido,
  });
  assert.equal(r.resultados.size, 0);
});

test('fala em cache (falas.js) nao chama transcrever de novo', async () => {
  const m = momento(1, 5);
  let transcreveu = 0;
  const armazemFalas = {
    lerFalas: () => [{ canal: 'x', deMs: m.deMs, ateMs: m.ateMs, linhas: [{ t: 'tomei um tiro', de: m.deMs, ate: m.deMs + 1000 }] }],
    guardarFala: () => { throw new Error('nao devia guardar de novo'); },
  };
  let pedidoRecebido = null;
  await analisarCandidatos({
    momentos: [m], canal: 'x', obterQuadro: fakeQuadro, armazemFalas: armazemFalas,
    transcrever: async () => { transcreveu++; return { linhas: [] }; },
    fetchImpl: async (url, init) => { pedidoRecebido = JSON.parse(init.body); return respostaOk(contextoValido)(); },
  });
  assert.equal(transcreveu, 0);
  assert.match(pedidoRecebido.transcricao, /tomei um tiro/);
});

test('sem fala em cache, transcreve e guarda para a proxima (nunca um texto de exemplo inventado)', async () => {
  const m = momento(1, 5);
  let guardou = null;
  const armazemFalas = { lerFalas: () => [], guardarFala: (e) => { guardou = e; } };
  let pedidoRecebido = null;
  await analisarCandidatos({
    momentos: [m], canal: 'x', obterQuadro: fakeQuadro, armazemFalas: armazemFalas,
    transcrever: async () => ({ linhas: [{ palavras: [{ t: 'cuidado', de: m.deMs, ate: m.deMs + 300 }] }] }),
    fetchImpl: async (url, init) => { pedidoRecebido = JSON.parse(init.body); return respostaOk(contextoValido)(); },
  });
  assert.match(pedidoRecebido.transcricao, /cuidado/);
  assert.equal(guardou.canal, 'x');
  assert.match(guardou.linhas[0].t, /cuidado/);
});

test('sem transcrever disponivel e sem cache: nenhuma fala inventada', async () => {
  const m = momento(1, 5);
  let pedidoRecebido = null;
  const r = await analisarCandidatos({
    momentos: [m], canal: 'x', obterQuadro: fakeQuadro,
    fetchImpl: async (url, init) => { pedidoRecebido = JSON.parse(init.body); return respostaOk(contextoValido)(); },
  });
  assert.equal(pedidoRecebido.transcricao, '');
  assert.equal(pedidoRecebido.recebeuFala, false);
  assert.equal(r.resultados.get(1).tipo, 'combate');
});

test('comContexto: so anexa na etiqueta de tiros; null nao apaga o que ja havia', () => {
  const m = { etiquetas: [tiro(), { tipo: 'chat', conf: 0.5 }] };
  const ctx = { tipo: 'combate', participacao: 'confirmada' };
  const com = comContexto(m, ctx);
  assert.equal(com.etiquetas[0].contexto, ctx);
  assert.equal(com.etiquetas[1].contexto, undefined);
  const semMudar = comContexto(m, null);
  assert.equal(semMudar, m);
});

test('instantesDoCandidato: clipe curto (1,5 s e 0,8 s) ainda tem 3 instantes distintos, dentro do trecho', () => {
  for (const span of [1500, 800]) {
    const m = { deMs: 10_000, ateMs: 10_000 + span, ms: 10_000 + span / 2 };
    const is = instantesDoCandidato(m, {});
    assert.ok(is.length >= 3, 'span ' + span + ': ' + is.length);
    assert.equal(new Set(is).size, is.length, 'sem repetidos');
    assert.ok(is.every((t) => t >= m.deMs && t < m.ateMs), 'dentro do trecho');
  }
});

test('instantesDoCandidato: nunca amostra o fim exato do VOD (um seek ali cai fora do vídeo)', () => {
  const m = momento(100);
  const is = instantesDoCandidato(m, {});
  assert.ok(is.every((t) => t < m.ateMs), 'nenhum instante igual ao fim: ' + is.join(','));
  const curto = { deMs: 0, ateMs: 1500, ms: 750 };
  assert.ok(instantesDoCandidato(curto, {}).every((t) => t < curto.ateMs));
});

test('quota e teto: 429 da sessão, 429 da live e 503 viram motivos diferentes; nada de corpo ecoado', async () => {
  const cenarios = [
    [429, 'teto_sessao', 'cota_sessao'], [429, 'teto_candidatos', 'teto_live'], [503, 'sem_chave', 'sem_chave'],
  ];
  for (const [status, erro, motivo] of cenarios) {
    const r = await analisarCandidatos({
      momentos: [momento(1, 5), momento(2, 4)], canal: 'x', obterQuadro: fakeQuadro, concorrencia: 1,
      fetchImpl: async () => ({ ok: false, status: status, json: async () => ({ erro: erro, mensagem: 'segredo-nao-mostrar' }) }),
    });
    assert.equal(r.indisponivel, true, erro);
    assert.equal(r.motivo, motivo, erro);
  }
});

test('502 de um candidato: conta como falha, sem parar a fila nem inventar veredito', async () => {
  let n = 0;
  const r = await analisarCandidatos({
    momentos: [momento(1, 5), momento(2, 4)], canal: 'x', obterQuadro: fakeQuadro, concorrencia: 1,
    fetchImpl: async (...a) => { n++; return n === 1 ? { ok: false, status: 502, json: async () => ({ erro: 'falha_api' }) } : respostaOk(contextoValido)(...a); },
  });
  assert.equal(r.indisponivel, false);
  assert.equal(r.falhas, 1);
  assert.equal(r.resultados.get(1), null);
  assert.equal(r.resultados.get(2).tipo, 'combate');
});

test('comContexto sem etiqueta de tiros: o veredito fica no próprio momento, nunca se perde em silêncio', () => {
  const ctx = { tipo: 'ambiente', participacao: 'ausente' };
  const semEtiquetas = comContexto({ id: 9 }, ctx);
  assert.equal(semEtiquetas.contexto, ctx);
  const comChat = comContexto({ etiquetas: [{ tipo: 'chat', conf: 0.5 }] }, ctx);
  assert.equal(comChat.contexto, ctx);
});

test('comContexto: ambiente ou jogador ausente rebaixa a nota de bom/muito bom; reação e conversa mantêm', () => {
  const base = { id: 1, nota: 'muitoBom', pontos: 7, etiquetas: [tiro()] };
  const amb = comContexto(base, { tipo: 'ambiente', participacao: 'ausente' });
  assert.equal(amb.nota, 'talvez');
  assert.ok(amb.pontos <= 1);
  assert.equal(amb.etiquetas.length, 1, 'o candidato continua na lista');
  const reac = comContexto({ ...base, nota: 'bom', pontos: 4 }, { tipo: 'reacao', participacao: 'indeterminada' });
  assert.equal(reac.nota, 'bom');
  assert.equal(reac.pontos, 4);
});

// ── regressões da nota: reação/conversa sem combate, ambiente só com tiros, ambiente com grito/chat, reanálise ──
const ambiente = { tipo: 'ambiente', participacao: 'ausente' };
const reacaoSemCombate = { tipo: 'reacao', participacao: 'ausente' };
const conversaSemCombate = { tipo: 'conversa', participacao: 'ausente' };
const combateConfirmado = { tipo: 'combate', participacao: 'confirmada' };
const destaque = (over) => Object.assign({ id: 1, nota: 'muitoBom', pontos: 7, etiquetas: [tiro()] }, over || {});

test('regressão: reação ou conversa sem combate (jogador ausente) mantêm a nota e os pontos do highlight', () => {
  for (const ctx of [reacaoSemCombate, conversaSemCombate]) {
    const r = comContexto(destaque({ etiquetas: [tiro(), { tipo: 'grito', conf: 0.43 }] }), ctx);
    assert.equal(r.nota, 'muitoBom', ctx.tipo);
    assert.equal(r.pontos, 7, ctx.tipo);
  }
});

test('regressão: ambiente só com tiros tira a promoção que vinha só do som', () => {
  const r = comContexto(destaque(), ambiente);
  assert.equal(r.nota, 'talvez');
  assert.equal(r.pontos, 1);
  assert.equal(r.etiquetas.length, 1, 'o candidato continua na lista');
});

test('regressão: ambiente com grito ou chat próprios (sinal independente dos tiros) não rebaixa', () => {
  const comGrito = comContexto(destaque({ nota: 'bom', pontos: 4, etiquetas: [tiro(), { tipo: 'grito', conf: 0.43 }] }), ambiente);
  assert.equal(comGrito.nota, 'bom');
  assert.equal(comGrito.pontos, 4);
  const comChat = comContexto(destaque({ nota: 'bom', pontos: 4, etiquetas: [tiro(), { tipo: 'chat', conf: 0.45 }] }), ambiente);
  assert.equal(comChat.nota, 'bom');
  assert.equal(comChat.pontos, 4);
  // Chat abaixo do piso do filtro não é sinal aceito pelo detector: o ambiente ainda rebaixa.
  const chatFraco = comContexto(destaque({ nota: 'bom', pontos: 4, etiquetas: [tiro(), { tipo: 'chat', conf: 0.1 }] }), ambiente);
  assert.equal(chatFraco.nota, 'talvez');
});

test('regressão: jogador ausente de um combate continua rebaixando (critério existente)', () => {
  const r = comContexto(destaque({ nota: 'bom', pontos: 4 }), { tipo: 'combate', participacao: 'ausente' });
  assert.equal(r.nota, 'talvez');
  assert.equal(r.pontos, 1);
});

test('regressão: reanálise guarda a nota original, recupera ao corrigir e não rebaixa em cima do rebaixado', () => {
  const amb = comContexto(destaque(), ambiente);
  assert.equal(amb.notaOriginal, 'muitoBom');
  assert.equal(amb.pontosOriginais, 7);
  const deNovo = comContexto(amb, ambiente);
  assert.deepEqual([deNovo.nota, deNovo.pontos], ['talvez', 1]);
  const corrigido = comContexto(JSON.parse(JSON.stringify(deNovo)), combateConfirmado);
  assert.deepEqual([corrigido.nota, corrigido.pontos], ['muitoBom', 7]);
  assert.deepEqual([comContexto(corrigido, reacaoSemCombate).nota, comContexto(corrigido, reacaoSemCombate).pontos], ['muitoBom', 7]);
  const outraVez = comContexto(corrigido, ambiente);
  assert.deepEqual([outraVez.nota, outraVez.pontos], ['talvez', 1]);
  assert.equal(outraVez.notaOriginal, 'muitoBom', 'o original não muda com as reanálises');
  assert.equal(outraVez.pontosOriginais, 7);
});

test('regressão: cache antigo já rebaixado (sem original guardado) não ganha original inventado', () => {
  const antigo = { id: 1, nota: 'talvez', pontos: 1, etiquetas: [{ ...tiro(), contexto: ambiente }] };
  const r = comContexto(antigo, combateConfirmado);
  assert.equal(r.nota, 'talvez', 'sem o original real, não se restaura um valor inventado');
  assert.equal(r.pontos, 1);
  assert.equal(r.notaOriginal, undefined);
  assert.equal(r.pontosOriginais, undefined);
});
