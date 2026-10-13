// Ouvir um ângulo só e trocar com um toque (IDEIAS.md, item 8), num browser a sério.
//
// Com quatro POVs a falar ao mesmo tempo não se entende nada. Clicar num vídeo dá-lhe o som e cala os
// outros sem mexer na tela; o 1 a 9 passam o som para o ângulo com esse número; o que tem som leva o
// altifalante e o fio na cor da marca. E o clipe de vários ângulos grava o som de quem está na tela.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };
const FOTOS = new URL('../../.arena/prints/fotos/', import.meta.url).pathname;

async function carregar(p, canais) {
  await kickFalsa(p, { canais });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('#palcoFoco .tile', { timeout: 20000 });
}

// Pela propriedade e não pelo atributo: o atributo `muted` fica no HTML depois de o som ligar.
const comSom = (p) => p.evaluate(() => [...document.querySelectorAll('#palcoFoco .tile')]
  .filter((t) => !t.querySelector('video').muted).map((t) => t.dataset.slug));
const noVisor = (p) => p.evaluate(() => [...document.querySelectorAll('#palcoFoco .tile')].map((t) => t.dataset.slug));
const marcados = (p) => p.evaluate(() => [...document.querySelectorAll('.tile.ouvindo')].map((t) => t.dataset.slug));
const numeros = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.tile')]
  .map((t) => [t.dataset.slug, t.querySelector('.numAngulo').textContent])));

test('clicar num vídeo dá-lhe o som e cala o outro, sem trocar ninguém de lugar', { ...semNavegador, timeout: 60_000 }, async () => {
  const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
  await carregar(p, ['tchubi', 'outro']);
  await p.locator('#grade .tile').first().locator('.par').click();
  await p.waitForFunction(() => document.querySelectorAll('#palcoFoco .tile').length === 2, null, { timeout: 10000 });
  const lugares = await noVisor(p);
  assert.equal((await comSom(p)).length, 1, 'por omissão só um fala');
  assert.deepEqual(await marcados(p), await comSom(p), 'a marca está em quem fala');

  const segundo = lugares[1];
  await p.locator(`#palcoFoco .tile[data-slug="${segundo}"] video`).click();
  await p.waitForTimeout(150);
  assert.deepEqual(await comSom(p), [segundo], 'o clicado fala, e só ele');
  assert.deepEqual(await noVisor(p), lugares, 'ninguém mudou de lugar');
  assert.deepEqual(await marcados(p), [segundo]);
  assert.equal(await p.locator(`#palcoFoco .tile[data-slug="${segundo}"] .numAngulo use`).getAttribute('href'), '#i-som',
    'o altifalante aparece ao lado do número de quem fala');
  assert.equal(await p.locator(`#palcoFoco .tile[data-slug="${lugares[0]}"] .numAngulo use`).count(), 0);
  // O leitor de ecrã também sabe.
  assert.equal(await p.locator(`#palcoFoco .tile[data-slug="${segundo}"] .comSomLeitor`).isHidden(), false);

  // Os números são os da ordem da grelha (a da caixa de canais): tchubi 1, outro 2.
  assert.deepEqual(await numeros(p), { tchubi: '1', outro: '2' });
  for (const [tecla, slug] of [['1', 'tchubi'], ['2', 'outro'], ['1', 'tchubi']]) {
    await p.keyboard.press(tecla);
    await p.waitForTimeout(120);
    assert.deepEqual(await comSom(p), [slug], `o ${tecla} passa o som para ${slug}`);
    assert.deepEqual(await noVisor(p), lugares, `o ${tecla} não mexe na tela`);
  }
  await p.screenshot({ path: `${FOTOS}som-par.png` });

  // O altifalante de cada quadrado continua a ser a mistura à mão: ligar o calado põe os dois a falar.
  const calado = lugares.find((s) => s !== 'tchubi');
  await p.locator(`#palcoFoco .tile[data-slug="${calado}"] .somBtn`).click();
  await p.waitForTimeout(150);
  assert.equal((await comSom(p)).length, 2, 'com o altifalante, os dois podem falar');
  assert.deepEqual(erros, []);
  await p.close();
});

