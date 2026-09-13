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
