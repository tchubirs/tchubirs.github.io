// Tirar um ângulo do meio da grelha: ecrã cheio, ou uma janela à parte que se
// arrasta para o segundo monitor.
//
// "Precisa de um botão igual YouTube/Twitch/Kick para deixar em tela cheia, ou
//  talvez levar aquela tela para outro monitor, abrir numa nova aba,
//  sincronizada com as outras, nem sei se é possível."
//
// É. E há uma maneira em que a sincronia sai de graça, que é a única que vale a
// pena fazer.
//
// A ideia óbvia — abrir uma aba nova com o mesmo VOD e mandar-lhe o relógio — é
// a pior das três. Descarrega o vídeo outra vez (o dobro dos dados, e ele está
// quase sempre em dados móveis), e a sincronia passa a ser um problema real:
// cada `seek` tem latência, cada buffer enche a horas diferentes, e o erro
// entre as duas cópias é exactamente o erro que esta ferramenta inteira existe
// para eliminar. Não se faz.
//
// O que se faz é MUDAR O ELEMENTO DE JANELA. O `documentPictureInPicture` do
// Chrome dá uma janela verdadeira, sem barra de endereço, sempre à frente e
// arrastável para outro monitor — e aceita que se lhe mova para dentro um nó do
// DOM. É o MESMO `<video>`, com o mesmo buffer e o mesmo `currentTime`: não há
// nada para sincronizar porque não há segunda cópia. Quando a janela fecha, o
// nó volta ao sítio.
//
// Três níveis, do melhor para o que há em todo o lado:
//
//   'documento'    Chrome/Edge no computador. O quadrado inteiro — vídeo,
//                  rótulo, som, ajuste — numa janela à parte.
//   'video'        Safari, Firefox, e o iPhone. Só a imagem, a flutuar. Também
//                  se arrasta, também não precisa de sincronia, mas os nossos
//                  controlos ficam para trás.
//   'ecraCheio'    Toda a gente. O quadrado ocupa o ecrã.
//   'ecraCheioWebkit'  O iPhone, onde `requestFullscreen` não existe num
//                  `<div>` e só o próprio `<video>` sabe ir a ecrã cheio.
//
// A decisão vive aqui, longe do DOM, porque foi assim que o `leitor.js` deixou
// de ter bugs que eu só via no telemóvel dele.

/**
 * O que este browser sabe fazer, do melhor para o pior.
 *
 * @param {object} tem - o que existe neste browser
 * @param {boolean} tem.documentoPiP - `window.documentPictureInPicture`
 * @param {boolean} tem.videoPiP - `HTMLVideoElement.prototype.requestPictureInPicture`
 * @returns {'documento'|'video'|'nada'}
 */
export function comoAbrirJanela({ documentoPiP, videoPiP } = {}) {
  if (documentoPiP) return 'documento';
  if (videoPiP) return 'video';
  return 'nada';
}

/**
 * O mesmo para o ecrã cheio.
 *
 * @param {object} tem
 * @param {boolean} tem.fullscreen - `Element.prototype.requestFullscreen`
 * @param {boolean} tem.webkitVideo - `HTMLVideoElement.prototype.webkitEnterFullscreen`
 * @returns {'ecraCheio'|'ecraCheioWebkit'|'nada'}
 */
export function comoIrAEcraCheio({ fullscreen, webkitVideo } = {}) {
  if (fullscreen) return 'ecraCheio';
  if (webkitVideo) return 'ecraCheioWebkit';
  return 'nada';
}

/** O que o browser à mão sabe fazer. Um sítio só a tocar em globais. */
export function capacidades(janela = globalThis) {
  const V = janela.HTMLVideoElement?.prototype;
  const E = janela.Element?.prototype;
  return {
    documentoPiP: typeof janela.documentPictureInPicture?.requestWindow === 'function',
    videoPiP: typeof V?.requestPictureInPicture === 'function',
    fullscreen: typeof E?.requestFullscreen === 'function',
    webkitVideo: typeof V?.webkitEnterFullscreen === 'function',
  };
}

/**
 * As folhas de estilo copiadas para a janela nova.
 *
 * Uma janela de `documentPictureInPicture` nasce vazia: o nó entra lá dentro
 * com a marcação certa e SEM UMA ÚNICA REGRA, e o que se vê é HTML por pintar.
 * Os `<link>` copiam-se por href; as regras escritas à mão dentro da página
 * (não há nenhuma hoje, mas houve) copiam-se texto a texto. Uma folha de outro
 * domínio atira ao ler `cssRules`, e por isso o `try` — sem ele, uma folha do
 * Google Fonts rebentava a abertura da janela inteira.
 */
export function copiarEstilos(documentoDe, documentoPara) {
  let quantas = 0;
  for (const folha of documentoDe.styleSheets) {
    try {
      const regras = [...folha.cssRules].map((r) => r.cssText).join('');
      const nova = documentoPara.createElement('style');
      nova.textContent = regras;
      documentoPara.head.appendChild(nova);
      quantas++;
    } catch {
      if (!folha.href) continue;
      const ligacao = documentoPara.createElement('link');
      ligacao.rel = 'stylesheet';
      ligacao.href = folha.href;
      documentoPara.head.appendChild(ligacao);
      quantas++;
    }
  }
  return quantas;
}

/**
 * Tirar o quadrado da grelha, pô-lo numa janela à parte, e devolvê-lo ao sítio
 * quando ela fechar.
 *
 * `onde` é o sítio de onde ele saiu, guardado como um comentário no DOM: sem
 * isso, "voltar ao lugar" seria "ir para o fim da grelha", e a ordem que ele
 * pediu ("os canais na ordem em que eu os adiciono") desfazia-se ao fechar uma
 * janela.
 */
export async function abrirJanela(tile, {
  janela = globalThis, largura = 960, altura = 560, aoFechar = () => {},
} = {}) {
  const modo = comoAbrirJanela(capacidades(janela));
  if (modo === 'nada') return null;

  if (modo === 'video') {
    const video = tile.querySelector('video');
    if (!video) return null;
    await video.requestPictureInPicture();
    video.addEventListener('leavepictureinpicture', () => aoFechar(), { once: true });
    return { modo: 'video', fechar: () => janela.document.exitPictureInPicture?.() };
  }

  const nova = await janela.documentPictureInPicture.requestWindow({ width: largura, height: altura });
  copiarEstilos(janela.document, nova.document);
  nova.document.body.style.margin = '0';
  nova.document.body.style.background = 'var(--video-fundo, #000)';
  nova.document.body.classList.add('janelaAparte');

  const marca = janela.document.createComment('janela');
  tile.parentNode.insertBefore(marca, tile);
  nova.document.body.appendChild(tile);

  const voltar = () => {
    if (marca.parentNode) marca.parentNode.insertBefore(tile, marca);
    marca.remove();
    aoFechar();
  };
  nova.addEventListener('pagehide', voltar, { once: true });
  return { modo: 'documento', janela: nova, fechar: () => nova.close() };
}

/** Ecrã cheio, com o caminho do iPhone por baixo. */
export async function irAEcraCheio(tile, { janela = globalThis } = {}) {
  const modo = comoIrAEcraCheio(capacidades(janela));
  if (modo === 'ecraCheio') { await tile.requestFullscreen(); return modo; }
  if (modo === 'ecraCheioWebkit') {
    const video = tile.querySelector('video');
    if (!video) return 'nada';
    video.webkitEnterFullscreen();
    return modo;
  }
  return 'nada';
}
