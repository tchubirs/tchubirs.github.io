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
- "Compartilhar evento" no lugar do link enorme: nome obrigatório, data e duração opcionais; link curto. Abisal salvo no repositório (só os canais, sem notas) e aberto por ?e=abisal.
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

## Pedido do dono (10/10): detecção lenta ("1/121")
- 121 são pedaços de 5 min (10 h de live), uns 8 MB cada mesmo a 160p; baixa um por vez.
- Fazer: baixar 4 pedaços ao mesmo tempo; modo esperto (ouvir primeiro uns minutos em volta dos picos do chat, "tudo" continua como opção); mostrar tempo que falta; avisar antes de começar quando for muito (horas e MB, melhor no Wi-Fi).
- Depois do Criar clipe.

## Pedido do dono (10/10): reorganização completa da interface (avaliação de outra IA)
- Hierarquia: abrir, ver e sincronizar ângulos, achar lance, marcar e ajustar, exportar. Em cada momento saber onde está e qual o próximo passo.
- Tela inicial com dois caminhos claros: Evento inteiro (lista, arquivo) e VOD ou poucos canais (links, busca, lista curta). Exemplo ao vivo como opção secundária. Uma frase sob a marca explicando o produto.
- Área de trabalho como um só ambiente de editor: vídeo grande no centro, controles junto do vídeo, lista de ângulos pesquisável, linha do tempo bem delimitada, montagem, ferramentas avançadas sem roubar espaço.
- Separar as tarefas com nomes claros: Rever, Encontrar lances, Montagem, Ajustar clipe, Exportar. Rever "Clipar" e "Cortar". Detecção automática marcada como experimental e secundária, opções avançadas recolhidas.
- Manter a identidade (escuro quente, turquesa, âmbar), sem cara de painel administrativo. Uma ação principal destacada por área.
- Não quebrar nada: IDs, data-t, atalhos, sincronia, exportação; mudanças de layout presas a body.mesa (o estilo.css serve à versão Twitch também).
- Fazer por partes, com testes e prints. Começar depois das tarefas de atalhos e da tela do evento com vídeos.

## Pedido do dono (12/10): legenda e chat no clipe final
- No Criar clipe, opção de pôr no vídeo baixado:
  - o chat do streamer naquele trecho, por cima do vídeo (estilo sobreposição de chat), com posição, tamanho e quantas linhas;
  - legenda da fala do streamer (Whisper no navegador, ver o estudo de voz em kick-sync), revisável antes de exportar.
- Vale para 16:9 e 9:16. Fazer depois da parte 2 da reorganização (mesmos arquivos).
- Feito em 12/10: o chat no vídeo e a legenda da fala (Whisper base no navegador, 107 MB da primeira vez, texto
  para corrigir antes de exportar, guardado na kill). Tempos e acertos medidos em `kick-sync/ESTUDO-VOZ.md`, seção 8.

## Correções do teste real com a Kick (12/10), na ordem (ver o relatório do teste real em kick-sync)
1. Ver ao vivo agora: abre o início da live (50 min atrás) e só 1 de 24 canais. Prender no fim da playlist e abrir todos.
2. Exportar: 16:9 sai em .ts e mais longo que o pedido. Sair em .mp4 com a duração certa (aceito por TikTok, Instagram e X).
3. Exportar montagem ignora a seleção. Exportar só as marcadas; opção de um vídeo só com os lances em sequência.
4. Achar quem mais estava no lance: erra o time e não aplica o atraso medido. Melhorar a comparação de som e aplicar o atraso.
5. Link do projeto perde as kills marcadas.
6. Abrir 33 ângulos demora 40 s; sincronizar 33 por áudio leva 30 min (um por vez). Carregar e sincronizar em paralelo, os do lance primeiro.
7. Vítima: tela de inventário confundida com morte.
8. Detecção: download de som sem tempo limite pode travar.
9. Chat da Kick: pedidos demais e respostas recusadas pelo navegador; menos pedidos e nova tentativa.
10. Com dois canais, abre a janela de tempo com um só; preferir a que tem os dois.

## Ideia (12/10): webcam achada sozinha no 9:16
- Feito em 12/10. No "2 enquadramentos" do Criar clipe, o Povix olha 5 quadros do vídeo do canal, acha o rosto do
  streamer (detector do MediaPipe no navegador, versão fixa e conferida, uns 12 MB da primeira vez) e põe a caixa
  da webcam nele. Em cada ângulo, guardado por streamer. Sem rosto, fica o modelo e um aviso curto. O ajuste à mão
  manda; o botão "Achar webcam" procura de novo. Ver `kick-sync/IDEIAS.md`, item 3.

