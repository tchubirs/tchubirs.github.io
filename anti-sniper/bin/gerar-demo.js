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
 * Uma noite plausível a partir do tempo assistido real de cada um.
 *
 * Determinístico de propósito: recarregar a página não pode mudar quem
 * estava onde, senão ele testa uma coisa e vê outra.
 */
function noite(audiencia, agora) {
  const H = 3600000; const M = 60000;
  const inicioLive = agora - 4 * H;
  const pessoas = audiencia.map((p, i) => {
    const semente = (p.nome.length * 37 + i * 91) % 100;
    const entra = Math.floor((semente / 100) * 170);              // min após o início
    const dura = Math.max(15, Math.min(235 - entra, Math.round((p.minutosAssistidos || 30) / 12) + 20));
    // Medido num canal ao vivo: de 47 pessoas detectadas, 45 nunca falaram.
    // Uma demonstração cheia de "falou" mostraria o contrário da realidade
    // e do motivo de o produto existir.
    const fonte = semente % 7 === 0 ? 'chat' : 'tempo';
    // Último sinal escalonado: todo mundo com "há 5 min" idêntico entrega
    // que é cenário montado, e esconde a diferença entre quem acabou de
    // dar sinal e quem está no limite da janela.
    const calada = semente % 13;
    // "Ainda está lá" tem que ser a MESMA conta que a página usa para
    // montar a lista da live (último sinal dentro do gap de 15 min).
    // Critérios diferentes fariam alguém aparecer em "nos dois" sem estar
    // em "na live agora" — uma tela impossível na vida real.
    const fim = Math.min(inicioLive + (entra + dura) * M, agora - (semente % 13) * M);
    const aindaLa = agora - fim <= 15 * M;
    return {
      ...p,
      naLive: [{ de: inicioLive + entra * M, ate: Math.min(inicioLive + (entra + dura) * M, agora - calada * M), fonte }],
      aindaLa,
    };
  });
  // Dois deles também estão no servidor agora — é o caso que o produto existe
  // para mostrar, e sem ninguém na tela ele não daria para ver.
  const noServidor = pessoas.filter((p) => p.aindaLa).slice(0, 2).map((p, i) => ({
    // Nome NO JOGO, que não é o do chat — é justamente por isso que o
    // cruzamento existe. E o id do BattleMetrics, que é o que responde
    // "quem é esse cara": de lá saem o histórico de nomes e a SteamID.
    // Disfarces que acontecem de verdade: decoração em volta do nome
    // INTEIRO, e maiúsculas com leet. Cortar o nome no meio também
    // acontece, mas aí o cruzamento honestamente não acha — e é a busca
    // por SteamID que resolve, não um exemplo escolhido para parecer bom.
    nome: [`xX_${p.nome}_Xx`, p.nome.toUpperCase().replace(/I/g, '1').replace(/O/g, '0')][i % 2],
    chat: p.nome,
    bmId: String(1263079000 + (p.nome.length * 731 + i * 97) % 9000),
    servidor: 'Rustoria.co - US Main',
    de: p.naLive[0].de + 20 * M, ate: agora,
  }));
  return { inicioLive, pessoas, noServidor };
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
  html = trocar(html, '/*MOTOR*/', motor);
  html = trocar(html, '/*DADOS*/', JSON.stringify(dados));
  html = trocar(html, '/*NOITE*/', noite.toString());

  fs.writeFileSync(SAIDA, html);
  console.log(`gerado ${SAIDA} — ${(html.length / 1024).toFixed(0)} KB, ${audiencia.length} pessoas reais`);
})();
