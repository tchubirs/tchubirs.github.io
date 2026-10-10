// Casar os nomes lidos na tela com os canais, e os apelidos do Discord que vêm na planilha.
//
// As leituras abaixo são as que o leitor devolveu de verdade em quadros de VODs de Rust na Kick
// (10/10, 1080p): "DAMONIAK" saiu "UAMUNIAK", "BAMONIAK" e "DAMUNIAK" em quadros diferentes, e a
// bolinha antes do nome saiu "®", "~", "v" ou "*".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  base, esqueleto, semelhanca, candidatosDaLinha, casar, juntarApelidos, lerApelidos, guardarApelidos,
  semApelido, limparApelido, GUARDADO_APELIDOS,
} from '../site/nomes.js';
import { apelidosDoTexto, lerElenco, paraArquivo } from '../site/elenco.js';
import { ehLetra, limiarizar, escalaPara, degrauPara, instantesEmVolta, REGIOES } from '../site/ler-tela.js';
import { megasDoTrecho } from '../site/nomes-ui.js';

test('o esqueleto ignora maiúsculas, acentos, símbolos e as trocas do leitor', () => {
  assert.equal(base('Zé_Mia!'), 'zemia');
  assert.equal(esqueleto('S3KOX'), esqueleto('s3kox'));
  assert.equal(esqueleto('P0me'), esqueleto('pome'));
  assert.equal(esqueleto('Iron'), esqueleto('1ron'));
  assert.equal(esqueleto('rnaria'), esqueleto('maria'));
  assert.equal(semelhanca('HOOLIGAN', 'hooligan'), 1);
  assert.equal(semelhanca('xX_Newt_Xx', 'xxnewtxx'), 1);
});

test('nomes parecidos casam, nomes diferentes não', () => {
  assert.ok(semelhanca('UAMUNIAK', 'damoniak') >= 0.75);
  assert.ok(semelhanca('ELCHAPO', 'elchapotv') >= 0.75, 'o canal com um sufixo');
  assert.ok(semelhanca('brent', 'brentx') >= 0.75);
  assert.ok(semelhanca('Newt', 'newtrc') >= 0.75, 'o nome dentro do canal');
  // Um pedaço de quatro letras dentro de um nome comprido não chega.
  assert.ok(semelhanca('Noch', 'lynoche') < 0.75);
  assert.ok(semelhanca('Davo', 'davonaar') < 0.75);
  assert.ok(semelhanca('tosha', 'rolande') < 0.5);
  // Curto demais para comparar: só conta se for igual.
  assert.equal(semelhanca('ab', 'abc'), 0);
});

test('a linha lida perde a bolinha, o visto e o x, e as colunas viram nomes separados', () => {
  assert.deepEqual(candidatosDaLinha('v HOOLIGAN'), ['HOOLIGAN']);
  assert.deepEqual(candidatosDaLinha('® tosha'), ['tosha']);
  assert.deepEqual(candidatosDaLinha('~ HOOLIGAN'), ['HOOLIGAN']);
  assert.deepEqual(candidatosDaLinha('* rolande'), ['rolande']);
  assert.deepEqual(candidatosDaLinha('© Furfeyuxo_       x'), ['Furfeyuxo_']);
  assert.deepEqual(candidatosDaLinha('® DESTROY U\'RE'), ["DESTROY U'RE", 'DESTROY', "U'RE"]);
  assert.deepEqual(candidatosDaLinha('x'), []);
  assert.deepEqual(candidatosDaLinha('64 FPS'), []);
  assert.deepEqual(candidatosDaLinha('INVENTORY'), []);
});

