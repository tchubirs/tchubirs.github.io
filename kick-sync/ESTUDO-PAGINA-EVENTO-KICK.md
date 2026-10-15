# Página oficial do Abisal: dados úteis para o produto

Conferência real em15/10/2026,22h38–22h46UTC. Fonte: https://kick.com/events/abisal?c=geitta&c=volcano . Página e respostas públicas salvas no cwd da conversa, em `outputs/kick-evento-*`.

## O que foi confirmado

- A página informa328 participantes cadastrados. A lista pública continha207 transmissões ao vivo na primeira leitura e208 na conferência seguinte. Contagem variável, não capacidade medida do nosso app.
- A lista estática de144 canais deixava de fora129 daqueles207 canais ao vivo, incluindo Kodd, Volcano, PNKFacil e o próprio Tchubi. Não era uma lista completa do evento. O conjunto antigo também contém canais que já saíram do ar; não equivale ao conjunto ao vivo.
- O evento tem ID público `01a132ac-44ce-73c3-885a-eca55f6bdaba`, início informado15/10/2026às16hUTC e fim18/10às23h45UTC. Os VODs podem começar antes do evento.
- “Melhores momentos” já oferece clipes publicados, ordenados por visualizações ou mais recentes. A resposta fornece canal, título, duração, visualizações, link de reprodução e `started_at`. Há paginação: uma página não representa todos os clipes.
- O detalhe de um clipe inclui autor (`creator`), canal da transmissão (`channel`) e `video.id`/`video.offset`. No clipe “Noob es MORIDO por Geitta”, a interface mostrou “Assista ao vídeo completo” apontando para o VOD de PNKFacil com `?t=20559`; o GET público do clipe confirmou esse mesmo offset. Isso fornece uma âncora para voltar à fonte, sem reler toda a live.
- Multiview permite até quatro transmissões na interface observada, com modo foco ou distribuição uniforme. `?c=geitta&c=volcano` representa os canais selecionados. A página exibiu o chat do canal em foco. Isso não comprova sincronização entre os vídeos nem identificação automática do adversário.
- Títulos de algumas lives citam colegas com `@nome`. São pistas fornecidas pelos streamers, não um cadastro oficial de times.
- Existe uma consulta pública a anúncios ao vivo do evento. Retornou lista vazia nesta conferência; nenhum registro de mortes ou placar foi encontrado nela.

## Consultas verificadas

O cliente público da própria Kick expõe estes caminhos, sob `https://web.kick.com/api`:

- `GET /v1/events/{id}/streams`:200, lista de transmissões e IDs de canal.
- `GET /v1/events/{id}/clips?sort_by=view_count&order=desc`:200, clipes populares.
- A mesma consulta com `sort_by=clip_id`:200, clipes recentes.
- `GET /v1/clips/{clipId}`:200; detalhe com autor, VOD e offset original.
- `GET /v1/events/{id}/live-announcements`:200, lista vazia.
- `GET /v1/events/{id}/participants`:403 `PARTICIPANT_ACCESS_DENIED`. A lista completa dos inscritos não está disponível para esta consulta pública. Nenhuma tentativa de contornar essa restrição foi feita.

São interfaces do site, sujeitas a mudanças, sem garantia de estabilidade da API pública para desenvolvedores. A coleta respeita429 e guarda resultados parciais.

## Aplicado ao coletor

`monitor/evento-kick.mjs` busca canais públicos e as primeiras páginas de clipes recentes/populares. `monitor/rodar.mjs`, com `--evento-kick-id`, renova essas fontes por rodada, inclui novos canais, mantém os anteriores para ler o histórico e usa os IDs oficiais para evitar pedidos individuais de metadados. Não altera o frontend publicado.

`clipes-evento.json` preserva origem, canal e horário, sem transformar título ou visualizações em confirmação de qualidade. Na prova real de uma rodada, as duas ordenações produziram36 clipes distintos e Kodd entrou na coleta com o ID oficial, sem outra consulta de perfil. Essa prova leu só uma página do chat de Kodd, não as cinco horas completas.

## Uso imediato e próximos ganhos

1. Para recuperar o que já aconteceu, revisar primeiro os clipes existentes e os maiores picos do chat; poupa a análise integral de horas de áudio.
2. Usar o horário de um clipe como janela para procurar outras POVs. O alinhamento precisa conferir PROGRAM-DATE-TIME, disponibilidade e eventuais offsets reais. Título com nome de adversário continua sendo pista.
3. Registrar crescimento das visualizações entre leituras para destacar clipes recentes ganhando atenção; volume acumulado favorece os mais antigos. Ainda não implementado.
4. Cruzar a reação de vários chats no mesmo intervalo para priorizar uma cena; isso não prova que seus jogadores se enfrentaram.

O valor adicional do projeto continua sendo encontrar e organizar o mesmo lance entre POVs, sincronizar e preparar a exportação. A página oficial já resolve descoberta de canais e uma parte da descoberta de clipes: convém reutilizar esses dados.
