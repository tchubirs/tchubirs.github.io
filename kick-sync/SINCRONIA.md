# Sincronizar vários ângulos — o que foi medido, e em quê

Medido em 31/08/2026 contra a Kick a sério, sobre um evento real de 30/08/2026
com cinco canais que estiveram juntos: `wowi`, `dilanzito`, `yopickeosola`,
`lautaarg00`, `kodd`.

A pergunta era: *cada um começou a transmitir a uma hora e acabou a outra —
como é que se sincroniza? E dá para ser automático?*

**Dá.** E o erro medido é muito menor do que os 10–20 s que seriam aceitáveis.

---

## 1. O relógio existe, e não é o PC de ninguém

Cada segmento de vídeo traz um `EXT-X-PROGRAM-DATE-TIME`: o instante, ao
milissegundo, em que aquele pedaço chegou ao servidor da Kick.

| canal | 1º carimbo | segmentos | relógio |
|---|---|---|---|
| wowi | 2026-08-30T20:50:52.385Z | 1425 | exacto |
| dilanzito | 2026-08-30T21:07:08.465Z | 1531 | exacto |
| yopickeosola | 2026-08-30T17:10:16.358Z | 2472 | exacto |
| lautaarg00 | 2026-08-29T11:20:53.832Z | 11168 | exacto |
| kodd | 2026-08-30T21:44:53.509Z | 1017 | exacto |

**Todos os cinco carimbam todos os segmentos.** Nenhum tem lacunas.

Os cinco em conjunto: a noite inteira vai das 11:20:53 às 01:39:28, e os cinco
estiveram no ar ao mesmo tempo das **21:44:53 às 01:12:19 — 207 minutos**.

Que o carimbo é o relógio do servidor e não o do computador de cada um vê-se
no desvio entre o carimbo e o `start_time` da própria API da Kick: −5,62 /
−2,54 / −4,64 / −5,17 / −4,49 s. **Três segundos de espalhamento entre cinco
pessoas que não se conhecem.** Relógios de PC não fazem isso.

A aritmética também fecha: no VOD de 37,93 h do `lautaarg00`, a soma das
durações dos 11 168 segmentos (136 550 s) é igual ao span dos carimbos, ao
segundo. Zero descontinuidades.

## 2. O que sobra depois do carimbo

Entre a placa de captura de cada um e o servidor da Kick há o buffer do OBS, o
encoder e a subida. Isso é diferente em cada casa e **não se lê em lado
nenhum** — só se mede a ouvir.

Método: baixar o mesmo minuto de relógio de cada canal, tirar o áudio,
reduzir a uma envolvente de ataques (fluxo espectral, 100 Hz) e correlacionar.
Quatro janelas independentes de 7 minutos, espalhadas pela noite.

| canal | ajuste medido | leitura |
|---|---|---|
| wowi | −0,01 s | como a maioria |
| dilanzito | +0,11 s | como a maioria |
| yopickeosola | +0,13 s | como a maioria |
| kodd | +0,00 s | como a maioria |
| **lautaarg00** | **−5,71 s** | chegou 5,7 s mais cedo |

**Quatro dos cinco caem dentro de 0,14 s uns dos outros só com o carimbo.** O
quinto está 5,7 s à frente, e as quatro janelas concordaram (+5,49 / +5,71 /
+5,83 / +5,56, força 12,8 / 13,5 / 5,7 / 10,0).

Feito duas vezes, por duas implementações independentes — uma em Python para a
análise, outra em JavaScript para ir dentro da página — sobre os mesmos
ficheiros. Deram o mesmo número.

## 3. Porque é que isto corre no browser e não num servidor

O browser sabe descodificar AAC mas não sabe abrir MPEG-TS, que é o que a Kick
serve. `site/audio-ts.js` é a ponte, em ~120 linhas.

Verificado contra o `ffmpeg`:

- num segmento: **o mesmo AAC, byte a byte** (78 948 bytes, SHA-256 igual);
- em 40 segmentos seguidos (500,5 s): **o mesmo PCM, amostra a amostra**,
  4 004 182 amostras com erro máximo **0**. Sem deriva.

Ou seja, alinhar pelo som não precisa de servidor nenhum — que é a decisão que
a Fase 0 já tinha tomado por causa do CORS.

## 4. O que isto não resolve

- **Precisão de frame.** O carimbo é por segmento (~12 s) e é interpolado lá
  dentro; o som dá décimas. Para cortar ao frame é preciso o ajuste manual.
- **Canais sem som em comum.** Dois streamers em salas diferentes, com músicas
  diferentes, podem não partilhar um único ataque. Esses são ditos pelo nome e
  ficam para o − / + à mão — nunca postos a zero em silêncio.
- **Navegadores sem AAC.** O Chromium open-source não traz o codec (nem toca
  os VODs da Kick, aliás). A página diz isso em vez de falhar calada.
- **A direcção do desvio do `lautaarg00`** foi confirmada em três das quatro
  janelas; a quarta discordou. É por isso que o ajuste é sempre visível e
  editável, e nunca aplicado às escondidas.

## Como repetir

```
node probes/evento-real.mjs wowi dilanzito yopickeosola lautaarg00 kodd
JANELA_S=420 DIR=/tmp/aud node probes/desvio-real.mjs 2026-08-30T22:00:00Z wowi dilanzito
node probes/alinhar-offline.mjs /tmp
```
