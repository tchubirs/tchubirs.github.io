# Busca na Kick: escolher o trabalho antes de começar

Estudo de15/10/2026, implementação retomada em16/10. A preparação “Tudo à vista”, escolhida pelo dono, agora implementa transmissão/data, trecho ou inteira e perfischat/rápida/completa. A publicação e a versão desta entrega devem ser conferidas noANDAMENTO; este documento não comprova que o código já está online. Manter Rust/Kick como prioridade; Twitch fica para depois.

## Entrega e limites atuais

- Digitar um streamer primeiro busca o catálogo de transmissões; não inicia chat/áudio antes da confirmação. Padrão: últimos15minutos da transmissão escolhida; live inteira exige seleção explícita.
- Perfis executam trabalhos distintos. Só chat não chama a varredura de áudio; rápida analisa janelas dos picos; completa analisa o áudio disponível do escopo escolhido. Sem picos não expande silenciosamente.
- Cache mantém pedido/escopo/perfil. Resultado de trecho completo usa `varrido:trecho`, nunca `tudo`; ampliar o áudio preserva o intervalo e reaproveita o chat concluído, inclusive apósF5.
- Estimativa antes de começar usa amostras recentes do mesmo canal/perfil/aparelho e durações semelhantes. Sem amostra mostra indisponibilidade explicitamente; ainda NÃO há sonda inicial de estimativa. A medição de chat abaixo não explica nem resolve sozinha os40min relatados. A faixa é uma aproximação baseada em histórico, nãoSLA.
- A preparação nova é para streamer/VOD. Busca de evento inteiro ainda segue o fluxo anterior. Filtros específicos de combate/morte/reação nesta preparação, cache de múltiplos trechos e retomada de amostragem ainda não foram implementados.
- Verificações locais usamChrome eKick simulada; não equivalem aSafari físico, carga de200usuários ou medição de tempo emVOD real.

## Medição limitada com Kick real — 16/10/2026

- Kodd, VOD Rust iniciado15/10às20h00m07UTC, trecho21h45–22hUTC: **1.045mensagens,42páginas,41,434s**, leitura concluída sem erro/429. Catálogo mais chat somaram747.300bytes em43GETs. O ensaio usouNode noPC, pausa deliberada200ms entre páginas, máximo60páginas/45s/sem retries; não usou áudio, modelo nem API paga.
- Reprocessar as mesmas respostas em memória levou5ms, com os mesmos IDs e zero pedidos novos. Isso separa processamento local de paginação/rede neste trecho; não é medição de cache persistente do app, Safari nem comparação contra live inteira. Fonte privada do relatório: outputs/chat-real-15min.json no workspace da conversa.
- O leitor do app já reaproveita a cobertura do chat em memória ao mudar trecho. Foi reproduzida uma perda na retomada parcial: as datas das mensagens vêm ao segundo, mas a página seguinte pode conter outras do mesmo segundo. Ao interromper e retomar, a fronteira agora é relida e deduplicada; o segundo incompleto não conta como coberto. Teste reproduziu35/45mensagens antes e45/45depois, sem duplicatas; trecho concluído segue sem novos pedidos.

## Problemas encontrados no código

- `simples.js:procurar` lê o chat da live inteira antes do áudio. Com picos, ouve janelas em torno deles. O fallback silencioso que ouvia tudo SEM picos foi removido: agora explica a limitação e oferece o botão existente para ampliar. Isso NÃO limita ainda o tempo da leitura inicial do chat.
- O filtro atual consulta resultados já indexados. Desmarcar tipos não reduz o download que já ocorreu. Os detectores compartilham a leitura do áudio; desligar um detector isolado não traz necessariamente grande economia.
- `mostrarEvento` começa a ler chat de todos os participantes. Abisal tem 144 canais cadastrados. Uma busca de um streamer não precisa começar por todos eles.
- O modo simples não expunha o progresso de abertura do elenco. Correção desta entrega: contagem visível e cancelamento real dos pedidos, inclusive proteção contra respostas de buscas antigas.
- ETA atual aparece durante etapas medidas; não é uma previsão de toda a tarefa antes de iniciar. Não há medição que confirme a causa exata dos 40 minutos relatados.
- Corrigido também o cache do chat: exceção, limite retornado ou canal indisponível não contam como leitura concluída. Cache da busca rápida continua `varrido: picos`; somente cobertura real total após ampliação explícita vira `tudo`. `completo` no contrato antigo significa que a passada salva pode abrir do cache, não que todo o áudio da live foi analisado.

## Fluxo recomendado