test('a tecla de um ângulo da grelha abre-o no visor já com o som; com um ângulo só não há números',
  { ...semNavegador, timeout: 60_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await carregar(p, ['tchubi', 'outro', 'vitima1']);
    assert.deepEqual(await numeros(p), { tchubi: '1', outro: '2', vitima1: '3' });
    await p.keyboard.press('3');
    await p.waitForFunction(() => document.querySelector('#palcoFoco .tile')?.dataset.slug === 'vitima1', null, { timeout: 10000 });
    assert.deepEqual(await comSom(p), ['vitima1']);
    // Um número sem ângulo não faz nada.
    await p.keyboard.press('7');
    await p.waitForTimeout(120);
    assert.deepEqual(await noVisor(p), ['vitima1']);
    // Um clique na grelha também abre com o som.
    await p.locator('#grade .tile[data-slug="outro"]').click();
    await p.waitForFunction(() => document.querySelector('#palcoFoco .tile')?.dataset.slug === 'outro', null, { timeout: 10000 });
    assert.deepEqual(await comSom(p), ['outro']);
    await p.screenshot({ path: `${FOTOS}som-grelha.png` });

    // A tecla é do sistema de atalhos: trocada na janela do "?", o número deixa de fazer e a nova faz.
    await p.evaluate(() => localStorage.setItem('replay.atalhos', JSON.stringify({ ouvir1: ['Shift+Q'] })));
    await p.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'replay.atalhos' })));
    await p.keyboard.press('1');
    await p.waitForTimeout(120);
    assert.deepEqual(await noVisor(p), ['outro'], 'o 1 já não é do ângulo 1');
    await p.keyboard.press('Shift+Q');
    await p.waitForFunction(() => document.querySelector('#palcoFoco .tile')?.dataset.slug === 'tchubi', null, { timeout: 10000 });
    assert.deepEqual(erros, []);
    await p.close();

    const { p: p2, erros: erros2 } = await abrir();
    await carregar(p2, ['tchubi']);
    assert.deepEqual(await numeros(p2), { tchubi: '' }, 'um ângulo só não tem para onde trocar');
    assert.equal(await p2.locator('.tile .numAngulo').isHidden(), true);
    assert.deepEqual(erros2, []);
    await p2.close();
  });

