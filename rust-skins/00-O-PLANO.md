# Skins de Rust — o caminho medido em 27/08/2026

Este é o primeiro caminho de todo o estudo onde **a audiência dele vira dinheiro**.
Não porque o público brasileiro compre — ele não compra. Porque o que decide aqui
é **voto**, e voto é de graça.

---

## Como funciona (workflow oficial da Facepunch, verificado)

Fonte: https://wiki.facepunch.com/rust/Creating_Skins

1. Abre o Rust → botão **Workshop** → **Create a new item**
2. Escolhe o item → **EDIT** → editor de textura
3. **Seta laranja à esquerda = baixa a textura original** ← ele me manda o arquivo
4. **Quadrado de textura à direita = carrega um PNG do disco** ← ele carrega o meu
5. Preview → tira screenshots
6. Aba **Publish** → dá nome → publica

**Sem Unity. Sem Photoshop. Sem 3D. Sem programar.**
Eu faço o PNG. Ele carrega e publica. É a divisão 99% / 1% que ele pediu.

---

## Os números — VERIFICADO (medido por mim, hoje)

| O quê | Número | Como medi |
|---|---|---|
| Skins aceitas no total (histórico) | **6.166** | API do SCMM, 65 páginas |
| Entraram na loja nas últimas 26 semanas | **335** (~13/semana, ~670/ano) | API SCMM, 26 rotações semanais |
| Novos envios ao workshop | **~100/dia** (~36.500/ano) | Steam Workshop, amostra de 20 páginas em 6 dias |
| **Taxa de aceitação** | **~1,8%** | 670 aceitas ÷ 36.500 enviadas |
| **Dias entre enviar e ser aceito** | **mediana 10** (p25 9, p75 17) | 335 skins com data de envio e de aceite |
| **Votos positivos numa skin ACEITA** | **mediana 351** (p25 96) | 5.842 skins aceitas com dado de voto |
| Criadores distintos em 26 semanas | 111 | — |
| Fatia do maior criador | **6,9%** | — |
| Criadores com uma única skin aceita | **48%** | — |

**O teste da Apify: passou.** Na Apify um operador só (`memo23`) tinha 69% da melhor
categoria e a mediana era 6 usuários/mês. Aqui o maior criador tem 6,9% e quase
metade dos criadores entrou com uma skin só. O mercado está aberto de verdade.

---

## Os números — SUPOSTO (não confirmei em fonte primária)

| O quê | Número | Por que é suposto |
|---|---|---|
| Receita bruta mediana por skin na loja | US$ 26.555 | O SCMM **extrapola** o supply — mediana de 23× o valor conhecido |
| Fatia do criador | 25% | Fonte única (um tweet). A Facepunch não publica o número |
| **→ Pagamento ao criador por skin aceita** | **US$ 2.700 – 6.600** | as duas incertezas acima, combinadas pra baixo |

Checagem cruzada independente: a Facepunch teria faturado ≥US$11,4 mi com 611 skins
em 52 semanas = US$18.658 por skin. Minha mediana medida (US$26.555 bruto) fica na
mesma ordem de grandeza. **A magnitude se sustenta; o número exato não.**

---

## As três vantagens que dá pra empilhar

### 1. Voto — e essa é a grande
A mediana de votos numa skin **aceita** é **351**. O p25 é **96**.

Ele tem **40.005 seguidores na Twitch** e **3.000 na Kick**, todos jogadores de Rust.
Uma menção na live e um post no Discord passam de 351 votos fácil.

E a própria Facepunch diz, no FAQ oficial, que na hora de escolher entre skins
concorrentes olha *"whichever has the most votes"*.

Isto é o que ninguém mais nesse mercado tem no tamanho dele — e custa **€0** ao público.
Pela primeira vez no estudo inteiro, a audiência sem poder de compra vira dinheiro.

### 2. Bônus de estreante
FAQ oficial da Facepunch, texto exato:
> *"If one artist hasn't had an item approved before, we'd lean towards approving that artists work."*

Ele nunca teve skin aprovada. Isso conta a favor **agora**, e só agora.

### 3. Itens com poucas skins
A Facepunch pede isso explicitamente:
> *"Some items don't have many skins. It's worth considering making a skin for these
> items because we want all items to have a decent amount of skins available."*

Medi quantas skins cada item já tem, e cruzei com quanto o item fatura na loja.
Lista completa em `dados/itens.json`. Os melhores alvos:

