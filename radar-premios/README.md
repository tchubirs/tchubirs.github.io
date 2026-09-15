# radar-premios

Concursos abertos onde há dinheiro a sério, ordenados pela **hipótese de receber
alguma coisa** — não pelo tamanho do prémio.

**No ar: https://tchubirs.github.io/premios/**

```bash
node bin/radar.js                       # lista no terminal
node bin/radar.js --paginas 12 --html site/index.html
npm test                                # 19 testes, zero dependências
```

## A conta que o Devpost não faz

O Devpost ordena por prémio. **O prémio é a pergunta errada** quando o objectivo
é conseguir *um* pagamento e não maximizar o valor esperado.

> $50.000 com **um** vencedor entre 3.000 pessoas = **0,03%** de hipótese.
> $400 repartidos por **3** prémios entre 234 pessoas = **1,3%**.

Quarenta vezes mais provável, por um centésimo do prémio. Para quem precisa de
provar que entra dinheiro, a segunda é melhor — e o Devpost põe-na no fundo.

**Hipótese = prémios em dinheiro ÷ inscritos.**

## O que elimina, e porquê — tudo medido

Amostra de **49 concursos abertos**, 15/09/2026:

| Eliminação | Quantos | Porquê |
|---|---|---|
| Prémio de **$0** | **21 de 49** | não tem dinheiro nenhum |
| **Presencial** | 9 de 49 | ele está em França |
| Só por **convite** | 3 de 49 | ninguém o convidou |
| Prémio sem nada em dinheiro | — | anuncia $25.000 que são produtos |

Sobraram **23**. O Devpost mostra os 49 todos, misturados.

E o detalhe que prova a necessidade do filtro: **o melhor rácio de toda a
amostra** era o *Next Gen Hackathon 2026* — $50.000 entre 74 inscritos, $676 por
pessoa. **Em Bengaluru.** Sem o filtro de presencial, o radar punha no topo uma
coisa impossível.

## Os limites, e de onde saíram

| Regra | Limite | Medido em |
|---|---|---|
| Dias mínimos para construir | 3 | — |
| Hipótese de rifa | < 1% | amostra: mediana de 195 inscritos |

## O que NÃO mede — e está dito na página

**As regras de elegibilidade de cada concurso.** Muitos limitam a um país, a
estudantes, ou proíbem submissão gerada por IA — e isso só está na página de cada
um, não na API. **Ler as regras antes de construir seja o que for.**

`VALE` não quer dizer que ganhas. Quer dizer que passa nos filtros e que a
hipótese não é de rifa.

## Testes

19 testes, zero dependências. **Sete defeitos confirmados a partir o código de
propósito** — e três passaram impunes à primeira tentativa:

- a ordenação: os dois candidatos do teste tinham veredictos diferentes, ganhavam
  na primeira chave e nunca chegavam ao desempate
- o prémio dentro do HTML: os atributos do teste não tinham dígitos, e
  `class="h1"` teria dado prémio de `$1`
- o prazo: `"5 fortnights left"` nunca tinha sido testado

Os três testes foram corrigidos e as mutações voltaram a ser aplicadas para
confirmar que agora falham.
