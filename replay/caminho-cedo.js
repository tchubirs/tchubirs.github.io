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
// Um projeto compartilhado (#s= ou ?s=: os canais, a noite e os acertos de quem o mandou) abre como foi
// feito, no avançado, só nesta visita: a escolha guardada não muda (nem o modo calculado é gravado).
let compartilhado = false;
try {
  compartilhado = /[#&?]s=/.test(location.hash) || new URLSearchParams(location.search).has('s');
} catch { /* endereço estranho: fica o modo de cima */ }
try {
  let m = localStorage.getItem('povix.modo');
  if (m !== 'simples' && m !== 'avancado') {
    m = localStorage.getItem('replay') || localStorage.getItem('replay.caminho') ? 'avancado' : 'simples';
    // Grava o modo calculado na primeira vez, para que o app depois gravar replay.caminho não mude o modo no F5.
    // Se a escrita falhar (quota), o modo calculado continua valendo, só não fica guardado.
    if (!compartilhado) {
      try { localStorage.setItem('povix.modo', m); } catch { /* quota: sem guardar */ }
    }
  }
  document.documentElement.dataset.modo = m;
} catch { document.documentElement.dataset.modo = 'simples'; }
if (compartilhado) document.documentElement.dataset.modo = 'avancado';
