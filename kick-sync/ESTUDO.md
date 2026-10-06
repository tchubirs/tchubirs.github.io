# Relatório de evidências: sincronização e cortes multi-POV para eventos na Kick

Data: 6 de outubro de 2026. Para: dono do produto.

**Como ler este relatório.** Cada frase com um fato termina com um número entre colchetes, por exemplo [7]. O número leva à lista de Fontes no final. O que é conclusão nossa está marcado como **(inferência)**. As contas que fizemos estão marcadas como **(aritmética)**. "Fonte fraca" quer dizer site de fã, rastreador não oficial ou uma única observação. "Dado da própria empresa" quer dizer que a empresa divulgou o número sobre ela mesma e ninguém conferiu.

---

## 1. Resposta curta

**A ferramenta é útil, mas com ressalvas. Ela resolve um problema que a Kick já tem e que já paga para resolver. Só que ainda não pode ser vendida como está, porque usa um acesso aos vídeos que a Kick não autorizou.**

**O que está provado:**

- **A Kick já organiza esse tipo de evento.**
  - O site do Rust Kick Off 2 tem no rodapé "© 2026 KICK". Ele destaca "Multi-POV Streaming" e "150 perspectives. One server." [1]
  - O site oferece agenda, times, placares, mapa de calor, regras e um link para a categoria Rust na Kick. Não oferece replay sincronizado nem ferramenta de corte [1].
- **Esses eventos dão audiência para a Kick.**
  - O Kick Off 2 ajudou a categoria Rust a bater o recorde de 311.000 espectadores simultâneos [9].
  - No mesmo período, a Kick inteira chegou a 1,8 milhão, o maior pico desde fevereiro de 2026 [9].
  - A primeira edição, em novembro de 2025, teve 13,85 milhões de horas assistidas em 159 canais [7].
- **A Kick já paga por clipes.**
  - O CEO da agência Clipping disse à Bloomberg que a Clipping recebe dinheiro da Kick e paga os clippers [67].
  - Segundo dados da própria Clipping, 1.737 clippers trabalharam na campanha da Kick [67].
  - Segundo a Tubefilter, a outra metade da rede de cerca de 1.000 clippers do N3on é "apparently paid by Kick" [64].
  - A Kick afirma que seu programa de clipes gerou mais de 3 bilhões de visualizações em um mês [65]. É dado da própria Kick, citado pelo site win.gg.
- **As ferramentas nativas da Kick não cobrem esse caso.**
  - O Multi-View da Kick mostra no máximo 4 transmissões no desktop e 2 no navegador do celular. Ele só funciona com quem está ao vivo [45].
  - O clipe nativo é de um canal só e dura de 10 a 180 segundos [44].
  - A API oficial não tem nenhum endpoint de vídeo, VOD ou clipe [33].

**O que NÃO está provado:**

- Que a Kick ou um organizador pagaria por esta ferramenta. Não achamos nenhum caso público de organizador que use uma ferramenta de VOD sincronizado.
- Quantos usuários novos um clipe traz para a Kick. Não existe dado público de quantos clipes viram seguidores ou espectadores (ver seção 9).

**Para quem a ferramenta é útil, da evidência mais forte para a mais fraca:**

| Quem | O que as fontes mostram | O que a ferramenta entrega |
|---|---|---|
| Staff e organizadores | As regras do Kick Off 2 mandam os admins "Monitor creator streams and clip notable moments". As disputas, inclusive de stream-sniping, exigem prova em vídeo [3] | Escolher um instante e ver todos os POVs, mais um pacote de prova com horário (inferência) |
| Marketing da Kick e KICK Studios | A Kick financia clippers e agências [64, 67]. A KICK Studios existe para dar "production and marketing resources" a criadores [22] | Mais clipes por evento e menos tempo para achar cada momento (inferência) |
| Produtores de filmes-resumo | O filme do Global Warfare 2 (evento do verão de 2024) ainda estava "almost finished" em fevereiro de 2025 [19]. O FancyOrb, que fez esse filme, também comandou eventos dentro do Kick Off 2 [3] | Achar o momento em dezenas de VODs em minutos, não em semanas (inferência) |
| Clippers | Na rede do N3on, o pagamento era de US$ 40 por 100 mil visualizações [63] | Achar lutas e ângulos sem assistir horas de VOD (inferência) |
| Streamers participantes | A Twitch diz que colaborações são "one of the best ways to reach new audiences" [56] | Clipes com crédito e link para cada canal que aparece (inferência) |
| Espectador comum | Evidência fraca. O Squad Stream da Twitch (grade de 4 lives) ficou abaixo de 1% das lives de parceiros e foi desligado [54] | Um corte já editado, não uma grade (inferência) |

**O maior risco é legal.**
- Os termos da Kick proíbem acessar conteúdo "through any technology or means other than those provided or authorized by the Service" [46].
- A ferramenta usa endpoints não documentados [39, 41] e lê o CDN diretamente [40].
- Antes de cobrar por ela ou abri-la ao público, é preciso ter permissão escrita da Kick (inferência; detalhes na seção 5).

---

## 2. O evento de Rust

### O que sabemos

**Sobre o próximo evento (times de 4, cerca de 500 streamers, parceria com a Kick).** Essas informações são suas. Não achamos nenhuma fonte pública sobre esse evento. Em 5 de outubro de 2026, um rastreador de fã que consulta o portal de Drops da Facepunch dizia "No new campaign listed yet" para a Kick [10] (fonte fraca). Tudo o que vem abaixo é de eventos anteriores.

**Rust Kick Off 2025 (primeira edição):**
- O torneio foi de 13 a 17 de novembro de 2025, com média de mais de 174.000 espectadores [8].
- Teve 13,85 milhões de horas assistidas em 159 canais [7].
- O maior canal foi o do argentino ElSpreen, com mais de 35.100 espectadores no último dia [7].
- Nos 12 dias de Drops, Rust foi a segunda categoria mais vista da Kick, com 24 milhões de horas assistidas [8].

