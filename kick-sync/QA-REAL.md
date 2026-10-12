# Povix contra a Kick de verdade (QA, 11 e 12/10/2026)

Testado o site local (`kick-sync/site`, servidor estático simples) num Chromium 153 (`/opt/pw-browsers/chromium-1243`,
toca H.264 e AAC), sem a Kick falsa dos testes. Canais reais: o evento Abisal (`?e=abisal`, 144 canais, 94 com vídeo),
VODs de `poionako`, `xguiry`, `polys0800`, `nikots`, `hai_suzy`, `dichanho`, e o exemplo "Rust ao vivo agora" (24 canais).
Fotos em `.arena/prints/fotos/qa-*.png`. Ficheiros exportados conferidos com ffmpeg.

Atenção: outro agente estava a mexer na interface durante o teste (os botões "Ler chat" e "Detectar lances" mudaram de
sítio a meio). O que está abaixo é o que a página fazia no momento de cada passo.

## Resumo para quem clipa

O básico funciona com a Kick real: colar um link de VOD, procurar canal, abrir o mapa do evento, clicar num momento,
trocar de ângulo, ler o chat, detectar tiros, cortar 16:9 e 9:16, gerar os links. Não houve nenhum erro de JavaScript.
O que trava o trabalho é outra coisa: o "Ver ao vivo agora" abre a live no começo e não no agora, o "Achar quem mais
estava no lance" erra quem estava junto, o 16:9 sai em `.ts` com até 16 s a mais, e a montagem ignora a seleção.

## Falhas, por gravidade

### Trava o trabalho principal

1. **"Ver ao vivo agora" abre a live no começo, 50 min atrás do ao vivo.**
   Passos: tela inicial, "Ver um exemplo: o Rust ao vivo agora", "Ver ao vivo agora".
   Esperado: o vídeo uns 20 s atrás do ao vivo. Aconteceu: relógio em 00:05:49 com o agora em 00:57 (foto `qa-71-ao-vivo.png`).
   Estado lido na página: `ev.escolha.ms` = 00:56:50, mas a playlist da live acabava em 00:56:44 (a playlist anda uns
   30 s atrás do ar, mais que os 20 s de `ATRAS_DO_AR_MS`). O instante caiu fora da janela e o leitor voltou ao início.
   Causa provável: `irAoVivo` em `evento-ui.js` (instante depois do fim da playlist) e o restaurar em `app.js`, que manda
   para o começo em vez de prender ao fim. Abriu também só 1 canal dos 24 ao vivo.

2. **"Achar quem mais estava no lance" acerta pouco.** Lance `polys0800` 23:27:40 de 05/10. Resultado do Povix em 18 s:
   `dichanho` e `nikots` com "mesmo som". Conferi com correlação do som feita à parte (ffmpeg e numpy, janelas de 20 s e
   de 110 s): `hai_suzy` (0,44), `nikots` (0,36) e `karinios0` (0,17 a 0,26) estavam com o mesmo som, com o mesmo atraso
   nas duas janelas. `dichanho` não (0,05 na janela longa, atraso diferente na curta). O Povix marcou `hai_suzy` como
   "não" (força 3,2) e `dichanho` como "estava" (força 6,3). A sincronia por áudio da noite também diz "sem som em comum"
   para `dichanho`. Ou seja: um falso positivo e dois perdidos num grupo de quatro. Ficheiro: `cena.js` (limites
   `FORCA_*`, janela de 20 s).

3. **Corte 16:9 sai em `.ts` e mais comprido que o pedido.** Clipe de 30 s marcado: ficheiro de 46 s, 47 MB,
   `polys0800__20261005-232737Z.ts` (H.264 1080p60 e AAC, toca bem). A página avisa "começa 7.0s antes, acaba 9.2s
   depois". Na montagem o mesmo: margens 5 s e 2 s davam ficheiros de 20 a 38 s. TikTok, Instagram e X não aceitam `.ts`
   e quem clipa tem de converter e aparar em outro programa. Vem do desenho em `baixar.js` (cortar só nas fronteiras dos
   pedaços, sem recodificar).

