# Abisal: o piloto do Povix (plano, 06/10/2026)

Evento de Rust, todo transmitido na Kick, com premiação, e com live obrigatória para todos os participantes. É o
piloto ideal: todos os ângulos existem, e há um motivo para todos quererem clipes.

## O princípio

Não vender nada ao organizador. Oferecer de graça e mostrar, com o evento dele, uma coisa que ele não tem. Um
projeto em texto não convence; o mapa do evento dele aberto, com os times dele e um lance dele em vários
ângulos, convence em 30 segundos.

## O que precisamos dos participantes

O nome do canal na Kick, que é o que vem depois de `kick.com/`. O nome que aparece na tela às vezes é outro
(espaços, letras maiúsculas, apelido). O Povix aceita a lista solta, uma linha por time ou a página de times do
evento colada inteira, e marca em vermelho "não achado" quem estiver escrito errado. O ideal é a lista de links
`kick.com/canal`; só os nomes servem, com uma conferência rápida no mapa.

## A oferta, pensada para cada um

**Para o organizador: o evento chega a quem não estava assistindo.**
- Uma página do evento (exemplo: `povix.app/abisal`) com todos os streamers num mapa por time. Quem perdeu um
  lance volta e vê de todos os lados. Ninguém mais tem isso.
- Um resumo diário: os maiores picos do chat do dia, com o link de cada lance. Pronto para as redes do evento.
- No fim, um relatório: quantos clipes saíram, quantas visualizações fora da Kick, quais lances rodaram mais.
  É o número que ele mostra a patrocinadores no próximo evento.

**Para os streamers: mais conteúdo com menos trabalho.**
- Cada um abre o próprio lance com os ângulos dos colegas e dos inimigos, e corta em 16:9 ou 9:16 em minutos.
- O clipe leva o nome de cada canal que aparece: quem é clipado também ganha alcance.

**Para os clipadores e o público: um concurso.**
- "Clipe do dia" (ou da semana) com os clipes feitos no Povix, premiado pelo evento ou só com destaque nas redes
  oficiais. Concurso gera clipes em volume, e cada clipe é divulgação gratuita do evento.

**Para nós: os números do piloto.** Ângulos sincronizados, erro de sincronia, clipes feitos, visualizações,
minutos poupados. É o que entra na conversa com a Kick (`PITCH-KICK.md`).

## Como abordar (ordem)

1. Antes de falar com eles: abrir o Povix com o elenco real (assim que houver lista) e gravar um vídeo de 30
   segundos: o mapa do evento deles, um clique, o lance em 4 ângulos, o clipe 9:16 saindo.
2. Mandar ao organizador só isso: o vídeo, uma frase ("isto é o vosso evento; é de graça, querem para todos?")
   e o link.
3. Se aceitarem: uma mensagem pronta para os streamers, com o link e 3 passos, e o regulamento do concurso de
   clipes.
4. Durante o evento: acompanhar, corrigir na hora, contar os números.

## Com contato direto (atualizado 06/10)

Há contato direto com quem organiza, com os desenvolvedores do evento e com pessoas da Kick. Isso muda a ordem:

1. **Desenvolvedores do evento primeiro.** Mostrar o vídeo de 30 segundos e o link a quem constrói o evento: são
   eles que dizem ao organizador "isto funciona e não dá trabalho". Perguntar o que já usam (página de times,
   placar, log do servidor) para o Povix ler direto dali.
2. **Os streamers responsáveis pelo evento.** Se eles usarem e postarem clipes no Povix, os outros seguem.
3. **Pessoas da Kick.** Não pedir compra. Pedir duas coisas: o "pode usar" por escrito para o piloto, e o
   contato certo para falar dos números depois do evento. Com o piloto feito, a conversa de venda vem sozinha.

O log do servidor com o horário de cada abate e explosão (pergunta 2 do `ESTUDO.md`) vale ouro: com ele, o Povix
marca cada luta no mapa sem precisar do som.

