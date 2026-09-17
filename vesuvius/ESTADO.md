# Estado

## Submetido

**17/09/2026** — submetido ao Progress Prize da Vesuvius Challenge, pelo formulário
oficial. Prazo do mês: 30/09/2026, 23:59 Pacífico. Submetido 13 dias antes.

O formulário levou o link para:

```
https://github.com/tchubirs/tchubirs.github.io/tree/claude/ai-revenue-automation-map-g00jks/vesuvius
```

⚠️ **Esse ramo não pode ser reescrito nem apagado até haver resultado.** O link que está
na submissão aponta para ele. Force-push, rebase ou apagar o ramo partem o link e a
submissão fica sem código. Fundir para o `main` é seguro (o ramo continua a existir);
reescrever não é.

## O que foi submetido

Um patch ao `volume-cartographer` que tira o `srand(time(NULL))` de
`core/src/surface_metrics.cpp:85` — a busca de 1000 reinícios aleatórios por trás de
`winding_valid_fraction`, o número que o `eval_surface_tracer.py` usa para ordenar os
traços. Mais 11 testes no arranque deles, a ferramenta `metric_noise_floor.py` para
medir quanto da métrica é ruído, e uma reprodução isolada sem dependências.

Detalhe completo e as medições em `README.md`. As respostas do formulário, campo a
campo, em `FORM.md`.

## O que se segue

- Os resultados de Julho saíram a **6 de Agosto**, seis dias depois do prazo desse mês.
  Pelo mesmo ritmo, os de Setembro devem sair no **início de Outubro**.
- Está agendada uma verificação automática para **08/10/2026**
  (`trig_01QgJcJZnVaJERLnA68q8UCu`): lê o arquivo do Substack deles, vê se há resultado,
  e avisa.
- **Se ganhar:** os Termos dão **30 dias a contar do anúncio** para enviar os dados de
  pagamento à Scroll Prize, Inc. Passado isso, perde-se o prémio.

## Expectativa, medida

Julho de 2026 (fonte: <https://scrollprize.substack.com/p/335k-awarded-in-july>):
58 submissões, **13 premiadas — 22%**, $33.500 no total. $20.000 para a melhor; as
outras 12 dividiram $13.500, média ~$1.125. Um dos prémios de $1.000 foi *"for an update
to the ink tutorial that includes proper validation data"* — ou seja, pagam por trabalho
de validação, que é a categoria desta submissão.

Faixa realista aqui: **$250 a $1.000**. Não $20.000 — a submissão diz, em letra própria,
que não provou nenhuma ordenação errada.

## Dinheiro ganho até hoje

**€0,00.**
