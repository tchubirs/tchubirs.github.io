// Exportar: a montagem, o corte de cada canal e o editor do clipe, num browser a sério.
//
// Cada teste aqui é a prova de um defeito que esteve na página: um botão que não se podia parar,
// um editor que fechava o da kill seguinte, um 9:16 que se ligava sozinho. A Kick é a de
// test/falsa.mjs; o que precisa de ser lento ou de falhar é trocado por cima dela com `p.route`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function carregar(p, canais, opcoes = {}) {
  const pedidos = await kickFalsa(p, { canais, ...opcoes });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
  return pedidos;
}

async function marcarKills(p, n, { saltar = true } = {}) {
  for (let i = 0; i < n; i++) {
    if (saltar) await p.click('#mais1m');
    await p.click('#marcarKill');
  }
  await p.waitForFunction((k) => document.querySelectorAll('#listaMomentos li[data-ms]').length === k,
    n, { timeout: 10000 });
}

async function abrirKill(p, i = 0) {
  await p.locator('#listaMomentos .cliparUma').nth(i).click();
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
  // O editor do 9:16 abre com o tamanho do manifesto: é preciso para os recortes existirem.
  await p.waitForFunction(() => window.__estado.clipe?.rects.length > 0, null, { timeout: 10000 });
}

const fechado = (p) => p.waitForFunction(() => document.getElementById('modalClipe').hidden,
  null, { timeout: 10000 });

/** Pedaços de 1080p60 que demoram a chegar, para haver tempo de parar a meio. */
async function pedacosLentos(p, ms) {
  await p.route('**/1080p60/*.ts', async (rota) => {
    await new Promise((k) => setTimeout(k, ms));
    try {
      await rota.fulfill({ status: 200, contentType: 'video/mp2t', body: Buffer.alloc(4096, 7) });
    } catch { /* a página já desistiu do pedido */ }
  });
}

// "Guardar ajustes always saves the kill as 9:16": o editor do retrato abre sempre com um
// enquadramento de partida, e era isso que o Salvar lia. E o editor abria com outro pedaço que
// não o da montagem, por isso salvar sem mexer em nada mudava o clipe exportado.
test('o editor abre no pedaço da montagem, e Salvar ajustes só leva o 9:16 se ele mexeu nele',
  semNavegador, async () => {
    const { p, erros } = await abrir();
    await carregar(p, ['tchubi', 'vitima1']);
    await marcarKills(p, 1);
    const ms = await p.evaluate(() => window.__estado.momentos[0].ms);

    await abrirKill(p);
    const janela = await p.evaluate(() => ({ de: window.__estado.clipe.deMs, ate: window.__estado.clipe.ateMs }));
    assert.deepEqual(janela, { de: ms - 5000, ate: ms + 2000 },
      'o editor tem de abrir no pedaço que a montagem exporta: 5 s antes e 2 s depois');

    // Só aparar o início. Nada no 9:16.
    await p.click('#inicioMenos');
    await p.click('#guardarAjustes');
    await fechado(p);
    let aj = await p.evaluate(() => window.__estado.momentos[0].ajuste);
    assert.equal(aj.formato, null, 'ele não tocou no 9:16, e a montagem ia gravá-lo em tempo real');
    assert.deepEqual([aj.deMs, aj.ateMs], [ms - 5500, ms + 2000]);
    assert.doesNotMatch(await p.locator('#listaMomentos .ajustado').innerText(), /9:16/);

    // Agora sim, mexer no enquadramento, e pelo teclado.
    await abrirKill(p);
    const x0 = await p.evaluate(() => window.__estado.clipe.rects[0].x);
    await p.focus('#recortes .recorte');
    await p.keyboard.press('ArrowLeft');
    const x1 = await p.evaluate(() => window.__estado.clipe.rects[0].x);
    assert.ok(x1 < x0, `a seta não moveu o recorte (${x0} -> ${x1})`);
    await p.keyboard.press('ArrowLeft');
    const x2 = await p.evaluate(() => window.__estado.clipe.rects[0].x);
    assert.ok(x2 < x1, 'o foco tem de ficar na caixa depois de ela ser redesenhada');
    await p.click('#guardarAjustes');
    await fechado(p);
    aj = await p.evaluate(() => window.__estado.momentos[0].ajuste);
    assert.equal(aj.formato, 'um');
    assert.match(await p.locator('#listaMomentos .ajustado').innerText(), /9:16/);
    assert.deepEqual(erros, []);
    await p.close();
  });

