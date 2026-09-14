# peneira

Passa tokens acabados de nascer na Solana pelas armadilhas que **dá para medir**,
e diz `FOGE`, `CUIDADO` ou `PASSA` — sempre com o motivo escrito.

**No ar: https://tchubirs.github.io/peneira/** — refaz-se sozinha e diz a idade dela própria.

```bash
node bin/peneira.js <endereço-do-token>
node bin/peneira.js --novos 24
node bin/peneira.js --novos 24 --html site/index.html
npm test                              # 31 testes, zero dependências
npm run browser                       # o guião embutido, num Chromium a sério
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

## Gerada E viva — e porquê as duas

Escrevi aqui, antes, que uma página no GitHub Pages a chamar o DexScreener do
browser "bate em CORS". **Estava errado, e nunca o tinha medido.** O DexScreener
responde `access-control-allow-origin: *`, e 12 tokens numa chamada voltam em
**122 ms**.

Por isso a página faz as duas coisas:

| | |
|---|---|
| **Gerada** pelo Actions | serve de base, e traz o que só a blockchain dá: mint e freeze authority |
| **Viva** no browser | ao abrir, vai buscar liquidez, volume, idade e a fracção na piscina, e **recalcula o veredicto no teu telemóvel** |

O que o browser não refaz são as autoridades — e não precisa: uma autoridade
queimada não volta a acender.

**O guião corre os MESMOS ficheiros que a linha de comandos.** `peneirar.js` e
`cartao.js` são embutidos na página tal como estão. Uma segunda cópia das regras
dentro do `<script>` era a maneira mais rápida de a página e o terminal
passarem a discordar sem ninguém dar por isso.

### Porque isto era preciso

O horário do GitHub é "melhor esforço", e falhou duas vezes medidas: **90
minutos** à primeira, **245** à segunda. Não vale a pena continuar a afinar o
cron — está aos 7 e aos 37 (longe dos minutos redondos que toda a gente usa) e
passa a ser só a rede de segurança para quem nunca abre a página.

A página diz na mesma a idade dela, e avisa acima de uma hora.
