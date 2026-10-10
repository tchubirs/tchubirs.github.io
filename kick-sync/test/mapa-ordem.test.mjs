// O mapa do evento, os pedidos do dono de 10/10, sem browser: a ordem das faixas, as riscas das horas e
// dos dias, o evento salvo no site (o link curto) e o juntar gente a um evento aberto.
//
// O fuso fica fixo aqui (São Paulo, -3 sem horário de verão desde 2019): as meias-noites são do fuso do
// aparelho, e um teste que dependesse do fuso da máquina passava numa e falhava noutra. Os testes do
// fuso de meia hora mudam-no só para eles.

process.env.TZ = 'America/Sao_Paulo';

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs');
const { ordenarFaixas, linhasDoTempo, montarMapa, pintarMapa, CORES } = await import('../site/mapa.js');
const {
  lerElenco, juntarElencos, nomeDoArquivo, paraArquivo, deArquivo,
} = await import('../site/elenco.js');

const MIN = 60_000;
const H = 60 * MIN;
// Sábado, 10/10/2026, 18:00 em São Paulo.
const T = Date.parse('2026-10-10T21:00:00.000Z');

// ── ordenarFaixas ───────────────────────────────────────────────────────────

const COB = new Map([
  ['alfa', [[T - H, T + H]]], // com vídeo em T
  ['bravo', [[T + 20 * MIN, T + 2 * H]]], // entra 20 min depois: perto
  ['charlie', [[T - 3 * H, T - 2 * H]]], // saiu há duas horas: o resto
  ['delta', [[T - 40 * MIN, T - 10 * MIN]]], // saiu 10 min antes: mais perto que o bravo
  ['eco', [[T - 30 * MIN, T + 5 * MIN]]], // com vídeo em T
  ['foxtrot', []], // nunca teve vídeo
]);
const CANAIS = ['charlie', 'alfa', 'bravo', 'delta', 'eco', 'foxtrot'];

test('clicar num horário: primeiro quem tem vídeo nele, depois quem esteve perto (do mais perto ao mais longe), depois o resto', () => {
  const g = ordenarFaixas(CANAIS, { modo: 'instante', ms: T, coberturas: COB, pertoMs: 30 * MIN });
  assert.deepEqual(g, [
    { chave: 'comVideo', canais: ['alfa', 'eco'] },
    { chave: 'perto', canais: ['delta', 'bravo'] },
    { chave: 'resto', canais: ['charlie', 'foxtrot'] },
  ]);
});

test('o perto tem limite: com 15 min, quem entra 20 min depois já é o resto', () => {
  const g = ordenarFaixas(CANAIS, { modo: 'instante', ms: T, coberturas: COB, pertoMs: 15 * MIN });
  assert.deepEqual(g.map((x) => [x.chave, x.canais]), [
    ['comVideo', ['alfa', 'eco']], ['perto', ['delta']], ['resto', ['charlie', 'bravo', 'foxtrot']],
  ]);
});

test('um grupo vazio não aparece, e as pontas do vídeo contam como "tem vídeo"', () => {
  const g = ordenarFaixas(['alfa', 'eco'], { modo: 'instante', ms: T + 5 * MIN, coberturas: COB });
  assert.deepEqual(g, [{ chave: 'comVideo', canais: ['alfa', 'eco'] }]);
});

test('ao vivo agora: os que estão no ar primeiro, depois os outros do que saiu há menos tempo ao que saiu há mais', () => {
  const g = ordenarFaixas(CANAIS, { modo: 'aoVivo', coberturas: COB, aoVivo: new Set(['bravo', 'charlie']) });
  assert.deepEqual(g, [
    { chave: 'aoVivo', canais: ['charlie', 'bravo'] },
    { chave: 'foraDoAr', canais: ['alfa', 'eco', 'delta', 'foxtrot'] },
  ]);
});

test('mais tempo no ar: contado dentro do trecho do evento, quando há um', () => {
  const tudo = ordenarFaixas(CANAIS, { modo: 'tempo', coberturas: COB });
  assert.deepEqual(tudo[0].canais, ['alfa', 'bravo', 'charlie', 'eco', 'delta', 'foxtrot']);
  // Só a hora a seguir a T: o bravo tem 40 min, o alfa 60, o eco 5.
  const janela = { deMs: T, ateMs: T + H };
  const noEvento = ordenarFaixas(CANAIS, { modo: 'tempo', coberturas: COB, janela });
  assert.deepEqual(noEvento[0].canais, ['alfa', 'bravo', 'eco', 'charlie', 'delta', 'foxtrot']);
});