const MASTER_720 = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,FRAME-RATE=30.000',
  '160p30/playlist.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720,FRAME-RATE=60.000',
  '720p60/playlist.m3u8',
].join('\n');

// Trocar de ângulo no editor: o pedaço ficava ao contrário num ângulo que ainda não estava no
// ar, os recortes ficavam em pixels da fonte anterior, e o Salvar deitava o ângulo fora.
test('trocar de ângulo no editor: o pedaço nunca fica ao contrário, os recortes seguem a fonte, e o ajuste é desse ângulo',
  semNavegador, async () => {
    const { p, erros } = await abrir();
    // 'tarde' só entra no ar 400 s depois dos outros, e a 720p.
    await kickFalsa(p, { canais: ['tchubi', 'vitima1', 'tarde'], desviosS: { tarde: 400 } });
    await p.route('https://stream.kick.com/falsa/tarde/**/master.m3u8',
      (rota) => rota.fulfill({ status: 200, body: MASTER_720 }));
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi\nvitima1\ntarde');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    // A página abre onde estão todos no ar; recuar cinco minutos põe a kill antes de 'tarde'.
    await p.click('#menos5m');
    await marcarKills(p, 1, { saltar: false });
    await p.locator('#listaMomentos li[data-ms]').first().locator('.vit[data-canal="vitima1"]').click();

    await abrirKill(p);
    // O recorte encostado à direita de uma fonte de 1920.
    await p.evaluate(() => {
      const r = window.__estado.clipe.rects[0];
      r.x = 1920 - r.largura - 1;
    });
    const largura1080 = await p.evaluate(() => window.__estado.clipe.rects[0].largura);

    await p.selectOption('#canalClipe', 'tarde');
    const c = await p.evaluate(() => {
      const k = window.__estado.clipe;
      return { de: k.deMs, ate: k.ateMs, limites: k.limites, r: { ...k.rects[0] } };
    });
    assert.ok(c.ate > c.de, `o pedaço ficou ao contrário: ${c.de} -> ${c.ate}`);
    assert.ok(c.de >= c.limites.inicio && c.ate <= c.limites.fim, 'e dentro do vídeo de quem se escolheu');
    assert.ok(c.r.x + c.r.largura <= 1280 + 0.5, `o recorte ficou fora de uma fonte de 1280: ${JSON.stringify(c.r)}`);
    assert.ok(Math.abs(c.r.largura - (largura1080 * 1280) / 1920) < 1, 'e encolheu com a fonte');

    // 'tarde' não entra nesta kill: guardar ali era perder o trabalho em silêncio.
    await p.click('#guardarAjustes');
    assert.match(await p.locator('#estadoClipe').innerText(), /não entra nesta kill/);
    assert.equal(await p.evaluate(() => document.getElementById('modalClipe').hidden), false);

    // Na POV de quem morreu, sim: o ajuste fica com esse ângulo.
    await p.selectOption('#canalClipe', 'vitima1');
    await p.click('#inicioMenos');
    await p.click('#guardarAjustes');
    await fechado(p);
    assert.equal(await p.evaluate(() => window.__estado.momentos[0].ajuste.canal), 'vitima1');
    // E abre outra vez nele, que é onde os recortes foram medidos.
    await abrirKill(p);
    assert.equal(await p.locator('#canalClipe').inputValue(), 'vitima1');
    assert.deepEqual(erros, []);
    await p.close();
  });

