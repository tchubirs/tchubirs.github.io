# Canais 24/7 — o que é viável, o que não é

Ideia dele: rodar dezenas de canais 24/7 retransmitindo a live gravada de
streamers amigos, em várias plataformas, cobrando percentual do que render.

## A parte técnica: resolvida, e é barata

Não precisa de 50 OBS. O OBS é pesado porque **codifica** vídeo. Para
retransmitir arquivo que já está no formato certo, não se codifica nada.

**Medido aqui em 27/08/2026** (ffmpeg 7.0.2, 1080p30, 20s de vídeo):

| Modo | CPU por canal |
|---|---|
| `-c copy` (retransmitir) | **0,4% de um núcleo** |
| recodificando (o que o OBS faz) | **65,8% de um núcleo** |

**172x de diferença.** Numa máquina de 4 núcleos com folga de 50%: ~522
canais copiando, contra ~3 recodificando.

Processador não é o limite. **Banda é.**

| Canais | Banda sustentada | Tráfego mensal |
|---|---|---|
| 10 | 47 Mbps | 15 TB |
| 25 | 117 Mbps | 38 TB |
| **50 a 1080p** | **233 Mbps** | **75 TB** |
| 50 a 720p | 133 Mbps | 43 TB |

Isso pede servidor dedicado com gigabit sem franquia de tráfego: **€50 a
€150/mês**. Com 50 canais, dá **€1 a €3 por canal por mês**.

## As regras de cada plataforma — aqui é que a ideia se decide

| Plataforma | Rerun 24/7 | Detalhe que decide |
|---|---|---|
| **Twitch** | ✅ | conteúdo tem que ser seu ou licenciado, marcado como rerun; corta transmissão contínua em 48h |
| **YouTube** | ⚠️ | **só no canal de quem é dono do conteúdo** |
| **Kick** | ✅ | mais permissiva; o pagamento deles é por hora ao vivo e interação |
| **TikTok** | ❌ | live tem que ser em tempo real |

### O detalhe do YouTube que muda a arquitetura inteira

A política de *reused content* do YouTube lista "promoção do conteúdo de
outro criador" como não monetizável, e a punição é **desmonetização do canal
inteiro**, não de um vídeo.

Então há duas versões desta ideia, e só uma sobrevive:

❌ **Ele cria canais novos que passam a live dos amigos.** Conteúdo de
terceiro. Canal desmonetizado.

✅ **Ele opera o canal DO PRÓPRIO amigo, com o conteúdo DELE.** É a obra do
dono no canal do dono. O problema não existe.

O negócio não é "eu tenho uma rede de canais". É **"eu opero seu canal 24/7,
no seu nome, e cobro percentual"**. Serviço, com contrato. É limpo, e é
melhor negócio: o amigo já tem audiência e histórico no canal dele.

## A ideia do espectador ganhar parte

Aqui a linha é nítida, e vale saber onde ela passa antes de construir.

**Pagar dinheiro por tempo assistido é fraude de publicidade.** O anunciante
compra atenção real; espectador pago produz atenção fabricada. Toda
plataforma trata isso como viewbotting com gente de verdade, e a punição cai
nos canais — que aqui são o sustento dos amigos dele.

**Mas recompensar quem assiste é normal, e as plataformas construíram isso
de propósito:**

- **Twitch Drops** — item no jogo por tempo assistido. A marca paga. Oficial.
- **Pontos de canal** — a própria Twitch dá, e você define as recompensas
- **Kicks e recompensas de canal** na Kick — a API já expõe
  `channel.reward.redemption.updated`
- **Sorteio e sub-gift** bancados pelo streamer

A diferença: **vantagem dentro da plataforma, sim. Dinheiro por assistir,
não.** Ele já tinha percebido isso quando escreveu "só que de outra forma".

## Risco que não é técnico e é o maior de todos

O canal do amigo é o **sustento** dele. Se uma configuração de rerun
desmonetizar esse canal, o prejuízo é da pessoa, não do software. Por isso:

1. começar com **um** canal, de um amigo que entenda o risco
2. rodar 30 dias e conferir a receita dele antes e depois
3. só escalar com dado, não com entusiasmo

## O que já está pronto

- `src/canal.js` — argumentos do ffmpeg, perfil por plataforma, conta de banda
- `src/supervisor.js` — mantém N canais vivos: reinício com espera
  progressiva, rotação preventiva antes do limite de 48h da Twitch, playlist
  que avança em vez de repetir o mesmo vídeo, chave de transmissão nunca em log
- 14 testes, sem dependência externa

**Um bug real que os testes pegaram:** `pararTodos` matava o processo, o
evento `exit` disparava o reinício, e tudo ressuscitava sozinho. Quem parasse
o sistema veria ele voltar. Corrigido com uma marca de encerramento, mais
`retomar()` para reabrir de propósito.

## O que falta

1. Ingestão: pegar o VOD da Twitch/Kick do amigo e deixar no formato certo
   (recodificar **uma vez** ao arquivar, retransmitir mil vezes de graça)
2. Painel de estado dos canais
3. Contrato de percentual — e um amigo disposto a ser o primeiro
