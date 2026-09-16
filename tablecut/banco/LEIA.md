# Banco de ensaio

Mede o Tablecut contra documentos reais que não fui eu que fiz.

```sh
./buscar.sh                    # traz os 18 documentos para ./pdfs
npm install playwright         # uma vez
# CHROMIUM=/caminho/do/chrome   se o browser do sistema nao for o que o
#                               playwright instalou
node banco.js ./pdfs ../app.html antes
# ... alterar o algoritmo ...
node banco.js ./pdfs ../app.html depois
```

Depois compara-se `banco-antes.json` com `banco-depois.json`.

## A régua

| medida | o que quer dizer | bom é |
|---|---|---|
| `multi` | linhas com mais de uma célula | alto |
| `fundidas` | células com dois números que deviam estar separados | baixo |
| `soltas` | células com letras soltas (`M a r r i e d`) | baixo |
| `colunas` | colunas encontradas | comparar, não maximizar |
| `vazias` | células em branco na grelha | baixo |
| `recusado` | a ferramenta disse que é um scan | **é uma resposta certa, não uma falha** |

## A página que se mede

Mede-se **a página que a ferramenta abre sozinha**, não a melhor de todas.

Até 16/09 o banco percorria as páginas e escolhia a melhor por uma nota sua,
`linhas completas × colunas`. Parecia mais exigente e era pior: uma alteração
que mudasse o número de colunas mudava a nota, o banco escolhia outra página, e
a medição comparava páginas diferentes. Uma alteração que não estragou uma única
tabela apareceu como regressão. O banco tem de medir o produto, não inventar um.

## As contas pesadas pelo tamanho

O banco dá duas linhas de resumo. A segunda é a que decide:

```
multi 90.0% | fundidas 1.9% | soltas 0.7% | colunas 9.3
ponderado pelo tamanho: linhas completas 90.3% de 916 linhas | fundidas 1.8% de 4542 celulas
```

A primeira é a média por documento e **mente quando as páginas mudam de
tamanho**: uma página de quatro linhas tem sempre 100% de linhas completas e
pesa tanto como uma de quarenta e seis. Foi assim que quase reprovei a correcção
que faz o extracto francês abrir na página dos movimentos em vez de numa página
de texto legal.

## A regra

Uma alteração só entra se a média melhorar **e** nenhum documento que já estava
bom piorar. Numa noite escrevi quatro alterações ao algoritmo e **três foram
reprovadas por esta régua** — uma delas reduzia documentos de 13 colunas a uma
só. Sem medir, teria posto as três lá dentro convencido de que as melhorava.

Os números da última medição completa estão em `../PROVA.md`.

## `celulas.js` — a prova de que não se perdeu texto

Uma média pode melhorar com texto a desaparecer. Este guião abre **duas versões
lado a lado** e compara as células com texto, célula a célula e pela ordem de
leitura:

```sh
node celulas.js ./pdfs ../app-antes.html ../app.html
```

Se disser `nenhum documento perdeu ou trocou texto`, a alteração mexeu na forma
e não no conteúdo. Se disser `DIFERE`, mostra a primeira célula onde divergem.
