# Fila de coisas novas (o que eu faço quando não há nada dependendo dele)

Pego o primeiro item, entrego, commito e passo para o próximo. Tudo segue a
regra 14 (nada com cara de IA) e passa em `python3 tools/sem_ia.py`.

Teste combinado em 28/09: quando a loja abrir, esperar 30 dias. Se nenhuma
planilha vender, paro de fazer planilhas e a gente muda de ideia. Se ele disser
"para", paro as planilhas novas na hora.

**Prioridade dele em 06/10, acima de tudo o resto:** o projeto de clipes da Kick (`kick-sync`, publicado em
`replay/`). Ele vai a um evento de Rust com uns 500 streamers na Kick (times de 4) e quer mostrar o produto
lá, e depois vender (para a Kick ou outra empresa). Pediu: estudo com fontes de por que isso é útil para a
Kick e os eventos que ela patrocina; o produto redondo, fácil de entender só de olhar, sem bugs; nome
comercial, perfil e banner; domínios; segurança; tudo decidido por estudo, sem perguntar a ele. O que eu
precisar dele vai numa lista só, no fim. Trabalhar sem parar até ele mandar parar. As tarefas do Fiverr e
da Etsy abaixo continuam, mas só a conferência de vendas de hora em hora até o projeto ficar pronto.
Andamento em `kick-sync/PLANO.md`.
Feito até 06/10 15h: nome Povix e marca; estudo com fontes (`ESTUDO.md`); tela inicial com duas portas; evento
ligado de ponta a ponta (elenco, mapa por time, lance com o time, outros ângulos pelo som, picos do chat, link do
lance, exemplo com o Rust ao vivo, ao vivo), testado contra a Kick real; falha de segurança corrigida no ramo;
política de segurança na página; textos em português do Brasil; notas de domínio e hospedagem (`LANCAR.md`);
rascunho para a Kick (`PITCH-KICK.md`); crítica de usabilidade aplicada na tela do evento; correções juntadas da
cena, do ao vivo, do chat e da detecção automática; módulo do clipe de vários ângulos com o nome de cada streamer;
no mapa, o streamer escolhido bem marcado, os picos do chat com botões de hora e os nomes errados em vermelho; no
celular o painel do lance não tapa mais o mapa; o vermelho dos avisos com contraste certo.
Também feito: correções da leitura do elenco e da exportação juntadas (803 testes passam); mapa pelo teclado; a
correção de segurança publicada no site no ar (autorizada por ele em 06/10).
Também juntadas: desempenho com muitos canais e carregamento dos 500 (826 testes passam). Roteiro da demonstração
em `kick-sync/DEMO.md`.
Feito em 09/10 (o retorno dele de 07/10, `kick-sync/RETORNO-07-10.md`): os 9 itens do "Primeiro" (pico só anda
no tempo, picos na linha do tempo da live, hora local, abrir 10 s antes do pico, saltos numa linha, só o que serve,
uma live só ocupa a tela, arrastar o mapa, o chat espera o vídeo). 850 testes passam.
Também feito em 09/10: o "Depois" (chat ao lado do vídeo, chat de todos e sensibilidade, detecção por trecho
marcado ou por horas, Clipar no trecho marcado e montagem também em 9:16, aviso do tamanho real do corte, grupo sem
time que não fecha, porta do evento, picos das horas vizinhas com a página parada). 858 testes passam.
Falta do retorno: escolher o que a detecção procura e a confirmação por mais de uma live (precisa de gravações reais).
Juntados em 09/10: os ramos de teclado, sincronia e Twitch. Também: quem entra no ar depois aparece sozinho, e o
clipe de vários ângulos está ligado no editor. 898 testes passam.
Próximo (a lista do Abisal): teste com 500 canais reais; lista do evento num arquivo atualizado sozinho.
Falta: ligar o clipe de vários ângulos na tela; travessões nos
textos da página; publicar o Povix.

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
   Às 21h40, o arquivo para importar no QuickBooks Online e no Xero (`--for quickbooks`, `--for xero`), no formato
   que as páginas de ajuda deles pedem: no QuickBooks, Data, Descrição e Valor, até 1.000 linhas por arquivo, sem
   símbolos na descrição e sem linha de valor 0; no Xero, Data e Valor com sinal. Testado. Contador pede muito
   isso, então o anúncio 5 passou a oferecer (texto, a tag `quickbooks` e uma pergunta nova no FAQ).
   Às 22h40, um defeito grave corrigido: com vários extratos de uma vez (os pacotes Standard e Premium prometem
   juntar), o conversor lia só o primeiro quando o extrato termina com outra tabela, como o saldo diário dos
   bancos americanos, e a conferência dizia que estava tudo certo. Agora cada PDF é lido separado, os extratos
   saem em ordem de data mesmo mandados fora de ordem, o repetido fica de fora e a folha de conferência diz
   se falta um mês entre dois. Corrigido também o ano das datas sem ano: extrato de dezembro feito em janeiro
   saía com o ano seguinte. Testado com 3 meses fora de ordem, um repetido, um faltando e dezembro com janeiro.
   Às 23h40, o mesmo defeito quando o cliente junta os meses num PDF só: lia 20 de 60 transações e dizia que
   estava certo. Agora a tabela que começa com o saldo anterior igual ao saldo final do mês de antes é lida
   como o mês seguinte; outra conta continua de fora. Se os meses estiverem fora de ordem dentro do PDF, o
   console manda separar o PDF, um arquivo por mês.
   Em 06/10, à 0h40, teste com extratos de exemplo que os bancos publicam (RBC e `CIBC`, do Canadá). Achou 5 defeitos,
   todos corrigidos e com teste: o valor `.15` sem o zero não era lido; "Cheque #31" seguido de `148.11` virava
   31.148,11; o rodapé "1 of 2" e um `1.0` da margem entravam na descrição; o ano saía errado quando o
   cabeçalho tinha uma data de outro ano (defeito meu da véspera); "Balance carried forward" no topo não era o
   saldo inicial. Agora os dois extratos saem linha por linha certos.
   À 1h40, o exemplo do TD Bank (EUA) mostrou mais 5, corrigidos com teste: o ano de 2 dígitos (`11/15/18`)
   era ignorado e as datas iam para 2026; a tabela de cheques (número, data, valor) ficava de fora; a tabela
   "Balance by Date" era lida como depósitos; "Previous Statement Balance" e "Beginning balance" não eram
   o saldo inicial; e as tabelas separadas (depósitos, saques, cheques) saíam fora de ordem de data. Agora o
   exemplo sai com as 10 transações certas e o saldo inicial mais o movimento dá o final.
   Às 2h40, o exemplo do CommBank (Austrália) tinha cada palavra 4 vezes no texto do PDF, no mesmo lugar; o
   mesmo acontece com negrito feito imprimindo duas vezes. O conversor leria cada valor 2 ou 4 vezes. Agora a
   palavra repetida no mesmo lugar é lida uma vez só. Testado com negrito duplo e com o texto repetido 4 vezes.
   Às 3h, PDF com senha (muito banco manda assim) derrubava o conversor com erro técnico. Agora ele pede a senha
   (`--password`), avisa quando está errada, e arquivo quebrado ou página da web salva como PDF dá mensagem
   clara. Foto do extrato em JPG ou PNG é lida como escaneado. O anúncio 5 pede a senha junto com os PDFs.
   Às 3h40, anúncio 3: o auditor de planilhas dava como erro a corrigir uma fórmula com `LAMBDA` que no Excel 365
   está certa (o LibreOffice daqui não tem `LAMBDA` e devolve `#VALUE!`). Agora ela vai para "não conferido aqui",
   como `XLOOKUP` e `LET`, e só o erro de verdade fica em "Must fix".
   (O commit 04fe7a6 saiu com a mensagem do commit anterior por engano: o conteúdo dele são estas notas.)
   Ainda às 3h40: o LibreOffice 24.2 do Ubuntu não calcula `XLOOKUP`, `FILTER`, `LET`, e planilha nova usa muito.
   A versão 26.8, baixada do site oficial e aberta em /opt sem mexer na do sistema, calcula: numa planilha de
   teste, o auditor conferiu 19 de 22 fórmulas, contra 8 antes. O auditor e o executor de Apps Script usam a
   mais nova que acharem. Com ela apareceram dois falsos erros, corrigidos: fórmula do Google Sheets dentro
   do `IFERROR` que o Google escreve, e `SUM(#REF!)` mostrado como `#NAME?` em vez de `#REF!`.
   Às 4h40, teste com planilhas reais de governo (orçamento da Comissão de Energia da Califórnia, com macros):
   2.817 fórmulas, todas certas, mas o auditor dizia "corrigir: 16 referências a células apagadas". Eram nomes
   que nenhuma fórmula usa, sobra antiga. Agora nome assim vai para "vale olhar" (pode apagar), e só o nome
   quebrado que uma fórmula usa fica em "corrigir", com `#REF!` na fórmula como o Excel mostra.
   Na mesma planilha, as 4 macros reais: o executor de VBA parava na linha 10 de uma delas, porque toda macro
   gravada no Excel 365 usa `Formula2R1C1` e o LibreOffice não tem; agora roda como `FormulaR1C1` (mesmo
   resultado). E macro que só esconde ou mostra linhas e colunas saía como "nenhuma mudança"; agora o
   relatório diz quais linhas e colunas.
   Às 5h40, a aba onde a macro começa: macro gravada age na aba aberta, e na mesma planilha real o executor
   começava na aba salva como aberta (Instructions), escondia colunas e zerava 12 células nela, e o relatório
   dava isso como certo. No Excel o cliente clica no botão da aba Category Budget. Agora o executor lê no
   arquivo onde fica o botão de cada macro (botão de formulário ou forma com macro) e começa nessa aba; sem
   botão, na aba aberta ao abrir o arquivo, ou na que `--sheet` disser. O relatório diz em qual começou.
   Às 6h40, o executor de Apps Script: li os exemplos oficiais do Google para planilhas e listei os métodos que
   eles usam e que o teste não tinha (rodar o código baixado foi bloqueado; os testes são scripts meus). Um
   script de cliente que usasse qualquer um parava com "não está neste teste". Agora o teste tem: as células
   selecionadas (`--select`, como o cliente seleciona antes de usar o menu), esconder e mostrar linhas e
   colunas (no relatório e no arquivo), linhas congeladas lidas do arquivo, `removeDuplicates`, localizar e
   substituir (`createTextFinder`, com as opções) e `getNextDataCell` (a última linha com dado). Corrigidos
   dois defeitos: no onEdit, `getActiveCell` dava A1 em vez da célula editada (padrão de muito script antigo
   de data automática), e ao apagar ou inserir linhas as cores postas pelo script ficavam na linha errada.
   Às 7h40, macro gravada no Google Sheets (o cliente grava em vez de programar, e é pedido comum): parava na
   segunda linha, porque o gravador usa funções que o teste não tinha. Agora roda inteira: lista de células,
   célula atual, fórmula em R1C1, preencher para baixo (com série 1, 2, 3), filtro com ordenação, colar
   (normal, só valores, só formato) e limpar com opções. Corrigidos três defeitos que davam resultado
   errado sem aviso: fórmula copiada, preenchida ou ordenada não ajustava as referências (o total da linha 3
   ia para a linha 5 e continuava somando a linha 3); a ordenação punha "Bruno" antes de "ana" (o Google
   ignora maiúscula); e `clear()` não apagava a formatação. O que só o Google calcula (ordenar por fórmula
   que o script acabou de escrever, colar o valor dela) aparece no relatório para conferir lá.
   Às 8h40, defeito grave no mesmo executor: script que apaga ou insere linhas (o pedido mais comum, "apagar
   as linhas concluídas") não ajustava as fórmulas. O total embaixo da tabela continuava `=SUM(C2:C6)` depois
   de a tabela subir uma linha, e o teste dava 220 onde o Google dá 130; referência a linha apagada lia a linha
   que entrou no lugar. Agora toda fórmula da planilha, em qualquer aba, se ajusta como no Google: intervalo
   cresce e encolhe, referência apagada vira `#REF!`, aba renomeada ou apagada muda as fórmulas que a citam.
   Testado com o LibreOffice recalculando. Próximo: ler do arquivo os intervalos com nome, as cores, o
   negrito, o formato de número e as notas (hoje o script recebe vazio e branco).

Pausado até algo vender ou ele pedir: inventário da casa (rascunho em `etsy/home-inventory`), manutenção da casa,
galinhas no quintal, férias da equipe, Herculano.

Feito até agora: publicador da Etsy pela API (`etsy/publish.py`, testado com uma Etsy simulada;
falta só a chave dele), Fiverr (5 anúncios prontos, com imagens de trabalho real, e o
conversor de extrato testado), Etsy (orçamento TDAH, assinaturas, kit, quitar
dívidas, autônomos, casamento, estoque, reforma da casa, aluguel por temporada, calculadora de taxas, orçamento por salário, aluguel mensal, cardápio da semana, metas de poupança, agenda de clientes, treinos, encomendas, hábitos e humor, estudos, despesas em grupo, viagem, leitura, contas da casa dividida, festa, plantas, mudança, pets, carro, bebê, horas e faturas, Natal, ferramentas de empresa, glicose e remédios, candidaturas a emprego, tarefas e mesada, lotes e etiquetas de comida caseira, aulas e notas para professor, empréstimos entre amigos, patrimônio e dividendos, calendário de conteúdo, doações e voluntários, envelopes de dinheiro, horta, personal trainer, pacote das 5 que mais vendem para publicar à mão; guias de todas as planilhas explicam como apagar os exemplos sem quebrar fórmulas; as 3 primeiras também
em francês). Tudo revisado pela regra 14 em 28/09.

## Pedido do dono (10/10): atalhos personalizáveis
- Painel de atalhos igual editor de vídeo: trocar qualquer atalho e dar atalho a botões que não têm. Cada pessoa usa do seu jeito; guardar no aparelho dela.
- Feito depois de ele escolher a tela (vencedora da arena IA 12 ou só consertos).

## Pedido do dono (10/10): detecção automática com filtros avançados
- Mesmas escolhas da leitura do chat (pessoa ou todos, trecho ou tudo), funcionando do jeito dela.
- Filtros: palavras no chat; tiros (já existe, tiros.js); explosões de foguete (força do som + grave longo); gritos do streamer (força na faixa da voz).
- Palavras ditas pelo streamer: precisa transcrever a voz; no navegador é pesado (modelo de dezenas de MB). Estudar antes de prometer.
- Fazer depois da tarefa do zoom e do chat na faixa.

## Pedidos do dono (10/10): mapa do evento e compartilhar
- Ao escolher um momento: "Abrir todos com vídeo nesse horário" e "Abrir só quem está ao vivo".
- Ordenar faixas: clicar num horário põe primeiro quem tem vídeo nele, depois quem esteve no ar perto; outras ordens (ao vivo agora, mais tempo no ar, time, A a Z).
- "Compartilhar evento" no lugar do link enorme: nome obrigatório, data e duração opcionais; link curto. ABISAL salvo no repositório (só os canais, sem notas) e aberto por ?e=abisal.
- Régua: linha grossa e data a cada mudança de dia; linhas finas quase transparentes nas horas. O horário já é o de cada pessoa (fuso do aparelho); deixar isso escrito na tela.
- Adicionar gente com o evento aberto: botão "Adicionar streamer" na tela do evento (busca da Kick, time opcional) e "Adicionar lista" (arquivo ou colar); só os novos são lidos, o resto fica.
- Fazer depois da tarefa dos filtros.

## Pedidos do dono (10/10): editor Criar clipe
- "2 enquadramentos" já começa no encaixe mais usado em TikTok e Shorts (cara em cima, jogo embaixo), com modelos de onde fica a webcam (canto inferior esquerdo, superior esquerdo, superior direito, inferior direito); só pequenos ajustes depois.
- Lembrar o encaixe de cada streamer no aparelho, para o próximo clipe dele já abrir certo.
- Assistir o clipe pulando para o ponto que quiser: agulha (bolinha e linha) na barra do clipe, arrastar com mouse ou dedo.
- Espaço livre à direita dos botões Início e Fim: usar só se entrar botão novo.
- Fazer depois da tarefa dos filtros (mesmo arquivo).

## Refinamento para o fim (pedido do dono, 10/10): legendas no clipe, igual CapCut
- Ao lado dos botões Início e Fim do Criar clipe: "Legenda" do que o streamer fala.
- Opções: cor, tamanho, posição na tela, idioma (e tradução), estilo.
- Depende de transformar voz em texto no aparelho (mesma questão das "palavras faladas" da detecção). Estudar o modelo mais leve que rode no navegador antes de prometer.

## Pedido do dono (10/10): achar o time pelos nomes na tela
- "Achar quem mais estava no lance" pelo som não funcionou bem para times.
- Novo jeito: ler os nomes que aparecem na tela (sobreposição do Discord com quem está falando, nomes do time no jogo) num quadro do vídeo, e casar com os canais do evento. Usar os apelidos do Discord que vierem na planilha (ex.: "[Discord: Newt]" junto do link) como apelido do canal, guardado só no aparelho.
- Ler texto de imagem no navegador (OCR) com arquivo local; texto pequeno e vídeo comprimido erram; mostrar o que leu e deixar confirmar.
- Sem limite de telas: o dono desistiu do "no máximo 2 vídeos". Trocar câmera pelo nome continua.
- Detalhes do dono sobre onde estão os nomes:
  - Lista do time do Rust no canto inferior esquerdo: nomes em verde, com uma bolinha antes. Muitas vezes a webcam tapa essa parte.
  - Sobreposição do Discord à direita ou à esquerda, às vezes só aparece quem está falando.
  - Nomes em cima dos jogadores no jogo, só quando estão perto.
- Plano: ler vários quadros ao longo de um trecho (não um só), filtrar o texto verde do canto inferior esquerdo, olhar as laterais para o Discord, e juntar os nomes que aparecem ao longo do tempo.
