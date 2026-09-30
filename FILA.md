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
   Capas novas (foto 1) nos 44 em 29/09 (`etsy/cover.py`). Vídeo de 11 s em cada um em 29/09 (`etsy/video.py`, enviado pelo `publish.py`). Quando ele ligar o inglês na loja: `python3 etsy/publish.py english` e conferir.
2. **Fiverr:** assim que ele criar a conta, responder cada pedido no mesmo dia, com o trabalho pronto.

Pausado até algo vender ou ele pedir: inventário da casa (rascunho em `etsy/home-inventory`), manutenção da casa,
galinhas no quintal, férias da equipe, Herculano.

Feito até agora: publicador da Etsy pela API (`etsy/publish.py`, testado com uma Etsy simulada;
falta só a chave dele), Fiverr (5 anúncios prontos, com imagens de trabalho real, e o
conversor de extrato testado), Etsy (orçamento TDAH, assinaturas, kit, quitar
dívidas, autônomos, casamento, estoque, reforma da casa, aluguel por temporada, calculadora de taxas, orçamento por salário, aluguel mensal, cardápio da semana, metas de poupança, agenda de clientes, treinos, encomendas, hábitos e humor, estudos, despesas em grupo, viagem, leitura, contas da casa dividida, festa, plantas, mudança, pets, carro, bebê, horas e faturas, Natal, ferramentas de empresa, glicose e remédios, candidaturas a emprego, tarefas e mesada, lotes e etiquetas de comida caseira, aulas e notas para professor, empréstimos entre amigos, patrimônio e dividendos, calendário de conteúdo, doações e voluntários, envelopes de dinheiro, horta, personal trainer, pacote das 5 que mais vendem para publicar à mão; guias de todas as planilhas explicam como apagar os exemplos sem quebrar fórmulas; as 3 primeiras também
em francês). Tudo revisado pela regra 14 em 28/09.
