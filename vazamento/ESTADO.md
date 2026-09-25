# Estado

**Projeto começado a 25/09/2026.** Pronto a submeter ao Progress Prize da Vesuvius no
mesmo formulário da vez passada. Prazo: **30/09/2026, 23:59 Pacífico**. As regras
deixam submeter várias vezes no mesmo mês.

## O que se encontrou (medido nos dados públicos deles)

1. **Bug no carregador oficial**: em 6 segmentos (5 do PHerc 1667 e 1 do 0009B), os
   ficheiros de validação publicados têm um nome que o código de treino não reconhece.
   O código ignora-os em silêncio: treina em cima do que devia ser validação.
   Provado a correr a função deles, sem alterações. **Com correção pronta e testada.**
2. **O mesmo papiro rotulado duas vezes com nomes diferentes**, dentro do corpus
   oficial de treino: Scroll 1 w01/w02 e PHerc 139 w028/w044. A tinta coincide 94,5% e
   84,7% nessas zonas. A deduplicação deles é por nome e não os vê.
3. **Vazamento real de validação**: no PHerc 1667, cerca de **um terço** da validação do
   w029 está em cima do treino do w028 — mesmo texto (90,8% de concordância).

## O que não se provou

Não se re-treinou nenhum modelo — não sei quanto a nota fica inflacionada. Isso precisa
das GPUs deles. Está dito assim no texto.

## Porque é melhor que a submissão de 17/09

Aquela mostrava um defeito mas não provava efeito em dados reais. Esta encontra
problemas concretos **nos dados publicados deles**, aponta ficheiros e números exatos,
e traz uma correção de um ficheiro com teste. Em Julho pagaram $1.000 por trabalho
de validação.

## Dinheiro ganho até hoje

**€0,00.**
