# Estudo: explosão e grito com o YAMNet, no som real do Rust

Data: 12 de outubro de 2026. Responde ao item 10 de `IDEIAS.md`: os rótulos de explosão e de grito do YAMNet
acertam o som de uma live de Rust na Kick?

## Resposta curta

Não o bastante para pôr no site.

- **Grito:** o modelo não ouve. Em 4 horas de live e em 12 clipes de susto, a nota de "Screaming" quase nunca passa
  de 0,05. Para ele, o grito do streamer é fala.
- **Explosão:** o rótulo dispara, mas junto com o de tiro, e também em cenas calmas. Nos quadros que conferi, só 1 em
  cada 5 acertos mostra um explosivo, e quando o tiro ganha a conta é quase a mesma. Não separa um foguete de uma
  rajada.

Nada foi para a tela. Os filtros de explosão e grito que já existem (`explosoes.js` e `gritos.js`, pelo grave e pela
voz) continuam como estão, com o aviso de aproximado.

## Como medi

- **Modelo:** o YAMNet do MediaPipe (`audio_classifier/yamnet/float32/1/yamnet.tflite`, 4,1 MB, 521 rótulos), o
  mesmo arquivo que o MediaPipe Tasks Audio 1.0.1 carregaria no navegador. Rodei fora do navegador, com o LiteRT,
  para ir mais rápido: o modelo e as contas são os mesmos. Janela de 0,975 s a cada 0,48 s, som a 16 kHz.
- **Som:** 12 trechos de 20 minutos (4 h 2 min, 30.283 janelas) do 160p de 6 canais do Abisal, VODs de 8 a 11/10:
  xguiry, ispdep, crreg, skylane7, poionako e elwasabitm. Quatro deles tinham raid ou bombazo no título da live.
- **Janelas do Povix:** as 5 maiores do detector de tiros (`regioes` de `tiros.js`) em cada trecho, 60 ao todo, e as
  de `explosoes.js` (38) e `gritos.js` (34) para comparar.
- **O que é verdade:** ninguém ouviu estes trechos. Usei o vídeo: 6 quadros do 480p em volta de cada acerto (de 1 s
  antes a 2,6 s depois), olhados um a um. E clipes do Rust de canais do Abisal com título de susto ou de explosão.

## Números

### Grito

| Onde | Janelas | Nota máxima de Screaming | Yell e Shout |
|---|---|---|---|
| 4 h de live | 30.283 | 0,04 | 0,01 ou menos |
| Janelas do `gritos.js` | 34 | 0,03 | 0,01 ou menos |
| Clipes de susto ("susto", "que susto", "aaaaahhhh") | 12 clipes, um lido só em parte | 0,20 num clipe, 0,06 ou menos nos outros 11 | 0,02 ou menos |

O rótulo mais dado na live inteira foi "Speech" (65,8% das janelas), depois silêncio (9,8%). A voz chega comprimida,
colada ao microfone e por cima do jogo; o YAMNet foi treinado com gritos de outra natureza. Um limiar baixo o
bastante para pegar alguma coisa (0,05) já não mede nada.

### Explosão

- "Explosion" com nota 0,5 ou mais em 4,0% das janelas: umas 99 vezes por hora de live. Em 81% delas "Gunshot,
  gunfire" também passa de 0,5.
- Nas 60 janelas do detector de tiros, 21 têm "Explosion" com 0,5 ou mais; em 9 há um momento em que a explosão ganha
  do tiro.
- **Quadros de 30 acertos sorteados onde a explosão ganha do tiro:** 6 mostram explosivo (lança-foguetes a disparar,
  fumaça e destroços de raid), 7 mostram troca de tiros sem explosivo, 17 não mostram nada que explique (inventário,
  saque, sala escura, tela de morte). Precisão vista: **20%** (6 de 30). Uma explosão pode estar fora da tela, por
  isso as 17 ficam em aberto: se todas fossem, daria 77%. A verdade está entre os dois, e daqui não sei onde.
- **Controle, 12 acertos onde o tiro ganha:** 2 com explosivo (17%), 6 troca de tiros, 4 sem nada. Explosão a ganhar
  do tiro não separa nada (20% contra 17%).
- **Clipes:** dos 11 com título de explosão ou raid que deu para ler, 10 têm "Explosion" com 0,5 ou mais. Mas dos 12
  de susto, sem explosão no título, 7 também têm. O rótulo diz "há barulho de combate", e isso o detector de tiros já
  diz.
- Das 38 janelas do `explosoes.js`, 27 têm "Explosion" com 0,5 ou mais. Os dois concordam, mas nenhum foi conferido
  contra a verdade.

## Por que não entrou

A regra era só pôr com precisão clara em clipes reais. Uma marca "explosão" que acerta 1 em 5 vistas, e tanto quanto
nos tiros, engana mais do que ajuda, e "grito" não acertaria nunca. E custaria uns 11 MB na primeira vez (4,1 MB do
modelo e 6,6 MB do motor do MediaPipe) para isso.

## Pontos fracos deste estudo

- Ninguém ouviu os trechos. A verdade vem dos quadros e dos títulos dos clipes, e os dois são fracos: uma explosão
  fora da tela não aparece, e um clipe chamado "susto" pode ter só um susto de 1 s num minuto de jogo.
- Seis canais, todos do mesmo evento e do mesmo servidor. Outro jogo, outro microfone ou música alta podem mudar os
  números.
- Rodei o modelo fora do navegador. O arquivo é o mesmo, mas a conversão do som (AAC para 16 kHz) foi a do PyAV e
  não a do navegador.

## Se um dia voltar

Precisa de verdade ouvida: alguém marcar umas 50 explosões e 50 gritos em VODs reais. Com isso dá para medir de
novo e, se o YAMNet seguir fraco, treinar uma camada pequena por cima dele com som de Rust. Os scripts desta medição
(baixar os trechos, rodar o modelo, montar os quadros) ficaram no rascunho da sessão, fora do repositório, com o som
e os quadros dos canais.
