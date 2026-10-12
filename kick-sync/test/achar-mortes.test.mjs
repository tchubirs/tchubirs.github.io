// Achar as mortes no próprio vídeo (o dono, 12/10: "Sem essa de bloco de notas, você tem que fazer
// tudo"), com quadros verdadeiros do ABISAL de 05/10 em test/telas-morte/:
//  - telas-160x90-topo.png: as 12 linhas de cima de 93 quadros de 160x90 (o que a página olha): 24 telas
//    de morte vistas a olho em 4 h de VODs (22 mortes de crreg, ispdep, poionako, skylane7 e xguiry; duas
//    vistas no 160p e no 720p) e 69 que não são (jogo, inventário, ecrã de carregar, "ABATIDO", mapa,
//    luzes vermelhas, quadros ao acaso);
//  - nitida-*.png: a faixa de cima de 13 quadros nítidos (1080p e 720p) de 11 mortes, com o nome que se
//    lê a olho na caixa vermelha.
// O leitor de texto corre no navegador (achar-mortes-pagina.test.mjs); aqui fica a conta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerPng, quadroComRecorte } from './png.mjs';
import {
  medirTela, pareceTelaDeMorte, juntarTelas, caixaDoMatador, zonaDoNome, nomeAPretoEBranco, limparNomeLido, escolherNome,
  morteDoVideo, juntarDoVideo, confirmarPeloTiro, janelasDosTiros, msDoPts, ATRASO_DA_TELA_MS,
} from '../site/achar-mortes.js';
import { imagensDoTs, codecDoSps, tiposNal } from '../site/video-ts.js';
import { horasDasMortes, casarMortes, marcasDasMortes, nomesSemCanal, mortesParaGuardar, mortesGuardadas } from '../site/mortes.js';

const D = new URL('./telas-morte/', import.meta.url).pathname;
const tira = lerPng(`${D}telas-160x90-topo.png`);
const { casos } = JSON.parse(fs.readFileSync(`${D}telas.json`, 'utf8'));
const nitidas = JSON.parse(fs.readFileSync(`${D}nitidas.json`, 'utf8')).casos;

/** O quadro de 160x90 do caso k: as 12 linhas de cima verdadeiras e o resto a preto (a conta não o lê). */
function quadro(k) {
  const px = new Uint8ClampedArray(160 * 90 * 4);
  px.set(tira.pixeis.subarray(k * 160 * 12 * 4, (k + 1) * 160 * 12 * 4));
  return px;
}

test('as 24 telas de morte verdadeiras são achadas, e nenhum dos 69 quadros que não são morte', () => {
  assert.equal(tira.largura, 160);
  assert.equal(tira.altura, casos.length * 12);
  const mortes = casos.filter((c) => c.morte).length;
  assert.equal(mortes, 24);
  const errados = [];
  casos.forEach((c, k) => { if (pareceTelaDeMorte(quadro(k), 160, 90) !== c.morte) errados.push(`${c.fonte} ${c.segundo}s (${c.o_que})`); });
  assert.deepEqual(errados, []);
  // As de cinco streamers, em espanhol e em inglês (o ispdep).
  const fontes = new Set(casos.filter((c) => c.morte).map((c) => c.fonte.split('-')[0]));
  assert.deepEqual([...fontes].sort(), ['crreg', 'ispdep', 'poionako', 'skylane7', 'xguiry']);
});

test('as três medidas separam com folga: a faixa lisa, a caixa vermelha e a verde, juntas', () => {
  const de = (morte) => casos.map((c, k) => (c.morte === morte ? medirTela(quadro(k), 160, 90) : null)).filter(Boolean);
  const sim = de(true);
  const nao = de(false);
  assert.ok(Math.min(...sim.map((m) => m.plano)) >= 0.35, 'a faixa de cima é lisa mesmo com a webcam do skylane7 por cima');
  assert.ok(Math.min(...sim.map((m) => m.vermelho)) >= 0.06);
  assert.ok(Math.min(...sim.map((m) => m.verde)) >= 0.009);
  // O que engana sozinho: o inventário tem a faixa lisa e o verde; as luzes da base, o vermelho.
  assert.ok(nao.some((m) => m.plano > 0.4 && m.verde > 0.02), 'o inventário');
  assert.ok(nao.some((m) => m.plano > 0.3 && m.vermelho > 0.05), 'uma luz vermelha');
  assert.ok(nao.every((m) => !(m.vermelho >= 0.025 && m.verde >= 0.005 && m.plano >= 0.3)));
});