test('de A a Z, sem diferença de maiúsculas e com números na ordem certa', () => {
  const g = ordenarFaixas(['zeta', 'Alfa', 'canal10', 'canal2', 'beta'], { modo: 'az' });
  assert.deepEqual(g, [{ chave: 'az', canais: ['Alfa', 'beta', 'canal2', 'canal10', 'zeta'] }]);
});

test('não mexe no que recebe, tira repetidos, e entradas estragadas não rebentam', () => {
  const lista = ['b', 'a', 'b', null, 3, ''];
  const copia = [...lista];
  assert.deepEqual(ordenarFaixas(lista, { modo: 'az' }), [{ chave: 'az', canais: ['a', 'b'] }]);
  assert.deepEqual(lista, copia);
  assert.deepEqual(ordenarFaixas(null, { modo: 'az' }), []);
  // Um instante que não é número não ordena por instante: volta tudo num grupo só, pela ordem que veio.
  assert.deepEqual(ordenarFaixas(['b', 'a'], { modo: 'instante', ms: NaN }), [{ chave: 'todos', canais: ['b', 'a'] }]);
});

test('noutra ordem cada faixa leva o time verdadeiro e o nome dele ao lado do canal', () => {
  const grupos = ordenarFaixas(['alfa', 'charlie', 'eco'], { modo: 'instante', ms: T, coberturas: COB });
  const times = grupos.map((g) => ({ nome: g.chave, canais: g.canais }));
  const timeDe = new Map([['alfa', 'Lobos'], ['charlie', 'Ursos']]);
  const m = montarMapa({ times, coberturas: COB, abertos: new Set(times.map((x) => x.nome)), timeDe });
  const alfa = m.linhas.find((l) => l.canal === 'alfa');
  assert.equal(alfa.time, 'Lobos');
  assert.equal(alfa.grupo, 'comVideo');
  assert.equal(alfa.rotulo, 'alfa (Lobos)');
  const eco = m.linhas.find((l) => l.canal === 'eco');
  assert.equal(eco.time, null, 'sem time no elenco');
  assert.equal(eco.rotulo, undefined);
  // E os cabeçalhos continuam a ser os grupos da ordem.
  assert.deepEqual(m.linhas.filter((l) => l.tipo === 'time').map((l) => l.time), ['comVideo', 'resto']);
});

// ── linhasDoTempo ───────────────────────────────────────────────────────────

const local = (ms) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes()];
};

test('as meias-noites da vista são as do fuso do aparelho, e as horas cheias não repetem a meia-noite', () => {
  // De sábado 18:00 a segunda 06:00 em São Paulo: duas meias-noites (domingo e segunda).
  const vista = { deMs: T, ateMs: T + 36 * H };
  const { dias, horas, passoHoras } = linhasDoTempo(vista, 1440);
  assert.equal(dias.length, 2);
  for (const ms of dias) assert.deepEqual(local(ms), [0, 0]);
  assert.equal(new Date(dias[0]).toISOString(), '2026-10-11T03:00:00.000Z');
  assert.equal(passoHoras, 1, '36 h em 1440 px: 40 px por hora');
  assert.equal(horas.length, 36 + 1 - 2, 'todas as horas cheias, menos as duas meias-noites');
  for (const ms of horas) {
    const [h, m] = local(ms);
    assert.equal(m, 0);
    assert.notEqual(h, 0);
  }
});

test('em qualquer zoom: as horas ficam, mas espaçadas quando a hora cabe em poucos px', () => {
  const vista = (horas) => ({ deMs: T, ateMs: T + horas * H });
  assert.equal(linhasDoTempo(vista(2), 390).passoHoras, 1);
  // Uma semana em 390 px: 2,3 px por hora; de 3 em 3 horas dá 7 px.
  const semana = linhasDoTempo(vista(7 * 24), 390);
  assert.equal(semana.passoHoras, 3);
  for (const ms of semana.horas) assert.equal(local(ms)[0] % 3, 0);
  assert.equal(semana.dias.length, 7);
  // Um mês em 390 px: de 12 em 12 horas (6,5 px).
  assert.equal(linhasDoTempo(vista(30 * 24), 390).passoHoras, 12);
  // Dois meses: as horas já não cabem nem de 12 em 12; ficam só os dias.
  const meses = linhasDoTempo(vista(60 * 24), 390);
  assert.equal(meses.passoHoras, null);
  assert.deepEqual(meses.horas, []);
  assert.equal(meses.dias.length, 60);
});

