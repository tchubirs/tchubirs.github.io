# 19 artistas ativos, e o que mandar pra eles

Achado varrendo as 6.166 skins aceitas da história do Rust. Filtro:
- **aceite em 2025 ou 2026** — está ativo agora, não parou em 2017
- **no máximo 4 skins aceitas** — sabe desenhar, mas não tem escala
- **pelo menos 150 votos** na melhor — a Facepunch já aprovou, o talento é provado

São pessoas que **provaram que fazem arte que passa** e não construíram negócio
em cima. Falta a elas exatamente o que sobra nele: **alcance**.

Lista completa em `dados/artistas.json`.

## ⚠️ CORREÇÃO — ele derrubou a primeira lista

A primeira versão colocava **`NotHolly`, `Monstera` e `Davix`** no topo. Os três
fizeram **Twitch drop**, não skin de loja.

Drop é feito para a campanha de um criador específico: é combinado, não é enviar
e torcer. E **não é vendido**, então não existe divisão de receita. A proposta de
"eu levo votos, a gente divide" não faz sentido nenhum para eles.

Pior: eu **ordenei por votos**. Drop é empurrado para a audiência inteira de um
criador, então junta voto fácil. **O ranking estava sistematicamente puxando drop
para o topo.** O campo `isTwitchDrop` estava na base desde o começo e eu não usei.

### O que a base realmente diz

| Tipo | Quantas | Fatia |
|---|---|---|
| **Loot crate** | 3.149 | 51,1% |
| **Loja (vendida de verdade)** | **2.358** | **38,2%** |
| Twitch drop | 592 | 9,6% |
| Publisher drop | 22 | 0,4% |

**Só 38% das skins aceitas são realmente vendidas.** Falar em "6.166 skins
aceitas" superestimava a oportunidade de loja. (A conta de receita por skin não
muda: ela usou as rotações semanais da loja, que já eram só de itens vendidos.)

## Os primeiros a procurar — só quem VENDE na loja

71 artistas de loja, ativos em 2025-2026, com no máximo 4 skins. Os mais fortes:

| Votos | Skins | Aceita em | Artista |
|---|---|---|---|
| **4.958** | 4 | 2025-12-18 | `SLIMEface v.2` — Atomic Garage Door |
| **1.975** | 4 | 2026-07-30 | `arin` — Hazma Sheet Metal Door |
| **1.773** | 4 | 2025-10-30 | `🔥MDemon` — Cobalt Personal Locker |
| **799** | 2 | 2025-03-20 | `🔥Creatorius🔥` — Beauty Industry Double Door |
| **797** | 2 | 2026-02-26 | `Ariata 👉👈🥺` — Howling Double Door |
| **503** | 1 | 2025-05-15 | `John_Richsoon` — BamBOOM AR |
| **485** | 4 | 2025-01-23 | `HEWOK` — The Spell Garage Door |
| **359** | 3 | 2026-07-30 | `Graphy` — Amethyst Geode Rock |

`arin` é a melhor aposta: **1.975 votos, aceite em 30/07/2026** — talento alto e
ativo agora. `SLIMEface v.2` tem mais votos mas é de dezembro.

Lista completa dos 71 em `dados/artistas.json`.

## Por que eles aceitariam

A troca é específica e honesta, e sai da regra que a própria Facepunch publica:

> *"whichever is obviously the best, whichever has the **most votes**, whichever
> is presented nicer"* — FAQ oficial do Workshop

**A mediana de votos numa skin aceita é 351.** Esses artistas fazem arte boa e
perdem para skin pior com mais gente votando. É a frustração deles.

Ele tem **43 mil seguidores que jogam Rust**. Não é favor: é a peça que falta
pra arte deles ser escolhida.

## Mensagem — inglês (a maioria é de fora)

> Hi — I saw your **[NOME DA SKIN]**. It's genuinely good work, and it clearly
> passed Facepunch's bar.
>
> I'm a Rust creator with 40,000 Twitch followers and 3,000 on Kick — all Rust
> players. I don't make skins. You do.
>
> Facepunch says outright that votes weigh in which submissions get picked, and
> the median accepted skin only has around 350 upvotes. That's the part you're
> missing and the part I have.
>
> Straight proposal: you make the skin, I push it to my audience for votes, and
> we split the revenue if it gets accepted. You keep the Steam account and the
> credit — it's your work, published under your name. I take a percentage only
> when it pays.
>
> No cost to you, and nothing to lose if it doesn't get picked. Want to try one?
>
> — Tchubi · x.com/TchubiRS

## Mensagem — português (se o artista for BR)

> Fala! Vi sua **[NOME DA SKIN]**. É trabalho bom de verdade, e passou no crivo
> da Facepunch, que não é fácil.
>
> Eu sou criador de Rust, 40 mil seguidores na Twitch e 3 mil na Kick, todos
> jogadores de Rust. Eu não faço skin. Você faz.
>
> A Facepunch diz no FAQ oficial que **voto pesa** na escolha, e a mediana de
> uma skin aceita é de só uns 350 votos. É exatamente a peça que te falta e que
> eu tenho.
>
> Proposta direta: você faz a skin, eu levo pro meu público votar, e a gente
> divide se for aceita. **A conta Steam e o crédito são seus** — o trabalho é
> seu, publicado no seu nome. Eu fico com um percentual só quando pagar.
>
> Não te custa nada, e se não for escolhida você não perdeu nada. Topa testar uma?
>
> — Tchubi · x.com/TchubiRS

## Regras ao mandar

1. **Cita a skin pelo nome.** Mensagem genérica é ignorada, e com razão.
2. **Manda pros 5 primeiros**, não pros 19. Se nenhum dos 5 responder, o
   problema é a oferta, não o volume.
3. **Nunca peça a conta Steam dele.** A conta e o crédito são dele — isso é o
   que torna a proposta segura pro artista, e é o que faz ele responder.
4. **Não prometa número.** A taxa de aceitação é ~1,8%. Diga isso.
