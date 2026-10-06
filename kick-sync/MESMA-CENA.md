# Quem estava junto de quem: medido no som

Medido em 06/10/2026 com `probes/mesma-cena.py`, sobre VODs reais da Kick de dois streamers de Rust
(`wowi` e `kodd`), que às vezes jogam juntos e às vezes não.

A pergunta: dá para o site descobrir sozinho que dois canais estavam no mesmo lugar (mesmo time, mesma
luta), sem ninguém dizer? É isso que deixa achar "os outros ângulos" de um momento num evento de 500
streamers.

## O método

Para cada canal, o áudio do degrau mais barato (160p, 230 kbps) é posto no relógio absoluto pelo
`EXT-X-PROGRAM-DATE-TIME` de cada segmento e reduzido a uma envolvente de ataques (fluxo espectral, 100
pontos por segundo). Depois, em janelas de 20 s a cada 10 s, a correlação normalizada entre os dois, com
atraso procurado em ±8 s. Uma janela conta como "som em comum" quando o pico passa de 0,30 e é pelo menos
1,5 vez o segundo maior pico.

## O resultado

| noite | o que o título diz | janelas | com som em comum | atraso entre os dois |
|---|---|---|---|---|
| 28/09, 23:00 a 23:15 UTC | "MONDAY FT @Kodd" (jogaram juntos) | 87 | **23** | +0,42 s, variação de 0,02 s |
| 03/10, 01:00 a 01:20 UTC | cada um no seu time | 117 | 0 | |
| 03/10, cinco trechos de 10 min entre 02:30 e 08:40 UTC | idem | 287 | 0 | |

Pico mediano: 0,30 quando estavam juntos, 0,14 a 0,17 quando não.

Quando estão juntos, o atraso é o mesmo em todas as janelas (0,41 a 0,43 s): é a diferença entre os dois
envios para a Kick, a mesma coisa que o alinhamento já corrige. Isso é o que separa som em comum de
coincidência: coincidências caem em atrasos espalhados.

## O que isto prova e o que não prova

- **Prova:** o site distingue, a partir do som e sem dado nenhum do jogo, dois canais que estavam juntos
  de dois que não estavam. Serve para agrupar os 500 canais de um evento em cenas, e para responder "quem
  mais estava aqui".
- **Não prova ainda:** que um atacante e um defensor de times diferentes, sem conversa em comum, se
  encontram pelo som do jogo (explosões, tiros). Juntos, `wowi` e `kodd` podem ter dividido também a
  conversa de voz. Isso fica para medir no próprio evento, com um raid em que os dois lados transmitem.
- **Custo:** 20 s de som de um canal são dois segmentos de 160p, uns 700 KB. Procurar um momento nos 500
  canais é da ordem de 350 MB; por time (4 canais) ou por quem estava ao vivo naquele minuto, muito menos.

## Como repetir

```
pip install av numpy
python3 probes/mesma-cena.py 2026-09-28T23:00:00Z 15 wowi kodd
python3 probes/mesma-cena.py 2026-10-03T01:00:00Z 20 wowi kodd
```

Os VODs da Kick somem depois de algumas semanas: os do evento de 30/08 medidos em `SINCRONIA.md` já não
existem em 06/10. Para repetir mais tarde, escolha duas noites recentes.
