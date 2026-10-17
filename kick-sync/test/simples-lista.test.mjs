// O modo simples sem tela: o que se escreve na caixa, a lista de um vídeo e o nome do arquivo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerEntrada, nomeDeEvento, montarLista, nomeDoArquivo, tempoNaLive, partesDeFalha, MAX_CLIPE_MS, lancesParaLista, comMomentoDoLink,
  acharVod, guardarVod, lerVods, mensagensDosPicos, lerUltimo, guardarUltimo, MAX_VODS, IGUAL_MS, VALE_AO_VIVO_MS,
} from '../site/simples-lista.js';
import { sinaisDoEvento, melhoresLances, filtrarLances } from '../site/melhores.js';
import { motivoEmPalavras, quemEstavaNoLance } from '../site/simples.js';
import { tituloDoMomento } from '../site/titulo.js';
import { canaisNoArDoLance, noArEm, inicioDaLiveEm } from '../site/evento-ui.js';

test('a caixa entende o nome solto, os links da Kick e o evento', () => {
  assert.deepEqual(lerEntrada('xguiry'), { tipo: 'nome', slug: 'xguiry', evento: 'xguiry' });
  assert.deepEqual(lerEntrada('@xguiry'), { tipo: 'nome', slug: 'xguiry', evento: 'xguiry' });
  assert.deepEqual(lerEntrada('Abisal'), { tipo: 'nome', slug: 'Abisal', evento: 'abisal' });
  assert.deepEqual(lerEntrada('Kick Off'), { tipo: 'nome', slug: null, evento: 'kick-off' });
  assert.deepEqual(lerEntrada('https://kick.com/xguiry/videos'), { tipo: 'canal', slug: 'xguiry' });
  assert.deepEqual(lerEntrada('kick.com/xguiry/clips'), { tipo: 'canal', slug: 'xguiry' });
  assert.deepEqual(lerEntrada('https://kick.com/xguiry/videos/abc-1'), { tipo: 'vod', id: 'abc-1', slug: 'xguiry' });
  assert.deepEqual(lerEntrada('https://kick.com/xguiry/clips/clip_01AB'), { tipo: 'clipe', id: 'clip_01AB' });
  assert.deepEqual(lerEntrada('https://povix.app/?e=abisal'), { tipo: 'evento', nome: 'abisal' });
  assert.deepEqual(lerEntrada('?e=Abisal'), { tipo: 'evento', nome: 'abisal' });
  assert.deepEqual(lerEntrada('https://povix.app/#evento=abc&nome=x'), { tipo: 'eventoLink', hash: '#evento=abc&nome=x' });
  for (const mau of ['', '   ', 'https://youtube.com/watch?v=1', 'twitch.tv/xguiry']) assert.equal(lerEntrada(mau), null, mau);
});

test('o nome de um evento vira o nome do arquivo dele', () => {
  assert.equal(nomeDeEvento('  Abisal '), 'abisal');
  assert.equal(nomeDeEvento('Copa Ação 2'), 'copa-acao-2');
});

const T = Date.UTC(2026, 9, 10, 20, 0, 0);
const min = (n) => T + n * 60_000;

test('chat e som no mesmo minuto viram um momento só, e valem mais', () => {
  const lista = montarLista({
    picos: [{ ms: min(10), msgs: 40, vezes: 6 }, { ms: min(50), msgs: 30, vezes: 4 }],
    sons: [{ ms: min(10) - 20_000, tipo: 'tiros', tiros: 6, combateDeMs: min(10) - 30_000, combateAteMs: min(10) - 10_000 }],
    limites: { deMs: T, ateMs: min(120) },
  });
  assert.equal(lista.length, 2);
  assert.deepEqual(lista[0].tipos.sort(), ['chat', 'tiros']);
  assert.equal(lista[0].nota, 'muitoBom');
  // O clipe é o da luta, com uns segundos antes e depois.
  assert.equal(lista[0].deMs, min(10) - 35_000);
  assert.equal(lista[0].ateMs, min(10) - 7000);
  // Só o chat: o clipe começa antes do pico, porque o chat reage depois.
  assert.deepEqual(lista[1].tipos, ['chat']);
  assert.ok(lista[1].deMs < min(50) && lista[1].ateMs > min(50));
  assert.ok(lista[0].pontos > lista[1].pontos);
});