## Ideia (12/10): aviso de prazo do VOD e guardar o lance agora
- Feito em 12/10. Cada faixa diz "some em N dias" (7 dias desde a live, ou 30 quando a lista do canal prova que ele
  guarda 30), com a conta explicada ao parar o mouse. Na Montagem, cada lance diz o prazo, e "Guardar todos agora"
  baixa a cópia rápida de todos, os que somem primeiro à frente, um de cada vez, com progresso e Parar. Ver
  `kick-sync/IDEIAS.md`, item 7.

## Ideia (12/10): pacote do lance para o editor
- Feito em 12/10. Botão "Pacote" em cada lance da Montagem: ZIP com o trecho de cada ângulo, um projeto multicâmera
  `.fcpxml` (versão 1.9) com os ângulos alinhados e com o nome de cada canal, e um texto com nomes, horários e links.
  Falta testar num DaVinci e num Final Cut de verdade. Ver `kick-sync/IDEIAS.md`, item 6.

## Ideia (12/10): ouvir um ângulo só e trocar com um toque
- Feito em 12/10. Clique no vídeo dá o som a ele e cala o outro, sem mudar a tela; as teclas 1 a 9 (atalhos que se
  podem trocar) passam o som para o ângulo com esse número, que aparece no canto do quadrado; quem tem som leva um
  altifalante. O clipe de vários ângulos agora grava o som de quem está na tela, medido com dois tons num Chromium.
  Ver `kick-sync/IDEIAS.md`, item 8.

## Ideia (12/10): marcar ao vivo com uma tecla
- Feito em 12/10. A tecla V marca o agora em todos os ângulos ao vivo abertos, tirando o atraso medido de cada canal
  (2 a 12 s, ou 6 s sem medida); com o ao vivo a tocar no Povix, marca o que está na tela. A marca vai para a
  Montagem e para o topo dos melhores lances como "marcado por você", guardada como os outros lances marcados. O
  chat pedindo clipe ("clip", "clipa", "clipe") virou mais um sinal. Falta conferir o atraso numa live de verdade.
  Ver `kick-sync/IDEIAS.md`, item 9.
- Também em 12/10, achados por testes que falhavam com a máquina ocupada: juntar dois 9:16 gravados falhava quando o
  gravador do Chrome punha o som antes da imagem numa das gravações (as faixas agora ligam-se pelo tipo); um 429 da
  Kick podia deixar sair um pedido no meio da pausa; e um teste da página da Twitch lia o estado cedo demais.

## Ideia (12/10): sons de explosão e grito com o YAMNet
- Medido em 12/10, não entrou no site. Em 4 h de live real de 6 canais do Abisal e em 23 clipes do Rust, o YAMNet
  não ouve o grito do streamer (nota de "Screaming" de 0,04 no máximo na live) e marca explosão junto com tiro: nos
  quadros de 30 acertos, só 6 mostram um explosivo (20%), quase o mesmo que quando o tiro ganha (17%). Ficam os
  filtros de explosão e grito que já existem. Ver `kick-sync/ESTUDO-SONS.md` e `kick-sync/IDEIAS.md`, item 10.

## Pedido do dono (12/10): só o jogo do evento
- Feito em 12/10. O evento ganhou o campo `jogo` (o Abisal é "Rust"; sem o campo, nada muda). A Kick diz o jogo
  de cada VOD em `categories[0]`; uma live de outro jogo fica fora da detecção, dos melhores lances, do time pelo
  som, do ler chat de todos e do "Guardar todos agora", e aparece a cinza no mapa com "outro jogo nesta noite",
  e abre à mão sozinha. "Just Chatting" e outras categorias que não são jogo contam como do jogo: o sapoiq jogou
  Rust do Abisal num VOD que a Kick chama "Just Chatting".
- Na Kick real, na noite de 05/10: 16 canais da lista só noutro jogo (GTA, LoL, CS2 e outros), entre eles o
  mills_rp e o britus99 (o "estava" duvidoso do teste do som era GTA). Os melhores lances já não os mostram.

## Teste real de 12/10, tarde
- Feito em 12/10. Webcam sozinha no 9:16, Pacote, "Guardar todos agora", "some em N dias" e o som com as teclas
  1 a 9, com a Kick real e o Abisal: tudo passa. Corrigido: com a caixa no rosto achado, o botão do canto da
  webcam ficava carregado no canto errado. Ver `kick-sync/QA-REAL.md`, seção "Teste real de 12/10, tarde".

