# O que só você pode fazer (em ordem de valor)

Faça quando puder, de uma vez. Cada item diz quanto tempo leva e o que ele
destrava.

| # | O quê | Tempo | Destrava | Como |
|---|---|---|---|---|
| 1 | Criar a conta de vendedor no Fiverr, com o perfil e 1 anúncio | 15 a 30 min | Venda de serviços: eu faço o trabalho, você cola as mensagens | [fiverr/KIT.md](fiverr/KIT.md), https://www.fiverr.com/start_selling |
| 2 | Feito em 29/09: a loja está aberta com os 44 anúncios | 0 | Venda automática: o cliente paga e baixa sozinho, sem conversa | https://www.etsy.com/shop/FocusBudgetSheets |

**29/09, 07:30: falta você no Gestor da loja (3 min).** 1) A página do anúncio diz "este artigo não está disponível", mas para a Etsy os 44 estão ativos: mande um print do topo de https://www.etsy.com/your/shops/me/dashboard para ver o aviso que está segurando a loja. 2) Ponha o inglês como idioma da loja: Definições > Idiomas e traduções > Gerir idiomas > ligar Inglês > Guardar (https://www.etsy.com/your/shops/me/languages). A loja nasceu em português e os textos são em inglês; com o inglês ligado, eu ponho a versão em inglês dos 44 pela API (`python3 etsy/publish.py english`).

**29/09: os 44 anúncios estão no ar** (https://www.etsy.com/shop/FocusBudgetSheets). Conferi cada um pela API da Etsy: preço, categoria, fotos e arquivos. A Etsy entrega o arquivo ao cliente sozinha. Eu olho as vendas a cada hora e te aviso quando entrar um pedido. Na Etsy não falta nada seu.

Se esta sessão acabar e a autorização se perder, eu te mando um link novo (1 min: abrir, Allow access, me mandar o endereço). Para a chave do app não se perder junto, você pode pôr ETSY_KEYSTRING e ETSY_SHARED_SECRET nas variáveis do ambiente (menu do ambiente na barra de título da sessão, Editar).

Quando terminar um item, me mande "feito #N".