**Rust Kick Off 2 (11 a 14 de junho de 2026):**
- 150 criadores, 10 times e US$ 100.000 em prêmios [1].
- Cada time tinha 15 nomes, entre eles capitão e vice-capitão [2].
- A categoria Rust bateu o recorde de 311.000 espectadores e somou 15 milhões de horas assistidas nos quatro dias [9].
- 231 canais diferentes transmitiram Rust, 85% a mais que nos dias anteriores [9].

**Regras do Kick Off 2 que importam para o produto [3]:**
- Todos os participantes devem transmitir só na Kick durante os quatro dias.
- O participante não pode assistir às lives de outros times que estão jogando no servidor (regra anti-ghosting).
- Admins de nível 1 acompanham as lives, cortam momentos e ajudam a gravar demos.
- Disputas exigem prova, e a lista de provas em vídeo inclui stream-sniping.
- No dia 4, os cofres podem ser invadidos, e o time que tiver o cofre invadido é eliminado.

**Agenda com momentos previsíveis [4]:**
- Dia 2, 13h EST: "Rockets, explosive ammo, and C4 unlock. Open raiding begins."
- Dia 4, 18h EST: "Vaults Raidable".
- Há janelas de beacons e eventos à noite todos os dias.

**Dados do servidor:**
- O placar público mostrava 20.702 abates e 186 jogadores ativos. Para cada jogador, mostrava abates, mortes, KDR, headshots, dano e distância máxima [5].
- O mapa de calor tem camadas de locais de morte, zonas de combate e zonas de raid (1.285 pontos onde explosivos foram detonados). A imagem do mapa vem do wipestats.gg [6].
- As páginas públicas não mostram o horário de cada abate [6]. Os dados existem no servidor, mas não sabemos se dá para exportá-los (inferência).

**Quem assiste Rust na Kick:**
- Numa consulta de 6/out/2026 às 09:06 UTC, horário de pouca audiência, a categoria Rust na Kick tinha 1.072 espectadores e 84.175 seguidores [12].
- Na mesma consulta, 16 dos 38 canais ao vivo eram em espanhol e tinham 739 dos 1.070 espectadores [13]. Na Twitch, o espanhol é 8% do público de Rust [14]. São números de um único momento, não uma tendência.
- Na Twitch, Rust tem média de 20.788 espectadores em outubro de 2026 [14].
- O jogo continua grande. O recorde na Steam é de 259.646 jogadores (janeiro de 2025), e o pico de junho de 2026 foi de 219.164 [15].

**Outros eventos de Rust com muitos streamers:**
- Em janeiro de 2021, Rust passou de 1 milhão de espectadores simultâneos na Twitch. O principal responsável foi o grupo OfflineTV [16].
- A Twitch Rivals fez um evento de Rust chamado "Base Invaders" em 8 de outubro de 2025 [17].
- O evento espanhol Bellum (junho e julho de 2025) teve Drops da Facepunch [18].
- Em setembro de 2026, VODs de danikongi e de outro canal de Rust na Kick têm títulos como "ECLIPSE" e "EVENTO ECLIPSE" [20, 21]. É fonte fraca: só vimos os títulos.

**Drops:** o programa de Drops de Rust na Kick mostrava cerca de 4,2 milhões de drops resgatados por 385.627 jogadores. O drop só conta para um canal por vez [11].

**Um formato parecido fora do Rust:**
- O MC Championship tem 10 times de 4 jogadores, e a maioria transmite o próprio ponto de vista [60].
- O público se divide entre os canais. No MCC 9 foram cerca de 500 mil espectadores simultâneos, 100 mil deles no canal do Dream [60].

### O que não sabemos

- Nome, datas, organizador, lista de canais e regras do próximo evento.
- Se haverá Drops, se o servidor vai ter dados com horário e se haverá regras sobre VOD e uso de clipes.
- Quantos participantes são verificados na Kick. Isso decide se o VOD fica disponível por 7 ou por 30 dias [42].
- A escala: 500 streamers em times de 4 dá cerca de 125 times (aritmética). Isso é mais que o dobro dos 231 canais do Kick Off 2 [9] (aritmética).

---

## 3. Por que a Kick ganharia com isso

1. **A ferramenta entrega o que o marketing da Kick já promete.** O site oficial vende "150 perspectives. One server." [1], mas não oferece uma ferramenta para isso [1]. O Multi-View nativo vai até 4 lives e não funciona com VOD [45]. A ferramenta preenche essa lacuna (inferência).

2. **Os eventos de Rust já deram resultado medido.** Rust foi a segunda categoria mais vista da Kick no período de Drops de novembro de 2025 [8]. Em junho de 2026, o período do Kick Off 2 teve o maior pico da Kick desde fevereiro [9]. Clipes com vários pontos de vista podem manter o evento circulando depois dos quatro dias (inferência).

3. **A Kick já gasta com clipes, e a ferramenta reduz o custo de cada clipe bom.**
   - O N3on pagou US$ 1,4 milhão a 303 clippers em cinco semanas, a US$ 40 por 100 mil visualizações [63].
   - O CEO da Clipping disse à Bloomberg que a Kick paga a agência [67].
   - Segundo Adin Ross, o CEO da Kick quis atrair clippers da Twitch pagando "double pretty much" [66].
   - O site da Clipping mostra o logo da Kick entre os clientes e uma campanha "Kick Clipping" de até US$ 40 por 100 mil visualizações [68] (dado da própria empresa).
   - A parte cara do trabalho é achar os segundos certos em horas de VOD. É isso que a ferramenta acelera (inferência).

4. **Um clipe alcança mais gente que a live.**
   - O N3on diz que uma live com pico de 40 mil pessoas pode gerar um clipe com até 50 milhões de visualizações [63]. É a fala dele, não um dado medido.
   - Segundo dados divulgados por uma empresa de marketing que trabalha com o Clavicular, 70.000 clipes dele somaram 2,2 bilhões de visualizações em março e abril de 2026. A média dele ao vivo é de cerca de 6.200 pessoas [67].