test('um zoom de minutos sem hora cheia não tem riscas, e uma vista estragada dá listas vazias', () => {
  assert.deepEqual(linhasDoTempo({ deMs: T + 5 * MIN, ateMs: T + 10 * MIN }, 800), { dias: [], horas: [], passoHoras: 1 });
  for (const v of [null, { deMs: T, ateMs: T }, { deMs: 'a', ateMs: T }]) {
    assert.deepEqual(linhasDoTempo(v, 800), { dias: [], horas: [], passoHoras: null });
  }
  assert.deepEqual(linhasDoTempo({ deMs: T, ateMs: T + H }, 0), { dias: [], horas: [], passoHoras: null });
});

test('num fuso de meia hora (Índia, +5:30) as riscas caem na hora cheia de lá, e não na do UTC', () => {
  const antes = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  try {
    const { dias, horas } = linhasDoTempo({ deMs: T, ateMs: T + 30 * H }, 1440);
    assert.ok(dias.length >= 1);
    for (const ms of [...dias, ...horas]) assert.equal(new Date(ms).getMinutes(), 0);
    assert.equal(new Date(horas[0]).getUTCMinutes(), 30, 'a hora cheia de lá é a meia hora do UTC');
  } finally {
    process.env.TZ = antes;
  }
});

// ── a grelha pintada ────────────────────────────────────────────────────────

function ctxFalso() {
  const chamadas = [];
  const estado = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1, font: '', textBaseline: '', textAlign: '' };
  const pilha = [];
  return new Proxy({}, {
    get(_, nome) {
      if (nome === 'chamadas') return chamadas;
      if (typeof nome === 'symbol' || nome === 'then') return undefined;
      if (Object.hasOwn(estado, nome)) return estado[nome];
      return (...args) => {
        chamadas.push({ nome, args, ...estado });
        if (nome === 'save') pilha.push({ ...estado });
        if (nome === 'restore') Object.assign(estado, pilha.pop());
      };
    },
    set(_, nome, valor) { estado[nome] = valor; return true; },
  });
}

test('a grelha: horas finas quase transparentes, dias grossos, e o instante da ordem na cor do acento', () => {
  const m = montarMapa({ times: [{ nome: 'A', canais: ['alfa'] }], coberturas: COB, abertos: new Set(['A']) });
  const vista = { deMs: T, ateMs: T + 36 * H };
  const grade = { ...linhasDoTempo(vista, 1440), ordemMs: T + 2 * H };
  const ctx = ctxFalso();
  pintarMapa(ctx, m, { topo: 0, largura: 1440, altura: 300, vista, grade });
  const altas = ctx.chamadas.filter((c) => c.nome === 'fillRect' && c.args[1] === 0 && c.args[3] === 300);
  const finas = altas.filter((c) => c.args[2] === 1 && c.globalAlpha < 0.2);
  const grossas = altas.filter((c) => c.args[2] === 2 && c.fillStyle === CORES.texto2);
  const ordem = altas.filter((c) => c.args[2] === 2 && c.fillStyle === CORES.cobertura);
  assert.equal(finas.length, grade.horas.length);
  assert.equal(grossas.length, 2);
  assert.equal(ordem.length, 1);
  assert.ok(Math.abs(ordem[0].args[0] + 1 - (2 / 36) * 1440) <= 1);
  // Sem `grade`, nada disto: o mapa de sempre.
  const sem = ctxFalso();
  pintarMapa(sem, m, { topo: 0, largura: 1440, altura: 300, vista });
  assert.equal(sem.chamadas.filter((c) => c.nome === 'fillRect' && c.args[1] === 0 && c.args[3] === 300 && c.args[2] <= 2).length, 0);
});

// ── o evento salvo no site ──────────────────────────────────────────────────

test('o nome do arquivo: minúsculas, sem acentos, traços no lugar do resto', () => {
  assert.equal(nomeDoArquivo('ABISAL'), 'abisal');
  assert.equal(nomeDoArquivo('  Rust Kick Off 2  '), 'rust-kick-off-2');
  assert.equal(nomeDoArquivo('Copa São João!'), 'copa-sao-joao');
  assert.equal(nomeDoArquivo('../../etc/passwd'), 'etc-passwd');
  assert.equal(nomeDoArquivo('!!!'), '');
  assert.equal(nomeDoArquivo(null), '');
  assert.ok(nomeDoArquivo('x'.repeat(200)).length <= 60);
});