test('o clipe fica dentro do vídeo e nunca passa de um minuto', () => {
  const [m] = montarLista({
    sons: [{ ms: min(1), tipo: 'tiros', tiros: 30, combateDeMs: T - 60_000, combateAteMs: min(4) }],
    limites: { deMs: T, ateMs: min(120) },
  });
  assert.ok(m.deMs >= T);
  assert.ok(m.ateMs - m.deMs <= MAX_CLIPE_MS);
});

test('um pico de chat que reclama do som cai para o fim', () => {
  const mensagens = [
    ...Array.from({ length: 8 }, (_, i) => ({ ms: min(10) + i * 1000, texto: 'esta muted no?' })),
    ...Array.from({ length: 2 }, (_, i) => ({ ms: min(10) + i * 1000, texto: 'kkkk' })),
  ];
  assert.ok(partesDeFalha(mensagens, min(10)) >= 0.5);
  const lista = montarLista({
    picos: [{ ms: min(10), msgs: 80, vezes: 15 }, { ms: min(40), msgs: 20, vezes: 3 }],
    mensagens,
  });
  assert.equal(lista[0].ms, min(40));
  assert.equal(lista[1].falha, true);
});

test('o arquivo diz quem, que dia e o quê, na hora do aparelho', () => {
  const ms = new Date(2026, 9, 10, 22, 12).getTime();
  assert.equal(nomeDoArquivo({ canal: 'xguiry', ms, motivo: 'tiroteio' }), 'xguiry - 10-10 - tiroteio.mp4');
  assert.equal(nomeDoArquivo({ canal: 'xguiry', ms, motivo: 'chat', deitado: true, extensao: 'webm' }),
    'xguiry - 10-10 - chat (deitado).webm');
  assert.equal(nomeDoArquivo({ canal: 'a/b', ms, motivo: 'x:y' }), 'a b - 10-10 - x y.mp4');
});

test('o tempo na live em palavras curtas', () => {
  assert.equal(tempoNaLive(min(83), T), '1h23');
  assert.equal(tempoNaLive(min(12), T), '12 min');
});

// ── o evento na lista simples ─────────────────────────────────────────────

/** Os lances como o evento-ui.js os dá à lista simples: filtrados, cada um com os canais no ar. */
function lancesDe(entrada) {
  const todos = melhoresLances(sinaisDoEvento(entrada));
  return filtrarLances(todos).map((l) => ({ ...l, noAr: l.canais }));
}
const morte = (ms, extra = {}) => ({
  id: 'm1', ms, msMatador: ms, matador: 'xguiry', vitima: 'cyrus', canalMatador: 'xguiry', canalVitima: 'cyrus', ...extra,
});

test('evento: a morte e quem estava no lance entram na nota e no motivo', () => {
  const lances = lancesDe({
    mortes: [morte(min(30))],
    momentos: [{ ms: min(30) - 2000, protagonista: 'xguiry', auto: true, tipo: 'tiros', origem: 'detectar' }],
    marcas: new Map([['xguiry', [{ tipo: 'chat', ms: min(30) + 15_000, vezes: 6, msgs: 40 }]]]),
  });
  const [m, ...resto] = lancesParaLista(lances);
  assert.equal(resto.length, 0);
  assert.equal(m.canal, 'xguiry');
  assert.deepEqual(m.outros, ['cyrus']);
  // `fonte: null` explícito (simples-lista.js, proveniência): sem valor padrão, a morte sem fonte dita
  // nunca é confundida com "servidor" (titulo.js só confirma pelo que realmente veio do produtor).
  assert.deepEqual(m.mortes, [{ matador: 'xguiry', vitima: 'cyrus', canalMatador: 'xguiry', canalVitima: 'cyrus', fonte: null }]);
  assert.deepEqual(m.povs, [{ canal: 'cyrus', relacao: 'vitima', pessoa: 'cyrus' }]);
  assert.deepEqual(m.tipos.sort(), ['chat', 'morte', 'tiros']);
  assert.equal(m.nota, 'muitoBom');
  assert.equal(m.doEvento, true);
  // O clipe abre uns segundos antes do primeiro sinal forte e não passa de um minuto.
  assert.ok(m.deMs < m.ms && m.ateMs - m.deMs <= MAX_CLIPE_MS);
  assert.equal(motivoEmPalavras(m), 'xguiry matou cyrus no tiroteio e o chat explodiu');
  assert.equal(quemEstavaNoLance(m), 'Também estavam no lance: cyrus');
});