5. **Um clipe com vários ângulos resiste à nova regra do YouTube.** O YouTube vai reduzir o alcance de vídeos reenviados "without adding anything of your own" e incentiva edição original [71]. Um corte que alterna atacante, defensor e terceiro é edição original (inferência).

6. **A audiência dos eventos está espalhada em muitos canais.**
   - O co-streaming foi 52,9% das horas assistidas de esports em 2025 [58].
   - Em 2026, a Kick fechou acordos com a Riot (direitos de transmissão de LoL, VALORANT e TFT) [23] e com a ESL FACEIT Group (distribuição em inglês de CS e Dota 2) [24]. O anúncio da Riot cita co-streaming [23].
   - O mesmo motor de sincronia serve para vários co-streamers de uma mesma partida (inferência).

7. **As plataformas continuam investindo em lives com vários criadores.**
   - A Twitch tenta fazer lives com vários criadores darem certo desde março de 2019 e lançou o chat unificado em 2024 [55].
   - A Twitch passou a somar as audiências dos canais que fazem uma colaboração [56].
   - O YouTube TV lançou em 2023 um Multiview com até quatro transmissões ao mesmo tempo [57].

8. **Patrocinadores querem clipes com alcance medido.**
   - A Relo Metrics diz que highlights compartilhados "now have even more sponsorship value" [73].
   - A Shikenso recomenda montar ações de patrocínio em torno de clipes e medir o alcance deles [74].
   - Um relatório de clipes por evento ajuda a Kick a mostrar valor aos patrocinadores (inferência).

9. **Segundo a própria Twitch, clipes levam as pessoas para a live.** A Twitch disse: "Our investment in Clips is to help viewers discover your channel so they join you and your community when you stream." [72]

10. **A Kick investe em criadores e em marca no longo prazo.**
    - A Kick diz que seu programa Partner já facilitou pagamentos de mais de US$ 400 milhões a criadores desde 2024 [28].
    - Sobre a festa da Kick no Brasil durante a Copa, a cobertura avalia que esses eventos "não geram número de usuários no dia seguinte, mas criam o tipo de memória afetiva e vínculo pessoal" [25].

11. **A ferramenta serve além do Rust.**
    - A Kick fez parceria com um servidor de GTA RP para acelerar a verificação dos streamers que jogam lá [26].
    - A Kick foi parceira de transmissão do Empire X, com mais de 300 criadores em mais de 20 casas [27].
    - Eventos de vários criadores já chegaram a centenas de participantes: o ZEvent teve 327 streamers em 2025 [61], e o Squid Craft Games 2 teve 200 [62].
    - O uso da ferramenta nesses formatos é inferência.

---

## 4. Concorrentes e comparáveis

### Ferramentas parecidas

| Ferramenta | O que faz | Funciona com Kick | Sincroniza VODs de muitos POVs | Números verificados |
|---|---|---|---|---|
| Kick Multi-View (nativo) | Até 4 lives no desktop e 2 no celular, do mesmo evento [45] | Sim | Não, só ao vivo [45] | Artigo de ajuda atualizado em 3/set/2026 [45] |
| Kick Clips (nativo) | Corta de 10 a 180 s de um canal [44] | Sim | Não | Espera de 60 s entre clipes [44] |
| MultiPOV | VOD sincronizado na web. Realinha os vídeos pelo som a partir de uma dica do usuário [76] | Sim [76] | Sim, mas só em sessões montadas pelo usuário. Não fala em corte de clipes [76] | Sem números |
| MultiKick | Várias lives da Kick numa tela [77] | Sim | Não [77] | 183,3 mil visitas em 3 meses e alta de 23,33% no mês (ago/2026) [78] |
| ViewGrid | Até 20 lives no desktop [79] | Sim | Não [79] | Fonte fraca |
| MultiTwitch | Lives da Twitch lado a lado [80] | Não | Não | Sem números |
| Mapa de NoPixel (comunidade) | Segue uma cena por vários POVs da Twitch e da Kick. Tem revisão de VODs em beta [81] | Sim | Em parte (beta) | Fonte fraca |
| Eklipse | Corte automático vertical de uma live [82] | Sim, como recurso pago [82] | Não | 822.530 streamers e 10,19 milhões de clipes em jul/2026 (dado da empresa) [82] |
| StreamLadder | Clipes 9:16 a partir de VOD [83] | Sim [83] | Não | 12 milhões de clipes e 1 milhão de streamers (dado da empresa) [83] |
| OpusClip | Corte de vídeos longos com IA [84] | Não verificado | Não | Avaliação de US$ 215 milhões (SoftBank Vision Fund 2) e mais de 20 milhões de usuários [84]. Planos de US$ 15 e US$ 29 por mês [85] |
| Outplayed | Grava os melhores momentos do próprio jogador [86] | Não se aplica | Não, é de um jogador só | 16 milhões de downloads [86] |

**O que isso quer dizer:**
- Cortar uma live da Kick no formato 9:16 já é comum [82, 83].
- O diferencial está em três coisas: centenas de VODs de um evento num relógio só, troca de POV no mesmo instante e exportação de vários ângulos da mesma luta (inferência).
- O MultiPOV já realinha VODs pelo som [76]. Sincronizar sozinho não é vantagem suficiente (inferência).
- O Multi-View mostra que a Kick quer multi-POV, e também que ela pode construir mais disso sozinha (inferência a partir de [45]).

### Comparáveis no esporte e na edição profissional

- A WSC Sports diz atender 650 times, ligas e emissoras. Um executivo citado no site, ao lado do logo da NBA, diz que agora "it takes a few minutes to create over 1,000 highlight packages" [91]. A página inicial não cita clientes de esports nem de criadores [91].
- A Blackbird vende edição no navegador para "complex, live, multi-source workflows" e diz ser "up to 4 times faster" que editores instalados [92].
- O caminho caseiro de hoje é baixar cada VOD. O yt-dlp tem extratores próprios para kick:vod, kick:clips e kick:live [93].
- Nos EUA, a mediana anual de um editor de vídeo era de US$ 75.420 em maio de 2025 [75]. Isso dá cerca de US$ 36 por hora em 2.080 horas (aritmética).

