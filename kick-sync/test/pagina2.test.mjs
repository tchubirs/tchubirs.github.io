// O clipe, o retrato e o ecrã, num browser a sério.
//
// Os testes de unidade cobrem os módulos. Nada cobria o `app.js` — o ficheiro
// que os liga uns aos outros e o único em que ele mexe. É exactamente aí que
// se esconde uma variável usada antes de existir, ou um ouvinte pendurado num
// elemento que não está lá: os módulos ficam verdes e a página está morta.
//
// O servidor, o Chromium e o `abrir` vivem em palco.mjs, partilhados com o
// outro ficheiro de testes de página.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { kickFalsa, T, TEM_SOM } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });

test('marcar uma kill a sério faz a página procurar o mesmo som na noite',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    // Sem varredura nao ha som guardado, e o botao nao pode existir: prometia
    // uma coisa que a pagina nao sabe fazer.
    assert.equal(await p.locator('#listaMomentos .foiKill').count(), 0);

    const ms = Number(await p.locator('#listaMomentos li[data-ms]').getAttribute('data-ms'));
    // Uma noite falsa: o MESMO som em quatro instantes, e um som diferente
    // noutros dois. So os quatro podem sobrar.
    await p.evaluate(({ ms: m }) => {
      const n = 1440;
      const forma = (semente) => {
        let s = semente >>> 0;
        const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
        const v = new Float32Array(n);
        let e = 0;
        for (let k = 0; k < n; k++) { v[k] = Math.exp(-k / 240) * r(); e += v[k] * v[k]; }
        for (let k = 0; k < n; k++) v[k] /= Math.sqrt(e);
        return v;
      };
      const acerto = forma(11);
      const outro = forma(999);
      window.__estado.estouros = [
        { ms: m, altura: 40, recorte: acerto },
        { ms: m + 30_000, altura: 30, recorte: acerto },
        { ms: m + 90_000, altura: 25, recorte: acerto },
        { ms: m + 150_000, altura: 20, recorte: acerto },
        { ms: m + 45_000, altura: 35, recorte: outro },
        { ms: m + 60_000, altura: 33, recorte: outro },
      ];
    }, { ms });
    // Mexer no filtro redesenha a lista — e uma accao dele, e nao um atalho
    // de teste. Na vida real quem redesenha e a propria busca automatica,
    // logo a seguir a guardar os sons.
    await p.selectOption('#filtroMomentos', 'semMorte');
    await p.waitForSelector('#listaMomentos .foiKill', { timeout: 5000 });

    await p.locator('#listaMomentos .foiKill').first().click();
    await p.waitForFunction(() => /Referência guardada/.test(document.getElementById('estadoMontagem').textContent),
      null, { timeout: 10000 });

    const marcados = await p.evaluate(() => window.__estado.momentos.map((m) => m.ms).sort((a, b) => a - b));
    assert.deepEqual(marcados, [ms, ms + 30_000, ms + 90_000, ms + 150_000],
      'só os instantes com o MESMO som — o outro som não pode entrar');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Eu aperto em Rever e o vídeo não toca, nenhum momento o vídeo toca."
//
// Não era o telemóvel dele. O iOS recusa o primeiro `play()` de uma página
// porque não veio de um toque — e a partir daí o vídeo ficava parado para
// sempre, porque quando o leitor já estava no MESMO vídeo a página acertava o
// instante e saía sem mandar tocar.
//
// Aqui o iOS é imitado à letra: o primeiro `play()` é recusado, como lá.
test('depois de o browser recusar o primeiro play, Rever volta a mandar tocar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await p.addInitScript(() => {
      // O iOS à letra: recusa e o vídeo FICA PARADO. Recusar só a primeira
      // vez não servia — o Chromium punha `paused` a falso na segunda, e o
      // caso que interessa é justamente o de um leitor que continua parado.
      window.__plays = [];
      HTMLMediaElement.prototype.play = function () {
        window.__plays.push(Date.now());
        return Promise.reject(new DOMException('NotAllowedError'));
      };
    });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    // O leitor está mesmo parado, como no telemóvel dele.
    assert.equal(await p.evaluate(() => document.querySelector('.tile video').paused), true);
    const antes = await p.evaluate(() => window.__plays.length);
    await p.locator('#listaMomentos .ver').click();
    await p.waitForFunction((n) => window.__plays.length > n, antes, { timeout: 5000 });
    assert.ok(await p.evaluate(() => window.__plays.length) > antes,
      'Rever tem de mandar tocar mesmo com o leitor já no mesmo vídeo');

    // E saltar no tempo também: cada gesto dele tem de tentar outra vez, senão
    // um vídeo parado por engano fica parado a noite toda.
    const meio = await p.evaluate(() => window.__plays.length);
    await p.click('#mais10s');
    await p.waitForFunction((n) => window.__plays.length > n, meio, { timeout: 5000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Falta tempo antes e tempo depois... esse tempo extra é FORA o combate
// completo: antes do primeiro disparo e depois do último."
//
// O clipe era cinco segundos antes de um instante e dois depois, e um
// tiroteio de vinte segundos ficava cortado ao meio. Agora leva o combate
// inteiro, e as margens dele por fora — e a prévia mostra exactamente isso,
// senão ele descobria o corte errado só no editor.
test('a prévia de um tiroteio leva o combate inteiro e as margens por fora',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.click('#margens summary');
    await p.fill('#protAntes', '5');
    await p.fill('#protDepois', '2');
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
    const ms = Number(await p.locator('#listaMomentos li[data-ms]').getAttribute('data-ms'));

    // Um tiroteio de vinte segundos, como a deteccao automatica o daria.
    await p.evaluate((m) => {
      window.__estado.momentos = window.__estado.momentos.map((x) => (x.ms === m
        ? { ...x, combateDeMs: m, combateAteMs: m + 20_000 } : x));
    }, ms);
    await p.selectOption('#filtroMomentos', 'semMorte');

    await p.locator('#listaMomentos .ver').click();
    const previa = await p.evaluate(() => window.__estado.previa);
    assert.equal(previa.de - ms, -5000, 'cinco segundos antes do primeiro disparo');
    assert.equal(previa.ate - ms, 22_000, 'dois segundos depois do último');
    // E a lista diz quanto dura, para ele não descobrir o tamanho só depois
    // de exportar.
    assert.match(await p.locator('#listaMomentos .quantos').innerText(), /^27s · /);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Precisa de um botão igual YouTube/Twitch/Kick para deixar em tela cheia, ou
//  levar aquela tela para outro monitor."
//
// A decisão de QUAL mecanismo usar é testada sem browser em janela.test.mjs.
// Isto é o resto: os botões existem, estão no quadrado em foco, e o de ecrã
// cheio entra e sai mesmo.
test('o ângulo em foco sai da grelha: ecrã cheio e janela à parte',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    const foco = '.tile.foco';
    await p.waitForSelector(`${foco} .ecraCheio`, { timeout: 10000 });
    // Os três do canto numa fila, sem se sobreporem — que é como os de baixo
    // já se partiram uma vez.
    const cantos = await p.evaluate((sel) => ['.par', '.ecraCheio', '.aparte']
      .map((s) => document.querySelector(`${sel} ${s}`))
      .map((e) => (e ? { x: Math.round(e.getBoundingClientRect().x), w: Math.round(e.getBoundingClientRect().width) } : null)), foco);
    assert.ok(cantos.every(Boolean), `faltou um botão: ${JSON.stringify(cantos)}`);
    for (let i = 1; i < cantos.length; i++) {
      assert.ok(cantos[i].x >= cantos[i - 1].x + cantos[i - 1].w,
        `os botões do canto sobrepõem-se: ${JSON.stringify(cantos)}`);
    }

    await p.click(`${foco} .ecraCheio`);
    await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 });
    // E sai. Um botão que só sabe entrar deixa a pessoa presa ao Esc, e no
    // telemóvel não há Esc.
    await p.click('.tile.foco .ecraCheio');
    await p.waitForFunction(() => !document.fullscreenElement, null, { timeout: 5000 });
    assert.deepEqual(erros, []);
  });