test('evento: o motivo sem tiroteio, sem quem matou e com várias mortes', () => {
  const base = { tipos: ['morte'], mortes: [{ matador: 'a', vitima: 'b' }] };
  assert.equal(motivoEmPalavras(base), 'a matou b');
  assert.equal(motivoEmPalavras({ ...base, mortes: [{ matador: '', vitima: 'b' }] }), 'b morreu');
  assert.equal(motivoEmPalavras({ ...base, mortes: [{ matador: 'a', vitima: 'b' }, { matador: 'a', vitima: 'c' }] }), 'a matou b e mais 1 morte');
  assert.equal(motivoEmPalavras({ tipos: ['tiros'], mortes: [] }), 'Teve tiroteio');
  const muitos = { outros: ['a', 'b', 'c', 'd', 'e', 'f'] };
  assert.equal(quemEstavaNoLance(muitos), 'Também estavam no lance: a, b, c, d e mais 2');
  assert.equal(quemEstavaNoLance({ outros: [] }), '');
});

test('evento: o canal escolhido é o principal e só entram lances com esse POV disponível', () => {
  const lances = lancesDe({ mortes: [morte(min(30))] });
  const [m] = lancesParaLista(lances, { canalPrincipal: '@Cyrus' });
  assert.equal(m.canal, 'cyrus');
  assert.equal(m.meuPov, true);
  assert.deepEqual(m.povs, [{ canal: 'xguiry', relacao: 'matou', pessoa: 'xguiry' }]);
  assert.deepEqual(lancesParaLista(lances, { canalPrincipal: 'fora-do-evento' }), []);
  assert.deepEqual(lancesParaLista(lances.map((l) => ({ ...l, noAr: ['xguiry'] })), { canalPrincipal: 'cyrus' }), []);
});

test('evento: chat que reclama do som cai, e quem não está no ar não entra', () => {
  const mensagens = new Map([['xguiry', [
    ...Array.from({ length: 8 }, (_, i) => ({ ms: min(10) + i * 1000, texto: 'esta muted no?' })),
    ...Array.from({ length: 2 }, (_, i) => ({ ms: min(10) + i * 1000, texto: 'kkkk' })),
  ]]]);
  const marcas = new Map([
    ['xguiry', [{ tipo: 'chat', ms: min(10), vezes: 10, msgs: 80 }]],
    ['cyrus', [{ tipo: 'chat', ms: min(50), vezes: 4, msgs: 20 }]],
    ['fora', [{ tipo: 'chat', ms: min(80), vezes: 9, msgs: 60 }]],
  ]);
  const lances = filtrarLances(melhoresLances(sinaisDoEvento({ marcas }))).map((l) => ({ ...l, noAr: l.canais.filter((c) => c !== 'fora') }));
  const lista = lancesParaLista(lances, { mensagens });
  assert.deepEqual(lista.map((m) => m.canal), ['cyrus', 'xguiry']);
  assert.equal(lista[1].falha, true);
  assert.equal(lista[0].falha, false);
});

// Sugestão visual de POV: a kill da montagem com vítimas (slugs) sem morte confirmada. Fluxo sinais -> resumo -> lista.
const ligacoes = (momentos, noAr, extra = {}) => {
  const lances = filtrarLances(melhoresLances(sinaisDoEvento({ momentos })))
    .map((l) => ({ ...l, noAr: noAr ?? l.canais, ...extra }));
  return lancesParaLista(lances, { canalPrincipal: extra.canalPrincipal ?? '' });
};