4. **"Exportar montagem" ignora a seleção.** Com 2 de 8 kills marcadas na caixa, exportou as 8 (12 ficheiros, 237 MB,
   8 min com a rede deste ambiente). Em `app.js`, `baixarMontagem` usa `estado.momentos` inteiro; `estado.selecao` só
   serve para "Remover selecionados". E a "montagem" é um zip de clipes soltos, não um vídeo único: quem espera um vídeo
   montado não o recebe.

### Atrapalha bastante

5. **Vítima errada na detecção.** Em 4 de 7 lances detetados, `nikots` aparece como vítima. Vi os quadros: ele abriu o
   inventário (tela escura e sem cor), estava na mesma base que `polys0800` e é do mesmo time pelo som. `morte.js` lê
   "escureceu e perdeu cor" e o inventário do Rust tem esse aspeto.

6. **"Abrir todos com vídeo nesse horário" demora 40 s até aparecer o primeiro vídeo** (33 canais, 186 pedidos), e 14
   dos 33 ainda não estavam prontos 50 s depois. "Ver só" com 3 ângulos leva 3,6 s. Pede confirmação antes ("São 33
   vídeos..."), o que está certo.

7. **"Sincronizar por áudio" com 33 ângulos levou uns 30 min e 300 MB** (o aviso dizia 436 MB). Alinhou 7 de 33.
   O resultado está certo: a diferença entre os ajustes de `polys0800`, `nikots`, `karinios0` e `hai_suzy` bate com a
   minha correlação à parte com erro abaixo de 50 ms. Os outros 26 estavam de facto noutro jogo ou noutro sítio
   (`krakenpez` estava no GTA). Com tantos canais, um clipador desiste antes do fim. Ouve um canal de cada vez
   (`alinharPeloSom` em `alinhar.js`); só os pedaços de cada canal vão 4 em paralelo. Um dos pedaços veio sem cabeçalho
   de permissão (`CORS`) da Kick e o canal entrou em "não consegui ouvir" (`britus99`), o que está bem tratado.

8. **O atraso medido pelo "Achar quem mais estava" não é aplicado.** Mediu `nikots` 0,87 s e, ao abrir o lance, a
   sincronia de cada ângulo ficou em 0.0s (`estado.nudges` vazio). Só o "Sincronizar por áudio" aplica.

9. **"Compartilhar projeto" não leva as kills.** O link gerado tem `"momentos":[]` e `"margens":{}` (8 kills marcadas
   na hora). Abre bem noutro navegador (3 canais, mesmo instante, 9,7 s), mas sem a montagem. `linkDaNoite` em `app.js`
   não passa os momentos a `paraLink`. Se a ideia é só "ver esta noite", o nome do botão engana.

10. **Ao trocar de dois canais, a noite escolhida tem só um.** Com `xguiry` e `poionako` adicionados, abriu a noite mais
    recente, só com `xguiry`; as noites com os dois estavam mais abaixo na lista.

11. **O 9:16 gravado sai em `.mp4` com VP9 e Opus, e a 7 a 16 quadros por segundo.** 30 s pedidos: 29,97 s, 1080x1920,
    18 MB, som presente. Neste Chromium o gravador não grava H.264 e `melhorFormato` cai em `video/mp4` sem codec. Muitas
    redes recusam VP9 dentro de `.mp4`. No Chrome do Windows deve sair H.264; não pude confirmar. Os quadros por segundo
    baixos vêm em parte deste ambiente sem placa gráfica (ver limites), mas um computador fraco vai ter o mesmo problema,
    porque a gravação é em tempo real.

12. **A primeira detecção de 10 min demorou 225 s; a segunda, noutro trecho do mesmo canal, 14 s.** Ficou parada em
    "Ouvindo polys0800: 0 s de 10 min, 22 MB" quase 4 min. Não descobri a causa; parece um pedido preso (o
    `somDoCanal` de `alinhar.js` não tem prazo; a montagem tem `PRAZO_MS`).

13. **Leitura do chat às vezes falha por permissão (`CORS`).** No teste de celular, `kick.com/api/v2/channels/946574/messages` voltou
    duas vezes sem `access-control-allow-origin` (provavelmente limite de pedidos da Kick). A leitura do canal todo também
    pede muito: `polys0800` tem 58 mensagens em 14 h e a página fez 60 pedidos; 3 chegavam.

### Visual e pequeno

14. A caixa de ações (Ler chat, Detectar) abre por cima do vídeo e tapa quase tudo (`qa-26-detectar-resultado.png`).
15. Na coluna da direita, com margens abertas, a lista de kills mostra uma linha só e o "Chat de ..." fica por cima dela
    (`qa-31-montagem.png`, `qa-40-exportar-aba.png`).
16. O "OCR dos nomes na tela" leu 13 quadros em 32 s e achou só "wile" (o nome real era "willo"), nenhum canal ligado.
    Funciona, mas quase não serve neste caso.
17. "Por time da lista" na ordem das faixas faz o mesmo que "ao vivo agora" quando o evento não tem times.
18. No mapa, o rótulo "momento 23:29" fica por cima do "ter 06/10".
19. Os rótulos dos ângulos ficam congelados no tempo do início ("deowasd 498:11") e as miniaturas ficam paradas.
20. Celular 390 px: sem rolagem para os lados, tudo funciona (VOD em 3 s, lance em 3 s), mas o selo "Relógio exato"
    quebra uma palavra por linha e o mapa do evento só aparece depois de uma tela inteira de botões. O texto ainda diz
    "Ctrl + roda do mouse".
21. Uma vez, ao abrir o link do evento, os 3 vídeos ficaram pretos 18 s; na segunda tentativa tocaram em 8 s.

## O que passou

| Fluxo | Resultado | Tempo |
|---|---|---|
| Tela inicial, dois caminhos | abre os dois | 2 s |
| Colar link de VOD da Kick | toca 1080p com som | 1 s até aparecer |
| Procurar canal ("xgui") | 8 sugestões, Enter adiciona | 1,9 s |
| Evento `?e=abisal` | mapa com 144 canais, 15 ao vivo | 12 s |
| Zoom, "Evento inteiro", ordens A a Z, tempo no ar, instante | funcionam | imediato |
| Clicar num momento | painel do lance certo | imediato |
| Trocar de ângulo pelo nome | vai para o mesmo instante | 2 s |
| Sincronizar por áudio | ajustes certos onde há som em comum | 30 min com 33 |
| Ler chat, um canal, trecho de 10 min | 1 mensagem (conferi na Kick: 1) | 1 s |
| Ler chat, um canal, tudo | 58 mensagens, 1 pico (conferi: 58) | 28 s |
| Ler chat, todos, tudo | 919 mensagens, 14 picos nas faixas | 96 s |
| Detectar tiros, explosões, gritos | 2 dos 3 primeiros batem com os meus picos de som | 14 s a 225 s por 10 min |
| Marcar kill (M), margens | funcionam | |
| Editor 16:9 e 9:16, webcam em cima | prévia anda, modelo de webcam guardado | 2,3 s para abrir |
| Exportar 16:9 | `.ts` 1080p60 com som, toca | 2 s |
| Exportar 9:16 | `.mp4` 1080x1920 com som | 31 s para 30 s |
| Montagem 16:9 e "+ 9:16", zip | 12 ficheiros e 8 verticais, zip íntegro | 155 s |
| Link do evento com lance | abre no lance com os 3 ângulos | 8 a 18 s |
| Painel de atalhos | procura, troca com aviso de conflito, volta ao padrão | |

## Limites do ambiente (não são falhas do Povix)

- Chromium sem interface e sem placa gráfica, 4 núcleos com carga 6: a descodificação é toda no processador. Os 7 a
  16 quadros por segundo do 9:16 e parte da lentidão com 33 vídeos podem vir daqui.
- Este Chromium não grava H.264 com o `MediaRecorder`; o Chrome normal no Windows grava.
- O áudio só foi ouvido por medidas (volume, correlação), não por ouvido humano.
- A rede passa por um proxy; mediu 10 MB/s para os pedaços da Kick.
- Os `confirm()` do navegador foram aceites pelo script; numa pessoa real aparecem como janela.
- Não testei Firefox nem Safari, nem a versão Twitch, nem o arquivo `.csv` de elenco.
- Não sei se a lista do Abisal está certa: em 05/10 parte dos canais estava no GTA, por isso "abrir todos" mistura jogos.
