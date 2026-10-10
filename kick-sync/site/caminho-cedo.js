// A porta guardada da tela inicial, antes do primeiro desenho (portas.js). Num módulo ela só chegava
// depois de a página aparecer, e o painel abria por baixo dos cartões com a página já a ser lida:
// tudo o que vinha a seguir descia de uma vez. Um guião clássico no <head> corre antes do <body>.
// (No fim do <body> não chegava: com a máquina ocupada o navegador desenhava antes de lá chegar.)
try {
  const c = localStorage.getItem('replay.caminho');
  if (c === 'evento' || c === 'vod') document.documentElement.dataset.caminho = c;
} catch { /* janela privada */ }