test('sugestão: vítimas múltiplas viram POVs de origem vídeo, sem protagonista, sem duplicata, sem morte', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia', 'cyra', 'bia', 'ana'] }];
  const [item, ...resto] = ligacoes(momentos, ['ana', 'bia', 'cyra']);
  assert.equal(resto.length, 0);
  assert.equal(item.canal, 'ana');
  assert.deepEqual(item.povs, [
    { canal: 'bia', relacao: '', pessoa: '', origem: 'video' },
    { canal: 'cyra', relacao: '', pessoa: '', origem: 'video' },
  ]);
  // Não confirmado: nenhuma morte, nenhum tipo "morte", e o título não tem por onde confirmar combate.
  assert.deepEqual(item.mortes, []);
  assert.equal(item.tipos.includes('morte'), false);
  assert.equal(motivoEmPalavras(item).includes('matou'), false);
});

test('sugestão: sem o VOD da vítima no ar, ela não vira POV; sem o VOD do protagonista, o lance some', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia', 'cyra'] }];
  const [item] = ligacoes(momentos, ['ana', 'bia']);
  assert.deepEqual(item.povs.map((p) => p.canal), ['bia']);
  assert.deepEqual(ligacoes(momentos, ['bia', 'cyra'], { canalPrincipal: 'ana' }), [], 'protagonista fora do ar: sem lance');
  assert.deepEqual(ligacoes(momentos, ['ana'], { canalPrincipal: 'ana' })[0].povs, [], 'sem VOD das vítimas: sem POV');
});

test('sugestão: com morte real do mesmo canal, fica a morte (sem origem vídeo), e a outra vítima continua sugerida', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia', 'cyra'] }];
  const lances = filtrarLances(melhoresLances(sinaisDoEvento({
    momentos,
    mortes: [{ id: 'm1', matador: 'ana', vitima: 'bia', canalMatador: 'ana', canalVitima: 'bia', ms: min(30), fonte: 'servidor' }],
  }))).map((l) => ({ ...l, noAr: ['ana', 'bia', 'cyra'] }));
  const [item] = lancesParaLista(lances, { canalPrincipal: 'ana' });
  assert.deepEqual(item.povs, [
    { canal: 'bia', relacao: 'vitima', pessoa: 'bia' },
    { canal: 'cyra', relacao: '', pessoa: '', origem: 'video' },
  ]);
  assert.equal(item.povs.find((p) => p.canal === 'bia').origem, undefined);
});

// A cadeia real do modo simples (evento-ui.js lancesSimples), sem `noAr` injetado: a cobertura vem do mapa de
// coberturas, como na página. Só ficam de fora o elenco e o jogo da página (`doEvento`, `outroJogoEm`), que aqui
// são conjuntos explícitos.
const cadeiaSimples = (momentos, { coberturas, doEvento, outroJogo = new Map(), canalPrincipal = '' }) => {
  const lances = filtrarLances(melhoresLances(sinaisDoEvento({ momentos })));
  const comNoAr = lances.map((l) => ({
    ...l,
    noAr: canaisNoArDoLance(l, {
      noAr: (c) => noArEm(coberturas, c, l.msAbrir) || noArEm(coberturas, c, l.ms),
      vitimaNoAr: (c) => doEvento.has(c) && !(!noArEm(coberturas, c, l.ms) && noArEm(outroJogo, c, l.ms))
        && (noArEm(coberturas, c, l.msAbrir) || noArEm(coberturas, c, l.ms)),
    }),
  }));
  return { lances: comNoAr, lista: lancesParaLista(comNoAr, { canalPrincipal }) };
};
const aoVivo = (...canais) => new Map(canais.map((c) => [c, [[min(0), min(60)]]]));

