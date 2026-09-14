# estudo-memecoin

Um estudo **prospectivo** do mercado de memecoins na Solana: fixa-se um grupo de
tokens acabados de nascer, **antes** de se saber o que lhes acontece, e mede-se
o desfecho de todos — os que subiram e os que morreram.

```bash
python3 coorte.py    # fixa o grupo de controlo (já feito, em dados/coorte.json)
python3 medir.py     # mede o desfecho e escreve dados/resultado.json
```

## Porquê assim, e não a ler o que se publica

Tudo o que se lê sobre este mercado tem o mesmo defeito: **só se publica quem
ganhou.** O `+$3.95K` aparece no X; a lista dos tokens que foram a zero no
primeiro minuto não existe em lado nenhum. Qualquer conclusão tirada do que se
publica está a olhar só para os sobreviventes.

Fixar o grupo antes do desfecho é a única forma de fugir a isso. O ficheiro
`dados/coorte.json` foi escrito **antes** de qualquer resultado ser conhecido, e
está no git com a data — não dá para o escolher depois.

## O tamanho do mercado, medido

A listagem de piscinas novas da GeckoTerminal tem 10 páginas de 20. Medida em
13/09/2026, as 200 piscinas cobriam **9 minutos**:

| | |
|---|---|
| Tokens novos por hora | **~1.300** |
| Por dia | **~32.000** |
| Liquidez mediana (amostra de 20) | **$2.211** |
| Volume mediano em 24h | **$162** |
| Sem uma única troca nos últimos 5 min | **9 em 20** |

O maior por volume nessa amostra, `ATM/SOL`, tinha **$26.901 de volume e $0 de
liquidez** — assinatura de liquidez já retirada.

## O grupo fixado

- **140 tokens**, fixados a **2026-09-13T23:00Z**
- Todos com **2 a 8 minutos de vida** no momento em que foram fixados
- Guardado por token: endereço, nome, hora de criação, **preço de entrada**,
  liquidez e volume nesse instante

## O que se mede

Retorno de cada um contra o preço de entrada, e a distribuição inteira:
mediana, média, p10/p25/p75/p90, quantos ficaram abaixo da entrada, quantos
perderam 90% ou mais, quantos dobraram, quantos fizeram 10x.

A **média** é o número que interessa a quem comprasse todos em partes iguais.
A **mediana** é o que acontece ao token típico. As duas juntas dizem se o
mercado é "poucos ganhos enormes a pagar muitas perdas" ou simplesmente uma
perda.

Um token cuja piscina desaparece conta como **retorno 0**, não como dado em
falta — deixá-lo de fora seria reintroduzir exactamente o viés que este estudo
existe para evitar.

## Limites, ditos à partida

- Uma janela. Um grupo de uma noite não é o mercado inteiro; é um grupo honesto
  de uma noite.
- Preço de mercado, não preço executado. Não desconta derrapagem, taxas nem o
  imposto de prioridade — todos contra o comprador, por isso o resultado real é
  **pior** do que o medido, nunca melhor.
- A GeckoTerminal limita chamadas (HTTP 429). O medidor recua e tenta de novo;
  o que mesmo assim falhar é contado em `falharam` e não é escondido.

---

## O resultado

Grupo fixado a **2026-09-13T23:00Z**, medido **2h25m depois**. 138 dos 140
medidos (2 falharam na API, nenhum foi escondido).

### Primeiro, o número errado

| | |
|---|---|
| Média | **2,31x** |
| Mediana | 1,00x |
| Melhor | 77,13x |

Parece um mercado excelente. **Não é** — e a forma da distribuição denuncia-o:
a mediana e o percentil 75 estão cravados em **exactamente 1,000**. Isso não é
"manteve o valor"; é **nunca mais foi negociado**, e a API repete o último preço.

**63 dos 138 tokens estão nessa situação.** E pior:

| Os cinco maiores | Retorno | Liquidez ao medir |
|---|---|---|
| Fruit | 77,13x | **$0** |
| Tulip | 39,64x | **$0** |
| xBTC | 26,28x | $75.930 |
| TWINE | 19,83x | **$0** |
| HERO | 18,55x | $121 |

**Quatro dos cinco maiores ganhos estão em piscinas sem liquidez nenhuma.** Esse
preço é o da última troca antes de a liquidez ser retirada. Ninguém vendeu a 77x
— não havia a quem vender.

### Agora o número certo

Um ganho que não se consegue realizar não é um ganho. Exigindo que a piscina
ainda tenha dinheiro para se poder sair:

| Exigir no fundo | Média | Mediana | Sem saída |
|---|---|---|---|
| nada (papel) | **2,31x** | 1,00x | 0/138 |
| $100 | 0,93x | 0,96x | 52/138 |
| $250 | 0,78x | 0,89x | 55/138 |
| **$500** | **0,71x** | 0,72x | 60/138 |
| $1.000 | 0,70x | 0,65x | 62/138 |
| $2.500 | 0,33x | 0,00x | 119/138 |

**69% do ganho médio era papel.** Basta exigir $100 no fundo — nem dá para uma
posição a sério — e a média já cai abaixo de 1,00x.

**Comprar todos os tokens novos em partes iguais dá 0,71x: perde-se 29%.**

E isto é o **melhor** caso: são preços de mercado, sem derrapagem, sem taxas e
sem imposto de prioridade, todos contra o comprador. O resultado real é pior.

### O que isto não diz

Não diz que ninguém ganha. Diz que **o ganho médio de comprar cedo é negativo**,
e que os ganhos enormes que se publicam estão, na maioria, em posições que já
não se conseguem vender. Quem ganha consistentemente não está a fazer isto — ou
está do outro lado da mesa.