/** Uma prévia que decodifica de verdade, como em pagina2 ("o exportar do retrato nunca fica calado"). */
// `ms` é quanto vídeo há. Tem de passar do tempo que o teste leva a olhar para o editor
// trancado: quando o vídeo acaba, a gravação acaba com ele e o editor destranca-se.
async function previaDeVerdade(p, ms = 1200) {
  await p.evaluate(async (duracao) => {
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
    await new Promise((k) => setTimeout(k, duracao));
    await new Promise((k) => { g.onstop = k; g.stop(); });
    clearInterval(t);
    const v = document.getElementById('previaClipe');
    v.src = URL.createObjectURL(new Blob(ps, { type: 'video/webm' }));
    await new Promise((k) => { v.onloadedmetadata = k; });
  }, ms);
  await p.waitForFunction(() => !document.getElementById('guardarRetrato').disabled, null, { timeout: 10000 });
}

// O 9:16 grava em tempo real do mesmo <video> que o editor mexe. Os ±0,5 s, o ▶, as pegas, o
// ângulo e os recortes estragavam o ficheiro a meio; fechar deixava-o a gravar. E um 16:9
// cancelado acabava mais tarde e fechava o editor da kill seguinte.
test('o 9:16 a gravar tranca o editor; fechar pára-o, e um 16:9 cancelado não fecha o editor seguinte',
  semNavegador, async () => {
    const { p, erros } = await abrir();
    await carregar(p, ['tchubi']);
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    await previaDeVerdade(p, 5000);

    await p.click('#guardarRetrato');
    // Tudo lido no mesmo instante em que a gravação arranca, na página: com a máquina
    // carregada (a bateria inteira a correr) o vídeo de teste pode acabar em poucos segundos,
    // e a gravação acaba com ele e destranca o editor, como deve.
    const visto = await (await p.waitForFunction(() => {
      const c = window.__estado.clipe;
      if (c?.aGravar !== true) return null;
      const vivos = ['inicioMenos', 'fimMais', 'verClipe', 'canalClipe', 'guardarClipe', 'modoDois']
        .filter((i) => !document.getElementById(i).disabled);
      const x0 = c.rects[0].x;
      const caixa = document.querySelector('#recortes .recorte');
      caixa.focus();
      caixa.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      return { vivos, mexeu: c.rects[0].x !== x0 };
    }, null, { timeout: 20000, polling: 10 })).jsonValue();
    assert.deepEqual(visto.vivos, [], 'estes ficaram vivos durante a gravação');
    assert.equal(visto.mexeu, false, 'o recorte mexeu-se por baixo da gravação');

    // Esc fecha, e fechar pára a gravação: nenhum ficheiro, nenhum erro num modal escondido.
    await p.keyboard.press('Escape');
    await fechado(p);
    await p.waitForTimeout(1500);
    assert.equal(await p.locator('#fila li').count(), 0, 'a gravação continuou depois de fechar');

    // Um 16:9 lento, cancelado, e outro editor aberto logo a seguir.
    await pedacosLentos(p, 3000);
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    await p.click('#guardarClipe');
    await p.click('#cancelarClipe');
    await fechado(p);
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    await p.waitForTimeout(4500);
    assert.equal(await p.evaluate(() => document.getElementById('modalClipe').hidden), false,
      'o 16:9 cancelado acabou e fechou o editor que estava aberto');
    assert.equal(await p.locator('#fila li').count(), 0, 'e não guarda o ficheiro que ele cancelou');
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Downloads, montage and auto-scan can never be cancelled", "any list repaint re-enables
// Exportar montagem", e "N/N exportados counts attempts".
test('a montagem tem Parar, não arranca duas vezes, e conta só o que saiu', semNavegador, async () => {
  const { p, erros } = await abrir();
  await carregar(p, ['tchubi', 'vitima1']);
  await marcarKills(p, 3);
  const rotulo = () => p.locator('#baixarMontagem span').innerText();

  await pedacosLentos(p, 1500);
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => document.querySelector('#baixarMontagem span').textContent === 'Parar',
    null, { timeout: 5000 });
  assert.equal(await p.locator('#baixarMontagem').isDisabled(), false, 'o Parar tem de se poder carregar');
  assert.equal(await p.locator('#listaMomentos .baixarUma:not([disabled])').count(), 0,
    'nenhuma kill sozinha pode arrancar por cima da montagem');
  // Um redesenho a meio (marcar quem morreu) não pode voltar a acender o Exportar.
  await p.locator('#listaMomentos li[data-ms]').first().locator('.vit[data-canal="vitima1"]').click();
  assert.equal(await rotulo(), 'Parar');

  await p.click('#baixarMontagem');
  await p.waitForFunction(() => /parada/.test(document.getElementById('estadoMontagem').textContent),
    null, { timeout: 15000 });
  assert.equal(await rotulo(), 'Exportar montagem');
  assert.ok(await p.locator('#fila a').count() < 4, 'parou antes do fim');
  assert.ok(await p.locator('#listaMomentos .baixarUma:not([disabled])').count() > 0);

  // A rede em baixo: nada sai, e o fim tem de o dizer.
  await p.unroute('**/1080p60/*.ts');
  await p.route('**/1080p60/*.ts', (rota) => rota.abort());
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => /exportados/.test(document.getElementById('estadoMontagem').textContent),
    null, { timeout: 90000 });
  const fim = await p.locator('#estadoMontagem').innerText();
  assert.match(fim, /^0\/4 exportados/, `contou tentativas como exportados: ${fim}`);
  assert.match(fim, /4 não saíram/);
  assert.deepEqual(erros, []);
  await p.close();
});

