# quanto-sobra

Diz quais campanhas de content rewards ainda têm dinheiro — e **quantos dias
faltam até não terem**.

```bash
node bin/quanto-sobra.js https://contentrewards.com/discover/<id>
node bin/quanto-sobra.js            # lê campanhas.txt
node bin/quanto-sobra.js --json     # para outro programa ler
```

---

## O problema

O painel da campanha mostra `$4.553 de $5.600` e uma barra verde. Parece viva.

O que decide não é isso. É **quanto sobra a dividir pela velocidade a que está a
sair**. E esse número não está em lado nenhum do site — tem de ser calculado.

Quem publica num orçamento que acaba na quinta-feira trabalha de graça na sexta.

## As três contas que o site não faz

**1. A taxa a que a campanha paga MESMO.**
O CPM anunciado é tecto, não média. Medido na Rex Stax Clipping:

| | |
|---|---|
| CPM anunciado | **$1,00** por mil views |
| Views acumuladas | 15.842.270 |
| A $1, teria pagado | $15.842 |
| Pagou de facto | **$4.553,75** |
| **Taxa real** | **$0,287** por mil views |

São **3,5 vezes menos** que o anúncio. A diferença é submissão reprovada e o
tecto de $500 por vídeo. Prever a queima com o CPM do anúncio dá uma campanha a
morrer 3,4x mais depressa do que morre — e faz recusar campanhas boas.

**2. A queima por dia**, medida nas views dos últimos dias fechados — nunca
contando o dia de hoje, que ainda vai a meio e puxa a média para baixo.

**3. Quanto sobra por clipper já inscrito.** É a medida honesta da
concorrência: **$20.000 com 47 pessoas vale mais que $5.000 com 2.600.**

## O veredicto, e porquê

`ENTRA`, `CUIDADO` ou `MORTA` — sempre com o motivo escrito, porque um veredicto
que não diz porquê não é um veredicto, é um palpite com ar de autoridade.

| Regra | Limite | Resultado |
|---|---|---|
| Estado da campanha | ≠ `active` | MORTA |
| Orçamento gasto | ≥ 90% | MORTA |
| Restante | < $100 | MORTA |
| Dias de orçamento | < 7 | CUIDADO |
| Exige candidatura, é privada, ou a agência não está verificada | — | CUIDADO |

## O que se lê sem entrar na campanha

O site só mostra as regras e os materiais a quem já aceitou o brief
(*"Requirements are not available in this preview"*). Estão no HTML à mesma:

- **`regras`** — ex.: *"Add link in bio …"*, *"Minimum video length 10s"*
- **`materiais`** — os links do Google Docs e do Drive com o b-roll

Dá para decidir **antes** de aceitar seja o que for.

## Apanhado na primeira execução

A **Text Audio Campaign** estava a ser anunciada pela própria agência com
*"CPM INCREASE → $1 · You're crazy if you don't jump in"*.

```
▌ MORTA  Text Audio Campaign | $1 CPM
  Orçamento  $3465.00 de $3465.00  →  restam $0.00  (100.0% gasto)
```

Cem por cento gasto. Zero dólares. Quem entrasse naquele anúncio não recebia nada.

## Como lê

Não há API pública e não é preciso: a página traz o cartão da campanha embutido
no HTML, em JSON escapado. Um navegador não ajudaria — e nem sequer funciona
daqui: toda ligação do Chromium neste contentor morre em `ERR_CONNECTION_RESET`.
Só `curl` sai.

Dois detalhes que custaram tempo:

- A descrição de uma campanha cita `\"What Is Love\"` e vem escapada **duas
  vezes**. Depois do primeiro desescape sobra `\\"`, que não é JSON válido — e a
  campanha inteira ficava por ler por causa de um par de aspas numa frase.
- O recorte do objecto tem de saber quando está **dentro de uma string**. Uma
  chaveta solta numa descrição (`desconto de 50% }`) fecha o objecto cedo demais
  numa contagem ingénua. Chavetas emparelhadas escondem o defeito — foi assim
  que a primeira versão deste teste passou sem testar nada.

## Testes

```bash
npm test      # 22 testes, sem dependências nenhumas
```

Cada teste foi verificado a partir o código de propósito: os sete defeitos que
ele cobre derrubam o teste que os cobre. Dois passaram impunes à primeira
tentativa e o teste foi corrigido — estão marcados no ficheiro.
