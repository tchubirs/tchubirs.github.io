# Fila de coisas novas (o que eu faço quando não há nada dependendo dele)

Pego o primeiro item, entrego, commito e passo para o próximo. Tudo segue a
regra 14 (nada com cara de IA) e passa em `python3 tools/sem_ia.py`.

Teste combinado em 28/09: quando a loja abrir, esperar 30 dias. Se nenhuma
planilha vender, paro de fazer planilhas e a gente muda de ideia. Se ele disser
"para", paro as planilhas novas na hora.

**Decisão dele em 28/09 à noite:** um mês sem nenhum centavo, então foco em dinheiro. Não crio planilha nova
até alguma vender. O que eu faço agora:

1. **Vender o que já existe:** os 44 anúncios estão ativos desde 29/09, conferidos com `python3 etsy/check_live.py`,
   mas o público só vê depois que ele pagar a taxa de abertura de € 16 (PENDENTES, item 2). A cada hora:
   `python3 etsy/publish.py sales` e a contagem pública de anúncios ativos (quando passar de 0, a loja abriu). Se entrar
   pedido, avisar ele. O teste começa no dia em que a loja abrir. Proposta a ele em 30/09: 4 meses em vez de 30 dias,
   porque os anúncios duram 4 meses sem custo novo e lojas parecidas vendem mais do segundo mês em diante
   (`python3 etsy/market.py`).
   Concorrência de cada um (`python3 etsy/market.py niches`, 30/09): glicose, plantas, personal trainer, envelopes,
   doações e despesas de viagem em grupo têm menos de 500 anúncios concorrentes. É deles que a primeira venda deve
   vir. Nos temas lotados (orçamento, poupança, dívidas) duas lojas novas que vendem bem cobram US$ 3,99 e € 3,90
   pela planilha de orçamento, e a nossa custa € 7,50: se a loja abrir, baixar as de orçamento para perto de € 4.
   Capas novas (foto 1) nos 44 em 29/09 (`etsy/cover.py`). Vídeo de 11 s em cada um em 29/09 (`etsy/video.py`, enviado pelo `publish.py`). Quando ele ligar o inglês na loja: `python3 etsy/publish.py english` e conferir.
