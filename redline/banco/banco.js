// Banco de ensaio do Redline, contra versoes REAIS de documentos reais:
// o mesmo artigo cientifico em duas versoes revistas por pessoas, e o mesmo
// formulario fiscal em dois anos.
//
// O teste que mais interessa e o primeiro: comparar um ficheiro CONSIGO
// PROPRIO tem de dar exactamente zero alteracoes. Se der uma que seja, a
// ferramenta inventa mudancas — e num comparador de contratos isso e tao mau
// como esconde-las.
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');
const ALVO = process.argv[2], DIR = process.argv[3] || '/tmp/pares';

const pares = [
  ['ele proprio (attention v1 vs v1)', 'attention-v1.pdf', 'attention-v1.pdf', 0],
  ['ele proprio (f941 2026 vs 2026)',  'f941-2026.pdf',    'f941-2026.pdf',    0],
  ['artigo revisto (attention v1->v5)','attention-v1.pdf', 'attention-v5.pdf', null],
  ['artigo revisto (bert v1->v2)',     'bert-v1.pdf',      'bert-v2.pdf',      null],
  ['formulario (f941 2025->2026)',     'f941-2025.pdf',    'f941-2026.pdf',    null],
  ['formulario (1040SB 2024->2026)',   'f1040sb-2024.pdf', 'f1040sb-2026.pdf', null],
];

(async () => {
  // CHROMIUM=/caminho/para/chrome quando o Chromium do sistema nao e o que o
  // playwright instalou (versoes diferentes: ele procura o seu e nao encontra).
  const b = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
  for (const [nome, a, c, esperado] of pares){
    const p = await b.newPage({viewport:{width:1320, height:900}});
    const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0,70)));
    const t0 = Date.now();
    let r = {nome};
    try{
      await p.goto('file://' + ALVO);
      await p.waitForSelector('.par', {timeout:40000});
      await p.setInputFiles('#f-a', path.join(DIR, a));
      await p.waitForTimeout(2500);
      await p.setInputFiles('#f-b', path.join(DIR, c));
      await p.waitForFunction(() => {
        const t = document.getElementById('conta').textContent;
        return /line/.test(t) || /identical/.test(t) || !!document.querySelector('.estado.err');
      }, null, {timeout:180000});
      await p.waitForTimeout(400);
      const erro = await p.$('.estado.err h3');
      if (erro){ r.recusado = (await erro.textContent()).trim(); }
      else {
        r = Object.assign(r, await p.evaluate(() => ({
          mudou:  document.querySelectorAll('.par.mudou').length,
          saiu:   document.querySelectorAll('.par.so-esq').length,
          entrou: document.querySelectorAll('.par.so-dir').length,
          iguais: document.querySelectorAll('.par.igual').length,
        })));
        r.total = r.mudou + r.saiu + r.entrou;
        if (esperado === 0) r.veredito = (r.total === 0) ? 'CERTO (zero)' : 'FALHOU: inventou ' + r.total;
        else if (r.total === 0) r.veredito = 'SUSPEITO: disse que nao mudou nada';
        else r.veredito = 'ok';
      }
    }catch(e){ r.erro = e.message.split('\n')[0].slice(0,70); }
    r.seg = +((Date.now()-t0)/1000).toFixed(1);
    if (errs.length) r.js = errs[0];
    console.log(JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