// "baixarUm has no try/catch" e "no length cap on the I/O cut path".
test('o corte de um canal tem tecto, e uma falha de rede não deixa o botão preso', semNavegador, async () => {
  const { p, erros } = await abrir();
  await carregar(p, ['tchubi']);
  await p.click('#marcarIn');
  await p.click('#mais10s');
  await p.click('#marcarOut');
  await p.waitForSelector('#corte:not([hidden])', { timeout: 10000 });
  const li = p.locator('#listaCorte li[data-slug]').first();
  const margens = async (antes, depois) => {
    await li.locator('.antes').fill(String(antes));
    await li.locator('.antes').dispatchEvent('input');
    await li.locator('.depois').fill(String(depois));
    await li.locator('.depois').dispatchEvent('input');
  };

  // Escrito à mão, o 9999 passava. E 10 s + 120 + 120 passa dos 180 s.
  await margens(9999, 9999);
  assert.equal(await p.evaluate(() => window.__estado.margens.tchubi.antesS), 120);
  assert.equal(await li.locator('.baixarUm').isDisabled(), true);
  assert.match(await li.locator('.estadoCorte').innerText(), /passa dos 180s/);
  await margens(0, 0);
  assert.equal(await li.locator('.baixarUm').isDisabled(), false);
  assert.equal(await li.locator('.estadoCorte').innerText(), '');

  // A lista de qualidades não chega: a rede caiu.
  await p.route('**/master.m3u8', (rota) => rota.abort());
  await li.locator('.baixarUm').click();
  await p.waitForSelector('#fila li', { timeout: 15000 });
  assert.match(await p.locator('#fila li').first().innerText(), /Confira a internet/);
  assert.equal(await li.locator('.baixarUm').isDisabled(), false, 'o botão ficou apagado depois da falha');
  assert.equal(await li.locator('.baixarUm').innerText(), 'Exportar');

  // E o mesmo botão pára um corte lento a meio.
  await p.unroute('**/master.m3u8');
  await pedacosLentos(p, 3000);
  await li.locator('.baixarUm').click();
  await p.waitForFunction(() => document.querySelector('#listaCorte .baixarUm').textContent === 'Parar',
    null, { timeout: 5000 });
  await li.locator('.baixarUm').click();
  await p.waitForFunction(() => /Parado/.test(document.querySelector('#listaCorte .estadoCorte').textContent),
    null, { timeout: 10000 });
  assert.equal(await p.locator('#fila li').count(), 1, 'parado não deixa ficheiro nenhum');
  assert.equal(await li.locator('.baixarUm').innerText(), 'Exportar');
  assert.deepEqual(erros, []);
  await p.close();
});

