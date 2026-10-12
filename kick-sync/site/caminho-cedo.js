// A porta guardada da tela inicial, antes do primeiro desenho (portas.js). Num módulo ela só chegava
// depois de a página aparecer, e o painel abria por baixo dos cartões com a página já a ser lida:
// tudo o que vinha a seguir descia de uma vez. Um guião clássico no <head> corre antes do <body>.
// (No fim do <body> não chegava: com a máquina ocupada o navegador desenhava antes de lá chegar.)
try {
  const c = localStorage.getItem('replay.caminho');
  if (c === 'evento' || c === 'vod') document.documentElement.dataset.caminho = c;
} catch { /* janela privada */ }

// O modo simples ou o avançado (ESTUDO-FACIL.md, plano 12), também antes do primeiro desenho. Quem
// chega pela primeira vez entra no simples; quem já usava o Povix neste aparelho (há sessão ou porta
// guardada) entra no avançado, como sempre esteve. A escolha de quem tocou no botão fica guardada.
try {
  let m = localStorage.getItem('povix.modo');
  if (m !== 'simples' && m !== 'avancado') {
    m = localStorage.getItem('replay') || localStorage.getItem('replay.caminho') ? 'avancado' : 'simples';
  }
  document.documentElement.dataset.modo = m;
} catch { document.documentElement.dataset.modo = 'simples'; }
// Um projeto compartilhado (#s= ou ?s=: os canais, a noite e os acertos de quem o mandou) abre como foi
// feito, no avançado, só nesta visita: a escolha guardada não muda.
try {
  if (/[#&?]s=/.test(location.hash) || new URLSearchParams(location.search).has('s')) {
    document.documentElement.dataset.modo = 'avancado';
  }
} catch { /* endereço estranho: fica o modo de cima */ }