### Aquisições e captações verificadas

| Caso | Valor | O que foi comprado | Fonte |
|---|---|---|---|
| Logitech compra a Streamlabs (set/2019) | Cerca de US$ 89 milhões, mais até US$ 29 milhões se metas fossem batidas | Software e ferramentas para quem faz live | [94, 95] |
| Twitch compra a ClipMine (anunciada em ago/2017) | Não divulgado | Indexação de vídeo por visão computacional | [96] |
| Streamlabs lança o Crossclip (jul/2021) | Feito em casa, não comprado. Plano pago de US$ 4,99 por mês | Conversor de clipes para vertical | [97] |
| Medal (jul/2024) | Captou US$ 13 milhões com avaliação de US$ 333 milhões | Plataforma de clipes de jogos | [87] |
| General Intuition, empresa nascida da Medal (ago/2026) | Em negociação com avaliação de US$ 6 bilhões antes do aporte, semanas depois de captar US$ 320 milhões a US$ 2,3 bilhões | Dados de gameplay para IA | [88] |
| OpusClip | Avaliação de US$ 215 milhões | Corte com IA, mais de 20 milhões de usuários | [84] |
| Powder (França) | US$ 22 milhões captados até 2023, incluindo Série A de US$ 14 milhões em 2021 | Detecção de abates e vitórias em VOD | [89, 90] |

**Leituras (inferência):**
- Para uma ferramenta pequena, a compra mais provável por uma plataforma é do tipo ClipMine: tecnologia e equipe, com preço não divulgado [96].
- As plataformas constroem sozinhas o que é simples, como o Crossclip [97] e o Multi-View [45]. O que vale proteger é a parte difícil: sincronia em escala de evento e detecção de lutas entre POVs.
- Os valores altos da Medal vêm do número de usuários e dos dados [87, 88]. Nós não temos nem um nem outro.
- Em 6/out/2026, o site powder.gg redirecionava para um documento do Google. Isso sugere que o produto foi encerrado, mas não confirmamos [89].

---

## 5. Riscos e questões legais

**1. Termos de uso da Kick (risco alto).**
- A seção 1.4 dos termos (modificados em 23/mar/2026) proíbe scraping, robôs e acesso "through any technology or means other than those provided or authorized by the Service" [46].
- A ferramenta depende de três coisas não oficiais: o endpoint kick.com/api/v2/channels/{canal}/videos [39], o endpoint de clipes [41] e o CDN stream.kick.com [40].
- A API oficial não tem nada de vídeo, VOD ou clipe [31, 33], e nenhuma permissão de acesso (escopo OAuth) cobre vídeo [34].
- Há um sinal de tolerância, mas ele não é uma licença. A central de ajuda da Kick indica ferramentas de terceiros para baixar VOD e ensina a copiar o link master.m3u8. Isso vale para o VOD do próprio streamer [43].

**2. Acordo de desenvolvedor (vale se registrarmos um app).**
- Exige usar o player da Kick para todo vídeo da Kick, a não ser com permissão escrita [47].
- Proíbe usar recursos não documentados e guardar conteúdo por mais de 24 horas sem autorização [47].
- Permite cobrar pelo nosso serviço, mas não pelo direito de assistir ao conteúdo da Kick [47].
- O único player embutido documentado é o de live (player.kick.com/USUÁRIO). Ele não tem VOD, não deixa pular para um horário e não tem controle por JavaScript [38].
- Por isso, hoje não dá para cumprir a regra do player e ao mesmo tempo sincronizar VODs sem permissão (inferência).

**3. Direitos sobre o vídeo.**
- O streamer é dono do conteúdo. A licença que outros usuários recebem vale só "as permitted through the functionality of the Service" [46].
- Streamers Partner dão à Kick uma licença exclusiva, perpétua e que pode ser repassada a terceiros [48]. Para esses canais, quem pode autorizar uso comercial é a Kick (inferência).
- No Brasil, o art. 29 da Lei 9.610/98 exige autorização prévia e expressa do autor para qualquer reprodução, mesmo parcial. A exceção para pequenos trechos (art. 46, VIII) é estreita [51].

**4. Música e DMCA.**
- Em 2020, mais de 99% das notificações de direitos autorais recebidas pela Twitch foram por música tocando ao fundo das lives [50].
- A Kick bane a conta no terceiro strike [49].
- Clipes feitos com a ferramenta podem render strikes para o streamer (inferência).

**5. Regras do evento.** O participante não pode assistir às lives de outros times durante o jogo [3]. Se um jogador usar a ferramenta para ver POVs rivais ao vivo, ela vira ferramenta de trapaça (inferência).

**6. Os VODs somem.**
- Streamer verificado mantém o VOD por 30 dias, e o não verificado por 7. O limite é de 30 e 16 replays guardados. O streamer pode apagar o VOD ou deixá-lo privado [42].
- O CDN mostra uma regra chamada "delete-vods-after-30-days" [40].

**7. Dependência técnica.**
- A Kick diz que, na fase atual da API, o objetivo é "get feedback and iterate quickly" [32]. Os endpoints não oficiais podem mudar sem aviso (inferência).
- Não existe limite numérico de requisições publicado [47].

**8. Dados pessoais.**
- A LGPD vale para quem oferece serviço a pessoas no Brasil, não importa em que país esteja [52]. Dados públicos devem ser tratados considerando "a finalidade, a boa-fé e o interesse público que justificaram sua disponibilização" [52].
- O GDPR vale para quem oferece serviço, pago ou grátis, a pessoas na União Europeia [53].
- Sem servidor, quase não tratamos dados pessoais. Se criarmos contas ou analytics, vamos precisar de política de privacidade (inferência).

**9. Quem é dono da Kick.** A Kick é operada pela Kick Streaming Pty Ltd. A única acionista é a Easygo, que também é dona da Stake. As duas empresas dividem a sede e executivos [29]. Posicionar o produto em eventos e patrocínio, e não em campanhas de apostas, mantém a venda aberta a patrocinadores de outros setores (inferência).