const MASTER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,FRAME-RATE=30.000',
  '160p30/playlist.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=9091454,RESOLUTION=1920x1080,FRAME-RATE=60.000',
  '1080p60/playlist.m3u8',
].join('\n');

const listaDePedacos = (inicio, quantos) => {
  const l = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:12', '#EXT-X-PLAYLIST-TYPE:EVENT'];
  for (let i = 0; i < quantos; i++) {
    l.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(inicio + i * 10000).toISOString()}`, '#EXTINF:10.000,', `${i}.ts`);
  }
  return l.join('\n');
};

// "Clip that crosses a stream reconnect is silently truncated and reported as success", e o
// 16:9 do editor que acrescenta até 10 s de cada lado sem o dizer.
test('um corte que atravessa uma reconexão diz quanto falta, e o 16:9 do editor diz onde começa e acaba',
  semNavegador, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi'], segmentos: 30 });
    // A live caiu aos 300 s e voltou logo: dois VODs que se tocam, na mesma noite.
    const quando = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
    await p.route('**/api/v2/channels/tchubi/videos', (rota) => rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, session_title: 'antes', start_time: quando(T), duration: 300000,
          source: 'https://stream.kick.com/falsa/tchubi/n0/master.m3u8', video: {} },
        { id: 2, session_title: 'depois', start_time: quando(T + 300000), duration: 300000,
          source: 'https://stream.kick.com/religou/tchubi/master.m3u8', video: {} },
      ]),
    }));
    await p.route('https://stream.kick.com/religou/**', (rota) => {
      const u = rota.request().url();
      if (u.endsWith('master.m3u8')) return rota.fulfill({ status: 200, body: MASTER });
      if (u.endsWith('playlist.m3u8')) return rota.fulfill({ status: 200, body: listaDePedacos(T + 300000, 30) });
      return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: Buffer.alloc(4096, 7) });
    });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 20000 });
    assert.equal(await p.evaluate(() => window.__estado.linhas[0].pecas.length), 2, 'a noite tem os dois VODs');

    // De 290 s a 310 s: dez segundos antes da reconexão e dez depois.
    await p.evaluate(({ T: t0 }) => { window.__estado.agoraMs = t0; }, { T });
    for (let i = 0; i < 4; i++) await p.click('#mais1m');
    for (let i = 0; i < 5; i++) await p.click('#mais10s');
    await p.click('#marcarIn');
    await p.click('#mais10s');
    await p.click('#mais10s');
    await p.click('#marcarOut');
    await p.waitForSelector('#corte:not([hidden])', { timeout: 10000 });
    await p.locator('#listaCorte .baixarUm').first().click();
    await p.waitForSelector('#fila a', { timeout: 20000 });
    const linha = p.locator('#fila li').first();
    assert.match(await linha.innerText(), /faltam 10\.0s no fim/, 'o ficheiro sai com metade e dizia que estava tudo');
    assert.equal(await linha.locator('.nota').evaluate((e) => e.classList.contains('mau')), true);

    // O 16:9 do editor: à volta do mesmo sítio, e a linha diz onde o ficheiro começa e acaba.
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    await p.click('#guardarClipe');
    await fechado(p);
    const doEditor = await p.locator('#fila li').first().innerText();
    assert.match(doEditor, /começa \d+\.\ds antes da sua marca/);
    assert.match(doEditor, /faltam \d+\.\ds no fim/);
    assert.deepEqual(erros, []);
    await p.close();
  });

// As pegas fora da barra, os ciclos de pintura do 9:16 a acumular, e os códigos internos e o
// 9:16 de um buraco, todos no mesmo editor.
test('no editor as pegas ficam na barra, os ciclos do 9:16 não se acumulam, e os erros dizem o que fazer',
  semNavegador, async () => {
    const { p, erros } = await abrir();
    await carregar(p, ['tchubi']);
    for (let i = 0; i < 3; i++) await p.click('#mais1m');
    await marcarKills(p, 1);
    // Um tiroteio de 170 s que acaba na kill.
    await p.evaluate(() => {
      const m = window.__estado.momentos[0];
      m.combateDeMs = m.ms - 170_000;
      m.combateAteMs = m.ms;
    });
    await abrirKill(p);
    const pos = await p.evaluate(() => ['de', 'ate'].map((k) => parseFloat(
      document.querySelector(`#barraClipe .pega.${k}`).style.left,
    )));
    for (const x of pos) assert.ok(x >= 0 && x <= 100, `uma pega ficou fora da barra: ${pos}`);
    await p.click('#fecharClipe');
    await fechado(p);

    // Abrir e fechar várias vezes, e o vídeo a dizer que carregou outra vez.
    for (let i = 0; i < 4; i++) {
      await p.click('#clipar');
      await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
      await p.click('#fecharClipe');
      await fechado(p);
    }
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
    const porFrame = await p.evaluate(async () => {
      const v = document.getElementById('previaClipe');
      v.dispatchEvent(new Event('loadedmetadata'));
      v.dispatchEvent(new Event('loadedmetadata'));
      v.dispatchEvent(new Event('loadeddata'));
      await new Promise((k) => setTimeout(k, 200));
      const ctx = document.getElementById('telaRetrato').getContext('2d');
      const original = ctx.fillRect;
      let pinturas = 0;
      ctx.fillRect = function contar(...a) { pinturas++; return original.apply(this, a); };
      let frames = 0;
      let vivo = true;
      const contar = () => { frames++; if (vivo) requestAnimationFrame(contar); };
      requestAnimationFrame(contar);
      await new Promise((k) => setTimeout(k, 1000));
      vivo = false;
      ctx.fillRect = original;
      return pinturas / Math.max(1, frames);
    });
    assert.ok(porFrame < 1.5, `${porFrame.toFixed(1)} pinturas do 9:16 por frame: os ciclos acumularam`);

    // Um pedaço ao contrário: o código interno não é uma mensagem.
    await p.evaluate(() => {
      const c = window.__estado.clipe;
      c.deMs = c.ateMs + 1000;
    });
    await p.click('#guardarClipe');
    await p.waitForFunction(() => /Abra o clipe/.test(document.getElementById('estadoClipe').textContent),
      null, { timeout: 5000 });
    assert.doesNotMatch(await p.locator('#estadoClipe').innerText(), /janela-invalida/);

    // O início num sítio em que ele não estava no ar: o 9:16 recusa, e diz porquê.
    await p.evaluate(() => {
      const c = window.__estado.clipe;
      const l = window.__estado.linhas[0];
      c.deMs = l.inicio - 30_000;
      c.ateMs = l.inicio + 5_000;
      const b = document.getElementById('guardarRetrato');
      b.disabled = false;
      b.click();
    });
    await p.waitForTimeout(500);
    assert.match(await p.locator('#estadoClipe').innerText(), /não estava no ar no início do clipe/);
    assert.equal(await p.evaluate(() => window.__estado.clipe.aGravar), undefined,
      'nem chegou a gravar');
    assert.deepEqual(erros, []);
    await p.close();
  });

