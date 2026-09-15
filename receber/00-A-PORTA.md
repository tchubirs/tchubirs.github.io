# A porta — porque nenhum caminho de venda funcionou

Medido em 15/09/2026 por doze agentes, 531 verificações. **Nenhum dos seis
candidatos sobreviveu, e todos morreram no mesmo sítio.**

Isto não é um ficheiro sobre produtos. É sobre a porta que está antes de todos
eles, e que ninguém tinha aberto.

---

## O facto

**Para receber dinheiro de venda, em França, é preciso estar registado.** Não há
opção "particular".

| O que diz | Onde | Estado |
|---|---|---|
| *"User must not use the Services for personal, family, or household purposes"* | Contrato do Stripe §1.2 — <https://stripe.com/legal/ssa> | MEDIDO |
| *"User must be a business (including sole proprietor)"* | Stripe Financial Services Terms §2.1 | MEDIDO |
| Actividade lucrativa **habitual** sem registo = `travail dissimulé`, coima até **45.000 €** | Art. L8221-3 do Code du travail | MEDIDO |
| *"Registration number in the trade register"* exigido a vendedores individuais | JetBrains Marketplace, doc de 23/07/2025 | MEDIDO |
| Portal de registo obrigatório serve `lang="fr"` e **zero** `hreflang` alternativos | <https://formalites.entreprises.gouv.fr/> | MEDIDO por curl, 15/09/2026 |

"Individual" no Stripe **não** quer dizer particular. Quer dizer empresário em
nome individual.

## A armadilha, que é o mais importante deste ficheiro

> **O objectivo dele — "ganhar a todo momento, nem que sejam cêntimos" — é
> exactamente o que torna o registo obrigatório.**

A lei fala em *"habituellement et répétée"*. Uma venda solta não é habitual.
**Uma subscrição mensal é a definição literal.** Quanto mais contínuo for o
dinheiro, mais certo é o gate.

## O pior detalhe

O gate do Stripe **dispara tarde**. A abertura de conta não pede SIRET — pede
nome, morada, data de nascimento, telefone, email, MCC, URL e IBAN. O pedido de
`URSSAF Extract` ou `SIRENE Extract` chega **depois**, quando já há dinheiro no
saldo. E aí fica retido.

Um gate à entrada custa uma tarde. Este custa o dinheiro já ganho.

## O que isto explica

Todas as semanas anteriores. Nunca foi o produto. O `Tablecut` está construído e
provado contra 11 PDFs públicos de terceiros — e continuaria parado na mesma,
porque o problema nunca esteve do lado de construir.

## Os seis que morreram aqui

| Candidato | O tiro |
|---|---|
| JetBrains Marketplace | exige número de registo comercial; mediana de **1.127 downloads vitalícios** (48% abaixo de 1.000) e quase todos são trials |
| BuiltByBit | três afirmações do dossiê eram falsas; taxa real ~**28%** numa venda pequena; revisão manual com fila de 450+ |
| Stripe · Managed Payments | contrato proíbe uso pessoal; taxa real **5,7% + 0,25 €**, não os 5,0% alegados |
| Stripe · Payment Links | mesmo gate, e dispara tarde |
| Metaculus FutureEval ×2 | plataforma viva e paga mesmo, mas falha 3–4 regras dele em simultâneo |

## A decisão tomada em 15/09/2026

Ele escolheu **B**: não se registar enquanto não houver prova de que rende.

> *"Até fazer dinheiro quero B; quando mostrar ser rentável aí vamos pro A."*

**Consequência directa, e tem de ficar escrita:** a partir desta data só se
procura **rendimento que não é de comerciante** — prémio, recompensa, bolsa. O
pagador tem de chamar àquilo *prize*, *reward*, *grant* ou *bounty*, e não
*payment for services*.

E o alvo deixa de ser "cêntimos contínuos". Passa a ser **um pagamento, de um
pagador real, na conta dele** — a prova que destranca o A.

## Regra que fica

Antes de construir o que quer que seja para vender, **medir primeiro por onde
entra o dinheiro**. Foi a ordem errada durante semanas: construía-se o produto e
só no fim se descobria que não havia como receber.