**O que reduz esses riscos (inferência):**
- Pedir permissão escrita à Kick antes de cobrar ou abrir a ferramenta ao público.
- No evento, operar com acordo do organizador.
- Não guardar vídeo em servidor nosso. Cada navegador busca o vídeo direto da Kick.
- Pôr crédito e link do canal em todo clipe, remover quando o streamer pedir e ter uma lista de quem não quer participar em cada evento.
- Ter um botão para tirar ou trocar o áudio na exportação.
- Durante o jogo ao vivo, liberar a ferramenta só para o staff ou com atraso.

---

## 6. Web ou programa no computador

**Recomendação: continuar na web e oferecer instalação como app pelo navegador (PWA). Um programa instalado (Electron) fica para depois, e só se um teste mostrar que a web não dá conta.**

**Por quê:**

1. **O número de vídeos abertos não é o limite do navegador.**
   - O Chromium permite até 1.000 players de mídia por página [98].
   - O limite real é memória e decodificação. Cada player pode guardar até 150 MB de vídeo e 12 MB de áudio, ou 30 MB e 2 MB em máquinas fracas [99].

2. **Um programa instalado não economiza desempenho.**
   - O Electron roda o mesmo Chromium e só permite ligar opções extras do Chromium [106].
   - O custo de decodificar vídeo continua igual (inferência).
   - A sua preocupação com o desempenho do PC se resolve com qualidade baixa nos quadros pequenos, não com programa instalado (inferência).

3. **Um instalador tem custos.**
   - Desde junho de 2023, o Windows trata como não assinado o app que não tem certificado EV e mostra alertas ao usuário [107].
   - A assinatura na nuvem da Microsoft, que tira esses alertas, só está disponível em alguns países [107].
   - Um app Electron vazio ocupa cerca de 385 MB no Windows. Um app Tauri ocupa cerca de 3 MB, mas usa memória parecida no Windows, porque roda sobre o WebView2 [108].

4. **A PWA dá o "dois cliques" sem instalador.**
   - Chrome e Edge instalam PWA no Windows, macOS, Linux e ChromeOS, com janela própria e ícone no menu [109]. A mesma página dizia que o Safari no macOS não instalava PWA [109].
   - Chrome e Edge somam 79,7% dos navegadores de computador em setembro de 2026 [112].
   - Dá para publicar a PWA na Microsoft Store sem mudar código. A revisão leva de 24 a 48 horas, e mudanças de código não exigem novo envio [110].

5. **O desenho atual já funciona no navegador.**
   - O CDN da Kick libera a leitura por qualquer site ("access-control-allow-origin: *") [40].
   - Cada trecho de vídeo de 10 segundos traz o horário absoluto em que foi gravado (a marca EXT-X-PROGRAM-DATE-TIME) [40].
   - Por isso, o relógio comum funciona sem servidor (inferência).

6. **Vantagem sobre visualizadores que usam o player embutido.** A Twitch exige que o player embutido tenha no mínimo 400x300 pixels [111]. Numa tela 1080p, isso dá cerca de 12 quadros (aritmética). Tocando o vídeo diretamente em qualidade baixa, cabem mais quadros pequenos (inferência).

**Riscos da web que precisam de tratamento:**
- Quando a aba fica escondida por mais de 5 minutos e em silêncio por 30 segundos, os timers rodam só uma vez por minuto. Páginas que tocaram áudio nos últimos 30 segundos escapam disso [103]. Ressincronizar quando o usuário volta para a aba e manter o som do POV em foco ajuda (inferência).
- Por padrão, o hls.js carrega até 60 MB à frente do ponto atual e não descarta o que já tocou (backBufferLength = Infinity). Ele também tem uma opção, desligada por padrão, que limita a qualidade ao tamanho do player [100].
- Se usarmos WebCodecs para gerar os cortes, o navegador pode fechar decodificadores parados ou em segundo plano com o erro QuotaExceededError [104]. O código precisa tentar de novo (inferência).
- Para gerar MP4 no navegador sem servidor, a biblioteca Mediabunny lê e grava MP4, WebM e HLS [105].
- O Chrome permite até 6 conexões por servidor [101]. Com HTTP/2, várias requisições dividem uma só conexão, com limite inicial de 100 [102].

**Quando reavaliar o programa instalado (inferência):** se os testes mostrarem que a aba escondida quebra a sincronia no uso real, ou se for preciso usar o ffmpeg nativo para exportar.

---

## 7. O que construir primeiro para o evento

Lista em ordem de força da evidência.

