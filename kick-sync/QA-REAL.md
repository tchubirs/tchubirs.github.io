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

## Depois das correções (12/10/2026)

As dez correções da FILA ("Correções do teste real com a Kick"), cada uma com teste e conferida outra vez
contra a Kick real, no mesmo Chromium com H.264 (`/opt/pw-browsers/chromium-1243`), com o site local e o
script de controlo do teste anterior (`qa2/ctl.mjs` no scratchpad). Ficheiros conferidos com o ffmpeg
(`imageio_ffmpeg` 7.0.2: não há `ffprobe` aqui, a duração e as faixas leem-se do `ffmpeg -i`, os erros com
`-v error -f null`).

| # | O que era | O que mudou | Teste | Kick real |
|---|---|---|---|---|
| 1 | "Ver ao vivo agora" abria 50 min atrás e 1 de 24 canais | `irAoVivo` abre todos os que estão ao vivo; o restauro (`lerNoite`) prende o instante à borda do que está gravado com `instanteAoVivo` (aovivo.js): borda comum de quem está no ar menos 1,5 segmento medido na playlist (15 s com os segmentos de 10 s da Kick). A Kick serve a gravação em curso como playlist `EVENT` já com `ENDLIST`: o leitor de quem está ao vivo tira o `ENDLIST` (`carregadorAoVivo`) e o hls.js volta a pedi-la; a página relê as playlists ao vivo de 15 em 15 s | `ao-vivo-agora.test.mjs` | **passa**: 24 de 24 canais abertos em 4,4 s, primeiro vídeo em 6,4 s, a tocar 61 s atrás do ar (a playlist da Kick já anda 40 a 45 s atrás) e continua a andar (70 s seguidos medidos). Antes: 1 canal, 50 min atrás |
| 2 | 16:9 em `.ts` e mais comprido (46 s para 30 s) | `mp4.js` (novo, sem dependências): lê o TS (H.264 e AAC), passa a MP4 sem recodificar e corta exatamente no pedido com a lista de edição (`elst`), desde o quadro-chave anterior. `executarCorte` entrega `.mp4`; se a Kick mandar outro codec, sai o `.ts` com a razão dita. A nota diz "MP4 cortado na sua marca". Vale para o corte de cada ângulo, o editor e a montagem | `mp4.test.mjs` (com ffmpeg), `baixar.test.mjs` | **passa**: `polys0800__20261005-232737Z.mp4`, 30,00 s pedidos e 30,00 s no ficheiro, H.264 Main 1080p60 + AAC 48 kHz, 1800 quadros, 0 erros no ffmpeg, 32,9 MB (antes 46 s e 47 MB), o Chromium toca com 30 s. Quadro a quadro igual ao `.ts` antigo no instante pedido (diferença nula entre os quadros, a ±1 quadro) |
| 3 | A montagem ignorava a seleção, e não havia vídeo único | Com kills marcadas na caixa, exporta só essas e o botão diz "Exportar N selecionadas". O formato ganhou "16:9, 1 vídeo" e "+ 9:16, 1 vídeo": o 16:9 junta-se no `mp4.js` (uma entrada da lista de edição por clipe), o 9:16 em `juntar-gravados.js` (MP4 fragmentado ou WebM do gravador, sem recodificar) | `montagem-selecao.test.mjs`, `juntar-gravados.test.mjs` | **passa**: 2 de 3 kills marcadas, botão "Exportar 2 selecionadas", saíram só as duas (3 ficheiros: 7,00 s, 3,00 s e 7,00 s, 0 erros). "1 vídeo": `montagem-2026-10-12.mp4` com 17,00 s (7 + 3 + 7), 0 erros de descodificação; o 9:16 num vídeo só com 14,25 s (2 × 7 s). Nota: neste Chromium o 9:16 continua VP9/Opus (falha 11, fora desta lista) |
| 4 | "Achar quem mais estava" com um falso positivo e dois perdidos, e o atraso não era aplicado | `cena.js` mede três janelas de 20 s seguidas (antes, lance, depois) num pedido só, e decide pelo atraso que se repete: "estava" com 2 ou mais janelas a concordar a 0,15 s e força somada ≥ 9,5; uma janela forte sozinha (≥ 6,5) é "talvez". Os limites saem da medição de 12/10 contra a correlação feita à parte (ffmpeg + numpy, e a envolvente do próprio site em 8 instantes). O atraso de cada ângulo achado entra na sincronia ao abrir o lance | `cena.test.mjs`, `evento-mapa.test.mjs` | **passa em parte**: lance `polys0800` 23:27:40, 32 canais, 23 s: `nikots` estava (0,87 s), `hai_suzy` estava (0,09 s), `dichanho` não (antes era "estava"). `karinios0` ficou "não" na página (força 4,3; à parte deu 10,0 nas mesmas janelas, com o som do ffmpeg). `britus99` saiu "estava" (1,96 s): à parte, também concorda nesse instante e em nenhum outro, por isso não sei dizer se é falso. Ao abrir o lance: sincronia `nikots` +0,9 s, `hai_suzy` +0,1 s, `britus99` +2,0 s (antes 0,0 s) |
| 5 | O link do projeto saía com `"momentos":[]` | `linkDaNoite` leva as kills (sem os campos de omissão, `momentosParaLink`) e as margens; a leitura (`momentosDoLink`) repõe o resto | `sessao.test.mjs` | **passa**: 3 kills (uma com vítima) num link de 599 letras, abertas noutro contexto com o mesmo instante, protagonista e vítima, em 3 s |
| 6 | 33 ângulos: 40 s até ao primeiro vídeo; sincronizar 33: 30 min | As listas da noite pedem-se 6 de cada vez com o foco primeiro; os leitores de 160p arrancam em lotes de 4. "Sincronizar por áudio" ouve 4 canais ao mesmo tempo, os 6 ângulos do lance primeiro (e aplica-os logo), com o progresso dito. A causa maior dos 30 min era outra: com 33 vídeos abertos o `AudioDecoder` da página levava 9 s a descodificar 10 s de som (0,09 s numa página vazia); agora descodifica num Worker (`som-worker.js`): 0,18 s com os vídeos a tocar | `abrir-rapido.test.mjs`, `alinhar.test.mjs`, `som-worker.test.mjs` | **passa**: "Abrir todos" com 33 canais, primeiro vídeo em 6,9 s (antes 40 s), 19 com imagem 20 s depois. Sincronizar 32 ângulos: 174 s (antes ~30 min); os 6 do lance em 22 s; 7 de 32 alinhados, como antes, e os atrasos relativos batem com a correlação à parte (`nikots` 0,89 s, `hai_suzy` 0,21 s, `karinios0` 0,65 s) |
| 7 | O inventário do Rust lido como morte | `pareceInventario` (morte.js): fração de blocos 8×8 lisos e cinzento-oliva (o fundo do inventário); quem abre o inventário fica com a nota a 5% e nunca é apontado | `morte.test.mjs` com quadros pintados (inventário, ecrã de morte, jogo) e três quadros verdadeiros do teste (`probes/fixtures/*-160x90.rgb`) | **passa**: em 15 min do `nikots` (23:22 a 23:37) achei 5 momentos em que ele passa do jogo para o inventário; a página marcou "inventário" em 4 e não apontou ninguém em nenhum. Nos dois piores, a nota antiga (0,21 e 0,50, 3 a 9 vezes a do `polys0800`) fazia dele vítima |
| 8 | O som da detecção sem prazo | `somDoCanal` usa o `pegarSegmento` da exportação: 20 s sem bytes e tenta outra vez, até 3, com espera a dobrar | `alinhar.test.mjs` (um pedaço pendurado é pedido de novo) | **passa**: detecção de 10 min do `polys0800` (23:22:38 a 23:32:38) em 10 s, sem ficar parada (antes 14 a 225 s). Um pedido pendurado não se provoca na Kick; o caminho do prazo está no teste |
| 9 | Chat: 60 pedidos onde 3 chegavam, e recusas sem `CORS` | O trecho lê-se de uma vez, página a página (era um pedido por bocado de 5 min); pedidos iguais ao mesmo tempo vão uma vez só; uma página recusada (rede/`CORS`, 429, 5xx) tenta outra vez até 3 vezes com espera a dobrar; recusada sempre, diz "A Kick recusou os pedidos de chat por agora... espere um minuto e clique de novo". Parar a meio guarda o que veio | `chat.test.mjs`, `chat-trecho.test.mjs` | **passa**: "Ler chat, tudo" do `polys0800`: 58 mensagens com 3 pedidos em 1,8 s (antes 60 pedidos e 28 s). Picos: 0 (o teste anterior contou 1; a regra dos picos não mudou e com os bocados de 5 min deste trecho também dá 0) |
| 10 | Com dois canais, abria a noite mais nova com um só | `noiteParaAbrir` (noites.js): sem instante a restaurar, a noite com mais canais pedidos (no empate, a mais recente); a meio do trabalho só muda se outra tiver mais canais | `noites.test.mjs` | **passa**: `xguiry` + `poionako`: as 3 noites mais novas têm um canal só; abriu a de 10/10 00:09 com os dois |

