# tchubirs.github.io

Ferramentas que correm inteiras no browser. O ficheiro nunca sai do computador
de quem as usa — não há servidor, não há conta, não há envio.

## [Tablecut](https://tchubirs.github.io/tablecut/) — tabela de PDF para folha de cálculo

Tira a tabela de um PDF e cola-a no Excel, no Numbers ou no Google Sheets.
Extractos bancários, facturas, relatórios.

Os conversores online pedem que se envie o documento para o servidor deles.
Quem trabalha com papelada de clientes não pode fazer isso — e é essa gente que
acaba a copiar números à mão. O Tablecut lê o PDF dentro do próprio browser:
depois de a página carregar, pode-se desligar a internet e continua a funcionar.

Medido contra 20 documentos públicos reais — formulários fiscais dos EUA,
artigos científicos, e extractos publicados pelos próprios bancos, incluindo um
*relevé de compte* da Société Générale, o exemplo oficial do Banco de Portugal e
extractos verdadeiros da Fazenda do Paraná. Em 916 linhas extraídas, **90% saem
com as colunas separadas** e 1,8% das células ainda trazem dois números que
deviam estar à parte. Um PDF digitalizado é recusado com aviso, em vez de
devolver linhas inventadas.

Os números não são para acreditar:
**[o banco de ensaio está publicado](https://tchubirs.github.io/tablecut/banco/)** —
os guiões, os endereços de origem dos 20 documentos e a medição inteira,
documento a documento, com os números maus lá dentro.

**[English: PDF table to spreadsheet, without uploading the file →](https://tchubirs.github.io/tablecut/)**

## [Redline](https://tchubirs.github.io/redline/) — comparar duas versões de um contrato

Mostra as duas versões lado a lado e marca a palavra que mudou. Em Word
compara-se; em PDF, não — e é em PDF que os contratos chegam.

Os dois ficheiros ficam no computador. Um contrato de cliente não se envia para
o servidor de um desconhecido para saber o que mudou.

O teste que mais interessa é comparar um ficheiro **consigo próprio**: tem de dar
exactamente zero alterações, e dá.
**[O ensaio está publicado](https://tchubirs.github.io/redline/banco/)**, com os
oito documentos e o resultado inteiro.

**[English: compare two PDF contracts without uploading them →](https://tchubirs.github.io/redline/)**

## [Guias](https://tchubirs.github.io/guides/)

Como tirar dados de PDFs, sem fingir que é simples: extractos bancários para o
Excel, porque é que as colunas saem tortas, e como comparar duas versões de um
contrato.

---

Sem licença aberta — ver [LICENCA.md](LICENCA.md). O repositório é público
porque o GitHub Pages gratuito só serve sítios a partir de repositórios
públicos.
