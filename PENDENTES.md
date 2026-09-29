# O que só você pode fazer (em ordem de valor)

Faça quando puder, de uma vez. Cada item diz quanto tempo leva e o que ele
destrava.

| # | O quê | Tempo | Destrava | Como |
|---|---|---|---|---|
| 1 | Criar a conta de vendedor no Fiverr, com o perfil e 1 anúncio | 15 a 30 min | Venda de serviços: eu faço o trabalho, você cola as mensagens | [fiverr/KIT.md](fiverr/KIT.md), https://www.fiverr.com/start_selling |
| 2 | Feito em 29/09: a loja está aberta com os 44 anúncios | 0 | Venda automática: o cliente paga e baixa sozinho, sem conversa | https://www.etsy.com/shop/FocusBudgetSheets |

**29/09: falta você no Gestor da loja (3 min).** Para a Etsy os 44 anúncios estão ativos, mas desde 04:30 (UTC) nenhum aparece na busca pública e a página diz "este artigo não está disponível". 1) No site da Etsy, toque no ícone da lojinha lá em cima (entre o sino e a sua foto) e mande um print da tela que abrir; se não abrir, https://www.etsy.com/your/shops/me . 2) Veja se chegou email da Etsy (verificação de identidade, loja em análise). 3) Depois disso, ligue o inglês como idioma da loja (Definições > Idiomas e traduções) para eu pôr a versão em inglês dos 44 com `python3 etsy/publish.py english`.

**29/09: os 44 anúncios estão no ar** (https://www.etsy.com/shop/FocusBudgetSheets). Conferi cada um pela API da Etsy: preço, categoria, fotos e arquivos. A Etsy entrega o arquivo ao cliente sozinha. Eu olho as vendas a cada hora e te aviso quando entrar um pedido. Na Etsy não falta nada seu.

Se esta sessão acabar e a autorização se perder, eu te mando um link novo (1 min: abrir, Allow access, me mandar o endereço). Para a chave do app não se perder junto, você pode pôr ETSY_KEYSTRING e ETSY_SHARED_SECRET nas variáveis do ambiente (menu do ambiente na barra de título da sessão, Editar).

Quando terminar um item, me mande "feito #N".