Também mudou, por causa destes testes: a lista de VODs de um canal pede-se outra vez 1 s depois quando a
Kick responde sem `CORS` (o `xguiry` falhou assim uma vez e voltou logo).

O que ficou por fazer ou não se conseguiu provar aqui:

- 4: o `karinios0` continua a escapar na página neste lance, e o `britus99` não tem resposta certa conhecida.
  A decisão por várias janelas está medida num lance só (8 instantes); falta medir noutros eventos.
- 9:16 num vídeo só: junta os ficheiros do gravador sem recodificar. Neste Chromium o gravador dá VP9/Opus
  em MP4 fragmentado; no Chrome do Windows (H.264) não pude confirmar.
- O vídeo único 16:9 com clipes de canais diferentes usa `avc3` (os parâmetros de cada canal dentro do
  vídeo) e uma entrada da lista de edição por clipe. O ffmpeg e o Chromium tocam com a duração certa e
  recodificar dá 17,03 s; copiar com `-c copy` avisa de tempos repetidos nas emendas.

Suite inteira depois das correções: 1113 de 1113 (`node --test test/*.mjs`, 299 s). Uma corrida feita com
o Chromium do teste real ainda aberto com 33 vídeos a tocar deu 4 falhas por tempo (o gravador e um
prazo de 400 s); com ele fechado, tudo verde.
