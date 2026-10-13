# Operação pelo celular

Depois que estes workflows estiverem no GitHub, a operação diária é pelo app/site do GitHub:

1. Abra **Actions → clipfactory → Run workflow**.
2. Use `run` para produzir/publicar, `track` para medir, `doctor` para conferir a instalação. Se faltar requisito obrigatório, `doctor` deixa o job vermelho.
3. Use `money` quando a campanha confirmar um pagamento: informe o ID do clipe, o novo estado e, se houver, o valor em US$.
4. Leia o **Summary** do job. Se houver strike, custo alto ou falha de publicação, o job fica vermelho e não publica silenciosamente no dia seguinte.

Para revisar o código com Claude: abra **Actions → revisão do front end com Claude → Run workflow**, deixe o modelo vazio para usar o Sonnet mais barato disponível e leia o Summary. A chave fica somente no Secret `ANTHROPIC_API_KEY`.

Antes de usar uma chave nova, abra a Console da Anthropic → **Billing** e deixe **auto-reload** desligado se não quiser comprar créditos automaticamente.
