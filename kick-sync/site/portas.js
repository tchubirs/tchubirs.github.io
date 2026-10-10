// Os dois caminhos da tela inicial (o dono, 10/10).
//
// Quem chega via as duas portas inteiras de uma vez: o elenco, o arquivo, a busca ao vivo, o link,
// a procura e a lista, uns dez campos para ler antes de saber por onde começar. Agora vê dois
// cartões, Evento inteiro e VOD ou poucos canais, e só os campos do que escolheu.
//
// A escolha vive no `html` (data-caminho, posta antes do primeiro desenho pelo caminho-cedo.js) e só
// tem efeito na tela inicial, que é a classe `naEntrada`: sem vídeo aberto, sem evento aberto e sem
// noite. Com o vídeo aberto o #entrada é o
// painel do botão Canais e mostra-se todo, como antes. A última escolha fica guardada neste
// aparelho; a primeira visita começa sem nenhuma.

const CHAVE = 'replay.caminho';
const PORTAS = { evento: 'caminhoEvento', vod: 'caminhoVod' };
const $ = (id) => document.getElementById(id);

/**
 * Escolher um caminho, ou nenhum (`null`). Com `lembrar`, a escolha fica para a próxima visita: só a
 * de quem clicou, e não a que o código faz sozinho para mostrar uma mensagem.
 */
export function escolherCaminho(nome, { lembrar = false } = {}) {
  const valido = nome in PORTAS ? nome : null;
  const raiz = document.documentElement;
  if (valido) raiz.dataset.caminho = valido;
  else delete raiz.dataset.caminho;
  for (const [n, id] of Object.entries(PORTAS)) $(id)?.setAttribute('aria-expanded', String(n === valido));
  if (!lembrar) return;
  try {
    if (valido) localStorage.setItem(CHAVE, valido); else localStorage.removeItem(CHAVE);
  } catch { /* janela privada */ }
}

export const caminhoAtual = () => document.documentElement.dataset.caminho || null;

export function montarPortas() {
  const palco = $('palco');
  const evento = $('evento');
  const noites = $('noites');
  const naEntrada = () => {
    document.body.classList.toggle('naEntrada', palco.hidden && evento.hidden && noites.hidden);
  };
  const vigia = new MutationObserver(naEntrada);
  for (const el of [palco, evento, noites]) vigia.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  naEntrada();

  // A guardada já foi posta no <html> pelo caminho-cedo.js; aqui acertam-se os aria-expanded.
  escolherCaminho(caminhoAtual());

  // Um clique no cartão aberto fecha-o: as duas portas voltam a estar lado a lado, sem campos.
  for (const [nome, id] of Object.entries(PORTAS)) {
    $(id).addEventListener('click', () => escolherCaminho(caminhoAtual() === nome ? null : nome, { lembrar: true }));
  }

  // O exemplo é do evento: a mensagem dele (a procurar, ninguém ao vivo) aparece na porta do evento.
  $('exemploAoVivo').addEventListener('click', () => escolherCaminho('evento'));

  // Uma mensagem escrita numa porta fechada não seria lida: um link de evento estragado, um evento
  // salvo que não existe, um canal que não carregou. A porta dela abre-se sozinha.
  const mensagens = { estadoEvento: 'evento', estadoLink: 'vod', estadoCarga: 'vod' };
  for (const [id, nome] of Object.entries(mensagens)) {
    const el = $(id);
    new MutationObserver(() => {
      if (!el.textContent.trim() || caminhoAtual() === nome) return;
      if (document.body.classList.contains('naEntrada')) escolherCaminho(nome);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }
}
