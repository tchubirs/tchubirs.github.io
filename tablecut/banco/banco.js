// Banco de ensaio do Tablecut.
//
// Abre a ferramenta a serio, num Chromium a serio, arrasta cada PDF, percorre
// as paginas, fica com a que mais parece tabela — que e o que a pessoa faz —
// e mede. Sem estas medidas eu teria jurado que tres alteracoes minhas eram
// melhorias, e as tres pioravam o resultado.
//
//   node banco.js ./pdfs ../app.html etiqueta
//
// Escreve banco-<etiqueta>.json ao lado, para se comparar com uma medicao
// anterior. A ferramenta vai buscar o pdf.js a um CDN: se a maquina nao tiver
// saida para a internet, guarde pdf.min.js e pdf.worker.min.js e troque os
// dois enderecos numa copia do app.html.
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');

const DIR = process.argv[2] || './pdfs';
const ALVO = path.resolve(process.argv[3] || '../app.html');
const TAG  = process.argv[4] || 'ensaio';

function metricas(linhas){
  if (!linhas.length) return {linhas:0, colunas:0, multi:0, num:0, fundidas:0, soltas:0, vazias:0};
  const colunas = Math.max(...linhas.map(l => l.length));
  const cheias = linhas.filter(l => l.filter(c => c.trim()).length >= 2).length;
  const todas = linhas.flat(), comTexto = todas.filter(c => c.trim());
  const N = Math.max(1, comTexto.length);
  // numeros fundidos: duas parcelas numericas na mesma celula = colunas coladas
  const fundidas = comTexto.filter(c => (c.trim().match(/(^|\s)[-(]?\d[\d.,]*[)%]?(?=\s|$)/g)||[]).length >= 2).length;
  // letras soltas: "M a r r i e d"
  const soltas = comTexto.filter(c => /(^|\s)\S(\s\S){2,}(\s|$)/.test(c.trim()) && /[A-Za-z]/.test(c)).length;
  return {
    linhas: linhas.length, colunas,
    // contagens absolutas: sem elas a media por documento deixa uma pagina de
    // 4 linhas pesar tanto como uma de 46, e uma pagina pequena tem sempre
    // "todas as linhas completas". Foi assim que quase reprovei a correccao
    // que faz o extracto frances abrir na pagina dos movimentos.
    nCheias: cheias, nTexto: comTexto.length, nFundidas: fundidas,
    multi:    +(cheias / linhas.length * 100).toFixed(0),
    num:      +(comTexto.filter(c => /^[-(]?[\d.,]+[)%]?$/.test(c.trim())).length / N * 100).toFixed(0),
    fundidas: +(fundidas / N * 100).toFixed(0),
    soltas:   +(soltas / N * 100).toFixed(0),
    vazias:   +(todas.filter(c => !c.trim()).length / Math.max(1, todas.length) * 100).toFixed(0)
  };
}

const lerTabela = p => p.evaluate(() => [...document.querySelectorAll('tbody tr')]
  .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent)));

(async () => {
  const pdfs = fs.readdirSync(DIR).filter(f => f.endsWith('.pdf')).sort();
  if (!pdfs.length){ console.error('sem PDFs em ' + DIR + ' — correr ./buscar.sh primeiro'); process.exit(1); }
  // CHROMIUM=/caminho/para/chrome quando o Chromium do sistema nao e o que o
  // playwright instalou (versoes diferentes: ele procura o seu e nao encontra).
  const navegador = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
  const saida = [];
  for (const f of pdfs){
    const pagina = await navegador.newPage({viewport:{width:1400, height:900}});
    const t0 = Date.now();
    let r = {ficheiro:f, kb:Math.round(fs.statSync(path.join(DIR,f)).size/1024)};
    try{
      await pagina.goto('file://' + ALVO);
      await pagina.waitForSelector('tbody tr td', {timeout:40000});      // o exemplo carregou
      await pagina.setInputFiles('#file', path.join(DIR, f));
      await pagina.waitForFunction(
        n => (document.getElementById('fileinfo').textContent||'').includes(n.slice(0,12))
             || !!document.querySelector('.state.err'),
        f, {timeout:180000});
      await pagina.waitForTimeout(400);
      const recusa = await pagina.$('.state.err h3');
      if (recusa){
        r.recusado = (await recusa.textContent()).trim();               // scan, sem texto: e uma resposta certa
      } else {
        // Mede-se a pagina que a FERRAMENTA abriu, que e a que a pessoa ve.
        //
        // Antes o banco percorria as paginas todas e ficava com a melhor
        // segundo uma nota sua — multi x colunas. Isso parecia mais exigente e
        // era pior: quando eu mexia no numero de colunas, a nota mudava, o
        // banco escolhia OUTRA pagina, e a medicao comparava paginas
        // diferentes. Uma alteracao que nao tocou em nenhuma tabela aparecia
        // como piorada. O banco tem de medir o produto, nao inventar um.
        const estado = await pagina.evaluate(() => {
          const ps = document.querySelectorAll('.pg');
          const on = document.querySelector('.pg[aria-pressed="true"]');
          return {paginas: ps.length || 1,
                  pagina: on ? (+on.getAttribute('data-page') + 1) : 1};
        });
        Object.assign(r, metricas(await lerTabela(pagina)), estado);
      }
    }catch(e){ r.erro = e.message.split('\n')[0].slice(0,80); }
    r.seg = +((Date.now()-t0)/1000).toFixed(1);
    saida.push(r); console.log(JSON.stringify(r));
    await pagina.close();
  }
  fs.writeFileSync(`banco-${TAG}.json`, JSON.stringify(saida, null, 1));
  const bons = saida.filter(x => x.linhas);
  if (bons.length){
    const med = k => (bons.reduce((a,b) => a + b[k], 0) / bons.length).toFixed(1);
    console.log(`\n${bons.length} com tabela, ${saida.filter(x=>x.recusado).length} recusados, ` +
                `${saida.filter(x=>x.erro).length} com erro`);
    console.log(`multi ${med('multi')}% | fundidas ${med('fundidas')}% | soltas ${med('soltas')}% | colunas ${med('colunas')}`);
    const soma = k => bons.reduce((a,b) => a + (b[k]||0), 0);
    console.log(`ponderado pelo tamanho: linhas completas ` +
                `${(soma('nCheias')/soma('linhas')*100).toFixed(1)}% de ${soma('linhas')} linhas | ` +
                `fundidas ${(soma('nFundidas')/soma('nTexto')*100).toFixed(1)}% de ${soma('nTexto')} celulas`);
  }
  await navegador.close();
})();