// Sem MSE o vídeo vem directo da CDN, e sem crossOrigin a tela do 9:16 fica suja.
test('sem MSE a prévia pede o vídeo com crossOrigin', semNavegador, async () => {
  const { p, erros } = await abrir();
  await carregar(p, ['tchubi']);
  await p.evaluate(() => { window.Hls.isSupported = () => false; });
  await p.click('#clipar');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
  const v = await p.evaluate(() => {
    const e = document.getElementById('previaClipe');
    return { cors: e.crossOrigin, src: e.currentSrc || e.src };
  });
  assert.match(v.src, /stream\.kick\.com/);
  assert.equal(v.cors, 'anonymous');
  // A Kick falsa não manda cabeçalhos de CORS: o aviso do browser sobre isso não é deste teste.
  assert.deepEqual(erros.filter((e) => !/CORS|Access-Control|MEDIA_ERR|video/i.test(e)), []);
  await p.close();
});

// Refazer a grelha com um ângulo numa janela à parte deixava um leitor destruído no segundo
// monitor, contado como vivo.
//
// Este teste refazia a grelha trocando de língua. Trocar de língua deixou de refazer a grelha
// (destruía e voltava a pedir à Kick todos os leitores, quinhentos num evento), e por isso a
// janela à parte já não tem de fechar aí: o leitor dela continua vivo. A grelha refaz-se agora
// ao tirar um canal, e é aí que se vê o que o teste quer: a janela de um canal que saiu fecha.
test('refazer a grelha fecha a janela à parte, em vez de a deixar com um leitor morto',
  semNavegador, async () => {
    const { p, erros } = await abrir();
    await carregar(p, ['tchubi', 'outro']);
    await p.evaluate(() => {
      window.__fechadas = 0;
      window.__estado.aparte = {
        modo: 'documento',
        tile: document.querySelector('.tile[data-slug="outro"]'),
        fechar: () => { window.__fechadas++; },
      };
    });
    // Trocar de língua não refaz nada: a janela fica, e o quadro dela também.
    await p.selectOption('#idioma', 'en');
    await p.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
    assert.equal(await p.evaluate(() => window.__fechadas), 0, 'trocar de língua fechou a janela à parte');
    assert.ok(await p.evaluate(() => window.__estado.aparte?.tile?.isConnected));

    // Tirar o canal dela refaz a grelha sem ele: a janela fecha.
    await p.locator('#listaCanais li[data-slug="outro"] .tirar').click();
    await p.waitForFunction(() => !document.querySelector('#grade .tile[data-slug="outro"], #palcoFoco .tile[data-slug="outro"]')
      && document.querySelectorAll('.tile').length === 1, null, { timeout: 15000 });
    assert.equal(await p.evaluate(() => window.__fechadas), 1, 'a janela à parte ficou aberta');
    assert.equal(await p.evaluate(() => window.__estado.aparte), null);
    assert.deepEqual(erros, []);
    await p.close();
  });

