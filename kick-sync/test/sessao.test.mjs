// A sessão guardada, o link partilhado, os links da Kick colados, o Recomeçar e
// o mudar de noite, num browser a sério e com a Kick de test/falsa.mjs.
//
// Cada um destes testes é um defeito que fazia perder trabalho sem aviso: as
// kills de uma noite, a lista de canais inteira, ou a sessão de quem abria um
// link de outra pessoa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const comNavegador = { skip: !podeCorrer && 'sem navegador' };
const DIA = 24 * 3600 * 1000;
const raiz = () => `http://127.0.0.1:${PORTA}/`;

async function abrirNoite(p, canais) {
  await p.goto(raiz(), { waitUntil: 'networkidle' });
  await p.fill('#canais', canais.join('\n'));
  await p.click('#carregar');
  await p.waitForSelector('.tile', { timeout: 15000 });
}

async function marcarKill(p) {
  const antes = await p.locator('#listaMomentos li[data-ms]').count();
  await p.click('#mais1m');
  await p.click('#marcarKill');
  await p.waitForFunction((n) => document.querySelectorAll('#listaMomentos li[data-ms]').length > n,
    antes, { timeout: 5000 });
}

/** As kills que estão no localStorage, depois de o guardar ter tido tempo de correr. */
async function killsGuardadas(p) {
  await p.waitForTimeout(600);
  return p.evaluate(() => {
    const s = localStorage.getItem('replay');
    if (!s) return null;
    return JSON.parse(decodeURIComponent(escape(atob(s)))).momentos.length;
  });
}

/** Mudar para a noite cujo início é `inicio`, e esperar que abra. */
async function irParaNoite(p, inicio) {
  const valor = await p.evaluate((alvo) => {
    const opcoes = [...document.querySelectorAll('#noite option')];
    // As noites da falsa começam às 21h de dias seguidos; o rótulo tem a data.
    const dia = new Date(alvo).toISOString().slice(5, 10).split('-').reverse().join('/');
    const certa = opcoes.find((o) => o.textContent.includes(dia)) || opcoes.find((o) => !o.selected);
    return certa.value;
  }, inicio);
  await p.selectOption('#noite', valor);
  await p.waitForFunction((i) => {
    const j = window.__estado.janela;
    return j && i >= j.inicio - 60_000 && i <= j.fim && !document.getElementById('noite').disabled;
  }, inicio, { timeout: 15000 });
}

test('mudar de noite e voltar não apaga as kills da primeira', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'], noites: 2 });
  await abrirNoite(p, ['tchubi', 'outro']);
  const primeira = await p.evaluate(() => window.__estado.janela.inicio);
  const outra = primeira >= T + DIA ? T : T + DIA;
  await marcarKill(p);

  await irParaNoite(p, outra);
  assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 0, 'a outra noite não tem kills');
  assert.equal(await killsGuardadas(p), 1, 'a kill da primeira noite saiu do localStorage');

  await irParaNoite(p, primeira);
  assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 1, 'a kill não voltou');
  assert.deepEqual(erros, []);
  await p.close();
});