| # | Recurso | Por que (evidência) |
|---|---|---|
| 1 | **Importar a lista de times e canais, abrir por time e buscar por nome.** Carregar só os 4 a 12 POVs do momento, nunca 500 quadros | 500 streamers é mais que o dobro do Kick Off 2 [9]. O Multi-View nativo vai até 4 [45] e o ViewGrid até 20 [79]. Cada player pode guardar até 150 MB de vídeo e 12 MB de áudio [99] |
| 2 | **"Quem estava aqui neste instante"**: escolher um horário, abrir os POVs daquele momento e trocar de POV sem perder o tempo | Cada trecho de vídeo tem horário absoluto [40]. A Kick vende "150 perspectives" [1]. Comunidades de GTA RP já montam revisão de VOD por POV [81] |
| 3 | **Aviso de "VOD expira em N dias"** e registro dos IDs e horários de cada VOD no dia do evento | O VOD some em 7 dias para não verificados e em 30 para verificados, e pode ser apagado [40, 42] |
| 4 | **Usar a API oficial onde ela existe**: saber quem está ao vivo (até 100 usuários por consulta) e quando cada live começou e terminou | Endpoint oficial de lives [34]. Aviso automático (webhook) livestream.status.updated com started_at e ended_at [35]. Reduz a dependência de endpoints não oficiais (inferência). Usar o token de app exige um servidor que guarde a chave secreta (inferência a partir de [34]) |
| 5 | **Modo staff com pacote de prova**: horário UTC, POVs lado a lado e links dos canais | Os admins cortam momentos e as disputas exigem vídeo, inclusive de stream-sniping [3] |
| 6 | **Exportar clipes 16:9 e 9:16 com vários ângulos** (atacante, defensor e terceiro em sequência, ou tela dividida), com crédito e link de cada canal | Regra do YouTube contra reenvio sem edição [71]. A Kick paga clippers para levar público aos seus streamers [64]. O clipe nativo é de um canal só [44] |
| 7 | **Marcadores na linha do tempo**: agenda do evento (abertura de raid, cofres), detecção de luta por áudio e vídeo e, se o organizador fornecer, o log do servidor | Agenda pública com horários [4]. Dados de abates e raids já existem [5, 6] |
| 8 | **Lista de momentos para compartilhar e planilha CSV/JSON** (evento, canais, horários, arquivos) | Os clippers trabalham em grande número: 1.820 contas para 6 streamers em 30 dias [69]. Patrocinadores medem clipes [73, 74] |
| 9 | **Tirar ou trocar o áudio na exportação, com aviso sobre música** | Música de fundo causou mais de 99% das notificações na Twitch em 2020 [50]. Na Kick, 3 strikes banem a conta [49] |
| 10 | **Replay em primeiro lugar. Durante o jogo, só staff ou com atraso** | Regra anti-ghosting [3] |
| 11 | **Interface em português, espanhol e inglês** | O espanhol dominou a consulta da categoria Rust na Kick [13]. ElSpreen (Argentina) foi o maior canal do Kick Off [7]. A Kick investe no Brasil [25] |
| 12 | **Limite de desempenho**: qualidade baixa fora do foco, backBufferLength definido e players fechados quando saem da tela | Padrões do hls.js [100]. Limite de buffer por player [99] |
| 13 | **Medir tudo no evento**: tempo até o primeiro clipe sincronizado, clipes exportados, visualizações e cliques para a Kick | Não há dado público sobre o efeito dos clipes. O custo de um editor serve de base para calcular o retorno [75] |
| 14 | **Mostrar uma mensagem clara quando um endpoint mudar** | Os endpoints usados não são documentados [39, 41]. A API oficial ainda está em fase de mudanças [32] |

**O que NÃO fazer agora (inferência):**
- Suporte a Twitch e YouTube. No formato da Kick, todos transmitem só na Kick [3].
- Uma grade de lives para o público geral. O Squad Stream da Twitch ficou abaixo de 1% [54].
- Programa instalado. Ver seção 6.

---

## 8. Como abordar a Kick para vender ou licenciar

**Quem decide:**
- A Kick é operada pela Kick Streaming Pty Ltd, que tem a Easygo como única acionista [29].
- A Wikipedia lista Ashwood Holdings (Ed Craven) e Bijan Tehrani com 50% cada [29].
- A decisão deve ficar com os fundadores, não com um departamento de aquisições (inferência).
- Segundo Adin Ross, o CEO se envolveu pessoalmente em atrair clippers [66].

**Canais oficiais [30, 36]:**
- kickpartners@kick.com: parcerias.
- business@kick.com: negócios e venda.
- press@kick.com: imprensa, depois do evento.
- developers@kick.com: verificação de app.

**Como as plataformas compram ferramentas:**
- Pela base de usuários: a Logitech pagou cerca de US$ 89 milhões pela Streamlabs [94].
- Pela tecnologia: a Twitch comprou a ClipMine por preço não divulgado [96].
- O que é simples elas constroem sozinhas: o Crossclip [97] e o Multi-View da Kick [45].
- No esporte, o que vende é escala e engajamento medido. Num depoimento publicado no site da WSC, a LaLiga relata mais de 70% de aumento nas sessões por usuário [91].

**Caminho sugerido (inferência, com base nas fontes citadas):**
1. **Fazer um piloto no evento com acordo do organizador.** Medir POVs sincronizados, erro de sincronia, clipes feitos, visualizações e minutos economizados.
2. **Registrar um app no KICK Dev e pedir verificação.** O pedido exige Client ID, caso de uso e provas como site público e métricas de uso. A verificação dá um selo e aumenta o limite de inscrições de chat de 1.000 para 10.000 [36]. Ela não é uma parceria.
3. **Participar dos desafios com prêmio (bounties) do KICK Dev.** A Kick diz que "Successful bounties will be promoted by KICK" [37]. A página do KICK Dev lista ferramentas de terceiros que já trabalham com a Kick, como Streams Charts e Streamlabs [37]. A Wikipedia cita um fundo de US$ 100.000 para desenvolvedores [29], mas é fonte fraca e não achamos confirmação da Kick.
4. **Mandar e-mail para kickpartners@ e business@** com vídeo de demonstração, números do piloto e um pedido claro.
5. **Procurar a imprensa depois do evento**, com os números.

**O que pedir à Kick (inferência):**
- Permissão escrita para usar um player próprio e ler as playlists de VOD.
- Um endpoint oficial de VOD com o horário absoluto de cada trecho (PROGRAM-DATE-TIME).
- VOD por mais tempo para participantes de eventos parceiros.
- Contato com os organizadores para obter os dados do servidor com horário.

**Referências de preço (verificadas):**
- Ferramentas de corte para criadores: US$ 15 e US$ 29 por mês (OpusClip) [85].
- Agência de clipes: segundo o CEO da Clipping, alguns clientes pagam assinaturas de US$ 2.500 a US$ 10.000 por mês [67].
- Pagamento a clippers: de US$ 0,50 a US$ 25 por mil visualizações [70].
- Editor de vídeo nos EUA: cerca de US$ 36 por hora (aritmética sobre a mediana anual de US$ 75.420) [75].

**Modelo de cobrança sugerido (inferência):**
- Uso grátis ou barato para streamers, para gerar métricas de uso.
- Licença por evento para organizadores.
- Licença com a marca da Kick (white-label) para a própria Kick.

**Mensagem central (inferência):** "o replay multi-POV dos eventos que a Kick já faz". Não prometer uma avaliação alta. Os valores grandes do setor vêm do número de usuários e dos dados [87, 88].

---

