# Estado

**Projeto começado a 25/09/2026.** Pronto a submeter ao Progress Prize da Vesuvius.

## 27/09/2026 — decisão do dono: não submete

Palavras dele: *"Não vou fazer essa merda já fiz tantas vezes e nunca tenho resposta"*.
**Não se lhe volta a pedir que preencha formulários.**

- O trabalho fica guardado aqui, completo. Se for submetido, entra em Setembro (até
  30/09) ou em Outubro (até 31/10) — os prémios são mensais.
- Oferta feita, sem insistir: se ele der **uma vez** o nome completo e disser
  "podes enviar em meu nome", passo a ser eu a submeter ao Progress Prize — esta e as
  seguintes, sempre com a divulgação de que foi feito por IA. Ele não abre nada.
- **Correção (27/09, mais tarde):** a verificação acima estava errada. Li só o HTML;
  o aviso de login é desenhado por JavaScript. Aberto num browser a sério, o
  formulário mostra "To fill out this form, you must be signed in." — exige conta
  Google. Não dá para eu enviar sem o login dele, e a password não se pede.
- O dono deu o nome completo. Em vez de envio automático, foi-lhe dado no chat um
  **link pré-preenchido** (nome, equipa, URL, texto completo, termos aceites),
  verificado num browser: 200, todos os campos preenchidos. Ele só tem de marcar
  "Record my email address" e carregar em Submit. O link não fica neste repositório
  porque leva o nome dele e o repositório é público.
- A submissão de 17/09 ainda não podia ter tido resposta: os prémios de Julho foram
  anunciados a 06/08; os de Setembro saem no início de Outubro. Verificação agendada
  para 08/10.

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