## Ideia (12/10): mortes do servidor
- Feito em 12/10. Botão "Importar mortes" no evento: cola-se (ou abre-se um arquivo) o registro de mortes do
  servidor de Rust. Lê o chat e o console do plugin DeathNotes, as mensagens do Discord Death e do Rustcord
  copiadas do Discord (com "Hoje às 21:14", "[21:15]", data ou ISO) e linhas simples "21:14:07 fulano killed
  ciclano (AK, 45 m)". As linhas que não viram morte aparecem numa lista, com o motivo.
- Cada morte é uma marca vermelha na faixa de quem matou e na de quem morreu. Os nomes casam com os canais pelo
  apelido já guardado (sem maiúsculas nem acentos, sem a tag do clã); os que sobram escolhem-se à mão e ficam
  como apelido neste aparelho. Clicar numa marca abre os dois POVs 10 s antes. A morte entra nos melhores
  lances ("morte no servidor: X matou Y", 6 pontos) e vai para a montagem com quem morreu já marcado.
- As horas: um fuso à escolha (o do aparelho por omissão) e "A morte é agora", que acerta todas pela
  diferença de uma morte vista no vídeo. Tudo fica neste aparelho, por evento; o que vai para a montagem viaja
  no link do projeto como as outras kills.
- Falta saber se os organizadores do Abisal usam um desses plugins e se passam o registro. Ver
  `kick-sync/IDEIAS.md`, item 1.

## Pedido do dono (12/10): mortes achadas sozinhas
- O dono: "Sem essa de bloco de notas, você tem que fazer tudo." Nada de colar registro: as mortes vêm dos vídeos.
- Feito em 12/10. O Povix procura a tela de morte do Rust no 160p de cada canal (2 imagens por segundo, tiradas
  do próprio vídeo pelo navegador, sem buscas no player) e lê quem matou num quadro nítido (1080p ou 720p) com
  o leitor de texto que já existia. Corre sozinho perto de cada tiroteio que a detecção acha, sem clique; o
  botão "Achar mortes nos vídeos" olha também o vídeo todo, com barra, tempo que falta e Parar. Cada morte é do
  mesmo tipo das do servidor: marca na faixa de quem morreu e na de quem matou, abre os dois 10 s antes, entra
  nos melhores lances e na montagem. Quando quem matou é um canal do evento, o tiro dele por perto confirma e a
  marca dele vai para o segundo do tiro. O registro do servidor ficou num details fechado, opcional.
- A tela de morte, vista em quadros reais: faixa cinzenta lisa em cima, caixa verde "Vivo durante", caixa
  vermelha "Matado por" (ícone e nome), às vezes a arma e a distância; igual em inglês. Fica 1 a 5 s à vista
  (o crreg tapa-a com uma imagem própria), quase um minuto no ispdep.
- Medido em 12 trechos de 20 min de VODs do Abisal de 05/10 (crreg, elwasabitm, ispdep, poionako, skylane7,
  xguiry), 4 h 03 min, 14 549 quadros a 1 por segundo: 22 mortes achadas, as 22 conferidas a olho (nenhuma
  falsa). O trecho do xguiry aos 15581 s foi visto também em 720p: as mesmas 2 mortes.
  Nos dois trechos vistos a olho do começo ao fim (xguiry 131495449 aos 15581 s e aos 9741 s, 40 min) havia 8
  mortes e as 8 foram achadas; o "Abatido" com reanimação, o inventário, o ecrã de carregar e as luzes
  vermelhas da base não contam. Nos outros trechos não vi tudo a olho, por isso a falta de mortes não achadas
  ali não está medida. No trecho de 720p do xguiry não há morte aos 14:40 ("Me mataron"): as duas mortes são
  aos 4:17 (matou-o "cyrus") e aos 16:21 (matou-o "leona", depois do "Abatido").
- Quem matou: lido certo em 13 de 13 quadros nítidos de 11 mortes (crreg, ispdep, poionako, xguiry; 1080p e
  720p). O limite do preto e branco foi escolhido nesses mesmos quadros, por isso este número é dentro da
  amostra. No Abisal os streamers jogam com o modo streamer, e o jogo troca os nomes dos outros por nomes
  inventados ("bernard", "chasidy", "cyrus", "leona", "rupert"); houve também "Torreta automática", "Trabuco"
  (armadilha) e "yer" (o próprio crreg com o F1 kill). Nenhum desses nomes é canal do evento: nessas mortes a
  marca fica só na faixa de quem morreu, com "quem matou: bernard". Casa com o canal quando o nome do jogo é o
  do canal ou um apelido guardado.
