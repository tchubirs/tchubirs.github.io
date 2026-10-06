# Ideia do dono (06/10): o Povix como estação de trabalho do clipador

Para estudar e montar na semana de 12/10. Nada disto está feito ainda.

## A ideia

Um clipador hoje faz uns 5 clipes por hora: achar o lance, cortar, editar, legendar, postar em cada rede.
Com o Povix ele só escolhe o que tem potencial e clica. O resto sai pronto:

1. **Achar:** o mapa do evento e os picos do chat (já existe).
2. **Clipar em 3 cliques:** escolher o lance, o formato (16:9, 9:16, vários ângulos) e o tamanho (já existe em
   parte; o clipe de vários ângulos com o nome de cada streamer está pronto no código, falta ligar na tela).
3. **Fila de postagem (novo):** uma aba com os clipes prontos. Para cada um: título, legenda, hashtags, redes e
   data. Posta sozinho na hora marcada.

Meta a medir: de 5 para 15 clipes por hora ou mais. Durante um evento ao vivo, do pico do chat ao clipe agendado
em menos de 2 minutos.

## Como vender

- **Assinatura para clipadores** (se a Kick não comprar o projeto). Referência: ferramentas de corte cobram
  US$ 15 a US$ 29 por mês (OpusClip); agências cobram de US$ 2.500 a US$ 10.000 por mês de alguns clientes.
- **O diferencial:** vários ângulos do mesmo lance, sincronizados. Quem posta sozinho e corta sozinho já existe
  no mercado; o multi-POV de evento não.
- **Limite:** o multi-POV só brilha quando há evento. Fora dele, o produto é um cortador com fila de postagem.

## Regra do dono: os outros dependem de nós, e não o contrário

A ideia dele é o ponto de partida, não a planta. Antes de construir, estudar o mercado todo e montar a melhor
versão, pegando o que os outros fazem bem e evitando o que fazem mal.

- **O que é nosso e não se terceiriza:** a sincronia dos POVs, a busca pelo som, o mapa do evento, os picos do
  chat e o corte. É isto que ninguém tem, e é isto que um comprador paga.
- **O que pode vir de fora, mas trocável:** a postagem nas redes. Se usarmos um serviço pronto no começo, fica
  atrás de uma peça nossa, para trocar de fornecedor ou fazer a nossa sem refazer o resto.

## O que o dono já tem e serve aqui (olhado em 06/10)

- **Postador** (repositório `estudos`, pasta `postador/`): a nossa própria API de postagem, sem mensalidade.
  Já publica no Instagram (Reels), no Facebook (Reels de Página), no TikTok (direto ou rascunho) e no YouTube
  (Shorts). Um pedido publica em todas; agenda por hora (`--quando`) ou pelo próximo horário livre (`--fila`).
  Roda no GitHub Actions. É a resposta à regra de não depender de ninguém: a fila de postagem do Povix chama o
  Postador. Limite conhecido: o Instagram só aceita o vídeo por link, por isso o vídeo passa por um endereço
  temporário que se apaga sozinho.
- **Fábrica de clipes** (repositório `clipes`, pasta `clipfactory/`): transcreve, escolhe trechos com
  validação, corta em 9:16 com legenda e gancho (ffmpeg, sem custo de API), escreve título, descrição e tags no
  idioma do mercado, e mede as visualizações de cada clipe. Também tem regras de edição testadas na prática
  (`docs/GUIA-CORTES.md`: ordem real, sem câmera lenta, sem repetir partes, reação inteira, sem estragar a
  surpresa).

**Cuidado, segundo o dono:** os dois projetos ainda não estão prontos e precisam melhorar muito. E boa parte do
que fazem hoje é uma IA (o Claude) a trabalhar caso a caso, não um programa que roda sozinho: escolher os trechos
e escrever títulos e legendas, por exemplo. Isso não se distribui nem se vende como está. Para entrar no produto,
cada parte tem de virar código que roda sem ninguém, ou ficar de fora. Por agora é só uma ideia por cima.

Como juntar (a desenhar): o Povix acha o lance e corta os ângulos; a fábrica põe legenda, gancho e título; o
Postador agenda e publica; a fábrica mede as visualizações. Cada peça continua utilizável sozinha.

## Estudo dos concorrentes (a fazer)

Para cada um: o que faz, preço, como o clipador usa no dia a dia, o que reclamam, e o que copiaríamos ou faríamos
melhor. Com fonte em cada número.

- **Corte com IA:** OpusClip, Vizard, Klap, Eklipse, Powder (já encerrado?), StreamLadder, Crossclip.
- **Postagem automática em várias redes:** o site que o dono usou, Buffer, Later, Metricool, Repurpose.io,
  Ayrshare (API para desenvolvedores).
- **Multi-POV e eventos:** o Multi-View da Kick, o MultiKick, o squad stream da Twitch, e o que os organizadores
  de evento usam hoje.
- **Agências e programas de clipes:** como trabalham e o que pagam (Clipping, o programa de clipes da Kick).

Daí sai: o que oferecer de graça, o que cobrar, e o preço.

## O que precisamos estudar (barato, antes de construir)

1. **Postar em várias redes:** usar um serviço pronto em vez de ligar cada rede à mão. Cada rede (TikTok,
   YouTube, Instagram, Facebook, X) exige app aprovado e revisão. Serviços como o que o dono já usou fazem isso
   com um login. Comparar preço, API e se aceitam vídeo vindo do navegador.
2. **Onde guardar o clipe até a hora de postar:** hoje o Povix não tem servidor e nada é guardado. Agendar
   precisa de um lugar para o arquivo e de algo rodando na hora marcada. Isso muda o custo e as regras da Kick
   (24 horas de guarda no acordo de desenvolvedor).
3. **Permissão:** a Kick por escrito, e os streamers (o clipe leva o nome do canal; opção sem som para música).
4. **Os outros projetos do dono no Claude Code:** ver quais já fazem parte disto (autopost, corte, legendas) e
   ligar em vez de refazer. Preciso do nome de cada um.
5. **Medir com 2 ou 3 clipadores reais** quantos clipes por hora fazem com e sem o Povix.

## A confiança da busca pelo som (resposta ao dono)

Medido em VODs reais: dois streamers que jogaram juntos bateram em 55 de 87 janelas; dois que não estavam juntos,
em 0 de 87. Quando o Povix diz "estava", acertou sempre nesse teste; mas perde cerca de 1 em cada 3 momentos.
É um só par medido: falta confirmar no evento, com mais gente. Precisa do Chrome ou do Edge, e durante o jogo
só olha lances com mais de 15 minutos.
