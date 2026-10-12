// "Ver ao vivo agora" (QA-REAL.md, 12/10): abria a live 50 min atrás do ar e um canal só dos 24 no ar.
// O pedido (agora menos 20 s) caía depois do fim da playlist, que anda uns 30 s atrás do ar, e o
// restauro mandava o leitor para o começo. Agora prende-se à borda do que está gravado, com a folga
// medida nos segmentos, e abre todos os que estão ao vivo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instanteAoVivo } from '../site/aovivo.js';
import { kickFalsa, T } from './falsa.mjs';
import { montarPalco, podeCorrer } from './palco.mjs';

const linha = (slug, fim, durS = 2, vivo = true) => ({
  slug, fim, pecas: [{ vod: { aoVivo: vivo }, playlist: { fim, segmentos: [{ duracaoS: durS }, { duracaoS: durS }] } }],
});

test('o instante ao vivo é a borda comum menos um segmento e meio, e nunca depois do pedido', () => {
  const agora = T + 3_600_000;
  // A playlist acaba 30 s atrás do ar (o caso do teste real) e o pedido é "agora menos 20 s".
  const r = instanteAoVivo([linha('a', agora - 30_000, 6), linha('b', agora - 28_000, 6)], { pedidoMs: agora - 20_000, agoraMs: agora });
  assert.equal(r.margemMs, 9000, 'segmentos de 6 s: 9 s de folga');
  assert.equal(r.ms, agora - 30_000 - 9000, 'a borda de quem vai menos longe, menos a folga');
  // Segmentos curtos: a folga mínima é 4 s.
  assert.equal(instanteAoVivo([linha('a', agora - 5000, 2)], { agoraMs: agora }).margemMs, 4000);
  // Um pedido antes da borda fica como está.
  assert.equal(instanteAoVivo([linha('a', agora - 5000, 2)], { pedidoMs: agora - 60_000, agoraMs: agora }).ms, agora - 60_000);
  // Quem caiu há mais de 2 min não prende a borda dos outros.
  const r2 = instanteAoVivo([linha('a', agora - 10_000, 2), linha('caiu', agora - 600_000, 2)], { agoraMs: agora });
  assert.equal(r2.ms, agora - 10_000 - 4000);
  assert.equal(instanteAoVivo([], {}), null);
});

let PORTA = 0;
const { abrir } = montarPalco((p) => { PORTA = p; });
const semNavegador = { skip: !podeCorrer && 'sem navegador' };

test('"Ver ao vivo agora" abre todos os que estão ao vivo, perto do fim da playlist e não no começo', semNavegador, async () => {
  const { p, erros } = await abrir({ caminho: 'evento' });
  const canais = ['tchubi', 'outro', 'lobo'];
  await kickFalsa(p, { canais });
  // Os três no ar desde T; a playlist (60 pedaços de 10 s) acaba em T + 600 s, e o relógio do computador
  // está 40 s depois disso: o "agora menos 20 s" cai fora do vídeo, como na Kick a sério.
  for (const slug of canais) {
    await p.route(`**/api/v2/channels/${slug}/videos`, (rota) => rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 99, session_title: 'ao vivo', start_time: new Date(T).toISOString().replace('T', ' ').slice(0, 19),
        duration: 0, is_live: true, source: `https://stream.kick.com/falsa/${slug}/n0/master.m3u8`, video: {},
      }]),
    }));
  }
  await p.addInitScript((agora) => {
    const real = Date.now;
    const zero = real();
    Date.now = () => agora + (real() - zero);
  }, T + 640_000);
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', canais.join('\n'));
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && !document.getElementById('irAoVivo').hidden, null, { timeout: 15000 });
  await p.click('#irAoVivo');
  await p.waitForFunction(() => document.querySelectorAll('.tile').length === 3 && window.__estado.janela, null, { timeout: 20000 });
  assert.deepEqual(await p.evaluate(() => window.__estado.linhas.map((l) => l.slug).sort()), ['lobo', 'outro', 'tchubi']);
  const agora = await p.evaluate(() => window.__estado.agoraMs);
  // Segmentos de 10 s: 15 s de folga antes do fim (T + 600 s).
  assert.equal(agora, T + 585_000, `ficou ${(agora - T) / 1000} s depois do começo`);
  assert.deepEqual(erros, []);
  await p.close();
});
