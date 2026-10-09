// Fotos da tela do vídeo (evento e noite) em 3 tamanhos, para comparar antes e depois de mexer no visual.
//   FOTODIR=<pasta> ROT=antes node --test probes/fotos-design.test.mjs
import { test } from 'node:test';
import { kickFalsa, T } from '../test/falsa.mjs';
import { montarPalco } from '../test/palco.mjs';
let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const DIR = process.env.FOTODIR;
const ROT = process.env.ROT || 'antes';
for (const [nome, ecra] of [['1440', { width: 1440, height: 900 }], ['1280', { width: 1280, height: 720 }], ['390', { width: 390, height: 844 }]]) {
  test(`evento ${nome}`, async () => {
    const { p } = await abrir({ ecra });
    await kickFalsa(p, { canais: ['tchubi', 'outro'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#elenco', 'Time Alfa: tchubi, outro\nTime Beta: terceiro');
    await p.click('#abrirElenco');
    await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista);
    await p.evaluate((ms) => window.__abrirLanceDoEvento(['tchubi', 'outro'], ms, 'tchubi'), T + 3 * 60_000);
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${DIR}/${ROT}-evento-${nome}.png`, fullPage: nome === '390' });
    await p.close();
  });
  test(`noite ${nome}`, async () => {
    const { p } = await abrir({ ecra });
    await kickFalsa(p, { canais: ['tchubi'] });
    await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
    await p.fill('#canais', 'tchubi');
    await p.click('#carregar');
    await p.waitForSelector('.tile', { timeout: 15000 });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${DIR}/${ROT}-noite-${nome}.png`, fullPage: nome === '390' });
    await p.close();
  });
}