// "Internal state codes shown to users": o 9:16 da montagem escrevia o `e.message`, uma frase
// interna em português ("sem gravador", "o vídeo não andou"), no meio do inglês e do espanhol.
test('o 9:16 da montagem que não sai diz o porquê na língua de quem usa', semNavegador, async () => {
  const { p, erros } = await abrir();
  await carregar(p, ['tchubi']);
  await marcarKills(p, 1);
  await p.evaluate(() => {
    const e = window.__estado;
    e.momentos = e.momentos.map((m) => ({
      ...m,
      ajuste: {
        deMs: m.ms - 5000, ateMs: m.ms + 2000, formato: 'um', rects: [{ x: 0, y: 0, largura: 608, altura: 1080 }],
      },
    }));
    // Um browser que não sabe gravar vídeo.
    window.MediaRecorder = undefined;
  });
  await p.selectOption('#idioma', 'en');
  await p.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => /exported/.test(document.getElementById('estadoMontagem').textContent),
    null, { timeout: 30000 });
  const linha = await p.locator('#fila li', { hasText: '9:16' }).innerText();
  assert.match(linha, /this browser cannot record video/);
  assert.doesNotMatch(linha, /sem gravador/);
  assert.match(await p.locator('#estadoMontagem').innerText(), /^1\/1 exported · 1 did not come out/);
  assert.deepEqual(erros, []);
  await p.close();
});