test('a caixa de quem matou é achada nos 13 quadros nítidos, sem o ícone e sem a caixa da arma', () => {
  for (const c of nitidas) {
    const r = lerPng(D + c.arquivo);
    const px = quadroComRecorte(r, c);
    const caixa = caixaDoMatador(px, c.largura, c.altura);
    assert.ok(caixa, c.arquivo);
    const h = caixa.y1 - caixa.y0;
    // A caixa tem a altura medida a olho: 45 px no 1080p do crreg e do ispdep, 30 no do xguiry, 21 no 720p.
    assert.ok(h >= 19 && h <= 46, `${c.arquivo}: ${h}`);
    // E é mais larga do que alta, mas não chega à caixa da arma (o xguiry tem as duas coladas).
    const l = caixa.x1 - caixa.x0;
    assert.ok(l > 3.5 * h && l < 7.2 * h, `${c.arquivo}: ${l} x ${h}`);
    // O nome fica à direita do ícone, dentro da caixa, e tem letras claras.
    const z = zonaDoNome(caixa);
    assert.ok(z.x > caixa.x0 + h * 0.9 && z.x + z.l <= caixa.x1);
    const dados = new Uint8ClampedArray(z.l * z.a * 4);
    for (let y = 0; y < z.a; y++) dados.set(px.subarray(((z.y + y) * c.largura + z.x) * 4, ((z.y + y) * c.largura + z.x + z.l) * 4), y * z.l * 4);
    assert.ok(nomeAPretoEBranco(dados) > 10, c.arquivo);
  }
});

test('sem caixa vermelha não há caixa: o quadro cinzento e um quadro de jogo', () => {
  const cinza = quadroComRecorte({ largura: 1, altura: 1, pixeis: new Uint8ClampedArray([32, 32, 32, 255]) }, { largura: 1280, altura: 720, x: 0, y: 0 });
  assert.equal(caixaDoMatador(cinza, 1280, 720), null);
  assert.equal(caixaDoMatador(new Uint8ClampedArray(0), 0, 0), null);
});

test('as telas juntam-se em mortes: o tapa e destapa do crreg é uma só, renascer e morrer de novo são duas', () => {
  // O xguiry de 05/10 (VOD 131495449, aos 3895 s): telas aos 169-170 s e aos 189 s, com o ecrã de
  // carregar e 10 s de jogo no meio. São duas mortes.
  const s = (x) => ({ ms: x * 1000 });
  assert.equal(juntarTelas([s(169), s(170), s(189)]).length, 2);
  // O crreg tapa a tela com a imagem dele 1 a 3 s e volta a mostrá-la: a mesma morte.
  const crreg = juntarTelas([s(289), s(290), s(291), s(294)]);
  assert.equal(crreg.length, 1);
  assert.deepEqual([crreg[0].deMs, crreg[0].ateMs, crreg[0].quadros], [289_000, 294_000, 4]);
  assert.deepEqual(juntarTelas([]), []);
  // A morte fica um pouco antes da tela: a tela entra depois de o ecrã escurecer.
  assert.equal(ATRASO_DA_TELA_MS, 2000);
});

test('o vídeo sai do TS da Kick como o ffmpeg o vê: 375 imagens, 3 chaves, avc1.4D400C', () => {
  // O segmento de 160p verdadeiro de probes/fixtures; os números são os do PyAV (ffmpeg) no mesmo ficheiro.
  const r = imagensDoTs(fs.readFileSync(new URL('../probes/fixtures/segmento-kodd.ts', import.meta.url)));
  assert.equal(r.codec, 'avc1.4D400C');
  assert.equal(r.imagens.length, 375);
  assert.equal(r.imagens.filter((x) => x.chave).length, 3);
  assert.equal(r.imagens[0].chave, true);
  assert.equal(r.imagens[0].pts, 338609790);
  // Cada imagem começa por uma unidade NAL (Annex B), e a primeira traz o SPS.
  assert.ok(tiposNal(r.imagens[0].dados).some((n) => n.tipo === 7));
  assert.equal(codecDoSps(Uint8Array.from([0x67, 0x64, 0x00, 0x2a]), 0), 'avc1.64002A');
  // Sem vídeo, nada.
  assert.equal(imagensDoTs(new Uint8Array(4096).fill(7)), null);
});

test('a hora de cada imagem: o início do segmento mais o PTS que passou, mesmo quando o PTS dá a volta', () => {
  assert.equal(msDoPts(90_000 * 3, 0, 1000), 4000);
  assert.equal(msDoPts(45_000, 2 ** 33 - 45_000, 0), 1000);
});

test('o nome lido: limpo, e o que mais se repete entre os quadros da mesma tela', () => {
  assert.equal(limparNomeLido(' — leona. \n'), 'leona');
  assert.equal(limparNomeLido('|'), '');
  assert.equal(limparNomeLido('Torreta automatica :'), 'Torreta automatica');
  assert.equal(escolherNome(['cyrus', 'tyrus', 'cyrus', '']), 'cyrus');
  assert.equal(escolherNome(['', '|']), '');
});

