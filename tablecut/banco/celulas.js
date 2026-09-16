// Prova de que juntar colunas nao perde texto: tira a lista de celulas com
// texto das duas versoes e compara-as, celula a celula, pela ordem de leitura.
const {chromium} = require('playwright');
const fs=require('fs'), path=require('path');
const DIR=process.argv[2], A=process.argv[3], B=process.argv[4];
const ler = async (p, alvo, f) => {
  await p.goto('file://'+path.resolve(alvo));
  await p.waitForSelector('tbody tr td', {timeout:40000});
  await p.setInputFiles('#file', f);
  await p.waitForFunction(n => (document.getElementById('fileinfo').textContent||'').includes(n.slice(0,12))
    || !!document.querySelector('.state.err'), path.basename(f), {timeout:180000});
  await p.waitForTimeout(400);
  return p.evaluate(() => [...document.querySelectorAll('tbody tr')]
    .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent).filter(t => t.trim())));
};
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{});
  let mau = 0;
  for (const f of fs.readdirSync(DIR).filter(x=>x.endsWith('.pdf')).sort()){
    const p1 = await b.newPage(), p2 = await b.newPage();
    const [x,y] = [await ler(p1,A,path.join(DIR,f)), await ler(p2,B,path.join(DIR,f))];
    const s = v => JSON.stringify(v);
    const igual = s(x) === s(y);
    if (!igual) mau++;
    console.log((igual?'igual  ':'DIFERE ') + f.padEnd(22) + x.flat().length + ' celulas com texto');
    if (!igual){
      const fx=x.flat(), fy=y.flat();
      for (let i=0;i<Math.max(fx.length,fy.length);i++)
        if (fx[i]!==fy[i]){ console.log('   linha '+i+': ['+fx[i]+'] vs ['+fy[i]+']'); break; }
      console.log('   celulas: '+fx.length+' vs '+fy.length);
    }
    await p1.close(); await p2.close();
  }
  console.log(mau ? mau+' documentos com texto diferente' : 'nenhum documento perdeu ou trocou texto');
  await b.close();
})();
