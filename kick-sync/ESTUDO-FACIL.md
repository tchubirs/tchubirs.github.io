# Povix para quem nunca usou (estudo de 12/10/2026)

O pedido do dono: a esposa dele, que trabalha clipando, usou o Povix hoje e "não sabia mexer em nada, não
entendia nada". O Povix tem de ser "o braço direito, esquerdo, os olhos e os ouvidos de um clipador" e
"100% acessível a pessoas muito burras, isso é obrigatório".

Traduzido em meta: uma clipadora que nunca viu o Povix, talvez no celular, sai da tela inicial com um clipe
pronto para postar, baixado, quase sem decidir nada e quase sem ler.

Resposta curta: hoje não sai. O Povix já faz sozinho boa parte do trabalho (acha picos do chat, ouve tiros,
acha a webcam, gera legenda, corta sem baixar a live inteira), mas cada uma dessas coisas está atrás de um
botão, de uma palavra técnica ou de uma escolha. O plano abaixo junta tudo atrás de uma caixa e um botão.

## Como foi feito

- Site local (`kick-sync/site`), Chromium do Playwright, em português, com dados reais da Kick (o site lê a
  Kick direto). Duas telas: computador 1366x768 e celular 390x844 (toque).
- Três tarefas, sempre fazendo o que uma pessoa sem experiência faria primeiro:
  - A: "tenho o nome do streamer (xguiry) ou o link, quero os melhores clipes";
  - B: "tenho o link do Abisal (`?e=abisal`), quero os melhores momentos da noite";
  - C: "quero um clipe em pé, 9:16, para o TikTok".
- As fotos estão em `kick-sync/prints-facil/` (`pc-` é o computador, `tel-` é o celular).
- Limite do teste: o Chromium do Playwright não toca H.264 nem AAC (conferido: `canPlayType` vazio e
  `AudioDecoder` sem suporte). Por isso o vídeo aparece preto, a busca pelo som não anda e o botão
  "Exportar 9:16" fica desligado. Num Chrome normal isso funciona. O corte 16:9 funcionou (clipe de 20 s
  baixado em 6 s). O resto do estudo (textos, passos, esperas, escolhas) vale igual.

## Tarefa A: nome do streamer ou link