test('cadeia real: a vítima sugerida no ar vira POV mesmo fora de l.canais, sem noAr injetado', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia'] }];
  const { lances, lista } = cadeiaSimples(momentos, { coberturas: aoVivo('ana', 'bia'), doEvento: new Set(['ana', 'bia']) });
  assert.deepEqual(lances[0].canais, ['ana'], 'l.canais continua só com quem emitiu o sinal');
  assert.deepEqual(lances[0].noAr, ['ana', 'bia']);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].canal, 'ana');
  assert.deepEqual(lista[0].povs, [{ canal: 'bia', relacao: '', pessoa: '', origem: 'video' }]);
});

test('cadeia real: vítima fora do evento, ou em outro jogo nesse instante, não vira POV', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia', 'dan', 'fora'] }];
  const coberturas = aoVivo('ana', 'bia', 'fora');
  const outroJogo = aoVivo('dan');
  const { lista } = cadeiaSimples(momentos, { coberturas, outroJogo, doEvento: new Set(['ana', 'bia', 'dan']) });
  assert.deepEqual(lista[0].povs.map((p) => p.canal), ['bia'], 'fora do evento (fora) e outro jogo (dan) saem');
});

test('cadeia real: protagonista sem VOD no instante não traz as vítimas; o protagonista preferido continua o canal', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia'] }];
  const semAna = cadeiaSimples(momentos, { coberturas: aoVivo('bia'), doEvento: new Set(['ana', 'bia']) });
  assert.deepEqual(semAna.lista, [], 'sem o protagonista no ar, a vítima sozinha não vira lance');
  const dois = cadeiaSimples(momentos, { coberturas: aoVivo('ana', 'bia'), doEvento: new Set(['ana', 'bia']), canalPrincipal: 'ana' });
  assert.equal(dois.lista[0].canal, 'ana');
  assert.equal(dois.lista[0].meuPov, true);
});

test('cadeia real: a sugestão não entra como morte, nem título a confirma como combate', () => {
  const momentos = [{ ms: min(30), protagonista: 'ana', vitimas: ['bia'] }];
  const { lista } = cadeiaSimples(momentos, { coberturas: aoVivo('ana', 'bia'), doEvento: new Set(['ana', 'bia']) });
  const [item] = lista;
  assert.deepEqual(item.mortes, []);
  assert.equal(item.tipos.includes('morte'), false);
  const titulo = tituloDoMomento({ ...item, vitimas: [], origem: 'lances' });
  assert.doesNotMatch(String(titulo), /morte|matou|combate|confirm/i, `título: ${titulo}`);
});

test('sugestão: a nota e o motivo do lance não mudam com as vítimas sugeridas', () => {
  const base = ligacoes([{ ms: min(30), protagonista: 'ana' }], ['ana', 'bia']);
  const com = ligacoes([{ ms: min(30), protagonista: 'ana', vitimas: ['bia'] }], ['ana', 'bia']);
  assert.equal(com[0].pontos, base[0].pontos);
  assert.equal(com[0].nota, base[0].nota);
  assert.equal(motivoEmPalavras(com[0]), motivoEmPalavras(base[0]));
});

// ── o que já se achou, lembrado neste aparelho ────────────────────────────

const armazemFalso = () => {
  const d = new Map();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k), d };
};

test('o vídeo procurado fica lembrado, e o mesmo vídeo (início com uns segundos de diferença) acha a lista', () => {
  const a = armazemFalso();
  const lista = montarLista({ picos: [{ ms: min(10), msgs: 40, vezes: 6 }], limites: { deMs: T, ateMs: min(120) } });
  guardarVod(a, { slug: 'tchubi', inicio: T, ateMs: min(120), completo: true, lista }, min(200));
  const e = acharVod(a, 'tchubi', T + 4000, min(201));
  assert.equal(e.completo, true);
  assert.deepEqual(e.lista, JSON.parse(JSON.stringify(lista)));
  assert.equal(acharVod(a, 'tchubi', T + IGUAL_MS + 1000, min(201)), null, 'outra live do mesmo streamer');
  assert.equal(acharVod(a, 'outro', T, min(201)), null);
  assert.equal(acharVod(a, 'tchubi', null), null);
});