1. Digitar streamer, link ou evento abre uma preparação leve, sem iniciar análise de toda a live.
2. Selecionar uma transmissão REAL, agrupada por data, com horário e duração. Se a live atravessa meia-noite, manter a mesma transmissão e mostrar as duas datas. Explicitar o fuso usado.
3. Selecionar **um trecho** ou **live inteira**. Atalhos: em volta da jogada marcada, últimos 15 minutos disponíveis, início/fim manual. “Inteira” é uma escolha explícita; preservar a última preferência válida neste aparelho.
4. Escolher profundidade e o que buscar. Mostrar escopo e estimativa ANTES de “Começar busca”. Ajustar o botão ao escopo, por exemplo “Buscar nesses 15 minutos”.
5. Mostrar resultados progressivamente. Parar preserva o que já foi encontrado. Aumentar o trecho ou aprofundar reaproveita a cobertura realmente concluída.

Para **minha POV + adversário**, uma jogada marcada já fornece data e instante: pular os seletores redundantes e buscar somente ao redor dela. Começar pelo canal da pessoa; consultar o restante do elenco na descoberta de POV, priorizando pistas elegíveis. Pistas não viram mortes confirmadas.

## Três perfis com custos diferentes

| Perfil | Trabalho executado | Limitação que precisa aparecer |
| --- | --- | --- |
| Reações do chat | Só chat no trecho escolhido | Pode perder lances sem reação do público; não confirma combate |
| Highlights rápidos | Chat e áudio perto das reações | Pode perder jogadas fora dessas janelas; sem picos, oferecer outro perfil, NUNCA ampliar silenciosamente |
| Análise completa | Chat e todo o áudio disponível do trecho; contexto nos candidatos | Mais download e processamento; contexto sujeito ao orçamento disponível, sem prometer leitura de todos os quadros |

“O que buscar”: combate, mortes, reações/gritos e chat. O motor decide as etapas necessárias; a interface deve distinguir busca direcionada de filtro da lista. Manter opções avançadas recolhidas e um padrão lembrado, sem acrescentar uma sequência de confirmações a cada clipe.

## Estimativa honesta antes de iniciar

- Usar cobertura em cache, quantidade de canais, duração disponível, tamanho/bitrate dos segmentos e velocidades medidas neste aparelho. Não usar só duração nominal nem contar novamente trechos já analisados.
- Separar estimativa de chat, áudio e contexto; mostrar uma faixa total, com incerteza. Chat depende de quantidade de mensagens e paginação, não apenas de horas.
- Primeiro uso sem amostra: mostrar “Calculando estimativa” e medir uma amostra pequena durante a preparação, reaproveitada pela busca. Não inventar “2 minutos” para cumprir a interface.
- Atualizar se a Kick limitar pedidos ou a rede mudar. Informar quando a tarefa foi pausada ou está aguardando; não deixar uma previsão congelada por vários minutos.
- Manter tempos locais por etapa/escopo e validar a previsão contra duração observada em lives reais. Nenhum tempo de conclusão prometido neste estudo.

## Requisitos técnicos para implementar sem regressão

- Chave de cache deve incluir transmissão, trecho/cobertura, perfil/etapas e versão dos detectores. Uma busca de 15 minutos não pode marcar a live inteira como concluída.
- Reutilizar a união da cobertura disponível; não concatenar índices parciais como se estivessem completos. Resultados fora do trecho selecionado ficam fora da lista dessa busca.
- AbortSignal desde a escolha até chat, download, áudio e contexto; geração da busca protege a tela contra respostas antigas.
- Buscar mais resultados não deve baixar novamente o áudio já concluído. Falhas e trechos incompletos continuam pendentes.
- Não gastar API para preparar data/trecho ou filtrar índice. Crédito Anthropic de desenvolvimento bloqueado; preservar reserva de execução.
- Antes de alterar o layout: apresentar variações pequenas, usando o visual atual como base, e iterar conforme AGENTS.md. Não repetir as três propostas de layout já rejeitadas.

## Validação necessária

- Testar trecho de 15 min versus live inteira no MESMO VOD, mesma rede e cache frio/quente separadamente. Medir tempo até primeiro resultado, total, bytes e número de pedidos.
- Testar sem chat, sem picos, mudança de dia, múltiplos VODs, vídeos incompletos, buracos, cancelamento, reabertura e filtro que remove todos os resultados.
- Medir precisão com lances anotados de Rust, incluindo tiros distantes, personagem desarmado/submerso e conversa alta. Som isolado não comprova participação.
- Validar PC e telefone real. Os testes atuais de navegador usam Chrome e serviços simulados; não equivalem a Safari físico nem a capacidade de 200 usuários.

## Referência funcional

O OpusClip permite selecionar o intervalo de processamento e orientar a procura antes de gerar clipes. É referência para controle de escopo; não é prova de desempenho para Rust/Kick, nem referência aprovada de layout.

- https://help.opus.pro/docs/article/how-do-i-delete-my-customer-data — índice introdutório com “Clip a Specific Timeframe” e instruções de busca.
- https://www.opus.pro/pricing — lista “Select clipping timeframe” e “Prompt to clip”. Consulta de 15/10/2026; não são recomendações de contratação.