- Velocidade: o 160p tem uns 132 MB por hora de live. Aqui, 10 min dele baixaram em 3,8 s, e o ffmpeg
  descodifica o 160p a 156 vezes o tempo real num núcleo. Uma noite inteira de 6 canais de 6 h (36 h de vídeo,
  uns 4,7 GB) daria uns 13 min a 50 Mbit/s e uns 14 min de descodificação num núcleo (a página usa três ao
  mesmo tempo); só perto dos tiros é perto de um quinto disso. A velocidade do descodificador num navegador de
  verdade não foi medida (o Chromium dos testes não tem H.264).
- Testes: `kick-sync/test/achar-mortes.test.mjs` (as telas e as caixas em quadros reais de
  `kick-sync/test/telas-morte/`, o vídeo tirado do TS como o ffmpeg o vê) e `kick-sync/test/achar-mortes-pagina.test.mjs`
  (o leitor nos quadros nítidos, e a página: depois da detecção as mortes aparecem sozinhas no mapa, sem colar
  nada). Falta: ver num Chrome de verdade, com a Kick real, a descodificação e o tempo de uma noite inteira.


## Pedido do dono (12/10): Povix fácil para quem nunca usou (obrigatório)
- A mulher dele, que é clipadora, usou hoje e não conseguiu mexer em nada. Ele quer o Povix como "braço direito,
  esquerdo, olhos e ouvidos" do clipador, e que qualquer pessoa consiga usar sem saber nada.
- Primeiro um estudo: usar o site como quem nunca viu (computador e celular), anotar onde trava e cada palavra
  difícil, comparar com o Opus, e escrever o plano do "modo simples" em `kick-sync/ESTUDO-FACIL.md`.
- Depois fazer o modo simples: uma caixa ("cole o nome do streamer, o link ou o evento") e um botão; o Povix
  faz o resto e mostra a lista de clipes prontos, cada um com "Baixar". O resto vai para "Modo avançado".
- Testar com ela, com 5 tarefas curtas, antes de dar por feito.
- Feito em 12/10, parte 1 do modo simples (`kick-sync/site/simples.js`, `simples-lista.js`):
  - quem chega pela primeira vez vê uma caixa ("Cole o nome do streamer, o link do vídeo ou o nome do evento") e
    um botão ("Achar os melhores momentos"). A caixa aceita o nome solto, `@nome`, qualquer link da Kick (canal,
    aba de vídeos, aba de clipes, vídeo, clipe, `m.kick.com`) e o evento (`abisal`, `?e=abisal`, link `#evento=`).
    Tocar numa sugestão de canal já começa. O `lerLinkKick` do `kick.js` passou a aceitar o nome solto e as abas.
  - depois do botão: abre a live gravada mais recente, lê o chat, ouve tiros e explosões só em volta dos picos do
    chat, e mostra uma lista com imagem, motivo em palavras ("O chat explodiu e teve tiroteio"), nota (muito bom,
    bom, talvez), a hora, "Baixar para TikTok" (em pé, rosto do streamer achado sozinho, o meio do jogo quando não
    acha, legenda ligada no computador quando dá) e "Baixar deitado". Arquivo com nome
    "xguiry - 10-10 - tiroteio.mp4"; no celular, botão para mandar ao TikTok ou salvar (folha de compartilhar).
  - esperas que dizem o que fazer: aviso aos 30 s parados, desiste aos 90 s (chat) ou 120 s (som) e segue com o
    que tem; "Abra o Povix no Chrome" quando o navegador não toca ou não ouve a Kick. Chat que fala de som caído
    ("muted", "lag", "caiu") vale menos.
  - o evento pelo nome ou pelo link abre o evento e começa a ler o chat de todos sem o segundo toque.
  - tudo o resto em "Modo avançado", igual a antes, e o aparelho lembra a escolha. Quem já tinha sessão guardada
    entra no avançado. Botões de 48 px ou mais no modo simples, sem linha do tempo.
  - testes: `test/simples-lista.test.mjs`, `test/simples-pagina.test.mjs`, links novos em `test/kick.test.mjs`.
    Fotos em `kick-sync/prints-facil/depois-*.png`.