| Skins já existentes | Bruto mediano na loja | Item |
|---|---|---|
| 16 | **$82.901** | Wood Double Door |
| 9 | **$64.359** | Bone Knife |
| 14 | $43.134 | Electric Furnace |
| 9 | $40.095 | Bear Skin Rug |
| 5 | $38.382 | Small Backpack |
| 8 | $32.590 | Metal Shop Front |
| 14 | $31.806 | Auto Turret |
| 13 | $30.652 | Salvaged Axe |
| 17 | $29.802 | Tactical Gloves |
| 17 | $29.142 | SKS |
| 25 | $27.233 | Jackhammer |
| 5 | $22.754 | Spinning Wheel |
| 1 | $22.400 | Wooden Spear |

**Evitar (saturados):** Assault Rifle (334 skins), Large Wood Box (293),
Sheet Metal Door (292), Garage Door (239), Hoodie (224), Metal Facemask (202).

---

## Regras de aceitação (wiki oficial) — o gerador tem que obedecer

Fonte: https://wiki.facepunch.com/rust/Getting_Skin_Accepted

- **Sujo e gasto.** Nada colorido demais nem brilhante. "To fit in the game items
  should look dirty and worn."
- **Respeitar o tier.** Camisa de estopa não pode parecer armadura de metal — muda
  a leitura do jogo.
- **Sem palavras.** "Rust is global" — texto não localiza, e derruba a chance.
- **Sem direito autoral de terceiros.** Nada de logo de jogo, celebridade, item de
  outro jogo.
- **Camuflagem genérica não.** "That doesn't mean we need to accept 100 varieties per item."
- **Página do workshop caprichada** — descrição e screenshots extras. Eu escrevo.

---

## Pagamento — verificado

- **IBAN funciona.** Conta em nome dele, e o nome do titular tem que bater com o
  nome legal do cadastro.
- **Entrevista fiscal obrigatória** (W-8BEN, por ser fora dos EUA). 5–10 minutos.
- **Mínimo de US$100 no mês** para o Steam disparar o pagamento. Uma skin aceita
  passa disso na primeira semana de loja.
- Fora dos EUA o Steam manda **SWIFT em USD** — o banco francês cobra taxa de
  ~€10–20 por transferência. Não mata, mas está aqui pra não ser surpresa.

---

## A conta honesta

- Cada envio: **~1,8% de chance**
- **40 envios → ~52% de chance de pelo menos uma aceita**
- Tempo dele: **~8 min por envio** (carregar PNG, screenshot, publicar) → **~5h para 40**
- Se uma for aceita: **US$ 2.700 – 6.600**

**Se sair uma:** 5 horas dele → US$2.700–6.600 → **US$540 a 1.320 por hora**.
**Se não sair nenhuma:** 5 horas dele → **US$0**.

Isso é uma loteria de variância alta com valor esperado muito bom e o baralho
marcado a favor dele (votos + estreante + itens vazios). **Não é salário.**
É a melhor razão €/minuto humano de todo o estudo, e a segunda coisa mais rápida:
**mediana de 10 dias entre publicar e ser aceito.**

Custo dele em dinheiro: **€0.** Ele já tem o Rust.

---

## A VERIFICAR — riscos ainda abertos

1. **Política de arte gerada por IA.** Procurei e **não achei** regra publicada da
   Facepunch sobre isso. Não existe proibição conhecida, e a wiki julga a arte, não
   a ferramenta. Mas está sem confirmação. **Se a Facepunch perguntar, ele responde a
   verdade.** Mentir queima a conta Steam dele, e a conta Steam tem o jogo dele dentro.
2. **A estimativa de supply do SCMM extrapola 23×.** Se estiver inflada, a receita cai
   junto. Por isso a faixa de pagamento está puxada pra baixo.
3. **A fatia de 25% tem fonte única.** Se for 10%, o número por skin vira ~US$2.700 —
   e continua valendo a pena.
4. **A taxa de 1,8% é a média com o lixo dentro.** Um envio bem direcionado deve ir
   melhor que 1,8%, mas não medi isso e não vou fingir que medi.

---

## Divisão do trabalho

**Meu (99%):** escolher o item, gerar a textura respeitando o UV e o desgaste do
original, escrever nome e descrição da página do workshop, e o texto que ele posta
pra pedir voto.

**Dele (1%):** no Rust — baixar a textura original e me mandar, carregar meu PNG,
tirar screenshot, publicar. Depois: uma menção na live e um post no Discord.
Uma vez só: entrevista fiscal e IBAN no Steam.
