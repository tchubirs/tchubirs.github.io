import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { editarLinha, apagarLinha, deslocarLinha, textoDaLinha } from '../site/legenda.js';
import { guardarFala, lerFalas, linhasDaTranscricao, falouIsto, melhorFala } from '../site/falas.js';

// Os handlers reais do editor, isolados do vídeo e dos downloads da página.
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const inicio = app.indexOf("const lista = $('legendaFalas');", app.indexOf('function ligarLegendaClipe()'));
const fim = app.indexOf('\n}\nligarLegendaClipe();', inicio);
assert.ok(inicio >= 0 && fim > inicio, 'os handlers da lista de legendas foram encontrados');
const handlers = app.slice(inicio, fim);

function editor() {
  const dados = new Map();
  const armazem = { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v) };
  const transcricao = {
    canal: 'tchubi', deMs: 100_000, ateMs: 110_000,
    linhas: [{ palavras: [{ t: 'granada', de: 101_000, ate: 102_000 }] }],
  };
  // O clipe foi estreitado após a transcrição: a gravação deve substituir o trecho original.
  const c = { canal: 'tchubi', deMs: 103_000, ateMs: 108_000, transcricao, aGravar: false };
  guardarFala(armazem, { ...transcricao, linhas: linhasDaTranscricao(transcricao) });
  const eventos = new Map();
  const lista = { addEventListener: (tipo, f) => eventos.set(tipo, f) };
  const ligado = { focus() {} };
  runInNewContext(handlers, {
    estado: { clipe: c }, localStorage: armazem,
    $: (id) => id === 'legendaFalas' ? lista : ligado,
    editarLinha, apagarLinha, deslocarLinha, textoDaLinha, guardarFala, linhasDaTranscricao,
    pintarFalas() {}, levarAgulha() {}, PASSO_MS: 100,
  });
  return {
    c,
    salvas: () => lerFalas(armazem),
    texto(valor) {
      const campo = { value: valor, closest: () => ({ dataset: { k: '0' } }) };
      eventos.get('change')({ target: { closest: () => campo } });
    },
    acao(nome) {
      const b = { dataset: { acao: nome }, closest: () => ({ dataset: { k: '0' } }) };
      eventos.get('click')({ target: { closest: () => b } });
    },
  };
}

test('editar a legenda atualiza a frase e o filtro substituindo o trecho original', () => {
  const e = editor();
  e.texto('explosão');
  const salvas = e.salvas();
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].deMs, 100_000);
  assert.equal(salvas[0].ateMs, 110_000);
  assert.equal(melhorFala(salvas[0].linhas, 101_000), 'explosão');
  assert.equal(falouIsto(salvas[0].linhas, 'explosao'), true);
  assert.equal(falouIsto(salvas[0].linhas, 'granada'), false);
});

test('deslocar a legenda salva o tempo novo da fala', () => {
  const e = editor();
  e.acao('depois');
  assert.deepEqual(e.salvas()[0].linhas, [{ t: 'granada', de: 101_100, ate: 102_100 }]);
  e.acao('antes');
  assert.deepEqual(e.salvas()[0].linhas, [{ t: 'granada', de: 101_000, ate: 102_000 }]);
});

test('apagar a última fala limpa a frase e o filtro do trecho salvo', () => {
  const e = editor();
  e.acao('apagar');
  assert.equal(e.salvas().length, 1);
  assert.deepEqual(e.salvas()[0].linhas, []);
  assert.equal(melhorFala(e.salvas()[0].linhas, 101_000), '');
  assert.equal(falouIsto(e.salvas()[0].linhas, 'granada'), false);
});

test('esvaziar o campo de texto também remove a última fala salva', () => {
  const e = editor();
  e.texto('');
  assert.equal(e.c.transcricao.linhas.length, 0);
  assert.deepEqual(e.salvas()[0].linhas, []);
});
