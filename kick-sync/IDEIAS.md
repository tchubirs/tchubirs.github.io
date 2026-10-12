# Ideias para o Povix: o que os outros fazem e o que os clipadores pedem

Pesquisa de 11/10/2026, só na web, sem mexer no código. Cada afirmação tem um número que leva à fonte no fim.
O que não deu para conferir na fonte está marcado como "não conferido". Quase todo o material sobre as
ferramentas pagas vem do site da própria empresa ou de sites que vendem um rival: é o que elas dizem de si.

Limite desta pesquisa: o Reddit não abriu daqui (nem pela busca nem direto). As queixas dos clipadores vêm de
resumos que citam Reddit e Trustpilot [23, 24], das páginas de ajuda da Kick e das notas das extensões. Vale
confirmar com os clipadores do evento, no Discord, antes de construir.

## Resumo em cinco linhas

1. Mortes do servidor no mapa: o servidor de Rust do evento já sabe quem matou quem e quando. Ler esse registro
   vale mais que qualquer IA que tenta ver a kill na tela.
2. Lista única dos melhores lances do evento, com a nota explicada (chat, tiros, quantos POVs ouviram, mortes).
3. Webcam achada sozinha no 9:16, com o encaixe guardado por streamer.
4. Legenda gerada no aparelho e fácil de corrigir, com o nome de quem fala, porque cada POV tem o próprio microfone.
5. Pacote para o editor: todos os ângulos do lance já sincronizados num arquivo que o Premiere e o DaVinci abrem.

## 1. As 10 melhorias, por valor para o clipador e esforço

Ordem: primeiro o que dá mais ao clipador com menos trabalho. Esforço: pequeno (até 2 dias), médio (até uma
semana), grande (mais que isso). Estimativas minhas.

### 1. Mortes do servidor como marcas no mapa (valor muito alto, esforço pequeno a médio)

- **Quem faz:** o Medal grava kills sozinho em jogos com suporte, com modelos por jogo [16]. O Powder treinou mais
  de 40 modelos, um por jogo [17]. O Eklipse diz reconhecer kills na tela em jogos de tiro, e admite que a
  precisão cai fora deles [6]. No Rust, os servidores já registram as mortes: o plugin DeathNotes manda cada morte
  para o chat e o DiscordDeath e o RustCord mandam para um canal do Discord [18, 19]; o próprio jogo guarda as
  últimas 30 a 100 trocas de dano no `combatlog` [20].
- **Por que importa:** a parte mais lenta do trabalho é achar o lance no VOD de 10 horas. Uma lista "às 21:14:07
  fulano matou ciclano" resolve isso sem adivinhar.
- **No Povix:** botão "Importar mortes" que aceita o texto copiado do canal do Discord do servidor (ou um arquivo
  do plugin). Cada linha vira uma marca na faixa do matador e da vítima. Clicar abre os dois POVs no segundo da
  morte, 10 s antes. Os nomes do jogo casam com os canais pelo apelido já guardado (o mesmo do pedido do OCR).
- **Não conferido:** se os organizadores do evento usam um desses plugins e se aceitam passar o registro. É a
  primeira pergunta a fazer a eles. A hora do servidor tem de ser alinhada com a hora dos VODs (uma morte vista
  num POV basta para acertar).

### 2. Lista única dos melhores lances, com a nota explicada (valor alto, esforço pequeno)