// O editor do retrato: a zona de corte tem de ser EXACTAMENTE a imagem.
//
// Este é o bug que não se vê no editor. Com a caixa das caixas a medir o
// contentor em vez do vídeo, um 16:9 limitado pela altura ganha barras pretas
// nos lados: os rectângulos ficam desalinhados da imagem e arrastam à
// velocidade errada. No ecrã parece bem; descobre-se no ficheiro exportado,
// com o enquadramento noutro sítio.
test('o editor do retrato mede-se pelo vídeo e não pela caixa à volta',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    // A Kick falsa não serve vídeo a sério e o editor esconde-se de propósito
    // sem `videoWidth`. Um vídeo verdadeiro, feito aqui, com uma proporção que
    // NÃO é a da caixa — é aí que o erro aparece.
    await p.evaluate(async () => {
      const cv = document.createElement('canvas');
      cv.width = 1280; cv.height = 720;
      const cx = cv.getContext('2d');
      let n = 0;
      const t = setInterval(() => {
        cx.fillStyle = `hsl(${(n++ * 9) % 360} 55% 35%)`;
        cx.fillRect(0, 0, 1280, 720);
      }, 33);
      const g = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' });
      const ps = [];
      g.ondataavailable = (e) => ps.push(e.data);
      g.start();
      await new Promise((k) => setTimeout(k, 1200));
      await new Promise((k) => { g.onstop = k; g.stop(); });
      clearInterval(t);
      const v = document.getElementById('previaClipe');
      v.src = URL.createObjectURL(new Blob(ps, { type: 'video/webm' }));
      await new Promise((k) => { v.onloadedmetadata = k; });
      v.currentTime = 0.3;
      await new Promise((k) => { v.onseeked = k; });
    });
    await p.waitForSelector('#recortes:not([hidden])', { timeout: 10000 });

    const medidas = await p.evaluate(() => {
      const r = (s) => {
        const b = document.querySelector(s).getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      };
      return { video: r('#previaClipe'), zona: r('#recortes'), caixas: document.querySelectorAll('.recorte').length };
    });
    assert.deepEqual(medidas.zona, medidas.video,
      `a zona de corte ${JSON.stringify(medidas.zona)} não é a imagem ${JSON.stringify(medidas.video)}`);
    assert.equal(medidas.caixas, 1, 'um modo, um enquadramento');

    // Dois enquadramentos, e a nascer PRONTOS: "quando clico em dois
    // enquadramentos devia ficar praticamente pronto". O primeiro é a webcam e
    // vai para o canto de baixo à esquerda — que é onde ela está nos três
    // canais que medi; o segundo é o jogo e fica ao meio.
    await p.click('#modoDois');
    const dois = await p.evaluate(() => {
      const z = document.querySelector('#recortes').getBoundingClientRect();
      return [...document.querySelectorAll('.recorte')].map((e) => {
        const b = e.getBoundingClientRect();
        return {
          esq: (b.x - z.x) / z.width,
          topo: (b.y - z.y) / z.height,
          meioX: (b.x + b.width / 2 - z.x) / z.width,
          meioY: (b.y + b.height / 2 - z.y) / z.height,
          baixo: (b.y + b.height - z.y) / z.height,
        };
      });
    });
    assert.equal(dois.length, 2);
    assert.ok(dois[0].esq < 0.02, `a webcam devia encostar à esquerda e ficou em ${dois[0].esq}`);
    assert.ok(dois[0].baixo > 0.98, `a webcam devia encostar em baixo e acabou em ${dois[0].baixo}`);
    assert.ok(Math.abs(dois[1].meioX - 0.5) < 0.02, `o jogo devia ficar ao meio e ficou em ${dois[1].meioX}`);
    assert.ok(Math.abs(dois[1].meioY - 0.5) < 0.02, `o jogo devia ficar ao meio e ficou em ${dois[1].meioY}`);
    assert.ok(dois[0].topo !== dois[1].topo, 'os dois no mesmo sítio são indistinguíveis de um');

    // "Mexer na direita afeta directamente os tamanhos na esquerda."
    //
    // É o ponto todo do divisor, e é o que se pode partir sem dar por nada: a
    // barra move-se, o retrato reparte-se, e os rectângulos da esquerda ficam
    // com a forma antiga. O editor passaria a mostrar um enquadramento que não
    // é o que sai no ficheiro.
    await p.waitForSelector('#divisor:not([hidden])', { timeout: 5000 });
    const antes = await p.evaluate(() => [...document.querySelectorAll('.recorte')]
      .map((e) => { const r = e.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); }));

    const caixa = await p.locator('#telaRetrato').boundingBox();
    const pega = await p.locator('#divisor').boundingBox();
    await p.mouse.move(pega.x + pega.width / 2, pega.y + pega.height / 2);
    await p.mouse.down();
    await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height * 0.75, { steps: 8 });
    await p.mouse.up();

    const depois = await p.evaluate(() => [...document.querySelectorAll('.recorte')]
      .map((e) => { const r = e.getBoundingClientRect(); return +(r.width / r.height).toFixed(3); }));
    assert.notDeepEqual(depois, antes,
      `a esquerda não mexeu: ${JSON.stringify(antes)} continua ${JSON.stringify(depois)}`);
    // Com o quadro de cima a valer três quartos, o recorte de cima fica mais
    // alto em relação à sua largura, e o de baixo mais achatado.
    assert.ok(depois[0] < antes[0], `o de cima devia ficar mais alto: ${antes[0]} -> ${depois[0]}`);
    assert.ok(depois[1] > antes[1], `o de baixo devia ficar mais achatado: ${antes[1]} -> ${depois[1]}`);

    // E o pill acompanha: ficou onde o vídeo passa a partir-se.
    const pega2 = await p.locator('#divisor').boundingBox();
    const fraccao = (pega2.y + pega2.height / 2 - caixa.y) / caixa.height;
    assert.ok(Math.abs(fraccao - 0.75) < 0.05, `o divisor ficou a ${(fraccao * 100).toFixed(0)}%`);
    assert.deepEqual(erros, []);
  });

// "Quando mudo a data não deveria ter um botão de OK, ou aplicar, ou aplicar
//  sozinho? Não sei."
//
// Aplica sozinho, e sempre aplicou. O que faltava era DIZER: a mensagem "a ler
// relógios" era escrita no cartão de cima, ao lado do "Carregar", e num
// telemóvel esse cartão está a um ecrã de distância do selector da noite. Ele
// mudou a noite, não viu nada a mexer, e concluiu que faltava um botão.
//
// E ao ir escrever isto encontrei o problema a sério: nada impedia duas
// mudanças de correrem ao mesmo tempo. São trinta canais e dois pedidos de
// rede por cada; quem acaba primeiro é quem tiver menos VODs, e não quem ele
// escolheu por último.
test('mudar de noite diz o que está a fazer, e a última escolha é a que fica',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    // A primeira noite responde devagar de propósito: sem isso as duas acabam
    // pela ordem em que foram pedidas e a corrida nunca chega a acontecer.
    const { p, erros } = await abrir();
    // As duas noites têm de dar palcos DIFERENTES, senão o teste não consegue
    // dizer qual ganhou: a noite 0 tem dois canais, a noite 1 tem um só.
    await kickFalsa(p, {
      canais: ['tchubi', 'outro'],
      noites: 2,
      // 250 ms por pedido, e não 900: com 900 a noite lenta ainda não tinha
      // acabado quando eu media, e o teste passava mesmo com a guarda
      // removida — ou seja, não estava a testar nada. Com 250 ela acaba
      // DEPOIS da rápida e ANTES da medição, que é o único intervalo em que a
      // corrida existe.
      atrasoMsPorNoite: { 0: 250 },
      canaisPorNoite: { 0: ['tchubi', 'outro'], 1: ['tchubi'] },
    });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 25000 });
    await p.waitForFunction(() => document.querySelectorAll('#noite option').length >= 2,
      null, { timeout: 10000 });

    const noites = await p.evaluate(() => [...document.querySelectorAll('#noite option')]
      .map((o) => o.textContent.trim()));
    assert.equal(noites.length, 2, `esperava duas noites: ${JSON.stringify(noites)}`);

    // 1. Diz o que está a fazer, ao pé do controlo — e fecha o selector
    //    enquanto lê, para não se poder mudar outra vez a meio.
    await p.selectOption('#noite', { index: 1 });
    await p.waitForFunction(() => document.getElementById('estadoNoite').textContent.trim() !== ''
      || document.getElementById('noite').disabled, null, { timeout: 3000 });
    const aMeio = await p.evaluate(() => ({
      diz: document.getElementById('estadoNoite').textContent.trim(),
      fechado: document.getElementById('noite').disabled,
    }));
    assert.ok(aMeio.diz || aMeio.fechado, 'nada dizia que estava a trabalhar');

    // E volta a abrir quando acaba.
    await p.waitForFunction(() => !document.getElementById('noite').disabled, null, { timeout: 25000 });
    await p.waitForFunction(() => document.getElementById('estadoNoite').textContent.trim() === '',
      null, { timeout: 25000 });

    // 2. A corrida: pedir a LENTA e logo a seguir a rápida. Fica a rápida, que
    //    é a última que ele escolheu.
    //
    //    As noites saem da mais recente para a mais antiga, por isso o índice
    //    1 é a de 30/08 — a que tem dois canais e o atraso — e o índice 0 é a
    //    de 31/08, com um canal e sem atraso. Enganei-me nisto à primeira e o
    //    teste falhou a dizer o contrário do que eu esperava, que é
    //    exactamente para o que ele serve.
    const rotulo = (i) => noites[i];
    await p.evaluate(() => {
      const s = document.getElementById('noite');
      s.disabled = false;                       // como se ele fosse mais rápido que o ecrã
      s.value = '1';
      s.dispatchEvent(new Event('change'));
      s.disabled = false;
      s.value = '0';
      s.dispatchEvent(new Event('change'));
    });
    // 2,5 s, medido e não estimado. Numa sonda com a guarda removida o palco
    // fica com um ângulo até aos 1400 ms e passa a DOIS aos 2000 ms — é aí que
    // a noite lenta acaba e escreve por cima. O `networkidle` dava por
    // terminado antes disso, e o teste passava nos dois casos: não estava a
    // medir nada.
    await p.waitForTimeout(2500);
    // O que interessa NÃO é o que o selector diz — é o PALCO. A noite lenta,
    // se ganhar, traz os dois canais dela; a que ele escolheu tem um só.
    const quantos = await p.evaluate(() => document.querySelectorAll('.tile').length);
    assert.equal(quantos, 1,
      `o palco ficou com ${quantos} ângulos: a noite lenta (${rotulo(1)}) escreveu por cima`
      + ` da que ele escolheu (${rotulo(0)})`);
    assert.deepEqual(erros, []);
  });