test('o arquivo do evento leva o nome, a data, a duração, a descrição, os times e os canais, e mais nada', () => {
  const elenco = lerElenco('Time Alfa: https://kick.com/Tchubi, outro\nsolto1');
  const j = paraArquivo(elenco, { nome: ' Noite ', data: '2026-10-11', duracao: '3 dias', descricao: '' });
  assert.deepEqual(j, {
    nome: 'Noite', data: '2026-10-11', duracao: '3 dias', descricao: null,
    times: [{ nome: 'Time Alfa', canais: ['tchubi', 'outro'] }], canais: ['solto1'],
  });
  assert.equal(paraArquivo(elenco, { nome: 'x', data: '11/10/2026' }).data, null, 'só datas AAAA-MM-DD');
  const volta = deArquivo(JSON.parse(JSON.stringify(j)));
  assert.equal(volta.nome, 'Noite');
  assert.deepEqual(volta.times, j.times);
  assert.deepEqual(volta.soltos, ['solto1']);
  assert.deepEqual(volta.info, { data: '2026-10-11', duracao: '3 dias', descricao: null });
});

test('um arquivo estragado, sem nome ou sem canais não é um evento; canais inválidos ficam de fora', () => {
  for (const j of [null, [], 'abisal', { canais: ['a'] }, { nome: '  ', canais: ['a'] }, { nome: 'X', canais: [] }, { nome: 'X', canais: ['a b c!'] }]) {
    assert.equal(deArquivo(j), null, JSON.stringify(j));
  }
  const e = deArquivo({ nome: 'X', canais: ['bom', 'mau nome!', 7, 'BOM'], times: [{ nome: 'T', canais: ['t1'] }, { canais: ['sem-nome'] }] });
  assert.deepEqual(e.soltos, ['bom']);
  assert.deepEqual(e.times, [{ nome: 'T', canais: ['t1'] }]);
});

test('o ABISAL salvo no site tem os 144 canais e só os canais', () => {
  const j = JSON.parse(fs.readFileSync(new URL('../site/eventos/abisal.json', import.meta.url), 'utf8'));
  // O arquivo é público: nem notas, nem seguidores, nem nomes de Discord, nem campos a mais.
  assert.deepEqual(Object.keys(j).sort(), ['canais', 'data', 'descricao', 'duracao', 'nome', 'times']);
  assert.equal(j.nome, 'ABISAL');
  assert.deepEqual(j.times, []);
  assert.equal(j.canais.length, 144);
  assert.equal(new Set(j.canais).size, 144);
  for (const c of j.canais) assert.match(c, /^[a-z0-9_.-]{1,60}$/);
  const e = deArquivo(j);
  assert.equal(e.soltos.length, 144);
  assert.equal(nomeDoArquivo(e.nome), 'abisal', 'e abre por ?e=abisal');
});

// ── juntar gente a um evento aberto ─────────────────────────────────────────

test('juntar: só os novos entram, quem já está fica onde estava, e o time com o mesmo nome recebe os seus', () => {
  const base = { times: [{ nome: 'Lobos', canais: ['a', 'b'] }], soltos: ['s'] };
  const extra = lerElenco('lobos: c, a\nUrsos: d, s\ne\nb');
  const { elenco, novos } = juntarElencos(base, extra);
  assert.deepEqual(novos, ['c', 'd', 'e']);
  assert.deepEqual(elenco.times, [{ nome: 'Lobos', canais: ['a', 'b', 'c'] }, { nome: 'Ursos', canais: ['d'] }]);
  assert.deepEqual(elenco.soltos, ['s', 'e'], 'o "s" não mudou de time');
  assert.deepEqual(base, { times: [{ nome: 'Lobos', canais: ['a', 'b'] }], soltos: ['s'] }, 'a base não muda');
});

test('juntar nada de novo dá a mesma lista e nenhum novo', () => {
  const base = { times: [{ nome: 'Lobos', canais: ['a'] }], soltos: [] };
  const { elenco, novos } = juntarElencos(base, { times: [], soltos: ['A', 'a'] });
  assert.deepEqual(novos, []);
  assert.deepEqual(elenco.times, base.times);
});