- Feito em 12/10, parte 2, primeira fatia (`simples.js`, `simples-lista.js`, `evento-ui.js`):
  - o evento (nome, `?e=abisal` ou link `#evento=`) agora abre a mesma lista simples, com todos os canais: título
    "Evento abisal", "Do streamer fulano" em cada cartão, imagem quando dá, motivo, nota, hora, "Baixar para
    TikTok" e "Baixar deitado". O chat de todos começa a ser lido sozinho e a lista cresce enquanto lê. O mapa
    fica fora da vista e volta no "Modo avançado". Ao baixar, o Povix abre a live daquele streamer na hora do
    momento (`lancesParaLista`, `evento.lancesSimples`).
  - mortes e "quem estava no lance" já entram: a nota vem da soma do `melhores.js` (morte do servidor ou achada
    na tela de morte vale 6) e o motivo diz "xguiry matou cyrus no tiroteio", com "Também estavam no lance: a, b".
  - "Não quero" (o momento sai e não volta neste aparelho) e "Mostrar mais 10" na lista, do evento e do streamer.
  - testes: `test/simples-lista.test.mjs` (3 novos, rodam sem navegador); `test/simples-pagina.test.mjs` (evento
    e Não quero, só rodam com Chromium: neste PC ficaram pulados, não foram vistos funcionando).
- Falta (parte 2): imagem nos cartões do evento só aparece depois de baixar algum momento do mesmo streamer (cada
  streamer é uma live a abrir; fotografar tudo é pesado); as mortes ainda não entram na lista de um streamer só
  (só no evento); título e texto do post automáticos; escolher outra live do mesmo streamer; legenda no celular
  como botão "pôr legenda"; as palavras do modo avançado (tabela do estudo); o "?" com ajuda de verdade; rodar os
  testes de página num Chromium (os 2 novos de assistir e editar só foram vistos no navegador do Claude, não nos
  testes) e testar com ela, com as 5 tarefas, no celular dela.
- Feito em 12/10, parte 2, terceira fatia (`simples.js`, `app.js`, `estilo.css`, `idiomas.js`):
  - tocar na imagem do cartão (play grande no meio) toca o pedaço do lance ali mesmo, com som, num player do
    tamanho do cartão: controles por cima do vídeo (play, volume, tempo, tela cheia) e barra do tempo só do pedaço.
    Só um toca por vez: dar play em outro cartão devolve o anterior à imagem. Teclas as do avançado: espaço, A e D
    (3 s), J, L e setas (1 s, 10 s com Shift), Esc.
  - "Editar" abre o clipe do cartão no editor do avançado, já no pedaço dele, com "Voltar para a lista" no topo
    e na janela; a lista volta como estava. "Não quero" virou "Excluir"; "Baixar deitado" virou "Baixar tela cheia".
  - o espaço e as outras teclas do avançado não agem mais nos vídeos escondidos no modo simples; ao voltar do
    avançado os vídeos ficam parados.
- Feito em 12/10, o Povix lembra o que já achou (`simples.js`, `simples-lista.js`, `index.html`, `idiomas.js`):
  - o dono recarregava a página ou abria o mesmo vídeo e a procura recomeçava do zero ("Ouvindo a live de tchubi,
    faltam uns 1 min"). Agora a lista de cada vídeo fica neste aparelho (`povix.simplesVods`, até 8 vídeos; as
    imagens no IndexedDB `povix-simples`) e o mesmo vídeo, por link, por nome ou ao recarregar, abre na hora, sem
    barra e sem abrir o vídeo (Baixar, a prévia e Editar abrem o canal quando se toca, como no evento).
  - recarregar volta ao último vídeo visto (`povix.simplesUltimo`); "Começar de novo" apaga isso. O que foi
    excluído continua fora (`povix.simplesNao`). "Procurar de novo" (no topo da lista) refaz tudo.
  - o chat lido fica lembrado separado: se a página fechar no meio do som, volta e só ouve de novo (o som não
    volta pela metade: a memória dele são vetores grandes, `estado.somOuvido`). Live ainda no ar: o que se achou
    vale 10 min.
  - de brinde: quem nunca tocou no botão de modo caía no avançado ao recarregar depois da primeira busca (a sessão
    salva fazia o `caminho-cedo.js` achar que já usava o Povix); agora a primeira busca já grava o modo simples.
  - testes: 5 novos em `test/simples-lista.test.mjs`; 1 de página em `test/simples-pagina.test.mjs` (só roda com
    Chromium, ficou pulado aqui). Visto no navegador do Claude com o VOD do tchubi: recarregar, nome, excluir,
    assistir e Procurar de novo.
  - falta: o evento (nome, ?e=) ainda relê o chat de todos ao recarregar, e "Pronto" do evento não volta do cache; um
    link de vídeo ainda faz uma chamada à Kick para saber o canal antes de achar o cache.