2. **Fiverr:** roteiro de cada entrega, do primeiro contato ao envio, em `fiverr/ENTREGA.md` (04/10). Conta criada por ele em 30/09. Em 02/10 o Claude no Chrome criou o perfil e os 5 anúncios como rascunho
   (Basic do 1 e do 3 a US$ 30, mínimo do Fiverr nessas categorias; o 4 em Software Development). Falta ele fazer a
   verificação de identidade e o W-8BEN, e depois publicar. Então, responder cada pedido no mesmo dia, com o trabalho pronto.
   Ferramenta do anúncio 1 pronta em 01/10: `fiverr/tools/scrape.py` (um arquivo JSON descreve o site; sai Excel,
   CSV e JSON). Testada num site local (`test_scrape.py`) e ao vivo em books.toscrape.com, 60 linhas em 3 páginas.
   Em 02/10 ela passou a abrir a página de cada item (`detail`) e a ler sites montados por JavaScript no Chromium
   (`render`). Testado ao vivo: 20 livros com categoria, código e descrição (`example-detail-job.json`) e 2 páginas
   de quotes.toscrape.com/js. Em 04/10 passou a rolar a página (`scroll`) ou clicar em "ver mais" (`click_more`)
   nos sites que carregam itens aos poucos; ao vivo, as 100 citações de quotes.toscrape.com/scroll
   (`example-scroll-job.json`).
   Em 05/10 passou a ler lojas Shopify pela API pública da loja (`/products.json`): uma linha por variação, com
   SKU, preço, estoque e a descrição em texto (`example-shopify-job.json`). Ao vivo numa loja Shopify: 100 produtos,
   965 linhas, em 4 segundos. No mesmo dia, o robots.txt passou a ser lido como manda a RFC 9309 (curingas, a regra
   mais longa vale, Crawl-delay). O leitor do Python deixava passar tudo depois de um "Allow: /", e nessa
   mesma loja liberava endereços que ela proíbe.
   Ferramenta do anúncio 3 pronta em 04/10: `fiverr/tools/audit_sheet.py` recalcula a planilha do cliente no LibreOffice
   e lista o que está errado: os erros e a célula que causa cada um, referência circular, referência a célula apagada,
   fórmula diferente das vizinhas, número digitado como texto e cálculo manual. Testada (`test_audit_sheet.py`) e ao
   vivo nas 47 planilhas da Etsy: nenhum erro, e os 2 avisos (pets e aluguel por temporada) são de propósito.
   `--compare antes.xlsx depois.xlsx` lista o que o trabalho mudou: fórmulas, valores digitados e cada resultado
   que se mexeu, recalculado. Vai junto com a entrega, para o cliente ver que nada mais mudou. Testado.
   Em 05/10, `fiverr/tools/run_vba.py`: roda a macro VBA do cliente (ou a minha) numa cópia da planilha no
   LibreOffice e diz o que mudou, ou o módulo, a linha e o erro onde parou. Responde MsgBox e InputBox sozinho e
   para um laço sem fim. Testado com 10 casos e num .xlsm feito no Excel. Das macros típicas de pedido do Fiverr,
   7 de 9 rodam aqui; Scripting.Dictionary e RemoveDuplicates não existem no LibreOffice e o relatório avisa.
   Também em 05/10, `fiverr/tools/run_gas.py`: o mesmo para Apps Script do Google Sheets. Roda o script numa cópia
   da planilha (baixada como Excel), com o SpreadsheetApp imitado, e lista o que mudou, os e-mails que mandaria
   (sem mandar), menus, gatilhos e o erro com a linha. Testado com 15 casos: onEdit, onOpen, arquivar linhas,
   lembretes por e-mail, perguntas, datas, download com resposta salva e um laço sem fim.
   Ainda em 05/10, os textos dos anúncios 1 e 5 em `fiverr/DISPATCH.md` passaram a dizer o que as ferramentas
   novas fazem (lojas Shopify; extratos escaneados, com uma página de amostra antes). O topo do arquivo avisa o
   Claude no Chrome para atualizar os rascunhos antes de publicar.
   Kit do anúncio 2 em 05/10: `fiverr/tools/py_kit.py` confere o script do cliente (Python 3.10, pacotes, módulos
   só de Windows, caminhos de um computador só) e gera o zip com um arquivo de dois cliques para Windows, Mac e
   Linux e o guia. Testado; o de Linux rodou de verdade (montou o ambiente na primeira vez e rodou o script).
   Revisão das ferramentas de 05/10 antes do primeiro cliente: 10 defeitos achados e corrigidos, cada um com um
   teste que o reproduz. Os maiores: o zip do `py_kit.py` crescia sem parar quando era salvo dentro da própria
   pasta; uma página com erro no meio de uma raspagem perdia tudo o que já tinha sido lido; a última página de
   um extrato com imagem de fundo era tomada por escaneada e, sem o Tesseract, a conversão inteira parava.
   Depois, a mesma revisão no `audit_sheet.py` e no `skill_kit.py`: mais 10 defeitos corrigidos e testados. Os
   maiores: o kit de skill punha o `.env` (senhas) e a pasta `.git` no zip do cliente; na comparação, uma fórmula
   trocada pelo valor parecia célula apagada, e uma mudança de centavos aparecia igual dos dois lados.
   Por último o publicador da Etsy, antes de ele mexer de novo na loja: não repete mais um envio que cria algo
   (anúncio, foto) depois de erro do servidor, o que podia duplicar; retoma uma capa e um rascunho vazio sem
   duplicar; a checagem de hora em hora não para num anúncio sem foto e confere o vídeo pelo `published.json`
   (antes dependia de uma pasta fora do git); as vendas somam todas as páginas e cada moeda separada.
   Conferido ao vivo, só leitura: os 44 sem problema.
   Conversor de extrato do anúncio 5 (`statement2excel.py`) melhorado em 04/10: lê débito e crédito em colunas
   separadas, o saldo inicial e o final, datas sem ano que passam de dezembro para janeiro, e para no fim da tabela
   (cheques, saldos diários ou outra conta ficam de fora e aparecem contados na aba Checks). Corrigido um defeito
   antigo: o cabeçalho da página entrava na descrição da última transação. Testado em 4 formatos e ao vivo num
   extrato de exemplo público de um banco americano: as 47 transações certas, todos os saldos batem.
   Ainda em 04/10, o que o anúncio 5 promete e faltava: `--categories` põe a categoria de cada linha (lista de
   palavras em `categories.json`, em inglês, francês, português e espanhol, editável para cada cliente) e uma aba
   By category com fórmulas; saída em CSV (`-o arquivo.csv`, com `--sep ";" --decimal ","` para o Excel em
   francês ou português) e `--date-format dd/mm/yyyy`. Testado; as fórmulas conferidas no LibreOffice.
   Também em 04/10: datas com o nome do mês nos 4 idiomas ("1 February", "Nov 01"), linhas sem data (os bancos
   ingleses põem a data só na primeira transação do dia) e cabeçalho quebrado em várias linhas; um número não
   gruda mais no seguinte ("5,000 505,491.59" virava um número só). Testado num formato inglês novo.
   Revisão no mesmo dia: o nome do banco no topo (`CREDIT AGRICOLE`, `Carte de débit`) passava por colunas de
   débito e crédito e o extrato saía vazio; um cabeçalho quebrado em duas linhas na página 2 fazia perder as
   transações dela. Os dois corrigidos, cada um com o seu teste.
   Kit do anúncio 4 pronto em 04/10: `fiverr/tools/skill_kit.py` confere a skill pelas regras da documentação
   oficial da Anthropic (lida hoje) e gera o zip no formato que o claude.ai aceita, com um guia de instalação em
   inglês para o cliente (app e Claude Code). Testado; as 42 skills de exemplo da Anthropic passam na conferência.
   Também aceita a skill que o cliente manda salva no Windows (fim de linha `CRLF` e marca `BOM`) e empacota limpa.
   Em 05/10 o conversor do anúncio 5 passou a ler extrato escaneado: a página que é só imagem é lida com OCR
   (Tesseract), virada para cima se veio de lado ou de cabeça para baixo, e endireitada. Testado nos 4 formatos
   escaneados (inclinados até 2,5 graus, de cabeça para baixo, de lado, a 150 dpi): as mesmas datas, valores e saldos
   do PDF com texto. Ao vivo: o extrato público de 6 páginas de um banco americano, escaneado, deu as mesmas
   47 transações do PDF com texto. Quando um saldo não bate, o console diz entre quais duas linhas.
   Ainda em 05/10, o anúncio promete extrato em espanhol, mas bancos do Chile escrevem valores sem centavos
   (`12.990`, `1.250.000`) e o conversor devolvia o extrato vazio. Agora `--whole` lê esses valores, só sob as
   colunas Cargos, Abonos e Saldo, para não confundir número de documento, RUT e "cuota 3 de 12". Testado num
   extrato chileno, com texto e escaneado (10 variações): valores e saldos exatos. Sem a opção, o console avisa.
   No teste apareceu outro defeito, agora corrigido: com data no formato `15.03.2026` (Alemanha, Suíça) a
   descrição saía vazia.
   Às 20h40 o mesmo para extrato com uma coluna só de valor (`Monto` e `Saldo`, como nas contas digitais): o valor
   e o saldo são os últimos números da linha. Também corrigido: um quadro de resumo acima da tabela com as
   palavras Cargos e Abonos era tomado pelas colunas da tabela, e o extrato saía vazio. Testado com texto e
   escaneado de cabeça para baixo a 150 dpi; os outros 5 formatos dão o mesmo resultado com e sem `--whole`.

