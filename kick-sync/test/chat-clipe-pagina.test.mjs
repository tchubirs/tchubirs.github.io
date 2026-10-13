// O "Chat no vídeo" num browser a sério: a janela do clipe liga o chat, as prévias mostram-no, e os
// ficheiros exportados (16:9, 9:16 e a montagem) levam-no nos píxeis. Desligado, nada.
//
// O vídeo de origem são cores lisas e escuras (test/chat-falso.mjs): nenhum píxel quase branco. O texto
// do chat é quase branco, e por isso contar os píxeis claros numa região de um quadro do ficheiro diz se
// o chat está lá. A Kick é a de test/falsa.mjs, com o chat de chat-falso.mjs por cima.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';
import { chatEVideo, gravarFonte, quadroDoFicheiro } from './chat-falso.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function carregar(p) {
  await kickFalsa(p, { canais: ['tchubi'] });
  await chatEVideo(p);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await gravarFonte(p, { ms: 6000 });
  await p.fill('#canais', 'tchubi');
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 20000 });
}

const comImagem = (p) => p.waitForFunction(() => window.__estado.clipe?.rects.length > 0
  && document.getElementById('previaClipe').readyState >= 2, null, { timeout: 15000 });

/** O link do ficheiro mais novo da fila, depois de haver `n`. */
async function ficheiro(p, n) {
  try {
    await p.waitForFunction((k) => document.querySelectorAll('#fila li a[download]').length >= k, n, { timeout: 90_000 });
  } catch (e) {
    const visto = await p.evaluate(() => ({
      clipe: document.getElementById('estadoClipe').textContent,
      montagem: document.getElementById('estadoMontagem').textContent,
      fila: document.getElementById('fila').textContent,
    }));
    throw new Error(`o ficheiro ${n} não saiu: ${JSON.stringify(visto)}`, { cause: e });
  }
  return p.evaluate(() => {
    const a = document.querySelector('#fila li a[download]');
    return { url: a.href, nome: a.getAttribute('download'), nota: a.closest('li').querySelector('.nota')?.textContent || '' };
  });
}

// Regiões em fracções do quadro.
const CHAT_16x9 = [0, 0.5, 0.4, 0.5];
const LONGE_16x9 = [0.5, 0, 0.5, 0.5];
const CHAT_9x16 = [0, 0.45, 0.85, 0.36];
const LONGE_9x16 = [0, 0, 1, 0.4];

