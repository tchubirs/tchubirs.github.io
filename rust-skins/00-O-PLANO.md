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

## Pagamento — VERIFICADO na fonte oficial

Fonte: https://steamcommunity.com/workshop/workshoppaymentinfofaq/

### As regras, texto exato da Valve

- **Só transferência banco-a-banco.**
  > *"Q. Can I receive payments in my PayPal account or other similar non-bank
  > accounts? A. **No. Payments can only be received via bank-to-bank transfers.**"*
- **Só em dólar.**
  > *"We pay in US dollars only... Please check with your bank to ensure that they
  > can receive USD — **some banks will not accept USD**."*
- **Nome do titular igual ao nome legal, sem variação.**
  > *"Any variations (Mr J Smith vs. Joseph Smith) will not be accepted... this means
  > you **cannot use someone else's bank account**."*
- **Nada de conta intermediária.**
  > *"Q. Can I enter a FFB (for further benefit) or FFC (for further credit) account?
  > A. **No, your bank account information needs to be in your name directly. We cannot
  > process payments that require additional instructions to complete.**"*
- **Nada de conta conjunta.** O nome do titular tem que ser só o dele.
- **Mínimo de US$100 no mês** para disparar o pagamento.
- **Sem dados bancários, não dá pra fechar a divisão de receita.**
  > *"You will not be able to finalize revenue splits on items in Steam Workshop prior
  > to providing us with valid contact, banking and tax information."*
  Publicar no workshop e receber votos **não** exige isso. O cadastro precisa estar
  pronto antes de a skin ser **aceita** — a mediana de 10 dias dá folga de sobra.
- **Mudança de país de residência obriga a refazer a entrevista fiscal.**
  Ele mora na França. Declara França. Receber numa conta de outro país **não muda**
  residência fiscal, e declarar país errado é fraude fiscal — não é atalho.

### Ele tem Wise e Revolut. O que serve

| Conta | Serve? | Por quê |
|---|---|---|
| **Revolut** | **Provável que sim** | O Revolut Bank UAB tem **licença bancária plena** do BCE, passaportada no EEE. Emite IBAN real com BIC. É banco de verdade, e guarda USD nativamente — resolve o problema de "alguns bancos não aceitam USD" |
| **Wise** | **Risco real** | A Wise **não é banco** — é instituição de moeda eletrônica (EMI). Ela mesma diz isso. A regra da Valve é *bank-to-bank only*, e recebimento em USD na Wise passa por banco parceiro, o que se parece com o "further credit" que a Valve recusa |
| **Banco francês normal** | Sim, mas caro | Aceita, se o banco receber USD. SWIFT em USD custa ~€10–20 e a conversão é ruim |

**Ordem recomendada:** tentar **Revolut** primeiro. Se o Steam recusar, banco francês.
**Não usar a Wise como primeira opção** — se der problema, ele descobre depois de já
ter uma skin aceita, e trocar dado bancário no meio é dor de cabeça.

⚠️ **NÃO MEDIDO:** não achei caso confirmado de Steam aceitando ou recusando Revolut
ou Wise especificamente. A classificação acima vem da **regra publicada** cruzada com
o **estatuto jurídico** de cada uma, não de um teste real. Ele descobre na prática ao
cadastrar — e o cadastro é gratuito e reversível antes da primeira skin aceita.

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