## O que tem de estar pronto antes (por ordem de valor)

1. O site no ar com domínio próprio (o dono escolhe a hospedagem; recomendação em `LANCAR.md`).
2. O clipe de vários ângulos ligado na tela (o código está pronto, falta o botão). **Feito** (09/10): no editor do
   Clipar, "Ângulos 16:9" (até 4, um depois do outro) e "Ângulos 9:16" (dois, um em cima do outro). Falta ver a
   gravação com vídeo de verdade: os testes só têm vídeo falso.
3. Os bugs que ficaram parados (sessão, teclado, sincronia, Twitch, CI, mapa). **Feito** (09/10): juntados.
4. Uma página do evento com nome e link fixos, que abre direto no mapa.
5. A contagem dos números do piloto (clipes e visualizações), sem guardar vídeo nenhum.
6. Quem começa a live depois de o evento estar aberto aparecer sozinho. Hoje só aparece ao recarregar a página:
   o ao vivo estende quem já estava no ar, mas não volta a pedir a lista de VODs. **Feito** (09/10): de 2 em 2
   minutos pede de novo 25 dos que não estão no ar, à vez, e diz quem entrou.
7. A lista do evento pronta num arquivo, atualizada de tempos em tempos (por exemplo no GitHub Actions): cada
   pessoa que abre o evento faz 1 pedido em vez de 500 à Kick. Com muita gente a abrir, é o que evita a Kick
   estranhar o volume.
8. Um teste com 500 canais reais. Medido até agora na Kick real: 120 canais em 8 s; os 500 em menos de um minuto
   são uma conta a partir disso, não uma medição.
9. Um botão "Início" à vista na tela dos vídeos. O dono abriu um canal e não achou como voltar à tela de entrada
   (07/10): hoje só o "Recomeçar", lá embaixo, volta, e ele apaga a noite aberta.

## A teia do lance (ideia do dono, 06/10; a desenhar)

O objetivo é fluidez: trocar entre atacante, quem morreu, time atacante e time defensor em 1 ou 2 segundos, sem
voltar ao mapa.

- **Como é hoje:** trocar o ângulo em foco entre os que já abriram é rápido, porque os outros já estão carregados
  em baixa qualidade e o escolhido sobe para a alta (o tempo exato não foi medido). Trocar o grupo (do time
  atacante para o defensor) obriga a voltar ao painel e abrir de novo: são vários passos e alguns segundos. Marcar
  quem morreu existe na parte antiga (marcar kill e escolher a vítima), escondido.
- **A ideia:** ao escolher um momento, aparece a teia. Cada bolinha é um streamer que estava ali, com a cor do
  time; cada fio é uma ligação: mesmo time, ouviu o mesmo tiro, matou ou morreu. Clicar numa bolinha põe esse POV
  em grande; clicar num fio põe as duas pontas lado a lado (atacante e vítima); clicar num time abre o time. Com
  atalhos: "Atacante", "Atacante e vítima", "Time A", "Time B", "Todos".
- **Para ser em 1 ou 2 segundos:** todos os POVs da teia já carregados em baixa qualidade e parados no instante
  certo (até uns 12), para a troca ser só subir a qualidade de quem foi escolhido. Medir antes de prometer.
- **De onde vêm os fios:** time e "ouviu o mesmo" já temos. "Quem matou quem" com certeza só vem do log do servidor
  do evento; sem ele, a nossa detecção de morte é um palpite e tem de aparecer como tal.

## Riscos

- A Kick ainda não deu permissão escrita. Num piloto gratuito e com o organizador de acordo, o risco é baixo, mas
  existe (`ESTUDO.md`, seção 5).
- A busca pelo som só foi medida num par de streamers. O evento é o teste de verdade.
- Durante o jogo a busca só olha lances com mais de 15 minutos, para ninguém usar para achar rivais. Isto deve
  ser dito ao organizador como regra a favor do evento.