// O som no ficheiro, medido: dois vídeos com um tom cada (300 Hz e 1200 Hz), um clipe seguido de 2 s que
// troca de ângulo no segundo 1. A primeira metade do ficheiro tem de soar a 300 Hz e a segunda a 1200 Hz.
test('o clipe de vários ângulos grava o som de quem está na tela, e troca com a imagem', { ...semNavegador, timeout: 90_000 }, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(async () => {
    const { gravarAngulos, planoDeAngulos } = await import('/angulos.js');
    async function videoComTom(freq) {
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 180;
      const g = cv.getContext('2d');
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      osc.frequency.value = freq;
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      const fluxo = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(fluxo, { mimeType: 'video/webm;codecs=vp8,opus' });
      const pedacos = [];
      rec.ondataavailable = (e) => pedacos.push(e.data);
      const pintar = setInterval(() => { g.fillStyle = `hsl(${(performance.now() / 5) % 360} 60% 40%)`; g.fillRect(0, 0, 320, 180); }, 33);
      rec.start();
      await new Promise((ok) => setTimeout(ok, 3500));
      await new Promise((ok) => { rec.onstop = ok; rec.stop(); });
      clearInterval(pintar);
      ac.close();
      const v = document.createElement('video');
      v.src = URL.createObjectURL(new Blob(pedacos, { type: 'video/webm' }));
      v.muted = false;
      v.volume = 0;
      document.body.append(v);
      await new Promise((ok) => { v.onloadeddata = ok; });
      return v;
    }
    const videos = [await videoComTom(300), await videoComTom(1200)];
    const plano = planoDeAngulos({ canais: ['a', 'b'], duracaoS: 2, trocasS: [1] });
    const trocas = [];
    const { blob } = await gravarAngulos(videos, { plano, formato: 'video/webm', aoSom: (i, tS) => trocas.push([i, tS]) });
    const som = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
    const dados = som.getChannelData(0);
    // A frequência pelos cruzamentos do zero, num pedaço longe da troca.
    const freq = (deS, ateS) => {
      const a = Math.floor(deS * som.sampleRate);
      const b = Math.min(dados.length, Math.floor(ateS * som.sampleRate));
      let n = 0;
      for (let i = a + 1; i < b; i++) if ((dados[i - 1] < 0) !== (dados[i] < 0)) n++;
      return n / 2 / ((b - a) / som.sampleRate);
    };
    return { trocas, duracao: som.duration, antes: freq(0.2, 0.8), depois: freq(1.3, 1.8) };
  });
  assert.deepEqual(r.trocas.map(([i]) => i), [0, 1], 'o som começa no primeiro e passa ao segundo');
  assert.ok(Math.abs(r.trocas[1][1] - 1) < 0.15, `a troca do som não foi no segundo 1 (${r.trocas[1][1]})`);
  assert.ok(r.duracao > 1.5, `o ficheiro tem pouco som (${r.duracao} s)`);
  assert.ok(Math.abs(r.antes - 300) < 60, `a primeira metade devia soar a 300 Hz e soa a ${Math.round(r.antes)}`);
  assert.ok(Math.abs(r.depois - 1200) < 150, `a segunda metade devia soar a 1200 Hz e soa a ${Math.round(r.depois)}`);
  assert.deepEqual(erros, []);
  await p.close();
});

test('o export vertical recusa silêncio e entrega áudio no Blob', { ...semNavegador, timeout: 90_000 }, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  const resultado = await p.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 180;
    const cx = cv.getContext('2d');
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    osc.frequency.value = 440;
    const destino = ac.createMediaStreamDestination();
    osc.connect(destino);
    osc.start();
    const stream = new MediaStream([
      ...cv.captureStream(30).getVideoTracks(),
      ...destino.stream.getAudioTracks(),
    ]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const partes = [];
    rec.ondataavailable = (e) => partes.push(e.data);
    const pintar = setInterval(() => { cx.fillStyle = '#234'; cx.fillRect(0, 0, 320, 180); }, 33);
    rec.start();
    await new Promise((ok) => setTimeout(ok, 2500));
    await new Promise((ok) => { rec.onstop = ok; rec.stop(); });
    clearInterval(pintar);
    ac.close();

    const video = document.createElement('video');
    video.src = URL.createObjectURL(new Blob(partes, { type: 'video/webm' }));
    video.muted = false;
    video.volume = 0;
    await new Promise((ok, mal) => { video.onloadedmetadata = ok; video.onerror = mal; });
    const { gravar } = await import('/retrato.js');
    const tela = document.createElement('canvas');
    const saida = await gravar(video, {
      modo: 'inteiro', alvo: { largura: 320, altura: 180 }, duracaoS: 1,
      formato: 'video/webm;codecs=vp8,opus', criarTela: () => tela,
      exigirSom: true, pagina: document,
    });
    const som = await new AudioContext().decodeAudioData(await saida.blob.arrayBuffer());
    const dados = som.getChannelData(0);
    let energia = 0;
    for (let i = 0; i < dados.length; i++) energia += dados[i] ** 2;
    return { duracao: som.duration, rms: Math.sqrt(energia / dados.length) };
  });
  assert.ok(resultado.duracao > 0.7, `o Blob não trouxe duração de áudio: ${resultado.duracao}`);
  assert.ok(resultado.rms > 0.02, `o Blob trouxe só silêncio: RMS ${resultado.rms}`);
  assert.deepEqual(erros, []);
  await p.close();
});