- Feito em 12/10, modo simples no PC: com 900 px ou mais a lista (e a do evento) vira grade de cartões, três por
  linha, página até 1200 px; cada cartão tem imagem em cima, nota e título, linha cinza, e uma fila só de botões
  pequenos (TikTok, Tela cheia, Editar, lixeira com aria-label "Excluir"; o rótulo curto só entra quando o
  cartão é estreito, o completo fica no aria-label). No celular: linha com imagem a 40% e botões embaixo do texto,
  com 44 px. Os botões da tela (Procurar de novo, Começar de novo, Modo avançado) ficam numa fila só, à direita do
  título no PC; na busca ficam à esquerda embaixo da barra, junto com Parar de procurar. Na primeira tela o
  Modo avançado continua embaixo (`#modoAvancado`); na lista é `#modoAvancadoLista`.

## Pedido do dono (12/10): alertas da live não são explosão

Problema: no modo simples, momentos diziam "Teve tiroteio e teve explosão" e o som era um alerta da live (sub novo).
A VOD da Kick tem uma faixa de áudio só (voz, jogo, Discord e alertas misturados), então não dá para separar. Cada
streamer tem alertas diferentes, então nada vai fixo no código.

Feito (código, sem rede, 9 testes novos em `test/alertas.test.mjs`):
- `site/alertas.js`: espectro em 20 bandas de 50 em 50 ms de cada som que a detecção de explosões marcou, mais o
  achatamento do espectro (ruído dá cerca de 0,56, jingle e voz dão 0,2 a 0,35). Sons que se repetem quase iguais
  (correlação do espectro, sem o volume) formam um grupo. Grupo com 3 ou mais repetições, correlação média de 0,90 ou
  mais e cara de tom vira "alerta" e sai da lista de explosões. Com 2 repetições só sai se forem quase idênticas
  (0,97) e bem tonais.
- Memória por canal no aparelho (`povix.alertas.<canal>` no localStorage, até 8 alertas, uns 2 KB cada): numa live
  nova, o que casar com um alerta já conhecido sai na primeira vez, sem esperar repetir.
- Ligado em `varrerNoite` (opção `alertas`) e no modo simples. A resposta traz `alertasFora` (hora, motivo, grupo).
- Modelo positivo ("parece explosão do Rust?"): `treinarPositivo` e `pontuar` dão uma nota de 0 a 1 pela forma média
  do espectro, duração e queda. Está pronto e testado em sons sintéticos, mas NÃO está ligado por padrão: não há
  explosões reais confirmadas para treinar, e um modelo inventado seria enfeite.
- Sonda `probes/alertas-vods.mjs`: roda a detecção em som real (f32 mono 24 kHz), lista o que sai e porquê, grava
  WAV e PNG de cada alerta aprendido, e treina o modelo positivo a partir de uma lista de explosões confirmadas.

Medido no chat gravado da Kick (12/10, xqc, 3.610 mensagens de uma hora): só existem os tipos `message` (3.475) e
`reply` (135). Não vem sub, sub de presente, kicks nem host: esses eventos não ficam no histórico que o Povix lê.
Nenhuma mensagem de texto tinha a forma de aviso de sub. Um canal só e uma hora só, então confiança de uns 85% de
que o histórico não traz esses eventos em geral. Um bot do canal que escreva o aviso no chat apareceria como
mensagem comum, e daria para procurar o texto, mas isso depende do canal. Por isso não há desconto por chat.

Medido com som sintético: jingle repetido 4 vezes sobre fundos e volumes diferentes: correlação 0,86 sem o piso de 40
dB, 0,9 ou mais com ele, e as 4 saem. Seis explosões variadas: nenhuma vira alerta. O mesmo clipe de explosão 3
vezes: correlação 0,997, mas achatamento 0,56 (ruído), então não vira alerta. Live sintética de 10 min com 3
jingles e 2 explosões: antes 5 explosões, depois 2.