Pausado até algo vender ou ele pedir: inventário da casa (rascunho em `etsy/home-inventory`), manutenção da casa,
galinhas no quintal, férias da equipe, Herculano.

Feito até agora: publicador da Etsy pela API (`etsy/publish.py`, testado com uma Etsy simulada;
falta só a chave dele), Fiverr (5 anúncios prontos, com imagens de trabalho real, e o
conversor de extrato testado), Etsy (orçamento TDAH, assinaturas, kit, quitar
dívidas, autônomos, casamento, estoque, reforma da casa, aluguel por temporada, calculadora de taxas, orçamento por salário, aluguel mensal, cardápio da semana, metas de poupança, agenda de clientes, treinos, encomendas, hábitos e humor, estudos, despesas em grupo, viagem, leitura, contas da casa dividida, festa, plantas, mudança, pets, carro, bebê, horas e faturas, Natal, ferramentas de empresa, glicose e remédios, candidaturas a emprego, tarefas e mesada, lotes e etiquetas de comida caseira, aulas e notas para professor, empréstimos entre amigos, patrimônio e dividendos, calendário de conteúdo, doações e voluntários, envelopes de dinheiro, horta, personal trainer, pacote das 5 que mais vendem para publicar à mão; guias de todas as planilhas explicam como apagar os exemplos sem quebrar fórmulas; as 3 primeiras também
em francês). Tudo revisado pela regra 14 em 28/09.