## 9. Perguntas em aberto

**Sobre o evento**
1. Qual é o evento? Precisamos de nome, datas, organizador, lista de canais, regras para as lives e se haverá Drops. Não achamos nenhuma fonte pública [10].
2. O organizador pode fornecer o log do servidor com o horário UTC dos abates e das explosões?
3. Os participantes são verificados na Kick? Dá para manter os VODs por mais de 7 dias?
4. O contrato do evento com a Kick dá ao organizador direitos sobre VODs e clipes?

**Sobre a Kick**
5. A Kick dá permissão escrita para usar um player próprio e ler as playlists?
6. O Multi-View vai ganhar VOD, mais de 4 POVs ou corte? Não existe planejamento público.
7. A Kick vai lançar endpoints oficiais de VOD e de clipes?
8. Quantas requisições os endpoints não oficiais e o CDN aguentam com centenas de POVs? Não há nada publicado [47].
9. O "Kick Clipping Program" tem página oficial? Só achamos cobertura de terceiros [65].
10. Um botão nativo de download de VOD, que teria sido lançado em 25/set/2026 segundo um site, não foi verificado.
11. A divisão de propriedade da Kick (50% e 50% na Wikipedia [29]) é diferente da que aparece em outras fontes, que não verificamos.
12. O acordo de desenvolvedor não mostra a data da última atualização [47].

**Sobre o valor do produto**
13. Quantos seguidores ou espectadores um clipe traz? Não há dado público. Precisamos medir no evento.
14. Algum organizador já usou ferramenta de VOD sincronizado? Não achamos casos.
15. Os sinais de demanda no Reddit e em fóruns não foram coletados, porque esses sites bloquearam o acesso.
16. Os números do Similarweb para o MultiKick somam 3 meses, não um mês [78].

**Sobre a parte técnica**
17. Quanta RAM, CPU e GPU cada quadro a 160p usa num PC comum? Precisamos testar com 10, 30 e 50 quadros.
18. Vídeo sem som em aba escondida pausa no Chrome atual? Precisamos testar.

**Sobre a parte jurídica**
19. Um streamer Partner, que deu licença exclusiva à Kick [48], pode autorizar terceiros a cortar e publicar o conteúdo dele? Isso precisa de um advogado ou de resposta da Kick.
20. O uso justo (fair use) nos EUA para clipes curtos não foi analisado.

### O que só você pode trazer

- O link ou o nome do evento, as datas e a lista de canais e times.
- O contato do organizador e o da pessoa da Kick responsável pela parceria.
- Se você pode pedir ao organizador: (a) permissão para usar a ferramenta no evento, (b) o log do servidor com horário e (c) uma regra de "sem música protegida" nas lives.
- Se o seu canal é verificado ou Partner na Kick.
- Sua escolha de nome comercial e domínio, depois que propusermos opções. Recomendamos não usar a palavra "Kick" no nome, para não sugerir que a Kick endossa o produto (recomendação nossa).

---

## Fontes

**Eventos e audiência**
- [1] https://rustkickoff.com/
- [2] https://rustkickoff.com/teams
- [3] https://rustkickoff.com/about
- [4] https://rustkickoff.com/schedule
- [5] https://rustkickoff.com/leaderboards
- [6] https://rustkickoff.com/heatmap
- [7] https://streamscharts.com/news/rust-kick-off-2025-viewership-chat-analytics
- [8] https://streamscharts.com/news/kick-drops-rust-2025-statistics
- [9] https://streamscharts.com/news/rust-kick-off-2-recap
- [10] https://frozen-rust.com/rust-kick-drops.html
- [11] https://kick.facepunch.com/
- [12] https://kick.com/api/v1/subcategories/rust
- [13] https://kick.com/stream/livestreams/en?page=1&limit=100&subcategory=rust&sort=desc
- [14] https://www.twitchmetrics.net/g/263490-rust
- [15] https://steamcharts.com/app/252490
- [16] https://en.wikipedia.org/wiki/Rust_(video_game)
- [17] https://rust.facepunch.com/news/community-update-267
- [18] https://rust.facepunch.com/news/community-update-265
- [19] https://rust.facepunch.com/news/community-update-264
- [20] https://kick.com/api/v2/channels/danikongi/videos
- [21] lista de VODs de um segundo canal de Rust na Kick (endereço omitido)

**Kick: estratégia e empresa**
- [22] https://about.kick.com/news-and-press/4-kick-launches-kick-studios-and-strikes-content-partnership-with-one-true-king-otk
- [23] https://www.riotgames.com/en/news/riot-kick-watch-costreaming
- [24] https://about.kick.com/news-and-press/8-esl-faceit-group-and-kick-announce-strategic-global-partnership
- [25] https://poltronanerd.com.br/site/kick-reune-os-maiores-nomes-do-streaming-brasileiro-ao-redor-da-copa-de-2026-210580/
- [26] https://win.gg/gta-rp-streamers-kick-verification/
- [27] https://ourempirex.com/
- [28] https://streamer.kick.com/partner
- [29] https://en.wikipedia.org/wiki/Kick_(service)
- [30] https://help.kick.com/en/articles/7229237-contact-our-support-team

**Kick: plataforma técnica**
- [31] https://docs.kick.com/llms.txt
- [32] https://docs.kick.com/
- [33] https://api.kick.com/swagger/doc.yaml
- [34] https://docs.kick.com/apis/livestreams.md
- [35] https://docs.kick.com/events/event-types.md
- [36] https://docs.kick.com/apis/faqs.md
- [37] https://dev.kick.com/
- [38] https://help.kick.com/en/articles/8010826-how-to-embed-your-kick-livestream
- [39] https://kick.com/api/v2/channels/xqc/videos
- [40] https://stream.kick.com/3c81249a5ce0/ivs/v1/196233775518/DsuAwCgUc9Bh/2026/10/3/20/36/bhidczmA3pLT/media/hls/720p60/playlist.m3u8
- [41] https://kick.com/api/v2/channels/xqc/clips?sort=date&time=all
- [42] https://help.kick.com/en/articles/7112432-kick-vods-stream-replays
- [43] https://help.kick.com/en/articles/7832538-how-to-download-your-kick-vod
- [44] https://help.kick.com/en/articles/7120566-how-to-create-clips-on-kick
- [45] https://help.kick.com/en/articles/16798355-how-to-watch-multi-view-on-kick