Não medido, bloqueado: som real de 4 ou mais streamers (Abisal de 05/10 e o VOD do tchubi). Falta ffmpeg e Python
com numpy/av neste PC, e baixar os segmentos pede o ok do dono. Os limiares (0,85, 0,90, 0,97, 0,4) são ponto de
partida. O risco que só dado real resolve: o mesmo C4 também toca o mesmo clipe, então explosões reais podem se
parecer entre si quase tanto quanto um jingle; a barreira é o achatamento (ruído contra tom).
Para fechar: com o ok, baixar 20 min de cada um dos 6 canais do Abisal, descodificar para f32 e rodar a sonda; ou o
dono grava no servidor dele cada arma e explosivo em várias distâncias, que serve de treino limpo do modelo positivo.

### Medido com som real e com o Rust (13/10), alertas aprendidos e modelo positivo ligado
Dados: 6 canais do Abisal (12 min de cada, a partir de trechos com morte achados antes; os VODs de 05/10 de crreg e
elwasabitm já não estavam na lista da Kick, então são os de 10/10 e 11/10) e a live do tchubi de 08/10 (25 min, mais 4
janelas de 60 a 90 s nos lances que o dono rotulou). Tudo a 160p, som a 24 kHz mono. `audio.bundle` do Rust lido em modo
leitura (UnityPy 1.25.4, FSB5 decodificou sem erro): 11.289 AudioClips, exportados 109 de explosão, 13 de explosão de
veículo, 712 de tiro (22 famílias de arma, camadas de corpo, cauda, mecânica e grave) e 64 de coleta (machado, picareta,
pedra, árvore). Só vetores vão para o git; os WAV ficam fora.
- Modelo positivo (`site/modelo-explosao.js`, 23 traços, uns 600 bytes): as 122 explosões do jogo foram aumentadas 12 vezes
  (tom, passa-baixas de distância, reverb, fundo de VOD, AAC de 32 a 96 kbps, altura de 8 a 45 vezes o chão). A detecção
  real acha 605 de 1.464 (41%: as longe e abafadas somem antes do modelo). O traço novo é o achatamento, e a forma do
  espectro conta como um traço só: antes um tom de 6 s se diluía nas 20 bandas e passava. Receita em
  `probes/modelo-explosao/` (cinco passos, scripts pequenos).
- Nota em explosões do jogo que o treino não viu: p05 0,33, mediana 0,69, p95 0,88. Em 86 tiros do jogo que a detecção tomou
  por explosão: mediana 0,45 (AUC explosão contra tiro 0,76). Corte de 0,4: ficam 91% das
  explosões do jogo e 64% dos tiros.
- Verdade de chão do dono, live do tchubi de 08/10: nenhum desses lances tem explosão. A detecção marcou 8 sons nas janelas
  deles: 2 alertas de sub (4 min e 1 h 03, 6,5 s cada, achatamento 0,17, mesma forma de onda com correlação 0,66) e 6
  sons curtos e altos (picos de 53 a 115 vezes o chão, 21 s entre eles, achatamento de ruído). Notas do modelo: alertas 0,01 e
  0,01; os 6 de tiro de perto entre 0,08 e 0,36. Todos abaixo de 0,4. Separar a voz com Demucs não muda nada: os 8 sons
  continuam no resto sem voz, menos o de 1 h 03 que some (uma parte dele era voz). O corte de 0,4 foi escolhido olhando
  essas 8 amostras: afinado dentro da amostra, e 8 amostras de um canal só.
- Alertas aprendidos: os dois alertas do mesmo sub têm semelhança de espectro 0,88, menos que os 0,97 pedidos para 2
  repetições. Regra nova: com achatamento até 0,2 (só 1% das explosões do jogo fica abaixo de 0,25) 2 repetições com 0,85
  bastam, e a memória do canal reconhece com 0,85. Sem isso o canal nunca reaprendia o próprio alerta.
- Por canal, explosões antes / tiradas por repetir / tiradas pelo modelo / ficam: crreg 36 / 22 / 8 / 6; poionako 15 / 0 / 7 /
  8; skylane7 18 / 0 / 8 / 10; xguiry 5 / 3 / 0 / 2; elwasabitm, ispdep e tchubi (20 a 45 min) 0. Sem verdade de chão nesses
  canais: não sei se as 22 do crreg são alerta. Sinais: correlação de forma de onda baixa entre elas (mediana 0,22, um alerta
  de verdade passa de 0,6), notas do modelo de 0,45 a 0,87 e a série acaba 7 s antes de uma tela de morte. Risco de ter
  tirado explosões de verdade ali. O que o modelo tira do poionako e do skylane7 também não está conferido.