// "Downloads, montage and auto-scan can never be cancelled": a detecção automática ouve a noite
// inteira, minutos a fio, e a única saída era recarregar a página. O mesmo botão pára-a.
test('a detecção automática pára no mesmo botão que a lançou', semNavegador, async () => {
  const { p, erros } = await abrir();
  // Uma varredura que só acaba quando a mandam parar, como uma noite inteira a ouvir.
  await p.route('**/procurar-momentos.js', (r) => r.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `
      export function custoVarrerMB() { return 1; }
      export async function varrerNoite(o) {
        window.__aOuvir = true;
        await new Promise((ok, mal) => {
          const fim = setTimeout(ok, 60000);
          o.sinal.addEventListener('abort', () => {
            clearTimeout(fim);
            mal(new DOMException('cancelado', 'AbortError'));
          }, { once: true });
        });
        return { candidatos: [], estouros: [] };
      }`,
  }));
  await carregar(p, ['tchubi']);
  p.on('dialog', (d) => d.accept());
  await p.click('#procurarKills');
  await p.waitForFunction(() => window.__aOuvir === true, null, { timeout: 5000 });
  assert.equal(await p.locator('#procurarKills span').innerText(), 'Parar');
  assert.equal(await p.locator('#procurarKills').isDisabled(), false, 'o Parar tem de se poder carregar');

  await p.click('#procurarKills');
  await p.waitForFunction(() => window.__estado.varredura === null, null, { timeout: 5000 });
  assert.equal(await p.locator('#procurarKills span').innerText(), 'Detecção automática');
  assert.match(await p.locator('#estadoMontagem').innerText(), /cancelado/);
  assert.deepEqual(erros, []);
  await p.close();
});

// "Clip that crosses a stream reconnect is silently truncated": na montagem, que é o que se usa
// numa noite de evento, o resto vem do VOD seguinte num arquivo logo a seguir, com o mesmo número.
test('na montagem, um clipe que atravessa uma reconexão sai em duas partes seguidas', semNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'], segmentos: 30 });
  const quando = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  await p.route('**/api/v2/channels/tchubi/videos', (rota) => rota.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 1, session_title: 'antes', start_time: quando(T), duration: 300000,
        source: 'https://stream.kick.com/falsa/tchubi/n0/master.m3u8', video: {} },
      { id: 2, session_title: 'depois', start_time: quando(T + 300000), duration: 300000,
        source: 'https://stream.kick.com/religou/tchubi/master.m3u8', video: {} },
    ]),
  }));
  const pedidosDoSegundo = [];
  await p.route('https://stream.kick.com/religou/**', (rota) => {
    const u = rota.request().url();
    if (u.endsWith('master.m3u8')) return rota.fulfill({ status: 200, body: MASTER });
    if (u.endsWith('playlist.m3u8')) return rota.fulfill({ status: 200, body: listaDePedacos(T + 300000, 30) });
    pedidosDoSegundo.push(u);
    return rota.fulfill({ status: 200, contentType: 'video/mp2t', body: Buffer.alloc(4096, 7) });
  });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#canais', 'tchubi');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });

  // A kill 2 s depois da queda: o clipe (5 s antes, 2 s depois) fica com 3 s de um lado e 4 do outro.
  await p.evaluate(({ T: t0 }) => { window.__estado.agoraMs = t0 + 302_000; }, { T });
  await p.click('#marcarKill');
  await p.waitForFunction(() => document.querySelectorAll('#listaMomentos li[data-ms]').length === 1,
    null, { timeout: 10000 });
  await p.click('#baixarMontagem');
  await p.waitForFunction(() => /exportados/.test(document.getElementById('estadoMontagem').textContent),
    null, { timeout: 30000 });

  assert.match(await p.locator('#estadoMontagem').innerText(), /^2\/2 exportados/);
  const linhas = await p.locator('#fila li').allInnerTexts();
  assert.equal(linhas.length, 2, `uma parte só: ${linhas.join(' | ')}`);
  assert.match(linhas[0], /^01a_tchubi/);
  assert.match(linhas[0], /o resto vem no arquivo seguinte/);
  assert.match(linhas[1], /^01a_tchubi/);
  assert.match(linhas[1], /continuação do arquivo anterior/);
  assert.ok(pedidosDoSegundo.length > 0, 'o resto tem de vir do VOD de depois da queda');
  assert.equal(await p.locator('#fila .nota.mau').count(), 0, 'nada falta: as duas partes cobrem o clipe');
  assert.deepEqual(erros, []);
  await p.close();
});