**Termos e leis**
- [46] https://kick.com/terms-of-service
- [47] https://dev.kick.com/terms-of-service
- [48] https://kick.com/partner-terms-and-conditions
- [49] https://help.kick.com/en/articles/15302308-dmca-strike-system
- [50] https://blog.twitch.tv/en/2020/11/11/music-related-copyright-claims-and-twitch/
- [51] https://www.planalto.gov.br/ccivil_03/leis/l9610.htm
- [52] https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- [53] https://gdpr-info.eu/art-3-gdpr/

**Demanda por vários pontos de vista**
- [54] https://blog.twitch.tv/en/2023/12/13/retiring-squad-stream/
- [55] https://www.tubefilter.com/2024/09/20/twitch-stream-together-merged-chats/
- [56] https://blog.twitch.tv/en/2024/12/05/shared-viewership/
- [57] https://blog.youtube/news-and-events/multiview-on-youtube-tv/
- [58] https://investors.gamesquare.com/news/news-details/2026/GameSquares-Stream-Hatchet-Publishes-Esports-Live-Streaming-Trends-Report/default.aspx
- [59] https://www.noxcrew.com/
- [60] https://en.wikipedia.org/wiki/Minecraft_Championship
- [61] https://en.wikipedia.org/wiki/Z_Event
- [62] https://en.wikipedia.org/wiki/Twitch_Rivals

**Economia de clipes e patrocínio**
- [63] https://www.dexerto.com/kick/n3on-reveals-he-paid-army-of-clippers-1-4m-over-five-weeks-to-make-him-go-viral-3355473/
- [64] https://www.tubefilter.com/2026/04/29/n3on-spending-millions-stream-clippers-tiktok-kick/
- [65] https://win.gg/kick-clipping-program/
- [66] https://www.dexerto.com/twitch/kick-wants-to-steal-twitchs-best-viewers-with-big-money-offer-3186983/
- [67] https://www.thestar.com.my/tech/tech-news/2026/05/03/the-video-clipping-machine-behind-claviculars-viral-fame
- [68] https://clipping.net/
- [69] https://creatordb.app/creator-news/the-rise-of-the-clip-economy/
- [70] https://finance.yahoo.com/markets/articles/clipping-side-hustle-youve-never-110000379.html
- [71] https://www.dexerto.com/youtube/youtube-cracks-down-on-clipping-channels-in-shorts-update-prioritizing-original-content-3415700/
- [72] https://techcrunch.com/2023/08/22/twitch-disccovery-feed-test/
- [73] https://blog.relometrics.com/tiktok-valuation-in-sports-sponsorships
- [74] https://shikenso.com/blog/10-sponsorship-trends-shaping-esports-in-2025
- [75] https://www.bls.gov/ooh/media-and-communication/film-and-video-editors-and-camera-operators.htm

**Concorrentes e aquisições**
- [76] https://watchmultipov.app/
- [77] https://multikick.com/
- [78] https://www.similarweb.com/website/multikick.com/
- [79] https://viewgrid.tv/blog/kick-multi-stream
- [80] https://www.multitwitch.tv/
- [81] https://gtaservers.org/nopixel
- [82] https://eklipse.gg/about-us/
- [83] https://streamladder.com/
- [84] https://www.opus.pro/about
- [85] https://www.opus.pro/pricing
- [86] https://outplayed.tv/
- [87] https://techcrunch.com/2024/07/11/medal-raises-13m-as-it-builds-out-a-new-ai-platform-for-desktop/
- [88] https://techcrunch.com/2026/08/24/valor-point72-back-general-intuition-at-6b-valuation-as-ai-startup-pushes-into-robotics/
- [89] https://techcrunch.com/2023/11/20/powder-an-ai-clipping-tool-for-gaming-can-detect-when-a-creator-yells-during-a-stream/
- [90] https://techcrunch.com/2021/02/10/powder-raises-14-million-for-its-social-app-for-game-clips/
- [91] https://wsc-sports.com/
- [92] https://www.blackbird.video/
- [93] https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
- [94] https://techcrunch.com/2019/09/27/logitech-acquires-popular-game-streaming-tool-streamlabs-for-around-89m/
- [95] https://en.wikipedia.org/wiki/Logitech
- [96] https://techcrunch.com/2017/08/18/twitch-acquired-video-indexing-platform-clipmine-to-power-new-discovery-features/
- [97] https://techcrunch.com/2021/07/15/streamlabs-convert-twitch-clips-crossclip/

**Web ou programa no computador**
- [98] https://raw.githubusercontent.com/chromium/chromium/main/content/renderer/media/media_factory.cc
- [99] https://raw.githubusercontent.com/chromium/chromium/main/media/base/demuxer_memory_limit.h
- [100] https://raw.githubusercontent.com/video-dev/hls.js/master/docs/API.md
- [101] https://raw.githubusercontent.com/chromium/chromium/main/net/socket/client_socket_pool_manager.cc
- [102] https://raw.githubusercontent.com/chromium/chromium/main/net/spdy/spdy_session.h
- [103] https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- [104] https://www.w3.org/TR/webcodecs/
- [105] https://raw.githubusercontent.com/Vanilagy/mediabunny/main/README.md
- [106] https://raw.githubusercontent.com/electron/electron/main/docs/api/command-line-switches.md
- [107] https://raw.githubusercontent.com/electron/electron/main/docs/tutorial/code-signing.md
- [108] https://raw.githubusercontent.com/Elanis/web-to-desktop-framework-comparison/main/README.md
- [109] https://web.dev/learn/pwa/installation
- [110] https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store
- [111] https://dev.twitch.tv/docs/embed/video-and-clips/
- [112] https://gs.statcounter.com/browser-market-share/desktop/worldwide