test('uma morte do vídeo é do mesmo feitio das do servidor: marcas, nomes e guardar', () => {
  const T = Date.parse('2026-10-05T23:41:20.000Z');
  const canais = ['xguiry', 'crreg', 'poionako'];
  const lista = [
    { ...morteDoVideo({ canal: 'xguiry', ms: T, matador: 'leona' }), id: 0 },
    { ...morteDoVideo({ canal: 'crreg', ms: T + 60_000, matador: 'yer' }), id: 1 },
    { ...morteDoVideo({ canal: 'poionako', ms: T + 120_000, matador: '' }), id: 2 },
  ];
  // Nem o fuso nem o alinhamento das do servidor mexem nelas.
  const comHoras = horasDasMortes(lista, { fusoMin: -180, refMs: T - 3600e3, ajusteMs: 4000 });
  assert.deepEqual(comHoras.map((m) => m.ms), [T, T + 60_000, T + 120_000]);
  // "leona" é o nome inventado do modo streamer: casa só quando é apelido de um canal deste aparelho.
  // "yer" é o próprio crreg (o F1 kill): não é uma kill.
  const apelidos = new Map([['poionako', ['leona']], ['crreg', ['yer']]]);
  const casadas = casarMortes(comHoras, canais, apelidos);
  assert.deepEqual(casadas.map((m) => [m.canalMatador, m.canalVitima]), [['poionako', 'xguiry'], [null, 'crreg'], [null, 'poionako']]);
  const marcas = marcasDasMortes(casadas.map((m) => (m.id === 0 ? { ...m, msMatador: T - 3000 } : m)));
  assert.deepEqual(marcas.get('poionako').map((m) => [m.ms, m.papel]), [[T - 3000, 'matou'], [T + 120_000, 'morreu']]);
  assert.deepEqual(marcas.get('xguiry').map((m) => m.papel), ['morreu']);
  assert.deepEqual(marcas.get('crreg').map((m) => m.papel), ['morreu']);
  // Sem nome de quem matou não há nome sem canal para escolher.
  assert.deepEqual(nomesSemCanal(casarMortes(comHoras, canais)).map((x) => x.nome), ['leona', 'yer']);
  // Guardar e ler de volta: a origem vai junto.
  const volta = mortesGuardadas(JSON.parse(JSON.stringify(mortesParaGuardar(lista))));
  assert.deepEqual(volta.map((m) => [m.origem, m.vitima, m.matador, m.hora.absMs]), lista.map((m) => ['video', m.vitima, m.matador, m.hora.absMs]));
});

test('a mesma morte achada duas vezes fica uma, e ganha o nome que faltava', () => {
  const T = Date.parse('2026-10-05T23:41:20.000Z');
  const a = juntarDoVideo([], [morteDoVideo({ canal: 'xguiry', ms: T })]);
  assert.equal(a.novas, 1);
  const b = juntarDoVideo(a.mortes, [morteDoVideo({ canal: 'xguiry', ms: T + 1500, matador: 'cyrus' }), morteDoVideo({ canal: 'xguiry', ms: T + 60_000 })]);
  assert.equal(b.novas, 1);
  assert.deepEqual(b.mortes.map((m) => [m.id, m.matador]), [[0, 'cyrus'], [1, '']]);
});

test('o tiro de quem matou confirma a morte e dá o segundo do lado dele', () => {
  const ms = 1_000_000;
  assert.deepEqual(confirmarPeloTiro(ms, [{ ms: ms - 4000, combateDeMs: ms - 9000, combateAteMs: ms - 1000 }]), { confirmado: true, msMatador: ms - 4000 });
  // Um tiroteio de um minuto antes não é este.
  assert.deepEqual(confirmarPeloTiro(ms, [{ ms: ms - 60_000, combateDeMs: ms - 65_000, combateAteMs: ms - 50_000 }]), { confirmado: false });
  // O combate ainda a correr quando a tela entra: o lado dele fica no instante da morte.
  assert.equal(confirmarPeloTiro(ms, [{ ms: ms + 20_000, combateDeMs: ms - 5000, combateAteMs: ms + 30_000 }]).msMatador, ms + 3000);
  assert.deepEqual(confirmarPeloTiro(ms, []), { confirmado: false });
});

test('perto dos tiros: de 5 s antes do combate a 45 s depois, com os vizinhos juntos', () => {
  assert.deepEqual(janelasDosTiros([
    { ms: 100_000, combateDeMs: 95_000, combateAteMs: 110_000 },
    { ms: 130_000 },
    { ms: 400_000 },
  ]), [[90_000, 175_000], [395_000, 445_000]]);
});