| Tela | O que ela vê | O que ela tenta | Onde trava | Palavras difíceis | Escolhas | Toques e esperas |
|---|---|---|---|---|---|---|
| Início (`pc-01-inicio.png`, `tel-01-inicio.png`) | Frase "Reveja partidas por vários ângulos", 3 passos ("Cole os canais", "Confira alinhado", "Marque e exporte"), dois cartões grandes: "Evento inteiro" e "VOD ou poucos canais", e um link "Ver um exemplo: o Rust ao vivo agora". | Procurar onde escrever o nome. Não tem caixa nenhuma na tela. | Tem de escolher entre dois cartões antes de ver qualquer caixa. Nenhum dos dois diz "streamer". No celular os passos 2 e 3 perdem o texto e ficam só números. | ângulos, lances, canais, alinhado, exporte, VOD, evento, sessão, .csv, .tsv | 1 (qual cartão) | 1 toque |
| Cartão "VOD ou poucos canais" aberto (`pc-02-vod-aberto.png`) | Três caixas: "Colar um link da Kick" com botão "Abrir", "Procurar um canal", "Canais desta noite (um por linha)", e o botão "Carregar". | Escrever "xguiry" na primeira caixa (é a primeira e a maior) e tocar "Abrir". | Recusado: "Não entendi esse link. Cole o endereço de um clipe, de um VOD ou de um canal da Kick." (`tel-05-nome-na-caixa-do-link.png`). O mesmo com o link da aba de vídeos do canal, `kick.com/xguiry/videos`, que é o que a pessoa copia da Kick (`pc-32-link-videos-recusado.png`), e com `kick.com/xguiry/clips`. Só `kick.com/xguiry` ou o link de um vídeo funcionam. | link, VOD, canal, "Canais desta noite" | 3 caixas, nenhuma marcada como "comece aqui" | 2 a 4 toques até achar a caixa certa |
| Procurar canal (`tel-03-procurar-canal.png`, `pc-04-canal-escolhido.png`) | Sugestões boas, com seguidores ("xguiry 18,3 mil seguidores"). | Tocar no nome e esperar abrir. | Tocar no nome não abre nada: o nome só vai para a caixa da direita. Tem de achar "Carregar" embaixo. | Carregar | 0 | 2 toques |
| Vídeo aberto (`pc-06-carregado-20s.png`, `tel-07-palco-inteira.png`) | Abre a live mais recente, no começo (18:32 de uma live de 4 h). Uns 25 controles: data "2026-10-11, 18:32 até 22:55, 1 canal", "Relógio exato: 1 ângulos no segmento", "Compartilhar projeto", "1 transmissões", olho, tela cheia, janela, "Sincronia - 0.0s +", 3s, "Criar clipe", "Marcar entrada", "Marcar saída", "Marcar kill", abas "Montagem" e "Exportar", "Ler chat", "Detectar lances", "experimental", "Recomeçar", zoom, -5 min, +1 min. | Procurar "melhores momentos". | Nada diz "os melhores momentos estão aqui". A lista "Melhores lances" existe só no modo evento; com um streamer só, ela não aparece. No celular "Ler chat" e "Detectar lances" ficam no fim da página, embaixo de "Montagem". | ângulos, segmento, transmissões, sincronia, montagem, kill, lances, exportar, experimental, projeto | ela teria de saber que precisa de "Detectar lances" | 10 s de espera |
| Detectar lances (`pc-08-detectar-passo1.png`, `pc-10-detectar-filtros.png`, `tel-10-detectar-filtros.png`) | "passo 2 de 4: um trecho ou tudo?", depois "passo 4 de 4" (o 3 some), 5 caixas de marcar com explicações técnicas ("foguete, C4: som forte e grave que dura mais que um tiro"), uma caixa desligada que diz "Ainda não existe", "Mais opções", aviso laranja "Experimental: confira cada lance achado antes de exportar". | Tocar "Tudo" e "Detectar". | Vê 5 opções e não sabe quais marcar. "Experimental" assusta. | detecção, filtro, PvP, trecho, sensibilidade, margens | 2 a 6 | 3 toques |
| Esperando (`pc-12b-detectar-2min.png`) | "Lendo o chat de xguiry para achar os picos: 15%" (80 s), depois "Ouvindo xguiry: 0 s de 43 min, 20 MB, faltam uns 1 min". | Esperar. | Neste navegador a frase "faltam uns 1 min" ficou parada 7 minutos, sem aviso de erro. Num navegador que não lê o som da Kick ela fica para sempre assim. | picos, MB | 0 | 80 s mais tempo sem fim |
| Resultado | Losangos laranja na linha do tempo (`pc-12b-detectar-2min.png`, na faixa embaixo). | Achar uma lista de clipes. | Não há lista nem botão "Baixar". Tem de tocar em cada losango, assistir, tocar "Criar clipe", ajustar e exportar. | | uma por clipe | 4 ou mais toques por clipe |

Total da tarefa A até o primeiro clipe: uns 12 toques, 3 telas com escolhas, mais de 2 minutos de espera,
e ela ainda tem de assistir cada momento para decidir.

## Tarefa B: o link do Abisal

| Tela | O que ela vê | Onde trava | Palavras difíceis | Toques e esperas |
|---|---|---|---|---|
| 3 s (`pc-20-abisal-3s.png`) | Um quadro grande vazio, e um texto pequeno "Lendo os canais na Kick: 8 de 144". | Parece quebrado. | canais | 0 |
| 43 s (`pc-21-abisal-mapa.png`, `tel-21-abisal-mapa.png`) | O mapa: 144 linhas, uma por streamer, barras azuis no tempo. Botão vermelho "Ver ao vivo agora" (o evento foi há uma semana, mas 8 dos streamers estão ao vivo hoje em outra coisa). Ordem "ao vivo agora". Em vermelho, 13 nomes e "+39: existe, mas não guarda VODs. Não dá para fazer nada deste lado". Zoom, "Evento inteiro", "Adicionar streamer", "Adicionar lista", "Importar mortes", "Ordem das faixas". | O vermelho parece erro dela. O botão vermelho leva para outra coisa (ao vivo de hoje). Não sabe o que é o mapa. | VODs, faixas, zoom, evento inteiro, mortes, time | 43 s |
| Melhores lances vazio (`pc-22b-abisal-clique-outra-vez.png`) | Embaixo do mapa: "Chat lido em 0 de 34 canais", "Som ainda não ouvido neste trecho: abra um lance e use Detectar lances", "Nenhuma kill marcada: use Marcar kill no vídeo", e o botão "Ler o chat de todos (34 canais, 11 h 43)". | Toca no botão e nada começa: aparece "pode levar minutos. Clique outra vez para ler". Tem de tocar de novo. | chat lido, trecho, lance, kill | 2 toques, rolar a página |
| Lendo (2 min 30 s) | "Lendo o chat: sirmatix600 (7 de 34)". | Esperar. | | 150 s |
| Lista (`pc-24-abisal-melhores-lista.png`) | 225 "lances". Cada um: hora, "10 pontos", nome do canal, "chat 17 vezes o normal", e "Abrir lance", "Marcar", "Descartar". | Sem imagem, sem título, sem "Baixar". O primeiro da lista é o momento em que o som do xguiry caiu: o chat diz "esta muted no?", "se corto todo en 1 segundo", "ThisIsFine". Ou seja, o melhor momento da noite é uma falha técnica. | lance, pontos, marcar | |
| Abrir lance (`pc-25-abisal-clicou-lance.png`) | O mesmo vídeo cheio de botões da tarefa A, com o chat ao lado. | Ainda falta "Criar clipe", ajustar, exportar. | | 3 toques |