// "Esses vídeos em baixo têm que ficar em alguma ordem, ou de adicionado ou
//  alfabética, porque nunca acho a live de quem tô procurando."
//
// A ordem de adição já lá estava — foi ele que a pediu. Mas resolver "não há
// ordem" não é o mesmo que resolver "não encontro o fulano": ninguém se lembra
// em que posição escreveu um nome há uma hora, e para PROCURAR alguém a chave é
// o nome.
test('a grelha ordena-se como ele escreveu, ou de A a Z, à escolha',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    // Nomes cuja ordem de escrita é DIFERENTE da alfabética, senão o teste
    // passa nos dois casos sem distinguir nada.
    const canais = ['zebra', 'alfa', 'moka', 'beta'];
    await kickFalsa(p, { canais });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', canais.join('\n'));
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.waitForSelector('#barraGrelha:not([hidden])', { timeout: 10000 });

    // A ordem é dada pelo CSS e não pelo DOM: mover um `<video>` a tocar
    // interrompe-o. Por isso lê-se `style.order`, e não a ordem dos nós.
    const daGrelha = () => p.evaluate(() => [...document.querySelectorAll('#grade .tile')]
      .map((t) => ({ slug: t.dataset.slug, ordem: Number(t.style.order) }))
      .sort((a, b) => a.ordem - b.ordem)
      .map((x) => x.slug));

    assert.deepEqual(await daGrelha(), ['alfa', 'moka', 'beta'],
      'devia estar pela ordem em que ele os escreveu, sem o que está em foco');

    await p.click('#ordemAz');
    assert.deepEqual(await daGrelha(), ['alfa', 'beta', 'moka'], 'devia estar de A a Z');

    // E o quadrado que sobe ao foco não pode levar a ordem consigo: o foco
    // TAMBÉM é uma grelha, e com dois lá em cima isso trocava-os.
    await p.click('#grade .tile');
    await p.waitForTimeout(400);
    const focados = await p.evaluate(() => [...document.querySelectorAll('#palcoFoco .tile')]
      .map((t) => t.style.order));
    assert.deepEqual(focados, [''], `o quadrado em foco levou a ordem: ${JSON.stringify(focados)}`);
    assert.deepEqual(await daGrelha(), ['beta', 'moka', 'zebra'], 'e a grelha continua de A a Z');

    // A escolha fica guardada no dispositivo.
    const guardado = await p.evaluate(() => localStorage.getItem('replay.ordem'));
    assert.equal(guardado, 'az');
    assert.deepEqual(erros, []);
  });

// "Tentei usar o exportar na outra versão e o botão nem fez nada quando
//  apertava."
//
// Não fazia mesmo. O `guardarRetrato` desistia em silêncio quando ainda não
// havia enquadramentos — e não há enquadramentos enquanto a pré-visualização
// não tiver tamanho. O botão ficava aceso desde o princípio, ele carregava, e
// não acontecia nem uma mensagem.
//
// Um botão aceso que não faz nada é o pior de todos: a pessoa fica sem saber
// se se enganou, se a página está avariada, ou se o ficheiro foi para algum
// lado. Agora nasce fechado, e ao fim de seis segundos sem prévia DIZ porquê.
test('o exportar do retrato nunca fica calado',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    // A Kick falsa não serve vídeo que decodifique: é exactamente o caso em
    // que ele estava.
    assert.equal(await p.evaluate(() => document.getElementById('guardarRetrato').disabled), true,
      'o botão do retrato tem de nascer fechado');

    // E ao fim da espera, explica-se.
    await p.waitForSelector('#semRetrato:not([hidden])', { timeout: 12000 });
    const explica = await p.evaluate(() => document.getElementById('semRetrato').textContent.trim());
    assert.ok(explica.length > 10, `a explicação estava vazia: ${JSON.stringify(explica)}`);

    // Com uma prévia a sério, abre.
    await p.evaluate(async () => {
      const cv = document.createElement('canvas');
      cv.width = 1280; cv.height = 720;
      const cx = cv.getContext('2d');
      let n = 0;
      const t = setInterval(() => {
        cx.fillStyle = `hsl(${(n++ * 9) % 360} 55% 35%)`;
        cx.fillRect(0, 0, 1280, 720);
      }, 33);
      const g = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' });
      const ps = [];
      g.ondataavailable = (e) => ps.push(e.data);
      g.start();
      await new Promise((k) => setTimeout(k, 1200));
      await new Promise((k) => { g.onstop = k; g.stop(); });
      clearInterval(t);
      const v = document.getElementById('previaClipe');
      v.src = URL.createObjectURL(new Blob(ps, { type: 'video/webm' }));
      await new Promise((k) => { v.onloadedmetadata = k; });
    });
    await p.waitForFunction(() => !document.getElementById('guardarRetrato').disabled,
      null, { timeout: 10000 });
    assert.equal(await p.evaluate(() => document.getElementById('semRetrato').hidden), true,
      'a explicação devia sumir quando o editor abre');
    assert.deepEqual(erros, []);
  });

// `hidden` tem de esconder mesmo. Cai-se nisto sem dar por nada: basta uma
// regra qualquer com `display` a apanhar o elemento, porque um `display`
// escrito ganha ao `display: none` que o atributo traz. Aconteceu-me três
// vezes — no modal do clipe, no palco, e na secção do início, esta última
// só porque reutilizei um nome de classe que já existia noutro sítio.
// Em vez de o escrever no CSS uma quarta vez, mede-se.
test('nada com hidden ocupa espaço na página',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    const visiveis = await p.evaluate(() => [...document.querySelectorAll('[hidden]')]
      .filter((e) => e.getBoundingClientRect().width > 0 || e.getBoundingClientRect().height > 0)
      .map((e) => `${e.tagName.toLowerCase()}#${e.id || '?'} (${getComputedStyle(e).display})`));
    assert.deepEqual(visiveis, [], `escondidos que aparecem: ${visiveis.join(', ')}`);

    // E depois de carregar, o que ficou escondido continua escondido.
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    const depois = await p.evaluate(() => [...document.querySelectorAll('[hidden]')]
      .filter((e) => e.getBoundingClientRect().width > 0 || e.getBoundingClientRect().height > 0)
      .map((e) => `${e.tagName.toLowerCase()}#${e.id || '?'} (${getComputedStyle(e).display})`));
    assert.deepEqual(depois, [], `escondidos que aparecem depois de carregar: ${depois.join(', ')}`);
    assert.deepEqual(erros, []);
  });