test('guardar de novo o mesmo vídeo troca a entrada, e passando de oito saem os mais velhos', () => {
  const a = armazemFalso();
  guardarVod(a, { slug: 'x', inicio: T, picos: [] }, 1);
  guardarVod(a, { slug: 'x', inicio: T + 1000, completo: true, lista: [] }, 2);
  assert.equal(lerVods(a).length, 1);
  assert.equal(lerVods(a)[0].completo, true);
  let saiu = [];
  for (let i = 1; i <= MAX_VODS; i++) saiu = guardarVod(a, { slug: `c${i}`, inicio: T + i * 3_600_000, lista: [] }, 10 + i);
  assert.equal(lerVods(a).length, MAX_VODS);
  assert.deepEqual(saiu.map((e) => e.slug), ['x']);
});

test('uma live ainda no ar só vale uns minutos; uma que já acabou vale sempre', () => {
  const a = armazemFalso();
  const agora = min(500);
  guardarVod(a, { slug: 'vivo', inicio: T, ateMs: agora - 60_000, completo: true, lista: [] }, agora);
  guardarVod(a, { slug: 'velho', inicio: T, ateMs: agora - 3_600_000, completo: true, lista: [] }, agora);
  assert.ok(acharVod(a, 'vivo', T, agora + VALE_AO_VIVO_MS - 1));
  assert.equal(acharVod(a, 'vivo', T, agora + VALE_AO_VIVO_MS + 1), null);
  assert.ok(acharVod(a, 'velho', T, agora + 7 * 24 * 3_600_000));
});

test('o chat lembrado só leva as mensagens em volta dos picos, no formato da conta de falha', () => {
  const picos = [{ ms: min(10) }];
  const mensagens = [{ ms: min(1), texto: 'longe', autor: 'a' }, { ms: min(10) - 30_000, texto: 'esta muted no?', autor: 'b' }, { ms: min(10) + 10_000, texto: 'f5' }];
  const perto = mensagensDosPicos(mensagens, picos);
  assert.deepEqual(perto, [{ ms: min(10) - 30_000, texto: 'esta muted no?' }, { ms: min(10) + 10_000, texto: 'f5' }]);
  assert.equal(partesDeFalha(perto, min(10)), 0, 'com menos de cinco mensagens a conta não decide');
});

test('o último vídeo visto vai e volta, e Começar de novo apaga; armazenamento quebrado não atira', () => {
  const a = armazemFalso();
  assert.equal(lerUltimo(a), null);
  guardarUltimo(a, { slug: 'tchubi', inicio: T });
  assert.deepEqual(lerUltimo(a), { slug: 'tchubi', inicio: T });
  guardarUltimo(a, null);
  assert.equal(lerUltimo(a), null);
  const quebrado = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('cheio'); }, removeItem() { throw new Error('x'); } };
  assert.deepEqual(lerVods(quebrado), []);
  assert.equal(acharVod(quebrado, 'x', T), null);
  assert.deepEqual(guardarVod(quebrado, { slug: 'x', inicio: T }), []);
  assert.equal(lerUltimo(quebrado), null);
  guardarUltimo(quebrado, { slug: 'x', inicio: T });
  guardarUltimo(quebrado, null);
  const sujo = armazemFalso();
  sujo.setItem('povix.simplesVods', '{nao e lista');
  assert.deepEqual(lerVods(sujo), []);
});

test('com acerto confirmado pelo som do jogo, o motivo diz PvP e quantos acertos (e quantos na cabeça)', () => {
  assert.equal(motivoEmPalavras({ tipos: ['tiros'], acertos: 0 }), 'Teve tiroteio');
  assert.equal(motivoEmPalavras({ tipos: ['tiros', 'acerto'], acertos: 5, cabecas: 0 }), 'Teve PvP, 5 acertos');
  assert.equal(motivoEmPalavras({ tipos: ['tiros', 'acerto'], acertos: 5, cabecas: 2 }), 'Teve PvP, 5 acertos e 2 na cabeça');
  assert.equal(motivoEmPalavras({ tipos: ['tiros', 'acerto', 'chat'], acertos: 3, cabecas: 0 }), 'O chat explodiu e teve PvP, 3 acertos');
});