test('abrir um link partilhado junta-se à sessão, e o F5 a seguir não o aplica outra vez',
  comNavegador, async () => {
    const { p, erros } = await abrir();
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await abrirNoite(p, ['tchubi', 'outro']);
    await marcarKill(p);
    // O link de outra pessoa para a mesma noite: sem kills, como todos.
    const link = await p.evaluate(() => {
      const e = window.__estado;
      const magro = {
        v: 2, canais: ['tchubi', 'outro'], de: e.janela.inicio, ate: e.janela.fim,
        nudges: { outro: 1500 }, agora: e.agoraMs, momentos: [],
      };
      return btoa(unescape(encodeURIComponent(JSON.stringify(magro))));
    });
    await p.waitForTimeout(600);
    await p.goto(`${raiz()}?s=${encodeURIComponent(link)}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 1, 'a kill dele sumiu');
    assert.equal(await p.evaluate(() => window.__estado.nudges.outro), 1500, 'o acerto do link não entrou');
    assert.doesNotMatch(p.url(), /[?#&]s=/, 'o link fica no endereço e volta a mandar no F5');

    await marcarKill(p);
    await p.waitForTimeout(600);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tile', { timeout: 15000 });
    assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 2, 'o F5 perdeu a kill nova');
    assert.deepEqual(erros, []);
    await p.close();
  });

test('o link copiado leva a noite depois do #, que não vai ao servidor', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window.__copiado = t; return Promise.resolve(); } },
    });
  });
  await abrirNoite(p, ['tchubi', 'outro']);
  await p.click('#partilhar');
  const u = await p.evaluate(() => window.__copiado);
  assert.match(u, /#s=/);
  assert.doesNotMatch(u, /\?s=/, 'com 500 canais o ?s= dava 414 no GitHub Pages');

  // E abre: noutra página, sem sessão nenhuma guardada.
  const { p: q, erros: errosQ } = await abrir();
  await kickFalsa(q, { canais: ['tchubi', 'outro'] });
  await q.goto(u.replace(/^https?:\/\/[^/]+\//, raiz()), { waitUntil: 'networkidle' });
  await q.waitForSelector('.tile', { timeout: 15000 });
  assert.equal(await q.locator('.tile').count(), 2);
  assert.deepEqual([...erros, ...errosQ], []);
  await p.close();
  await q.close();
});

test('um link #s= aberto num separador onde a página já está abre a noite', comNavegador, async () => {
  // Só o # muda, e o browser não recarrega: sem quem ouça o hashchange o link não fazia nada.
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await p.goto(raiz(), { waitUntil: 'networkidle' });
  const link = Buffer.from(JSON.stringify({ v: 2, canais: ['tchubi', 'outro'] })).toString('base64');
  await p.goto(`${raiz()}#s=${encodeURIComponent(link)}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  assert.equal(await p.locator('.tile').count(), 2);
  assert.doesNotMatch(p.url(), /[?#&]s=/, 'o link fica no endereço e volta a mandar no F5');
  assert.deepEqual(erros, []);
  await p.close();
});

test('abrir um lance do evento noutra noite não apaga as kills da noite aberta', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'], noites: 2 });
  await abrirNoite(p, ['tchubi', 'outro']);
  const primeira = await p.evaluate(() => window.__estado.janela.inicio);
  const outra = (primeira >= T + DIA ? T : T + DIA) + 120_000;
  await marcarKill(p);

  await p.evaluate((ms) => window.__abrirLanceDoEvento(['tchubi', 'outro'], ms, 'tchubi'), outra);
  await p.waitForFunction((ms) => {
    const j = window.__estado.janela;
    return j && ms >= j.inicio && ms <= j.fim && !document.getElementById('noite').disabled;
  }, outra, { timeout: 15000 });
  assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 0, 'a noite do lance não tem kills');
  assert.equal(await killsGuardadas(p), 1, 'a kill da noite que estava aberta saiu do localStorage');

  await irParaNoite(p, primeira);
  assert.equal(await p.locator('#listaMomentos li[data-ms]').count(), 1, 'a kill não voltou');
  assert.deepEqual(erros, []);
  await p.close();
});

test('o F5 devolve a caixa inteira, e não só os canais que entraram na noite', comNavegador, async () => {
  const { p, erros } = await abrir();
  // `fantasma` não existe na Kick (404) e por isso não entra na noite.
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await abrirNoite(p, ['tchubi', 'outro', 'fantasma']);
  await p.waitForTimeout(600);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  assert.equal(await p.inputValue('#canais'), 'tchubi\noutro\nfantasma');
  assert.deepEqual(erros, []);
  await p.close();
});

test('Recomeçar: o Cancelar não mexe em nada, e o OK não volta com a sessão', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  await abrirNoite(p, ['tchubi', 'outro']);
  await marcarKill(p);
  await p.waitForTimeout(600);
  const memo = () => p.evaluate(() => [
    window.__estado.vodsPorCanal.size, Boolean(localStorage.getItem('replay.vods')),
  ]);
  assert.deepEqual(await memo(), [2, true]);

  p.once('dialog', (d) => d.dismiss());
  await p.click('#recomecar');
  assert.deepEqual(await memo(), [2, true], 'o Cancelar apagou a memória dos VODs');

  p.once('dialog', (d) => d.accept());
  await Promise.all([p.waitForEvent('load'), p.click('#recomecar')]);
  await p.waitForTimeout(800);
  assert.equal(await p.inputValue('#canais'), '', 'os canais voltaram depois de recomeçar');
  assert.equal(await p.locator('.tile').count(), 0);
  assert.equal(await p.evaluate(() => localStorage.getItem('replay')), null);
  assert.deepEqual(erros, []);
  await p.close();
});