test('Chat no vídeo: desligado por omissão; ligado, o 16:9 e o 9:16 exportados têm o chat; desligado, não',
  { ...semNavegador, timeout: 240_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await carregar(p);
    await p.click('#clipar');
    await p.waitForSelector('#modalClipe:not([hidden])');
    await comImagem(p);
    assert.equal(await p.isChecked('#chatClipeLigado'), false, 'o chat tem de nascer desligado');
    assert.equal(await p.isHidden('#chatClipeOpcoes'), true);
    assert.equal(await p.isHidden('#chatFonte'), true);
    // Um clipe de três segundos, no início da noite, onde o chat falso fala a cada 0,7 s.
    const deMs = await p.evaluate(() => { const c = window.__estado.clipe; c.ateMs = c.deMs + 3000; return c.deMs; });
    assert.equal(deMs, T);

    // Desligado: o 9:16 sai sem nada claro onde o chat estaria.
    await p.click('#guardarRetrato');
    const semChat = await ficheiro(p, 1);
    const q0 = await quadroDoFicheiro(p, semChat.url, { chat: CHAT_9x16 });
    assert.equal(q0.contas.chat, 0, 'sem chat ligado não pode haver chat no vídeo');
    assert.doesNotMatch(semChat.nota, /com chat/);

    // Ligado: as escolhas aparecem, o chat do pedaço é lido e as prévias mostram-no.
    await p.check('#chatClipeLigado');
    assert.equal(await p.isVisible('#chatClipeOpcoes'), true);
    await p.waitForFunction(() => /5 mensagens no chat de tchubi/.test(document.getElementById('estadoChatClipe').textContent),
      null, { timeout: 15000 });
    await p.waitForTimeout(300);
    const previas = await p.evaluate(() => {
      const conta = (tela, [fx, fy, fw, fh], soOpacos) => {
        const g = tela.getContext('2d');
        const d = g.getImageData(fx * tela.width, fy * tela.height, fw * tela.width, fh * tela.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (soOpacos ? d[i + 3] > 0 : d[i] > 205 && d[i + 1] > 205 && d[i + 2] > 205) n++;
        }
        return n;
      };
      return {
        fonte: conta(document.getElementById('chatFonte'), [0, 0.5, 0.4, 0.5], true),
        fonteLonge: conta(document.getElementById('chatFonte'), [0.5, 0, 0.5, 0.5], true),
        retrato: conta(document.getElementById('telaRetrato'), [0, 0.45, 0.85, 0.36], false),
      };
    });
    assert.ok(previas.fonte > 100, `a prévia 16:9 não mostra o chat (${previas.fonte})`);
    assert.equal(previas.fonteLonge, 0, 'o chat da prévia 16:9 saiu do canto');
    assert.ok(previas.retrato > 20, `a prévia 9:16 não mostra o chat (${previas.retrato})`);

    await p.click('#guardarRetrato');
    const retrato = await ficheiro(p, 2);
    assert.match(retrato.nota, /1080x1920, com chat/);
    const q1 = await quadroDoFicheiro(p, retrato.url, { chat: CHAT_9x16, longe: LONGE_9x16 });
    assert.equal(q1.largura, 1080);
    assert.ok(q1.contas.chat > 200, `o 9:16 exportado não tem o chat (${q1.contas.chat} píxeis claros)`);
    assert.equal(q1.contas.longe, 0, 'o chat do 9:16 apareceu fora do sítio');

    // O 16:9 com chat é gravado (os píxeis mudam), e não copiado da Kick.
    await p.click('#guardarClipe');
    const deitado = await ficheiro(p, 3);
    assert.match(deitado.nome, /\.(mp4|webm)$/);
    assert.match(deitado.nota, /1920x1080, com chat/);
    const q2 = await quadroDoFicheiro(p, deitado.url, { chat: CHAT_16x9, longe: LONGE_16x9 });
    assert.equal(q2.largura, 1920);
    assert.ok(q2.contas.chat > 200, `o 16:9 exportado não tem o chat (${q2.contas.chat} píxeis claros)`);
    assert.equal(q2.contas.longe, 0);

    // Desligado outra vez: o 16:9 volta a ser a cópia dos bytes da Kick, sem chat nenhum.
    await p.uncheck('#chatClipeLigado');
    assert.equal(await p.isHidden('#chatFonte'), true);
    await p.click('#guardarClipe');
    const copia = await ficheiro(p, 4);
    assert.match(copia.nome, /\.ts$/, `sem chat o 16:9 é a cópia dos bytes, saiu ${copia.nome}`);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('a montagem leva o chat do streamer de cada kill que o guardou ligado',
  { ...semNavegador, timeout: 240_000 }, async () => {
    const { p, erros } = await abrir({ ecra: { width: 1440, height: 900 } });
    await carregar(p);
    await p.click('#mais3s');
    await p.click('#mais3s');
    await p.click('#marcarKill');
    await p.waitForSelector('#listaMomentos li[data-ms]');
    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])');
    await comImagem(p);
    assert.equal(await p.isChecked('#chatClipeLigado'), false);
    await p.check('#chatClipeLigado');
    await p.selectOption('#chatClipeVida', '15');
    await p.waitForFunction(() => /mensagens no chat de tchubi/.test(document.getElementById('estadoChatClipe').textContent),
      null, { timeout: 15000 });
    // O pedaço do princípio do vídeo falso (como quem arrasta a pega do início): sem salto no vídeo, que
    // um WebM gravado no browser não tem índice para fazer depressa.
    await p.evaluate((t) => { const c = window.__estado.clipe; c.deMs = t; c.ateMs = t + 4000; }, T);
    await p.click('#guardarAjustes');
    await p.waitForFunction(() => document.getElementById('modalClipe').hidden, null, { timeout: 10000 });
    const aj = await p.evaluate(() => window.__estado.momentos[0].ajuste);
    assert.equal(aj.chat?.ligado, true);
    assert.equal(aj.chat.vida, 15);
    assert.match(await p.locator('#listaMomentos .ajustado').innerText(), /com chat/);

    // Reaberta, a kill volta com o chat ligado e as mesmas escolhas.
    await p.locator('#listaMomentos .cliparUma').first().click();
    await p.waitForSelector('#modalClipe:not([hidden])');
    assert.equal(await p.isChecked('#chatClipeLigado'), true);
    assert.equal(await p.inputValue('#chatClipeVida'), '15');
    await p.click('#cancelarClipe');

    await p.click('#baixarMontagem');
    await p.waitForFunction(() => /exportados/.test(document.getElementById('estadoMontagem').textContent),
      null, { timeout: 120_000 });
    assert.match(await p.locator('#estadoMontagem').innerText(), /^1\/1 exportados/,
      `a montagem não saiu: ${await p.locator('#fila').innerText()}`);
    const f = await ficheiro(p, 1);
    assert.match(f.nota, /com chat/);
    assert.match(f.nome, /^01a_.*\.(mp4|webm)$/);
    const q = await quadroDoFicheiro(p, f.url, { chat: CHAT_16x9, longe: LONGE_16x9 }, { aosS: 1.2 });
    assert.ok(q.contas.chat > 200, `a montagem saiu sem o chat (${q.contas.chat})`);
    assert.equal(q.contas.longe, 0);
    assert.deepEqual(erros, []);
    await p.close();
  });