// ── proveniência da morte, da fonte ao título (cadeia real: sinais → lances → lista → título) ──

const listaDaMorte = (fonte) => {
  const lances = lancesDe({
    mortes: [morte(min(30), fonte === undefined ? {} : { fonte })],
    momentos: [{ ms: min(30) - 2000, protagonista: 'xguiry', auto: true, tipo: 'tiros', origem: 'detectar' }],
    marcas: new Map([['xguiry', [{ tipo: 'chat', ms: min(30) + 15_000, vezes: 6, msgs: 40 }]]]),
  });
  return lancesParaLista(lances);
};

test('proveniência: o log do servidor ligado ao canal chega à lista e confirma o combate no título', () => {
  const [m] = listaDaMorte('servidor');
  assert.equal(m.mortes[0].fonte, 'servidor', 'a fonte não se perde no caminho');
  assert.match(tituloDoMomento(m), /^Troca de tiros, morte/, 'o log do servidor confirma');
});

test('proveniência: morte de vídeo ou sem fonte não confirma o combate, e nunca vira servidor', () => {
  const [v] = listaDaMorte('video');
  assert.equal(v.mortes[0].fonte, 'video');
  assert.match(tituloDoMomento(v), /^Som alto, morte/, 'leitura de vídeo não confirma');
  const [s] = listaDaMorte(undefined);
  assert.equal(s.mortes[0].fonte, null, 'sem fonte fica sem fonte');
  assert.match(tituloDoMomento(s), /^Som alto, morte/, 'sem fonte não confirma');
});

test('o momento do link do evento vai para o topo: o da lista se já existe, senão um cartão só com o instante', () => {
  const itens = [{ canal: 'a', ms: 100_000, tipos: ['tiros'] }, { canal: 'b', ms: 500_000, tipos: ['chat'] }];
  assert.equal(comMomentoDoLink(itens, null), itens);
  const junto = comMomentoDoLink(itens, { canal: 'b', ms: 520_000 });
  assert.deepEqual(junto.map((m) => [m.canal, m.ms, Boolean(m.doLink)]), [['b', 500_000, true], ['a', 100_000, false]]);
  const novo = comMomentoDoLink(itens, { canal: 'a', ms: 900_000 });
  assert.equal(novo.length, 3);
  assert.deepEqual([novo[0].canal, novo[0].ms, novo[0].doLink, novo[0].doEvento, novo[0].tipos], ['a', 900_000, true, true, []]);
  assert.ok(novo[0].deMs < 900_000 && novo[0].ateMs > 900_000);
  // Outro canal no mesmo instante não é o mesmo momento.
  assert.equal(comMomentoDoLink(itens, { canal: 'c', ms: 100_000 }).length, 3);
  // A identidade é a do instante do link, antes e depois de a lista achar o momento.
  assert.equal(novo[0].chaveFixa, 'a|900');
  assert.equal(junto[0].chaveFixa, 'b|520');
  // O mais perto ganha, não o primeiro da ordem de pontos.
  const dois = [{ canal: 'a', ms: 128_000, pontos: 50 }, { canal: 'a', ms: 101_000, pontos: 10 }];
  assert.equal(comMomentoDoLink(dois, { canal: 'a', ms: 100_000 })[0].ms, 101_000);
});

test('o começo da live de um momento do evento: a última que já tinha começado, mesmo no ar depois da última leitura', () => {
  const cob = new Map([['a', [[1000, 5000], [9000, 12_000]]]]);
  assert.equal(inicioDaLiveEm(cob, 'a', 3000), 1000);
  assert.equal(inicioDaLiveEm(cob, 'a', 12_500), 9000);
  assert.equal(inicioDaLiveEm(cob, 'a', 500), null);
  assert.equal(inicioDaLiveEm(cob, 'b', 3000), null);
});