Total da tarefa B: uns 7 toques, rolar a página, 3 a 4 minutos de espera, e o primeiro resultado é ruim.

## Tarefa C: um clipe em pé para o TikTok

Janela "Ajustar clipe" (`pc-31-criar-clipe.png`, `tel-31-criar-clipe.png`, `tel-31-criar-clipe-inteira.png`):

- O botão grande e azul é "Exportar 16:9" (deitado). O que ela quer, "Exportar 9:16", é o botão cinza ao lado,
  com o aviso "Converte o clipe de novo: demora o tempo do clipe".
- A webcam: "Câmera" e 4 ícones sem nome, e "Achar webcam" em letra apagada. O Povix acha o rosto sozinho
  (`rosto.js`), mas só depois que ela escolhe o segundo de dois ícones sem nome embaixo da prévia em pé.
- "Chat no vídeo" e "Legenda da fala" vêm desligados. A legenda pede marcar, escolher idioma, tocar "Gerar
  legenda" e revisar.
- "Título do clipe" vem vazio. O arquivo sai com o nome `xguiry__20261010-000936Z.mp4` (hora em UTC com "Z").
- No celular a janela tem 1224 px de altura: a prévia, as opções e o botão certo pedem rolagem dentro dela.
- Depois de exportar, o arquivo baixa sozinho e sem aviso na tela: só aparece um "1" na aba "Exportar"
  (`pc-33-exportar-fila.png`).

Palavras difíceis: 16:9, 9:16, câmera (é a webcam), modelo, exportar, converte, início e fim com setas duplas.
Escolhas: formato, posição da webcam, chat sim ou não, legenda sim ou não, idioma, título. Toques: no mínimo 3
(Criar clipe, ícone do modelo, Exportar 9:16), na prática 6 a 10.

## Celular, além do que já foi dito

- Alvos pequenos demais para o dedo (medidos): linha do tempo 18 px, zoom 26 a 30 px, botões de cima 36 px,
  "Ler chat" e "Detectar lances" 32 px. O mínimo confortável é 44 a 48 px.
- O texto de erro do vídeo fica por baixo dos botões "Sincronia - 0.0s +" (`tel-07-palco.png`).
- O link da Twitch vira só um ícone, e os passos 2 e 3 viram só números.
- As teclas de atalho (C, I, O, M, A, D) aparecem nos botões, e não servem para nada no celular.
- O botão "?" abre a tabela de atalhos de teclado (`pc-30-ajuda.png`): para quem pede ajuda, é a pior
  resposta possível.
- Não há rolagem para os lados (bom), mas a tela de vídeo tem 1300 px de altura e o que importa fica no fim.

## Os 10 maiores travamentos

1. A tela inicial pede uma escolha antes de qualquer caixa ("Evento inteiro" ou "VOD ou poucos canais"), e
   nenhuma das duas usa as palavras dela. `pc-01-inicio.png`, `tel-01-inicio.png`.
2. Escrever o nome do streamer na caixa do link dá erro; o link da aba de vídeos da Kick também; o nome
   "abisal" também. `tel-05-nome-na-caixa-do-link.png`, `pc-32-link-videos-recusado.png`.
3. Escolher o streamer na lista de sugestões não abre nada: falta achar "Carregar". `pc-04-canal-escolhido.png`.
4. Depois de abrir, uns 25 controles e nenhuma lista de melhores momentos para um streamer só. Ela tem de
   saber que precisa de "Detectar lances". `pc-06-carregado-20s.png`, `tel-07-palco-inteira.png`.
5. "Detectar lances" tem 4 passos, 5 caixas de marcar com explicações técnicas e a palavra "experimental", e o
   resultado são losangos na linha do tempo, sem lista e sem "Baixar". `pc-08-detectar-passo1.png`,
   `pc-10-detectar-filtros.png`, `pc-12b-detectar-2min.png`.
