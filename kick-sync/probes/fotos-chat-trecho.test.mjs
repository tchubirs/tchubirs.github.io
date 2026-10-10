// Fotos do trecho de chat (duas alças na linha do tempo) na tela do vídeo, com e sem evento.
//   FOTODIR=<pasta> node --test probes/fotos-chat-trecho.test.mjs
import { test } from 'node:test';
import { kickFalsa, T } from '../test/falsa.mjs';
import { montarPalco } from '../test/palco.mjs';
let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const DIR = process.env.FOTODIR || new URL('../../.arena/prints/fotos/', import.meta.url).pathname;
for (const [nome, ecra] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  test(`evento ${nome}`, async () => {
    const { p } = await abrir({ ecra });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', 'Time Alfa: tchubi, outro\nTime Beta: terceiro');
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista);
    await p.evaluate((ms) => window.__abrirLanceDoEvento(['tchubi', 'outro'], ms, 'tchubi'), T + 3 * 60_000);
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${DIR}/chat-trecho-evento-${nome}-antes.png`, fullPage: nome === '390' });
    await p.selectOption('#chatDeQuem', 'outro');
    await p.click('#lerChatTrecho');
    await p.waitForFunction(() => /mensage/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 15000 });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${DIR}/chat-trecho-evento-${nome}-lido.png`, fullPage: nome === '390' });
    if (nome === '390') {
      await p.locator('.relogio').screenshot({ path: `${DIR}/chat-trecho-evento-390-linha.png` });
    }
    await p.close();
  });
  test(`noite ${nome}`, async () => {
    const { p } = await abrir({ ecra });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.waitForTimeout(800);
    await p.click('#lerChatTrecho');
    await p.waitForFunction(() => /mensage/.test(document.getElementById('estadoChatTrecho').textContent), null, { timeout: 15000 });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${DIR}/chat-trecho-noite-${nome}.png`, fullPage: nome === '390' });
    await p.close();
  });
}
