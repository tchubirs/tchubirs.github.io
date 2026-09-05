'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const id = require('../src/identity');
const p = require('../src/proof');

const AGORA = Date.parse('2026-08-27T10:00:00Z');
const ANTIGA = 'https://velho.social/users/tchubi';
const NOVA = 'https://novo.social/users/tchubi';

function cenario() {
  const k = id.gerarIdentidade();
  return { k, bio: `Jogo Rust 🇧🇷 ${k.compromisso} me segue aqui` };
}

test('compromisso cabe numa bio de Mastodon', () => {
  const { k } = cenario();
  assert.ok(k.compromisso.length < 70, `compromisso tem ${k.compromisso.length} chars`);
});

test('compromisso sobrevive a estar no meio de outro texto', () => {
  const { k, bio } = cenario();
  assert.equal(id.extrairCompromisso(bio), k.compromisso);
});

test('chave pública é reconstruída a partir do compromisso publicado', () => {
  const { k } = cenario();
  const chave = id.chaveDoCompromisso(k.compromisso);
  assert.equal(id.compromissoDe(chave), k.compromisso);
});

test('prova válida verifica sem consultar o servidor antigo', () => {
  const { k, bio } = cenario();
  const prova = p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: NOVA, agoraMs: AGORA,
  });
  assert.deepEqual(p.verificarProva(prova, bio, AGORA), {
    valida: true, contaAntiga: ANTIGA, contaNova: NOVA,
  });
});

test('trocar a conta de destino invalida a prova', () => {
  const { k, bio } = cenario();
  const prova = p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: NOVA, agoraMs: AGORA,
  });
  const roubada = { ...prova, contaNova: 'https://mau.social/users/ladrao' };
  assert.equal(p.verificarProva(roubada, bio, AGORA).valida, false);
});

test('chave de outra pessoa não serve', () => {
  const { bio } = cenario();
  const outro = id.gerarIdentidade();
  const prova = p.emitirProva({
    chavePrivada: outro.privada, contaAntiga: ANTIGA, contaNova: NOVA, agoraMs: AGORA,
  });
  assert.match(p.verificarProva(prova, bio, AGORA).motivo, /assinatura não confere/);
});

test('perfil sem compromisso é recusado com motivo claro', () => {
  const { k } = cenario();
  const prova = p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: NOVA, agoraMs: AGORA,
  });
  assert.match(p.verificarProva(prova, 'só uma bio', AGORA).motivo, /não publicou compromisso/);
});

test('prova expira', () => {
  const { k, bio } = cenario();
  const prova = p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: NOVA,
    agoraMs: AGORA, validadeMs: 1000,
  });
  assert.equal(p.verificarProva(prova, bio, AGORA + 500).valida, true);
  assert.match(p.verificarProva(prova, bio, AGORA + 1500).motivo, /expirada/);
});

test('prova emitida no futuro é recusada, com tolerância de relógio', () => {
  const { k, bio } = cenario();
  const prova = p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: NOVA, agoraMs: AGORA,
  });
  // 4 min adiantado: aceito. 10 min: recusado.
  assert.equal(p.verificarProva(prova, bio, AGORA - 4 * 60 * 1000).valida, true);
  assert.match(p.verificarProva(prova, bio, AGORA - 10 * 60 * 1000).motivo, /no futuro/);
});

test('não deixa migrar para a própria conta', () => {
  const { k } = cenario();
  assert.throws(() => p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: ANTIGA, agoraMs: AGORA,
  }), /igual à antiga/);
});

test('campo faltando é recusado, não explode', () => {
  const { k, bio } = cenario();
  const prova = p.emitirProva({
    chavePrivada: k.privada, contaAntiga: ANTIGA, contaNova: NOVA, agoraMs: AGORA,
  });
  for (const campo of ['contaAntiga', 'contaNova', 'emitidoEm', 'expiraEm', 'assinatura']) {
    const quebrada = { ...prova }; delete quebrada[campo];
    assert.match(p.verificarProva(quebrada, bio, AGORA).motivo, /campo ausente/);
  }
  assert.equal(p.verificarProva(null, bio, AGORA).valida, false);
  assert.equal(p.verificarProva({ versao: 99 }, bio, AGORA).valida, false);
});

test('serialização canônica não depende da ordem das chaves', () => {
  assert.equal(p.canonico({ b: 1, a: 2 }), p.canonico({ a: 2, b: 1 }));
  assert.equal(p.canonico({ x: [1, { z: 1, y: 2 }] }), p.canonico({ x: [1, { y: 2, z: 1 }] }));
});

test('compromisso malformado não derruba o verificador', () => {
  assert.throws(() => id.chaveDoCompromisso('fedi-continuity-v1:curto'), /32 bytes/);
  assert.throws(() => id.chaveDoCompromisso('lixo'), /prefixo ausente/);
  assert.equal(id.extrairCompromisso(null), null);
  assert.equal(id.extrairCompromisso(12345), null);
});
