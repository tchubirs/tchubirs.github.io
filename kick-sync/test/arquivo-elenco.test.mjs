// O botão Abrir arquivo ao lado do campo do elenco (o dono, 10/10): abre um .csv, .tsv ou .txt e põe o
// texto no campo, onde o lerElenco tira só os canais da Kick. Lido no navegador: nada é enviado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPalco, podeCorrer } from './palco.mjs';

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

async function pagina(ecra = { width: 1440, height: 900 }) {
  const { p, erros } = await abrir({ ecra });
  const fora = [];
  p.on('request', (q) => {
    const u = new URL(q.url());
    if (u.hostname !== '127.0.0.1') fora.push(q.url());
    if (q.method() !== 'GET') fora.push(`${q.method()} ${q.url()}`);
  });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  fora.length = 0;
  return { p, erros, fora };
}

const CSV = 'Time,Canal\r\nAlfa,https://kick.com/tchubi\r\nAlfa,https://kick.com/outro\r\nBeta,kick.com/terceiro\r\n';

test('Abrir arquivo abre o seletor de .csv, .tsv e .txt e põe o texto no campo, sem enviar nada', semNavegador, async () => {
  const { p, erros, fora } = await pagina();
  const botao = p.locator('#abrirArquivoElenco');
  assert.equal(await botao.innerText(), 'Abrir arquivo');
  // O botão abre o seletor do sistema, e o seletor só aceita listas.
  const [seletor] = await Promise.all([p.waitForEvent('filechooser'), botao.click()]);
  assert.equal(seletor.isMultiple(), false);
  const aceita = await p.locator('#arquivoElenco').getAttribute('accept');
  for (const tipo of ['.csv', '.tsv', '.txt']) assert.ok(aceita.includes(tipo), aceita);
  await seletor.setFiles({ name: 'times.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await p.waitForFunction(() => document.getElementById('elenco').value.includes('kick.com/tchubi'));
  assert.equal(await p.inputValue('#elenco'), CSV.replace(/\r\n/g, '\n'));
  assert.match(await p.locator('#estadoEvento').innerText(), /^Arquivo times\.csv: 2 times, 3 canais\./);
  // O próximo passo é o Abrir evento, que fica com o foco.
  assert.equal(await p.evaluate(() => document.activeElement.id), 'abrirElenco');
  // Abrir o mesmo arquivo outra vez também funciona (o campo do arquivo é limpo depois de cada um).
  assert.equal(await p.inputValue('#arquivoElenco'), '');
  assert.deepEqual(fora, [], 'o arquivo não pode sair do navegador');
  assert.deepEqual(erros, []);
  await p.close();
});

test('Abrir arquivo lê .tsv e .txt, uma planilha do Excel em UTF-16 ou Windows-1252, e diz quando não há canais',
  semNavegador, async () => {
    const { p, erros, fora } = await pagina();
    const abrirArq = async (name, mimeType, buffer) => {
      await p.setInputFiles('#arquivoElenco', { name, mimeType, buffer });
      await p.waitForFunction((n) => document.getElementById('estadoEvento').textContent.includes(n), name);
    };
    await abrirArq('lista.tsv', 'text/tab-separated-values', Buffer.from('Time\tCanal\nAlfa\tkick.com/tchubi\nAlfa\tkick.com/outro\n'));
    assert.match(await p.locator('#estadoEvento').innerText(), /2 canais/);
    await abrirArq('lista.txt', 'text/plain', Buffer.from('Time Alfa: tchubi, outro\nTime Beta: terceiro\n'));
    assert.match(await p.locator('#estadoEvento').innerText(), /^Arquivo lista\.txt: 2 times, 3 canais/);
    // UTF-16 com a marca no início, como o Excel salva "texto Unicode".
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Time,Canal\nFamília,https://kick.com/tchubi\n', 'utf16le')]);
    await abrirArq('excel.csv', 'text/csv', utf16);
    assert.match(await p.inputValue('#elenco'), /^Time,Canal\nFamília,https:\/\/kick\.com\/tchubi/);
    // Windows-1252: o "í" é um byte só, que em UTF-8 não se lê.
    await abrirArq('antigo.csv', 'text/csv', Buffer.from([...Buffer.from('Fam'), 0xed, ...Buffer.from('lia,kick.com/tchubi\n')]));
    assert.match(await p.inputValue('#elenco'), /^Família,kick\.com\/tchubi/);
    // Sem canal nenhum: diz, e o texto fica no campo para se ver o que veio.
    await abrirArq('vazio.txt', 'text/plain', Buffer.from('---\n'));
    assert.match(await p.locator('#estadoEvento').innerText(), /^Abri vazio\.txt, mas não achei nenhum canal/);
    assert.equal(await p.inputValue('#elenco'), '---\n');
    // Grande demais: não lê, e o campo fica como estava.
    await abrirArq('enorme.csv', 'text/csv', Buffer.alloc(5 * 1024 * 1024 + 10, 0x61));
    assert.match(await p.locator('#estadoEvento').innerText(), /^enorme\.csv é grande demais/);
    assert.equal(await p.inputValue('#elenco'), '---\n');
    assert.deepEqual(fora, []);
    assert.deepEqual(erros, []);
    await p.close();
  });

test('no celular, Abrir arquivo cabe ao lado do campo e tem 44 px de toque', semNavegador, async () => {
  const { p: base } = await abrir();
  const p = await base.context().browser().newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-PT' });
  await base.close();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e.message)));
  await p.addInitScript(() => { try { localStorage.setItem('replay.idioma', 'pt'); } catch { /* nada */ } });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  const b = await p.locator('#abrirArquivoElenco').boundingBox();
  const campo = await p.locator('#elenco').boundingBox();
  assert.ok(b.height >= 44, `${b.height} px`);
  assert.ok(b.y >= campo.y + campo.height - 1, 'o botão está por baixo do campo');
  assert.ok(b.x + b.width <= 390, 'cortado à direita');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  // O toque abre o seletor.
  const [seletor] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#abrirArquivoElenco').tap()]);
  await seletor.setFiles({ name: 'times.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await p.waitForFunction(() => document.getElementById('elenco').value.includes('kick.com/tchubi'));
  assert.deepEqual(erros, []);
  await p.close();
});