- Ligado nos dois modos (`alertasDoCanal` em `alertas.js`, usado por `simples.js` e `app.js`). `POSITIVO.ligado = false`
  desliga sem mexer em mais nada.
- Demucs (htdemucs, 80 MB, PyTorch CPU): 0,12 a 0,20 s de CPU por segundo de áudio com 16 núcleos. Não testado a legenda.

## Qualidade da exportação dos clipes (12/10)
- Feito (`retrato.js`, `chat-clipe.js`, `legenda.js`, `app.js`, `estilo.css`, `index.html`, `idiomas.js`):
  - A gravação do 9:16 e do 16:9 com chat ou legenda usa os fps da playlist da Kick (`FRAME-RATE`, 59.94 vira 60,
    sem número vira 30, teto 60). Débito do vídeo 12 Mbps até 30 fps e 18 Mbps a 60 (razão 1,5, a mesma que o
    YouTube recomenda para 1080p).
  - Cada pincelada pede o frame à mão (`requestFrame`) e o relógio marca a vez de cada uma. Medido no Chrome com
    fonte sintética de 60 fps: 240 frames em 4 s no arquivo, com AAC. `captureStream(60)` seco dava 184 a 229.
  - Se a gravação perde mais de 5% dos frames, aparece o aviso "o PC não deu conta" (nas 3 línguas) junto ao arquivo.
  - Áudio de 128 para 192 kbps; lista de codecs igual (AAC no mp4 continua).
  - Zonas do TikTok no 9:16 (topo 9%, rodapé 20%, direita 13%, valores aproximados, não conferidos na fonte
    oficial): chat e legenda ficam dentro; a prévia do "Ajustar clipe" 9:16 mostra um tracejado fino.
  - Cópia sem recodificar ("tela cheia") não mexe: os bytes da Kick já têm a cadência da live.
- Falta: o clipe de vários ângulos (`angulos.js`) ainda grava a 30 fps; exportar um clipe real pela tela (a aba do
  navegador de teste estava escondida e o Povix pausa a gravação nesse caso).
- Botões com hierarquia (aprovada pelo dono). Cartão: TikTok cheio, Tela cheia com borda mais clara e ícone, Editar
  sem caixa com tesoura, lixeira cinza lá na ponta direita (vermelha só no hover/foco). Editor: pega do Início verde
  com seta e do Fim vermelha com quadrado (tokens `--inicio` e `--fim`), passos "−0,5 s / +0,5 s" (o passo real é meio
  segundo) agrupados sob Início e Fim, Cancelar sem caixa à esquerda, "Baixar para TikTok" / "Baixar tela cheia"
  nas 3 línguas, cheio é o TikTok quando o editor veio do Editar de um cartão, senão a tela cheia. "Voltar para a
  lista" numa linha só. Conferido no navegador a 1280 e 375 px. Os PNG em `prints-facil/` não foram salvos (o
  navegador do painel não grava arquivo).

## Pedido do dono (13/10): fila do Povix, para depois
- Título do lance que diz o que aconteceu ("Rocketada e PvP com 2 armas", "C4", "grito") e uma fala do clipe entre
  aspas, nos dois modos. Depende do modelo dos sons do Rust (agente em curso).
- Filtro no topo da lista simples: um botão "Filtrar" abre um menu pequeno com busca por palavra dita no clipe,
  tipo de lance (PvP, foguete, C4, grito, morte), nota (só "Muito bom"), quantidade de mortes, e ordenar (melhor,
  hora, mais mortes). "Aplicar" fecha o menu; sem resultado mostra "Nada com esse filtro" e "Limpar filtro".
  Fica para depois (o dono: "deixa isso pra mais tarde").
  13/10, mais do dono: a live é analisada uma vez e tudo fica num índice no aparelho; a busca é completa e
  personalizada (combinar marcas, palavra, mínimo de acertos/headshots/mortes, duração) e mostra a precisão de
  cada resultado e da busca em %, calibrada nos rótulos do dono quando houver, dita como estimativa quando não.
- "Achar webcam" pega a borda da caixa da webcam inteira (linhas paradas em vários quadros), não só o rosto, e
  ajusta a faixa ao formato dela.
- Editor travado durante a gravação: aviso "Gravando o clipe: 23 s de 60" com Parar.
- Parte que o TikTok tapa: escurecer em vez do tracejado, com "O TikTok tapa a parte escura".
- Clipe de vários ângulos (angulos.js) no FPS da live, como os outros.
