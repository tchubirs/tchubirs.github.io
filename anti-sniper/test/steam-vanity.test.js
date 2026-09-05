'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pelaVanity } = require('../src/steam');

// A ponte que ele mostrou: `hai_suzy` na Kick é `Tchubita` no Rust. Nenhum
// cruzamento de nome liga os dois — não têm uma letra em comum. O que liga é
// a URL personalizada da Steam, e ela some o "_".
const XML = (id, nome, priv) =>
  `<profile><steamID64>${id}</steamID64><steamID><![CDATA[${nome}]]></steamID>`
  + `<privacyState>${priv ? 'private' : 'public'}</privacyState></profile>`;

test('tira a pontuação até achar a URL personalizada', async () => {
  const pedidos = [];
  const buscar = async (u) => {
    pedidos.push(decodeURIComponent(u.match(/\/id\/([^?]+)/)[1]));
    return u.includes('/id/haisuzy')
      ? { ok: true, text: async () => XML('76561198162800675', 'Tchubita', true) }
      : { ok: false, status: 404 };
  };
  const r = await pelaVanity('hai_suzy', buscar);
  assert.deepEqual(r, {
    vanity: 'haisuzy', steamId: '76561198162800675',
    nomeNaSteam: 'Tchubita', privado: true,
  });
  assert.equal(pedidos[0], 'hai_suzy', 'tenta o nome cru primeiro');
  assert.ok(pedidos.includes('haisuzy'));
});

test('perfil PRIVADO ainda entrega o nome — é o caso dela', async () => {
  // Se privado fosse desistir, esta ponte não existiria: o perfil que
  // resolveu o caso real dele é privado.
  const buscar = async () => ({ ok: true, text: async () => XML('76561198000000001', 'Fulano', true) });
  const r = await pelaVanity('fulano', buscar);
  assert.equal(r.nomeNaSteam, 'Fulano');
  assert.equal(r.privado, true);
});

test('quem não tem URL personalizada devolve null, não erro', async () => {
  const buscar = async () => ({ ok: false, status: 404 });
  assert.equal(await pelaVanity('naoexiste9911', buscar), null);
});

test('resposta sem SteamID64 não vira falso positivo', async () => {
  // A Steam devolve 200 com uma página de erro quando o apelido não existe.
  const buscar = async () => ({ ok: true, text: async () => '<html>not found</html>' });
  assert.equal(await pelaVanity('qualquer', buscar), null);
});

test('nome curto demais nem sai da máquina', async () => {
  let chamou = false;
  const buscar = async () => { chamou = true; return { ok: false }; };
  assert.equal(await pelaVanity('ab', buscar), null);
  assert.equal(await pelaVanity('', buscar), null);
  assert.equal(chamou, false, 'apelido de 2 letras não existe na Steam');
});

test('rede caindo numa tentativa não derruba as outras', async () => {
  let n = 0;
  const buscar = async () => {
    if (n++ === 0) throw new Error('ECONNRESET');
    return { ok: true, text: async () => XML('76561198000000002', 'Depois', false) };
  };
  const r = await pelaVanity('nome_com_underline', buscar);
  assert.equal(r.nomeNaSteam, 'Depois');
});
