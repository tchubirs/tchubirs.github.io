#!/usr/bin/env node
'use strict';
/**
 * Gera uma página única e sem dependências com o painel funcionando, para
 * ele clicar antes de instalar qualquer coisa.
 *
 * O cruzamento vem de `src/` por geração, nunca copiado à mão: uma demo com
 * lógica diferente da testada não demonstraria nada — mostraria outro
 * produto. É o mesmo motivo de `extensao/construir.js` e
 * `peekrust/construir.js` existirem.
 *
 * A AUDIÊNCIA é real: nomes e tempo assistido vêm da rota pública da BotRix
 * do canal dele. A presença no servidor é simulada, porque isso depende do
 * agente rodando na máquina dele — e a página diz isso na cara.
 *
 * Uso:  node bin/gerar-demo.js [saida.html]
 */
const fs = require('node:fs');
const path = require('node:path');
const { placarPublico } = require('../src/stream/botrix-api');

const RAIZ = path.join(__dirname, '..');
const SAIDA = process.argv[2] || path.join(RAIZ, 'demo.html');
const CANAL = process.env.DEMO_CANAL || 'tchubi';

const limpar = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')
  .replace(/^'use strict';\s*$/m, '')
  .replace(/^const .*= require\(.*\);\s*$/gm, '')
  .replace(/^module\.exports\s*=[\s\S]*?;\s*$/gm, '')
  .trim();

/**
 * O exemplo de como a tela fica quando estiver gravando.
 *
 * REGRA, aprendida errando duas vezes na cara dele: nunca pendurar dado
 * inventado no nome de uma pessoa real.
 *
 * A primeira versão inventou um nome no jogo para uma espectadora dele e
 * ele leu como descoberta — o nome real era outro, sem uma letra em comum.
 * A segunda inventou os horários dela: ele sabia que ela entrou e saiu
 * rápido, e a tela mostrava 84 minutos. Cada uma dessas telas é um inocente
 * acusado com dado que eu produzi.
 *
 * Então o exemplo usa gente que não existe, com nome que se anuncia, e a
 * audiência real aparece só com o que foi MEDIDO: nome e tempo total.
 */
function exemplo(agora) {
  const H = 3600000; const M = 60000;
  const inicio = agora - 3 * H;
  // `seg` só existe na presença: é a fonte que avisa entrada e saída no
  // instante em que acontecem. As outras creditam em blocos de ~10 min, e
  // fingir segundos nelas seria inventar precisão.
  const p = (nome, deMin, ateMin, fonte, deSeg = 0, ateSeg = 0) => ({
    nome, fonte,
    de: inicio + deMin * M + deSeg * 1000,
    ate: inicio + ateMin * M + ateSeg * 1000,
  });
  return {
    inicioLive: inicio,
    // Uma pessoa que entra e sai várias vezes, uma que fica calada a live
    // toda, e uma que passou rápido — as três formas que o log precisa
    // mostrar diferente.
    naLive: {
      // Bloco de ~10 min: o que a fidelidade sozinha consegue dizer.
      'ESPECTADOR-A': [p('ESPECTADOR-A', 12, 47, 'tempo'), p('ESPECTADOR-A', 96, 174, 'tempo')],
      'ESPECTADOR-B': [p('ESPECTADOR-B', 5, 176, 'chat')],
      // AO SEGUNDO: a resposta que ele pediu — "sei que ele ficou 5 minuto
      // maximo na minha live". Entrou 4min51s, saiu, voltou 5min21s. Com
      // bloco de 10 min essas duas visitas viram 0 ou viram 10; com a
      // presença viram o horário exato, e é isso que responde a pergunta.
      'ESPECTADOR-C': [
        p('ESPECTADOR-C', 130, 134, 'presenca', 22, 13),
        p('ESPECTADOR-C', 137, 142, 'presenca', 41, 2),
      ],
    },
    noServidor: {
      'ESPECTADOR-A': [{ de: inicio + 104 * M, ate: inicio + 178 * M, nome: 'JOGADOR-A' }],
      'ESPECTADOR-C': [{ de: inicio + 128 * M, ate: inicio + 179 * M, nome: 'JOGADOR-C' }],
    },
    // O minuto da morte, para a linha do tempo ter o que marcar.
    morte: inicio + 136 * M,
  };
}

(async () => {
  const audiencia = await placarPublico(CANAL, 'kick');
  if (!audiencia.length) { console.error(`sem audiência pública para "${CANAL}"`); process.exit(1); }

  const motor = [limpar('src/unicode.js'), limpar('src/nomes.js'), limpar('src/indice.js')].join('\n\n');
  const dados = { canal: CANAL, audiencia, geradoEm: Date.now() };

  // Substituição por FUNÇÃO, nunca por string: em String.replace, um `$'`
  // no texto de substituição significa "tudo que vem depois do trecho" e
  // engole o resto do arquivo. O mapa de leet tem `'$': 's'`, e com a
  // versão por string o pacote saía truncado no meio de uma linha.
  const trocar = (texto, marca, valor) => texto.replace(marca, () => valor);
  let html = fs.readFileSync(path.join(__dirname, 'demo-modelo.html'), 'utf8');
  html = trocar(html, '/*NOITE*/', exemplo.toString());

  fs.writeFileSync(SAIDA, html);
  console.log(`gerado ${SAIDA} — ${(html.length / 1024).toFixed(0)} KB, ${audiencia.length} pessoas reais`);
})();