- **Quem faz:** o OpusClip dá a cada clipe uma nota de 0 a 99 e ordena por ela [8]. Num roteiro de exemplo, ele
  conta o chat em janelas de 10 s, marca onde passa muito da média, começa o clipe 30 s antes ("o chat reage
  depois") e ordena pelo tamanho do pico [9]. O ClipGPT da StreamLadder também dá nota e devolve o clipe pronto
  [10].
- **Por que importa:** quem testou diz que a nota do Opus falha: clipes com nota baixa foram melhor que os "vencedores"
  [23]. Um número sem motivo não ajuda o clipador a decidir.
- **No Povix:** uma aba "Lances do evento" com todos os picos de todos os canais numa lista só, ordenada. Ao lado
  de cada um, o motivo em palavras: "chat 6x o normal, tiros em 4 POVs, 1 morte". Nenhuma ferramenta de um canal
  só consegue dizer "4 POVs ouviram a mesma briga". É a nossa vantagem, e as peças já existem (picos, tiros, outros
  ângulos pelo som).

### 3. Webcam achada sozinha no vertical (valor alto, esforço médio)

- **Quem faz:** a StreamLadder diz que acha a webcam no quadro e mantém o rosto no corte vertical sem ajuste [10].
  O editor de clipes da Twitch tem a divisão manual jogo e câmera desde 2023 [12]. Opus, Vizard, Klap e CapCut
  seguem o rosto [8, 25, 26, 27].
- **Por que importa:** um vendedor de cortes diz que perder a webcam é o que mais estraga clipe vertical de jogo
  [11]. É a queixa mais repetida sobre corte automático.
- **No Povix:** o pedido do dono de 10/10 (modelos de canto e encaixe guardado por streamer) mais um detector de
  rosto no navegador. O detector de rosto do MediaPipe roda no aparelho, em tempo real [28]. Basta olhar uns 5
  quadros do VOD, achar o retângulo do rosto e propor a caixa da webcam. No clipe de vários ângulos, fazer isso em
  cada ângulo, o que ninguém faz.
- **Estado (12/10): feito.** No "2 enquadramentos" do Criar clipe, o Povix olha 5 quadros do vídeo do canal (720p),
  acha o rosto com o detector do MediaPipe (tasks-vision 1.0.1 e BlazeFace, baixados numa versão fixa e conferidos
  pelo SHA-256, uns 12 MB da primeira vez) e põe a caixa 1 à volta dele. Cada ângulo tem a sua, e o rosto achado fica
  guardado por streamer. Sem rosto, fica o modelo do canto com um aviso. O que foi acertado à mão nunca é trocado; o
  botão "Achar webcam" procura de novo. Código em `site/rosto.js`, testes em `test/rosto.test.mjs`.

### 4. Legenda gerada no aparelho, fácil de corrigir (valor alto, esforço médio a grande)

- **Quem faz:** quase todos. StreamLadder com legenda palavra por palavra [10], Submagic com estilos prontos [29],
  CapCut com cor, letra e posição [27], Veed em mais de 100 idiomas [30].
- **Por que importa:** é o item que o clipador mais refaz à mão. As queixas são sobre erros e sobre o trabalho de
  corrigir no editor [23, 24].
- **No Povix:** o Whisper roda inteiro no navegador com o Transformers.js; com WebGPU é rápido, sem ele cai para o
  modo lento [31]. O modelo base pesa uns 200 MB [31]; o Moonshine tiny tem 27 milhões de parâmetros e é só inglês
  [32]. Só legendar o trecho do clipe (30 a 90 s), nunca o VOD inteiro. A vantagem nossa: cada POV tem o próprio
  microfone, então a legenda já sai com o nome de quem falou, sem adivinhar a voz. Mostrar o texto numa lista para
  corrigir antes de queimar no vídeo. Só entra no 9:16 e no clipe de vários ângulos, que já são desenhados quadro a
  quadro.

### 5. Chat dentro do clipe (valor médio a alto, esforço médio)

- **Quem faz:** o TwitchDownloader, gratuito, baixa o chat e o desenha como um vídeo à parte, com emotes [13]. O
  roteiro do Opus sugere usar as mensagens mais engraçadas do chat como texto do clipe [9].
- **Por que importa:** o chat explica o lance para quem não viu a live, e já temos as mensagens.
- **No Povix:** já descrito em `IDEIA-CLIPADOR.md`. Acrescentar: no clipe de vários ângulos, o chat de quem está na
  tela naquele momento; e um botão "chat como texto do gancho" que escolhe a mensagem mais repetida do pico.

### 6. Pacote para o editor, com os ângulos já sincronizados (valor alto para editores, esforço pequeno a médio)

- **Quem faz:** aplicativos de gravação com várias câmeras exportam um arquivo `.fcpxml` que o DaVinci abre já sincronizado
  [33, 34]. O Gling entrega o corte para Premiere, DaVinci e Final Cut [35].
- **Por que importa:** o editor de recap do evento trabalha no Premiere ou no DaVinci. Hoje ele baixa cada VOD e
  sincroniza à mão. Nenhuma ferramenta de multi-POV que achei exporta isso.
- **No Povix:** "Baixar pacote do lance": os trechos de cada ângulo (a cópia rápida já existe), um arquivo `.fcpxml`
  multicâmera com o atraso de cada um, e um arquivo de texto com nomes, horários e links. Cuidado: há relatos de
  nomes trocados ao importar multicâmera no DaVinci [34]; testar nos dois programas.
- **Estado (12/10): feito, sem testar no DaVinci e no Final Cut de verdade.** Cada lance da Montagem tem o botão
  "Pacote", que baixa um ZIP com: o trecho de cada ângulo que filmava o lance (a cópia rápida em MP4, cortada no
  relógio comum com o atraso medido de cada canal), um `.fcpxml` multicâmera e um `.txt` com nomes, horários em UTC,
  o atraso medido e o link do VOD (kick.com/canal/videos/uuid, com o ponto do VOD). O `.fcpxml` é da versão 1.9:
  `format`, `asset` com `media-rep`, `media` com `multicam` e um `mc-angle` por canal (nome e `angleID` são o slug,
  tal e qual), e um projeto com o `mc-clip`. Um ângulo que começa depois dos outros (a live entrou no meio do clipe)
  entra com um `gap` e o deslocamento certo. Conferido com o xmllint contra as DTDs 1.9 e 1.10 da Apple e lido pelo
  leitor de XML do Chromium nos testes. Falta abrir num DaVinci e num Final Cut: os ficheiros vão com caminho
  relativo (`./01_canal.mp4`), e o Final Cut costuma querer caminho absoluto, então pode pedir para religar os
  arquivos. Código em `site/pacote.js`, testes em `test/pacote.test.mjs` e `test/pacote-pagina.test.mjs`.

### 7. Aviso de prazo do VOD e "guardar o lance agora" (valor alto no evento, esforço pequeno)

- **Fonte:** a Kick guarda o VOD por 7 dias (30 se verificado), no máximo 16 ou 30 replays, e o streamer pode
  apagar [1]. Um guia diz que VOD apagado não volta [21]. O mapa de NoPixel avisa que VOD apagado não toca [3].
- **Por que importa:** um lance marcado no dia 1 pode sumir antes do recap.
- **No Povix:** em cada faixa, "some em N dias". Uma lista "Lances marcados" com um botão que baixa todos os
  trechos de uma vez, começando pelos que somem primeiro. Já estava no `ESTUDO.md` (item 3 da seção 7); conferir se
  foi feito.
- **Estado (12/10): feito.** Não estava feito: nada no site falava de prazo. Agora cada faixa da linha do tempo diz
  "some em N dias", contado do início da live. A Kick não diz na lista de VODs se o canal é verificado; o Povix conta
  30 dias quando a própria lista tem um VOD mais de 8 dias mais velho que o mais novo (prova de que o canal guarda 30)
  e 7 nos outros casos, e diz essa conta no texto que aparece ao parar o mouse. O endpoint do canal tem o campo
  `verified`, mas seria um pedido a mais por canal; fica para quando fizer falta. Na Montagem, cada lance diz o prazo
  do ângulo que some primeiro, e "Guardar todos agora" baixa a cópia rápida de todos (sem 9:16, chat ou legenda), um
  de cada vez, os que somem primeiro à frente, com o progresso e o Parar da montagem, e dá o ZIP no fim. Código em
  `site/prazo.js`, testes em `test/prazo.test.mjs`.

### 8. Ouvir um ângulo só e trocar com um toque (valor médio, esforço pequeno)

- **Quem faz:** o MultiPOV toca uma célula para ouvir só ela sem mudar a tela, segura para trocar de lugar, tem
  modos Mosaico, Destaque e Teatro, e um link que leva a sala e o tempo [4]. O Kickplex deixa só o vídeo em foco
  com som, com a tecla M (não conferido: a página da extensão não abriu daqui).
- **Por que importa:** com 4 ou mais POVs, o som de todos ao mesmo tempo não dá para entender.
- **No Povix:** clicar no vídeo põe o som nele; números 1 a 9 trocam o som; o clipe de vários ângulos usa o som de
  quem está na tela. Conferir o que já existe antes.
- **Estado (12/10): feito.** O que já existia: o altifalante e o volume em cada quadrado do visor (a mistura à
  mão) e o som que seguia o principal; nenhuma tecla de número; e o clipe de vários ângulos gravava o som do primeiro
  ângulo do princípio ao fim, mesmo no seguido, em que a imagem troca. Agora um clique no vídeo do visor dá-lhe o som e
  cala o outro, sem trocar ninguém de lugar (antes o clique trocava o par de lado); um clique na grelha abre o ângulo
  no visor já com o som. As teclas 1 a 9 passam o som para o ângulo com esse número, que aparece no canto de cada
  quadrado (a ordem é a da grelha); são atalhos como os outros, num grupo "Som" da janela do "?", e podem ser
  trocadas lá. Quem tem som leva um altifalante ao lado do número e, com dois no visor, o fio na cor da marca. No
  clipe seguido o som troca com a imagem (Web Audio, uma rampa de 15 ms); no empilhado é o do ângulo que se estava a
  ouvir. Sem Web Audio fica o som de um ângulo só, como antes. Medido num Chromium: dois vídeos com tons de 300 e
  1200 Hz, e o ficheiro soa a 300 Hz antes da troca e a 1200 Hz depois. Código em `site/app.js` (`ouvirAngulo`),
  `site/angulos.js` (`somEm`, `misturador`) e `site/atalhos.js`; testes em `test/som.test.mjs` e
  `test/angulos.test.mjs`.

### 9. Marcar ao vivo com uma tecla (valor médio, esforço pequeno)

- **Quem faz:** no Medal, durante a gravação longa, a tecla de clipe vira marcador [16]. Eklipse e StreamLadder
  aceitam o streamer dizer "clip that" [6, 10]. A Kick só deixa um clipe por minuto, até 180 s, sem vertical [2].
- **Por que importa:** no evento ao vivo o clipador vê o lance e quer voltar a ele depois sem perder tempo.
- **No Povix:** uma tecla marca "agora" em todos os POVs abertos, já descontando os 2 a 12 s de atraso medidos. Os
  marcadores entram na lista do item 2. Contar no chat palavras como "clip" ou "clipa" como sinal extra (o filtro de
  palavras já existe).
- **Estado (12/10): feito.** A tecla V (ou o botão "Marcar agora" da Montagem, que só aparece com alguém ao vivo na
  noite aberta) marca o agora em todos os ângulos ao vivo abertos. Com o ao vivo a tocar no Povix, o instante é o da
  tela, o mesmo em todos, porque a página já os mostra alinhados. Parado (a ver a live na Kick, por exemplo), é o
  agora menos o atraso de cada canal, medido a cada leitura da playlist (quanto antes do relógio acabou o último
  pedaço), preso entre 2 e 12 s, com o ajuste de relógio de cada um; sem medida, 6 s, e a dica do botão diz isso. O
  recado depois de marcar diz o atraso usado. A marca entra na Montagem como um lance ("marcado ao vivo"), guardada
  como as kills, e nos melhores lances como "marcado por você": os ângulos da marca ficam num lance só, mesmo de
  times diferentes, o lance vai sempre para o topo, já marcado e guardado com os outros lances marcados, e abre no
  ângulo que se estava a ver. O chat a pedir clipe ("clip", "clipa", "clipe", pelo mesmo filtro de palavras da
  detecção) virou mais um sinal, 3 pontos por canal. A tecla é um atalho como os outros e pode ser trocada. Código em
  `site/aovivo.js` (`medirAtraso`, `instantesAoVivo`), `site/app.js` (`marcarAoVivo`), `site/melhores.js` e
  `site/evento-ui.js`; testes em `test/aovivo-marcar.test.mjs`, `test/aovivo.test.mjs` e `test/melhores.test.mjs`.
  Falta conferir numa live de verdade: o atraso medido na playlist não conta o buffer do leitor da Kick, que pode
  pôr mais uns segundos.

### 10. Sons específicos: explosão, grito (valor médio, esforço médio)

- **Quem faz:** o Powder usa um modelo de som que mede a emoção do jogador, para jogos sem modelo próprio [17]. O
  YAMNet classifica 521 tipos de som e tem versão para o navegador [36].
- **Por que importa:** é o pedido do dono de 10/10 (foguete, grito). No Rust um raid de foguete é lance mesmo sem
  morte.
- **No Povix:** testar o YAMNet nos trechos que o detector de tiros já escolhe, não no VOD inteiro. Não conferido:
  se os rótulos de explosão e grito acertam o som do Rust; um usuário relata que o modelo marca quase tudo como fala
  [36]. Medir com gravações reais antes de prometer.

## 2. Ferramentas de IA: o que fazem sozinhas e se o Povix consegue igual

"Grátis no navegador" quer dizer: roda no aparelho de quem usa, sem servidor nosso e sem conta paga.

| O que a IA faz | Quem faz | Grátis no navegador? | Esforço |
|---|---|---|---|
| Achar os momentos num VOD longo | Opus [8], Eklipse [6], ClipGPT [10], CapCut [27], Vizard [25], Klap [26], Veed [30], FragCut [37] | Sim. Já fazemos com chat e tiros. Faltam mortes do servidor (item 1) e sons (item 10) | Pequeno a médio |
| Nota de "vai viralizar" | Opus [8], ClipGPT [10], FragCut [37] | Sim, com regra explicada (item 2) | Pequeno |
| Seguir o rosto no corte vertical | Opus [8], Vizard [25], Klap [26], CapCut [27], StreamLadder [10] | Sim, MediaPipe [28] | Feito (12/10): a caixa da webcam, por ângulo |
| Legenda automática palavra por palavra | StreamLadder [10], Submagic [29], CapCut [27], Opus [23], Veed [30] | Sim, Whisper ou Moonshine [31, 32]. Pesa de 50 a 200 MB na primeira vez e precisa de WebGPU para ser rápido | Médio a grande |
| Traduzir a legenda | Veed [30], Vizard [25] | Em parte: o Whisper traduz para o inglês (não conferido nesta pesquisa). Para outros idiomas precisaria de um segundo modelo ou de uma API paga | Grande |
| Título, gancho e hashtags | ClipGPT [10], Opus [8] | Um modelo de linguagem no navegador pesa gigabytes (não conferido). Melhor: um modelo de texto com dados reais ("Fulano e Ciclano, 21:14, time X"), que é de graça e não erra o nome | Pequeno |
| Ver a kill na tela | Medal [16], Powder [17], Eklipse [6], Outplayed [37] | Não vale: são dezenas de modelos treinados por jogo. O registro do servidor (item 1) dá o mesmo de graça | Não fazer |
| Ler nomes na tela (OCR) | (pedido do dono) | Sim com Tesseract.js, mas lento: um relato fala de 10 a 30 s por imagem [38]. Só em poucos quadros, e mostrar o que leu | Médio |
| Tirar silêncio, "ãhn" e tomadas ruins | Descript [39], Gling [35], CapCut [27] | Possível, mas não serve para briga de Rust | Não fazer |
| Limpar o som da voz | Descript [39], Veed [30] | Precisa de servidor ou modelo pesado | Não fazer agora |
| Dublagem e contato visual | Veed [30], Klap [26], Descript [39] | Precisa de servidor pago | Não fazer |
| Criar ângulos de câmera que não existem | Runway Aleph [40] | Servidor pago | Não fazer: nós temos os ângulos de verdade |
| Postar e agendar nas redes | Opus [23], StreamLadder [10], Vizard [25], FragCut [37] | Fora do navegador; o Postador do dono já faz (ver `IDEIA-CLIPADOR.md`) | Médio |
| Montagem de vários lances | StreamLadder [10], Powder [37] | Já existe ("Exportar montagem") | Feito |

Onde ninguém chega perto de nós: todas essas ferramentas leem um canal por vez. Nenhuma sabe que outros 6
streamers estavam na mesma briga, nem junta os ângulos, nem confirma um lance porque vários ouviram os tiros.

## 3. Plano para igualar e passar, em ordem

1. **Lista de lances do evento com nota explicada e confirmação por vários POVs** (item 2). Iguala a nota do Opus e
   passa: diz o motivo e conta os ângulos.
2. **Mortes do servidor** (item 1). Passa o Medal, o Powder e o Eklipse no Rust sem treinar modelo nenhum.
3. **Webcam achada sozinha, em cada ângulo** (item 3). Iguala a StreamLadder e passa no clipe de vários ângulos.
4. **Legenda no aparelho com o nome de quem fala** (item 4). Iguala Submagic e CapCut no básico e passa na parte
   de várias pessoas, sem custo por minuto.
5. **Chat no clipe** (item 5). Iguala o TwitchDownloader, dentro do mesmo corte.
6. **Pacote multicâmera para Premiere e DaVinci** (item 6). Ninguém faz.
7. **Título e descrição por modelo com os dados do lance.** Iguala o "gancho" das pagas no que importa (nomes e
   contexto certos), sem IA paga.
8. **Sons específicos com YAMNet** (item 10). Iguala o modelo de som do Powder, se os testes passarem.
9. **Nomes na tela por OCR** (pedido do dono). Só depois do 1, que resolve quase o mesmo problema com dados certos.

Tudo isso roda no aparelho, de graça, sem conta. É o oposto da queixa mais comum sobre as pagas (cobrança e
créditos, seção 4).

## 4. Do que os clipadores mais reclamam

1. **A IA escolhe mal o momento.** Corta a piada antes do desfecho, não entende humor, a nota de viralidade erra
   [23]. Lição: o Povix sugere, o clipador decide, e a entrada e a saída são fáceis de ajustar.
2. **A webcam some no vertical** [11]. Por isso todas vendem "acha a sua webcam" [10].
3. **Legenda com erros e chata de corrigir.** E legenda queimada no vídeo original briga com a nova [23, 24].
4. **Lento e com falhas:** processamento lento, projetos que falham, quedas [23, 24].
5. **Cobrança:** cobrado depois de cancelar, créditos que somem, projetos que expiram com o plano [23, 24]. É a
   queixa mais forte nos resumos.
6. **Plano grátis capado:** marca d'água, 720p, poucos dias de armazenamento [25, 30, 41]. A Kick é recurso pago
   no Eklipse [41].
7. **Ferramentas feitas para quem fala para a câmera:** Klap e Vizard funcionam melhor com entrevista e podcast, e
   pior com jogo [25, 26]. O Eklipse diz que acerta menos fora de jogos de tiro [6].
8. **VOD da Kick some ou é apagado:** 7 ou 30 dias, e o streamer pode apagar [1]. Sem volta [21].
9. **Clipe nativo curto:** na Kick, de 10 a 180 s, um por minuto, sem vertical [2].
10. **Sincronizar POVs à mão:** as extensões pedem o nome do streamer, a data e a hora para achar o mesmo instante
    [5], e quebram quando o site muda [7].
11. **Agendador que falha:** posts que não saem e contas desconectadas; muitos postam à mão [23].

## 5. O que o Povix não deve fazer

- **Nota mágica sem motivo.** Mostrar sempre por que o lance foi escolhido (seção 4, item 1).
- **Cobrança por crédito, conta obrigatória, marca d'água.** É o que mais irrita nas pagas [23, 24]. Se um dia
  cobrar, assinatura simples, cancelar com um clique.
- **Treinar modelo de visão para ver kills.** Dezenas de modelos por jogo [17]; no Rust o servidor já sabe.
- **Editor completo (música, efeitos, B-roll).** O B-roll automático do Opus é citado como cheio de falhas [23].
  Entregar o pacote para o editor de verdade (item 6).
- **Transcrever ou ouvir o evento inteiro.** Ouvir os 500 o tempo todo dá 115 Mbit/s (`PLANO.md`). Só trechos.
- **Hospedar VODs no nosso servidor.** Custo e direitos. Baixar só os trechos marcados, no aparelho de quem usa.
- **Postar nas redes de dentro do Povix antes do evento.** O agendador é a parte que mais falha nas pagas [23]; fica
  com o Postador, atrás de uma peça trocável.
- **Recursos de quem fala para a câmera:** tirar "ãhn", contato visual, dublagem [26, 35, 39]. Não ajudam numa briga
  de Rust.
- **Gerar ângulos com IA** [40]. O que temos de melhor são os ângulos reais.
- **Depender de extensão do navegador.** As que existem quebram quando a Twitch ou a Kick mudam a página [7].

## Fontes

- [1] Kick, VODs e prazos: https://help.kick.com/en/articles/7112432-kick-vods-stream-replays
- [2] Kick, como criar clipes: https://help.kick.com/en/articles/7120566-how-to-create-clips-on-kick
- [3] Mapa e multi-POV de NoPixel: https://gtaservers.org/nopixel
- [4] MultiPOV: https://watchmultipov.app/
- [5] Twitch Kick Sync (extensão): https://chromewebstore.google.com/detail/bldfdpmongnkklmdcpacdilfhabpaneg
- [6] Eklipse, como faz destaques (blog da empresa): https://eklipse.gg/help/how-to-make-stream-highlights-with-eklipse/ e https://blog.eklipse.gg/tools/ai-clip-maker-gaming.html
- [7] TTV Looking Glass (extensão): https://addons.mozilla.org/addon/ttv-looking-glass/
- [8] OpusClip, nota de viralidade: https://help.opus.pro/docs/article/virality-score
- [9] OpusClip, clipes pelos picos do chat: https://www.opus.pro/mcp/inspiration/clip-the-moments-your-live-chat-exploded
- [10] StreamLadder ClipGPT: https://www.streamladder.com/clipgpt
- [11] ClipSpeed, gerador de clipes da Twitch (vendedor): https://www.clipspeed.ai/ai-tools/twitch-clip-generator.html
- [12] Editor de clipes vertical da Twitch (TechCrunch, 2023): https://techcrunch.com/2023/05/11/twitch-clip-editor-edit-vertical-video-tiktok-reels
- [13] TwitchDownloader: https://github.com/lay295/TwitchDownloader
- [14] ClipIt, gráfico do chat (extensão; página não abriu daqui, não conferido): https://addons.mozilla.org/firefox/addon/clipit-chat-analyzer/
- [15] Lofi Nopixel, linha do tempo das lives: https://lofi-nopixel.com/timeline
- [16] Medal, detecção automática de eventos: https://support.medal.tv/support/solutions/articles/48001167701-what-is-automatic-event-detection-auto-clipping- e https://support.medal.tv/support/solutions/articles/48001271487-getting-to-know-medal-s-settings
- [17] Powder, relatório do projeto europeu: https://cordis.europa.eu/project/id/190156232/reporting/es
- [18] Plugin DeathNotes do Rust: https://www.corrosionhour.com/rust-death-notes-plugin/
- [19] Plugin DiscordDeath: https://umod.org/index.php/plugins/DiscordDeath.cs
- [20] Rust, comando combatlog: https://www.corrosionhour.com/rust-combat-log-command/
- [21] Upstream, baixar VODs da Kick: https://upstream.so/blog/how-to-download-kick-vods/
- [22] Rust Kick Off 2 em números: https://streamscharts.com/news/rust-kick-off-2-recap
- [23] Resumo de avaliações do OpusClip: https://www.eesel.ai/blog/opusclip-reviews
- [24] OpusClip no Trustpilot: https://www.trustpilot.com/review/opus.pro?page=4
- [25] Análise do Vizard (escrita pela Klap, rival): https://klap.app/blog/vizard-ai-review
- [26] Análise do Klap (escrita pela quso, rival): https://quso.ai/blog/klap-ai-review-pros-cons-alternatives.html
- [27] CapCut, de vídeo longo para curto (site da empresa): https://www.capcut.com/resource/turn-long-video-to-short-video-with-ai
- [28] MediaPipe, detecção de rosto: https://mediapipe.readthedocs.io/en/latest/solutions/face_detection.html
- [29] Análise do Submagic (blog da empresa): https://www.submagic.co/blog/submagic-review
- [30] Análise do Veed: https://experiment.com/projects/ikxurjqukxweenvmqoqk/protocols/13216-veed-io-review-i-tried-it-features-pricing-pros-cons
- [31] Whisper no navegador com WebGPU: https://hackernoon.com/turn-audio-to-text-on-your-device-free-whisper-webgpu-guide e https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/
- [32] Moonshine: https://github.com/usefulsensors/moonshine e https://huggingface.co/moonshine-ai/moonshine-tiny
- [33] Detail, exportar linha do tempo em `.fcpxml`: https://detail.co/blog/timeline-export
- [34] Fórum da Blackmagic, multicâmera em `.fcpxml`: https://forum.blackmagicdesign.com/viewtopic.php?p=739386
- [35] Análise do Gling: https://www.unite.ai/gling-ai-review
- [36] YAMNet: https://www.tensorflow.org/hub/tutorials/yamnet e https://discuss.ai.google.dev/t/audio-classification-using-tensorflow-lite-yamnet-model/36454
- [37] FragCut (catálogo): https://www.getapp.co.uk/software/2084876/fragcut e Outplayed e Powder (blog do Eklipse, rival): https://blog.eklipse.gg/streaming-tips/ai-tools-for-gaming-kill-compilations.html
- [38] Tesseract.js: https://github.com/naptha/tesseract.js e https://dev.to/acetoolz/ocr-integration-in-web-apps-google-document-ai-vs-tesseract-44od
- [39] Descript, tirar palavras de preenchimento: https://www.descript.com/tools/remove-filler-from-audio
- [40] Runway Aleph 2.0: https://runway.com/news/introducing-aleph-2-and-edit-studio
- [41] Eklipse, grátis contra pago (blog da empresa): https://blog.eklipse.gg/guide/eklipse-free-vs-premium-review.html
