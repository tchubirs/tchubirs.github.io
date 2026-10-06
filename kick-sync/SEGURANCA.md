# Segurança (revisão de 06/10/2026)

O que foi conferido, o que está bem, e o que falta fazer. Nenhum segredo aparece neste ficheiro.

## O repositório é público

O site é publicado pelo GitHub Pages a partir deste repositório, e o repositório é público. Isso tem duas
consequências:

1. **Qualquer segredo que já passou por um commit está à vista para sempre**, mesmo apagado depois. Foi
   feita uma busca em todo o histórico (615 commits) por chaves de AWS, GitHub, Slack, Stripe, Google,
   Anthropic, OpenAI, chaves privadas, JWT, IBAN e atribuições de senha. Achado: **uma chave da API do
   YouTube (Google) em dois commits de julho de 2025** (`9da7e8d` e `c308bb1`, em `App.jsx` e
   `index.html`), apagada mais tarde do código mas ainda no histórico. **Tem de ser apagada no Google Cloud
   Console** (APIs e serviços, Credenciais). Reescrever o histórico não resolve: cópias já podem existir.
2. **O código do produto fica visível.** Num site sem servidor isso é inevitável (o browser recebe o
   JavaScript), e não é aí que mora o valor de uma venda: o valor está na marca, no que foi medido, na
   operação com os eventos e, mais tarde, no índice do evento feito num servidor. Antes de negociar,
   vale passar o produto para um repositório privado só dele e deixar público apenas o site publicado.

## O que está bem

- **Nenhum segredo no produto.** O Povix não usa chave nenhuma: fala com a Kick a partir do browser de
  quem usa, sem conta e sem servidor. Não há nada para roubar do lado do site.
- **Nada é guardado fora do aparelho.** A sessão fica no `localStorage` do browser; nenhum dado de quem usa
  sai para um servidor nosso, porque não existe servidor nosso.
- **Os clipes não passam por nós.** Os segmentos vêm do CDN da Kick direto para o browser e o ficheiro é
  montado ali. Isto também cumpre a regra da Kick de não guardar conteúdo dela além de 24 h.
- **Bibliotecas de fora:** só o `hls.js`, copiado para dentro do projeto com a versão no nome (sem CDN de
  terceiros que possa ser trocado por baixo).
- **Automações do GitHub:** os workflows usam segredos só por variáveis de ambiente, nenhum corre em
  `pull_request_target`, e o do Replay não tem segredo nenhum.

## O que falta (por ordem)

1. Apagar a chave do YouTube no Google Cloud Console (coisa do dono, 2 min).
2. ~~Injeção de HTML por link partilhado.~~ Corrigido em 06/10: um link `?s=` com
   `<img onerror=…>` no lugar de um nome de canal corria código na página de quem o abrisse (o nome
   recusado pela Kick voltava para a lista tal como veio). Agora todo o texto de fora (nomes de canal,
   nomes de quem morreu, mensagens de erro, títulos e imagens da pesquisa da Twitch) passa por
   `site/escapar.js`. `test/seguranca.test.mjs` abre a página com o link armadilhado e falha no código
   antigo.
3. Uma política de segurança de conteúdo (`Content-Security-Policy`) quando o site tiver domínio próprio:
   só scripts do próprio site, ligações só para `kick.com` e o CDN da Kick.
4. Repositório privado para o produto antes de mostrar o código a um comprador.
