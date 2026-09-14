# peneira

Passa tokens acabados de nascer na Solana pelas armadilhas que **dá para medir**,
e diz `FOGE`, `CUIDADO` ou `PASSA` — sempre com o motivo escrito.

**No ar: https://tchubirs.github.io/peneira/** — refaz-se sozinha e diz a idade dela própria.

```bash
node bin/peneira.js <endereço-do-token>
node bin/peneira.js --novos 24
node bin/peneira.js --novos 24 --html site/index.html
npm test                              # 28 testes, zero dependências
```

## O que mede, e de onde vem

Tudo público, tudo sem chave paga:

| O quê | Onde | Porque importa |
|---|---|---|
| `mintAuthority` | RPC da Solana | se estiver activa, podem imprimir mais e diluir-te |
| `freezeAuthority` | RPC da Solana | se estiver activa, podem congelar a tua carteira |
| Liquidez | DexScreener | é o que decide se consegues **sair**, não se consegues entrar |
| Avaliação ÷ liquidez | os dois | $58.905 de avaliação com $17,96 no fundo é 3.280x de ar |
| Compras contra vendas | DexScreener | toda a gente a sair ao mesmo tempo |
| **Oferta dentro da piscina** | os dois | o resto está em carteiras — é o martelo que existe lá fora |
| Idade | DexScreener | abaixo de 5 min não há história nenhuma para ler |

## O que NÃO mede, e está escrito na página

A concentração **por carteira**. Os três RPC públicos da Solana recusam
`getTokenLargestAccounts` sem chave paga — medido: 403, 400 e 429.

A fracção dentro da piscina é o mais perto que se chega de graça, e **não é a
mesma coisa**: 95% fora da piscina tanto pode estar em dez mil pessoas como numa
só, e a diferença entre as duas é tudo.

## Os limites, e de onde saíram

| Regra | Limite | Medido em |
|---|---|---|
| Liquidez mínima | $1.000 | abaixo disto não se sai da posição |
| Avaliação ÷ liquidez | 50x | o HODLER real deu 3.280x |
| Vendas ÷ compras | 3x, com ≥5 trocas | sem o mínimo de trocas qualquer razão dispara |
| Idade mínima | 5 min | — |
| **Oferta na piscina** | **<1% foge, <4% avisa** | amostra de 13 tokens: mediana 11,4%, p10 4,4% |

A amostra dos 13 tokens é pequena, e está dito no código para quem mudar o
limite saber em cima de que é que está a mudar.

## Apanhas reais

| Token | O que se viu |
|---|---|
| **HODLER** | avaliava-se em $58.905 com **$17,96** de liquidez |
| **Kabosucoin** | $21.023 de volume numa hora, **$0,75** de liquidez — a fuga a acontecer |
| **SPEPE** | **0,002%** da oferta dentro da piscina; o resto em carteiras |

## PASSA não quer dizer bom

Quer dizer que não encontrei nenhuma das armadilhas que sei procurar. O próprio
veredicto diz isso, e o rodapé da página traz a base do mercado medida em
`estudo-memecoin/`: **138 tokens seguidos desde o primeiro minuto, comprar todos
em partes iguais dá 0,71x** depois de contar como perda os que já não têm
liquidez para se venderem.

## Porque é uma página gerada e não uma que consulta sozinha

Um site no GitHub Pages a chamar o DexScreener a partir do browser bate em CORS
e em limites por visitante. Gerar de fora e servir o resultado é mais rápido
para quem abre e não parte quando duas pessoas abrem ao mesmo tempo.

O horário do GitHub é "melhor esforço": medido, com `*/30` disparou **uma vez em
quatro** — 90 minutos sem correr. Está agora aos 7 e aos 37, longe dos minutos
redondos que toda a gente usa. E como o atraso vai acontecer na mesma, a página
diz a idade dela e avisa acima de uma hora.
