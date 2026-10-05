# O que só você pode fazer (em ordem de valor)

Faça quando puder, de uma vez. Cada item diz quanto tempo leva e o que ele
destrava.

| # | O quê | Tempo | Destrava | Como |
|---|---|---|---|---|
| 1 | Fiverr: o perfil e os 5 anúncios ficaram prontos como rascunho em 02/10, pelo Claude no Chrome. Para publicar falta você: a verificação de identidade (documento e selfie) e o formulário de impostos. Você não é americano, então o formulário é o W-8BEN, não o W-9; ele pede o seu número fiscal. Depois, peça ao Claude no Chrome: "publique os 5 gigs" | 10 min | Venda de serviços: eu faço o trabalho, você cola as mensagens | https://www.fiverr.com (se faltar algo: https://claude.com/claude-in-chrome e a tarefa em https://raw.githubusercontent.com/tchubirs/tchubirs.github.io/refs/heads/claude/ai-revenue-automation-map-g00jks/fiverr/DISPATCH.md) |
| 2 | App do Fiverr no celular, com as notificações ligadas. Quando um cliente escrever, cole a mensagem aqui ou mande um print; eu respondo e faço o trabalho. Se chegar um "Brief" (pedido que o Fiverr manda direto para alguns vendedores, na caixa de mensagens), cole na hora: só dá para responder em 72 horas | 2 min | Responder em até 24 horas, que o Fiverr mede e mostra no perfil | Android: https://play.google.com/store/apps/details?id=com.fiverr.fiverr , iPhone: https://apps.apple.com/app/id346080608 |
| 3 | Abrir a loja da Etsy: pagar a taxa única de abertura (€ 16). Não recomendo agora (nota de 30/09 abaixo) | 3 min | Os 44 anúncios aparecem e vendem sozinhos: o cliente paga e baixa, sem conversa | https://www.etsy.com/your/shops/me/onboarding |

**29/09, 21:40: achei o motivo, a loja nunca foi aberta.** A abertura parou no passo da cobrança: a Etsy pede uma taxa única de abertura de € 16 (US$ 19) e só depois abre a loja. Até lá ninguém vê os 44 anúncios. Se um dia decidir abrir (3 min): em https://www.etsy.com/your/shops/me/onboarding confira o cartão, toque em "Rever comissão de configuração e continuar", siga os passos até "Abrir loja" e me avise. Custos: € 16 agora, uma vez, e € 0,18 por anúncio (os 44 dão cerca de € 8 na fatura do mês). A "oferta especial" para recuperar a taxa pede o Etsy Plus pago por 6 meses, então não compensa. Depois disso, ligue o inglês como idioma da loja (Definições > Idiomas e traduções) para eu pôr a versão em inglês dos 44 com `python3 etsy/publish.py english`.

**30/09: o risco dos € 16 em números.** Olhei 640 lojas que vendem planilhas parecidas (`python3 etsy/market.py`). Nas lojas novas com 30 anúncios ou mais, como a sua: no primeiro mês, 1 em cada 3 vendeu. Com 2 a 4 meses, 4 em cada 5 já tinham vendido, e 4 em cada 10 passaram de 6 vendas, o que paga a abertura. Não é garantia, porque lojas que desistiram somem da conta. Os € 16 se pagam uma vez e cada anúncio dura 4 meses sem custo novo, então testar 4 meses custa o mesmo que testar 1. Minha confiança de recuperar os € 24 (abertura mais anúncios) em 4 meses é de uns 30%: as lojas da conta são as que aparecem na busca, a sua começa com 0 avaliações e a loja está em português com anúncios em inglês. Precisa de umas 5 vendas. Pela sua regra de só gastar com confiança alta, não recomendo pagar agora: primeiro o Fiverr (item 1), que é de graça.

**29/09: os 44 anúncios estão prontos na Etsy.** Conferi cada um pela API da Etsy: preço, categoria, fotos, vídeo e arquivos. Eles só aparecem para o público depois que a loja abrir (item 2). A Etsy entrega o arquivo ao cliente sozinha. Eu olho as vendas a cada hora e te aviso quando entrar um pedido. Conferido de novo em 02/10, ao vivo: os 44 sem nenhum problema, uma edição de teste deu certo e os pedidos aparecem para mim. Em 05/10, de novo: os 44 continuam certos. O que só você faz: pagar e abrir a loja, ligar o inglês e responder mensagens de clientes (a API da Etsy não dá acesso a elas; você me passa e eu escrevo a resposta). 03/10: os 44 renovam sozinhos no fim de janeiro, a uns € 0,18 cada; ofereci desligar a renovação e espero a resposta dele ("desliga").

Se esta sessão acabar e a autorização se perder, eu te mando um link novo (1 min: abrir, Allow access, me mandar o endereço). Para a chave do app não se perder junto, você pode pôr ETSY_KEYSTRING e ETSY_SHARED_SECRET nas variáveis do ambiente (menu do ambiente na barra de título da sessão, Editar).

**02/10, conferido na sua conta depois que você conectou:** Vercel, Linear, Canva, Netlify, Stripe e Google Drive conectados; testei o Vercel e o Linear daqui e respondem. Os novos entram em cada conversa nova. O Etsy API ainda aparece pela metade para mim, mas não faz falta: eu já uso a API da Etsy direto. O que você instalar pelo terminal com `claude mcp add` só vale no Claude Code daquele computador.

**29/09: conectores (MCP) que você pediu, só os oficiais (8 min).** Cada um vale para todas as sessões:
1. Vercel: https://claude.com/connectors/vercel , toque em conectar e faça login na Vercel.
2. Netlify: https://claude.com/connectors/netlify , mesmo jeito.
3. Stripe: https://claude.com/connectors/stripe , faça login e escolha a conta. Antes de mexer em dinheiro eu sempre te pergunto.
4. Etsy (só a documentação da API, não mexe na loja): em https://claude.ai/customize/connectors toque em adicionar conector personalizado, nome `Etsy API`, endereço `https://mcp.api.etsycloud.com/mcp`. Sem login.
5. Depois abra uma sessão nova (os conectores só entram quando a sessão começa) e escreva "testa os MCPs".

No terminal do seu computador (Claude Code), cole um comando por vez. O `--scope user` faz valer em todas as conversas daquele computador:

```
claude mcp add --scope user --transport http vercel https://mcp.vercel.com
claude mcp add --scope user --transport http netlify https://netlify-mcp.netlify.app/mcp
claude mcp add --scope user --transport http stripe https://mcp.stripe.com/
claude mcp add --scope user --transport http etsy https://mcp.api.etsycloud.com/mcp
```

Depois abra o Claude Code, escreva `/mcp`, escolha Vercel, Netlify e Stripe, um por vez, e faça o login no navegador. A Etsy não pede login. Para conferir: `claude mcp list`. Canva, Google Drive e Gmail não precisam de comando: entram sozinhos no Claude Code se ele estiver logado na mesma conta do claude.ai.

Pulados: Cloudflare, Figma, Linear, Firecrawl e Browserbase (sem conta), banco de dados (nenhum), Discord (sem servidor oficial).

Quando terminar um item, me mande "feito #N".