6. Uma espera que não anda e não avisa ("faltam uns 1 min" por 7 minutos). `pc-12b-detectar-2min.png`.
7. No Abisal: 43 s com a tela vazia, uma lista vermelha de nomes com "Não dá para fazer nada deste lado", e o
   botão principal é "Ver ao vivo agora", que leva para outra coisa. `pc-20-abisal-3s.png`, `pc-21-abisal-mapa.png`.
8. "Ler o chat de todos" pede um segundo toque, leva 2 min 30 s, e devolve 225 itens só pelo chat, o primeiro
   sendo uma queda de som; nenhum tem imagem, título ou "Baixar". `pc-22b-abisal-clique-outra-vez.png`,
   `pc-24-abisal-melhores-lista.png`.
9. Para o TikTok o botão principal sai deitado; o em pé é o secundário; o rosto do streamer, a legenda e o
   título estão desligados ou atrás de ícones sem nome. `pc-31-criar-clipe.png`, `tel-31-criar-clipe.png`.
10. Palavras técnicas em toda parte (VOD, ângulo, sincronia, montagem, segmento, lance, kill, trecho, faixa,
    16:9), e a ajuda é uma tabela de teclas. `pc-30-ajuda.png`.

## Os outros nos primeiros 2 minutos

| | O que a pessoa faz | O que recebe |
|---|---|---|
| Opus Clip | Cola um link, escolhe (se quiser) a duração, toca "Get Clips". Uns 3 a 5 min para 30 min de vídeo. | Lista de clipes, cada um com título, legenda e uma nota de 0 a 100 ("Virality Score"); ordena pela nota, baixa ou agenda. |
| Eklipse | Liga a conta da Kick uma vez. | Clipes dos vídeos gravados aparecem sozinhos (20 a 60 min); botão "Convert to TikTok/Shorts/Reels" com legenda automática e o nome do canal. |
| StreamLadder | Cola o link de um clipe da Kick, escolhe um modelo (webcam em cima, jogo embaixo). | O clipe em pé com a webcam enquadrada (o vendedor diz que acha a webcam sozinho); ClipGPT acha momentos nos vídeos gravados. |
| CapCut | Envia o vídeo, toca "Long video to shorts" (AutoCut no celular). | Clipes curtos com legenda automática; o redimensionamento em pé segue as pessoas na tela. |
| Povix hoje | Escolhe cartão, acha a caixa certa, "Carregar", "Detectar lances", 2 a 6 escolhas, espera. | Losangos na linha do tempo ou uma lista sem imagem e sem "Baixar". |

O que os quatro têm em comum: uma entrada só (colar ou ligar a conta), um botão, e o resultado é uma lista de
clipes já prontos, em pé, com legenda e título, cada um com "baixar". Ninguém mostra linha do tempo antes do
resultado. O que o Povix tem e eles não: é de graça, não precisa enviar nada, junta a tela de vários
streamers no mesmo instante, sabe das mortes do servidor e acha o tiroteio no segundo certo (ver
`COMPARA-OPUS.md`: o Povix pegou uma luta que o Opus pulou). A vantagem existe, mas está escondida.