// "A proporção de tela usada está errada pro PC, e tem botões e coisas
// sobrepondo, mal colocado."
//
// A página foi feita ao telemóvel e num monitor grande ficava uma tira ao
// meio com metade do ecrã vazio dos dois lados. Este teste mede as duas
// coisas de que ele se queixou: quanta largura é mesmo usada, e se algum
// controlo cai por cima de outro.
test('num ecrã de PC a página usa a largura e nada se sobrepõe',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1920, height: 1080 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro', 'terceiro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro\nterceiro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    // Duas colunas: a montagem fica AO LADO do vídeo, e não a um ecrã de
    // distância dele. Medido no topo da página: a coluna do lado acompanha o
    // scroll de propósito, e a meio da página não estaria alinhada com nada.
    await p.evaluate(() => window.scrollTo(0, 0));
    const [video, lado] = await p.evaluate(() => ['.palcoVideo', '.palcoLado']
      .map((s) => document.querySelector(s).getBoundingClientRect())
      .map((r) => ({ x: Math.round(r.x), largura: Math.round(r.width), y: Math.round(r.y) })));
    assert.ok(lado.x > video.x + video.largura - 40,
      `a coluna do lado começa em ${lado.x} e o vídeo acaba em ${video.x + video.largura}`);
    assert.ok(Math.abs(lado.y - video.y) < 80, 'as duas colunas começam à mesma altura');

    // E o conteúdo usa mesmo o monitor: antes disto ocupava 1400 px de 1920.
    const usada = video.largura + lado.largura;
    assert.ok(usada > 1500, `só ${usada} px de 1920 — a página continua uma tira`);

    // Nada por cima de nada. Cada par de controlos visíveis tem de ter
    // rectângulos disjuntos: foi assim que o botão do som ficou impossível de
    // carregar, e nada no ecrã o explicava.
    const sobrepostos = await p.evaluate(() => {
      const alvos = [...document.querySelectorAll(
        '#palco button, #palco select, #palco input, #entrada button, #entrada input, #entrada textarea',
      )].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0);
      const maus = [];
      for (let i = 0; i < alvos.length; i++) {
        for (let j = i + 1; j < alvos.length; j++) {
          const a = alvos[i].getBoundingClientRect();
          const b = alvos[j].getBoundingClientRect();
          // Um contém o outro (um botão dentro de um label) não é sobreposição.
          if (alvos[i].contains(alvos[j]) || alvos[j].contains(alvos[i])) continue;
          const cruza = a.left < b.right - 1 && b.left < a.right - 1
            && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          // O nome inteiro, e nao so a classe: "BUTTON x somBtn" nao diz qual
          // dos vinte botoes da pagina e.
          const nome = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}`
            + `${e.className ? `.${String(e.className).split(' ').join('.')}` : ''}`
            + `[${e.textContent.trim().slice(0, 12) || e.getAttribute('aria-label') || ''}]`
            + `@${e.closest('[data-slug]')?.dataset.slug ?? e.parentElement?.className ?? ''}`;
          if (cruza) maus.push(`${nome(alvos[i])} × ${nome(alvos[j])}`);
        }
      }
      return maus;
    });
    assert.deepEqual(sobrepostos, [], 'controlos por cima uns dos outros');

    // E a página não pode ganhar uma barra horizontal.
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth
      <= document.documentElement.clientWidth), true, 'a página abana para o lado');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Os canais deviam ficar na ordem que eu adiciono, igual em cima — ctapp por
// último e assim vai, porque está difícil achar as POV em baixo."
//
// Com vinte e três canais, procurar um nome numa grelha em ordem desconhecida
// é trabalho a sério. A lista de fichas lá em cima já está na ordem dele; a
// grelha vinha na ordem por que a Kick respondeu.
test('a grelha fica na ordem em que ele escreveu os canais',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    // Escritos ao contrário do alfabeto de propósito: assim uma ordenação
    // alfabética acidental não passa por acaso.
    const ordem = ['zeta', 'alfa', 'meio'];
    const { p, erros } = await abrir({ ecra: { width: 1400, height: 900 } });
    // Cada um comeca a transmitir a uma hora diferente, e ao CONTRARIO da
    // ordem em que ele os escreve. Sem isto o teste passava por acaso: a
    // grelha vinha da ordem de CHEGADA, e no falso todos chegavam juntos.
    await kickFalsa(p, { canais: ordem, comecosS: { zeta: 120, alfa: 60, meio: 0 } });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', ordem.join('\n'));
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    const naTela = await p.evaluate(() => [...document.querySelectorAll('#palcoFoco .tile, #grade .tile')]
      .map((t) => t.dataset.slug));
    assert.deepEqual(naTela, ordem);
    // E a lista de fichas lá em cima diz o mesmo, senão são duas ordens para a
    // mesma coisa.
    const fichas = await p.evaluate(() => [...document.querySelectorAll('#listaCanais [data-slug]')]
      .map((e) => e.dataset.slug));
    if (fichas.length) assert.deepEqual(fichas, ordem);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Falta a versão mobile aqui." O modal de criar clipe foi desenhado num ecrã
// grande — 820 px de largura e o vídeo em 16/9 — e num telemóvel em pé isso
// não cabe: os botões que interessam ficam fora de vista.
test('o modal de clipe cabe num telemóvel em pé',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    // Cada par de setas na sua linha, e as duas setas da mesma ponta lado a
    // lado — não uma a cair para a linha de baixo sozinha, que foi assim que
    // ele viu os dois botões antigos no telemóvel.
    const cx = async (id) => p.locator(id).boundingBox();
    const [im, iM, fm, fM, ver] = await Promise.all(
      ['#inicioMenos', '#inicioMais', '#fimMenos', '#fimMais', '#verClipe'].map(cx),
    );
    assert.ok(Math.abs(im.y - iM.y) < 6, `as setas do início em y=${im.y} e y=${iM.y}`);
    assert.ok(Math.abs(fm.y - fM.y) < 6, `as setas do fim em y=${fm.y} e y=${fM.y}`);
    assert.ok(fm.y > im.y + 10, 'o fim tem de ficar POR BAIXO do início, e não ao lado');
    // O ▶ ao lado das duas linhas: toca o pedaço inteiro, não uma das pontas.
    assert.ok(ver.y <= im.y + 6 && ver.y + ver.height >= fm.y + fm.height - 6,
      'o ▶ devia acompanhar a altura das duas linhas');
    for (const [id, b] of [['#inicioMenos', im], ['#fimMais', fM], ['#verClipe', ver]]) {
      assert.ok(b.width >= 40 && b.height >= 40, `${id} tem ${b.width}x${b.height}, pequeno para um dedo`);
    }

    const caixa = await p.locator('#modalClipe .modalCaixa').boundingBox();
    assert.ok(caixa.width <= 390, `a caixa tem ${caixa.width} px num ecrã de 390`);
    assert.ok(caixa.height <= 844, `a caixa tem ${caixa.height} px de altura em 844`);

    // Os dois botões que terminam a tarefa têm de estar à vista, sem procurar.
    for (const id of ['#guardarClipe', '#cancelarClipe']) {
      const b = await p.locator(id).boundingBox();
      assert.ok(b && b.y >= 0 && b.y + b.height <= 844,
        `${id} está fora do ecrã: y=${b?.y}`);
      assert.ok(b.x >= 0 && b.x + b.width <= 390, `${id} sai pela lateral`);
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth
      <= document.documentElement.clientWidth), true, 'a página abana para o lado');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Os botões que estão lá dentro −1 segundo e +1 segundo só mexem no final do
// vídeo. Preciso mexer com precisão no final E no começo."
//
// Mexiam mesmo: os dois estavam presos ao `ate`. E o segundo metade da queixa
// é a que se mede pior e importa mais — "daí não aparece na tela onde acaba, e
// é bom de ver". A prova disso aqui é a CABEÇA da barra: é ela que diz em que
// instante a imagem está, e tem de saltar para a ponta que acabou de mexer.
test('cada ponta tem as suas setas, e a imagem vai para onde a ponta foi',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    // Sair do princípio da noite antes de abrir o clipe: colado ao início, o
    // `de` está no limite do VOD e recuar não teria para onde ir — o teste
    // falharia por causa do limite e não por causa do botão.
    await p.click('#mais1m');
    await p.click('#mais1m');
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    const ler = () => p.evaluate(() => {
      const pos = (sel) => parseFloat(document.querySelector(sel).style.left) || 0;
      const m = document.getElementById('tempoClipe').textContent.match(/([\d.]+)s de/);
      return {
        dur: Number(m?.[1]),
        de: pos('#barraClipe .pega.de'),
        ate: pos('#barraClipe .pega.ate'),
        cabeca: pos('#barraClipe .cabeca'),
      };
    });

    const antes = await ler();
    await p.click('#fimMais');
    const depoisFim = await ler();
    assert.ok(depoisFim.ate > antes.ate, 'o fim tinha de andar para a frente');
    // "Fiz o teste, às vezes um segundo passa do ponto que eu quero."
    assert.equal(Number((depoisFim.dur - antes.dur).toFixed(1)), 0.5,
      `o passo devia ser meio segundo e andou ${(depoisFim.dur - antes.dur).toFixed(2)}s`);
    assert.ok(Math.abs(depoisFim.de - antes.de) < 0.01, 'o início não se mexeu do sítio');
    assert.ok(Math.abs(depoisFim.cabeca - depoisFim.ate) < 0.5,
      `a imagem ficou em ${depoisFim.cabeca}% e o fim está em ${depoisFim.ate}%`);

    await p.click('#inicioMenos');
    const depoisInicio = await ler();
    assert.ok(depoisInicio.de < depoisFim.de, 'o início tinha de recuar');
    assert.ok(Math.abs(depoisInicio.ate - depoisFim.ate) < 0.01, 'o fim não se mexeu do sítio');
    assert.ok(Math.abs(depoisInicio.cabeca - depoisInicio.de) < 0.5,
      `a imagem ficou em ${depoisInicio.cabeca}% e o início está em ${depoisInicio.de}%`);

    // Com Shift o passo é mais curto: é o que dá para apurar o instante certo
    // depois de o segundo inteiro já ter chegado perto.
    const largo = depoisInicio.ate - depoisInicio.de;
    await p.click('#fimMais', { modifiers: ['Shift'] });
    const fino = await ler();
    assert.ok(fino.ate > depoisInicio.ate, 'com Shift também tem de andar');
    assert.equal(Number((fino.dur - depoisInicio.dur).toFixed(1)), 0.1,
      `com Shift o passo devia ser 0,1 s e andou ${(fino.dur - depoisInicio.dur).toFixed(2)}s`);
    assert.ok(fino.ate - fino.de > largo, 'e o clipe fica mais comprido, não mais curto');

    assert.deepEqual(erros, []);
    await p.close();
  });

// "Esse botão tela cheia na miniatura do vídeo é inútil, pode remover: a
//  miniatura não roda, só quando abro ele."
//
// Pôr um quadrado de 150 px em ecrã cheio dá uma imagem de 150 px esticada. O
// que ele quer nessa altura é ABRIR o ângulo — e isso é o outro botão.
test('a miniatura tem um botão só, e o desenho dele diz o que faz',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('#grade .tile', { timeout: 20000 });

    const seVe = (sel) => p.evaluate((s) => {
      const e = document.querySelector(s);
      return !!e && e.offsetParent !== null;
    }, sel);
    for (const botao of ['.ecraCheio', '.aparte']) {
      assert.equal(await seVe(`#grade .tile ${botao}`), false,
        `a miniatura ainda tem o ${botao}`);
      assert.equal(await seVe(`#palcoFoco .tile ${botao}`), true,
        `o ângulo aberto ficou sem o ${botao}`);
    }
    // Numa miniatura fica UM botão, e o desenho dele diz o que faz: dois
    // painéis lado a lado. No ângulo aberto é um olho — o que ele já está a
    // fazer. "Tá difícil de entender o que significam os ícones."
    const glifo = (sel) => p.getAttribute(`${sel} .par use`, 'href');
    assert.equal(await glifo('#grade .tile'), '#i-lado-a-lado');
    assert.equal(await glifo('#palcoFoco .tile'), '#i-olho');
    // E cada um com a sua frase: a mesma para os dois não explicava nenhum.
    const dica = (sel) => p.getAttribute(`${sel} .par`, 'title');
    assert.notEqual(await dica('#grade .tile'), await dica('#palcoFoco .tile'),
      'os dois estados do botão diziam a mesma coisa');

    // E o botão segue o quadrado: promover uma miniatura a foco faz o botão
    // aparecer nela, sem repintar nada — é o mesmo nó a mudar de pai.
    const antes = await p.locator('#grade .tile').first().getAttribute('data-slug');
    await p.locator('#grade .tile').first().locator('.par').click();
    await p.waitForFunction((s) => document.querySelector(`#palcoFoco .tile[data-slug="${s}"]`),
      antes, { timeout: 10000 });
    assert.equal(await seVe(`#palcoFoco .tile[data-slug="${antes}"] .ecraCheio`), true,
      'promovida a foco, a miniatura devia ganhar o ecrã cheio');
    assert.equal(await glifo(`#palcoFoco .tile[data-slug="${antes}"]`), '#i-olho',
      'promovida a foco, o botão devia passar a olho');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Passar pra frente e pra trás não parece botões."
//
// Não parecia: estavam transparentes e sem fio, com a ideia de que andar no
// tempo é navegação e a navegação se cala. Oito coisas soltas no meio de um
// painel não se leem como oito coisas em que se carrega.
test('os saltos no tempo têm a mesma cara dos outros botões',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    const cara = (id) => p.evaluate((i) => {
      const e = getComputedStyle(document.getElementById(i));
      return { fundo: e.backgroundColor, fio: e.borderTopColor, largura: e.borderTopWidth };
    }, id);
    const [salto, referencia] = await Promise.all([cara('menos5m'), cara('marcarIn')]);
    // A referência é um botão que ele já reconhece como botão.
    assert.deepEqual(salto, referencia,
      `o salto está ${JSON.stringify(salto)} e um botão normal está ${JSON.stringify(referencia)}`);
    // E nem o fundo nem o fio podem ser invisíveis.
    for (const [nome, cor] of [['fundo', salto.fundo], ['fio', salto.fio]]) {
      assert.ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(cor), `o ${nome} do salto é invisível: ${cor}`);
    }
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Cadê as mudanças anteriores que eu pedi, de ícone, layout e espaçamento?"
//
// Estavam publicadas — ele é que estava a ver a página de antes. O GitHub Pages
// responde `cache-control: max-age=600` e durante dez minutos o browser serve o
// `index.html` guardado sem perguntar nada. O carimbo `?v=` no código não
// resolve este caso: é o HTML que traz os endereços, e HTML velho traz código
// velho. A página passa a perguntar ao servidor qual é a versão e, se for
// outra, recarrega-se sozinha — uma vez.
test('uma página velha na cache recarrega-se sozinha, e só uma vez',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p);
    // O servidor de teste não publica `versao.txt`: aqui é ele que o serve, e
    // com um número diferente do que a página traz escrita.
    let pedidos = 0;
    await p.route('**/versao.txt*', (rota) => {
      pedidos++;
      rota.fulfill({ status: 200, contentType: 'text/plain', body: 'versao-nova' });
    });
    // E a página tem de CHEGAR com uma versão escrita, como chega depois de
    // publicada: escrevê-la depois de o código correr não testava nada, porque
    // é ao arrancar que ele se compara com o servidor.
    await p.route(`http://127.0.0.1:${PORTA}/`, async (rota) => {
      const r = await rota.fetch();
      const corpo = (await r.text()).replace('id="versao">dev<', 'id="versao">versao-velha<');
      rota.fulfill({ response: r, body: corpo });
    });

    let recargas = 0;
    p.on('load', () => { recargas++; });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);

    assert.ok(pedidos >= 1, 'a página nunca perguntou ao servidor qual era a versão');
    assert.ok(recargas >= 2, `a página não se recarregou (${recargas} carregamentos)`);
    // E não fica num ciclo: com o número ainda diferente, pára e diz-lho.
    assert.ok(recargas <= 3, `entrou num ciclo de recargas: ${recargas}`);
    const rodape = await p.locator('#versao').innerText();
    assert.match(rodape, /versao-nova/, `o rodapé devia dizer a versão nova: ${rodape}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Podia pôr a letra A e a letra D para voltar e avançar 3 segundos a cada
//  clique, e se segurasse pressionado fica voltando ou avançando mais."
//
// A escada em si é medida sem browser (ver relogio.test.mjs). Isto é o resto:
// que as teclas existem, que um toque vale três segundos, que segurar corre
// muito mais do que isso, e que largar PÁRA — uma corrida que não pára é pior
// do que não haver corrida nenhuma.
test('o A e o D andam três segundos, e segurar corre a noite',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    // Parado, para o relógio só andar por causa das teclas.
    await p.keyboard.press(' ');
    await p.waitForTimeout(200);

    const segundos = async () => {
      const txt = await p.locator('#agora').innerText();
      const [h, m, s] = txt.replace('Z', '').split(':').map(Number);
      return h * 3600 + m * 60 + s;
    };
    // O foco não pode estar numa caixa de texto: o teclado é da página.
    await p.locator('#palcoFoco .tile').click();
    await p.waitForTimeout(150);

    const antes = await segundos();
    await p.keyboard.press('d');
    await p.waitForTimeout(200);
    assert.equal(await segundos() - antes, 3, 'um toque no D devia andar três segundos');

    await p.keyboard.press('a');
    await p.waitForTimeout(200);
    assert.equal(await segundos() - antes, 0, 'e o A devia trazer de volta');

    // Segurar: um segundo e meio, que já passa do primeiro degrau da escada.
    const antesDeSegurar = await segundos();
    await p.keyboard.down('d');
    await p.waitForTimeout(1500);
    await p.keyboard.up('d');
    await p.waitForTimeout(250);
    const correu = await segundos() - antesDeSegurar;
    assert.ok(correu > 20, `segurar um segundo e meio andou só ${correu}s`);

    // E largar pára mesmo.
    const aoLargar = await segundos();
    await p.waitForTimeout(700);
    assert.equal(await segundos(), aoLargar, 'o relógio continuou a andar depois de largar');
    assert.deepEqual(erros, []);
    await p.close();
  });

// ── o sistema visual ───────────────────────────────────────────────────────
//
// Três coisas que se partem sem dar erro nenhum, e por isso têm de ser
// medidas: um símbolo que aponta para um nome que não existe desenha o vazio;
// uma letra que volta a vir de um CDN desaparece quando não há rede; e as
// regras do ecrã inteiro, que são só da mesa de montagem, prendiam a página
// da Twitch a 100vh sem nada que a fizesse caber.

test('todos os símbolos usados existem no sprite, e nenhum é emoji',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    const partidos = await p.evaluate(() => [...document.querySelectorAll('use')]
      .map((u) => u.getAttribute('href'))
      .filter((h, i, a) => a.indexOf(h) === i)
      .filter((h) => !h || !document.querySelector(`symbol${h}`)));
    assert.deepEqual(partidos, [], `símbolos sem desenho: ${partidos.join(', ')}`);

    // E nenhum botão diz o que quer dizer com um emoji: um ⏸ sai de uma
    // família diferente em cada sistema, e no iPhone sai a cores.
    const comEmoji = await p.evaluate(() => [...document.querySelectorAll('#palco button, header button')]
      .filter((b) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(b.textContent))
      .map((b) => `${b.id || b.className}: ${b.textContent.trim().slice(0, 12)}`));
    assert.deepEqual(comEmoji, [], `botões com emoji: ${comEmoji.join(', ')}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('a página não pede nada a mais ninguém — nem a letra',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const forasteiros = [];
    p.on('request', (r) => {
      const u = new URL(r.url());
      if (u.hostname !== '127.0.0.1' && u.protocol !== 'data:' && u.protocol !== 'blob:') forasteiros.push(r.url());
    });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    assert.deepEqual(forasteiros, [], `pedidos a outros domínios: ${forasteiros.join(', ')}`);

    // E a letra que a página está mesmo a usar é a nossa, e não a de reserva.
    const carregadas = await p.evaluate(() => [...document.fonts].map((f) => f.family));
    assert.ok(carregadas.includes('IBM Plex Sans'), `caras declaradas: ${carregadas.join(', ')}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('a página da Twitch não fica presa às regras da mesa de montagem',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1920, height: 1080 } });
    // `domcontentloaded` e não `networkidle`: o que se mede aqui é CSS, e
    // esperar que a rede assente custava catorze segundos por nada.
    await p.goto(`http://127.0.0.1:${PORTA}/twitch.html`, { waitUntil: 'domcontentloaded' });
    // Com uma noite aberta, que é quando as regras da mesa disparam. Aqui
    // basta destapar o palco: carregar uma noite a sério pedia a API da
    // Twitch, e o que se mede é o CSS e não o carregamento.
    await p.evaluate(() => document.getElementById('palco').removeAttribute('hidden'));
    await p.waitForTimeout(120);
    const medida = await p.evaluate(() => ({
      mesa: document.body.classList.contains('mesa'),
      corpoPreso: getComputedStyle(document.body).overflowY === 'hidden',
      alturaPresa: getComputedStyle(document.body).height === `${window.innerHeight}px`,
      // E o texto tem acentos a sério: sem <meta charset> saía "Â·".
      rodape: document.querySelector('footer')?.textContent || '',
    }));
    assert.equal(medida.mesa, false, 'a página da Twitch não é a mesa de montagem');
    assert.equal(medida.corpoPreso, false, 'a página da Twitch ficou sem poder rolar');
    assert.ok(!/Â|Ã/.test(medida.rodape), `o rodapé saiu mal codificado: ${medida.rodape}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// O orçamento: a página não pode abanar depois de aparecer.
//
// Medido antes de existir esta regra: 0,049 num telemóvel, aos 12,5 s — o
// momento em que a Rajdhani chega da rede. A fonte nova é mais larga do que a
// de reserva, o `<h1>` cresce, o selector de idioma deixava de caber e caía
// para a linha de baixo, e tudo o que vinha a seguir descia 44 px de uma vez —
// com a página já a ser lida.
//
// `npm run velocidade` dá o quadro todo (LCP, TBT, bytes, quem salta). Isto
// aqui é só o portão: um número que não pode voltar a subir sem alguém dar por
// isso.
test('a página não salta depois de aparecer',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.addInitScript(`
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    `);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'load' });
    // As fontes chegam tarde, e é tarde que o salto acontecia. Sem esta espera
    // o teste media a página antes do momento que ele viu.
    await p.waitForTimeout(2500);
    const cls = await p.evaluate(() => window.__cls);
    assert.ok(cls < 0.02, `a página saltou ${cls.toFixed(3)} (o limite é 0,020)`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Destaca o botão Clipar. E bota na mesma linha os botões de marcar início e
//  marcar final. Fica estranho, uma linha de cima, uma linha de baixo."
//
// Os três estavam na mesma linha flex, com o mesmo peso, e num telemóvel isso
// parte onde couber: o Clipar ficava numa fila e os dois de marcar noutra, sem
// nada a dizer qual era o botão que termina a tarefa.
test('o Clipar destaca-se e os dois de marcar ficam lado a lado',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    const [inicio, fim] = await Promise.all([
      p.locator('#marcarIn').boundingBox(), p.locator('#marcarOut').boundingBox(),
    ]);
    assert.ok(Math.abs(inicio.y - fim.y) < 6,
      `marcar entrada em y=${inicio.y} e marcar saída em y=${fim.y}`);
    assert.ok(fim.x > inicio.x, 'o de saída fica à direita do de entrada');

    // Destacado quer dizer com a cor do acento, e não igual aos outros.
    const cores = await p.evaluate(() => {
      const cor = (id) => getComputedStyle(document.getElementById(id)).backgroundColor;
      return { clipar: cor('clipar'), marcar: cor('marcarIn') };
    });
    assert.notEqual(cores.clipar, cores.marcar,
      'o Clipar tem de se distinguir dos outros dois');

    assert.deepEqual(erros, []);
    await p.close();
  });

// "Onde está a opção onde eu seleciono onde está a minha webcam, onde está a
//  minha tela? Os tamanhos, os quadrados. Porque esse botão não dá para
//  clicar."
//
// No iPhone dele o lado do 9:16 nunca aparecia: o editor esperava por
// `videoWidth`, e um `<video>` que nunca toca pode não carregar nada — no iOS
// o `preload` é uma sugestão e em poupança de energia é ignorado. Ficava um
// aviso a dizer para esperar e um botão apagado.
//
// Não era preciso esperar por byte nenhum: o manifesto HLS traz `RESOLUTION=`.
// Este teste finge exactamente o que ele viu — um vídeo sem metadados — e o
// editor tem de aparecer na mesma.
test('o editor do 9:16 aparece mesmo sem o vídeo ter carregado',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    // O iPhone dele, reproduzido: a prévia nunca ganha tamanho.
    await p.evaluate(() => {
      const v = document.getElementById('previaClipe');
      Object.defineProperty(v, 'videoWidth', { get: () => 0, configurable: true });
      Object.defineProperty(v, 'videoHeight', { get: () => 0, configurable: true });
    });

    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    const r = await p.evaluate(() => ({
      editor: !document.getElementById('ladoRetrato').hidden,
      caixas: document.querySelectorAll('.recorte').length,
      modos: document.querySelectorAll('.modoRetrato').length,
      largura: document.querySelector('.recorte')?.style.width || '',
    }));
    assert.equal(r.editor, true, 'o lado do 9:16 tinha de estar visível');
    assert.ok(r.caixas >= 1, `nenhum quadrado de enquadramento (${r.caixas})`);
    assert.equal(r.modos, 2, 'faltam os botões de um ou dois enquadramentos');
    // 1920x1080 do manifesto falso: um 9:16 dentro disso tem 1080*9/16 = 608
    // px de largura, ou seja 31,6% dos 1920. Se viesse de outro sítio o número
    // era outro — é isto que prova que o tamanho veio do manifesto.
    assert.match(r.largura, /^31\.[0-9]+%$/, `o quadrado ficou com ${r.largura}`);

    // Escolher dois enquadramentos — webcam em cima, jogo em baixo — também
    // não pode depender do vídeo.
    await p.click('#modoDois');
    assert.equal(await p.evaluate(() => document.querySelectorAll('.recorte').length), 2,
      'no modo de dois têm de aparecer dois quadrados');

    assert.deepEqual(erros, []);
    await p.close();
  });

// "Não tem um botão de play lá dentro para estar a ver o clipe pronto como
//  está." O ▶ toca só o pedaço escolhido: liga o som, pára a grelha por trás
// para não haver dois sons ao mesmo tempo, e volta atrás quando acaba.
test('o ▶ do clipe toca só o pedaço, e pára a grelha enquanto toca',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    const estadoDoBotao = () => p.evaluate(() => ({
      carregado: document.getElementById('verClipe').getAttribute('aria-pressed'),
      mudo: document.getElementById('previaClipe').muted,
      grelhaParada: document.getElementById('agora').classList.contains('parado'),
    }));

    // A grelha JA vem parada: abrir o clipe pára-a, a pedido dele — "quando
    // aperto em clip, pausa os players principais". O ▶ apanha-a assim.
    assert.deepEqual(await estadoDoBotao(),
      { carregado: 'false', mudo: true, grelhaParada: true });

    await p.click('#verClipe');
    const aVer = await estadoDoBotao();
    assert.equal(aVer.carregado, 'true', 'o botão tinha de ficar carregado');
    assert.equal(aVer.mudo, false, 'ver um clipe sem som não serve para nada');
    assert.equal(aVer.grelhaParada, true, 'a grelha tinha de parar para não haver dois sons');

    // Carregar outra vez pára, e deixa tudo como estava — que agora e a
    // grelha PARADA, porque foi assim que o clipe a encontrou.
    await p.click('#verClipe');
    assert.deepEqual(await estadoDoBotao(),
      { carregado: 'false', mudo: true, grelhaParada: true },
      'parar tinha de repor o som e o botão, e deixar a grelha como estava');

    assert.deepEqual(erros, []);
    await p.close();
  });

// Portões do redesenho: coisas que se medem, e não que se olham.
test('o caminho de três passos diz onde ele está, e sem scroll',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 390, height: 844 } });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    // Num telemóvel, os três passos e o botão que os começa cabem no primeiro
    // ecrã: se for preciso rolar para descobrir o que a página faz, falhou.
    const passos = await p.locator('#passos').boundingBox();
    const botao = await p.locator('#carregar').boundingBox();
    assert.ok(passos.y + passos.height < 844, 'os passos ficam abaixo da dobra');
    assert.ok(botao.y + botao.height < 844, 'o botão de começar fica abaixo da dobra');
    assert.equal(await p.locator('#passos li.aqui').getAttribute('data-passo'), '1');

    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 25000 });
    assert.equal(await p.locator('#passos li.aqui').getAttribute('data-passo'), '2');
    // E com a noite carregada, "Carregar" deixa de ser a acção principal.
    assert.equal(await p.locator('#carregar.principal').count(), 0);

    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
    assert.equal(await p.locator('#passos li.aqui').getAttribute('data-passo'), '3');
    assert.deepEqual(erros, []);
    await p.close();
  });

// O pior caso deste produto não é falhar: é acertar por engano. Um ângulo sem
// relógio fiável exporta um clipe desalinhado com ar de certo, e ninguém dá
// por nada até estar montado.
test('a confiança do alinhamento é dita, e diz o próximo passo',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\noutro');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 25000 });

    // Com PROGRAM-DATE-TIME nos dois, o relógio é exacto e diz isso.
    assert.ok(await p.locator('#confianca.exacto').isVisible());
    assert.match(await p.locator('#confianca').innerText(), /exacto/i);

    // Um ajuste à mão passa a constar: é informação que muda a confiança.
    await p.locator('.tile[data-slug="outro"] .ajuste button[data-passo="1"]').click();
    await p.waitForFunction(() => /ajustad/i.test(document.getElementById('confianca').textContent),
      null, { timeout: 5000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// Um atalho que ninguém sabe que existe é código morto.
test('os atalhos que já existem podem ser descobertos',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p);
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    assert.equal(await p.locator('#modalAjuda').isVisible(), false);
    await p.click('#ajuda');
    assert.equal(await p.locator('#modalAjuda').isVisible(), true);
    // As teclas listadas são as que o teclado responde mesmo.
    const listadas = await p.locator('#modalAjuda kbd').allInnerTexts();
    for (const k of ['I', 'O', 'M', 'C', 'J', 'L']) {
      assert.ok(listadas.some((x) => x.trim() === k), `${k} não está na lista`);
    }
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#modalAjuda').isVisible(), false);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Erro sem próximo passo é bug de interface." Nenhuma mensagem de erro pode
// ficar-se por dizer o que correu mal.
test('todas as mensagens de erro dizem o próximo passo', async () => {
  const { _TEXTOS } = await import('../site/idiomas.js');
  // As que descrevem uma causa dentro de uma frase maior não contam: são
  // fragmentos, e quem as usa acrescenta o resto.
  const fragmentos = new Set(['estado.canalNaoExiste', 'estado.semVods', 'estado.vodsIndisponiveis',
    'estado.rateLimit', 'estado.semRede', 'estado.nomeInvalido', 'estado.ilegivel',
    'estado.inesperado', 'alinhar.semSom', 'alinhar.naoOuvi', 'corte.buraco',
    'corte.foraDaNoite', 'corte.semSegmentos', 'tile.foraDoAr', 'tile.antes',
    'tile.depois', 'tile.semVideo', 'montagem.naoFilmava', 'montagem.semImagem',
    // Não são erros: um é o rodapé da página da Twitch (a palavra "erro"
    // aparece lá a dizer quanto vale a sincronia), o outro é um resumo.
    'tw.rodape', 'montagem.semVitima']);
  const curtas = [];
  for (const [chave, frase] of Object.entries(_TEXTOS.pt)) {
    if (!/erro|falh|não deu|nenhum|sem |não consegui|inválido|passa dos/i.test(frase)) continue;
    if (fragmentos.has(chave)) continue;
    // Um próximo passo é um verbo no imperativo: "tenta", "escolhe", "abre"…
    if (!/\b(tenta|escolhe|abre|usa|move|encurta|guarda|confere|escreve|verifica|alinha|marca|corre|espera|sincroniza|desliga|recarrega|carrega|toca|vai)\b/i.test(frase)) {
      curtas.push(chave);
    }
  }
  assert.deepEqual(curtas, [], 'estas mensagens dizem o problema e não o próximo clique');
});

// A etiqueta não pode afirmar o que ninguém mediu.
//
// Estava lá "Vítimas" em cima de uma fila com o nome de toda a gente — e
// dizer "Vítimas" por cima de seis nomes que não morreram é a página a
// afirmar uma coisa que não sabe. Sem ninguém marcado é uma PERGUNTA.
test('a lista pergunta quem morreu, e só diz "vítimas" quando há alguma',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });

    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    const etiqueta = () => p.locator('#listaMomentos .vitimas .nota').first().innerText();
    assert.match(await etiqueta(), /Quem morreu\?/i,
      'sem ninguém marcado, a etiqueta tem de ser uma pergunta');

    await p.locator('#listaMomentos .vit[data-canal="vitima1"]').click();
    assert.match(await etiqueta(), /^Vítimas$/i,
      'com alguém marcado, aí sim é uma afirmação');
    assert.equal(await p.locator('#listaMomentos .vitimas.ha').count(), 1);

    // E desmarcar volta atrás: a afirmação não pode ficar lá sem quem a
    // sustente.
    await p.locator('#listaMomentos .vit[data-canal="vitima1"]').click();
    assert.match(await etiqueta(), /Quem morreu\?/i);
    assert.deepEqual(erros, []);
    await p.close();
  });

// O site só pode depender de si próprio.
//
// O `hls.js` vinha do cdnjs. Um <script> de outro domínio é uma dependência
// que ninguém aqui controla: com o cdnjs em baixo, ou bloqueado na rede de
// quem abre isto, a página carregava INTEIRA e nenhum vídeo tocava — sem uma
// mensagem que explicasse porquê. Agora é nosso, e este teste é o que impede
// que outro volte a entrar sem se dar por isso.
test('nada é pedido a outro domínio: o hls.js é nosso',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p);
    // O duplo sai da frente: este e o unico teste que quer o ficheiro a serio.
    await p.unroute('**/hls-*.js');
    const foraDeCasa = [];
    p.on('request', (r) => {
      const u = new URL(r.url());
      if (u.hostname !== '127.0.0.1' && r.resourceType() === 'script') foraDeCasa.push(r.url());
    });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });

    assert.deepEqual(foraDeCasa, [], 'nenhum script pode vir de fora');
    // E o que ele substituiu tem mesmo de funcionar — um ficheiro guardado
    // que não carrega é pior do que o CDN.
    assert.equal(await p.evaluate(() => window.Hls?.version), '1.5.17');
    assert.equal(await p.evaluate(() => window.Hls?.isSupported?.()), true);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Quando aperto em clip, pausa os players principais, ou o player se for 1 só."
//
// Não parava: os vídeos ficavam a andar por trás da janela, e quando ele
// voltava o instante já não era o que tinha escolhido — além de se ouvirem
// dois sons ao mesmo tempo. E fechar tem de devolver as coisas como estavam.
test('abrir o clipe pára os vídeos, e fechar devolve-os como estavam',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    const parados = () => p.evaluate(() => [...document.querySelectorAll('.tile video')]
      .filter((v) => v.paused).length);
    const quantos = await p.locator('.tile video').count();
    assert.ok(quantos > 0, 'tem de haver vídeo');

    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    await p.waitForFunction((n) => [...document.querySelectorAll('.tile video')]
      .filter((v) => v.paused).length === n, quantos, { timeout: 5000 });

    await p.click('#fecharClipe');
    await p.waitForFunction(() => document.getElementById('modalClipe').hidden,
      null, { timeout: 10000 });
    await p.waitForFunction(() => [...document.querySelectorAll('.tile video')]
      .some((v) => !v.paused), null, { timeout: 5000 });

    assert.deepEqual(erros, []);
    await p.close();
  });

// O botão que ele carrega mais vezes não pode estar abaixo da dobra.
test('o Clipar fica junto aos ângulos em foco, e é o maior botão do palco',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1280, height: 800 } });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    const c = await p.locator('#clipar').boundingBox();
    const foco = await p.locator('#palcoFoco').boundingBox();
    assert.ok(c && c.height >= 44, `o Clipar tem ${c?.height}px de alto`);
    // Colado ao vídeo: no máximo uma altura de botão abaixo dele.
    assert.ok(c.y > foco.y && c.y - (foco.y + foco.height) < 80,
      `o Clipar está a ${Math.round(c.y - (foco.y + foco.height))}px do vídeo`);
    // E é mesmo o maior: nenhum outro botão do palco tem mais área.
    const maior = await p.evaluate(() => {
      let m = 0;
      for (const b of document.querySelectorAll('#palco button')) {
        const r = b.getBoundingClientRect();
        if (b.id !== 'clipar' && r.width * r.height > m) m = r.width * r.height;
      }
      return m;
    });
    assert.ok(c.width * c.height > maior,
      `o Clipar tem ${Math.round(c.width * c.height)}px² e há outro com ${Math.round(maior)}px²`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Quando marco a kill não consigo ajeitar os tamanhos depois de marcado —
//  tipo o botão clip, para escolher o formato que eu quero e como quero."
//
// A lista de kills só sabia exportar com as margens fixas. Quem quisesse
// apurar as pontas ou escolher 9:16 tinha de ir à linha do tempo procurar o
// instante outra vez à mão.
test('cada kill marcada abre o mesmo editor de clipe, no instante dela',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });

    // Marcar uma kill num sítio, e depois AFASTAR o relógio dela.
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
    const daKill = await p.evaluate(() =>
      Number(document.querySelector('#listaMomentos li[data-ms]').dataset.ms));
    await p.click('#mais1m');
    await p.click('#mais1m');

    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });

    // O clipe tem de abrir NA KILL, e não onde o relógio ficou.
    const { de, ate } = await p.evaluate(() => ({
      de: window.__estado?.clipe?.deMs, ate: window.__estado?.clipe?.ateMs,
    }));
    if (de != null) {
      assert.ok(de <= daKill && ate >= daKill,
        `a kill está em ${daKill} e o clipe vai de ${de} a ${ate}`);
    }
    // E é o editor inteiro: o 9:16 está lá para ele escolher.
    assert.equal(await p.locator('#exportarRetrato, #guardarRetrato').first().isVisible(), true,
      'o editor tem de trazer o 9:16, que é o formato que ele quer escolher');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Quando eu clico em ajeitar e ajeito, quero um botão pra salvar alteração;
//  aí vou fazendo em tudo e depois baixo tudo junto."
test('ajeitar uma kill, guardar, e a kill lembra-se — sem exportar nada',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#mais1m');
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

    // O Clipar solto nao tem onde guardar: o botao nao aparece.
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    assert.equal(await p.locator('#guardarAjustes').isVisible(), false,
      'sem kill de origem nao ha "Guardar ajustes"');
    await p.click('#fecharClipe');
    await p.waitForFunction(() => document.getElementById('modalClipe').hidden, null, { timeout: 5000 });

    // Da lista, sim.
    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    assert.equal(await p.locator('#guardarAjustes').isVisible(), true);
    await p.click('#inicioMenos');
    await p.click('#inicioMenos');
    const apurado = await p.locator('#tempoClipe').innerText();
    const ficheirosAntes = await p.locator('#fila li').count();
    await p.click('#guardarAjustes');
    await p.waitForFunction(() => document.getElementById('modalClipe').hidden, null, { timeout: 5000 });

    assert.equal(await p.locator('#listaMomentos .ajustado').count(), 1, 'a kill diz que esta ajustada');
    assert.match(await p.locator('#estadoMontagem').innerText(), /guardados/i);
    assert.equal(await p.locator('#fila li').count(), ficheirosAntes, 'guardar nao exporta nada');

    // Abrir outra vez traz o que ele apurou, e nao a janela de origem.
    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    assert.equal(await p.locator('#tempoClipe').innerText(), apurado,
      'o editor tinha de abrir exactamente onde ele guardou');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Adiciona botão de 3 segundos pra trás e 3 pra frente, e 5 minutos pra trás
//  e 5 minutos pra frente."
test('os saltos de 3 s e de 5 min andam o que dizem',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    // Sair do principio, senao recuar nao tem para onde ir.
    await p.click('#mais5m');
    await p.click('#mais5m');
    const seg = async () => {
      const [h, m, s] = (await p.locator('#agora').innerText()).replace(/Z.*$/, '').split(':').map(Number);
      return h * 3600 + m * 60 + s;
    };
    const t0 = await seg();
    await p.click('#mais3s');
    assert.equal(await seg() - t0, 3, '3 s para a frente');
    await p.click('#menos3s');
    assert.equal(await seg() - t0, 0, '3 s para tras');
    await p.click('#menos5m');
    assert.equal(await seg() - t0, -300, '5 min para tras');
    await p.click('#mais5m');
    assert.equal(await seg() - t0, 0, '5 min para a frente');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Quando adiciono streamer novo à tabela quero só incluir ele em tudo, não
//  ter que recarregar tudo."
//
// Cada Carregar refazia TODOS os pedidos à Kick e punha o relógio e o foco
// onde lhe apetecia. Juntar um canal tem de ser juntar: só o novo vai à rede,
// e o instante, o foco e as kills ficam onde estavam.
test('juntar um streamer so vai buscar esse, e nao mexe onde ele estava',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    const pedidos = await kickFalsa(p, { canais: ['tchubi', 'vitima1'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#mais5m');
    await p.click('#mais1m');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });
    const antes = {
      agora: await p.locator('#agora').innerText(),
      api: pedidos.api,
      playlist: pedidos.playlist,
      kills: await p.locator('#listaMomentos li[data-ms]').count(),
    };
    assert.equal(antes.api, 1, 'um canal, um pedido');

    await p.fill('#canais', 'tchubi\nvitima1');
    await p.click('#carregar');
    await p.waitForFunction(() => document.querySelectorAll('.tile').length === 2, null, { timeout: 20000 });

    assert.equal(pedidos.api, antes.api + 1, 'so o canal novo foi a Kick');
    assert.equal(pedidos.playlist, antes.playlist + 1, 'so a playlist do novo foi lida');
    assert.equal(await p.locator('#agora').innerText(), antes.agora, 'o relogio ficou onde estava');
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), antes.kills, 'a kill ficou');
    assert.equal(await p.locator('.tile.foco').first().getAttribute('data-slug'), 'tchubi',
      'e o foco continua no canal em que ele estava');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Quando volto quero voltar de onde eu parei, não ter que procurar de novo
//  onde eu tava."
test('fechar e voltar traz o mesmo instante, sem ir a Kick outra vez, e no mesmo sitio da pagina',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    // Um ecrã BAIXO de propósito: num PC com altura a página é a área de
    // trabalho e não rola — o sítio a repor é o de quem rola, que é o
    // telemóvel e uma janela pequena.
    const { p, erros } = await abrir({ ecra: { width: 1280, height: 600 } });
    const pedidos = await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.click('#mais5m');
    await p.click('#mais10s');
    const agora = await p.locator('#agora').innerText();
    await p.evaluate(() => window.scrollTo({ top: 350 }));
    await p.waitForTimeout(600);                  // o guardar tem 400 ms de calma
    const apiAntes = pedidos.api;

    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tile', { timeout: 20000 });
    await p.waitForFunction((a) => document.getElementById('agora').textContent === a, agora, { timeout: 10000 });
    assert.equal(pedidos.api, apiAntes, 'a lista de VOD veio da memoria, nao da Kick');
    await p.waitForFunction(() => Math.abs(window.scrollY - 350) < 40, null, { timeout: 5000 });
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Quero que minha tela cheia vire minha área de trabalho: tudo o que a pessoa
//  precise clicar e opções tem que aparecer na tela sem ela precisar rolar."
//
// Medido, e não olhado: num PC, com dezassete ângulos e uma kill marcada, a
// PÁGINA não rola — rolam os painéis — e cada botão que ele carrega durante a
// noite está dentro do ecrã. Em dois tamanhos de ecrã, porque um portátil de
// 720 px de alto é onde isto costuma partir.
for (const ecra of [{ width: 1920, height: 1080 }, { width: 1366, height: 720 }]) {
  test(`num PC de ${ecra.width}x${ecra.height} a pagina nao rola e tudo o que se carrega esta a vista`,
    { skip: !podeCorrer && 'sem navegador' }, async () => {
      const { p, erros } = await abrir({ ecra });
      const canais = Array.from({ length: 17 }, (_, i) => `canal${String(i + 1).padStart(2, '0')}`);
      await kickFalsa(p, { canais });
      await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
      await p.fill('#canais', canais.join('\n'));
      await p.click('#carregar');
      await p.waitForFunction((n) => document.querySelectorAll('.tile').length === n, canais.length,
        { timeout: 40000 });
      await p.click('#mais5m');
      await p.click('#marcarKill');
      await p.waitForSelector('#listaMomentos li[data-ms]', { timeout: 10000 });

      const medida = await p.evaluate(() => {
        const dentro = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
            && r.left >= 0 && r.right <= window.innerWidth;
        };
        const ids = ['clipar', 'barra', 'marcarKill', 'baixarMontagem', 'procurarKills', 'mais3s', 'menos5m'];
        const fora = ids.filter((id) => !dentro(document.getElementById(id)));
        if (!dentro(document.querySelector('.tile.foco'))) fora.push('.tile.foco');
        // Da primeira kill chega ver a CABEÇA — a hora e os botões dela; os
        // nomes das vítimas embrulham por baixo e rolam com a lista.
        const kill = document.querySelector('#listaMomentos li[data-ms]').getBoundingClientRect();
        if (!(kill.top >= 0 && kill.top + 40 <= window.innerHeight)) fora.push('primeira kill');
        const grade = document.getElementById('grade');
        return {
          fora,
          paginaRola: document.documentElement.scrollHeight > window.innerHeight + 1,
          bodyRola: getComputedStyle(document.body).overflowY,
          gradeRola: getComputedStyle(grade).overflowY === 'auto' && grade.scrollHeight > grade.clientHeight,
          quadrados: document.querySelectorAll('#grade .tile').length,
        };
      });
      assert.equal(medida.paginaRola, false, `a pagina rola (${ecra.width}x${ecra.height})`);
      assert.deepEqual(medida.fora, [], `fora do ecra: ${medida.fora.join(', ')}`);
      assert.ok(medida.gradeRola, 'com 16 angulos na grelha, e a GRELHA que rola, por dentro');
      assert.deepEqual(erros, []);
      await p.close();
    });
}

// "Adiciona um lugar de pesquisa pra pesquisar as miniaturas de vídeo em
//  baixo."
//
// Com dezassete quadrados de 150 px, achar um pelo nome é passar os olhos por
// todos; com trinta é desistir. A caixa ESCONDE e não tira: um <video>
// arrancado do DOM pára e volta a carregar, e limpar a caixa devolvia trinta
// quadrados a descarregar tudo outra vez.
test('a procura da grelha esconde os outros ângulos sem os desligar',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const canais = ['tchubi', 'kodd', 'krakenpez', 'lautaarg00'];
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', canais.join('\n'));
    await p.click('#carregar');
    await p.waitForFunction((n) => document.querySelectorAll('.tile').length === n,
      canais.length, { timeout: 20000 });

    const vistos = () => p.evaluate(() => [...document.querySelectorAll('#grade .tile')]
      .filter((t) => t.offsetParent !== null).map((t) => t.dataset.slug));
    assert.equal((await vistos()).length, 3, 'a grelha devia ter os três que não estão em foco');

    await p.fill('#filtrarGrelha', 'kra');
    assert.deepEqual(await vistos(), ['krakenpez'], 'só o que combina fica à vista');
    // Os outros continuam no DOM, com o leitor vivo: não foram removidos.
    assert.equal(await p.locator('#grade .tile').count(), 3, 'os quadrados foram TIRADOS em vez de escondidos');
    assert.equal(await p.locator('#grade .tile video').count(), 3, 'algum leitor foi ao chão');

    // Um nome que não existe diz-o, em vez de deixar a grelha vazia e muda.
    await p.fill('#filtrarGrelha', 'zzzz');
    assert.deepEqual(await vistos(), []);
    assert.match(await p.locator('#quantosNaGrelha').innerText(), /\S/, 'a grelha ficou vazia sem dizer porquê');

    // E limpar devolve tudo.
    await p.fill('#filtrarGrelha', '');
    assert.equal((await vistos()).length, 3);
    assert.equal(await p.locator('#quantosNaGrelha').innerText(), '',
      'sem filtro não há contador: ao lado já há um "de quantos" que quer dizer outra coisa');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "O botão de clipar coloca exatamente em baixo do player principal, e quando
//  tem dois players rodando ele fica no meio dos 2, em baixo."
test('o Clipar fica no meio do que está em foco, com um ou com dois',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await kickFalsa(p, { canais: ['tchubi', 'kodd'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nkodd');
    await p.click('#carregar');
    await p.waitForSelector('.tile.foco', { timeout: 20000 });

    const meio = async (sel) => {
      const b = await p.locator(sel).boundingBox();
      return b.x + b.width / 2;
    };
    const desvio = async () => Math.abs(await meio('#clipar') - await meio('#palcoFoco'));
    assert.ok(await desvio() < 4, `com um player, o Clipar está ${await desvio()} px fora do meio`);

    // E com dois lado a lado, o meio dos dois — que é o meio do palco.
    await p.locator('#grade .tile').first().locator('.par').click();
    await p.waitForFunction(() => document.querySelectorAll('#palcoFoco .tile').length === 2,
      null, { timeout: 10000 });
    assert.ok(await desvio() < 4, `com dois players, o Clipar está ${await desvio()} px fora do meio`);
    assert.deepEqual(erros, []);
    await p.close();
  });

// O zoom no browser: escolher dez minutos tem de encolher MESMO o que a linha
// do tempo mostra — a régua, as faixas e a barra — e não só mudar um número.
test('escolher quanto tempo a linha mostra encolhe a régua e as faixas',
  { skip: !podeCorrer && 'sem navegador' }, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'kodd'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nkodd');
    await p.click('#carregar');
    await p.waitForSelector('#regua .hora', { timeout: 20000 });

    // O intervalo que a régua cobre, lido das próprias etiquetas.
    const minutosNaRegua = async () => {
      const horas = await p.locator('#regua .hora').allInnerTexts();
      const emMin = horas.filter((h) => h.includes(':'))
        .map((h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; });
      return Math.max(...emMin) - Math.min(...emMin);
    };
    const noiteToda = await minutosNaRegua();

    // Ao meio da noite, para o zoom não bater nas pontas.
    await p.click('#mais5m');
    // Dois minutos: a noite de teste tem dez, e um zoom maior do que a noite
    // é a noite — não testava nada.
    await p.selectOption('#zoomTempo', '120');
    await p.waitForTimeout(250);
    const doisMinutos = await minutosNaRegua();
    assert.ok(doisMinutos < noiteToda,
      `a régua não encolheu: ${noiteToda} min antes, ${doisMinutos} depois`);
    assert.ok(doisMinutos <= 3, `dois minutos de zoom mostram ${doisMinutos} min de régua`);

    // As faixas seguem a mesma vista: uma gravação que ocupava um pedaço da
    // noite passa a ocupar a faixa toda quando a vista cabe dentro dela.
    const largura = () => p.evaluate(() => {
      const i = document.querySelector('#faixas .faixa .trilho i');
      const t = i.parentElement.getBoundingClientRect();
      return i.getBoundingClientRect().width / t.width;
    });
    assert.ok(await largura() > 0.9, `a faixa devia encher a vista: ${await largura()}`);

    // E voltar a "a noite toda" devolve o que era.
    await p.selectOption('#zoomTempo', '0');
    await p.waitForTimeout(250);
    assert.equal(await minutosNaRegua(), noiteToda, 'voltar atrás não devolveu a noite inteira');
    assert.deepEqual(erros, []);
    await p.close();
  });