// As leituras de 9 quadros reais de um mesmo streamer (ispdep, 09/10), mais um ruído de interface.
const QUADROS = [
  ['v HOOLIGAN', 'x', '® tosha', '* rolande'],
  ['x', 'v HOOLIGAN', '® tosha', '# rolande'],
  ['v HOOLIGAN', '® 233', '® tosha', '% rolande'],
  ['~ HOOLIGAN', '® brent', '® tosha', '= rolande'],
  ['v HOOLIGAN', '® brent', '® tosha', '® rolande'],
  ['~ HOOLIGAN', '® brent', '@ tosha', 'rolande'],
  ['~ HOOLIGAN', '® brent', '® 233', '® tosha', '* rolande'],
  ['v HOOLIGAN', '® brent', '® 233', '® tosha', '= rolande', 'that you can craft with your current'],
  ['v HOOLIGAN', '® brent', '®233', '® tosha', '* rolande'],
];
const lidosReais = QUADROS.flatMap((linhas, i) => linhas.map((texto) => ({ texto, ms: i * 5000, regiao: 'time' })));

test('casar: pelo apelido, pelo nome do canal, e o resto fica como nome sem canal', () => {
  const canais = ['ispdep', 'volcano', 'brentx', 's3kox', 'poionako', 'lynoche', 'davonaar', 'mills_rp'];
  const r = casar({ lidos: lidosReais, canais, apelidos: new Map([['volcano', ['HOOLIGAN']]]), excluir: ['ispdep'] });
  assert.deepEqual(r.propostas.map((p) => [p.canal, p.por, p.lido, p.vezes, p.nivel]), [
    ['volcano', 'apelido', 'HOOLIGAN', 9, 'alta'],
    ['brentx', 'canal', 'brent', 6, 'media'],
  ]);
  assert.deepEqual(r.soltos.map((s) => [s.nome, s.vezes]), [['rolande', 9], ['tosha', 9], ['233', 4]]);
});

test('casar junta as leituras tortas do mesmo nome e conta os quadros de todas', () => {
  const lidos = [
    { texto: '® UAMUNIAK', ms: 1, regiao: 'time' }, { texto: '@ BAMONIAK', ms: 2, regiao: 'time' },
    { texto: '® DAMUNIAK', ms: 3, regiao: 'time' }, { texto: '& DAMONIAK', ms: 4, regiao: 'time' },
    { texto: '® DAMUNIAK', ms: 5, regiao: 'time' },
  ];
  const r = casar({ lidos, canais: ['damoniak_tv', 'outro'] });
  assert.equal(r.propostas.length, 1);
  assert.equal(r.propostas[0].canal, 'damoniak_tv');
  assert.equal(r.propostas[0].vezes, 5);
  assert.deepEqual(r.soltos, []);
});

test('casar não propõe quem já está no lance, e um nome lido uma vez fora da lista do time não aparece solto', () => {
  const lidos = [
    { texto: 'tchubi', ms: 1, regiao: 'esquerda' }, { texto: 'QUICK CRAFT', ms: 1, regiao: 'direita' },
    { texto: 'Upkeep', ms: 2, regiao: 'direita' }, { texto: 'GatoMia', ms: 2, regiao: 'direita' },
  ];
  const r = casar({ lidos, canais: ['tchubi', 'gatomia'], excluir: ['tchubi'] });
  assert.deepEqual(r.propostas.map((p) => p.canal), ['gatomia']);
  assert.deepEqual(r.soltos, []);
});

test('apelidos da planilha do dono: [Discord: X], (Discord: X) e a célula Discord: X', () => {
  const texto = [
    'kick_url,seguidores,origem',
    'https://kick.com/newtrc,,seguido por voce [Discord: Newt]',
    'https://kick.com/Pato_Bravo,,seguido por voce + nome parecido [Discord: Patinho]',
    'https://kick.com/gatomia,1200,"lista do Discord, canal #geral [Discord: Mia, a Gata]"',
    'Fulano\tDiscord: Lontra#1234\tkick.com/lontrafeliz',
    'kick.com/zebra99 (Discord: Zé <b>Zebra</b>)',
    // Dois canais na mesma linha: de quem seria o apelido? De ninguém.
    'kick.com/a1 kick.com/b2 [Discord: Dois]',
    // Sem Discord, sem apelido.
    'https://kick.com/semnada,,nota qualquer',
  ].join('\n');
  assert.deepEqual([...apelidosDoTexto(texto)], [
    ['newtrc', ['Newt']], ['pato_bravo', ['Patinho']], ['gatomia', ['Mia, a Gata']],
    ['lontrafeliz', ['Lontra']], ['zebra99', ['Zé bZebra/b']],
  ]);
  // O elenco continua sem os apelidos: o arquivo público do evento não os leva.
  const elenco = lerElenco(texto);
  assert.ok(!JSON.stringify(paraArquivo(elenco, { nome: 'x' })).includes('Newt'));
});