Fontes (pesquisadas em 12/10/2026; quase todas são páginas dos próprios vendedores ou guias de terceiros):
- Opus Clip: [opus.pro, AI viral clip maker](https://opus.pro/tools/ai-viral-clip-maker),
  [aiindigo, primeiros passos no OpusClip](https://aiindigo.com/tutorials/getting-started-with-opus-clip-transform-long-videos-into-viral-shorts),
  [marcandrews.com, guia de 2026](https://marcandrews.com/?p=3047).
- Eklipse: [como virar clipador da Kick com o Eklipse](https://eklipse.gg/help/how-to-become-a-kick-clipper-with-eklipse/),
  [clipar a Kick com IA](https://blog.eklipse.gg/tools/how-to-clip-kick-stream-with-ai.html),
  [Kick para TikTok](https://eklipse.gg/?p=6847).
- StreamLadder: [análise de 2026, vidpros](https://vidpros.com/streamladder-review-2026/),
  [ficha na GetApp](https://www.getapp.ca/software/2243883/streamladder).
- CapCut: [vídeo longo para curto](https://www.capcut.com/resource/turn-long-video-to-short-video-with-ai),
  [AutoCut no celular](https://www.capcut.com/resource/autocut-for-videos).

## O trabalho que ainda é dela e que a máquina pode fazer

| Trabalho | Hoje no Povix | Já é automático, mas escondido? | Como deve ficar |
|---|---|---|---|
| Achar os momentos | Ela toca "Detectar lances" ou "Ler o chat de todos" e escolhe filtros. | Sim: picos do chat (`chat.js`, `melhores.js`), tiros, explosões e gritos (`tiros.js`, `explosoes.js`, `gritos.js`), mortes do servidor (`mortes.js`). Tudo atrás de botões. | Começa sozinho assim que ela cola o nome ou o link. Primeiro o chat (rápido), depois o som, só nos melhores trechos do chat. |
| Saber qual é o melhor | Lista de 225 por "pontos" do chat; o primeiro foi uma queda de som. | A soma existe (`melhores.js`), mas usa quase só o chat. | Juntar chat, som e mortes numa nota simples; descontar picos de "muted", "audio", "lag", "caiu", "se cayó"; mostrar os 5 a 10 melhores primeiro. |
| Escolher a tela de quem | Ela escolhe o canal. No evento, "Achar quem mais estava no lance" é um botão. | Sim: `cena.js` acha quem ouviu o mesmo som. | Nos 3 melhores do evento, já trazer a outra visão (quem morreu) como opção "com a tela do outro". |
| Enquadrar a webcam no 9:16 | Ícones sem nome e "Achar webcam". | Sim: `rosto.js` acha o rosto, mas só no modelo de duas partes. | O modelo de duas partes com o rosto achado é o padrão do 9:16; se não achar rosto, corta o meio do jogo sem perguntar. |
| Legenda | Desligada; marcar, idioma, gerar, revisar. | Sim: `legenda.js`, `legenda-voz.js`, idioma automático da live. | Ligada por padrão no 9:16 do modo simples (no computador); no celular, um botão "pôr legenda" no cartão, porque pesa. |
| Título | Vazio. | Não. | Título proposto pelo que o chat escreveu e pelo jogo: "xguiry no Abisal: raid às 22:12". Editável com um toque. |
| Texto do post | Não existe. | Não. | Botão "Copiar texto do post": título, nome do streamer, `#rust #kick`, link da live. |
| Formato | Padrão deitado. | O 9:16 existe (`retrato.js`). | Padrão em pé. Deitado fica como segunda opção. |
| Começo e fim do clipe | Margens 5 s antes, 2 s depois; janela com setas duplas. | Sim. | Fica como está, escondido. Só "um pouco antes" e "um pouco depois" se ela abrir "ajustar". |
| Acertar o tempo entre telas | Botão "Sincronizar por áudio" e "Sincronia - 0.0s +". | Sim, e já sai certo ("Relógio exato"). | Some do modo simples. |
| Nome do arquivo | `xguiry__20261010-000936Z.mp4`. | | `xguiry - raid as 22h12 - 10-10.mp4`, na hora do aparelho. |
| Guardar antes de sumir | "some em 30 dias", "Guardar todos agora". | Sim (`prazo.js`). | Uma frase só no cartão quando faltar menos de 3 dias: "Este vídeo some da Kick em 2 dias. Baixe hoje." |

## O plano, do que mais ajuda para o que menos ajuda

Cada item diz o tamanho do trabalho (pequeno, médio, grande) e os arquivos. Nada do que existe é apagado:
tudo o que sai do modo simples continua em "Modo avançado", igual a hoje.

Atenção: outro trabalho em curso mexe em `morte.js`, `mortes*.js`, `melhores.js` e `mapa.js`. Os itens que
tocam nesses arquivos devem esperar esse trabalho entrar.

### 1. Uma caixa e um botão na tela inicial (médio)

O que ela vê ao abrir:

> **Povix**
> Cole o nome do streamer, o link do vídeo ou o nome do evento.
> [ caixa grande ]
> [ Achar os melhores momentos ] (botão grande, largura toda no celular)
> Exemplos: xguiry, kick.com/xguiry, abisal
>
> Modo avançado (link pequeno, no fim)

- A caixa entende tudo sozinha, nesta ordem: nome de evento salvo (`eventos/<nome>.json`, como o `?e=`);
  qualquer link da Kick (canal, aba de vídeos, aba de clipes, vídeo, clipe); nome solto de canal (vai à
  Kick, abre a live gravada mais recente); vários nomes separados por vírgula ou linha (evento pequeno).
- Enquanto ela escreve, as sugestões de canal com seguidores aparecem embaixo (já existem); tocar numa abre
  direto, sem "Carregar".
- Os dois cartões, a lista "um por linha", o arquivo .csv e o exemplo ao vivo vão para "Modo avançado".
- O link `?e=abisal` cai direto na tela 3 (a lista), nunca no mapa.
- Arquivos: `site/index.html`, `site/estilo.css`, `site/idiomas.js`, `site/portas.js`, `site/caminho-cedo.js`,
  `site/app.js`, `site/evento-ui.js`, e um módulo novo `site/simples.js` para não engordar o `app.js`.

### 2. A lista de clipes prontos, com "Baixar" em cada um (grande)

Depois do botão, uma tela só:

- Espera com frases simples e uma barra: "Achando o vídeo", "Lendo o chat", "Ouvindo os tiros". Os primeiros
  cartões aparecem assim que o chat termina (uns 30 a 80 s); os do som entram depois, sem a lista pular.
- Cada cartão: uma imagem do momento (um quadro do vídeo), o título proposto, uma linha de motivo ("o chat
  explodiu e teve tiroteio"), a duração, e dois botões: **Baixar para TikTok** (grande, em pé, com rosto e
  legenda) e "Baixar deitado" (pequeno). Toque na imagem: o clipe toca ali mesmo.
- "Não gostei" tira o cartão e traz o próximo. "Mostrar mais" no fim.
- Nota simples por cartão: "muito bom", "bom", "talvez", com o motivo escrito (o `melhores.js` já explica o
  motivo; manter isso, que é melhor do que o número sem motivo do Opus).
- Vale para um streamer só (hoje a lista só existe no evento) e para o evento.
- Arquivos: `site/simples.js` (novo), `site/melhores.js`, `site/momentos.js`, `site/app.js`, `site/chat.js`,
  `site/procurar-momentos.js`, `site/baixar.js`, `site/idiomas.js`, `site/estilo.css`.

### 3. Em pé com o rosto do streamer como padrão (médio)

- No modo simples o 9:16 sai sempre no modelo de duas partes, com o rosto achado por `rosto.js`; se não achar,
  corta o centro do jogo, sem perguntar e sem aviso.
- Na janela "Ajustar clipe" do modo avançado, o botão grande passa a ser o formato que ela usou da última vez,
  e os ícones de modelo ganham nome ("Só o jogo", "Rosto em cima, jogo embaixo").
- Arquivos: `site/retrato.js`, `site/rosto.js`, `site/app.js`, `site/index.html`, `site/idiomas.js`.

### 4. Trocar as palavras (pequeno)

Na tela, em português (e o mesmo no espanhol e no inglês do `idiomas.js`):

| Hoje | Passa a ser |
|---|---|
| VOD | vídeo gravado (ou "live gravada") |
| POV, ângulo, ângulos | tela de (nome), telas |
| Evento inteiro (cartão) | Vários streamers (evento, campeonato) |
| VOD ou poucos canais | Um streamer |
| canais | streamers |
| Carregar | Abrir |
| Lance, lances | momento, momentos |
| Melhores lances | Melhores momentos |
| Detectar lances | Achar momentos |
| Ler chat | (some: é automático) |
| pico de chat, "chat 17 vezes o normal" | o chat explodiu |
| Marcar kill | Guardar este momento |
| Montagem | Meus clipes |
| Exportar, Exportar montagem | Baixar, Baixar todos |
| Exportar 16:9 / Exportar 9:16 | Baixar deitado (YouTube) / Baixar em pé (TikTok, Reels, Shorts) |
| Marcar entrada / Marcar saída | Começo aqui / Fim aqui |
| Criar clipe | Fazer clipe daqui |
| Sincronizar por áudio, Sincronia, Relógio exato, segmento | (some do modo simples) |
| faixa, faixas, ordem das faixas | linha, linhas, ordem |
| elenco | lista de streamers |
| margens | segundos antes e depois |
| experimental | pode errar (ou nada) |
| Descartar | Não quero |
| Abrir lance | Ver |
| Compartilhar projeto | Mandar link |
| Recomeçar | Começar de novo |
| Câmera (na janela do clipe) | Rosto do streamer |
| fuso, UTC | (some: sempre a hora do aparelho) |
| pontos | muito bom, bom, talvez |
| "some em 30 dias" | some da Kick em 30 dias |

"Kill" fica: clipador de jogo fala assim. Arquivos: `site/idiomas.js`, `site/index.html`.

### 5. Esperas e erros que dizem o que fazer (pequeno a médio)

| Hoje | Passa a ser |
|---|---|
| "Não entendi esse link. Cole o endereço de um clipe, de um VOD ou de um canal da Kick." | Some nos casos do nome solto e da aba de vídeos (item 6). No resto: "Isso não é um link da Kick. Na Kick, abra a live ou o vídeo, copie o endereço lá em cima e cole aqui." |
| Nome que não existe | "Não achei ninguém com esse nome na Kick. Confira como está escrito depois de kick.com/" e as sugestões parecidas embaixo. |
| Canal sem vídeo gravado | "Esse streamer não tem vídeo gravado na Kick agora. A Kick apaga depois de 7 a 30 dias." |
| "o vídeo não carregou: clique no quadro para tentar de novo" | "O vídeo não abriu. Toque aqui para tentar outra vez." Se o navegador não toca vídeo da Kick: "Este navegador não abre os vídeos da Kick. Abra o Povix no Chrome." (testar `canPlayType` uma vez ao abrir) |
| "Ouvindo xguiry: 0 s de 43 min, 20 MB, faltam uns 1 min" parado | Depois de 30 s sem andar: "O som está demorando. Os momentos do chat já estão prontos; os de tiro chegam quando der." Se o navegador não lê o som: "Este navegador não consegue ouvir a live. Os momentos vêm só do chat." |
| "Ler 11 h 43 de chat de 34 canais pode levar minutos. Clique outra vez para ler." | Sem segundo toque. "Procurando os melhores momentos. Uns 3 minutos. Pode deixar a tela aberta." |
| Lista vermelha "existe, mas não guarda VODs. Não dá para fazer nada deste lado" | No modo simples, nada. No avançado, cinza: "13 streamers não deixam o vídeo gravado na Kick e ficam de fora." |
| "Lendo os canais na Kick: 8 de 144" num quadro vazio | Barra com "Abrindo o evento: 8 de 144 streamers", no meio da tela. |
| "Ainda não há lances neste trecho. Leia o chat de todos, ou escolha um momento no mapa" | Não existe no modo simples (a busca começa sozinha). Se a busca não achar nada: "Não achei momentos fortes nesse vídeo. Tente outra live do mesmo streamer." com as lives anteriores embaixo. |
| "Nenhuma kill marcada. Vá até o momento e clique em Marcar kill." | No modo simples, nada. |
| Baixou sem aviso | "Pronto. O clipe está na pasta Downloads." No celular: botão "Salvar no celular ou mandar para o TikTok" que abre a folha de compartilhar do aparelho (`navigator.share` com o arquivo). |

Arquivos: `site/idiomas.js`, `site/app.js`, `site/evento-ui.js`, `site/kick.js`, `site/baixar.js`.

### 6. Aceitar qualquer coisa que ela colar (pequeno)

- `lerLinkKick` em `site/kick.js` só aceita `kick.com/<canal>` com uma parte, vídeo e clipe. Aceitar também
  `kick.com/<canal>/videos`, `/clips`, `/about`, links com `?` no fim, links de celular (`m.kick.com`), o nome
  solto sem `kick.com`, e o `@` na frente.
- Nome de evento salvo escrito na caixa ("abisal") abre o evento.
- Arquivos: `site/kick.js`, `site/app.js`, `site/evento-ui.js`, e um teste em `test/` (quando o outro trabalho
  liberar a pasta).

### 7. Regras para o celular (médio)

- Uma coluna. A primeira tela inteira cabe sem rolar: frase, caixa, botão.
- Todo botão com pelo menos 48 px de altura e o principal com a largura toda.
- Letra de caixa de texto com 16 px ou mais (abaixo disso o iPhone dá zoom sozinho).
- Nada que dependa de passar o mouse por cima (os `title`): o que importa fica escrito.
- Teclas de atalho (`kbd`) escondidas em aparelho de toque.
- Linha do tempo, zoom, mapa e "Sincronia" só no modo avançado.
- Botão "Baixar" sempre visível no cartão, sem abrir janela.
- A janela "Ajustar clipe" no celular: prévia em pé em cima, um botão "Baixar em pé" fixo embaixo, e o resto
  dobrado em "Mais ajustes".
- Arquivos: `site/estilo.css`, `site/tokens.css`, `site/index.html`.

### 8. Título e texto do post automáticos (médio)

- Título a partir das palavras mais repetidas do chat no pico (já lidas), do jogo do evento e da hora:
  por exemplo "xguiry no Abisal: raid às 22h12". Sem palavrão e sem nome de outro
  usuário do chat.
- Botão "Copiar texto do post" no cartão.
- Arquivos: `site/simples.js`, `site/clipe.js` (`nomeDoClipe` com hora do aparelho e sem o "Z"),
  `site/chat-clipe.js`, `site/idiomas.js`.

### 9. Lista sem falsos "melhores" (pequeno a médio)

- Descontar pico de chat cheio de "muted", "mute", "audio", "sin audio", "se cayó", "caiu", "lag", "f5",
  "volume", "ThisIsFine" seguidos: foi o caso do primeiro lugar do Abisal.
- Dar mais peso quando chat e som ou morte batem no mesmo instante.
- Arquivos: `site/melhores.js`, `site/chat.js` (esperar o outro trabalho em `melhores.js`).

### 10. Legenda ligada por padrão no em pé (médio)

- No computador, o "Baixar para TikTok" já sai com legenda (idioma da live). No celular, o cartão mostra
  "pôr legenda" como opção, porque o leitor de voz pesa.
- Arquivos: `site/legenda.js`, `site/legenda-voz.js`, `site/simples.js`.

### 11. Ajuda da primeira vez (pequeno)

- Sem tour e sem janelas por cima. Uma frase embaixo da caixa, só na primeira visita: "Cole aqui o nome de
  quem você clipa. O Povix acha os melhores momentos e deixa prontos para baixar."
- Na lista, uma frase em cima do primeiro cartão, só na primeira vez: "Toque em Baixar para TikTok. Não
  precisa ajustar nada."
- O "?" abre uma página curta com 3 frases e um vídeo de 20 s; os atalhos vão para um link dentro dela.
- Arquivos: `site/index.html`, `site/idiomas.js`, `site/app.js`, `site/atalhos-painel.js`.

### 12. Modo avançado (pequeno)

- Um link "Modo avançado" no fim de cada tela do modo simples, e "Modo simples" no topo do avançado. O
  aparelho lembra a escolha (`localStorage`, com o cuidado de sempre de janela privada).
- No avançado fica tudo o que existe hoje, igual: mapa, linha do tempo, vários ângulos, montagem, sincronia,
  mortes, nomes na tela, filtros da busca, chat no vídeo, margens, atalhos.
- Quem já usa o Povix (o dono) entra no avançado da primeira vez, se já houver sessão salva no aparelho.
- Arquivos: `site/app.js`, `site/portas.js`, `site/index.html`, `site/estilo.css`.

### 13. Mapa do evento mais calmo (pequeno, só no avançado)

- Evento que já acabou: "Ver ao vivo agora" deixa de ser o botão vermelho principal, e a ordem padrão volta a
  "por time".
- Tirar o segundo toque do "Ler o chat de todos".
- Arquivos: `site/evento-ui.js`, `site/mapa.js` (esperar o outro trabalho).

## O teste com quem nunca usou

Para o dono fazer com a esposa (e depois com mais duas ou três pessoas que clipam), antes e depois de cada
mudança grande.

Como fazer:

- No celular dela, com o navegador que ela usa. Gravar a tela (o gravador do próprio celular) e a voz.
- Pedir que ela fale em voz alta o que está pensando ("estou procurando onde...").
- O dono não ajuda e não aponta. Se ela ficar parada 60 s, anota e dá a menor dica possível ("onde você
  escreveria o nome?"), e conta como uma ajuda.
- Cada tarefa é dita uma vez, em voz alta, com as palavras abaixo. Não mostrar o Povix antes.

As 5 tarefas:

1. "Abre o Povix e me mostra os melhores momentos do xguiry de ontem." (mandar só o endereço do site)
2. "Baixa o melhor desses para o celular, pronto para postar."
3. "Agora quero esse mesmo em pé, para o TikTok, com o rosto do streamer aparecendo e legenda."
4. "Abre este link do Abisal (mandar pelo WhatsApp) e me traz o melhor momento da noite."
5. "Esse não ficou bom. Acha outro e baixa."

O que anotar em cada tarefa:

| O que medir | Meta do modo simples |
|---|---|
| Tempo do toque inicial até o arquivo baixado | menos de 3 min (contando a espera do Povix) |
| Número de toques | 3 ou menos na tarefa 1 e 2 juntas |
| Primeiro toque: onde foi | na caixa ou no botão grande |
| Palavras que ela leu em voz alta e não entendeu | nenhuma |
| Perguntas feitas ao dono | nenhuma |
| Ajudas dadas | nenhuma |
| Desistiu? | não |
| O arquivo abriu na galeria e no TikTok? | sim, em pé, com rosto e legenda |
| No fim: "De 1 a 5, quão fácil foi?" e "O que você mudaria?" | 4 ou 5 |

Depois de cada sessão: anotar os 3 piores momentos do vídeo gravado e corrigir esses antes de qualquer outra
coisa. Repetir com a mesma pessoa só depois de uma semana (para ela esquecer), e sempre com uma pessoa nova
também.
