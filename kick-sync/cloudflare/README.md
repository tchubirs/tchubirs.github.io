# Análise Rust/Kick na Cloudflare

Worker público dos clipes. O assistente para controlar o PC não faz parte dele.

## Preparar

Na raiz do repositório, gere os arquivos estáticos com `bash kick-sync/publicar.sh kick-sync/cloudflare/public`. Depois, nesta pasta, rode `npm ci`, `node --test test/*.test.mjs`, `npm run typecheck` e `npm run build`. A pasta public é gerada e não entra no Git.

## Publicar

Use o CLI oficial cf autenticado na conta do responsável. A migração 0000 cria apenas tabelas contexto_*. A configuração aponta para o D1 criado para este projeto; não altere o banco de outros aplicativos. Cadastre ANTHROPIC_API_KEY como segredo do Worker, nunca no frontend ou em arquivo rastreado. Confira `cf deploy --dry-run` antes de publicar.

A API usa a mesma origem da página. Origin/Sec-Fetch-Site impedem chamadas de outras páginas em navegadores, mas não autenticam clientes externos. O limite global inicial é US$0,50/mês estimado, 40 chamadas/dia e 20 por live; cache é consultado antes da cota. Isso não comprova capacidade para 200 usuários, e estes limites não são o saldo Anthropic. CONTEXTO_ATIVO=0 desliga novas análises.

Vídeo e chat da Kick continuam sendo recursos dos clipes. chat.js e chat-clipe.js não são o assistente cancelado.

## Verificação local

44 testes do adaptador/core aprovados, sem chamadas pagas; typecheck e build aprovados. D1 remoto, fluxo no navegador e chamada real devem ser conferidos a cada primeira publicação. A apresentação da prévia ampliada e as falhas restantes da suíte principal continuam pendentes.