test('o evento salvo no repositório não tem apelidos', () => {
  const abisal = fs.readFileSync(new URL('../site/eventos/abisal.json', import.meta.url), 'utf8');
  assert.doesNotMatch(abisal, /discord/i);
});

test('apelidos guardados só no aparelho: juntar sem repetir, ler, tirar', () => {
  const guarda = new Map();
  const loja = { getItem: (k) => guarda.get(k) ?? null, setItem: (k, v) => guarda.set(k, String(v)) };
  assert.deepEqual([...lerApelidos(loja)], []);
  let m = juntarApelidos(new Map(), new Map([['newtrc', ['Newt', 'newt', ' Newt ']], ['gatomia', ['Mia#0001']]]));
  assert.deepEqual([...m], [['newtrc', ['Newt']], ['gatomia', ['Mia']]]);
  assert.equal(guardarApelidos(m, loja), true);
  assert.ok(guarda.get(GUARDADO_APELIDOS).includes('Newt'));
  m = juntarApelidos(lerApelidos(loja), new Map([['newtrc', ['Newton']]]));
  assert.deepEqual(m.get('newtrc'), ['Newt', 'Newton']);
  m = semApelido(m, 'gatomia', 'Mia');
  assert.equal(m.has('gatomia'), false);
  assert.equal(limparApelido('<script>x</script>'), 'scriptx/script');
  // Um localStorage que atira (dados do site bloqueados) não parte nada.
  const quebrada = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual([...lerApelidos(quebrada)], []);
  assert.equal(guardarApelidos(m, quebrada), false);
});

test('o filtro verde pega o verde e o vermelho da lista do Rust, e o claro pega o branco do Discord', () => {
  // As cores medidas nos quadros reais.
  for (const [r, g, b] of [[165, 214, 61], [106, 153, 19], [197, 245, 88], [143, 195, 47]]) assert.equal(ehLetra('verde', r, g, b), true, `${r},${g},${b}`);
  assert.equal(ehLetra('verde', 166, 52, 5), true, 'o vermelho de quem morreu');
  // Grama, céu, pele e o branco não são o verde da lista.
  for (const [r, g, b] of [[120, 110, 50], [90, 140, 200], [200, 160, 130], [240, 240, 240], [60, 90, 40]]) assert.equal(ehLetra('verde', r, g, b), false, `${r},${g},${b}`);
  assert.equal(ehLetra('claro', 240, 240, 240), true);
  assert.equal(ehLetra('claro', 120, 120, 120), false);
  const px = new Uint8ClampedArray([165, 214, 61, 255, 30, 30, 30, 255]);
  assert.equal(limiarizar(px, 'verde'), 1);
  assert.deepEqual([...px], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('escala, degrau, instantes e o gasto do trecho', () => {
  assert.equal(escalaPara(1080), 2);
  assert.equal(escalaPara(720), 3);
  assert.equal(escalaPara(360), 4);
  const escada = [{ altura: 1080, url: 'a' }, { altura: 720, url: 'b' }, { altura: 160, url: 'c' }];
  assert.equal(degrauPara(escada, 1080).url, 'a');
  assert.equal(degrauPara(escada, 720).url, 'b');
  assert.deepEqual(instantesEmVolta(100_000, { antesMs: 10_000, depoisMs: 10_000, passoMs: 5_000 }), [90_000, 95_000, 100_000, 105_000, 110_000]);
  assert.equal(megasDoTrecho(60, 1080), 80);
  assert.equal(megasDoTrecho(60, 720), 31);
  assert.ok(REGIOES.some((r) => r.id === 'time' && r.x === 0 && r.y + r.a === 1 && r.filtro === 'verde'));
});