test('um link de clipe colado abre o editor, e o F5 não fica com o canal ·clipe', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.route('https://kick.com/api/v2/clips/**', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clip: {
      id: 'clip_01ABC', title: 'x', duration: 60, channel: { slug: 'tchubi' },
      video_url: 'https://stream.kick.com/falsa/tchubi/n0/160p30/playlist.m3u8',
    } }),
  }));
  await p.goto(raiz(), { waitUntil: 'networkidle' });
  await p.fill('#linkKick', 'https://kick.com/tchubi/clips/clip_01ABC');
  await p.click('#abrirLink');
  await p.waitForSelector('#modalClipe:not([hidden])', { timeout: 10000 });
  assert.doesNotMatch(await p.locator('#estadoLink').innerText(), /sincronia|Cannot read/);
  assert.equal(await p.locator('#guardarAjustes').isHidden(), true,
    'Guardar ajustes sem kill nenhuma onde guardar');

  await p.waitForTimeout(600);
  await p.reload({ waitUntil: 'networkidle' });
  assert.doesNotMatch(await p.inputValue('#canais'), /clipe/);
  assert.deepEqual(erros.filter((e) => !/Failed to load resource/.test(e)), []);
  await p.close();
});

test('um link de VOD colado abre a noite desse VOD, pela v1 da Kick', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi'], noites: 2 });
  await p.route('https://kick.com/api/v2/video/**', (r) => r.fulfill({ status: 404, body: '{"message":""}' }));
  // O VOD é o da PRIMEIRA noite, a mais antiga: a mais recente é a que abria sempre.
  await p.route('https://kick.com/api/v1/video/**', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      uuid: '67f962ed', livestream: {
        start_time: new Date(T).toISOString().replace('T', ' ').slice(0, 19),
        channel: { slug: 'tchubi' },
      },
    }),
  }));
  await p.goto(raiz(), { waitUntil: 'networkidle' });
  await p.fill('#linkKick', 'https://kick.com/tchubi/videos/67f962ed-3448-4724-8b6d-10fabbb72c7f');
  await p.click('#abrirLink');
  await p.waitForSelector('.tile', { timeout: 15000 });
  const j = await p.evaluate(() => window.__estado.janela);
  assert.ok(T >= j.inicio - 60_000 && T <= j.fim, 'abriu outra noite que não a do VOD');
  assert.doesNotMatch(await p.locator('#estadoLink').innerText(), /clip/i);
  assert.deepEqual(erros.filter((e) => !/Failed to load resource/.test(e)), []);
  await p.close();
});

test('um VOD que não existe diz que é o vídeo, e não um clipe', comNavegador, async () => {
  const { p } = await abrir({ idioma: 'en' });
  await kickFalsa(p, { canais: ['tchubi'] });
  await p.route('https://kick.com/api/v1/video/**', (r) => r.fulfill({ status: 404, body: '{}' }));
  await p.goto(raiz(), { waitUntil: 'networkidle' });
  await p.fill('#linkKick', 'https://kick.com/tchubi/videos/nada');
  await p.click('#abrirLink');
  await p.waitForSelector('#estadoLink.mau', { timeout: 10000 });
  const texto = await p.locator('#estadoLink').innerText();
  assert.match(texto, /video/i);
  assert.doesNotMatch(texto, /clip/i);
  await p.close();
});

test('com o armazenamento do site bloqueado a página ainda arranca e abre um link', comNavegador, async () => {
  const { p, erros } = await abrir();
  await kickFalsa(p, { canais: ['tchubi', 'outro'] });
  const link = Buffer.from(JSON.stringify({ v: 2, canais: ['tchubi', 'outro'] })).toString('base64');
  await p.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('bloqueado', 'SecurityError'); };
  });
  await p.goto(`${raiz()}#s=${encodeURIComponent(link)}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.tile', { timeout: 15000 });
  assert.deepEqual(erros, []);
  await p.close();
});
