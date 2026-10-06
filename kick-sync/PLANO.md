# Plano do produto (rascunho de 06/10/2026)

Rascunho para ser criticado antes de construir. Cada decisão aponta para a medição ou a fonte que a
sustenta; o que é inferência está marcado como inferência.

## O que o produto é, numa frase

Um site onde se abre um evento inteiro da Kick (até 500 streamers), vê-se tudo numa linha do tempo só, e
cada lance pode ser visto de todos os ângulos e virar um clipe (horizontal ou vertical) em poucos cliques,
durante o evento ou depois.

## Para quem, e o que cada um ganha

| quem | o que faz hoje | o que ganha |
|---|---|---|
| organizador do evento | equipa de transmissão e editores procuram os lances à mão em dezenas de VODs (o organizador do Rust Kick Off agradece a "broadcast team" e "editors") | achar os lances e todos os ângulos em minutos, recap pronto |
| a Kick | vende "Multi-POV: 150 perspectivas, um servidor" no site do Rust Kick Off 2, mas não tem ferramenta que faça isso; paga redes de clipadores | um recurso que entrega o que ela já anuncia, e clipes de evento com crédito a cada streamer |
| clipadores | garimpam VODs longos; "o ouro tem segundos de largura" | os momentos marcados (chat, tiros, mortes) e o lance pelos dois lados, que conta uma história, que é o que o YouTube passou a premiar |
| streamers | o próprio clipe, só o próprio ângulo | o lance visto pelo rival, que dá conteúdo novo |
| espectadores | perdem o lance e não sabem quem mais estava lá | um link que abre o lance com todos os ângulos |

Fontes no `ESTUDO.md` (136 afirmações conferidas na fonte, 44 descartadas).

## O que já foi medido aqui (06/10)

- **Quem estava junto de quem sai do som:** 23 de 87 janelas com som em comum e o mesmo atraso quando dois
  streamers jogaram juntos, 0 de 404 quando não (`MESMA-CENA.md`).
- **Ao vivo:** a gravação em curso fica 2 a 12 s atrás do ao vivo, então tudo o que o site faz com VOD
  funciona durante o evento.
- **Escala da API:** 120 listas de VODs em 8 s, sem bloqueio; 500 canais em menos de um minuto.
- **Chat gravado:** uma hora inteira de chat custou 12 pedidos; os picos (22 msg/min contra 4) caem nos
  lances.
- **Elenco:** a página de times do Rust Kick Off 2 vira 10 times e 149 canais com uma regra simples
  (título do time seguido dos links da Kick).
- **Custo de achar os outros ângulos:** buscar o som de um mesmo instante em 29 transmissões ao vivo
  levou 7,9 s e 15 MB (playlist de 121 KB e um segmento de 392 KB por canal). Para 500 seriam uns
  130 s e 260 MB: o resultado tem de aparecer aos poucos, começando pelo time e por quem estava ao vivo
  naquele minuto. Ouvir os 500 o tempo todo (115 Mbit/s) só num servidor.
- **Prazo dos VODs:** 7 dias para canal não verificado, 30 para verificado (ajuda da Kick). Clipes do
  evento têm de sair dentro desse prazo.

## O que construir, em ordem

1. **Abrir um evento.** Três portas: colar o elenco (qualquer texto ou página com títulos de time e links
   da Kick), procurar ao vivo por palavra no título dentro da categoria Rust, ou abrir um link de evento já
   montado. Os 500 canais carregam em paralelo, com progresso e sem travar por um canal que falha.
2. **A linha do tempo do evento.** Uma faixa por streamer, agrupada por time, com rolagem que só desenha o
   que está na tela (500 faixas não cabem de outro jeito). Mostra quando cada um estava ao vivo, e marca
   onde houve pico de chat e luta. Procurar um streamer ou time por nome.
3. **Ver um lance.** Clicar num ponto abre aquele streamer e o time dele lado a lado, sincronizados. Um
   botão "outros ângulos" procura, entre quem estava ao vivo naquele minuto, quem ouviu o mesmo som, e vai
   mostrando os achados à medida que aparecem.
4. **Ao vivo.** Seguir o evento a poucos segundos do ao vivo, e "voltar 30 s em todos os ângulos".
5. **Clipe de vários ângulos.** O que já existe (16:9, 9:16 com editor de enquadramento) mais: ângulo A e
   depois B, ou A em cima e B embaixo no vertical, com o nome de cada streamer no vídeo.
6. **Link do lance.** Um endereço que abre o evento naquele instante com os ângulos escolhidos, para
   mandar no Discord e nas redes.
7. **Fácil de entender só de olhar.** Uma tela inicial com duas portas, um passo de cada vez, nomes de
   botão que dizem o que fazem, e um exemplo pronto para quem chega sem nada.

Depois do evento: índice do evento feito num servidor (chat e som de todos os 500, de uma vez), e
integração com os dados de abates do servidor do evento quando o organizador os puder dar (o Rust Kick
Off 2 publicou 20.702 abates com estatísticas por jogador).

## Riscos que já se conhecem

- **Regras da Kick.** A API oficial não tem VODs nem clipes; o site usa endpoints não documentados e o CDN.
  Os termos de desenvolvedor pedem o player oficial e proíbem material não documentado sem permissão. Para
  vender à Kick isso é natural (ela é a dona); para lançar em grande escala sem ela, é risco. Caminho:
  pedir acesso oficial (developers@kick.com) e propor parceria (kickpartners@kick.com), com o produto
  pronto para mostrar.
- **Concorrência direta pequena:** watchmultipov.app já sincroniza VODs pelo som em YouTube, Twitch e
  Kick, sem clipe e sem escala de evento. A diferença tem de ser o evento inteiro, os ângulos achados
  sozinhos e o clipe.
- **Grade não é produto:** o Squad Stream da Twitch (grade de 4) não passou de 1% dos streams e foi
  retirado; quem assistia achava a grade confusa. O produto vende o lance e a história, não a grade.
